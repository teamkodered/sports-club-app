-- Weigh-in photos: the scales photo each weigh in / out was scanned from (proof), viewable by coaches
create table if not exists public.weigh_in_photos (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  session_date date not null,
  kind text not null check (kind in ('in', 'out')),
  path text not null,
  kg numeric,
  read_kg numeric,          -- what the scanner read (kg can differ if the athlete corrected it)
  created_at timestamptz not null default now()
);
create index if not exists weigh_in_photos_student_idx on public.weigh_in_photos (student_id, session_date desc);
alter table public.weigh_in_photos enable row level security;
drop policy if exists weigh_in_photos_own on public.weigh_in_photos;
create policy weigh_in_photos_own on public.weigh_in_photos for all to authenticated
  using (student_id in (select s.id from students s join members m on m.id = s.member_id where m.auth_id = auth.uid()))
  with check (student_id in (select s.id from students s join members m on m.id = s.member_id where m.auth_id = auth.uid()));
drop policy if exists weigh_in_photos_staff on public.weigh_in_photos;
create policy weigh_in_photos_staff on public.weigh_in_photos for select to authenticated using (public.kc_is_coach_staff());

-- private storage folder for the photos (athletes upload into their own folder; coaches can view)
insert into storage.buckets (id, name, public) values ('weigh-ins', 'weigh-ins', false) on conflict (id) do nothing;
drop policy if exists weigh_ins_upload on storage.objects;
create policy weigh_ins_upload on storage.objects for insert to authenticated with check (bucket_id = 'weigh-ins');
drop policy if exists weigh_ins_read on storage.objects;
create policy weigh_ins_read on storage.objects for select to authenticated
  using (bucket_id = 'weigh-ins' and (public.kc_is_coach_staff() or (storage.foldername(name))[1] in (select s.id::text from students s join members m on m.id = s.member_id where m.auth_id = auth.uid())));
