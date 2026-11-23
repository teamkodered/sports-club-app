-- 🏆 Coaches coach: every coach can see ALL the coaches in the nomination list (not just the ones in
-- their own classes). Names, role and photo only, for coaches.
create or replace function public.kc_awards_coach_list()
returns table (member_id uuid, name text, role text, photo_url text) language sql stable security definer set search_path = public as $$
  select m.id, trim(m.first_name || ' ' || m.last_name), m.role, (select s.photo_url from students s where s.member_id = m.id limit 1)
  from members m
  where (select public.kc_awards_coach())
    and coalesce(m.status, 'active') <> 'stopped' and m.first_name !~* '^(test|u)$'
    and (m.role in ('admin', 'captain', 'coach', 'head_coach')
      or exists (select 1 from students s where s.member_id = m.id and s.is_coach is true))
  order by 2
$$;
grant execute on function public.kc_awards_coach_list() to authenticated;
select count(*) as coaches from members m where coalesce(m.status, 'active') <> 'stopped' and (m.role in ('admin', 'captain', 'coach', 'head_coach') or exists (select 1 from students s where s.member_id = m.id and s.is_coach is true));
