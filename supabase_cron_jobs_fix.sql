-- Re-point the scheduled jobs at the shared job secret (x-job-secret), so
-- they stop failing with "Invalid JWT" / "Auth header is not 'Bearer'".
-- BEFORE RUNNING: replace <JOB_SECRET> (4 places) with the value you set with
--   supabase secrets set JOB_SECRET=<a long random string>
-- and deploy the four functions with --no-verify-jwt.

do $$
declare j text;
begin
  foreach j in array array['check-ladder-changes', 'check-reminders', 'daily-database-backup', 'send-scheduled-notices'] loop
    perform cron.unschedule(j) where exists (select 1 from cron.job where jobname = j);
  end loop;
end $$;

select cron.schedule('check-ladder-changes', '*/30 * * * *', $$
  select net.http_post(url := 'https://zhlefvardwawjstulifb.supabase.co/functions/v1/check-ladder-changes',
    headers := '{"Content-Type": "application/json", "x-job-secret": "<JOB_SECRET>"}'::jsonb, body := '{}'::jsonb, timeout_milliseconds := 60000);
$$);
select cron.schedule('check-reminders', '*/30 * * * *', $$
  select net.http_post(url := 'https://zhlefvardwawjstulifb.supabase.co/functions/v1/check-reminders',
    headers := '{"Content-Type": "application/json", "x-job-secret": "<JOB_SECRET>"}'::jsonb, body := '{}'::jsonb, timeout_milliseconds := 60000);
$$);
select cron.schedule('daily-database-backup', '0 3 * * *', $$
  select net.http_post(url := 'https://zhlefvardwawjstulifb.supabase.co/functions/v1/daily-database-backup',
    headers := '{"Content-Type": "application/json", "x-job-secret": "<JOB_SECRET>"}'::jsonb, body := '{}'::jsonb, timeout_milliseconds := 300000);
$$);
select cron.schedule('send-scheduled-notices', '*/15 * * * *', $$
  select net.http_post(url := 'https://zhlefvardwawjstulifb.supabase.co/functions/v1/send-scheduled-notices',
    headers := '{"Content-Type": "application/json", "x-job-secret": "<JOB_SECRET>"}'::jsonb, body := '{}'::jsonb, timeout_milliseconds := 60000);
$$);
