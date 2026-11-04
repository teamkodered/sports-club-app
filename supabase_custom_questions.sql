-- Added questions (Settings -> Questions / ➕ Create question): logged per day on the athlete's F2F session
alter table public.fit2fight_sessions add column if not exists custom_q jsonb;
