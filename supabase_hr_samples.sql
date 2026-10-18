-- Heart rate curve for sessions recorded in the app (~5 s steps)
alter table public.hr_sessions add column if not exists samples jsonb;
