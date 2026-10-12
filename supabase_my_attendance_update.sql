-- Athletes changing their OWN check-in (re-open after check-out, check out, weigh in/out, full kit),
-- including an entry a coach marked on the register. Only today's / yesterday's entries, and only
-- these fields -- nothing else on the attendance record can be changed this way.
create or replace function public.kc_my_attendance_update(p_id uuid, p_changes jsonb)
returns setof public.attendance language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from attendance a where a.id = p_id
                   and a.student_id in (select public.kc_my_student_ids())
                   and a.session_date >= current_date - 1) then
    raise exception 'You can only change your own check-ins from today or yesterday';
  end if;
  return query
  update attendance set
    checked_out_at  = case when p_changes ? 'checked_out_at' then nullif(p_changes->>'checked_out_at', '')::timestamptz else checked_out_at end,
    present         = case when p_changes ? 'present' then (p_changes->>'present')::boolean else present end,
    weight_before   = case when p_changes ? 'weight_before' then nullif(p_changes->>'weight_before', '')::numeric else weight_before end,
    weight_after    = case when p_changes ? 'weight_after' then nullif(p_changes->>'weight_after', '')::numeric else weight_after end,
    attendance_type = case when p_changes->>'attendance_type' in ('attended', 'full_kit') then p_changes->>'attendance_type' else attendance_type end
  where id = p_id
  returning *;
end $$;
grant execute on function public.kc_my_attendance_update(uuid, jsonb) to authenticated;
