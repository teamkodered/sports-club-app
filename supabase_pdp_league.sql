-- League board: PDP board -- PDP actions ticked done + PDP tasks completed per athlete over a period
create or replace function public.public_pdp_league(p_from date, p_to date)
returns table (student_id uuid, display_name text, house_name text, done int)
language sql stable security definer set search_path = public as $$
  select p.student_id, trim(coalesce(m.first_name,'') || ' ' || coalesce(upper(left(m.last_name,1)) || '.','')), s.house_name,
         (count(*) filter (where p.point_type like 'PDP action done%' or p.point_type like 'PDP task completed%')
          - count(*) filter (where p.point_type like 'PDP action undone%'))::int
  from points_log p join students s on s.id = p.student_id join members m on m.id = s.member_id
  where (s.is_kr or s.discipline = 'KRBA')
    and (p.awarded_at at time zone 'Europe/London')::date between p_from and p_to
    and (p.point_type like 'PDP action%' or p.point_type like 'PDP task completed%')
  group by p.student_id, m.first_name, m.last_name, s.house_name
  having (count(*) filter (where p.point_type like 'PDP action done%' or p.point_type like 'PDP task completed%')
          - count(*) filter (where p.point_type like 'PDP action undone%')) > 0
$$;
grant execute on function public.public_pdp_league(date, date) to anon, authenticated;
