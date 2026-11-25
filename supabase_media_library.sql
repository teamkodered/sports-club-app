-- ════════════════════════════════════════════════════════════════════════
-- MEDIA LIBRARY (Dropbox, read-only)
-- • dropbox_auth: the Dropbox connection. RLS on with NO policies -- only the server
--   (Netlify functions with the service key) can read it, never the app.
-- • media_folders: which Dropbox folders are included, and how far indexing has got
-- • media_items: one row per photo / video found -- just its details, the file stays in Dropbox
--   Nothing can be used until it's checked: consent_ok is set by the database from the
--   students tagged (only media consent = Yes counts), exactly like coaches' moments.
-- Safe to run again. Nothing existing is changed or deleted.
-- ════════════════════════════════════════════════════════════════════════

create table if not exists public.dropbox_auth (
  id int primary key default 1 check (id = 1),
  refresh_token text,
  account_name text,
  root_namespace_id text,
  pending_state text,
  connected_at timestamptz
);
alter table public.dropbox_auth enable row level security;   -- no policies on purpose: server only

create table if not exists public.media_folders (
  id uuid primary key default gen_random_uuid(),
  path text not null unique,             -- Dropbox path, e.g. /Kode Red/Photos/2019
  name text,
  included boolean not null default true,
  cursor text,                           -- where indexing got to (Dropbox list_folder cursor)
  done boolean not null default false,   -- first full pass finished
  file_count int not null default 0,
  last_synced timestamptz
);
alter table public.media_folders enable row level security;
drop policy if exists media_folders_admin on public.media_folders;
create policy media_folders_admin on public.media_folders for all
  using (public.kc_has_role(array['admin'])) with check (public.kc_has_role(array['admin']));

create table if not exists public.media_items (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  dropbox_id text not null unique,
  path text not null,
  name text not null,
  folder_path text,                      -- the included folder it came from
  event_name text,                       -- defaults to the file's own folder name
  kind text not null check (kind in ('photo', 'video')),
  taken_at timestamptz,
  size bigint,
  status text not null default 'unchecked' check (status in ('unchecked', 'checked', 'binned')),
  student_ids uuid[] not null default '{}',
  no_one_identifiable boolean not null default false,
  consent_ok boolean not null default false,   -- set by the trigger below, never by the app
  checked_at timestamptz,
  missing boolean not null default false       -- deleted / moved in Dropbox since indexing
);
create index if not exists media_items_folder_idx on public.media_items (folder_path, taken_at);
create index if not exists media_items_taken_idx on public.media_items (taken_at);
create index if not exists media_items_status_idx on public.media_items (status);
alter table public.media_items enable row level security;
drop policy if exists media_items_admin on public.media_items;
create policy media_items_admin on public.media_items for all
  using (public.kc_has_role(array['admin'])) with check (public.kc_has_role(array['admin']));

create or replace function public.kc_media_consent_trg() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(array_length(new.student_ids, 1), 0) = 0 then
    new.consent_ok := new.no_one_identifiable;
  else
    new.consent_ok := not exists (
      select 1 from unnest(new.student_ids) sid
      left join students s on s.id = sid
      where coalesce(s.media_restriction, '') <> 'Yes');
  end if;
  return new;
end $$;
drop trigger if exists kc_media_consent on public.media_items;
create trigger kc_media_consent before insert or update of student_ids, no_one_identifiable on public.media_items
  for each row execute function public.kc_media_consent_trg();

-- Check: three tables with rls_on = true
select relname, relrowsecurity::text as rls_on from pg_class
where relname in ('dropbox_auth', 'media_folders', 'media_items') order by relname;
