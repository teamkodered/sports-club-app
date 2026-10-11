-- UNDO parent view: removes the parent read rules and the new tables (invites, links, requests)
drop policy if exists students_read_parent on public.students;
drop policy if exists members_read_parent on public.members;
drop policy if exists attendance_read_parent on public.attendance;
drop policy if exists holidays_read_parent on public.holidays;
drop policy if exists points_read_parent on public.points_log;
drop policy if exists sca_read_parent on public.student_class_assignments;
drop policy if exists forms_read_parent on public.membership_forms;
drop function if exists public.kc_redeem_invite(text);
drop table if exists public.contact_update_requests;
drop table if exists public.absence_requests;
drop table if exists public.guardians;
drop table if exists public.app_invites;
