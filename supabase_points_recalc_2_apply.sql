-- RECALCULATE POINTS -- STEP 2: APPLY (one batch: all or nothing). Backups made first.
begin;
create table if not exists public.points_log_backup_20261031 as select * from public.points_log;
create table if not exists public.students_points_backup_20261031 as select id, house_points, individual_points from public.students;
create table if not exists public.houses_points_backup_20261031 as select name, points from public.houses;

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

-- house changes
drop table if exists kc_house_deltas;
create temp table kc_house_deltas as
select coalesce(h.name, s.house_name) as house, sum(d.delta) as delta
from kc_deltas d join students s on s.id = d.student_id join members m on m.id = s.member_id
left join houses h on h.id = m.house_id
group by 1;

-- 1) points_log: drop rows now worth 0, change the rest, add the PDP day rows
delete from points_log where id in (select id from kc_rc where new_pts = 0);
update points_log p set points_awarded = kc_rc.new_pts from kc_rc where kc_rc.id = p.id and kc_rc.new_pts <> 0 and kc_rc.new_pts <> kc_rc.old_pts;
insert into points_log (student_id, point_type, points_awarded, point_scope, awarded_at)
select student_id, 'PDP done for today (recalculated)', 10, 'both', (day + time '12:00') at time zone 'Europe/London' from kc_pdp_days;

-- 2) totals
update students s set individual_points = coalesce(individual_points, 0) + d.delta,
                      house_points      = coalesce(house_points, 0) + d.delta
from kc_deltas d where d.student_id = s.id and d.delta <> 0;
update houses h set points = coalesce(points, 0) + hd.delta from kc_house_deltas hd where hd.house = h.name and hd.delta <> 0;

select (select count(*) from kc_deltas where delta <> 0) as students_changed,
       (select sum(delta) from kc_deltas) as total_points_change,
       (select string_agg(house || ' ' || delta, ', ') from kc_house_deltas where house is not null) as houses_change;
commit;

-- UNDO (only if ever needed):
-- begin;
-- delete from points_log; insert into points_log select * from points_log_backup_20261031;
-- update students s set house_points = b.house_points, individual_points = b.individual_points from students_points_backup_20261031 b where b.id = s.id;
-- update houses h set points = b.points from houses_points_backup_20261031 b where b.name = h.name;
-- commit;
