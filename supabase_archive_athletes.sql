-- Stopped training = archived (Nov 2026). When a member's status changes to 'stopped':
--   * their student record is marked archived (kept in full -- nothing is deleted)
--   * their class places end today, so they drop off every register
--   * their app login is switched off (they can't sign in to the athlete app)
-- Setting them back to active reverses it (archive cleared, login back on; classes are re-added by hand).
alter table public.students add column if not exists archived_at timestamptz;

create or replace function public.kc_archive_on_stop()
returns trigger language plpgsql security definer set search_path = public, auth as $$
begin
  if new.status = 'stopped' and coalesce(old.status, '') <> 'stopped' then
    update students set archived_at = now() where member_id = new.id and archived_at is null;
    update student_class_assignments a set end_date = current_date
      from students s where s.member_id = new.id and a.student_id = s.id and (a.end_date is null or a.end_date > current_date);
    if new.auth_id is not null then update auth.users set banned_until = 'infinity' where id = new.auth_id; end if;
  elsif coalesce(old.status, '') = 'stopped' and new.status <> 'stopped' then
    update students set archived_at = null where member_id = new.id;
    if new.auth_id is not null then update auth.users set banned_until = null where id = new.auth_id; end if;
  end if;
  return new;
end $$;

drop trigger if exists kc_archive_on_stop on public.members;
create trigger kc_archive_on_stop after update of status on public.members
  for each row execute function public.kc_archive_on_stop();

-- members already stopped: archive them now too (class places ended, logins off)
update students s set archived_at = coalesce(m.stopped_at::timestamptz, now())
  from members m where m.id = s.member_id and m.status = 'stopped' and s.archived_at is null;
update student_class_assignments a set end_date = current_date
  from students s join members m on m.id = s.member_id
  where a.student_id = s.id and m.status = 'stopped' and (a.end_date is null or a.end_date > current_date);
update auth.users u set banned_until = 'infinity'
  from members m where m.auth_id = u.id and m.status = 'stopped' and u.banned_until is null
    and not exists (select 1 from members m2 where m2.auth_id = u.id and m2.status <> 'stopped');
