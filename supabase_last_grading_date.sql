-- Last grading date on each student (shown in the profile's Grading tab;
-- set automatically when the belt / level is changed, editable by admins).
alter table public.students add column if not exists last_grading_date date;
