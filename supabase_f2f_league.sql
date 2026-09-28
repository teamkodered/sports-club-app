-- FIIF League (athlete app, KR + KRBA athletes only).
-- A fresh, read-only league for the athlete app. It does NOT change any
-- existing table, points, house scoring or the public league pages -- it
-- only reads points_log and fit2fight_sessions and returns totals.
-- Names are returned as first name + last initial only.

create or replace function public.f2f_league_jlen(j jsonb)
returns int language sql immutable as $$
  select case jsonb_typeof(j)
    when 'array'  then jsonb_array_length(j)
    when 'object' then case when j = '{}'::jsonb then 0 else 1 end
    else 0 end
$$;

create or replace function public.f2f_league(p_from date, p_to date)
returns table (
  student_id uuid, display_name text, house_name text,
  points_total numeric, house_points numeric,
  days_logged bigint, physical bigint, technical bigint, tactical bigint, mentality bigint, foundation bigint
)
language sql stable security definer set search_path = public as $$
  with kr as (
    select s.id, s.house_name,
           trim(coalesce(m.first_name, '') || ' ' || coalesce(left(m.last_name, 1) || '.', '')) as display_name
    from students s
    join members m on m.id = s.member_id
    where (s.is_kr is true or s.discipline = 'KRBA')
      and auth.uid() is not null
  ),
  pts as (
    select pl.student_id,
           sum(coalesce(pl.points_awarded, 0)) as points_total,
           sum(case when pl.point_scope in ('house', 'both') then coalesce(pl.points_awarded, 0) else 0 end) as house_points
    from points_log pl
    where pl.awarded_at >= p_from and pl.awarded_at < (p_to + 1)
    group by pl.student_id
  ),
  f2f as (
    select f.student_id,
      count(*) as days_logged,
      sum(public.f2f_league_jlen(f.running::jsonb) + public.f2f_league_jlen(f.watt_bike::jsonb) + public.f2f_league_jlen(f.bodyweight::jsonb)
          + public.f2f_league_jlen(f.snc::jsonb) + public.f2f_league_jlen(f.other_session::jsonb)
          + case when public.f2f_league_jlen(f.stretch_flows::jsonb) > 0 then 1 else 0 end) as physical,
      sum(public.f2f_league_jlen(f.techniques::jsonb)) as technical,
      sum(public.f2f_league_jlen(f.tactical::jsonb)) as tactical,
      sum((select count(*) from jsonb_each(case when jsonb_typeof(f.mentality_log::jsonb) = 'object' then f.mentality_log::jsonb else '{}'::jsonb end) e
           where (jsonb_typeof(e.value -> 'entries') = 'array' and jsonb_array_length(e.value -> 'entries') > 0)
              or ((e.value ->> 'count') ~ '^[0-9]+(\.[0-9]+)?$' and (e.value ->> 'count')::numeric > 0)
              or (e.key = 'coachability' and jsonb_typeof(e.value) = 'object' and e.value <> '{}'::jsonb))) as mentality,
      sum((select count(*) from jsonb_each(case when jsonb_typeof(f.wellbeing::jsonb) = 'object' then f.wellbeing::jsonb else '{}'::jsonb end) e
           where jsonb_typeof(e.value) = 'object'
             and exists (select 1 from jsonb_each_text(e.value) x
                         where x.key not in ('source', 'wearable_id', 'privateJournal', 'targetPreset')
                           and x.value is not null and x.value not in ('', '0', 'false', '[]', '{}')))) as foundation
    from fit2fight_sessions f
    where f.session_date >= p_from and f.session_date <= p_to
    group by f.student_id
  )
  select kr.id, kr.display_name, kr.house_name,
         coalesce(pts.points_total, 0), coalesce(pts.house_points, 0),
         coalesce(f2f.days_logged, 0), coalesce(f2f.physical, 0), coalesce(f2f.technical, 0),
         coalesce(f2f.tactical, 0), coalesce(f2f.mentality, 0), coalesce(f2f.foundation, 0)
  from kr
  left join pts on pts.student_id = kr.id
  left join f2f on f2f.student_id = kr.id
$$;

-- House standings for the same league: every student's house points (scope
-- house/both) in the period, i.e. the same house scoring the club already uses.
create or replace function public.f2f_league_houses(p_from date, p_to date)
returns table (house_name text, house_points numeric)
language sql stable security definer set search_path = public as $$
  select s.house_name, sum(coalesce(pl.points_awarded, 0))
  from points_log pl
  join students s on s.id = pl.student_id
  where pl.point_scope in ('house', 'both')
    and pl.awarded_at >= p_from and pl.awarded_at < (p_to + 1)
    and coalesce(s.house_name, '') <> ''
    and auth.uid() is not null
  group by s.house_name
$$;

revoke all on function public.f2f_league(date, date) from public, anon;
revoke all on function public.f2f_league_houses(date, date) from public, anon;
grant execute on function public.f2f_league(date, date) to authenticated;
grant execute on function public.f2f_league_houses(date, date) to authenticated;
