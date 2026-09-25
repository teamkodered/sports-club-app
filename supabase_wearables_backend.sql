-- WEARABLES: one shared backend for any wearable / health app.
-- Three tables that every provider (Whoop, Fitbit, Garmin, Oura, Apple
-- Health, Samsung Health / Health Connect, ...) feeds into, so the rest of
-- the app never needs to know which device the data came from.
--   wearable_connections : who has linked which provider (+ tokens)
--   wearable_workouts    : one row per workout/session
--   wearable_daily       : one row per day per provider (steps, sleep, HR, recovery)
-- Existing Whoop data is copied across; the old whoop_* tables are left
-- untouched and can be dropped once everything is confirmed working.
-- Safe to run more than once.

create table if not exists public.wearable_connections (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  provider text not null,                  -- 'whoop', 'fitbit', 'garmin', 'oura', 'apple_health', 'samsung_health', 'health_connect', 'polar', 'strava'
  provider_user_id text,                   -- the provider's own id for this user
  access_token text,
  refresh_token text,
  token_expires_at timestamptz,
  scopes text,
  status text not null default 'active' check (status in ('active', 'needs_reauth', 'disconnected')),
  last_sync_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (student_id, provider)
);
create index if not exists wearable_connections_provider_user_idx on public.wearable_connections (provider, provider_user_id);

create table if not exists public.wearable_workouts (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  provider text not null,
  provider_workout_id text not null,
  sport_name text,
  start_time timestamptz,
  end_time timestamptz,
  duration_seconds int,
  strain numeric,                          -- provider's effort/strain score, if it has one
  avg_heart_rate int,
  max_heart_rate int,
  calories numeric,                        -- kcal
  distance_m numeric,
  zone_durations jsonb,                    -- heart-rate zone time, provider's shape
  raw_data jsonb,                          -- the provider's full record, for anything not mapped
  synced_at timestamptz not null default now(),
  unique (provider, provider_workout_id)
);
create index if not exists wearable_workouts_student_start_idx on public.wearable_workouts (student_id, start_time desc);

create table if not exists public.wearable_daily (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  provider text not null,
  day date not null,
  steps int,
  resting_heart_rate int,
  hrv numeric,                             -- ms
  sleep_seconds int,
  sleep_score numeric,                     -- provider's 0-100 sleep quality, if any
  recovery_score numeric,                  -- Whoop recovery / Oura readiness / Garmin body battery style score
  active_calories numeric,
  raw_data jsonb,
  synced_at timestamptz not null default now(),
  unique (student_id, provider, day)
);
create index if not exists wearable_daily_student_day_idx on public.wearable_daily (student_id, day desc);

-- ---------- Row Level Security ----------
alter table public.wearable_connections enable row level security;
alter table public.wearable_workouts enable row level security;
alter table public.wearable_daily enable row level security;

-- Helper: is the signed-in user this student, or staff?
create or replace function public.can_view_student_wearables(p_student_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from students s join members m on m.id = s.member_id
    where s.id = p_student_id and m.auth_id = auth.uid()
  ) or exists (
    select 1 from members where auth_id = auth.uid() and role in ('admin', 'captain', 'coach', 'leader')
  );
$$;

-- Connections: tokens are sensitive, so the app only ever reads the
-- non-secret columns through the view below. Students may delete their own.
drop policy if exists wearable_connections_delete_own on public.wearable_connections;
create policy wearable_connections_delete_own on public.wearable_connections for delete
  using (exists (select 1 from students s join members m on m.id = s.member_id where s.id = student_id and m.auth_id = auth.uid()));

create or replace view public.wearable_connections_public
with (security_invoker = false) as
  select id, student_id, provider, status, last_sync_at, last_error, created_at, updated_at
  from public.wearable_connections
  where public.can_view_student_wearables(student_id);
grant select on public.wearable_connections_public to authenticated;

drop policy if exists wearable_workouts_read on public.wearable_workouts;
create policy wearable_workouts_read on public.wearable_workouts for select
  using (public.can_view_student_wearables(student_id));

drop policy if exists wearable_daily_read on public.wearable_daily;
create policy wearable_daily_read on public.wearable_daily for select
  using (public.can_view_student_wearables(student_id));

-- (Edge functions write with the service role key, which bypasses RLS.)

-- ---------- Copy existing Whoop data across ----------
do $$
begin
  if to_regclass('public.whoop_connections') is not null then
    insert into public.wearable_connections
      (student_id, provider, provider_user_id, access_token, refresh_token, token_expires_at, scopes, created_at, updated_at)
    select student_id, 'whoop', whoop_user_id, access_token, refresh_token, token_expires_at,
           'read:workout read:profile offline', now(), coalesce(updated_at, now())
    from public.whoop_connections
    on conflict (student_id, provider) do update set
      provider_user_id = excluded.provider_user_id,
      access_token = excluded.access_token,
      refresh_token = excluded.refresh_token,
      token_expires_at = excluded.token_expires_at,
      updated_at = now();
  end if;
  if to_regclass('public.whoop_sessions') is not null then
    -- ids are kept so anything linked to a session (e.g. Fit to Fight) still points at it
    insert into public.wearable_workouts
      (id, student_id, provider, provider_workout_id, sport_name, start_time, end_time, duration_seconds,
       strain, avg_heart_rate, max_heart_rate, calories, zone_durations, raw_data)
    select id, student_id, 'whoop', whoop_workout_id, sport_name, start_time, end_time,
           case when start_time is not null and end_time is not null then extract(epoch from end_time - start_time)::int end,
           strain, avg_heart_rate, max_heart_rate, calories, zone_durations, raw_data
    from public.whoop_sessions
    on conflict (provider, provider_workout_id) do nothing;
  end if;
end $$;
