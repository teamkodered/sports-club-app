-- KR FIGHT stage 4: collection -- combo cards, graphic cards and win streak saved on the athlete's profile.
-- Adds three columns to krfight_profiles (from supabase_krfight_progress.sql, already run), one function,
-- and updates krfight_profile() to return them. Doesn't touch any other table, points or house scoring.
-- Drops come from wins in the game: at most 6 new cards / combo cards a day.
-- Safe to run more than once.

alter table public.krfight_profiles add column if not exists collection jsonb not null default '{}'::jsonb; -- { combos: { id: level }, cards: { id: level } }
alter table public.krfight_profiles add column if not exists win_streak int not null default 0;
alter table public.krfight_profiles add column if not exists drops_today int not null default 0;
alter table public.krfight_profiles add column if not exists drops_day date;

-- krfight_profile(): same as before plus collection + win streak
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
    'season', public.krfight_season(),
    'collection', coalesce(prof.collection, '{}'::jsonb),
    'win_streak', coalesce(prof.win_streak, 0)
  );
end $$;

-- End of a match: update the win streak and add the match's drops.
-- p_drops: [{ "kind": "card" | "combo", "id": "..." }] -- ids must look like the game's ids; a duplicate levels
-- the item up (cards and combos max level 3). At most 6 drops a day count; extra ones are ignored.
create or replace function public.krfight_match_end(p_won boolean, p_drops jsonb default '[]'::jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me uuid := public.krfight_me();
  prof public.krfight_profiles;
  used int; d jsonb; kind text; id text; coll jsonb; cur int; bucket text;
begin
  if me is null then raise exception 'not an athlete'; end if;
  insert into public.krfight_profiles (student_id) values (me) on conflict (student_id) do nothing;
  select * into prof from public.krfight_profiles where student_id = me for update;
  used := case when prof.drops_day = current_date then prof.drops_today else 0 end;
  coll := coalesce(prof.collection, '{}'::jsonb);
  if coll -> 'cards' is null then coll := jsonb_set(coll, '{cards}', '{}'::jsonb); end if;
  if coll -> 'combos' is null then coll := jsonb_set(coll, '{combos}', '{}'::jsonb); end if;
  for d in select value from jsonb_array_elements(coalesce(p_drops, '[]'::jsonb)) loop
    exit when used >= 6;
    kind := d ->> 'kind'; id := d ->> 'id';
    if kind = 'card' and id ~ '^card_(physical|technical|tactical|mentality|foundation)_(common|rare|epic|legendary)$' then bucket := 'cards';
    elsif kind = 'combo' and id ~ '^[a-z]_[a-z0-9_]{1,30}$' then bucket := 'combos';
    else continue; end if;
    cur := coalesce((coll -> bucket ->> id)::int, 0);
    coll := jsonb_set(coll, array[bucket, id], to_jsonb(least(3, cur + 1)));
    used := used + 1;
  end loop;
  update public.krfight_profiles set
    collection = coll,
    win_streak = case when p_won then coalesce(win_streak, 0) + 1 else 0 end,
    drops_today = used, drops_day = current_date, updated_at = now()
  where student_id = me;
  return public.krfight_profile();
end $$;

grant execute on function public.krfight_match_end(boolean, jsonb) to authenticated;

-- Check after running (should list the four new columns):
--   select column_name from information_schema.columns where table_name = 'krfight_profiles' and column_name in ('collection','win_streak','drops_today','drops_day');
