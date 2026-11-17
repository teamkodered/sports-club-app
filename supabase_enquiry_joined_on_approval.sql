-- 🔗 Enquiry -> Joined only once the member is APPROVED (status becomes 'active'), not when the joining
-- form is submitted. Staff adding someone straight in as active counts as approved too.
create or replace function public.kc_enquiry_joined_trg() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'active' and (tg_op = 'INSERT' or coalesce(old.status, '') <> 'active') then
    perform public.kc_enquiry_mark_joined(new.id);
  end if;
  return null;
end $$;
drop trigger if exists kc_enquiry_joined on public.members;
create trigger kc_enquiry_joined after insert or update of status on public.members
  for each row execute function public.kc_enquiry_joined_trg();

-- any enquiries already marked Joined for someone who is still waiting for approval go back to Contacted
update enquiries e set status = 'contacted', updated_at = now()
from members m
where e.linked_member_id = m.id and e.status = 'joined' and m.status in ('pending', 'not_started')
returning e.name as enquiry_moved_back, m.first_name || ' ' || m.last_name as member_still_pending;
