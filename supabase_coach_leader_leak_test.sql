-- LEAK TEST for a Coach or Leader login. Find their id:
--   select auth_id, first_name, last_name, role from members where role in ('captain','coach','leader');
-- Replace COACH-AUTH-ID below and run the whole block (read-only, rolled back).
begin;
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub', 'COACH-AUTH-ID', 'role', 'authenticated')::text, true);
  select 'classes ticked'               as check, count(*) as rows from kc_my_class_ids()
  union all select 'students visible',           count(*) from students
  union all select 'students NOT in their classes', count(*) from students where id not in (select kc_my_coached_student_ids())   -- expect 0
  union all select 'members visible',            count(*) from members
  union all select 'attendance of others',       count(*) from attendance where student_id not in (select kc_my_coached_student_ids())  -- expect 0
  union all select 'points of others',           count(*) from points_log where student_id not in (select kc_my_coached_student_ids())  -- expect 0
  union all select 'membership forms visible',   count(*) from membership_forms        -- expect 0 (unless their own)
  union all select 'enquiries visible',          count(*) from enquiries                -- expect 0
  union all select 'join forms visible',         count(*) from join_applications;       -- expect 0
rollback;
