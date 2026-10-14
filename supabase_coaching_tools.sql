-- COACHING TOOLS library: documents, videos and links for coaches.
-- Admin adds / removes; Head Coaches, Coaches and Leaders can open them. Files are private
-- (bucket 'coaching-tools', opened through short-lived links).
create table if not exists public.coaching_tools (
  id uuid primary key default gen_random_uuid(),
  title text not null, description text, category text,
  kind text not null default 'doc' check (kind in ('doc','video','link')),
  file_path text,            -- in the private 'coaching-tools' store
  url text,                  -- for links (YouTube, Google Drive, websites…)
  created_by uuid references public.members(id),
  created_at timestamptz not null default now()
);
alter table public.coaching_tools enable row level security;
drop policy if exists coaching_tools_read on public.coaching_tools;
create policy coaching_tools_read on public.coaching_tools for select
  using (public.kc_has_role(array['admin']) or public.kc_is_class_staff());
drop policy if exists coaching_tools_admin on public.coaching_tools;
create policy coaching_tools_admin on public.coaching_tools for all
  using (public.kc_has_role(array['admin'])) with check (public.kc_has_role(array['admin']));

insert into storage.buckets (id, name, public) values ('coaching-tools', 'coaching-tools', false)
on conflict (id) do update set public = false;
drop policy if exists "coaching tools: read" on storage.objects;
create policy "coaching tools: read" on storage.objects for select to authenticated
  using (bucket_id = 'coaching-tools' and (public.kc_has_role(array['admin']) or public.kc_is_class_staff()));
drop policy if exists "coaching tools: admin upload" on storage.objects;
create policy "coaching tools: admin upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'coaching-tools' and public.kc_has_role(array['admin']));
drop policy if exists "coaching tools: admin remove" on storage.objects;
create policy "coaching tools: admin remove" on storage.objects for delete to authenticated
  using (bucket_id = 'coaching-tools' and public.kc_has_role(array['admin']));
