-- NEW MEMBER CHECK -- one list of everything that could make the "New members this month"
-- number wrong, or a student who's been missed. Read-only: changes nothing.
with mon as (select date_trunc('month', current_date)::date as m0, (date_trunc('month', current_date) + interval '1 month')::date as m1),
mem as (
  select m.*, exists (select 1 from students s where s.member_id = m.id) as has_student,
         (select string_agg(distinct f.form_type, ', ') from membership_forms f where f.member_id = m.id) as forms
  from members m
)
-- A) everyone the tracker counts as new this month (joined_date in this month)
select 'A counted as new this month' as section, trim(first_name || ' ' || last_name) as name,
       concat_ws(' · ', 'joined ' || joined_date, 'status ' || coalesce(status, '-'), 'role ' || coalesce(role, '-'),
                 case when has_student then 'has student' else 'NO STUDENT RECORD' end,
                 coalesce('form: ' || forms, 'no membership form')) as detail
from mem, mon where joined_date >= m0 and joined_date < m1
union all
-- B) added this month but NOT counted (no joined_date, or joined_date set to an older date e.g. paper forms)
select 'B added this month, not counted', trim(first_name || ' ' || last_name),
       concat_ws(' · ', 'created ' || created_at::date, 'joined_date ' || coalesce(joined_date::text, 'EMPTY'), 'status ' || coalesce(status, '-'),
                 case when has_student then 'has student' else 'no student' end)
from mem, mon where created_at >= m0 and created_at < m1 and (joined_date is null or joined_date < m0 or joined_date >= m1)
union all
-- C) join forms that never became a member (failed / stuck) -- possible missed students
select 'C join form not completed', coalesce(applicant_name, '?'),
       concat_ws(' · ', form_type, 'sent ' || created_at::date, 'status ' || status, 'error: ' || error)
from join_applications where status in ('received', 'failed')
union all
-- D) membership forms this month whose member isn't counted / has no student
select 'D form this month, member issue', trim(coalesce(f.first_name, '') || ' ' || coalesce(f.last_name, '')),
       concat_ws(' · ', f.form_type, 'form ' || f.submitted_at::date,
                 case when m.id is null then 'NO MEMBER' else 'member joined ' || coalesce(m.joined_date::text, 'EMPTY') end,
                 case when m.id is not null and not m.has_student then 'NO STUDENT RECORD' end)
from membership_forms f cross join mon left join mem m on m.id = f.member_id
where f.submitted_at >= m0 and f.submitted_at < m1
  and (m.id is null or not m.has_student or m.joined_date is null or m.joined_date < m0 or m.joined_date >= m1)
union all
-- E) still pending (never approved) -- counted as new but not really members yet?
select 'E pending (not approved)', trim(first_name || ' ' || last_name),
       concat_ws(' · ', 'joined ' || coalesce(joined_date::text, 'EMPTY'), 'created ' || created_at::date)
from mem where status = 'pending'
union all
-- F) possible duplicates (same name + date of birth)
select 'F possible duplicate', trim(first_name || ' ' || last_name),
       concat_ws(' · ', count(*) || ' records', 'born ' || date_of_birth, string_agg(coalesce(status, '-'), '/'))
from members where date_of_birth is not null
group by lower(trim(first_name)), lower(trim(last_name)), date_of_birth, trim(first_name || ' ' || last_name)
having count(*) > 1
order by 1, 2;
