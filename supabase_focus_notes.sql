-- Dashboard "Current focus": every focus note kept; the newest is the current one
create table if not exists public.focus_notes (
  id uuid primary key default gen_random_uuid(),
  body text not null,
  created_by uuid references public.members(id),
  created_at timestamptz not null default now()
);
alter table public.focus_notes enable row level security;
drop policy if exists focus_notes_read on public.focus_notes;
create policy focus_notes_read on public.focus_notes for select
  using (public.kc_has_role(array['admin','captain','coach','leader','head_coach']));
drop policy if exists focus_notes_write on public.focus_notes;
create policy focus_notes_write on public.focus_notes for insert
  with check (public.kc_has_role(array['admin','captain','coach','leader']));
drop policy if exists focus_notes_delete on public.focus_notes;
create policy focus_notes_delete on public.focus_notes for delete
  using (public.kc_has_role(array['admin']));
