-- Self check-in in the athlete app: 7 house points (it replaces the register's attendance / full kit points)
insert into public.settings (key, value) values ('athlete_house_points', '{"checkin": 7}'::jsonb)
on conflict (key) do update set value = coalesce(public.settings.value, '{}'::jsonb) || '{"checkin": 7}'::jsonb;

select value from public.settings where key = 'athlete_house_points';   -- check: "checkin": 7
