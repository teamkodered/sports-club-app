-- Google calendars shown in the app calendar (read-only, from each calendar's secret iCal address).
-- The addresses are private: only admins can read this table; the server fetches the events.
create table if not exists public.google_calendar_feeds (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  ics_url text not null,
  colour text not null default '#378ADD',
  visibility text not null default 'admin' check (visibility in ('admin', 'staff', 'everyone')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.google_calendar_feeds enable row level security;
drop policy if exists google_feeds_admin on public.google_calendar_feeds;
create policy google_feeds_admin on public.google_calendar_feeds for all
  using (public.kc_has_role(array['admin'])) with check (public.kc_has_role(array['admin']));

-- a club holiday made from a Google event remembers which event, so it's never added twice
alter table public.holidays add column if not exists google_event_uid text;
create index if not exists holidays_google_uid_idx on public.holidays (google_event_uid);
