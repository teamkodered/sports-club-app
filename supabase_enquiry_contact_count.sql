-- CRM enquiries: count how many times each lead has been contacted (trial-booked follow-ups)
alter table public.enquiries add column if not exists contact_count integer not null default 0;
alter table public.enquiries add column if not exists last_contacted_at timestamptz;
