-- KR FIGHT: saved progress -- gems and fighter upgrades.
-- Adds ONE new table (krfight_profiles) and a set of krfight_* functions. It does not change any existing table,
-- points or house scoring: house points and training are only READ to work out gems.
--
-- Where gems come from:
--   * real training: every Fit 2 Fight entry in a pillar = 1 gem of that pillar's colour
--     (same counts the FIIF League uses -- public.f2f_league)
--   * house points already collected = "wild" gems that can be spent on any fighter
--     (the house points themselves are untouched)
--   * winning / playing KR FIGHT = colour gems for the fighters in the team (max 60 a day)
-- Spending gems on upgrades is checked on the server, so the totals can't be faked.
-- Safe to run more than once.

create table if not exists public.krfight_profiles (
  student_id uuid primary key references public.students(id) on delete cascade,
  game_gems jsonb not null default '{}'::jsonb,   -- gems won in the game, per pillar
  spent jsonb not null default '{}'::jsonb,       -- gems spent, per pillar + 'wild'
  upgrades jsonb not null default '{}'::jsonb,    -- { pillar: { <area>: level 0-5 } } -- see krfight_areas()
  gems_today int not null default 0,
  gems_day date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Stage 3: style branches, style XP, locked squad, seasonal Change Token
alter table public.krfight_profiles add column if not exists branches jsonb not null default '{}'::jsonb;   -- { pillar: { branch, tier 0-3, paid: [tiers bought with gems] } }
alter table public.krfight_profiles add column if not exists style_xp jsonb not null default '{}'::jsonb;   -- { pillar: xp }
alter table public.krfight_profiles add column if not exists xp_today int not null default 0;
alter table public.krfight_profiles add column if not exists xp_day date;
alter table public.krfight_profiles add column if not exists squad_styles jsonb;                             -- { pillar: style } once locked
alter table public.krfight_profiles add column if not exists locked_at timestamptz;
alter table public.krfight_profiles add column if not exists last_change_season text;                        -- e.g. 2026-Q4 (one Change Token per quarter)

alter table public.krfight_profiles enable row level security;

-- Staff can see everyone's progress. Athletes read/write their own only through the functions below.
drop policy if exists krfight_profiles_staff_read on public.krfight_profiles;
create policy krfight_profiles_staff_read on public.krfight_profiles for select
  using (exists (select 1 from public.members where members.auth_id = auth.uid() and members.role = any (array['admin','captain'])));

-- The signed-in athlete's student record (KR record first if they have more than one)
create or replace function public.krfight_me()
returns uuid language sql stable security definer set search_path = public as $$
  select s.id from students s join members m on m.id = s.member_id
  where m.auth_id = auth.uid() and auth.uid() is not null
  order by (s.is_kr is true) desc, (s.discipline = 'KRBA') desc
  limit 1
$$;

-- Upgrade areas, one set per pillar: Technical 12, Physical 14 (MTP analysis), Tactical 8, Mentality 8,
-- Foundation 8 (health). 5 levels each. Must match AREAS in src/components/shared/krfight/progress.js.
create or replace function public.krfight_areas()
returns text[] language sql immutable as $$
  select array['shapes','punch_quality','footwork','defence','counters','attack','combinations','change_of_tempo','use_of_phases','distance','flow','self_expression','foot_speed','limb_speed','combination_speed','reaction','punching_power','strength_upper','strength_lower','stability_core','agility','stop_n_go','stamina_aerobic','stamina_anaerobic','suppleness_upper','suppleness_lower','read_opponent','tempo_rhythm','tactical_intelligence','ring_awareness','timing','game_plan','pressure','feints','know_strengths_weaknesses','heart_grit','concentration','composure','confidence','resilience','video_analysis','chess','sleep','nutrition','hydration','outdoors','talk','recovery','health','second_wind']
$$;

-- Total cost to reach a level: level 0 -> 1 costs 3, each next level costs 2 more (3, 5, 7, 9, 11; max level 5)
create or replace function public.krfight_cost_to(lv int)
returns int language sql immutable as $$
  select (3 * greatest(0, least(lv, 5)) + greatest(0, least(lv, 5)) * (greatest(0, least(lv, 5)) - 1))::int
$$;

-- One Change Token per season (quarter): Jan, Apr, Jul, Oct
create or replace function public.krfight_season()
returns text language sql stable as $$ select to_char(current_date, 'YYYY') || '-Q' || to_char(current_date, 'Q') $$;

-- Style branch tiers: style XP needed (fighting) or gem price (buying) for tiers 1, 2, 3
create or replace function public.krfight_tier_xp(t int) returns int language sql immutable as $$ select (array[100, 300, 700])[t] $$;
create or replace function public.krfight_tier_gems(t int) returns int language sql immutable as $$ select (array[20, 40, 70])[t] $$;

-- Everything the game needs in one call
create or replace function public.krfight_profile()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  me uuid := public.krfight_me();
  tr record;
  hp numeric := 0;
  prof public.krfight_profiles;
begin
  if me is null then return null; end if;
  select * into tr from public.f2f_league('2000-01-01'::date, current_date) where student_id = me;
  select coalesce(house_points, 0) into hp from students where id = me;
  select * into prof from public.krfight_profiles where student_id = me;
  return jsonb_build_object(
    'student_id', me,
    'training', jsonb_build_object(
      'physical', coalesce(tr.physical, 0), 'technical', coalesce(tr.technical, 0), 'tactical', coalesce(tr.tactical, 0),
      'mentality', coalesce(tr.mentality, 0), 'foundation', coalesce(tr.foundation, 0)),
    'house_points', greatest(0, coalesce(hp, 0)),
    'game_gems', coalesce(prof.game_gems, '{}'::jsonb),
    'spent', coalesce(prof.spent, '{}'::jsonb),
    'upgrades', coalesce(prof.upgrades, '{}'::jsonb),
    'gems_today', case when prof.gems_day = current_date then prof.gems_today else 0 end,
    'branches', coalesce(prof.branches, '{}'::jsonb),
    'style_xp', coalesce(prof.style_xp, '{}'::jsonb),
    'squad_styles', prof.squad_styles,
    'locked_at', prof.locked_at,
    'last_change_season', prof.last_change_season,
    'season', public.krfight_season()
  );
end $$;

-- Add gems won in a match (capped at 60 a day across all colours)
create or replace function public.krfight_award(p_gems jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me uuid := public.krfight_me();
  prof public.krfight_profiles;
  today_used int;
  room int;
  k text; v int; give int;
  g jsonb;
begin
  if me is null then raise exception 'not an athlete'; end if;
  insert into public.krfight_profiles (student_id) values (me) on conflict (student_id) do nothing;
  select * into prof from public.krfight_profiles where student_id = me for update;
  today_used := case when prof.gems_day = current_date then prof.gems_today else 0 end;
  room := greatest(0, 60 - today_used);
  g := prof.game_gems;
  for k, v in select key, least(greatest((value)::int, 0), 10) from jsonb_each_text(coalesce(p_gems, '{}'::jsonb))
              where key in ('physical','technical','tactical','mentality','foundation') loop
    give := least(v, room);
    if give > 0 then
      g := jsonb_set(g, array[k], to_jsonb(coalesce((g ->> k)::int, 0) + give));
      room := room - give; today_used := today_used + give;
    end if;
  end loop;
  update public.krfight_profiles set game_gems = g, gems_today = today_used, gems_day = current_date, updated_at = now()
  where student_id = me;
  return public.krfight_profile();
end $$;

-- Save upgrades + branch tiers + what was spent. Rejected unless: areas are known areas with levels 0-5,
-- branch tiers are 0-3 and every tier not bought with gems is covered by style XP, the gem spend matches
-- the upgrade + bought-tier costs exactly, each colour spend is covered by that colour's gems, and wild
-- spend by house points.
drop function if exists public.krfight_spend(jsonb, jsonb);
create or replace function public.krfight_spend(p_upgrades jsonb, p_spent jsonb, p_branches jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me uuid := public.krfight_me();
  cur jsonb;
  pillar text; areas jsonb; a text; lv int;
  br jsonb; tier int; t int; paid int[]; xp int;
  pillar_cost int; total_cost int := 0; total_spent int := 0;
  spent_c int; have int;
begin
  if me is null then raise exception 'not an athlete'; end if;
  cur := public.krfight_profile();
  for pillar in select unnest(array['physical','technical','tactical','mentality','foundation']) loop
    areas := coalesce(p_upgrades -> pillar, '{}'::jsonb);
    pillar_cost := 0;
    for a, lv in select key, (value)::int from jsonb_each_text(areas) loop
      if not (a = any (public.krfight_areas())) or lv < 0 or lv > 5 then raise exception 'bad upgrade %.%', pillar, a; end if;
      pillar_cost := pillar_cost + public.krfight_cost_to(lv);
    end loop;
    -- branch tiers
    br := coalesce(p_branches -> pillar, '{}'::jsonb);
    tier := coalesce((br ->> 'tier')::int, 0);
    if tier < 0 or tier > 3 then raise exception 'bad tier for %', pillar; end if;
    select coalesce(array_agg((x)::int), '{}') into paid from jsonb_array_elements_text(coalesce(br -> 'paid', '[]'::jsonb)) x;
    xp := coalesce((cur -> 'style_xp' ->> pillar)::int, 0);
    for t in 1..tier loop
      if t = any (paid) then pillar_cost := pillar_cost + public.krfight_tier_gems(t);
      elsif xp < public.krfight_tier_xp(t) then raise exception 'not enough style XP for % tier %', pillar, t; end if;
    end loop;
    if exists (select 1 from unnest(paid) p where p < 1 or p > tier) then raise exception 'bad paid tiers for %', pillar; end if;
    pillar_cost := pillar_cost + greatest(0, coalesce((br ->> 'sunk')::int, 0)); -- gems spent on tiers of a previous style
    total_cost := total_cost + pillar_cost;
    spent_c := coalesce((p_spent ->> pillar)::int, 0);
    if spent_c < 0 or spent_c > pillar_cost then raise exception 'bad spend for %', pillar; end if;
    have := coalesce((cur -> 'training' ->> pillar)::int, 0) + coalesce((cur -> 'game_gems' ->> pillar)::int, 0);
    if spent_c > have then raise exception 'not enough % gems', pillar; end if;
    total_spent := total_spent + spent_c;
  end loop;
  spent_c := coalesce((p_spent ->> 'wild')::int, 0);
  if spent_c < 0 or spent_c > floor(coalesce((cur ->> 'house_points')::numeric, 0)) then raise exception 'not enough wild gems'; end if;
  total_spent := total_spent + spent_c;
  if total_spent <> total_cost then raise exception 'spend does not match upgrades'; end if;
  insert into public.krfight_profiles (student_id, upgrades, spent, branches) values (me, p_upgrades, p_spent, coalesce(p_branches, '{}'::jsonb))
  on conflict (student_id) do update set upgrades = excluded.upgrades, spent = excluded.spent, branches = excluded.branches, updated_at = now();
  return public.krfight_profile();
end $$;

-- Style XP from a match (each fighter in the team; capped at 400 a day across all fighters)
create or replace function public.krfight_award_xp(p_xp jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me uuid := public.krfight_me();
  prof public.krfight_profiles;
  used int; room int; k text; v int; give int; x jsonb;
begin
  if me is null then raise exception 'not an athlete'; end if;
  insert into public.krfight_profiles (student_id) values (me) on conflict (student_id) do nothing;
  select * into prof from public.krfight_profiles where student_id = me for update;
  used := case when prof.xp_day = current_date then prof.xp_today else 0 end;
  room := greatest(0, 400 - used);
  x := prof.style_xp;
  for k, v in select key, least(greatest((value)::int, 0), 40) from jsonb_each_text(coalesce(p_xp, '{}'::jsonb))
              where key in ('physical','technical','tactical','mentality','foundation') loop
    give := least(v, room);
    if give > 0 then x := jsonb_set(x, array[k], to_jsonb(coalesce((x ->> k)::int, 0) + give)); room := room - give; used := used + give; end if;
  end loop;
  update public.krfight_profiles set style_xp = x, xp_today = used, xp_day = current_date, updated_at = now() where student_id = me;
  return public.krfight_profile();
end $$;

-- Lock in the squad's styles at the athlete's first real fight (only once)
create or replace function public.krfight_lock(p_styles jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := public.krfight_me(); k text;
begin
  if me is null then raise exception 'not an athlete'; end if;
  for k in select key from jsonb_each_text(coalesce(p_styles, '{}'::jsonb)) loop
    if k not in ('physical','technical','tactical','mentality','foundation') then raise exception 'bad pillar %', k; end if;
    if (p_styles ->> k) not in ('kickboxer','pro','am','tkd','thai') then raise exception 'bad style for %', k; end if;
  end loop;
  insert into public.krfight_profiles (student_id) values (me) on conflict (student_id) do nothing;
  update public.krfight_profiles set squad_styles = p_styles, locked_at = now(), updated_at = now() where student_id = me and locked_at is null;
  return public.krfight_profile();
end $$;

-- Use this season's Change Token: new style for one fighter; resets that fighter's branch and style XP
create or replace function public.krfight_change_style(p_pillar text, p_style text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := public.krfight_me(); prof public.krfight_profiles;
begin
  if me is null then raise exception 'not an athlete'; end if;
  if p_pillar not in ('physical','technical','tactical','mentality','foundation') or p_style not in ('kickboxer','pro','am','tkd','thai') then raise exception 'bad style change'; end if;
  select * into prof from public.krfight_profiles where student_id = me for update;
  if prof.locked_at is null then raise exception 'squad not locked yet'; end if;
  if prof.last_change_season = public.krfight_season() then raise exception 'Change Token already used this season'; end if;
  -- gems spent on the old style's bought tiers are not refunded (upgrades in the 50 areas are kept)
  update public.krfight_profiles set
    squad_styles = jsonb_set(coalesce(squad_styles, '{}'::jsonb), array[p_pillar], to_jsonb(p_style)),
    -- gems already spent on the old branch's bought tiers stay counted as 'sunk' so the spend totals still match
    branches = jsonb_set(branches, array[p_pillar], jsonb_build_object('branch', null, 'tier', 0, 'paid', '[]'::jsonb,
      'sunk', coalesce((branches -> p_pillar ->> 'sunk')::int, 0) + coalesce((select sum(public.krfight_tier_gems((x)::int)) from jsonb_array_elements_text(coalesce(branches -> p_pillar -> 'paid', '[]'::jsonb)) x), 0))),
    style_xp = style_xp - p_pillar,
    last_change_season = public.krfight_season(), updated_at = now()
  where student_id = me;
  return public.krfight_profile();
end $$;

grant execute on function public.krfight_profile() to authenticated;
grant execute on function public.krfight_award(jsonb) to authenticated;
grant execute on function public.krfight_spend(jsonb, jsonb, jsonb) to authenticated;
grant execute on function public.krfight_award_xp(jsonb) to authenticated;
grant execute on function public.krfight_lock(jsonb) to authenticated;
grant execute on function public.krfight_change_style(text, text) to authenticated;

-- Check after running (should list the new table with 0 rows):
--   select count(*) from public.krfight_profiles;
