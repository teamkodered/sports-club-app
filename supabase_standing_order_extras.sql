-- Standing order check: "Pays other coach" (kept on the student) + coach list
alter table public.students add column if not exists pays_coach text;
insert into public.settings (key, value) values ('pays_coach_options', '["Sara", "Adele", "Mark", "George"]'::jsonb)
on conflict (key) do nothing;
