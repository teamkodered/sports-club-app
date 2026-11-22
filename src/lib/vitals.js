// Latest wearable vitals and saved test values, shared by the athlete app and coach view.
// VO2 max isn't a column yet, so it's read from each day's raw provider data (Apple Health shortcut
// key 'vo2max', or a provider's VO2 max field); resting heart rate is a column.
const VO2_KEYS = ['vo2max', 'vo2_max', 'VO2Max', 'vo2Max', 'VO2_max', 'vo2']
export function wearableVitals(days = []) {
  const sorted = [...(days || [])].sort((a, b) => String(b.day).localeCompare(String(a.day)))
  let vo2 = null, rhr = null
  for (const d of sorted) {
    if (!vo2) { const r = d.raw_data || {}; const k = VO2_KEYS.find(k => r[k] != null && r[k] !== '' && !isNaN(Number(r[k]))); if (k) vo2 = { value: Math.round(Number(r[k]) * 10) / 10, day: d.day } }
    if (!rhr && d.resting_heart_rate != null) rhr = { value: d.resting_heart_rate, day: d.day }
    if (vo2 && rhr) break
  }
  return { vo2, rhr }
}
export function latestTest(sessions = [], name) {
  const s = [...(sessions || [])].sort((a, b) => String(b.session_date).localeCompare(String(a.session_date))).find(x => x?.test?.[name] != null && x.test[name] !== '')
  return s ? { value: s.test[name], day: s.session_date } : null
}
