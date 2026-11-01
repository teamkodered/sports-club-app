-- ⏱ AUTO CHECK-OUT (Nov 2026): self check-ins never checked out get closed automatically an hour after
-- their class ends (checked_out_at = the class end time; no check-out points). Without a class: 2 h after
-- check-in. The app runs this when a coach opens the Dashboard or an athlete opens their app; pg_cron
-- (below, optional) also runs it every 30 minutes.
create or replace function public.kc_auto_checkout()
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update attendance a
  set checked_out_at = coalesce(
        ((a.session_date + c.end_time) at time zone 'Europe/London'),
        a.attended_at + interval '2 hours')
  from attendance a2 left join classes c on c.id = a2.class_id
  where a.id = a2.id
    and a.self_checked_in and a.checked_out_at is null and a.attended_at is not null
    and now() > coalesce(((a.session_date + c.end_time) at time zone 'Europe/London') + interval '1 hour', a.attended_at + interval '3 hours');
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.kc_auto_checkout() from public, anon;
grant execute on function public.kc_auto_checkout() to authenticated;

-- close the ones already left open
select public.kc_auto_checkout() as checked_out_now;

-- OPTIONAL: run every 30 minutes on the server (needs the pg_cron extension -- Database -> Extensions -> pg_cron).
-- If this line errors, skip it: the app still runs it whenever the Dashboard / athlete app is opened.
-- select cron.schedule('kc-auto-checkout', '*/30 * * * *', $$select public.kc_auto_checkout()$$);
