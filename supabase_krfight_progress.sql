-- KR FIGHT: saved progress -- gems and fighter upgrades.
-- Adds ONE new table (krfight_profiles) and four functions. It does not change any existing table,
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
  upgrades jsonb not null default '{}'::jsonb,    -- { pillar: { power, speed, defence, stamina, special } } levels 0-10
  gems_today int not null default 0,
  gems_day date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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

-- Cost of an upgrade level: level 0 -> 1 costs 4, each next level costs 3 more (max level 10)
create or replace function public.krfight_cost_to(lv int)
returns int language sql immutable as $$
  select (4 * greatest(0, least(lv, 10)) + 3 * greatest(0, least(lv, 10)) * (greatest(0, least(lv, 10)) - 1) / 2)::int
$$;

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
    'gems_today', case when prof.gems_day = current_date then prof.gems_today else 0 end
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

-- Save upgrades + what was spent. Rejected unless: levels are 0-10, the spend matches the upgrade costs
-- exactly, each colour spend is covered by that colour's gems, and wild spend by house points.
create or replace function public.krfight_spend(p_upgrades jsonb, p_spent jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me uuid := public.krfight_me();
  cur jsonb;
  pillar text; areas jsonb; a text; lv int;
  pillar_cost int; total_cost int := 0; total_spent int := 0;
  spent_c int; have int;
begin
  if me is null then raise exception 'not an athlete'; end if;
  cur := public.krfight_profile();
  for pillar in select unnest(array['physical','technical','tactical','mentality','foundation']) loop
    areas := coalesce(p_upgrades -> pillar, '{}'::jsonb);
    pillar_cost := 0;
    for a, lv in select key, (value)::int from jsonb_each_text(areas) loop
      if a not in ('power','speed','defence','stamina','special') or lv < 0 or lv > 10 then raise exception 'bad upgrade %.%', pillar, a; end if;
      pillar_cost := pillar_cost + public.krfight_cost_to(lv);
    end loop;
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
  insert into public.krfight_profiles (student_id, upgrades, spent) values (me, p_upgrades, p_spent)
  on conflict (student_id) do update set upgrades = excluded.upgrades, spent = excluded.spent, updated_at = now();
  return public.krfight_profile();
end $$;

grant execute on function public.krfight_profile() to authenticated;
grant execute on function public.krfight_award(jsonb) to authenticated;
grant execute on function public.krfight_spend(jsonb, jsonb) to authenticated;

-- Check after running (should list the new table with 0 rows):
--   select count(*) from public.krfight_profiles;
