-- Fight record 'last updated' date (coach dashboard TEAM banner)
alter table public.students add column if not exists record_updated_at timestamptz;
