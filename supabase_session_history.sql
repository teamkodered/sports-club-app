-- Safety net: keep a copy of every fit2fight_sessions row BEFORE it is changed
-- or deleted, so anything cleared by mistake can be recovered later from the
-- back end (independent of Supabase plan / backups). Read by staff only.
create table if not exists public.fit2fight_sessions_history (
  id bigserial primary key,
  session_id uuid,
  student_id uuid,
  session_date date,
  operation text not null,
  changed_at timestamptz not null default now(),
  changed_by uuid default auth.uid(),
  old_row jsonb not null
);
create index if not exists fit2fight_sessions_history_lookup
  on public.fit2fight_sessions_history (student_id, session_date, changed_at desc);

create or replace function public.fit2fight_sessions_keep_history()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.fit2fight_sessions_history (session_id, student_id, session_date, operation, old_row)
  values (old.id, old.student_id, old.session_date, tg_op, to_jsonb(old));
  return coalesce(new, old);
end $$;

drop trigger if exists fit2fight_sessions_keep_history on public.fit2fight_sessions;
create trigger fit2fight_sessions_keep_history
  before update or delete on public.fit2fight_sessions
  for each row
  when (old is distinct from new)
  execute function public.fit2fight_sessions_keep_history();

alter table public.fit2fight_sessions_history enable row level security;
drop policy if exists fit2fight_sessions_history_staff_read on public.fit2fight_sessions_history;
create policy fit2fight_sessions_history_staff_read on public.fit2fight_sessions_history for select
  using (exists (select 1 from members where auth_id = auth.uid() and role in ('admin', 'captain', 'coach')));

-- Housekeeping (optional, run now and then): keep 90 days of history
-- delete from public.fit2fight_sessions_history where changed_at < now() - interval '90 days';
