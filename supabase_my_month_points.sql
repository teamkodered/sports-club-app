-- Athlete header: this calendar month's house points (worked out in the database)
create or replace function public.kc_my_month_points(p_student uuid)
returns int language sql stable security definer set search_path = public as $$
  select coalesce(sum(p.points_awarded), 0)::int from points_log p
  where p.student_id = p_student
    and p.point_scope in ('both', 'house')
    and p.awarded_at >= date_trunc('month', now() at time zone 'Europe/London') at time zone 'Europe/London'
    and (p_student in (select s.id from students s join members m on m.id = s.member_id where m.auth_id = auth.uid())
         or exists (select 1 from members where auth_id = auth.uid() and role in ('admin','head_coach','captain','coach','leader')))
$$;
grant execute on function public.kc_my_month_points(uuid) to authenticated;
