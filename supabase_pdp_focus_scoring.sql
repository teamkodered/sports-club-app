-- PDP SCORING (Oct 2026)
--   ✓ PDP done for today   -> 5 points, once a day
--   🎯 today's focus action -> 5 points, once a day
--   any other PDP action    -> can still be ticked, no points
-- Amounts can be changed in Settings → athlete self-service points.

insert into public.settings (key, value) values ('athlete_house_points', '{"pdp_action": 0, "pdp_focus": 5, "pdp_day": 5}'::jsonb)
on conflict (key) do update set value = coalesce(public.settings.value, '{}'::jsonb) || '{"pdp_action": 0, "pdp_focus": 5, "pdp_day": 5}'::jsonb;

create or replace function public.kc_award_my_points(p_reason text, p_detail text default null)
returns int language plpgsql security definer set search_path = public as $$
declare
  v_student uuid; v_house text; v_amount int; v_label text; v_undo text; v_net int; v_cap int; v_today int;
  v_labels jsonb := '{"f2f_question":"F2F question logged","checkin":"Self check-in (app)","checkout":"Self check-out (app)",
    "weigh_in":"Weigh in","weigh_out":"Weigh out","pdp_action":"PDP action done",
    "pdp_complete":"PDP task completed","pdp_focus":"PDP focus action done","pdp_day":"PDP done for today","pdp_calendar":"PDP added to calendar","target_week":"Weekly target hit"}';
begin
  if not (v_labels ? p_reason) then raise exception 'Unknown reason'; end if;
  select s.id, coalesce(h.name, s.house_name) into v_student, v_house
    from students s join members m on m.id = s.member_id left join houses h on h.id = m.house_id
    where m.auth_id = auth.uid() limit 1;
  if v_student is null then raise exception 'No athlete record for this login'; end if;
  select nullif((value ->> p_reason), '')::int into v_amount from settings where key = 'athlete_house_points';
  v_amount := coalesce(v_amount, case p_reason when 'checkin' then 3 when 'checkout' then 3 when 'weigh_in' then 5
                                               when 'weigh_out' then 5 when 'pdp_action' then 0 when 'pdp_focus' then 5 when 'pdp_day' then 5 when 'pdp_complete' then 5 when 'target_week' then 10 else 1 end);
  if v_amount <= 0 then return 0; end if;
  v_label := (v_labels ->> p_reason) || case when coalesce(p_detail, '') <> '' then ': ' || left(p_detail, 120) else '' end;
  -- one award at a time per athlete + item: a double tap / two devices can't both slip past the check
  perform pg_advisory_xact_lock(hashtext(v_student::text || '|' || v_label));
  v_undo  := replace(replace(replace(replace(v_label, 'F2F question logged', 'F2F question cleared'), 'PDP action done', 'PDP action undone'), 'PDP focus action done', 'PDP focus action undone'), 'PDP done for today', 'PDP done for today undone');
  select count(*) filter (where point_type = v_label) - count(*) filter (where point_type = v_undo)
    into v_net from points_log
    where student_id = v_student and awarded_at >= date_trunc('day', now()) and point_type in (v_label, v_undo);
  if coalesce(v_net, 0) > 0 then return 0; end if;
  -- PDP actions: no more than the daily cap (default 10) in PDP points per day, however many are ticked
  if p_reason = 'pdp_action' then
    perform pg_advisory_xact_lock(hashtext(v_student::text || '|pdp-daily-cap'));
    select coalesce(nullif(value ->> 'pdp_daily_cap', '')::int, 10) into v_cap from settings where key = 'athlete_house_points';
    v_cap := coalesce(v_cap, 10);
    select coalesce(sum(points_awarded), 0) into v_today from points_log
      where student_id = v_student and awarded_at >= date_trunc('day', now())
        and (point_type like 'PDP action done%' or point_type like 'PDP action undone%');
    if v_today >= v_cap then return 0; end if;
    v_amount := least(v_amount, v_cap - v_today);
  end if;
  -- the weekly target bonus only ever once per section per week (the detail names the week)
  if p_reason = 'target_week' and exists (select 1 from points_log where student_id = v_student and point_type = v_label) then return 0; end if;
  insert into points_log (student_id, point_type, points_awarded, point_scope, awarded_at)
    values (v_student, v_label, v_amount, 'both', now());
  update students set house_points = coalesce(house_points, 0) + v_amount,
                      individual_points = coalesce(individual_points, 0) + v_amount where id = v_student;
  if v_house is not null then update houses set points = coalesce(points, 0) + v_amount where name = v_house; end if;
  return v_amount;
end $$;

-- taking back today's award when it's unticked (focus action / PDP done for today / old per-action)
create or replace function public.kc_revoke_my_points(p_reason text, p_detail text default null)
returns int language plpgsql security definer set search_path = public as $$
declare v_student uuid; v_house text; v_amount int; v_net int; v_label text; v_undo text;
begin
  v_label := case p_reason when 'pdp_action' then 'PDP action done' when 'pdp_focus' then 'PDP focus action done'
                           when 'pdp_day' then 'PDP done for today' end;
  if v_label is null then raise exception 'This award can''t be taken back here'; end if;
  select s.id, coalesce(h.name, s.house_name) into v_student, v_house
    from students s join members m on m.id = s.member_id left join houses h on h.id = m.house_id
    where m.auth_id = auth.uid() limit 1;
  if v_student is null then return 0; end if;
  v_label := v_label || case when coalesce(p_detail, '') <> '' then ': ' || left(p_detail, 120) else '' end;
  v_undo  := case p_reason when 'pdp_action' then replace(v_label, 'PDP action done', 'PDP action undone')
                           when 'pdp_focus' then replace(v_label, 'PDP focus action done', 'PDP focus action undone')
                           else replace(v_label, 'PDP done for today', 'PDP done for today undone') end;
  perform pg_advisory_xact_lock(hashtext(v_student::text || '|' || v_label));
  select count(*) filter (where point_type = v_label) - count(*) filter (where point_type = v_undo),
         max(points_awarded) filter (where point_type = v_label)
    into v_net, v_amount from points_log
    where student_id = v_student and awarded_at >= date_trunc('day', now()) and point_type in (v_label, v_undo);
  if coalesce(v_net, 0) <= 0 or coalesce(v_amount, 0) <= 0 then return 0; end if;
  insert into points_log (student_id, point_type, points_awarded, point_scope, awarded_at)
    values (v_student, v_undo, -v_amount, 'both', now());
  update students set house_points = coalesce(house_points, 0) - v_amount,
                      individual_points = coalesce(individual_points, 0) - v_amount where id = v_student;
  if v_house is not null then update houses set points = coalesce(points, 0) - v_amount where name = v_house; end if;
  return v_amount;
end $$;
revoke all on function public.kc_revoke_my_points(text, text) from public, anon;
grant execute on function public.kc_revoke_my_points(text, text) to authenticated;

select value ->> 'pdp_day' as pdp_done_for_today, value ->> 'pdp_focus' as focus_action, value ->> 'pdp_action' as other_actions
from settings where key = 'athlete_house_points';
