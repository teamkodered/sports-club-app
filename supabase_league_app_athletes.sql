-- 🏆 Club league (league-public): app athletes (KR / KRBA / PTs / 📱 app) are ranked in the athlete league
-- instead -- this tells the public league page who they are (ids only). Their points still count for houses.
create or replace function public.public_league_app_athletes()
returns table (student_id uuid) language sql stable security definer set search_path = public as $$
  select s.id from students s
  where s.is_kr is true or s.discipline = 'KRBA' or s.is_pts is true or coalesce(s.app_access, false)
$$;
grant execute on function public.public_league_app_athletes() to anon, authenticated;
select count(*) as app_athletes from public.public_league_app_athletes();
