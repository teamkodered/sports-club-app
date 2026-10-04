-- Test sessions: keep every 60-second set for body-weight max-rep tests
-- (the best set is stored with the other results in fit2fight_sessions.test, as always)
alter table public.fit2fight_sessions add column if not exists test_sets jsonb;
