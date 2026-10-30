-- RETURNED STUDENTS: remember the date someone came back, so they show as "↻ returned" on the
-- New members card (as well as their original join date).

-- 1) the date they came back
alter table public.members add column if not exists rejoined_at date;

-- 2) set automatically whenever a stopped (or not-started import) member becomes active again
--    -- e.g. the ↻ Restart button on Students
create or replace function public.kc_mark_rejoined()
returns trigger language plpgsql as $$
begin
  if new.status = 'active' and old.status in ('stopped', 'not_started') then
    new.rejoined_at := current_date;
  end if;
  return new;
end $$;
drop trigger if exists kc_mark_rejoined on public.members;
create trigger kc_mark_rejoined before update of status on public.members
  for each row execute function public.kc_mark_rejoined();

-- 3) the three merged today came back in September (the dates their new records were made)
update members set rejoined_at = '2026-09-21' where id = 'a702668f-1e6e-4cff-97db-6bd4c98b6f9f';  -- Haiza-Noor Ghufar
update members set rejoined_at = '2026-09-08' where id = '37806af7-bc20-4acc-ac65-be4a91c2a4de';  -- Max Sobanski
update members set rejoined_at = '2026-09-14' where id = '0489f911-b13b-41e1-af5f-da0478d59a1f';  -- Tremayne Miller

notify pgrst, 'reload schema';

select first_name, last_name, joined_date, rejoined_at from members where rejoined_at is not null order by rejoined_at desc;
