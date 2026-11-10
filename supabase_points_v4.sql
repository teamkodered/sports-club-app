-- ════════════════════════════════════════════════════════════════════════
-- POINTS v4 (Nov 2026) -- weighing = checking in / out, and fairer houses
--   ALL points (coach and app) count for the athlete AND their house.
--   Weigh in 3 + weigh out 3 (= check in / out); plain check-in / out and
--   the full check-in bonus = 0. Weekly target hit 5 per section (was 10).
--   Each day: the higher of WEIGHING (in + out) or the REGISTER (attendance 3 / full kit 5) counts --
--   never both (kickboxers and boxers alike). No weigh-in -> register points as normal.
--   This league period is recalculated with the new rules.
-- ════════════════════════════════════════════════════════════════════════
alter table public.points_log add column if not exists base_points numeric;   -- the full value before 'higher of' rule

insert into public.settings (key, value) values ('athlete_house_points', '{}'::jsonb) on conflict (key) do nothing;
update public.settings set value = coalesce(value, '{}'::jsonb) || '{"checkin":0,"checkout":0,"weigh_in":3,"weigh_out":3,"full_checkin":0,"target_week":5}'::jsonb
where key = 'athlete_house_points';

-- the 'higher of weighing or register' rule for one student and one day
create or replace function public.kc_reconcile_day(p_student uuid, p_day date, p_apply boolean default true)
returns jsonb language plpgsql security definer set search_path = public as $$
declare reg numeric; wgh numeric; win text; dh numeric := 0; di numeric := 0; r record; tgt numeric; v_house text;
begin
  update points_log set base_points = points_awarded
  where student_id = p_student and base_points is null and (awarded_at at time zone 'Europe/London')::date = p_day
    and (point_type in ('Attendance', 'Full Kit') or point_type ~ '^Weigh (in|out)');
  select coalesce(sum(base_points) filter (where point_type in ('Attendance', 'Full Kit')), 0),
         coalesce(sum(base_points) filter (where point_type ~ '^Weigh (in|out)'), 0)
    into reg, wgh
  from points_log where student_id = p_student and (awarded_at at time zone 'Europe/London')::date = p_day
    and (point_type in ('Attendance', 'Full Kit') or point_type ~ '^Weigh (in|out)');
  win := case when wgh > 0 and wgh >= reg then 'weigh' else 'register' end;
  for r in select id, point_type, points_awarded, base_points, point_scope from points_log
           where student_id = p_student and (awarded_at at time zone 'Europe/London')::date = p_day
             and (point_type in ('Attendance', 'Full Kit') or point_type ~ '^Weigh (in|out)') loop
    tgt := case when (r.point_type in ('Attendance', 'Full Kit')) = (win = 'register') then r.base_points else 0 end;
    if tgt is distinct from r.points_awarded then
      update points_log set points_awarded = tgt where id = r.id;
      if r.point_scope in ('both', 'house') then dh := dh + tgt - coalesce(r.points_awarded, 0); end if;
      if r.point_scope in ('both', 'individual') then di := di + tgt - coalesce(r.points_awarded, 0); end if;
    end if;
  end loop;
  if p_apply and (dh <> 0 or di <> 0) then
    update students set house_points = coalesce(house_points, 0) + dh, individual_points = coalesce(individual_points, 0) + di where id = p_student;
    select coalesce(h.name, s.house_name) into v_house from students s join members m on m.id = s.member_id left join houses h on h.id = m.house_id where s.id = p_student;
    if v_house is not null and dh <> 0 then update houses set points = coalesce(points, 0) + dh where name = v_house; end if;
  end if;
  return jsonb_build_object('house', dh, 'individual', di, 'counted', win);
end $$;
grant execute on function public.kc_reconcile_day(uuid, date, boolean) to authenticated;

-- run it automatically whenever a register mark or a weigh-in / out is added or removed
create or replace function public.kc_reconcile_trg()
returns trigger language plpgsql security definer set search_path = public as $$
declare rec record;
begin
  if coalesce(current_setting('kc.no_reconcile', true), '') = '1' then return null; end if;
  rec := coalesce(new, old);
  if rec.point_type in ('Attendance', 'Full Kit') or rec.point_type ~ '^Weigh (in|out)' then
    perform public.kc_reconcile_day(rec.student_id, (rec.awarded_at at time zone 'Europe/London')::date, true);
  end if;
  return null;
