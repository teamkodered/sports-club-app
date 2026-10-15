-- "Cold water / Ice bath" question renamed to "Cold water training" (label only;
-- the saved data uses the key coldWater and is unchanged). Moves targets and
-- question uploads that were saved under the old name onto the new one.
update public.team_targets set question_label = 'Cold water training' where question_label = 'Cold water / Ice bath';
update public.athlete_profiles
set media_files = (
  select jsonb_agg(case when e->>'question_label' = 'Cold water / Ice bath' then jsonb_set(e, '{question_label}', '"Cold water training"') else e end)
  from jsonb_array_elements(media_files::jsonb) e)
where media_files::text like '%Cold water / Ice bath%';
