-- Dated class assignments: a student's assignment to a class counts only
-- between start_date and end_date (inclusive). Existing rows keep both empty
-- and behave exactly as before. Removing a class now sets end_date instead of
-- deleting the row, so past attendance stays accurate.
alter table public.student_class_assignments add column if not exists start_date date;
alter table public.student_class_assignments add column if not exists end_date date;
