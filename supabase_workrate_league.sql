-- Workrate leagues for the League board (Oct 2026): per athlete over a period --
--   avg_pct    : their average heart rate per session as % of their age-based max
--   above_team : how far above (or below) the club average they were on the days they trained
-- From wearable workouts + heart rate sessions recorded in the app. Name = first name + initial.
create or replace function public.public_workrate_league(p_from date, p_to date)
returns table (student_id uuid, display_name text, house_name text, sessions int, avg_pct numeric, above_team numeric)
language sql stable security definer set search_path = public as $$
  with w as (
    select ww.student_id, (ww.start_time at time zone 'Europe/London')::date as day, ww.avg_heart_rate::numeric as hr
    from wearable_workouts ww
    where ww.avg_heart_rate is not null and (ww.start_time at time zone 'Europe/London')::date between p_from and p_to
    union all
    select h.student_id, h.session_date, h.avg_hr::numeric from hr_sessions h
    where h.avg_hr is not null and h.session_date between p_from and p_to
  ), p as (
    select w.student_id, w.day,
           avg(w.hr * 100.0 / coalesce(greatest(150, 220 - extract(year from age(m.date_of_birth))::int), 190)) as pct
    from w join students s on s.id = w.student_id join members m on m.id = s.member_id
    where s.is_kr or s.discipline = 'KRBA'
    group by w.student_id, w.day
  ), team as (select day, avg(pct) as tpct from p group by day)
  select p.student_id, trim(coalesce(m.first_name,'') || ' ' || coalesce(upper(left(m.last_name,1)) || '.','')), s.house_name,
         count(*)::int, round(avg(p.pct), 1), round(avg(p.pct - t.tpct), 1)
  from p join team t on t.day = p.day join students s on s.id = p.student_id join members m on m.id = s.member_id
  group by p.student_id, m.first_name, m.last_name, s.house_name
$$;
grant execute on function public.public_workrate_league(date, date) to anon, authenticated;
