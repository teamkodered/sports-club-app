-- ════════════════════════════════════════════════════════════════════════
-- 🏆 POINTS TO CONFIRM: PBs (+5) and monthly improvement (+10)
-- The app spots them automatically; a coach confirms (✓) or turns them down (✗) on the Dashboard.
-- Points go to the athlete's individual total (like other app / test points).
-- ════════════════════════════════════════════════════════════════════════
create table if not exists public.points_pending (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  kind text not null check (kind in ('pb', 'improvement')),
  label text not null,               -- e.g. 'PB: Bleep test' / 'Monthly improvement: 2026-10'
  detail text,                       -- e.g. '8.8 level (was 7.4)'
  points int not null,
  big_jump boolean not null default false,   -- unusually large change: check it isn't a typo
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  decided_by uuid, decided_at timestamptz,
  unique (student_id, label)
);
alter table public.points_pending enable row level security;
drop policy if exists points_pending_staff_read on public.points_pending;
create policy points_pending_staff_read on public.points_pending for select
  using ((select public.kc_is_staff()) or ((select public.kc_is_head_coach()) and student_id in (select public.kc_my_coached_student_ids())));

insert into public.settings (key, value) values ('athlete_house_points', '{"pb": 5, "monthly_improvement": 10}'::jsonb)
on conflict (key) do update set value = coalesce(public.settings.value, '{}'::jsonb) || '{"pb": 5, "monthly_improvement": 10}'::jsonb;

-- a PB was just saved (athlete for themselves, or a coach) -> waits for a coach
create or replace function public.kc_add_pb_pending(p_student_id uuid, p_test text, p_value numeric, p_previous numeric, p_unit text, p_date date)
returns void language plpgsql security definer set search_path = public as $$
declare v_pts int; v_big boolean;
begin
  if not ((select public.kc_is_staff()) or (select public.kc_is_head_coach())
          or exists (select 1 from students s join members m on m.id = s.member_id where s.id = p_student_id and m.auth_id = auth.uid())) then return; end if;
  select coalesce(nullif(value ->> 'pb', '')::int, 5) into v_pts from settings where key = 'athlete_house_points';
  v_big := p_previous is not null and p_previous <> 0 and abs(p_value - p_previous) / abs(p_previous) > 0.3;   -- over 30% change
  insert into points_pending (student_id, kind, label, detail, points, big_jump)
  values (p_student_id, 'pb', 'PB: ' || p_test || ' (' || p_date || ')',
          p_value || coalesce(' ' || p_unit, '') || ' (was ' || p_previous || ')', coalesce(v_pts, 5), coalesce(v_big, false))
  on conflict (student_id, label) do update set detail = excluded.detail, big_jump = excluded.big_jump
    where points_pending.status = 'pending';
end $$;

-- monthly improvement: more normal-class sessions attended last month than the month before (at least 4)
create or replace function public.kc_generate_monthly_improvements()
returns int language plpgsql security definer set search_path = public as $$
declare v_m0 date := (date_trunc('month', current_date) - interval '1 month')::date; v_pts int; n int;
begin
  if not ((select public.kc_is_staff()) or (select public.kc_is_head_coach())) then return 0; end if;
  select coalesce(nullif(value ->> 'monthly_improvement', '')::int, 10) into v_pts from settings where key = 'athlete_house_points';
  with sess as (
    select a.student_id,
           count(distinct a.session_date) filter (where a.session_date >= v_m0 and a.session_date < v_m0 + interval '1 month') as last_m,
           count(distinct a.session_date) filter (where a.session_date >= v_m0 - interval '1 month' and a.session_date < v_m0) as prev_m
    from attendance a left join classes c on c.id = a.class_id
    where a.attendance_type in ('attended', 'full_kit') and a.session_date >= v_m0 - interval '1 month' and a.session_date < v_m0 + interval '1 month'
      and not coalesce(c.name ~* '(\mpts?\M[^a-z]*register)|(leaders?\M[^a-z]*register)', false)
    group by a.student_id
  )
  insert into points_pending (student_id, kind, label, detail, points)
  select s.student_id, 'improvement', 'Monthly improvement: ' || to_char(v_m0, 'YYYY-MM'),
         'Attended ' || s.last_m || ' sessions in ' || to_char(v_m0, 'FMMonth') || ' (was ' || s.prev_m || ')', coalesce(v_pts, 10)
  from sess s join students st on st.id = s.student_id join members m on m.id = st.member_id
  where s.last_m > s.prev_m and s.last_m >= 4 and coalesce(m.status, 'active') = 'active'
    and ((select public.kc_is_staff()) or s.student_id in (select public.kc_my_coached_student_ids()))
  on conflict (student_id, label) do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

-- coach decides: ✓ adds the points (individual), ✗ turns it down
create or replace function public.kc_decide_points_pending(p_id uuid, p_approve boolean)
returns int language plpgsql security definer set search_path = public as $$
declare r points_pending%rowtype;
begin
  select * into r from points_pending where id = p_id for update;
  if r.id is null or r.status <> 'pending' then return 0; end if;
  if not ((select public.kc_is_staff()) or ((select public.kc_is_head_coach()) and r.student_id in (select public.kc_my_coached_student_ids()))) then
    raise exception 'Not allowed';
  end if;
  update points_pending set status = case when p_approve then 'approved' else 'rejected' end, decided_by = auth.uid(), decided_at = now() where id = p_id;
  if not p_approve then return 0; end if;
  insert into points_log (student_id, point_type, points_awarded, point_scope, awarded_at, note)
    values (r.student_id, r.label, r.points, 'individual', now(), r.detail);
  update students set individual_points = coalesce(individual_points, 0) + r.points where id = r.student_id;
  return r.points;
end $$;

revoke all on function public.kc_add_pb_pending(uuid, text, numeric, numeric, text, date), public.kc_generate_monthly_improvements(), public.kc_decide_points_pending(uuid, boolean) from public, anon;
grant execute on function public.kc_add_pb_pending(uuid, text, numeric, numeric, text, date), public.kc_generate_monthly_improvements(), public.kc_decide_points_pending(uuid, boolean) to authenticated;
notify pgrst, 'reload schema';

select 'points_pending ready' as status, (select count(*) from points_pending) as rows;
