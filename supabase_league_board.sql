-- League board (public display + athlete app): "most tasks completed" for
-- KR + KRBA athletes, readable by the public screen (no login). Read-only,
-- names as first name + last initial, no other student data. Re-uses
-- f2f_league_jlen from supabase_f2f_league.sql (run that first if needed).
create or replace function public.public_f2f_tasks(p_from date, p_to date)
returns table (
  student_id uuid, display_name text, house_name text,
  physical bigint, technical bigint, tactical bigint, mentality bigint, foundation bigint, days_logged bigint
)
language sql stable security definer set search_path = public as $$
  with kr as (
    select s.id, s.house_name,
           trim(coalesce(m.first_name, '') || ' ' || coalesce(upper(left(m.last_name, 1)) || '.', '')) as display_name
    from students s join members m on m.id = s.member_id
    where (s.is_kr is true or s.discipline = 'KRBA')
      and coalesce(m.status, 'active') not in ('stopped', 'not_started')
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
         coalesce(f2f.physical, 0), coalesce(f2f.technical, 0), coalesce(f2f.tactical, 0),
         coalesce(f2f.mentality, 0), coalesce(f2f.foundation, 0), coalesce(f2f.days_logged, 0)
  from kr left join f2f on f2f.student_id = kr.id   -- every KR / KRBA athlete (0s included) so the board also knows who's KR / KRBA
$$;

grant execute on function public.public_f2f_tasks(date, date) to anon, authenticated;
