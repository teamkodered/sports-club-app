-- KR FIGHT stage 5: player vs player.
-- Athletes fight other athletes' saved squads (played by the CPU). The winner copies ONE of the loser's cards or
-- combo cards (the loser keeps theirs). Results feed season leaderboards by house and age group.
-- Adds: 3 columns on krfight_profiles, one log table, five functions. Nothing else is changed; house points and
-- the league are untouched. Needs supabase_krfight_progress.sql and supabase_krfight_collection.sql first.
-- Safe to run more than once.

alter table public.krfight_profiles add column if not exists defence jsonb;          -- { order: [pillar...], styles: {}, loadouts: {}, skins: {} }
alter table public.krfight_profiles add column if not exists pvp_wins int not null default 0;
alter table public.krfight_profiles add column if not exists pvp_losses int not null default 0;

create table if not exists public.krfight_pvp_log (
  id uuid primary key default gen_random_uuid(),
  at timestamptz not null default now(),
  season text not null,
  attacker uuid not null references public.students(id) on delete cascade,
  defender uuid not null references public.students(id) on delete cascade,
  won boolean not null,
  reward jsonb                                                   -- { kind, id } copied by the attacker, if any
);
create index if not exists krfight_pvp_log_season on public.krfight_pvp_log (season, attacker);
alter table public.krfight_pvp_log enable row level security;
drop policy if exists krfight_pvp_log_staff_read on public.krfight_pvp_log;
create policy krfight_pvp_log_staff_read on public.krfight_pvp_log for select
  using (exists (select 1 from public.members where members.auth_id = auth.uid() and members.role = any (array['admin','captain'])));

-- how athletes are shown to each other: first name + last initial
create or replace function public.krfight_display_name(sid uuid)
returns text language sql stable security definer set search_path = public as $$
  select trim(coalesce(m.first_name, '') || ' ' || left(coalesce(m.last_name, ''), 1)) from students s join members m on m.id = s.member_id where s.id = sid
$$;

-- save my defence squad (called by the game whenever I fight)
create or replace function public.krfight_set_defence(p_defence jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := public.krfight_me(); k text;
begin
  if me is null then raise exception 'not an athlete'; end if;
  if jsonb_typeof(p_defence -> 'order') <> 'array' or jsonb_array_length(p_defence -> 'order') not between 1 and 5 then raise exception 'bad squad'; end if;
  for k in select value from jsonb_array_elements_text(p_defence -> 'order') loop
    if k not in ('physical','technical','tactical','mentality','foundation') then raise exception 'bad fighter %', k; end if;
  end loop;
  insert into public.krfight_profiles (student_id) values (me) on conflict (student_id) do nothing;
  update public.krfight_profiles set defence = p_defence, updated_at = now() where student_id = me;
end $$;

-- other athletes I can challenge (with what the game needs to build their team)
create or replace function public.krfight_opponents()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(row_to_json(o)::jsonb order by o.updated_at desc), '[]'::jsonb) from (
    select p.student_id, public.krfight_display_name(p.student_id) as name, h.name as house, s.age_category,
           p.defence, coalesce(p.squad_styles, p.defence -> 'styles') as styles, p.upgrades, p.branches,
           jsonb_build_object('cards', coalesce(p.collection -> 'cards', '{}'::jsonb), 'combos', coalesce(p.collection -> 'combos', '{}'::jsonb)) as collection,
           p.pvp_wins, p.pvp_losses, p.updated_at,
           exists (select 1 from krfight_pvp_log l where l.attacker = public.krfight_me() and l.defender = p.student_id and l.at::date = current_date and l.reward is not null) as rewarded_today
    from krfight_profiles p
    join students s on s.id = p.student_id
    join members m on m.id = s.member_id
    left join houses h on h.id = m.house_id
    where p.defence is not null and p.student_id <> public.krfight_me()
    order by p.updated_at desc
    limit 60
  ) o
$$;

