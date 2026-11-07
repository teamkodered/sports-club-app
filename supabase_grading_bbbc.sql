-- 🥋 Grading: admin note on a request (e.g. "Needs a BBBC course first") -- BBBC answers from the form
-- are saved with the request automatically.
alter table public.grading_expressions add column if not exists admin_note text;
notify pgrst, 'reload schema';

-- Danish, Alan and Mia: note on their 21/11/2026 grading requests (check the names it finds)
update grading_expressions g
set admin_note = 'Needs a Brown / Black Belt Course (BBBC) before grading -- 2 courses minimum'
from students s join members m on m.id = s.member_id
where g.student_id = s.id and g.grading_date = '2026-11-21'
  and ((m.first_name ilike 'danish%') or (m.first_name ilike 'alan%' and m.last_name ilike '%rychnov%') or m.first_name ilike 'mia')
returning m.first_name || ' ' || m.last_name as student, g.current_belt, g.grading_for, g.admin_note;
