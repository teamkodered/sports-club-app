-- Claim links: tell the page whether a profile already has a login (yes/no only), so it sends
-- people to sign in instead of letting them create a second login that can never be linked.
create or replace function public.kc_student_has_login(p_student uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from students s join members m on m.id = s.member_id where s.id = p_student and m.auth_id is not null)
$$;
grant execute on function public.kc_student_has_login(uuid) to anon, authenticated;