-- record a challenge. If I won I may copy one item the opponent owns (5 rewarded wins a day, once per opponent a day).
create or replace function public.krfight_pvp_result(p_opponent uuid, p_won boolean, p_pick jsonb default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me uuid := public.krfight_me();
  opp public.krfight_profiles; mine public.krfight_profiles;
  kind text; id text; bucket text; cur int; coll jsonb; reward jsonb := null; today int;
begin
  if me is null then raise exception 'not an athlete'; end if;
  if p_opponent = me then raise exception 'cannot fight yourself'; end if;
  select * into opp from public.krfight_profiles where student_id = p_opponent;
  if opp.student_id is null or opp.defence is null then raise exception 'opponent not found'; end if;
  insert into public.krfight_profiles (student_id) values (me) on conflict (student_id) do nothing;
  select * into mine from public.krfight_profiles where student_id = me for update;
  if p_won and p_pick is not null then
    kind := p_pick ->> 'kind'; id := p_pick ->> 'id';
    bucket := case kind when 'card' then 'cards' when 'combo' then 'combos' else null end;
    select count(*) into today from krfight_pvp_log where attacker = me and at::date = current_date and reward is not null;
    if bucket is not null and today < 5
       and not exists (select 1 from krfight_pvp_log where attacker = me and defender = p_opponent and at::date = current_date and reward is not null)
       and coalesce((opp.collection -> bucket ->> id)::int, 0) > 0 then
      coll := coalesce(mine.collection, '{}'::jsonb);
      if coll -> bucket is null then coll := jsonb_set(coll, array[bucket], '{}'::jsonb); end if;
      cur := coalesce((coll -> bucket ->> id)::int, 0);
      coll := jsonb_set(coll, array[bucket, id], to_jsonb(least(3, cur + 1)));
      update public.krfight_profiles set collection = coll where student_id = me;
      reward := jsonb_build_object('kind', kind, 'id', id);
    end if;
  end if;
  insert into public.krfight_pvp_log (season, attacker, defender, won, reward) values (public.krfight_season(), me, p_opponent, p_won, reward);
  update public.krfight_profiles set pvp_wins = pvp_wins + case when p_won then 1 else 0 end, pvp_losses = pvp_losses + case when p_won then 0 else 1 end, updated_at = now() where student_id = me;
  return public.krfight_profile() || jsonb_build_object('pvp_reward', reward);
end $$;

-- this season's leaderboards: houses by wins, top athletes (optionally one age group), and me
create or replace function public.krfight_leaderboard(p_age text default null)
returns jsonb language sql stable security definer set search_path = public as $$
  with w as (
    select l.attacker as sid, count(*) filter (where l.won) as wins, count(*) filter (where not l.won) as losses
    from krfight_pvp_log l where l.season = public.krfight_season() group by l.attacker
  ), a as (
    select w.*, public.krfight_display_name(w.sid) as name, h.name as house, s.age_category
    from w join students s on s.id = w.sid join members m on m.id = s.member_id left join houses h on h.id = m.house_id
  )
  select jsonb_build_object(
    'season', public.krfight_season(),
    'houses', coalesce((select jsonb_agg(jsonb_build_object('house', house, 'wins', wins) order by wins desc) from (select coalesce(house, 'No house') as house, sum(wins) as wins from a group by 1) x), '[]'::jsonb),
    'athletes', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'house', house, 'age', age_category, 'wins', wins, 'losses', losses, 'me', sid = public.krfight_me()) order by wins desc, losses asc)
                          from (select * from a where p_age is null or age_category = p_age order by wins desc, losses asc limit 20) t), '[]'::jsonb),
    'ages', coalesce((select jsonb_agg(distinct age_category) from a where age_category is not null), '[]'::jsonb),
    'me', (select jsonb_build_object('wins', wins, 'losses', losses, 'rank', (select count(*) + 1 from a b where b.wins > a.wins)) from a where sid = public.krfight_me())
  )
$$;

grant execute on function public.krfight_set_defence(jsonb) to authenticated;
grant execute on function public.krfight_opponents() to authenticated;
grant execute on function public.krfight_pvp_result(uuid, boolean, jsonb) to authenticated;
grant execute on function public.krfight_leaderboard(text) to authenticated;

-- Check after running (should be 0 until someone challenges another athlete):
--   select count(*) from public.krfight_pvp_log;
