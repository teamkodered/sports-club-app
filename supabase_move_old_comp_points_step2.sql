-- STEP 2: move past comp awards into comp points (one batch -- all or nothing)
begin;
create temp table mv on commit drop as
  select pl.id, pl.student_id, pl.points_awarded, pl.point_scope, coalesce(h.name, s.house_name) as house
  from points_log pl join students s on s.id = pl.student_id join members m on m.id = s.member_id
  left join houses h on h.id = m.house_id
  where pl.point_type ~* '^(competition|test fight)' and pl.point_scope <> 'comp';
update students s set
  individual_points = coalesce(individual_points, 0) - x.ind,
  house_points      = coalesce(house_points, 0)      - x.hse,
  comp_points       = coalesce(comp_points, 0)       + x.allpts
from (select student_id,
             sum(points_awarded) filter (where point_scope in ('individual', 'both')) as ind,
             sum(points_awarded) filter (where point_scope in ('house', 'both'))      as hse,
             sum(points_awarded) as allpts
      from mv group by student_id) x
where s.id = x.student_id;
update houses h set points = points - x.pts
from (select house, sum(points_awarded) as pts from mv where point_scope in ('house', 'both') and house is not null group by house) x
where h.name = x.house;
update points_log set point_scope = 'comp' where id in (select id from mv);
select count(*) as moved from points_log where point_type ~* '^(competition|test fight)' and point_scope = 'comp';
commit;
