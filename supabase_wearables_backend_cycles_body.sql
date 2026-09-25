-- Adds whole-day figures (Whoop cycles) to wearable_daily and body
-- measurements (height / weight / max HR) to wearable_connections.
-- Safe to run more than once.
alter table public.wearable_daily add column if not exists day_strain numeric;
alter table public.wearable_daily add column if not exists avg_heart_rate int;
alter table public.wearable_daily add column if not exists max_heart_rate int;
alter table public.wearable_connections add column if not exists body_data jsonb;

-- Expose body_data (not secret) through the public view (drop + recreate:
-- Postgres won't reorder view columns with create or replace)
drop view if exists public.wearable_connections_public;
create view public.wearable_connections_public
with (security_invoker = false) as
  select id, student_id, provider, status, last_sync_at, last_error, body_data, created_at, updated_at
  from public.wearable_connections
  where public.can_view_student_wearables(student_id);
grant select on public.wearable_connections_public to authenticated;
