-- 📅 GRADING DATE: every grading request is filed under a grading date.
-- The "next grading" date is set at the top of CRM -> Grading requests (📅 Next grading ✏️); new requests
-- get it automatically when they're submitted (the student form doesn't show it).
alter table public.grading_expressions add column if not exists grading_date date;

create or replace function public.kc_grading_set_date()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.grading_date is null then
    select nullif(trim(both '"' from value::text), '')::date into new.grading_date
    from settings where key = 'grading_next_date';
  end if;
  return new;
end $$;
drop trigger if exists kc_grading_set_date on public.grading_expressions;
create trigger kc_grading_set_date before insert on public.grading_expressions
  for each row execute function public.kc_grading_set_date();

-- next grading: 21 November 2026
insert into public.settings (key, value) values ('grading_next_date', '"2026-11-21"'::jsonb)
on conflict (key) do update set value = '"2026-11-21"'::jsonb;

-- requests made since 1 October (no date yet) are for this grading
update grading_expressions set grading_date = '2026-11-21'
where grading_date is null and created_at >= '2026-10-01'
returning (select count(*) from grading_expressions where grading_date = '2026-11-21') as filed_under_21_nov;
