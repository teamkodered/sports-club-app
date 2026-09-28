-- Wearable suggestions (Whoop etc.): remembers which "From Whoop" suggestions an
-- athlete (or their coach) dismissed, so they don't come back on any device.
-- Adding a suggestion never uses this table -- the saved entry itself carries
-- the wearable id, which is what stops it being suggested twice.
create table if not exists public.wearable_suggestion_dismissals (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  suggestion_key text not null,
  dismissed_by uuid default auth.uid(),
  dismissed_at timestamptz not null default now(),
  unique (student_id, suggestion_key)
);

alter table public.wearable_suggestion_dismissals enable row level security;

-- Same people who can see a student's wearable data (the athlete + staff)
drop policy if exists wearable_suggestion_dismissals_read on public.wearable_suggestion_dismissals;
create policy wearable_suggestion_dismissals_read on public.wearable_suggestion_dismissals for select
  using (public.can_view_student_wearables(student_id));

drop policy if exists wearable_suggestion_dismissals_insert on public.wearable_suggestion_dismissals;
create policy wearable_suggestion_dismissals_insert on public.wearable_suggestion_dismissals for insert
  with check (public.can_view_student_wearables(student_id));

drop policy if exists wearable_suggestion_dismissals_delete on public.wearable_suggestion_dismissals;
create policy wearable_suggestion_dismissals_delete on public.wearable_suggestion_dismissals for delete
  using (public.can_view_student_wearables(student_id));
