-- ════════════════════════════════════════════════════════════════════════
-- COACH + LEADER: LIMITED TO THEIR TICKED CLASSES (like Head Coach, minus his venue extras)
--  • Admin: everything (only Admin is "full staff" now)
--  • Head Coach / Coach / Leader: students in their ticked classes -- names, photos, grades,
--    attendance, points, contact details; mark attendance, add/remove points, update those students
--  • Head Coach only, as before: his venue's join forms, membership forms, CRM, standing orders
--  • Athletes / parents: everything they do for themselves is unchanged
-- Undo: supabase_coach_leader_restriction_undo.sql
-- BEFORE RUNNING: tick classes for every Coach / Leader in Settings -> Team (or their group).
-- ════════════════════════════════════════════════════════════════════════

-- 1. Who's who
create or replace function public.kc_is_class_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from members where auth_id = auth.uid() and role in ('head_coach','captain','coach','leader'))
$$;
grant execute on function public.kc_is_class_staff() to authenticated;

-- "staff" (full access) now means Admin only
create or replace function public.kc_is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from members where auth_id = auth.uid() and role = 'admin')
$$;
create or replace function public.kc_is_any_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from members where auth_id = auth.uid() and role = 'admin')
$$;

-- classes a Head Coach / Coach / Leader may take (their own ticks, or their group's)
create or replace function public.kc_my_class_ids()
returns setof uuid language plpgsql stable security definer set search_path = public as $$
declare a jsonb; g jsonb;
begin
  select access into a from members where auth_id = auth.uid() and role in ('head_coach','captain','coach','leader') limit 1;
  if a is null then return; end if;
  if a ? 'group' then
    select x into g from settings s, jsonb_array_elements(s.value) x where s.key = 'access_groups' and x ->> 'id' = a ->> 'group' limit 1;
    if g is not null then a := g -> 'access'; end if;
  end if;
  return query select (jsonb_array_elements_text(coalesce(a -> 'registers' -> 'classes', '[]'::jsonb)))::uuid;
end $$;

-- membership documents: admin, head coach (his students), parent, the member -- not Coach / Leader
create or replace function public.kc_can_view_member_docs(p_member uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.kc_has_role(array['admin'])
    or (public.kc_is_head_coach() and p_member in (select public.kc_my_coached_member_ids()))
    or p_member in (select public.kc_my_child_full_member_ids())
    or p_member in (select id from members where auth_id = auth.uid())
$$;

-- points totals: admin for anyone; head coach / coach / leader for their own students
create or replace function public.adjust_student_points(p_student_id uuid, p_house_delta numeric, p_individual_delta numeric)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not (public.kc_is_staff() or (public.kc_is_class_staff() and p_student_id in (select public.kc_my_coached_student_ids()))) then return; end if;
  update students set house_points = coalesce(house_points, 0) + p_house_delta,
                      individual_points = coalesce(individual_points, 0) + p_individual_delta where id = p_student_id;
end $$;
create or replace function public.adjust_house_points(p_house_name text, p_delta numeric)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not (public.kc_is_staff() or public.kc_is_class_staff()) then return; end if;
  update houses set points = points + p_delta where name = p_house_name;
end $$;

-- 2. The "their students" rules (were Head-Coach-only) now cover Coach and Leader too
do $$
declare d record;
begin
  for d in select * from (values
    ('students','students_read_coach','select','id in (select public.kc_my_coached_student_ids())', null),
    ('members','members_read_coach','select','id in (select public.kc_my_coached_member_ids())', null),
    ('attendance','attendance_read_coach','select','student_id in (select public.kc_my_coached_student_ids())', null),
    ('points_log','points_read_coach','select','student_id in (select public.kc_my_coached_student_ids())', null),
    ('holidays','holidays_read_coach','select','student_id in (select public.kc_my_coached_student_ids())', null),
    ('student_class_assignments','sca_read_coach','select','class_id in (select public.kc_my_class_ids())', null),
    ('attendance','attendance_insert_coach','insert', null, 'student_id in (select public.kc_my_coached_student_ids()) and (class_id is null or class_id in (select public.kc_my_class_ids()))'),
    ('attendance','attendance_update_coach','update','student_id in (select public.kc_my_coached_student_ids())', null),
    ('attendance','attendance_delete_coach','delete','student_id in (select public.kc_my_coached_student_ids()) and (class_id is null or class_id in (select public.kc_my_class_ids()))', null),
    ('points_log','points_insert_coach','insert', null, 'student_id in (select public.kc_my_coached_student_ids())'),
    ('points_log','points_update_coach','update','student_id in (select public.kc_my_coached_student_ids())', null),
    ('points_log','points_delete_coach','delete','student_id in (select public.kc_my_coached_student_ids())', null),
    ('fit2fight_sessions','f2f_read_coach','select','student_id in (select public.kc_my_coached_student_ids())', null),
    ('fit2fight_sessions','f2f_insert_coach','insert', null, 'student_id in (select public.kc_my_coached_student_ids())'),
    ('students','students_update_class_staff','update','id in (select public.kc_my_coached_student_ids())', null),
    ('student_class_assignments','sca_insert_class_staff','insert', null, 'class_id in (select public.kc_my_class_ids())'),
    ('athlete_profiles','profiles_class_staff','all','student_id in (select public.kc_my_coached_student_ids())', null),
    ('athlete_notes_log','notes_class_staff','all','student_id in (select public.kc_my_coached_student_ids())', null)
  ) as t(tab, pol, cmd, using_rule, check_rule)
  loop
    if to_regclass('public.' || d.tab) is null then continue; end if;
    execute format('drop policy if exists %I on public.%I', d.pol, d.tab);
    if d.cmd = 'insert' then
      execute format('create policy %I on public.%I for insert with check (public.kc_is_class_staff() and %s)', d.pol, d.tab, d.check_rule);
    elsif d.cmd = 'all' then
      execute format('create policy %I on public.%I for all using (public.kc_is_class_staff() and %s) with check (public.kc_is_class_staff() and %s)', d.pol, d.tab, d.using_rule, d.using_rule);
    else
      execute format('create policy %I on public.%I for %s using (public.kc_is_class_staff() and %s)', d.pol, d.tab, d.cmd, d.using_rule);
    end if;
  end loop;
end $$;
-- wearable workouts + other sessions + invites: same widening
drop policy if exists wearable_workouts_coach_read on public.wearable_workouts;
create policy wearable_workouts_coach_read on public.wearable_workouts for select using (public.kc_is_class_staff() and student_id in (select public.kc_my_coached_student_ids()));
drop policy if exists wearable_workouts_staff_read on public.wearable_workouts;
create policy wearable_workouts_staff_read on public.wearable_workouts for select using (public.kc_has_role(array['admin']));
drop policy if exists extra_coach_read on public.extra_sessions;
create policy extra_coach_read on public.extra_sessions for select using (public.kc_is_class_staff() and student_id in (select public.kc_my_coached_student_ids()));
drop policy if exists extra_staff on public.extra_sessions;
create policy extra_staff on public.extra_sessions for all using (public.kc_has_role(array['admin']));
drop policy if exists invites_staff on public.app_invites;
create policy invites_staff on public.app_invites for all
  using (public.kc_has_role(array['admin']) or (public.kc_is_class_staff() and student_id in (select public.kc_my_coached_student_ids())))
  with check (public.kc_has_role(array['admin']) or (public.kc_is_class_staff() and student_id in (select public.kc_my_coached_student_ids())));

-- 3. The older "any staff" rules -> Admin only (own-record parts kept exactly)
drop policy if exists attendance_write on public.attendance;
create policy attendance_write on public.attendance for all using (public.kc_has_role(array['admin'])) with check (public.kc_has_role(array['admin']));
drop policy if exists attendance_insert on public.attendance;
create policy attendance_insert on public.attendance for insert
  with check (student_id in (select public.kc_my_student_ids()) or public.kc_has_role(array['admin']));
drop policy if exists points_write on public.points_log;
create policy points_write on public.points_log for all using (public.kc_has_role(array['admin'])) with check (public.kc_has_role(array['admin']));
drop policy if exists holidays_staff_write on public.holidays;
create policy holidays_staff_write on public.holidays for all using (public.kc_has_role(array['admin'])) with check (public.kc_has_role(array['admin']));
drop policy if exists students_write on public.students;
create policy students_write on public.students for all using (public.kc_has_role(array['admin'])) with check (public.kc_has_role(array['admin']));
drop policy if exists members_update_own on public.members;
create policy members_update_own on public.members for update using (auth_id = auth.uid() or public.kc_has_role(array['admin']));
drop policy if exists classes_write on public.classes;
create policy classes_write on public.classes for all using (public.kc_has_role(array['admin'])) with check (public.kc_has_role(array['admin']));
drop policy if exists houses_admin_write on public.houses;
create policy houses_admin_write on public.houses for all using (public.kc_has_role(array['admin'])) with check (public.kc_has_role(array['admin']));
drop policy if exists "Staff can manage assignments" on public.student_class_assignments;
create policy "Staff can manage assignments" on public.student_class_assignments for all using (public.kc_has_role(array['admin'])) with check (public.kc_has_role(array['admin']));
drop policy if exists "Staff can view all assignments" on public.student_class_assignments;
create policy "Staff can view all assignments" on public.student_class_assignments for select
  using (public.kc_has_role(array['admin']) or student_id in (select public.kc_my_student_ids()));
drop policy if exists "Staff can delete fit2fight sessions" on public.fit2fight_sessions;
create policy "Staff can delete fit2fight sessions" on public.fit2fight_sessions for delete using (public.kc_has_role(array['admin']));
drop policy if exists f2f_insert on public.fit2fight_sessions;
create policy f2f_insert on public.fit2fight_sessions for insert
  with check (student_id in (select public.kc_my_student_ids()) or public.kc_has_role(array['admin']));
drop policy if exists f2f_read on public.fit2fight_sessions;
create policy f2f_read on public.fit2fight_sessions for select
  using (student_id in (select public.kc_my_student_ids()) or public.kc_has_role(array['admin']));
drop policy if exists f2f_update on public.fit2fight_sessions;
create policy f2f_update on public.fit2fight_sessions for update
  using (student_id in (select public.kc_my_student_ids()) or public.kc_has_role(array['admin'])
         or (public.kc_is_class_staff() and student_id in (select public.kc_my_coached_student_ids()))
         or logged_by in (select public.kc_my_member_ids()));
drop policy if exists profiles_write on public.athlete_profiles;
create policy profiles_write on public.athlete_profiles for all
  using (student_id in (select public.kc_my_student_ids()) or public.kc_has_role(array['admin']))
  with check (student_id in (select public.kc_my_student_ids()) or public.kc_has_role(array['admin']));
drop policy if exists "Staff can manage notes" on public.athlete_notes_log;
create policy "Staff can manage notes" on public.athlete_notes_log for all using (public.kc_has_role(array['admin'])) with check (public.kc_has_role(array['admin']));
drop policy if exists "Staff can view all notes" on public.athlete_notes_log;
create policy "Staff can view all notes" on public.athlete_notes_log for select using (public.kc_has_role(array['admin']));
drop policy if exists forms_read on public.membership_forms;
create policy forms_read on public.membership_forms for select
  using (member_id in (select public.kc_my_member_ids()) or public.kc_has_role(array['admin']));
drop policy if exists forms_update on public.membership_forms;
create policy forms_update on public.membership_forms for update using (public.kc_has_role(array['admin'])) with check (public.kc_has_role(array['admin']));
