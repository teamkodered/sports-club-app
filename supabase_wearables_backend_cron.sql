-- Runs the wearable-sync edge function every hour so wearable data arrives
-- by polling, without depending on provider webhooks.
-- BEFORE RUNNING: replace <SYNC_SECRET> with the value you set with
--   supabase secrets set WEARABLE_SYNC_SECRET=<a long random string>
-- Safe to run again (it replaces the existing schedule).

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule('wearable-sync-hourly')
  where exists (select 1 from cron.job where jobname = 'wearable-sync-hourly');

select cron.schedule(
  'wearable-sync-hourly',
  '7 * * * *',   -- 7 minutes past every hour
  $$
  select net.http_post(
    url := 'https://zhlefvardwawjstulifb.supabase.co/functions/v1/wearable-sync',
    headers := '{"Content-Type": "application/json", "x-sync-secret": "<SYNC_SECRET>"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
