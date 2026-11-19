-- CCTV footage view log: who watched which clip, and when (coaches / admins can see it)
create table if not exists public.footage_views (
  id uuid primary key default gen_random_uuid(),
  clip_id text not null,
  storage_path text,
  viewer_auth_id uuid not null,
  viewer_name text,
  viewed_at timestamptz not null default now()
);
create index if not exists footage_views_clip_idx on public.footage_views (clip_id, viewed_at desc);
alter table public.footage_views enable row level security;
drop policy if exists footage_views_insert_own on public.footage_views;
create policy footage_views_insert_own on public.footage_views for insert to authenticated with check (viewer_auth_id = auth.uid());
drop policy if exists footage_views_read_staff on public.footage_views;
create policy footage_views_read_staff on public.footage_views for select to authenticated using (public.kc_is_coach_staff());
