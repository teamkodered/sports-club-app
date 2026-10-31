-- JAMAAL IQBAL: points and bleep test check (read-only)
with st as (
  select s.id, s.house_points, s.individual_points, s.comp_points
  from students s join members m on m.id = s.member_id
  where m.first_name ilike 'jamaal%' and m.last_name ilike 'iqbal%'
)
-- 1) the totals on his record
select '1 totals' as section, null::date as day,
       'house ' || house_points || ' · individual ' || individual_points || ' · comp ' || coalesce(comp_points, 0) as what,
       null::numeric as points
from st
union all
-- 2) what his points were given for (all time)
select '2 points by reason', null, pl.point_type || ' (' || pl.point_scope || ') × ' || count(*), sum(pl.points_awarded)
from points_log pl join st on st.id = pl.student_id
group by pl.point_type, pl.point_scope
union all
-- 3) days with the most points
select '3 biggest days', d.day, d.reasons, d.pts from (
  select pl.awarded_at::date as day, string_agg(pl.point_type || ' ' || pl.points_awarded, ', ') as reasons, sum(pl.points_awarded) as pts
  from points_log pl join st on st.id = pl.student_id
  group by pl.awarded_at::date order by sum(pl.points_awarded) desc limit 10) d
union all
-- 4) every bleep test result saved for him (Fit 2 Fight sessions)
select '4 bleep (F2F)', f.session_date, t.key || ' = ' || t.value, null
from fit2fight_sessions f join st on st.id = f.student_id
cross join lateral jsonb_each_text(coalesce(f.test, '{}'::jsonb)) t
where t.key ilike '%bleep%'
union all
-- 5) bleep level on assessment (TPT) forms
select '5 bleep (TPT)', k.assessed_at::date, 'bleep_test_level = ' || k.bleep_test_level, null
from tpt_kickboxing k join st on st.id = k.student_id
where k.bleep_test_level is not null
order by 1, 2 desc nulls last, 4 desc nulls last;
