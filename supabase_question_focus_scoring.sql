-- QUESTION FOCUS SCORING (Oct 2026)
--   no question points in a section until that section's monthly 🎯 focus is chosen (the app checks this)
--   🎯 focus question logged -> 3 points, once a day ('always on' questions keep the normal 1)
-- Includes everything from supabase_pdp_focus_scoring.sql (PDP done for today / PDP focus).
insert into public.settings (key, value) values ('athlete_house_points', '{"f2f_focus": 3}'::jsonb)
on conflict (key) do update set value = coalesce(public.settings.value, '{}'::jsonb) || '{"f2f_focus": 3}'::jsonb;

create or replace function public.kc_award_my_points(p_reason text, p_detail text default null)
returns int language plpgsql security definer set search_path = public as $$
declare
  v_student uuid; v_house text; v_amount int; v_label text; v_undo text; v_net int; v_cap int; v_today int;
  v_labels jsonb := '{"f2f_question":"F2F question logged","f2f_focus":"F2F question logged","checkin":"Self check-in (app)","checkout":"Self check-out (app)",
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
                                               when 'weigh_out' then 5 when 'f2f_focus' then 3 when 'pdp_action' then 0 when 'pdp_focus' then 5 when 'pdp_day' then 5 when 'pdp_complete' then 5 when 'target_week' then 10 else 1 end);
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

select value ->> 'f2f_focus' as focus_question, value ->> 'f2f_question' as always_on_question,
       value ->> 'pdp_focus' as pdp_focus, value ->> 'pdp_day' as pdp_done_for_today
from settings where key = 'athlete_house_points';
