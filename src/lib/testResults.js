// Test session results -- one shared list of tests (athlete app + coach view).
// Results are stored on fit2fight_sessions.test as { [test name]: value } -- the
// same shape used since the start, so every old result keeps lining up. Test
// NAMES are the link to past results: don't rename one without mapping the old name.
// Body weight tests can have several 60-second sets: the best set is the value in
// test (as usual), and every set is kept separately in fit2fight_sessions.test_sets[name].
import { supabase } from './supabase.js'

export const TEST_CATEGORIES = [
  { key: 'jumps', label: 'Jumps', icon: '🦘', tests: [
    { name: 'Vertical Jump (distance)', unit: 'cm' },
    { name: 'Long Jump (distance)', unit: 'cm' },
  ]},
  { key: 'bleep', label: 'Bleep test', icon: '🏃', tests: [
    { name: 'Bleep test', unit: 'level' },
    // 10 m shuttles (same speeds) for small halls -- its own test, never mixed with 20 m
    { name: 'Bleep test (10m)', unit: 'level' },
  ]},
  { key: 'vo2max', label: 'VO2 Max', icon: '🫁', tests: [
    { name: 'VO2 Max', unit: 'ml/kg/min' },
  ]},
  { key: 'grip', label: 'Grip', icon: '✊', tests: [
    { name: 'Left Grip Test (kg)', unit: 'kg' },
    { name: 'Right Grip Test (kg)', unit: 'kg' },
    { name: 'Left Pinch Test - 5kg/10kg (time)', unit: 'sec' },
    { name: 'Right Pinch Test - 5kg/10kg (time)', unit: 'sec' },
  ]},
  { key: 'maxlifts', label: 'Max Lifts', icon: '🏋️', tests: [
    { name: 'Bench Press', unit: 'kg' },
    { name: 'Shoulder Press', unit: 'kg' },
    { name: 'Deadlift', unit: 'kg' },
    { name: 'Squat', unit: 'kg' },
  ]},
  { key: 'wattbike', label: 'Watt Bike', icon: '🚴', tests: [
    { name: 'Watt bike 10 second (output)', unit: 'W' },
    { name: 'Watt bike 30 sec (distance)', unit: 'km' },
    { name: 'Watt bike 1 min (distance)', unit: 'km' },
    { name: 'Watt bike 2 min (distance)', unit: 'km' },
    { name: 'Watt bike 3 min (distance)', unit: 'km' },
  ]},
  { key: 'fixedload', label: 'Fixed Load Circuit', icon: '🔴', tests: [
    { name: 'Fixed load circuit - Red', unit: 'sec' },
    { name: 'Fixed load circuit - Yellow', unit: 'sec' },
    { name: 'Fixed load circuit - Green', unit: 'sec' },
    { name: 'Fixed load circuit - Blue', unit: 'sec' },
    { name: 'Fixed load circuit - Black', unit: 'sec' },
  ]},
  { key: 'stretches', label: 'Stretches', icon: '🤸', tests: [
    { name: 'Hamstring Stretch (range)', unit: 'cm' },
    { name: 'Box Splits Stretch (range)', unit: 'cm' },
    { name: 'Front Splits - Left in front (range)', unit: 'cm' },
    { name: 'Front Splits - Right in front (range)', unit: 'cm' },
    { name: 'Shoulder flex - Right hand up (range)', unit: 'cm' },
    { name: 'Shoulder flex - Left hand up (range)', unit: 'cm' },
  ]},
  { key: 'timedrun', label: 'Timed Run', icon: '🏃', tests: [
    { name: '200m sprint', unit: 'sec' },
    { name: '1600m time trial', unit: 'sec' },
    { name: '4800m time trial', unit: 'sec' },
  ]},
  // Punch (Oct 2026): times come from 📹 Punch speed (mark hand starts moving ->
  // impact on a slow-mo video), counts from 📹 Count punches (hits detected in
  // a box drawn over the bag/pads, coach-corrected). Lower time = faster.
  { key: 'punch', label: 'Punch', icon: '🥊', tests: [
    { name: 'Jab time (ms)', unit: 'ms' },
    { name: 'Cross time (ms)', unit: 'ms' },
    { name: 'Lead hook time (ms)', unit: 'ms' },
    { name: 'Rear hook time (ms)', unit: 'ms' },
    { name: 'Punches per round', unit: 'punches' },
    { name: 'Punches per minute', unit: 'per min' },
  ]},
  { key: 'bodyweight', label: 'Body Weight Max Reps', icon: '💪', multiSet: true, tests: [
    { name: 'Push-ups - Regular (60s)', unit: 'reps' },
    { name: 'Push-ups - Tricep (60s)', unit: 'reps' },
    { name: 'Push-ups - Shoulder (60s)', unit: 'reps' },
    { name: 'Pull-ups - Regular (60s)', unit: 'reps' },
    { name: 'Pull-ups - Horizontal (60s)', unit: 'reps' },
    { name: 'Squats (60s)', unit: 'reps' },
  ]},
]

