-- LEAK TEST for Privacy Step A. Run AFTER step A, in the Supabase SQL editor.
-- 1) Find the dummy athlete's login id:   select auth_id, first_name, last_name, role from members where email ilike '%dummy%';
-- 2) Paste it in place of 00000000-0000-0000-0000-000000000000 below and run the whole block.
--    It pretends to be that login (exactly what the app does) and counts what it can see.
begin;
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-000000000000', 'role', 'authenticated')::text, true);

  select 'members visible'        as check, count(*) as rows from members          -- expect 1 (themselves)
  union all select 'students visible',     count(*) from students                 -- expect 1 (themselves)
  union all select 'attendance visible (not theirs)', count(*) from attendance where student_id not in (select kc_my_student_ids())  -- expect 0
  union all select 'points visible (not theirs)',     count(*) from points_log where student_id not in (select kc_my_student_ids())  -- expect 0
  union all select 'personal holidays (not theirs)',  count(*) from holidays where student_id is not null and student_id not in (select kc_my_student_ids())  -- expect 0
  union all select 'rank rows (no names)',  count(*) from kc_athlete_rank_points();  -- expect the number of KR/KRBA/PT athletes (this is fine)
rollback;
-- Run the same block with a STAFF login's auth_id: members/students should show the full counts.
