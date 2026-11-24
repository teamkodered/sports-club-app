-- ADMIN PHONE NOTIFICATIONS (new enquiries + birthdays)
-- The notifications job needs to know when each enquiry was added.
-- Adds enquiries.created_at if it isn't there already (existing rows get today's time,
-- which is fine -- the job only announces enquiries added after it first runs).
-- Safe to run again. Nothing else is changed.
alter table public.enquiries add column if not exists created_at timestamptz not null default now();
create index if not exists enquiries_created_at_idx on public.enquiries (created_at);

-- Admins can save this phone for notifications (only their own member record)
drop policy if exists push_subscriptions_own_admin on public.push_subscriptions;
create policy push_subscriptions_own_admin on public.push_subscriptions for all
  using (public.kc_has_role(array['admin']) and member_id in (select id from members where auth_id = auth.uid()))
  with check (public.kc_has_role(array['admin']) and member_id in (select id from members where auth_id = auth.uid()));

-- Check: should say 'created_at'
select column_name from information_schema.columns where table_schema = 'public' and table_name = 'enquiries' and column_name = 'created_at';
