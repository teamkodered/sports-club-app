-- Events made from Google calendar events (linked, so never added twice) + which team they're for
alter table public.fixtures add column if not exists google_event_uid text;
alter table public.fixtures add column if not exists team text;   -- 'KR' | 'KRBA' | null (both)
create index if not exists fixtures_google_uid_idx on public.fixtures (google_event_uid);
