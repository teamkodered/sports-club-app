-- ════════════════════════════════════════════════════════════════════════
-- ENQUIRIES: new "Attended" stage + automatic matching to join forms
-- When a membership/join form creates a member, any OPEN enquiry (Enquiry,
-- Contacted, Trial booked) with the same phone number (ignoring spaces and
-- +44/0) or the same email is moved to "Attended" and linked to that member.
-- Joined is still set by a person, since not everyone who fills in a form joins.
-- ════════════════════════════════════════════════════════════════════════

-- 1. Allow the new status (only if a status check exists)
do $$
declare c record; had_check boolean := false;
begin
  for c in select conname from pg_constraint
           where conrelid = 'public.enquiries'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%status%'
  loop
    execute format('alter table public.enquiries drop constraint %I', c.conname);
    had_check := true;
  end loop;
  if had_check then
    alter table public.enquiries add constraint enquiries_status_check
      check (status in ('not_started','contacted','trial_booked','attended','joined','waiting_list','not_interested'));
  end if;
end $$;

alter table public.enquiries add column if not exists matched_at timestamptz;

-- 2. Phone numbers compared as digits, UK style (07... and +447... match)
create or replace function public.kc_norm_phone(p text)
returns text language sql immutable as $$
  select nullif(regexp_replace(regexp_replace(coalesce(p, ''), '[^0-9]', '', 'g'), '^44', '0'), '')
$$;

-- 3. Move matching open enquiries to Attended and link them to the member
create or replace function public.kc_match_enquiries(p_member_id uuid, p_phones text[], p_emails text[])
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update enquiries e
     set status = 'attended', linked_member_id = p_member_id, matched_at = now(), updated_at = now()
   where e.status in ('not_started', 'contacted', 'trial_booked')
     and e.linked_member_id is null
     and (
       (kc_norm_phone(e.contact_phone) is not null and kc_norm_phone(e.contact_phone) in (select kc_norm_phone(x) from unnest(p_phones) x where kc_norm_phone(x) is not null))
       or (nullif(trim(e.contact_email), '') is not null and lower(trim(e.contact_email)) in (select lower(trim(x)) from unnest(p_emails) x where nullif(trim(x), '') is not null))
     );
  get diagnostics n = row_count;
  return n;
end $$;

-- 4. Run it whenever a member is created (adult forms) and when their student
--    record is created (child forms carry the parent's mobile as guardian_phone)
create or replace function public.kc_trg_match_member()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform kc_match_enquiries(new.id, array[new.phone], array[new.email]);
  return new;
end $$;
drop trigger if exists kc_match_enquiries_member on public.members;
create trigger kc_match_enquiries_member after insert on public.members
  for each row execute function public.kc_trg_match_member();

create or replace function public.kc_trg_match_student()
returns trigger language plpgsql security definer set search_path = public as $$
declare m record;
begin
  select phone, email into m from members where id = new.member_id;
  perform kc_match_enquiries(new.member_id, array[m.phone, new.guardian_phone], array[m.email]);
  return new;
end $$;
drop trigger if exists kc_match_enquiries_student on public.students;
create trigger kc_match_enquiries_student after insert on public.students
  for each row execute function public.kc_trg_match_student();

-- ── 5. ONE-OFF CATCH-UP (optional) ──────────────────────────────────────
-- Preview: open enquiries that match a member who joined in the last 120 days
-- select e.name as enquiry, e.status, e.contact_phone, e.contact_email, m.first_name, m.last_name, m.joined_date
-- from enquiries e join members m on (
--      (kc_norm_phone(e.contact_phone) is not null and kc_norm_phone(e.contact_phone) = kc_norm_phone(m.phone))
--   or (nullif(trim(e.contact_email),'') is not null and lower(trim(e.contact_email)) = lower(trim(m.email))))
-- where e.status in ('not_started','contacted','trial_booked') and e.linked_member_id is null
--   and m.joined_date >= current_date - 120;
--
-- Apply it (moves those to Attended):
-- select kc_match_enquiries(m.id, array[m.phone, s.guardian_phone], array[m.email])
-- from members m left join students s on s.member_id = m.id
-- where m.joined_date >= current_date - 120;
