-- One-off backfill: past wearable workouts -> Physical (all athletes)
--   runs (run / jog / treadmill)            -> fit2fight_sessions.running
--   other non-club activities (football…)   -> fit2fight_sessions.other_session
--   club sports (boxing, kickboxing, martial arts, functional, weights…) are left out (check-ins cover them)
-- Same entry shape and wearable_id key as the app's auto-fill, so nothing is added twice. Safe to re-run.
do $$
declare
  w record; d date; k text; mins int; e jsonb; fld text; cur jsonb; sid uuid;
begin
  for w in
    select ww.*, (ww.start_time at time zone 'Europe/London') as st_local,
           coalesce(ww.end_time, ww.start_time + make_interval(secs => coalesce(ww.duration_seconds, 3600))) at time zone 'Europe/London' as en_local
    from wearable_workouts ww
    where ww.start_time is not null
      and coalesce(ww.sport_name, '') !~* '(box|kick|martial|mma|muay|jiu|judo|karate|taekwondo|wrestl|functional|power ?lift|weight)'
  loop
    d := w.st_local::date;
    k := 'workout:' || w.provider || ':' || coalesce(w.provider_workout_id, w.id::text);
    mins := greatest(1, round(extract(epoch from (w.en_local - w.st_local)) / 60)::int);
    if coalesce(w.sport_name, '') ~* '(run|jog|treadmill)' then
      fld := 'running';
      e := jsonb_build_object('type', coalesce(w.sport_name, 'Run'), 'sets', jsonb_build_array(mins || ' min'), 'source', w.provider, 'wearable_id', k, 'unconfirmed', true);
    else
      fld := 'other_session';
      e := jsonb_build_object('type', coalesce(w.sport_name, 'Workout'), 'sets', jsonb_build_array(mins || ' min', to_char(w.st_local, 'HH24:MI') || '–' || to_char(w.en_local, 'HH24:MI')),
                              'source', w.provider, 'wearable_id', k, 'unconfirmed', true);
    end if;

    select id into sid from fit2fight_sessions where student_id = w.student_id and session_date = d limit 1;
    if sid is null then
      execute format('insert into fit2fight_sessions (student_id, session_date, %I) values ($1, $2, $3)', fld) using w.student_id, d, jsonb_build_array(e);
    else
      execute format('select %I::jsonb from fit2fight_sessions where id = $1', fld) into cur using sid;
      cur := case when cur is null then '[]'::jsonb when jsonb_typeof(cur) = 'array' then cur else jsonb_build_array(cur) end;
      if not exists (select 1 from jsonb_array_elements(cur) x where x ->> 'wearable_id' = k) then
        execute format('update fit2fight_sessions set %I = $1 where id = $2', fld) using cur || jsonb_build_array(e), sid;
      end if;
    end if;
  end loop;
end $$;

-- check: how many were added
select count(*) filter (where x ->> 'wearable_id' like 'workout:%') as wearable_entries
from fit2fight_sessions f, jsonb_array_elements(case when jsonb_typeof(f.running::jsonb) = 'array' then f.running::jsonb else '[]'::jsonb end
                                               || case when jsonb_typeof(f.other_session::jsonb) = 'array' then f.other_session::jsonb else '[]'::jsonb end) x;
