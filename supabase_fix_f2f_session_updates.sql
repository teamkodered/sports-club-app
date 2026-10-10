-- FIX: athletes (and coaches/leaders) couldn't add to a Fit II Fight session for the day
-- unless they had started it themselves ("logged_by") -- later test results, F2F questions,
-- stretches, wellbeing etc. on the same day were blocked (some screens failed silently).
-- Uses the lookup functions from the privacy steps (no recursion).

drop policy if exists f2f_update on public.fit2fight_sessions;
create policy f2f_update on public.fit2fight_sessions for update
  using (
    student_id in (select public.kc_my_student_ids())                               -- the athlete's own sessions
    or public.kc_has_role(array['admin','captain','coach','leader'])                 -- staff
    or (public.kc_is_head_coach() and student_id in (select public.kc_my_coached_student_ids()))  -- head coach: his students
    or logged_by in (select public.kc_my_member_ids())                              -- whoever logged it (as before)
  );

-- Head Coach: read and add sessions for his own students (not covered by Step B)
drop policy if exists f2f_read_coach on public.fit2fight_sessions;
create policy f2f_read_coach on public.fit2fight_sessions for select
  using (public.kc_is_head_coach() and student_id in (select public.kc_my_coached_student_ids()));
drop policy if exists f2f_insert_coach on public.fit2fight_sessions;
create policy f2f_insert_coach on public.fit2fight_sessions for insert
  with check (public.kc_is_head_coach() and student_id in (select public.kc_my_coached_student_ids()));

-- ── UNDO (only if needed): the update rule exactly as it was ──
-- drop policy if exists f2f_update on public.fit2fight_sessions;
-- create policy f2f_update on public.fit2fight_sessions for update using ((logged_by = ( SELECT members.id FROM members WHERE (members.auth_id = auth.uid()))) OR (EXISTS ( SELECT 1 FROM members WHERE ((members.auth_id = auth.uid()) AND (members.role = ANY (ARRAY['admin'::text, 'captain'::text]))))));
-- drop policy if exists f2f_read_coach on public.fit2fight_sessions;
-- drop policy if exists f2f_insert_coach on public.fit2fight_sessions;
