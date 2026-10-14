-- Live heart rate (Oct 2026)
--  live_hr     : one row per athlete while they're recording (bpm pushed every few
--                seconds from their phone); removed when they stop / check out.
--  hr_sessions : one summary per checked-in session (minutes, avg / max bpm, % of
--                max, zones) -- feeds the League board heart rate boards.
create table if not exists public.live_hr (
  student_id uuid primary key references public.students(id) on delete cascade,
  bpm int, max_hr int, class_id uuid, device text,
  session_started_at timestamptz, updated_at timestamptz not null default now()
);
create table if not exists public.hr_sessions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  session_date date not null, class_id uuid, attendance_id uuid,
  minutes int, avg_hr int, max_hr int, avg_pct int, max_pct int, zones jsonb, device text,
  created_at timestamptz not null default now()
);
create index if not exists hr_sessions_date_idx on public.hr_sessions (session_date);

alter table public.live_hr enable row level security;
alter table public.hr_sessions enable row level security;

-- the athlete's own rows (their student record is linked to their login)
create or replace function public.kc_my_student_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select s.id from students s join members m on m.id = s.member_id where m.auth_id = auth.uid()
$$;
create or replace function public.kc_is_coach_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from members where auth_id = auth.uid() and role in ('admin','head_coach','captain','coach','leader'))
$$;

drop policy if exists live_hr_own on public.live_hr;
create policy live_hr_own on public.live_hr for all to authenticated
  using (student_id in (select public.kc_my_student_ids())) with check (student_id in (select public.kc_my_student_ids()));
drop policy if exists live_hr_staff_read on public.live_hr;
create policy live_hr_staff_read on public.live_hr for select to authenticated using (public.kc_is_coach_staff());

drop policy if exists hr_sessions_own on public.hr_sessions;
create policy hr_sessions_own on public.hr_sessions for all to authenticated
  using (student_id in (select public.kc_my_student_ids())) with check (student_id in (select public.kc_my_student_ids()));
drop policy if exists hr_sessions_staff on public.hr_sessions;
create policy hr_sessions_staff on public.hr_sessions for all to authenticated using (public.kc_is_coach_staff()) with check (public.kc_is_coach_staff());

-- League board / athletes: live table without login, first name + last initial only,
-- just the athletes recording right now (updated in the last 30 seconds)
create or replace function public.public_live_hr()
returns table (student_id uuid, display_name text, house_name text, bpm int, max_hr int, pct int, minutes int, device text)
language sql stable security definer set search_path = public as $$
  select l.student_id, trim(coalesce(m.first_name,'') || ' ' || coalesce(upper(left(m.last_name,1)) || '.','')), s.house_name,
         l.bpm, l.max_hr, case when l.max_hr > 0 then round(l.bpm * 100.0 / l.max_hr)::int end,
         coalesce(extract(epoch from (now() - l.session_started_at))::int / 60, 0), l.device
  from live_hr l join students s on s.id = l.student_id join members m on m.id = s.member_id
  where l.updated_at > now() - interval '30 seconds' and l.bpm is not null
$$;
grant execute on function public.public_live_hr() to anon, authenticated;

-- League board: heart rate per checked-in session over a period (best session per athlete)
create or replace function public.public_hr_sessions(p_from date, p_to date)
returns table (student_id uuid, display_name text, house_name text, sessions bigint, best_avg int, best_max int, best_avg_pct int, best_max_pct int)
language sql stable security definer set search_path = public as $$
  select h.student_id, trim(coalesce(m.first_name,'') || ' ' || coalesce(upper(left(m.last_name,1)) || '.','')), s.house_name,
         count(*), max(h.avg_hr), max(h.max_hr), max(h.avg_pct), max(h.max_pct)
  from hr_sessions h join students s on s.id = h.student_id join members m on m.id = s.member_id
  where h.session_date between p_from and p_to
  group by h.student_id, m.first_name, m.last_name, s.house_name
$$;
grant execute on function public.public_hr_sessions(date, date) to anon, authenticated;
