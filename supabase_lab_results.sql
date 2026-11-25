-- Lab / external testing results (DIS Personal Performance Day and other providers' reports / spreadsheets)
-- One row per measured value: test + metric (+ side L/R), with the provider's comparison averages.
create table if not exists public.lab_results (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  test_date date not null,
  provider text,
  test text not null,
  metric text not null,
  value numeric,
  unit text,
  side text,
  benchmarks jsonb,
  source text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists lab_results_student_idx on public.lab_results (student_id, test_date desc);
alter table public.lab_results enable row level security;

drop policy if exists lab_results_staff_all on public.lab_results;
create policy lab_results_staff_all on public.lab_results for all to authenticated
  using (public.kc_is_coach_staff()) with check (public.kc_is_coach_staff());

drop policy if exists lab_results_read_own on public.lab_results;
create policy lab_results_read_own on public.lab_results for select to authenticated
  using (exists (select 1 from public.students s join public.members m on m.id = s.member_id
                 where s.id = lab_results.student_id and m.auth_id = auth.uid()));

-- Report reading runs in the background (a 20-page PDF takes longer than a normal request allows):
-- the app adds a row here, the background reader fills in the result, the app checks back.
create table if not exists public.lab_imports (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'reading',
  result jsonb,
  error text,
  file_name text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
alter table public.lab_imports enable row level security;
drop policy if exists lab_imports_staff_all on public.lab_imports;
create policy lab_imports_staff_all on public.lab_imports for all to authenticated
  using (public.kc_is_coach_staff()) with check (public.kc_is_coach_staff());
