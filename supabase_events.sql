-- Fixtures -> events (competitions, gradings, shows…) shown as a strip on the Calendar,
-- with the athletes entered for each one.
alter table public.fixtures add column if not exists title text;
alter table public.fixtures add column if not exists end_date date;
alter table public.fixtures add column if not exists notes text;
alter table public.fixtures alter column home_house_id drop not null;
alter table public.fixtures alter column away_house_id drop not null;

create table if not exists public.fixture_athletes (
  fixture_id uuid not null references public.fixtures(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (fixture_id, student_id)
);
alter table public.fixture_athletes enable row level security;
drop policy if exists fixture_athletes_read on public.fixture_athletes;
create policy fixture_athletes_read on public.fixture_athletes for select
  using (public.kc_has_role(array['admin']) or public.kc_is_class_staff() or student_id in (select public.kc_my_student_ids()));
drop policy if exists fixture_athletes_admin on public.fixture_athletes;
create policy fixture_athletes_admin on public.fixture_athletes for all
  using (public.kc_has_role(array['admin'])) with check (public.kc_has_role(array['admin']));
