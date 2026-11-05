-- 🎽 GRADING -> COACHES automatically: every request is shared with the student's coach as soon as
-- it's submitted (no 'Send' needed). Coaches can ✓ OK or ✗ Not ready (with a reason).
alter table public.grading_expressions add column if not exists coach_not_ready boolean not null default false;
alter table public.grading_expressions add column if not exists coach_note text;

create or replace function public.kc_grading_share_with_coach()
returns trigger language plpgsql as $$
begin
  if new.sent_to_coach_at is null then new.sent_to_coach_at := now(); end if;
  return new;
end $$;
drop trigger if exists kc_grading_share_with_coach on public.grading_expressions;
create trigger kc_grading_share_with_coach before insert on public.grading_expressions
  for each row execute function public.kc_grading_share_with_coach();

-- share the ones already in for the coming grading
update grading_expressions set sent_to_coach_at = now()
where sent_to_coach_at is null and coalesce(coach_approved, false) = false
  and (grading_date is null or grading_date >= current_date);
notify pgrst, 'reload schema';

select count(*) filter (where sent_to_coach_at is not null) as shared_with_coaches, count(*) as total from grading_expressions;
