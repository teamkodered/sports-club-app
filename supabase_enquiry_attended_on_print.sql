-- 🖨️ ENQUIRY -> ATTENDED when their membership form is PRINTED (that's when they're in, signing it),
-- not when the online form comes in. Undoes the form-submitted trigger from earlier today.
create or replace function public.kc_enquiry_joined_trg() returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- approved -> Joined (unchanged)
  if new.status = 'active' and (tg_op = 'INSERT' or coalesce(old.status, '') <> 'active') then
    perform public.kc_enquiry_mark_joined(new.id);
  end if;
  return null;
end $$;

-- the app calls this when a membership form is printed
grant execute on function public.kc_enquiry_mark_attended(uuid) to authenticated;

-- Jo Eaton was moved to Attended by the earlier rule (form filled in) -- back to Trial booked until her form is printed
update enquiries set status = 'trial_booked', updated_at = now()
where name = 'Jo Eaton' and status = 'attended'
returning name, status;
