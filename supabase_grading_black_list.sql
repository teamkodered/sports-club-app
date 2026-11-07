-- 🥋 BLACK BELT GRADING list: requests for Black or a Dan grade go onto "Black belt grading" (its own
-- date, TBC until set) instead of the next normal grading. Same grading form.
alter table public.grading_expressions add column if not exists grading_list text;

create or replace function public.kc_grading_set_date()
returns trigger language plpgsql security definer set search_path = public as $$
declare d text;
begin
  if new.grading_list is null and (new.grading_for ~* '^\s*black\s*$' or new.grading_for ~* '\mdan\M') then
    new.grading_list := 'Black belt grading';
  end if;
  if new.grading_date is null then
    if new.grading_list = 'Black belt grading' then
      select nullif(trim(both '"' from value::text), '') into d from settings where key = 'grading_black_date';
    else
      select nullif(trim(both '"' from value::text), '') into d from settings where key = 'grading_next_date';
    end if;
    new.grading_date := d::date;
  end if;
  return new;
end $$;
-- (same trigger as before: kc_grading_set_date, before insert)

-- move the current Black / Dan requests onto the list (Teddy, Simran, Destiny, Darcelle, Sophie, Monica, Noah, Ashton...)
update grading_expressions g
set grading_list = 'Black belt grading', grading_date = null
from students s join members m on m.id = s.member_id
where g.student_id = s.id and g.grading_list is null and coalesce(g.coach_approved, false) = false
  and (g.grading_for ~* '^\s*black\s*$' or g.grading_for ~* '\mdan\M')
  and (g.grading_date is null or g.grading_date >= current_date)
returning m.first_name || ' ' || m.last_name as moved_to_black_belt_list, g.current_belt, g.grading_for;
