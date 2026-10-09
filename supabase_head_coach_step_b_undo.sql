-- UNDO Step B: removes head-coach access and restores the two adjust functions exactly as they were
drop policy if exists students_read_coach on public.students;
drop policy if exists members_read_coach on public.members;
drop policy if exists attendance_read_coach on public.attendance;
drop policy if exists points_read_coach on public.points_log;
drop policy if exists holidays_read_coach on public.holidays;
drop policy if exists sca_read_coach on public.student_class_assignments;
drop policy if exists attendance_insert_coach on public.attendance;
drop policy if exists attendance_update_coach on public.attendance;
drop policy if exists attendance_delete_coach on public.attendance;
drop policy if exists points_insert_coach on public.points_log;
drop policy if exists points_update_coach on public.points_log;
drop policy if exists points_delete_coach on public.points_log;

create or replace function public.adjust_house_points(p_house_name text, p_delta numeric)
 returns void language plpgsql security invoker as $function$
begin
  update houses set points = points + p_delta where name = p_house_name;
end;
$function$;

create or replace function public.adjust_student_points(p_student_id uuid, p_house_delta numeric, p_individual_delta numeric)
 returns void language sql security invoker as $function$
  update students
  set house_points = coalesce(house_points, 0) + p_house_delta,
      individual_points = coalesce(individual_points, 0) + p_individual_delta
  where id = p_student_id;
$function$;
drop function if exists public.kc_my_coached_member_ids();
-- (Anyone set to role 'head_coach' should be changed back to another role in Settings -> Team.)
