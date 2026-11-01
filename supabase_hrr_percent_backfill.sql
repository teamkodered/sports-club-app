-- ❤️ Add HRR % to the heart rate recovery results already saved (Watt bike test):
-- HRR % = (start bpm - end bpm) / start bpm x 100. Only fills it in where it's missing.
update fit2fight_sessions
set test = test || jsonb_build_object('HRR % (Watt bike 1 min)',
  round((((test ->> 'HRR start heart rate (bpm)')::numeric - (test ->> 'HRR end heart rate (bpm)')::numeric)
         / (test ->> 'HRR start heart rate (bpm)')::numeric) * 100, 1))
where test ? 'HRR start heart rate (bpm)' and test ? 'HRR end heart rate (bpm)'
  and not test ? 'HRR % (Watt bike 1 min)'
  and (test ->> 'HRR start heart rate (bpm)') ~ '^[0-9.]+$' and (test ->> 'HRR end heart rate (bpm)') ~ '^[0-9.]+$'
  and (test ->> 'HRR start heart rate (bpm)')::numeric > 0
returning session_date, test ->> 'HRR start heart rate (bpm)' as start_bpm, test ->> 'HRR end heart rate (bpm)' as end_bpm, test ->> 'HRR % (Watt bike 1 min)' as hrr_pct;
