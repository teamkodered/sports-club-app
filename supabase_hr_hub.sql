-- Gym heart rate hub: coaches can put athletes' live heart rate on the board from the hub device
drop policy if exists live_hr_staff_write on public.live_hr;
create policy live_hr_staff_write on public.live_hr for all to authenticated
  using (public.kc_is_coach_staff()) with check (public.kc_is_coach_staff());
