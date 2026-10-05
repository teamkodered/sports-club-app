-- How far each athlete's stored totals differ from their points history (biggest first).
-- Read-only. Shows the effect of the blocked athlete-app log entries.
select m.first_name, m.last_name, s.individual_points as stored_total,
       coalesce(sum(p.points_awarded), 0) as history_total,
       s.individual_points - coalesce(sum(p.points_awarded), 0) as difference
from students s join members m on m.id = s.member_id
left join points_log p on p.student_id = s.id
group by m.first_name, m.last_name, s.individual_points
having s.individual_points <> coalesce(sum(p.points_awarded), 0)
order by abs(s.individual_points - coalesce(sum(p.points_awarded), 0)) desc
limit 50;

-- And the current definitions of the two total-adjusting functions (so they can be locked to staff safely):
select p.proname, pg_get_functiondef(p.oid) from pg_proc p
where p.proname in ('adjust_student_points', 'adjust_house_points');
