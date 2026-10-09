-- LEAK TEST for Step B. Run after Step B AND after the coach has been set up in Settings -> Team.
-- Replace HEAD-COACH-AUTH-ID with his login id:
--   select auth_id, first_name, last_name, role, access from members where email ilike '%his-email%';
begin;
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub', 'HEAD-COACH-AUTH-ID', 'role', 'authenticated')::text, true);

  select 'classes he can take'          as check, count(*) as rows from kc_my_class_ids()                 -- expect his ticked classes (e.g. 2 Derby Moore + 4 KR + 2 Ladies)
  union all select 'students he can see',        count(*) from students                                   -- expect only students in those classes
  union all select 'students NOT in his classes', count(*) from students where id not in (select kc_my_coached_student_ids())   -- expect 0
  union all select 'members he can see',         count(*) from members                                    -- his students (+ himself)
  union all select 'attendance of others',       count(*) from attendance where student_id not in (select kc_my_coached_student_ids())  -- expect 0
  union all select 'points of others',           count(*) from points_log where student_id not in (select kc_my_coached_student_ids())  -- expect 0
  union all select 'enquiries visible',          count(*) from enquiries;                                 -- note this number (CRM comes in a later stage)
rollback;
