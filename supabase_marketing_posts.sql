-- ════════════════════════════════════════════════════════════════════════
-- MARKETING STAGE 3: POSTS
-- • marketing_posts: the content calendar (admin only)
-- • moments: photos coaches send in, with who is in them (coaches add, admin uses)
-- • storage bucket 'moments' (private): coaches upload, only admin + the sender can see
-- • a moment is marked consent_ok only when EVERY tagged student has media consent = Yes
-- • kc_session_milestones: who reached 50 / 100 / 250 / 500 / 1000 sessions recently
-- Safe to run again. Nothing existing is changed or deleted.
-- ════════════════════════════════════════════════════════════════════════

-- 1. Content calendar
create table if not exists public.marketing_posts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  post_date date not null default current_date,
  title text not null,
  caption text,
  brand text,                                   -- KR / PKA / F2F / KRBA
  idea_key text unique,                         -- which post idea it came from (so it isn't suggested twice)
  moment_id uuid,
  channels text[] not null default '{}',        -- where it's been posted: instagram / facebook / website / tiktok
  status text not null default 'planned' check (status in ('planned', 'posted', 'skipped')),
  notes text
);
alter table public.marketing_posts enable row level security;
drop policy if exists marketing_posts_admin on public.marketing_posts;
create policy marketing_posts_admin on public.marketing_posts for all
  using (public.kc_has_role(array['admin'])) with check (public.kc_has_role(array['admin']));

-- 2. Moments sent in by coaches
create table if not exists public.moments (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  submitted_by uuid not null default auth.uid(),
  submitter_name text,
  caption text,
  photo_path text not null,                     -- in the 'moments' bucket: <auth uid>/<file>
  student_ids uuid[] not null default '{}',     -- who is in the photo
  no_one_identifiable boolean not null default false,
  consent_ok boolean not null default false,    -- set by the trigger below, never by the app
  status text not null default 'new' check (status in ('new', 'used', 'not_used'))
);
alter table public.moments enable row level security;
drop policy if exists moments_admin on public.moments;
create policy moments_admin on public.moments for all
  using (public.kc_has_role(array['admin'])) with check (public.kc_has_role(array['admin']));
drop policy if exists moments_coach_add on public.moments;
create policy moments_coach_add on public.moments for insert
  with check (public.kc_is_class_staff() and submitted_by = auth.uid());
drop policy if exists moments_coach_own on public.moments;
create policy moments_coach_own on public.moments for select
  using (submitted_by = auth.uid());

-- consent is worked out by the database from the students' records (only an explicit Yes counts)
create or replace function public.kc_moment_consent_trg() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(array_length(new.student_ids, 1), 0) = 0 then
    new.consent_ok := new.no_one_identifiable;
  else
    new.consent_ok := not exists (
      select 1 from unnest(new.student_ids) sid
      left join students s on s.id = sid
      where coalesce(s.media_restriction, '') <> 'Yes');
  end if;
  return new;
end $$;
drop trigger if exists kc_moment_consent on public.moments;
create trigger kc_moment_consent before insert or update of student_ids, no_one_identifiable on public.moments
  for each row execute function public.kc_moment_consent_trg();

-- 3. Photo storage (private)
insert into storage.buckets (id, name, public) values ('moments', 'moments', false)
on conflict (id) do update set public = false;
drop policy if exists "moments: read" on storage.objects;
create policy "moments: read" on storage.objects for select to authenticated
  using (bucket_id = 'moments' and (public.kc_has_role(array['admin']) or (storage.foldername(name))[1] = auth.uid()::text));
drop policy if exists "moments: upload" on storage.objects;
create policy "moments: upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'moments' and (public.kc_has_role(array['admin']) or public.kc_is_class_staff())
              and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "moments: admin remove" on storage.objects;
create policy "moments: admin remove" on storage.objects for delete to authenticated
  using (bucket_id = 'moments' and public.kc_has_role(array['admin']));

-- 4. Session milestones reached in the last p_days days (admin only)
create or replace function public.kc_session_milestones(p_days int default 30)
returns table (student_id uuid, milestone int, reached_on date)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.kc_has_role(array['admin']) then raise exception 'Admins only'; end if;
  return query
  with ordered as (
    select a.student_id, r.date, row_number() over (partition by a.student_id order by r.date, a.id) as n
    from attendance a join registers r on r.id = a.register_id
    where a.present and a.student_id is not null
  )
  select o.student_id, o.n::int, o.date
  from ordered o
  where o.n in (50, 100, 250, 500, 750, 1000)
    and o.date >= current_date - p_days and o.date <= current_date;
end $$;
revoke all on function public.kc_session_milestones(int) from public, anon;
grant execute on function public.kc_session_milestones(int) to authenticated;

-- Check: three rows, rls_on = true for the two tables, bucket private
select 'marketing_posts' as what, relrowsecurity::text as ok from pg_class where relname = 'marketing_posts'
union all select 'moments', relrowsecurity::text from pg_class where relname = 'moments'
union all select 'bucket moments public?', public::text from storage.buckets where id = 'moments';
