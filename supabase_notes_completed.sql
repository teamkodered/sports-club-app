-- Notes can be ticked off as done (green) in the athlete app + coach view
alter table public.athlete_notes_log add column if not exists completed_at timestamptz;
