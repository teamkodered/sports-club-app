-- PDP: 5 points for each PDP action ticked done and each PDP task completed (normal tasks stay 1)
insert into public.settings (key, value) values ('athlete_house_points', '{"pdp_action": 5, "pdp_complete": 5}'::jsonb)
on conflict (key) do update set value = coalesce(public.settings.value, '{}'::jsonb) || '{"pdp_action": 5, "pdp_complete": 5}'::jsonb;
