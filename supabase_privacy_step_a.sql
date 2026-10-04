-- ════════════════════════════════════════════════════════════════════════
-- PRIVACY STEP A  (run in one go; undo script: supabase_privacy_step_a_undo.sql)
--
-- Before: any logged-in user (incl. every athlete) could read ALL members
-- (phones, emails, dates of birth), students, attendance and holidays, and
-- anyone -- even not logged in -- could read the points log.
-- After:
--   • Staff (admin, captain/coach, leader): read everything, exactly as now.
--   • Athletes: read only their OWN member/student/attendance/points rows,
--     plus club-wide/class holidays. What they need about others (house
--     ranks, profile search) comes from the narrow functions below.
--   • Not logged in: league screen points via a narrow function only.
-- Writes are NOT changed in this step.
-- ════════════════════════════════════════════════════════════════════════

-- ── Helpers (SECURITY DEFINER so policies don't recurse into members) ──
create or replace function public.kc_is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from members
                 where auth_id = auth.uid() and role in ('admin','captain','coach','leader'))
$$;

create or replace function public.kc_my_member_ids()
returns setof uuid language sql stable security definer set search_path = public as $$
  select id from members where auth_id = auth.uid()
$$;

create or replace function public.kc_my_student_ids()
returns setof uuid language sql stable security definer set search_path = public as $$
  select s.id from students s join members m on m.id = s.member_id where m.auth_id = auth.uid()
$$;

-- ── members ──
drop policy if exists members_read on public.members;
create policy members_read_staff on public.members for select using (public.kc_is_staff());
create policy members_read_self  on public.members for select using (auth_id = auth.uid());

-- ── students ──
drop policy if exists students_read on public.students;
create policy students_read_staff on public.students for select using (public.kc_is_staff());
create policy students_read_self  on public.students for select using (member_id in (select public.kc_my_member_ids()));

-- ── attendance ──
drop policy if exists attendance_read on public.attendance;
create policy attendance_read_staff on public.attendance for select using (public.kc_is_staff());
create policy attendance_read_self  on public.attendance for select using (student_id in (select public.kc_my_student_ids()));

-- ── holidays (club-wide / class holidays stay visible to athletes for their own attendance %) ──
drop policy if exists holidays_read on public.holidays;
create policy holidays_read_staff  on public.holidays for select using (public.kc_is_staff());
create policy holidays_read_shared on public.holidays for select using (auth.uid() is not null and student_id is null);
create policy holidays_read_self   on public.holidays for select using (student_id in (select public.kc_my_student_ids()));

-- ── points_log ──
drop policy if exists points_log_public_read on public.points_log;
drop policy if exists points_read on public.points_log;
create policy points_read_staff on public.points_log for select using (public.kc_is_staff());
create policy points_read_self  on public.points_log for select using (student_id in (select public.kc_my_student_ids()));

-- ── Narrow functions the athlete app / public league screen use instead ──

-- House + overall ranks: per-athlete point totals and house, no names or contact details
create or replace function public.kc_athlete_rank_points()
returns table (student_id uuid, house_name text, is_kr boolean, is_pts boolean, discipline text, house_points int, total_points bigint)
language sql stable security definer set search_path = public as $$
  select s.id, coalesce(h.name, s.house_name), s.is_kr, s.is_pts, s.discipline, s.house_points,
         coalesce((select sum(p.points_awarded) from points_log p where p.student_id = s.id), 0)
  from students s join members m on m.id = s.member_id left join houses h on h.id = m.house_id
  where auth.uid() is not null and (s.is_kr or s.is_pts or s.discipline = 'KRBA')
$$;

-- "Find your profile" search for a newly signed-up athlete: name, birth year, grade and house only
create or replace function public.kc_search_athletes(q text)
returns table (id uuid, student_ref text, first_name text, last_name text, birth_year int,
               pka_belt text, krba_level text, discipline text, house_name text, member_id uuid)
language sql stable security definer set search_path = public as $$
  select s.id, s.student_ref, m.first_name, m.last_name, extract(year from m.date_of_birth)::int,
         s.pka_belt, s.krba_level, s.discipline, s.house_name, s.member_id
  from students s join members m on m.id = s.member_id
  where auth.uid() is not null and length(trim(q)) >= 2
    and (m.first_name ilike '%' || q || '%' or m.last_name ilike '%' || q || '%')
    and coalesce(m.status, 'active') not in ('stopped', 'not_started')
  limit 8
$$;

-- Public league screen: points only (no reasons or notes)
create or replace function public.kc_public_league_points(p_from timestamptz, p_to timestamptz)
returns table (student_id uuid, points_awarded int, point_scope text)
language sql stable security definer set search_path = public as $$
  select student_id, points_awarded, point_scope from points_log
  where awarded_at >= p_from and awarded_at <= p_to
$$;

revoke all on function public.kc_athlete_rank_points() from public, anon;
revoke all on function public.kc_search_athletes(text) from public, anon;
grant execute on function public.kc_athlete_rank_points() to authenticated;
grant execute on function public.kc_search_athletes(text) to authenticated;
grant execute on function public.kc_public_league_points(timestamptz, timestamptz) to anon, authenticated;
grant execute on function public.kc_is_staff(), public.kc_my_member_ids(), public.kc_my_student_ids() to anon, authenticated;
