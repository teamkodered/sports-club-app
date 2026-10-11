-- ════════════════════════════════════════════════════════════════════════
-- HEAD COACH CRM: enquiries per venue   (undo at the bottom, commented out)
--  • enquiries.venue: 'kr-centre' | 'derby-moore' | 'moorways' (blank = KR Centre)
--  • "Sent to Derby Moore / Moorways" hands the enquiry to that venue
--  • a head coach sees / works only his venue's enquiries; new ones he adds get his venue
-- Needs Step B and the venues SQL (kc_is_head_coach, kc_my_venues).
-- ════════════════════════════════════════════════════════════════════════
alter table public.enquiries add column if not exists venue text;

create or replace function public.kc_trg_enquiry_venue()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- handed on to another venue
  if new.status = 'sent_derby_moore' and (tg_op = 'INSERT' or old.status is distinct from new.status) then new.venue := 'derby-moore'; end if;
  if new.status = 'sent_moorways'    and (tg_op = 'INSERT' or old.status is distinct from new.status) then new.venue := 'moorways'; end if;
  -- added by a head coach: his venue
  if tg_op = 'INSERT' and new.venue is null and public.kc_is_head_coach() then
    new.venue := (select v from public.kc_my_venues() v limit 1);
  end if;
  return new;
end $$;
drop trigger if exists kc_enquiry_venue on public.enquiries;
create trigger kc_enquiry_venue before insert or update on public.enquiries
  for each row execute function public.kc_trg_enquiry_venue();

-- enquiries already marked "sent to" a venue belong to that venue
update enquiries set venue = 'derby-moore' where status = 'sent_derby_moore' and venue is null;
update enquiries set venue = 'moorways'    where status = 'sent_moorways'    and venue is null;

-- head coach: his venue's enquiries only (staff rules unchanged)
drop policy if exists enquiries_coach_read on public.enquiries;
drop policy if exists enquiries_coach_insert on public.enquiries;
drop policy if exists enquiries_coach_update on public.enquiries;
drop policy if exists enquiries_coach_delete on public.enquiries;
create policy enquiries_coach_read on public.enquiries for select
  using (public.kc_is_head_coach() and venue in (select public.kc_my_venues()));
create policy enquiries_coach_insert on public.enquiries for insert
  with check (public.kc_is_head_coach());                       -- the trigger stamps his venue
create policy enquiries_coach_update on public.enquiries for update
  using (public.kc_is_head_coach() and venue in (select public.kc_my_venues()))
  with check (public.kc_is_head_coach() and venue in (select public.kc_my_venues()));
create policy enquiries_coach_delete on public.enquiries for delete
  using (public.kc_is_head_coach() and venue in (select public.kc_my_venues()));

-- ── UNDO (only if needed) ──
-- drop policy if exists enquiries_coach_read on public.enquiries;
-- drop policy if exists enquiries_coach_insert on public.enquiries;
-- drop policy if exists enquiries_coach_update on public.enquiries;
-- drop policy if exists enquiries_coach_delete on public.enquiries;
-- drop trigger if exists kc_enquiry_venue on public.enquiries;
