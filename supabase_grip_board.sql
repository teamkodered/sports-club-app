-- League: Grip board ranked by grip as a % of body weight (best hand). Body weight = that day's weigh-in,
-- otherwise their latest weight. Athletes with no weight at all aren't on the board.
create or replace function public.public_grip_board()
returns table (student_id uuid, display_name text, house_name text, grip numeric, weight numeric, pct numeric, session_date date)
language sql stable security definer set search_path = public as $$
  with g as (
    select f.student_id, f.session_date,
      (select max(nullif(regexp_replace(v.value, '[^0-9.]', '', 'g'), '')::numeric)
         from jsonb_each_text(f.test::jsonb) v where lower(v.key) like '%grip%') as grip,
      coalesce(f.weight_before, f.weight_after) as day_w
    from fit2fight_sessions f
    where f.test is not null
  ), w as (
    select g.*, coalesce(g.day_w,
      (select coalesce(x.weight_before, x.weight_after) from fit2fight_sessions x
        where x.student_id = g.student_id and coalesce(x.weight_before, x.weight_after) is not null
        order by x.session_date desc limit 1),
      (select s.weight_kg from students s where s.id = g.student_id)) as bw
    from g where g.grip > 0
  ), best as (
    select distinct on (w.student_id) w.student_id, w.grip, w.bw, w.session_date, round(w.grip / w.bw * 100) as pct
    from w where w.bw > 0
    order by w.student_id, w.grip / w.bw desc, w.session_date desc
  )
  select b.student_id, trim(coalesce(m.first_name, '') || ' ' || coalesce(upper(left(m.last_name, 1)) || '.', '')), s.house_name,
         b.grip, round(b.bw::numeric, 1), b.pct, b.session_date
  from best b join students s on s.id = b.student_id join members m on m.id = s.member_id
  where coalesce(m.status, '') not in ('stopped', 'not_started')
$$;
grant execute on function public.public_grip_board() to anon, authenticated;
