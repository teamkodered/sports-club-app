-- Athlete Dashboard for limited coaches (Oct 2026): anyone given Athlete profiles access in
-- Settings -> Team (view or edit) can see the KR / KRBA athletes -- not only the students in
-- their own classes. 'edit' can also mark them in and give / change points; 'view' only reads.
-- Their own class limits still apply to everything else (Registers page, CRM, forms…).

-- their Athlete profiles access: 'edit' | 'view' | 'none' (admin = edit; access group first, then own setting)
create or replace function public.kc_athlete_access()
returns text language sql stable security definer set search_path = public as $$
  -- someone can have more than one member record (e.g. a 'member' one as an athlete + a 'head_coach' one):
  -- use the staff record first
  with me as (select role, access from members where auth_id = auth.uid()
              order by (role = 'admin') desc, (role in ('head_coach','captain','coach','leader')) desc limit 1),
  grp as (
    select g from settings s, me, jsonb_array_elements(case when jsonb_typeof(s.value::jsonb) = 'array' then s.value::jsonb else '[]'::jsonb end) g
    where s.key = 'access_groups' and g->>'id' = me.access->>'group'
  )
  select case
    when (select role from me) = 'admin' then 'edit'
    else coalesce((select g->'access'->'pages'->>'athletes' from grp limit 1), (select access->'pages'->>'athletes' from me), 'none')
  end
$$;

create or replace function public.kc_athlete_student_ids()
returns setof uuid language sql stable security definer set search_path = public as $$
  select id from students where is_kr or discipline = 'KRBA'
$$;
create or replace function public.kc_athlete_member_ids()
returns setof uuid language sql stable security definer set search_path = public as $$
  select member_id from students where is_kr or discipline = 'KRBA'
$$;

-- read
drop policy if exists students_read_athlete_access on public.students;
create policy students_read_athlete_access on public.students for select to authenticated
  using (public.kc_athlete_access() in ('view','edit') and id in (select public.kc_athlete_student_ids()));
drop policy if exists members_read_athlete_access on public.members;
create policy members_read_athlete_access on public.members for select to authenticated
  using (public.kc_athlete_access() in ('view','edit') and id in (select public.kc_athlete_member_ids()));
drop policy if exists attendance_read_athlete_access on public.attendance;
create policy attendance_read_athlete_access on public.attendance for select to authenticated
  using (public.kc_athlete_access() in ('view','edit') and student_id in (select public.kc_athlete_student_ids()));
drop policy if exists points_read_athlete_access on public.points_log;
create policy points_read_athlete_access on public.points_log for select to authenticated
  using (public.kc_athlete_access() in ('view','edit') and student_id in (select public.kc_athlete_student_ids()));
drop policy if exists sca_read_athlete_access on public.student_class_assignments;
create policy sca_read_athlete_access on public.student_class_assignments for select to authenticated
  using (public.kc_athlete_access() in ('view','edit') and student_id in (select public.kc_athlete_student_ids()));
drop policy if exists profiles_read_athlete_access on public.athlete_profiles;
create policy profiles_read_athlete_access on public.athlete_profiles for select to authenticated
  using (public.kc_athlete_access() in ('view','edit') and student_id in (select public.kc_athlete_student_ids()));
drop policy if exists f2f_read_athlete_access on public.fit2fight_sessions;
create policy f2f_read_athlete_access on public.fit2fight_sessions for select to authenticated
  using (public.kc_athlete_access() in ('view','edit') and student_id in (select public.kc_athlete_student_ids()));

-- take the athlete registers (edit only): attendance + points
drop policy if exists attendance_write_athlete_access on public.attendance;
create policy attendance_write_athlete_access on public.attendance for all to authenticated
  using (public.kc_athlete_access() = 'edit' and student_id in (select public.kc_athlete_student_ids()))
  with check (public.kc_athlete_access() = 'edit' and student_id in (select public.kc_athlete_student_ids()));
drop policy if exists points_write_athlete_access on public.points_log;
create policy points_write_athlete_access on public.points_log for all to authenticated
  using (public.kc_athlete_access() = 'edit' and student_id in (select public.kc_athlete_student_ids()))
  with check (public.kc_athlete_access() = 'edit' and student_id in (select public.kc_athlete_student_ids()));
