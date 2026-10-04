-- UNDO for PRIVACY STEP A: puts the read rules back exactly as they were (2026-10-04 export).
drop policy if exists members_read_staff on public.members;
drop policy if exists members_read_self  on public.members;
create policy members_read on public.members for select using (auth.uid() is not null);

drop policy if exists students_read_staff on public.students;
drop policy if exists students_read_self  on public.students;
create policy students_read on public.students for select using (auth.uid() is not null);

drop policy if exists attendance_read_staff on public.attendance;
drop policy if exists attendance_read_self  on public.attendance;
create policy attendance_read on public.attendance for select using (auth.uid() is not null);

drop policy if exists holidays_read_staff  on public.holidays;
drop policy if exists holidays_read_shared on public.holidays;
drop policy if exists holidays_read_self   on public.holidays;
create policy holidays_read on public.holidays for select using (auth.uid() is not null);

drop policy if exists points_read_staff on public.points_log;
drop policy if exists points_read_self  on public.points_log;
create policy points_read on public.points_log for select using (auth.uid() is not null);
create policy points_log_public_read on public.points_log for select to anon, authenticated using (true);

-- The helper functions are harmless to leave; uncomment to remove them too:
-- drop function if exists public.kc_athlete_rank_points();
-- drop function if exists public.kc_search_athletes(text);
-- drop function if exists public.kc_public_league_points(timestamptz, timestamptz);
-- drop function if exists public.kc_is_staff();
-- drop function if exists public.kc_my_member_ids();
-- drop function if exists public.kc_my_student_ids();
