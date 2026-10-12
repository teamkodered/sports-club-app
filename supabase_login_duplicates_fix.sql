-- ════════════════════════════════════════════════════════════════════════
-- LOGIN DUPLICATES: fix Liam Whittaker + Olivia Major, and stop new duplicates
-- ════════════════════════════════════════════════════════════════════════

-- 1. LIAM WHITTAKER: move his login from the empty record made today (d03dde57…) onto his original
--    record (3cfbfb19… -- Head Coach, with his student history), then remove the empty one.
begin;
  update members set auth_id = (select auth_id from members where id::text like 'd03dde57%')
  where id::text like '3cfbfb19%';
  update members set auth_id = null where id::text like 'd03dde57%';
  delete from members m where m.id::text like 'd03dde57%'
    and not exists (select 1 from students s where s.member_id = m.id);
commit;

-- 2. OLIVIA MAJOR: remove the empty 'pending' record (3c93bc52…, no student) -- her real one stays.
delete from members m where m.id::text like '3c93bc52%'
  and m.auth_id is null and not exists (select 1 from students s where s.member_id = m.id);

-- 3. STOP NEW DUPLICATES: when a new login's record is being created (e.g. coach sign-up) and the
--    person ALREADY has a record with the same email AND first name and no login, attach the login
--    to that existing record instead of creating a second one (a 'member' becomes a 'leader' when it
--    came from the coach sign-up, which requires the coach access code).
create or replace function public.kc_trg_member_no_duplicate()
returns trigger language plpgsql security definer set search_path = public as $$
declare existing uuid;
begin
  if new.auth_id is null or new.email is null then return new; end if;
  select id into existing from members
   where lower(email) = lower(new.email) and auth_id is null
     and lower(trim(first_name)) = lower(trim(coalesce(new.first_name, '')))
   limit 1;
  if existing is null then return new; end if;
  update members set auth_id = new.auth_id,
         phone = coalesce(phone, new.phone),
         role = case when coalesce(role, 'member') = 'member' and new.role in ('leader') then new.role else role end
   where id = existing;
  return null;   -- don't create the duplicate
end $$;
drop trigger if exists kc_member_no_duplicate on public.members;
create trigger kc_member_no_duplicate before insert on public.members
  for each row execute function public.kc_trg_member_no_duplicate();

-- Check: Liam should now have ONE record, with has_login = true and role head_coach
select first_name, last_name, role, auth_id is not null as has_login,
       (select count(*) from students s where s.member_id = m.id) as student_records
from members m where lower(email) = 'liamwhittaker36@googlemail.com';
