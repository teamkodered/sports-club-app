-- League board (public display + athlete app): "most tasks completed" for every
-- KR + KRBA athlete, readable by the public screen (no login). Read-only, names
-- as first name + last initial. Re-uses f2f_league_jlen (supabase_f2f_league.sql).
--
-- Area columns (physical/technical/tactical/mentality/foundation) count logged
-- items, as before. "questions" (used by the Overall board) counts QUESTIONS
-- COMPLETED PER DAY, the same way in every area: each question / group / area
-- done that day = 1, however many items are inside it.

create or replace function public.f2f_league_arr(j jsonb)
returns jsonb language sql immutable as $$
  select case jsonb_typeof(j) when 'array' then j when 'object' then jsonb_build_array(j) else '[]'::jsonb end
$$;

drop function if exists public.public_f2f_tasks(date, date);
create function public.public_f2f_tasks(p_from date, p_to date)
returns table (
  student_id uuid, display_name text, house_name text,
  physical bigint, technical bigint, tactical bigint, mentality bigint, foundation bigint, days_logged bigint, questions bigint
)
language sql stable security definer set search_path = public as $$
  with kr as (
    select s.id, s.house_name,
           trim(coalesce(m.first_name, '') || ' ' || coalesce(upper(left(m.last_name, 1)) || '.', '')) as display_name
    from students s join members m on m.id = s.member_id
    where (s.is_kr is true or s.discipline = 'KRBA')
      and coalesce(m.status, 'active') not in ('stopped', 'not_started')
  ),
  per_day as (
    select f.student_id,
      -- items (area boards)
      public.f2f_league_jlen(f.running::jsonb) + public.f2f_league_jlen(f.watt_bike::jsonb) + public.f2f_league_jlen(f.bodyweight::jsonb)
        + public.f2f_league_jlen(f.snc::jsonb) + public.f2f_league_jlen(f.other_session::jsonb)
        + case when public.f2f_league_jlen(f.stretch_flows::jsonb) > 0 then 1 else 0 end as physical,
      public.f2f_league_jlen(f.techniques::jsonb) as technical,
      public.f2f_league_jlen(f.tactical::jsonb) as tactical,
      (select count(*) from jsonb_each(case when jsonb_typeof(f.mentality_log::jsonb) = 'object' then f.mentality_log::jsonb else '{}'::jsonb end) e
        where (jsonb_typeof(e.value -> 'entries') = 'array' and jsonb_array_length(e.value -> 'entries') > 0)
           or ((e.value ->> 'count') ~ '^[0-9]+(\.[0-9]+)?$' and (e.value ->> 'count')::numeric > 0)
           or (e.key = 'coachability' and jsonb_typeof(e.value) = 'object' and e.value <> '{}'::jsonb)) as mentality,
      (select count(*) from jsonb_each(case when jsonb_typeof(f.wellbeing::jsonb) = 'object' then f.wellbeing::jsonb else '{}'::jsonb end) e
        where jsonb_typeof(e.value) = 'object'
          and exists (select 1 from jsonb_each_text(e.value) x
                      where x.key not in ('source', 'wearable_id', 'privateJournal', 'targetPreset')
                        and x.value is not null and x.value not in ('', '0', 'false', '[]', '{}'))) as foundation,
      -- questions completed that day (Overall board): one per question / group / area
      (select count(distinct coalesce(t ->> 'style', '') || '::' || coalesce(t ->> 'category', t ->> 'type', '')) from jsonb_array_elements(public.f2f_league_arr(f.techniques::jsonb)) t)
      + (select count(distinct coalesce(t ->> 'category', '')) from jsonb_array_elements(public.f2f_league_arr(f.tactical::jsonb)) t)
      + (select count(distinct coalesce(e ->> 'category', e ->> 'test', '')) from jsonb_array_elements(public.f2f_league_arr(f.running::jsonb)) e)
      + (select count(distinct coalesce(e ->> 'group', e ->> 'interval_mode', e ->> 'type', '')) from jsonb_array_elements(public.f2f_league_arr(f.watt_bike::jsonb)) e)
      + (select count(distinct coalesce(e ->> 'category', e ->> 'group', '')) from jsonb_array_elements(public.f2f_league_arr(f.bodyweight::jsonb)) e)
      + case when public.f2f_league_jlen(f.snc::jsonb) > 0 then 1 else 0 end
      + case when public.f2f_league_jlen(f.other_session::jsonb) > 0 then 1 else 0 end
      + case when public.f2f_league_jlen(f.stretch_flows::jsonb) > 0 then 1 else 0 end as q_other
    from fit2fight_sessions f
    where f.session_date >= p_from and f.session_date <= p_to
  ),
  f2f as (
    select student_id, count(*) as days_logged,
      sum(physical) as physical, sum(technical) as technical, sum(tactical) as tactical,
      sum(mentality) as mentality, sum(foundation) as foundation,
      sum(mentality + foundation + q_other) as questions
    from per_day group by student_id
  )
  select kr.id, kr.display_name, kr.house_name,
         coalesce(f2f.physical, 0), coalesce(f2f.technical, 0), coalesce(f2f.tactical, 0),
         coalesce(f2f.mentality, 0), coalesce(f2f.foundation, 0), coalesce(f2f.days_logged, 0), coalesce(f2f.questions, 0)
  from kr left join f2f on f2f.student_id = kr.id
$$;

grant execute on function public.public_f2f_tasks(date, date) to anon, authenticated;
