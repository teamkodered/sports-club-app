-- 🔗 ENQUIRY -> ATTENDED automatically: when a new member signs up (their joining form creates the member
-- record), an enquiry at "Trial booked" with the same phone / email moves to Attended and is linked to them.
-- (Joined still only happens when they're approved.)
create or replace function public.kc_enquiry_mark_attended(p_member uuid)
returns int language plpgsql security definer set search_path = public as $$
declare m record; n int;
begin
  select id, phone, email into m from members where id = p_member;
  if m is null then return 0; end if;
  update enquiries e set status = 'attended', linked_member_id = coalesce(e.linked_member_id, m.id), updated_at = now()
  where e.status = 'trial_booked' and (e.linked_member_id = m.id or (e.linked_member_id is null and (
        (length(kc_digits(m.phone)) >= 9 and kc_digits(e.contact_phone) = kc_digits(m.phone))
     or (coalesce(m.email, '') <> '' and lower(trim(e.contact_email)) = lower(trim(m.email))))));
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function public.kc_enquiry_joined_trg() returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- new member from a form (pending) -> their trial-booked enquiry becomes Attended
  if tg_op = 'INSERT' and coalesce(new.status, '') <> 'active' then perform public.kc_enquiry_mark_attended(new.id); end if;
  -- approved -> Joined
  if new.status = 'active' and (tg_op = 'INSERT' or coalesce(old.status, '') <> 'active') then
    perform public.kc_enquiry_mark_joined(new.id);
  end if;
  return null;
end $$;
drop trigger if exists kc_enquiry_joined on public.members;
create trigger kc_enquiry_joined after insert or update of status on public.members
  for each row execute function public.kc_enquiry_joined_trg();

-- ones already waiting: trial-booked enquiries whose person has already filled in a form (still pending)
select e.name as enquiry, m.first_name || ' ' || m.last_name as member, public.kc_enquiry_mark_attended(m.id) as moved
from enquiries e join members m on (
  (length(kc_digits(m.phone)) >= 9 and kc_digits(e.contact_phone) = kc_digits(m.phone))
  or (coalesce(m.email, '') <> '' and lower(trim(e.contact_email)) = lower(trim(m.email))))
where e.status = 'trial_booked' and m.status in ('pending', 'not_started');
