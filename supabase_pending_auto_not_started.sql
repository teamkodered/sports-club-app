-- ⏳ PENDING -> NOT STARTED after a week: a student left on 'pending' for 7 days (status not changed) moves
-- to Not started by itself. Moving them back to pending restarts the week. Runs when admins open the
-- Dashboard / Students page (and every night if pg_cron is switched on -- optional line at the bottom).
alter table public.members add column if not exists status_changed_at timestamptz;

create or replace function public.kc_status_changed_trg() returns trigger language plpgsql as $$
begin
  if new.status is distinct from old.status then new.status_changed_at := now(); end if;
  return new;
end $$;
drop trigger if exists kc_status_changed on public.members;
create trigger kc_status_changed before update of status on public.members
  for each row execute function public.kc_status_changed_trg();

create or replace function public.kc_auto_not_started()
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not exists (select 1 from members where auth_id = auth.uid() and role = 'admin') and auth.uid() is not null then return 0; end if;
  update members set status = 'not_started'
  where status = 'pending' and coalesce(status_changed_at, created_at) < now() - interval '7 days';
  get diagnostics n = row_count;
  return n;
end $$;
grant execute on function public.kc_auto_not_started() to authenticated;
notify pgrst, 'reload schema';

-- move the ones already waiting over a week (shows who)
select m.first_name || ' ' || m.last_name as moved_to_not_started, m.created_at::date as pending_since
from members m where m.status = 'pending' and coalesce(m.status_changed_at, m.created_at) < now() - interval '7 days'
order by 2;
select public.kc_auto_not_started() as moved_now;

-- OPTIONAL: every night at 2am (needs pg_cron switched on in Database -> Extensions); skip if it errors
-- select cron.schedule('kc-auto-not-started', '0 2 * * *', $$select public.kc_auto_not_started()$$);
