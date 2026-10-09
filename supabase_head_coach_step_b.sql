-- ════════════════════════════════════════════════════════════════════════
-- STEP B: HEAD COACH ACCESS  (undo: supabase_head_coach_step_b_undo.sql)
--
-- A Head Coach (members.role = 'head_coach') only reaches the CLASSES they've
-- been given in Settings -> Team (members.access.registers.classes, or their
-- group's). From those classes the database works out "their" students:
--   • read those students, their member records (contact details) and
--     their attendance / points / holidays (incl. at other venues);
--   • take those classes' registers: mark attendance, award / remove points;
--   • nothing else -- no other students, members, attendance or points.
-- Global staff (admin, captain/coach, leader) are unchanged.
-- ════════════════════════════════════════════════════════════════════════

-- 1. Allow the new role (only if a role check exists)
do $$
declare c record; had boolean := false;
begin
  for c in select conname from pg_constraint
           where conrelid = 'public.members'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%role%'
  loop execute format('alter table public.members drop constraint %I', c.conname); had := true; end loop;
  if had then
    alter table public.members add constraint members_role_check
      check (role is null or role in ('member','leader','captain','coach','admin','head_coach'));
  end if;
end $$;

-- 2. Which classes this login may take (from its own access, or its group's)
create or replace function public.kc_my_class_ids()
returns setof uuid language plpgsql stable security definer set search_path = public as $$
declare a jsonb; g jsonb;
begin
  select access into a from members where auth_id = auth.uid() and role = 'head_coach' limit 1;
  if a is null then return; end if;
  if a ? 'group' then
    select x into g from settings s, jsonb_array_elements(s.value) x
      where s.key = 'access_groups' and x ->> 'id' = a ->> 'group' limit 1;
    if g is not null then a := g -> 'access'; end if;
  end if;
  return query select (jsonb_array_elements_text(coalesce(a -> 'registers' -> 'classes', '[]'::jsonb)))::uuid;
end $$;

-- 3. Students in those classes (everyone assigned to them)
create or replace function public.kc_my_coached_student_ids()
returns setof uuid language sql stable security definer set search_path = public as $$
  select distinct a.student_id from student_class_assignments a
  where a.class_id in (select public.kc_my_class_ids())
$$;

create or replace function public.kc_is_head_coach()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from members where auth_id = auth.uid() and role = 'head_coach')
$$;

-- 4. Read: their students, those students' members, attendance, points, holidays, class assignments
create policy students_read_coach on public.students for select
  using (public.kc_is_head_coach() and id in (select public.kc_my_coached_student_ids()));
create policy members_read_coach on public.members for select
  using (public.kc_is_head_coach() and id in (select member_id from students where id in (select public.kc_my_coached_student_ids())));
create policy attendance_read_coach on public.attendance for select
  using (public.kc_is_head_coach() and student_id in (select public.kc_my_coached_student_ids()));
create policy points_read_coach on public.points_log for select
  using (public.kc_is_head_coach() and student_id in (select public.kc_my_coached_student_ids()));
create policy holidays_read_coach on public.holidays for select
  using (public.kc_is_head_coach() and student_id in (select public.kc_my_coached_student_ids()));
create policy sca_read_coach on public.student_class_assignments for select
  using (public.kc_is_head_coach() and class_id in (select public.kc_my_class_ids()));

-- 5. Take their registers: attendance for their students (in their classes, or class not set),
--    points for their students
create policy attendance_insert_coach on public.attendance for insert
  with check (public.kc_is_head_coach() and student_id in (select public.kc_my_coached_student_ids())
              and (class_id is null or class_id in (select public.kc_my_class_ids())));
create policy attendance_update_coach on public.attendance for update
  using (public.kc_is_head_coach() and student_id in (select public.kc_my_coached_student_ids()));
create policy attendance_delete_coach on public.attendance for delete
  using (public.kc_is_head_coach() and student_id in (select public.kc_my_coached_student_ids())
         and (class_id is null or class_id in (select public.kc_my_class_ids())));
create policy points_insert_coach on public.points_log for insert
  with check (public.kc_is_head_coach() and student_id in (select public.kc_my_coached_student_ids()));
create policy points_update_coach on public.points_log for update
  using (public.kc_is_head_coach() and student_id in (select public.kc_my_coached_student_ids()));
create policy points_delete_coach on public.points_log for delete
  using (public.kc_is_head_coach() and student_id in (select public.kc_my_coached_student_ids()));

-- 6. Points totals: the two adjust functions now run with elevated rights but CHECK who's
--    calling -- staff for anyone, a head coach only for their own students. (Athletes and
--    anyone else: no effect, exactly as today.)
create or replace function public.adjust_student_points(p_student_id uuid, p_house_delta numeric, p_individual_delta numeric)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not (public.kc_is_staff() or (public.kc_is_head_coach() and p_student_id in (select public.kc_my_coached_student_ids()))) then
    return;
  end if;
  update students set house_points = coalesce(house_points, 0) + p_house_delta,
                      individual_points = coalesce(individual_points, 0) + p_individual_delta
  where id = p_student_id;
end $$;

create or replace function public.adjust_house_points(p_house_name text, p_delta numeric)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not (public.kc_is_staff() or public.kc_is_head_coach()) then return; end if;
  update houses set points = points + p_delta where name = p_house_name;
end $$;

grant execute on function public.kc_my_class_ids(), public.kc_my_coached_student_ids(), public.kc_is_head_coach() to authenticated;
