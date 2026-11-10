-- Remove every "Weekly consistency" bonus (+5) and take the points back off the students and their houses.
begin;
create temp table kc_wc on commit drop as
select p.id, p.student_id, p.points_awarded, p.point_scope, coalesce(h.name, s.house_name) as house
from points_log p join students s on s.id = p.student_id join members m on m.id = s.member_id left join houses h on h.id = m.house_id
where p.point_type like 'Weekly consistency%';

update students s set
  individual_points = coalesce(s.individual_points, 0) - d.ind,
  house_points = coalesce(s.house_points, 0) - d.hse
from (select student_id, sum(points_awarded) filter (where point_scope in ('both', 'individual')) as ind,
             sum(points_awarded) filter (where point_scope in ('both', 'house')) as hse
      from kc_wc group by student_id) d
where s.id = d.student_id;

update houses h set points = coalesce(h.points, 0) - d.pts
from (select house, sum(points_awarded) as pts from kc_wc where point_scope in ('both', 'house') and house is not null group by house) d
where h.name = d.house;

delete from points_log where id in (select id from kc_wc);

select count(*) as bonuses_removed, coalesce(sum(points_awarded), 0) as points_taken_back, count(distinct student_id) as students from kc_wc;
commit;
