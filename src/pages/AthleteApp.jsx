import { useEffect, useState, useRef } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import { supabasePublic } from '../lib/supabasePublic.js'
import { useAuth } from '../hooks/useAuth.jsx'

const HOUSE_COLOURS = {
  'Dragon House': '#E24B4A', 'Super House': '#378ADD',
  'Ice House': '#1D9E75', 'Jet House': '#EF9F27',
}

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
// timetable here.
const PDP_TIMETABLE_SECTION_KEYS = ['psychology_what_to_do', 'tech_what_to_do', 'tact_what_to_do', 'physical_what_to_do', 'skill_what_to_do']

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
  ],
}
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
  { key: 'other', label: 'Other tests', icon: '📋', tests: [
    { name: 'Fixed load circuit', unit: 'sec' },
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
]
const VIDEO_ANALYSIS_OPTIONS = ['Self in competition', 'Self in training', 'Elite athlete in competition', 'Elite athlete in training']
const MEDITATION_TYPE_OPTIONS = ['Guided meditation', 'Breathing meditation', 'Body scan meditation', 'Mindfulness meditation', 'Silent meditation', 'Other']
const VISUALISATION_OPTIONS = ['Performing a technique', 'Performing in competition']
const ACTIVE_RECOVERY_OPTIONS = ['Swimming', 'Walking', 'Yoga']

function isMentalityQComplete(key, m) {
  if (!m) return false
  switch (key) {
    case 'videoAnalysis': return !!m.videoAnalysis?.type
    case 'meditation': return !!m.meditation?.type
    case 'visualisation': return !!m.visualisation?.type
    case 'chess': return !!(m.chess?.count > 0)
    case 'reading': return !!(m.reading?.count > 0)
    case 'gaming': return !!(m.gaming?.count > 0)
    case 'eyeTracking': return !!(m.eyeTracking?.count > 0)
    case 'coldWater': return !!(m.coldWater?.count > 0)
    case 'activeRecovery': return !!m.activeRecovery?.type
    case 'gratitude': return !!(m.gratitude?.count > 0)
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
function isDateOnHoliday(dateStr, holidays, classIdsForThatWeekday) {
  const clubWide = holidays.some(h => !h.class_id && h.start_date <= dateStr && h.end_date >= dateStr)
  if (clubWide) return true
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
    const numSets = arr => Array.isArray(arr) ? arr.map(v => parseFloat((v && typeof v === 'object') ? v.wattage : v)).filter(v => !isNaN(v)) : []
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
function ModuleButton({ b, sorted, moduleSubType, setModuleSubType, colour, setTab, setResultsGraphSection, studentId, onToggleLog, onQuickLog, large }) {
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
  const isPhysicalModule = ['running', 'watt_bike', 'bodyweight', 'stretch'].includes(b.key)
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
        flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2,
        padding: large ? '16px 8px' : '8px 4px', background: 'none', border: 'none', borderRight: isSimplifiedModule ? 'none' : '1px solid var(--border)',
        cursor: (b.key === 'test' || subTypeOptions.length > 1) ? 'pointer' : 'default',
        minWidth: 0, touchAction: isPhysicalModule ? 'none' : undefined,
      }}>
        <span style={{ fontSize: large ? 26 : 16 }}>{b.icon}</span>
        {b.key !== 'test' && <span style={{ fontSize: large ? 14 : 9, fontWeight: 600, whiteSpace: 'nowrap' }}>{b.label}</span>}
        {b.key !== 'test' && currentSubType && <span style={{ fontSize: large ? 10 : 7, color: colour, fontWeight: 600, textAlign: 'center', lineHeight: 1.2 }}>{currentSubType}</span>}
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
  { key: 'maintain',            label: '✅ Maintain',              colour: '#378ADD' },
  { key: 'to_work_on',          label: '🎯 To work on',            colour: '#EF9F27' },
  { key: 'psychology_maintain', label: '🧠 Psychology — maintain', colour: '#8B5CF6' },
  { key: 'psychology_work_on',  label: '🧠 Psychology — work on',  colour: '#7C3AED' },
  { key: 'tech_maintain',       label: '⚙️ Technical — maintain',  colour: '#378ADD' },
  { key: 'tech_work_on',        label: '⚙️ Technical — work on',   colour: '#EF9F27' },
  { key: 'tact_maintain',       label: '🎯 Tactical — maintain',   colour: '#1D9E75' },
  { key: 'tact_work_on',        label: '🎯 Tactical — work on',    colour: '#E24B4A' },
  { key: 'physical_maintain',   label: '💪 Physical — maintain',   colour: '#1D9E75' },
  { key: 'physical_work_on',    label: '💪 Physical — work on',    colour: '#059669' },
  { key: 'athlete_notes',       label: '📝 My notes',              colour: '#185FA5' },
]

export default function AthleteApp() {
  const { profile, isStaff } = useAuth()
  const [tab, setTab]           = useState('home')

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
    }
  }, [])
  const [checkingIn, setCheckingIn]   = useState(false)
  const [checkedInMsg, setCheckedInMsg] = useState(null)
  const [activeCheckIn, setActiveCheckIn] = useState(null) // the open attendance row (checked in, not yet checked out) if still within its session window
  const [showWeightCheckPrompt, setShowWeightCheckPrompt] = useState(null) // 'in' | 'out' | null
  const [weightCheckValue, setWeightCheckValue] = useState('')
  const [student, setStudent]   = useState(null)
  const [houses, setHouses] = useState([])
  const [rankList, setRankList] = useState([])
  const [truePointTotals, setTruePointTotals] = useState({})
  const [showContribution, setShowContribution] = useState(false)
  const [showOverallPos, setShowOverallPos] = useState(false)
  const [apData, setApData]     = useState(null)
  const [assignedClasses, setAssignedClasses] = useState([])
  const [holidays, setHolidays] = useState([])
  // Date range the coach configured for the Attendance card on the
  // Coaches Dashboard, only when they set its scope to "Athletes" or
  // "Both" -- otherwise this athlete's own attendance % keeps using its
  // own default (since they joined, up to today).
  const [coachAttendanceDateSettings, setCoachAttendanceDateSettings] = useState(null)
  // Read-only Profile card (Club/Level/Record/Weight/groups) -- starts
  // collapsed to just its title bar, same show/hide behaviour as the
  // equivalent card on the Coaches Dashboard. No editing here -- this
  // is purely a visibility toggle for the athlete's own info.
  const [myProfileExpanded, setMyProfileExpanded] = useState(false)
  const [myNotesLog, setMyNotesLog] = useState([])
  const [tptData, setTptData] = useState({ kickboxing: [], boxing: [] })
  const [whoopConnection, setWhoopConnection] = useState(null)
  const [whoopSessions, setWhoopSessions] = useState([])
  const [newNoteText, setNewNoteText] = useState('')
  const [showFullscreenNoteComposer, setShowFullscreenNoteComposer] = useState(false)
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

        supabase.from('athlete_notes_log').select('*').eq('student_id', s.id).order('logged_at', { ascending: false })
          .then(({ data, error }) => { if (!error) setMyNotesLog(data || []) })

        supabase.from('tpt_kickboxing').select('*').eq('student_id', s.id).order('assessed_at', { ascending: false }).limit(2)
          .then(({ data, error }) => { if (!error) setTptData(prev => ({ ...prev, kickboxing: data || [] })) })
        supabase.from('tpt_boxing').select('*').eq('student_id', s.id).order('assessed_at', { ascending: false }).limit(2)
          .then(({ data, error }) => { if (!error) setTptData(prev => ({ ...prev, boxing: data || [] })) })

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
      videoAnalysis: { type: '' },
      meditation: { type: '' },
      visualisation: { type: '' },
      chess: { count: 0 },
      reading: { count: 0 },
      gaming: { count: 0 },
      eyeTracking: { count: 0 },
      coldWater: { count: 0 },
      activeRecovery: { type: '' },
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
  // still "open" (not checked out, and within 1 hour of the relevant
  // class's start time) -- so refreshing the page still shows the
  // Check out button rather than losing that state.
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

    // Find today's assigned class closest to (at or before) the
    // check-in time, to know when this session's 1-hour window ends
    const jsDay = new Date().getDay()
    const todaysClasses = assignedClasses.filter(a => (DAY_TO_JS_DAYS[a.classes?.day_of_week] || []).includes(jsDay))
    const checkInTime = new Date(mostRecent.attended_at)
    let expiresAt
    if (todaysClasses.length) {
      const closest = todaysClasses.reduce((best, a) => {
        if (!a.classes?.start_time) return best
        const [h, m] = a.classes.start_time.split(':').map(Number)
        const classStart = new Date(checkInTime); classStart.setHours(h, m, 0, 0)
        if (classStart > checkInTime) return best // hasn't started yet, not this one
        if (!best || classStart > best.classStart) return { classStart, a }
        return best
      }, null)
      expiresAt = closest ? new Date(closest.classStart.getTime() + 60 * 60 * 1000) : new Date(checkInTime.getTime() + 60 * 60 * 1000)
    } else {
      expiresAt = new Date(checkInTime.getTime() + 60 * 60 * 1000)
    }

    if (new Date() > expiresAt) setActiveCheckIn(null)
    else setActiveCheckIn(mostRecent)
  }, [student, attendanceData, assignedClasses])

  async function checkInNow(attendanceType) {
    if (!student) return
    setCheckingIn(true)
    const { data, error } = await supabase.from('attendance').insert({
      student_id: student.id,
      present: true,
      late: false,
      attendance_type: attendanceType,
      session_date: new Date().toISOString().split('T')[0],
      attended_at: new Date().toISOString(),
      self_checked_in: true,
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
  }

  async function submitWeightCheck(skip = false) {
    if (!activeCheckIn) { setShowWeightCheckPrompt(null); return }
    setCheckingIn(true)
    const field = showWeightCheckPrompt === 'in' ? 'weight_before' : 'weight_after'
    const updates = { [field]: skip || !weightCheckValue.trim() ? null : parseFloat(weightCheckValue) }
    if (showWeightCheckPrompt === 'out') updates.checked_out_at = new Date().toISOString()

    const { error } = await supabase.from('attendance').update(updates).eq('id', activeCheckIn.id)
    if (error) {
      alert('Error saving: ' + error.message)
    } else {
      // Also sync students.weight_kg from the latest weigh-in, same as elsewhere in the app
      if (updates[field] != null) {
        await supabase.from('students').update({ weight_kg: updates[field] }).eq('id', student.id)
      }
      setAttendanceData(prev => prev.map(a => a.id === activeCheckIn.id ? { ...a, ...updates } : a))
      if (showWeightCheckPrompt === 'in') {
        setCheckedInMsg(activeCheckIn.attendance_type === 'full_kit' ? '✓ Checked in — Full Kit!' : '✓ Checked in!')
        setTimeout(() => setCheckedInMsg(null), 3000)
      } else {
        setCheckedInMsg('✓ Checked out!')
        setTimeout(() => setCheckedInMsg(null), 3000)
        setActiveCheckIn(null)
      }
    }
    setShowWeightCheckPrompt(null)
    setCheckingIn(false)
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

  let houseRank = null, houseTotalPoints = null, contributionPct = null, positionInHouse = null, overallPosition = null
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
  } catch (e) {
    console.error('AthleteApp header calc error:', e)
  }

  const TABS = [
    ['home',      '🏠 Home'],
    ['sessions',  '📅 Schedule'],
    ['fit2fight', '💪 Results'],
    ['pdp',       '🎯 My PDP'],
    ['reports',   '📄 Reports'],
    ['analysis',  '📊 Analysis'],
    ['points',    '⭐ Points'],
    ['search',    '🔍 Find athlete'],
  ]

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: '20px 16px', minHeight: '100vh' }}>

      {isStaff && (
        <Link to="/dashboard" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 10, fontSize: 13, color: 'var(--text-secondary)', textDecoration: 'none' }}>
          ← Back to main site
        </Link>
      )}

      {/* Profile header */}
      <div className="card" style={{ marginBottom: 12, borderLeft: `4px solid ${colour}`, cursor: 'pointer' }} onClick={() => setTab('home')}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ width: 64, height: 64, borderRadius: '50%', background: colour + '22', color: colour, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 700, flexShrink: 0 }}>
            {initials}
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            {student ? (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {positionInHouse > 0 && (
                    <button onClick={e => { e.stopPropagation(); setShowOverallPos(v => !v) }}
                      title={showOverallPos ? 'Showing overall position — tap for position in house' : 'Showing position in house — tap for overall position'}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 15, fontWeight: 700, color: colour }}>
                      #{showOverallPos ? overallPosition : positionInHouse}
                    </button>
                  )}
                  <div style={{ fontSize: 20, fontWeight: 700 }}>{m?.first_name} {m?.last_name}</div>
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 3 }}>
                  {student.discipline}{age ? ` · Age ${age}` : ''}{student.pka_belt || student.krba_level ? ` · ${student.pka_belt || student.krba_level}` : ''}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, fontSize: 13 }}>
                  {houseRank > 0 && <span style={{ color: 'var(--text-tertiary)', fontWeight: 600 }}>#{houseRank}</span>}
                  <span style={{ color: colour, fontWeight: 600 }}>{houseName || '—'}</span>
                  {houseTotalPoints != null && <span style={{ color: 'var(--text-tertiary)' }}>({houseTotalPoints} pts)</span>}
                  {student.house_points != null && (
                    <button onClick={e => { e.stopPropagation(); setShowContribution(v => !v) }}
                      title={showContribution ? 'Showing % contribution to house — tap to show points' : 'Showing house points — tap to show % contribution'}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginLeft: 6, fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', textDecoration: 'underline dotted' }}>
                      {showContribution ? `${contributionPct ?? 0}% of house` : `${student.house_points} house pts`}
                    </button>
                  )}
                </div>
              </>
            ) : (
              <>
                <div style={{ fontSize: 16, fontWeight: 600 }}>{profile?.first_name} {profile?.last_name}</div>
                <div style={{ fontSize: 12, color: '#EF9F27', marginTop: 2 }}>No student record linked — ask your coach</div>
              </>
            )}
          </div>
        </div>
      </div>

      {student && (() => {
        const pct = weightTargetActiveMode === 'in_comp' ? weightTargetPctInComp : weightTargetPctOutComp
        const compWeightMatch = apData?.weight_division?.match(/[\d.]+/)
        const baseWeight = compWeightMatch ? parseFloat(compWeightMatch[0]) : student.weight_kg
        const override = apData?.weight_target_override
        let targetWeight = baseWeight ? (baseWeight * (1 + pct)).toFixed(1) : null
        if (override?.type === 'actual' && override.value) targetWeight = parseFloat(override.value).toFixed(1)
        else if (override?.type === 'percent' && override.value && baseWeight) targetWeight = (baseWeight * (1 + parseFloat(override.value))).toFixed(1)
        return (
      <div className="card" style={{ padding: 0, marginBottom: 14 }}>
        <div onClick={() => setMyProfileExpanded(v => !v)}
          style={{ padding: '10px 14px', fontWeight: 600, fontSize: 13, borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
          <span>Profile</span>
          <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{myProfileExpanded ? '▲' : '▼'}</span>
        </div>
        <div style={{
          maxHeight: myProfileExpanded ? 600 : 0,
          opacity: myProfileExpanded ? 1 : 0,
          overflow: 'hidden',
          transition: 'max-height 0.3s ease, opacity 0.25s ease',
        }}>
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
            style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 14px', borderBottom: i < arr.length - 1 ? '1px solid var(--border)' : 'none', fontSize: 13, cursor: isWeightRow ? 'pointer' : 'default' }}>
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

      {/* Tabs */}
      <div className="hide-scrollbar" style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: 14, overflowX: 'auto' }}>
        {TABS.map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)} style={{
            padding: '10px 14px', fontSize: 13, border: 'none', background: 'none', cursor: 'pointer',
            borderBottom: `2px solid ${tab === key ? colour : 'transparent'}`,
            color: tab === key ? 'var(--text)' : 'var(--text-secondary)',
            fontWeight: tab === key ? 600 : 400, whiteSpace: 'nowrap',
          }}>{label}</button>
        ))}
      </div>

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
                const earliestDate = coachAttendanceDateSettings?.from || (attendanceData.length
                  ? attendanceData.reduce((min, a) => a.session_date < min ? a.session_date : min, attendanceData[0].session_date)
                  : new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0])
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
                      if (!isDateOnHoliday(dateStr, holidays, classId ? [classId] : [])) count++
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
                      if (!isDateOnHoliday(dateStr, holidays, [classId])) possibleSessionKeysForAttendance.add(`${dateStr}::${classId}`)
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
                  { key: 'wellbeing',      label: 'Wellbeing',      icon: '🌱' },
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
                          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, marginBottom: 2, padding: 0, fontFamily: 'var(--font-sans)', appearance: 'none', WebkitAppearance: 'none' }}>✅</button>
                        <div onClick={() => setAttendanceDisplayPct(v => !v)} title="Tap to toggle percentage/numbers"
                          style={{ fontSize: 19, fontWeight: 700, color: colour, cursor: 'pointer' }}>
                          {attendanceDisplayPct
                            ? `${possibleSessions ? Math.round((attendedDayCount / possibleSessions) * 100) : 0}%`
                            : `${attendedDayCount}/${possibleSessions || attendedDayCount}`}
                        </div>
                        <div style={{ fontSize: 9, color: 'var(--text-secondary)' }}>Assigned sessions</div>
                        {coachAttendanceDateSettings && (
                          <div style={{ fontSize: 8, color: 'var(--text-tertiary)' }}>
                            {new Date(coachAttendanceDateSettings.from).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} – {new Date(coachAttendanceDateSettings.to).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                          </div>
                        )}
                      </div>
                      <a href={`/fit2fight?student_id=${student.id}`} className="card" style={{ textAlign: 'center', padding: '12px 8px', cursor: 'pointer', width: '100%', fontFamily: 'var(--font-sans)', background: 'var(--bg-secondary)', textDecoration: 'none', color: 'inherit', display: 'block' }}>
                        <div style={{ fontSize: 22, marginBottom: 4 }}>🔥</div>
                        <div style={{ fontSize: 22, fontWeight: 700, color: '#378ADD' }}>
                          {(() => {
                            const hasContent = v => Array.isArray(v) ? v.length > 0 : (v && typeof v === 'object' ? Object.keys(v).length > 0 : !!v)
                            const activityFields = ['running', 'watt_bike', 'bodyweight', 'stretch_flows', 'snc', 'other_session', 'techniques', 'tactical', 'mentality_log', 'wellbeing', 'test']
                            return sessions.filter(s => activityFields.some(f => hasContent(s[f]))).length
                          })()}
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>F2F Results</div>
                      </a>
                      <button onClick={() => setTab('pdp')} className="card" style={{ textAlign: 'center', padding: '12px 8px', cursor: 'pointer', width: '100%', fontFamily: 'var(--font-sans)', background: 'var(--bg-secondary)', appearance: 'none', WebkitAppearance: 'none' }}>
                        <div style={{ fontSize: 22, marginBottom: 4 }}>🎯</div>
                        <div style={{ fontSize: 22, fontWeight: 700, color: '#EF9F27' }}>
                          {myNotesLog.filter(n => n.note_text?.startsWith('Completed PDP task') && !/weigh/i.test(n.note_text)).length}
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>PDP</div>
                      </button>
                    </div>

                    <div ref={physicalSectionRef}>
                    <button type="button" onClick={togglePhysicalSection} style={{
                      width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                      textAlign: 'center', padding: '10px 8px', marginBottom: 8, cursor: 'pointer', fontFamily: 'var(--font-sans)',
                      background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius)',
                    }}>
                      <span style={{ fontSize: 18 }}>💪</span>
                      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>Physical</span>
                      <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{showPhysicalSection ? '▲' : '▼'}</span>
                    </button>

                    <div style={{
                      overflow: 'hidden', transition: 'max-height 0.35s ease, opacity 0.25s ease',
                      maxHeight: showPhysicalSection ? 4000 : 0, opacity: showPhysicalSection ? 1 : 0,
                    }}>
                    <div style={{ display: 'grid', gridTemplateColumns: activePhysicalCategory && (activePhysicalCategory === 'running' || activePhysicalCategory === 'watt_bike') ? '1fr' : '1fr 1fr', gap: 8, marginBottom: 8 }}>
                      {(!activePhysicalCategory || activePhysicalCategory === 'running') && (
                        <ModuleButton b={modules[0]} sorted={sorted} moduleSubType={moduleSubType} setModuleSubType={setModuleSubType} colour={colour} setTab={setTab} setResultsGraphSection={setResultsGraphSection} studentId={student.id} onToggleLog={togglePhysicalLog} onQuickLog={handleQuickLog} large={activePhysicalCategory === 'running'} />
                      )}
                      {(!activePhysicalCategory || activePhysicalCategory === 'watt_bike') && (
                        <ModuleButton b={modules[1]} sorted={sorted} moduleSubType={moduleSubType} setModuleSubType={setModuleSubType} colour={colour} setTab={setTab} setResultsGraphSection={setResultsGraphSection} studentId={student.id} onToggleLog={togglePhysicalLog} onQuickLog={handleQuickLog} large={activePhysicalCategory === 'watt_bike'} />
                      )}
                    </div>
                    {showRunCards && (
                    <div ref={runPanelRef}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: expandedHomeRun ? 10 : 8 }}>
                      {RUN_CATEGORY_CARDS.map(cat => {
                        const complete = todaysRunning.some(e => e.category === cat.key)
                        const active = expandedHomeRun === cat.key
                        return (
                          <button key={cat.key} type="button" onClick={() => openOnlyPhysicalPanel('run', active ? null : cat.key)} style={{
                            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '10px 6px',
                            borderRadius: 'var(--radius)', cursor: 'pointer', fontFamily: 'var(--font-sans)',
                            border: `2px solid ${active ? colour : complete ? '#E24B4A' : 'var(--border)'}`,
                            background: complete ? '#E24B4A12' : 'var(--bg-secondary)',
                          }}>
                            <span style={{ fontSize: 16 }}>{cat.icon}</span>
                            <span style={{ fontSize: 9, fontWeight: 500, color: 'var(--text)', textAlign: 'center', lineHeight: 1.2 }}>{cat.label}</span>
                          </button>
                        )
                      })}
                    </div>
                    {expandedHomeRun && (() => {
                      const entry = todaysRunning.find(e => e.category === expandedHomeRun) || { category: expandedHomeRun, test: '', sets: [] }
                      const upsert = updatedEntry => savePhysicalField('running', [...todaysRunning.filter(e => e.category !== expandedHomeRun), updatedEntry], setTodaysRunning)
                      const presets = RUN_PRESET_TESTS[expandedHomeRun] || []
                      const cat = RUN_CATEGORY_CARDS.find(c => c.key === expandedHomeRun)
                      return (
                        <div className="card" style={{ marginBottom: 8 }}>
                          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
                            <button type="button" className="btn btn-sm" style={{ fontSize: 11 }}
                              onClick={() => savePhysicalField('running', todaysRunning.filter(e => e.category !== expandedHomeRun), setTodaysRunning)}>✕ Clear</button>
                          </div>
                          <div className="field"><label>Specific test</label>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                              {presets.map(t => (
                                <button key={t} type="button" onClick={() => upsert({ ...entry, test: t })}
                                  className="btn btn-sm" style={{ background: entry.test === t ? '#E24B4A20' : undefined, borderColor: entry.test === t ? '#E24B4A' : undefined }}>{t}</button>
                              ))}
                              <input defaultValue={presets.includes(entry.test) ? '' : (entry.test || '')}
                                onBlur={e => e.target.value && upsert({ ...entry, test: e.target.value })}
                                placeholder="Other…" style={{ width: 90, flexShrink: 0 }} />
                            </div>
                            {cat?.hasOnOffInput && (
                              <div style={{ marginTop: 8 }}>
                                <OnOffInput onAdd={val => upsert({ ...entry, test: val })} />
                              </div>
                            )}
                          </div>
                          <div className="field" style={{ marginBottom: 0 }}><label>{cat?.resultLabel || 'Results (time)'}</label>
                            <SetInput key={cat?.key} sets={entry.sets || []} onChange={sets => upsert({ ...entry, sets })}
                              inputType="number" placeholder={cat?.resultLabel ? 'e.g. 2.4' : 'e.g. 12.3'} />
                          </div>
                          {savingPhysical && <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 8 }}>Saving…</p>}
                        </div>
                      )
                    })()}
                    </div>
                    )}

                    {showWattCards && (
                    <div ref={wattPanelRef}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: expandedHomeWatt ? 10 : 8 }}>
                      {WATT_BIKE_GROUPS.map(grp => {
                        const complete = todaysWattBike.some(e => grp.match(e.interval_mode || e.type))
                        const active = expandedHomeWatt === grp.key
                        return (
                          <button key={grp.key} type="button" onClick={() => openOnlyPhysicalPanel('watt', active ? null : grp.key)} style={{
                            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '10px 6px',
                            borderRadius: 'var(--radius)', cursor: 'pointer', fontFamily: 'var(--font-sans)',
                            border: `2px solid ${active ? colour : complete ? '#378ADD' : 'var(--border)'}`,
                            background: complete ? '#378ADD12' : 'var(--bg-secondary)',
                          }}>
                            <span style={{ fontSize: 16 }}>{grp.icon}</span>
                            <span style={{ fontSize: 9, fontWeight: 500, color: 'var(--text)', textAlign: 'center', lineHeight: 1.2 }}>{grp.label}</span>
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
                        <ModuleButton b={modules[2]} sorted={sorted} moduleSubType={moduleSubType} setModuleSubType={setModuleSubType} colour={colour} setTab={setTab} setResultsGraphSection={setResultsGraphSection} studentId={student.id} onToggleLog={togglePhysicalLog} onQuickLog={handleQuickLog} large={activePhysicalCategory === 'bodyweight'} />
                      )}
                      {(!activePhysicalCategory || activePhysicalCategory === 'stretch') && (
                        <ModuleButton b={modules[3]} sorted={sorted} moduleSubType={moduleSubType} setModuleSubType={setModuleSubType} colour={colour} setTab={setTab} setResultsGraphSection={setResultsGraphSection} studentId={student.id} onToggleLog={togglePhysicalLog} onQuickLog={handleQuickLog} large={activePhysicalCategory === 'stretch'} />
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
                            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '10px 6px',
                            borderRadius: 'var(--radius)', cursor: 'pointer', fontFamily: 'var(--font-sans)',
                            border: `2px solid ${active ? colour : complete ? '#1D9E75' : 'var(--border)'}`,
                            background: complete ? '#1D9E7512' : 'var(--bg-secondary)',
                          }}>
                            <span style={{ fontSize: 16 }}>{grp.icon}</span>
                            <span style={{ fontSize: 9, fontWeight: 500, color: 'var(--text)', textAlign: 'center', lineHeight: 1.2 }}>{grp.label}</span>
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
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 8 }}>
                      {STRETCH_FLOWS.map((flow, i) => {
                        const complete = !!todaysStretches[i]
                        return (
                          <button key={i} type="button"
                            onClick={() => { const next = [...todaysStretches]; next[i] = complete ? '' : flow.label; savePhysicalField('stretch_flows', next, setTodaysStretches) }}
                            style={{
                              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '10px 6px',
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

                    <div ref={techniqueSectionRef}>
                    <button type="button" onClick={() => { setShowTechniqueSection(v => { if (v) setExpandedTechniqueCategory(null); return !v }) }} style={{
                      width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                      textAlign: 'center', padding: '10px 8px', marginBottom: 8, cursor: 'pointer', fontFamily: 'var(--font-sans)',
                      background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius)',
                    }}>
                      <span style={{ fontSize: 18 }}>🥊</span>
                      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>Technique</span>
                      <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{showTechniqueSection ? '▲' : '▼'}</span>
                    </button>

                    <div style={{
                      overflow: 'hidden', transition: 'max-height 0.35s ease, opacity 0.25s ease',
                      maxHeight: showTechniqueSection ? 8000 : 0, opacity: showTechniqueSection ? 1 : 0,
                    }}>
                    {TECHNIQUE_STYLES.map(({ style, categories }) => {
                      const hasActiveInThisStyle = Object.keys(categories).some(cat => expandedTechniqueCategory === `${style}::${cat}`)
                      if (expandedTechniqueCategory && !hasActiveInThisStyle) return null
                      return (
                      <div key={style} style={{ marginBottom: 14 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>{style} Techniques</div>
                        <div style={{ display: 'grid', gridTemplateColumns: expandedTechniqueCategory ? '1fr' : 'repeat(3, 1fr)', gap: 8, marginBottom: 8 }}>
                          {Object.keys(categories).filter(cat => !expandedTechniqueCategory || expandedTechniqueCategory === `${style}::${cat}`).map(cat => {
                            const catKey = `${style}::${cat}`
                            const active = expandedTechniqueCategory === catKey
                            const count = todaysTechniques.filter(t => t.style === style && t.category === cat).length
                            return (
                              <button key={cat} type="button"
                                onClick={() => setExpandedTechniqueCategory(active ? null : catKey)}
                                style={{
                                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: active ? '16px 8px' : '10px 6px',
                                  borderRadius: 'var(--radius)', cursor: 'pointer', fontFamily: 'var(--font-sans)',
                                  border: `2px solid ${active ? '#E24B4A' : count ? '#1D9E75' : 'var(--border)'}`,
                                  background: count ? '#1D9E7512' : 'var(--bg-secondary)',
                                }}>
                                <span style={{ fontSize: active ? 14 : 9, fontWeight: active ? 700 : 500, color: 'var(--text)', textAlign: 'center', lineHeight: 1.2 }}>{cat}</span>
                                {count > 0 && <span style={{ fontSize: active ? 10 : 8, color: '#1D9E75' }}>{count} selected</span>}
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
                            </div>
                          )
                        })}
                      </div>
                      )
                    })}
                    {savingPhysical && <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 8 }}>Saving…</p>}
                    </div>
                    </div>

                    <div ref={tacticalSectionRef}>
                    <button type="button" onClick={() => { setShowTacticalSection(v => { if (v) setExpandedTacticalCategory(null); return !v }) }} style={{
                      width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                      textAlign: 'center', padding: '10px 8px', marginBottom: 8, cursor: 'pointer', fontFamily: 'var(--font-sans)',
                      background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius)',
                    }}>
                      <span style={{ fontSize: 18 }}>🧩</span>
                      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>Tactical</span>
                      <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{showTacticalSection ? '▲' : '▼'}</span>
                    </button>

                    <div style={{
                      overflow: 'hidden', transition: 'max-height 0.35s ease, opacity 0.25s ease',
                      maxHeight: showTacticalSection ? 8000 : 0, opacity: showTacticalSection ? 1 : 0,
                    }}>
                    <div style={{ display: 'grid', gridTemplateColumns: expandedTacticalCategory ? '1fr' : 'repeat(3, 1fr)', gap: 8, marginBottom: 8 }}>
                      {(expandedTacticalCategory ? [] : ['__videoAnalysis__']).concat(Object.keys(TACTICAL_CATEGORIES)).filter(cat => !expandedTacticalCategory || expandedTacticalCategory === cat).map(cat => {
                        if (cat === '__videoAnalysis__') {
                          const active = expandedTacticalCategory === cat
                          const complete = !!todaysMentalityLog.videoAnalysis?.type
                          return (
                            <button key={cat} type="button" onClick={() => setExpandedTacticalCategory(active ? null : cat)} style={{
                              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: active ? '16px 8px' : '10px 6px',
                              borderRadius: 'var(--radius)', cursor: 'pointer', fontFamily: 'var(--font-sans)',
                              border: `2px solid ${active ? '#E24B4A' : complete ? '#1D9E75' : 'var(--border)'}`,
                              background: complete ? '#1D9E7512' : 'var(--bg-secondary)',
                            }}>
                              <span style={{ fontSize: active ? 20 : 16 }}>🎥</span>
                              <span style={{ fontSize: active ? 14 : 9, fontWeight: active ? 700 : 500, color: 'var(--text)', textAlign: 'center', lineHeight: 1.2 }}>Video Analysis</span>
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
                              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: active ? '16px 8px' : '10px 6px',
                              borderRadius: 'var(--radius)', cursor: 'pointer', fontFamily: 'var(--font-sans)',
                              border: `2px solid ${active ? '#E24B4A' : count ? '#1D9E75' : 'var(--border)'}`,
                              background: count ? '#1D9E7512' : 'var(--bg-secondary)',
                            }}>
                            <span style={{ fontSize: active ? 14 : 9, fontWeight: active ? 700 : 500, color: 'var(--text)', textAlign: 'center', lineHeight: 1.2 }}>{cat_}</span>
                            {count > 0 && <span style={{ fontSize: active ? 10 : 8, color: '#1D9E75' }}>{count} selected</span>}
                          </button>
                        )
                      })}
                    </div>
                    {expandedTacticalCategory === '__videoAnalysis__' && (
                      <div className="card" style={{ marginBottom: 8 }}>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
                          <button type="button" className="btn btn-sm" onClick={() => clearMentalityQuestion('videoAnalysis')} style={{ fontSize: 11 }}>✕ Clear</button>
                        </div>
                        <div className="field" style={{ marginBottom: 0 }}><label>Type</label>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                            {VIDEO_ANALYSIS_OPTIONS.map(v => (
                              <button key={v} type="button" onClick={() => saveMentalityField('videoAnalysis', () => ({ type: v }))}
                                className="btn btn-sm" style={{ background: todaysMentalityLog.videoAnalysis?.type === v ? '#6D28D920' : undefined, borderColor: todaysMentalityLog.videoAnalysis?.type === v ? '#6D28D9' : undefined }}>{v}</button>
                            ))}
                          </div>
                        </div>
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
                        </div>
                      )
                    })}
                    {savingPhysical && <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 8 }}>Saving…</p>}
                    </div>
                    </div>

                    <div ref={mentalitySectionRef}>
                    <button type="button" onClick={() => { setShowMentalitySection(v => { if (v) setExpandedHomeMentality(null); return !v }) }} style={{
                      width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                      textAlign: 'center', padding: '10px 8px', marginBottom: 8, cursor: 'pointer', fontFamily: 'var(--font-sans)',
                      background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius)',
                    }}>
                      <span style={{ fontSize: 18 }}>🧠</span>
                      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>Mentality</span>
                      <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{showMentalitySection ? '▲' : '▼'}</span>
                    </button>

                    <div style={{
                      overflow: 'hidden', transition: 'max-height 0.35s ease, opacity 0.25s ease',
                      maxHeight: showMentalitySection ? 4000 : 0, opacity: showMentalitySection ? 1 : 0,
                    }}>
                    <div style={{ display: 'grid', gridTemplateColumns: expandedHomeMentality ? '1fr' : 'repeat(3,1fr)', gap: 8, marginBottom: expandedHomeMentality ? 10 : 8 }}>
                      {MENTALITY_QUESTIONS.filter(q => !expandedHomeMentality || expandedHomeMentality === q.key).map(q => {
                        const complete = q.key === 'alterEgo' ? !!(alterEgoWorkbook.topTraits?.some(Boolean) || alterEgoWorkbook.nameOption1) : isMentalityQComplete(q.key, todaysMentalityLog)
                        const active = expandedHomeMentality === q.key
                        return (
                          <button key={q.key} type="button" onClick={() => q.key === 'alterEgo' ? setShowAlterEgoModal(true) : setExpandedHomeMentality(active ? null : q.key)} style={{
                            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: active ? '16px 8px' : '10px 6px',
                            borderRadius: 'var(--radius)', cursor: 'pointer', fontFamily: 'var(--font-sans)',
                            border: `2px solid ${active ? colour : complete ? '#6D28D9' : 'var(--border)'}`,
                            background: complete ? '#6D28D912' : 'var(--bg-secondary)',
                          }}>
                            <span style={{ fontSize: active ? 26 : 16 }}>{q.icon}</span>
                            <span style={{ fontSize: active ? 14 : 9, fontWeight: active ? 700 : 500, color: 'var(--text)', textAlign: 'center', lineHeight: 1.2 }}>{q.label}</span>
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
                          <div className="field" style={{ marginBottom: 0 }}><label>Type</label>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                              {MEDITATION_TYPE_OPTIONS.map(v => (
                                <button key={v} type="button" onClick={() => saveMentalityField('meditation', () => ({ type: v }))}
                                  className="btn btn-sm" style={{ background: todaysMentalityLog.meditation?.type === v ? '#6D28D920' : undefined, borderColor: todaysMentalityLog.meditation?.type === v ? '#6D28D9' : undefined }}>{v}</button>
                              ))}
                            </div>
                          </div>
                        )}
                        {expandedHomeMentality === 'visualisation' && (
                          <div className="field" style={{ marginBottom: 0 }}><label>Type</label>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                              {VISUALISATION_OPTIONS.map(v => (
                                <button key={v} type="button" onClick={() => saveMentalityField('visualisation', () => ({ type: v }))}
                                  className="btn btn-sm" style={{ background: todaysMentalityLog.visualisation?.type === v ? '#6D28D920' : undefined, borderColor: todaysMentalityLog.visualisation?.type === v ? '#6D28D9' : undefined }}>{v}</button>
                              ))}
                            </div>
                          </div>
                        )}
                        {expandedHomeMentality === 'chess' && (
                          <>
                            <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>{todaysMentalityLog.chess?.count || 0} <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--text-secondary)' }}>game{(todaysMentalityLog.chess?.count || 0) === 1 ? '' : 's'} today</span></div>
                            <button type="button" className="btn btn-sm" style={{ width: '100%', justifyContent: 'center', marginBottom: 8 }}
                              onClick={() => saveMentalityField('chess', cur => ({ count: (cur.count || 0) + 1 }))}>+1 game</button>
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
                            <div className="field" style={{ marginBottom: 0 }}><label>Or write a number to add</label>
                              <div style={{ display: 'flex', gap: 6 }}>
                                <input type="number" value={eyeTrackingCustomAdd} onChange={e => setEyeTrackingCustomAdd(e.target.value)} placeholder="e.g. 3" style={{ flex: 1 }} />
                                <button type="button" className="btn btn-sm" disabled={!eyeTrackingCustomAdd}
                                  onClick={() => { saveMentalityField('eyeTracking', cur => ({ count: (cur.count || 0) + parseInt(eyeTrackingCustomAdd || 0) })); setEyeTrackingCustomAdd('') }}>Add</button>
                              </div>
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
                          <div className="field" style={{ marginBottom: 0 }}><label>Type</label>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                              {ACTIVE_RECOVERY_OPTIONS.map(v => (
                                <button key={v} type="button" onClick={() => saveMentalityField('activeRecovery', () => ({ type: v }))}
                                  className="btn btn-sm" style={{ background: todaysMentalityLog.activeRecovery?.type === v ? '#6D28D920' : undefined, borderColor: todaysMentalityLog.activeRecovery?.type === v ? '#6D28D9' : undefined }}>{v}</button>
                              ))}
                            </div>
                          </div>
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
                        {savingMentalityLog && <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 8 }}>Saving…</p>}
                      </div>
                    )}
                    </div>
                    </div>

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
                      width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                      textAlign: 'center', padding: '10px 8px', marginBottom: 8, cursor: 'pointer', fontFamily: 'var(--font-sans)',
                      background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius)',
                    }}>
                      <span style={{ fontSize: 18 }}>🌱</span>
                      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>Wellbeing</span>
                      <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{showWellbeingSection ? '▲' : '▼'}</span>
                    </button>

                    <div style={{
                      overflow: 'hidden', transition: 'max-height 0.35s ease, opacity 0.25s ease',
                      maxHeight: showWellbeingSection ? 6000 : 0, opacity: showWellbeingSection ? 1 : 0,
                    }}>
                    <div style={{ display: 'grid', gridTemplateColumns: expandedHomeWb ? '1fr' : 'repeat(3,1fr)', gap: 8, marginBottom: expandedHomeWb ? 10 : 8 }}>
                      {WELLBEING_QUESTIONS.filter(q => !expandedHomeWb || expandedHomeWb === q.key).map(q => {
                        const complete = isWellbeingQComplete(q.key, todaysWellbeing)
                        const active = expandedHomeWb === q.key
                        return (
                          <button key={q.key} type="button" onClick={() => setExpandedHomeWb(active ? null : q.key)} style={{
                            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: active ? '16px 8px' : '10px 6px',
                            borderRadius: 'var(--radius)', cursor: 'pointer', fontFamily: 'var(--font-sans)',
                            border: `2px solid ${active ? colour : complete ? '#0E9F6E' : 'var(--border)'}`,
                            background: complete ? '#0E9F6E12' : 'var(--bg-secondary)',
                          }}>
                            <span style={{ fontSize: active ? 26 : 16 }}>{q.icon}</span>
                            <span style={{ fontSize: active ? 14 : 9, fontWeight: active ? 700 : 500, color: 'var(--text)', textAlign: 'center', lineHeight: 1.2 }}>{q.label}</span>
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
                      </div>
                    )}
                    </div>
                    </div>
                    <div ref={testSectionRef}>
                    <button type="button" onClick={() => { setShowTestSection(v => { if (v) setExpandedHomeTestCategory(null); return !v }) }} style={{
                      width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                      textAlign: 'center', padding: '10px 8px', marginBottom: 8, cursor: 'pointer', fontFamily: 'var(--font-sans)',
                      background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius)',
                    }}>
                      <span style={{ fontSize: 18 }}>📋</span>
                      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>Test</span>
                      <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{showTestSection ? '▲' : '▼'}</span>
                    </button>

                    <div style={{
                      overflow: 'hidden', transition: 'max-height 0.35s ease, opacity 0.25s ease',
                      maxHeight: showTestSection ? 4000 : 0, opacity: showTestSection ? 1 : 0,
                    }}>
                    <div style={{ display: 'grid', gridTemplateColumns: expandedHomeTestCategory ? '1fr' : 'repeat(3,1fr)', gap: 8, marginBottom: expandedHomeTestCategory ? 10 : 8 }}>
                      {TEST_CATEGORIES.filter(cat => !expandedHomeTestCategory || expandedHomeTestCategory === cat.key).map(cat => {
                        const complete = cat.tests.some(t => todaysTest[t.name] != null && todaysTest[t.name] !== '')
                        const active = expandedHomeTestCategory === cat.key
                        return (
                          <button key={cat.key} type="button" onClick={() => setExpandedHomeTestCategory(active ? null : cat.key)} style={{
                            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: active ? '16px 8px' : '10px 6px',
                            borderRadius: 'var(--radius)', cursor: 'pointer', fontFamily: 'var(--font-sans)',
                            border: `2px solid ${active ? colour : complete ? '#8B5CF6' : 'var(--border)'}`,
                            background: complete ? '#8B5CF612' : 'var(--bg-secondary)',
                          }}>
                            <span style={{ fontSize: active ? 26 : 16 }}>{cat.icon}</span>
                            <span style={{ fontSize: active ? 14 : 9, fontWeight: active ? 700 : 500, color: 'var(--text)', textAlign: 'center', lineHeight: 1.2 }}>{cat.label}</span>
                          </button>
                        )
                      })}
                    </div>

                    {expandedHomeTestCategory && (() => {
                      const cat = TEST_CATEGORIES.find(c => c.key === expandedHomeTestCategory)
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
                        </div>
                      )
                    })()}
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

                    {points.length > 0 && (
                      <div className="card" style={{ padding: 0, marginBottom: 14 }}>
                        <div style={{ padding: '10px 14px', fontWeight: 600, fontSize: 13, borderBottom: '1px solid var(--border)' }}>Recent points</div>
                        <table><tbody>
                          {points.slice(0,5).map((p,i) => (
                            <tr key={i}>
                              <td style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{new Date(p.awarded_at).toLocaleDateString('en-GB')}</td>
                              <td style={{ fontSize: 13 }}>{p.point_type}</td>
                              <td style={{ textAlign: 'right', fontWeight: 700, color: p.points_awarded < 0 ? '#a32d2d' : '#1d9e75' }}>{p.points_awarded > 0 ? '+' : ''}{p.points_awarded}</td>
                            </tr>
                          ))}
                        </tbody></table>
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
              return !isDateOnHoliday(dateStr, holidays, classIdsThatDay)
            })
        )
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

        return (
          <div>
            {checkedInMsg ? (
              <div className="card" style={{ textAlign: 'center', padding: 12, marginBottom: 14, background: '#1D9E7515', border: '1px solid #1D9E7530', color: '#1D9E75', fontWeight: 600, fontSize: 14 }}>
                {checkedInMsg}
              </div>
            ) : activeCheckIn ? (
              <div style={{ marginBottom: 14 }}>
                <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', padding: 12, fontSize: 14, background: '#E24B4A', borderColor: '#E24B4A' }}
                  onClick={checkOutNow} disabled={checkingIn}>
                  🚪 Check out
                </button>
                <p style={{ fontSize: 11, color: 'var(--text-tertiary)', textAlign: 'center', marginTop: 6 }}>
                  Checked in {new Date(activeCheckIn.attended_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}{activeCheckIn.attendance_type === 'full_kit' ? ' — Full Kit' : ''}
                </p>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center', padding: 12, fontSize: 14 }}
                  onClick={() => checkInNow('attended')} disabled={checkingIn}>
                  ✅ Check in
                </button>
                <button className="btn" style={{ flex: 1, justifyContent: 'center', padding: 12, fontSize: 14 }}
                  onClick={() => checkInNow('full_kit')} disabled={checkingIn}>
                  ✅ Full Kit
                </button>
              </div>
            )}
            <div className="card" style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 8 }}>
                <button className="btn btn-sm" onClick={() => setSessionsCalMonth(m => m.month === 0 ? { year: m.year - 1, month: 11 } : { year: m.year, month: m.month - 1 })}>←</button>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{new Date(year, month, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</span>
                <input type="month" value={`${year}-${String(month+1).padStart(2,'0')}`}
                  onChange={e => { const [y, m] = e.target.value.split('-').map(Number); if (y && m) setSessionsCalMonth({ year: y, month: m - 1 }) }}
                  style={{ fontSize: 11, padding: '4px 6px', border: '1px solid var(--border-strong)', borderRadius: 6, background: 'var(--bg-secondary)', color: 'var(--text)' }} />
                <button className="btn btn-sm" onClick={() => setSessionsCalMonth(m => m.month === 11 ? { year: m.year + 1, month: 0 } : { year: m.year, month: m.month + 1 })}>→</button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 6 }}>
                {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d => (
                  <div key={d} style={{ textAlign: 'center', fontSize: 10, color: 'var(--text-tertiary)', fontWeight: 600 }}>{d}</div>
                ))}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
                {cells.map((d, i) => {
                  if (d === null) return <div key={i} />
                  const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`
                  const attended = attendedDays.has(dateStr)
                  const explicitlyAbsent = explicitlyAbsentDays.has(dateStr)
                  const wasTrainingDay = allTrainingDays.has(dateStr)
                  const showAsRed = explicitlyAbsent || (wasTrainingDay && !attended && dateStr < todayStr)
                  const jsDay = new Date(year, month, d).getDay()
                  const classesToday = assignedClasses.filter(a => (DAY_TO_JS_DAYS[a.classes?.day_of_week] || []).includes(jsDay) && !isDateOnHoliday(dateStr, holidays, a.classes?.id ? [a.classes.id] : []))
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
                    <div key={i}
                      title={(attended ? 'Attended' : showAsRed ? 'Missed' : (wasTrainingDay && dateStr === todayStr) ? 'Upcoming session — not yet happened' : '')
                        + (classesToday.length ? `\nClass: ${classesToday.map(a => `${a.classes?.name} ${a.classes?.start_time?.slice(0,5)}`).join(', ')}` : '')
                        + (pdpItemsToday.length ? `\nPDP: ${pdpItemsToday.map(e => `${e.item}${e.time ? ` ${e.time}` : ''}`).join(', ')}` : '')
                        + (eventsToday.length ? `\nEvent: ${eventsToday.map(e => `${e.title}${e.event_time ? ` ${e.event_time.slice(0,5)}` : ''}`).join(', ')}` : '')}
                      style={{
                        aspectRatio: '0.85', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        borderRadius: 6, fontSize: 12, background: bg, color: fg, fontFamily: 'var(--font-sans)',
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

      {showWeightCheckPrompt && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}>
          <div className="card" style={{ width: 320, padding: 20 }}>
            <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>
              {showWeightCheckPrompt === 'in' ? 'Weight check — check in' : 'Weight check — check out'}
            </h2>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 14 }}>
              Enter your weight now, or skip if you'd rather not log it this time.
            </p>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16 }}>
              <input type="number" step="0.1" inputMode="decimal" autoFocus value={weightCheckValue} onChange={e => setWeightCheckValue(e.target.value)}
                placeholder="Weight" style={{ flex: 1 }} />
              <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>kg</span>
            </div>
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
          {!student ? <p style={{ color: 'var(--text-secondary)' }}>No student record linked.</p> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {!PDP_SECTIONS.some(section => section.key !== 'athlete_notes' && (shared[section.key] || []).length > 0) && (
                <div className="card" style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '20px 16px' }}>
                  <div style={{ fontSize: 24, marginBottom: 6 }}>🎯</div>
                  <p style={{ fontSize: 13, fontWeight: 500, marginBottom: 2 }}>No PDP added yet</p>
                  <p style={{ fontSize: 12 }}>Your coach hasn't shared any development plan notes for you yet — check back after your next assessment.</p>
                </div>
              )}
              {PDP_SECTIONS.map(section => {
                const items = section.key === 'athlete_notes' ? (pdp.athlete_notes || []) : (shared[section.key] || [])
                if (section.key !== 'athlete_notes' && !items.length) return null
                return (
                  <div key={section.key} className="card" style={{ borderLeft: `3px solid ${section.colour}` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <h3 style={{ fontSize: 13, fontWeight: 600, color: section.colour, margin: 0 }}>{section.label}</h3>
                      {section.key === 'athlete_notes' && (
                        <button className="btn btn-sm" style={{ fontSize: 10 }} onClick={() => { setEditNote(true); setNoteText(items[0] || '') }}>
                          {items.length ? 'Edit' : '+ Add'}
                        </button>
                      )}
                    </div>
                    {editNote && section.key === 'athlete_notes' ? (
                      <div>
                        <textarea rows={4} value={noteText} onChange={e => setNoteText(e.target.value)}
                          style={{ width: '100%', padding: '8px', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius)', fontSize: 13, resize: 'vertical', background: 'var(--bg-secondary)', color: 'var(--text)' }} />
                        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                          <button className="btn btn-sm" onClick={() => setEditNote(false)}>Cancel</button>
                          <button className="btn btn-primary btn-sm" onClick={() => saveNote(noteText)} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {items.length > 0 ? items.map((item, i) => (
                          <span key={i} style={{ background: section.colour + '15', color: section.colour, borderRadius: 20, padding: '4px 10px', fontSize: 12 }}>{item}</span>
                        )) : <span style={{ fontSize: 12, color: 'var(--text-tertiary)', fontStyle: 'italic' }}>No notes yet</span>}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Media ── */}
      {tab === 'media' && (
        <div>
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
              {myNotesLog.map(note => (
                <div key={note.id} className="card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 4 }}>
                        {new Date(note.logged_at).toLocaleDateString('en-GB')} · {new Date(note.logged_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                      </div>
                      <p style={{ fontSize: 13, lineHeight: 1.5, margin: 0, whiteSpace: 'pre-line' }}>{note.note_text}</p>
                    </div>
                    <button onClick={() => deleteNote(note.id)} title="Delete note"
                      style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: 16, flexShrink: 0 }}>×</button>
                  </div>
                </div>
              ))}
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

      {/* ── TTP (read-only summary — dedicated form will be integrated better later) ── */}
      {tab === 'tpt' && (
        <div>
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
      {tab === 'analysis' && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Link to="/kickboxing-tpt" className="card" style={{ textDecoration: 'none', textAlign: 'center', padding: 20, color: '#378ADD' }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>📊</div>
              <div style={{ fontWeight: 600 }}>Kickboxing TTP</div>
            </Link>
            <Link to="/boxing-tpt" className="card" style={{ textDecoration: 'none', textAlign: 'center', padding: 20, color: '#E24B4A' }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>📊</div>
              <div style={{ fontWeight: 600 }}>Boxing TTP</div>
            </Link>
            <Link to="/grading" className="card" style={{ textDecoration: 'none', textAlign: 'center', padding: 20, color: '#1D9E75' }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>🎽</div>
              <div style={{ fontWeight: 600 }}>Grading</div>
            </Link>
          </div>
        </div>
      )}

      {/* ── Fit II Fight ── */}
      {tab === 'fit2fight' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{sessions.length} sessions</p>
            <Link to="/fit2fight" className="btn btn-primary btn-sm">+ Log session</Link>
          </div>
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
                const GRAPH_SECTION_KEYS = ['weight', 'watt_bike', 'running', 'bleep', 'grip', 'circuit', 'bodyweight', 'techniques']
                const GRAPH_SECTION_LABELS = ['Weight', 'Watt bike', 'Running', 'Bleep test', 'Grip test', 'Fixed load circuit', 'Bodyweight', 'Techniques']
                function sessionMatchesGraphSection(s, key) {
                  switch (key) {
                    case 'weight':     return !!(s.weight_before || s.weight_after)
                    case 'watt_bike':  return !!s.watt_bike
                    case 'running':    return !!s.running
                    case 'bleep':      return !!(s.test && Object.keys(s.test).some(k => k.toLowerCase().includes('bleep')))
                    case 'grip':       return !!(s.test && Object.keys(s.test).some(k => k.toLowerCase().includes('grip')))
                    case 'circuit':    return !!(s.test && Object.keys(s.test).some(k => k.toLowerCase().includes('fixed load circuit')))
                    case 'bodyweight': return !!s.bodyweight
                    case 'techniques': return Array.isArray(s.techniques?.sets) && s.techniques.sets.length > 0
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
                  { key: 'weight', label: '⚖️ Weight' },
                  { key: 'watt_bike', label: '🚴 Watt bike' },
                  { key: 'running', label: '🏃 Running' },
                  { key: 'bleep', label: '🏃 Bleep test' },
                  { key: 'grip', label: '✊ Grip test' },
                  { key: 'circuit', label: '⭕ Fixed load circuit' },
                  { key: 'bodyweight', label: '💪 Bodyweight' },
                  { key: 'techniques', label: '🥋 Techniques' },
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

                    {resultsGraphSection === 0 && (weightData.length > 1 ? (
                      <div className="card" style={{ marginBottom: 12, position: 'relative' }}>
                        <Link to={`/fit2fight?student_id=${student.id}`} className="btn btn-sm" style={{ position: 'absolute', top: 12, right: 12, fontSize: 11, zIndex: 1 }}>+ Log</Link>
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

                    <div style={{ display: resultsGraphSection === 1 ? 'block' : 'none' }}>
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
                          <Link to={`/fit2fight?student_id=${student.id}&module=watt_bike`} className="btn btn-sm" style={{ position: 'absolute', top: 12, right: 12, fontSize: 11, zIndex: 1 }}>+ Log</Link>
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

                    <div style={{ display: resultsGraphSection === 2 ? 'block' : 'none' }}>
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
                          <Link to={`/fit2fight?student_id=${student.id}&module=running`} className="btn btn-sm" style={{ position: 'absolute', top: 12, right: 12, fontSize: 11, zIndex: 1 }}>+ Log</Link>
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

                    <div style={{ display: resultsGraphSection === 3 ? 'block' : 'none' }}>
                    {(() => {
                      const bleepData = sorted.filter(s => s.test && Object.keys(s.test).some(k => k.toLowerCase().includes('bleep')))
                        .map(s => {
                          const entry = Object.entries(s.test).find(([k]) => k.toLowerCase().includes('bleep'))
                          return { id: s.id, session_date: s.session_date, level: entry ? parseFloat(entry[1]) : null }
                        }).filter(s => s.level != null)
                      return (
                        <div className="card" style={{ marginBottom: 12, position: 'relative' }}>
                          <Link to={`/fit2fight?student_id=${student.id}&module=test`} className="btn btn-sm" style={{ position: 'absolute', top: 12, right: 12, fontSize: 11, zIndex: 1 }}>+ Log</Link>
                          <LineChart data={bleepData} lines={[{ key: 'level', label: 'Bleep test', colour: '#1D9E75' }]} title="🏃 Bleep test over time" unit="" />
                        </div>
                      )
                    })()}
                    </div>

                    <div style={{ display: resultsGraphSection === 4 ? 'block' : 'none' }}>
                    {(() => {
                      const gripData = sorted.filter(s => s.test && Object.keys(s.test).some(k => k.toLowerCase().includes('grip')))
                        .map(s => {
                          const left = Object.entries(s.test).find(([k]) => k.toLowerCase().includes('left') && k.toLowerCase().includes('grip'))
                          const right = Object.entries(s.test).find(([k]) => k.toLowerCase().includes('right') && k.toLowerCase().includes('grip'))
                          return { id: s.id, session_date: s.session_date, left: left ? parseFloat(left[1]) : null, right: right ? parseFloat(right[1]) : null }
                        }).filter(s => s.left != null || s.right != null)
                      return (
                        <div className="card" style={{ marginBottom: 12, position: 'relative' }}>
                          <Link to={`/fit2fight?student_id=${student.id}&module=test`} className="btn btn-sm" style={{ position: 'absolute', top: 12, right: 12, fontSize: 11, zIndex: 1 }}>+ Log</Link>
                          <LineChart data={gripData} lines={[{ key: 'left', label: 'Grip left', colour: '#378ADD' }, { key: 'right', label: 'Grip right', colour: '#E24B4A' }]} title="✊ Grip test over time" unit="kg" />
                        </div>
                      )
                    })()}
                    </div>

                    <div style={{ display: resultsGraphSection === 5 ? 'block' : 'none' }}>
                    {(() => {
                      const circuitData = sorted.filter(s => s.test && Object.keys(s.test).some(k => k.toLowerCase().includes('fixed load circuit')))
                        .map(s => {
                          const entry = Object.entries(s.test).find(([k]) => k.toLowerCase().includes('fixed load circuit'))
                          return { id: s.id, session_date: s.session_date, value: entry ? parseFloat(entry[1]) : null }
                        }).filter(s => s.value != null)
                      return (
                        <div className="card" style={{ marginBottom: 12, position: 'relative' }}>
                          <Link to={`/fit2fight?student_id=${student.id}&module=test`} className="btn btn-sm" style={{ position: 'absolute', top: 12, right: 12, fontSize: 11, zIndex: 1 }}>+ Log</Link>
                          <LineChart data={circuitData} lines={[{ key: 'value', label: 'Fixed load circuit', colour: '#854F0B' }]} title="⭕ Fixed load circuit over time" unit="" />
                        </div>
                      )
                    })()}
                    </div>

                    <div style={{ display: resultsGraphSection === 6 ? 'block' : 'none' }}>
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
                          <Link to={`/fit2fight?student_id=${student.id}&module=bodyweight`} className="btn btn-sm" style={{ position: 'absolute', top: 12, right: 12, fontSize: 11, zIndex: 1 }}>+ Log</Link>
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

                    <div style={{ display: resultsGraphSection === 7 ? 'block' : 'none' }}>
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
                          <Link to={`/fit2fight?student_id=${student.id}&module=techniques`} className="btn btn-sm" style={{ position: 'absolute', top: 12, right: 12, fontSize: 11, zIndex: 1 }}>+ Log</Link>
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
                  </>
                )
              })()}
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
                        {s.running && <p style={{ fontSize: 12, margin: '4px 0' }}>🏃 Running logged</p>}
                        {s.watt_bike && <p style={{ fontSize: 12, margin: '4px 0' }}>🚴 Watt bike logged</p>}
                        {s.bodyweight && <p style={{ fontSize: 12, margin: '4px 0' }}>💪 Bodyweight logged</p>}
                        {s.techniques && <p style={{ fontSize: 12, margin: '4px 0' }}>🥋 Techniques logged</p>}
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
          )}
        </div>
      )}

      {/* ── Points ── */}
      {tab === 'points' && (
        <div>
          <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
            <div className="card" style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ fontSize: 24, fontWeight: 700, color: colour }}>{student?.house_points || 0}</div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>House points</div>
            </div>
            <div className="card" style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ fontSize: 24, fontWeight: 700, color: '#1d9e75' }}>{student?.individual_points || 0}</div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Individual points</div>
            </div>
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
