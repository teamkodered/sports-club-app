-- Athletes ask for holiday / injury time in the app; a coach authorises it (it then becomes their
-- individual holiday, so those sessions don't count against their attendance).
create table if not exists public.absence_requests (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  kind text not null check (kind in ('holiday', 'injury')),
  start_date date not null,
  end_date date not null,
  note text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined')),
  decided_by text,
  decided_at timestamptz,
  holiday_id uuid,
  created_at timestamptz not null default now()
);
create index if not exists absence_requests_student_idx on public.absence_requests (student_id, created_at desc);
alter table public.absence_requests enable row level security;

drop policy if exists absence_requests_staff on public.absence_requests;
create policy absence_requests_staff on public.absence_requests for all to authenticated
  using (exists (select 1 from members where auth_id = auth.uid() and role in ('admin','head_coach','captain','coach','leader')))
  with check (exists (select 1 from members where auth_id = auth.uid() and role in ('admin','head_coach','captain','coach','leader')));
drop policy if exists absence_requests_own_read on public.absence_requests;
create policy absence_requests_own_read on public.absence_requests for select to authenticated
  using (student_id in (select s.id from students s join members m on m.id = s.member_id where m.auth_id = auth.uid()));
drop policy if exists absence_requests_own_add on public.absence_requests;
create policy absence_requests_own_add on public.absence_requests for insert to authenticated
  with check (status = 'pending' and student_id in (select s.id from students s join members m on m.id = s.member_id where m.auth_id = auth.uid()));
drop policy if exists absence_requests_own_cancel on public.absence_requests;
create policy absence_requests_own_cancel on public.absence_requests for delete to authenticated
  using (status = 'pending' and student_id in (select s.id from students s join members m on m.id = s.member_id where m.auth_id = auth.uid()));
