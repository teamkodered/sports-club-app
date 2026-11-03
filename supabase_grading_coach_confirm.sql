-- 🎽 GRADING: who confirmed it + coaches can check / confirm their own students' requests
alter table public.grading_expressions add column if not exists coach_approved_by text;
alter table public.grading_expressions add column if not exists coach_approved_at timestamptz;

-- head coaches: read + confirm requests from students in their classes (added to the existing rules)
drop policy if exists grading_head_coach_read on public.grading_expressions;
create policy grading_head_coach_read on public.grading_expressions for select
  using (student_id in (select public.kc_my_coached_student_ids()));
drop policy if exists grading_head_coach_confirm on public.grading_expressions;
create policy grading_head_coach_confirm on public.grading_expressions for update
  using (student_id in (select public.kc_my_coached_student_ids()))
  with check (student_id in (select public.kc_my_coached_student_ids()));
notify pgrst, 'reload schema';

select count(*) filter (where coach_approved) as confirmed, count(*) filter (where not coalesce(coach_approved, false)) as waiting
from grading_expressions;
