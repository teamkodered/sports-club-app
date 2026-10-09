-- Enquiries: allow "Sent to Derby Moore" / "Sent to Moorways" (only changes anything if a status check exists)
do $$
declare c record; had boolean := false;
begin
  for c in select conname from pg_constraint
           where conrelid = 'public.enquiries'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%status%'
  loop execute format('alter table public.enquiries drop constraint %I', c.conname); had := true; end loop;
  if had then
    alter table public.enquiries add constraint enquiries_status_check
      check (status in ('not_started','contacted','trial_booked','attended','joined','waiting_list','not_interested','sent_derby_moore','sent_moorways'));
  end if;
end $$;
