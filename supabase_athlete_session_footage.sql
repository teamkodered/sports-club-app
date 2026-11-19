-- 🎥 ATHLETES SEE THEIR OWN SESSION FOOTAGE: CCTV clips from the sessions they attended, for the classes the
-- coaches open up (Media -> 👀 Athlete access), plus their own daytime check-ins (Mon-Fri) outside a session.
-- Setting 'athlete_footage' = { enabled, classes: [class ids], day_checkins, day_from 'HH:MM', day_to 'HH:MM' }
insert into public.settings (key, value)
select 'athlete_footage', jsonb_build_object(
  'enabled', true,
  -- starting choice: Wed Khaos, Wed Boxing and every Mon-Fri daytime class (starting before 5pm)
  'classes', coalesce((select jsonb_agg(c.id) from classes c where c.active is not false and (
      (c.day_of_week ilike 'wed%' and (c.name ilike '%khaos%' or c.name ilike '%kaos%' or c.name ilike '%boxing%'))
      or (c.day_of_week !~* '^(sat|sun)' and c.start_time::time < '17:00'::time))), '[]'::jsonb),
  'day_checkins', true, 'day_from', '06:00', 'day_to', '17:00')
where not exists (select 1 from public.settings where key = 'athlete_footage');

create or replace function public.kc_my_session_footage(p_days int default 45)
returns table (session_date date, label text, win_start timestamp, win_end timestamp, clip_id uuid, camera_name text,
               recorded_at timestamptz, duration_seconds int, storage_path text)
language plpgsql stable security definer set search_path = public as $$
declare cfg jsonb; v_student uuid; v_from time; v_to time;
begin
  select value into cfg from settings where key = 'athlete_footage';
  if cfg is null or coalesce((cfg->>'enabled')::boolean, false) = false then return; end if;
  select s.id into v_student from students s join members m on m.id = s.member_id where m.auth_id = auth.uid() limit 1;
  if v_student is null then return; end if;
  v_from := coalesce(nullif(cfg->>'day_from', ''), '06:00')::time; v_to := coalesce(nullif(cfg->>'day_to', ''), '17:00')::time;
  return query
  with att as (
    -- opened classes: the class time on that day
    select a.session_date as d, a.class_id as cid, c.name || ' ' || to_char(c.start_time::time, 'HH24:MI') as lbl,
           (a.session_date + c.start_time::time)::timestamp as ws,
           (a.session_date + coalesce(c.end_time::time, c.start_time::time + interval '60 minutes'))::timestamp as we
    from attendance a join classes c on c.id = a.class_id
    where a.student_id = v_student and a.session_date >= current_date - p_days
      and a.class_id::text in (select jsonb_array_elements_text(coalesce(cfg->'classes', '[]'::jsonb)))
    union all
    -- daytime check-ins (Mon-Fri) with no class: their own check-in -> check-out (or +90 min)
    select a.session_date, null::uuid, 'Check-in ' || to_char(a.attended_at at time zone 'Europe/London', 'HH24:MI'),
           (a.attended_at at time zone 'Europe/London')::timestamp,
           coalesce((a.checked_out_at at time zone 'Europe/London')::timestamp, (a.attended_at at time zone 'Europe/London')::timestamp + interval '90 minutes')
    from attendance a
    where a.student_id = v_student and a.class_id is null and coalesce((cfg->>'day_checkins')::boolean, false)
      and a.session_date >= current_date - p_days and a.attended_at is not null
      and extract(isodow from a.session_date) between 1 and 5
      and (a.attended_at at time zone 'Europe/London')::time between v_from and v_to
  )
  select att.d, att.lbl, att.ws, att.we, k.id, k.camera_name, k.recorded_at, k.duration_seconds, k.storage_path
  from att join cctv_clips k
    -- clip times are the recorder's wall clock saved as UTC digits; 10 min either side; >= 5 min overlap
    on (k.recorded_at at time zone 'UTC')::timestamp < att.we + interval '10 minutes'
   and (k.recorded_at at time zone 'UTC')::timestamp + make_interval(secs => coalesce(k.duration_seconds, 0)) > att.ws - interval '10 minutes'
   and least((k.recorded_at at time zone 'UTC')::timestamp + make_interval(secs => coalesce(k.duration_seconds, 0)), att.we + interval '10 minutes')
       - greatest((k.recorded_at at time zone 'UTC')::timestamp, att.ws - interval '10 minutes') >= interval '5 minutes'
   -- cameras hidden from athletes for that class (1 = Bags, 2 = Ring, 3 = Main / any other)
   and not coalesce((cfg->'hidden_cams'->(att.cid::text)) ? (case coalesce(substring(k.camera_name from '(\d+)')::int, 0) when 1 then '1' when 2 then '2' else '3' end), false)
  order by att.d desc, att.ws, k.recorded_at;
end $$;
grant execute on function public.kc_my_session_footage(int) to authenticated;
notify pgrst, 'reload schema';
-- KR Centre Wed 7pm: Main camera hidden from athletes
update settings set value = jsonb_set(coalesce(value, '{}'::jsonb), '{hidden_cams}',
  coalesce(value->'hidden_cams', '{}'::jsonb) || coalesce((select jsonb_object_agg(c.id::text, '["3"]'::jsonb) from classes c
    where c.name ilike '%kr centre%' and c.day_of_week ilike 'wed%' and c.start_time::time = '19:00'::time), '{}'::jsonb))
where key = 'athlete_footage';

select jsonb_array_length(value->'classes') as classes_opened, value->'hidden_cams' as hidden_cameras, value->>'day_checkins' as day_checkins from settings where key = 'athlete_footage';
