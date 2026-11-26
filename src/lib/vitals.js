// Latest wearable vitals and saved test values, shared by the athlete app and coach view.
// VO2 max isn't a column yet, so it's read from each day's raw provider data (Apple Health shortcut
// key 'vo2max', or a provider's VO2 max field); resting heart rate is a column.
const VO2_KEYS = ['vo2max', 'vo2_max', 'VO2Max', 'vo2Max', 'VO2_max', 'vo2']
export function wearableVitals(days = []) {
  const sorted = [...(days || [])].sort((a, b) => String(b.day).localeCompare(String(a.day)))
  let vo2 = null, rhr = null, rec = null, hrv = null
  for (const d of sorted) {
    if (!vo2) { const r = d.raw_data || {}; const k = VO2_KEYS.find(k => r[k] != null && r[k] !== '' && !isNaN(Number(r[k]))); if (k) vo2 = { value: Math.round(Number(r[k]) * 10) / 10, day: d.day } }
    if (!rhr && d.resting_heart_rate != null) rhr = { value: d.resting_heart_rate, day: d.day }
    if (!rec && d.recovery_score != null) rec = { value: Math.round(d.recovery_score), day: d.day }
    if (!hrv && d.hrv != null) hrv = { value: Math.round(d.hrv), day: d.day }
    if (vo2 && rhr && rec && hrv) break
  }
  return { vo2, rhr, rec, hrv }
}
export function latestTest(sessions = [], name) {
  const s = [...(sessions || [])].sort((a, b) => String(b.session_date).localeCompare(String(a.session_date))).find(x => x?.test?.[name] != null && x.test[name] !== '')
  return s ? { value: s.test[name], day: s.session_date } : null
}

// Every heart-rate-recovery result, wherever it was taken (profile Run test, Test session, Start activity -> recovery)
// -> newest first: { date, label, value, unit, start, end }
export function hrrResults(sessions = []) {
  const out = []
  for (const s of sessions || []) {
    const t = s?.test; if (!t || typeof t !== 'object') continue
    for (const [k, v] of Object.entries(t)) {
      const n = parseFloat(v); if (isNaN(n)) continue
      if (k === 'Heart Rate Recovery (1 min)') out.push({ date: s.session_date, label: 'Watt bike (profile test)', value: n, unit: ' bpm', start: t['HRR start heart rate (bpm)'], end: t['HRR end heart rate (bpm)'] })
      else if (/^HRR %/.test(k)) { const inner = k.match(/\((.*)\)/)?.[1] || ''; out.push({ date: s.session_date, label: inner || 'HR recovery', value: n, unit: '%', start: t[`HRR start bpm (${inner})`], end: t[`HRR end bpm (${inner})`] }) }
    }
  }
  return out.sort((a, b) => String(b.date).localeCompare(String(a.date)))
}

// Typo check for weights: more than ~15% away from the last known weight (e.g. 148.5 after 41.7) -> ask first.
// Returns true if OK to save.
export function confirmWeight(kg, lastKg) {
  const n = parseFloat(kg), last = parseFloat(lastKg)
  if (isNaN(n) || isNaN(last) || last <= 0) return true
  if (Math.abs(n - last) / last <= 0.15) return true
  return window.confirm(`${n}kg — is that right? The last weight was ${last}kg.`)
}
