-- MOVE PAST 🏆 COMP AWARDS INTO COMP POINTS
-- Competition / Competition Place / Competition win / Test Fight / Test Fight Win awards made
-- before comp points existed were added to individual + house points. This moves them across:
-- takes them off individual / house points, adds them to comp points. Run STEP 1 first.

-- STEP 1 (read-only): what would move
select m.first_name, m.last_name, pl.awarded_at::date as day, pl.point_type, pl.points_awarded, pl.point_scope,
       h.name as house
from points_log pl
join students s on s.id = pl.student_id
join members m on m.id = s.member_id
left join houses h on h.id = m.house_id
where pl.point_type ~* '^(competition|test fight)' and pl.point_scope <> 'comp'
order by day, m.first_name;

