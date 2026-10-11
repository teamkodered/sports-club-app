-- ════════════════════════════════════════════════════════════════════════
-- PARENT VIEW + COACH INVITE LINKS   (undo: supabase_parent_view_undo.sql)
--  • app_invites: one-time links a coach sends ("for the athlete" / "for a parent")
--  • guardians: a parent's login linked to each child (only via a coach's invite)
--  • absence_requests / contact_update_requests: from parents, staff approve
--  • Parents read ONLY their own children. For a child aged 16+ who has their own
--    login: attendance + holidays only (no points, membership form, etc.)
-- Uses the helper functions from the privacy steps (kc_has_role, kc_my_member_ids, …).
-- ════════════════════════════════════════════════════════════════════════

create table if not exists public.app_invites (
  id uuid primary key default gen_random_uuid(),
  token text not null unique,
  student_id uuid not null references public.students(id) on delete cascade,
  kind text not null check (kind in ('athlete', 'parent')),
  created_by uuid references public.members(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '14 days',
  used_at timestamptz,
  used_by uuid
);

create table if not exists public.guardians (
  id uuid primary key default gen_random_uuid(),
  parent_member_id uuid not null references public.members(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  invite_id uuid references public.app_invites(id),
  created_at timestamptz not null default now(),
  unique (parent_member_id, student_id)
);

create table if not exists public.absence_requests (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  parent_member_id uuid references public.members(id),
  start_date date not null, end_date date not null, reason text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined')),
  created_at timestamptz not null default now(), decided_by uuid references public.members(id), decided_at timestamptz
);

create table if not exists public.contact_update_requests (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  parent_member_id uuid references public.members(id),
  details text not null,
  status text not null default 'pending' check (status in ('pending', 'done', 'declined')),
  created_at timestamptz not null default now(), decided_by uuid references public.members(id), decided_at timestamptz
);

-- ── helpers ──
create or replace function public.kc_is_any_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from members where auth_id = auth.uid() and role in ('admin','captain','coach','leader'))
$$;

-- every child this login is a parent of
create or replace function public.kc_my_child_student_ids()
returns setof uuid language sql stable security definer set search_path = public as $$
  select g.student_id from guardians g where g.parent_member_id in (select id from members where auth_id = auth.uid())
$$;
-- children whose full progress a parent may see (not 16+ with their own login)
create or replace function public.kc_my_child_full_student_ids()
returns setof uuid language sql stable security definer set search_path = public as $$
  select s.id from students s join members m on m.id = s.member_id
  where s.id in (select public.kc_my_child_student_ids())
    and not (m.auth_id is not null and m.date_of_birth is not null and m.date_of_birth <= current_date - interval '16 years')
$$;
create or replace function public.kc_my_child_member_ids()
returns setof uuid language sql stable security definer set search_path = public as $$
  select s.member_id from students s where s.id in (select public.kc_my_child_student_ids())
$$;
create or replace function public.kc_my_child_full_member_ids()
returns setof uuid language sql stable security definer set search_path = public as $$
  select s.member_id from students s where s.id in (select public.kc_my_child_full_student_ids())
$$;

-- ── redeem an invite (the only way a parent link is made) ──
create or replace function public.kc_redeem_invite(p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare inv app_invites; v_uid uuid := auth.uid(); v_email text; v_me uuid; v_child_member uuid; v_staff boolean; v_existing uuid;
begin
  if v_uid is null then return jsonb_build_object('error', 'Please sign in first.'); end if;
  select * into inv from app_invites where token = p_token;
  if inv.id is null then return jsonb_build_object('error', 'This invite link isn''t valid. Ask your coach for a new one.'); end if;
  if inv.used_at is not null and inv.used_by is distinct from v_uid then return jsonb_build_object('error', 'This invite has already been used. Ask your coach for a new one.'); end if;
  if inv.expires_at < now() then return jsonb_build_object('error', 'This invite has expired. Ask your coach for a new one.'); end if;
  select email into v_email from auth.users where id = v_uid;
  select member_id into v_child_member from students where id = inv.student_id;
  v_staff := exists (select 1 from members where auth_id = v_uid and (role in ('admin','captain','coach','leader','head_coach')));

  if inv.kind = 'athlete' then
    if v_staff then return jsonb_build_object('error', 'This is a staff login. Open the invite signed in with the athlete''s own email.'); end if;
    select auth_id into v_existing from members where id = v_child_member;
    if v_existing is not null and v_existing <> v_uid then return jsonb_build_object('error', 'This athlete already has a login. Ask your coach for help.'); end if;
    -- free this login from any stray record that isn't an athlete or a parent
    update members m set auth_id = null where m.auth_id = v_uid and m.id <> v_child_member
      and not exists (select 1 from students s where s.member_id = m.id)
      and not exists (select 1 from guardians g where g.parent_member_id = m.id);
    update members set auth_id = v_uid where id = v_child_member;
  else
    -- parent: use this login's own record, or create one
    select id into v_me from members where auth_id = v_uid limit 1;
    if v_me is null then
      insert into members (first_name, last_name, email, role, auth_id, status)
      values (coalesce(split_part(v_email, '@', 1), 'Parent'), '', v_email, 'member', v_uid, 'active') returning id into v_me;
    end if;
    if v_me = v_child_member then return jsonb_build_object('error', 'This is a parent invite, but you''re signed in as the athlete. Sign in with the parent''s email.'); end if;
    insert into guardians (parent_member_id, student_id, invite_id) values (v_me, inv.student_id, inv.id) on conflict do nothing;
  end if;
  update app_invites set used_at = coalesce(used_at, now()), used_by = v_uid where id = inv.id;
  return jsonb_build_object('ok', true, 'kind', inv.kind);
end $$;
grant execute on function public.kc_redeem_invite(text) to authenticated;
grant execute on function public.kc_is_any_staff(), public.kc_my_child_student_ids(), public.kc_my_child_full_student_ids(),
  public.kc_my_child_member_ids(), public.kc_my_child_full_member_ids() to authenticated;

-- ── rules ──
alter table public.app_invites enable row level security;
alter table public.guardians enable row level security;
alter table public.absence_requests enable row level security;
alter table public.contact_update_requests enable row level security;

-- invites: staff for anyone, head coach for his own students
drop policy if exists invites_staff on public.app_invites;
create policy invites_staff on public.app_invites for all
  using (public.kc_is_any_staff() or (public.kc_is_head_coach() and student_id in (select public.kc_my_coached_student_ids())))
  with check (public.kc_is_any_staff() or (public.kc_is_head_coach() and student_id in (select public.kc_my_coached_student_ids())));

-- guardians: parents see their own links; staff see / remove all
drop policy if exists guardians_own on public.guardians;
create policy guardians_own on public.guardians for select using (parent_member_id in (select public.kc_my_member_ids()));
drop policy if exists guardians_staff on public.guardians;
create policy guardians_staff on public.guardians for all using (public.kc_is_any_staff());

-- requests: parents create + see their own for their children; staff handle them
drop policy if exists absence_parent_insert on public.absence_requests;
create policy absence_parent_insert on public.absence_requests for insert
  with check (student_id in (select public.kc_my_child_student_ids()) and parent_member_id in (select public.kc_my_member_ids()) and status = 'pending');
drop policy if exists absence_parent_read on public.absence_requests;
create policy absence_parent_read on public.absence_requests for select using (parent_member_id in (select public.kc_my_member_ids()));
drop policy if exists absence_staff on public.absence_requests;
create policy absence_staff on public.absence_requests for all using (public.kc_is_any_staff());
drop policy if exists contact_parent_insert on public.contact_update_requests;
create policy contact_parent_insert on public.contact_update_requests for insert
  with check (student_id in (select public.kc_my_child_student_ids()) and parent_member_id in (select public.kc_my_member_ids()) and status = 'pending');
drop policy if exists contact_parent_read on public.contact_update_requests;
create policy contact_parent_read on public.contact_update_requests for select using (parent_member_id in (select public.kc_my_member_ids()));
drop policy if exists contact_staff on public.contact_update_requests;
create policy contact_staff on public.contact_update_requests for all using (public.kc_is_any_staff());

-- parents reading their children (16+ with own login: attendance + holidays only)
drop policy if exists students_read_parent on public.students;
create policy students_read_parent on public.students for select using (id in (select public.kc_my_child_student_ids()));
drop policy if exists members_read_parent on public.members;
create policy members_read_parent on public.members for select using (id in (select public.kc_my_child_member_ids()));
drop policy if exists attendance_read_parent on public.attendance;
create policy attendance_read_parent on public.attendance for select using (student_id in (select public.kc_my_child_student_ids()));
drop policy if exists holidays_read_parent on public.holidays;
create policy holidays_read_parent on public.holidays for select using (student_id in (select public.kc_my_child_student_ids()));
drop policy if exists points_read_parent on public.points_log;
create policy points_read_parent on public.points_log for select using (student_id in (select public.kc_my_child_full_student_ids()));
drop policy if exists sca_read_parent on public.student_class_assignments;
create policy sca_read_parent on public.student_class_assignments for select using (student_id in (select public.kc_my_child_student_ids()));
drop policy if exists forms_read_parent on public.membership_forms;
create policy forms_read_parent on public.membership_forms for select using (member_id in (select public.kc_my_child_full_member_ids()));
