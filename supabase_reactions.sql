-- Coach reactions (👍 🔥 💪) on athletes' PDP actions -- athletes see them next time they open the app
create table if not exists public.kc_reactions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  target text not null,              -- what it's on, e.g. 'PDP action done: Shadow boxing feints'
  emoji text not null,
  from_name text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  seen_at timestamptz
);
create index if not exists kc_reactions_student_idx on public.kc_reactions (student_id, created_at desc);
alter table public.kc_reactions enable row level security;

drop policy if exists kc_reactions_staff on public.kc_reactions;
create policy kc_reactions_staff on public.kc_reactions for all to authenticated
  using (exists (select 1 from members where auth_id = auth.uid() and role in ('admin','head_coach','captain','coach','leader')))
  with check (exists (select 1 from members where auth_id = auth.uid() and role in ('admin','head_coach','captain','coach','leader')));
drop policy if exists kc_reactions_own on public.kc_reactions;
create policy kc_reactions_own on public.kc_reactions for select to authenticated
  using (student_id in (select s.id from students s join members m on m.id = s.member_id where m.auth_id = auth.uid()));
drop policy if exists kc_reactions_own_seen on public.kc_reactions;
create policy kc_reactions_own_seen on public.kc_reactions for update to authenticated
  using (student_id in (select s.id from students s join members m on m.id = s.member_id where m.auth_id = auth.uid()))
  with check (student_id in (select s.id from students s join members m on m.id = s.member_id where m.auth_id = auth.uid()));
