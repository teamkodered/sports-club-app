-- One-off: points for the backfilled wearable runs / other sessions (all athletes)
-- Same rule as logging in the app: one 'F2F question logged' award per athlete, per day, per item
-- (Running / Other session), at the app's question value (settings athlete_house_points.f2f_question, default 1).
-- Skips any day that already has that award, so it's safe to re-run. Adds to athlete, individual and house totals.
do $$
declare
  r record; v_amount int; v_label text; v_house text;
begin
  select coalesce(nullif(value ->> 'f2f_question', '')::int, 1) into v_amount from settings where key = 'athlete_house_points';
  v_amount := coalesce(v_amount, 1);
  if v_amount <= 0 then return; end if;
  for r in
    select distinct f.student_id, f.session_date, x.item
    from fit2fight_sessions f
    cross join lateral (
      select 'Running' as item where exists (select 1 from jsonb_array_elements(case when jsonb_typeof(f.running::jsonb) = 'array' then f.running::jsonb else '[]'::jsonb end) e where e ->> 'wearable_id' like 'workout:%')
      union all
      select 'Other session' where exists (select 1 from jsonb_array_elements(case when jsonb_typeof(f.other_session::jsonb) = 'array' then f.other_session::jsonb else '[]'::jsonb end) e where e ->> 'wearable_id' like 'workout:%')
    ) x
  loop
    v_label := 'F2F question logged: ' || r.item;
    if exists (select 1 from points_log where student_id = r.student_id and point_type = v_label
               and awarded_at >= r.session_date and awarded_at < r.session_date + 1) then continue; end if;
    insert into points_log (student_id, point_type, points_awarded, point_scope, awarded_at)
      values (r.student_id, v_label, v_amount, 'both', r.session_date + time '12:00');
    update students set house_points = coalesce(house_points, 0) + v_amount,
                        individual_points = coalesce(individual_points, 0) + v_amount where id = r.student_id;
    select coalesce(h.name, s.house_name) into v_house from students s join members m on m.id = s.member_id left join houses h on h.id = m.house_id where s.id = r.student_id;
    if v_house is not null then update houses set points = coalesce(points, 0) + v_amount where name = v_house; end if;
  end loop;
end $$;

-- check: points now awarded for wearable runs / other sessions
select count(*) as awards, sum(points_awarded) as points
from points_log where point_type in ('F2F question logged: Running', 'F2F question logged: Other session');
