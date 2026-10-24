-- Fight finder: a competition's draws + schedule, our athletes' bouts, coaches and results.
-- Can be linked to an event (fixtures) or stand alone (ad-hoc). Admins edit; coaches can read.
create table if not exists public.fight_finders (
  id uuid primary key default gen_random_uuid(),
  fixture_id uuid references public.fixtures(id) on delete set null,
  title text not null,
  data jsonb not null default '{}'::jsonb,       -- { schedule: [...], draws: [...] } read from the PDFs / saved pages
  settings jsonb not null default '{}'::jsonb,   -- { query, window, coaches: [member ids], assign: {athleteKey: memberId}, results: {boutId: 'red'|'blue'} }
  created_by uuid references public.members(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.fight_finders enable row level security;
drop policy if exists fight_finders_admin on public.fight_finders;
create policy fight_finders_admin on public.fight_finders for all
  using (public.kc_has_role(array['admin'])) with check (public.kc_has_role(array['admin']));
drop policy if exists fight_finders_staff_read on public.fight_finders;
create policy fight_finders_staff_read on public.fight_finders for select using (public.kc_is_class_staff());
