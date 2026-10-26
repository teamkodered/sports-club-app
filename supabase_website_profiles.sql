-- 🌐 Website profiles (teamkodered.com) -- step 1: coach approval (Oct 2026)
-- One row per athlete: the last APPROVED snapshot of what goes on the website,
-- plus the last snapshot a coach SENT BACK (with a note). The dashboard card works
-- out "waiting" by comparing today's profile with these, so nothing extra has to
-- be saved when a profile changes. Nothing here touches existing tables.
-- published_* stay empty until the WordPress connection (step 2) is built.

create table if not exists public.website_profile_reviews (
  student_id    uuid primary key references public.students(id) on delete cascade,
  approved      jsonb,
  approved_at   timestamptz,
  approved_by   uuid references public.members(id),
  sent_back     jsonb,
  sent_back_note text,
  sent_back_at  timestamptz,
  sent_back_by  uuid references public.members(id),
  published     jsonb,          -- step 2: what is actually live on the website
  published_at  timestamptz,
  publish_error text,
  updated_at    timestamptz not null default now()
);

alter table public.website_profile_reviews enable row level security;

-- staff (admin / captain / coach / leader) see and decide all;
-- Head Coaches only the athletes in their own classes
drop policy if exists wpr_staff on public.website_profile_reviews;
create policy wpr_staff on public.website_profile_reviews for all
  using (public.kc_is_any_staff() or (public.kc_is_head_coach() and student_id in (select public.kc_my_coached_student_ids())))
  with check (public.kc_is_any_staff() or (public.kc_is_head_coach() and student_id in (select public.kc_my_coached_student_ids())));

-- check: should return one row, website_profile_reviews, with rls on
select tablename, rowsecurity from pg_tables where tablename = 'website_profile_reviews';
