-- Dated class assignments: a student's assignment to a class counts only
-- between start_date and end_date (inclusive). Existing rows keep both empty
-- and behave exactly as before. Removing a class now sets end_date instead of
-- deleting the row, so past attendance stays accurate.
alter table public.student_class_assignments add column if not exists start_date date;
alter table public.student_class_assignments add column if not exists end_date date;

-- ─────────────────────────────────────────────────────────────────────────────
-- Coach / Head Coach access follows the dates too (added 2026-10-14).
-- With dated assignments, removing a student from a class keeps the row with an end_date
-- instead of deleting it. These two functions used to count every assignment ever made,
-- so a coach would keep seeing students who had left their classes. Now an assignment that
-- ended before today no longer counts. (Same definitions as before, plus the date check.)
create or replace function public.kc_my_coached_student_ids()
returns setof uuid language sql stable security definer set search_path = public as $$
  select distinct a.student_id from student_class_assignments a
  where a.class_id in (select public.kc_my_class_ids())
    and (a.end_date is null or a.end_date >= current_date)
$$;

create or replace function public.kc_my_venue_member_ids()
returns setof uuid language sql stable security definer set search_path = public as $$
  select distinct s.member_id
  from student_class_assignments a
  join classes c on c.id = a.class_id
  join students s on s.id = a.student_id
  where a.class_id in (select public.kc_my_class_ids())
    and (c.name ilike '%derby moore%' or c.name ilike '%moorway%')
    and (a.end_date is null or a.end_date >= current_date)
$$;
grant execute on function public.kc_my_venue_member_ids() to authenticated;

-- Check after running (should show the two new columns):
--   select column_name from information_schema.columns where table_name = 'student_class_assignments' and column_name in ('start_date','end_date');
