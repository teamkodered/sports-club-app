-- ════════════════════════════════════════════════════════════════════════
-- POINTS RULES (Oct 2026)
--   check in 3 · check out 3 · weigh in 5 · weigh out 5 (each class, once a day)
--   each PDP action ticked done 2 (once a day each; unticking takes it back)
-- ════════════════════════════════════════════════════════════════════════

-- 1) The amounts (editable later in Settings → athlete self-service points)
insert into public.settings (key, value)
values ('athlete_house_points', '{"checkin":3,"checkout":3,"weigh_in":5,"weigh_out":5,"pdp_action":2}'::jsonb)
on conflict (key) do update set value = coalesce(public.settings.value, '{}'::jsonb)
  || '{"checkin":3,"checkout":3,"weigh_in":5,"weigh_out":5,"pdp_action":2}'::jsonb;

-- 2) Awarding (own record only, amounts from Settings, once a day per reason + class / PDP action)
create or replace function public.kc_award_my_points(p_reason text, p_detail text default null)
returns int language plpgsql security definer set search_path = public as $$
declare
  v_student uuid; v_house text; v_amount int; v_label text; v_undo text; v_net int;
  v_labels jsonb := '{"f2f_question":"F2F question logged","checkin":"Self check-in (app)","checkout":"Self check-out (app)",
    "weigh_in":"Weigh in","weigh_out":"Weigh out","pdp_action":"PDP action done",
    "pdp_complete":"PDP task completed","pdp_calendar":"PDP added to calendar"}';
begin
  if not (v_labels ? p_reason) then raise exception 'Unknown reason'; end if;
  select s.id, coalesce(h.name, s.house_name) into v_student, v_house
    from students s join members m on m.id = s.member_id left join houses h on h.id = m.house_id
    where m.auth_id = auth.uid() limit 1;
  if v_student is null then raise exception 'No athlete record for this login'; end if;
  select nullif((value ->> p_reason), '')::int into v_amount from settings where key = 'athlete_house_points';
  v_amount := coalesce(v_amount, case p_reason when 'checkin' then 3 when 'checkout' then 3 when 'weigh_in' then 5
                                               when 'weigh_out' then 5 when 'pdp_action' then 2 else 1 end);
  if v_amount <= 0 then return 0; end if;
  v_label := (v_labels ->> p_reason) || case when coalesce(p_detail, '') <> '' then ': ' || left(p_detail, 120) else '' end;
  v_undo  := replace(replace(v_label, 'F2F question logged', 'F2F question cleared'), 'PDP action done', 'PDP action undone');
  select count(*) filter (where point_type = v_label) - count(*) filter (where point_type = v_undo)
    into v_net from points_log
    where student_id = v_student and awarded_at >= date_trunc('day', now()) and point_type in (v_label, v_undo);
  if coalesce(v_net, 0) > 0 then return 0; end if;
  insert into points_log (student_id, point_type, points_awarded, point_scope, awarded_at)
    values (v_student, v_label, v_amount, 'both', now());
  update students set house_points = coalesce(house_points, 0) + v_amount,
                      individual_points = coalesce(individual_points, 0) + v_amount where id = v_student;
  if v_house is not null then update houses set points = coalesce(points, 0) + v_amount where name = v_house; end if;
  return v_amount;
end $$;

-- 3) Taking back today's award (a PDP action unticked)
create or replace function public.kc_revoke_my_points(p_reason text, p_detail text default null)
returns int language plpgsql security definer set search_path = public as $$
declare v_student uuid; v_house text; v_amount int; v_net int; v_label text; v_undo text;
begin
  if p_reason <> 'pdp_action' then raise exception 'Only PDP actions can be taken back here'; end if;
  select s.id, coalesce(h.name, s.house_name) into v_student, v_house
    from students s join members m on m.id = s.member_id left join houses h on h.id = m.house_id
    where m.auth_id = auth.uid() limit 1;
  if v_student is null then return 0; end if;
  v_label := 'PDP action done' || case when coalesce(p_detail, '') <> '' then ': ' || left(p_detail, 120) else '' end;
  v_undo  := replace(v_label, 'PDP action done', 'PDP action undone');
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

revoke all on function public.kc_award_my_points(text, text), public.kc_revoke_my_points(text, text) from public, anon;
grant execute on function public.kc_award_my_points(text, text), public.kc_revoke_my_points(text, text) to authenticated;

select value from public.settings where key = 'athlete_house_points';
