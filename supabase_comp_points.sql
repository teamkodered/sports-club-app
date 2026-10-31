-- ════════════════════════════════════════════════════════════════════════
-- 🏆 COMP POINTS -- kept separate from individual / house points
-- ════════════════════════════════════════════════════════════════════════

-- 1) a separate total on each student
alter table public.students add column if not exists comp_points numeric not null default 0;

-- 2) points_log entries can be 'comp' (not added to individual / house)
do $$ declare c text; begin
  select conname into c from pg_constraint
   where conrelid = 'public.points_log'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%point_scope%';
  if c is not null then execute format('alter table public.points_log drop constraint %I', c); end if;
end $$;
alter table public.points_log add constraint points_log_point_scope_check
  check (point_scope in ('house', 'individual', 'both', 'comp'));

-- 3) changing a comp total: staff for anyone, head coaches for their own students
create or replace function public.adjust_comp_points(p_student_id uuid, p_delta numeric)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not (public.kc_is_staff() or (public.kc_is_head_coach() and p_student_id in (select public.kc_my_coached_student_ids()))) then
    return;
  end if;
  update students set comp_points = coalesce(comp_points, 0) + p_delta where id = p_student_id;
end $$;
revoke all on function public.adjust_comp_points(uuid, numeric) from public, anon;
grant execute on function public.adjust_comp_points(uuid, numeric) to authenticated;

-- 4) mark the competition reasons as 🏆 comp (Competition, Competition Place, Competition win,
--    Test Fight, Test Fight Win). Change any of them later: hold the reason in a register → tick / untick.
update public.settings
set value = (select jsonb_agg(case when (t ->> 'label') ~* '^(competition|test fight)' then t || '{"comp": true}'::jsonb else t end)
             from jsonb_array_elements(value) t)
where key = 'point_types';

notify pgrst, 'reload schema';

select t ->> 'label' as reason, t ->> 'points' as points from settings, jsonb_array_elements(value) t
where key = 'point_types' and (t ->> 'comp')::boolean;
