// 📋 Monthly test timetable (Nov 2026): a 4-week rotation, two test slots a week (any day -- after
// normal training is fine). Each slot = light / power tests first, then ONE hard test, which is
// followed by a 1-minute heart rate recovery. Week 5 (29th+) is a catch-up week.
// Test weeks run by date: week 1 = 1st-7th, week 2 = 8th-14th, week 3 = 15th-21st, week 4 = 22nd-28th.
const FIXED = ['Red', 'Yellow', 'Green', 'Blue', 'Black'].map(c => `Fixed load circuit - ${c}`)
const BODYWEIGHT = ['Push-ups - Regular (60s)', 'Push-ups - Tricep (60s)', 'Push-ups - Shoulder (60s)', 'Pull-ups - Regular (60s)', 'Pull-ups - Horizontal (60s)', 'Squats (60s)']
const GRIP = ['Left Grip Test (kg)', 'Right Grip Test (kg)']
const PINCH = ['Left Pinch Test - 5kg/10kg (time)', 'Right Pinch Test - 5kg/10kg (time)']

export const TEST_PLAN = {
  1: { A: [{ cat: 'jumps', label: 'Vertical jump', names: ['Vertical Jump (distance)'] },
           { cat: 'bleep', label: 'Bleep test', names: ['Bleep test', 'Bleep test (10m)'], hard: true, hrr: true },
           { cat: 'grip', label: 'Grip (left + right)', names: GRIP }],
       B: [{ cat: 'wattbike', label: 'Watt bike 10 s', names: ['Watt bike 10 second (output)'] },
           { cat: 'maxlifts', label: 'Max lifts: bench + shoulder press', names: ['Bench Press', 'Shoulder Press'], hard: true, seniors: true },
           { cat: 'stretches', label: 'Hamstring + box splits stretch', names: ['Hamstring Stretch (range)', 'Box Splits Stretch (range)'] }] },
  2: { A: [{ cat: 'punch', label: 'Punch speed', names: ['Jab time (ms)', 'Cross time (ms)', 'Lead hook time (ms)', 'Rear hook time (ms)'] },
           { cat: 'fixedload', label: 'Fixed load circuit', names: FIXED, hard: true, hrr: true },
           { cat: 'grip', label: 'Pinch (left + right)', names: PINCH }],
       B: [{ cat: 'heart', label: 'Watt bike 1 min + HR recovery', names: ['Heart Rate Recovery (1 min)', 'HRR % (Watt bike 1 min)'], hard: true },
           { cat: 'stretches', label: 'Shoulder stretches', names: ['Shoulder flex - Right hand up (range)', 'Shoulder flex - Left hand up (range)'] }] },
  3: { A: [{ cat: 'jumps', label: 'Long jump', names: ['Long Jump (distance)'] },
           { cat: 'timedrun', label: '1600 m time trial', names: ['1600m time trial'], hard: true, hrr: true, quarterly: { label: '4800 m time trial', names: ['4800m time trial'] } },
           { cat: 'grip', label: 'Grip (left + right)', names: GRIP }],
       B: [{ cat: 'maxlifts', label: 'Max lifts: squat + deadlift', names: ['Squat', 'Deadlift'], hard: true, seniors: true },
           { cat: 'stretches', label: 'Front splits (left + right)', names: ['Front Splits - Left in front (range)', 'Front Splits - Right in front (range)'] }] },
  4: { A: [{ cat: 'punch', label: 'Punch count', names: ['Punches per minute', 'Punches per round'] },
           { cat: 'bodyweight', label: 'Body weight max reps', names: BODYWEIGHT, hard: true, hrr: true },
           { cat: 'grip', label: 'Pinch (left + right)', names: PINCH }],
       B: [{ cat: 'timedrun', label: '200 m sprint', names: ['200m sprint'] },
           { cat: 'wattbike', label: 'Watt bike 30 s / 2-3 min', names: ['Watt bike 30 sec (distance)', 'Watt bike 2 min (distance)', 'Watt bike 3 min (distance)'], hard: true, hrr: true }] },
}

const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

// which test week today is: { week: 1-4 (or 5 = catch-up), from, to, quarterly }
export function testWeek(today = new Date()) {
  const day = today.getDate(), week = Math.min(5, Math.ceil(day / 7))
  const y = today.getFullYear(), m = today.getMonth()
  const from = new Date(y, m, (week - 1) * 7 + 1)
  const to = week === 5 ? new Date(y, m + 1, 0) : new Date(y, m, week * 7)
  return { week, from: iso(from), to: iso(to), quarterly: m % 3 === 0, monthFrom: iso(new Date(y, m, 1)) }
}

// the slots for a week, with the quarterly swap (4800 m every 3 months) and juniors' swap (no max lifts)
export function slotsFor(week, { quarterly = false, junior = false } = {}) {
  const plan = TEST_PLAN[week]; if (!plan) return null
  const fix = it => {
    let x = it
    if (x.quarterly && quarterly) x = { ...x, label: x.quarterly.label, names: x.quarterly.names }
    if (x.seniors && junior) x = { ...x, cat: 'bodyweight', label: `Body weight max reps (instead of ${x.label.replace(/^Max lifts: /, '')})`, names: BODYWEIGHT, seniors: false }
    return x
  }
  return { A: plan.A.map(fix), B: plan.B.map(fix) }
}

// has this athlete got a result for the item between from and to? sessions: [{ session_date, test }]
export function itemDone(item, sessions, from, to) {
  return (sessions || []).some(s => s.session_date >= from && s.session_date <= to && item.names.some(n => s.test?.[n] != null && s.test[n] !== ''))
}