end $$;
drop trigger if exists kc_reconcile_points on public.points_log;
create trigger kc_reconcile_points after insert or delete on public.points_log
  for each row execute function public.kc_reconcile_trg();

create or replace function public.kc_award_my_points(p_reason text, p_detail text default null)
returns int language plpgsql security definer set search_path = public as $$
declare
  v_student uuid; v_amount int; v_label text; v_undo text; v_net int; v_cap int; v_today int;
  v_labels jsonb := '{"f2f_question":"F2F question logged","f2f_focus":"F2F question logged","checkin":"Self check-in (app)","checkout":"Self check-out (app)",
    "weigh_in":"Weigh in","weigh_out":"Weigh out","full_checkin":"Full check-in","pdp_action":"PDP action done",
    "pdp_complete":"PDP task completed","pdp_focus":"PDP focus action done","pdp_day":"PDP done for today","pdp_calendar":"PDP added to calendar","target_week":"Weekly target hit"}';
begin
  if not (v_labels ? p_reason) then raise exception 'Unknown reason'; end if;
  select s.id into v_student from students s join members m on m.id = s.member_id where m.auth_id = auth.uid() limit 1;
  if v_student is null then raise exception 'No athlete record for this login'; end if;
  select nullif((value ->> p_reason), '')::int into v_amount from settings where key = 'athlete_house_points';
  v_amount := coalesce(v_amount, case p_reason when 'checkin' then 0 when 'checkout' then 0 when 'weigh_in' then 3 when 'weigh_out' then 3
                 when 'full_checkin' then 0 when 'f2f_focus' then 3 when 'pdp_action' then 0 when 'pdp_focus' then 5 when 'pdp_day' then 5
                 when 'pdp_complete' then 5 when 'target_week' then 5 else 1 end);
  if v_amount <= 0 then return 0; end if;
  v_label := (v_labels ->> p_reason) || case when coalesce(p_detail, '') <> '' then ': ' || left(p_detail, 120) else '' end;
  perform pg_advisory_xact_lock(hashtext(v_student::text || '|' || v_label));
  -- once a day per item (per class for check-in / weigh-ins); 'undo' rows give it back
  v_undo := replace(replace(replace(replace(v_label, 'F2F question logged', 'F2F question cleared'), 'PDP action done', 'PDP action undone'),
                                    'PDP focus action done', 'PDP focus action undone'), 'PDP done for today', 'PDP done for today undone');
  if v_undo = v_label then v_undo := '(no undo)'; end if;
  select count(*) filter (where point_type = v_label) - count(*) filter (where point_type = v_undo) into v_net
    from points_log where student_id = v_student and awarded_at >= date_trunc('day', now()) and point_type in (v_label, v_undo);
  if coalesce(v_net, 0) > 0 then return 0; end if;
  -- daily caps: PDP actions (pdp_daily_cap) and question points (f2f_daily_cap, the monthly-focus +1 not counted)
  if p_reason = 'pdp_action' then
    perform pg_advisory_xact_lock(hashtext(v_student::text || '|pdp-daily-cap'));
    select coalesce(nullif(value ->> 'pdp_daily_cap', '')::int, 10) into v_cap from settings where key = 'athlete_house_points';
    select coalesce(sum(points_awarded), 0) into v_today from points_log where student_id = v_student and awarded_at >= date_trunc('day', now())
      and (point_type like 'PDP action done%' or point_type like 'PDP action undone%');
    if v_today >= coalesce(v_cap, 10) then return 0; end if;
    v_amount := least(v_amount, coalesce(v_cap, 10) - v_today);
  elsif p_reason in ('f2f_question', 'f2f_focus') and coalesce(p_detail, '') not like 'Monthly focus set%' then
    perform pg_advisory_xact_lock(hashtext(v_student::text || '|f2f-daily-cap'));
    select coalesce(nullif(value ->> 'f2f_daily_cap', '')::int, 9) into v_cap from settings where key = 'athlete_house_points';
    select coalesce(sum(points_awarded), 0) into v_today from points_log where student_id = v_student and awarded_at >= date_trunc('day', now())
      and (point_type like 'F2F question logged%' or point_type like 'F2F question cleared%')
      and point_type not like 'F2F question logged: Monthly focus set%';
    if v_today >= coalesce(v_cap, 9) then return 0; end if;
    v_amount := least(v_amount, coalesce(v_cap, 9) - v_today);
  end if;
  if p_reason = 'target_week' and exists (select 1 from points_log where student_id = v_student and point_type = v_label) then return 0; end if;
  -- individual points only (houses are coach-awarded points)
  -- every app point counts for the athlete AND their house (same as coach awards)
  insert into points_log (student_id, point_type, points_awarded, point_scope, awarded_at)
    values (v_student, v_label, v_amount, 'both', now());
  update students set individual_points = coalesce(individual_points, 0) + v_amount, house_points = coalesce(house_points, 0) + v_amount where id = v_student;
  update houses h set points = coalesce(h.points, 0) + v_amount
    from students s join members m on m.id = s.member_id left join houses hh on hh.id = m.house_id
    where s.id = v_student and h.name = coalesce(hh.name, s.house_name);
  -- (for weigh in / out the reconcile trigger then keeps only the higher of weighing / the register that day)
  return v_amount;
