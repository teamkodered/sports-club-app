-- Weekly target bonus: 10 points the first time a section's whole weekly target is hit (once per section per week)
insert into public.settings (key, value) values ('athlete_house_points', '{"target_week": 10}'::jsonb)
on conflict (key) do update set value = coalesce(public.settings.value, '{}'::jsonb) || '{"target_week": 10}'::jsonb;
