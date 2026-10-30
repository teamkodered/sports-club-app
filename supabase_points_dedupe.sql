-- 2) CLEAN-UP of points awarded twice on the same day (athlete app awards).
-- Keeps the FIRST of each per athlete per day; for 'F2F question logged' it keeps one more for every
-- 'F2F question cleared' that day (log -> clear -> log is allowed). Points come back off the athlete + house.

-- 2a) PREVIEW (read-only): who would lose how many points
with r as (
  select p.id, p.student_id, p.point_type, p.points_awarded, p.awarded_at,
         (p.awarded_at at time zone 'Europe/London')::date as day,
         row_number() over (partition by p.student_id, p.point_type, (p.awarded_at at time zone 'Europe/London')::date order by p.awarded_at, p.id) as n
  from points_log p
  where p.point_type ~ '^(Self check-in \(app\)|Self check-out \(app\)|Weigh in|Weigh out|F2F question logged|PDP added to calendar|Weekly target hit)'
), cleared as (
  select student_id, (awarded_at at time zone 'Europe/London')::date as day, replace(point_type, 'F2F question cleared', 'F2F question logged') as point_type, count(*) as c
  from points_log where point_type like 'F2F question cleared%' group by 1, 2, 3
), extra as (
  select r.* from r left join cleared c on c.student_id = r.student_id and c.day = r.day and c.point_type = r.point_type
  where r.n > 1 + coalesce(c.c, 0)
)
select m.first_name, m.last_name, count(*) as duplicate_awards, sum(e.points_awarded) as points_to_remove
from extra e join students s on s.id = e.student_id join members m on m.id = s.member_id
group by m.first_name, m.last_name order by points_to_remove desc;

-- 2b) CLEAN-UP (run after checking the preview): removes those duplicates and adjusts the totals
begin;
create temp table kc_dupes on commit drop as
with r as (
  select p.id, p.student_id, p.point_type, p.points_awarded, p.awarded_at,
         (p.awarded_at at time zone 'Europe/London')::date as day,
         row_number() over (partition by p.student_id, p.point_type, (p.awarded_at at time zone 'Europe/London')::date order by p.awarded_at, p.id) as n
  from points_log p
  where p.point_type ~ '^(Self check-in \(app\)|Self check-out \(app\)|Weigh in|Weigh out|F2F question logged|PDP added to calendar|Weekly target hit)'
), cleared as (
  select student_id, (awarded_at at time zone 'Europe/London')::date as day, replace(point_type, 'F2F question cleared', 'F2F question logged') as point_type, count(*) as c
  from points_log where point_type like 'F2F question cleared%' group by 1, 2, 3
)
select r.id, r.student_id, r.points_awarded from r left join cleared c on c.student_id = r.student_id and c.day = r.day and c.point_type = r.point_type
where r.n > 1 + coalesce(c.c, 0);

-- take the points back off each athlete and their house
update students s set house_points = coalesce(s.house_points, 0) - d.pts, individual_points = coalesce(s.individual_points, 0) - d.pts
from (select student_id, sum(points_awarded) as pts from kc_dupes group by student_id) d where s.id = d.student_id;
update houses h set points = coalesce(h.points, 0) - d.pts
from (select coalesce(hh.name, st.house_name) as house, sum(k.points_awarded) as pts
      from kc_dupes k join students st on st.id = k.student_id join members m on m.id = st.member_id left join houses hh on hh.id = m.house_id
      group by 1) d where h.name = d.house;
delete from points_log where id in (select id from kc_dupes);
commit;