end $$;

-- ── recalculate this league period with the new rules ──────────────────────
begin;
set local kc.no_reconcile = '1';
create temp table kc_before on commit drop as
select id, student_id, point_scope, points_awarded from points_log
where awarded_at >= coalesce((select nullif(trim(both '"' from value::text), '')::date from settings where key = 'league_date_from'), date_trunc('month', now())::date);

-- app points count for the house too this period (same as coach awards)
update points_log set point_scope = 'both'
where id in (select id from kc_before) and point_scope = 'individual'
  and point_type ~ '^(F2F question|PDP|Self check|Weigh (in|out)|Full check-in|Weekly target|Test|Bleep|PB:|Monthly improvement)';
-- weigh in / out = 3 each; plain check-in / out / full check-in = 0; weekly target 5
update points_log set base_points = 3, points_awarded = 3, point_scope = 'both'
where id in (select id from kc_before) and point_type ~ '^Weigh (in|out)';
update points_log set points_awarded = 0, base_points = 0
where id in (select id from kc_before) and point_type ~ '^(Self check-in \(app\)|Self check-out \(app\)|Full check-in)';
update points_log set points_awarded = 5 where id in (select id from kc_before) and point_type like 'Weekly target hit%' and points_awarded > 5;
update points_log set base_points = points_awarded where id in (select id from kc_before) and point_type in ('Attendance', 'Full Kit') and base_points is null;

-- the higher of weighing / register each day (totals applied below in one go)
do $$ declare d record; begin
  for d in select distinct student_id, (awarded_at at time zone 'Europe/London')::date as day from points_log
           where id in (select id from kc_before) and point_type ~ '^Weigh (in|out)' loop
    perform public.kc_reconcile_day(d.student_id, d.day, false);
  end loop;
end $$;

-- apply the differences to students and houses
create temp table kc_delta on commit drop as
select b.student_id,
  sum(case when a.point_scope in ('both', 'house') then a.points_awarded else 0 end - case when b.point_scope in ('both', 'house') then b.points_awarded else 0 end) as dh,
  sum(case when a.point_scope in ('both', 'individual') then a.points_awarded else 0 end - case when b.point_scope in ('both', 'individual') then b.points_awarded else 0 end) as di
from kc_before b join points_log a on a.id = b.id group by b.student_id;
update students s set house_points = coalesce(s.house_points, 0) + d.dh, individual_points = coalesce(s.individual_points, 0) + d.di
from kc_delta d where s.id = d.student_id and (d.dh <> 0 or d.di <> 0);
update houses h set points = coalesce(h.points, 0) + x.dh
from (select coalesce(hh.name, s.house_name) as house, sum(d.dh) as dh from kc_delta d join students s on s.id = d.student_id
      join members m on m.id = s.member_id left join houses hh on hh.id = m.house_id group by 1) x
where h.name = x.house and x.dh <> 0;

select count(*) filter (where dh <> 0 or di <> 0) as students_changed, sum(dh) as house_points_change, sum(di) as individual_points_change from kc_delta;
commit;
notify pgrst, 'reload schema';