export const ALL_TESTS = TEST_CATEGORIES.flatMap(c => c.tests.map(t => ({ ...t, category: c })))
export const testInfo = name => ALL_TESTS.find(t => t.name === name)
// Times are better when lower (runs, circuits, pinch holds are 'sec' -- pinch is a hold, so higher is better)
export const lowerIsBetter = name => {
  const t = testInfo(name)
  if (!t) return false
  if (/pinch/i.test(name)) return false
  return t.unit === 'sec' || t.unit === 'ms'
}
const num = v => (v === '' || v == null || isNaN(Number(v))) ? null : Number(v)

// Best previous value for each test, from a list of sessions ({ session_date, test })
export function bestByTest(sessions, excludeDate = null) {
  const best = {}, last = {}
  ;[...(sessions || [])].sort((a, b) => String(a.session_date).localeCompare(String(b.session_date))).forEach(s => {
    if (excludeDate && s.session_date === excludeDate) return
    Object.entries(s.test || {}).forEach(([k, v]) => {
      const n = num(v); if (n == null || k === 'notes' || k === 'type') return
      last[k] = { value: n, date: s.session_date }
      if (best[k] == null || (lowerIsBetter(k) ? n < best[k] : n > best[k])) best[k] = n
    })
  })
  return { best, last }
}

// Save test results for one athlete on one date: merges into that day's session (creating it if needed).
// values: { name: number }, sets: { name: [numbers] }. Returns { error, pbs: [{ name, value, previous }] }
export async function saveTestResults(studentId, date, values, sets = {}) {
  const clean = Object.fromEntries(Object.entries(values).map(([k, v]) => [k, num(v)]).filter(([, v]) => v != null))
  if (!Object.keys(clean).length) return { error: null, pbs: [] }
  const { data: history, error: hErr } = await supabase.from('fit2fight_sessions').select('*').eq('student_id', studentId)
  if (hErr) return { error: hErr, pbs: [] }
  const { best } = bestByTest(history, date)
  const existing = (history || []).find(s => s.session_date === date)
  const prevTest = existing?.test || {}
  const cleanSets = Object.fromEntries(Object.entries(sets).map(([k, arr]) => [k, (arr || []).map(num).filter(v => v != null)]).filter(([, a]) => a.length > 1))
  const newTest = { ...prevTest, ...clean }
  const payload = { test: newTest }
  if (Object.keys(cleanSets).length) payload.test_sets = { ...(existing?.test_sets || {}), ...cleanSets }
  const write = pl => existing
    ? supabase.from('fit2fight_sessions').update(pl).eq('id', existing.id).select().single()
    : supabase.from('fit2fight_sessions').insert({ student_id: studentId, session_date: date, ...pl }).select().single()
  let { data, error } = await write(payload)
  if (error && payload.test_sets && /test_sets/.test(error.message || '')) {
    // test_sets column not added yet -- still save the results (best set), just not every set
    ;({ data, error } = await write({ test: newTest }))
  }
  if (error) return { error, pbs: [] }
  const pbs = Object.entries(clean).filter(([k, v]) => best[k] != null && (lowerIsBetter(k) ? v < best[k] : v > best[k])).map(([k, v]) => ({ name: k, value: v, previous: best[k], unit: testInfo(k)?.unit }))
  return { error: null, pbs, session: data }
}
