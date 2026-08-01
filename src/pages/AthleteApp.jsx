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
  function update(i, val) {
    const next = [...sets]
    next[i] = val
    onChange(next)
  }
  function add() { onChange([...sets, '']) }
  function remove(i) { onChange(sets.filter((_, idx) => idx !== i)) }
  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
        {sets.map((s, i) => (
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
  function update(i, field, val) {
    const next = [...sets]
    next[i] = { ...next[i], [field]: val }
    onChange(next)
  }
  function add() { onChange([...sets, Object.fromEntries(fields.map(f => [f.key, '']))]) }
  function remove(i) { onChange(sets.filter((_, idx) => idx !== i)) }
  return (
    <div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 6 }}>
        {sets.map((s, i) => (
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
  { key: 'videoAnalysis',   label: 'Video analysis',   icon: '🎥' },
  { key: 'meditation',      label: 'Meditation',       icon: '🧘' },
  { key: 'visualisation',   label: 'Visualisation',    icon: '🎯' },
  { key: 'chess',           label: 'Play chess',       icon: '♟️' },
  { key: 'reading',         label: 'Reading',          icon: '📖' },
  { key: 'gaming',          label: 'Gaming (combat)',  icon: '🎮' },
  { key: 'eyeTracking',     label: 'Eye tracking drills', icon: '👁' },
  { key: 'coldWater',       label: 'Cold water / Ice bath', icon: '🧊' },
  { key: 'activeRecovery',  label: 'Active recovery day', icon: '🚶' },
  { key: 'gratitude',       label: 'Self gratitude',   icon: '🙏' },
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
        .flatMap(e => (Array.isArray(e.sets) ? e.sets : []).filter(v => v !== '' && v != null).map(v => ({ date: s.session_date, value: v }))))
      higherIsBetter = subType === 'Interval'
      allTypeEntries = entries // different categories mix time vs distance -- PB stays scoped to the selected type
    } else if (key === 'watt_bike') {
      entries = sorted.flatMap(s => toEntries(s.watt_bike)
        .filter(e => !subType || normalizeIntervalMode(e.interval_mode || e.type) === subType)
        .map(e => ({ date: s.session_date, value: numSets(e.sets).length ? Math.max(...numSets(e.sets)) : null }))
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
        .map(e => ({ date: s.session_date, value: numSets(e.sets).length ? Math.max(...numSets(e.sets)) : null }))
        .filter(e => e.value != null))
      unit = ' reps'
      allTypeEntries = sorted.flatMap(s => toEntries(s.bodyweight)
        .map(e => ({ date: s.session_date, value: numSets(e.sets).length ? Math.max(...numSets(e.sets)) : null }))
        .filter(e => e.value != null))
    } else if (key === 'test') {
      entries = subType ? sorted.filter(s => s.test?.[subType] != null).map(s => ({ date: s.session_date, value: s.test[subType] })) : []
      higherIsBetter = !['200m sprint', '1600m time trial', '4800m time trial'].includes(subType)
      allTypeEntries = entries // different tests mix units entirely -- PB stays scoped to the selected test
    } else if (key === 'techniques') {
      const filtered = sorted.filter(s => !subType || s.techniques?.type === subType)
      entries = filtered.map(s => ({ date: s.session_date, value: numSets(s.techniques?.sets).length ? Math.max(...numSets(s.techniques?.sets)) : null })).filter(e => e.value != null)
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
function ModuleButton({ b, sorted, moduleSubType, setModuleSubType, colour, setTab, studentId, onToggleLog, onQuickLog, large }) {
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
      <button onClick={() => setTab('fit2fight')} style={{
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
  const [checkingIn, setCheckingIn]   = useState(false)
  const [checkedInMsg, setCheckedInMsg] = useState(null)
  const [student, setStudent]   = useState(null)
  const [houses, setHouses] = useState([])
  const [rankList, setRankList] = useState([])
  const [truePointTotals, setTruePointTotals] = useState({})
  const [showContribution, setShowContribution] = useState(false)
  const [showOverallPos, setShowOverallPos] = useState(false)
  const [apData, setApData]     = useState(null)
  const [assignedClasses, setAssignedClasses] = useState([])
  const [myNotesLog, setMyNotesLog] = useState([])
  const [tptData, setTptData] = useState({ kickboxing: [], boxing: [] })
  const [newNoteText, setNewNoteText] = useState('')
  const [savingNote, setSavingNote] = useState(false)
  const [myChartPopup, setMyChartPopup] = useState(null)
  const [highlightedMyEntryId, setHighlightedMyEntryId] = useState(null)
  const myPressTimer = useRef(null)
  const myHeldRef = useRef(false)
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
        setPoints(pts || [])
        setSessions(sess || [])
        setAttendanceData(myAtt || [])

        const { data: allAtt } = await supabase.from('attendance')
          .select('student_id, session_date, attendance_type, students(discipline, class_schedule, class_time)')
        setAllAttendance(allAtt || [])

        supabase.from('student_class_assignments').select('id, class_id, classes(*)')
          .eq('student_id', s.id)
          .then(({ data, error }) => { if (!error) setAssignedClasses(data || []) })

        supabase.from('athlete_notes_log').select('*').eq('student_id', s.id).order('logged_at', { ascending: false })
          .then(({ data, error }) => { if (!error) setMyNotesLog(data || []) })

        supabase.from('tpt_kickboxing').select('*').eq('student_id', s.id).order('assessed_at', { ascending: false }).limit(2)
          .then(({ data, error }) => { if (!error) setTptData(prev => ({ ...prev, kickboxing: data || [] })) })
        supabase.from('tpt_boxing').select('*').eq('student_id', s.id).order('assessed_at', { ascending: false }).limit(2)
          .then(({ data, error }) => { if (!error) setTptData(prev => ({ ...prev, boxing: data || [] })) })

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
      nutrition: { targetPreset: '', quality: '' },
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

  async function checkInNow(attendanceType) {
    if (!student) return
    setCheckingIn(true)
    const { error } = await supabase.from('attendance').insert({
      student_id: student.id,
      present: true,
      late: false,
      attendance_type: attendanceType,
      session_date: new Date().toISOString().split('T')[0],
      attended_at: new Date().toISOString(),
    })
    if (error) {
      alert('Error checking in: ' + error.message)
    } else {
      setCheckedInMsg(attendanceType === 'full_kit' ? '✓ Checked in — Full Kit!' : '✓ Checked in!')
      setTimeout(() => setCheckedInMsg(null), 4000)
    }
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
    ['sessions',  '📅 Attendance'],
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
      <div className="card" style={{ marginBottom: 12, borderLeft: `4px solid ${colour}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ width: 64, height: 64, borderRadius: '50%', background: colour + '22', color: colour, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 700, flexShrink: 0 }}>
            {initials}
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            {student ? (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {positionInHouse > 0 && (
                    <button onClick={() => setShowOverallPos(v => !v)}
                      title={showOverallPos ? 'Showing overall position — tap for position in house' : 'Showing position in house — tap for overall position'}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 15, fontWeight: 700, color: colour }}>
                      #{showOverallPos ? overallPosition : positionInHouse}
                    </button>
                  )}
                  <div style={{ fontSize: 20, fontWeight: 700 }}>{m?.first_name} {m?.last_name}</div>
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 3 }}>
                  {student.student_ref} · {student.discipline}{age ? ` · Age ${age}` : ''}{student.pka_belt || student.krba_level ? ` · ${student.pka_belt || student.krba_level}` : ''}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, fontSize: 13 }}>
                  {houseRank > 0 && <span style={{ color: 'var(--text-tertiary)', fontWeight: 600 }}>#{houseRank}</span>}
                  <span style={{ color: colour, fontWeight: 600 }}>{houseName || '—'}</span>
                  {houseTotalPoints != null && <span style={{ color: 'var(--text-tertiary)' }}>({houseTotalPoints} pts)</span>}
                  {student.house_points != null && (
                    <button onClick={() => setShowContribution(v => !v)}
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

      {student && (
      <div className="card" style={{ padding: 0, marginBottom: 14 }}>
        <div style={{ padding: '10px 14px', fontWeight: 600, fontSize: 13, borderBottom: '1px solid var(--border)' }}>Profile</div>
        {[
          ['Club', student.discipline || '—'],
          ...(student.is_kr ? [['Discipline', student.discipline_codes || '—']] : []),
          [student.discipline === 'KRBA' ? 'Level' : student.is_kr ? 'Experience' : 'Grade',
            student.discipline === 'KRBA' ? (student.krba_level || '—') : student.is_kr ? (student.competition_team || '—') : (student.pka_belt || '—')],
          ['Record', `${student.wins || 0}W ${student.losses || 0}L ${student.draws || 0}D`],
          ['Weight', student.weight_kg ? `${student.weight_kg}kg${student.weight_category ? ` (${student.weight_category})` : ''}` : '—'],
          ['Comp weight', apData?.weight_division || '—'],
          ['Groups', [student.is_kr && 'KR', student.is_pts && 'PTs', student.is_leader && 'Leader', student.is_coach && 'Coach'].filter(Boolean).join(', ') || 'None'],
        ].map(([label, val], i, arr) => (
          <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 14px', borderBottom: i < arr.length - 1 ? '1px solid var(--border)' : 'none', fontSize: 13 }}>
            <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
            <span style={{ fontWeight: 500, textAlign: 'right' }}>{val}</span>
          </div>
        ))}
      </div>
      )}

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
                const matchesScope = att => {
                  if (scopeLabel === 'All sessions') return true
                  if (scopeLabel === student.discipline) return att?.students?.discipline === student.discipline
                  return att?.students?.class_schedule === student.class_schedule && att?.students?.class_time === student.class_time
                }
                const possibleSessions = new Set((allAttendance || []).filter(matchesScope).map(a => a?.session_date)).size

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
                      <div className="card" style={{ textAlign: 'center', padding: '10px 4px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2, background: 'var(--bg-secondary)' }}>
                        <button onClick={() => setF2fStatsScope(v => v - 1)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: 'var(--text-tertiary)', padding: 4, appearance: 'none', WebkitAppearance: 'none', fontFamily: 'var(--font-sans)' }}>◀</button>
                        <div style={{ flex: 1 }}>
                          <button onClick={() => setTab('sessions')} title="View Sessions tab"
                            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, marginBottom: 2, padding: 0, fontFamily: 'var(--font-sans)', appearance: 'none', WebkitAppearance: 'none' }}>✅</button>
                          <div onClick={() => setAttendanceDisplayPct(v => !v)} title="Tap to toggle percentage/numbers"
                            style={{ fontSize: 19, fontWeight: 700, color: colour, cursor: 'pointer' }}>
                            {attendanceDisplayPct
                              ? `${possibleSessions ? Math.round((attendanceData.length / possibleSessions) * 100) : 0}%`
                              : `${attendanceData.length}/${possibleSessions || attendanceData.length}`}
                          </div>
                          <div style={{ fontSize: 9, color: 'var(--text-secondary)' }}>{scopeLabel}</div>
                        </div>
                        <button onClick={() => setF2fStatsScope(v => v + 1)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: 'var(--text-tertiary)', padding: 4, appearance: 'none', WebkitAppearance: 'none', fontFamily: 'var(--font-sans)' }}>▶</button>
                      </div>
                      <button onClick={() => setTab('fit2fight')} className="card" style={{ textAlign: 'center', padding: '12px 8px', cursor: 'pointer', width: '100%', fontFamily: 'var(--font-sans)', background: 'var(--bg)', appearance: 'none', WebkitAppearance: 'none' }}>
                        <div style={{ fontSize: 22, marginBottom: 4 }}>🔥</div>
                        <div style={{ fontSize: 22, fontWeight: 700, color: '#378ADD' }}>
                          {(() => {
                            const hasContent = v => Array.isArray(v) ? v.length > 0 : (v && typeof v === 'object' ? Object.keys(v).length > 0 : !!v)
                            const activityFields = ['running', 'watt_bike', 'bodyweight', 'stretch_flows', 'snc', 'other_session', 'techniques', 'tactical', 'mentality_log', 'wellbeing', 'test']
                            return sessions.filter(s => activityFields.some(f => hasContent(s[f]))).length
                          })()}
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>F2F Results</div>
                      </button>
                      <button onClick={() => setTab('pdp')} className="card" style={{ textAlign: 'center', padding: '12px 8px', cursor: 'pointer', width: '100%', fontFamily: 'var(--font-sans)', background: 'var(--bg)', appearance: 'none', WebkitAppearance: 'none' }}>
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
                        <ModuleButton b={modules[0]} sorted={sorted} moduleSubType={moduleSubType} setModuleSubType={setModuleSubType} colour={colour} setTab={setTab} studentId={student.id} onToggleLog={togglePhysicalLog} onQuickLog={handleQuickLog} large={activePhysicalCategory === 'running'} />
                      )}
                      {(!activePhysicalCategory || activePhysicalCategory === 'watt_bike') && (
                        <ModuleButton b={modules[1]} sorted={sorted} moduleSubType={moduleSubType} setModuleSubType={setModuleSubType} colour={colour} setTab={setTab} studentId={student.id} onToggleLog={togglePhysicalLog} onQuickLog={handleQuickLog} large={activePhysicalCategory === 'watt_bike'} />
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
                            <SetInput sets={entry.sets || []} onChange={sets => upsert({ ...entry, sets })}
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
                        <ModuleButton b={modules[2]} sorted={sorted} moduleSubType={moduleSubType} setModuleSubType={setModuleSubType} colour={colour} setTab={setTab} studentId={student.id} onToggleLog={togglePhysicalLog} onQuickLog={handleQuickLog} large={activePhysicalCategory === 'bodyweight'} />
                      )}
                      {(!activePhysicalCategory || activePhysicalCategory === 'stretch') && (
                        <ModuleButton b={modules[3]} sorted={sorted} moduleSubType={moduleSubType} setModuleSubType={setModuleSubType} colour={colour} setTab={setTab} studentId={student.id} onToggleLog={togglePhysicalLog} onQuickLog={handleQuickLog} large={activePhysicalCategory === 'stretch'} />
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
                                    <SetInput sets={entry.sets || []} onChange={sets => upsertExercise(ex, cur => ({ ...cur, sets }))}
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
                            <SetInput sets={entry.sets || []}
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
                    {TECHNIQUE_STYLES.map(({ style, categories }) => (
                      <div key={style} style={{ marginBottom: 14 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>{style} Techniques</div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 8 }}>
                          {Object.keys(categories).map(cat => {
                            const catKey = `${style}::${cat}`
                            const active = expandedTechniqueCategory === catKey
                            const count = todaysTechniques.filter(t => t.style === style && t.category === cat).length
                            return (
                              <button key={cat} type="button"
                                onClick={() => setExpandedTechniqueCategory(active ? null : catKey)}
                                style={{
                                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '10px 6px',
                                  borderRadius: 'var(--radius)', cursor: 'pointer', fontFamily: 'var(--font-sans)',
                                  border: `2px solid ${active ? '#E24B4A' : count ? '#1D9E75' : 'var(--border)'}`,
                                  background: count ? '#1D9E7512' : 'var(--bg-secondary)',
                                }}>
                                <span style={{ fontSize: 9, fontWeight: 500, color: 'var(--text)', textAlign: 'center', lineHeight: 1.2 }}>{cat}</span>
                                {count > 0 && <span style={{ fontSize: 8, color: '#1D9E75' }}>{count} selected</span>}
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
                    ))}
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
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 8 }}>
                      {Object.keys(TACTICAL_CATEGORIES).map(cat => {
                        const active = expandedTacticalCategory === cat
                        const count = todaysTactical.filter(t => t.category === cat).length
                        return (
                          <button key={cat} type="button"
                            onClick={() => setExpandedTacticalCategory(active ? null : cat)}
                            style={{
                              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '10px 6px',
                              borderRadius: 'var(--radius)', cursor: 'pointer', fontFamily: 'var(--font-sans)',
                              border: `2px solid ${active ? '#E24B4A' : count ? '#1D9E75' : 'var(--border)'}`,
                              background: count ? '#1D9E7512' : 'var(--bg-secondary)',
                            }}>
                            <span style={{ fontSize: 9, fontWeight: 500, color: 'var(--text)', textAlign: 'center', lineHeight: 1.2 }}>{cat}</span>
                            {count > 0 && <span style={{ fontSize: 8, color: '#1D9E75' }}>{count} selected</span>}
                          </button>
                        )
                      })}
                    </div>
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
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: expandedHomeMentality ? 10 : 8 }}>
                      {MENTALITY_QUESTIONS.map(q => {
                        const complete = isMentalityQComplete(q.key, todaysMentalityLog)
                        const active = expandedHomeMentality === q.key
                        return (
                          <button key={q.key} type="button" onClick={() => setExpandedHomeMentality(active ? null : q.key)} style={{
                            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '10px 6px',
                            borderRadius: 'var(--radius)', cursor: 'pointer', fontFamily: 'var(--font-sans)',
                            border: `2px solid ${active ? colour : complete ? '#6D28D9' : 'var(--border)'}`,
                            background: complete ? '#6D28D912' : 'var(--bg-secondary)',
                          }}>
                            <span style={{ fontSize: 16 }}>{q.icon}</span>
                            <span style={{ fontSize: 9, fontWeight: 500, color: 'var(--text)', textAlign: 'center', lineHeight: 1.2 }}>{q.label}</span>
                          </button>
                        )
                      })}
                    </div>

                    {expandedHomeMentality && (
                      <div className="card" style={{ marginBottom: 8 }}>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
                          <button type="button" className="btn btn-sm" onClick={() => clearMentalityQuestion(expandedHomeMentality)} style={{ fontSize: 11 }}>✕ Clear</button>
                        </div>
                        {expandedHomeMentality === 'videoAnalysis' && (
                          <div className="field" style={{ marginBottom: 0 }}><label>Type</label>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                              {VIDEO_ANALYSIS_OPTIONS.map(v => (
                                <button key={v} type="button" onClick={() => saveMentalityField('videoAnalysis', () => ({ type: v }))}
                                  className="btn btn-sm" style={{ background: todaysMentalityLog.videoAnalysis?.type === v ? '#6D28D920' : undefined, borderColor: todaysMentalityLog.videoAnalysis?.type === v ? '#6D28D9' : undefined }}>{v}</button>
                              ))}
                            </div>
                          </div>
                        )}
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
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: expandedHomeWb ? 10 : 8 }}>
                      {WELLBEING_QUESTIONS.map(q => {
                        const complete = isWellbeingQComplete(q.key, todaysWellbeing)
                        const active = expandedHomeWb === q.key
                        return (
                          <button key={q.key} type="button" onClick={() => setExpandedHomeWb(active ? null : q.key)} style={{
                            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '10px 6px',
                            borderRadius: 'var(--radius)', cursor: 'pointer', fontFamily: 'var(--font-sans)',
                            border: `2px solid ${active ? colour : complete ? '#0E9F6E' : 'var(--border)'}`,
                            background: complete ? '#0E9F6E12' : 'var(--bg-secondary)',
                          }}>
                            <span style={{ fontSize: 16 }}>{q.icon}</span>
                            <span style={{ fontSize: 9, fontWeight: 500, color: 'var(--text)', textAlign: 'center', lineHeight: 1.2 }}>{q.label}</span>
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
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: expandedHomeTestCategory ? 10 : 8 }}>
                      {TEST_CATEGORIES.map(cat => {
                        const complete = cat.tests.some(t => todaysTest[t.name] != null && todaysTest[t.name] !== '')
                        const active = expandedHomeTestCategory === cat.key
                        return (
                          <button key={cat.key} type="button" onClick={() => setExpandedHomeTestCategory(active ? null : cat.key)} style={{
                            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '10px 6px',
                            borderRadius: 'var(--radius)', cursor: 'pointer', fontFamily: 'var(--font-sans)',
                            border: `2px solid ${active ? colour : complete ? '#8B5CF6' : 'var(--border)'}`,
                            background: complete ? '#8B5CF612' : 'var(--bg-secondary)',
                          }}>
                            <span style={{ fontSize: 16 }}>{cat.icon}</span>
                            <span style={{ fontSize: 9, fontWeight: 500, color: 'var(--text)', textAlign: 'center', lineHeight: 1.2 }}>{cat.label}</span>
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



                    {apData && (apData.age_division_kickboxing || apData.age_division_boxing || apData.weight_division || apData.top_achievements || (Array.isArray(apData.recent_results) && apData.recent_results.length > 0)) && (
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                        {(apData.age_division_kickboxing || apData.age_division_boxing || apData.weight_division || apData.kode_red_debut) && (
                          <div className="card">
                            <h3 style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, color: colour }}>Competition divisions</h3>
                            {[
                              ['Kickboxing', apData.age_division_kickboxing],
                              ['Boxing', apData.age_division_boxing],
                              ['Weight division', apData.weight_division],
                              ['Kode Red debut', apData.kode_red_debut],
                            ].map(([l, v]) => v && (
                              <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                                <span style={{ color: 'var(--text-secondary)' }}>{l}</span>
                                <span style={{ fontWeight: 500 }}>{v}</span>
                              </div>
                            ))}
                          </div>
                        )}
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
                    {checkedInMsg ? (
                      <div className="card" style={{ textAlign: 'center', padding: 12, background: '#1D9E7515', border: '1px solid #1D9E7530', color: '#1D9E75', fontWeight: 600, fontSize: 14 }}>
                        {checkedInMsg}
                      </div>
                    ) : (
                      <div style={{ display: 'flex', gap: 8 }}>
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
                  { label: 'PDP', icon: '🎯', colour: '#1D9E75', tab: 'pdp' },
                  { label: 'TTP', icon: '📊', colour: '#E24B4A', tab: 'tpt' },
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
                  const showAsRed = explicitlyAbsent || (wasTrainingDay && !attended)
                  const bg = attended ? '#1D9E75' : showAsRed ? '#E24B4A' : 'transparent'
                  const fg = attended || showAsRed ? '#fff' : 'var(--text-secondary)'
                  const jsDay = new Date(year, month, d).getDay()
                  const classesToday = assignedClasses.filter(a => (DAY_TO_JS_DAYS[a.classes?.day_of_week] || []).includes(jsDay))
                  const pdpItemsToday = allPdpEntries.filter(e => e.date === dateStr)
                  const eventsToday = clubEvents.filter(e => e.event_date === dateStr)
                  return (
                    <div key={i}
                      title={(attended ? 'Attended' : showAsRed ? 'Missed' : '')
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
                              style={{ position: 'absolute', left: 2, right: 2, top: `${pct}%`, background: '#378ADD22', border: '1px solid #378ADD', borderRadius: 3, padding: '1px 3px', fontSize: 8, color: '#378ADD', lineHeight: 1.3, zIndex: 1 }}>
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
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <h3 style={{ fontSize: 13, fontWeight: 600 }}>Assigned sessions</h3>
                <button className="btn btn-sm" onClick={() => { setShowAddClass(v => !v); setAddClassSelection('') }}>
                  {showAddClass ? 'Cancel' : '+ Add class'}
                </button>
              </div>
              {showAddClass && (
                <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                  <select value={addClassSelection} onChange={e => setAddClassSelection(e.target.value)} style={{ flex: 1, minWidth: 160 }}>
                    <option value="">— Select a class —</option>
                    {allClasses.filter(cl => !assignedClasses.some(a => a.class_id === cl.id)).map(cl => (
                      <option key={cl.id} value={cl.id}>{cl.name} ({cl.day_of_week} {cl.start_time?.slice(0,5)})</option>
                    ))}
                  </select>
                  <button className="btn btn-sm btn-primary" disabled={!addClassSelection || savingClassAdd} onClick={addClassAssignment}>
                    {savingClassAdd ? '…' : 'Add'}
                  </button>
                </div>
              )}
              {assignedClasses.length === 0 ? (
                <p style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>No classes assigned yet.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {assignedClasses.map(a => (
                    <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: 13 }}>
                      <span>{a.classes?.name} — {a.classes?.day_of_week} {a.classes?.start_time?.slice(0,5)}</span>
                      <button onClick={() => removeClassAssignment(a.id)} style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: 14 }}>×</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )
      })()}

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
              placeholder="Write a note for yourself…" rows={3}
              style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius)', fontSize: 13, background: 'var(--bg-secondary)', color: 'var(--text)', fontFamily: 'var(--font-sans)', resize: 'vertical', marginBottom: 8 }} />
            <button className="btn btn-primary btn-sm" disabled={!newNoteText.trim() || savingNote} onClick={addNote}>
              {savingNote ? 'Saving…' : '+ Log note'}
            </button>
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
                      <p style={{ fontSize: 13, lineHeight: 1.5, margin: 0 }}>{note.note_text}</p>
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
                const weightRows = [...sessions].reverse().filter(s => s.weight_before != null || s.weight_after != null)
                if (weightRows.length < 2) return null
                const w = 560, h = 160, pad = { t: 10, r: 10, b: 20, l: 30 }
                const iw = w - pad.l - pad.r, ih = h - pad.t - pad.b
                const allVals = weightRows.flatMap(s => [s.weight_before, s.weight_after].filter(v => v != null).map(parseFloat))
                const minV = Math.min(...allVals) - 1, maxV = Math.max(...allVals) + 1
                const x = i => pad.l + (weightRows.length > 1 ? (i / (weightRows.length - 1)) * iw : iw / 2)
                const y = v => pad.t + ih - ((v - minV) / (maxV - minV || 1)) * ih
                const linePts = key => weightRows.map((s, i) => s[key] != null ? [x(i), y(parseFloat(s[key]))] : null).filter(Boolean)
                const beforePts = linePts('weight_before'), afterPts = linePts('weight_after')
                return (
                  <div className="card" style={{ marginBottom: 14 }}>
                    <p style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>⚖️ Weight over time</p>
                    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height: 'auto' }}>
                      {beforePts.length >= 2 && <polyline points={beforePts.map(p => p.join(',')).join(' ')} fill="none" stroke="#378ADD" strokeWidth="2" strokeLinejoin="round" />}
                      {afterPts.length >= 2 && <polyline points={afterPts.map(p => p.join(',')).join(' ')} fill="none" stroke="#1D9E75" strokeWidth="2" strokeLinejoin="round" />}
                      {weightRows.map((s, i) => ['weight_before', 'weight_after'].map(key => s[key] == null ? null : (
                        <circle key={`${i}-${key}`} cx={x(i)} cy={y(parseFloat(s[key]))} r="4"
                          fill={key === 'weight_before' ? '#378ADD' : '#1D9E75'} stroke="var(--bg)" strokeWidth="1.5"
                          style={{ cursor: 'pointer', touchAction: 'none' }}
                          onMouseEnter={() => setMyChartPopup({ x: x(i), y: y(parseFloat(s[key])), label: new Date(s.session_date).toLocaleDateString('en-GB'), value: `${s[key]}kg` })}
                          onMouseLeave={() => setMyChartPopup(null)}
                          onPointerDown={() => {
                            // Reversed vs the coach view: press shows the result, hold jumps to the entry
                            myHeldRef.current = false
                            setMyChartPopup({ x: x(i), y: y(parseFloat(s[key])), label: new Date(s.session_date).toLocaleDateString('en-GB'), value: `${s[key]}kg` })
                            myPressTimer.current = setTimeout(() => {
                              myHeldRef.current = true
                              const el = document.getElementById(`my-f2f-entry-${s.id}`)
                              if (el) {
                                el.scrollIntoView({ behavior: 'smooth', block: 'center' })
                                setHighlightedMyEntryId(s.id)
                                setTimeout(() => setHighlightedMyEntryId(cur => cur === s.id ? null : cur), 2000)
                              }
                            }, 400)
                          }}
                          onPointerUp={() => {
                            clearTimeout(myPressTimer.current)
                            if (!myHeldRef.current) setMyChartPopup(null)
                          }}
                          onPointerLeave={() => clearTimeout(myPressTimer.current)}
                        />
                      )))}
                      {myChartPopup && (
                        <g>
                          <rect x={myChartPopup.x - 45} y={myChartPopup.y - 38} width="90" height="30" rx="6" fill="var(--text)" opacity="0.9" />
                          <text x={myChartPopup.x} y={myChartPopup.y - 24} textAnchor="middle" fontSize="9" fill="var(--bg)">{myChartPopup.label}</text>
                          <text x={myChartPopup.x} y={myChartPopup.y - 12} textAnchor="middle" fontSize="11" fontWeight="700" fill="var(--bg)">{myChartPopup.value}</text>
                        </g>
                      )}
                    </svg>
                    <div style={{ display: 'flex', gap: 14, marginTop: 6, fontSize: 11, color: 'var(--text-secondary)' }}>
                      <span><span style={{ display: 'inline-block', width: 8, height: 8, background: '#378ADD', borderRadius: '50%', marginRight: 4 }} />Before</span>
                      <span><span style={{ display: 'inline-block', width: 8, height: 8, background: '#1D9E75', borderRadius: '50%', marginRight: 4 }} />After</span>
                    </div>
                  </div>
                )
              })()}
              <div className="card" style={{ padding: 0 }}>
                <table>
                  <thead><tr><th>Date</th><th style={{ textAlign: 'center' }}>Before</th><th style={{ textAlign: 'center' }}>After</th><th style={{ textAlign: 'center' }}>Change</th></tr></thead>
                  <tbody>
                    {sessions.map((s,i) => {
                      const wc = s.weight_before && s.weight_after ? (parseFloat(s.weight_after) - parseFloat(s.weight_before)).toFixed(1) : null
                      return (
                        <tr key={i} id={`my-f2f-entry-${s.id}`} style={{ outline: highlightedMyEntryId === s.id ? '2px solid #EF9F27' : 'none', transition: 'outline 0.3s' }}>
                          <td style={{ fontSize: 12 }}>{new Date(s.session_date).toLocaleDateString('en-GB')}</td>
                          <td style={{ textAlign: 'center', fontSize: 13 }}>{s.weight_before ? `${s.weight_before}kg` : '—'}</td>
                          <td style={{ textAlign: 'center', fontSize: 13 }}>{s.weight_after  ? `${s.weight_after}kg`  : '—'}</td>
                          <td style={{ textAlign: 'center', fontWeight: 700, color: wc < 0 ? '#1d9e75' : wc > 0 ? '#a32d2d' : 'var(--text-secondary)' }}>
                            {wc ? `${wc > 0 ? '+' : ''}${wc}kg` : '—'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
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
        .or(`first_name.ilike.%${query}%,last_name.ilike.%${query}%`).limit(8)
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
