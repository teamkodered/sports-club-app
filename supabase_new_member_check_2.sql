-- NEW MEMBER CHECK 2 (read-only): are any "pending" people actually training? + the 3 duplicates
select 'P pending but training' as section, trim(m.first_name || ' ' || m.last_name) as name,
       concat_ws(' · ', 'joined ' || coalesce(m.joined_date::text, 'EMPTY'),
                 count(a.id) || ' sessions', 'last ' || max(a.session_date),
                 string_agg(distinct s.discipline, '/')) as detail
from members m join students s on s.member_id = m.id
left join attendance a on a.student_id = s.id and a.attendance_type in ('attended', 'full_kit')
where m.status = 'pending'
group by m.id
having count(a.id) > 0
union all
select 'Q duplicate record', trim(m.first_name || ' ' || m.last_name),
       concat_ws(' · ', 'status ' || coalesce(m.status, '-'), 'joined ' || coalesce(m.joined_date::text, 'EMPTY'),
                 'created ' || m.created_at::date, coalesce(m.email, 'no email'),
                 (select count(*) from students s where s.member_id = m.id) || ' student',
                 (select count(*) from attendance a join students s on s.id = a.student_id where s.member_id = m.id) || ' attendance',
                 'id ' || m.id)
from members m
where (lower(trim(m.first_name)), lower(trim(m.last_name)), m.date_of_birth) in (
  select lower(trim(first_name)), lower(trim(last_name)), date_of_birth from members
  where date_of_birth is not null group by 1, 2, 3 having count(*) > 1)
union all
select 'R staff counted as new', trim(first_name || ' ' || last_name),
       concat_ws(' · ', 'role ' || role, 'status ' || status, coalesce(email, 'no email'), 'login ' || (auth_id is not null), 'id ' || id)
from members
where joined_date >= date_trunc('month', current_date) and not exists (select 1 from students s where s.member_id = members.id)
order by 1, 2;
