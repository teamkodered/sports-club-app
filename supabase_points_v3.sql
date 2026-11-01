-- ════════════════════════════════════════════════════════════════════════
-- POINTS v3 (Nov 2026) -- from now on, nothing past is recalculated
--   App points go to the athlete's INDIVIDUAL total only (houses = coach-awarded points)
--   Per class: check in 2 · weigh in 2 · check out 1 · weigh out 2 · full check-in bonus 3
--   PDP done for today 5 · PDP focus 5 · focus question 3 · always-on 1
--   Question points capped at 9 a day · weekly target 10
-- (Register: attendance 3 / full kit 5 / weekly consistency +5 are in the app; No kit -2 and
--  'Home practice' +5 are set at the bottom.)
-- ════════════════════════════════════════════════════════════════════════

insert into public.settings (key, value)
values ('athlete_house_points', '{"checkin":2,"checkout":1,"weigh_in":2,"weigh_out":2,"full_checkin":3,"pdp_action":0,"pdp_focus":5,"pdp_day":5,"pdp_daily_cap":10,"f2f_question":1,"f2f_focus":3,"f2f_daily_cap":9,"pdp_complete":5,"target_week":10}'::jsonb)
on conflict (key) do update set value = coalesce(public.settings.value, '{}'::jsonb)
  || '{"checkin":2,"checkout":1,"weigh_in":2,"weigh_out":2,"full_checkin":3,"pdp_action":0,"pdp_focus":5,"pdp_day":5,"pdp_daily_cap":10,"f2f_question":1,"f2f_focus":3,"f2f_daily_cap":9,"pdp_complete":5,"target_week":10}'::jsonb;

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
  v_amount := coalesce(v_amount, case p_reason when 'checkin' then 2 when 'checkout' then 1 when 'weigh_in' then 2 when 'weigh_out' then 2
                 when 'full_checkin' then 3 when 'f2f_focus' then 3 when 'pdp_action' then 0 when 'pdp_focus' then 5 when 'pdp_day' then 5
                 when 'pdp_complete' then 5 when 'target_week' then 10 else 1 end);
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
  insert into points_log (student_id, point_type, points_awarded, point_scope, awarded_at)
    values (v_student, v_label, v_amount, 'individual', now());
  update students set individual_points = coalesce(individual_points, 0) + v_amount where id = v_student;
  return v_amount;
end $$;

-- taking back today's PDP award -- reverses exactly what was given (house too if it was an older 'both' award)
create or replace function public.kc_revoke_my_points(p_reason text, p_detail text default null)
returns int language plpgsql security definer set search_path = public as $$
declare v_student uuid; v_house text; v_amount int; v_net int; v_label text; v_undo text; v_scope text;
begin
  v_label := case p_reason when 'pdp_action' then 'PDP action done' when 'pdp_focus' then 'PDP focus action done' when 'pdp_day' then 'PDP done for today' end;
  if v_label is null then raise exception 'This award can''t be taken back here'; end if;
  select s.id, coalesce(h.name, s.house_name) into v_student, v_house
    from students s join members m on m.id = s.member_id left join houses h on h.id = m.house_id where m.auth_id = auth.uid() limit 1;
  if v_student is null then return 0; end if;
  v_label := v_label || case when coalesce(p_detail, '') <> '' then ': ' || left(p_detail, 120) else '' end;
  v_undo := replace(replace(replace(v_label, 'PDP action done', 'PDP action undone'), 'PDP focus action done', 'PDP focus action undone'), 'PDP done for today', 'PDP done for today undone');
  perform pg_advisory_xact_lock(hashtext(v_student::text || '|' || v_label));
  select count(*) filter (where point_type = v_label) - count(*) filter (where point_type = v_undo) into v_net
    from points_log where student_id = v_student and awarded_at >= date_trunc('day', now()) and point_type in (v_label, v_undo);
  if coalesce(v_net, 0) <= 0 then return 0; end if;
  select points_awarded, point_scope into v_amount, v_scope from points_log
    where student_id = v_student and awarded_at >= date_trunc('day', now()) and point_type = v_label order by awarded_at desc limit 1;
  if coalesce(v_amount, 0) <= 0 then return 0; end if;
  insert into points_log (student_id, point_type, points_awarded, point_scope, awarded_at) values (v_student, v_undo, -v_amount, v_scope, now());
  update students set individual_points = coalesce(individual_points, 0) - v_amount,
                      house_points = coalesce(house_points, 0) - case when v_scope = 'both' then v_amount else 0 end where id = v_student;
  if v_scope = 'both' and v_house is not null then update houses set points = coalesce(points, 0) - v_amount where name = v_house; end if;
  return v_amount;
end $$;

-- un-logging a question: same, reverses exactly what was given
create or replace function public.kc_revoke_my_f2f_point(p_detail text)
returns int language plpgsql security definer set search_path = public as $$
declare v_student uuid; v_house text; v_amount int; v_net int; v_label text; v_undo text; v_scope text;
begin
  select s.id, coalesce(h.name, s.house_name) into v_student, v_house
    from students s join members m on m.id = s.member_id left join houses h on h.id = m.house_id where m.auth_id = auth.uid() limit 1;
  if v_student is null then return 0; end if;
  v_label := 'F2F question logged: ' || left(coalesce(p_detail, ''), 120);
  v_undo := 'F2F question cleared: ' || left(coalesce(p_detail, ''), 120);
  perform pg_advisory_xact_lock(hashtext(v_student::text || '|' || v_label));
  select count(*) filter (where point_type = v_label) - count(*) filter (where point_type = v_undo) into v_net
    from points_log where student_id = v_student and awarded_at >= date_trunc('day', now()) and point_type in (v_label, v_undo);
  if coalesce(v_net, 0) <= 0 then return 0; end if;
  select points_awarded, point_scope into v_amount, v_scope from points_log
    where student_id = v_student and awarded_at >= date_trunc('day', now()) and point_type = v_label order by awarded_at desc limit 1;
  if coalesce(v_amount, 0) <= 0 then return 0; end if;
  insert into points_log (student_id, point_type, points_awarded, point_scope, awarded_at) values (v_student, v_undo, -v_amount, v_scope, now());
  update students set individual_points = coalesce(individual_points, 0) - v_amount,
                      house_points = coalesce(house_points, 0) - case when v_scope = 'both' then v_amount else 0 end where id = v_student;
  if v_scope = 'both' and v_house is not null then update houses set points = coalesce(points, 0) - v_amount where name = v_house; end if;
  return v_amount;
end $$;

revoke all on function public.kc_award_my_points(text, text), public.kc_revoke_my_points(text, text), public.kc_revoke_my_f2f_point(text) from public, anon;
grant execute on function public.kc_award_my_points(text, text), public.kc_revoke_my_points(text, text), public.kc_revoke_my_f2f_point(text) to authenticated;

-- Register reasons: No kit -3 -> -2, add 'Home practice' +5 (General)
update public.settings
set value = (select jsonb_agg(case when lower(t ->> 'label') = 'no kit' then jsonb_set(t, '{points}', '-2'::jsonb) else t end) from jsonb_array_elements(value) t)
where key = 'point_types';
update public.settings
set value = value || '[{"label": "Home practice", "points": 5, "group": "General"}]'::jsonb
where key = 'point_types' and not exists (select 1 from jsonb_array_elements(value) t where lower(t ->> 'label') = 'home practice');

select t ->> 'label' as reason, t ->> 'points' as points from settings, jsonb_array_elements(value) t
where key = 'point_types' and lower(t ->> 'label') in ('no kit', 'home practice', 'attendance', 'full kit');
