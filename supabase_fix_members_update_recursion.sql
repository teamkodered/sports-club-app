-- FIX: "infinite recursion detected in policy for relation members" when a login saves
-- its own record (e.g. accepting the user agreement).
-- The update rule on members looked up the members table from inside a members rule.
-- Same permissions as before, but the "is this staff?" checks now go through lookup
-- functions (which don't trigger other rules). The students write rule had the same
-- pattern, so it's fixed the same way.

create or replace function public.kc_has_role(p_roles text[])
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from members where auth_id = auth.uid() and role = any (p_roles))
$$;
grant execute on function public.kc_has_role(text[]) to authenticated;

-- members: save your own record; admin / captain / coach can save anyone's (as before)
drop policy if exists members_update_own on public.members;
create policy members_update_own on public.members for update
  using (auth_id = auth.uid() or public.kc_has_role(array['admin','captain','coach']));

-- students: admin / captain / leader can add, change and remove students (as before)
drop policy if exists students_write on public.students;
create policy students_write on public.students for all
  using (public.kc_has_role(array['admin','captain','leader']));

-- ── UNDO (only if needed): puts both rules back exactly as they were ──
-- drop policy if exists members_update_own on public.members;
-- create policy members_update_own on public.members for update using ((auth_id = auth.uid()) OR (EXISTS ( SELECT 1 FROM members m WHERE ((m.auth_id = auth.uid()) AND (m.role = ANY (ARRAY['admin'::text, 'captain'::text, 'coach'::text]))))));
-- drop policy if exists students_write on public.students;
-- create policy students_write on public.students for all using ((EXISTS ( SELECT 1 FROM members WHERE ((members.auth_id = auth.uid()) AND (members.role = ANY (ARRAY['admin'::text, 'captain'::text, 'leader'::text]))))));
