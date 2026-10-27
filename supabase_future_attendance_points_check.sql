-- Attendance / Full Kit points given for sessions that haven't happened yet (e.g. Harry and Keira)
select pl.id, m.first_name, m.last_name, pl.point_type, pl.points_awarded, pl.awarded_at::date as session_date,
       pl.applied_to_total, c.name as class_name
from points_log pl
join students s on s.id = pl.student_id
join members m on m.id = s.member_id
left join classes c on c.id = pl.class_id
where pl.point_type in ('Attendance', 'Full Kit')
  and pl.awarded_at::date > current_date
order by pl.awarded_at, m.first_name;
