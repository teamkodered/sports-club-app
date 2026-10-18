-- Team workrate per day (average heart rate as % of each athlete's age-based max),
-- for the "you vs team" heart rate graph in Wearables (athlete app + coach view).
-- Only the team average leaves the database, never another athlete's data.
create or replace function public.team_workrate_daily(p_from date)
returns table (day date, avg_pct numeric, athletes int)
language sql stable security definer set search_path = public as $$
  with w as (
    select ww.student_id, (ww.start_time at time zone 'Europe/London')::date as day, ww.avg_heart_rate::numeric as hr
    from wearable_workouts ww where ww.start_time >= p_from and ww.avg_heart_rate is not null
    union all
    select h.student_id, h.session_date, h.avg_hr::numeric from hr_sessions h where h.session_date >= p_from and h.avg_hr is not null
  ), p as (
    select w.student_id, w.day,
           avg(w.hr * 100.0 / coalesce(greatest(150, 220 - extract(year from age(m.date_of_birth))::int), 190)) as pct
    from w join students s on s.id = w.student_id join members m on m.id = s.member_id
    where s.is_kr or s.discipline = 'KRBA'
    group by w.student_id, w.day
  )
  select day, round(avg(pct), 1), count(*)::int from p group by day order by day
$$;
grant execute on function public.team_workrate_daily(date) to authenticated;
