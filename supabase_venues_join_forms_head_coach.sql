-- ════════════════════════════════════════════════════════════════════════
-- VENUES ON JOIN FORMS + HEAD COACH: membership forms and his venue's join forms
-- (undo at the bottom, commented out)
-- ════════════════════════════════════════════════════════════════════════

-- 1. Where each join form is for ('kr-centre' | 'derby-moore' | 'moorways')
alter table public.join_applications add column if not exists venue text;

-- The form sends venue in its answers (form.venue) and Derby Moore / Moorways as the
-- student's class_schedule. Work it out from whichever is present in the saved copy.
create or replace function public.kc_join_venue_from_payload(p jsonb)
returns text language sql immutable as $$
  select coalesce(
    nullif(p #>> '{form,venue}', ''), nullif(p #>> '{p_form,venue}', ''), nullif(p ->> 'venue', ''),
    case
      when coalesce(p #>> '{student,class_schedule}', p #>> '{p_student,class_schedule}', '') ilike 'derby moore' then 'derby-moore'
      when coalesce(p #>> '{student,class_schedule}', p #>> '{p_student,class_schedule}', '') ilike 'moorways' then 'moorways'
    end)
$$;

create or replace function public.kc_trg_join_venue()
returns trigger language plpgsql security definer set search_path = public as $$
declare v text;
begin
  if new.venue is null then new.venue := kc_join_venue_from_payload(new.payload); end if;
  -- once the form has created the member, make sure the student shows at the right venue
  if new.member_id is not null and new.venue in ('derby-moore', 'moorways') then
    v := case new.venue when 'derby-moore' then 'Derby Moore' else 'Moorways' end;
    update students set class_schedule = v where member_id = new.member_id and (class_schedule is null or class_schedule = '');
  end if;
  return new;
end $$;
drop trigger if exists kc_join_venue on public.join_applications;
create trigger kc_join_venue before insert or update on public.join_applications
  for each row execute function public.kc_trg_join_venue();

-- fill in existing forms where the answers already say
update join_applications set venue = kc_join_venue_from_payload(payload) where venue is null;

-- 2. A head coach's venue(s), from the classes he's been given
create or replace function public.kc_my_venues()
returns setof text language sql stable security definer set search_path = public as $$
  select distinct case when c.name ilike '%derby moore%' then 'derby-moore' when c.name ilike '%moorway%' then 'moorways' end
  from classes c where c.id in (select public.kc_my_class_ids())
    and (c.name ilike '%derby moore%' or c.name ilike '%moorway%')
$$;
grant execute on function public.kc_my_venues() to authenticated;

-- 3. Head coach: his venue's incoming join forms (read + mark done/dismissed)
drop policy if exists join_applications_coach_read on public.join_applications;
drop policy if exists join_applications_coach_update on public.join_applications;
create policy join_applications_coach_read on public.join_applications for select
  using (public.kc_is_head_coach() and venue in (select public.kc_my_venues()));
create policy join_applications_coach_update on public.join_applications for update
  using (public.kc_is_head_coach() and venue in (select public.kc_my_venues()));

-- 4. Head coach: view (and print) the membership forms of students in his classes
drop policy if exists forms_read_coach on public.membership_forms;
create policy forms_read_coach on public.membership_forms for select
  using (public.kc_is_head_coach() and member_id in (select public.kc_my_coached_member_ids()));

-- ── UNDO (only if needed) ──
-- drop policy if exists join_applications_coach_read on public.join_applications;
-- drop policy if exists join_applications_coach_update on public.join_applications;
-- drop policy if exists forms_read_coach on public.membership_forms;
-- drop trigger if exists kc_join_venue on public.join_applications;
-- (the venue column and functions are harmless to keep)
