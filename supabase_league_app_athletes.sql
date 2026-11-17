-- 🏆 Club league (league-public): KR / KRBA athletes who have an app LOGIN are ranked in the athlete league
-- instead. Without a login they can't use the app, so they stay in the club league. Points still count for houses.
create or replace function public.public_league_app_athletes()
returns table (student_id uuid) language sql stable security definer set search_path = public as $$
  select s.id from students s join members m on m.id = s.member_id
  where (s.is_kr is true or s.discipline = 'KRBA') and m.auth_id is not null
$$;
grant execute on function public.public_league_app_athletes() to anon, authenticated;
select count(*) as athletes_in_athlete_league from public.public_league_app_athletes();
