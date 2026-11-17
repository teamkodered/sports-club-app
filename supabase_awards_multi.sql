-- 🏆 Special warrior award: a coach can nominate SEVERAL people (other awards stay one per coach -- the app
-- keeps that). Swaps the one-per-coach rule for one-per-person-per-coach.
alter table public.awards_nominations drop constraint if exists awards_nominations_category_id_coach_member_id_key;
create unique index if not exists awards_nominations_one_per_person
  on public.awards_nominations (category_id, coach_member_id, coalesce(student_id, member_id));
select 'ok' as done;
