-- 📤 GRADING: send requests to the coaches to OK (separate from the admin's approval)
alter table public.grading_expressions add column if not exists sent_to_coach_at timestamptz;
alter table public.grading_expressions add column if not exists coach_ok boolean not null default false;
alter table public.grading_expressions add column if not exists coach_ok_by text;
alter table public.grading_expressions add column if not exists coach_ok_at timestamptz;
notify pgrst, 'reload schema';
-- (head coaches can already read / update their own students' requests -- supabase_grading_coach_confirm.sql)
select count(*) as grading_requests, count(*) filter (where coach_ok) as coach_okd from grading_expressions;
