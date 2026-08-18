import { useEffect, useState, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import { supabasePublic } from '../lib/supabasePublic.js'
import { useAuth } from '../hooks/useAuth.jsx'

const HOUSE_COLOURS = {
  'Dragon House': '#E24B4A', 'Super House': '#378ADD',
  'Ice House': '#1D9E75', 'Jet House': '#EF9F27',
}
const HOUSE_LOGOS = {
  'Dragon House': '/logos/house-dragon.png', 'Super House': '/logos/house-super.png',
  'Ice House': '/logos/house-ice.png', 'Jet House': '/logos/house-jet.png',
}
const HOUSE_TEXT_LOGOS = {
  'Dragon House': '/logos/text-dragon.png', 'Super House': '/logos/text-super.png',
  'Ice House': '/logos/text-ice.png', 'Jet House': '/logos/text-jet.png',
}
// Matches AthleteProfiles.jsx's TTP_BENCHMARK_FIELDS exactly -- the two
// must stay in sync since they describe the same benchmark records.
const TTP_BENCHMARK_FIELDS = [
  'shapes','punch_quality','footwork','defence','counters','attack','combinations',
  'change_of_tempo','use_of_phases','distance','flow','self_expression',
  'foot_speed','limb_speed','combination_speed','reaction','punching_power',
  'strength_upper','strength_lower','stability_core','agility','stop_n_go',
  'stamina_aerobic','stamina_anaerobic','suppleness_upper','suppleness_lower',
  'recovery','health',
  'read_opponent','tempo_rhythm','tactical_intelligence','ring_awareness',
  'know_strengths_weaknesses','heart_grit','concentration','timing',
]
// Kickboxing TTP fields -- matches KickboxingTPT.jsx and
// AthleteProfiles.jsx's KB_TTP_FIELDS exactly (all 3 must stay in sync).
const KB_TTP_FIELDS = [
  'weight_kg','height_cm','arm_span_cm','leg_reach_cm',
  'straight_punches','round_kicks_floor_left','round_kicks_floor_right','round_kicks_air_left','round_kicks_air_right',
  'resting_hr','session_peak_hr','run_20min_distance','run_20min_peak_hr','bleep_test_level','bleep_test_peak_hr',
  'run_200m_1','run_200m_2','run_200m_3','run_200m_4','sprint_peak_hr','run_1600m','run_4800m','fixed_load_circuit_time',
  'dips','push_ups','pull_ups','full_sit_up','squats',
  'flat_plank','side_plank_right','side_plank_left','kick_hold_front_left','kick_hold_front_right','kick_hold_side_left','kick_hold_side_right',
  'pinch_left','pinch_right','grip_left','grip_right',
  'hamstring_stretch','box_splits','front_splits_left','front_splits_right','shoulder_range_right','shoulder_range_left',
  'vertical_jump','long_jump',
]
// Matches KickboxingTPT.jsx's own "improved" convention -- these fields
// are the only ones where a LOWER number is the better one.
const KB_LOWER_IS_BETTER = ['weight_kg', 'resting_hr', 'run_200m_1', 'run_200m_2', 'run_200m_3', 'run_200m_4', 'run_1600m', 'run_4800m', 'fixed_load_circuit_time']

const WELLBEING_QUESTIONS = [
  { key: 'sleep',        label: 'Sleep',        icon: '😴' },
  { key: 'nutrition',    label: 'Nutrition',    icon: '🍎' },
  { key: 'hydration',    label: 'Hydration',    icon: '💧' },
  { key: 'outdoors',     label: 'Outdoors',     icon: '🌳' },
  { key: 'talk',         label: 'Talk',         icon: '💬' },
  { key: 'screenFree',   label: 'Screen free',  icon: '📵' },
  { key: 'journal',      label: 'Journal',      icon: '📓' },
  { key: 'creative',     label: 'Creative task', icon: '🎨' },
  { key: 'productivity', label: 'Productivity', icon: '✅' },
]
const HYDRATION_ADD_OPTIONS = [0.25, 0.5, 1]
const OUTDOORS_ADD_OPTIONS = [10, 20, 30]
const TALK_ADD_OPTIONS = [1, 2, 3]
const SCREEN_FREE_OPTIONS = ['20 hours', '22 hours', '23 hours', '20 mins', '30 mins', '1 hour']
const NUTRITION_QUALITY_OPTIONS = ['Excellent', 'Good', 'Poor', 'Very Poor']
const NUTRITION_MACRO_PRESETS = [
  { key: 'balanced', label: 'Balanced', carbs: 40, fat: 30, protein: 30 },
  { key: 'high_protein', label: 'High protein', carbs: 30, fat: 30, protein: 40 },
  { key: 'low_carb', label: 'Low carb', carbs: 20, fat: 40, protein: 40 },
]

function SetInput({ sets, onChange, placeholder = 'e.g. 12.3', inputType = 'text' }) {
  // Same fix as DualSetInput: local state seeded once from props,
  // never re-synced on every change. Each keystroke triggers an async
  // save -- reading from the `sets` prop again on a fast second edit
  // would use a stale snapshot missing what was just typed, silently
  // losing it. Building on local state means every edit builds on
  // the latest value typed, not on whatever the parent has saved yet.
  const [localSets, setLocalSets] = useState(sets)

  function update(i, val) {
    const next = [...localSets]
    next[i] = val
    setLocalSets(next)
    onChange(next)
  }
  function add() {
    const next = [...localSets, '']
    setLocalSets(next)
    onChange(next)
  }
  function remove(i) {
    const next = localSets.filter((_, idx) => idx !== i)
    setLocalSets(next)
    onChange(next)
  }
  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
        {localSets.map((s, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            <span style={{ fontSize: 10, color: 'var(--text-tertiary)', width: 14 }}>{i + 1}</span>
            <input type={inputType} inputMode={inputType === 'number' ? 'decimal' : undefined} value={s} onChange={e => update(i, e.target.value)} placeholder={placeholder}
              style={{ width: 72, padding: '4px 6px', border: '1px solid var(--border-strong)', borderRadius: 6, fontSize: 12, background: 'var(--bg-secondary)', color: 'var(--text)', fontFamily: 'var(--font-sans)' }} />
            <button onClick={() => remove(i)} style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: 14, padding: 0 }}>×</button>
          </div>
        ))}
      </div>
      <button type="button" className="btn btn-sm" onClick={add} style={{ fontSize: 11 }}>+ Add set</button>
    </div>
  )
}

// Dedicated Timed Sprints input -- distance/time toggle decides which
// value is FIXED (picked once, e.g. "30m") vs RESULT (entered per set,
// e.g. the time it took). Each set can instead be marked as a rest,
// which skips it from the total calculations. Shows each set inline
// as "1 - 30m - 13sec" (or "1 - 30sec - 50m" in time mode) rather than
// a bare list of numbers, so the fixed value doesn't have to be
// remembered separately while reading results back.
function TimedSprintsInput({ sets, mode, fixedValue, onChange }) {
  const [localSets, setLocalSets] = useState(sets)
  function update(i, patch) {
    const next = [...localSets]
    next[i] = { ...next[i], ...patch }
    setLocalSets(next)
    onChange(next)
  }
  function add() {
    const next = [...localSets, { value: '', isRest: false }]
    setLocalSets(next)
    onChange(next)
  }
  function remove(i) {
    const next = localSets.filter((_, idx) => idx !== i)
    setLocalSets(next)
    onChange(next)
  }
  const resultUnit = mode === 'time' ? 'm' : 'sec'
  const activeSets = localSets.filter(s => !s?.isRest)
  const numericResults = activeSets.map(s => parseFloat(s?.value)).filter(v => !isNaN(v))
  const fixedNum = parseFloat(fixedValue)
  // Time mode: results ARE distances, each took the fixed time --
  // total distance sums the results, total time is set-count x fixed time.
  // Distance mode: results ARE times, each covered the fixed distance --
  // total time sums the results, total distance is set-count x fixed distance.
  const totalTime = mode === 'time'
    ? (isNaN(fixedNum) ? null : (activeSets.length * fixedNum))
    : (numericResults.length ? numericResults.reduce((a, b) => a + b, 0) : null)
  const totalDistance = mode === 'time'
    ? (numericResults.length ? numericResults.reduce((a, b) => a + b, 0) : null)
    : (isNaN(fixedNum) ? null : (activeSets.length * fixedNum))

  return (
    <div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
        {localSets.map((s, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 11, color: 'var(--text-tertiary)', width: 14, flexShrink: 0 }}>{i + 1}</span>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)', flexShrink: 0 }}>{fixedValue || '—'}</span>
            <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>–</span>
            {s?.isRest ? (
              <span style={{ fontSize: 12, color: 'var(--text-tertiary)', fontStyle: 'italic', flex: 1 }}>rest</span>
            ) : (
              <input type="number" inputMode="decimal" value={s?.value ?? ''} onChange={e => update(i, { value: e.target.value })}
                placeholder={mode === 'time' ? 'e.g. 50' : 'e.g. 13'}
                style={{ width: 64, padding: '4px 6px', border: '1px solid var(--border-strong)', borderRadius: 6, fontSize: 12, background: 'var(--bg-secondary)', color: 'var(--text)', fontFamily: 'var(--font-sans)' }} />
            )}
            {!s?.isRest && <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{resultUnit}</span>}
            <button type="button" onClick={() => update(i, { isRest: !s?.isRest })}
              style={{ fontSize: 10, background: s?.isRest ? '#EF9F2720' : 'none', border: '1px solid var(--border-strong)', borderRadius: 6, padding: '3px 6px', cursor: 'pointer', color: s?.isRest ? '#EF9F27' : 'var(--text-tertiary)', fontFamily: 'var(--font-sans)' }}>
              {s?.isRest ? '✓ Rest' : 'Rest?'}
            </button>
            <button onClick={() => remove(i)} style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: 14, padding: 0 }}>×</button>
          </div>
        ))}
      </div>
      <button type="button" className="btn btn-sm" onClick={add} style={{ fontSize: 11, marginBottom: 10 }}>+ Add set</button>
      <div style={{ display: 'flex', gap: 14, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
        <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Total time: <strong style={{ color: 'var(--text)' }}>{totalTime != null ? `${totalTime}sec` : '—'}</strong></span>
        <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Total distance: <strong style={{ color: 'var(--text)' }}>{totalDistance != null ? `${totalDistance}m` : '—'}</strong></span>
      </div>
    </div>
  )
}

// Two fields per set -- e.g. Watt Bike's Wattage + Distance, each with
// its own appropriately-formatted input
function DualSetInput({ sets, onChange, fields }) {
  // Local state, seeded once from the incoming prop. Deliberately NOT
  // re-synced from props on every change -- each keystroke triggers an
  // async save, and if the person types into multiple sets quickly
  // (before the previous save round-trips and updates the parent),
  // reading from the `sets` prop again would use a stale snapshot
  // that's missing what was just typed, silently losing it. Building
  // on local state instead means every edit always builds on the
  // very latest value typed, not on whatever the parent has caught
  // up to saving yet.
  const [localSets, setLocalSets] = useState(sets)

  function update(i, field, val) {
    const next = [...localSets]
    next[i] = { ...next[i], [field]: val }
    setLocalSets(next)
    onChange(next)
  }
  function add() {
    const next = [...localSets, Object.fromEntries(fields.map(f => [f.key, '']))]
    setLocalSets(next)
    onChange(next)
  }
  function remove(i) {
    const next = localSets.filter((_, idx) => idx !== i)
    setLocalSets(next)
    onChange(next)
  }
  return (
    <div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 6 }}>
        {localSets.map((s, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 10, color: 'var(--text-tertiary)', width: 14 }}>{i + 1}</span>
            {fields.map(f => (
              <input key={f.key} type={f.type || 'text'} inputMode={f.type === 'number' ? 'decimal' : undefined}
                value={s[f.key] || ''} onChange={e => update(i, f.key, e.target.value)} placeholder={f.placeholder}
                style={{ width: 78, padding: '4px 6px', border: '1px solid var(--border-strong)', borderRadius: 6, fontSize: 12, background: 'var(--bg-secondary)', color: 'var(--text)', fontFamily: 'var(--font-sans)' }} />
            ))}
            <button onClick={() => remove(i)} style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: 14, padding: 0 }}>×</button>
          </div>
        ))}
      </div>
      <button type="button" className="btn btn-sm" onClick={add} style={{ fontSize: 11 }}>+ Add set</button>
    </div>
  )
}

// Manual interval builder: separate "seconds on" / "seconds off" number
// boxes, combined into the same "X seconds on Y seconds off" text used
// by the presets, so it stores and displays identically either way.
function OnOffInput({ onAdd }) {
  const [on, setOn] = useState('')
  const [off, setOff] = useState('')
  function submit() {
    if (!on || !off) return
    onAdd(`${on} seconds on ${off} seconds off`)
    setOn(''); setOff('')
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <input type="number" inputMode="decimal" value={on} onChange={e => setOn(e.target.value)} placeholder="Seconds on"
        style={{ width: 82, padding: '4px 6px', border: '1px solid var(--border-strong)', borderRadius: 6, fontSize: 12, background: 'var(--bg-secondary)', color: 'var(--text)', fontFamily: 'var(--font-sans)' }} />
      <input type="number" inputMode="decimal" value={off} onChange={e => setOff(e.target.value)} placeholder="Seconds off"
        style={{ width: 82, padding: '4px 6px', border: '1px solid var(--border-strong)', borderRadius: 6, fontSize: 12, background: 'var(--bg-secondary)', color: 'var(--text)', fontFamily: 'var(--font-sans)' }} />
      <button type="button" className="btn btn-sm" disabled={!on || !off} onClick={submit} style={{ fontSize: 11 }}>Add</button>
    </div>
  )
}

function MacroPie({ carbs, fat, protein, size = 76 }) {
  const total = carbs + fat + protein || 1
  const r = size / 2 - 7
  const circumference = 2 * Math.PI * r
  const segments = [
    { value: carbs, colour: '#EF9F27' },
    { value: fat, colour: '#E24B4A' },
    { value: protein, colour: '#378ADD' },
  ]
  let offset = 0
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <g transform={`rotate(-90 ${size/2} ${size/2})`}>
        {segments.map((seg, i) => {
          const len = (seg.value / total) * circumference
          const el = (
            <circle key={i} cx={size/2} cy={size/2} r={r} fill="none" stroke={seg.colour} strokeWidth={12}
              strokeDasharray={`${len} ${circumference - len}`} strokeDashoffset={-offset} />
          )
          offset += len
          return el
        })}
      </g>
    </svg>
  )
}

function isWellbeingQComplete(key, w) {
  if (!w) return false
  switch (key) {
    case 'sleep': return !!(w.sleep?.hours || w.sleep?.efficiency)
    case 'nutrition': return !!(w.nutrition?.targetPreset || w.nutrition?.quality)
    case 'hydration': return !!(w.hydration?.total > 0)
    case 'outdoors': return !!(w.outdoors?.totalMinutes > 0)
    case 'talk': return !!(w.talk?.count > 0)
    case 'screenFree': return !!(w.screenFree?.hours || w.screenFree?.custom)
    case 'journal': return !!(w.journal?.count > 0 || w.journal?.privateJournal)
    case 'creative': return !!(w.creative?.count > 0)
    case 'productivity': return !!(w.productivity?.count > 0)
    default: return false
  }
}

// Test module category groupings, mirroring the log form's structure.
// Uses the exact same test-name keys already used in stored session
// data (test: { [name]: value }), so nothing already recorded is lost.
// Physical section groupings for Running/Watt bike/Bodyweight/Stretch
// flows -- each writes into the exact same fields the log form and
// results charts already use, so nothing already recorded is affected.
// SnC (Strength and Conditioning) -- generic numbered routine presets,
// since routines vary a lot and are best described by the coach rather
// than picked from a fixed exercise list. A "description" field lets
// the coach write in what the routine actually consists of.
const SNC_ROUTINE_PRESETS = ['Routine 1', 'Routine 2', 'Routine 3', 'Routine 4']

// Maps a class's day_of_week label to actual JS day-of-week numbers,
// and converts a "HH:MM" time into a 0-100% vertical position within
// a 06:00-22:00 day range, for the Sessions calendar/weekly timetable.
const DAY_TO_JS_DAYS = {
  Monday: [1], Tuesday: [2], Wednesday: [3], Thursday: [4], Friday: [5], Saturday: [6], Sunday: [0],
  'Mon/Fri': [1, 5], 'Tue/Thu': [2, 4],
}
const DAY_TIMELINE_START_MIN = 6 * 60
const DAY_TIMELINE_END_MIN = 22 * 60
function timeToTimelinePercent(timeStr) {
  if (!timeStr) return null
  const [h, m] = timeStr.split(':').map(Number)
  if (Number.isNaN(h)) return null
  const mins = h * 60 + (m || 0)
  const pct = ((mins - DAY_TIMELINE_START_MIN) / (DAY_TIMELINE_END_MIN - DAY_TIMELINE_START_MIN)) * 100
  return Math.max(0, Math.min(100, pct))
}
// PDP "Check" category keys -- used to read any items sent to the
// timetable from the PDP, for display on the Sessions calendar/weekly
// timetable here. These are the actionable "work on"/"to do" style
// categories (maintain/winning-ways notes aren't scheduled tasks) --
// must match this file's own PDP_SECTIONS keys (the coach's file has a
// separate, richer 4-column-per-category schema with its own matching
// constant, not shared with this one).
const PDP_TIMETABLE_SECTION_KEYS = ['to_work_on', 'psychology_work_on', 'tech_work_on', 'tact_work_on', 'physical_work_on']

// Tactical development presets -- multi-select per category, note
// added once selected (same pattern as Techniques).
const TACTICAL_CATEGORIES = {
  'Fight Analysis': [
    'Watch one full fight and identify the winning tactics.',
    'Watch the same fight twice—once focusing on each fighter.',
    'Watch fights round by round and score them yourself.',
    'Identify the moment the momentum changed.',
    'Count successful jabs, counters, or kicks.',
    'Identify every tactical adjustment made by each corner.',
    'Compare an amateur and professional version of the same fighter.',
    'Study fighters with different styles (pressure, counter, out-boxer, etc.).',
  ],
  'Pattern Recognition': [
    'Predict the next combination before it happens.',
    'Pause footage and decide what you would do next.',
    'Identify repeated habits in each fighter.',
    'Spot defensive weaknesses.',
    'Identify favourite exits after combinations.',
    'Predict which fighter is controlling the distance.',
    'Identify who is dictating the pace.',
    'Recognise feints that consistently create openings.',
  ],
  'Tactical Journaling': [
    'Write three things you learned from every fight you watch.',
    'Keep a "Lessons from Champions" notebook.',
    'Record mistakes you repeatedly make.',
    'Write one tactical goal for the next session.',
    'Create a strengths and weaknesses list.',
    'Keep an "opponent types" journal.',
    'Record combinations that worked well.',
    'Reflect on how you handled pressure.',
  ],
  'Game Planning': [
    'Build a game plan for different opponent styles.',
    'Design first-round strategies.',
    "Plan what to do if you're ahead on points.",
    "Plan what to do if you're behind.",
    'Prepare opening combinations.',
    'Prepare defensive responses to common attacks.',
    'Develop multiple plans (Plan A, B and C).',
    'Write a between-round adjustment checklist.',
  ],
  'Visualisation': [
    'Mentally rehearse walking into the ring.',
    'Visualise defending against difficult opponents.',
    'Imagine solving tactical problems calmly.',
    'Picture successful counters.',
    'Rehearse winning the final round.',
    'Visualise escaping pressure.',
    'Mentally perform perfect footwork.',
    'Imagine executing your game plan from start to finish.',
  ],
  'Opponent Study': [
    'Research different fighting styles.',
    'Learn common habits of southpaws.',
    'Study pressure fighters.',
    'Study counter fighters.',
    'Study tall versus short fighters.',
    'Learn the strengths and weaknesses of each style.',
    'Analyse previous opponents if available.',
  ],
  'Coaching Mindset': [
    'Explain tactics to someone else.',
    'Draw ring diagrams and movement patterns.',
    'Sketch combinations and likely reactions.',
    'Build tactical flowcharts.',
    '"If this happens, then I\'ll do this" decision trees.',
    'Design sparring scenarios for yourself.',
    'Write coaching notes from fights you watch.',
  ],
  'Mental Performance': [
    'Practise concentration exercises.',
    'Improve observation skills by noticing small details in everyday life.',
    'Train patience through puzzles or strategy games.',
    'Develop emotional control through breathing practice.',
    'Reflect on decision-making after competitions.',
    'Read books on sports psychology and performance.',
    'Study leadership and communication.',
    'Learn how elite athletes prepare mentally.',
  ],
  'Self-Review': [
    'What did I do well?',
    'What tactical mistakes did I make?',
    'What surprised me?',
    'What patterns did I notice?',
    'What would I change next time?',
    'What will I focus on in my next session?',
    'What is one habit I want to improve this week?',
    'What is one strength I should continue developing?',
  ],
}

// Technique presets -- multi-select per category, note added once
// selected. Two styles (Boxing/Kickboxing), each split into several
// named categories.
const TECHNIQUE_STYLES = [
  { style: 'Boxing', categories: {
    'Stance & Movement': ['Orthodox stance', 'Southpaw stance', 'Fighting stance', 'High guard', 'Peek-a-boo guard', 'Philly Shell (shoulder roll)', 'Long guard', 'Foot positioning', 'Forward step', 'Backward step', 'Side step', 'Pivot', 'L-step', 'Shuffle', 'Circle left/right', 'Ring cutting', 'Angle changes', 'Weight transfer', 'Bounce movement', 'Set and fire'],
    'Offensive Punches': ['Jab', 'Double jab', 'Triple jab', 'Power jab', 'Flick jab', 'Body jab', 'Cross', 'Straight right/left', 'Lead hook', 'Rear hook', 'Check hook', 'Body hook', 'Lead uppercut', 'Rear uppercut', 'Shovel hook', 'Overhand right', 'Overhand left', 'Corkscrew punch', 'Long hook', 'Short hook'],
    'Defence': ['High guard', 'Parry', 'Catch', 'Slip inside', 'Slip outside', 'Bob and weave', 'Duck', 'Pull back', 'Shoulder roll', 'Elbow block', 'Forearm block', 'Step back defence', 'Pivot defence', 'Clinch', 'Frame'],
    'Counter Punching': ['Slip jab-cross', 'Pull counter', 'Check hook', 'Counter uppercut', 'Parry jab-cross', 'Catch and shoot', 'Body counter', 'Angle counter', 'Shoulder roll counter'],
    'Feints': ['Jab feint', 'Shoulder feint', 'Hip feint', 'Foot feint', 'Level change', 'Hand feint', 'Rhythm change', 'Eye feint'],
    'Inside Fighting': ['Short hooks', 'Short uppercuts', 'Body ripping', 'Framing', 'Head positioning', 'Clinch control', 'Bumping', 'Shoulder pressure'],
    'Ring Craft': ['Corner escape', 'Cutting off the ring', 'Rope work', 'Pressure fighting', 'Counter fighting', 'Out-boxing', 'Distance management', 'Tempo control'],
  }},
  { style: 'Kickboxing', categories: {
    'Stance & Footwork': ['Orthodox stance', 'Southpaw stance', 'Fighting stance', 'High guard', 'Long guard', 'Bounce movement', 'Step and slide', 'Pivot', 'L-step', 'Side step', 'Circle movement', 'Ring control', 'Angle changes'],
    'Punches': ['Jab', 'Cross', 'Lead hook', 'Rear hook', 'Lead uppercut', 'Rear uppercut', 'Overhand', 'Body shots', 'Shovel hook', 'Spinning back fist (ruleset dependent)'],
    'Lead Leg Kicks': ['Front kick (Teep)', 'Snap front kick', 'Push kick', 'Front leg round kick', 'Front leg side kick', 'Front leg hook kick', 'Front leg axe kick'],
    'Rear Leg Kicks': ['Rear round kick', 'Body round kick', 'Low kick', 'High kick', 'Rear push kick', 'Side kick', 'Hook kick', 'Axe kick', 'Head knee'],
    'Spinning Techniques': ['Spinning back kick', 'Spinning hook kick', 'Spinning heel kick', 'Tornado kick', 'Jump spinning back kick', 'Jump spinning hook kick', 'Jump spinning heel kick'],
    'Defensive Skills': ['High guard', 'Long guard', 'Shin block', 'Knee check', 'Leg check', 'Catch kick', 'Scoop kick', 'Parry', 'Slip', 'Duck', 'Pull back', 'Clinch', 'Footwork defence'],
    'Sweeps & Dumps (Ruleset Dependent)': ['Inside sweep', 'Outside sweep', 'Catch-and-sweep', 'Off-balancing'],
    'Counters': ['Check-return kick', 'Catch-return kick', 'Slip-cross', 'Pull-cross', 'Counter low kick', 'Counter teep', 'Counter knee', 'Counter spinning kick'],
    'Feints': ['Jab feint', 'Kick feint', 'Teep feint', 'Shoulder feint', 'Hip feint', 'Step feint', 'Level change', 'Rhythm change'],
    'Advanced Skills': ['Switch kick', 'Question mark kick', 'Brazilian kick', 'Crescent kick', 'Jump side kick', 'Flying side kick', 'Rolling thunder kick (ruleset dependent)', 'Fake-low to high kick', 'Fake-teep to round kick', 'Angle kick setups'],
  }},
]

const RUN_CATEGORY_CARDS = [
  { key: 'Timed Sprints', label: 'Timed Sprints', icon: '⚡' },
  { key: 'Timed Distance Run', label: 'Timed Distance Run', icon: '🏁' },
  { key: 'Interval', label: 'Interval', icon: '🔁', resultLabel: 'Distance covered (km)', hasOnOffInput: true },
]
const RUN_PRESET_TESTS = {
  'Timed Sprints': ['30m', '40m', '50m', '100m', '200m', '300m', '400m', '600m', '800m'],
  'Timed Distance Run': ['2000m', '1600m', '4800m', '5000m', '10000m', '15000m'],
  'Interval': [
    '1 min on 1 min jog track distance',
    '1 min 30 sec on 1 min jog track distance',
    '2 min on 1 min jog track distance',
    '3 min on 1 min jog track distance',
    '10 seconds on 10 seconds jog track distance',
    '20 seconds on 20 seconds jog track distance',
    'Suicides 20 seconds on 10 seconds off',
    '3,2,1',
    '30 seconds',
    '25 seconds',
    '20 seconds',
  ],
}
// Used for Timed Sprints when "time" mode is picked (the fixed value is
// a time, e.g. "everyone sprints for 30sec", and the result entered
// per set is the distance covered).
const TIMED_SPRINTS_TIME_PRESETS = ['10sec', '20sec', '30sec', '40sec', '60sec']
const WATT_BIKE_PRESETS = {
  output: ['10 seconds on 90 seconds off', '15 seconds on 90 seconds off', '10 seconds on 20 seconds off', '15 seconds on 30 seconds off'],
  standard: ['20 seconds on 20 seconds off', '20 seconds on 40 seconds off', '30 seconds on 30 seconds off'],
  distance: ['30 seconds on 60 seconds off', '40 seconds on 40 seconds off', '90 seconds on 60 seconds off'],
}
const WATT_BIKE_GROUPS = [
  { key: 'output', label: 'Output interval', icon: '⚡', match: m => WATT_BIKE_PRESETS.output.includes(normalizeIntervalMode(m)) },
  { key: 'standard', label: 'Standard interval', icon: '🚴', match: m => WATT_BIKE_PRESETS.standard.includes(normalizeIntervalMode(m)) },
  { key: 'distance', label: 'Distance interval', icon: '📏', match: m => WATT_BIKE_PRESETS.distance.includes(normalizeIntervalMode(m)) },
]
// Bodyweight now supports multiple exercises selected at once within
// each category, each tracked independently. Entries store an explicit
// `category` field for reliable matching; entries.category is checked
// first, falling back to pattern-matching on the exercise name for any
// data logged before this change, so nothing already recorded is lost.
const BODYWEIGHT_GROUPS = [
  { key: 'circuit', label: 'Fixed load circuit', icon: '🔴', exercises: ['Red', 'Yellow', 'Green', 'Blue', 'Black'], metric: 'time', durations: null },
  { key: 'compounds', label: 'Compounds', icon: '💪', exercises: ['Dips', 'Push-ups', 'Pull-ups', 'Squats'], metric: 'reps', durations: ['10 seconds', '30 seconds', '1 minute'] },
  { key: 'isometrics', label: 'Isometrics', icon: '🧘', exercises: ['Flat plank', 'Side Plank - Right side up', 'Side Plank - Left side up', 'Bridge', 'Wall sit', 'Half push'], metric: 'time', durations: ['1 min', '2 min', '3 min', '5 min'] },
  { key: 'abs', label: 'Abs circuit', icon: '🔥', exercises: ['Crunches', 'Full sit-ups', 'Side crunch', 'Dorsal raises'], metric: 'reps', durations: ['1 min', '2 min', '3 min', '5 min'] },
]
function bodyweightMatchesGroup(e, grpKey) {
  if (!e) return false
  if (e.category) return e.category === grpKey
  const t = e.type || ''
  if (/circuit/i.test(t)) return grpKey === 'circuit'
  if (/plank|bridge|wall sit|half push/i.test(t)) return grpKey === 'isometrics'
  if (/crunch|sit-?up|dorsal/i.test(t)) return grpKey === 'abs'
  return grpKey === 'compounds'
}

// Each Stretch flow is a fixed named sequence -- the card tracks
// whether the whole flow was completed, not each individual stretch.
// Multiple flows can be marked complete independently of each other.
const STRETCH_FLOWS = [
  { label: 'Stretch flow one', timing: '40 seconds on 20 seconds off', stretches: [
    'Sumo stretch', 'Side lunge stretch (left and right)', 'Lunge stretch (left and right)',
    'Standing - Feet apart toe-touch (left and right)', 'Box Splits Stretch',
    'Box Splits Stretch forward and backward', 'Front Splits (left in front and right in front)',
    'Standing toe-touch stretch',
  ]},
  { label: 'Stretch flow two', timing: '40 seconds on 20 seconds off', stretches: [
    'Seated toe-touch stretch', 'Seated splits forward', 'Seated splits (left and right)',
    'Butterfly stretch', 'Teddy bear stretch (left and right)', 'Frog Splits',
    'Frog Splits forward', 'Frog Splits backward', 'Extended frog (left and right)',
    'Pigeon Stretch (left and right)', 'King pigeon stretch (left and right)',
  ]},
  { label: 'Stretch flow three', timing: '40 seconds on 20 seconds off', stretches: [
    'Look up neck stretch', 'Look down neck stretch', 'Head tilt (left and right)',
    'Head rotation (left and right)', 'Arms in front tank stretch',
    'Arm across the body (left and right)', 'Hand down the back (left and right)',
    'Kneel over hands in forearm stretch', 'Kneel over reach through shoulder stretch',
    'Spiderman lunge rotation and reach both directions (left and right)',
  ]},
]

const TEST_CATEGORIES = [
  { key: 'bleep', label: 'Bleep test', icon: '🏃', tests: [
    { name: 'Bleep test', unit: 'level' },
  ]},
  { key: 'vo2max', label: 'VO2 Max', icon: '🫁', tests: [
    { name: 'VO2 Max', unit: 'ml/kg/min' },
  ]},
  { key: 'stretches', label: 'Stretches', icon: '🤸', tests: [
    { name: 'Hamstring Stretch (range)', unit: 'cm' },
    { name: 'Box Splits Stretch (range)', unit: 'cm' },
    { name: 'Front Splits - Left in front (range)', unit: 'cm' },
    { name: 'Front Splits - Right in front (range)', unit: 'cm' },
    { name: 'Shoulder flex - Right hand up (range)', unit: 'cm' },
    { name: 'Shoulder flex - Left hand up (range)', unit: 'cm' },
  ]},
  { key: 'jumps', label: 'Jumps', icon: '🦘', tests: [
    { name: 'Vertical Jump (distance)', unit: 'cm' },
    { name: 'Long Jump (distance)', unit: 'cm' },
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
  { key: 'timedrun', label: 'Timed Run', icon: '🏃', tests: [
    { name: '200m sprint', unit: 'sec' },
    { name: '1600m time trial', unit: 'sec' },
    { name: '4800m time trial', unit: 'sec' },
  ]},
]

const MENTALITY_QUESTIONS = [
  { key: 'meditation',      label: 'Meditation',       icon: '🧘' },
  { key: 'visualisation',   label: 'Visualisation',    icon: '🎯' },
  { key: 'chess',           label: 'Play chess',       icon: '♟️' },
  { key: 'reading',         label: 'Reading',          icon: '📖' },
  { key: 'gaming',          label: 'Gaming (combat)',  icon: '🎮' },
  { key: 'eyeTracking',     label: 'Eye tracking drills', icon: '👁' },
  { key: 'coldWater',       label: 'Cold water / Ice bath', icon: '🧊' },
  { key: 'activeRecovery',  label: 'Active recovery day', icon: '🚶' },
  { key: 'gratitude',       label: 'Self gratitude',   icon: '🙏' },
  { key: 'alterEgo',        label: 'Alter Ego',        icon: '🎭' },
  { key: 'coachability',    label: 'Coachability',     icon: '🤝' },
]
// Simple yes/no prompts for the Coachability card -- all answered
// together and saved as one entry, rather than each being its own
// separate question.
const COACHABILITY_PROMPTS = [
  { key: 'listened', label: 'Listened to feedback today' },
  { key: 'applied', label: 'Applied corrections given' },
  { key: 'askedQuestions', label: 'Asked questions when unsure' },
  { key: 'openToChallenge', label: 'Open to being challenged/pushed' },
  { key: 'positiveAttitude', label: 'Kept a positive attitude when corrected' },
  { key: 'listenOrDefend', label: 'When corrected, does the athlete listen or defend themselves?', positiveLabel: 'Listens', negativeLabel: 'Defends' },
  { key: 'appliesInstruction', label: 'When given an instruction, do they actually attempt to apply it?' },
  { key: 'solutionOrExcuse', label: 'When something goes wrong, do they look for a solution or an excuse?', positiveLabel: 'Solution', negativeLabel: 'Excuse' },
  { key: 'egoAside', label: 'Can they put their ego aside long enough to learn?' },
  { key: 'behaviourChanges', label: 'Does their behaviour change after feedback, or does the coach have to keep repeating the same message?', positiveLabel: 'Changes', negativeLabel: 'Repeats' },
]
const VIDEO_ANALYSIS_OPTIONS = ['Self in competition', 'Self in training', 'Elite athlete in competition', 'Elite athlete in training']
const MEDITATION_TYPE_OPTIONS = ['Guided meditation', 'Breathing meditation', 'Body scan meditation', 'Mindfulness meditation', 'Silent meditation', 'Other']
const VISUALISATION_OPTIONS = ['Performing a technique', 'Performing in competition']
// Full structured templates -- 5 performance areas each, with ~10
// specific types per area. "General" keeps the original short option
// list so nothing that was already there is lost.
const MEDITATION_CATEGORIES = [
  { key: 'general', label: 'General', description: '', types: MEDITATION_TYPE_OPTIONS.map(name => ({ name })) },
  { key: 'calm', label: 'Calm', description: 'Control Your Arousal', types: [
    { name: 'Breath-focused meditation', howTo: 'Sit comfortably, breathe naturally, and rest your attention on the sensation of each breath in and out.' },
    { name: 'Box breathing', howTo: 'Breathe in for 4, hold for 4, breathe out for 4, hold for 4. Repeat.' },
    { name: 'Slow controlled breathing', howTo: 'Breathe in for 4, breathe out for 6-8, making the exhale longer than the inhale.' },
    { name: 'Body scan meditation', howTo: 'Slowly move your attention from your feet up to your head, noticing tension in each area and letting it soften.' },
    { name: 'Progressive relaxation', howTo: 'Tense each muscle group for 5 seconds, then release, working from feet to head.' },
    { name: 'Pre-fight calming meditation', howTo: 'Sit quietly for 5-10 minutes before the fight, using slow breathing to settle nerves and focus the mind.' },
    { name: 'Between-round breathing reset', howTo: 'On the stool, take 3-4 slow breaths in for 4, out for 6, to bring the heart rate down.' },
    { name: 'Post-training relaxation', howTo: 'Lie or sit still for a few minutes after training, breathing slowly and letting the body settle.' },
    { name: 'Competition-nerves meditation', howTo: 'Acknowledge the nerves without fighting them, breathe slowly, and remind yourself nerves mean you\'re ready.' },
    { name: 'Grounding meditation', howTo: 'Notice 5 things you can feel/hear/see around you to bring your attention fully into the present moment.' },
  ]},
  { key: 'focus', label: 'Focus', description: 'Control Your Attention', types: [
    { name: 'Mindfulness meditation', howTo: 'Sit quietly and notice thoughts as they arise, without judging them, gently returning attention to the breath.' },
    { name: 'Present-moment meditation', howTo: 'Focus entirely on what is happening right now — sounds, sensations, breath — letting go of past or future thoughts.' },
    { name: 'Single-point focus', howTo: 'Pick one object (a candle, a spot on the wall, your breath) and hold your attention on it, refocusing whenever it wanders.' },
    { name: 'Breath concentration', howTo: 'Count each breath cycle up to 10, then start again, using the counting to anchor your attention.' },
    { name: 'Sound-focused meditation', howTo: 'Focus purely on the sounds around you, near and far, without labelling or judging them.' },
    { name: 'Sensory awareness', howTo: 'Cycle attention through each sense in turn — what you can see, hear, feel, smell — for a minute each.' },
    { name: 'Open-awareness meditation', howTo: 'Let attention rest broadly on whatever arises — thoughts, sounds, sensations — without fixing on any one thing.' },
    { name: 'Distraction-control practice', howTo: 'Deliberately introduce a mild distraction (noise, movement) and practise returning focus to your breath each time.' },
    { name: 'Moving meditation', howTo: 'Walk slowly and deliberately, keeping full attention on the sensation of each step and movement.' },
    { name: 'Mindful shadowboxing', howTo: 'Shadowbox slowly and deliberately, keeping full attention on technique and breathing rather than going through the motions.' },
  ]},
  { key: 'confidence', label: 'Confidence', description: 'Control Your Mindset', types: [
    { name: 'Confidence meditation', howTo: 'Sit quietly and bring to mind a time you performed well, holding that feeling in your body for a few minutes.' },
    { name: 'Positive self-talk meditation', howTo: 'Repeat a short, positive phrase about yourself slowly and deliberately, in time with your breathing.' },
    { name: 'Strengths-focused meditation', howTo: 'Bring to mind 3 of your genuine strengths as an athlete, and sit with the feeling each one brings.' },
    { name: 'Achievement reflection', howTo: 'Recall a specific achievement in detail — what happened, how it felt — and let that feeling settle.' },
    { name: 'Gratitude meditation', howTo: 'Bring to mind 3 things you\'re grateful for right now, sitting with the feeling each one brings.' },
    { name: 'Preparation-trust meditation', howTo: 'Reflect on the training you\'ve put in, reminding yourself that the work is done and you can trust it.' },
    { name: 'Cue-word meditation', howTo: 'Pick one word (e.g. "strong", "calm") and repeat it slowly in time with your breath for a few minutes.' },
    { name: 'Positive affirmation practice', howTo: 'Repeat a short affirmation ("I am prepared", "I am ready") slowly, several times, with full attention.' },
    { name: 'Self-belief meditation', howTo: 'Sit quietly and bring to mind evidence of your own ability, letting the feeling of self-belief grow.' },
    { name: 'Pre-competition confidence routine', howTo: 'Run through a short, familiar sequence of breathing plus a confidence phrase before competing.' },
  ]},
  { key: 'emotions', label: 'Emotions', description: 'Control Your Reactions', types: [
    { name: 'Thought-observation meditation', howTo: 'Watch your thoughts come and go like clouds, without getting pulled into them or judging them.' },
    { name: 'Acceptance meditation', howTo: 'Notice whatever feeling is present and let it be there without trying to change or fight it.' },
    { name: 'Emotional-awareness meditation', howTo: 'Sit quietly and name whatever emotion is present, noticing where you feel it in the body.' },
    { name: 'Pressure meditation', howTo: 'Bring to mind a pressured situation, notice the reaction it creates, and practise breathing slowly through it.' },
    { name: 'Reset meditation', howTo: 'Take 3-5 slow breaths, deliberately letting go of whatever just happened before moving on.' },
    { name: 'Mistake-release meditation', howTo: 'Bring the mistake to mind briefly, acknowledge it, then consciously let it go with an exhale.' },
    { name: 'Frustration-control meditation', howTo: 'Notice the frustration in the body, breathe slowly into it, and let the intensity reduce before reacting.' },
    { name: 'Non-judgement mindfulness', howTo: 'Notice thoughts and feelings as they are, without labelling them good or bad.' },
    { name: 'Staying-composed meditation', howTo: 'Practise slow, steady breathing while picturing a scenario that normally rattles you, staying calm throughout.' },
    { name: "Respond-don't-react practice", howTo: 'Before responding to anything, pause for one breath first, so the response is chosen rather than automatic.' },
  ]},
  { key: 'recovery', label: 'Recovery', description: 'Control Your Reset', types: [
    { name: 'Post-training meditation', howTo: 'Sit or lie quietly for a few minutes after training, breathing slowly and letting the nervous system settle.' },
    { name: 'Relaxation meditation', howTo: 'Lie down, breathe slowly, and consciously relax each part of the body in turn.' },
    { name: 'Sleep meditation', howTo: 'Lie in bed, breathe slowly, and let the body relax fully, releasing the need to control anything.' },
    { name: 'Body scan', howTo: 'Move attention slowly from feet to head, releasing tension in each area as you go.' },
    { name: 'Recovery breathing', howTo: 'Breathe in for 4, out for 6-8, for several minutes to activate the body\'s rest-and-recover state.' },
    { name: 'Mental switch-off meditation', howTo: 'Deliberately set aside training/competition thoughts for a set period, refocusing on breath whenever they return.' },
    { name: 'Muscle-relaxation meditation', howTo: 'Tense and release each major muscle group in turn, noticing the contrast between tension and relaxation.' },
    { name: 'Stress-release meditation', howTo: 'Breathe slowly, and with each exhale imagine releasing built-up tension from the day.' },
    { name: 'End-of-day mindfulness', howTo: 'Sit quietly, reflect briefly on the day without judgement, then let it go with a few slow breaths.' },
    { name: 'Positive training reflection', howTo: 'Bring to mind one thing that went well in training today, and sit with that feeling for a minute.' },
  ]},
]
const VISUALISATION_CATEGORIES = [
  { key: 'general', label: 'General', description: '', types: VISUALISATION_OPTIONS.map(name => ({ name })) },
  { key: 'technique', label: 'Technique', description: 'See Yourself Doing It Correctly', types: [
    { name: 'Punch technique visualisation', howTo: 'Vividly picture yourself throwing the punch with perfect technique — stance, rotation, snap, return to guard.' },
    { name: 'Kick technique visualisation', howTo: 'Vividly picture the kick from set-up to impact to recovery, with perfect balance and technique throughout.' },
    { name: 'Defensive technique visualisation', howTo: 'Picture an attack coming and see yourself defending it cleanly — the block, slip or parry, and the return.' },
    { name: 'Combination rehearsal', howTo: 'Mentally run through a full combination, feeling the rhythm and timing between each shot.' },
    { name: 'Footwork visualisation', howTo: 'Picture yourself moving with light, balanced footwork, always in the right position to attack or defend.' },
    { name: 'Head-movement rehearsal', howTo: 'Picture slipping and rolling shots smoothly, staying balanced and in position to counter.' },
    { name: 'Counter-attack visualisation', howTo: 'See the opponent\'s attack coming, picture your defence, then immediately see your counter landing.' },
    { name: 'Distance-control rehearsal', howTo: 'Picture yourself managing range perfectly — staying just out of reach, then closing the distance to attack.' },
    { name: 'Pad-work visualisation', howTo: 'Mentally rehearse a pad combination exactly as your coach calls it, seeing each shot land cleanly.' },
    { name: 'Perfect-execution imagery', howTo: 'Picture your best-ever technique performance in vivid detail — how it looked, felt and sounded.' },
  ]},
  { key: 'tactics', label: 'Tactics', description: 'See the Problem & the Solution', types: [
    { name: 'Opponent-style visualisation', howTo: 'Picture a specific opponent style and mentally rehearse your game plan for dealing with it.' },
    { name: 'Southpaw vs orthodox scenarios', howTo: 'Picture yourself adjusting footwork and angles to deal with the opposite stance.' },
    { name: 'Pressure-fighter scenarios', howTo: 'Picture an opponent walking you down, and see yourself using movement and countering to control the exchange.' },
    { name: 'Counter-fighter scenarios', howTo: 'Picture an opponent who waits and counters, and see yourself using feints and pressure to draw them out.' },
    { name: 'Taller/shorter opponent scenarios', howTo: 'Picture adjusting range, angles and technique choice to deal with the height difference.' },
    { name: 'Range-management visualisation', howTo: 'Picture yourself controlling the range throughout an exchange, staying at your preferred distance.' },
    { name: 'Ring/cage control', howTo: 'Picture yourself controlling position, cutting off the ring/cage and avoiding being trapped on the ropes/fence.' },
    { name: 'Creating openings', howTo: 'Picture setting up an opponent with feints or combinations, then seeing the opening appear and taking it.' },
    { name: 'Tactical adjustment visualisation', howTo: 'Picture a plan not working, then see yourself calmly switching to a different approach mid-round.' },
    { name: 'Plan A, B and C scenarios', howTo: 'Mentally rehearse your main game plan, then picture switching to your backup plans if needed.' },
  ]},
  { key: 'confidence', label: 'Confidence', description: 'See Yourself Succeeding', types: [
    { name: 'Successful-performance visualisation', howTo: 'Picture your whole performance going exactly as you want it to, from start to finish.' },
    { name: 'Winning exchanges', howTo: 'Picture yourself winning exchanges cleanly — landing your shots, avoiding theirs.' },
    { name: 'Executing your best techniques', howTo: 'Picture your best technique or combination landing perfectly under competition pressure.' },
    { name: 'Staying composed', howTo: 'Picture a difficult moment in the fight, and see yourself staying calm and in control throughout.' },
    { name: 'Recovering after mistakes', howTo: 'Picture making a mistake, then immediately see yourself refocusing and performing well straight after.' },
    { name: 'Strong final-round visualisation', howTo: 'Picture yourself finishing the final round strong, pushing the pace when it matters most.' },
    { name: 'Walking confidently to the ring', howTo: 'Picture the walk to the ring/cage — head up, relaxed shoulders, confident and focused.' },
    { name: 'Hearing your name announced', howTo: 'Picture the moment your name is announced, and see yourself feeling calm, ready and confident.' },
    { name: 'Trusting your preparation', howTo: 'Bring to mind your training, and picture yourself performing with full trust in that preparation.' },
    { name: 'Performing at your best', howTo: 'Picture yourself performing at your absolute best, exactly as you\'ve trained to.' },
  ]},
  { key: 'pressure', label: 'Pressure', description: 'See Yourself Handling Difficult Situations', types: [
    { name: 'Being under pressure', howTo: 'Picture a moment of heavy pressure and see yourself staying composed and making good decisions.' },
    { name: 'Opponent starting quickly', howTo: 'Picture an opponent coming out fast, and see yourself staying calm and matching or managing the pace.' },
    { name: 'Losing an early round', howTo: 'Picture being behind early, then see yourself staying calm and working your way back into the fight.' },
    { name: 'Getting tired', howTo: 'Picture the fatigue setting in, and see yourself digging in and maintaining technique and effort anyway.' },
    { name: 'Making a mistake', howTo: 'Picture making an error, then immediately see yourself letting it go and refocusing on the next action.' },
    { name: 'Technique not working', howTo: 'Picture your usual approach not working, and see yourself calmly adjusting to something that does.' },
    { name: 'Facing an aggressive opponent', howTo: 'Picture an aggressive opponent coming forward, and see yourself staying composed and countering effectively.' },
    { name: 'Dealing with crowd noise', howTo: 'Picture a loud, distracting crowd, and see yourself blocking it out and staying focused on the task.' },
    { name: "Receiving a coach's instruction between rounds", howTo: 'Picture your coach giving instructions between rounds, and see yourself listening and applying it immediately.' },
    { name: 'Changing tactics mid-fight', howTo: 'Picture realising a change is needed mid-fight, and see yourself calmly switching approach without panic.' },
    { name: 'Staying disciplined when frustrated', howTo: 'Picture a frustrating moment, and see yourself staying disciplined rather than reacting emotionally.' },
    { name: 'Finishing strongly', howTo: 'Picture the final moments of the fight, and see yourself finishing on your terms with a strong effort.' },
  ]},
  { key: 'performance', label: 'Performance', description: 'See the Whole Competition', types: [
    { name: 'Arriving at the venue', howTo: 'Picture arriving at the venue, feeling settled and focused, going through your normal routine.' },
    { name: 'Weigh-in', howTo: 'Picture the weigh-in going smoothly, staying calm and business-like throughout.' },
    { name: 'Changing room', howTo: 'Picture the changing room before the fight — your routine, your kit, your headspace.' },
    { name: 'Wrapping hands', howTo: 'Picture your hands being wrapped, using this quiet moment to settle your focus.' },
    { name: 'Warming up', howTo: 'Picture your warm-up routine, feeling your body and mind coming to full readiness.' },
    { name: 'Walking to the ring', howTo: 'Picture the walk-out, feeling calm, focused and ready for what\'s ahead.' },
    { name: 'Opening bell', howTo: 'Picture the opening bell going, and see yourself starting exactly as planned.' },
    { name: 'First exchange', howTo: 'Picture the very first exchange of the fight going well, landing clean and staying composed.' },
    { name: 'Following the game plan', howTo: 'Picture yourself sticking to the game plan you and your coach agreed on.' },
    { name: 'Listening to the corner', howTo: 'Picture your corner giving instructions between rounds, and see yourself taking it in and using it.' },
    { name: 'Between-round recovery', howTo: 'Picture the minute between rounds — breathing, recovering, resetting for the next round.' },
    { name: 'Tactical adjustments', howTo: 'Picture making a tactical change mid-fight based on what you\'re seeing, and it working well.' },
    { name: 'Final round', howTo: 'Picture the final round, giving everything you have left, finishing the way you want to.' },
    { name: 'End of competition', howTo: 'Picture the final bell, and see yourself feeling proud of the effort you gave, regardless of outcome.' },
    { name: 'Post-fight reflection', howTo: 'Picture yourself afterwards, calmly reflecting on what went well and what to work on next.' },
  ]},
]
const ACTIVE_RECOVERY_OPTIONS = ['Swimming', 'Walking', 'Yoga']

function isMentalityQComplete(key, m) {
  if (!m) return false
  switch (key) {
    case 'videoAnalysis': return !!(m.videoAnalysis?.entries?.length > 0)
    case 'meditation': return !!(m.meditation?.entries?.length > 0)
    case 'visualisation': return !!(m.visualisation?.entries?.length > 0)
    case 'chess': return !!(m.chess?.count > 0)
    case 'reading': return !!(m.reading?.count > 0)
    case 'gaming': return !!(m.gaming?.count > 0)
    case 'eyeTracking': return !!(m.eyeTracking?.count > 0)
    case 'coldWater': return !!(m.coldWater?.count > 0)
    case 'activeRecovery': return !!(m.activeRecovery?.entries?.length > 0)
    case 'gratitude': return !!(m.gratitude?.count > 0)
    case 'coachability': return !!(m.coachability && Object.keys(m.coachability).length > 0)
    default: return false
  }
}

// Some athletes have historic Watt Bike entries saved as shorthand
// (e.g. "15-90" from an old free-text "Custom" entry) that mean the same
// thing as the newer full-text options (e.g. "15 seconds on 90 seconds
// off - Output (wattage)"). Normalizing here means these don't show up
// as separate, duplicate sub-types.
// A date is "on holiday" (excluded from attendance %) if either:
// - any club-wide holiday (class_id null) covers it, or
// - EVERY one of the classes that would have run that weekday for
//   this athlete is individually covered by a per-class holiday for
//   that same date
function isDateOnHoliday(dateStr, holidays, classIdsForThatWeekday, studentId) {
  // A row with only student_id set (no class_id) is an individual
  // override, not club-wide -- must be excluded from the "no class_id
  // at all" club-wide check, or it would incorrectly apply to everyone.
  const clubWide = holidays.some(h => !h.class_id && !h.student_id && h.start_date <= dateStr && h.end_date >= dateStr)
  if (clubWide) return true
  if (studentId && holidays.some(h => h.student_id === studentId && h.start_date <= dateStr && h.end_date >= dateStr)) return true
  if (!classIdsForThatWeekday || classIdsForThatWeekday.length === 0) return false
  return classIdsForThatWeekday.every(cid =>
    holidays.some(h => h.class_id === cid && h.start_date <= dateStr && h.end_date >= dateStr)
  )
}

function normalizeIntervalMode(raw) {
  if (!raw) return raw
  let s = String(raw).trim()
  const shorthand = s.match(/^(\d+)\s*-\s*(\d+)$/)
  if (shorthand) {
    const [, on, off] = shorthand
    s = `${on} seconds on ${off} seconds off`
  }
  return s.replace(/\s*-\s*(Output \(wattage\)|Distance \(km\))\s*$/i, '').trim()
}

// Running/Watt bike/Bodyweight now support multiple entries per
// session (like Test does), but existing historic data was saved as a
// single object rather than an array. This normalizes both shapes to
// an array transparently, so nothing already recorded is lost.
function toEntries(val) {
  if (Array.isArray(val)) return val
  if (val && typeof val === 'object' && Object.keys(val).length > 0) return [val]
  return []
}

// Generic radar/spider chart -- axes is [{ label, value (0-100), colour }].
// Hand-rolled SVG to match this file's existing custom-chart approach
// (see LineChart below) rather than pulling in a charting library.
function RadarChart({ axes, size = 280, onAxisClick, activeLabel }) {
  const cx = size / 2, cy = size / 2
  const maxR = size / 2 - 46 // leave room for axis labels
  const n = axes.length
  const angleFor = i => (Math.PI * 2 * i) / n - Math.PI / 2
  const pointFor = (i, pct) => {
    const angle = angleFor(i)
    const r = (Math.max(0, Math.min(100, pct ?? 0)) / 100) * maxR
    return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)]
  }
  const dataPoints = axes.map((a, i) => pointFor(i, a.value)).map(p => p.join(',')).join(' ')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <svg viewBox={`0 0 ${size} ${size}`} style={{ width: '100%', maxWidth: size, height: 'auto' }}>
        {/* Gridlines -- concentric polygons at 25/50/75/100% */}
        {[0.25, 0.5, 0.75, 1].map(t => (
          <polygon key={t}
            points={axes.map((_, i) => pointFor(i, t * 100).join(',')).join(' ')}
            fill="none" stroke="var(--border)" strokeWidth="1" />
        ))}
        {/* Axis lines + labels -- clickable to drill into that axis, even
            when there's no data yet (shown as "No data" rather than 0%,
            since a missing value isn't the same as a genuine 0%). */}
        {axes.map((a, i) => {
          const [x, y] = pointFor(i, 100)
          const labelR = maxR + 22
          const angle = angleFor(i)
          const lx = cx + labelR * Math.cos(angle)
          const ly = cy + labelR * Math.sin(angle)
          const isActive = activeLabel === a.label
          const hasData = a.value != null
          return (
            <g key={a.label} onClick={() => onAxisClick && onAxisClick(a.label)} style={{ cursor: onAxisClick ? 'pointer' : 'default' }}>
              <line x1={cx} y1={cy} x2={x} y2={y} stroke="var(--border)" strokeWidth="1" />
              {isActive && <circle cx={lx} cy={ly - 4} r="30" fill={a.colour + '15'} />}
              <text x={lx} y={ly} textAnchor="middle" dominantBaseline="middle" fontSize="11" fontWeight="600" fill={hasData ? a.colour : 'var(--text-tertiary)'} textDecoration={isActive ? 'underline' : 'none'}>{a.label}</text>
              <text x={lx} y={ly + 13} textAnchor="middle" fontSize="10" fill="var(--text-tertiary)">{hasData ? `${Math.round(a.value)}%` : 'No data'}</text>
            </g>
          )
        })}
        {/* Data shape */}
        <polygon points={dataPoints} fill="#EF9F2730" stroke="#EF9F27" strokeWidth="2" />
        {axes.map((a, i) => {
          const [x, y] = pointFor(i, a.value)
          return a.value != null ? <circle key={a.label} cx={x} cy={y} r="4" fill={a.colour} /> : null
        })}
      </svg>
    </div>
  )
}

function getSubTypeOptions(sorted, key) {
  try {
    if (key === 'running') return [...new Set(sorted.flatMap(s => toEntries(s.running).map(e => e.category)).filter(Boolean))]
    if (key === 'watt_bike') return [...new Set(sorted.flatMap(s => toEntries(s.watt_bike).map(e => normalizeIntervalMode(e.interval_mode || e.type))).filter(Boolean))]
    if (key === 'bodyweight') return [...new Set(sorted.flatMap(s => toEntries(s.bodyweight).map(e => e.type)).filter(Boolean))]
    if (key === 'test') return [...new Set(sorted.flatMap(s => Object.keys(s.test || {})))].filter(k => k !== 'notes' && k !== 'type')
    if (key === 'techniques') return [...new Set(sorted.map(s => s.techniques?.type).filter(Boolean))]
    if (key === 'one_percenters') return [...new Set(sorted.map(s => s.one_percenters?.type).filter(Boolean))]
    if (key === 'mentality') return [...new Set(sorted.flatMap(s => s.mentality?.types || (s.mentality?.type ? [s.mentality.type] : [])))]
    return []
  } catch (e) { return [] }
}

function computeModuleStats(sorted, key, subType) {
  try {
    let entries = [], allTypeEntries = [], unit = '', higherIsBetter = true
    const numSets = arr => Array.isArray(arr) ? arr.map(v => parseFloat((v && typeof v === 'object') ? (v.wattage ?? v.value) : v)).filter(v => !isNaN(v)) : []
    if (key === 'running') {
      entries = sorted.flatMap(s => toEntries(s.running)
        .filter(e => !subType || e.category === subType)
        .flatMap(e => (Array.isArray(e.sets) ? e.sets : []).filter(v => v !== '' && v != null).map(v => ({ date: s.session_date, value: v, id: s.id }))))
      higherIsBetter = subType === 'Interval'
      allTypeEntries = entries // different categories mix time vs distance -- PB stays scoped to the selected type
    } else if (key === 'watt_bike') {
      entries = sorted.flatMap(s => toEntries(s.watt_bike)
        .filter(e => !subType || normalizeIntervalMode(e.interval_mode || e.type) === subType)
        .map(e => ({ date: s.session_date, value: numSets(e.sets).length ? Math.max(...numSets(e.sets)) : null, id: s.id }))
        .filter(e => e.value != null))
      unit = 'W'
      // PB spans every interval mode -- same unit/direction throughout,
      // so the athlete's absolute best watt output is a meaningful PB
      // regardless of which mode is currently being viewed
      allTypeEntries = sorted.flatMap(s => toEntries(s.watt_bike)
        .map(e => ({ date: s.session_date, value: numSets(e.sets).length ? Math.max(...numSets(e.sets)) : null }))
        .filter(e => e.value != null))
    } else if (key === 'bodyweight') {
      entries = sorted.flatMap(s => toEntries(s.bodyweight)
        .filter(e => !subType || e.type === subType)
        .map(e => ({ date: s.session_date, value: numSets(e.sets).length ? Math.max(...numSets(e.sets)) : null, id: s.id }))
        .filter(e => e.value != null))
      unit = ' reps'
      allTypeEntries = sorted.flatMap(s => toEntries(s.bodyweight)
        .map(e => ({ date: s.session_date, value: numSets(e.sets).length ? Math.max(...numSets(e.sets)) : null }))
        .filter(e => e.value != null))
    } else if (key === 'test') {
      entries = subType ? sorted.filter(s => s.test?.[subType] != null).map(s => ({ date: s.session_date, value: s.test[subType], id: s.id })) : []
      higherIsBetter = !['200m sprint', '1600m time trial', '4800m time trial'].includes(subType)
      allTypeEntries = entries // different tests mix units entirely -- PB stays scoped to the selected test
    } else if (key === 'techniques') {
      const filtered = sorted.filter(s => !subType || s.techniques?.type === subType)
      entries = filtered.map(s => ({ date: s.session_date, value: numSets(s.techniques?.sets).length ? Math.max(...numSets(s.techniques?.sets)) : null, id: s.id })).filter(e => e.value != null)
      allTypeEntries = entries
    }
    const mostRecent = entries[entries.length - 1] || null
    const pb = allTypeEntries.reduce((best, e) => !best ? e : ((higherIsBetter ? e.value > best.value : e.value < best.value) ? e : best), null)
    return { mostRecent, pb, unit }
  } catch (e) { return { mostRecent: null, pb: null, unit: '' } }
}

// Simple "last logged" stat for modules with no clean numeric metric
// (Stretch flows, Mentality -- which now also covers historic Eye
// training/One percenters entries, since those were folded into it)
function computeLastLogged(sorted, key) {
  try {
    const hasEntry = s => {
      if (key === 'stretch') return s.stretch_flows?.some?.(Boolean)
      if (key === 'mentality') {
        const v = s.mentality
        const hasMentality = v && (typeof v === 'object' ? Object.values(v).some(Boolean) : !!v)
        return hasMentality || !!s.eye_training || (s.one_percenters && Object.values(s.one_percenters).some(Boolean))
      }
      const v = s[key]
      if (!v) return false
      return typeof v === 'object' ? Object.values(v).some(Boolean) : !!v
    }
    const entries = sorted.filter(hasEntry)
    return entries.length ? { count: entries.length, lastDate: entries[entries.length - 1].session_date } : { count: 0, lastDate: null }
  } catch (e) { return { count: 0, lastDate: null } }
}

// Defined at module scope (not inside the page component's render) so
// React treats it as a stable component across renders, rather than
// unmounting/remounting it every time the parent re-renders.
function ModuleButton({ b, sorted, moduleSubType, setModuleSubType, colour, setTab, setResultsGraphSection, studentId, onToggleLog, onQuickLog, large, questionProgressByPeriod }) {
  const subTypeOptions = getSubTypeOptions(sorted, b.key)
  const currentSubType = moduleSubType[b.key] ?? subTypeOptions[0] ?? null
  const noNumericStat = ['stretch', 'eye_training', 'one_percenters', 'mentality', 'wellbeing'].includes(b.key)
  const { mostRecent, unit } = noNumericStat ? { mostRecent: null, unit: '' } : computeModuleStats(sorted, b.key, currentSubType)
  // PB is the athlete's overall best for this exercise across every
  // sub-type, not just whichever one is currently being viewed --
  // otherwise a genuine best set on a different sub-type would never
  // show while cycling through the others.
  const { pb } = noNumericStat ? { pb: null } : computeModuleStats(sorted, b.key, null)
  const lastLogged = noNumericStat ? computeLastLogged(sorted, b.key) : null
  const swipeStart = useRef(null)
  const holdTimer = useRef(null)
  const heldRef = useRef(false)

  function cycleType(direction = 1) {
    if (!subTypeOptions.length) return
    const idx = subTypeOptions.indexOf(currentSubType)
    const next = subTypeOptions[(idx + direction + subTypeOptions.length) % subTypeOptions.length]
    setModuleSubType(prev => ({ ...prev, [b.key]: next }))
  }

  const logHref = `/fit2fight?student_id=${studentId}&module=${b.key}`
  const isPhysicalModule = ['running', 'watt_bike', 'bodyweight', 'stretch', 'techniques'].includes(b.key)
  const isSimplifiedModule = ['wellbeing', 'mentality', 'test'].includes(b.key)
  const hideLeftZone = isSimplifiedModule || isPhysicalModule
  const canCycle = subTypeOptions.length > 1

  return (
    <div
      onTouchStart={e => { if (canCycle) swipeStart.current = e.touches[0].clientX }}
      onTouchEnd={e => {
        if (!canCycle || swipeStart.current == null) return
        const delta = e.changedTouches[0].clientX - swipeStart.current
        if (Math.abs(delta) > 40) cycleType(delta < 0 ? 1 : -1)
        swipeStart.current = null
      }}
      style={{
        display: 'flex', alignItems: 'stretch', width: '100%',
        background: 'var(--bg-secondary)', border: `${large ? 2 : 1}px solid ${large ? colour : 'var(--border)'}`, borderRadius: 'var(--radius)',
        overflow: 'hidden', fontFamily: 'var(--font-sans)',
      }}>
      {/* Left: quick-log link to the full form, or (when there are
          multiple sub-types) a prev arrow for laptop/desktop use where
          swipe isn't available. Wellbeing/Mentality/Test/Running/Watt
          bike/Bodyweight/Stretch flows all have their own dedicated
          card grids on this page, so the log-link is skipped for them
          entirely -- the arrow still shows if they can cycle. */}
      {canCycle ? (
        <button onClick={() => cycleType(-1)} title="Previous type" style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', width: 22, flexShrink: 0,
          color: 'var(--text-tertiary)', fontSize: 12, background: 'none', border: 'none', borderRight: '1px solid var(--border)', cursor: 'pointer',
        }}>◀</button>
      ) : !hideLeftZone && (
        <a href={logHref} title={`Log ${b.label}${currentSubType ? ` — ${currentSubType}` : ''}`} style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', width: 34, flexShrink: 0,
          color: colour, fontSize: 18, fontWeight: 700, textDecoration: 'none', borderRight: '1px solid var(--border)',
        }}>+</a>
      )}

      {/* Middle: for Physical modules, tap opens the same "Log a result"
          section as the button below the card; holding (~500ms)
          instead quick-logs it as "done today" with no specific
          numbers, so it can be filled in with real detail later. For
          Test, tap switches to results (icon only, no label/sub-type
          text -- Test has its own dedicated card grid below for
          logging). Other modules keep cycling sub-type on tap too,
          alongside the swipe/arrows above. */}
      <button
        onPointerDown={() => {
          if (!isPhysicalModule || !onQuickLog) return
          heldRef.current = false
          holdTimer.current = setTimeout(() => {
            heldRef.current = true
            onQuickLog(b.key)
          }, 500)
        }}
        onPointerUp={() => clearTimeout(holdTimer.current)}
        onClick={() => {
          if (heldRef.current) { heldRef.current = false; return } // already handled by the hold
          isPhysicalModule ? onToggleLog?.(b.key) : b.key === 'test' ? setTab('fit2fight') : cycleType(1)
        }}
        title={isPhysicalModule ? 'Tap to log in detail — hold to quick-log as done today' : undefined}
        style={{
        flex: 1, display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
        padding: large ? '12px 8px' : '6px 4px', background: 'none', border: 'none', borderRight: isSimplifiedModule ? 'none' : '1px solid var(--border)',
        cursor: (b.key === 'test' || subTypeOptions.length > 1) ? 'pointer' : 'default',
        minWidth: 0, touchAction: isPhysicalModule ? 'none' : undefined,
      }}>
        {questionProgressByPeriod && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, width: 18, flexShrink: 0 }}>
            {[['day', 'D'], ['week', 'W'], ['month', 'M']].map(([key, letter]) => {
              const { done, target } = questionProgressByPeriod[key]
              const hasTarget = target > 0
              const pct = hasTarget ? Math.min(100, Math.round((done / target) * 100)) : 0
              const hit = hasTarget && done >= target
              return (
                <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <span style={{ fontSize: 6, fontWeight: 700, width: 6, color: hasTarget ? (hit ? '#1D9E75' : 'var(--text-tertiary)') : 'var(--border)' }}>{letter}</span>
                  <div style={{ flex: 1, height: 3, borderRadius: 2, background: 'var(--border)', overflow: 'hidden' }}>
                    {hasTarget && <div style={{ width: `${pct}%`, height: '100%', background: hit ? '#1D9E75' : '#E24B4A', borderRadius: 2 }} />}
                  </div>
                </div>
              )
            })}
          </div>
        )}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, minWidth: 0 }}>
          {b.key !== 'test' && <span style={{ fontSize: large ? 14 : 9, fontWeight: 600, whiteSpace: 'nowrap' }}>{b.label}</span>}
          {b.key !== 'test' && currentSubType && <span style={{ fontSize: large ? 10 : 7, color: colour, fontWeight: 600, textAlign: 'center', lineHeight: 1.2 }}>{currentSubType}</span>}
        </div>
        <span style={{ fontSize: large ? 26 : 16, flexShrink: 0 }}>{b.icon}</span>
      </button>

      {/* Right: recent/PB (or last-logged), tap to view results --
          skipped for Wellbeing/Mentality/Test, which have their own
          dedicated card grids below instead. Next arrow sits right
          after it when this card can cycle sub-types. */}
      {!isSimplifiedModule && (
      <button onClick={() => {
        const sectionIndex = { watt_bike: 1, running: 2, bodyweight: 6, techniques: 7 }[b.key]
        if (sectionIndex != null) setResultsGraphSection(sectionIndex)
        setTab('fit2fight')
        const targetId = mostRecent?.id || (lastLogged && sorted.filter(s => {
          if (b.key === 'stretch') return s.stretch_flows?.some?.(Boolean)
          return false
        }).slice(-1)[0]?.id)
        if (targetId) {
          setTimeout(() => {
            const el = document.getElementById(`my-f2f-entry-${targetId}`)
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
          }, 150)
        }
      }} style={{
        width: 58, flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        padding: '8px 4px', background: 'none', border: 'none', cursor: 'pointer',
      }}>
        {noNumericStat ? (
          <span style={{ fontSize: 8, color: 'var(--text-tertiary)', textAlign: 'center', lineHeight: 1.3 }}>
            {lastLogged.count > 0 ? `Logged ${lastLogged.count}×` : 'Not logged'}
          </span>
        ) : (
          <>
            <span style={{ fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap' }}>{mostRecent ? `${mostRecent.value}${unit}` : '—'}</span>
            <span style={{ fontSize: 9, fontWeight: 600, color: colour, marginTop: 2, whiteSpace: 'nowrap' }}>{pb ? `🏅 ${pb.value}${unit}` : '—'}</span>
          </>
        )}
      </button>
      )}
      {canCycle && (
        <button onClick={() => cycleType(1)} title="Next type" style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', width: 22, flexShrink: 0,
          color: 'var(--text-tertiary)', fontSize: 12, background: 'none', border: 'none', borderLeft: '1px solid var(--border)', cursor: 'pointer',
        }}>▶</button>
      )}
    </div>
  )
}

const PDP_SECTIONS = [
  { key: 'winning_ways',        label: '🏆 Winning ways',         colour: '#1D9E75' },
  { key: 'what_to_do',          label: '📋 What to do (general)', colour: '#8B5CF6' },
  { key: 'maintain',            label: '✅ Maintain',              colour: '#378ADD' },
  { key: 'to_work_on',          label: '🎯 To work on',            colour: '#EF9F27' },
  { key: 'psychology_notes',      label: '🧠 Psychology — notes',      colour: '#666666' },
  { key: 'psychology_maintain',    label: '🧠 Psychology — maintain', colour: '#8B5CF6' },
  { key: 'psychology_work_on',     label: '🧠 Psychology — work on',  colour: '#7C3AED' },
  { key: 'psychology_what_to_do',  label: '🧠 Psychology — to do',    colour: '#E24B4A' },
  { key: 'tech_notes',          label: '⚙️ Technical — notes',       colour: '#666666' },
  { key: 'tech_maintain',       label: '⚙️ Technical — maintain',  colour: '#378ADD' },
  { key: 'tech_work_on',        label: '⚙️ Technical — work on',   colour: '#EF9F27' },
  { key: 'tech_what_to_do',     label: '⚙️ Technical — to do',     colour: '#E24B4A' },
  { key: 'tact_notes',          label: '🎯 Tactical — notes',        colour: '#666666' },
  { key: 'tact_maintain',       label: '🎯 Tactical — maintain',   colour: '#1D9E75' },
  { key: 'tact_work_on',        label: '🎯 Tactical — work on',    colour: '#E24B4A' },
  { key: 'tact_what_to_do',     label: '🎯 Tactical — to do',      colour: '#E24B4A' },
  { key: 'physical_notes',      label: '💪 Physical — notes',        colour: '#666666' },
  { key: 'physical_maintain',   label: '💪 Physical — maintain',   colour: '#1D9E75' },
  { key: 'physical_work_on',    label: '💪 Physical — work on',    colour: '#059669' },
  { key: 'physical_what_to_do', label: '💪 Physical — to do',      colour: '#E24B4A' },
  { key: 'skill_notes',         label: '🧱 Skill — notes',           colour: '#666666' },
  { key: 'skill_maintain',      label: '🧱 Skill — maintain',      colour: '#1D9E75' },
  { key: 'skill_work_on',       label: '🧱 Skill — work on',       colour: '#EF9F27' },
  { key: 'skill_what_to_do',    label: '🧱 Skill — to do',         colour: '#E24B4A' },
]

// Module-scoped (not redefined on every render) so its internal text
// state doesn't get wiped out whenever the parent component re-renders.
function OpponentQuickNoteForm({ onSave, showShareToggle, disabled }) {
  const [text, setText] = useState('')
  const [sharedFlag, setSharedFlag] = useState(false)
  return (
    <div style={{ marginTop: 8 }}>
      <textarea value={text} onChange={e => setText(e.target.value)} rows={2} placeholder="Add a note…"
        style={{ width: '100%', fontSize: 12, padding: '6px 8px', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius)', background: 'var(--bg-secondary)', color: 'var(--text)', fontFamily: 'var(--font-sans)', resize: 'vertical', marginBottom: 6 }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        {showShareToggle ? (
          <label style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}>
            <input type="checkbox" checked={sharedFlag} onChange={e => setSharedFlag(e.target.checked)} /> Share with athlete
          </label>
        ) : <span />}
        <button className="btn btn-sm btn-primary" disabled={disabled || !text.trim()}
          onClick={() => { onSave(text, sharedFlag); setText(''); setSharedFlag(false) }}>Add note</button>
      </div>
    </div>
  )
}

// Bump this whenever the agreement text changes -- anyone who accepted
// an earlier version gets re-prompted automatically, since their
// stored terms_version won't match.
const TERMS_VERSION = 'v1-2026-08-10'

// Mirrors isWellbeingQComplete/isMentalityQComplete exactly -- checking
// a question's OWN values, not just "does the parent object exist",
// since clearing a question resets its values to empty/0 rather than
// deleting the object itself. A shallow "!!s.wellbeing" style check
// would stay true forever once anything's ever been touched, even
// after every question is cleared back to blank. (Both functions
// already exist above -- this just documents why SECTION_FIELD_CHECK
// below uses them instead of a shallow existence check.)
const WELLBEING_KEYS_FOR_CHECK = ['sleep', 'nutrition', 'hydration', 'outdoors', 'talk', 'screenFree', 'journal', 'creative', 'productivity']
const MENTALITY_KEYS_FOR_CHECK = ['videoAnalysis', 'meditation', 'visualisation', 'chess', 'reading', 'gaming', 'eyeTracking', 'coldWater', 'activeRecovery', 'gratitude', 'coachability']

export default function AthleteApp() {
  const { profile, isStaff } = useAuth()
  const navigate = useNavigate()
  const [tab, setTab]           = useState('home')
  const [termsChecked, setTermsChecked] = useState(false) // the checkbox inside the modal
  const [acceptingTerms, setAcceptingTerms] = useState(false)
  const [termsDismissedLocally, setTermsDismissedLocally] = useState(false) // avoids waiting on a full profile refetch after accepting
  const needsTermsAgreement = !!profile && profile.terms_version !== TERMS_VERSION && !termsDismissedLocally

  async function acceptTerms() {
    if (!profile) return
    setAcceptingTerms(true)
    const { error } = await supabase.from('members')
      .update({ terms_accepted_at: new Date().toISOString(), terms_version: TERMS_VERSION })
      .eq('id', profile.id)
    setAcceptingTerms(false)
    if (error) { alert('Error saving — please try again: ' + error.message); return }
    setTermsDismissedLocally(true)
  }

  // Handle the redirect back from Whoop's OAuth flow
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('whoop_connected')) {
      setTab('whoop')
      window.history.replaceState({}, '', window.location.pathname)
    } else if (params.get('whoop_error')) {
      alert('There was a problem connecting Whoop: ' + params.get('whoop_error'))
      setTab('whoop')
      window.history.replaceState({}, '', window.location.pathname)
    } else if (params.get('tab')) {
      // General deep-link support -- e.g. the Fit II Fight logger's
      // "Results" button links back here with ?tab=fit2fight.
      setTab(params.get('tab'))
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [])
  const [checkingIn, setCheckingIn]   = useState(false)
  const [checkedInMsg, setCheckedInMsg] = useState(null)
  const [checkInDrawerOpen, setCheckInDrawerOpen] = useState(false)
  const [activeCheckIn, setActiveCheckIn] = useState(null) // the open attendance row (checked in, not yet checked out) if still within its session window
  const [showWeightCheckPrompt, setShowWeightCheckPrompt] = useState(null) // 'in' | 'out' | null
  const [weightCheckValue, setWeightCheckValue] = useState('')
  const [fullKitChecked, setFullKitChecked] = useState(false)
  // Cycles the Sessions calendar between three views: the normal
  // attendance calendar, a Fit II Fight completed-actions-per-day
  // count, and a PDP completed-actions-per-day count.
  const [sessionsCalendarView, setSessionsCalendarView] = useState('sessions') // 'sessions' | 'f2f' | 'pdp'
  const [opponentNotes, setOpponentNotes] = useState([])
  const [shedTasks, setShedTasks] = useState([])
  const [newOpponentName, setNewOpponentName] = useState('')
  const [editingOpponentNoteId, setEditingOpponentNoteId] = useState(null)
  const [opponentNoteDraft, setOpponentNoteDraft] = useState('')
  const [sectionTargets, setSectionTargets] = useState([])
  const [student, setStudent]   = useState(null)
  const [houses, setHouses] = useState([])
  const [rankList, setRankList] = useState([])
  const [truePointTotals, setTruePointTotals] = useState({})
  const [showContribution, setShowContribution] = useState(false)
  const [showIndividualPct, setShowIndividualPct] = useState(false)
  // Top detail card: 0 = Name/Club/Age/Level, 1 = House info. Swipe
  // left/right on the card to switch.
  const [headerCardView, setHeaderCardView] = useState(0)
  const headerSwipeStartX = useRef(null)
  const headerWasSwipe = useRef(false) // suppresses the card's own "tap to go Home" after a genuine swipe
  const [showOverallPos, setShowOverallPos] = useState(false)
  const [apData, setApData]     = useState(null)
  const [assignedClasses, setAssignedClasses] = useState([])
  const [holidays, setHolidays] = useState([])
  // Date range the coach configured for the Attendance card on the
  // Coaches Dashboard, only when they set its scope to "Athletes" or
  // "Both" -- otherwise this athlete's own attendance % keeps using its
  // own default (since they joined, up to today).
  const [coachAttendanceDateSettings, setCoachAttendanceDateSettings] = useState(null)
  // Same idea as the attendance date sync, but for the F2F Results
  // card's count specifically -- only ever affects that card's number,
  // never the actual Results page's own graphs/list, which keeps its
  // own independent date filter untouched.
  const [coachF2fDateSettings, setCoachF2fDateSettings] = useState(null)
  // Read-only Profile card (Club/Level/Record/Weight/groups) -- starts
  // collapsed to just its title bar, same show/hide behaviour as the
  // equivalent card on the Coaches Dashboard. No editing here -- this
  // is purely a visibility toggle for the athlete's own info.
  const [myProfileExpanded, setMyProfileExpanded] = useState(false)
  const [recentPointsExpanded, setRecentPointsExpanded] = useState(false)
  const [myNotesLog, setMyNotesLog] = useState([])
  const [tptData, setTptData] = useState({ kickboxing: [], boxing: [] })
  const [ttpBenchmark, setTtpBenchmark] = useState(null)
  const [ttpBenchmarkKB, setTtpBenchmarkKB] = useState(null)
  // Data before 1 Aug 2026 predates the soft launch and isn't reliable
  // for Performance/Attendance reporting, so the radar's date range
  // never goes earlier than this, regardless of the "last 30 days" default.
  const SOFT_LAUNCH_DATE = '2026-08-01'
  const [radarDateFrom, setRadarDateFrom] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 30); const iso = d.toISOString().split('T')[0]; return iso < SOFT_LAUNCH_DATE ? SOFT_LAUNCH_DATE : iso })
  const [radarDateTo, setRadarDateTo] = useState(() => new Date().toISOString().split('T')[0])
  const [radarDrilldown, setRadarDrilldown] = useState(null) // which axis label is expanded, or null
  const [athleteTimetableModal, setAthleteTimetableModal] = useState(null) // { sectionKey, item } or null
  const [schedWizardStep, setSchedWizardStep] = useState('days') // 'days' -> 'metric' -> 'value' -> 'submetric' -> 'subvalue'
  const [schedWizardDays, setSchedWizardDays] = useState([]) // recurring days of week, e.g. ['Monday', 'Wednesday']
  const [schedWizardTime, setSchedWizardTime] = useState('') // optional time of day
  const [schedWizardMetricType, setSchedWizardMetricType] = useState(null) // 'rounds' | 'time' | 'reps' | null
  const [schedWizardValue, setSchedWizardValue] = useState('')
  const [schedWizardSubType, setSchedWizardSubType] = useState(null) // 'time' | 'reps' | null -- only when metricType is 'rounds'
  const [schedWizardSubValue, setSchedWizardSubValue] = useState('')
  const [whoopConnection, setWhoopConnection] = useState(null)
  const [whoopSessions, setWhoopSessions] = useState([])
  const [newNoteText, setNewNoteText] = useState('')
  const [showFullscreenNoteComposer, setShowFullscreenNoteComposer] = useState(false)
  const [openNoteId, setOpenNoteId] = useState(null) // which existing note is open full-screen (view/edit), or null
  const [openNoteDraft, setOpenNoteDraft] = useState('')
  const [dayDetailModal, setDayDetailModal] = useState(null) // dateStr, or null
  const [sessionNoteModal, setSessionNoteModal] = useState(null) // { dateStr, classId, className, attendanceId } or null
  const [sessionNoteDraft, setSessionNoteDraft] = useState('')
  const [savingSessionNote, setSavingSessionNote] = useState(false)
  const [savingNote, setSavingNote] = useState(false)
  const [myChartPopup, setMyChartPopup] = useState(null)
  const [highlightedMyEntryId, setHighlightedMyEntryId] = useState(null)
  const myPressTimer = useRef(null)
  const myHeldRef = useRef(false)
  const [wattChartFilter, setWattChartFilter] = useState('all')
  const [runChartFilter, setRunChartFilter] = useState('all')
  const [bwChartFilter, setBwChartFilter] = useState('all')
  const [techChartFilter, setTechChartFilter] = useState('all')
  const [resultsGraphSection, setResultsGraphSection] = useState(0)
  const resultsGraphSwipeStart = useRef(null)
  const [allClasses, setAllClasses] = useState([])
  const [showAddClass, setShowAddClass] = useState(false)
  const [addClassSelection, setAddClassSelection] = useState('')
  const [savingClassAdd, setSavingClassAdd] = useState(false)
  const [clubEvents, setClubEvents] = useState([])
  const [myReports, setMyReports] = useState([])
  const [expandedReportId, setExpandedReportId] = useState(null)
  const [sessionsCalMonth, setSessionsCalMonth] = useState(() => { const d = new Date(); return { year: d.getFullYear(), month: d.getMonth() } })
  const [weekTimetableStart, setWeekTimetableStart] = useState(() => {
    const d = new Date()
    const day = d.getDay()
    const diffToMonday = day === 0 ? -6 : 1 - day
    d.setDate(d.getDate() + diffToMonday)
    d.setHours(0, 0, 0, 0)
    return d
  })
  const [classDetailPanel, setClassDetailPanel] = useState(null) // { classInfo, dateStr } when a class in the weekly timetable is clicked
  const [classNoteText, setClassNoteText] = useState('')
  const [savingClassNote, setSavingClassNote] = useState(false)
  const [points, setPoints]     = useState([])
  const [sessions, setSessions] = useState([])
  const [attendanceData, setAttendanceData] = useState([])
  const [allAttendance, setAllAttendance] = useState([])
  const [f2fStatsScope, setF2fStatsScope] = useState(0)
  const [attendanceDisplayPct, setAttendanceDisplayPct] = useState(false)
  const [expandedHomeWb, setExpandedHomeWb] = useState(null)
  const [todaysWellbeing, setTodaysWellbeing] = useState({})
  const [savingWellbeing, setSavingWellbeing] = useState(false)
  const [hydrationCustomAdd, setHydrationCustomAdd] = useState('')
  const [outdoorsCustomAdd, setOutdoorsCustomAdd] = useState('')
  const [talkCustomAdd, setTalkCustomAdd] = useState('')
  const [creativeCustomAdd, setCreativeCustomAdd] = useState('')
  const [productivityCustomAdd, setProductivityCustomAdd] = useState('')
  const [journalDraft, setJournalDraft] = useState('')
  const [expandedHomeMentality, setExpandedHomeMentality] = useState(null)
  const [showAlterEgoModal, setShowAlterEgoModal] = useState(false)
  const [weightTargetPctInComp, setWeightTargetPctInComp] = useState(0.025)
  const [weightTargetPctOutComp, setWeightTargetPctOutComp] = useState(0.05)
  const [weightTargetActiveMode, setWeightTargetActiveMode] = useState('in_comp')
  const [alterEgoWorkbook, setAlterEgoWorkbook] = useState({})
  const [newReflectionText, setNewReflectionText] = useState({ helped: '', fellShort: '', adjust: '', didItShowUp: null })
  const [savingAlterEgo, setSavingAlterEgo] = useState(false)
  const [todaysMentalityLog, setTodaysMentalityLog] = useState({})
  const [savingMentalityLog, setSavingMentalityLog] = useState(false)
  const [chessCustomAdd, setChessCustomAdd] = useState('')
  const [readingCustomAdd, setReadingCustomAdd] = useState('')
  const [gamingCustomAdd, setGamingCustomAdd] = useState('')
  const [eyeTrackingCustomAdd, setEyeTrackingCustomAdd] = useState('')
  const [mentalityDraftDurations, setMentalityDraftDurations] = useState({}) // "field::type" -> draft minutes, before saving as an entry
  const [expandedLoggerCategory, setExpandedLoggerCategory] = useState({}) // field -> currently open category key, or null
  const [expandedLoggerHowTo, setExpandedLoggerHowTo] = useState({}) // "field::type" -> true if its how-to text is shown
  const [coldWaterCustomAdd, setColdWaterCustomAdd] = useState('')
  const [gratitudeDraft, setGratitudeDraft] = useState('')
  const [expandedHomeTestCategory, setExpandedHomeTestCategory] = useState(null)
  const [todaysTest, setTodaysTest] = useState({})
  const [savingTest, setSavingTest] = useState(false)
  const [runCategoryTests, setRunCategoryTests] = useState({})
  const [intervalModes, setIntervalModes] = useState([])
  const [bodyweightTypeOptions, setBodyweightTypeOptions] = useState([])
  const [stretchOptionsList, setStretchOptionsList] = useState([])
  const [expandedHomeRun, setExpandedHomeRun] = useState(null)
  const [showPhysicalSection, setShowPhysicalSection] = useState(false)
  const [showTestSection, setShowTestSection] = useState(false)
  const testSectionRef = useRef(null)
  const [showTechniqueSection, setShowTechniqueSection] = useState(false)
  const techniqueSectionRef = useRef(null)
  const [expandedTechniqueCategory, setExpandedTechniqueCategory] = useState(null) // "Boxing::Stance & Movement"
  const [todaysTechniques, setTodaysTechniques] = useState([])
  const [showTacticalSection, setShowTacticalSection] = useState(false)
  const tacticalSectionRef = useRef(null)
  const [expandedTacticalCategory, setExpandedTacticalCategory] = useState(null)
  const [todaysTactical, setTodaysTactical] = useState([])
  const [showMentalitySection, setShowMentalitySection] = useState(false)
  const mentalitySectionRef = useRef(null)
  const [showWellbeingSection, setShowWellbeingSection] = useState(false)
  const wellbeingSectionRef = useRef(null)
  const physicalSectionRef = useRef(null)
  const runPanelRef = useRef(null)
  const wattPanelRef = useRef(null)
  const bodyweightPanelRef = useRef(null)
  const stretchPanelRef = useRef(null)
  const [activePhysicalCategory, setActivePhysicalCategory] = useState(null)
  const showRunCards = activePhysicalCategory === 'running'
  const showWattCards = activePhysicalCategory === 'watt_bike'
  const showBodyweightCards = activePhysicalCategory === 'bodyweight'
  const showStretchCards = activePhysicalCategory === 'stretch'
  const [expandedHomeWatt, setExpandedHomeWatt] = useState(null)
  const [expandedHomeBodyweight, setExpandedHomeBodyweight] = useState(null)
  const [expandedHomeStretch, setExpandedHomeStretch] = useState(null)
  const [stretchInfoOpen, setStretchInfoOpen] = useState({})

  useEffect(() => {
    supabase.from('team_settings').select('*').in('key', ['weight_target_pct_in_comp', 'weight_target_pct_out_comp', 'weight_target_active_mode'])
      .then(({ data }) => {
        if (!data) return
        const inComp = data.find(d => d.key === 'weight_target_pct_in_comp')
        const outComp = data.find(d => d.key === 'weight_target_pct_out_comp')
        const mode = data.find(d => d.key === 'weight_target_active_mode')
        if (inComp) setWeightTargetPctInComp(parseFloat(inComp.value))
        if (outComp) setWeightTargetPctOutComp(parseFloat(outComp.value))
        if (mode) setWeightTargetActiveMode(mode.value)
      })
  }, [])

  useEffect(() => {
    supabase.from('team_settings').select('*').in('key', ['card_date_all_sessions_from', 'card_date_all_sessions_to', 'card_date_all_sessions_scope'])
      .then(({ data }) => {
        if (!data?.length) return
        const from = data.find(d => d.key === 'card_date_all_sessions_from')?.value
        const to = data.find(d => d.key === 'card_date_all_sessions_to')?.value
        const scope = data.find(d => d.key === 'card_date_all_sessions_scope')?.value
        if (from && to && (scope === 'athletes' || scope === 'both')) {
          setCoachAttendanceDateSettings({ from, to })
        }
      })
  }, [])

  useEffect(() => {
    supabase.from('team_settings').select('*').in('key', ['card_date_f2f_sessions_from', 'card_date_f2f_sessions_to', 'card_date_f2f_sessions_scope'])
      .then(({ data }) => {
        if (!data?.length) return
        const from = data.find(d => d.key === 'card_date_f2f_sessions_from')?.value
        const to = data.find(d => d.key === 'card_date_f2f_sessions_to')?.value
        const scope = data.find(d => d.key === 'card_date_f2f_sessions_scope')?.value
        if (from && to && (scope === 'athletes' || scope === 'both')) {
          setCoachF2fDateSettings({ from, to })
        }
      })
  }, [])

  // Clicking outside the Physical section collapses the whole thing;
  // clicking outside an open detail panel (but still inside Physical)
  // collapses just that panel.
  useEffect(() => {
    if (!showPhysicalSection) return
    function handleClick(e) {
      if (physicalSectionRef.current && !physicalSectionRef.current.contains(e.target)) {
        setShowPhysicalSection(false)
        setActivePhysicalCategory(null)
        setExpandedHomeRun(null)
        setExpandedHomeWatt(null)
        setExpandedHomeBodyweight(null)
        setExpandedHomeStretch(null)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [showPhysicalSection])

  useEffect(() => {
    if (!showTestSection) return
    function handleClick(e) {
      if (testSectionRef.current && !testSectionRef.current.contains(e.target)) {
        setShowTestSection(false)
        setExpandedHomeTestCategory(null)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [showTestSection])

  useEffect(() => {
    if (!showTechniqueSection) return
    function handleClick(e) {
      if (techniqueSectionRef.current && !techniqueSectionRef.current.contains(e.target)) {
        setShowTechniqueSection(false)
        setExpandedTechniqueCategory(null)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [showTechniqueSection])

  useEffect(() => {
    if (!showTacticalSection) return
    function handleClick(e) {
      if (tacticalSectionRef.current && !tacticalSectionRef.current.contains(e.target)) {
        setShowTacticalSection(false)
        setExpandedTacticalCategory(null)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [showTacticalSection])

  useEffect(() => {
    if (!showMentalitySection) return
    function handleClick(e) {
      if (mentalitySectionRef.current && !mentalitySectionRef.current.contains(e.target)) {
        setShowMentalitySection(false)
        setExpandedHomeMentality(null)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [showMentalitySection])

  useEffect(() => {
    if (!showWellbeingSection) return
    function handleClick(e) {
      if (wellbeingSectionRef.current && !wellbeingSectionRef.current.contains(e.target)) {
        setShowWellbeingSection(false)
        setExpandedHomeWb(null)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [showWellbeingSection])

  useEffect(() => {
    if (!expandedHomeRun) return
    function handleClick(e) {
      if (runPanelRef.current && !runPanelRef.current.contains(e.target)) setExpandedHomeRun(null)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [expandedHomeRun])

  useEffect(() => {
    if (!expandedHomeWatt) return
    function handleClick(e) {
      if (wattPanelRef.current && !wattPanelRef.current.contains(e.target)) setExpandedHomeWatt(null)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [expandedHomeWatt])

  useEffect(() => {
    if (!expandedHomeBodyweight) return
    function handleClick(e) {
      if (bodyweightPanelRef.current && !bodyweightPanelRef.current.contains(e.target)) setExpandedHomeBodyweight(null)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [expandedHomeBodyweight])

  useEffect(() => {
    if (expandedHomeStretch == null) return
    function handleClick(e) {
      if (stretchPanelRef.current && !stretchPanelRef.current.contains(e.target)) setExpandedHomeStretch(null)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [expandedHomeStretch])
  const [todaysRunning, setTodaysRunning] = useState([])
  const [todaysWattBike, setTodaysWattBike] = useState([])
  const [todaysBodyweight, setTodaysBodyweight] = useState([])
  const [todaysStretches, setTodaysStretches] = useState(['', '', ''])
  const [todaysSnc, setTodaysSnc] = useState([])
  const [showSncCards, setShowSncCards] = useState(false)
  const [sncRoutineDraft, setSncRoutineDraft] = useState('')
  const [savingPhysical, setSavingPhysical] = useState(false)
  const [moduleSubType, setModuleSubType] = useState({})
  const [loading, setLoading]   = useState(true)
  const [editNote, setEditNote] = useState(false)
  const [noteText, setNoteText] = useState('')
  const [saving, setSaving]     = useState(false)

  useEffect(() => {
    if (profile) load()
    else if (profile === null) setLoading(false)
  }, [profile])

  async function load() {
    try {
      const { data: sRows } = await supabase
        .from('students')
        .select('*, members(first_name, last_name, date_of_birth, email, phone, houses(name))')
        .eq('member_id', profile.id)
        .limit(1)
      const s = sRows?.[0] || null
      setStudent(s)
      if (s) {
        const [{ data: ap }, { data: pts }, { data: sess }, { data: myAtt }] = await Promise.all([
          supabase.from('athlete_profiles').select('*').eq('student_id', s.id).limit(1),
          supabase.from('points_log').select('*').eq('student_id', s.id).order('awarded_at', { ascending: false }).limit(20),
          supabase.from('fit2fight_sessions').select('*').eq('student_id', s.id).order('session_date', { ascending: false }),
          supabase.from('attendance').select('*').eq('student_id', s.id).order('session_date', { ascending: false }),
        ])
        setApData(ap?.[0] || null)
        setAlterEgoWorkbook(ap?.[0]?.alter_ego_workbook || {})
        setPoints(pts || [])
        setSessions(sess || [])
        setAttendanceData(myAtt || [])

        const { data: allAtt } = await supabase.from('attendance')
          .select('student_id, session_date, attendance_type, students(discipline, class_schedule, class_time)')
        setAllAttendance(allAtt || [])

        supabase.from('student_class_assignments').select('id, class_id, classes(*)')
          .eq('student_id', s.id)
          .then(({ data, error }) => { if (!error) setAssignedClasses(data || []) })

        supabase.from('holidays').select('*').then(({ data }) => setHolidays(data || []))

        supabase.from('opponent_notes').select('*').eq('student_id', s.id).order('created_at', { ascending: true })
          .then(({ data, error }) => { if (!error) setOpponentNotes(data || []) })

        // Sweep the Sheds -- tasks a coach has assigned to this athlete
        supabase.from('shed_tasks').select('*').eq('student_id', s.id).order('assigned_at', { ascending: false })
          .then(({ data, error }) => { if (!error) setShedTasks(data || []) })

        // Every target (section-level AND individual question-level)
        // that could apply to this athlete -- either team-wide or set
        // specifically for them. Used to build the combined done/target
        // ratio shown on each section header.
        supabase.from('team_targets').select('*')
          .or(`student_id.is.null,student_id.eq.${s.id}`)
          .then(({ data, error }) => { if (!error) setSectionTargets(data || []) })

        supabase.from('athlete_notes_log').select('*').eq('student_id', s.id).order('logged_at', { ascending: false })
          .then(({ data, error }) => { if (!error) setMyNotesLog(data || []) })

        supabase.from('tpt_kickboxing').select('*').eq('student_id', s.id).order('assessed_at', { ascending: false }).limit(2)
          .then(({ data, error }) => { if (!error) setTptData(prev => ({ ...prev, kickboxing: data || [] })) })
        supabase.from('tpt_boxing').select('*').eq('student_id', s.id).order('assessed_at', { ascending: false }).limit(2)
          .then(({ data, error }) => { if (!error) setTptData(prev => ({ ...prev, boxing: data || [] })) })

        // TTP benchmark only currently exists for boxing (KRBA) --
        // there's no equivalent for kickboxing yet, so the TTP radar
        // axis is only meaningful for KRBA athletes for now.
        supabase.from('ttp_benchmarks').select('*').eq('discipline', 'boxing')
          .order('set_at', { ascending: false }).limit(1)
          .then(({ data, error }) => { if (!error) setTtpBenchmark(data?.[0] || null) })

        supabase.from('ttp_benchmarks').select('*').eq('discipline', 'kickboxing')
          .order('set_at', { ascending: false }).limit(1)
          .then(({ data, error }) => { if (!error) setTtpBenchmarkKB(data?.[0] || null) })

        supabase.from('whoop_connections').select('*').eq('student_id', s.id).maybeSingle()
          .then(({ data }) => setWhoopConnection(data || null))
        supabase.from('whoop_sessions').select('*').eq('student_id', s.id).order('start_time', { ascending: false }).limit(20)
          .then(({ data, error }) => { if (!error) setWhoopSessions(data || []) })

        supabase.from('classes').select('*').eq('active', true).order('day_of_week').order('start_time')
          .then(({ data, error }) => { if (!error) setAllClasses(data || []) })

        supabase.from('club_events').select('*').eq('send_to_all_students', true).order('event_date')
          .then(({ data, error }) => {
            if (error) return
            const relevant = (data || []).filter(ev => {
              if (ev.target_type === 'individual') return ev.target_student_id === s.id
              if (ev.target_type === 'kr') return !!s.is_kr
              if (ev.target_type === 'krba') return s.discipline === 'KRBA'
              return true // 'all' or unset (older events)
            })
            setClubEvents(relevant)
          })

        supabase.from('athlete_reports').select('*').eq('student_id', s.id).order('sent_at', { ascending: false })
          .then(({ data, error }) => { if (!error) setMyReports(data || []) })

        const [{ data: houseData }, { data: rankData }] = await Promise.all([
          supabase.from('houses').select('id, name, points').order('points', { ascending: false }),
          supabase.from('students').select('id, house_points, members(houses(name))')
            .or('is_kr.eq.true,is_pts.eq.true,discipline.eq.KRBA'),
        ])
        setHouses(houseData || [])
        setRankList(rankData || [])

        if (rankData?.length) {
          const { data: ptsLog } = await supabase.from('points_log').select('student_id, points_awarded')
            .in('student_id', rankData.map(r => r.id))
          const totals = {}
          ;(ptsLog || []).forEach(p => { totals[p.student_id] = (totals[p.student_id] || 0) + (p.points_awarded || 0) })
          setTruePointTotals(totals)
        }
      }
    } catch(e) {
      console.error('AthleteApp load error:', e)
    }
    setLoading(false)
  }

  async function saveNote(text) {
    if (!student) return
    setSaving(true)
    const current = apData?.pdp_notes || {}
    const updated = { ...current, athlete_notes: text ? [text] : [] }
    await supabase.from('athlete_profiles')
      .upsert({ student_id: student.id, pdp_notes: updated }, { onConflict: 'student_id' })
    setApData(a => ({ ...(a || {}), pdp_notes: updated }))
    setEditNote(false)
    setSaving(false)
  }

  // Athlete adds one of their own shared PDP items to their calendar --
  // matches the coach's own "send to timetable" feature, so the athlete
  // can schedule when they'll actually work on something their coach
  // has shared with them.
  // Athlete's own "Ready" competition-prep notes -- unlike the
  // coach-authored PDP sections above (shared, read-only to the
  // athlete), this is written by the athlete themselves.
  async function saveAthletePdpReadyField(field, value) {
    if (!student) return
    const pdp = apData?.pdp_notes || {}
    const updated = { ...pdp, ready: { ...(pdp.ready || {}), [field]: value } }
    const { error } = await supabase.from('athlete_profiles').upsert({ student_id: student.id, pdp_notes: updated }, { onConflict: 'student_id' })
    if (error) { alert('Error saving: ' + error.message); return }
    setApData(a => ({ ...a, pdp_notes: updated }))
  }

  function ScheduleWizardPanel() {
    const DAYS_OF_WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
    return (
      <div>
        {schedWizardStep === 'days' && (
          <>
            <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 6 }}>Which day(s)? (repeats every week)</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
              {DAYS_OF_WEEK.map(d => (
                <button key={d} type="button" onClick={() => setSchedWizardDays(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d])}
                  className="btn btn-sm" style={{ background: schedWizardDays.includes(d) ? '#E24B4A20' : undefined, borderColor: schedWizardDays.includes(d) ? '#E24B4A' : undefined }}>
                  {d.slice(0, 3)}
                </button>
              ))}
            </div>
            <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Time (optional)</label>
            <input type="time" value={schedWizardTime} onChange={e => setSchedWizardTime(e.target.value)} style={{ width: '100%', marginBottom: 14 }} />
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-primary" disabled={!schedWizardDays.length} onClick={() => setSchedWizardStep('metric')}>Next</button>
              <button className="btn" onClick={() => setAthleteTimetableModal(null)}>Cancel</button>
            </div>
          </>
        )}

        {schedWizardStep === 'metric' && (
          <>
            <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 8 }}>How should this be measured? (optional)</label>
            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
              {[['rounds', 'Rounds'], ['time', 'Time'], ['reps', 'Reps']].map(([key, label]) => (
                <button key={key} type="button" className="btn btn-sm" style={{ flex: 1, justifyContent: 'center' }}
                  onClick={() => { setSchedWizardMetricType(key); setSchedWizardStep('value') }}>{label}</button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-primary" onClick={athleteSendToTimetable}>Save (no detail)</button>
              <button className="btn" onClick={() => setSchedWizardStep('days')}>Back</button>
            </div>
          </>
        )}

        {schedWizardStep === 'value' && (
          <>
            <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 6 }}>
              {schedWizardMetricType === 'rounds' ? 'How many rounds?' : schedWizardMetricType === 'time' ? 'How long (seconds)?' : 'How many reps?'}
            </label>
            <input type="number" inputMode="numeric" value={schedWizardValue} onChange={e => setSchedWizardValue(e.target.value)}
              placeholder={schedWizardMetricType === 'time' ? 'e.g. 30' : 'e.g. 3'} style={{ width: '100%', marginBottom: 14 }} />
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="btn btn-primary" disabled={!schedWizardValue} onClick={athleteSendToTimetable}>Save</button>
              {schedWizardMetricType === 'rounds' && (
                <button className="btn" disabled={!schedWizardValue} onClick={() => setSchedWizardStep('submetric')}>Next</button>
              )}
              <button className="btn" onClick={() => setSchedWizardStep('metric')}>Back</button>
            </div>
          </>
        )}

        {schedWizardStep === 'submetric' && (
          <>
            <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 8 }}>Per round, measured by?</label>
            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
              {[['time', 'Time'], ['reps', 'Reps']].map(([key, label]) => (
                <button key={key} type="button" className="btn btn-sm" style={{ flex: 1, justifyContent: 'center' }}
                  onClick={() => { setSchedWizardSubType(key); setSchedWizardStep('subvalue') }}>{label}</button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-primary" onClick={athleteSendToTimetable}>Save (rounds only)</button>
              <button className="btn" onClick={() => setSchedWizardStep('value')}>Back</button>
            </div>
          </>
        )}

        {schedWizardStep === 'subvalue' && (
          <>
            <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 6 }}>
              {schedWizardSubType === 'time' ? 'Seconds per round?' : 'Reps per round?'}
            </label>
            <input type="number" inputMode="numeric" value={schedWizardSubValue} onChange={e => setSchedWizardSubValue(e.target.value)}
              placeholder={schedWizardSubType === 'time' ? 'e.g. 30' : 'e.g. 10'} style={{ width: '100%', marginBottom: 14 }} />
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-primary" disabled={!schedWizardSubValue} onClick={athleteSendToTimetable}>Save</button>
              <button className="btn" onClick={() => setSchedWizardStep('submetric')}>Back</button>
            </div>
          </>
        )}
      </div>
    )
        }

  async function athleteSendToTimetable() {
    if (!athleteTimetableModal || !schedWizardDays.length || !student) return
    const { sectionKey, item } = athleteTimetableModal
    const key = `__timetable_${sectionKey}`
    const pdp = apData?.pdp_notes || {}
    const current = pdp[key] || {}
    const metric = schedWizardMetricType ? {
      type: schedWizardMetricType,
      value: schedWizardValue || null,
      subType: schedWizardMetricType === 'rounds' ? schedWizardSubType : null,
      subValue: schedWizardMetricType === 'rounds' ? (schedWizardSubValue || null) : null,
    } : null
    const updated = {
      ...pdp,
      [key]: { ...current, [item]: { days: schedWizardDays, time: schedWizardTime || null, metric } },
    }
    const { error } = await supabase.from('athlete_profiles').upsert({ student_id: student.id, pdp_notes: updated }, { onConflict: 'student_id' })
    if (error) { alert('Error adding to calendar: ' + error.message); return }
    setApData(a => ({ ...a, pdp_notes: updated }))
    setAthleteTimetableModal(null)
    setSchedWizardStep('days'); setSchedWizardDays([]); setSchedWizardTime('')
    setSchedWizardMetricType(null); setSchedWizardValue(''); setSchedWizardSubType(null); setSchedWizardSubValue('')
  }

  // Looks up a scheduled timetable entry for a given PDP item, if the
  // athlete has already added it to their calendar. Recurring -- days
  // is an array of weekday names it repeats on every week, not a
  // single date.
  // All items the athlete has scheduled (via the wizard above) that
  // repeat on a given weekday, across every PDP section -- this is what
  // actually "sends" a scheduled item to the Weekly Timetable.
  function getScheduledItemsForDay(day) {
    const pdp = apData?.pdp_notes || {}
    const out = []
    PDP_SECTIONS.forEach(section => {
      const key = `__timetable_${section.key}`
      Object.entries(pdp[key] || {}).forEach(([item, entry]) => {
        if (entry?.days?.includes(day)) {
          const metricStr = formatScheduleMetric(entry.metric)
          out.push({ item, text: item + (metricStr ? ` — ${metricStr}` : ''), time: entry.time, completed: entry.completed, sectionKey: section.key, colour: section.colour })
        }
      })
    })
    return out
  }
  function timetableEntry(sectionKey, item) {
    return ((apData?.pdp_notes || {})[`__timetable_${sectionKey}`] || {})[item] || null
  }
  // Short "3 rounds x 30 sec" style summary of a scheduled item's metric.
  function formatScheduleMetric(metric) {
    if (!metric?.type) return null
    if (metric.type === 'rounds') {
      let s = `${metric.value || '?'} round${metric.value == 1 ? '' : 's'}`
      if (metric.subType === 'time' && metric.subValue) s += ` × ${metric.subValue}s`
      if (metric.subType === 'reps' && metric.subValue) s += ` × ${metric.subValue} reps`
      return s
    }
    if (metric.type === 'time') return metric.value ? `${metric.value}s` : null
    if (metric.type === 'reps') return metric.value ? `${metric.value} reps` : null
    return null
  }

  async function toggleShedTask(taskId, completed) {
    const { error } = await supabase.from('shed_tasks')
      .update({ completed, completed_at: completed ? new Date().toISOString() : null })
      .eq('id', taskId)
    if (error) { alert('Error updating task: ' + error.message); return }
    setShedTasks(prev => prev.map(t => t.id === taskId ? { ...t, completed, completed_at: completed ? new Date().toISOString() : null } : t))
  }

  async function addOwnOpponentNote(opponentName, noteText) {
    if (!student || !opponentName.trim() || !noteText.trim()) return
    const { data, error } = await supabase.from('opponent_notes').insert({
      student_id: student.id, opponent_name: opponentName.trim(), note_text: noteText.trim(),
      author_role: 'athlete', author_member_id: profile?.id || null, is_shared: true,
    }).select().single()
    if (error) { alert('Error saving note: ' + error.message); return }
    setOpponentNotes(prev => [...prev, data])
  }

  async function updateOwnOpponentNote(noteId, newText) {
    if (!newText.trim()) return
    const { error } = await supabase.from('opponent_notes').update({ note_text: newText.trim() }).eq('id', noteId)
    if (error) { alert('Error updating note: ' + error.message); return }
    setOpponentNotes(prev => prev.map(n => n.id === noteId ? { ...n, note_text: newText.trim() } : n))
    setEditingOpponentNoteId(null)
  }

  useEffect(() => {
    const todaysDate = new Date().toISOString().split('T')[0]
    const todaysSession = sessions.find(s => s.session_date === todaysDate)
    setTodaysWellbeing(todaysSession?.wellbeing || {})
    setTodaysMentalityLog(todaysSession?.mentality_log || {})
    setTodaysTest(todaysSession?.test || {})
    setTodaysRunning(toEntries(todaysSession?.running))
    setTodaysWattBike(toEntries(todaysSession?.watt_bike))
    setTodaysBodyweight(toEntries(todaysSession?.bodyweight))
    setTodaysStretches(todaysSession?.stretch_flows || ['', '', ''])
    setTodaysSnc(toEntries(todaysSession?.snc))
    setTodaysTechniques(toEntries(todaysSession?.techniques))
    setTodaysTactical(toEntries(todaysSession?.tactical))
  }, [sessions])

  useEffect(() => {
    supabase.from('settings').select('key,value').in('key', ['f2f_run_categories', 'f2f_interval_modes', 'f2f_bodyweight_types', 'f2f_stretch_options'])
      .then(({ data }) => {
        const map = Object.fromEntries((data || []).map(r => [r.key, r.value]))
        setRunCategoryTests(map.f2f_run_categories || {})
        setIntervalModes(map.f2f_interval_modes || ['20 seconds on 20 seconds off', '30 seconds on 30 seconds off', '40 seconds on 20 seconds off'])
        setBodyweightTypeOptions(map.f2f_bodyweight_types || ['Push-ups', 'Pull-ups', 'Squats', 'Dips', 'Sit-ups', 'Burpees', 'Other'])
        setStretchOptionsList(map.f2f_stretch_options || ['Other'])
      })
  }, [])

  // Hold-to-quick-log: marks a card as "done today" without requiring
  // specific values yet -- appends a lightweight marker entry that
  // can be expanded with real detail later. Reuses the same
  // upsert-today's-session pattern as saveWellbeingField below.
  async function quickLogArrayField(field, currentEntries, setter) {
    if (!student) return
    const todaysDate = new Date().toISOString().split('T')[0]
    const newEntries = [...currentEntries, { quickLogged: true, sets: [] }]
    setter(newEntries)

    const existing = sessions.find(s => s.session_date === todaysDate)
    let error
    if (existing) {
      ;({ error } = await supabase.from('fit2fight_sessions').update({ [field]: newEntries }).eq('id', existing.id))
      if (!error) setSessions(prev => prev.map(s => s.id === existing.id ? { ...s, [field]: newEntries } : s))
    } else {
      const { data, error: insertErr } = await supabase.from('fit2fight_sessions')
        .insert({ student_id: student.id, session_date: todaysDate, [field]: newEntries })
        .select().single()
      error = insertErr
      if (!error && data) setSessions(prev => [data, ...prev])
    }
    if (error) alert('Error saving: ' + error.message)
  }

  async function addNote() {
    if (!newNoteText.trim() || !student) return
    setSavingNote(true)
    const { data, error } = await supabase.from('athlete_notes_log')
      .insert({ student_id: student.id, note_text: newNoteText.trim(), logged_at: new Date().toISOString() })
      .select().single()
    if (error) { alert('Error saving note: ' + error.message); setSavingNote(false); return }
    setMyNotesLog(prev => [data, ...prev])
    setNewNoteText('')
    setSavingNote(false)
  }

  async function deleteNote(noteId) {
    if (!confirm('Delete this note?')) return
    const { error } = await supabase.from('athlete_notes_log').delete().eq('id', noteId)
    if (error) { alert('Error deleting note: ' + error.message); return }
    setMyNotesLog(prev => prev.filter(n => n.id !== noteId))
  }

  async function updateNote(noteId, text) {
    if (!text.trim()) return
    setSavingNote(true)
    const { error } = await supabase.from('athlete_notes_log').update({ note_text: text.trim() }).eq('id', noteId)
    setSavingNote(false)
    if (error) { alert('Error saving note: ' + error.message); return }
    setMyNotesLog(prev => prev.map(n => n.id === noteId ? { ...n, note_text: text.trim() } : n))
    setOpenNoteId(null)
  }

  // Simple keyword-matching (not true AI) to spot notes that read like
  // they belong in a specific F2F category, so they can be sent there
  // with one tap instead of the athlete retyping the same thing twice.
  // Deliberately conservative -- only flags a note when there's a clear
  // signal, rather than guessing on ambiguous text.
  //
  // action types:
  //   'wellbeing-notes' -- has a free-text notes field (nutrition/
  //                        creative/productivity), so the note's text
  //                        is appended straight in
  //   'wellbeing-open'  -- no notes field (sleep/hydration), so this
  //                        just opens that question for the athlete to
  //                        fill in themselves
  //   'mentality-open'  -- opens the matching Mentality question
  //   'physical-open'   -- opens the matching Physical panel
  //   'interval-run'    -- opens Running > Interval specifically
  const NOTE_CATEGORY_MATCHERS = [
    { key: 'nutrition', label: 'Nutrition', action: 'wellbeing-notes', field: 'nutrition', keywords: [
      'egg', 'toast', 'chicken', 'rice', 'pasta', 'protein', 'shake', 'smoothie', 'oats', 'porridge',
      'breakfast', 'lunch', 'dinner', 'snack', 'meal', 'salad', 'fish', 'yoghurt', 'yogurt', 'calories',
      'ate ', 'eating', 'food', 'fruit', 'veg', 'vegetables', 'carbs',
    ]},
    { key: 'interval', label: 'Interval Run', action: 'interval-run', keywords: [
      'interval', 'sprint', 'seconds on', 'sec on', 'on/off', 'on off', 'rest interval',
    ]},
    { key: 'sleep', label: 'Sleep', action: 'wellbeing-open', field: 'sleep', keywords: [
      'slept', 'hours sleep', 'hrs sleep', 'went to bed', 'bad night', 'good night sleep', 'insomnia', 'woke up', 'nap',
    ]},
    { key: 'hydration', label: 'Hydration', action: 'wellbeing-open', field: 'hydration', keywords: [
      'litres of water', 'liters of water', 'glasses of water', 'dehydrated', 'drank water', 'water intake',
    ]},
    { key: 'creative', label: 'Creative time', action: 'wellbeing-notes', field: 'creative', keywords: [
      'drew', 'painted', 'played guitar', 'played piano', 'wrote a song', 'creative time', 'sketched', 'played music',
    ]},
    { key: 'productivity', label: 'Productivity', action: 'wellbeing-notes', field: 'productivity', keywords: [
      'productive day', 'got loads done', 'ticked off my list', 'to-do list', 'todo list', 'got a lot done',
    ]},
    { key: 'meditation', label: 'Meditation', action: 'mentality-open', questionKey: 'meditation', keywords: [
      'meditated', 'meditation', 'breathing exercise', 'mindfulness',
    ]},
    { key: 'reading', label: 'Reading', action: 'mentality-open', questionKey: 'reading', keywords: [
      'read a book', 'reading a book', 'pages of', 'finished a chapter',
    ]},
    { key: 'chess', label: 'Chess', action: 'mentality-open', questionKey: 'chess', keywords: [
      'played chess', 'chess game', 'chess match',
    ]},
    { key: 'gaming', label: 'Gaming', action: 'mentality-open', questionKey: 'gaming', keywords: [
      'played fifa', 'on the xbox', 'on the playstation', 'video game', 'gaming session',
    ]},
    { key: 'coldWater', label: 'Cold water', action: 'mentality-open', questionKey: 'coldWater', keywords: [
      'cold shower', 'ice bath', 'cold plunge', 'cold water therapy',
    ]},
    { key: 'gratitude', label: 'Gratitude', action: 'mentality-open', questionKey: 'gratitude', keywords: [
      'grateful for', 'feeling grateful', 'thankful for',
    ]},
    { key: 'stretch', label: 'Stretch flows', action: 'physical-open', panel: 'stretch', keywords: [
      'stretching session', 'did some stretches', 'stretch flow', 'flexibility session',
    ]},
  ]
  function detectNoteCategory(text) {
    const lower = (text || '').toLowerCase()
    return NOTE_CATEGORY_MATCHERS.find(m => m.keywords.some(w => lower.includes(w))) || null
  }
  // Single handler covering every action type above -- keeps the send
  // logic in one place rather than a separate function per category.
  async function sendNoteToCategory(matcher, noteText) {
    if (matcher.action === 'wellbeing-notes') {
      const existing = todaysWellbeing[matcher.field]?.notes || ''
      const combined = existing ? `${existing}\n${noteText}` : noteText
      await saveWellbeingField(matcher.field, cur => ({ ...cur, notes: combined }))
      setTab('home')
      setShowWellbeingSection(true)
      setExpandedHomeWb(matcher.field)
      setTimeout(() => wellbeingSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100)
    } else if (matcher.action === 'wellbeing-open') {
      setTab('home')
      setShowWellbeingSection(true)
      setExpandedHomeWb(matcher.field)
      setTimeout(() => wellbeingSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100)
    } else if (matcher.action === 'mentality-open') {
      setTab('home')
      setShowMentalitySection(true)
      setExpandedHomeMentality(matcher.questionKey)
      setTimeout(() => mentalitySectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100)
    } else if (matcher.action === 'physical-open') {
      setTab('home')
      setShowPhysicalSection(true)
      setActivePhysicalCategory(matcher.panel)
      setExpandedHomeRun(null); setExpandedHomeWatt(null); setExpandedHomeBodyweight(null); setExpandedHomeStretch(null)
      if (matcher.panel === 'stretch') setExpandedHomeStretch(true)
      setTimeout(() => physicalSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100)
    } else if (matcher.action === 'interval-run') {
      setTab('home')
      setShowPhysicalSection(true)
      setActivePhysicalCategory('running')
      setExpandedHomeRun('Interval')
      setExpandedHomeWatt(null); setExpandedHomeBodyweight(null); setExpandedHomeStretch(null)
      setTimeout(() => physicalSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100)
    }
  }

  async function quickLogStretch() {
    if (!student) return
    const todaysDate = new Date().toISOString().split('T')[0]
    const newStretches = [...todaysStretches.filter(Boolean), 'Quick logged']
    setTodaysStretches(newStretches)

    const existing = sessions.find(s => s.session_date === todaysDate)
    let error
    if (existing) {
      ;({ error } = await supabase.from('fit2fight_sessions').update({ stretch_flows: newStretches }).eq('id', existing.id))
      if (!error) setSessions(prev => prev.map(s => s.id === existing.id ? { ...s, stretch_flows: newStretches } : s))
    } else {
      const { data, error: insertErr } = await supabase.from('fit2fight_sessions')
        .insert({ student_id: student.id, session_date: todaysDate, stretch_flows: newStretches })
        .select().single()
      error = insertErr
      if (!error && data) setSessions(prev => [data, ...prev])
    }
    if (error) alert('Error saving: ' + error.message)
  }

  // Save a single wellbeing question's data directly from the Home page,
  // without needing to open the full Fit2Fight log form. Updates today's
  // session if one already exists, otherwise creates one.
  async function saveWellbeingField(field, updater) {
    if (!student) return
    setSavingWellbeing(true)
    const todaysDate = new Date().toISOString().split('T')[0]
    const current = todaysWellbeing[field] || {}
    const updatedField = updater(current)
    const newWellbeing = { ...todaysWellbeing, [field]: updatedField }
    setTodaysWellbeing(newWellbeing) // optimistic local update

    const existing = sessions.find(s => s.session_date === todaysDate)
    let error
    if (existing) {
      ;({ error } = await supabase.from('fit2fight_sessions').update({ wellbeing: newWellbeing }).eq('id', existing.id))
      if (!error) setSessions(prev => prev.map(s => s.id === existing.id ? { ...s, wellbeing: newWellbeing } : s))
    } else {
      const { data, error: insertErr } = await supabase.from('fit2fight_sessions')
        .insert({ student_id: student.id, session_date: todaysDate, wellbeing: newWellbeing })
        .select().single()
      error = insertErr
      if (!error && data) setSessions(prev => [data, ...prev])
    }
    if (error) alert('Error saving: ' + error.message)
    setSavingWellbeing(false)
  }

  // Resets a single Wellbeing question back to its empty state -- the
  // "unselect" option for a card that's already been logged
  function clearWellbeingQuestion(key) {
    const defaults = {
      sleep: { hours: '', efficiency: '' },
      nutrition: { targetPreset: '', quality: '', coffee: 0 },
      hydration: { total: 0 },
      outdoors: { totalMinutes: 0 },
      talk: { count: 0 },
      screenFree: { hours: '', custom: '' },
      journal: { count: 0, notes: '', privateJournal: false },
      creative: { count: 0, notes: '' },
      productivity: { count: 0, notes: '' },
    }
    if (defaults[key]) saveWellbeingField(key, () => defaults[key])
  }

  // Same pattern as saveWellbeingField/clearWellbeingQuestion above, but
  // for the granular Mentality question breakdown (stored in the
  // separate mentality_log column so it doesn't clash with the simple
  // multi-select 'mentality' field used by the log form).
  async function saveAlterEgoWorkbook(updates) {
    if (!student) return
    setSavingAlterEgo(true)
    const next = { ...alterEgoWorkbook, ...updates }
    setAlterEgoWorkbook(next)
    const { error } = await supabase.from('athlete_profiles')
      .upsert({ student_id: student.id, alter_ego_workbook: next }, { onConflict: 'student_id' })
    if (error) alert('Error saving: ' + error.message)
    setApData(p => ({ ...(p || {}), alter_ego_workbook: next }))
    setSavingAlterEgo(false)
  }

  async function addAlterEgoReflection() {
    if (!student) return
    setSavingAlterEgo(true)
    const entry = { date: new Date().toISOString(), ...newReflectionText }
    const next = { ...alterEgoWorkbook, reflections: [entry, ...(alterEgoWorkbook.reflections || [])] }
    setAlterEgoWorkbook(next)
    const { error } = await supabase.from('athlete_profiles')
      .upsert({ student_id: student.id, alter_ego_workbook: next }, { onConflict: 'student_id' })
    if (error) alert('Error saving: ' + error.message)
    setApData(p => ({ ...(p || {}), alter_ego_workbook: next }))
    setNewReflectionText({ helped: '', fellShort: '', adjust: '', didItShowUp: null })
    setSavingAlterEgo(false)
  }

  async function saveMentalityField(field, updater) {
    if (!student) return
    setSavingMentalityLog(true)
    const todaysDate = new Date().toISOString().split('T')[0]
    const current = todaysMentalityLog[field] || {}
    const updatedField = updater(current)
    const newLog = { ...todaysMentalityLog, [field]: updatedField }
    setTodaysMentalityLog(newLog)

    const existing = sessions.find(s => s.session_date === todaysDate)
    let error
    if (existing) {
      ;({ error } = await supabase.from('fit2fight_sessions').update({ mentality_log: newLog }).eq('id', existing.id))
      if (!error) setSessions(prev => prev.map(s => s.id === existing.id ? { ...s, mentality_log: newLog } : s))
    } else {
      const { data, error: insertErr } = await supabase.from('fit2fight_sessions')
        .insert({ student_id: student.id, session_date: todaysDate, mentality_log: newLog })
        .select().single()
      error = insertErr
      if (!error && data) setSessions(prev => [data, ...prev])
    }
    if (error) alert('Error saving: ' + error.message)
    setSavingMentalityLog(false)
  }

  function clearMentalityQuestion(key) {
    const defaults = {
      videoAnalysis: { entries: [] },
      meditation: { entries: [] },
      visualisation: { entries: [] },
      chess: { count: 0 },
      reading: { count: 0 },
      gaming: { count: 0 },
      eyeTracking: { count: 0 },
      coldWater: { count: 0 },
      activeRecovery: { entries: [] },
      gratitude: { count: 0, notes: '' },
    }
    if (defaults[key]) saveMentalityField(key, () => defaults[key])
  }

  // Saves a single test value directly into today's flat test map
  // (test: { [testName]: value }) -- same shape the log form and
  // results charts already use.
  async function saveTestValue(testName, value) {
    if (!student) return
    setSavingTest(true)
    const todaysDate = new Date().toISOString().split('T')[0]
    const newTest = { ...todaysTest, [testName]: value }
    setTodaysTest(newTest)

    const existing = sessions.find(s => s.session_date === todaysDate)
    let error
    if (existing) {
      ;({ error } = await supabase.from('fit2fight_sessions').update({ test: newTest }).eq('id', existing.id))
      if (!error) setSessions(prev => prev.map(s => s.id === existing.id ? { ...s, test: newTest } : s))
    } else {
      const { data, error: insertErr } = await supabase.from('fit2fight_sessions')
        .insert({ student_id: student.id, session_date: todaysDate, test: newTest })
        .select().single()
      error = insertErr
      if (!error && data) setSessions(prev => [data, ...prev])
    }
    if (error) alert('Error saving: ' + error.message)
    setSavingTest(false)
  }

  async function clearTestCategory(catKey) {
    if (!student) return
    const cat = TEST_CATEGORIES.find(c => c.key === catKey)
    if (!cat) return
    setSavingTest(true)
    const newTest = { ...todaysTest }
    cat.tests.forEach(t => delete newTest[t.name])
    setTodaysTest(newTest)

    const todaysDate = new Date().toISOString().split('T')[0]
    const existing = sessions.find(s => s.session_date === todaysDate)
    if (existing) {
      const { error } = await supabase.from('fit2fight_sessions').update({ test: newTest }).eq('id', existing.id)
      if (!error) setSessions(prev => prev.map(s => s.id === existing.id ? { ...s, test: newTest } : s))
      if (error) alert('Error saving: ' + error.message)
    }
    setSavingTest(false)
  }

  // Generic save for Running/Watt bike/Bodyweight/Stretch flows -- these
  // are single-object fields (not flat multi-value maps like Test), so
  // saving means writing the whole updated object/array for that field.
  async function savePhysicalField(dbField, newValue, localSetter) {
    if (!student) return
    setSavingPhysical(true)
    localSetter(newValue)
    const todaysDate = new Date().toISOString().split('T')[0]
    const existing = sessions.find(s => s.session_date === todaysDate)
    let error
    if (existing) {
      ;({ error } = await supabase.from('fit2fight_sessions').update({ [dbField]: newValue }).eq('id', existing.id))
      if (!error) setSessions(prev => prev.map(s => s.id === existing.id ? { ...s, [dbField]: newValue } : s))
    } else {
      const { data, error: insertErr } = await supabase.from('fit2fight_sessions')
        .insert({ student_id: student.id, session_date: todaysDate, [dbField]: newValue })
        .select().single()
      error = insertErr
      if (!error && data) setSessions(prev => [data, ...prev])
    }
    if (error) alert('Error saving: ' + error.message)
    setSavingPhysical(false)
  }

  async function addClassAssignment() {
    if (!addClassSelection || !student) return
    setSavingClassAdd(true)
    const { data, error } = await supabase.from('student_class_assignments')
      .insert({ student_id: student.id, class_id: addClassSelection })
      .select('id, class_id, classes(*)').single()
    if (error) { alert('Error adding class: ' + error.message); setSavingClassAdd(false); return }
    setAssignedClasses(prev => [...prev, data])
    setShowAddClass(false)
    setAddClassSelection('')
    setSavingClassAdd(false)
  }

  async function removeClassAssignment(assignmentId) {
    if (!confirm('Remove this class?')) return
    const { error } = await supabase.from('student_class_assignments').delete().eq('id', assignmentId)
    if (error) return alert('Error removing class: ' + error.message)
    setAssignedClasses(prev => prev.filter(a => a.id !== assignmentId))
  }

  // Detects whether there's an existing check-in for today that's
  // still "open" (not checked out) -- so refreshing the page still
  // shows the Check out button rather than losing that state. Stays
  // available for the rest of the day it happened (previously cut off
  // just 1 hour after the class's start time, which was often too
  // tight -- e.g. training ran long, or the athlete simply didn't open
  // the app again until later).
  useEffect(() => {
    if (!student || !attendanceData.length) { setActiveCheckIn(null); return }
    const todayStr = new Date().toISOString().split('T')[0]
    // Only rows from the athlete's OWN self-check-in count here -- a
    // coach marking them present via Registers (including the
    // double-session cascade) never expects a check-out step, and
    // shouldn't make this app think one's needed.
    const todaysOpenEntries = attendanceData.filter(a => a.session_date === todayStr && !a.checked_out_at && a.self_checked_in)
    if (!todaysOpenEntries.length) { setActiveCheckIn(null); return }
    const mostRecent = todaysOpenEntries.sort((a, b) => new Date(b.attended_at) - new Date(a.attended_at))[0]
    setActiveCheckIn(mostRecent)
  }, [student, attendanceData, assignedClasses])


  // Section header progress badge ("1/3") -- picks the athlete-specific
  // target for a section if one's been set, otherwise falls back to
  // the team-wide one; only shows a badge for frequency-style targets
  // ("N per day/week/month"), since free-text targets can't be counted
  // against. "Completed" counts distinct days within the current
  // period that have any activity logged in that section.
  const SECTION_FIELD_CHECK = {
    physical:  s => toEntries(s.running).length > 0 || toEntries(s.watt_bike).length > 0 || toEntries(s.bodyweight).length > 0 || !!s.stretch_flows || !!s.snc || !!s.other_session,
    technique: s => Array.isArray(s.techniques) ? s.techniques.length > 0 : !!s.techniques,
    tactical:  s => Array.isArray(s.tactical) ? s.tactical.length > 0 : !!s.tactical,
    mentality: s => MENTALITY_KEYS_FOR_CHECK.some(k => isMentalityQComplete(k, s.mentality_log)),
    wellbeing: s => WELLBEING_KEYS_FOR_CHECK.some(k => isWellbeingQComplete(k, s.wellbeing)),
    test:      s => !!(s.test && Object.values(s.test).some(v => v !== '' && v != null)),
  }
  function parseFrequencyTarget(targetValue) {
    const m = /^(\d+)\s*per\s*1?\s*(day|week|month|year)/i.exec(targetValue || '')
    if (!m) return null
    return { targetNum: parseInt(m[1]), period: m[2].toLowerCase() }
  }
  function periodStartFor(period) {
    const now = new Date()
    if (period === 'day') return new Date(now.getFullYear(), now.getMonth(), now.getDate())
    if (period === 'week') { const day = (now.getDay() + 6) % 7; return new Date(now.getFullYear(), now.getMonth(), now.getDate() - day) }
    if (period === 'year') return new Date(now.getFullYear(), 0, 1)
    return new Date(now.getFullYear(), now.getMonth(), 1)
  }
  const PERIOD_LETTER = { day: 'D', week: 'W', month: 'M', year: 'Y' }
  // Checks a specific question (by its label, matching what's stored on
  // the target) rather than "anything in the whole section" -- Wellbeing
  // and Mentality have full per-question metadata here so those are
  // exact; the others fall back to the whole-section check since this
  // file doesn't carry the same per-question match metadata the coach
  // dashboard does.
  // Matches the labels added to Physical's Running sub-categories in
  // AthleteProfiles.jsx's DASHBOARD_SECTIONS -- kept in sync manually
  // since this file doesn't share that same array.
  const RUN_CATEGORY_TARGET_LABELS = {
    'Running: Timed Sprints': 'Timed Sprints',
    'Running: Timed Distance Run': 'Timed Distance Run',
    'Running: Interval': 'Interval',
  }
  // Field-level Physical questions (the plain "Running"/"Watt Bike"/etc
  // targets, as opposed to the Running sub-category ones above) --
  // maps a question label to its exact underlying field, mirroring
  // DASHBOARD_SECTIONS' physical subItems in AthleteProfiles.jsx.
  const PHYSICAL_FIELD_TARGET_LABELS = {
    'Running': 'running', 'Watt Bike': 'watt_bike', 'Bodyweight': 'bodyweight',
    'Stretch flows': 'stretch_flows', 'SnC': 'snc', 'Other session': 'other_session',
  }
  function questionLogged(sectionKey, questionLabel, s) {
    if (sectionKey === 'wellbeing') {
      const q = WELLBEING_QUESTIONS.find(q => q.label === questionLabel)
      return q ? isWellbeingQComplete(q.key, s.wellbeing) : false
    }
    if (sectionKey === 'mentality') {
      const q = MENTALITY_QUESTIONS.find(q => q.label === questionLabel)
      return q ? isMentalityQComplete(q.key, s.mentality_log) : false
    }
    if (sectionKey === 'technique') {
      return (s.techniques || []).some(t => t.style === questionLabel) // Boxing/Kickboxing -- label equals matchStyle exactly
    }
    if (sectionKey === 'tactical') {
      return (s.tactical || []).some(t => t.category === questionLabel) // label equals matchCategory exactly
    }
    if (sectionKey === 'test') {
      const cat = TEST_CATEGORIES.find(c => c.label === questionLabel)
      return cat ? cat.tests.some(t => s.test?.[t.name]) : false
    }
    if (sectionKey === 'physical' && RUN_CATEGORY_TARGET_LABELS[questionLabel]) {
      return toEntries(s.running).some(e => e.category === RUN_CATEGORY_TARGET_LABELS[questionLabel])
    }
    if (sectionKey === 'physical' && PHYSICAL_FIELD_TARGET_LABELS[questionLabel]) {
      const field = PHYSICAL_FIELD_TARGET_LABELS[questionLabel]
      const v = s[field]
      return Array.isArray(v) ? v.length > 0 : (v && typeof v === 'object' ? Object.keys(v).length > 0 : !!v)
    }
    return SECTION_FIELD_CHECK[sectionKey] ? SECTION_FIELD_CHECK[sectionKey](s) : false
  }
  // Counts how many separate qualifying entries a question has within
  // ONE session -- e.g. two different runs logged the same day both
  // count, rather than the whole day only counting once. Fields that
  // can only ever hold one value per day still just contribute 0 or 1.
  function questionLoggedCount(sectionKey, questionLabel, s) {
    if (sectionKey === 'technique') return (s.techniques || []).filter(t => t.style === questionLabel).length
    if (sectionKey === 'tactical') return (s.tactical || []).filter(t => t.category === questionLabel).length
    if (sectionKey === 'physical' && RUN_CATEGORY_TARGET_LABELS[questionLabel]) {
      return toEntries(s.running).filter(e => e.category === RUN_CATEGORY_TARGET_LABELS[questionLabel]).length
    }
    return questionLogged(sectionKey, questionLabel, s) ? 1 : 0
  }
  function getSectionProgress(sectionKey) {
    // Group every target row for this section by question (blank key =
    // a whole-section target). A question can have more than one target
    // at once (e.g. daily AND weekly) -- each is resolved and counted
    // independently per period, same as the per-question functions,
    // otherwise a second target on the same question silently gets
    // dropped from this combined total instead of being added to it.
    const byQuestion = {}
    sectionTargets.filter(t => t.section_key === sectionKey).forEach(t => {
      const key = t.question_label || ''
      ;(byQuestion[key] ||= []).push(t)
    })
    if (Object.keys(byQuestion).length === 0) return null

    let totalDone = 0, totalTarget = 0
    const periodsUsed = new Set()
    for (const [questionLabel, targetsForQuestion] of Object.entries(byQuestion)) {
      const resolvedByPeriod = {}
      targetsForQuestion.forEach(t => {
        const freq = parseFrequencyTarget(t.target_value)
        if (!freq) return
        const existing = resolvedByPeriod[freq.period]
        if (existing && existing.student_id === student?.id) return
        if (t.student_id && t.student_id !== student?.id) return
        resolvedByPeriod[freq.period] = t
      })
      for (const target of Object.values(resolvedByPeriod)) {
        const freq = parseFrequencyTarget(target.target_value)
        const periodStartStr = periodStartFor(freq.period).toISOString().split('T')[0]
        const entryCount = questionLabel
          ? sessions.filter(s => s.session_date >= periodStartStr).reduce((sum, s) => sum + questionLoggedCount(sectionKey, questionLabel, s), 0)
          : sessions.filter(s => s.session_date >= periodStartStr && SECTION_FIELD_CHECK[sectionKey]?.(s)).length
        totalDone += entryCount
        totalTarget += freq.targetNum
        periodsUsed.add(freq.period)
      }
    }
    if (totalTarget === 0) return null
    // If every combined target shares the same period (the usual case),
    // show that single letter (D/W/M/Y). If they're genuinely mixed,
    // show all the letters involved rather than pick one arbitrarily.
    const periodLabel = [...periodsUsed].map(p => PERIOD_LETTER[p]).sort().join('/')
    return { done: totalDone, target: totalTarget, periodLabel }
  }
  // Same target-resolution logic as getSectionProgress, but kept
  // separate per period (day/week/month) instead of combined into one
  // number -- used to show 3 individual progress bars rather than a
  // single "X/Y" badge. Targets set for "year" aren't shown here since
  // there are only 3 bars (D/W/M).
  function getSectionProgressByPeriod(sectionKey) {
    const byPeriod = { day: { done: 0, target: 0 }, week: { done: 0, target: 0 }, month: { done: 0, target: 0 } }
    // Group every target row for this section by question (blank key =
    // a whole-section target). A single question can have more than one
    // target at once (e.g. a daily AND a separate weekly target) -- each
    // needs to be resolved and counted independently per period, the
    // same way the per-question progress function does, otherwise a
    // second target on the same question silently gets dropped from
    // the section total instead of being added to it.
    const byQuestion = {}
    sectionTargets.filter(t => t.section_key === sectionKey).forEach(t => {
      const key = t.question_label || ''
      ;(byQuestion[key] ||= []).push(t)
    })
    for (const [questionLabel, targetsForQuestion] of Object.entries(byQuestion)) {
      const resolvedByPeriod = {}
      targetsForQuestion.forEach(t => {
        const freq = parseFrequencyTarget(t.target_value)
        if (!freq || !byPeriod[freq.period]) return
        const existing = resolvedByPeriod[freq.period]
        if (existing && existing.student_id === student?.id) return // already have this athlete's own override for this period
        if (t.student_id && t.student_id !== student?.id) return // someone else's override -- not relevant
        resolvedByPeriod[freq.period] = t
      })
      for (const [period, target] of Object.entries(resolvedByPeriod)) {
        const freq = parseFrequencyTarget(target.target_value)
        const periodStartStr = periodStartFor(freq.period).toISOString().split('T')[0]
        const entryCount = questionLabel
          ? sessions.filter(s => s.session_date >= periodStartStr).reduce((sum, s) => sum + questionLoggedCount(sectionKey, questionLabel, s), 0)
          : sessions.filter(s => s.session_date >= periodStartStr && SECTION_FIELD_CHECK[sectionKey]?.(s)).length
        byPeriod[period].done += entryCount
        byPeriod[period].target += freq.targetNum
      }
    }
    return byPeriod
  }
  // Three small progress bars (Daily/Weekly/Monthly) for a section
  // header -- fills as tasks are completed against whatever targets
  // exist for that period; greyed out/empty if no target is set for
  // that particular period.
  function SectionProgressBars({ sectionKey, compact = false, vertical = false }) {
    const byPeriod = getSectionProgressByPeriod(sectionKey)
    const periods = [['day', 'D'], ['week', 'W'], ['month', 'M']]
    if (vertical) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%' }}>
          {periods.map(([key, letter]) => {
            const { done, target } = byPeriod[key]
            const hasTarget = target > 0
            const pct = hasTarget ? Math.min(100, Math.round((done / target) * 100)) : 0
            const hit = hasTarget && done >= target
            return (
              <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 700, width: 34, flexShrink: 0, textAlign: 'left', color: hasTarget ? (hit ? '#1D9E75' : 'var(--text-tertiary)') : 'var(--border)' }}>
                  {letter} {hasTarget ? `${done}/${target}` : ''}
                </span>
                <div style={{ flex: 1, height: 6, borderRadius: 3, background: 'var(--border)', overflow: 'hidden' }}>
                  {hasTarget && <div style={{ width: `${pct}%`, height: '100%', background: hit ? '#1D9E75' : '#E24B4A', borderRadius: 3 }} />}
                </div>
              </div>
            )
          })}
        </div>
      )
    }
    return (
      <div style={{ display: 'flex', gap: compact ? 4 : 6, width: '100%', marginBottom: compact ? 4 : 6 }}>
        {periods.map(([key, letter]) => {
          const { done, target } = byPeriod[key]
          const hasTarget = target > 0
          const pct = hasTarget ? Math.min(100, Math.round((done / target) * 100)) : 0
          const hit = hasTarget && done >= target
          return (
            <div key={key} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
              <div style={{ width: '100%', height: compact ? 4 : 5, borderRadius: 3, background: 'var(--border)', overflow: 'hidden' }}>
                {hasTarget && <div style={{ width: `${pct}%`, height: '100%', background: hit ? '#1D9E75' : '#E24B4A', borderRadius: 3, transition: 'width 0.3s' }} />}
              </div>
              <span style={{ fontSize: 8, fontWeight: 700, color: hasTarget ? (hit ? '#1D9E75' : 'var(--text-tertiary)') : 'var(--border)' }}>
                {letter}{(hasTarget && !compact) ? ` ${done}/${target}` : ''}
              </span>
            </div>
          )
        })}
      </div>
    )
  }

  function getQuestionProgress(sectionKey, questionLabel) {
    const own = sectionTargets.find(t => t.section_key === sectionKey && t.question_label === questionLabel && t.student_id === student?.id)
    const target = own || sectionTargets.find(t => t.section_key === sectionKey && t.question_label === questionLabel && !t.student_id)
    if (!target) return null
    const freq = parseFrequencyTarget(target.target_value)
    if (!freq) return null
    const periodStartStr = periodStartFor(freq.period).toISOString().split('T')[0]
    const entryCount = sessions
      .filter(s => s.session_date >= periodStartStr)
      .reduce((sum, s) => sum + questionLoggedCount(sectionKey, questionLabel, s), 0)
    return { done: entryCount, target: freq.targetNum, periodLabel: PERIOD_LETTER[freq.period] }
  }
  // Same as getQuestionProgress, but always returns all 3 periods (day/
  // week/month) so a question tile can show 3 stacked bars -- a single
  // question only ever has one target though, so at most one of the 3
  // will actually have a non-zero target; the other two just render
  // empty/greyed out.
  function getQuestionProgressByPeriod(sectionKey, questionLabel) {
    const byPeriod = { day: { done: 0, target: 0 }, week: { done: 0, target: 0 }, month: { done: 0, target: 0 } }
    // A question can have more than one target set against it at once
    // (e.g. a daily target AND a separate weekly target) -- each is its
    // own row in sectionTargets, so all matching rows need checking,
    // not just the first one found. For a given period, the athlete's
    // own override (if any) takes priority over the team-wide default.
    const matching = sectionTargets.filter(t => t.section_key === sectionKey && t.question_label === questionLabel)
    const resolvedByPeriod = {}
    matching.forEach(t => {
      const freq = parseFrequencyTarget(t.target_value)
      if (!freq || !byPeriod[freq.period]) return
      const existing = resolvedByPeriod[freq.period]
      if (existing && existing.student_id === student?.id) return // already have this athlete's own override for this period
      if (t.student_id && t.student_id !== student?.id) return // someone else's override -- not relevant
      resolvedByPeriod[freq.period] = t
    })
    for (const [period, target] of Object.entries(resolvedByPeriod)) {
      const freq = parseFrequencyTarget(target.target_value)
      const periodStartStr = periodStartFor(freq.period).toISOString().split('T')[0]
      const entryCount = sessions
        .filter(s => s.session_date >= periodStartStr)
        .reduce((sum, s) => sum + questionLoggedCount(sectionKey, questionLabel, s), 0)
      byPeriod[period] = { done: entryCount, target: freq.targetNum }
    }
    return byPeriod
  }
  // Compact vertical version (3 bars stacked, not side by side) for
  // individual question tiles -- section headers use the horizontal
  // SectionProgressBars instead.
  function QuestionProgressBarsVertical({ sectionKey, questionLabel }) {
    const byPeriod = getQuestionProgressByPeriod(sectionKey, questionLabel)
    const periods = [['day', 'D'], ['week', 'W'], ['month', 'M']]
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, width: 20, flexShrink: 0 }}>
        {periods.map(([key, letter]) => {
          const { done, target } = byPeriod[key]
          const hasTarget = target > 0
          const pct = hasTarget ? Math.min(100, Math.round((done / target) * 100)) : 0
          const hit = hasTarget && done >= target
          return (
            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
              <span style={{ fontSize: 6, fontWeight: 700, width: 6, color: hasTarget ? (hit ? '#1D9E75' : 'var(--text-tertiary)') : 'var(--border)' }}>{letter}</span>
              <div style={{ flex: 1, height: 3, borderRadius: 2, background: 'var(--border)', overflow: 'hidden' }}>
                {hasTarget && <div style={{ width: `${pct}%`, height: '100%', background: hit ? '#1D9E75' : '#E24B4A', borderRadius: 2 }} />}
              </div>
            </div>
          )
        })}
      </div>
    )
  }
  function QuestionProgressBadge({ sectionKey, questionLabel }) {
    const progress = getQuestionProgress(sectionKey, questionLabel)
    if (!progress) return null
    const hit = progress.done >= progress.target
    return (
      <span style={{ fontSize: 8, fontWeight: 700, color: hit ? '#0E9F6E' : 'var(--text-tertiary)' }}>
        {progress.done}/{progress.target} {progress.periodLabel}
      </span>
    )
  }
  // Reusable "log multiple sessions of a type per day" UI -- used by
  // Meditation, Video Analysis, Visualisation, and Active Recovery. Shows
  // what's already been saved today at the top (with a way to remove any
  // entry), then a list of every type with its own duration input and
  // Save button underneath, so several different types (or the same type
  // more than once) can all be logged the same day rather than one
  // selection overwriting the last.
  function MultiSessionTypeLogger({ field, options, colour = '#6D28D9' }) {
    const entries = todaysMentalityLog[field]?.entries || []
    return (
      <div className="field" style={{ marginBottom: 0 }}>
        {entries.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <label>Logged today</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {entries.map((e, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', background: colour + '12', borderRadius: 'var(--radius)' }}>
                  <span style={{ fontSize: 13 }}>{e.type}</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: colour }}>{e.duration} min</span>
                    <button onClick={() => saveMentalityField(field, cur => ({ entries: (cur.entries || []).filter((_, idx) => idx !== i) }))}
                      style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: 14, padding: 0 }}>×</button>
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
        <label>Add a session</label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {options.map(v => {
            const draftKey = `${field}::${v}`
            return (
              <div key={v} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 13, flex: 1 }}>{v}</span>
                <input type="number" inputMode="numeric" placeholder="min" value={mentalityDraftDurations[draftKey] ?? ''}
                  onChange={e => setMentalityDraftDurations(prev => ({ ...prev, [draftKey]: e.target.value }))}
                  style={{ width: 60, padding: '4px 6px', border: '1px solid var(--border-strong)', borderRadius: 6, fontSize: 12, background: 'var(--bg-secondary)', color: 'var(--text)', fontFamily: 'var(--font-sans)' }} />
                <button type="button" className="btn btn-sm" disabled={!mentalityDraftDurations[draftKey]}
                  onClick={() => {
                    saveMentalityField(field, cur => ({ entries: [...(cur.entries || []), { type: v, duration: mentalityDraftDurations[draftKey] }] }))
                    setMentalityDraftDurations(prev => ({ ...prev, [draftKey]: '' }))
                  }}>Save</button>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // Two-level version of the same idea: pick a performance area/category
  // first (e.g. "Calm", "Technique"), which reveals the specific types
  // within it, each with its own duration input and Save button --
  // matching MultiSessionTypeLogger's entry/duration/save pattern, just
  // with a category picker layered on top for structured templates with
  // many more types than fit comfortably in one flat list.
  function CategorizedSessionLogger({ field, categories, colour = '#6D28D9' }) {
    const entries = todaysMentalityLog[field]?.entries || []
    const expandedCategory = expandedLoggerCategory[field] || null
    return (
      <div className="field" style={{ marginBottom: 0, width: '100%', minWidth: 0 }}>
        {entries.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <label>Logged today</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {entries.map((e, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', background: colour + '12', borderRadius: 'var(--radius)' }}>
                  <span style={{ fontSize: 13 }}>{e.type}</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: colour }}>{e.duration} min</span>
                    <button onClick={() => saveMentalityField(field, cur => ({ entries: (cur.entries || []).filter((_, idx) => idx !== i) }))}
                      style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: 14, padding: 0 }}>×</button>
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
        <label>Choose a performance area</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
          {categories.map(c => (
            <button key={c.key} type="button"
              onClick={() => setExpandedLoggerCategory(prev => ({ ...prev, [field]: prev[field] === c.key ? null : c.key }))}
              className="btn btn-sm" style={{ background: expandedCategory === c.key ? colour + '20' : undefined, borderColor: expandedCategory === c.key ? colour : undefined }}>
              {c.label}
            </button>
          ))}
        </div>
        {expandedCategory && (() => {
          const cat = categories.find(c => c.key === expandedCategory)
          return (
            <div style={{ width: '100%', minWidth: 0 }}>
              {cat.description && <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 8, fontStyle: 'italic' }}>{cat.description}</p>}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {cat.types.map(t => {
                  const draftKey = `${field}::${t.name}`
                  const howToShown = expandedLoggerHowTo[draftKey]
                  return (
                    <div key={t.name} style={{ width: '100%', minWidth: 0, padding: '8px 10px', background: 'var(--bg-secondary)', borderRadius: 'var(--radius)' }}>
                      <button type="button" onClick={() => t.howTo && setExpandedLoggerHowTo(prev => ({ ...prev, [draftKey]: !prev[draftKey] }))}
                        style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', padding: 0, marginBottom: 6, cursor: t.howTo ? 'pointer' : 'default', fontSize: 13, color: t.howTo ? colour : 'var(--text)', fontFamily: 'var(--font-sans)', whiteSpace: 'normal', wordBreak: 'break-word' }}>
                        {t.name}{t.howTo ? ' ⓘ' : ''}
                      </button>
                      {howToShown && <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 6px' }}>{t.howTo}</p>}
                      <div style={{ display: 'flex', gap: 6 }}>
                        <input type="number" inputMode="numeric" placeholder="min" value={mentalityDraftDurations[draftKey] ?? ''}
                          onChange={e => setMentalityDraftDurations(prev => ({ ...prev, [draftKey]: e.target.value }))}
                          style={{ width: 60, flexShrink: 0, padding: '4px 6px', border: '1px solid var(--border-strong)', borderRadius: 6, fontSize: 12, background: 'var(--bg-primary)', color: 'var(--text)', fontFamily: 'var(--font-sans)' }} />
                        <button type="button" className="btn btn-sm" disabled={!mentalityDraftDurations[draftKey]}
                          onClick={() => {
                            saveMentalityField(field, cur => ({ entries: [...(cur.entries || []), { type: t.name, duration: mentalityDraftDurations[draftKey] }] }))
                            setMentalityDraftDurations(prev => ({ ...prev, [draftKey]: '' }))
                          }}>Save</button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })()}
      </div>
    )
  }

  function SectionProgressBadge({ sectionKey }) {
    const progress = getSectionProgress(sectionKey)
    if (!progress) return <span style={{ width: 28 }} />
    const hit = progress.done >= progress.target
    return (
      <span style={{ fontSize: 11, fontWeight: 700, color: hit ? '#1D9E75' : 'var(--text-tertiary)', minWidth: 28, textAlign: 'left' }}>
        {progress.done}/{progress.target}
        <span style={{ fontWeight: 400, color: 'var(--text-tertiary)' }}> {progress.periodLabel}</span>
      </span>
    )
  }

  async function checkInNow(attendanceType, explicitClassId = null) {
    if (!student) return
    setCheckingIn(true)
    let matchedClassId = explicitClassId
    if (!matchedClassId) {
      // Self check-in never knew which specific class it was for, so it
      // could never show up on a register filtered to one class (which
      // only ever matches an exact class_id) -- this works out the best
      // match from the athlete's own schedule: if only one of their
      // classes runs today, use that; if more than one does (a
      // double-session day), pick whichever is closest to the current
      // time, since that's almost certainly the one they're walking into.
      const todayJsDay = new Date().getDay()
      const todaysClasses = assignedClasses.filter(a => (DAY_TO_JS_DAYS[a.classes?.day_of_week] || []).includes(todayJsDay) && a.classes?.id)
      if (todaysClasses.length === 1) {
        matchedClassId = todaysClasses[0].classes.id
      } else if (todaysClasses.length > 1) {
        const nowMinutes = new Date().getHours() * 60 + new Date().getMinutes()
        matchedClassId = [...todaysClasses].sort((a, b) => {
          const diffFor = c => {
            const [h, m] = (c.classes?.start_time || '00:00').split(':').map(Number)
            return Math.abs((h * 60 + m) - nowMinutes)
          }
          return diffFor(a) - diffFor(b)
        })[0].classes.id
      }
    }
    const { data, error } = await supabase.from('attendance').insert({
      student_id: student.id,
      present: true,
      late: false,
      attendance_type: attendanceType,
      session_date: new Date().toISOString().split('T')[0],
      attended_at: new Date().toISOString(),
      self_checked_in: true,
      class_id: matchedClassId,
    }).select().single()
    if (error) {
      alert('Error checking in: ' + error.message)
    } else {
      setAttendanceData(prev => [data, ...prev])
      setActiveCheckIn(data)
      setShowWeightCheckPrompt('in')
      setWeightCheckValue('')
    }
    setCheckingIn(false)
  }

  async function checkOutNow() {
    setShowWeightCheckPrompt('out')
    setWeightCheckValue('')
  }

  // Save a note tied to one specific session (a specific class on a
  // specific date), opened from the calendar's day-detail popup --
  // reuses the same attendance.note field the coach's own session
  // notes already use, so a note written here shows up there too.
  // Works even if the athlete never checks in for that session -- if
  // no attendance row exists yet, one is created purely to hold the
  // note, marked "excused" (present: false) so it's never counted as
  // an actual attendance anywhere else in the app.
  async function saveSessionNoteForModal() {
    if (!sessionNoteModal) return
    setSavingSessionNote(true)
    if (sessionNoteModal.attendanceId) {
      const { error } = await supabase.from('attendance').update({ note: sessionNoteDraft }).eq('id', sessionNoteModal.attendanceId)
      setSavingSessionNote(false)
      if (error) { alert('Error saving note: ' + error.message); return }
      setAttendanceData(prev => prev.map(a => a.id === sessionNoteModal.attendanceId ? { ...a, note: sessionNoteDraft } : a))
    } else {
      const { data, error } = await supabase.from('attendance').insert({
        student_id: student.id, present: false, attendance_type: 'excused',
        session_date: sessionNoteModal.dateStr, attended_at: new Date().toISOString(),
        class_id: sessionNoteModal.classId, note: sessionNoteDraft,
      }).select().single()
      setSavingSessionNote(false)
      if (error) { alert('Error saving note: ' + error.message); return }
      setAttendanceData(prev => [...prev, data])
      setSessionNoteModal(m => ({ ...m, attendanceId: data.id }))
    }
  }

  // Checking in directly from the day-detail/session-note panel --
  // this is for a SPECIFIC known class (picked from that day's
  // schedule), so it doesn't need the auto-detection checkInNow()
  // uses for the generic "Check in" button. If a note-only row already
  // exists for this session (saved before checking in), that same row
  // is upgraded into a real check-in rather than inserting a second
  // row, which the database wouldn't allow for the same class+date anyway.
  async function checkInForSessionModal() {
    if (!sessionNoteModal || !student) return
    const nowIso = new Date().toISOString()
    if (sessionNoteModal.attendanceId) {
      const { error } = await supabase.from('attendance')
        .update({ present: true, attendance_type: 'attended', self_checked_in: true, attended_at: nowIso })
        .eq('id', sessionNoteModal.attendanceId)
      if (error) { alert('Error checking in: ' + error.message); return }
      setAttendanceData(prev => prev.map(a => a.id === sessionNoteModal.attendanceId ? { ...a, present: true, attendance_type: 'attended', self_checked_in: true, attended_at: nowIso } : a))
      setSessionNoteModal(m => ({ ...m, selfCheckedIn: true, checkedOutAt: null, attendedAt: nowIso, attendanceType: 'attended' }))
      return
    }
    const { data, error } = await supabase.from('attendance').insert({
      student_id: student.id, present: true, attendance_type: 'attended',
      session_date: sessionNoteModal.dateStr, attended_at: nowIso,
      self_checked_in: true, class_id: sessionNoteModal.classId, note: sessionNoteDraft || null,
    }).select().single()
    if (error) { alert('Error checking in: ' + error.message); return }
    setAttendanceData(prev => [...prev, data])
    setSessionNoteModal(m => ({ ...m, attendanceId: data.id, checkedOutAt: null, selfCheckedIn: true, attendedAt: nowIso, attendanceType: 'attended' }))
  }

  async function checkOutForSessionModal() {
    if (!sessionNoteModal?.attendanceId) return
    const { error } = await supabase.from('attendance').update({ checked_out_at: new Date().toISOString() }).eq('id', sessionNoteModal.attendanceId)
    if (error) { alert('Error checking out: ' + error.message); return }
    setAttendanceData(prev => prev.map(a => a.id === sessionNoteModal.attendanceId ? { ...a, checked_out_at: new Date().toISOString() } : a))
    setSessionNoteModal(m => ({ ...m, checkedOutAt: new Date().toISOString() }))
  }

  // Register-marked attendance (a coach ticking someone present rather
  // than the athlete self-checking-in) stamps attended_at as a
  // placeholder noon timestamp, not a real check-in time -- for hours/
  // duration purposes, the class's own scheduled start time is a far
  // more meaningful stand-in. A genuine self check-in's real timestamp
  // is always used as-is.
  function getEffectiveCheckin(attendance, classInfo) {
    if (!attendance?.attended_at) return null
    if (attendance.self_checked_in) return new Date(attendance.attended_at)
    if (classInfo?.start_time) return new Date(attendance.session_date + 'T' + classInfo.start_time)
    return new Date(attendance.attended_at)
  }
  // Effective check-out: the real one if they checked out, or -- if the
  // session's scheduled end time has already passed and nobody checked
  // them out (forgot) -- the session's end time as a stand-in, purely
  // for duration/hours calculations. This is computed on read, never
  // written to the database, so it never overrides a genuine manual
  // check-out (e.g. someone leaving early stays exactly as they
  // recorded it). Per-date coach overrides (a session running over)
  // take priority over the class's normal scheduled end time.
  function getEffectiveCheckout(attendance, classInfo) {
    if (!attendance?.attended_at) return null
    if (attendance.checked_out_at) return new Date(attendance.checked_out_at)
    const override = classInfo?.session_end_overrides?.[attendance.session_date]
    const endTimeStr = override || classInfo?.end_time
    if (!endTimeStr) return null // nothing to fall back on -- still counts as in progress
    const sessionEnd = new Date(attendance.session_date + 'T' + endTimeStr)
    if (sessionEnd > new Date()) return null // session hasn't ended yet
    return sessionEnd
  }
  // Hours trained for one attendance record -- null if the session is
  // still in progress (no effective check-out yet), not zero, so
  // callers can tell "not finished" apart from "zero duration".
  function getSessionHours(attendance, classInfo) {
    const start = getEffectiveCheckin(attendance, classInfo)
    const end = getEffectiveCheckout(attendance, classInfo)
    if (!start || !end) return null
    return Math.max(0, (end - start) / (1000 * 60 * 60))
  }

  // Uploads a photo/video attached to a specific question's entry for
  // today -- tagged with section/question/date so it's tied to that
  // entry, but stored in the same media_files array the athlete's own
  // "Media" gallery tab already reads from, so it shows up there too
  // alongside everything else they've uploaded.
  async function uploadQuestionMedia(sectionKey, questionLabel, file) {
    if (!student || !file) return
    const path = `athletes/${student.id}/${Date.now()}-${file.name}`
    const { error } = await supabase.storage.from('athlete-media').upload(path, file)
    if (error) { alert('Upload failed: ' + error.message); return }
    const { data: urlData } = supabase.storage.from('athlete-media').getPublicUrl(path)
    const existing = apData?.media_files || []
    const updated = [...existing, {
      name: file.name, url: urlData.publicUrl, type: file.type, uploaded_at: new Date().toISOString(),
      section_key: sectionKey, question_label: questionLabel, session_date: new Date().toISOString().split('T')[0],
    }]
    const { error: saveError } = await supabase.from('athlete_profiles').upsert({ student_id: student.id, media_files: updated }, { onConflict: 'student_id' })
    if (saveError) { alert('Error saving upload: ' + saveError.message); return }
    setApData(p => ({ ...(p || {}), media_files: updated }))
  }
  // Reusable "attach photo/video" block for a question's expanded detail
  // view -- separate Upload file / Take photo-video buttons (the second
  // uses capture="environment" to open the camera directly on mobile),
  // plus thumbnails of anything already attached to today's entry for
  // this exact question.
  function QuestionMediaUpload({ sectionKey, questionLabel }) {
    const idBase = `qmedia-${sectionKey}-${questionLabel}`.replace(/[^a-zA-Z0-9]/g, '-')
    const todayStr = new Date().toISOString().split('T')[0]
    const attached = (apData?.media_files || []).filter(f => f.section_key === sectionKey && f.question_label === questionLabel && f.session_date === todayStr)
    return (
      <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
        <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>Attach photo/video</label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input type="file" accept="image/*,video/*" style={{ display: 'none' }} id={`${idBase}-file`}
            onChange={e => { const f = e.target.files[0]; if (f) uploadQuestionMedia(sectionKey, questionLabel, f); e.target.value = '' }} />
          <label htmlFor={`${idBase}-file`} className="btn btn-sm" style={{ cursor: 'pointer' }}>📁 Upload file</label>
          <input type="file" accept="image/*,video/*" capture="environment" style={{ display: 'none' }} id={`${idBase}-camera`}
            onChange={e => { const f = e.target.files[0]; if (f) uploadQuestionMedia(sectionKey, questionLabel, f); e.target.value = '' }} />
          <label htmlFor={`${idBase}-camera`} className="btn btn-sm" style={{ cursor: 'pointer' }}>📷 Take photo/video</label>
        </div>
        {attached.length > 0 && (
          <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
            {attached.map((f, i) => (
              <a key={i} href={f.url} target="_blank" rel="noreferrer">
                {f.type?.startsWith('image') ? (
                  <img src={f.url} alt={f.name} style={{ width: 50, height: 50, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--border)' }} />
                ) : (
                  <div style={{ width: 50, height: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, background: 'var(--bg-secondary)', borderRadius: 6, border: '1px solid var(--border)' }}>
                    {f.type?.includes('video') ? '🎥' : '📄'}
                  </div>
                )}
              </a>
            ))}
          </div>
        )}
      </div>
    )
  }

  // Backs out of whatever the weight-check prompt was for. For a check-in,
  // that means actually undoing it -- the attendance row was already
  // created the moment "Check in"/"Full Kit" was pressed, so cancelling
  // here deletes it rather than leaving a stray record behind. For a
  // check-out, nothing has been written yet at this point, so cancelling
  // just closes the prompt and leaves the athlete still checked in.
  async function cancelCheckInPrompt() {
    if (showWeightCheckPrompt === 'in' && activeCheckIn) {
      // .select() so we can tell a genuine delete apart from a delete
      // that silently matched zero rows (e.g. an RLS policy blocking it,
      // or the row having already been removed) -- both look identical
      // otherwise, since neither raises an error.
      const { data, error } = await supabase.from('attendance').delete().eq('id', activeCheckIn.id).select()
      if (error) { alert('Error cancelling check-in: ' + error.message); return }
      if (!data?.length) {
        alert("Couldn't cancel this check-in — it may be too old to cancel yourself. Ask a coach to remove it if needed.")
        return
      }
      setAttendanceData(prev => prev.filter(a => a.id !== activeCheckIn.id))
      setActiveCheckIn(null)
    }
    setShowWeightCheckPrompt(null)
    setWeightCheckValue('')
    setFullKitChecked(false)
  }

  async function submitWeightCheck(skip = false) {
    if (!activeCheckIn) { setShowWeightCheckPrompt(null); return }
    setCheckingIn(true)
    const field = showWeightCheckPrompt === 'in' ? 'weight_before' : 'weight_after'
    const updates = { [field]: skip || !weightCheckValue.trim() ? null : parseFloat(weightCheckValue) }
    if (showWeightCheckPrompt === 'out') updates.checked_out_at = new Date().toISOString()
    // Full kit is decided here via the checkbox rather than a separate
    // button pressed before checking in -- only applies at check-in.
    if (showWeightCheckPrompt === 'in') updates.attendance_type = fullKitChecked ? 'full_kit' : 'attended'

    // .select() so a silently-blocked update (e.g. an RLS policy not
    // matching, or the row no longer existing) can be told apart from
    // a genuine success -- both look identical otherwise, since
    // neither raises an error, and the checkout would otherwise just
    // quietly revert once the UI re-syncs with the real, unchanged row.
    const { data, error } = await supabase.from('attendance').update(updates).eq('id', activeCheckIn.id).select()
    if (error) {
      alert('Error saving: ' + error.message)
    } else if (!data?.length) {
      alert("Couldn't save this — it may be too old to update yourself. Ask a coach if this keeps happening.")
    } else {
      // Also sync students.weight_kg from the latest weigh-in, same as elsewhere in the app
      if (updates[field] != null) {
        await supabase.from('students').update({ weight_kg: updates[field] }).eq('id', student.id)
      }
      // Also sync into today's fit2fight_sessions row (weight_before/
      // weight_after), same fields the standalone logger and Results
      // page read from -- previously this only ever wrote to the
      // attendance row, so a weigh-in done via check-in/check-out never
      // actually showed up anywhere in Results.
      if (updates[field] != null) {
        const todaysDate = new Date().toISOString().split('T')[0]
        const existingSession = sessions.find(s => s.session_date === todaysDate)
        if (existingSession) {
          await supabase.from('fit2fight_sessions').update({ [field]: updates[field] }).eq('id', existingSession.id)
          setSessions(prev => prev.map(s => s.id === existingSession.id ? { ...s, [field]: updates[field] } : s))
        } else {
          const { data: newSession } = await supabase.from('fit2fight_sessions')
            .insert({ student_id: student.id, session_date: todaysDate, [field]: updates[field] })
            .select().single()
          if (newSession) setSessions(prev => [newSession, ...prev])
        }
      }
      setAttendanceData(prev => prev.map(a => a.id === activeCheckIn.id ? { ...a, ...updates } : a))
      if (showWeightCheckPrompt === 'in') {
        setCheckedInMsg(updates.attendance_type === 'full_kit' ? '✓ Checked in — Full Kit!' : '✓ Checked in!')
        setTimeout(() => setCheckedInMsg(null), 3000)
      } else {
        setCheckedInMsg('✓ Checked out!')
        setTimeout(() => setCheckedInMsg(null), 3000)
        setActiveCheckIn(null)
      }
    }
    setShowWeightCheckPrompt(null)
    setCheckingIn(false)
    setFullKitChecked(false)
  }

  if (loading) return <div className="loading">Loading…</div>

  // Safe values - all null-safe
  const m         = student?.members || null
  const houseName = student?.house_name || m?.houses?.name || null
  const colour    = HOUSE_COLOURS[houseName] || '#378ADD'
  const initials  = m ? `${m.first_name?.[0] || ''}${m.last_name?.[0] || ''}`.toUpperCase() : '?'
  const age       = m?.date_of_birth ? Math.floor((Date.now() - new Date(m.date_of_birth)) / (365.25*24*60*60*1000)) : null
  const totalPts  = Array.isArray(points) ? points.reduce((s, p) => s + (p?.points_awarded || 0), 0) : 0
  const shared    = apData?.pdp_shared || {}
  const pdp       = apData?.pdp_notes || {}

  let houseRank = null, houseTotalPoints = null, contributionPct = null, positionInHouse = null, overallPosition = null, individualPointsPct = null
  try {
    const safeHouses = Array.isArray(houses) ? houses : []
    const safeRankList = Array.isArray(rankList) ? rankList : []
    const sortedHouses = [...safeHouses].sort((a, b) => (b?.points || 0) - (a?.points || 0))
    houseRank = houseName ? sortedHouses.findIndex(h => h?.name === houseName) + 1 : null
    houseTotalPoints = houseName ? (sortedHouses.find(h => h?.name === houseName)?.points || 0) : null
    contributionPct = (houseTotalPoints && student?.house_points)
      ? ((student.house_points / houseTotalPoints) * 100).toFixed(1) : null
    const sameHouseSorted = safeRankList
      .filter(s => s?.members?.houses?.name === houseName)
      .sort((a, b) => (b?.house_points || 0) - (a?.house_points || 0))
    positionInHouse = student ? sameHouseSorted.findIndex(s => s?.id === student.id) + 1 : null
    const safeTotals = truePointTotals || {}
    const overallSorted = [...safeRankList].sort((a, b) => (safeTotals[b?.id] || 0) - (safeTotals[a?.id] || 0))
    overallPosition = student ? overallSorted.findIndex(s => s?.id === student.id) + 1 : null
    const totalIndividualPoints = safeRankList.reduce((sum, s) => sum + (s?.individual_points || 0), 0)
    individualPointsPct = (totalIndividualPoints && student?.individual_points)
      ? ((student.individual_points / totalIndividualPoints) * 100).toFixed(1) : null
  } catch (e) {
    console.error('AthleteApp header calc error:', e)
  }

  const TABS = [
    ['home',      '🏠 Home'],
    ['sessions',  '📅 Schedule'],
    ['fit2fight', '💪 Results'],
    ['pdp',       '🎯 My PDP'],
    ['reports',   '📄 Reports'],
    ['points',    '⭐ Points'],
  ]

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: '20px 16px', minHeight: '100vh' }}>

      {needsTermsAgreement && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div className="card" style={{ width: '100%', maxWidth: 520, maxHeight: '85vh', display: 'flex', flexDirection: 'column', padding: 0 }}>
            <div style={{ padding: '18px 20px 10px', borderBottom: '1px solid var(--border)' }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>User Agreement, Confidentiality & Health Disclaimer</h2>
              <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>Please read before continuing — this only appears once.</p>
            </div>
            <div style={{ padding: '14px 20px', overflowY: 'auto', flex: 1, fontSize: 12.5, lineHeight: 1.6, color: 'var(--text)' }}>
              <p>Welcome to KR Centre. By creating an account, signing in, accessing, or using this App, you acknowledge that you have read, understood, and agree to be legally bound by this Agreement. If you do not agree, you must not access or use the App.</p>

              <h3 style={{ fontSize: 13, marginTop: 16 }}>1. Acceptance of Terms</h3>
              <p>By selecting "I Agree", creating an account, signing in, or continuing to use the App, you accept and agree to comply with this Agreement and any future updates.</p>

              <h3 style={{ fontSize: 13, marginTop: 16 }}>2. Purpose</h3>
              <p>This App is provided for authorised users to access training resources, information, services, and other features offered by KR Centre. The App may include beta or pre-release features which are still under development.</p>

              <h3 style={{ fontSize: 13, marginTop: 16 }}>3. Beta Software</h3>
              <p>Some features may be experimental or unfinished. You acknowledge that features may change or be removed, the App may contain bugs or errors, downtime may occur, and your feedback may be used to improve future versions.</p>

              <h3 style={{ fontSize: 13, marginTop: 16 }}>4. Confidentiality & Non-Disclosure</h3>
              <p>This App contains confidential and proprietary information belonging exclusively to KR Centre. You agree that you will:</p>
              <ul style={{ paddingLeft: 18, margin: '6px 0' }}>
                <li>Keep all non-public information relating to the App confidential.</li>
                <li>Not disclose, publish, discuss, distribute or communicate confidential information to anyone without prior written permission.</li>
                <li>Not share screenshots, photographs, videos, screen recordings or demonstrations unless authorised.</li>
                <li>Not share login details or allow another person to access your account.</li>
                <li>Not copy, reproduce, modify or imitate any part of the App.</li>
                <li>Not reverse engineer, decompile or attempt to discover the source code, software architecture, databases, security systems or algorithms.</li>
                <li>Not use confidential information for commercial or competitive purposes.</li>
                <li>Take reasonable steps to protect confidential information.</li>
              </ul>
              <p>Confidential information includes but is not limited to: source code, software, user interface, user experience, graphics, logos, branding, business strategies, databases, documentation, future developments, unreleased features, training systems, and any information not publicly available.</p>
              <p>These confidentiality obligations continue even after your account is closed or access ends, until the information becomes lawfully public or written permission is provided by KR Centre.</p>

              <h3 style={{ fontSize: 13, marginTop: 16 }}>5. Intellectual Property</h3>
              <p>All software, content, databases, graphics, logos, trademarks, branding, videos, images, documents, training material, coaching methods, text and other intellectual property remain the exclusive property of KR Centre. Nothing within this Agreement transfers ownership or grants permission to copy, reproduce, distribute, sell, licence or commercially exploit any part of the App.</p>

              <h3 style={{ fontSize: 13, marginTop: 16 }}>6. Acceptable Use</h3>
              <p>You agree that you will not: break any laws; harass or abuse other users; upload malicious software; attempt to hack the App; circumvent security measures; use bots or automated software; scrape or extract data; copy the database; create competing products using information from the App; share accounts; impersonate another user; sell access to your account; or attempt to bypass subscriptions or payments.</p>

              <h3 style={{ fontSize: 13, marginTop: 16 }}>7. Feedback</h3>
              <p>Suggestions, comments, bug reports and recommendations submitted through the App may be used by KR Centre without payment or restriction.</p>

              <h3 style={{ fontSize: 13, marginTop: 16 }}>8. Account Responsibility</h3>
              <p>You are responsible for maintaining the security of your account, keeping your password confidential, ensuring information on your account remains accurate, and reporting unauthorised access immediately.</p>

              <h3 style={{ fontSize: 13, marginTop: 16 }}>9. Privacy & Data Protection</h3>
              <p>We take reasonable measures to protect your personal information. Certain personal information may be collected to operate the App and will only be used in accordance with our Privacy Policy. You are responsible for ensuring any information you provide is accurate. We will take reasonable steps to protect stored information, but no electronic system can be guaranteed completely secure. Where applicable, personal data will be handled in accordance with UK GDPR and the Data Protection Act 2018.</p>

              <h3 style={{ fontSize: 13, marginTop: 16 }}>10. Physical Activity, Health & Coaching Disclaimer</h3>
              <p>This App may contain training programmes, fitness guidance, exercise demonstrations, boxing, kickboxing, combat sports instruction, nutrition advice and other physical activity content. By using this App you acknowledge that:</p>
              <ul style={{ paddingLeft: 18, margin: '6px 0' }}>
                <li>You participate in all physical activity entirely at your own risk.</li>
                <li>You are responsible for ensuring you are medically fit before beginning any exercise programme.</li>
                <li>If you have any injury, illness or medical condition you should seek advice from a qualified healthcare professional before participating.</li>
                <li>You should always discuss new training methods, techniques or programmes with your qualified coach, instructor or trainer before attempting them.</li>
                <li>Training should only be performed within your own ability and experience and, where appropriate, under qualified supervision.</li>
                <li>Stop exercising immediately if you experience pain, dizziness, fainting, chest pain, breathing difficulties or any unusual symptoms and seek appropriate medical advice.</li>
              </ul>
              <p>Neither KR Centre, its owners, coaches, instructors, contributors, employees nor affiliates accept responsibility for injuries, illness, loss or damage arising from the use of the App except where liability cannot legally be excluded. All information provided is intended for educational purposes only and does not replace professional medical advice or qualified coaching.</p>

              <h3 style={{ fontSize: 13, marginTop: 16 }}>11. Suspension & Termination</h3>
              <p>We may suspend or permanently terminate your account immediately if you breach this Agreement, misuse the App, share confidential information, attempt to copy the App, engage in unlawful activity, or interfere with the operation or security of the App.</p>

              <h3 style={{ fontSize: 13, marginTop: 16 }}>12. Disclaimer</h3>
              <p>The App is provided "as is" and "as available." We do not guarantee uninterrupted access, error-free operation or that all information will always be accurate or complete.</p>

              <h3 style={{ fontSize: 13, marginTop: 16 }}>13. Limitation of Liability</h3>
              <p>To the fullest extent permitted by law, KR Centre, its owners, employees, coaches, contributors and affiliates shall not be liable for any indirect, incidental, consequential or special damages arising from the use of the App.</p>

              <h3 style={{ fontSize: 13, marginTop: 16 }}>14. Changes to this Agreement</h3>
              <p>We reserve the right to update these Terms at any time. Continued use of the App after changes have been published constitutes acceptance of the updated Agreement.</p>

              <h3 style={{ fontSize: 13, marginTop: 16 }}>15. Governing Law</h3>
              <p>These Terms shall be governed by the laws of England and Wales. Any disputes shall be subject to the exclusive jurisdiction of the courts of England and Wales.</p>

              <h3 style={{ fontSize: 13, marginTop: 16 }}>16. Acceptance</h3>
              <p>By selecting "I Agree" you confirm that you have read and understood this Agreement, agree to comply with its Terms, understand your confidentiality and non-disclosure obligations, acknowledge that all intellectual property belongs to KR Centre, accept responsibility for your own health and physical activity, understand that training advice should be used alongside guidance from your qualified coach or trainer, and understand that unauthorised copying, disclosure, reverse engineering or misuse of the App may result in immediate termination of your account and may lead to legal action where appropriate.</p>
            </div>
            <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border)' }}>
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12.5, cursor: 'pointer', marginBottom: 12 }}>
                <input type="checkbox" checked={termsChecked} onChange={e => setTermsChecked(e.target.checked)} style={{ marginTop: 2 }} />
                I have read, understood and agree to the User Agreement, Confidentiality, Non-Disclosure & Health Disclaimer.
              </label>
              <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} disabled={!termsChecked || acceptingTerms} onClick={acceptTerms}>
                {acceptingTerms ? 'Saving…' : 'I Agree — Continue'}
              </button>
            </div>
          </div>
        </div>
      )}

      {isStaff && (
        <Link to="/dashboard" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 10, fontSize: 13, color: 'var(--text-secondary)', textDecoration: 'none' }}>
          ← Back to main site
        </Link>
      )}

      {/* Profile header -- two swipeable views (Name/Club/Age/Level,
          and House info), avatar stays fixed on the left in both.
          Tap (not swipe) slides the full profile details down from
          underneath, replacing the separate "Profile" card that used
          to sit below this as its own tile. */}
      <div className="card" style={{ marginBottom: 14, borderLeft: `4px solid ${colour}`, cursor: 'pointer' }}
        onTouchStart={e => { headerSwipeStartX.current = e.touches[0].clientX; headerWasSwipe.current = false }}
        onTouchEnd={e => {
          if (headerSwipeStartX.current == null || !student) return
          const delta = e.changedTouches[0].clientX - headerSwipeStartX.current
          if (Math.abs(delta) > 50) { setHeaderCardView(v => delta < 0 ? 1 : 0); headerWasSwipe.current = true }
          headerSwipeStartX.current = null
        }}
        onClick={() => {
          if (headerWasSwipe.current) { headerWasSwipe.current = false; return }
          if (!student) return
          if (headerCardView === 1) { setTab('points'); return }
          setMyProfileExpanded(v => !v)
        }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div onClick={e => { e.stopPropagation(); setTab('home') }}
            style={{ width: 64, height: 64, borderRadius: '50%', background: colour + '22', color: colour, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 700, flexShrink: 0, cursor: 'pointer' }}>
            {initials}
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            {student ? (
              headerCardView === 0 ? (
                <>
                  <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8 }}>
                    <div>
                      <div style={{ fontSize: 20, fontWeight: 700 }}>{m?.first_name} {m?.last_name}</div>
                      <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 3 }}>
                        {student.discipline}{age ? ` · Age ${age}` : ''}{student.pka_belt || student.krba_level ? ` · ${student.pka_belt || student.krba_level}` : ''}
                      </div>
                    </div>
                    {student.is_kr && <img src="/logos/kr-dragon.gif" alt="Kode Red Kickboxing" style={{ height: 56, width: 'auto', flexShrink: 0 }} />}
                    {student.discipline === 'KRBA' && <img src="/logos/krba-logo.png" alt="Kode Red Boxing Academy" style={{ height: 44, width: 'auto', flexShrink: 0 }} />}
                  </div>
                </>
              ) : (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                    {houseRank > 0 && <span style={{ color: 'var(--text-tertiary)', fontWeight: 600 }}>#{houseRank}</span>}
                    {HOUSE_TEXT_LOGOS[houseName] ? (
                      <img src={HOUSE_TEXT_LOGOS[houseName]} alt={houseName} style={{ height: 22, width: 'auto', objectFit: 'contain', display: 'block' }} />
                    ) : (
                      <span style={{ color: colour, fontWeight: 600 }}>{houseName || '—'}</span>
                    )}
                    {houseTotalPoints != null && <span style={{ color: 'var(--text-tertiary)' }}>({houseTotalPoints} pts)</span>}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 4 }}>Tap to view your points</div>
                </>
              )
            ) : (
              <>
                <div style={{ fontSize: 16, fontWeight: 600 }}>{profile?.first_name} {profile?.last_name}</div>
                <div style={{ fontSize: 12, color: '#EF9F27', marginTop: 2 }}>No student record linked — ask your coach</div>
              </>
            )}
          </div>
          {student && headerCardView === 0 && (
            <span style={{ fontSize: 12, color: 'var(--text-tertiary)', flexShrink: 0, alignSelf: 'flex-start', marginTop: 4 }}>{myProfileExpanded ? '▲' : '▼'}</span>
          )}
          {student && headerCardView === 1 && (
            <span style={{ fontSize: 12, color: 'var(--text-tertiary)', flexShrink: 0, alignSelf: 'flex-start', marginTop: 4 }}>→</span>
          )}
        </div>
        {student && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginTop: 8 }}>
            {[0, 1].map(v => (
              <button key={v} onClick={e => { e.stopPropagation(); setHeaderCardView(v) }}
                style={{ width: 6, height: 6, borderRadius: '50%', border: 'none', cursor: 'pointer', padding: 0, background: headerCardView === v ? colour : 'var(--border-strong)' }} />
            ))}
          </div>
        )}

        {student && (() => {
          const pct = weightTargetActiveMode === 'in_comp' ? weightTargetPctInComp : weightTargetPctOutComp
          const compWeightMatch = apData?.weight_division?.match(/[\d.]+/)
          const baseWeight = compWeightMatch ? parseFloat(compWeightMatch[0]) : student.weight_kg
          const override = apData?.weight_target_override
          let targetWeight = baseWeight ? (baseWeight * (1 + pct)).toFixed(1) : null
          if (override?.type === 'actual' && override.value) targetWeight = parseFloat(override.value).toFixed(1)
          else if (override?.type === 'percent' && override.value && baseWeight) targetWeight = (baseWeight * (1 + parseFloat(override.value))).toFixed(1)
          return (
            <div onClick={e => e.stopPropagation()} style={{
              maxHeight: myProfileExpanded ? 600 : 0,
              opacity: myProfileExpanded ? 1 : 0,
              overflow: 'hidden',
              transition: 'max-height 0.3s ease, opacity 0.25s ease',
              marginTop: myProfileExpanded ? 12 : 0,
              marginLeft: -16, marginRight: -16, marginBottom: -16,
            }}>
              <div style={{ borderTop: '1px solid var(--border)' }}>
              {[
                ['Club', student.discipline || '—'],
                ...(student.is_kr ? [['Discipline', student.discipline_codes || '—']] : []),
                [student.discipline === 'KRBA' ? 'Level' : student.is_kr ? 'Experience' : 'Grade',
                  student.discipline === 'KRBA' ? (student.krba_level || '—') : student.is_kr ? (student.competition_team || '—') : (student.pka_belt || '—')],
                ['Record', `${student.wins || 0}W ${student.losses || 0}L ${student.draws || 0}D`],
                ['Weight', student.weight_kg ? `${student.weight_kg}kg${student.weight_category ? ` (${student.weight_category})` : ''}` : '—', targetWeight],
                ['Comp weight', apData?.weight_division ? `${apData.weight_division}${/kg/i.test(apData.weight_division) ? '' : 'kg'}` : '—'],
                ['VO2 Max', (() => {
                  const latest = [...sessions].sort((a, b) => new Date(b.session_date) - new Date(a.session_date)).find(s => s.test?.['VO2 Max'] != null)
                  return latest ? `${latest.test['VO2 Max']} ml/kg/min` : '—'
                })()],
                ['Groups', [student.is_kr && 'KR', student.is_pts && 'PTs', student.is_leader && 'Leader', student.is_coach && 'Coach'].filter(Boolean).join(', ') || 'None'],
              ].map(([label, val, target], i, arr) => {
                const isWeightRow = label === 'Weight'
                const isOverTarget = isWeightRow && target && student.weight_kg != null && parseFloat(student.weight_kg) > parseFloat(target)
                return (
                <div key={label} onClick={isWeightRow ? e => { e.stopPropagation(); setTab('fit2fight'); setResultsGraphSection(0) } : undefined}
                  style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 16px', borderBottom: i < arr.length - 1 ? '1px solid var(--border)' : 'none', fontSize: 13, cursor: isWeightRow ? 'pointer' : 'default' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontWeight: isWeightRow && target ? 700 : 500, textAlign: 'right', color: isWeightRow && target ? (isOverTarget ? '#E24B4A' : '#1D9E75') : 'inherit' }}>{val}</span>
                    {target && <span style={{ fontSize: 11, color: override ? colour : 'var(--text-tertiary)', fontWeight: override ? 600 : 400 }} title={override ? 'Target set by your coach for you specifically' : `Target: current weight + ${pct}`}>{target}kg{override && ' *'}</span>}
                  </span>
                </div>
                )
              })}
              </div>
            </div>
          )
        })()}
      </div>

      {/* Tabs bar removed -- every page below is now reached via cards
          on the Home tab instead. All the pages themselves (Schedule,
          Results, My PDP, Reports, Points, etc.) are unchanged. */}

      {/* ── Home ── */}
      {tab === 'home' && (
        <div>
          {student ? (
            <>
              {(() => {
               try {
                const sorted = [...sessions].sort((a,b) => new Date(a.session_date) - new Date(b.session_date))
                const scopeOptions = ['All sessions', student.discipline, [student.class_schedule, student.class_time].filter(Boolean).join(' ')]
                  .filter(Boolean).filter((v, i, a) => a.indexOf(v) === i)
                const scopeLen = scopeOptions.length || 1
                const scopeLabel = scopeOptions[((f2fStatsScope % scopeLen) + scopeLen) % scopeLen] || 'All sessions'
                // Possible sessions is based on this athlete's own assigned
                // classes -- how many times each has actually occurred
                // (by weekday) since they started attending, not other
                // students' attendance records used as a rough proxy.
                const relevantAssigned = assignedClasses.filter(a => {
                  if (scopeLabel === 'All sessions') return true
                  if (scopeLabel === student.discipline) return a.classes?.discipline === student.discipline
                  return true
                })
                const earliestDateRaw = coachAttendanceDateSettings?.from || (attendanceData.length
                  ? attendanceData.reduce((min, a) => a.session_date < min ? a.session_date : min, attendanceData[0].session_date)
                  : new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0])
                // Never count attendance from before the soft launch date --
                // earlier data isn't reliable enough to hold against athletes.
                const earliestDate = earliestDateRaw < SOFT_LAUNCH_DATE ? SOFT_LAUNCH_DATE : earliestDateRaw
                // "Possible sessions" only ever counts sessions that have
                // actually happened -- if the coach's date filter's end
                // date is in the future (e.g. an end-of-term date not yet
                // reached), the count still stops at today rather than
                // treating not-yet-happened classes as "possible but
                // missed". The filter's end date only pulls the end of
                // the window *earlier* than today, never later.
                const today = new Date()
                const configuredTo = coachAttendanceDateSettings?.to ? new Date(coachAttendanceDateSettings.to + 'T00:00:00') : null
                const rangeEndDate = configuredTo && configuredTo < today ? configuredTo : today
                const countWeekdayOccurrences = (dayName, fromDateStr, classId) => {
                  const jsDays = DAY_TO_JS_DAYS[dayName] || []
                  if (!jsDays.length) return 0
                  let count = 0
                  const cursor = new Date(fromDateStr + 'T00:00:00')
                  while (cursor <= rangeEndDate) {
                    if (jsDays.includes(cursor.getDay())) {
                      const dateStr = cursor.toISOString().split('T')[0]
                      if (!isDateOnHoliday(dateStr, holidays, classId ? [classId] : [], student.id)) count++
                    }
                    cursor.setDate(cursor.getDate() + 1)
                  }
                  return count
                }
                const possibleSessions = relevantAssigned.reduce((sum, a) => sum + countWeekdayOccurrences(a.classes?.day_of_week, earliestDate, a.classes?.id), 0)
                // Distinct (date, class) slots attended, matched against
                // this scope's assigned classes -- not distinct days.
                // A Monday with 2 of the athlete's classes is 2 possible
                // sessions, so attending only one should show 1/2, and
                // attending both should show 2/2 -- neither of which
                // "distinct days attended" alone could ever represent,
                // since that maxes out at 1 regardless of how many
                // classes happened that day.
                //
                // Attendance rows are only ever matched against a real
                // possible slot -- a legacy row with no class_id can
                // only claim a date that's genuinely one of the
                // calculated possible sessions, never counted just for
                // existing. This mirrors the coach's equivalent
                // calculation exactly; the two must never diverge.
                const possibleSessionKeysForAttendance = new Set()
                for (const a of relevantAssigned) {
                  const classId = a.classes?.id
                  const jsDays = DAY_TO_JS_DAYS[a.classes?.day_of_week] || []
                  if (!jsDays.length || !classId) continue
                  const cursor = new Date(earliestDate + 'T00:00:00')
                  while (cursor <= rangeEndDate) {
                    if (jsDays.includes(cursor.getDay())) {
                      const dateStr = cursor.toISOString().split('T')[0]
                      if (!isDateOnHoliday(dateStr, holidays, [classId], student.id)) possibleSessionKeysForAttendance.add(`${dateStr}::${classId}`)
                    }
                    cursor.setDate(cursor.getDate() + 1)
                  }
                }
                const relevantClassIds = new Set(relevantAssigned.map(a => a.classes?.id).filter(Boolean))
                const scopedAttendance = attendanceData.filter(a => {
                  if (a.session_date < earliestDate || a.session_date > rangeEndDate.toISOString().split('T')[0]) return false
                  return !a.class_id || relevantClassIds.has(a.class_id)
                })
                const attendedSessionKeys = new Set()
                for (const a of scopedAttendance) {
                  const exactKey = a.class_id ? `${a.session_date}::${a.class_id}` : null
                  if (exactKey && possibleSessionKeysForAttendance.has(exactKey)) {
                    attendedSessionKeys.add(exactKey)
                  } else {
                    const fallbackKey = [...possibleSessionKeysForAttendance].find(k => k.startsWith(a.session_date + '::') && !attendedSessionKeys.has(k))
                    if (fallbackKey) attendedSessionKeys.add(fallbackKey)
                  }
                }
                const attendedDayCount = attendedSessionKeys.size

                const modules = [
                  { key: 'running',    label: 'Running',       icon: '🏃' },
                  { key: 'watt_bike',  label: 'Watt bike',     icon: '🚴' },
                  { key: 'bodyweight', label: 'Bodyweight',    icon: '💪' },
                  { key: 'stretch',    label: 'Stretch flows', icon: '🤸' },
                  { key: 'test',       label: 'Test',          icon: '📋' },
                  // { key: 'techniques', label: 'Techniques', icon: '🥋' }, // removed for now, kept for possible future use
                  { key: 'mentality',      label: 'Mentality',      icon: '🧠' },
                  { key: 'wellbeing',      label: 'Foundation',      icon: '🌱' },
                ]
                const togglePhysicalLog = key => {
                  setActivePhysicalCategory(cur => cur === key ? null : key)
                }
                const handleQuickLog = key => {
                  if (key === 'running') quickLogArrayField('running', todaysRunning, setTodaysRunning)
                  else if (key === 'watt_bike') quickLogArrayField('watt_bike', todaysWattBike, setTodaysWattBike)
                  else if (key === 'bodyweight') quickLogArrayField('bodyweight', todaysBodyweight, setTodaysBodyweight)
                  else if (key === 'stretch') quickLogStretch()
                }
                // Opens one Physical detail panel and explicitly closes the
                // other three, so only one is ever open at a time --
                // pressing outside still works too, but this guarantees it
                // regardless of click-outside timing.
                const openOnlyPhysicalPanel = (panel, value) => {
                  setExpandedHomeRun(panel === 'run' ? value : null)
                  setExpandedHomeWatt(panel === 'watt' ? value : null)
                  setExpandedHomeBodyweight(panel === 'bodyweight' ? value : null)
                  setExpandedHomeStretch(panel === 'stretch' ? value : null)
                }
                const togglePhysicalSection = () => {
                  setShowPhysicalSection(v => {
                    if (v) { openOnlyPhysicalPanel(null, null); setActivePhysicalCategory(null) } // closing -- reset any open detail panel/category too
                    return !v
                  })
                }

                return (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 8 }}>
                      <div className="card" style={{ textAlign: 'center', padding: '10px 4px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, background: 'var(--bg-secondary)' }}>
                        <button onClick={() => setTab('sessions')} title="View Sessions tab"
                          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, marginBottom: 2, padding: 0, fontFamily: 'var(--font-sans)', appearance: 'none', WebkitAppearance: 'none' }}>📅</button>
                        <div onClick={() => setAttendanceDisplayPct(v => !v)} title="Tap to toggle percentage/numbers"
                          style={{ fontSize: 19, fontWeight: 700, color: colour, cursor: 'pointer' }}>
                          {attendanceDisplayPct
                            ? `${possibleSessions ? Math.round((attendedDayCount / possibleSessions) * 100) : 0}%`
                            : `${attendedDayCount}/${possibleSessions || attendedDayCount}`}
                        </div>
                        <div style={{ fontSize: 9, color: 'var(--text-secondary)' }}>Sessions</div>
                        {coachAttendanceDateSettings && (
                          <div style={{ fontSize: 8, color: 'var(--text-tertiary)' }}>
                            {new Date(earliestDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} – {new Date(coachAttendanceDateSettings.to).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                          </div>
                        )}
                      </div>
                      <button onClick={() => setTab('fit2fight')}
                        className="card" style={{ textAlign: 'center', padding: '12px 8px', cursor: 'pointer', width: '100%', fontFamily: 'var(--font-sans)', background: 'var(--bg-secondary)', appearance: 'none', WebkitAppearance: 'none' }}>
                        <img src="/logos/f2f-logo-red.png" alt="Fit II Fight" style={{ height: 22, width: 'auto', marginBottom: 4, objectFit: 'contain' }} />
                        <div style={{ fontSize: 22, fontWeight: 700, color: '#378ADD' }}>
                          {(() => {
                            // Checking "does this field have any keys" isn't
                            // enough for Wellbeing/Mentality -- their values
                            // are nested objects that still have keys even
                            // when every value inside is blank (e.g. opening
                            // the Sleep card and closing it without entering
                            // anything still saves {sleep:{hours:'',efficiency:''}}).
                            // Uses the same genuine-completion checks as the
                            // section progress badges, so an empty touch
                            // doesn't get counted as a real logged result.
                            const hasContent = v => Array.isArray(v) ? v.length > 0 : (v && typeof v === 'object' ? Object.keys(v).length > 0 : !!v)
                            const sessionHasGenuineActivity = s => {
                              const plainFields = ['running', 'watt_bike', 'bodyweight', 'stretch_flows', 'snc', 'other_session']
                              if (plainFields.some(f => hasContent(s[f]))) return true
                              if (Array.isArray(s.techniques) ? s.techniques.length > 0 : hasContent(s.techniques)) return true
                              if (Array.isArray(s.tactical) ? s.tactical.length > 0 : hasContent(s.tactical)) return true
                              if (WELLBEING_KEYS_FOR_CHECK.some(k => isWellbeingQComplete(k, s.wellbeing))) return true
                              if (MENTALITY_KEYS_FOR_CHECK.some(k => isMentalityQComplete(k, s.mentality_log))) return true
                              if (s.test && Object.values(s.test).some(v => v !== '' && v != null)) return true
                              return false
                            }
                            // This count follows the coach's configured
                            // date range for this card (when set to
                            // include athletes) -- but the actual Results
                            // page below is completely unaffected by it
                            // and keeps its own independent date filter.
                            const dateScoped = coachF2fDateSettings
                              ? sessions.filter(s => s.session_date >= coachF2fDateSettings.from && s.session_date <= coachF2fDateSettings.to)
                              : sessions
                            return dateScoped.filter(sessionHasGenuineActivity).length
                          })()}
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>Results</div>
                        {coachF2fDateSettings && (
                          <div style={{ fontSize: 8, color: 'var(--text-tertiary)' }}>
                            {new Date(coachF2fDateSettings.from).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} – {new Date(coachF2fDateSettings.to).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                          </div>
                        )}
                      </button>
                      <button onClick={() => setTab('pdp')} className="card" style={{ textAlign: 'center', padding: '12px 8px', cursor: 'pointer', width: '100%', fontFamily: 'var(--font-sans)', background: 'var(--bg-secondary)', appearance: 'none', WebkitAppearance: 'none' }}>
                        <div style={{ fontSize: 22, marginBottom: 4 }}>🎯</div>
                        <div style={{ fontSize: 22, fontWeight: 700, color: '#EF9F27' }}>
                          {myNotesLog.filter(n => n.note_text?.startsWith('Completed PDP task') && !/weigh/i.test(n.note_text)).length}
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>PDP</div>
                      </button>
                    </div>

                    {/* Physical/Technique/Tactical/Mentality reordered visually
                        via CSS grid + order -- source code order is untouched
                        (Physical, Technique, Tactical, Mentality), only the
                        displayed sequence and pairing changes: Mentality+Tactical
                        side by side, then Technique+Physical side by side. */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, alignItems: 'start', width: '100%' }}>
                    <div ref={physicalSectionRef} style={{ order: showPhysicalSection ? 0 : 4, display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 0, gridColumn: showPhysicalSection ? '1 / -1' : 'auto' }}>
                    <button type="button" onClick={togglePhysicalSection} style={showPhysicalSection ? {
                      width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 8,
                      textAlign: 'center', padding: '12px', marginBottom: 10, cursor: 'pointer', fontFamily: 'var(--font-sans)', position: 'relative',
                      background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius)',
                    } : {
                      width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 12,
                      textAlign: 'center', padding: '18px 14px', marginBottom: 10, cursor: 'pointer', fontFamily: 'var(--font-sans)', position: 'relative',
                      background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius)',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: showPhysicalSection ? 10 : 6, width: '100%' }}>
                        <span style={{ fontFamily: 'Anton, sans-serif', fontSize: showPhysicalSection ? 28 : 17, letterSpacing: 0.5, lineHeight: 1, color: '#c10806' }}>PHYSICAL</span>
                        <img src="/logos/char-physical.png" alt="" style={{ height: showPhysicalSection ? 36 : 22, width: 'auto' }} />
                      </div>
                      <SectionProgressBars sectionKey="physical" vertical />
                      <span style={{ position: 'absolute', top: 8, right: 10, fontSize: 11, color: 'var(--text-tertiary)' }}>{showPhysicalSection ? '▲' : '▼'}</span>
                    </button>

                    <div style={{
                      overflow: 'hidden', transition: 'max-height 0.35s ease, opacity 0.25s ease',
                      maxHeight: showPhysicalSection ? 4000 : 0, opacity: showPhysicalSection ? 1 : 0,
                    }}>
                    <div style={{ display: 'grid', gridTemplateColumns: activePhysicalCategory && (activePhysicalCategory === 'running' || activePhysicalCategory === 'watt_bike') ? '1fr' : '1fr 1fr', gap: 8, marginBottom: 8 }}>
                      {(!activePhysicalCategory || activePhysicalCategory === 'running') && (
                        <ModuleButton b={modules[0]} sorted={sorted} moduleSubType={moduleSubType} setModuleSubType={setModuleSubType} colour={colour} setTab={setTab} setResultsGraphSection={setResultsGraphSection} studentId={student.id} onToggleLog={togglePhysicalLog} onQuickLog={handleQuickLog} large={activePhysicalCategory === 'running'} questionProgressByPeriod={getQuestionProgressByPeriod('physical', 'Running')} />
                      )}
                      {(!activePhysicalCategory || activePhysicalCategory === 'watt_bike') && (
                        <ModuleButton b={modules[1]} sorted={sorted} moduleSubType={moduleSubType} setModuleSubType={setModuleSubType} colour={colour} setTab={setTab} setResultsGraphSection={setResultsGraphSection} studentId={student.id} onToggleLog={togglePhysicalLog} onQuickLog={handleQuickLog} large={activePhysicalCategory === 'watt_bike'} questionProgressByPeriod={getQuestionProgressByPeriod('physical', 'Watt Bike')} />
                      )}
                    </div>
                    {showRunCards && (
                    <div ref={runPanelRef}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 8, marginBottom: expandedHomeRun ? 10 : 8 }}>
                      {RUN_CATEGORY_CARDS.map(cat => {
                        const complete = todaysRunning.some(e => e.category === cat.key)
                        const active = expandedHomeRun === cat.key
                        return (
                          <button key={cat.key} type="button" onClick={() => openOnlyPhysicalPanel('run', active ? null : cat.key)} style={{
                            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '14px 8px',
                            borderRadius: 'var(--radius)', cursor: 'pointer', fontFamily: 'var(--font-sans)',
                            border: `2px solid ${active ? colour : complete ? '#E24B4A' : 'var(--border)'}`,
                            background: complete ? '#E24B4A12' : 'var(--bg-secondary)',
                          }}>
                            <span style={{ fontSize: 22 }}>{cat.icon}</span>
                            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text)', textAlign: 'center', lineHeight: 1.2 }}>{cat.label}</span>
                            <QuestionProgressBadge sectionKey="physical" questionLabel={`Running: ${cat.key}`} />
                          </button>
                        )
                      })}
                    </div>
                    {expandedHomeRun && (() => {
                      const entry = todaysRunning.find(e => e.category === expandedHomeRun) || { category: expandedHomeRun, test: '', sets: [] }
                      const upsert = updatedEntry => savePhysicalField('running', [...todaysRunning.filter(e => e.category !== expandedHomeRun), updatedEntry], setTodaysRunning)
                      const presets = RUN_PRESET_TESTS[expandedHomeRun] || []
                      const cat = RUN_CATEGORY_CARDS.find(c => c.key === expandedHomeRun)
                      const isTimedSprints = expandedHomeRun === 'Timed Sprints'
                      const isInterval = expandedHomeRun === 'Interval'
                      const sprintMode = entry.mode || 'distance' // 'distance' = fixed distance, time is the result; 'time' = fixed time, distance is the result
                      const sprintPresets = isTimedSprints ? (sprintMode === 'time' ? TIMED_SPRINTS_TIME_PRESETS : RUN_PRESET_TESTS['Timed Sprints']) : presets
                      const intervalMode = entry.mode || 'distance' // whether the per-rep result logged is a distance or a time
                      return (
                        <div className="card" style={{ marginBottom: 8 }}>
                          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
                            <button type="button" className="btn btn-sm" style={{ fontSize: 11 }}
                              onClick={() => savePhysicalField('running', todaysRunning.filter(e => e.category !== expandedHomeRun), setTodaysRunning)}>✕ Clear</button>
                          </div>
                          {(isTimedSprints || isInterval) && (
                            <div style={{ display: 'flex', gap: 16, marginBottom: 12, flexWrap: 'wrap' }}>
                              <div>
                                <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Distance / Time</label>
                                <div style={{ display: 'flex', gap: 4 }}>
                                  {['distance', 'time'].map(m => (
                                    <button key={m} type="button" onClick={() => upsert({ ...entry, mode: m, ...(isTimedSprints ? { test: '' } : {}) })}
                                      className="btn btn-sm" style={{ fontSize: 11, background: (isTimedSprints ? sprintMode : intervalMode) === m ? '#E24B4A20' : undefined, borderColor: (isTimedSprints ? sprintMode : intervalMode) === m ? '#E24B4A' : undefined }}>
                                      {isTimedSprints ? (m === 'distance' ? 'Fixed distance' : 'Fixed time') : (m === 'distance' ? 'Distance' : 'Time')}
                                    </button>
                                  ))}
                                </div>
                              </div>
                              <div>
                                <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Terrain</label>
                                <div style={{ display: 'flex', gap: 4 }}>
                                  {['flat', 'hill'].map(t => (
                                    <button key={t} type="button" onClick={() => upsert({ ...entry, terrain: t })}
                                      className="btn btn-sm" style={{ fontSize: 11, textTransform: 'capitalize', background: (entry.terrain || 'flat') === t ? '#E24B4A20' : undefined, borderColor: (entry.terrain || 'flat') === t ? '#E24B4A' : undefined }}>
                                      {t}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            </div>
                          )}
                          <div className="field"><label>{isTimedSprints ? (sprintMode === 'time' ? 'Fixed time' : 'Fixed distance') : 'Specific test'}</label>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                              {sprintPresets.map(t => (
                                <button key={t} type="button" onClick={() => upsert({ ...entry, test: t })}
                                  className="btn btn-sm" style={{ background: entry.test === t ? '#E24B4A20' : undefined, borderColor: entry.test === t ? '#E24B4A' : undefined }}>{t}</button>
                              ))}
                              <input defaultValue={sprintPresets.includes(entry.test) ? '' : (entry.test || '')}
                                onBlur={e => e.target.value && upsert({ ...entry, test: e.target.value })}
                                placeholder="Other…" style={{ width: 90, flexShrink: 0 }} />
                            </div>
                            {cat?.hasOnOffInput && (
                              <div style={{ marginTop: 8 }}>
                                <OnOffInput onAdd={val => upsert({ ...entry, test: val })} />
                              </div>
                            )}
                          </div>
                          <div className="field" style={{ marginBottom: 0 }}><label>{isTimedSprints ? 'Results' : isInterval ? (intervalMode === 'time' ? 'Results (time, sec)' : 'Results (distance, km)') : (cat?.resultLabel || 'Results (time)')}</label>
                            {isTimedSprints ? (
                              <TimedSprintsInput key={sprintMode} sets={entry.sets || []} mode={sprintMode} fixedValue={entry.test}
                                onChange={sets => upsert({ ...entry, sets })} />
                            ) : (
                              <SetInput key={cat?.key} sets={entry.sets || []} onChange={sets => upsert({ ...entry, sets })}
                                inputType="number" placeholder={isInterval ? (intervalMode === 'time' ? 'e.g. 45' : 'e.g. 2.4') : (cat?.resultLabel ? 'e.g. 2.4' : 'e.g. 12.3')} />
                            )}
                          </div>
                          {savingPhysical && <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 8 }}>Saving…</p>}
                        </div>
                      )
                    })()}
                    </div>
                    )}

                    {showWattCards && (
                    <div ref={wattPanelRef}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 8, marginBottom: expandedHomeWatt ? 10 : 8 }}>
                      {WATT_BIKE_GROUPS.map(grp => {
                        const complete = todaysWattBike.some(e => grp.match(e.interval_mode || e.type))
                        const active = expandedHomeWatt === grp.key
                        return (
                          <button key={grp.key} type="button" onClick={() => openOnlyPhysicalPanel('watt', active ? null : grp.key)} style={{
                            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '14px 8px',
                            borderRadius: 'var(--radius)', cursor: 'pointer', fontFamily: 'var(--font-sans)',
                            border: `2px solid ${active ? colour : complete ? '#378ADD' : 'var(--border)'}`,
                            background: complete ? '#378ADD12' : 'var(--bg-secondary)',
                          }}>
                            <span style={{ fontSize: 22 }}>{grp.icon}</span>
                            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text)', textAlign: 'center', lineHeight: 1.2 }}>{grp.label}</span>
                          </button>
                        )
                      })}
                    </div>
                    {expandedHomeWatt && (() => {
                      const grp = WATT_BIKE_GROUPS.find(g => g.key === expandedHomeWatt)
                      const presets = WATT_BIKE_PRESETS[grp.key] || []
                      const entry = todaysWattBike.find(e => grp.match(e.interval_mode || e.type)) || { interval_mode: '', sets: [] }
                      const upsert = updatedEntry => savePhysicalField('watt_bike', [...todaysWattBike.filter(e => !grp.match(e.interval_mode || e.type)), updatedEntry], setTodaysWattBike)
                      return (
                        <div className="card" style={{ marginBottom: 8 }}>
                          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
                            <button type="button" className="btn btn-sm" style={{ fontSize: 11 }}
                              onClick={() => savePhysicalField('watt_bike', todaysWattBike.filter(e => !grp.match(e.interval_mode || e.type)), setTodaysWattBike)}>✕ Clear</button>
                          </div>
                          <div className="field"><label>Interval</label>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                              {presets.map(m => (
                                <button key={m} type="button" onClick={() => upsert({ ...entry, interval_mode: m })}
                                  className="btn btn-sm" style={{ background: normalizeIntervalMode(entry.interval_mode) === m ? '#378ADD20' : undefined, borderColor: normalizeIntervalMode(entry.interval_mode) === m ? '#378ADD' : undefined }}>{m}</button>
                              ))}
                              <input defaultValue={presets.includes(normalizeIntervalMode(entry.interval_mode)) ? '' : (entry.interval_mode || '')}
                                onBlur={e => e.target.value && upsert({ ...entry, interval_mode: e.target.value })}
                                placeholder="Other…" style={{ width: 90, flexShrink: 0 }} />
                            </div>
                            <div style={{ marginTop: 8 }}>
                              <OnOffInput onAdd={val => upsert({ ...entry, interval_mode: val })} />
                            </div>
                          </div>
                          <div className="field" style={{ marginBottom: 0 }}><label>Results — Wattage &amp; Distance</label>
                            <DualSetInput
                              key={grp.key}
                              sets={(entry.sets || []).map(s => (s && typeof s === 'object') ? s : { wattage: s, distance: '' })}
                              onChange={sets => upsert({ ...entry, sets })}
                              fields={[
                                { key: 'wattage', type: 'number', placeholder: 'Watts e.g. 650' },
                                { key: 'distance', type: 'number', placeholder: 'Distance km' },
                              ]} />
                          </div>
                          {savingPhysical && <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 8 }}>Saving…</p>}
                        </div>
                      )
                    })()}
                    </div>
                    )}

                    <div style={{ display: 'grid', gridTemplateColumns: activePhysicalCategory && (activePhysicalCategory === 'bodyweight' || activePhysicalCategory === 'stretch') ? '1fr' : '1fr 1fr', gap: 8, marginBottom: 8 }}>
                      {(!activePhysicalCategory || activePhysicalCategory === 'bodyweight') && (
                        <ModuleButton b={modules[2]} sorted={sorted} moduleSubType={moduleSubType} setModuleSubType={setModuleSubType} colour={colour} setTab={setTab} setResultsGraphSection={setResultsGraphSection} studentId={student.id} onToggleLog={togglePhysicalLog} onQuickLog={handleQuickLog} large={activePhysicalCategory === 'bodyweight'} questionProgressByPeriod={getQuestionProgressByPeriod('physical', 'Bodyweight')} />
                      )}
                      {(!activePhysicalCategory || activePhysicalCategory === 'stretch') && (
                        <ModuleButton b={modules[3]} sorted={sorted} moduleSubType={moduleSubType} setModuleSubType={setModuleSubType} colour={colour} setTab={setTab} setResultsGraphSection={setResultsGraphSection} studentId={student.id} onToggleLog={togglePhysicalLog} onQuickLog={handleQuickLog} large={activePhysicalCategory === 'stretch'} questionProgressByPeriod={getQuestionProgressByPeriod('physical', 'Stretch flows')} />
                      )}
                    </div>
                    {showBodyweightCards && (
                    <div ref={bodyweightPanelRef}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 8, marginBottom: expandedHomeBodyweight ? 10 : 8 }}>
                      {BODYWEIGHT_GROUPS.map(grp => {
                        const complete = todaysBodyweight.some(e => bodyweightMatchesGroup(e, grp.key))
                        const active = expandedHomeBodyweight === grp.key
                        return (
                          <button key={grp.key} type="button" onClick={() => openOnlyPhysicalPanel('bodyweight', active ? null : grp.key)} style={{
                            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '14px 8px',
                            borderRadius: 'var(--radius)', cursor: 'pointer', fontFamily: 'var(--font-sans)',
                            border: `2px solid ${active ? colour : complete ? '#1D9E75' : 'var(--border)'}`,
                            background: complete ? '#1D9E7512' : 'var(--bg-secondary)',
                          }}>
                            <span style={{ fontSize: 22 }}>{grp.icon}</span>
                            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text)', textAlign: 'center', lineHeight: 1.2 }}>{grp.label}</span>
                          </button>
                        )
                      })}
                    </div>
                    {expandedHomeBodyweight && (() => {
                      const grp = BODYWEIGHT_GROUPS.find(g => g.key === expandedHomeBodyweight)
                      const groupEntries = todaysBodyweight.filter(e => bodyweightMatchesGroup(e, grp.key))
                      const upsertExercise = (exerciseName, updater) => {
                        const existing = groupEntries.find(e => e.type === exerciseName) || { category: grp.key, type: exerciseName, duration: '', sets: [] }
                        const updated = updater(existing)
                        const others = todaysBodyweight.filter(e => !(bodyweightMatchesGroup(e, grp.key) && e.type === exerciseName))
                        savePhysicalField('bodyweight', [...others, updated], setTodaysBodyweight)
                      }
                      const removeExercise = exerciseName => {
                        savePhysicalField('bodyweight', todaysBodyweight.filter(e => !(bodyweightMatchesGroup(e, grp.key) && e.type === exerciseName)), setTodaysBodyweight)
                      }
                      return (
                        <div className="card" style={{ marginBottom: 8 }}>
                          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
                            <button type="button" className="btn btn-sm" style={{ fontSize: 11 }}
                              onClick={() => savePhysicalField('bodyweight', todaysBodyweight.filter(e => !bodyweightMatchesGroup(e, grp.key)), setTodaysBodyweight)}>✕ Clear all</button>
                          </div>
                          {grp.exercises.map((ex, i) => {
                            const entry = groupEntries.find(e => e.type === ex)
                            const checked = !!entry
                            return (
                              <div key={ex} style={{ marginBottom: 10, paddingBottom: 10, borderBottom: i < grp.exercises.length - 1 ? '1px solid var(--border)' : 'none' }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', fontWeight: 500 }}>
                                  <input type="checkbox" checked={checked}
                                    onChange={e => e.target.checked ? upsertExercise(ex, cur => ({ ...cur, sets: cur.sets || [] })) : removeExercise(ex)}
                                    style={{ width: 16, height: 16 }} />
                                  {ex}
                                </label>
                                {checked && (
                                  <div style={{ marginTop: 6, marginLeft: 24 }}>
                                    {grp.durations && (
                                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
                                        {grp.durations.map(d => (
                                          <button key={d} type="button" onClick={() => upsertExercise(ex, cur => ({ ...cur, duration: d }))}
                                            className="btn btn-sm" style={{ background: entry.duration === d ? '#1D9E7520' : undefined, borderColor: entry.duration === d ? '#1D9E75' : undefined }}>{d}</button>
                                        ))}
                                      </div>
                                    )}
                                    <SetInput key={ex} sets={entry.sets || []} onChange={sets => upsertExercise(ex, cur => ({ ...cur, sets }))}
                                      inputType={grp.metric === 'reps' ? 'number' : 'text'}
                                      placeholder={grp.metric === 'reps' ? 'e.g. 20' : 'e.g. 1:30'} />
                                  </div>
                                )}
                              </div>
                            )
                          })}
                          {savingPhysical && <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>Saving…</p>}
                        </div>
                      )
                    })()}
                    </div>
                    )}

                    {showStretchCards && (
                    <div ref={stretchPanelRef}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 8, marginBottom: 8 }}>
                      {STRETCH_FLOWS.map((flow, i) => {
                        const complete = !!todaysStretches[i]
                        return (
                          <button key={i} type="button"
                            onClick={() => { const next = [...todaysStretches]; next[i] = complete ? '' : flow.label; savePhysicalField('stretch_flows', next, setTodaysStretches) }}
                            style={{
                              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '14px 8px',
                              borderRadius: 'var(--radius)', cursor: 'pointer', fontFamily: 'var(--font-sans)',
                              border: `2px solid ${complete ? '#EF9F27' : 'var(--border)'}`,
                              background: complete ? '#EF9F2712' : 'var(--bg-secondary)', textAlign: 'left',
                            }}>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, width: '100%', marginBottom: 6 }}>
                              <span style={{ fontSize: 16 }}>{complete ? '✓' : '🤸'}</span>
                              <span style={{ fontSize: 9, fontWeight: 600, color: 'var(--text)', textAlign: 'center', lineHeight: 1.2 }}>{flow.label}</span>
                              <span style={{ fontSize: 7, color: 'var(--text-tertiary)', textAlign: 'center' }}>{flow.timing}</span>
                            </div>
                            <ul style={{ margin: 0, paddingLeft: 14, fontSize: 8, lineHeight: 1.5, color: 'var(--text-secondary)' }}>
                              {flow.stretches.map(s => <li key={s}>{s}</li>)}
                            </ul>
                          </button>
                        )
                      })}
                    </div>
                    {savingPhysical && <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 8 }}>Saving…</p>}
                    </div>
                    )}

                    {!activePhysicalCategory && (
                    <div style={{
                      display: 'flex', alignItems: 'stretch', width: '100%', marginBottom: 8,
                      background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius)',
                      overflow: 'hidden', fontFamily: 'var(--font-sans)',
                    }}>
                      <button onClick={() => setShowSncCards(v => !v)} style={{
                        flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2,
                        padding: '8px 4px', background: 'none', border: 'none', borderRight: '1px solid var(--border)', cursor: 'pointer',
                        minWidth: 0,
                      }}>
                        <span style={{ fontSize: 16 }}>🏋️</span>
                        <span style={{ fontSize: 9, fontWeight: 500, whiteSpace: 'nowrap' }}>SnC</span>
                      </button>
                      <button onClick={() => setShowSncCards(v => !v)} style={{
                        width: 58, flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                        padding: '8px 4px', background: 'none', border: 'none', cursor: 'pointer',
                      }}>
                        <span style={{ fontSize: 8, color: 'var(--text-tertiary)', textAlign: 'center', lineHeight: 1.3 }}>
                          {todaysSnc.length > 0 ? `Logged ${todaysSnc.length}×` : 'Not logged'}
                        </span>
                      </button>
                    </div>
                    )}
                    {showSncCards && (
                      <div className="card" style={{ marginBottom: 8 }}>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
                          <button type="button" className="btn btn-sm" style={{ fontSize: 11 }}
                            onClick={() => savePhysicalField('snc', [], setTodaysSnc)}>✕ Clear all</button>
                        </div>
                        {todaysSnc.map((entry, i) => (
                          <div key={i} style={{ marginBottom: 12, paddingBottom: 12, borderBottom: '1px solid var(--border)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                              <span style={{ fontSize: 13, fontWeight: 600 }}>{entry.routine}</span>
                              <button onClick={() => savePhysicalField('snc', todaysSnc.filter((_, idx) => idx !== i), setTodaysSnc)}
                                style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: 14 }}>×</button>
                            </div>
                            <input defaultValue={entry.description || ''}
                              onBlur={e => { const next = [...todaysSnc]; next[i] = { ...next[i], description: e.target.value }; savePhysicalField('snc', next, setTodaysSnc) }}
                              placeholder="What does this routine consist of?" style={{ marginBottom: 6 }} />
                            <SetInput key={i} sets={entry.sets || []}
                              onChange={sets => { const next = [...todaysSnc]; next[i] = { ...next[i], sets }; savePhysicalField('snc', next, setTodaysSnc) }}
                              placeholder="e.g. done, or a time/score" />
                          </div>
                        ))}
                        <div className="field"><label>Add a routine</label>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                            {SNC_ROUTINE_PRESETS.filter(r => !todaysSnc.some(e => e.routine === r)).map(r => (
                              <button key={r} type="button" className="btn btn-sm"
                                onClick={() => savePhysicalField('snc', [...todaysSnc, { routine: r, description: '', sets: [] }], setTodaysSnc)}>{r}</button>
                            ))}
                            <input value={sncRoutineDraft} onChange={e => setSncRoutineDraft(e.target.value)} placeholder="Or write your own…" style={{ width: 130 }} />
                            <button type="button" className="btn btn-sm" disabled={!sncRoutineDraft}
                              onClick={() => { savePhysicalField('snc', [...todaysSnc, { routine: sncRoutineDraft, description: '', sets: [] }], setTodaysSnc); setSncRoutineDraft('') }}>Add</button>
                          </div>
                        </div>
                        {savingPhysical && <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>Saving…</p>}
                      </div>
                    )}

                    </div>
                    </div>

                    <div ref={techniqueSectionRef} style={{ order: showTechniqueSection ? 0 : 3, display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 0, gridColumn: showTechniqueSection ? '1 / -1' : 'auto' }}>
                    <button type="button" onClick={() => { setShowTechniqueSection(v => { if (v) setExpandedTechniqueCategory(null); return !v }) }} style={showTechniqueSection ? {
                      width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 8,
                      textAlign: 'center', padding: '12px', marginBottom: 10, cursor: 'pointer', fontFamily: 'var(--font-sans)', position: 'relative',
                      background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius)',
                    } : {
                      width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 12,
                      textAlign: 'center', padding: '18px 14px', marginBottom: 10, cursor: 'pointer', fontFamily: 'var(--font-sans)', position: 'relative',
                      background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius)',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: showTechniqueSection ? 10 : 6, width: '100%' }}>
                        <span style={{ fontFamily: 'Anton, sans-serif', fontSize: showTechniqueSection ? 28 : 17, letterSpacing: 0.5, lineHeight: 1, color: '#cd8808' }}>TECHNICAL</span>
                        <img src="/logos/char-technical.png" alt="" style={{ height: showTechniqueSection ? 36 : 22, width: 'auto' }} />
                      </div>
                      <SectionProgressBars sectionKey="technique" vertical />
                      <span style={{ position: 'absolute', top: 8, right: 10, fontSize: 11, color: 'var(--text-tertiary)' }}>{showTechniqueSection ? '▲' : '▼'}</span>
                    </button>

                    <div style={{
                      overflow: 'hidden', transition: 'max-height 0.35s ease, opacity 0.25s ease',
                      maxHeight: showTechniqueSection ? 8000 : 0, opacity: showTechniqueSection ? 1 : 0,
                    }}>
                    {TECHNIQUE_STYLES.filter(({ style }) => {
                      // KRBA athletes only need Boxing questions, KR
                      // Kickboxing athletes only need Kickboxing ones --
                      // any other discipline still sees both, unchanged.
                      if (student.discipline === 'KRBA') return style === 'Boxing'
                      if (student.is_kr) return style === 'Kickboxing'
                      return true
                    }).map(({ style, categories }) => {
                      const hasActiveInThisStyle = Object.keys(categories).some(cat => expandedTechniqueCategory === `${style}::${cat}`)
                      if (expandedTechniqueCategory && !hasActiveInThisStyle) return null
                      return (
                      <div key={style} style={{ marginBottom: 14 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                          {style} Techniques
                          <QuestionProgressBadge sectionKey="technique" questionLabel={style} />
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: expandedTechniqueCategory ? '1fr' : 'repeat(2, 1fr)', gap: 8, marginBottom: 8 }}>
                          {Object.keys(categories).filter(cat => !expandedTechniqueCategory || expandedTechniqueCategory === `${style}::${cat}`).map(cat => {
                            const catKey = `${style}::${cat}`
                            const active = expandedTechniqueCategory === catKey
                            const count = todaysTechniques.filter(t => t.style === style && t.category === cat).length
                            return (
                              <button key={cat} type="button"
                                onClick={() => setExpandedTechniqueCategory(active ? null : catKey)}
                                style={{
                                  display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 6, padding: active ? '20px 14px' : '18px 14px',
                                  borderRadius: 'var(--radius)', cursor: 'pointer', fontFamily: 'var(--font-sans)',
                                  border: `2px solid ${active ? '#E24B4A' : count ? '#1D9E75' : 'var(--border)'}`,
                                  background: count ? '#1D9E7512' : 'var(--bg-secondary)',
                                }}>
                                <QuestionProgressBarsVertical sectionKey="technique" questionLabel={cat} />
                                <span style={{ flex: 1, textAlign: 'center' }}>
                                  <span style={{ display: 'block', fontSize: active ? 13 : 11, fontWeight: active ? 700 : 600, color: 'var(--text)', lineHeight: 1.2 }}>{cat}</span>
                                  {count > 0 && <span style={{ display: 'block', fontSize: active ? 10 : 8, color: '#1D9E75' }}>{count} selected</span>}
                                </span>
                              </button>
                            )
                          })}
                        </div>
                        {Object.entries(categories).map(([cat, items]) => {
                          const catKey = `${style}::${cat}`
                          if (expandedTechniqueCategory !== catKey) return null
                          return (
                            <div key={catKey} className="card" style={{ marginBottom: 8 }}>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                {items.map(technique => {
                                  const entry = todaysTechniques.find(t => t.style === style && t.category === cat && t.technique === technique)
                                  const selected = !!entry
                                  return (
                                    <div key={technique}>
                                      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                                        <input type="checkbox" checked={selected}
                                          onChange={() => {
                                            const next = selected
                                              ? todaysTechniques.filter(t => !(t.style === style && t.category === cat && t.technique === technique))
                                              : [...todaysTechniques, { style, category: cat, technique, note: '' }]
                                            savePhysicalField('techniques', next, setTodaysTechniques)
                                          }}
                                          style={{ width: 16, height: 16 }} />
                                        {technique}
                                      </label>
                                      {selected && (
                                        <input defaultValue={entry.note || ''} placeholder="Add a note…"
                                          onBlur={e => {
                                            const next = todaysTechniques.map(t => (t.style === style && t.category === cat && t.technique === technique) ? { ...t, note: e.target.value } : t)
                                            savePhysicalField('techniques', next, setTodaysTechniques)
                                          }}
                                          style={{ marginTop: 4, marginLeft: 24, width: 'calc(100% - 24px)', fontSize: 12 }} />
                                      )}
                                    </div>
                                  )
                                })}
                              </div>
                              <QuestionMediaUpload sectionKey="technique" questionLabel={cat} />
                            </div>
                          )
                        })}
                      </div>
                      )
                    })}
                    {savingPhysical && <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 8 }}>Saving…</p>}
                    </div>
                    </div>

                    <div ref={tacticalSectionRef} style={{ order: showTacticalSection ? 0 : 2, display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 0, gridColumn: showTacticalSection ? '1 / -1' : 'auto' }}>
                    <button type="button" onClick={() => { setShowTacticalSection(v => { if (v) setExpandedTacticalCategory(null); return !v }) }} style={showTacticalSection ? {
                      width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 8,
                      textAlign: 'center', padding: '12px', marginBottom: 10, cursor: 'pointer', fontFamily: 'var(--font-sans)', position: 'relative',
                      background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius)',
                    } : {
                      width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 12,
                      textAlign: 'center', padding: '18px 14px', marginBottom: 10, cursor: 'pointer', fontFamily: 'var(--font-sans)', position: 'relative',
                      background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius)',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: showTacticalSection ? 10 : 6, width: '100%' }}>
                        <span style={{ fontFamily: 'Anton, sans-serif', fontSize: showTacticalSection ? 28 : 17, letterSpacing: 0.5, lineHeight: 1, color: '#1a1a1a' }}>TACTICAL</span>
                        <img src="/logos/char-tactical.png" alt="" style={{ height: showTacticalSection ? 36 : 22, width: 'auto' }} />
                      </div>
                      <SectionProgressBars sectionKey="tactical" vertical />
                      <span style={{ position: 'absolute', top: 8, right: 10, fontSize: 11, color: 'var(--text-tertiary)' }}>{showTacticalSection ? '▲' : '▼'}</span>
                    </button>

                    <div style={{
                      overflow: 'hidden', transition: 'max-height 0.35s ease, opacity 0.25s ease',
                      maxHeight: showTacticalSection ? 8000 : 0, opacity: showTacticalSection ? 1 : 0,
                    }}>
                    <div style={{ display: 'grid', gridTemplateColumns: expandedTacticalCategory ? '1fr' : 'repeat(2, 1fr)', gap: 8, marginBottom: 8 }}>
                      {(expandedTacticalCategory ? [] : ['__videoAnalysis__']).concat(Object.keys(TACTICAL_CATEGORIES)).filter(cat => !expandedTacticalCategory || expandedTacticalCategory === cat).map(cat => {
                        if (cat === '__videoAnalysis__') {
                          const active = expandedTacticalCategory === cat
                          const complete = !!todaysMentalityLog.videoAnalysis?.type
                          return (
                            <button key={cat} type="button" onClick={() => setExpandedTacticalCategory(active ? null : cat)} style={{
                              display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 6, padding: active ? '20px 14px' : '18px 14px',
                              borderRadius: 'var(--radius)', cursor: 'pointer', fontFamily: 'var(--font-sans)',
                              border: `2px solid ${active ? '#E24B4A' : complete ? '#1D9E75' : 'var(--border)'}`,
                              background: complete ? '#1D9E7512' : 'var(--bg-secondary)',
                            }}>
                              <QuestionProgressBarsVertical sectionKey="mentality" questionLabel="Video Analysis" />
                              <span style={{ flex: 1, fontSize: active ? 13 : 11, fontWeight: active ? 700 : 600, color: 'var(--text)', textAlign: 'center', lineHeight: 1.2 }}>Video Analysis</span>
                              <span style={{ fontSize: active ? 20 : 16, flexShrink: 0 }}>🎥</span>
                            </button>
                          )
                        }
                        const cat_ = cat
                        const active = expandedTacticalCategory === cat_
                        const count = todaysTactical.filter(t => t.category === cat_).length
                        return (
                          <button key={cat_} type="button"
                            onClick={() => setExpandedTacticalCategory(active ? null : cat_)}
                            style={{
                              display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 6, padding: active ? '20px 14px' : '18px 14px',
                              borderRadius: 'var(--radius)', cursor: 'pointer', fontFamily: 'var(--font-sans)',
                              border: `2px solid ${active ? '#E24B4A' : count ? '#1D9E75' : 'var(--border)'}`,
                              background: count ? '#1D9E7512' : 'var(--bg-secondary)',
                            }}>
                            <QuestionProgressBarsVertical sectionKey="tactical" questionLabel={cat_} />
                            <span style={{ flex: 1, textAlign: 'center' }}>
                              <span style={{ display: 'block', fontSize: active ? 13 : 11, fontWeight: active ? 700 : 600, color: 'var(--text)', lineHeight: 1.2 }}>{cat_}</span>
                              {count > 0 && <span style={{ display: 'block', fontSize: active ? 10 : 8, color: '#1D9E75' }}>{count} selected</span>}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                    {expandedTacticalCategory === '__videoAnalysis__' && (
                      <div className="card" style={{ marginBottom: 8 }}>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
                          <button type="button" className="btn btn-sm" onClick={() => clearMentalityQuestion('videoAnalysis')} style={{ fontSize: 11 }}>✕ Clear</button>
                        </div>
                        <MultiSessionTypeLogger field="videoAnalysis" options={VIDEO_ANALYSIS_OPTIONS} />
                        <QuestionMediaUpload sectionKey="tactical" questionLabel="Video Analysis" />
                      </div>
                    )}
                    {Object.entries(TACTICAL_CATEGORIES).map(([cat, items]) => {
                      if (expandedTacticalCategory !== cat) return null
                      return (
                        <div key={cat} className="card" style={{ marginBottom: 8 }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {items.map(item => {
                              const entry = todaysTactical.find(t => t.category === cat && t.item === item)
                              const selected = !!entry
                              return (
                                <div key={item}>
                                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                                    <input type="checkbox" checked={selected}
                                      onChange={() => {
                                        const next = selected
                                          ? todaysTactical.filter(t => !(t.category === cat && t.item === item))
                                          : [...todaysTactical, { category: cat, item, note: '' }]
                                        savePhysicalField('tactical', next, setTodaysTactical)
                                      }}
                                      style={{ width: 16, height: 16, flexShrink: 0 }} />
                                    {item}
                                  </label>
                                  {selected && (
                                    <input defaultValue={entry.note || ''} placeholder="Add a note…"
                                      onBlur={e => {
                                        const next = todaysTactical.map(t => (t.category === cat && t.item === item) ? { ...t, note: e.target.value } : t)
                                        savePhysicalField('tactical', next, setTodaysTactical)
                                      }}
                                      style={{ marginTop: 4, marginLeft: 24, width: 'calc(100% - 24px)', fontSize: 12 }} />
                                  )}
                                </div>
                              )
                            })}
                          </div>
                          <QuestionMediaUpload sectionKey="tactical" questionLabel={cat} />
                        </div>
                      )
                    })}
                    {savingPhysical && <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 8 }}>Saving…</p>}
                    </div>
                    </div>

                    <div ref={mentalitySectionRef} style={{ order: showMentalitySection ? 0 : 1, display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 0, gridColumn: showMentalitySection ? '1 / -1' : 'auto' }}>
                    <button type="button" onClick={() => { setShowMentalitySection(v => { if (v) setExpandedHomeMentality(null); return !v }) }} style={showMentalitySection ? {
                      width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 8,
                      textAlign: 'center', padding: '12px', marginBottom: 10, cursor: 'pointer', fontFamily: 'var(--font-sans)', position: 'relative',
                      background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius)',
                    } : {
                      width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 12,
                      textAlign: 'center', padding: '18px 14px', marginBottom: 10, cursor: 'pointer', fontFamily: 'var(--font-sans)', position: 'relative',
                      background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius)',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: showMentalitySection ? 10 : 6, width: '100%' }}>
                        <span style={{ fontFamily: 'Anton, sans-serif', fontSize: showMentalitySection ? 28 : 17, letterSpacing: 0.5, lineHeight: 1, color: '#602283' }}>MENTALITY</span>
                        <img src="/logos/char-mentality.png" alt="" style={{ height: showMentalitySection ? 36 : 22, width: 'auto' }} />
                      </div>
                      <SectionProgressBars sectionKey="mentality" vertical />
                      <span style={{ position: 'absolute', top: 8, right: 10, fontSize: 11, color: 'var(--text-tertiary)' }}>{showMentalitySection ? '▲' : '▼'}</span>
                    </button>

                    <div style={{
                      overflow: 'hidden', transition: 'max-height 0.35s ease, opacity 0.25s ease',
                      maxHeight: showMentalitySection ? 4000 : 0, opacity: showMentalitySection ? 1 : 0,
                    }}>
                    <div style={{ display: 'grid', gridTemplateColumns: expandedHomeMentality ? '1fr' : 'repeat(2,1fr)', gap: 8, marginBottom: expandedHomeMentality ? 10 : 8 }}>
                      {MENTALITY_QUESTIONS.filter(q => !expandedHomeMentality || expandedHomeMentality === q.key).map(q => {
                        const complete = q.key === 'alterEgo' ? !!(alterEgoWorkbook.topTraits?.some(Boolean) || alterEgoWorkbook.nameOption1) : isMentalityQComplete(q.key, todaysMentalityLog)
                        const active = expandedHomeMentality === q.key
                        return (
                          <button key={q.key} type="button" onClick={() => q.key === 'alterEgo' ? setShowAlterEgoModal(true) : setExpandedHomeMentality(active ? null : q.key)} style={{
                            display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 6, padding: active ? '20px 14px' : '18px 14px',
                            borderRadius: 'var(--radius)', cursor: 'pointer', fontFamily: 'var(--font-sans)',
                            border: `2px solid ${active ? colour : complete ? '#6D28D9' : 'var(--border)'}`,
                            background: complete ? '#6D28D912' : 'var(--bg-secondary)',
                          }}>
                            <QuestionProgressBarsVertical sectionKey="mentality" questionLabel={q.label} />
                            <span style={{ flex: 1, fontSize: active ? 13 : 11, fontWeight: active ? 700 : 600, color: 'var(--text)', textAlign: 'center', lineHeight: 1.2 }}>{q.label}</span>
                            <span style={{ fontSize: active ? 26 : 20, flexShrink: 0 }}>{q.icon}</span>
                          </button>
                        )
                      })}
                    </div>

                    {expandedHomeMentality && (
                      <div className="card" style={{ marginBottom: 8 }}>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
                          <button type="button" className="btn btn-sm" onClick={() => clearMentalityQuestion(expandedHomeMentality)} style={{ fontSize: 11 }}>✕ Clear</button>
                        </div>
                        {expandedHomeMentality === 'meditation' && (
                          <CategorizedSessionLogger field="meditation" categories={MEDITATION_CATEGORIES} />
                        )}
                        {expandedHomeMentality === 'visualisation' && (
                          <CategorizedSessionLogger field="visualisation" categories={VISUALISATION_CATEGORIES} />
                        )}
                        {expandedHomeMentality === 'chess' && (
                          <>
                            <button type="button" className="btn" style={{ width: '100%', justifyContent: 'center', marginBottom: 10, fontSize: 16, padding: '14px' }}
                              onClick={() => saveMentalityField('chess', cur => ({ count: (cur.count || 0) + 1 }))}>+1 game</button>
                            <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>{todaysMentalityLog.chess?.count || 0} <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--text-secondary)' }}>game{(todaysMentalityLog.chess?.count || 0) === 1 ? '' : 's'} today</span></div>
                            <div className="field" style={{ marginBottom: 0 }}><label>Or write a number to add</label>
                              <div style={{ display: 'flex', gap: 6 }}>
                                <input type="number" value={chessCustomAdd} onChange={e => setChessCustomAdd(e.target.value)} placeholder="e.g. 3" style={{ flex: 1 }} />
                                <button type="button" className="btn btn-sm" disabled={!chessCustomAdd}
                                  onClick={() => { saveMentalityField('chess', cur => ({ count: (cur.count || 0) + parseInt(chessCustomAdd || 0) })); setChessCustomAdd('') }}>Add</button>
                              </div>
                            </div>
                          </>
                        )}
                        {expandedHomeMentality === 'reading' && (
                          <>
                            <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>{todaysMentalityLog.reading?.count || 0} <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--text-secondary)' }}>session{(todaysMentalityLog.reading?.count || 0) === 1 ? '' : 's'} today</span></div>
                            <button type="button" className="btn btn-sm" style={{ width: '100%', justifyContent: 'center', marginBottom: 8 }}
                              onClick={() => saveMentalityField('reading', cur => ({ count: (cur.count || 0) + 1 }))}>+1 reading session</button>
                            <div className="field" style={{ marginBottom: 0 }}><label>Or write a number to add</label>
                              <div style={{ display: 'flex', gap: 6 }}>
                                <input type="number" value={readingCustomAdd} onChange={e => setReadingCustomAdd(e.target.value)} placeholder="e.g. 3" style={{ flex: 1 }} />
                                <button type="button" className="btn btn-sm" disabled={!readingCustomAdd}
                                  onClick={() => { saveMentalityField('reading', cur => ({ count: (cur.count || 0) + parseInt(readingCustomAdd || 0) })); setReadingCustomAdd('') }}>Add</button>
                              </div>
                            </div>
                          </>
                        )}
                        {expandedHomeMentality === 'gaming' && (
                          <>
                            <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>{todaysMentalityLog.gaming?.count || 0} <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--text-secondary)' }}>session{(todaysMentalityLog.gaming?.count || 0) === 1 ? '' : 's'} today</span></div>
                            <button type="button" className="btn btn-sm" style={{ width: '100%', justifyContent: 'center', marginBottom: 8 }}
                              onClick={() => saveMentalityField('gaming', cur => ({ count: (cur.count || 0) + 1 }))}>+1 session</button>
                            <div className="field" style={{ marginBottom: 0 }}><label>Or write a number to add</label>
                              <div style={{ display: 'flex', gap: 6 }}>
                                <input type="number" value={gamingCustomAdd} onChange={e => setGamingCustomAdd(e.target.value)} placeholder="e.g. 3" style={{ flex: 1 }} />
                                <button type="button" className="btn btn-sm" disabled={!gamingCustomAdd}
                                  onClick={() => { saveMentalityField('gaming', cur => ({ count: (cur.count || 0) + parseInt(gamingCustomAdd || 0) })); setGamingCustomAdd('') }}>Add</button>
                              </div>
                            </div>
                          </>
                        )}
                        {expandedHomeMentality === 'eyeTracking' && (
                          <>
                            <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>{todaysMentalityLog.eyeTracking?.count || 0} <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--text-secondary)' }}>drill{(todaysMentalityLog.eyeTracking?.count || 0) === 1 ? '' : 's'} today</span></div>
                            <button type="button" className="btn btn-sm" style={{ width: '100%', justifyContent: 'center', marginBottom: 8 }}
                              onClick={() => saveMentalityField('eyeTracking', cur => ({ count: (cur.count || 0) + 1 }))}>+1 drill</button>
                            <div className="field" style={{ marginBottom: 12 }}><label>Or write a number to add</label>
                              <div style={{ display: 'flex', gap: 6 }}>
                                <input type="number" value={eyeTrackingCustomAdd} onChange={e => setEyeTrackingCustomAdd(e.target.value)} placeholder="e.g. 3" style={{ flex: 1 }} />
                                <button type="button" className="btn btn-sm" disabled={!eyeTrackingCustomAdd}
                                  onClick={() => { saveMentalityField('eyeTracking', cur => ({ count: (cur.count || 0) + parseInt(eyeTrackingCustomAdd || 0) })); setEyeTrackingCustomAdd('') }}>Add</button>
                              </div>
                            </div>
                            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10 }}>
                              <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>Drill videos</p>
                              <a href="https://youtu.be/bbk_ufmkYdE?si=yGVw8UoERqRE547i" target="_blank" rel="noreferrer"
                                style={{ display: 'block', fontSize: 12, color: '#378ADD', marginBottom: 4 }}>▶ Eye tracking drill 1</a>
                              <a href="https://youtu.be/E7HOlJ_OhEo?si=_pVUpaZfYWS2zKFE" target="_blank" rel="noreferrer"
                                style={{ display: 'block', fontSize: 12, color: '#378ADD', marginBottom: 4 }}>▶ Eye tracking drill 2</a>
                              <a href="https://youtu.be/RhdUV4F_ybM?si=xPpDj5Wlu6bNOkVY" target="_blank" rel="noreferrer"
                                style={{ display: 'block', fontSize: 12, color: '#378ADD', marginBottom: 6 }}>▶ Eye tracking drill 3</a>
                              <p style={{ fontSize: 11, color: 'var(--text-tertiary)', fontStyle: 'italic' }}>Best performed on a TV</p>
                            </div>
                          </>
                        )}
                        {expandedHomeMentality === 'coldWater' && (
                          <>
                            <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>{todaysMentalityLog.coldWater?.count || 0} <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--text-secondary)' }}>today</span></div>
                            <button type="button" className="btn btn-sm" style={{ width: '100%', justifyContent: 'center', marginBottom: 8 }}
                              onClick={() => saveMentalityField('coldWater', cur => ({ count: (cur.count || 0) + 1 }))}>+1</button>
                            <div className="field" style={{ marginBottom: 0 }}><label>Or write a number to add</label>
                              <div style={{ display: 'flex', gap: 6 }}>
                                <input type="number" value={coldWaterCustomAdd} onChange={e => setColdWaterCustomAdd(e.target.value)} placeholder="e.g. 3" style={{ flex: 1 }} />
                                <button type="button" className="btn btn-sm" disabled={!coldWaterCustomAdd}
                                  onClick={() => { saveMentalityField('coldWater', cur => ({ count: (cur.count || 0) + parseInt(coldWaterCustomAdd || 0) })); setColdWaterCustomAdd('') }}>Add</button>
                              </div>
                            </div>
                          </>
                        )}
                        {expandedHomeMentality === 'activeRecovery' && (
                          <MultiSessionTypeLogger field="activeRecovery" options={ACTIVE_RECOVERY_OPTIONS} />
                        )}
                        {expandedHomeMentality === 'gratitude' && (
                          <>
                            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8 }}>{todaysMentalityLog.gratitude?.count || 0} entr{(todaysMentalityLog.gratitude?.count || 0) === 1 ? 'y' : 'ies'} logged today</div>
                            <textarea value={gratitudeDraft} onChange={e => setGratitudeDraft(e.target.value)}
                              placeholder="Write down three good things…"
                              rows={4} style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius)', fontSize: 14, background: 'var(--bg-secondary)', color: 'var(--text)', fontFamily: 'var(--font-sans)', resize: 'vertical', marginBottom: 8 }} />
                            <button type="button" className="btn btn-sm" style={{ width: '100%', justifyContent: 'center' }}
                              onClick={() => { saveMentalityField('gratitude', cur => ({ count: (cur.count || 0) + 1, notes: gratitudeDraft })); setGratitudeDraft('') }}>
                              Save gratitude entry
                            </button>
                          </>
                        )}
                        {expandedHomeMentality === 'coachability' && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {COACHABILITY_PROMPTS.map(p => {
                              const current = todaysMentalityLog.coachability?.[p.key]
                              return (
                                <div key={p.key} style={{ padding: '8px 10px', background: 'var(--bg-secondary)', borderRadius: 'var(--radius)' }}>
                                  <p style={{ fontSize: 13, marginBottom: 6 }}>{p.label}</p>
                                  <div style={{ display: 'flex', gap: 4 }}>
                                    <button type="button" onClick={() => saveMentalityField('coachability', cur => ({ ...cur, [p.key]: true }))}
                                      className="btn btn-sm" style={{ padding: '3px 10px', background: current === true ? '#1D9E7520' : undefined, borderColor: current === true ? '#1D9E75' : undefined, color: current === true ? '#1D9E75' : undefined }}>{p.positiveLabel || 'Yes'}</button>
                                    <button type="button" onClick={() => saveMentalityField('coachability', cur => ({ ...cur, [p.key]: false }))}
                                      className="btn btn-sm" style={{ padding: '3px 10px', background: current === false ? '#E24B4A20' : undefined, borderColor: current === false ? '#E24B4A' : undefined, color: current === false ? '#E24B4A' : undefined }}>{p.negativeLabel || 'No'}</button>
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        )}
                        {savingMentalityLog && <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 8 }}>Saving…</p>}
                        <QuestionMediaUpload sectionKey="mentality" questionLabel={MENTALITY_QUESTIONS.find(q => q.key === expandedHomeMentality)?.label || expandedHomeMentality} />
                      </div>
                    )}
                    </div>
                    </div>
                    </div>
                    {/* end Physical/Technique/Tactical/Mentality reordered grid */}

                    {showAlterEgoModal && (() => {
                      const MORE_OF_OPTIONS = ['Fearlessness', 'Patience', 'Aggression', 'Composure', 'Confidence', 'Focus']
                      const LESS_OF_OPTIONS = ['Self-doubt', 'Hesitation', 'Overthinking', 'Anger', 'Anxiety']
                      const RITUAL_OPTIONS = ['Mantra', 'Breathing ritual', 'Walkout music', 'Visualization']
                      const wb = alterEgoWorkbook
                      const toggleInList = (field, val) => {
                        const cur = wb[field] || []
                        saveAlterEgoWorkbook({ [field]: cur.includes(val) ? cur.filter(v => v !== val) : [...cur, val] })
                      }
                      return (
                        <div style={{ position: 'fixed', inset: 0, background: 'var(--bg)', zIndex: 200, display: 'flex', flexDirection: 'column' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 16, borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
                            <button onClick={() => setShowAlterEgoModal(false)} className="btn btn-sm">← Back</button>
                            <h2 style={{ fontSize: 16, fontWeight: 600 }}>🎭 The Alter Ego Workbook</h2>
                          </div>
                          <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>

                            <div className="card" style={{ marginBottom: 14 }}>
                              <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>Part 1: Understanding the Alter Ego</h3>
                              <p style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--text-secondary)' }}>
                                An alter ego is a performance identity — a persona you step into when it's time to fight.
                                It helps you channel confidence, aggression, and focus while protecting your everyday self.
                              </p>
                            </div>

                            <div className="card" style={{ marginBottom: 14 }}>
                              <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>Part 2: Why Use an Alter Ego?</h3>
                              <p style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Mental Benefits:</p>
                              <ul style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--text-secondary)', paddingLeft: 20, marginBottom: 10 }}>
                                <li>Builds confidence and fearlessness</li>
                                <li>Shields your personal self from stress</li>
                                <li>Keeps focus sharp</li>
                              </ul>
                              <p style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Physical Benefits:</p>
                              <ul style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--text-secondary)', paddingLeft: 20 }}>
                                <li>Unlocks aggression in a controlled way</li>
                                <li>Brings consistency to fight performances</li>
                                <li>Fuels resilience</li>
                              </ul>
                            </div>

                            <div className="card" style={{ marginBottom: 14 }}>
                              <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>Part 3: Famous Examples of Alter Egos</h3>
                              <p style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Boxing Alter Egos:</p>
                              <ul style={{ fontSize: 12, lineHeight: 1.7, color: 'var(--text-secondary)', paddingLeft: 20, marginBottom: 10 }}>
                                <li><b>Muhammad Ali</b> – "The Greatest": Charismatic, poetic, unbeatable persona.</li>
                                <li><b>Mike Tyson</b> – "Iron Mike": Ferocious, intimidating, destructive force.</li>
                                <li><b>Prince Naseem Hamed</b>: Flamboyant, flashy, mind-game master.</li>
                                <li><b>Deontay Wilder</b> – "The Bronze Bomber": Warrior spirit for knockout power.</li>
                                <li><b>Floyd Mayweather Jr.</b> – "Pretty Boy / Money": Slick "Pretty Boy" to cold, businesslike "Money."</li>
                                <li><b>Gervonta Davis</b> – "Tank": Explosive power and fearless mindset.</li>
                                <li><b>Terence Crawford</b> – "Bud / Switch-Hitter": Calm outside, ruthless technician inside.</li>
                              </ul>
                              <p style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Other Sports Alter Egos:</p>
                              <ul style={{ fontSize: 12, lineHeight: 1.7, color: 'var(--text-secondary)', paddingLeft: 20 }}>
                                <li><b>Kobe Bryant</b> – "Black Mamba" (Basketball): Killer instinct and Mamba Mentality.</li>
                                <li><b>Michael Jordan</b> – "Black Jesus / His Airness" (Basketball): Mythical, untouchable presence.</li>
                                <li><b>Serena Williams</b> – "Arena" (Tennis): Warrior mindset for mental and physical dominance.</li>
                              </ul>
                            </div>

                            <div className="card" style={{ marginBottom: 14 }}>
                              <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Part 4: Creating Your Own Alter Ego</h3>

                              <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Step 1: Define Your Core Traits</p>
                              <p style={{ fontSize: 12, marginBottom: 6 }}>👉 What do I need MORE of in the ring?</p>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                                {MORE_OF_OPTIONS.map(o => (
                                  <button key={o} className="btn btn-sm" onClick={() => toggleInList('moreOf', o)}
                                    style={{ background: (wb.moreOf || []).includes(o) ? colour + '20' : undefined, borderColor: (wb.moreOf || []).includes(o) ? colour : undefined }}>{o}</button>
                                ))}
                              </div>
                              <input defaultValue={wb.moreOfOther || ''} placeholder="Other…" onBlur={e => saveAlterEgoWorkbook({ moreOfOther: e.target.value })} style={{ marginBottom: 12 }} />

                              <p style={{ fontSize: 12, marginBottom: 6 }}>👉 What do I need LESS of in the ring?</p>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                                {LESS_OF_OPTIONS.map(o => (
                                  <button key={o} className="btn btn-sm" onClick={() => toggleInList('lessOf', o)}
                                    style={{ background: (wb.lessOf || []).includes(o) ? colour + '20' : undefined, borderColor: (wb.lessOf || []).includes(o) ? colour : undefined }}>{o}</button>
                                ))}
                              </div>
                              <input defaultValue={wb.lessOfOther || ''} placeholder="Other…" onBlur={e => saveAlterEgoWorkbook({ lessOfOther: e.target.value })} style={{ marginBottom: 12 }} />

                              <p style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>My Top 3 Traits for My Alter Ego:</p>
                              {[0,1,2].map(i => (
                                <input key={i} defaultValue={wb.topTraits?.[i] || ''} placeholder={`Trait ${i+1}`}
                                  onBlur={e => { const arr = [...(wb.topTraits || [])]; arr[i] = e.target.value; saveAlterEgoWorkbook({ topTraits: arr }) }}
                                  style={{ marginBottom: 6 }} />
                              ))}

                              <hr style={{ margin: '14px 0', border: 'none', borderTop: '1px solid var(--border)' }} />

                              <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Step 2: Build the Identity</p>
                              <p style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Possible Alter Ego Names:</p>
                              <input defaultValue={wb.nameOption1 || ''} placeholder="Option 1" onBlur={e => saveAlterEgoWorkbook({ nameOption1: e.target.value })} style={{ marginBottom: 6 }} />
                              <input defaultValue={wb.nameOption2 || ''} placeholder="Option 2" onBlur={e => saveAlterEgoWorkbook({ nameOption2: e.target.value })} style={{ marginBottom: 12 }} />

                              <p style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Look / Visuals:</p>
                              <input defaultValue={wb.colours || ''} placeholder="Colors" onBlur={e => saveAlterEgoWorkbook({ colours: e.target.value })} style={{ marginBottom: 6 }} />
                              <input defaultValue={wb.fightAttire || ''} placeholder="Fight attire" onBlur={e => saveAlterEgoWorkbook({ fightAttire: e.target.value })} style={{ marginBottom: 6 }} />
                              <input defaultValue={wb.symbols || ''} placeholder="Symbols/Logos" onBlur={e => saveAlterEgoWorkbook({ symbols: e.target.value })} style={{ marginBottom: 12 }} />

                              <p style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Voice & Behavior:</p>
                              <input defaultValue={wb.voiceStyle || ''} placeholder="How does my alter ego talk?" onBlur={e => saveAlterEgoWorkbook({ voiceStyle: e.target.value })} style={{ marginBottom: 6 }} />
                              <input defaultValue={wb.bodyLanguage || ''} placeholder="How does my alter ego stare/walk/stand?" onBlur={e => saveAlterEgoWorkbook({ bodyLanguage: e.target.value })} style={{ marginBottom: 12 }} />

                              <hr style={{ margin: '14px 0', border: 'none', borderTop: '1px solid var(--border)' }} />

                              <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Step 3: Practice the Switch</p>
                              <p style={{ fontSize: 12, marginBottom: 6 }}>Choose Your Activation Ritual (check one or more):</p>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
                                {RITUAL_OPTIONS.map(o => (
                                  <label key={o} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                                    <input type="checkbox" checked={(wb.rituals || []).includes(o)} onChange={() => toggleInList('rituals', o)} style={{ width: 16, height: 16 }} />
                                    {o}
                                  </label>
                                ))}
                              </div>
                              <input defaultValue={wb.ritualOther || ''} placeholder="Other…" onBlur={e => saveAlterEgoWorkbook({ ritualOther: e.target.value })} style={{ marginBottom: 8 }} />
                              <input defaultValue={wb.myRitual || ''} placeholder="My Ritual Will Be…" onBlur={e => saveAlterEgoWorkbook({ myRitual: e.target.value })} style={{ marginBottom: 12 }} />

                              <hr style={{ margin: '14px 0', border: 'none', borderTop: '1px solid var(--border)' }} />

                              <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Step 4: Balance the Persona</p>
                              <p style={{ fontSize: 12, marginBottom: 6 }}>"In the ring I am ____, outside I am ____."</p>
                              <input defaultValue={wb.ringSelf || ''} placeholder="In the ring I am…" onBlur={e => saveAlterEgoWorkbook({ ringSelf: e.target.value })} style={{ marginBottom: 6 }} />
                              <input defaultValue={wb.outsideSelf || ''} placeholder="Outside I am…" onBlur={e => saveAlterEgoWorkbook({ outsideSelf: e.target.value })} />
                            </div>

                            <div className="card">
                              <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>Part 5: Reflection & Growth</h3>
                              <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12 }}>After each fight/sparring, fill this in:</p>

                              <p style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Did my alter ego show up?</p>
                              <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                                <button className="btn btn-sm" onClick={() => setNewReflectionText(p => ({ ...p, didItShowUp: true }))}
                                  style={{ background: newReflectionText.didItShowUp === true ? '#1D9E7520' : undefined, borderColor: newReflectionText.didItShowUp === true ? '#1D9E75' : undefined }}>Yes</button>
                                <button className="btn btn-sm" onClick={() => setNewReflectionText(p => ({ ...p, didItShowUp: false }))}
                                  style={{ background: newReflectionText.didItShowUp === false ? '#E24B4A20' : undefined, borderColor: newReflectionText.didItShowUp === false ? '#E24B4A' : undefined }}>No</button>
                              </div>
                              <input value={newReflectionText.helped} onChange={e => setNewReflectionText(p => ({ ...p, helped: e.target.value }))}
                                placeholder="What did it help me with?" style={{ marginBottom: 6 }} />
                              <input value={newReflectionText.fellShort} onChange={e => setNewReflectionText(p => ({ ...p, fellShort: e.target.value }))}
                                placeholder="Where did it fall short?" style={{ marginBottom: 6 }} />
                              <input value={newReflectionText.adjust} onChange={e => setNewReflectionText(p => ({ ...p, adjust: e.target.value }))}
                                placeholder="What will I adjust next time?" style={{ marginBottom: 10 }} />
                              <button className="btn btn-primary btn-sm" disabled={savingAlterEgo || newReflectionText.didItShowUp == null} onClick={addAlterEgoReflection}>
                                {savingAlterEgo ? 'Saving…' : 'Save reflection'}
                              </button>

                              {wb.reflections?.length > 0 && (
                                <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
                                  <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>Past reflections</p>
                                  {wb.reflections.map((r, i) => (
                                    <div key={i} style={{ padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
                                      <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 4 }}>
                                        {new Date(r.date).toLocaleDateString('en-GB')} — Showed up: <b style={{ color: r.didItShowUp ? '#1D9E75' : '#E24B4A' }}>{r.didItShowUp ? 'Yes' : 'No'}</b>
                                      </div>
                                      {r.helped && <p style={{ fontSize: 12, margin: '2px 0' }}><b>Helped:</b> {r.helped}</p>}
                                      {r.fellShort && <p style={{ fontSize: 12, margin: '2px 0' }}><b>Fell short:</b> {r.fellShort}</p>}
                                      {r.adjust && <p style={{ fontSize: 12, margin: '2px 0' }}><b>Adjust:</b> {r.adjust}</p>}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>

                          </div>
                        </div>
                      )
                    })()}

                    <div ref={wellbeingSectionRef}>
                    <button type="button" onClick={() => { setShowWellbeingSection(v => { if (v) setExpandedHomeWb(null); return !v }) }} style={{
                      width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 12,
                      textAlign: 'center', padding: '18px 14px', marginBottom: 10, cursor: 'pointer', fontFamily: 'var(--font-sans)', position: 'relative',
                      background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius)',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: showWellbeingSection ? 10 : 6, width: '100%' }}>
                        <span style={{ fontFamily: 'Anton, sans-serif', fontSize: showWellbeingSection ? 28 : 17, letterSpacing: 0.5, lineHeight: 1, color: '#c66013' }}>FOUNDATION</span>
                        <img src="/logos/char-foundation.png" alt="" style={{ height: showWellbeingSection ? 36 : 22, width: 'auto' }} />
                      </div>
                      <SectionProgressBars sectionKey="wellbeing" vertical />
                      <span style={{ position: 'absolute', top: 8, right: 10, fontSize: 11, color: 'var(--text-tertiary)' }}>{showWellbeingSection ? '▲' : '▼'}</span>
                    </button>

                    <div style={{
                      overflow: 'hidden', transition: 'max-height 0.35s ease, opacity 0.25s ease',
                      maxHeight: showWellbeingSection ? 6000 : 0, opacity: showWellbeingSection ? 1 : 0,
                    }}>
                    <div style={{ display: 'grid', gridTemplateColumns: expandedHomeWb ? '1fr' : 'repeat(2,1fr)', gap: 8, marginBottom: expandedHomeWb ? 10 : 8 }}>
                      {WELLBEING_QUESTIONS.filter(q => !expandedHomeWb || expandedHomeWb === q.key).map(q => {
                        const complete = isWellbeingQComplete(q.key, todaysWellbeing)
                        const active = expandedHomeWb === q.key
                        return (
                          <button key={q.key} type="button" onClick={() => setExpandedHomeWb(active ? null : q.key)} style={{
                            display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 6, padding: active ? '20px 14px' : '18px 14px',
                            borderRadius: 'var(--radius)', cursor: 'pointer', fontFamily: 'var(--font-sans)',
                            border: `2px solid ${active ? colour : complete ? '#0E9F6E' : 'var(--border)'}`,
                            background: complete ? '#0E9F6E12' : 'var(--bg-secondary)',
                          }}>
                            <QuestionProgressBarsVertical sectionKey="wellbeing" questionLabel={q.label} />
                            <span style={{ flex: 1, fontSize: active ? 13 : 11, fontWeight: active ? 700 : 600, color: 'var(--text)', textAlign: 'center', lineHeight: 1.2 }}>{q.label}</span>
                            <span style={{ fontSize: active ? 26 : 20, flexShrink: 0 }}>{q.icon}</span>
                          </button>
                        )
                      })}
                    </div>

                    {expandedHomeWb && (
                      <div className="card" style={{ marginBottom: 8 }}>
                        {expandedHomeWb && (
                          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
                            <button type="button" className="btn btn-sm" onClick={() => clearWellbeingQuestion(expandedHomeWb)} style={{ fontSize: 11 }}>✕ Clear</button>
                          </div>
                        )}
                        {expandedHomeWb === 'sleep' && (
                          <>
                            <div className="field"><label>Hours slept</label>
                              <input type="number" step="0.5" defaultValue={todaysWellbeing.sleep?.hours || ''}
                                onBlur={e => saveWellbeingField('sleep', cur => ({ ...cur, hours: e.target.value }))} placeholder="e.g. 8" />
                            </div>
                            <div className="field" style={{ marginBottom: 0 }}><label>Whoop sleep % (target 70%+)</label>
                              <input type="number" min="0" max="100" defaultValue={todaysWellbeing.sleep?.efficiency || ''}
                                onBlur={e => saveWellbeingField('sleep', cur => ({ ...cur, efficiency: e.target.value }))} placeholder="e.g. 75" />
                            </div>
                          </>
                        )}
                        {expandedHomeWb === 'nutrition' && (
                          <>
                            <p style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>🍽️ Foods</p>
                            <div className="field">
                              <label>Which target did you follow today?</label>
                              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                                {NUTRITION_MACRO_PRESETS.map(preset => {
                                  const active = todaysWellbeing.nutrition?.targetPreset === preset.key
                                  return (
                                    <button key={preset.key} type="button"
                                      onClick={() => saveWellbeingField('nutrition', cur => ({ ...cur, targetPreset: preset.key }))}
                                      style={{
                                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: 8,
                                        borderRadius: 'var(--radius)', cursor: 'pointer',
                                        border: `1px solid ${active ? '#0E9F6E' : 'var(--border-strong)'}`,
                                        background: active ? '#0E9F6E18' : 'var(--bg-secondary)',
                                      }}>
                                      <MacroPie carbs={preset.carbs} fat={preset.fat} protein={preset.protein} size={64} />
                                      <span style={{ fontSize: 11, fontWeight: 600 }}>{active ? '✓ ' : ''}{preset.label}</span>
                                      <span style={{ fontSize: 9, color: 'var(--text-tertiary)' }}>{preset.carbs}/{preset.fat}/{preset.protein}</span>
                                    </button>
                                  )
                                })}
                              </div>
                            </div>
                            <div className="field" style={{ marginBottom: 0 }}><label>Quality</label>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                {NUTRITION_QUALITY_OPTIONS.map(v => (
                                  <button key={v} type="button" onClick={() => saveWellbeingField('nutrition', cur => ({ ...cur, quality: v }))}
                                    className="btn btn-sm" style={{ background: todaysWellbeing.nutrition?.quality === v ? '#0E9F6E20' : undefined, borderColor: todaysWellbeing.nutrition?.quality === v ? '#0E9F6E' : undefined }}>{v}</button>
                                ))}
                              </div>
                            </div>
                            <div className="field" style={{ marginBottom: 0, marginTop: 12 }}><label>Notes</label>
                              <textarea key={todaysWellbeing.nutrition ? 'loaded' : 'empty'} rows={2} defaultValue={todaysWellbeing.nutrition?.notes || ''}
                                onBlur={e => { if (e.target.value !== (todaysWellbeing.nutrition?.notes || '')) saveWellbeingField('nutrition', cur => ({ ...cur, notes: e.target.value })) }}
                                placeholder="Anything else about today's food…" style={{ resize: 'none', width: '100%' }} />
                            </div>

                            <hr style={{ margin: '16px 0', border: 'none', borderTop: '1px solid var(--border)' }} />

                            <p style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>☕ Coffee</p>
                            <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>{todaysWellbeing.nutrition?.coffee || 0} <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--text-secondary)' }}>cup{(todaysWellbeing.nutrition?.coffee || 0) === 1 ? '' : 's'} today</span></div>
                            <div className="field" style={{ marginBottom: 0 }}>
                              <label>Add throughout the day</label>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                <button type="button" className="btn btn-sm" onClick={() => saveWellbeingField('nutrition', cur => ({ ...cur, coffee: (cur.coffee || 0) + 1 }))}>+1 cup</button>
                                <button type="button" className="btn btn-sm" onClick={() => saveWellbeingField('nutrition', cur => ({ ...cur, coffee: (cur.coffee || 0) + 2 }))}>+2 cups</button>
                                {todaysWellbeing.nutrition?.coffee > 0 && (
                                  <button type="button" className="btn btn-sm" onClick={() => saveWellbeingField('nutrition', cur => ({ ...cur, coffee: 0 }))}>Reset today's total</button>
                                )}
                              </div>
                            </div>
                          </>
                        )}
                        {expandedHomeWb === 'hydration' && (
                          <>
                            <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>{(todaysWellbeing.hydration?.total || 0).toFixed(2)}L <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--text-secondary)' }}>today</span></div>
                            <div className="field">
                              <label>Add</label>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                {HYDRATION_ADD_OPTIONS.map(v => (
                                  <button key={v} type="button" onClick={() => saveWellbeingField('hydration', cur => ({ total: +((cur.total || 0) + v).toFixed(2) }))}
                                    className="btn btn-sm">+{v}L</button>
                                ))}
                              </div>
                            </div>
                            <div className="field" style={{ marginBottom: 8 }}><label>Or add a custom amount (L)</label>
                              <div style={{ display: 'flex', gap: 6 }}>
                                <input type="number" step="0.1" value={hydrationCustomAdd} onChange={e => setHydrationCustomAdd(e.target.value)} placeholder="e.g. 0.3" style={{ flex: 1 }} />
                                <button type="button" className="btn btn-sm" disabled={!hydrationCustomAdd}
                                  onClick={() => { saveWellbeingField('hydration', cur => ({ total: +((cur.total || 0) + parseFloat(hydrationCustomAdd || 0)).toFixed(2) })); setHydrationCustomAdd('') }}>Add</button>
                              </div>
                            </div>
                            {todaysWellbeing.hydration?.total > 0 && (
                              <button type="button" className="btn btn-sm" onClick={() => saveWellbeingField('hydration', () => ({ total: 0 }))}>Reset today's total</button>
                            )}
                          </>
                        )}
                        {expandedHomeWb === 'outdoors' && (
                          <>
                            <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>{todaysWellbeing.outdoors?.totalMinutes || 0} mins <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--text-secondary)' }}>today (target 20+)</span></div>
                            <div className="field">
                              <label>Add</label>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                {OUTDOORS_ADD_OPTIONS.map(v => (
                                  <button key={v} type="button" onClick={() => saveWellbeingField('outdoors', cur => ({ totalMinutes: (cur.totalMinutes || 0) + v }))}
                                    className="btn btn-sm">+{v} mins</button>
                                ))}
                              </div>
                            </div>
                            <div className="field" style={{ marginBottom: 8 }}><label>Or add custom minutes</label>
                              <div style={{ display: 'flex', gap: 6 }}>
                                <input type="number" value={outdoorsCustomAdd} onChange={e => setOutdoorsCustomAdd(e.target.value)} placeholder="e.g. 15" style={{ flex: 1 }} />
                                <button type="button" className="btn btn-sm" disabled={!outdoorsCustomAdd}
                                  onClick={() => { saveWellbeingField('outdoors', cur => ({ totalMinutes: (cur.totalMinutes || 0) + parseInt(outdoorsCustomAdd || 0) })); setOutdoorsCustomAdd('') }}>Add</button>
                              </div>
                            </div>
                            {todaysWellbeing.outdoors?.totalMinutes > 0 && (
                              <button type="button" className="btn btn-sm" onClick={() => saveWellbeingField('outdoors', () => ({ totalMinutes: 0 }))}>Reset today's total</button>
                            )}
                          </>
                        )}
                        {expandedHomeWb === 'talk' && (
                          <>
                            <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>{todaysWellbeing.talk?.count || 0} <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--text-secondary)' }}>conversation{(todaysWellbeing.talk?.count || 0) === 1 ? '' : 's'} today</span></div>
                            <div className="field">
                              <label>Add</label>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                {TALK_ADD_OPTIONS.map(v => (
                                  <button key={v} type="button" onClick={() => saveWellbeingField('talk', cur => ({ count: (cur.count || 0) + v }))}
                                    className="btn btn-sm">+{v}</button>
                                ))}
                              </div>
                            </div>
                            <div className="field" style={{ marginBottom: 8 }}><label>Or write a number to add</label>
                              <div style={{ display: 'flex', gap: 6 }}>
                                <input type="number" value={talkCustomAdd} onChange={e => setTalkCustomAdd(e.target.value)} placeholder="e.g. 4" style={{ flex: 1 }} />
                                <button type="button" className="btn btn-sm" disabled={!talkCustomAdd}
                                  onClick={() => { saveWellbeingField('talk', cur => ({ count: (cur.count || 0) + parseInt(talkCustomAdd || 0) })); setTalkCustomAdd('') }}>Add</button>
                              </div>
                            </div>
                            {todaysWellbeing.talk?.count > 0 && (
                              <button type="button" className="btn btn-sm" onClick={() => saveWellbeingField('talk', () => ({ count: 0 }))}>Reset today's count</button>
                            )}
                          </>
                        )}
                        {expandedHomeWb === 'screenFree' && (
                          <>
                            <div className="field"><label>Time off screen</label>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                {SCREEN_FREE_OPTIONS.map(v => (
                                  <button key={v} type="button" onClick={() => saveWellbeingField('screenFree', () => ({ hours: v, custom: '' }))}
                                    className="btn btn-sm" style={{ background: todaysWellbeing.screenFree?.hours === v ? '#0E9F6E20' : undefined, borderColor: todaysWellbeing.screenFree?.hours === v ? '#0E9F6E' : undefined }}>{v}</button>
                                ))}
                              </div>
                            </div>
                            <div className="field" style={{ marginBottom: 0 }}><label>Or write your own</label>
                              <input defaultValue={todaysWellbeing.screenFree?.custom || ''}
                                onBlur={e => saveWellbeingField('screenFree', () => ({ hours: '', custom: e.target.value }))} placeholder="e.g. 18 hours" />
                            </div>
                          </>
                        )}
                        {expandedHomeWb === 'journal' && (
                          <>
                            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8 }}>{todaysWellbeing.journal?.count || 0} entr{(todaysWellbeing.journal?.count || 0) === 1 ? 'y' : 'ies'} logged today</div>
                            <textarea value={journalDraft} onChange={e => setJournalDraft(e.target.value)}
                              placeholder="Optional — write your journal here"
                              rows={6} style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius)', fontSize: 14, background: 'var(--bg-secondary)', color: 'var(--text)', fontFamily: 'var(--font-sans)', resize: 'vertical', marginBottom: 8 }} />
                            <button type="button" className="btn btn-sm" style={{ width: '100%', justifyContent: 'center', marginBottom: 8 }}
                              onClick={() => { saveWellbeingField('journal', cur => ({ ...cur, count: (cur.count || 0) + 1, notes: journalDraft })); setJournalDraft('') }}>
                              Save journal entry
                            </button>
                            <button type="button" className="btn btn-sm" style={{ width: '100%', justifyContent: 'center', background: todaysWellbeing.journal?.privateJournal ? '#0E9F6E20' : undefined, borderColor: todaysWellbeing.journal?.privateJournal ? '#0E9F6E' : undefined }}
                              onClick={() => saveWellbeingField('journal', cur => ({ ...cur, privateJournal: !cur.privateJournal }))}>
                              {todaysWellbeing.journal?.privateJournal ? '✓ Journaled privately away from this app' : 'I journaled privately, away from this app'}
                            </button>
                          </>
                        )}
                        {expandedHomeWb === 'creative' && (
                          <>
                            <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>{todaysWellbeing.creative?.count || 0} <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--text-secondary)' }}>task{(todaysWellbeing.creative?.count || 0) === 1 ? '' : 's'} today</span></div>
                            <button type="button" className="btn btn-sm" style={{ width: '100%', justifyContent: 'center', marginBottom: 8 }}
                              onClick={() => saveWellbeingField('creative', cur => ({ ...cur, count: (cur.count || 0) + 1 }))}>
                              +1 creative task completed
                            </button>
                            <div className="field"><label>Or write a number to add</label>
                              <div style={{ display: 'flex', gap: 6 }}>
                                <input type="number" value={creativeCustomAdd} onChange={e => setCreativeCustomAdd(e.target.value)} placeholder="e.g. 3" style={{ flex: 1 }} />
                                <button type="button" className="btn btn-sm" disabled={!creativeCustomAdd}
                                  onClick={() => { saveWellbeingField('creative', cur => ({ ...cur, count: (cur.count || 0) + parseInt(creativeCustomAdd || 0) })); setCreativeCustomAdd('') }}>Add</button>
                              </div>
                            </div>
                            <input defaultValue={todaysWellbeing.creative?.notes || ''}
                              onBlur={e => saveWellbeingField('creative', cur => ({ ...cur, notes: e.target.value }))} placeholder="Optional — what did you do?" />
                          </>
                        )}
                        {expandedHomeWb === 'productivity' && (
                          <>
                            <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>{todaysWellbeing.productivity?.count || 0} <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--text-secondary)' }}>task{(todaysWellbeing.productivity?.count || 0) === 1 ? '' : 's'} today</span></div>
                            <button type="button" className="btn btn-sm" style={{ width: '100%', justifyContent: 'center', marginBottom: 8 }}
                              onClick={() => saveWellbeingField('productivity', cur => ({ ...cur, count: (cur.count || 0) + 1 }))}>
                              +1 productive task completed
                            </button>
                            <div className="field"><label>Or write a number to add</label>
                              <div style={{ display: 'flex', gap: 6 }}>
                                <input type="number" value={productivityCustomAdd} onChange={e => setProductivityCustomAdd(e.target.value)} placeholder="e.g. 3" style={{ flex: 1 }} />
                                <button type="button" className="btn btn-sm" disabled={!productivityCustomAdd}
                                  onClick={() => { saveWellbeingField('productivity', cur => ({ ...cur, count: (cur.count || 0) + parseInt(productivityCustomAdd || 0) })); setProductivityCustomAdd('') }}>Add</button>
                              </div>
                            </div>
                            <input defaultValue={todaysWellbeing.productivity?.notes || ''}
                              onBlur={e => saveWellbeingField('productivity', cur => ({ ...cur, notes: e.target.value }))} placeholder="Optional — what did you do?" />
                          </>
                        )}
                        {savingWellbeing && <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 8 }}>Saving…</p>}
                        <QuestionMediaUpload sectionKey="wellbeing" questionLabel={WELLBEING_QUESTIONS.find(q => q.key === expandedHomeWb)?.label || expandedHomeWb} />
                      </div>
                    )}
                    </div>
                    </div>



                    {apData && (apData.top_achievements || (Array.isArray(apData.recent_results) && apData.recent_results.length > 0)) && (
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                        {apData.top_achievements && (
                          <div className="card" style={{ gridColumn: '1/-1' }}>
                            <h3 style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: colour }}>🏆 Top achievements</h3>
                            <p style={{ fontSize: 13, lineHeight: 1.6 }}>{apData.top_achievements}</p>
                          </div>
                        )}
                        {Array.isArray(apData.recent_results) && apData.recent_results.length > 0 && (
                          <div className="card" style={{ gridColumn: '1/-1' }}>
                            <h3 style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Recent results</h3>
                            {apData.recent_results.map((r, i) => (
                              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                                <span style={{ fontSize: 16 }}>🎖</span>{r}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Website Profile preview -- same show_on_website
                        toggle your coach controls, no separate hide
                        mechanism here. Public website page itself isn't
                        live yet; this is a preview of what it will show. */}
                    {apData?.show_on_website && (
                      <div className="card" style={{ marginBottom: 14, border: '1px solid #378ADD40' }}>
                        <h3 style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, color: '#378ADD', display: 'flex', alignItems: 'center', gap: 6 }}>
                          🌐 Website Profile Preview
                        </h3>
                        <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 10, fontStyle: 'italic' }}>
                          This is what will show publicly once the website page is live.
                        </p>
                        {[
                          ['Favourite technique', apData.favourite_technique],
                          ['Training music', apData.training_music],
                          ['Social media', apData.social_media],
                          ['Sponsors', apData.sponsor_links],
                        ].map(([l, v]) => v && (
                          <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                            <span style={{ color: 'var(--text-secondary)' }}>{l}</span>
                            <span style={{ fontWeight: 500, maxWidth: '55%', textAlign: 'right' }}>{v}</span>
                          </div>
                        ))}
                      </div>
                    )}

                  </>
                )
               } catch (e) {
                 console.error('Home tab render error:', e)
                 return (
                   <div className="card" style={{ textAlign: 'center', padding: 20 }}>
                     <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8 }}>
                       Something didn't load correctly here. Try refreshing the app.
                     </p>
                     <p style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: 'monospace', wordBreak: 'break-word' }}>
                       {e?.message || String(e)}
                     </p>
                   </div>
                 )
               }
              })()}

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 8, marginTop: 14, marginBottom: 8 }}>
                {[
                  { label: 'Media', icon: '🖼', colour: '#8B5CF6', tab: 'media' },
                  { label: 'Notes', icon: '📝', colour: '#378ADD', tab: 'notes' },
                ].map(l => (
                  <button key={l.label} onClick={() => setTab(l.tab)} style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                    padding: '14px 8px', background: l.colour + '12',
                    border: `1px solid ${l.colour}30`, borderRadius: 'var(--border-radius-lg)',
                    cursor: 'pointer', fontFamily: 'var(--font-sans)',
                  }}>
                    <span style={{ fontSize: 24 }}>{l.icon}</span>
                    <span style={{ fontSize: 12, fontWeight: 500, color: l.colour }}>{l.label}</span>
                  </button>
                ))}
              </div>

              {/* Opponents + Reports -- tiles linking to their own full
                  screens, instead of Opponents being a large card
                  embedded directly in the Home tab. */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 8, marginTop: 8, marginBottom: 8 }}>
                <button onClick={() => setTab('opponents')} style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                  padding: '14px 8px', background: '#E24B4A12',
                  border: '1px solid #E24B4A30', borderRadius: 'var(--border-radius-lg)',
                  cursor: 'pointer', fontFamily: 'var(--font-sans)',
                }}>
                  <span style={{ fontSize: 24 }}>🥊</span>
                  <span style={{ fontSize: 12, fontWeight: 500, color: '#E24B4A' }}>Opponents</span>
                </button>
                <button onClick={() => setTab('reports')} style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                  padding: '14px 8px', background: '#378ADD12',
                  border: '1px solid #378ADD30', borderRadius: 'var(--border-radius-lg)',
                  cursor: 'pointer', fontFamily: 'var(--font-sans)',
                }}>
                  <span style={{ fontSize: 24 }}>📄</span>
                  <span style={{ fontSize: 12, fontWeight: 500, color: '#378ADD' }}>Reports</span>
                </button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 8 }}>
                {[
                  { label: 'Whoop', icon: '⌚', colour: '#1D9E75', tab: 'whoop' },
                  { label: 'TTP', icon: '📊', colour: '#E24B4A', tab: 'tpt' },
                ].map(l => (
                  <button key={l.label} onClick={() => l.tab && setTab(l.tab)} style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                    padding: '14px 8px', background: l.colour + '12',
                    border: `1px solid ${l.colour}30`, borderRadius: 'var(--border-radius-lg)',
                    cursor: l.tab ? 'pointer' : 'default', fontFamily: 'var(--font-sans)',
                    opacity: l.tab ? 1 : 0.6,
                  }}>
                    <span style={{ fontSize: 24 }}>{l.icon}</span>
                    <span style={{ fontSize: 12, fontWeight: 500, color: l.colour }}>{l.label}</span>
                  </button>
                ))}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 8, marginTop: 8 }}>
                <button onClick={() => setTab('sweep')} style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                  padding: '14px 8px', background: '#1D9E7512',
                  border: '1px solid #1D9E7530', borderRadius: 'var(--border-radius-lg)',
                  cursor: 'pointer', fontFamily: 'var(--font-sans)',
                }}>
                  <span style={{ fontSize: 24 }}>🧹</span>
                  <span style={{ fontSize: 12, fontWeight: 500, color: '#1D9E75' }}>Sweep the sheds</span>
                </button>
                <button onClick={() => setTab('leagues')} style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                  padding: '14px 8px', background: '#8B5CF612',
                  border: '1px solid #8B5CF630', borderRadius: 'var(--border-radius-lg)',
                  cursor: 'pointer', fontFamily: 'var(--font-sans)',
                }}>
                  <span style={{ fontSize: 24 }}>🏆</span>
                  <span style={{ fontSize: 12, fontWeight: 500, color: '#8B5CF6' }}>Leagues</span>
                </button>
              </div>
                    <div ref={testSectionRef}>
                    <button type="button" onClick={() => { setShowTestSection(v => { if (v) setExpandedHomeTestCategory(null); return !v }) }} style={{
                      width: '100%', display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 8,
                      textAlign: 'center', padding: '12px', marginBottom: 10, cursor: 'pointer', fontFamily: 'var(--font-sans)', position: 'relative',
                      background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius)',
                    }}>
                      <SectionProgressBars sectionKey="test" vertical />
                      <span style={{ flex: 1, fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>Test</span>
                      <span style={{ fontSize: 24, flexShrink: 0 }}>📋</span>
                      <span style={{ position: 'absolute', top: 8, right: 10, fontSize: 11, color: 'var(--text-tertiary)' }}>{showTestSection ? '▲' : '▼'}</span>
                    </button>

                    <div style={{
                      overflow: 'hidden', transition: 'max-height 0.35s ease, opacity 0.25s ease',
                      maxHeight: showTestSection ? 4000 : 0, opacity: showTestSection ? 1 : 0,
                    }}>
                    <div style={{ display: 'grid', gridTemplateColumns: expandedHomeTestCategory ? '1fr' : 'repeat(2,1fr)', gap: 8, marginBottom: expandedHomeTestCategory ? 10 : 8 }}>
                      {TEST_CATEGORIES.filter(cat => !expandedHomeTestCategory || expandedHomeTestCategory === cat.key).map(cat => {
                        const complete = cat.tests.some(t => todaysTest[t.name] != null && todaysTest[t.name] !== '')
                        const active = expandedHomeTestCategory === cat.key
                        return (
                          <button key={cat.key} type="button" onClick={() => setExpandedHomeTestCategory(active ? null : cat.key)} style={{
                            display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 6, padding: active ? '20px 14px' : '18px 14px',
                            borderRadius: 'var(--radius)', cursor: 'pointer', fontFamily: 'var(--font-sans)',
                            border: `2px solid ${active ? colour : complete ? '#8B5CF6' : 'var(--border)'}`,
                            background: complete ? '#8B5CF612' : 'var(--bg-secondary)',
                          }}>
                            <QuestionProgressBarsVertical sectionKey="test" questionLabel={cat.label} />
                            <span style={{ flex: 1, fontSize: active ? 13 : 11, fontWeight: active ? 700 : 600, color: 'var(--text)', textAlign: 'center', lineHeight: 1.2 }}>{cat.label}</span>
                            <span style={{ fontSize: active ? 26 : 20, flexShrink: 0 }}>{cat.icon}</span>
                          </button>
                        )
                      })}
                    </div>

                    {expandedHomeTestCategory && (() => {
                      const cat = TEST_CATEGORIES.find(c => c.key === expandedHomeTestCategory)
                      const sorted = [...sessions].sort((a, b) => new Date(a.session_date) - new Date(b.session_date))
                      return (
                        <div className="card" style={{ marginBottom: 8 }}>
                          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
                            <button type="button" className="btn btn-sm" onClick={() => clearTestCategory(cat.key)} style={{ fontSize: 11 }}>✕ Clear</button>
                          </div>
                          {cat.tests.map(t => {
                            const allValues = sorted.map(s => parseFloat(s.test?.[t.name])).filter(v => !isNaN(v))
                            const mostRecentSession = [...sorted].reverse().find(s => s.test?.[t.name] != null && s.test[t.name] !== '')
                            const mostRecent = mostRecentSession ? mostRecentSession.test[t.name] : null
                            const isTimeBased = t.unit === 'sec'
                            const pb = allValues.length ? (isTimeBased ? Math.min(...allValues) : Math.max(...allValues)) : null
                            return (
                              <div className="field" key={t.name}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                                  <label>{t.name}{t.unit ? ` (${t.unit})` : ''}</label>
                                  {(mostRecent != null || pb != null) && (
                                    <span style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                                      {mostRecent != null && <span style={{ fontSize: 15, fontWeight: 700 }}>{mostRecent}{t.unit}</span>}
                                      {pb != null && <span style={{ fontSize: 10, color: colour, fontWeight: 600 }}>🏅 {pb}{t.unit}</span>}
                                    </span>
                                  )}
                                </div>
                                <input type="text" inputMode="decimal" defaultValue={todaysTest[t.name] ?? ''}
                                  onBlur={e => saveTestValue(t.name, e.target.value)}
                                  placeholder={`e.g. ${t.unit === 'sec' ? '32:15' : t.unit === 'level' ? '11.4' : '25'}`} />
                              </div>
                            )
                          })}
                          {savingTest && <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>Saving…</p>}
                          <QuestionMediaUpload sectionKey="test" questionLabel={cat.label} />
                        </div>
                      )
                    })()}
                    </div>
                    </div>

            </>
          ) : (
            <div className="card" style={{ textAlign: 'center', padding: 32 }}>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>Your account isn't linked to a student record yet.</p>
              <button className="btn btn-primary" onClick={() => setTab('search')}>🔍 Find your profile</button>
            </div>
          )}
        </div>
      )}

      {/* ── Sessions ── */}
      {tab === 'sessions' && student && (() => {
        const backButton = <button onClick={() => setTab('home')} className="btn btn-sm" style={{ marginBottom: 12 }}>← Back to Home</button>
        const { year, month } = sessionsCalMonth
        const firstDay = new Date(year, month, 1)
        const daysInMonth = new Date(year, month + 1, 0).getDate()
        const startWeekday = (firstDay.getDay() + 6) % 7 // Monday-first
        const cells = []
        for (let i = 0; i < startWeekday; i++) cells.push(null)
        for (let d = 1; d <= daysInMonth; d++) cells.push(d)

        const myAttendance = attendanceData.filter(a => a.attendance_type !== 'absent' && a.attendance_type !== 'excused')
        const attendedDays = new Set(myAttendance.map(a => a.session_date).filter(d => d && new Date(d).getFullYear() === year && new Date(d).getMonth() === month))
        // Which specific classes were attended each day, so a day with 2
        // possible classes but only 1 attended shows as partial (light
        // green) instead of the same full green as attending both.
        const attendedClassIdsByDate = {}
        myAttendance.forEach(a => {
          if (!a.session_date) return
          const d = new Date(a.session_date)
          if (d.getFullYear() !== year || d.getMonth() !== month) return
          ;(attendedClassIdsByDate[a.session_date] ||= new Set()).add(a.class_id || 'none')
        })
        const explicitlyAbsentDays = new Set(
          attendanceData.filter(a => a.attendance_type === 'absent').map(a => a.session_date).filter(d => d && new Date(d).getFullYear() === year && new Date(d).getMonth() === month)
        )
        const assignedWeekdays = new Set(assignedClasses.flatMap(a => DAY_TO_JS_DAYS[a.classes?.day_of_week] || []))
        const todayStr = new Date().toISOString().split('T')[0]
        const allTrainingDays = new Set(
          Array.from({ length: daysInMonth }, (_, i) => i + 1)
            .filter(d => assignedWeekdays.has(new Date(year, month, d).getDay()))
            .map(d => `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`)
            .filter(dateStr => dateStr <= todayStr)
            .filter(dateStr => {
              const jsDay = new Date(dateStr + 'T12:00:00').getDay()
              const classIdsThatDay = assignedClasses.filter(a => (DAY_TO_JS_DAYS[a.classes?.day_of_week] || []).includes(jsDay)).map(a => a.classes?.id)
              return !isDateOnHoliday(dateStr, holidays, classIdsThatDay, student.id)
            })
        )
        // F2F actions completed per day -- counts each populated metric
        // field across every session logged that day (running, watt
        // bike, bodyweight, techniques, weight, and each individual
        // test entry), not just "was a session logged".
        const f2fActionsByDate = {}
        sessions.forEach(s => {
          if (!s.session_date) return
          const d = new Date(s.session_date)
          if (d.getFullYear() !== year || d.getMonth() !== month) return
          let count = 0
          if (s.weight_before || s.weight_after) count++
          if (s.running) count += toEntries(s.running).length
          if (s.watt_bike) count += toEntries(s.watt_bike).length
          if (s.bodyweight) count += toEntries(s.bodyweight).length
          if (s.techniques) count += toEntries(s.techniques).length
          if (s.test) count += Object.keys(s.test).length
          f2fActionsByDate[s.session_date] = (f2fActionsByDate[s.session_date] || 0) + count
        })
        // PDP actions completed per day -- counts every PDP timetable
        // item logged against that date.
        const pdpActionsByDate = {}
        PDP_TIMETABLE_SECTION_KEYS.forEach(sectionKey => {
          Object.values((apData?.pdp_notes || {})[`__timetable_${sectionKey}`] || {}).forEach(entry => {
            if (!entry?.date) return
            const d = new Date(entry.date)
            if (d.getFullYear() !== year || d.getMonth() !== month) return
            pdpActionsByDate[entry.date] = (pdpActionsByDate[entry.date] || 0) + 1
          })
        })
        const pdpNotesData = apData?.pdp_notes || {}
        const allPdpEntries = PDP_TIMETABLE_SECTION_KEYS.flatMap(sectionKey =>
          Object.entries(pdpNotesData[`__timetable_${sectionKey}`] || {}).map(([item, entry]) => ({ sectionKey, item, ...entry }))
        )

        const weekDays = Array.from({ length: 7 }, (_, i) => {
          const d = new Date(weekTimetableStart)
          d.setDate(d.getDate() + i)
          return d
        })
        const hourMarks = Array.from({ length: 9 }, (_, i) => 6 + i * 2)

        // Total hours trained this month -- sums each attended
        // session's duration (real check-out if there is one, or the
        // class's scheduled end time as a stand-in for anyone who
        // forgot to check out).
        const totalHoursThisMonth = myAttendance.reduce((sum, att) => {
          const classInfo = assignedClasses.find(a => a.classes?.id === att.class_id)?.classes
          return sum + (getSessionHours(att, classInfo) || 0)
        }, 0)

        return (
          <div>
            {backButton}
            <div className="card" style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', flexShrink: 0 }}>
                  ⏱ {totalHoursThisMonth.toFixed(1)}hrs
                </span>
                {(() => {
                  const [launchYear, launchMonthNum] = SOFT_LAUNCH_DATE.split('-').map(Number)
                  const launchMonth = launchMonthNum - 1 // 0-indexed to match sessionsCalMonth
                  const atEarliestMonth = year === launchYear && month === launchMonth
                  return (
                    <>
                      <button className="btn btn-sm" disabled={atEarliestMonth}
                        onClick={() => setSessionsCalMonth(m => {
                          if (m.year === launchYear && m.month === launchMonth) return m // never go earlier than the soft launch month
                          return m.month === 0 ? { year: m.year - 1, month: 11 } : { year: m.year, month: m.month - 1 }
                        })}>←</button>
                      <input type="month" value={`${year}-${String(month+1).padStart(2,'0')}`} min={`${launchYear}-${String(launchMonth+1).padStart(2,'0')}`}
                        onChange={e => {
                          const [y, m] = e.target.value.split('-').map(Number)
                          if (!y || !m) return
                          const beforeLaunch = y < launchYear || (y === launchYear && (m - 1) < launchMonth)
                          setSessionsCalMonth(beforeLaunch ? { year: launchYear, month: launchMonth } : { year: y, month: m - 1 })
                        }}
                        style={{ fontSize: 11, padding: '4px 6px', border: '1px solid var(--border-strong)', borderRadius: 6, background: 'var(--bg-secondary)', color: 'var(--text)' }} />
                    </>
                  )
                })()}
                <button className="btn btn-sm" onClick={() => setSessionsCalMonth(m => m.month === 11 ? { year: m.year + 1, month: 0 } : { year: m.year, month: m.month + 1 })}>→</button>
              </div>
              <button className="btn btn-sm" style={{ width: '100%', justifyContent: 'center', marginBottom: 10, gap: 6 }}
                onClick={() => setSessionsCalendarView(v => v === 'sessions' ? 'f2f' : v === 'f2f' ? 'pdp' : 'sessions')}>
                {sessionsCalendarView === 'sessions' ? (
                  <><img src="/logos/icon-schedule.png" alt="" style={{ height: 18, width: 'auto', objectFit: 'contain' }} /> Sessions</>
                ) : sessionsCalendarView === 'f2f' ? '🔥 Fit II Fight' : (
                  <><img src="/logos/icon-pdp.png" alt="" style={{ height: 18, width: 'auto', objectFit: 'contain' }} /> PDP</>
                )}
                <span style={{ marginLeft: 6, fontSize: 10, opacity: 0.6 }}>tap to switch</span>
              </button>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 6 }}>
                {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d => (
                  <div key={d} style={{ textAlign: 'center', fontSize: 10, color: 'var(--text-tertiary)', fontWeight: 600 }}>{d}</div>
                ))}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
                {cells.map((d, i) => {
                  if (d === null) return <div key={i} />
                  const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`

                  // F2F / PDP views show a completed-actions count per
                  // day instead of the attendance colouring below.
                  if (sessionsCalendarView !== 'sessions') {
                    const count = sessionsCalendarView === 'f2f' ? (f2fActionsByDate[dateStr] || 0) : (pdpActionsByDate[dateStr] || 0)
                    const vc = sessionsCalendarView === 'f2f' ? '#378ADD' : '#8B5CF6'
                    return (
                      <div key={i} title={`${count} action${count === 1 ? '' : 's'} completed`}
                        style={{
                          aspectRatio: '0.85', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                          borderRadius: 6, fontFamily: 'var(--font-sans)',
                          background: count > 0 ? vc + '18' : 'transparent',
                          border: `1px solid ${count > 0 ? vc + '55' : 'var(--border)'}`,
                        }}>
                        <span style={{ fontSize: 9, color: 'var(--text-tertiary)' }}>{d}</span>
                        <span style={{ fontWeight: 700, fontSize: 14, color: count > 0 ? vc : 'var(--text-tertiary)' }}>{count}</span>
                      </div>
                    )
                  }

                  const attended = attendedDays.has(dateStr)
                  const explicitlyAbsent = explicitlyAbsentDays.has(dateStr)
                  const wasTrainingDay = allTrainingDays.has(dateStr)
                  const showAsRed = explicitlyAbsent || (wasTrainingDay && !attended && dateStr < todayStr)
                  const jsDay = new Date(year, month, d).getDay()
                  const classesToday = assignedClasses.filter(a => (DAY_TO_JS_DAYS[a.classes?.day_of_week] || []).includes(jsDay) && !isDateOnHoliday(dateStr, holidays, a.classes?.id ? [a.classes.id] : [], student.id))
                  // Light green = attended some but not all of the
                  // classes possible that day; dark green = attended
                  // everything possible that day.
                  const attendedCountToday = (attendedClassIdsByDate[dateStr] || new Set()).size
                  const possibleCountToday = Math.max(classesToday.length, 1)
                  const isPartialAttendance = attended && attendedCountToday > 0 && attendedCountToday < possibleCountToday
                  const bg = attended ? (isPartialAttendance ? '#8ED1B0' : '#1D9E75') : showAsRed ? '#E24B4A' : 'transparent'
                  const fg = attended || showAsRed ? '#fff' : 'var(--text-secondary)'
                  const pdpItemsToday = allPdpEntries.filter(e => e.date === dateStr)
                  const eventsToday = clubEvents.filter(e => e.event_date === dateStr)
                  return (
                    <div key={i} onClick={() => setDayDetailModal(dateStr)}
                      title={(attended ? 'Attended' : showAsRed ? 'Missed' : (wasTrainingDay && dateStr === todayStr) ? 'Upcoming session — not yet happened' : '')
                        + (classesToday.length ? `\nClass: ${classesToday.map(a => `${a.classes?.name} ${a.classes?.start_time?.slice(0,5)}`).join(', ')}` : '')
                        + (pdpItemsToday.length ? `\nPDP: ${pdpItemsToday.map(e => `${e.item}${e.time ? ` ${e.time}` : ''}`).join(', ')}` : '')
                        + (eventsToday.length ? `\nEvent: ${eventsToday.map(e => `${e.title}${e.event_time ? ` ${e.event_time.slice(0,5)}` : ''}`).join(', ')}` : '')}
                      style={{
                        aspectRatio: '0.85', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        borderRadius: 6, fontSize: 12, background: bg, color: fg, fontFamily: 'var(--font-sans)', cursor: 'pointer',
                        border: !attended && !showAsRed ? '1px solid var(--border)' : 'none', position: 'relative', overflow: 'hidden',
                      }}>
                      <span style={{ position: 'relative', zIndex: 1 }}>{d}</span>
                      {classesToday.map((a, ci) => {
                        const pct = timeToTimelinePercent(a.classes?.start_time?.slice(0, 5))
                        if (pct == null) return null
                        return <div key={ci} style={{ position: 'absolute', left: 2, right: 2, top: `${pct}%`, height: 2, background: '#378ADD', borderRadius: 1 }} />
                      })}
                      {pdpItemsToday.map((e, pi) => {
                        const pct = timeToTimelinePercent(e.time)
                        if (pct == null) return null
                        return <div key={pi} style={{ position: 'absolute', left: 2, right: 2, top: `${pct}%`, height: 2, background: '#8B5CF6', borderRadius: 1 }} />
                      })}
                      {eventsToday.map((e, ei) => {
                        const pct = timeToTimelinePercent(e.event_time?.slice(0, 5)) ?? 2
                        return <div key={ei} style={{ position: 'absolute', left: 2, right: 2, top: `${pct}%`, height: 2, background: '#EF9F27', borderRadius: 1 }} />
                      })}
                    </div>
                  )
                })}
              </div>
              <div style={{ display: 'flex', gap: 14, marginTop: 12, fontSize: 11, color: 'var(--text-secondary)', flexWrap: 'wrap' }}>
                <span><span style={{ display: 'inline-block', width: 8, height: 8, background: '#1D9E75', borderRadius: 2, marginRight: 4 }} />Attended</span>
                <span><span style={{ display: 'inline-block', width: 8, height: 8, background: '#E24B4A', borderRadius: 2, marginRight: 4 }} />Absent</span>
                <span><span style={{ display: 'inline-block', width: 8, height: 2, background: '#378ADD', borderRadius: 2, marginRight: 4 }} />Class time</span>
                <span><span style={{ display: 'inline-block', width: 8, height: 2, background: '#8B5CF6', borderRadius: 2, marginRight: 4 }} />PDP action</span>
                <span><span style={{ display: 'inline-block', width: 8, height: 2, background: '#EF9F27', borderRadius: 2, marginRight: 4 }} />Event</span>
              </div>
            </div>

            {dayDetailModal && (() => {
              const jsDay = new Date(dayDetailModal + 'T12:00:00').getDay()
              const classesForDay = assignedClasses.filter(a => (DAY_TO_JS_DAYS[a.classes?.day_of_week] || []).includes(jsDay))
              return (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 16 }}
                  onClick={() => setDayDetailModal(null)}>
                  <div className="card" style={{ width: '100%', maxWidth: 400 }} onClick={e => e.stopPropagation()}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                      <h2 style={{ fontSize: 15, fontWeight: 600 }}>
                        {new Date(dayDetailModal + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
                      </h2>
                      <button onClick={() => setDayDetailModal(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18 }}>✕</button>
                    </div>
                    {classesForDay.length === 0 ? (
                      <p style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>No sessions scheduled this day.</p>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {classesForDay.map(a => {
                          const classId = a.classes?.id
                          const existing = attendanceData.find(att => att.session_date === dayDetailModal && att.class_id === classId)
                          const reallyAttended = existing?.attendance_type === 'attended' || existing?.attendance_type === 'full_kit'
                          return (
                            <button key={classId} onClick={() => {
                              setSessionNoteModal({ dateStr: dayDetailModal, classId, className: a.classes?.name, attendanceId: existing?.id || null, attendanceType: existing?.attendance_type || null, checkedOutAt: existing?.checked_out_at || null, selfCheckedIn: existing?.self_checked_in || false, attendedAt: existing?.attended_at || null, classInfo: a.classes })
                              setSessionNoteDraft(existing?.note || '')
                              setDayDetailModal(null)
                            }} style={{
                              display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%',
                              padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius)',
                              background: reallyAttended ? '#1D9E7512' : 'var(--bg-secondary)', cursor: 'pointer', fontFamily: 'var(--font-sans)',
                            }}>
                              <span style={{ fontSize: 13, fontWeight: 500 }}>{a.classes?.name} — {a.classes?.start_time?.slice(0, 5)}</span>
                              <span style={{ fontSize: 11, color: reallyAttended ? '#1D9E75' : 'var(--text-tertiary)' }}>
                                {reallyAttended ? '✓ Attended' : existing?.note ? '📝 Note only' : 'Not checked in'}
                              </span>
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )
            })()}

            {sessionNoteModal && (
              <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 16 }}
                onClick={() => setSessionNoteModal(null)}>
                <div className="card" style={{ width: '100%', maxWidth: 400 }} onClick={e => e.stopPropagation()}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                    <h2 style={{ fontSize: 15, fontWeight: 600 }}>
                      {sessionNoteModal.className} — {new Date(sessionNoteModal.dateStr + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                    </h2>
                    <button onClick={() => setSessionNoteModal(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18 }}>✕</button>
                  </div>
                  {sessionNoteModal.attendedAt && (() => {
                    const attRecord = { attended_at: sessionNoteModal.attendedAt, checked_out_at: sessionNoteModal.checkedOutAt, self_checked_in: sessionNoteModal.selfCheckedIn, session_date: sessionNoteModal.dateStr }
                    const checkinTime = getEffectiveCheckin(attRecord, sessionNoteModal.classInfo)
                    const checkoutTime = getEffectiveCheckout(attRecord, sessionNoteModal.classInfo)
                    const hours = getSessionHours(attRecord, sessionNoteModal.classInfo)
                    const autoCheckedOut = !sessionNoteModal.checkedOutAt && checkoutTime
                    return (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 12, padding: '8px 10px', background: 'var(--bg-secondary)', borderRadius: 'var(--radius)', fontSize: 12 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: 'var(--text-secondary)' }}>Checked in</span>
                          <span style={{ fontWeight: 600 }}>{checkinTime?.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                        {checkoutTime && (
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ color: 'var(--text-secondary)' }}>Checked out{autoCheckedOut ? ' (auto)' : ''}</span>
                            <span style={{ fontWeight: 600 }}>{checkoutTime.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span>
                          </div>
                        )}
                        <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 4, borderTop: '1px solid var(--border)' }}>
                          <span style={{ color: 'var(--text-secondary)' }}>{hours != null ? 'Time trained' : 'Status'}</span>
                          <span style={{ fontWeight: 700, color: hours != null ? '#1D9E75' : 'var(--text-tertiary)' }}>
                            {hours != null ? `${hours.toFixed(1)}hrs` : 'Still checked in'}
                          </span>
                        </div>
                      </div>
                    )
                  })()}
                  <label style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 500, display: 'block', marginBottom: 6 }}>
                    Note for this session
                  </label>
                  <textarea rows={4} value={sessionNoteDraft} onChange={e => setSessionNoteDraft(e.target.value)}
                    placeholder="How did this session go?"
                    style={{ resize: 'none', width: '100%', marginBottom: 10 }} />
                  <button className="btn btn-primary btn-sm" style={{ marginBottom: 12 }} onClick={saveSessionNoteForModal} disabled={savingSessionNote || !sessionNoteDraft.trim()}>
                    {savingSessionNote ? 'Saving…' : 'Save note'}
                  </button>
                  <div style={{ display: 'flex', gap: 8, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                    {(() => {
                      const reallyAttended = sessionNoteModal.attendanceType === 'attended' || sessionNoteModal.attendanceType === 'full_kit'
                      const todayStr = new Date().toISOString().split('T')[0]
                      const isToday = sessionNoteModal.dateStr === todayStr
                      if (reallyAttended && sessionNoteModal.selfCheckedIn && !sessionNoteModal.checkedOutAt) {
                        return <button className="btn" style={{ flex: 1, justifyContent: 'center' }} onClick={checkOutForSessionModal}>Check out</button>
                      }
                      if (reallyAttended) {
                        return <span style={{ fontSize: 12, color: 'var(--text-tertiary)', alignSelf: 'center' }}>{sessionNoteModal.checkedOutAt ? 'Checked out' : 'Already marked present'}</span>
                      }
                      // Athletes can only check themselves in for today --
                      // a past session that was missed needs a coach to
                      // sort out, not a retroactive self check-in here.
                      if (!isToday) {
                        return <span style={{ fontSize: 12, color: 'var(--text-tertiary)', alignSelf: 'center' }}>This session has passed — see your coach if attendance needs correcting</span>
                      }
                      return <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={checkInForSessionModal}>✅ Check in</button>
                    })()}
                  </div>
                </div>
              </div>
            )}

            <div className="card" style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <button className="btn btn-sm" onClick={() => setWeekTimetableStart(d => { const n = new Date(d); n.setDate(n.getDate() - 7); return n })}>←</button>
                <span style={{ fontSize: 13, fontWeight: 600 }}>
                  Weekly timetable — {weekDays[0].toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} – {weekDays[6].toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                </span>
                <button className="btn btn-sm" onClick={() => setWeekTimetableStart(d => { const n = new Date(d); n.setDate(n.getDate() + 7); return n })}>→</button>
              </div>
              <div style={{ display: 'flex', overflowX: 'auto' }}>
                <div style={{ flexShrink: 0, width: 34, position: 'relative', height: 320 }}>
                  {hourMarks.map(h => (
                    <div key={h} style={{ position: 'absolute', top: `${timeToTimelinePercent(`${h}:00`)}%`, fontSize: 9, color: 'var(--text-tertiary)', transform: 'translateY(-50%)' }}>
                      {h}:00
                    </div>
                  ))}
                </div>
                {weekDays.map((d, di) => {
                  const dateStr = d.toISOString().split('T')[0]
                  const jsDay = d.getDay()
                  const classesToday = assignedClasses.filter(a => (DAY_TO_JS_DAYS[a.classes?.day_of_week] || []).includes(jsDay))
                  const pdpToday = allPdpEntries.filter(e => e.date === dateStr)
                  const eventsToday = clubEvents.filter(e => e.event_date === dateStr)
                  const isToday = dateStr === todayStr
                  return (
                    <div key={di} style={{ flex: '0 0 90px', borderLeft: '1px solid var(--border)' }}>
                      <div style={{ textAlign: 'center', fontSize: 10, fontWeight: isToday ? 700 : 500, color: isToday ? colour : 'var(--text-secondary)', marginBottom: 4 }}>
                        {d.toLocaleDateString('en-GB', { weekday: 'short' })}<br />{d.getDate()}
                      </div>
                      <div style={{ position: 'relative', height: 320, background: isToday ? colour + '08' : 'transparent', borderRadius: 4 }}>
                        {hourMarks.map(h => (
                          <div key={h} style={{ position: 'absolute', top: `${timeToTimelinePercent(`${h}:00`)}%`, left: 0, right: 0, borderTop: '1px solid var(--border)', opacity: 0.5 }} />
                        ))}
                        {classesToday.map((a, ci) => {
                          const pct = timeToTimelinePercent(a.classes?.start_time?.slice(0, 5))
                          if (pct == null) return null
                          return (
                            <div key={ci} title={`${a.classes?.name} ${a.classes?.start_time?.slice(0,5)}`}
                              onClick={() => { setClassDetailPanel({ classInfo: a.classes, dateStr }); setClassNoteText('') }}
                              style={{ position: 'absolute', left: 2, right: 2, top: `${pct}%`, background: '#378ADD22', border: '1px solid #378ADD', borderRadius: 3, padding: '1px 3px', fontSize: 8, color: '#378ADD', lineHeight: 1.3, zIndex: 1, cursor: 'pointer' }}>
                              {a.classes?.start_time?.slice(0,5)} {a.classes?.name}
                            </div>
                          )
                        })}
                        {pdpToday.map((e, pi) => {
                          const pct = timeToTimelinePercent(e.time)
                          if (pct == null) return null
                          return (
                            <div key={pi} title={`${e.item}${e.time ? ` ${e.time}` : ''}`}
                              style={{ position: 'absolute', left: 2, right: 2, top: `${pct}%`, background: '#8B5CF622', border: '1px solid #8B5CF6', borderRadius: 3, padding: '1px 3px', fontSize: 8, color: '#8B5CF6', lineHeight: 1.3, zIndex: 2 }}>
                              {e.time ? `${e.time} ` : ''}{e.item}
                            </div>
                          )
                        })}
                        {eventsToday.map((e, ei) => {
                          const pct = timeToTimelinePercent(e.event_time?.slice(0, 5)) ?? 1
                          return (
                            <div key={ei} title={`${e.title}${e.event_time ? ` ${e.event_time.slice(0,5)}` : ''}`}
                              style={{ position: 'absolute', left: 2, right: 2, top: `${pct}%`, background: '#EF9F2722', border: '1px solid #EF9F27', borderRadius: 3, padding: '1px 3px', fontSize: 8, color: '#EF9F27', lineHeight: 1.3, zIndex: 3 }}>
                              {e.event_time ? `${e.event_time.slice(0,5)} ` : ''}{e.title}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
              <div style={{ display: 'flex', gap: 14, marginTop: 10, fontSize: 11, color: 'var(--text-secondary)' }}>
                <span><span style={{ display: 'inline-block', width: 8, height: 8, background: '#378ADD22', border: '1px solid #378ADD', borderRadius: 2, marginRight: 4 }} />Class time</span>
                <span><span style={{ display: 'inline-block', width: 8, height: 8, background: '#8B5CF622', border: '1px solid #8B5CF6', borderRadius: 2, marginRight: 4 }} />PDP action</span>
                <span><span style={{ display: 'inline-block', width: 8, height: 8, background: '#EF9F2722', border: '1px solid #EF9F27', borderRadius: 2, marginRight: 4 }} />Event</span>
              </div>
            </div>

            {/* Assigned sessions -- taken from the actual class register (classes table), same data used by Registers/Students pages */}
            <div className="card">
              <h3 style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Assigned sessions</h3>
              {assignedClasses.length === 0 ? (
                <p style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>No classes assigned yet.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {assignedClasses.map(a => (
                    <div key={a.id} style={{ padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: 13 }}>
                      {a.classes?.name} — {a.classes?.day_of_week} {a.classes?.start_time?.slice(0,5)}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )
      })()}

      {classDetailPanel && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}
          onClick={() => setClassDetailPanel(null)}>
          <div className="card" style={{ width: 340, padding: 20 }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <h2 style={{ fontSize: 15, fontWeight: 600 }}>{classDetailPanel.classInfo?.name}</h2>
              <button onClick={() => setClassDetailPanel(null)} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer' }}>✕</button>
            </div>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>
              {new Date(classDetailPanel.dateStr + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })} · {classDetailPanel.classInfo?.start_time?.slice(0,5)}
              {classDetailPanel.classInfo?.end_time ? `–${classDetailPanel.classInfo.end_time.slice(0,5)}` : ''}
            </p>
            {classDetailPanel.classInfo?.instructor && (
              <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>👤 {classDetailPanel.classInfo.instructor}</p>
            )}
            {classDetailPanel.classInfo?.description && (
              <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 14, lineHeight: 1.4 }}>{classDetailPanel.classInfo.description}</p>
            )}
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14, marginTop: classDetailPanel.classInfo?.description ? 0 : 10 }}>
              <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 6 }}>Add a note about this class</label>
              <textarea value={classNoteText} onChange={e => setClassNoteText(e.target.value)} rows={3}
                placeholder="Write a note…"
                style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius)', fontSize: 13, background: 'var(--bg-secondary)', color: 'var(--text)', fontFamily: 'var(--font-sans)', resize: 'vertical', marginBottom: 8 }} />
              <button className="btn btn-primary btn-sm" disabled={!classNoteText.trim() || savingClassNote} onClick={async () => {
                setSavingClassNote(true)
                const header = `${classDetailPanel.classInfo?.name} — ${new Date(classDetailPanel.dateStr + 'T12:00:00').toLocaleDateString('en-GB')}`
                const fullText = `${header}\n${classNoteText.trim()}`
                const { data, error } = await supabase.from('athlete_notes_log')
                  .insert({ student_id: student.id, note_text: fullText, logged_at: new Date().toISOString() })
                  .select().single()
                if (error) { alert('Error saving note: ' + error.message) } else {
                  setMyNotesLog(prev => [data, ...prev])
                  setClassDetailPanel(null)
                }
                setSavingClassNote(false)
              }}>{savingClassNote ? 'Saving…' : 'Save note'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Check-in side drawer -- vertical edge tab always visible,
          slides open to show today's available sessions, check-in/out,
          and (via the existing global weight-check modal) weigh-in/out. ── */}
      {student && (() => {
        const todayJsDay = new Date().getDay()
        const todaysSessions = assignedClasses.filter(a => (DAY_TO_JS_DAYS[a.classes?.day_of_week] || []).includes(todayJsDay) && a.classes?.id)
        return (
          <>
            <button onClick={() => setCheckInDrawerOpen(v => !v)} style={{
              position: 'fixed', left: 0, top: '50%', transform: 'translateY(-50%) rotate(180deg)', writingMode: 'vertical-rl',
              background: activeCheckIn ? '#1D9E75' : '#E24B4A', color: '#fff', border: 'none', borderRadius: '0 8px 8px 0',
              padding: '14px 8px', fontSize: 12, fontWeight: 700, letterSpacing: 1, cursor: 'pointer', zIndex: 90,
              boxShadow: '2px 0 8px rgba(0,0,0,0.15)', fontFamily: 'var(--font-sans)',
            }}>
              {activeCheckIn ? 'CHECKED IN' : 'CHECK IN'}
            </button>

            {checkInDrawerOpen && (
              <div style={{ position: 'fixed', inset: 0, zIndex: 95, display: 'flex', background: 'rgba(0,0,0,0.35)' }} onClick={() => setCheckInDrawerOpen(false)}>
                <div className="card" style={{ width: 300, maxWidth: '85vw', height: '100%', borderRadius: 0, overflowY: 'auto', boxShadow: '4px 0 16px rgba(0,0,0,0.25)' }}
                  onClick={e => e.stopPropagation()}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                    <h2 style={{ fontSize: 16, fontWeight: 700 }}>✅ Check In</h2>
                    <button onClick={() => setCheckInDrawerOpen(false)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--text-tertiary)' }}>×</button>
                  </div>

                  {checkedInMsg && (
                    <div style={{ textAlign: 'center', padding: 10, marginBottom: 14, background: '#1D9E7515', border: '1px solid #1D9E7530', color: '#1D9E75', fontWeight: 600, fontSize: 13, borderRadius: 'var(--radius)' }}>
                      {checkedInMsg}
                    </div>
                  )}

                  {activeCheckIn ? (
                    <div style={{ marginBottom: 16 }}>
                      <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', padding: 12, fontSize: 14, background: '#E24B4A', borderColor: '#E24B4A' }}
                        onClick={checkOutNow} disabled={checkingIn}>
                        🚪 Check out
                      </button>
                      <p style={{ fontSize: 11, color: 'var(--text-tertiary)', textAlign: 'center', marginTop: 6 }}>
                        Checked in {new Date(activeCheckIn.attended_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}{activeCheckIn.attendance_type === 'full_kit' ? ' — Full Kit' : ''}
                      </p>
                    </div>
                  ) : (
                    <>
                      <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>
                        {todaysSessions.length ? "Today's sessions" : 'No sessions scheduled today'}
                      </p>
                      {todaysSessions.length > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
                          {todaysSessions.map(a => (
                            <div key={a.classes.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', background: 'var(--bg-secondary)', borderRadius: 'var(--radius)' }}>
                              <span>
                                <span style={{ display: 'block', fontSize: 13, fontWeight: 600 }}>{a.classes.name}</span>
                                <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{a.classes.start_time?.slice(0, 5)}</span>
                              </span>
                              <button className="btn btn-sm btn-primary" onClick={() => { checkInNow('attended', a.classes.id); setCheckInDrawerOpen(false) }} disabled={checkingIn}>Check in</button>
                            </div>
                          ))}
                        </div>
                      )}
                      <button className="btn" style={{ width: '100%', justifyContent: 'center', padding: 10, fontSize: 13 }}
                        onClick={() => { checkInNow('attended'); setCheckInDrawerOpen(false) }} disabled={checkingIn}>
                        {todaysSessions.length ? 'Check in (other session)' : '✅ Check in'}
                      </button>
                    </>
                  )}

                  <div style={{ borderTop: '1px solid var(--border)', marginTop: 16, paddingTop: 14 }}>
                    <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>⚖️ Weight check</p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <button className="btn btn-sm" style={{ width: '100%', justifyContent: 'center' }}
                        onClick={() => {
                          if (!activeCheckIn) { checkInNow('attended') } else { setShowWeightCheckPrompt('in'); setWeightCheckValue(activeCheckIn.weight_before?.toString() || '') }
                        }}>
                        Weigh in — before
                      </button>
                      <button className="btn btn-sm" style={{ width: '100%', justifyContent: 'center' }} disabled={!activeCheckIn}
                        onClick={() => { setShowWeightCheckPrompt('out'); setWeightCheckValue(activeCheckIn?.weight_after?.toString() || '') }}>
                        Weigh in — after
                      </button>
                      {!activeCheckIn && <p style={{ fontSize: 10, color: 'var(--text-tertiary)', textAlign: 'center', marginTop: 2 }}>Check in first to log a weight after</p>}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )
      })()}

      {showWeightCheckPrompt && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}>
          <div className="card" style={{ width: 320, padding: 20 }}>
            <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>
              {showWeightCheckPrompt === 'in' ? 'Weight check — check in' : 'Weight check — check out'}
            </h2>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 14 }}>
              Enter your weight now, or skip if you'd rather not log it this time.
            </p>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: showWeightCheckPrompt === 'in' ? 10 : 16 }}>
              <input type="number" step="0.1" inputMode="decimal" autoFocus value={weightCheckValue} onChange={e => setWeightCheckValue(e.target.value)}
                placeholder="Weight" style={{ flex: 1 }} />
              <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>kg</span>
            </div>
            {showWeightCheckPrompt === 'in' && (
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, cursor: 'pointer', fontSize: 13 }}>
                <input type="checkbox" checked={fullKitChecked} onChange={e => setFullKitChecked(e.target.checked)} />
                Full kit?
              </label>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn" style={{ flex: 1, justifyContent: 'center', color: 'var(--text-tertiary)' }} onClick={cancelCheckInPrompt} disabled={checkingIn}>
                Cancel
              </button>
              <button className="btn" style={{ flex: 1, justifyContent: 'center' }} onClick={() => submitWeightCheck(true)} disabled={checkingIn}>Skip</button>
              <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={() => submitWeightCheck(false)} disabled={checkingIn}>
                {checkingIn ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── PDP ── */}
      {tab === 'pdp' && (
        <div>
          <button onClick={() => setTab('home')} className="btn btn-sm" style={{ marginBottom: 12 }}>← Back to Home</button>
          {!student ? <p style={{ color: 'var(--text-secondary)' }}>No student record linked.</p> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {PDP_SECTIONS.filter(section => (shared[section.key] || []).length > 0 || section.key === 'winning_ways').map(section => {
                const items = shared[section.key] || []
                const canSchedule = PDP_TIMETABLE_SECTION_KEYS.includes(section.key)
                return (
                  <div key={section.key} className="card" style={{ borderLeft: `3px solid ${section.colour}` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <h3 style={{ fontSize: 13, fontWeight: 600, color: section.colour, margin: 0 }}>{section.label}</h3>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {items.length === 0 && (
                        <p style={{ fontSize: 11, color: 'var(--text-tertiary)', fontStyle: 'italic', margin: 0 }}>Nothing here yet</p>
                      )}
                      {items.map((item, i) => {
                        const existing = timetableEntry(section.key, item)
                        const isActive = athleteTimetableModal?.sectionKey === section.key && athleteTimetableModal?.item === item
                        return (
                          <div key={i} style={{ background: section.colour + '15', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '6px 10px' }}>
                              <span style={{ color: section.colour, fontSize: 12 }}>{item}</span>
                              {canSchedule && (
                                existing?.days?.length ? (
                                  <button onClick={() => setAthleteTimetableModal(isActive ? null : { sectionKey: section.key, item })}
                                    style={{ fontSize: 10, background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', fontWeight: 600, flexShrink: 0, textAlign: 'right', fontFamily: 'var(--font-sans)' }}>
                                    📅 {existing.days.map(d => d.slice(0, 3)).join('/')}{existing.time ? ` ${existing.time}` : ''}
                                    {formatScheduleMetric(existing.metric) && <><br />{formatScheduleMetric(existing.metric)}</>}
                                  </button>
                                ) : (
                                  <button onClick={() => setAthleteTimetableModal(isActive ? null : { sectionKey: section.key, item })}
                                    style={{ fontSize: 10, background: 'none', border: 'none', color: section.colour, cursor: 'pointer', fontWeight: 600, flexShrink: 0, fontFamily: 'var(--font-sans)' }}>
                                    📅 Add to calendar
                                  </button>
                                )
                              )}
                            </div>
                            {canSchedule && (
                              <div style={{ overflow: 'hidden', transition: 'max-height 0.3s ease, opacity 0.2s ease', maxHeight: isActive ? 500 : 0, opacity: isActive ? 1 : 0 }}>
                                <div style={{ padding: '4px 10px 12px' }}>
                                  {ScheduleWizardPanel()}
                                </div>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}

              {/* Weekly Timetable -- shows every item scheduled via the
                  "Add to calendar" wizard above, grouped by the day(s)
                  of the week it repeats on, across every PDP section. */}
              <div className="card">
                <h3 style={{ fontSize: 13, fontWeight: 600, margin: '0 0 10px' }}>📅 Weekly Timetable</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 }}>
                  {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map(day => {
                    const items = getScheduledItemsForDay(day)
                    return (
                      <div key={day} style={{ background: 'var(--bg-secondary)', borderRadius: 'var(--radius)', padding: '8px 4px', minHeight: 60 }}>
                        <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 5, textAlign: 'center' }}>{day.slice(0, 3)}</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                          {items.map((it, i) => (
                            <div key={i} style={{ fontSize: 9, background: it.colour + '15', borderRadius: 6, padding: '3px 4px', color: it.colour, border: `1px solid ${it.colour}30`, lineHeight: 1.3, textDecoration: it.completed ? 'line-through' : 'none' }}>
                              {it.time && <span style={{ fontWeight: 700 }}>{it.time} </span>}{it.text}
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Ready -- athlete's own competition-prep notes, written
                  by the athlete (coach can also view/edit from their
                  side), separate from the coach-authored PDP sections
                  above which are read-only for the athlete. */}
              <div className="card" style={{ borderLeft: '3px solid #E24B4A' }}>
                <h3 style={{ fontSize: 13, fontWeight: 600, color: '#E24B4A', margin: '0 0 10px' }}>🥊 Ready</h3>
                {[
                  { key: 'dayBefore', label: 'Day before', placeholder: 'e.g. early night, kit packed, weigh-in plan…' },
                  { key: 'morningPrep', label: 'Morning prep', placeholder: 'e.g. food, water, electrolytes…' },
                  { key: 'warmUpRoutine', label: 'Warm up routine', placeholder: 'e.g. your usual warm-up sequence…' },
                ].map(f => (
                  <div key={f.key} className="field" style={{ marginBottom: 10 }}>
                    <label>{f.label}</label>
                    <textarea defaultValue={apData?.pdp_notes?.ready?.[f.key] || ''} placeholder={f.placeholder}
                      onBlur={e => saveAthletePdpReadyField(f.key, e.target.value)}
                      rows={2} style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius)', fontSize: 13, background: 'var(--bg-secondary)', color: 'var(--text)', fontFamily: 'var(--font-sans)', resize: 'vertical' }} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Media ── */}
      {/* ── Sweep the Sheds -- athlete's own assigned tasks ── */}
      {tab === 'sweep' && (
        <div>
          <button onClick={() => setTab('home')} className="btn btn-sm" style={{ marginBottom: 12 }}>← Back to Home</button>
          <div className="card" style={{ borderLeft: '3px solid #1D9E75', borderRadius: '0 var(--border-radius-lg) var(--border-radius-lg) 0' }}>
            <h3 style={{ fontSize: 15, fontWeight: 600, color: '#1D9E75', marginBottom: 12 }}>🧹 Sweep the Sheds</h3>
            {shedTasks.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>No tasks assigned right now.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {shedTasks.map(t => (
                  <label key={t.id} style={{
                    display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px',
                    borderRadius: 'var(--radius)', background: t.completed ? '#1D9E7512' : 'var(--bg-secondary)',
                    border: '1px solid var(--border)', cursor: 'pointer',
                  }}>
                    <input type="checkbox" checked={t.completed} onChange={e => toggleShedTask(t.id, e.target.checked)} style={{ marginTop: 2 }} />
                    <span style={{ flex: 1 }}>
                      <span style={{ fontSize: 14, textDecoration: t.completed ? 'line-through' : 'none', color: t.completed ? 'var(--text-tertiary)' : 'var(--text)' }}>
                        {t.task_text}
                      </span>
                      <span style={{ display: 'block', fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>
                        Assigned {new Date(t.assigned_at).toLocaleDateString('en-GB')}
                        {t.completed && t.completed_at ? ` · Done ${new Date(t.completed_at).toLocaleDateString('en-GB')}` : ''}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Analysis ── */}

      {/* ── Leagues -- choose House League or Exercise Leagues ── */}
      {tab === 'leagues' && (
        <div>
          <button onClick={() => setTab('home')} className="btn btn-sm" style={{ marginBottom: 12 }}>← Back to Home</button>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <a href="/league-public?limit=10" className="card" style={{ textDecoration: 'none', textAlign: 'center', padding: 24, color: '#8B5CF6' }}>
              <div style={{ fontSize: 36, marginBottom: 8 }}>🏠</div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>House League</div>
              <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 4 }}>Points standings by house</div>
            </a>
            <a href="/results-public" className="card" style={{ textDecoration: 'none', textAlign: 'center', padding: 24, color: '#EF9F27' }}>
              <div style={{ fontSize: 36, marginBottom: 8 }}>🏋️</div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>Exercise Leagues</div>
              <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 4 }}>Fitness results leaderboard</div>
            </a>
          </div>
        </div>
      )}

      {/* ── Opponents (moved out from being an inline card on Home) ── */}
      {tab === 'opponents' && (
        <div>
          <button onClick={() => setTab('home')} className="btn btn-sm" style={{ marginBottom: 12 }}>← Back to Home</button>
          <div className="card" style={{ borderLeft: '3px solid #E24B4A', borderRadius: '0 var(--border-radius-lg) var(--border-radius-lg) 0' }}>
            <h3 style={{ fontSize: 13, fontWeight: 600, color: '#E24B4A', marginBottom: 10 }}>🥊 Opponents</h3>
            {(() => {
              const opponentNames = [...new Set(opponentNotes.map(n => n.opponent_name))].sort()
              if (!opponentNames.length) return <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 10 }}>No opponent notes yet.</p>
              return opponentNames.map(name => {
                const notes = opponentNotes.filter(n => n.opponent_name === name && (n.author_role === 'athlete' || n.is_shared))
                if (!notes.length) return null
                return (
                  <div key={name} style={{ marginBottom: 10 }}>
                    <p style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>{name}</p>
                    {notes.map(n => (
                      <div key={n.id} style={{ padding: '5px 0', borderTop: '1px solid var(--border)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: 10, fontWeight: 600, color: n.author_role === 'coach' ? '#666' : '#185FA5' }}>
                            {n.author_role === 'coach' ? '🧑‍🏫 Coach' : '🥋 You'} · {new Date(n.created_at).toLocaleDateString('en-GB')}
                          </span>
                          {n.author_role === 'athlete' && (
                            <button onClick={() => { setEditingOpponentNoteId(n.id); setOpponentNoteDraft(n.note_text) }} style={{ fontSize: 10, background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer' }}>✎ Edit</button>
                          )}
                        </div>
                        {editingOpponentNoteId === n.id ? (
                          <div style={{ marginTop: 4 }}>
                            <textarea value={opponentNoteDraft} onChange={e => setOpponentNoteDraft(e.target.value)}
                              rows={3} style={{ width: '100%', fontSize: 12, resize: 'vertical', marginBottom: 4 }} />
                            <div style={{ display: 'flex', gap: 6 }}>
                              <button className="btn btn-sm" style={{ fontSize: 10, padding: '2px 8px' }} onClick={() => updateOwnOpponentNote(n.id, opponentNoteDraft)}>Save</button>
                              <button className="btn btn-sm" style={{ fontSize: 10, padding: '2px 8px' }} onClick={() => setEditingOpponentNoteId(null)}>Cancel</button>
                            </div>
                          </div>
                        ) : (
                          <p style={{ fontSize: 12, margin: '2px 0 0', whiteSpace: 'pre-line' }}>{n.note_text}</p>
                        )}
                      </div>
                    ))}
                  </div>
                )
              })
            })()}
            <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
              <p style={{ fontSize: 11, fontWeight: 600, marginBottom: 6 }}>+ Add a note</p>
              <input value={newOpponentName} onChange={e => setNewOpponentName(e.target.value)} placeholder="Opponent name"
                style={{ width: '100%', fontSize: 12, marginBottom: 6 }} />
              <OpponentQuickNoteForm onSave={text => { addOwnOpponentNote(newOpponentName, text); setNewOpponentName('') }} disabled={!newOpponentName.trim()} />
            </div>
          </div>
        </div>
      )}

      {tab === 'media' && (
        <div>
          <button onClick={() => setTab('home')} className="btn btn-sm" style={{ marginBottom: 12 }}>← Back to Home</button>
          <div className="card" style={{ marginBottom: 12 }}>
            <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Media files</h2>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 14 }}>Upload your own photos, videos, and documents here.</p>
            <div style={{ border: '2px dashed var(--border-strong)', borderRadius: 'var(--radius)', padding: '28px 20px', textAlign: 'center', color: 'var(--text-secondary)', marginBottom: 12 }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>📁</div>
              <p style={{ fontSize: 13, marginBottom: 8 }}>Tap to upload</p>
              <p style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Photos, videos, PDFs — max 50MB per file</p>
              <input type="file" multiple accept="image/*,video/*,.pdf" style={{ display: 'none' }} id="my-file-upload"
                onChange={async e => {
                  if (!student) return
                  const files = Array.from(e.target.files)
                  for (const file of files) {
                    const path = `athletes/${student.id}/${Date.now()}-${file.name}`
                    const { error } = await supabase.storage.from('athlete-media').upload(path, file)
                    if (!error) {
                      const { data: urlData } = supabase.storage.from('athlete-media').getPublicUrl(path)
                      const existing = apData?.media_files || []
                      const updated = [...existing, { name: file.name, url: urlData.publicUrl, type: file.type, uploaded_at: new Date().toISOString() }]
                      await supabase.from('athlete_profiles').upsert({ student_id: student.id, media_files: updated }, { onConflict: 'student_id' })
                      setApData(p => ({ ...(p || {}), media_files: updated }))
                    }
                  }
                }} />
              <label htmlFor="my-file-upload" className="btn btn-primary" style={{ display: 'inline-flex', marginTop: 10, cursor: 'pointer' }}>Choose files</label>
            </div>
            {apData?.media_files?.length > 0 ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 8 }}>
                {apData.media_files.map((f, i) => (
                  <div key={i} style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden', background: 'var(--bg-secondary)' }}>
                    {f.type?.startsWith('image') ? (
                      <img src={f.url} alt={f.name} style={{ width: '100%', height: 80, objectFit: 'cover', display: 'block' }} />
                    ) : (
                      <div style={{ height: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28 }}>
                        {f.type?.includes('video') ? '🎥' : '📄'}
                      </div>
                    )}
                    <div style={{ padding: '6px 8px' }}>
                      <div style={{ fontSize: 10, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</div>
                      <a href={f.url} target="_blank" rel="noreferrer" style={{ fontSize: 10, color: '#185fa5' }}>View</a>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ fontSize: 13, color: 'var(--text-tertiary)', textAlign: 'center', padding: '16px 0' }}>No media files yet</p>
            )}
          </div>
        </div>
      )}

      {/* ── Notes ── */}
      {tab === 'notes' && (
        <div>
          <button onClick={() => setTab('home')} className="btn btn-sm" style={{ marginBottom: 12 }}>← Back to Home</button>
          <div className="card" style={{ marginBottom: 12 }}>
            <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>Log a note</h2>
            <textarea value={newNoteText} onChange={e => setNewNoteText(e.target.value)}
              onFocus={() => setShowFullscreenNoteComposer(true)} onClick={() => setShowFullscreenNoteComposer(true)}
              placeholder="Write a note for yourself…" rows={3} readOnly
              style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius)', fontSize: 13, background: 'var(--bg-secondary)', color: 'var(--text)', fontFamily: 'var(--font-sans)', resize: 'vertical', marginBottom: 8, cursor: 'pointer' }} />
          </div>
          {myNotesLog.length === 0 ? (
            <div className="empty-state"><h3>No notes yet</h3></div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {myNotesLog.map(note => {
                const match = detectNoteCategory(note.note_text)
                return (
                <div key={note.id} className="card" onClick={() => { setOpenNoteId(note.id); setOpenNoteDraft(note.note_text) }} style={{ cursor: 'pointer' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 4 }}>
                        {new Date(note.logged_at).toLocaleDateString('en-GB')} · {new Date(note.logged_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                      </div>
                      <p style={{ fontSize: 13, lineHeight: 1.5, margin: 0, whiteSpace: 'pre-line' }}>{note.note_text}</p>
                    </div>
                    <button onClick={e => { e.stopPropagation(); deleteNote(note.id) }} title="Delete note"
                      style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: 16, flexShrink: 0 }}>×</button>
                  </div>
                  {match && (
                    <div onClick={e => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
                      <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                        💡 Looks like a {match.label} entry
                      </span>
                      <button className="btn btn-sm" style={{ flexShrink: 0 }}
                        onClick={() => sendNoteToCategory(match, note.note_text)}>
                        Send to {match.label}
                      </button>
                    </div>
                  )}
                </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {showFullscreenNoteComposer && (
        <div style={{ position: 'fixed', inset: 0, background: 'var(--bg)', zIndex: 200, display: 'flex', flexDirection: 'column', padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <button onClick={() => setShowFullscreenNoteComposer(false)} className="btn btn-sm">← Back</button>
            <h2 style={{ fontSize: 15, fontWeight: 600 }}>Write a note</h2>
          </div>
          <textarea autoFocus value={newNoteText} onChange={e => setNewNoteText(e.target.value)}
            placeholder="Write a note for yourself…"
            style={{ flex: 1, width: '100%', padding: 14, border: '1px solid var(--border-strong)', borderRadius: 'var(--radius)', fontSize: 15, background: 'var(--bg-secondary)', color: 'var(--text)', fontFamily: 'var(--font-sans)', resize: 'none', marginBottom: 14 }} />
          <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} disabled={!newNoteText.trim() || savingNote}
            onClick={async () => { await addNote(); setShowFullscreenNoteComposer(false) }}>
            {savingNote ? 'Saving…' : '+ Log note'}
          </button>
        </div>
      )}

      {openNoteId && (() => {
        const note = myNotesLog.find(n => n.id === openNoteId)
        if (!note) return null
        return (
          <div style={{ position: 'fixed', inset: 0, background: 'var(--bg)', zIndex: 200, display: 'flex', flexDirection: 'column', padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <button onClick={() => setOpenNoteId(null)} className="btn btn-sm">← Back</button>
              <h2 style={{ fontSize: 15, fontWeight: 600 }}>{new Date(note.logged_at).toLocaleDateString('en-GB')}</h2>
            </div>
            <textarea autoFocus value={openNoteDraft} onChange={e => setOpenNoteDraft(e.target.value)}
              style={{ flex: 1, width: '100%', padding: 14, border: '1px solid var(--border-strong)', borderRadius: 'var(--radius)', fontSize: 15, background: 'var(--bg-secondary)', color: 'var(--text)', fontFamily: 'var(--font-sans)', resize: 'none', marginBottom: 14 }} />
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn" style={{ flex: 1, justifyContent: 'center' }} onClick={() => setOpenNoteId(null)}>Cancel</button>
              <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} disabled={!openNoteDraft.trim() || savingNote}
                onClick={() => updateNote(note.id, openNoteDraft)}>
                {savingNote ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        )
      })()}

      {/* ── TTP (read-only summary — dedicated form will be integrated better later) ── */}
      {tab === 'tpt' && (
        <div>
          <button onClick={() => setTab('home')} className="btn btn-sm" style={{ marginBottom: 12 }}>← Back to Home</button>
          {tptData.kickboxing.length === 0 && tptData.boxing.length === 0 ? (
            <div className="empty-state"><h3>No TTP assessments yet</h3><p>Your coach will log these after each assessment</p></div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {tptData.kickboxing[0] && (
                <div className="card">
                  <h3 style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>🥋 Kickboxing — {new Date(tptData.kickboxing[0].assessed_at).toLocaleDateString('en-GB')}</h3>
                  <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    {tptData.kickboxing[0].weight_kg != null && `Weight: ${tptData.kickboxing[0].weight_kg}kg`}
                  </p>
                </div>
              )}
              {tptData.boxing[0] && (
                <div className="card">
                  <h3 style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>🥊 Boxing — {new Date(tptData.boxing[0].assessed_at).toLocaleDateString('en-GB')}</h3>
                  <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Assessment logged</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Whoop ── */}
      {tab === 'whoop' && (
        <div>
          <button onClick={() => setTab('home')} className="btn btn-sm" style={{ marginBottom: 12 }}>← Back to Home</button>
          {!whoopConnection ? (
            <div className="card" style={{ textAlign: 'center', padding: 24 }}>
              <div style={{ fontSize: 40, marginBottom: 10 }}>⌚</div>
              <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>Connect your Whoop</h3>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
                Link your Whoop account to bring your workout summaries (strain, heart rate, calories) into your profile.
                Data appears here shortly after each workout ends — not live during the session.
              </p>
              <button className="btn btn-primary" onClick={() => {
                const clientId = import.meta.env.VITE_WHOOP_CLIENT_ID
                const redirectUri = import.meta.env.VITE_WHOOP_REDIRECT_URI
                const scope = 'read:workout read:profile offline'
                const authUrl = `https://api.prod.whoop.com/oauth/oauth2/auth?response_type=code&client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scope)}&state=${student.id}`
                window.location.href = authUrl
              }}>Connect Whoop →</button>
            </div>
          ) : (
            <>
              <div className="card" style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#1D9E75' }}>✓ Whoop connected</span>
                <button className="btn btn-sm" onClick={async () => {
                  if (!confirm('Disconnect Whoop? Past session summaries will stay, but new ones will stop coming in.')) return
                  await supabase.from('whoop_connections').delete().eq('student_id', student.id)
                  setWhoopConnection(null)
                }}>Disconnect</button>
              </div>
              {whoopSessions.length === 0 ? (
                <div className="empty-state"><h3>No Whoop sessions yet</h3><p>Summaries appear here shortly after each completed workout</p></div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {whoopSessions.map(s => (
                    <div key={s.id} className="card">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <h3 style={{ fontSize: 13, fontWeight: 600 }}>{s.sport_name || 'Workout'}</h3>
                        <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{s.start_time ? new Date(s.start_time).toLocaleDateString('en-GB') : '—'}</span>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, textAlign: 'center' }}>
                        <div>
                          <div style={{ fontSize: 16, fontWeight: 700, color: '#1D9E75' }}>{s.strain != null ? s.strain.toFixed(1) : '—'}</div>
                          <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>Strain</div>
                        </div>
                        <div>
                          <div style={{ fontSize: 16, fontWeight: 700 }}>{s.avg_heart_rate ?? '—'}</div>
                          <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>Avg HR</div>
                        </div>
                        <div>
                          <div style={{ fontSize: 16, fontWeight: 700 }}>{s.max_heart_rate ?? '—'}</div>
                          <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>Max HR</div>
                        </div>
                        <div>
                          <div style={{ fontSize: 16, fontWeight: 700 }}>{s.calories != null ? Math.round(s.calories) : '—'}</div>
                          <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>Calories</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Reports ── */}
      {tab === 'reports' && (
        <div>
          <button onClick={() => setTab('home')} className="btn btn-sm" style={{ marginBottom: 12 }}>← Back to Home</button>
          {myReports.length === 0 ? (
            <div className="empty-state"><h3>No reports yet</h3><p>Reports your coach sends will appear here</p></div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {myReports.map(r => {
                const d = r.report_data
                const expanded = expandedReportId === r.id
                return (
                  <div key={r.id} className="card" style={{ cursor: 'pointer' }} onClick={() => setExpandedReportId(expanded ? null : r.id)}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 600 }}>
                          {new Date(r.date_from).toLocaleDateString('en-GB')} – {new Date(r.date_to).toLocaleDateString('en-GB')}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Sent {new Date(r.sent_at).toLocaleDateString('en-GB')}</div>
                      </div>
                      <span style={{ fontSize: 12, color: colour }}>{expanded ? '▲ Hide' : '▼ View'}</span>
                    </div>
                    {expanded && (
                      <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 8, marginBottom: 12 }}>
                          {[
                            { label: 'Total points', value: d.points?.total ?? 0, colour: colour },
                            { label: 'Class champ', value: `🏆 ${d.points?.champ ?? 0}x`, colour: '#EF9F27' },
                            { label: 'Sessions', value: d.sessions?.length ?? 0, colour: '#378ADD' },
                            { label: 'Weight change', value: d.weightChange ? `${d.weightChange > 0 ? '+' : ''}${d.weightChange}kg` : '—', colour: '#1D9E75' },
                          ].map(stat => (
                            <div key={stat.label} style={{ padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
                              <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{stat.label}</div>
                              <div style={{ fontSize: 16, fontWeight: 700, color: stat.colour }}>{stat.value}</div>
                            </div>
                          ))}
                        </div>
                        {d.points?.log?.length > 0 && (
                          <div style={{ marginBottom: 12 }}>
                            <p style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Points log ({d.points.log.length} entries)</p>
                            {d.points.log.slice(0, 10).map((p, i) => (
                              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '3px 0', borderBottom: '1px solid var(--border)' }}>
                                <span>{p.point_type}</span>
                                <span style={{ color: 'var(--text-tertiary)' }}>+{p.points_awarded} · {new Date(p.awarded_at).toLocaleDateString('en-GB')}</span>
                              </div>
                            ))}
                          </div>
                        )}
                        {(d.tptBox?.[0] || d.tptKb?.[0]) && (
                          <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>TTP assessments are included in this report's underlying data — view your TTP tab on the admin profile page for the full breakdown.</p>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Analysis ── */}
      {/* ── Fit II Fight ── */}
      {tab === 'fit2fight' && (
        <div>
          <button onClick={() => setTab('home')} className="btn btn-sm" style={{ marginBottom: 12 }}>← Back to Home</button>
          <div style={{ marginBottom: 14 }}>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{sessions.length} sessions</p>
          </div>

          {student && (() => {
            const fromStr = radarDateFrom < SOFT_LAUNCH_DATE ? SOFT_LAUNCH_DATE : radarDateFrom, toStr = radarDateTo

            // Attendance % -- a clean, straightforward version (does not
            // replicate the exact-key/holiday-fallback logic the main
            // Attendance card uses, so this number may differ slightly
            // from that card if class changes/holidays are involved).
            const scheduledDaysInRange = new Set()
            assignedClasses.forEach(a => {
              const jsDays = DAY_TO_JS_DAYS[a.classes?.day_of_week] || []
              if (!jsDays.length) return
              const cursor = new Date(fromStr + 'T00:00:00')
              const end = new Date(toStr + 'T00:00:00')
              while (cursor <= end) {
                if (jsDays.includes(cursor.getDay()) && !isDateOnHoliday(cursor.toISOString().split('T')[0], holidays, [a.classes?.id], student.id)) {
                  scheduledDaysInRange.add(cursor.toISOString().split('T')[0])
                }
                cursor.setDate(cursor.getDate() + 1)
              }
            })
            const attendedDaysInRange = new Set(
              attendanceData.filter(a => a.session_date >= fromStr && a.session_date <= toStr && a.attendance_type !== 'absent' && a.attendance_type !== 'excused').map(a => a.session_date)
            )
            const attendancePct = scheduledDaysInRange.size ? Math.round((attendedDaysInRange.size / scheduledDaysInRange.size) * 100) : null

            // F2F Results % -- combines every section-level and question-level
            // target set for this athlete (reusing the exact same logic that
            // powers the "X/Y" badges shown on each section elsewhere).
            let f2fDone = 0, f2fTarget = 0
            ;['physical', 'technique', 'tactical', 'mentality', 'wellbeing', 'test'].forEach(sectionKey => {
              const p = getSectionProgress(sectionKey)
              if (p) { f2fDone += p.done; f2fTarget += p.target }
            })
            const f2fPct = f2fTarget > 0 ? Math.round((f2fDone / f2fTarget) * 100) : null

            // PDP % -- uses the genuine "completed" flag on each scheduled
            // timetable item (coaches tick items off in the Weekly Timetable).
            const pdpEntriesInRange = PDP_TIMETABLE_SECTION_KEYS.flatMap(sectionKey =>
              Object.values((apData?.pdp_notes || {})[`__timetable_${sectionKey}`] || {})
            ).filter(e => e?.date >= fromStr && e?.date <= toStr)
            const pdpCompleted = pdpEntriesInRange.filter(e => e.completed)
            const pdpPct = pdpEntriesInRange.length ? Math.round((pdpCompleted.length / pdpEntriesInRange.length) * 100) : null

            // TTP % -- athlete's latest assessment vs the coach-set team
            // benchmark. Boxing (KRBA) and kickboxing (KR) each have their
            // own benchmark and field set, with direction-aware ratios
            // (some kickboxing fields like run times are "lower is
            // better", so those get an inverted ratio rather than being
            // averaged the wrong way round).
            let ttpPct = null
            if (student.discipline === 'KRBA' && ttpBenchmark) {
              const latest = tptData.boxing?.[0]
              if (latest) {
                const ratios = TTP_BENCHMARK_FIELDS
                  .filter(f => latest[f] != null && ttpBenchmark[f] != null && ttpBenchmark[f] > 0)
                  .map(f => latest[f] / ttpBenchmark[f])
                if (ratios.length) ttpPct = Math.round((ratios.reduce((a, b) => a + b, 0) / ratios.length) * 100)
              }
            } else if (student.is_kr && ttpBenchmarkKB) {
              const latest = tptData.kickboxing?.[0]
              if (latest) {
                const ratios = KB_TTP_FIELDS
                  .filter(f => latest[f] != null && ttpBenchmarkKB[f] != null && ttpBenchmarkKB[f] > 0 && latest[f] > 0)
                  .map(f => KB_LOWER_IS_BETTER.includes(f) ? ttpBenchmarkKB[f] / latest[f] : latest[f] / ttpBenchmarkKB[f])
                if (ratios.length) ttpPct = Math.round((ratios.reduce((a, b) => a + b, 0) / ratios.length) * 100)
              }
            }

            const axes = [
              { label: 'Attendance', value: attendancePct, colour: '#378ADD' },
              { label: 'F2F Results', value: f2fPct, colour: '#EF9F27' },
              { label: 'PDP', value: pdpPct, colour: '#1D9E75' },
              ...(student.discipline === 'KRBA' || student.is_kr ? [{ label: 'TTP', value: ttpPct, colour: '#E24B4A' }] : []),
            ]

            // Breakdown data for each axis, shown when that axis is clicked.
            const SECTION_LABELS = { physical: 'Physical', technique: 'Technique', tactical: 'Tactical', mentality: 'Mentality', wellbeing: 'Foundation', test: 'Test' }
            const f2fBreakdown = ['physical', 'technique', 'tactical', 'mentality', 'wellbeing', 'test'].map(sectionKey => {
              const p = getSectionProgress(sectionKey)
              return { key: sectionKey, label: SECTION_LABELS[sectionKey], done: p?.done || 0, target: p?.target || 0, pct: p?.target ? Math.round((p.done / p.target) * 100) : null }
            }).filter(s => s.target > 0)

            const attendanceBreakdown = [...scheduledDaysInRange].sort().map(d => ({ date: d, attended: attendedDaysInRange.has(d) }))

            let ttpBreakdown = []
            if (student.discipline === 'KRBA' && ttpBenchmark && tptData.boxing?.[0]) {
              const latest = tptData.boxing[0]
              ttpBreakdown = TTP_BENCHMARK_FIELDS
                .filter(f => latest[f] != null && ttpBenchmark[f] != null && ttpBenchmark[f] > 0)
                .map(f => ({ key: f, label: f.replace(/_/g, ' '), value: latest[f], target: ttpBenchmark[f], pct: Math.round((latest[f] / ttpBenchmark[f]) * 100) }))
                .sort((a, b) => a.pct - b.pct)
            } else if (student.is_kr && ttpBenchmarkKB && tptData.kickboxing?.[0]) {
              const latest = tptData.kickboxing[0]
              ttpBreakdown = KB_TTP_FIELDS
                .filter(f => latest[f] != null && ttpBenchmarkKB[f] != null && ttpBenchmarkKB[f] > 0 && latest[f] > 0)
                .map(f => ({
                  key: f, label: f.replace(/_/g, ' '), value: latest[f], target: ttpBenchmarkKB[f],
                  pct: Math.round((KB_LOWER_IS_BETTER.includes(f) ? ttpBenchmarkKB[f] / latest[f] : latest[f] / ttpBenchmarkKB[f]) * 100),
                }))
                .sort((a, b) => a.pct - b.pct)
            }

            return (
              <div className="card" style={{ marginBottom: 14 }}>
                <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>🕸️ Performance Overview</h2>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
                  <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>From</label>
                  <input type="date" value={radarDateFrom} min={SOFT_LAUNCH_DATE} onChange={e => setRadarDateFrom(e.target.value < SOFT_LAUNCH_DATE ? SOFT_LAUNCH_DATE : e.target.value)} style={{ fontSize: 12 }} />
                  <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>To</label>
                  <input type="date" value={radarDateTo} onChange={e => setRadarDateTo(e.target.value)} style={{ fontSize: 12 }} />
                </div>
                <RadarChart axes={axes} onAxisClick={label => setRadarDrilldown(d => d === label ? null : label)} activeLabel={radarDrilldown} />
                <p style={{ fontSize: 11, color: 'var(--text-tertiary)', textAlign: 'center', marginTop: -4, marginBottom: 8 }}>Tap an axis label to see the numbers behind it</p>

                {radarDrilldown === 'Attendance' && (
                  <div style={{ marginTop: 8, marginBottom: 8 }}>
                    <p style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Attendance — {attendedDaysInRange.size} of {scheduledDaysInRange.size} sessions</p>
                    {attendanceBreakdown.length === 0 ? (
                      <p style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>No scheduled sessions in this range.</p>
                    ) : (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {attendanceBreakdown.map(d => (
                          <span key={d.date} title={new Date(d.date + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}
                            style={{ fontSize: 11, padding: '4px 8px', borderRadius: 12, background: d.attended ? '#1D9E7520' : '#E24B4A20', color: d.attended ? '#1D9E75' : '#E24B4A', fontWeight: 600 }}>
                            {new Date(d.date + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} {d.attended ? '✓' : '✕'}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {radarDrilldown === 'F2F Results' && (
                  <div style={{ marginTop: 8, marginBottom: 8 }}>
                    <p style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>F2F Results by section</p>
                    {f2fBreakdown.length === 0 ? (
                      <p style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>No targets set in any section yet.</p>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {f2fBreakdown.map(s => (
                          <div key={s.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, padding: '6px 10px', background: 'var(--bg-secondary)', borderRadius: 'var(--radius)' }}>
                            <span>{s.label}</span>
                            <span style={{ fontWeight: 600, color: '#EF9F27' }}>{s.done}/{s.target} ({s.pct}%)</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {radarDrilldown === 'PDP' && (
                  <div style={{ marginTop: 8, marginBottom: 8 }}>
                    <p style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>PDP timetable items in this range</p>
                    {pdpEntriesInRange.length === 0 ? (
                      <p style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>No PDP timetable items scheduled in this range.</p>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {[...pdpEntriesInRange].sort((a, b) => a.date.localeCompare(b.date)).map((e, i) => (
                          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, padding: '6px 10px', background: e.completed ? '#1D9E7512' : 'var(--bg-secondary)', borderRadius: 'var(--radius)' }}>
                            <span style={{ textDecoration: e.completed ? 'line-through' : 'none', color: e.completed ? 'var(--text-tertiary)' : 'var(--text)' }}>
                              {new Date(e.date + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} — {e.item}
                            </span>
                            <span style={{ fontWeight: 600, color: e.completed ? '#1D9E75' : 'var(--text-tertiary)' }}>{e.completed ? '✓ Done' : 'Not done'}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {radarDrilldown === 'TTP' && (
                  <div style={{ marginTop: 8, marginBottom: 8 }}>
                    <p style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>TTP by field vs benchmark</p>
                    {ttpBreakdown.length === 0 ? (
                      <div>
                        <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 8 }}>No TTP data yet.</p>
                        <a href={`/${student.is_kr ? 'kickboxing' : 'boxing'}-tpt`} className="btn btn-sm btn-primary">
                          📋 Complete TTP form
                        </a>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 260, overflowY: 'auto' }}>
                        {ttpBreakdown.map(f => (
                          <div key={f.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, padding: '6px 10px', background: 'var(--bg-secondary)', borderRadius: 'var(--radius)', textTransform: 'capitalize' }}>
                            <span>{f.label}</span>
                            <span style={{ fontWeight: 600, color: f.pct >= 100 ? '#1D9E75' : '#E24B4A' }}>{f.value} / {f.target} ({f.pct}%)</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <details style={{ marginTop: 12 }}>
                  <summary style={{ fontSize: 12, fontWeight: 600, cursor: 'pointer', color: 'var(--text-secondary)' }}>How each axis is worked out</summary>
                  <ul style={{ fontSize: 12, color: 'var(--text-secondary)', paddingLeft: 18, lineHeight: 1.6, marginTop: 8 }}>
                    <li><strong>Attendance</strong>: sessions attended ÷ sessions scheduled in this date range{attendancePct == null && ' — no scheduled classes found in this range'}.</li>
                    <li><strong>F2F Results</strong>: combined progress across every target set for you (all sections), same as the badges shown on each section{f2fPct == null && ' — no targets set yet'}.</li>
                    <li><strong>PDP</strong>: % of your scheduled PDP timetable items your coach has ticked off as done{pdpPct == null && ' — no PDP timetable items in this range'}.</li>
                    <li><strong>TTP</strong>: your latest assessment vs the coach-set team benchmark{!ttpBenchmark && !ttpBenchmarkKB ? ' — no benchmark has been set yet for your discipline' : ttpPct == null ? ' — no benchmark set yet for your discipline, or no TTP assessment logged' : ''}.</li>
                  </ul>
                </details>
              </div>
            )
          })()}

          {sessions.length === 0 ? (
            <div className="empty-state"><h3>No sessions yet</h3></div>
          ) : (
            <>
              {(() => {
                const sorted = [...sessions].sort((a,b) => new Date(a.session_date) - new Date(b.session_date))
                // Which specific metric each graph section corresponds
                // to, so the results list below always matches whichever
                // graph is currently displayed -- same order as the
                // GRAPH_SECTIONS list further down.
                const GRAPH_SECTION_KEYS = ['all', 'weight', 'watt_bike', 'running', 'bleep', 'grip', 'circuit', 'bodyweight', 'techniques', 'other']
                const GRAPH_SECTION_LABELS = ['All entries', 'Weight', 'Watt bike', 'Running', 'Bleep test', 'Grip test', 'Fixed load circuit', 'Bodyweight', 'Techniques', 'Other']
                function sessionMatchesGraphSection(s, key) {
                  switch (key) {
                    case 'all':        return true
                    case 'weight':     return !!(s.weight_before || s.weight_after)
                    case 'watt_bike':  return !!s.watt_bike
                    case 'running':    return !!s.running
                    case 'bleep':      return !!(s.test && Object.keys(s.test).some(k => k.toLowerCase().includes('bleep')))
                    case 'grip':       return !!(s.test && Object.keys(s.test).some(k => k.toLowerCase().includes('grip')))
                    case 'circuit':    return !!(s.test && Object.keys(s.test).some(k => k.toLowerCase().includes('fixed load circuit')))
                    case 'bodyweight': return !!s.bodyweight
                    case 'techniques': return Array.isArray(s.techniques?.sets) && s.techniques.sets.length > 0
                    // Anything logged that doesn't fit the named
                    // categories above -- Stretch flows, SnC, Other
                    // session, or a custom test name.
                    case 'other': {
                      const hasOtherPhysical = !!(s.stretch_flows || s.snc || s.other_session)
                      const hasOtherTest = !!(s.test && Object.keys(s.test).some(k => {
                        const kl = k.toLowerCase()
                        return !kl.includes('bleep') && !kl.includes('grip') && !kl.includes('fixed load circuit')
                      }))
                      return hasOtherPhysical || hasOtherTest
                    }
                    default:           return true
                  }
                }
                // Every entry matching this metric is kept -- a session
                // holding several metrics still shows up under each one
                // it genuinely has data for, nothing is ever dropped.
                const resultsListFiltered = sorted.filter(s => sessionMatchesGraphSection(s, GRAPH_SECTION_KEYS[resultsGraphSection])).reverse()
                const weightData = sorted.filter(s => s.weight_before || s.weight_after)
                const wattData = sorted.flatMap(s => toEntries(s.watt_bike)
                  .filter(e => Array.isArray(e.sets) && e.sets.length > 0)
                  .map(e => ({ id: s.id, session_date: s.session_date, watt_bike: e })))
                const runData = sorted.flatMap(s => toEntries(s.running)
                  .filter(e => Array.isArray(e.sets) && e.sets.length > 0)
                  .map(e => ({ id: s.id, session_date: s.session_date, running: e })))

                function LineChart({ data, lines, height=160, title, unit='' }) {
                  const [hidden, setHidden] = useState({})
                  const [chartPopup, setChartPopup] = useState(null)
                  const pressTimer = useRef(null)
                  const heldRef = useRef(false)
                  if (!data.length) return (
                    <div style={{ marginBottom: 16 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>{title}</div>
                      <div style={{
                        height, borderRadius: 'var(--radius)', border: '1px dashed var(--border-strong)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-secondary)',
                      }}>
                        <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: 0 }}>No data yet — log a session to see this graph fill in</p>
                      </div>
                    </div>
                  )
                  const visibleLines = lines.filter(l => !hidden[l.key])
                  const allVals = visibleLines.flatMap(l => data.map(d => d[l.key]).filter(v => v != null))
                  if (!allVals.length && visibleLines.length) return (
                    <div style={{ marginBottom: 16 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>{title}</div>
                      <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
                        {lines.map(l => <button key={l.key} onClick={() => setHidden(h => ({...h, [l.key]: !h[l.key]}))}
                          style={{ display:'flex', alignItems:'center', gap:6, padding:'6px 12px', borderRadius:20, border:`2px solid ${l.colour}`,
                            background: hidden[l.key] ? 'transparent' : l.colour+'25', cursor:'pointer', fontFamily:'var(--font-sans)',
                            opacity: hidden[l.key] ? 0.4 : 1 }}>
                          <div style={{ width:16, height:3, background: hidden[l.key] ? '#ccc' : l.colour, borderRadius:2 }}/>
                          <span style={{ fontSize:13, fontWeight:600, color: hidden[l.key] ? 'var(--text-tertiary)' : l.colour }}>{l.label}</span>
                        </button>)}
                      </div>
                    </div>
                  )
                  const minV = allVals.length ? Math.min(...allVals) * 0.95 : 0
                  const maxV = allVals.length ? Math.max(...allVals) * 1.05 : 100
                  const w = 500, h = height, pad = { t:20, r:20, b:30, l:45 }
                  const iw = w - pad.l - pad.r, ih = h - pad.t - pad.b
                  const x = i => pad.l + (i / (data.length - 1 || 1)) * iw
                  const y = v => pad.t + ih - ((v - minV) / (maxV - minV || 1)) * ih
                  return (
                    <div style={{ marginBottom: 16 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>{title}</div>
                      <div className="hscroll-area" style={{ overflowX: 'auto' }}>
                        <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', minWidth: 280, height: 'auto' }}>
                          {[0,0.25,0.5,0.75,1].map((t,i) => {
                            const yv = pad.t + ih * (1-t)
                            const val = (minV + (maxV-minV)*t).toFixed(1)
                            return <g key={i}>
                              <line x1={pad.l} x2={pad.l+iw} y1={yv} y2={yv} stroke="var(--border)" strokeWidth="0.5"/>
                              <text x={pad.l-4} y={yv+4} textAnchor="end" fontSize="9" fill="var(--text-tertiary)">{val}{unit}</text>
                            </g>
                          })}
                          {data.map((d,i) => (i % Math.max(1, Math.floor(data.length/5)) === 0) && (
                            <text key={i} x={x(i)} y={h-6} textAnchor="middle" fontSize="8" fill="var(--text-tertiary)">
                              {new Date(d.session_date).toLocaleDateString('en-GB',{day:'2-digit',month:'short'})}
                            </text>
                          ))}
                          {lines.map(line => {
                            if (hidden[line.key]) return null
                            const pts = data.map((d,i) => d[line.key] != null ? `${x(i)},${y(d[line.key])}` : null).filter(Boolean)
                            if (pts.length < 1) return null
                            return <g key={line.key}>
                              {pts.length >= 2 && <polyline points={pts.join(' ')} fill="none" stroke={line.colour} strokeWidth="2" strokeLinejoin="round"/>}
                              {data.map((d,i) => d[line.key] != null && (
                                <g key={i}>
                                  <circle cx={x(i)} cy={y(d[line.key])} r="4" fill={line.colour} stroke="var(--bg)" strokeWidth="1.5" style={{ cursor: 'pointer', touchAction: 'none' }}
                                    onMouseEnter={() => setChartPopup({ x: x(i), y: y(d[line.key]), label: new Date(d.session_date).toLocaleDateString('en-GB'), value: `${d[line.key]}${unit}` })}
                                    onMouseLeave={() => setChartPopup(null)}
                                    onPointerDown={() => {
                                      heldRef.current = false
                                      pressTimer.current = setTimeout(() => {
                                        heldRef.current = true
                                        setChartPopup({ x: x(i), y: y(d[line.key]), label: new Date(d.session_date).toLocaleDateString('en-GB'), value: `${d[line.key]}${unit}` })
                                      }, 400)
                                    }}
                                    onPointerUp={() => {
                                      clearTimeout(pressTimer.current)
                                      if (heldRef.current) { setChartPopup(null); return }
                                      if (d.id == null) return
                                      const el = document.getElementById(`my-f2f-entry-${d.id}`)
                                      if (!el) return
                                      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
                                      setHighlightedMyEntryId(d.id)
                                      setTimeout(() => setHighlightedMyEntryId(cur => cur === d.id ? null : cur), 2000)
                                    }}
                                    onPointerLeave={() => clearTimeout(pressTimer.current)}
                                  />
                                </g>
                              ))}
                            </g>
                          })}
                          {chartPopup && (
                            <g>
                              <rect x={chartPopup.x - 45} y={chartPopup.y - 38} width="90" height="30" rx="6" fill="var(--text)" opacity="0.9" />
                              <text x={chartPopup.x} y={chartPopup.y - 24} textAnchor="middle" fontSize="9" fill="var(--bg)">{chartPopup.label}</text>
                              <text x={chartPopup.x} y={chartPopup.y - 12} textAnchor="middle" fontSize="11" fontWeight="700" fill="var(--bg)">{chartPopup.value}</text>
                            </g>
                          )}
                        </svg>
                      </div>
                      <div style={{ display:'flex', flexWrap:'wrap', gap:8, marginTop:10 }}>
                        {lines.map(l => (
                          <button key={l.key} onClick={() => setHidden(h => ({...h, [l.key]: !h[l.key]}))}
                            style={{ display:'flex', alignItems:'center', gap:6, padding:'6px 14px', borderRadius:20,
                              border:`2px solid ${l.colour}`, background: hidden[l.key] ? 'transparent' : l.colour+'20',
                              cursor:'pointer', fontFamily:'var(--font-sans)', opacity: hidden[l.key] ? 0.45 : 1,
                              transition:'opacity 0.15s' }}>
                            <div style={{ width:18, height:3, background: hidden[l.key] ? '#999' : l.colour, borderRadius:2 }}/>
                            <span style={{ fontSize:13, fontWeight:700, color: hidden[l.key] ? 'var(--text-tertiary)' : l.colour }}>{l.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )
                }

                const GRAPH_SECTIONS = [
                  { key: 'all', label: '📋 All entries' },
                  { key: 'weight', label: '⚖️ Weight' },
                  { key: 'watt_bike', label: '🚴 Watt bike' },
                  { key: 'running', label: '🏃 Running' },
                  { key: 'bleep', label: '🏃 Bleep test' },
                  { key: 'grip', label: '✊ Grip test' },
                  { key: 'circuit', label: '⭕ Fixed load circuit' },
                  { key: 'bodyweight', label: '💪 Bodyweight' },
                  { key: 'techniques', label: '🥋 Techniques' },
                  { key: 'other', label: '📦 Other' },
                ]
                function cycleGraphSection(direction) {
                  setResultsGraphSection(s => (s + direction + GRAPH_SECTIONS.length) % GRAPH_SECTIONS.length)
                }

                return (
                  <>
                    <div
                      onTouchStart={e => { resultsGraphSwipeStart.current = e.touches[0].clientX }}
                      onTouchEnd={e => {
                        if (resultsGraphSwipeStart.current == null) return
                        const delta = e.changedTouches[0].clientX - resultsGraphSwipeStart.current
                        if (Math.abs(delta) > 50) cycleGraphSection(delta < 0 ? 1 : -1)
                        resultsGraphSwipeStart.current = null
                      }}
                      style={{ marginBottom: 4 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                        <button className="btn btn-sm" onClick={() => cycleGraphSection(-1)}>◀</button>
                        <span style={{ fontSize: 13, fontWeight: 600 }}>{GRAPH_SECTIONS[resultsGraphSection].label}</span>
                        <button className="btn btn-sm" onClick={() => cycleGraphSection(1)}>▶</button>
                      </div>
                    </div>

                    {resultsGraphSection === 0 && (
                      <div className="card" style={{ marginBottom: 12 }}>
                        <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>
                          📋 Every entry you've logged, regardless of category — use the ◀▶ arrows to jump to a specific category instead.
                        </p>
                      </div>
                    )}
                    {resultsGraphSection === 1 && (weightData.length > 1 ? (
                      <div className="card" style={{ marginBottom: 12, position: 'relative' }}>
                        <LineChart
                          data={weightData.map(s => ({ id: s.id, session_date: s.session_date, before: s.weight_before, after: s.weight_after }))}
                          lines={[
                            { key: 'before', label: 'Before', colour: '#378ADD' },
                            { key: 'after',  label: 'After',  colour: '#1D9E75' },
                          ]}
                          title="⚖️ Weight over time"
                          unit="kg"
                        />
                      </div>
                    ) : (
                      <div className="card" style={{ marginBottom: 12, textAlign: 'center', padding: 24 }}>
                        <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: 0 }}>No weight data yet — log a session to see this graph fill in</p>
                      </div>
                    ))}

                    <div style={{ display: resultsGraphSection === 2 ? 'block' : 'none' }}>
                    {(() => {
                      const SET_COLOURS = ['#E24B4A','#378ADD','#1D9E75','#EF9F27','#8B5CF6','#EC4899','#06B6D4','#84CC16','#F97316','#A855F7','#14B8A6','#EAB308']
                      const wattTypes = [...new Set(wattData.map(s => normalizeIntervalMode(s.watt_bike?.interval_mode || s.watt_bike?.type)).filter(Boolean))]
                      const filteredWatt = wattChartFilter === 'all' ? wattData : wattData.filter(s => normalizeIntervalMode(s.watt_bike?.interval_mode || s.watt_bike?.type) === wattChartFilter)
                      const maxSets = Math.max(1, ...filteredWatt.map(s => s.watt_bike?.sets?.length || 0))
                      const setLines = Array.from({length: maxSets}, (_,i) => ({
                        key: `set${i}`, label: `Set ${i+1}`, colour: SET_COLOURS[i % SET_COLOURS.length]
                      }))
                      const chartData = filteredWatt.map(s => {
                        const obj = { id: s.id, session_date: s.session_date }
                        ;(s.watt_bike?.sets || []).forEach((v,i) => { obj[`set${i}`] = (v && typeof v === 'object') ? v.wattage : v })
                        return obj
                      })
                      return (
                        <div className="card" style={{ marginBottom: 12, position: 'relative' }}>
                          {wattTypes.length > 1 && (
                            <div className="field" style={{ marginBottom: 10, maxWidth: 220 }}>
                              <label style={{ fontSize: 11 }}>Show</label>
                              <select value={wattChartFilter} onChange={e => setWattChartFilter(e.target.value)} style={{ fontSize: 12, padding: '5px 8px' }}>
                                <option value="all">All types</option>
                                {wattTypes.map(t => <option key={t} value={t}>{t}</option>)}
                              </select>
                            </div>
                          )}
                          {chartData.length > 1
                            ? <LineChart data={chartData} lines={setLines} title="🚴 Watt bike — each set over time" unit="W" />
                            : <LineChart data={[]} lines={setLines} title="🚴 Watt bike — each set over time" unit="W" />}
                        </div>
                      )
                    })()}
                    </div>

                    <div style={{ display: resultsGraphSection === 3 ? 'block' : 'none' }}>
                    {(() => {
                      const SET_COLOURS = ['#E24B4A','#378ADD','#1D9E75','#EF9F27','#8B5CF6','#EC4899','#06B6D4','#84CC16']
                      const runTests = [...new Set(runData.map(s => s.running?.test).filter(Boolean))]
                      const filteredRun = runChartFilter === 'all' ? runData : runData.filter(s => s.running?.test === runChartFilter)
                      const isDistanceTest = filteredRun.some(s => (s.running?.category) === 'Distance over time')
                      const maxSets = Math.max(1, ...filteredRun.map(s => s.running?.sets?.length || 0))
                      const setLines = Array.from({length: maxSets}, (_,i) => ({
                        key: `set${i}`, label: `Attempt ${i+1}`, colour: SET_COLOURS[i % SET_COLOURS.length]
                      }))
                      const toChartValue = v => {
                        if (v == null || v === '') return null
                        if (v && typeof v === 'object') return v.isRest ? null : toChartValue(v.value ?? v.wattage)
                        if (typeof v === 'string' && v.includes(':')) {
                          const [mm, ss] = v.split(':').map(Number)
                          return (mm || 0) * 60 + (ss || 0)
                        }
                        return v
                      }
                      const chartData = filteredRun.map(s => {
                        const obj = { id: s.id, session_date: s.session_date }
                        ;(s.running?.sets || []).forEach((v,i) => { obj[`set${i}`] = toChartValue(v) })
                        return obj
                      })
                      return (
                        <div className="card" style={{ marginBottom: 12, position: 'relative' }}>
                          {runTests.length > 1 && (
                            <div className="field" style={{ marginBottom: 10, maxWidth: 220 }}>
                              <label style={{ fontSize: 11 }}>Show</label>
                              <select value={runChartFilter} onChange={e => setRunChartFilter(e.target.value)} style={{ fontSize: 12, padding: '5px 8px' }}>
                                <option value="all">All tests</option>
                                {runTests.map(t => <option key={t} value={t}>{t}</option>)}
                              </select>
                            </div>
                          )}
                          <LineChart data={chartData.length > 1 ? chartData : []} lines={setLines} title="🏃 Running — each attempt over time" unit={isDistanceTest ? 'km' : 'sec'} />
                        </div>
                      )
                    })()}
                    </div>

                    <div style={{ display: resultsGraphSection === 4 ? 'block' : 'none' }}>
                    {(() => {
                      const bleepData = sorted.filter(s => s.test && Object.keys(s.test).some(k => k.toLowerCase().includes('bleep')))
                        .map(s => {
                          const entry = Object.entries(s.test).find(([k]) => k.toLowerCase().includes('bleep'))
                          return { id: s.id, session_date: s.session_date, level: entry ? parseFloat(entry[1]) : null }
                        }).filter(s => s.level != null)
                      return (
                        <div className="card" style={{ marginBottom: 12, position: 'relative' }}>
                          <LineChart data={bleepData} lines={[{ key: 'level', label: 'Bleep test', colour: '#1D9E75' }]} title="🏃 Bleep test over time" unit="" />
                        </div>
                      )
                    })()}
                    </div>

                    <div style={{ display: resultsGraphSection === 5 ? 'block' : 'none' }}>
                    {(() => {
                      const gripData = sorted.filter(s => s.test && Object.keys(s.test).some(k => k.toLowerCase().includes('grip')))
                        .map(s => {
                          const left = Object.entries(s.test).find(([k]) => k.toLowerCase().includes('left') && k.toLowerCase().includes('grip'))
                          const right = Object.entries(s.test).find(([k]) => k.toLowerCase().includes('right') && k.toLowerCase().includes('grip'))
                          return { id: s.id, session_date: s.session_date, left: left ? parseFloat(left[1]) : null, right: right ? parseFloat(right[1]) : null }
                        }).filter(s => s.left != null || s.right != null)
                      return (
                        <div className="card" style={{ marginBottom: 12, position: 'relative' }}>
                          <LineChart data={gripData} lines={[{ key: 'left', label: 'Grip left', colour: '#378ADD' }, { key: 'right', label: 'Grip right', colour: '#E24B4A' }]} title="✊ Grip test over time" unit="kg" />
                        </div>
                      )
                    })()}
                    </div>

                    <div style={{ display: resultsGraphSection === 6 ? 'block' : 'none' }}>
                    {(() => {
                      const circuitData = sorted.filter(s => s.test && Object.keys(s.test).some(k => k.toLowerCase().includes('fixed load circuit')))
                        .map(s => {
                          const entry = Object.entries(s.test).find(([k]) => k.toLowerCase().includes('fixed load circuit'))
                          return { id: s.id, session_date: s.session_date, value: entry ? parseFloat(entry[1]) : null }
                        }).filter(s => s.value != null)
                      return (
                        <div className="card" style={{ marginBottom: 12, position: 'relative' }}>
                          <LineChart data={circuitData} lines={[{ key: 'value', label: 'Fixed load circuit', colour: '#854F0B' }]} title="⭕ Fixed load circuit over time" unit="" />
                        </div>
                      )
                    })()}
                    </div>

                    <div style={{ display: resultsGraphSection === 7 ? 'block' : 'none' }}>
                    {(() => {
                      const bwData = sorted.flatMap(s => toEntries(s.bodyweight)
                        .filter(e => Array.isArray(e.sets) && e.sets.length > 0)
                        .map(e => ({ id: s.id, session_date: s.session_date, bodyweight: e })))
                      const bwTypes = [...new Set(bwData.map(s => s.bodyweight?.type).filter(Boolean))]
                      const filteredBw = bwChartFilter === 'all' ? bwData : bwData.filter(s => s.bodyweight?.type === bwChartFilter)
                      const maxSets = Math.max(1, ...filteredBw.map(s => s.bodyweight?.sets?.length || 0))
                      const SET_COLOURS = ['#1D9E75','#378ADD','#E24B4A','#EF9F27','#8B5CF6','#EC4899']
                      const setLines = Array.from({length: maxSets}, (_,i) => ({ key: `set${i}`, label: `Set ${i+1}`, colour: SET_COLOURS[i % SET_COLOURS.length] }))
                      const chartData = filteredBw.map(s => {
                        const obj = { id: s.id, session_date: s.session_date }
                        ;(s.bodyweight?.sets || []).forEach((v,i) => { obj[`set${i}`] = parseFloat(v) })
                        return obj
                      })
                      return (
                        <div className="card" style={{ marginBottom: 12, position: 'relative' }}>
                          {bwTypes.length > 1 && (
                            <div className="field" style={{ marginBottom: 10, maxWidth: 220 }}>
                              <label style={{ fontSize: 11 }}>Show</label>
                              <select value={bwChartFilter} onChange={e => setBwChartFilter(e.target.value)} style={{ fontSize: 12, padding: '5px 8px' }}>
                                <option value="all">All exercises</option>
                                {bwTypes.map(t => <option key={t} value={t}>{t}</option>)}
                              </select>
                            </div>
                          )}
                          <LineChart data={chartData} lines={setLines} title="💪 Bodyweight — reps over time" unit=" reps" />
                        </div>
                      )
                    })()}
                    </div>

                    <div style={{ display: resultsGraphSection === 8 ? 'block' : 'none' }}>
                    {(() => {
                      const techData = sorted.filter(s => Array.isArray(s.techniques?.sets) && s.techniques.sets.length > 0)
                      const techTypes = [...new Set(techData.map(s => s.techniques?.type).filter(Boolean))]
                      const filteredTech = techChartFilter === 'all' ? techData : techData.filter(s => s.techniques?.type === techChartFilter)
                      const maxSets = Math.max(1, ...filteredTech.map(s => s.techniques?.sets?.length || 0))
                      const SET_COLOURS = ['#E24B4A','#378ADD','#1D9E75','#EF9F27','#8B5CF6','#EC4899']
                      const setLines = Array.from({length: maxSets}, (_,i) => ({ key: `set${i}`, label: `Set ${i+1}`, colour: SET_COLOURS[i % SET_COLOURS.length] }))
                      const chartData = filteredTech.map(s => {
                        const obj = { id: s.id, session_date: s.session_date }
                        ;(s.techniques?.sets || []).forEach((v,i) => { obj[`set${i}`] = parseFloat(v) })
                        return obj
                      })
                      return (
                        <div className="card" style={{ marginBottom: 12, position: 'relative' }}>
                          {techTypes.length > 1 && (
                            <div className="field" style={{ marginBottom: 10, maxWidth: 220 }}>
                              <label style={{ fontSize: 11 }}>Show</label>
                              <select value={techChartFilter} onChange={e => setTechChartFilter(e.target.value)} style={{ fontSize: 12, padding: '5px 8px' }}>
                                <option value="all">All techniques</option>
                                {techTypes.map(t => <option key={t} value={t}>{t}</option>)}
                              </select>
                            </div>
                          )}
                          <LineChart data={chartData} lines={setLines} title="🥋 Techniques — reps over time" unit=" reps" />
                        </div>
                      )
                    })()}
                    </div>

                    <div style={{ display: resultsGraphSection === 9 ? 'block' : 'none' }}>
                      <div className="card" style={{ marginBottom: 12 }}>
                        <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>
                          📦 Anything logged that doesn't fit the named categories — Stretch flows, SnC, Other session, or a custom test name. See the list below.
                        </p>
                      </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                      <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                        {resultsListFiltered.length} {GRAPH_SECTION_LABELS[resultsGraphSection]} result{resultsListFiltered.length === 1 ? '' : 's'}
                      </span>
                    </div>
                    {resultsListFiltered.length === 0 ? (
                      <div className="empty-state"><p>No {GRAPH_SECTION_LABELS[resultsGraphSection]} results yet</p></div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {resultsListFiltered.map((s, i) => {
                          const change = s.weight_before && s.weight_after
                            ? (parseFloat(s.weight_after) - parseFloat(s.weight_before)).toFixed(1) : null
                          return (
                            <div key={i} id={`my-f2f-entry-${s.id}`} className="card" style={{
                              borderLeft: '3px solid #378ADD',
                              outline: highlightedMyEntryId === s.id ? '2px solid #EF9F27' : 'none',
                              transition: 'outline 0.3s',
                            }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                <span style={{ fontWeight: 600, fontSize: 13 }}>{new Date(s.session_date).toLocaleDateString('en-GB')}</span>
                                {(s.weight_before || s.weight_after) && (
                                  <div style={{ display: 'flex', gap: 10, fontSize: 12 }}>
                                    {s.weight_before && <span>⚖️ Before: <strong>{s.weight_before}kg</strong></span>}
                                    {s.weight_after && <span>After: <strong>{s.weight_after}kg</strong></span>}
                                    {change && <span style={{ fontWeight: 700, color: change < 0 ? '#1d9e75' : '#a32d2d' }}>{change > 0 ? '+' : ''}{change}kg</span>}
                                  </div>
                                )}
                              </div>
                              {s.running && toEntries(s.running).map((e, ei) => (
                                <p key={ei} style={{ fontSize: 12, margin: '4px 0' }}>
                                  🏃 {e.category || e.test || 'Running'}{(e.sets?.length) ? `: ${e.sets.map(v => { if (!v || typeof v !== 'object') return v; if (v.isRest) return 'rest'; return v.value ?? v.wattage }).join(', ')}` : ' logged'}
                                </p>
                              ))}
                              {s.watt_bike && toEntries(s.watt_bike).map((e, ei) => (
                                <p key={ei} style={{ fontSize: 12, margin: '4px 0' }}>
                                  🚴 {normalizeIntervalMode(e.interval_mode || e.type) || 'Watt bike'}{(e.sets?.length) ? `: ${e.sets.map(v => (v && typeof v === 'object') ? v.wattage : v).join(', ')}W` : ' logged'}
                                </p>
                              ))}
                              {s.bodyweight && toEntries(s.bodyweight).map((e, ei) => (
                                <p key={ei} style={{ fontSize: 12, margin: '4px 0' }}>
                                  💪 {e.type || 'Bodyweight'}{(e.sets?.length) ? `: ${e.sets.map(v => (v && typeof v === 'object') ? v.wattage : v).join(', ')}` : ' logged'}
                                </p>
                              ))}
                              {s.techniques && (
                                <p style={{ fontSize: 12, margin: '4px 0' }}>
                                  🥋 {s.techniques.type || 'Techniques'}{(s.techniques.sets?.length) ? `: ${s.techniques.sets.join(', ')} reps` : ' logged'}
                                </p>
                              )}
                              {Array.isArray(s.stretch_flows) && s.stretch_flows.some(Boolean) && (
                                <p style={{ fontSize: 12, margin: '4px 0' }}>🧘 Stretch flows: {s.stretch_flows.filter(Boolean).join(', ')}</p>
                              )}
                              {s.snc && toEntries(s.snc).map((e, ei) => (
                                <p key={ei} style={{ fontSize: 12, margin: '4px 0' }}>
                                  🏋️ {e.routine || 'SnC'}{(e.sets?.length) ? `: ${e.sets.join(', ')}` : ' logged'}
                                </p>
                              ))}
                              {s.other_session && toEntries(s.other_session).map((e, ei) => (
                                <p key={ei} style={{ fontSize: 12, margin: '4px 0' }}>
                                  📦 {e.type || 'Other session'}{(e.sets?.length) ? `: ${e.sets.join(', ')}` : ' logged'}
                                </p>
                              ))}
                              {s.test && Object.entries(s.test).map(([k, v]) => (
                                <p key={k} style={{ fontSize: 12, margin: '4px 0' }}>📊 {k}: <strong>{v}</strong></p>
                              ))}
                              {s.notes && <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '6px 0 0', fontStyle: 'italic' }}>{s.notes}</p>}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </>
                )
              })()}
            </>
          )}
        </div>
      )}

      {/* ── Points ── */}
      {tab === 'points' && (
        <div>
          <button onClick={() => setTab('home')} className="btn btn-sm" style={{ marginBottom: 12 }}>← Back to Home</button>
          <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
            <button onClick={() => setShowOverallPos(v => !v)} className="card" style={{ flex: 1, textAlign: 'center', cursor: 'pointer', border: 'none', fontFamily: 'var(--font-sans)', background: 'var(--bg-secondary)' }}
              title={showOverallPos ? 'Showing overall position — tap for position in house' : 'Showing position in house — tap for overall position'}>
              <div style={{ fontSize: 24, fontWeight: 700, color: colour }}>{showOverallPos ? `#${overallPosition || '—'}` : `#${positionInHouse || '—'}`}</div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{showOverallPos ? 'Overall position' : 'Position in house'}</div>
            </button>
            <button onClick={() => setShowIndividualPct(v => !v)} className="card" style={{ flex: 1, textAlign: 'center', cursor: 'pointer', border: 'none', fontFamily: 'var(--font-sans)', background: 'var(--bg-secondary)' }}
              title={showIndividualPct ? 'Showing % of all individual points — tap to show points' : 'Showing individual points — tap to show % of total'}>
              <div style={{ fontSize: 24, fontWeight: 700, color: '#1d9e75' }}>{showIndividualPct ? `${individualPointsPct ?? 0}%` : (student?.individual_points || 0)}</div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{showIndividualPct ? '% of total individual points' : 'Individual points'}</div>
            </button>
          </div>
          <div className="card" style={{ padding: 0 }}>
            {points.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>No points yet</div>
            ) : (
              <table>
                <thead><tr><th>Date</th><th>Reason</th><th style={{ textAlign: 'right' }}>Points</th></tr></thead>
                <tbody>
                  {points.map((p,i) => (
                    <tr key={i}>
                      <td style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{new Date(p.awarded_at).toLocaleDateString('en-GB')}</td>
                      <td style={{ fontSize: 13 }}>{p.point_type}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700, fontSize: 13, color: p.points_awarded < 0 ? '#a32d2d' : '#1d9e75' }}>
                        {p.points_awarded > 0 ? '+' : ''}{p.points_awarded}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ── Find athlete ── */}
      {tab === 'search' && (
        <div>
          <button onClick={() => setTab('home')} className="btn btn-sm" style={{ marginBottom: 12 }}>← Back to Home</button>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 }}>Search for any athlete by name</p>
          <AthleteSearch />
        </div>
      )}
    </div>
  )
}

function AthleteSearch() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [claimingId, setClaimingId] = useState(null)

  useEffect(() => {
    if (query.length < 2) { setResults([]); return }
    const t = setTimeout(async () => {
      const { data: memberData } = await supabasePublic
        .from('members').select('id, first_name, last_name, date_of_birth')
        .or(`first_name.ilike.%${query}%,last_name.ilike.%${query}%`)
        .neq('status', 'stopped').neq('status', 'not_started').limit(8)
      if (!memberData?.length) { setResults([]); return }
      const { data: athletes } = await supabasePublic
        .from('students').select('id, student_ref, pka_belt, krba_level, discipline, house_name, member_id')
        .in('member_id', memberData.map(m => m.id))
      const merged = (athletes || []).map(s => ({ ...s, members: memberData.find(m => m.id === s.member_id) }))
      setResults(merged)
    }, 200)
    return () => clearTimeout(t)
  }, [query])

  async function claimProfile(s) {
    const m = s.members
    if (!confirm(`Link your login to ${m?.first_name} ${m?.last_name}'s profile? You won't need to search for it again.`)) return
    setClaimingId(s.id)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/.netlify/functions/link-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ studentId: s.id }),
      })
      const data = await res.json()
      if (data.success) {
        alert('Linked! Reloading your profile…')
        window.location.href = '/athlete-app'
      } else {
        alert('Error: ' + data.error)
      }
    } catch (e) {
      alert('Failed to link profile')
    }
    setClaimingId(null)
  }

  return (
    <div>
      <input value={query} onChange={e => setQuery(e.target.value)}
        placeholder="Type name to find athlete…" autoFocus
        style={{ width: '100%', padding: '12px', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius)', fontSize: 15, background: 'var(--bg-secondary)', color: 'var(--text)', marginBottom: 10 }} />
      {query.length >= 2 && results.length === 0 && (
        <p style={{ fontSize: 13, color: 'var(--text-tertiary)', textAlign: 'center' }}>No athletes found</p>
      )}
      {(() => {
        const names = results.map(s => `${s.members?.first_name} ${s.members?.last_name}`.toLowerCase())
        const hasDuplicateName = new Set(names).size !== names.length
        return hasDuplicateName ? (
          <p style={{ fontSize: 12, color: '#EF9F27', background: '#EF9F2715', padding: '8px 10px', borderRadius: 'var(--radius)', marginBottom: 8 }}>
            ⚠️ More than one person with this name — check the date of birth carefully before choosing.
          </p>
        ) : null
      })()}
      {results.map(s => {
        const m = s.members
        return (
          <div key={s.id}
            style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
              border: '1px solid var(--border)', borderRadius: 'var(--radius)',
              marginBottom: 8, background: 'var(--bg)' }}>
            <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--bg-secondary)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 700, flexShrink: 0 }}>
              {m?.first_name?.[0]}{m?.last_name?.[0]}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{m?.first_name} {m?.last_name}</div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                {s.student_ref} · {s.discipline} · {s.pka_belt || s.krba_level || '—'}
                {m?.date_of_birth ? ` · DOB ${new Date(m.date_of_birth).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}
              </div>
            </div>
            <button className="btn btn-primary btn-sm" onClick={() => claimProfile(s)} disabled={claimingId === s.id}>
              {claimingId === s.id ? 'Linking…' : 'This is me'}
            </button>
          </div>
        )
      })}
    </div>
  )
}
