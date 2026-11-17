-- 🔗 ENQUIRY -> JOINED automatically: when someone joins (a new member record), any open enquiry with the
-- same phone number or email is linked to them and moved to Joined. Also fixes the ones already missed.
create or replace function public.kc_digits(p text) returns text language sql immutable as $$
  select right(regexp_replace(coalesce(p, ''), '\D', '', 'g'), 10)
$$;

create or replace function public.kc_enquiry_mark_joined(p_member uuid)
returns int language plpgsql security definer set search_path = public as $$
declare m record; n int;
begin
  select id, phone, email, created_at into m from members where id = p_member;
  if m is null then return 0; end if;
  update enquiries e set status = 'joined', linked_member_id = m.id, updated_at = now()
  where coalesce(e.status, '') <> 'joined'
    and e.linked_member_id is null
    and ((length(kc_digits(m.phone)) >= 9 and kc_digits(e.contact_phone) = kc_digits(m.phone))
      or (coalesce(m.email, '') <> '' and lower(trim(e.contact_email)) = lower(trim(m.email))));
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function public.kc_enquiry_joined_trg() returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.kc_enquiry_mark_joined(new.id);
  return null;
end $$;
drop trigger if exists kc_enquiry_joined on public.members;
create trigger kc_enquiry_joined after insert or update of phone, email on public.members
  for each row execute function public.kc_enquiry_joined_trg();

-- the ones already missed: members who joined on / after the enquiry date
with hit as (
  select distinct on (e.id) e.id as enquiry_id, m.id as member_id, m.first_name || ' ' || m.last_name as member, e.name as enquiry_name
  from enquiries e join members m
    on ((length(kc_digits(m.phone)) >= 9 and kc_digits(e.contact_phone) = kc_digits(m.phone))
     or (coalesce(m.email, '') <> '' and lower(trim(e.contact_email)) = lower(trim(m.email))))
  where coalesce(e.status, '') <> 'joined' and e.linked_member_id is null
    and (m.joined_date is null or e.enquiry_date is null or m.joined_date >= e.enquiry_date)
  order by e.id, m.created_at desc
)
update enquiries e set status = 'joined', linked_member_id = hit.member_id, updated_at = now()
from hit where e.id = hit.enquiry_id
returning hit.enquiry_name as enquiry, hit.member as joined_as;
