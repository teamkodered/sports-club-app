-- ════════════════════════════════════════════════════════════════════════
-- ATHLETE AWARDS FIX  (undo: supabase_athlete_awards_fix_undo.sql)
-- Athlete-app house points (self check-in, F2F question, PDP) were blocked
-- from the points log, while the totals still went up -- so totals and
-- history drifted apart. These functions do both together, safely:
--   • only for the logged-in athlete's OWN record
--   • only the four athlete reasons, points taken from Settings
--     (settings 'athlete_house_points'), never from the phone
--   • each award once per day (per question for F2F; an undo frees it again)
-- Plus "set my weight" for weigh-ins from the athlete app.
-- (Locking adjust_student_points / adjust_house_points to staff comes next,
--  once their current definitions have been checked.)
-- ════════════════════════════════════════════════════════════════════════

create or replace function public.kc_award_my_points(p_reason text, p_detail text default null)
returns int language plpgsql security definer set search_path = public as $$
declare
  v_student uuid; v_house text; v_amount int; v_label text; v_net int;
  v_labels jsonb := '{"f2f_question":"F2F question logged","checkin":"Self check-in (app)","pdp_complete":"PDP task completed","pdp_calendar":"PDP added to calendar"}';
begin
  if not (v_labels ? p_reason) then raise exception 'Unknown reason'; end if;
  select s.id, coalesce(h.name, s.house_name) into v_student, v_house
    from students s join members m on m.id = s.member_id left join houses h on h.id = m.house_id
    where m.auth_id = auth.uid() limit 1;
  if v_student is null then raise exception 'No athlete record for this login'; end if;
  select coalesce(nullif((value ->> p_reason), '')::int, 1) into v_amount from settings where key = 'athlete_house_points';
  v_amount := coalesce(v_amount, 1);
  if v_amount <= 0 then return 0; end if;
  v_label := (v_labels ->> p_reason) || case when p_detail is not null and p_detail <> '' then ': ' || p_detail else '' end;
  -- once per day: awards minus undos for this exact reason today
  select count(*) filter (where point_type = v_label)
       - count(*) filter (where point_type = replace(v_label, 'F2F question logged', 'F2F question cleared'))
    into v_net from points_log
    where student_id = v_student and awarded_at >= date_trunc('day', now())
      and point_type in (v_label, replace(v_label, 'F2F question logged', 'F2F question cleared'));
  if p_reason = 'f2f_question' and v_net > 0 then return 0; end if;
  if p_reason <> 'f2f_question' and v_net > 0 then return 0; end if;
  insert into points_log (student_id, point_type, points_awarded, point_scope, awarded_at)
    values (v_student, v_label, v_amount, 'both', now());
  update students set house_points = coalesce(house_points, 0) + v_amount,
                      individual_points = coalesce(individual_points, 0) + v_amount where id = v_student;
  if v_house is not null then update houses set points = coalesce(points, 0) + v_amount where name = v_house; end if;
  return v_amount;
end $$;

-- Taking back today's F2F question point when the athlete clears that question
create or replace function public.kc_revoke_my_f2f_point(p_detail text)
returns int language plpgsql security definer set search_path = public as $$
declare v_student uuid; v_house text; v_amount int; v_net int;
        v_award text := 'F2F question logged: ' || p_detail; v_undo text := 'F2F question cleared: ' || p_detail;
begin
  select s.id, coalesce(h.name, s.house_name) into v_student, v_house
    from students s join members m on m.id = s.member_id left join houses h on h.id = m.house_id
    where m.auth_id = auth.uid() limit 1;
  if v_student is null then return 0; end if;
  select count(*) filter (where point_type = v_award) - count(*) filter (where point_type = v_undo),
         max(points_awarded) filter (where point_type = v_award)
    into v_net, v_amount from points_log
    where student_id = v_student and awarded_at >= date_trunc('day', now()) and point_type in (v_award, v_undo);
  if coalesce(v_net, 0) <= 0 or coalesce(v_amount, 0) <= 0 then return 0; end if;
  insert into points_log (student_id, point_type, points_awarded, point_scope, awarded_at)
    values (v_student, v_undo, -v_amount, 'both', now());
  update students set house_points = coalesce(house_points, 0) - v_amount,
                      individual_points = coalesce(individual_points, 0) - v_amount where id = v_student;
  if v_house is not null then update houses set points = coalesce(points, 0) - v_amount where name = v_house; end if;
  return v_amount;
end $$;

-- Weigh-ins from the athlete app (own record only, sensible range)
create or replace function public.kc_set_my_weight(p_kg numeric)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_kg is null or p_kg < 15 or p_kg > 250 then raise exception 'Weight out of range'; end if;
  update students set weight_kg = round(p_kg, 1)
    where member_id in (select id from members where auth_id = auth.uid());
end $$;

revoke all on function public.kc_award_my_points(text, text), public.kc_revoke_my_f2f_point(text), public.kc_set_my_weight(numeric) from public, anon;
grant execute on function public.kc_award_my_points(text, text), public.kc_revoke_my_f2f_point(text), public.kc_set_my_weight(numeric) to authenticated;
