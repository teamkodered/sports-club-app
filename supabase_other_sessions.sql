-- "Other sessions" (Physical): training outside the club timetable -- from a wearable, or added by hand.
-- Recorded only (no points). The athlete sees their own; staff see all; a head coach sees his students'.
create table if not exists public.extra_sessions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  session_date date not null, activity text not null, minutes int, note text,
  created_at timestamptz not null default now()
);
alter table public.extra_sessions enable row level security;
drop policy if exists extra_own on public.extra_sessions;
create policy extra_own on public.extra_sessions for all
  using (student_id in (select public.kc_my_student_ids())) with check (student_id in (select public.kc_my_student_ids()));
drop policy if exists extra_staff on public.extra_sessions;
create policy extra_staff on public.extra_sessions for all using (public.kc_has_role(array['admin','captain','coach','leader']));
drop policy if exists extra_coach_read on public.extra_sessions;
create policy extra_coach_read on public.extra_sessions for select
  using (public.kc_is_head_coach() and student_id in (select public.kc_my_coached_student_ids()));

-- Wearable workouts: staff (registers' ⌚ hint, athlete profiles) and a head coach (his students) can read them.
-- Only adds the rules if they aren't there yet; the athlete's own access is unchanged.
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'wearable_workouts' and policyname = 'wearable_workouts_staff_read') then
    execute $p$create policy wearable_workouts_staff_read on public.wearable_workouts for select using (public.kc_has_role(array['admin','captain','coach','leader']))$p$;
  end if;
  if not exists (select 1 from pg_policies where tablename = 'wearable_workouts' and policyname = 'wearable_workouts_coach_read') then
    execute $p$create policy wearable_workouts_coach_read on public.wearable_workouts for select using (public.kc_is_head_coach() and student_id in (select public.kc_my_coached_student_ids()))$p$;
  end if;
end $$;
