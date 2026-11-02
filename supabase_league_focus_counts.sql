-- ════════════════════════════════════════════════════════════════════════
-- LEAGUE BOARD: "most completed" boards count FOCUS work only (Nov 2026)
--   per area per day:  +1 their monthly 🎯 focus question logged in that area
--                      +1 their monthly 🎯 PDP focus action ticked done for that area
--   (anything else logged still saves -- it just doesn't count on these boards)
--   "Most questions completed" = focus questions done (1 per area per day) + test groups done + note days
-- Areas: Physical, Technical, Tactical, Mentality, Foundation (Foundation has no PDP area).
-- ════════════════════════════════════════════════════════════════════════
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
    where (s.is_kr is true or s.discipline = 'KRBA' or coalesce((to_jsonb(s) ->> 'app_access')::boolean, false))
      and coalesce(m.status, 'active') not in ('stopped', 'not_started')
  ),
  ap as (select a.student_id, a.pdp_notes::jsonb as notes, a.pdp_done::jsonb as done from athlete_profiles a),
  ment(k, label) as (values ('meditation','Meditation'),('visualisation','Visualisation'),('chess','Play chess'),('reading','Reading'),
    ('gaming','Gaming (combat)'),('eyeTracking','Eye tracking drills'),('coldWater','Cold water training'),('activeRecovery','Active recovery day'),
    ('gratitude','Self gratitude'),('alterEgo','Alter Ego'),('coachability','Coachability')),
  well(k, label) as (values ('sleep','Sleep'),('nutrition','Nutrition'),('hydration','Hydration'),('outdoors','Outdoors'),('talk','Talk'),
    ('screenFree','Screen free'),('journal','Journal'),('creative','Creative task'),('productivity','Productivity')),
  bw(k, label) as (values ('circuit','Fixed load circuit'),('compounds','Compounds'),('isometrics','Isometrics'),('abs','Abs circuit')),
  d as (
    select f.*,
      coalesce(ap.notes -> '__focus' -> to_char(f.session_date, 'YYYY-MM'), '{}'::jsonb) as qf,   -- question focus: section -> label
      coalesce(ap.done -> '__focus__' -> to_char(f.session_date, 'YYYY-MM'), '{}'::jsonb) as pf, -- PDP focus: area -> key
      coalesce(ap.done, '{}'::jsonb) as pdone
    from fit2fight_sessions f left join ap on ap.student_id = f.student_id
    where f.session_date >= p_from and f.session_date <= p_to
  ),
  per_day as (
    select d.student_id, d.session_date,
      -- 🎯 focus question logged that day, per area
      (case when d.qf ? 'physical' and exists (
          select 1 from jsonb_array_elements(public.f2f_league_arr(d.bodyweight::jsonb)) e
          left join bw on bw.label = d.qf ->> 'physical'
          where e ->> 'group' in (d.qf ->> 'physical', bw.k) or e ->> 'category' = d.qf ->> 'physical') then 1 else 0 end) as q_phys,
      (case when d.qf ? 'technique' and exists (
          select 1 from jsonb_array_elements(public.f2f_league_arr(d.techniques::jsonb)) t
          where d.qf ->> 'technique' in (t ->> 'category', t ->> 'style', t ->> 'type')) then 1 else 0 end) as q_tech,
      (case when d.qf ? 'tactical' and exists (
          select 1 from jsonb_array_elements(public.f2f_league_arr(d.tactical::jsonb)) t
          where t ->> 'category' = d.qf ->> 'tactical') then 1 else 0 end) as q_tact,
      (case when d.qf ? 'mentality' and exists (
          select 1 from ment join lateral (select d.mentality_log::jsonb -> ment.k as v) x on true
          where ment.label = d.qf ->> 'mentality' and x.v is not null and (
            (jsonb_typeof(x.v -> 'entries') = 'array' and jsonb_array_length(x.v -> 'entries') > 0)
            or ((x.v ->> 'count') ~ '^[0-9]+(\.[0-9]+)?$' and (x.v ->> 'count')::numeric > 0)
            or (ment.k = 'coachability' and jsonb_typeof(x.v) = 'object' and x.v <> '{}'::jsonb))) then 1 else 0 end) as q_ment,
      (case when d.qf ? 'wellbeing' and exists (
          select 1 from well join lateral (select d.wellbeing::jsonb -> well.k as v) x on true
          where well.label = d.qf ->> 'wellbeing' and jsonb_typeof(x.v) = 'object' and coalesce((x.v ->> 'unconfirmed')::boolean, false) = false
            and exists (select 1 from jsonb_each_text(x.v) y where y.key not in ('source', 'wearable_id', 'privateJournal', 'targetPreset', 'unconfirmed')
                        and y.value is not null and y.value not in ('', '0', 'false', '[]', '{}'))) then 1 else 0 end) as q_well,
      -- 🎯 PDP focus action ticked done that day, per area
      (case when d.pf ? 'physical'   and d.pdone -> (d.pf ->> 'physical')   ? d.session_date::text then 1 else 0 end) as p_phys,
      (case when d.pf ? 'tech'       and d.pdone -> (d.pf ->> 'tech')       ? d.session_date::text then 1 else 0 end) as p_tech,
      (case when d.pf ? 'tact'       and d.pdone -> (d.pf ->> 'tact')       ? d.session_date::text then 1 else 0 end) as p_tact,
      (case when d.pf ? 'psychology' and d.pdone -> (d.pf ->> 'psychology') ? d.session_date::text then 1 else 0 end) as p_ment,
      -- tests: +1 per test group done that day
      (select count(distinct case
            when t.key ilike '%jump%' then 'jumps'
            when t.key ilike 'bleep%' or t.key ilike 'vo2%' then 'bleep'
            when t.key ilike '%grip%' or t.key ilike '%pinch%' then 'grip'
            when t.key in ('Bench Press', 'Shoulder Press', 'Deadlift', 'Squat') then 'maxlifts'
            when t.key ilike 'watt bike%' then 'wattbike'
            when t.key ilike 'fixed load%' then 'fixedload'
            when t.key ilike '%(range)%' then 'stretches'
            when t.key ilike '%time trial%' or t.key ilike '%m sprint%' then 'timedrun'
            when t.key ilike 'hrr%' or t.key ilike 'heart rate recovery%' then 'hrr'
            else 'other:' || t.key end)
         from jsonb_each_text(case when jsonb_typeof(d.test::jsonb) = 'object' then d.test::jsonb else '{}'::jsonb end) t
         where t.value is not null and btrim(t.value) not in ('', 'null')) as q_tests
    from d
  ),
  note_days as (
    select n.student_id, count(distinct date(coalesce(n.logged_at, n.created_at))) as days
    from athlete_notes_log n
    where coalesce(n.author_role, 'athlete') <> 'coach'
      and date(coalesce(n.logged_at, n.created_at)) between p_from and p_to
    group by n.student_id
  ),
  f2f as (
    select student_id, count(*) as days_logged,
      sum(q_phys + p_phys) as physical, sum(q_tech + p_tech) as technical, sum(q_tact + p_tact) as tactical,
      sum(q_ment + p_ment) as mentality, sum(q_well) as foundation,
      sum(q_phys + q_tech + q_tact + q_ment + q_well + q_tests) as questions
    from per_day group by student_id
  )
  select kr.id, kr.display_name, kr.house_name,
         coalesce(f2f.physical, 0), coalesce(f2f.technical, 0), coalesce(f2f.tactical, 0),
         coalesce(f2f.mentality, 0), coalesce(f2f.foundation, 0), coalesce(f2f.days_logged, 0),
         coalesce(f2f.questions, 0) + coalesce(nd.days, 0)
  from kr
  left join f2f on f2f.student_id = kr.id
  left join note_days nd on nd.student_id = kr.id
$$;
grant execute on function public.public_f2f_tasks(date, date) to anon, authenticated;

-- check: this month's boards
select display_name, physical, technical, tactical, mentality, foundation, questions
from public.public_f2f_tasks(date_trunc('month', current_date)::date, current_date)
where physical + technical + tactical + mentality + foundation + questions > 0
order by questions desc;
