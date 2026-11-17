-- 🏆 Club league (league-public): KR and KRBA athletes are ranked in the athlete league instead (anyone who
-- does KR or KRBA, even if they also do PTs). PTs-only students stay in the club league. Points still count
-- for houses.
create or replace function public.public_league_app_athletes()
returns table (student_id uuid) language sql stable security definer set search_path = public as $$
  select s.id from students s where s.is_kr is true or s.discipline = 'KRBA'
$$;
grant execute on function public.public_league_app_athletes() to anon, authenticated;
select count(*) as kr_and_krba_athletes from public.public_league_app_athletes();
