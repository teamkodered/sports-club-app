-- RECALCULATE POINTS -- STEP 1: PREVIEW (read-only: only temporary tables, nothing saved)

-- every app self-award row that the new rules change
drop table if exists kc_rc;
create temp table kc_rc as
select p.id, p.student_id, p.point_type, p.points_awarded::numeric as old_pts, p.awarded_at,
       (p.awarded_at at time zone 'Europe/London')::date as day,
       case
         when p.point_type like 'Self check-in (app)%'  then 'checkin'
         when p.point_type like 'Self check-out (app)%' then 'checkout'
         when p.point_type like 'Weigh in%' or p.point_type like 'Weigh out%' then 'weigh'
         when p.point_type like 'F2F question logged: Monthly focus set%' then null
         when p.point_type like 'F2F question logged:%' or p.point_type like 'F2F question cleared:%' then 'f2f'
         when p.point_type like 'PDP action done%' or p.point_type like 'PDP action undone%' then 'pdp'
       end as kind,
       replace(p.point_type, 'F2F question cleared', 'F2F question logged') as base,
       null::numeric as new_pts
from points_log p
where p.point_scope = 'both';
delete from kc_rc where kind is null;

-- check in / out 3, weigh in / out 5: once per class per day (duplicates -> 0)
update kc_rc set new_pts = case when x.n = 1 then case kc_rc.kind when 'weigh' then 5 else 3 end else 0 end
from (select id, row_number() over (partition by student_id, point_type, day order by awarded_at, id) as n
      from kc_rc where kind in ('checkin', 'checkout', 'weigh')) x
where x.id = kc_rc.id;

-- questions: one per question per day; 3 if it was that month's 🎯 focus question, otherwise 0
update kc_rc set new_pts = 0 where kind = 'f2f';
update kc_rc set new_pts = case when g.net > 0 and exists (
         select 1 from athlete_profiles ap,
           jsonb_each(coalesce(ap.pdp_notes -> '__focus' -> to_char(kc_rc.day, 'YYYY-MM'), '{}'::jsonb)) f
         where ap.student_id = kc_rc.student_id
           and lower(trim(f.value #>> '{}')) = lower(trim(substr(kc_rc.base, length('F2F question logged: ') + 1)))
       ) then 3 else 0 end
from (select student_id, day, base,
             count(*) filter (where point_type like 'F2F question logged%') - count(*) filter (where point_type like 'F2F question cleared%') as net,
             (array_agg(id order by awarded_at, id) filter (where point_type like 'F2F question logged%'))[1] as first_id
      from kc_rc where kind = 'f2f' group by student_id, day, base) g
where kc_rc.id = g.first_id;

-- PDP: per-action points go; each day with PDP done = 10 (✓ done for today 5 + 🎯 focus 5)
update kc_rc set new_pts = 0 where kind = 'pdp';
drop table if exists kc_pdp_days;
create temp table kc_pdp_days as
select student_id, day from kc_rc where kind = 'pdp' group by student_id, day having sum(old_pts) > 0;

-- per-student change
drop table if exists kc_deltas;
create temp table kc_deltas as
select student_id, sum(chg) as delta from (
  select student_id, new_pts - old_pts as chg from kc_rc
  union all select student_id, 10 from kc_pdp_days) z
group by student_id;

select m.first_name, m.last_name, s.individual_points as now, s.individual_points + d.delta as after, d.delta as change
from kc_deltas d join students s on s.id = d.student_id join members m on m.id = s.member_id
where d.delta <> 0
order by d.delta;
