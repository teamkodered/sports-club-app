-- PDP + targets points (Oct 2026): PDP action done 5, PDP task completed 5, weekly target hit +10
-- (once per section per week). Normal tasks stay 1. Run once (replaces supabase_pdp_points_5.sql / supabase_target_week_bonus.sql).
insert into public.settings (key, value) values ('athlete_house_points', '{"pdp_action": 5, "pdp_complete": 5, "target_week": 10}'::jsonb)
on conflict (key) do update set value = coalesce(public.settings.value, '{}'::jsonb) || '{"pdp_action": 5, "pdp_complete": 5, "target_week": 10}'::jsonb;

create or replace function public.kc_award_my_points(p_reason text, p_detail text default null)
returns int language plpgsql security definer set search_path = public as $$
declare
  v_student uuid; v_house text; v_amount int; v_label text; v_undo text; v_net int;
  v_labels jsonb := '{"f2f_question":"F2F question logged","checkin":"Self check-in (app)","checkout":"Self check-out (app)",
    "weigh_in":"Weigh in","weigh_out":"Weigh out","pdp_action":"PDP action done",
    "pdp_complete":"PDP task completed","pdp_calendar":"PDP added to calendar","target_week":"Weekly target hit"}';
begin
  if not (v_labels ? p_reason) then raise exception 'Unknown reason'; end if;
  select s.id, coalesce(h.name, s.house_name) into v_student, v_house
    from students s join members m on m.id = s.member_id left join houses h on h.id = m.house_id
    where m.auth_id = auth.uid() limit 1;
  if v_student is null then raise exception 'No athlete record for this login'; end if;
  select nullif((value ->> p_reason), '')::int into v_amount from settings where key = 'athlete_house_points';
  v_amount := coalesce(v_amount, case p_reason when 'checkin' then 3 when 'checkout' then 3 when 'weigh_in' then 5
                                               when 'weigh_out' then 5 when 'pdp_action' then 5 when 'pdp_complete' then 5 when 'target_week' then 10 else 1 end);
  if v_amount <= 0 then return 0; end if;
  v_label := (v_labels ->> p_reason) || case when coalesce(p_detail, '') <> '' then ': ' || left(p_detail, 120) else '' end;
  v_undo  := replace(replace(v_label, 'F2F question logged', 'F2F question cleared'), 'PDP action done', 'PDP action undone');
  select count(*) filter (where point_type = v_label) - count(*) filter (where point_type = v_undo)
    into v_net from points_log
    where student_id = v_student and awarded_at >= date_trunc('day', now()) and point_type in (v_label, v_undo);
  if coalesce(v_net, 0) > 0 then return 0; end if;
  -- the weekly target bonus only ever once per section per week (the detail names the week)
  if p_reason = 'target_week' and exists (select 1 from points_log where student_id = v_student and point_type = v_label) then return 0; end if;
  insert into points_log (student_id, point_type, points_awarded, point_scope, awarded_at)
    values (v_student, v_label, v_amount, 'both', now());
  update students set house_points = coalesce(house_points, 0) + v_amount,
                      individual_points = coalesce(individual_points, 0) + v_amount where id = v_student;
  if v_house is not null then update houses set points = coalesce(points, 0) + v_amount where name = v_house; end if;
  return v_amount;
end $$;
