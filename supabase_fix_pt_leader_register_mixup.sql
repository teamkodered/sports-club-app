-- Clean-up: children marked in from the PTs / Leader Register by mistake (it wrongly listed
-- everyone at 6pm / 7pm). Run step 1 to preview, then step 2.

-- STEP 1 — PREVIEW (changes nothing)
-- a) wrong class assignments to the PTs / Leader Register classes
select 'assignment' as what, m.first_name, m.last_name, c.name as register
from student_class_assignments a
join classes c on c.id = a.class_id
join students s on s.id = a.student_id join members m on m.id = s.member_id
where (c.name ~* '\mpts?\M[^a-z]*register' and not coalesce(s.is_pts, false))
   or (c.name ~* 'leaders?\M[^a-z]*register' and not coalesce(s.is_leader, false))
union all
-- b) attendance saved against those registers for children who aren't PTs / Leaders
select 'attendance ' || at.session_date, m.first_name, m.last_name, c.name
from attendance at
join classes c on c.id = at.class_id
join students s on s.id = at.student_id join members m on m.id = s.member_id
where (c.name ~* '\mpts?\M[^a-z]*register' and not coalesce(s.is_pts, false))
   or (c.name ~* 'leaders?\M[^a-z]*register' and not coalesce(s.is_leader, false))
order by 1, 2;

-- STEP 2 — FIX (run after checking the preview)
-- a) remove the wrong assignments
delete from student_class_assignments a
using classes c, students s
where c.id = a.class_id and s.id = a.student_id
  and ((c.name ~* '\mpts?\M[^a-z]*register' and not coalesce(s.is_pts, false))
    or (c.name ~* 'leaders?\M[^a-z]*register' and not coalesce(s.is_leader, false)));

-- b) move their attendance to the normal class at the same day and time
--    (e.g. PTs Register Mon/Fri 18:00 -> KR Centre Mon/Fri 18:00), so it isn't lost
update attendance at
set class_id = normal.id
from classes reg, students s, classes normal
where reg.id = at.class_id and s.id = at.student_id
  and ((reg.name ~* '\mpts?\M[^a-z]*register' and not coalesce(s.is_pts, false))
    or (reg.name ~* 'leaders?\M[^a-z]*register' and not coalesce(s.is_leader, false)))
  and normal.day_of_week = reg.day_of_week and normal.start_time = reg.start_time
  and normal.active and normal.id <> reg.id
  and normal.name !~* 'register'
  and normal.name !~* 'derby moore|moorway';
