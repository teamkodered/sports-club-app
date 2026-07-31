import { useState, useEffect, useRef, Fragment } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../hooks/useAuth.jsx'
import StudentProfile from '../components/students/StudentProfile.jsx'

const HOUSE_COLOURS = {
  'Dragon House': '#E24B4A', 'Super House': '#378ADD',
  'Ice House': '#1D9E75',    'Jet House':   '#EF9F27',
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
// results charts already use (running.category/test/sets,
// wattBike.interval_mode/sets, bodyweight.type/sets, stretches[i]), so
// nothing already recorded is affected.
// SnC (Strength and Conditioning) -- generic numbered routine presets,
// since routines vary a lot and are best described by the coach rather
// than picked from a fixed exercise list. A "description" field lets
// the coach write in what the routine actually consists of.
const SNC_ROUTINE_PRESETS = ['Routine 1', 'Routine 2', 'Routine 3', 'Routine 4']

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
const OTHER_SESSION_PRESETS = ['Bout/Comp', 'External Sparring', 'Training in other sport', 'Squad training session']

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

// Maps a class's day_of_week label to actual JS day-of-week numbers
// (0=Sunday...6=Saturday), used to work out which calendar dates an
// athlete's assigned classes actually run on.
const DAY_TO_JS_DAYS = {
  Monday: [1], Tuesday: [2], Wednesday: [3], Thursday: [4], Friday: [5], Saturday: [6], Sunday: [0],
  'Mon/Fri': [1, 5], 'Tue/Thu': [2, 4],
}

// A "day" for the calendar/weekly timetable's visual timeline runs
// 06:00-22:00 (16 hours) -- converts a "HH:MM" time into a 0-100%
// vertical position within that range, clamped to the visible range.
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

// Config for the Athlete Dashboard's team overview -- mirrors the
// same sections/sub-categories shown on a real athlete's Home page,
// but each card shows the team % logged today instead of an
// individual's own log, and drills down into targets rather than
// data entry.
// Team-wide Results table (Coach Dashboard) -- one row per athlete
// session, with show/hide + sort, matching the same pattern as the
// Students page's column picker.
const RESULTS_ALL_COLUMNS = [
  { key: 'athlete', label: 'Athlete' },
  { key: 'date', label: 'Date' },
  { key: 'weight_before', label: 'Weight before' },
  { key: 'weight_after', label: 'Weight after' },
  { key: 'weight_change', label: 'Weight change' },
  { key: 'running', label: 'Running' },
  { key: 'watt_bike', label: 'Watt bike' },
  { key: 'bodyweight', label: 'Bodyweight' },
  { key: 'stretch_flows', label: 'Stretch flows' },
  { key: 'snc', label: 'SnC' },
  { key: 'other_session', label: 'Other session' },
  { key: 'techniques', label: 'Techniques' },
  { key: 'tactical', label: 'Tactical' },
  { key: 'mentality_log', label: 'Mentality' },
  { key: 'wellbeing', label: 'Wellbeing' },
  { key: 'test', label: 'Test' },
]
const RESULTS_DEFAULT_VISIBLE = ['athlete', 'date', 'weight_before', 'weight_after', 'weight_change', 'running', 'watt_bike', 'techniques', 'test']

const DASHBOARD_SECTIONS = [
  { key: 'physical', icon: '💪', label: 'Physical', subItems: [
    { key: 'running', label: 'Running', field: 'running' },
    { key: 'watt_bike', label: 'Watt Bike', field: 'watt_bike' },
    { key: 'bodyweight', label: 'Bodyweight', field: 'bodyweight' },
    { key: 'stretch_flows', label: 'Stretch flows', field: 'stretch_flows' },
    { key: 'snc', label: 'SnC', field: 'snc' },
    { key: 'other_session', label: 'Other session', field: 'other_session' },
  ]},
  { key: 'technique', icon: '🥊', label: 'Technique', subItems: [
    { key: 'Boxing', label: 'Boxing', matchStyle: 'Boxing' },
    { key: 'Kickboxing', label: 'Kickboxing', matchStyle: 'Kickboxing' },
  ]},
  { key: 'tactical', icon: '🧩', label: 'Tactical', subItems: Object.keys(TACTICAL_CATEGORIES).map(cat => ({ key: cat, label: cat, matchCategory: cat })) },
  { key: 'mentality', icon: '🧠', label: 'Mentality', subItems: MENTALITY_QUESTIONS.map(q => ({ key: q.key, label: q.label, mentalityQ: q.key })) },
  { key: 'wellbeing', icon: '🌱', label: 'Wellbeing', subItems: WELLBEING_QUESTIONS.map(q => ({ key: q.key, label: q.label, wellbeingQ: q.key })) },
  { key: 'test', icon: '📋', label: 'Test', subItems: TEST_CATEGORIES.map(c => ({ key: c.key, label: c.label, testCategory: c })) },
]

// Phase 2 of targets: question-level numeric rules. Maps a
// Wellbeing question key to how to pull a genuinely comparable
// number + unit out of the stored data, so a target like "7 hours"
// can be checked against the athlete's actual logged value rather
// than just "did they log something".
//
// Audit note: Nutrition (quality/preset based: Excellent/Good/Poor)
// and Screen free (mixed hour/minute presets) aren't stored as a
// single comparable number today, so they're intentionally left out
// -- they still fall back to simple completion checking until their
// data model is revisited.
const WELLBEING_VALUE_EXTRACTORS = {
  sleep:        { get: w => parseFloat(w?.sleep?.hours), unit: 'hours' },
  hydration:    { get: w => parseFloat(w?.hydration?.total), unit: 'litres' },
  outdoors:     { get: w => parseFloat(w?.outdoors?.totalMinutes), unit: 'mins' },
  talk:         { get: w => parseFloat(w?.talk?.count), unit: 'count' },
  journal:      { get: w => parseFloat(w?.journal?.count), unit: 'count' },
  creative:     { get: w => parseFloat(w?.creative?.count), unit: 'count' },
  productivity: { get: w => parseFloat(w?.productivity?.count), unit: 'count' },
}

// Mentality: chess/reading/gaming/eyeTracking/coldWater/gratitude are
// stored as a simple count, so genuinely comparable. videoAnalysis,
// meditation, visualisation, and activeRecovery are preset/type-based
// (a dropdown choice, not a number) and are left on completion
// checking until their data model captures an actual number.
const MENTALITY_VALUE_EXTRACTORS = {
  chess:       { get: m => parseFloat(m?.chess?.count), unit: 'count' },
  reading:     { get: m => parseFloat(m?.reading?.count), unit: 'count' },
  gaming:      { get: m => parseFloat(m?.gaming?.count), unit: 'count' },
  eyeTracking: { get: m => parseFloat(m?.eyeTracking?.count), unit: 'count' },
  coldWater:   { get: m => parseFloat(m?.coldWater?.count), unit: 'count' },
  gratitude:   { get: m => parseFloat(m?.gratitude?.count), unit: 'count' },
}

// Boxing TTP field -> display label, shared between the Coach
// Dashboard's benchmark form and an athlete's own TTP tab.
const BOX_LABELS = {
  shapes:'Shape(s)', punch_quality:'Punch quality', footwork:'Footwork', defence:'Defence',
  counters:'Counters', attack:'Attack', combinations:'Combinations', change_of_tempo:'Change of tempo',
  use_of_phases:'Use of phases', distance:'Distance', flow:'Flow', self_expression:'Self expression',
  foot_speed:'Foot speed', limb_speed:'Limb speed', combination_speed:'Combination speed', reaction:'Reaction',
  punching_power:'Punching power', strength_upper:'Strength upper', strength_lower:'Strength lower',
  stability_core:'Stability core', agility:'Agility', stop_n_go:'Stop & go',
  stamina_aerobic:'Stamina aerobic', stamina_anaerobic:'Stamina anaerobic',
  suppleness_upper:'Suppleness upper', suppleness_lower:'Suppleness lower',
  recovery:'Recovery', health:'Health', read_opponent:'Read opponent',
  tempo_rhythm:'Tempo / rhythm', tactical_intelligence:'Tactical intelligence',
  ring_awareness:'Ring awareness', know_strengths_weaknesses:'Know S&W',
  heart_grit:'Heart / grit', concentration:'Concentration', timing:'Timing',
}

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
  // Strip trailing "- Output (wattage)" / "- Distance (km)" so the same
  // interval isn't split into separate buckets by that suffix alone
  return s.replace(/\s*-\s*(Output \(wattage\)|Distance \(km\))\s*$/i, '').trim()
}

// Running/Watt bike/Bodyweight now support multiple entries per
// session (like Test does), but existing historic data was saved as a
// single object rather than an array. This normalizes both shapes to
// an array transparently, so nothing already recorded is lost or needs
// migrating -- old single-entry sessions just become a 1-item array.
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

// Compute most-recent + personal-best for a module (optionally filtered
// to one sub-type), defensively -- malformed/legacy session data
// shouldn't be able to crash this page.
function computeModuleStats(sorted, key, subType) {
  try {
    let entries = [], unit = '', higherIsBetter = true
    const numSets = arr => Array.isArray(arr) ? arr.map(v => parseFloat((v && typeof v === 'object') ? v.wattage : v)).filter(v => !isNaN(v)) : []

    if (key === 'running') {
      entries = sorted.flatMap(s => toEntries(s.running)
        .filter(e => !subType || e.category === subType)
        .flatMap(e => (Array.isArray(e.sets) ? e.sets : []).filter(v => v !== '' && v != null).map(v => ({ date: s.session_date, value: v }))))
      higherIsBetter = subType === 'Interval'
    } else if (key === 'watt_bike') {
      entries = sorted.flatMap(s => toEntries(s.watt_bike)
        .filter(e => !subType || normalizeIntervalMode(e.interval_mode || e.type) === subType)
        .map(e => ({ date: s.session_date, value: numSets(e.sets).length ? Math.max(...numSets(e.sets)) : null }))
        .filter(e => e.value != null))
      unit = 'W'
    } else if (key === 'bodyweight') {
      entries = sorted.flatMap(s => toEntries(s.bodyweight)
        .filter(e => !subType || e.type === subType)
        .map(e => ({ date: s.session_date, value: numSets(e.sets).length ? Math.max(...numSets(e.sets)) : null }))
        .filter(e => e.value != null))
      unit = ' reps'
    } else if (key === 'test') {
      entries = subType ? sorted.filter(s => s.test?.[subType] != null).map(s => ({ date: s.session_date, value: s.test[subType] })) : []
      higherIsBetter = !['200m sprint', '1600m time trial', '4800m time trial'].includes(subType)
    } else if (key === 'techniques') {
      const filtered = sorted.filter(s => !subType || s.techniques?.type === subType)
      entries = filtered.map(s => ({ date: s.session_date, value: numSets(s.techniques?.sets).length ? Math.max(...numSets(s.techniques?.sets)) : null }))
        .filter(e => e.value != null)
    }
    const mostRecent = entries[entries.length - 1] || null
    const pb = entries.reduce((best, e) => !best ? e : ((higherIsBetter ? e.value > best.value : e.value < best.value) ? e : best), null)
    return { mostRecent, pb, unit }
  } catch (e) {
    console.error('computeModuleStats error for', key, e)
    return { mostRecent: null, pb: null, unit: '' }
  }
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

const CHART_IDS = { watt_bike: 'f2f-chart-watt_bike', running: 'f2f-chart-running', bodyweight: 'f2f-chart-bodyweight', techniques: 'f2f-chart-techniques' }
const TEST_CHART_IDS = { 'Bleep test': 'f2f-chart-bleep', 'Fixed load circuit': 'f2f-chart-circuit' }

// Defined at module scope (not inside the page component's render) so
// React treats it as a stable component across renders, rather than
// unmounting/remounting it every time the parent re-renders.
function ModuleButton({ b, sorted, moduleSubType, setModuleSubType, colour, setTab, setRunChartFilter, studentId, onToggleLog }) {
  const subTypeOptions = getSubTypeOptions(sorted, b.key)
  const currentSubType = moduleSubType[b.key] ?? subTypeOptions[0] ?? null
  const noNumericStat = ['stretch', 'eye_training', 'one_percenters', 'mentality', 'wellbeing'].includes(b.key)
  const { mostRecent, pb, unit } = noNumericStat ? { mostRecent: null, pb: null, unit: '' } : computeModuleStats(sorted, b.key, currentSubType)
  const lastLogged = noNumericStat ? computeLastLogged(sorted, b.key) : null
  const swipeStart = useRef(null)

  function cycleType(direction = 1) {
    if (!subTypeOptions.length) return
    const idx = subTypeOptions.indexOf(currentSubType)
    const next = subTypeOptions[(idx + direction + subTypeOptions.length) % subTypeOptions.length]
    setModuleSubType(prev => ({ ...prev, [b.key]: next }))
  }

  function goToChart() {
    let targetId = CHART_IDS[b.key]
    if (b.key === 'test' && currentSubType) targetId = TEST_CHART_IDS[currentSubType]
    if (b.key === 'running' && currentSubType) setRunChartFilter('all')
    setTab('fit2fight')
    if (targetId) {
      setTimeout(() => document.getElementById(targetId)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100)
    }
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
        background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius)',
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
          section as the button below the card. For Test, tap scrolls to
          its results chart (icon only, no label/sub-type text -- Test
          has its own dedicated card grid below for logging). Other
          modules keep cycling sub-type on tap too, alongside the
          swipe/arrows above. */}
      <button onClick={() => isPhysicalModule ? onToggleLog?.(b.key) : b.key === 'test' ? goToChart() : cycleType(1)} style={{
        flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2,
        padding: '8px 4px', background: 'none', border: 'none', borderRight: isSimplifiedModule ? 'none' : '1px solid var(--border)',
        cursor: (b.key === 'test' || subTypeOptions.length > 1) ? 'pointer' : 'default',
        minWidth: 0,
      }}>
        <span style={{ fontSize: 16 }}>{b.icon}</span>
        {b.key !== 'test' && <span style={{ fontSize: 9, fontWeight: 500, whiteSpace: 'nowrap' }}>{b.label}</span>}
        {b.key !== 'test' && currentSubType && <span style={{ fontSize: 7, color: colour, fontWeight: 600, textAlign: 'center', lineHeight: 1.2 }}>{currentSubType}</span>}
      </button>

      {/* Right: recent/PB (or last-logged), tap to view results --
          skipped for Wellbeing/Mentality/Test, which have their own
          dedicated card grids below instead. Next arrow sits right
          after it when this card can cycle sub-types. */}
      {!isSimplifiedModule && (
      <button onClick={goToChart} style={{
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

const KB_DIVISIONS  = ['Children', 'Younger Cadet (10-12)', 'Older Cadet (13-15)', 'Junior (16-18)', 'Senior (19-40)', 'Masters (40+)']
const BOX_DIVISIONS = ['Schoolboy', 'Schoolgirl', 'Junior', 'Youth', 'Elite', 'Senior']


// ── PDP Tab Component ──────────────────────────────────────────────────────
// Consistent colour per column TYPE (not per category), so every
// category's Notes/Maintain/To work on/Check column matches visually.
const PDP_COLUMN_COLOURS = { notes: '#666666', maintain: '#1D9E75', work_on: '#EF9F27', what_to_do: '#E24B4A' }

const PDP_SECTIONS = [
  { key: 'winning_ways',          label: '🏆 Winning ways',             colour: '#1D9E75', coachOnly: false },
  { key: 'what_to_do',            label: '📋 What to do (general)',      colour: '#8B5CF6', coachOnly: false },
  { key: 'psychology_notes',      label: 'Notes',        colour: PDP_COLUMN_COLOURS.notes,      coachOnly: true },
  { key: 'psychology_maintain',   label: 'Maintain',     colour: PDP_COLUMN_COLOURS.maintain,   coachOnly: true },
  { key: 'psychology_work_on',    label: 'Work on',      colour: PDP_COLUMN_COLOURS.work_on,    coachOnly: true },
  { key: 'psychology_what_to_do', label: 'To do',        colour: PDP_COLUMN_COLOURS.what_to_do, coachOnly: true },
  { key: 'tech_notes',            label: 'Notes',         colour: PDP_COLUMN_COLOURS.notes,      coachOnly: true },
  { key: 'tech_maintain',         label: 'Maintain',      colour: PDP_COLUMN_COLOURS.maintain,   coachOnly: true },
  { key: 'tech_work_on',          label: 'Work on',       colour: PDP_COLUMN_COLOURS.work_on,    coachOnly: true },
  { key: 'tech_what_to_do',       label: 'To do',         colour: PDP_COLUMN_COLOURS.what_to_do, coachOnly: true },
  { key: 'tact_notes',            label: 'Notes',          colour: PDP_COLUMN_COLOURS.notes,      coachOnly: true },
  { key: 'tact_maintain',         label: 'Maintain',       colour: PDP_COLUMN_COLOURS.maintain,   coachOnly: true },
  { key: 'tact_work_on',          label: 'Work on',        colour: PDP_COLUMN_COLOURS.work_on,    coachOnly: true },
  { key: 'tact_what_to_do',       label: 'To do',          colour: PDP_COLUMN_COLOURS.what_to_do, coachOnly: true },
  { key: 'physical_notes',        label: 'Notes',          colour: PDP_COLUMN_COLOURS.notes,      coachOnly: true },
  { key: 'physical_maintain',     label: 'Maintain',       colour: PDP_COLUMN_COLOURS.maintain,   coachOnly: true },
  { key: 'physical_work_on',      label: 'Work on',        colour: PDP_COLUMN_COLOURS.work_on,    coachOnly: true },
  { key: 'physical_what_to_do',   label: 'To do',          colour: PDP_COLUMN_COLOURS.what_to_do, coachOnly: true },
  { key: 'skill_notes',           label: 'Notes',             colour: PDP_COLUMN_COLOURS.notes,      coachOnly: true },
  { key: 'skill_maintain',        label: 'Maintain',          colour: PDP_COLUMN_COLOURS.maintain,   coachOnly: true },
  { key: 'skill_work_on',         label: 'Work on',           colour: PDP_COLUMN_COLOURS.work_on,    coachOnly: true },
  { key: 'skill_what_to_do',      label: 'To do',             colour: PDP_COLUMN_COLOURS.what_to_do, coachOnly: true },
  { key: 'athlete_notes',         label: '📝 Your notes',                colour: '#185FA5', coachOnly: false },
  { key: 'notes',                 label: '📝 Coach notes',               colour: '#666666', coachOnly: true  },
]

// Groups of 4 sections (Notes / Maintain / To work on / Check) shown
// as a horizontally-scrollable row for each category, 3 visible at a
// time, coach view.
const PDP_CATEGORY_GROUPS = [
  { label: 'Psychology', keys: ['psychology_notes', 'psychology_maintain', 'psychology_work_on', 'psychology_what_to_do'] },
  { label: 'Technical',  keys: ['tech_notes', 'tech_maintain', 'tech_work_on', 'tech_what_to_do'] },
  { label: 'Tactical',   keys: ['tact_notes', 'tact_maintain', 'tact_work_on', 'tact_what_to_do'] },
  { label: 'Physical',   keys: ['physical_notes', 'physical_maintain', 'physical_work_on', 'physical_what_to_do'] },
  { label: 'Skill',      keys: ['skill_notes', 'skill_maintain', 'skill_work_on', 'skill_what_to_do'] },
]
// "Check" columns get checkable pills to mark items done
const PDP_CHECKABLE_SECTIONS = new Set(PDP_CATEGORY_GROUPS.flatMap(g => g.keys.filter(k => k.endsWith('what_to_do'))))
// Checking off a Check item moves it to that category's Maintain list
const PDP_MAINTAIN_FOR_CHECK = Object.fromEntries(
  PDP_CATEGORY_GROUPS.map(g => [g.keys.find(k => k.endsWith('what_to_do')), g.keys.find(k => k.endsWith('maintain'))]).filter(([c]) => c)
)
// Checking off a Maintain item moves it to the Notes log as a completed PDP task
const PDP_MAINTAIN_SECTIONS = new Set(PDP_CATEGORY_GROUPS.map(g => g.keys.find(k => k.endsWith('maintain'))).filter(Boolean))

function PDPTab({ apData, setApData, student, isAdmin }) {
  const [pdpView, setPdpView]       = useState('coach') // 'coach' | 'athlete' | 'split'
  const [editSection, setEditSection] = useState(null)
  const editingCardRef = useRef(null)
  const [editItems, setEditItems]   = useState([])
  const [newItem, setNewItem]       = useState('')
  const [saving, setSaving]         = useState(false)
  const [sendModal, setSendModal]   = useState(null)
  const [timetableModal, setTimetableModal] = useState(null) // { sectionKey, item } when picking a day/time to send
  const [timetableDraftDate, setTimetableDraftDate] = useState('')
  const [timetableDraftTime, setTimetableDraftTime] = useState('')
  const [pdpHistory, setPdpHistory] = useState([]) // for undo
  const [editSectionMeta, setEditSectionMeta] = useState(null) // {key, label, colour}
  const [clipboard, setClipboard] = useState(null)
  const [selectedItems, setSelectedItems] = useState([]) // multi-select indices
  const [selectionAnchor, setSelectionAnchor] = useState(null) // last plain/ctrl-clicked index, for shift-click ranges
  const pillClickTimer = useRef(null)
  const [customSections, setCustomSections] = useState([]) // user-added sections

  const pdp = apData?.pdp_notes || {}

  function isHighlighted(sectionKey, item) {
    return (pdp[`__highlights_${sectionKey}`] || []).includes(item)
  }

  async function toggleHighlight(sectionKey, item) {
    const key = `__highlights_${sectionKey}`
    const current = pdp[key] || []
    const updated = current.includes(item) ? current.filter(x => x !== item) : [...current, item]
    const newPdp = { ...pdp, [key]: updated }
    const { error } = await supabase.from('athlete_profiles').upsert({ student_id: student.id, pdp_notes: newPdp }, { onConflict: 'student_id' })
    if (error) { alert('Error highlighting note: ' + error.message); return }
    setApData(a => ({ ...a, pdp_notes: newPdp }))
  }

  function notePillStyle(sc, sectionKey, item, base = {}) {
    const hl = isHighlighted(sectionKey, item)
    const done = PDP_CHECKABLE_SECTIONS.has(sectionKey) && isCompleted(sectionKey, item)
    return {
      ...base,
      background: done ? '#1D9E7520' : sc + '15', color: done ? '#1D9E75' : sc, borderRadius: 20,
      padding: hl ? '6px 14px' : (base.padding || '2px 8px'),
      fontSize: hl ? (base.fontSize || 11) * 2 : (base.fontSize || 11),
      fontWeight: hl ? 700 : (base.fontWeight || 400),
      textDecoration: done ? 'line-through' : 'none',
      wordBreak: 'break-word', overflowWrap: 'break-word',
    }
  }

  function isCompleted(sectionKey, item) {
    return (pdp[`__completed_${sectionKey}`] || []).includes(item)
  }

  async function toggleCompleted(sectionKey, item) {
    const key = `__completed_${sectionKey}`
    const current = pdp[key] || []
    const isCompleting = !current.includes(item)

    // Checking off a Check ("what to do") item moves it into that same
    // category's Maintain list, rather than just marking it done.
    const maintainKey = PDP_MAINTAIN_FOR_CHECK[sectionKey]
    if (isCompleting && maintainKey) {
      const updated = {
        ...pdp,
        [sectionKey]: (pdp[sectionKey] || []).filter(i => i !== item),
        [maintainKey]: [...(pdp[maintainKey] || []), item],
        [key]: current.filter(i => i !== item),
      }
      const { error } = await supabase.from('athlete_profiles').upsert({ student_id: student.id, pdp_notes: updated }, { onConflict: 'student_id' })
      if (error) { alert('Error moving to maintain: ' + error.message); return }
      setApData(a => ({ ...a, pdp_notes: updated }))
      return
    }

    const updated = current.includes(item) ? current.filter(x => x !== item) : [...current, item]
    const newPdp = { ...pdp, [key]: updated }
    const { error } = await supabase.from('athlete_profiles').upsert({ student_id: student.id, pdp_notes: newPdp }, { onConflict: 'student_id' })
    if (error) { alert('Error updating: ' + error.message); return }
    setApData(a => ({ ...a, pdp_notes: newPdp }))
  }

  // Checking off a Maintain item removes it from Maintain and logs it
  // to the Notes tab as a dated "Completed PDP task".
  async function completeMaintainItem(sectionKey, item) {
    const updated = { ...pdp, [sectionKey]: (pdp[sectionKey] || []).filter(i => i !== item) }
    const { error } = await supabase.from('athlete_profiles').upsert({ student_id: student.id, pdp_notes: updated }, { onConflict: 'student_id' })
    if (error) { alert('Error updating maintain list: ' + error.message); return }
    const { error: err2 } = await supabase.from('athlete_notes_log').insert({
      student_id: student.id, note_text: `Completed PDP task: ${item}`,
    })
    if (err2) { alert('Error logging completed task: ' + err2.message); return }
    setApData(a => ({ ...a, pdp_notes: updated }))
  }

  // "What to do" (Check) notes can be sent to the athlete's timetable/
  // calendar with a chosen day + time. Sent notes are stored per
  // section as { [noteText]: { date, time } } and are darkened in the
  // PDP view once sent; pressing a sent note then checks it off
  // instead of re-opening the send picker.
  function timetableEntry(sectionKey, item) {
    return (pdp[`__timetable_${sectionKey}`] || {})[item] || null
  }

  async function sendNoteToTimetable() {
    if (!timetableModal || !timetableDraftDate) return
    const { sectionKey, item } = timetableModal
    const key = `__timetable_${sectionKey}`
    const current = pdp[key] || {}
    const dayName = new Date(timetableDraftDate + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long' })
    const timetable = { ...(pdp.timetable || {}) }
    const entryText = timetableDraftTime ? `${timetableDraftTime} — ${item}` : item
    // Avoid duplicating if this exact note was already sent to this day
    const existingDay = timetable[dayName] || []
    if (!existingDay.includes(entryText)) timetable[dayName] = [...existingDay, entryText]

    const updated = {
      ...pdp,
      [key]: { ...current, [item]: { date: timetableDraftDate, time: timetableDraftTime || null, day: dayName } },
      timetable,
    }
    const { error } = await supabase.from('athlete_profiles').upsert({ student_id: student.id, pdp_notes: updated }, { onConflict: 'student_id' })
    if (error) { alert('Error sending to timetable: ' + error.message); return }
    setApData(a => ({ ...a, pdp_notes: updated }))
    setTimetableModal(null)
    setTimetableDraftDate('')
    setTimetableDraftTime('')
  }

  async function removeFromTimetable(sectionKey, item) {
    const key = `__timetable_${sectionKey}`
    const current = { ...(pdp[key] || {}) }
    const entry = current[item]
    delete current[item]
    const timetable = { ...(pdp.timetable || {}) }
    if (entry?.day) {
      const entryText = entry.time ? `${entry.time} — ${item}` : item
      timetable[entry.day] = (timetable[entry.day] || []).filter(t => t !== entryText)
    }
    const updated = { ...pdp, [key]: current, timetable }
    const { error } = await supabase.from('athlete_profiles').upsert({ student_id: student.id, pdp_notes: updated }, { onConflict: 'student_id' })
    if (error) { alert('Error removing from timetable: ' + error.message); return }
    setApData(a => ({ ...a, pdp_notes: updated }))
  }

  // All PDP items sent to the timetable, across every category's Check
  // column, for looking up what's scheduled on a given calendar date.
  function allTimetableEntries() {
    const out = []
    PDP_CHECKABLE_SECTIONS.forEach(sectionKey => {
      const map = pdp[`__timetable_${sectionKey}`] || {}
      Object.entries(map).forEach(([item, entry]) => out.push({ sectionKey, item, ...entry }))
    })
    return out
  }
  // Restore custom sections from saved meta keys
  useEffect(() => {
    if (!pdp) return
    const saved = Object.keys(pdp)
      .filter(k => k.startsWith('__meta_'))
      .map(k => {
        const key = k.replace('__meta_', '')
        if (PDP_SECTIONS.find(s => s.key === key)) return null // skip built-in
        const meta = pdp[k]
        return { key, label: meta.label || '📝 Section', colour: meta.colour || '#378ADD', coachOnly: false }
      })
      .filter(Boolean)
    if (saved.length > 0) setCustomSections(saved)
  }, [apData])

  // Clicking outside the section currently being edited auto-saves
  // and exits edit mode -- no explicit Save needed.
  useEffect(() => {
    if (!editSection) return
    function handleClick(e) {
      if (editingCardRef.current && !editingCardRef.current.contains(e.target)) {
        saveSection()
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [editSection, editItems, editSectionMeta])

  const shared = apData?.pdp_shared || {} // items shared to athlete view

  // Sections visible to athlete: non-coachOnly + any shared coach items
  const athleteSections = PDP_SECTIONS.filter(s => !s.coachOnly)

  function startEdit(section) {
    setEditSection(section.key)
    setEditItems([...(pdp[section.key] || [])])
    setEditSectionMeta({ key: section.key, label: section.label, colour: section.colour })
    setNewItem('')
  }

  async function duplicateSection(section) {
    const newKey = section.key + '_copy_' + Date.now()
    const meta = pdp[`__meta_${section.key}`]
    const label = meta?.label || section.label
    const colour = meta?.colour || section.colour
    const newSection = { key: newKey, label: label + ' (copy)', colour, coachOnly: false }
    const updated = { ...pdp, [newKey]: [...(pdp[section.key] || [])], [`__meta_${newKey}`]: { label: label + ' (copy)', colour } }
    const { error } = await supabase.from('athlete_profiles').upsert({ student_id: student.id, pdp_notes: updated }, { onConflict: 'student_id' })
    if (error) { alert('Error duplicating section: ' + error.message); return }
    setCustomSections(prev => [...prev, newSection])
    setApData(a => ({ ...a, pdp_notes: updated }))
  }

  async function deleteSection(section) {
    const label = pdp[`__meta_${section.key}`]?.label || section.label
    const itemCount = (pdp[section.key] || []).length
    const confirmMsg = itemCount > 0
      ? `Delete "${label}"? This will remove the section and clear ${itemCount} note${itemCount === 1 ? '' : 's'}. You can undo this afterwards.`
      : `Delete "${label}"? This will remove the section.`
    if (!confirm(confirmMsg)) return

    setPdpHistory(prev => [...prev.slice(-9), pdp]) // so it can be undone
    const updated = { ...pdp, [section.key]: [], __hidden_sections: [...(pdp.__hidden_sections || []), section.key] }
    const isCustom = customSections.some(s => s.key === section.key)
    if (isCustom) {
      delete updated[`__meta_${section.key}`]
      if (updated.section_order) updated.section_order = updated.section_order.filter(k => k !== section.key)
    }
    const { error } = await supabase.from('athlete_profiles').upsert({ student_id: student.id, pdp_notes: updated }, { onConflict: 'student_id' })
    if (error) { alert('Error deleting section: ' + error.message); return }
    if (isCustom) setCustomSections(prev => prev.filter(s => s.key !== section.key))
    setApData(a => ({ ...a, pdp_notes: updated }))
    if (editSection === section.key) setEditSection(null)
  }

  async function addSection() {
    const newKey = 'custom_' + Date.now()
    const newSection = { key: newKey, label: '📝 New section', colour: '#378ADD', coachOnly: false }
    // Pre-save meta so section persists on reload
    const updated = { ...pdp, [`__meta_${newKey}`]: { label: '📝 New section', colour: '#378ADD' } }
    const { error } = await supabase.from('athlete_profiles').upsert({ student_id: selected?.id, pdp_notes: updated }, { onConflict: 'student_id' })
    if (error) { alert('Error adding section: ' + error.message); return }
    setCustomSections(prev => [...prev, newSection])
    setApData(a => ({ ...a, pdp_notes: updated }))
    startEdit(newSection)
  }

  async function saveSectionMeta() {
    if (!editSectionMeta) return
    // Save custom label/colour to pdp_notes as metadata
    const updated = { ...pdp, [`__meta_${editSectionMeta.key}`]: { label: editSectionMeta.label, colour: editSectionMeta.colour } }
    const { error } = await supabase.from('athlete_profiles').upsert({ student_id: student.id, pdp_notes: updated }, { onConflict: 'student_id' })
    if (error) { alert('Error saving section title/colour: ' + error.message); return }
    setApData(a => ({ ...a, pdp_notes: updated }))
  }

  async function quickChangeColour(section, colour) {
    const meta = pdp[`__meta_${section.key}`]
    const updated = { ...pdp, [`__meta_${section.key}`]: { label: meta?.label || section.label, colour } }
    const { error } = await supabase.from('athlete_profiles').upsert({ student_id: student.id, pdp_notes: updated }, { onConflict: 'student_id' })
    if (error) { alert('Error changing colour: ' + error.message); return }
    setApData(a => ({ ...a, pdp_notes: updated }))
  }

  async function saveSection() {
    setSaving(true)
    const updated = { ...pdp, [editSection]: editItems.filter(i => i.trim()) }
    // Save section meta (title/colour) if changed
    if (editSectionMeta) {
      updated[`__meta_${editSection}`] = { label: editSectionMeta.label, colour: editSectionMeta.colour }
    }
    const { error } = await supabase.from('athlete_profiles')
      .upsert({ student_id: student.id, pdp_notes: updated }, { onConflict: 'student_id' })
    if (error) {
      alert('Error saving notes: ' + error.message)
      setSaving(false)
      return
    }
    setPdpHistory(prev => [...prev.slice(-9), pdp]) // save last 10 states
    setApData(a => ({ ...a, pdp_notes: updated }))
    setEditSection(null)
    setSelectedItems([])
    setSaving(false)
  }

  async function sendToAthlete(sectionKey) {
    // Copy items from coach section to shared/athlete-visible section
    const items = pdp[sectionKey] || []
    const currentShared = apData?.pdp_shared || {}
    const updatedShared = {
      ...currentShared,
      [sectionKey]: items,
      [`${sectionKey}_sent_at`]: new Date().toISOString(),
    }
    setSaving(true)
    const { error } = await supabase.from('athlete_profiles')
      .upsert({ student_id: student.id, pdp_shared: updatedShared }, { onConflict: 'student_id' })
    if (error) { alert('Error sharing notes: ' + error.message); setSaving(false); return }
    setApData(a => ({ ...a, pdp_shared: updatedShared }))
    setSendModal(null)
    setSaving(false)
  }

  function removeItem(idx) {
    setEditItems(prev => prev.filter((_, i) => i !== idx))
  }

  function addItem() {
    if (!newItem.trim()) return
    // Split by comma, semicolon, newline or tab — add as separate notes
    const parts = newItem.split(/[,;\n\t]+/).map(s => s.trim()).filter(Boolean)
    if (parts.length > 1) {
      setEditItems(prev => [...prev, ...parts])
    } else {
      setEditItems(prev => [...prev, newItem.trim()])
    }
    setNewItem('')
  }

  const isEmpty = !pdp || Object.keys(pdp).every(k => !Array.isArray(pdp[k]) || pdp[k].length === 0)


  function renderPDPSectionCard(section) {
    const meta = pdp[`__meta_${section.key}`]
    const sectionLabel = meta?.label || section.label
    const sectionColour = meta?.colour || section.colour
    const items = pdp[section.key] || []
    const isShared = !!(shared[section.key]?.length)
    const isEditing = editSection === section.key

    return (
      <div key={section.key} className="card"
        ref={isEditing ? editingCardRef : null}
        draggable
        onDragStart={e => e.dataTransfer.setData('pdp-section', section.key)}
        onDragOver={e => {
          e.preventDefault()
          e.currentTarget.style.outline = `2px dashed ${sectionColour}`
          const margin = 80
          if (e.clientY < margin) window.scrollBy(0, -10)
          if (e.clientY > window.innerHeight - margin) window.scrollBy(0, 10)
        }}
        onDragLeave={e => { e.currentTarget.style.outline = 'none' }}
        onDrop={e => {
          e.preventDefault()
          e.currentTarget.style.outline = 'none'
          const fromKey = e.dataTransfer.getData('pdp-section')
          if (!fromKey || fromKey === section.key) return
          const currentOrder = pdp.section_order || PDP_SECTIONS.map(s => s.key)
          const fromIdx = currentOrder.indexOf(fromKey)
          const toIdx   = currentOrder.indexOf(section.key)
          if (fromIdx === -1 || toIdx === -1) return
          const newOrder = [...currentOrder]
          newOrder.splice(fromIdx, 1)
          newOrder.splice(toIdx, 0, fromKey)
          const updated = { ...pdp, section_order: newOrder }
          supabase.from('athlete_profiles').upsert({ student_id: student.id, pdp_notes: updated }, { onConflict: 'student_id' })
          setApData(a => ({ ...a, pdp_notes: updated }))
        }}
        style={{ borderLeft: `3px solid ${sectionColour}`, borderRadius: '0 var(--border-radius-lg) var(--border-radius-lg) 0', marginBottom: 10, cursor: isEditing ? 'default' : 'pointer' }}
        onClick={() => { if (!isEditing) startEdit(section) }}>
        <div style={{ marginBottom: isEditing ? 12 : items.length ? 8 : 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
            <span style={{ cursor: 'grab', color: 'var(--text-tertiary)', fontSize: 16, lineHeight: 1, userSelect: 'none' }}>⋮⋮</span>
            <h3 style={{ fontSize: 13, fontWeight: 600, color: sectionColour, margin: 0, flex: 1 }}>
              {sectionLabel}
              {section.coachOnly && <span style={{ fontSize: 9, color: 'var(--text-tertiary)', marginLeft: 6, fontWeight: 400 }}>coach only</span>}
              {isShared && !section.coachOnly && <span style={{ fontSize: 9, color: '#1d9e75', marginLeft: 6 }}>✓ shared</span>}
            </h3>
            {isEditing && (
              <input type="color" value={sectionColour} onClick={e => e.stopPropagation()}
                onChange={e => quickChangeColour(section, e.target.value)}
                title="Change column colour"
                style={{ width: 20, height: 20, padding: 0, border: 'none', borderRadius: 4, cursor: 'pointer', flexShrink: 0 }} />
            )}
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }} onClick={e => e.stopPropagation()}>
            {items.length > 0 && (
              <button className="btn btn-sm" style={{ fontSize: 10, background: '#eaf3de', color: '#3b6d11', border: '1px solid #3b6d1140' }}
                onClick={() => setSendModal(section.key)}>
                → Send to athlete
              </button>
            )}
            {!isEditing && (
              <button className="btn btn-sm" style={{ fontSize: 10 }} onClick={() => duplicateSection(section)} title="Duplicate section">⧉</button>
            )}
            {!isEditing && (
              <button className="btn btn-sm" style={{ fontSize: 10, color: '#E24B4A' }} onClick={() => deleteSection(section)} title="Delete section">🗑</button>
            )}
            <button className="btn btn-sm" style={{ fontSize: 10 }} onClick={() => isEditing ? saveSection() : startEdit(section)}>
              {isEditing ? 'Done' : items.length ? 'Edit' : '+ Add'}
            </button>
          </div>
        </div>

        {!isEditing && (items.length > 0 || section.key === 'winning_ways') && (
          section.key === 'winning_ways' ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }} onClick={e => e.stopPropagation()}>
              {[0, 1, 2].map(col => (
                <div key={col} style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0, minHeight: 20 }}>
                  {items.filter((_, i) => i % 3 === col).map((item) => {
                    const i = items.indexOf(item)
                    return (
                      <span key={i} onClick={() => toggleHighlight(section.key, item)} title="Click to highlight"
                        style={notePillStyle(sectionColour, section.key, item, { border: `1px solid ${section.colour}30`, padding: '4px 10px', fontSize: 12, cursor: 'pointer' })}>{item}</span>
                    )
                  })}
                </div>
              ))}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }} onClick={e => e.stopPropagation()}>
              {items.map((item, i) => {
                const checkable = PDP_CHECKABLE_SECTIONS.has(section.key)
                const isMaintain = PDP_MAINTAIN_SECTIONS.has(section.key)
                const done = checkable && isCompleted(section.key, item)
                const sent = checkable && timetableEntry(section.key, item)
                return (
                  <span key={i}
                    onClick={() => {
                      if (isMaintain) {
                        if (confirm(`Mark "${item}" as complete? It'll move to the Notes tab as a completed PDP task.`)) completeMaintainItem(section.key, item)
                        return
                      }
                      if (checkable) {
                        if (!sent) { setTimetableModal({ sectionKey: section.key, item }); setTimetableDraftDate(''); setTimetableDraftTime('') }
                        else toggleCompleted(section.key, item)
                        return
                      }
                      // Plain pill: single click starts editing the
                      // section, double-click highlights instead.
                      // Debounced so the first click of a double-click
                      // doesn't prematurely jump into edit mode.
                      if (pillClickTimer.current) {
                        clearTimeout(pillClickTimer.current)
                        pillClickTimer.current = null
                        toggleHighlight(section.key, item)
                      } else {
                        pillClickTimer.current = setTimeout(() => {
                          pillClickTimer.current = null
                          startEdit(section)
                        }, 250)
                      }
                    }}
                    title={isMaintain ? 'Click to mark complete (moves to Notes)' : !checkable ? 'Click to edit · double-click to highlight' : !sent ? 'Click to send to timetable' : done ? 'Click to mark not done' : 'Click to mark done'}
                    style={{
                      ...notePillStyle(sectionColour, section.key, item, { border: `1px solid ${section.colour}30`, padding: '4px 10px', fontSize: 12, cursor: 'pointer' }),
                      ...(sent ? { background: sectionColour + '40', fontWeight: 600 } : {}),
                    }}>
                    {isMaintain && <span style={{ marginRight: 6 }}>☐</span>}
                    {checkable && sent && <span style={{ marginRight: 6 }}>{done ? '☑' : '☐'}</span>}
                    {item}
                    {sent && (
                      <>
                        <span style={{ marginLeft: 6, fontSize: 10, opacity: 0.75 }}>
                          📅 {new Date(sent.date + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}{sent.time ? ` ${sent.time}` : ''}
                        </span>
                        <button onClick={e => { e.stopPropagation(); removeFromTimetable(section.key, item) }}
                          title="Remove from timetable" style={{ background: 'none', border: 'none', cursor: 'pointer', marginLeft: 4, fontSize: 12, opacity: 0.6 }}>×</button>
                      </>
                    )}
                  </span>
                )
              })}
            </div>
          )
        )}

        {timetableModal && timetableModal.sectionKey === section.key && (
          <div onClick={e => e.stopPropagation()} style={{ marginTop: 8, padding: 10, border: `1px solid ${sectionColour}40`, borderRadius: 'var(--radius)', background: 'var(--bg-secondary)' }}>
            <p style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Send "{timetableModal.item}" to timetable</p>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
              <input type="date" value={timetableDraftDate} onChange={e => setTimetableDraftDate(e.target.value)}
                style={{ padding: '5px 8px', border: '1px solid var(--border-strong)', borderRadius: 6, fontSize: 12, background: 'var(--bg-secondary)', color: 'var(--text)' }} />
              <input type="time" value={timetableDraftTime} onChange={e => setTimetableDraftTime(e.target.value)}
                style={{ padding: '5px 8px', border: '1px solid var(--border-strong)', borderRadius: 6, fontSize: 12, background: 'var(--bg-secondary)', color: 'var(--text)' }} />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-primary btn-sm" disabled={!timetableDraftDate} onClick={sendNoteToTimetable}>Send</button>
              <button className="btn btn-sm" onClick={() => setTimetableModal(null)}>Cancel</button>
            </div>
          </div>
        )}

        {isEditing && (
          <div tabIndex={0} style={{ outline: 'none' }}
            onKeyDown={e => {
              if (selectedItems.length === 0) return
              const col = editSectionMeta?.colour || section.colour
              if ((e.ctrlKey || e.metaKey) && e.key === 'c') { e.preventDefault(); setClipboard(selectedItems.map(i => editItems[i])) }
              if ((e.ctrlKey || e.metaKey) && e.key === 'x') { e.preventDefault(); setClipboard(selectedItems.map(i => editItems[i])); setEditItems(prev => prev.filter((_,i) => !selectedItems.includes(i))); setSelectedItems([]) }
              if ((e.ctrlKey || e.metaKey) && e.key === 'v' && clipboard) { e.preventDefault(); const at = selectedItems.length ? Math.max(...selectedItems) + 1 : editItems.length; const items = Array.isArray(clipboard) ? clipboard : [clipboard]; setEditItems(prev => { const n=[...prev]; n.splice(at,0,...items); return n }); setSelectedItems(items.map((_,j)=>at+j)) }
              if (e.key === 'Escape') { setSelectedItems([]); setSelectionAnchor(null) }
              if ((e.key === 'Backspace' || e.key === 'Delete') && selectedItems.length > 0) {
                e.preventDefault()
                setEditItems(prev => prev.filter((_,i) => !selectedItems.includes(i)))
                setSelectedItems([])
              }
            }}>
            {editSectionMeta && (
              <div style={{ display: 'flex', gap: 8, marginBottom: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <input value={editSectionMeta.label}
                  onChange={e => setEditSectionMeta(m => ({ ...m, label: e.target.value }))}
                  style={{ flex: 1, minWidth: 120, padding: '5px 8px', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius)', fontSize: 12, background: 'var(--bg-secondary)', color: 'var(--text)', fontWeight: 600 }} />
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Colour:</span>
                  <input type="color" value={editSectionMeta.colour}
                    onChange={e => setEditSectionMeta(m => ({ ...m, colour: e.target.value }))}
                    style={{ width: 32, height: 28, padding: 2, border: '1px solid var(--border-strong)', borderRadius: 4, cursor: 'pointer' }} />
                </div>
              </div>
            )}

            {editItems.length > 0 && (
              <div style={{ marginBottom: 6 }}>
                <button type="button" className="btn btn-sm" style={{ fontSize: 10 }}
                  onClick={() => { setSelectedItems(editItems.map((_, i) => i)); setSelectionAnchor(0) }}>
                  Select all ({editItems.length})
                </button>
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 10 }}>
              {editItems.map((item, i) => {
                const col = editSectionMeta?.colour || section.colour
                const isSel = selectedItems.includes(i)
                return (
                <div key={i} draggable
                  onClick={(e) => {
                    if (e.shiftKey && selectionAnchor != null) {
                      const [lo, hi] = [Math.min(selectionAnchor, i), Math.max(selectionAnchor, i)]
                      setSelectedItems(Array.from({ length: hi - lo + 1 }, (_, k) => lo + k))
                    } else if (e.ctrlKey || e.metaKey) {
                      setSelectedItems(prev => prev.includes(i) ? prev.filter(x => x !== i) : [...prev, i])
                      setSelectionAnchor(i)
                    } else {
                      setSelectedItems(prev => prev.includes(i) && prev.length === 1 ? [] : [i])
                      setSelectionAnchor(i)
                    }
                  }}
                  onDragStart={e => e.dataTransfer.setData('text/plain', i)}
                  onDragOver={e => {
                    e.preventDefault()
                    const margin = 80
                    if (e.clientY < margin) window.scrollBy(0, -10)
                    if (e.clientY > window.innerHeight - margin) window.scrollBy(0, 10)
                  }}
                  onDrop={e => {
                    e.preventDefault()
                    const from = parseInt(e.dataTransfer.getData('text/plain'))
                    if (from === i) return
                    setEditItems(prev => { const n=[...prev]; const [m]=n.splice(from,1); n.splice(i,0,m); return n })
                  }}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', background: isSel ? col+'35' : col+'15', color: col, border: `${isSel?2:1}px solid ${col}${isSel?'':'30'}`, borderRadius: 8, padding: '6px 10px', fontSize: 12, cursor: 'grab', userSelect: 'none' }}>
                  <span style={{ fontSize: 12, opacity: 0.5 }}>⠿</span>
                  <span style={{ flex: 1, wordBreak: 'break-word' }}>{item}</span>
                  <button title="Cut (Ctrl+X)" onClick={e => { e.stopPropagation(); const sel = selectedItems.includes(i) ? selectedItems : [i]; setClipboard(sel.map(idx=>editItems[idx])); setEditItems(prev => prev.filter((_,j)=>!sel.includes(j))); setSelectedItems([]) }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, opacity: 0.6, padding: '0 2px' }}>✂</button>
                  <button title="Copy (Ctrl+C)" onClick={e => { e.stopPropagation(); const sel = selectedItems.includes(i) ? selectedItems : [i]; setClipboard(sel.map(idx=>editItems[idx])); setSelectedItems(sel) }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, opacity: 0.6, padding: '0 2px' }}>⧉</button>
                  <button onClick={e => { e.stopPropagation(); removeItem(i) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: col, fontSize: 14, lineHeight: 1, padding: 0 }}>×</button>
                </div>
                )
              })}
              {selectedItems.length > 0 && <p style={{ fontSize: 10, color: 'var(--text-tertiary)', margin: '4px 0' }}>{selectedItems.length} selected · Ctrl+C copy · Ctrl+X cut · Ctrl+V paste · Ctrl/Cmd+click add · Shift+click select range · Esc deselect</p>}
              {clipboard && (
                <button onClick={() => { const items = Array.isArray(clipboard) ? clipboard : [clipboard]; setEditItems(prev => [...prev, ...items]) }}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'var(--bg-tertiary)', border: '1px dashed var(--border-strong)', borderRadius: 20, padding: '4px 10px', fontSize: 11, cursor: 'pointer', color: 'var(--text-secondary)', fontFamily: 'var(--font-sans)' }}>
                  {Array.isArray(clipboard) ? `📋 Paste ${clipboard.length} item${clipboard.length>1?'s':''}` : `📋 Paste: "${clipboard?.slice?.(0,20)}${clipboard?.length>20?'…':''}"` }
                </button>
              )}
            </div>

            <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
              <input value={newItem} onChange={e => setNewItem(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addItem()}
                placeholder="Type and press Enter · separate with , or ; · paste from Excel"
                onPaste={e => {
                  const text = e.clipboardData.getData('text')
                  const parts = text.split(/[\t\n,;]+/).map(s => s.trim()).filter(Boolean)
                  if (parts.length > 1) {
                    e.preventDefault()
                    setEditItems(prev => [...prev, ...parts])
                    setNewItem('')
                  }
                }}
                style={{ flex: 1, padding: '7px 10px', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius)', fontSize: 13, background: 'var(--bg-secondary)', color: 'var(--text)' }} />
              <button className="btn btn-sm" onClick={addItem}>Add</button>
            </div>

            {pdpHistory.length > 0 && (
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-sm" onClick={async () => {
                  const prev = pdpHistory[pdpHistory.length - 1]
                  await supabase.from('athlete_profiles').upsert({ student_id: student.id, pdp_notes: prev }, { onConflict: 'student_id' })
                  setApData(a => ({ ...a, pdp_notes: prev }))
                  setPdpHistory(h => h.slice(0, -1))
                  setEditSection(null)
                }}>↩ Undo</button>
              </div>
            )}
            {saving && <p style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Saving…</p>}
          </div>
        )}
      </div>
    )
  }

  return (
    <div>
      {/* View toggle */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {(isAdmin ? [['coach','👁 Coach'],['athlete','🎽 Athlete'],['split','⇔ Split']] : [['athlete','🎽 Your notes']]).map(([key, label]) => (
          <button key={key} onClick={() => setPdpView(key)} className={pdpView === key ? 'btn btn-primary btn-sm' : 'btn btn-sm'}>
            {label}
          </button>
        ))}
        {isAdmin && pdpView === 'coach' && (
          <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
            {pdpHistory.length > 0 && (
              <button className="btn btn-sm" onClick={async () => {
                const prev = pdpHistory[pdpHistory.length - 1]
                await supabase.from('athlete_profiles').upsert({ student_id: student.id, pdp_notes: prev }, { onConflict: 'student_id' })
                setApData(a => ({ ...a, pdp_notes: prev }))
                setPdpHistory(h => h.slice(0, -1))
              }}>↩ Undo</button>
            )}
            <button className="btn btn-sm" onClick={addSection}>+ Add section</button>
          </div>
        )}
      </div>

      {/* ── SPLIT VIEW ── */}
      {pdpView === 'split' && isAdmin && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          {/* Coach side */}
          <div>
            <h3 style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>👁 Coach view</h3>
            {[...PDP_SECTIONS, ...customSections].map(section => {
              const meta = pdp[`__meta_${section.key}`]
              const sc = meta?.colour || section.colour
              const sl = meta?.label || section.label
              const items = pdp[section.key] || []
              if (!items.length) return null
              const isShared = !!(shared[section.key]?.length)
              return (
                <div key={section.key} style={{ marginBottom: 8, padding: '10px 12px', borderLeft: `3px solid ${sc}`, background: 'var(--bg-secondary)', borderRadius: '0 var(--radius) var(--radius) 0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: sc }}>{sl}</span>
                    {!section.coachOnly && <button style={{ fontSize: 10, padding: '2px 8px', background: isShared ? '#eaf3de' : 'var(--bg)', border: `1px solid ${isShared ? '#3b6d11' : 'var(--border)'}`, borderRadius: 20, cursor: 'pointer', color: isShared ? '#3b6d11' : 'var(--text-secondary)' }}
                      onClick={() => setSendModal(section.key)}>
                      {isShared ? '✓ Shared' : '→ Share'}
                    </button>}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {items.map((item, i) => (
                      <span key={i} onClick={isAdmin ? () => toggleHighlight(section.key, item) : undefined}
                        title={isAdmin ? 'Click to highlight' : undefined}
                        style={notePillStyle(sc, section.key, item, { cursor: isAdmin ? 'pointer' : 'default' })}>{item}</span>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
          {/* Athlete side */}
          <div>
            <h3 style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>🎽 Athlete view</h3>
            {[...PDP_SECTIONS, ...customSections].filter(s => !s.coachOnly).map(section => {
              const meta = pdp[`__meta_${section.key}`]
              const sc = meta?.colour || section.colour
              const sl = meta?.label || section.label
              const items = shared[section.key] || []
              if (!items.length) return null
              const sentAt = shared[`${section.key}_sent_at`]
              return (
                <div key={section.key} style={{ marginBottom: 8, padding: '10px 12px', borderLeft: `3px solid ${sc}`, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '0 var(--radius) var(--radius) 0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: sc }}>{sl}</span>
                    {sentAt && <span style={{ fontSize: 9, color: 'var(--text-tertiary)' }}>{new Date(sentAt).toLocaleDateString('en-GB')}</span>}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {items.map((item, i) => (
                      <span key={i} style={notePillStyle(sc, section.key, item)}>{item}</span>
                    ))}
                  </div>
                </div>
              )
            })}
            {Object.keys(shared).filter(k => !k.endsWith('_sent_at')).every(k => !(shared[k]?.length)) && (
              <p style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>No notes shared yet — use → Share buttons on the left</p>
            )}
          </div>
        </div>
      )}

      {/* ── ATHLETE VIEW ── */}
      {pdpView === 'athlete' && (
        <div>
          {/* Shared coach notes visible to athlete */}
          {PDP_SECTIONS.filter(s => !s.coachOnly && !(pdp.__hidden_sections || []).includes(s.key)).map(section => {
            // Show athlete_notes always, shared coach sections if sent
            const items = section.key === 'athlete_notes'
              ? (pdp.athlete_notes || [])
              : (shared[section.key] || [])
            if (!items.length) return null
            const sentAt = shared[`${section.key}_sent_at`]
            return (
              <div key={section.key} className="card" style={{ borderLeft: `3px solid ${sectionColour}`, borderRadius: '0 var(--border-radius-lg) var(--border-radius-lg) 0', marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <h3 style={{ fontSize: 13, fontWeight: 600, color: section.colour, display: 'flex', alignItems: 'center', gap: 7, margin: 0 }}>
                    <span style={{ cursor: 'grab', color: 'var(--text-tertiary)', fontSize: 16, lineHeight: 1, userSelect: 'none' }}>⋮⋮</span>
                    {section.label}</h3>
                  {sentAt && <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>Sent {new Date(sentAt).toLocaleDateString('en-GB')}</span>}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {items.map((item, i) => (
                    <span key={i} style={notePillStyle(sectionColour, section.key, item, { border: `1px solid ${section.colour}30`, padding: '4px 10px', fontSize: 12, fontWeight: 500 })}>{item}</span>
                  ))}
                </div>
              </div>
            )
          })}
          {Object.keys(shared).filter(k => !k.endsWith('_sent_at')).every(k => !(shared[k]?.length)) && !(pdp.athlete_notes?.length) && (
            <div className="empty-state"><h3>No notes yet</h3><p>Your coach hasn't shared any PDP notes yet</p></div>
          )}

          {/* ── Weekly Timetable ── */}
          {(() => {
            const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday']
            const timetable = pdp.timetable || {}
            return (
              <div style={{ marginTop: 24 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <h3 style={{ fontSize: 13, fontWeight: 600, margin: 0 }}>📅 Weekly Timetable</h3>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
                  {DAYS.map(day => (
                    <div key={day} style={{ background: 'var(--bg-secondary)', borderRadius: 'var(--radius)', padding: '10px 8px', minHeight: 80 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 6, textAlign: 'center' }}>{day.slice(0,3)}</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {(timetable[day] || []).map((note, i) => (
                          <div key={i} style={{ fontSize: 11, background: 'var(--bg)', borderRadius: 8, padding: '3px 7px', color: 'var(--text)', border: '1px solid var(--border)' }}>{note}</div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })()}
        </div>
      )}

      {/* ── COACH VIEW ── */}
      {pdpView === 'coach' && isAdmin && (
        <div>
          {isEmpty && (
            <div className="empty-state" style={{ marginBottom: 16 }}>
              <h3>No PDP notes yet</h3>
              <p>Add notes using the sections below</p>
            </div>
          )}
          {/* Weekly Timetable -- shows PDP "Check" items sent here from any category */}
          {(() => {
            const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday']
            const timetable = pdp.timetable || {}
            if (DAYS.every(d => !(timetable[d]?.length))) return null
            return (
              <div className="card" style={{ marginBottom: 16 }}>
                <h3 style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>📅 Weekly Timetable</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
                  {DAYS.map(day => (
                    <div key={day} style={{ background: 'var(--bg-secondary)', borderRadius: 'var(--radius)', padding: '10px 8px', minHeight: 60 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 6, textAlign: 'center' }}>{day.slice(0,3)}</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {(timetable[day] || []).map((note, i) => (
                          <div key={i} style={{ fontSize: 11, background: 'var(--bg)', borderRadius: 8, padding: '3px 7px', color: 'var(--text)', border: '1px solid var(--border)' }}>{note}</div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })()}
          {(() => {
            const hidden = new Set(pdp.__hidden_sections || [])
            const allSections = [...PDP_SECTIONS, ...customSections].filter(s => !hidden.has(s.key))
            const orderedSections = (() => {
              if (pdp.section_order) {
                const ordered = pdp.section_order.map(key => allSections.find(s => s.key === key)).filter(Boolean)
                const missing = allSections.filter(s => !pdp.section_order.includes(s.key))
                return [...ordered, ...missing]
              }
              return allSections
            })()

            const rendered = []
            const renderedGroups = new Set()
            orderedSections.forEach(section => {
              const group = PDP_CATEGORY_GROUPS.find(g => g.keys.includes(section.key))
              if (group) {
                if (renderedGroups.has(group.label)) return
                renderedGroups.add(group.label)
                rendered.push(
                  <div key={`group-${group.label}`} style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)', marginBottom: 10, letterSpacing: 0.3 }}>{group.label}</div>
                    <div className="hscroll-area" style={{ display: 'flex', overflowX: 'auto', gap: 10, scrollSnapType: 'x mandatory', paddingBottom: 4 }}>
                      {group.keys.map(key => {
                        const sec = allSections.find(s => s.key === key)
                        return sec ? (
                          <div key={key} style={{ flex: '0 0 calc(33.333% - 7px)', minWidth: 0, scrollSnapAlign: 'start' }}>
                            {renderPDPSectionCard(sec)}
                          </div>
                        ) : null
                      })}
                    </div>
                  </div>
                )
              } else if (section.key === 'winning_ways') {
                // Winning ways spans the same 3-column width as the
                // category rows below it, for visual alignment.
                rendered.push(
                  <div key={section.key} style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 10 }}>
                    <div style={{ gridColumn: '1 / -1' }}>{renderPDPSectionCard(section)}</div>
                  </div>
                )
              } else {
                rendered.push(renderPDPSectionCard(section))
              }
            })
            return rendered
          })()}
        </div>
      )}

      {/* Send to athlete confirmation */}
      {sendModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 }}>
          <div className="card" style={{ maxWidth: 380 }}>
            <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>Send to athlete?</h2>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
              This will share the <strong>{PDP_SECTIONS.find(s => s.key === sendModal)?.label}</strong> notes with {student?.members?.first_name}'s athlete view. They'll be able to see these notes when they log in.
            </p>
            <div style={{ marginBottom: 16, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {(pdp[sendModal] || []).map((item, i) => (
                <span key={i} style={{ background: 'var(--bg-secondary)', borderRadius: 20, padding: '3px 10px', fontSize: 12 }}>{item}</span>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn" onClick={() => setSendModal(null)}>Cancel</button>
              <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={() => sendToAthlete(sendModal)} disabled={saving}>
                {saving ? 'Sending…' : '→ Send to athlete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function AthleteProfiles() {
  const { profile, isAdmin } = useAuth()
  const navigate = useNavigate()
  const swipeStartX = useRef(null)
  const [isMobileView, setIsMobileView] = useState(() => typeof window !== 'undefined' && window.innerWidth < 900)
  const [mobilePanel, setMobilePanel] = useState('dashboard') // 'list' | 'dashboard' -- which of the two "screens" mobile is showing
  const [students, setStudents]     = useState([])
  const [houses, setHouses]         = useState([])
  const [truePointTotals, setTruePointTotals] = useState({})
  const [allAttendance, setAllAttendance] = useState([])
  const [assignedClasses, setAssignedClasses] = useState([])
  const [clubEvents, setClubEvents] = useState([])
  // Athlete Dashboard (shown when no athlete is selected): team notes + events
  const [teamNotes, setTeamNotes] = useState([])
  const [dashNoteText, setDashNoteText] = useState('')
  const [expandedNoteTargeting, setExpandedNoteTargeting] = useState(null) // team_notes.id whose targeting panel is open
  const [noteTargetSearch, setNoteTargetSearch] = useState('')
  const [savingDashNote, setSavingDashNote] = useState(false)
  const [showAddEvent, setShowAddEvent] = useState(false)
  const [todaysAllSessions, setTodaysAllSessions] = useState([])
  const [allTeamSessions, setAllTeamSessions] = useState([])
  const [showResultsColPicker, setShowResultsColPicker] = useState(false)
  const [resultsVisibleCols, setResultsVisibleCols] = useState(() => {
    try { return JSON.parse(localStorage.getItem('results_visible_cols')) || RESULTS_DEFAULT_VISIBLE } catch { return RESULTS_DEFAULT_VISIBLE }
  })
  const [resultsSortKey, setResultsSortKey] = useState('date')
  const [resultsSortDir, setResultsSortDir] = useState('desc')
  const [allAthleteProfiles, setAllAthleteProfiles] = useState([]) // for PDP/Media team stats
  const [todaysAllAttendance, setTodaysAllAttendance] = useState([])
  const [todaysAllNotes, setTodaysAllNotes] = useState([])
  const [todaysAllTtp, setTodaysAllTtp] = useState([])
  const [ttpBenchmark, setTtpBenchmark] = useState(null) // current boxing benchmark
  const [showSetBenchmark, setShowSetBenchmark] = useState(false)
  const [benchmarkScores, setBenchmarkScores] = useState({})
  const [benchmarkNotes, setBenchmarkNotes] = useState('')
  const [savingBenchmark, setSavingBenchmark] = useState(false)
  const [teamTargets, setTeamTargets] = useState([])
  const [showAddTarget, setShowAddTarget] = useState(false)
  const [newTargetSection, setNewTargetSection] = useState('physical')
  const [newTargetQuestion, setNewTargetQuestion] = useState('')
  const [newTargetValue, setNewTargetValue] = useState('')
  const [newTargetNotes, setNewTargetNotes] = useState('')
  const [savingTarget, setSavingTarget] = useState(false)
  const [targetAthlete, setTargetAthlete] = useState(null) // null = whole team, or a student object
  const [targetAthleteSearch, setTargetAthleteSearch] = useState('')
  const [showTargetAthleteDropdown, setShowTargetAthleteDropdown] = useState(false)
  const [targetFreqNumber, setTargetFreqNumber] = useState('')
  const [targetFreqPeriod, setTargetFreqPeriod] = useState('day')
  const [targetUseFreeText, setTargetUseFreeText] = useState(false)
  const targetFormRef = useRef(null)
  const targetDropdownRef = useRef(null)
  const [expandedDashSection, setExpandedDashSection] = useState(null)
  const [dashClubFilter, setDashClubFilter] = useState('all') // 'all' | 'PKA' | 'KRBA'
  const [dashboardTab, setDashboardTab] = useState('overview') // 'overview' | 'calendar' | 'results' | 'pdp'
  const [teamTemplateStudent, setTeamTemplateStudent] = useState(null)
  const [teamPdpApData, setTeamPdpApData] = useState(null)
  const [showPushPdp, setShowPushPdp] = useState(false)
  const [pushPdpSection, setPushPdpSection] = useState('')
  const [pushPdpTarget, setPushPdpTarget] = useState('all') // 'all' | 'individual'
  const [pushPdpAthlete, setPushPdpAthlete] = useState(null)
  const [pushPdpAthleteSearch, setPushPdpAthleteSearch] = useState('')
  const [pushingPdp, setPushingPdp] = useState(false)
  const [showDashWeightList, setShowDashWeightList] = useState(false)
  const [dashLevelIndex, setDashLevelIndex] = useState(0)
  const [highlightedEntryId, setHighlightedEntryId] = useState(null)
  const [showRecordAsPct, setShowRecordAsPct] = useState(false)
  const recordPressTimer = useRef(null)
  const [showTeamKrDropdown, setShowTeamKrDropdown] = useState(false)
  const [showTeamKrbaDropdown, setShowTeamKrbaDropdown] = useState(false)
  const [teamKrSearch, setTeamKrSearch] = useState('')
  const [teamCalMonth, setTeamCalMonth] = useState(() => ({ year: new Date().getFullYear(), month: new Date().getMonth() }))
  const [showAddEventTarget, setShowAddEventTarget] = useState('all') // 'all' | 'kr' | 'krba' | 'individual'
  const [addEventAthleteSearch, setAddEventAthleteSearch] = useState('')
  const [addEventAthlete, setAddEventAthlete] = useState(null)
  const [teamKrbaSearch, setTeamKrbaSearch] = useState('')
  const teamKrDropdownRef = useRef(null)
  const teamKrbaDropdownRef = useRef(null)

  useEffect(() => {
    if (!showTeamKrDropdown) return
    function handleClick(e) {
      if (teamKrDropdownRef.current && !teamKrDropdownRef.current.contains(e.target)) setShowTeamKrDropdown(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [showTeamKrDropdown])

  useEffect(() => {
    if (!showTeamKrbaDropdown) return
    function handleClick(e) {
      if (teamKrbaDropdownRef.current && !teamKrbaDropdownRef.current.contains(e.target)) setShowTeamKrbaDropdown(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [showTeamKrbaDropdown])
  const dashWeightListRef = useRef(null)

  useEffect(() => {
    if (!showDashWeightList) return
    function handleClick(e) {
      if (dashWeightListRef.current && !dashWeightListRef.current.contains(e.target)) {
        setShowDashWeightList(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [showDashWeightList])
  const [expandedDashSubItem, setExpandedDashSubItem] = useState(null) // "sectionKey::subKey"
  const [newEventTitle, setNewEventTitle] = useState('')
  const [newEventDate, setNewEventDate] = useState('')
  const [newEventTime, setNewEventTime] = useState('')
  const [newEventDesc, setNewEventDesc] = useState('')
  const [newEventSendAll, setNewEventSendAll] = useState(true)
  const [savingEvent, setSavingEvent] = useState(false)
  const [notesLog, setNotesLog] = useState([])
  const [newNoteText, setNewNoteText] = useState('')
  const [savingNote, setSavingNote] = useState(false)
  const [allClasses, setAllClasses] = useState([])
  const [addingClassId, setAddingClassId] = useState('')
  const [savingClassAssignment, setSavingClassAssignment] = useState(false)
  const [sessionsBreakdownRange, setSessionsBreakdownRange] = useState('month')
  const [breakdownExcluded, setBreakdownExcluded] = useState(new Set()) // assignment ids unchecked from the total (default: none, i.e. all included)
  const [f2fStatsScope, setF2fStatsScope] = useState(0) // cycles through scope options
  const [attendanceDisplayPct, setAttendanceDisplayPct] = useState(false)
  const [f2fModule, setF2fModule] = useState(null) // 'watt_bike' | '10k' | 'circuit' | 'bleep' | 'grip'
  const [moduleSubType, setModuleSubType] = useState({}) // key -> currently selected sub-type per module
  const [expandedHomeWb, setExpandedHomeWb] = useState(null) // which wellbeing question card is expanded on Home
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
  const [expandedTechniqueCategory, setExpandedTechniqueCategory] = useState(null)
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
    if (!showAddTarget) return
    function handleClick(e) {
      if (targetFormRef.current && !targetFormRef.current.contains(e.target)) {
        setShowAddTarget(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [showAddTarget])

  useEffect(() => {
    if (showAddTarget) setShowTargetAthleteDropdown(false)
  }, [showAddTarget])

  useEffect(() => {
    if (!showTargetAthleteDropdown) return
    function handleClick(e) {
      if (targetDropdownRef.current && !targetDropdownRef.current.contains(e.target)) {
        setShowTargetAthleteDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [showTargetAthleteDropdown])

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
  const [todaysOtherSession, setTodaysOtherSession] = useState([])
  const [showOtherSessionCards, setShowOtherSessionCards] = useState(false)
  const [otherSessionDraft, setOtherSessionDraft] = useState('')
  const [savingPhysical, setSavingPhysical] = useState(false)
  const [showContribution, setShowContribution] = useState(false)
  const [showOverallPos, setShowOverallPos] = useState(false)
  const [belts, setBelts] = useState({ junior: [], senior: [], krba: [] })
  const [selected, setSelected]     = useState(null)
  const [apData, setApData]         = useState(null)
  const [loading, setLoading]       = useState(true)
  const [searchParams, setSearchParams] = useSearchParams()
  const [saving, setSaving]         = useState(false)
  const [tab, setTab]               = useState('profile')
  const [search, setSearch]         = useState('')
  const [editing, setEditing]       = useState(false)
  const editProfileRef = useRef(null)

  useEffect(() => {
    if (!editing) return
    function handleClick(e) {
      if (editProfileRef.current && !editProfileRef.current.contains(e.target)) {
        setEditing(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [editing])
  const [editForm, setEditForm]     = useState({})
  const [results, setResults]       = useState(['', ''])
  const [reportTab, setReportTab]   = useState('individual')
  const [reportData, setReportData] = useState(null)
  const [f2fData, setF2fData]         = useState([])
  const [f2fFrom, setF2fFrom]         = useState('')
  const [f2fTo, setF2fTo]             = useState('')
  const [wattChartFilter, setWattChartFilter] = useState('all')
  const [bwChartFilter, setBwChartFilter]     = useState('all')
  const [techChartFilter, setTechChartFilter] = useState('all')
  const [sessionsCalMonth, setSessionsCalMonth] = useState(() => { const d = new Date(); return { year: d.getFullYear(), month: d.getMonth() } })
  const [weekTimetableStart, setWeekTimetableStart] = useState(() => {
    const d = new Date()
    const day = d.getDay() // 0=Sun
    const diffToMonday = day === 0 ? -6 : 1 - day
    d.setDate(d.getDate() + diffToMonday)
    d.setHours(0, 0, 0, 0)
    return d
  })
  const [runChartFilter, setRunChartFilter]   = useState('all')
  const [editingSession, setEditingSession] = useState(null) // {} for add, session object for edit
  const [sessionForm, setSessionForm] = useState({})
  const [savingSession, setSavingSession] = useState(false)
  const [tptData, setTptData]         = useState({ kickboxing: [], boxing: [] })
  const [attendanceData, setAttendanceData] = useState([])
  const [sessionPoints, setSessionPoints]   = useState([])
  const [openSession, setOpenSession]       = useState(null)
  const [sessionNoteDraft, setSessionNoteDraft] = useState('')
  const [savingSessionNote, setSavingSessionNote] = useState(false)
  const [reportLoading, setReportLoading] = useState(false)
  const [reportFrom, setReportFrom] = useState(() => { const d = new Date(); d.setMonth(d.getMonth()-3); return d.toISOString().split('T')[0] })
  const [reportTo, setReportTo]     = useState(new Date().toISOString().split('T')[0])
  const [showSendReports, setShowSendReports] = useState(false)
  const [sendReportsTarget, setSendReportsTarget] = useState('all') // 'all' or 'selected'
  const [sendReportsSelected, setSendReportsSelected] = useState([]) // array of student objects
  const [sendReportsFrom, setSendReportsFrom] = useState(() => { const d = new Date(); d.setMonth(d.getMonth()-3); return d.toISOString().split('T')[0] })
  const [sendReportsTo, setSendReportsTo] = useState(new Date().toISOString().split('T')[0])
  const [sendingReports, setSendingReports] = useState(false)
  const [sendReportsProgress, setSendReportsProgress] = useState(null) // { done, total }
  const [recentSentReports, setRecentSentReports] = useState([])
  const [invitingId, setInvitingId] = useState(null)
  const [showQr, setShowQr] = useState(false)
  const [showInviteMenu, setShowInviteMenu] = useState(false)
  const [showNameDropdown, setShowNameDropdown] = useState(false)
  const [nameDropdownSearch, setNameDropdownSearch] = useState('')
  const nameDropdownRef = useRef(null)
  const selectingIdRef = useRef(null) // tracks the most recently requested athlete, so a slower/stale fetch response for a previous athlete can be ignored if the coach has since switched

  useEffect(() => {
    if (!showNameDropdown) return
    function handleClick(e) {
      if (nameDropdownRef.current && !nameDropdownRef.current.contains(e.target)) {
        setShowNameDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [showNameDropdown])

  async function pushPdpSectionToAthletes() {
    if (!pushPdpSection) return
    const items = teamPdpApData?.pdp_notes?.[pushPdpSection] || []
    if (items.length === 0) return
    const targets = pushPdpTarget === 'individual'
      ? (pushPdpAthlete ? [pushPdpAthlete] : [])
      : students.filter(s => s.is_kr || s.is_pts || s.discipline === 'KRBA')
    if (targets.length === 0) return
    setPushingPdp(true)
    for (const s of targets) {
      const { data: apRow } = await supabase.from('athlete_profiles').select('pdp_notes').eq('student_id', s.id).maybeSingle()
      const existing = apRow?.pdp_notes?.[pushPdpSection] || []
      const merged = [...new Set([...existing, ...items])]
      const newPdp = { ...(apRow?.pdp_notes || {}), [pushPdpSection]: merged }
      await supabase.from('athlete_profiles').upsert({ student_id: s.id, pdp_notes: newPdp }, { onConflict: 'student_id' })
    }
    setPushingPdp(false)
    setShowPushPdp(false)
    setPushPdpSection('')
    setPushPdpAthlete(null)
    setPushPdpAthleteSearch('')
    alert(`Sent to ${targets.length} athlete${targets.length === 1 ? '' : 's'}.`)
  }

  useEffect(() => { loadStudents() }, [])

  useEffect(() => {
    loadTeamPdpTemplate()
  }, [])

  async function loadTeamPdpTemplate() {
    const { data: memberRow } = await supabase.from('members').select('id').eq('email', 'team-template@kr-centre.placeholder').maybeSingle()
    if (!memberRow) return
    const { data: studentRow } = await supabase.from('students').select('*, members(first_name, last_name)').eq('member_id', memberRow.id).maybeSingle()
    if (!studentRow) return
    setTeamTemplateStudent(studentRow)
    const { data: apRow } = await supabase.from('athlete_profiles').select('*').eq('student_id', studentRow.id).maybeSingle()
    setTeamPdpApData(apRow || null)
  }

  useEffect(() => {
    function handleResize() { setIsMobileView(window.innerWidth < 900) }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  useEffect(() => {
    supabase.from('club_events').select('*').order('event_date')
      .then(({ data }) => setClubEvents(data || []))
  }, [])

  useEffect(() => {
    supabase.from('team_notes').select('*').order('created_at', { ascending: false }).limit(20)
      .then(({ data }) => setTeamNotes(data || []))
  }, [])

  useEffect(() => {
    const todayStr = new Date().toISOString().split('T')[0]
    supabase.from('fit2fight_sessions').select('*').eq('session_date', todayStr)
      .then(({ data }) => setTodaysAllSessions(data || []))
  }, [])

  useEffect(() => {
    supabase.from('fit2fight_sessions').select('*, students(student_ref, is_kr, is_pts, discipline, members(first_name, last_name))')
      .order('session_date', { ascending: false }).limit(1000)
      .then(({ data }) => setAllTeamSessions(data || []))
  }, [])

  useEffect(() => {
    supabase.from('athlete_profiles').select('student_id, pdp_notes, media_files')
      .then(({ data }) => setAllAthleteProfiles(data || []))
  }, [])

  useEffect(() => {
    const todayStr = new Date().toISOString().split('T')[0]
    supabase.from('attendance').select('student_id, session_date, attendance_type').eq('session_date', todayStr)
      .neq('attendance_type', 'absent').neq('attendance_type', 'excused')
      .then(({ data }) => setTodaysAllAttendance(data || []))
  }, [])

  useEffect(() => {
    const todayStr = new Date().toISOString().split('T')[0]
    supabase.from('athlete_notes_log').select('student_id, logged_at')
      .gte('logged_at', todayStr).lt('logged_at', todayStr + 'T23:59:59')
      .then(({ data }) => setTodaysAllNotes(data || []))
  }, [])

  useEffect(() => {
    const todayStr = new Date().toISOString().split('T')[0]
    Promise.all([
      supabase.from('tpt_boxing').select('student_id, assessed_at').gte('assessed_at', todayStr).lt('assessed_at', todayStr + 'T23:59:59'),
      supabase.from('tpt_kickboxing').select('student_id, assessed_at').gte('assessed_at', todayStr).lt('assessed_at', todayStr + 'T23:59:59'),
    ]).then(([box, kb]) => setTodaysAllTtp([...(box.data || []), ...(kb.data || [])]))
  }, [])

  useEffect(() => {
    supabase.from('ttp_benchmarks').select('*').eq('discipline', 'boxing')
      .order('set_at', { ascending: false }).limit(1)
      .then(({ data }) => setTtpBenchmark(data?.[0] || null))
  }, [])

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

  async function saveNewBenchmark() {
    setSavingBenchmark(true)
    const payload = { discipline: 'boxing', notes: benchmarkNotes.trim() || null }
    TTP_BENCHMARK_FIELDS.forEach(f => { payload[f] = benchmarkScores[f] ? Number(benchmarkScores[f]) : null })
    const { data, error } = await supabase.from('ttp_benchmarks').insert(payload).select('*').single()
    if (error) { alert('Error saving benchmark: ' + error.message); setSavingBenchmark(false); return }
    setTtpBenchmark(data)
    setShowSetBenchmark(false)
    setBenchmarkScores({})
    setBenchmarkNotes('')
    setSavingBenchmark(false)
  }

  useEffect(() => {
    supabase.from('team_targets').select('*').order('section_key').order('question_label')
      .then(({ data }) => setTeamTargets(data || []))
  }, [])

  useEffect(() => {
    supabase.from('athlete_reports').select('id, student_id, date_from, date_to, sent_at, students(student_ref, members(first_name, last_name))')
      .order('sent_at', { ascending: false }).limit(20)
      .then(({ data }) => setRecentSentReports(data || []))
  }, [])

  async function addTeamTarget() {
    const isSectionLevel = !newTargetQuestion
    const finalValue = (isSectionLevel && !targetUseFreeText)
      ? (targetFreqNumber ? `${targetFreqNumber} per ${targetFreqPeriod === 'day' ? '1 day' : targetFreqPeriod === 'week' ? '1 week' : '1 month'}` : '')
      : newTargetValue.trim()
    if (!finalValue) return
    setSavingTarget(true)
    const { data, error } = await supabase.from('team_targets').insert({
      section_key: newTargetSection,
      question_label: newTargetQuestion.trim() || null,
      target_value: finalValue,
      notes: newTargetNotes.trim() || null,
      student_id: targetAthlete?.id || null,
    }).select('*').single()
    if (error) { alert('Error saving target: ' + error.message); setSavingTarget(false); return }
    setTeamTargets(prev => [...prev, data].sort((a, b) => a.section_key.localeCompare(b.section_key)))
    setNewTargetQuestion(''); setNewTargetValue(''); setNewTargetNotes('')
    setTargetFreqNumber(''); setTargetFreqPeriod('day'); setTargetUseFreeText(false)
    setTargetAthlete(null); setTargetAthleteSearch('')
    setShowAddTarget(false)
    setSavingTarget(false)
  }

  // Inline target form -- rendered right under whichever section/card
  // triggered it (see showAddTarget/newTargetSection/newTargetQuestion
  // checks at each trigger point), instead of a single form at the
  // bottom of the page.
  function renderInlineTargetForm() {
    const sectionConfig = DASHBOARD_SECTIONS.find(s => s.key === newTargetSection)
    const questionOptions = sectionConfig?.subItems || []
    const isSectionLevel = !newTargetQuestion
    const athleteResults = students
      .filter(s => !targetAthleteSearch || `${s.members?.first_name || ''} ${s.members?.last_name || ''}`.toLowerCase().includes(targetAthleteSearch.toLowerCase()))

    return (
      <div ref={targetFormRef} style={{ marginTop: 8, padding: 10, background: 'var(--bg-secondary)', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
        <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 8, textTransform: 'capitalize' }}>
          Setting target for: <strong>{newTargetSection.replace(/_/g, ' ')}</strong>
        </p>

        {questionOptions.length > 0 && (
          <div style={{ marginBottom: 8 }}>
            <label style={{ fontSize: 11, color: 'var(--text-tertiary)', display: 'block', marginBottom: 2 }}>Question / metric</label>
            <select value={newTargetQuestion} onChange={e => setNewTargetQuestion(e.target.value)} style={{ width: '100%' }}>
              <option value="">— Whole section (no specific question) —</option>
              {questionOptions.map(q => <option key={q.key} value={q.label}>{q.label}</option>)}
            </select>
          </div>
        )}

        <div style={{ marginBottom: 8 }}>
          <label style={{ fontSize: 11, color: 'var(--text-tertiary)', display: 'block', marginBottom: 2 }}>Applies to</label>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <button className="btn btn-sm" onClick={() => { setTargetAthlete(null); setTargetAthleteSearch('') }}
              style={{ background: !targetAthlete ? '#378ADD20' : undefined, borderColor: !targetAthlete ? '#378ADD' : undefined }}>
              👥 Whole team
            </button>
            {targetAthlete ? (
              <span className="btn btn-sm" style={{ background: '#1D9E7520', borderColor: '#1D9E75', cursor: 'pointer' }}
                onClick={() => setTargetAthlete(null)} title="Click to remove">
                → {targetAthlete.members?.first_name} {targetAthlete.members?.last_name} ×
              </span>
            ) : (
              <div ref={targetDropdownRef} style={{ position: 'relative', flex: 1, minWidth: 140 }}>
                <input value={targetAthleteSearch} onChange={e => setTargetAthleteSearch(e.target.value)}
                  onFocus={() => setShowTargetAthleteDropdown(true)}
                  placeholder="Or search an individual athlete…" style={{ width: '100%', fontSize: 12 }} />
                {showTargetAthleteDropdown && (
                  <div className="card" style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10, padding: 4, maxHeight: 180, overflowY: 'auto' }}>
                    {athleteResults.length === 0 ? (
                      <p style={{ fontSize: 12, color: 'var(--text-tertiary)', padding: '6px 8px' }}>No matching athletes.</p>
                    ) : athleteResults.map(s => (
                      <button key={s.id} onClick={() => { setTargetAthlete(s); setShowTargetAthleteDropdown(false) }}
                        style={{ display: 'block', width: '100%', textAlign: 'left', padding: '6px 8px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, borderRadius: 6 }}>
                        {s.members?.first_name} {s.members?.last_name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {isSectionLevel && !targetUseFreeText ? (
          <div style={{ marginBottom: 8 }}>
            <label style={{ fontSize: 11, color: 'var(--text-tertiary)', display: 'block', marginBottom: 2 }}>
              Target (complete this many items, per timescale)
            </label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input type="number" min="1" value={targetFreqNumber} onChange={e => setTargetFreqNumber(e.target.value)}
                placeholder="3" style={{ width: 70 }} />
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>times per</span>
              <select value={targetFreqPeriod} onChange={e => setTargetFreqPeriod(e.target.value)} style={{ flex: 1 }}>
                <option value="day">1 day</option>
                <option value="week">1 week</option>
                <option value="month">1 month</option>
              </select>
            </div>
            <button onClick={() => setTargetUseFreeText(true)} style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: 11, padding: 0, marginTop: 6, textDecoration: 'underline' }}>
              Use custom text instead
            </button>
          </div>
        ) : (
          <div style={{ marginBottom: 8 }}>
            <label style={{ fontSize: 11, color: 'var(--text-tertiary)', display: 'block', marginBottom: 2 }}>Target</label>
            <input value={newTargetValue} onChange={e => setNewTargetValue(e.target.value)}
              placeholder="e.g. 8 hours, 3 litres, Level 10" style={{ width: '100%' }} />
            {isSectionLevel && (
              <button onClick={() => setTargetUseFreeText(false)} style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: 11, padding: 0, marginTop: 6, textDecoration: 'underline' }}>
                Use number + timescale instead
              </button>
            )}
          </div>
        )}

        <textarea value={newTargetNotes} onChange={e => setNewTargetNotes(e.target.value)} placeholder="Notes (optional)" rows={2}
          style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius)', fontSize: 13, background: 'var(--bg)', color: 'var(--text)', fontFamily: 'var(--font-sans)', resize: 'vertical', marginBottom: 8 }} />
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-primary btn-sm" disabled={savingTarget} onClick={addTeamTarget}>
            {savingTarget ? 'Saving…' : 'Save target'}
          </button>
          <button className="btn btn-sm" onClick={() => setShowAddTarget(false)}>Cancel</button>
        </div>
      </div>
    )
  }

  async function deleteTeamTarget(id) {
    if (!confirm('Delete this target?')) return
    const { error } = await supabase.from('team_targets').delete().eq('id', id)
    if (error) return alert('Error: ' + error.message)
    setTeamTargets(prev => prev.filter(t => t.id !== id))
  }

  // Athlete dropdown for targeting a specific saved note -- reuses the
  // already-loaded students list, showing everyone when the search is
  // empty (full dropdown) or filtering as you type. Multi-select,
  // excludes athletes this note has already been sent to.
  function noteDropdownResultsFor(note) {
    const sentIds = new Set(note.sent_to_student_ids || [])
    return students
      .filter(s => !sentIds.has(s.id))
      .filter(s => {
        if (!noteTargetSearch) return true
        const name = `${s.members?.first_name || ''} ${s.members?.last_name || ''}`.toLowerCase()
        return name.includes(noteTargetSearch.toLowerCase())
      })
  }

  async function addDashNote() {
    if (!dashNoteText.trim()) return
    setSavingDashNote(true)
    const { data, error } = await supabase.from('team_notes').insert({ note_text: dashNoteText.trim() }).select('*').single()
    if (error) { alert('Error saving note: ' + error.message); setSavingDashNote(false); return }
    setTeamNotes(prev => [data, ...prev])
    setDashNoteText('')
    setSavingDashNote(false)
  }

  async function sendNoteToAthlete(note, student) {
    const { error } = await supabase.from('athlete_notes_log').insert({ student_id: student.id, note_text: note.note_text })
    if (error) return alert(`Error sending to ${student.members?.first_name}: ` + error.message)
    const updatedIds = [...new Set([...(note.sent_to_student_ids || []), student.id])]
    const { error: err2 } = await supabase.from('team_notes').update({ sent_to_student_ids: updatedIds }).eq('id', note.id)
    if (err2) return alert('Error updating note: ' + err2.message)
    setTeamNotes(prev => prev.map(n => n.id === note.id ? { ...n, sent_to_student_ids: updatedIds } : n))
    setNoteTargetSearch('')
  }

  async function removeNoteTarget(note, studentId) {
    const updatedIds = (note.sent_to_student_ids || []).filter(id => id !== studentId)
    const { error } = await supabase.from('team_notes').update({ sent_to_student_ids: updatedIds }).eq('id', note.id)
    if (error) return alert('Error updating note: ' + error.message)
    setTeamNotes(prev => prev.map(n => n.id === note.id ? { ...n, sent_to_student_ids: updatedIds } : n))
  }

  async function deleteTeamNote(id) {
    if (!confirm('Delete this note?')) return
    const { error } = await supabase.from('team_notes').delete().eq('id', id)
    if (error) return alert('Error: ' + error.message)
    setTeamNotes(prev => prev.filter(n => n.id !== id))
  }

  async function addEvent() {
    if (!newEventTitle.trim() || !newEventDate) return
    if (showAddEventTarget === 'individual' && !addEventAthlete) return
    setSavingEvent(true)
    const { data, error } = await supabase.from('club_events').insert({
      title: newEventTitle.trim(), description: newEventDesc.trim() || null,
      event_date: newEventDate, event_time: newEventTime || null,
      send_to_all_students: newEventSendAll,
      target_type: showAddEventTarget,
      target_student_id: showAddEventTarget === 'individual' ? addEventAthlete.id : null,
    }).select('*').single()
    if (error) { alert('Error saving event: ' + error.message); setSavingEvent(false); return }
    setClubEvents(prev => [...prev, data].sort((a, b) => a.event_date.localeCompare(b.event_date)))
    setNewEventTitle(''); setNewEventDate(''); setNewEventTime(''); setNewEventDesc(''); setNewEventSendAll(true)
    setShowAddEventTarget('all'); setAddEventAthlete(null); setAddEventAthleteSearch('')
    setShowAddEvent(false)
    setSavingEvent(false)
  }

  async function deleteEvent(id) {
    if (!confirm('Delete this event?')) return
    const { error } = await supabase.from('club_events').delete().eq('id', id)
    if (error) return alert('Error: ' + error.message)
    setClubEvents(prev => prev.filter(e => e.id !== id))
  }

  async function sendReportsBulk() {
    const targets = sendReportsTarget === 'all'
      ? students.filter(s => s.is_kr || s.is_pts || s.discipline === 'KRBA')
      : sendReportsSelected
    if (targets.length === 0) return
    setSendingReports(true)
    setSendReportsProgress({ done: 0, total: targets.length })
    let sentCount = 0
    for (const student of targets) {
      const data = await buildReportData(student, sendReportsFrom, sendReportsTo)
      const { error } = await supabase.from('athlete_reports').insert({
        student_id: student.id, report_data: data, date_from: sendReportsFrom, date_to: sendReportsTo,
      })
      if (error) alert(`Error sending report for ${student.members?.first_name}: ` + error.message)
      else sentCount++
      setSendReportsProgress(p => ({ done: p.done + 1, total: p.total }))
    }
    const { data: refreshed } = await supabase.from('athlete_reports')
      .select('id, student_id, date_from, date_to, sent_at, students(student_ref, members(first_name, last_name))')
      .order('sent_at', { ascending: false }).limit(20)
    setRecentSentReports(refreshed || [])
    setSendingReports(false)
    setSendReportsProgress(null)
    setSendReportsSelected([])
    setShowSendReports(false)
    alert(`Sent ${sentCount} report${sentCount === 1 ? '' : 's'}.`)
  }

  useEffect(() => {
    supabase.from('classes').select('*').eq('active', true).order('day_of_week').order('start_time')
      .then(({ data }) => setAllClasses(data || []))
  }, [])

  useEffect(() => {
    const todaysDate = new Date().toISOString().split('T')[0]
    const todaysSession = f2fData.find(s => s.session_date === todaysDate)
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
    setTodaysOtherSession(toEntries(todaysSession?.other_session))
  }, [f2fData])

  useEffect(() => {
    supabase.from('settings').select('key,value').in('key', ['pka_junior_belts', 'pka_senior_belts', 'krba_levels'])
      .then(({ data }) => {
        const map = Object.fromEntries((data || []).map(r => [r.key, r.value]))
        setBelts({ junior: map.pka_junior_belts || [], senior: map.pka_senior_belts || [], krba: map.krba_levels || [] })
      })
  }, [])

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

  useEffect(() => {
    const id = searchParams.get('id')
    if (id && students.length > 0) {
      const found = students.find(s => s.id === id)
      if (found) {
        if (selected?.id !== found.id) selectStudent(found)
        const initialTab = searchParams.get('tab')
        if (initialTab) setTab(initialTab)
      }
    } else if (!id && selected) {
      // id was removed from the URL (e.g. browser/device back button) --
      // return to the Athlete Dashboard rather than leaving the previous
      // athlete's profile showing
      setSelected(null)
    }
  }, [searchParams, students])

  async function loadStudents() {
    const [{ data }, { data: houseData }, { data: ptsLog }] = await Promise.all([
      supabase
        .from('students')
        .select('*, members(first_name, last_name, email, phone, date_of_birth, status, house_id, role, joined_date, houses(name, colour))')
        .order('created_at'),
      supabase.from('houses').select('id, name, points').order('points', { ascending: false }),
      supabase.from('points_log').select('student_id, points_awarded'),
    ])
    setStudents(data || [])
    setHouses(houseData || [])
    // True total points per student, counting each award once regardless
    // of scope (house/individual/both) -- matches how the League page's
    // Individual leaderboard ranks people, so "overall position" here
    // always agrees with that ranking.
    const totals = {}
    ;(ptsLog || []).forEach(p => { totals[p.student_id] = (totals[p.student_id] || 0) + (p.points_awarded || 0) })
    setTruePointTotals(totals)

    const { data: allAtt } = await supabase.from('attendance')
      .select('id, student_id, session_date, attendance_type, students(discipline, class_schedule, class_time)')
    setAllAttendance(allAtt || [])

    setLoading(false)
  }

  async function copyInviteLink(s) {
    const name = s.members?.first_name || 'there'
    const url = `https://klasschamp.netlify.app/claim?ref=${encodeURIComponent(s.student_ref)}`
    const msg = `Hi ${name}, you've been invited to the KR Centre athlete app. Tap this link to confirm it's you and set up your login: ${url}`
    try {
      await navigator.clipboard.writeText(msg)
      alert('✓ Invite message copied — paste it anywhere (WhatsApp, in person, etc.)')
    } catch (e) {
      alert('Could not copy automatically. Here is the message to share:\n\n' + msg)
    }
  }

  function whatsappInvite(s) {
    const url = `https://klasschamp.netlify.app/claim?ref=${encodeURIComponent(s.student_ref)}`
    const msg = encodeURIComponent(`Hi ${s.members?.first_name || 'there'}, you've been invited to the KR Centre athlete app. Tap this link to confirm it's you and set up your login: ${url}`)
    const phone = s.members?.phone ? s.members.phone.replace(/\D/g, '') : ''
    window.open(`https://wa.me/${phone}?text=${msg}`, '_blank')
  }

  async function inviteStudent(s, method) {
    const rawEmail = s.members?.email
    const hasRealEmail = rawEmail && !rawEmail.includes('@kr-centre.placeholder')
    const phone = s.members?.phone

    if (method === 'sms') {
      if (!phone) return alert('No phone number on file for this athlete.')
      const url = `https://klasschamp.netlify.app/claim?ref=${encodeURIComponent(s.student_ref)}`
      const msg = encodeURIComponent(`Hi ${s.members.first_name}, you've been invited to the KR Centre athlete app. Tap this link to confirm it's you and set up your login: ${url}`)
      window.open(`sms:${phone.replace(/\s/g,'')}?body=${msg}`, '_blank')
      return
    }

    // method === 'email' (or default)
    if (!hasRealEmail) return alert('No real email on file for this athlete — add one on their profile, or use the SMS invite instead.')
    if (!confirm(`Send login invite to ${rawEmail}?`)) return
    setInvitingId(s.id)
    try {
      const res = await fetch('/.netlify/functions/invite-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: rawEmail, name: `${s.members?.first_name} ${s.members?.last_name}` }),
      })
      const data = await res.json()
      if (data.success) alert(data.warning ? `✓ Invite sent, but: ${data.warning}` : `✓ Invite sent to ${rawEmail}`)
      else alert(`Error: ${data.error}`)
    } catch (e) {
      alert('Failed to send invite')
    }
    setInvitingId(null)
  }

  async function updateSelectedField(field, value) {
    const { error } = await supabase.from('students').update({ [field]: value }).eq('id', selected.id)
    if (error) { alert('Error saving: ' + error.message); return }
    setSelected(prev => ({ ...prev, [field]: value }))
    setStudents(prev => prev.map(s => s.id === selected.id ? { ...s, [field]: value } : s))
  }

  async function toggleSelectedGroup(key) {
    await updateSelectedField(key, !selected[key])
  }

  async function saveCompWeightHere(value) {
    const { error } = await supabase.from('athlete_profiles').upsert({ student_id: selected.id, weight_division: value }, { onConflict: 'student_id' })
    if (error) { alert('Error saving comp weight: ' + error.message); return }
    setApData(prev => ({ ...(prev || {}), weight_division: value }))
  }

  // Save a single wellbeing question's data directly from the Home page,
  // without needing to open the full Fit2Fight log form. Updates today's
  // session if one already exists, otherwise creates one.
  async function saveWellbeingField(field, updater) {
    setSavingWellbeing(true)
    const todaysDate = new Date().toISOString().split('T')[0]
    const current = todaysWellbeing[field] || {}
    const updatedField = updater(current)
    const newWellbeing = { ...todaysWellbeing, [field]: updatedField }
    setTodaysWellbeing(newWellbeing) // optimistic local update

    const existing = f2fData.find(s => s.session_date === todaysDate)
    let error
    if (existing) {
      ;({ error } = await supabase.from('fit2fight_sessions').update({ wellbeing: newWellbeing }).eq('id', existing.id))
    } else {
      const { data, error: insertErr } = await supabase.from('fit2fight_sessions')
        .insert({ student_id: selected.id, session_date: todaysDate, wellbeing: newWellbeing })
        .select().single()
      error = insertErr
      if (!error && data) setF2fData(prev => [data, ...prev])
    }
    if (existing && !error) {
      setF2fData(prev => prev.map(s => s.id === existing.id ? { ...s, wellbeing: newWellbeing } : s))
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
    setSavingMentalityLog(true)
    const todaysDate = new Date().toISOString().split('T')[0]
    const current = todaysMentalityLog[field] || {}
    const updatedField = updater(current)
    const newLog = { ...todaysMentalityLog, [field]: updatedField }
    setTodaysMentalityLog(newLog)

    const existing = f2fData.find(s => s.session_date === todaysDate)
    let error
    if (existing) {
      ;({ error } = await supabase.from('fit2fight_sessions').update({ mentality_log: newLog }).eq('id', existing.id))
      if (!error) setF2fData(prev => prev.map(s => s.id === existing.id ? { ...s, mentality_log: newLog } : s))
    } else {
      const { data, error: insertErr } = await supabase.from('fit2fight_sessions')
        .insert({ student_id: selected.id, session_date: todaysDate, mentality_log: newLog })
        .select().single()
      error = insertErr
      if (!error && data) setF2fData(prev => [data, ...prev])
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
  // Cycles a calendar day's attendance state: none -> attended (green) ->
  // absent (red) -> none (deselect). Writes directly to the attendance
  // table so it's immediately reflected in the admin Registers/reports.
  async function cycleAttendanceDay(dateStr) {
    const existing = allAttendance.find(a => a?.student_id === selected.id && a?.session_date === dateStr)
    const attendedRecord = attendanceData.find(a => a.session_date === dateStr)

    if (attendedRecord) {
      // Currently green -> turn red (explicit absent)
      const { error } = await supabase.from('attendance')
        .update({ present: false, attendance_type: 'absent' }).eq('id', attendedRecord.id)
      if (error) return alert('Error updating attendance: ' + error.message)
      setAttendanceData(prev => prev.filter(a => a.id !== attendedRecord.id))
      setAllAttendance(prev => prev.map(a => a?.id === attendedRecord.id ? { ...a, present: false, attendance_type: 'absent' } : a))
    } else if (existing?.attendance_type === 'absent') {
      // Currently red -> clear to blank. We keep the row (marked
      // "excused") instead of deleting it, otherwise a date that
      // matches an assigned class's weekday would immediately show
      // as red again from the auto-missed inference.
      const { error } = await supabase.from('attendance')
        .update({ attendance_type: 'excused' }).eq('id', existing.id)
      if (error) return alert('Error clearing attendance: ' + error.message)
      setAllAttendance(prev => prev.map(a => a?.id === existing.id ? { ...a, attendance_type: 'excused' } : a))
    } else if (existing?.attendance_type === 'excused') {
      // Currently blank (explicitly cleared) -> mark attended (green)
      const { error } = await supabase.from('attendance')
        .update({ present: true, attendance_type: 'attended' }).eq('id', existing.id)
      if (error) return alert('Error saving attendance: ' + error.message)
      const updatedRecord = { ...existing, present: true, attendance_type: 'attended' }
      setAttendanceData(prev => [...prev, updatedRecord])
      setAllAttendance(prev => prev.map(a => a?.id === existing.id ? updatedRecord : a))
    } else {
      // Currently blank (no record at all) -> mark attended (green)
      const { data, error } = await supabase.from('attendance').insert({
        student_id: selected.id, present: true, attendance_type: 'attended',
        session_date: dateStr, attended_at: new Date(dateStr + 'T12:00:00').toISOString(),
      }).select().single()
      if (error) return alert('Error saving attendance: ' + error.message)
      setAttendanceData(prev => [...prev, data])
      setAllAttendance(prev => [...prev, data])
    }
  }

  async function addClassAssignment() {
    if (!addingClassId) return
    setSavingClassAssignment(true)
    const { data, error } = await supabase.from('student_class_assignments')
      .insert({ student_id: selected.id, class_id: addingClassId })
      .select('id, class_id, classes(*)').single()
    if (error) { alert('Error adding class: ' + error.message); setSavingClassAssignment(false); return }
    setAssignedClasses(prev => [...prev, data])
    setAddingClassId('')
    setSavingClassAssignment(false)
  }

  async function removeClassAssignment(assignmentId) {
    const { error } = await supabase.from('student_class_assignments').delete().eq('id', assignmentId)
    if (error) return alert('Error removing class: ' + error.message)
    setAssignedClasses(prev => prev.filter(a => a.id !== assignmentId))
  }

  const NOTE_PDP_TARGETS = {
    'Winning ways': 'winning_ways',
    'Psychology':   'psychology_notes',
    'Technical':    'tech_notes',
    'Tactical':     'tact_notes',
    'Physical':     'physical_notes',
  }

  async function addNote() {
    if (!newNoteText.trim()) return
    setSavingNote(true)
    const { data, error } = await supabase.from('athlete_notes_log')
      .insert({ student_id: selected.id, note_text: newNoteText.trim() })
      .select('*').single()
    if (error) { alert('Error saving note: ' + error.message); setSavingNote(false); return }
    setNotesLog(prev => [data, ...prev])
    setNewNoteText('')
    setSavingNote(false)
  }

  async function deleteNote(noteId) {
    if (!confirm('Delete this note?')) return
    const { error } = await supabase.from('athlete_notes_log').delete().eq('id', noteId)
    if (error) return alert('Error deleting note: ' + error.message)
    setNotesLog(prev => prev.filter(n => n.id !== noteId))
  }

  async function sendNoteToPdpCategory(note, categoryLabel) {
    const sectionKey = NOTE_PDP_TARGETS[categoryLabel]
    if (!sectionKey) return
    const pdpNotes = apData?.pdp_notes || {}
    const current = pdpNotes[sectionKey] || []
    const entryText = note.note_text
    if (current.includes(entryText)) return alert(`Already sent to ${categoryLabel}.`)
    const updatedPdp = { ...pdpNotes, [sectionKey]: [...current, entryText] }
    const { error } = await supabase.from('athlete_profiles').upsert({ student_id: selected.id, pdp_notes: updatedPdp }, { onConflict: 'student_id' })
    if (error) return alert('Error sending to PDP: ' + error.message)
    const sentTo = [...new Set([...(note.sent_to || []), categoryLabel])]
    const { error: err2 } = await supabase.from('athlete_notes_log').update({ sent_to: sentTo }).eq('id', note.id)
    if (err2) return alert('Error updating note: ' + err2.message)
    setApData(a => ({ ...a, pdp_notes: updatedPdp }))
    setNotesLog(prev => prev.map(n => n.id === note.id ? { ...n, sent_to: sentTo } : n))
  }


  async function saveTestValue(testName, value) {
    setSavingTest(true)
    const todaysDate = new Date().toISOString().split('T')[0]
    const newTest = { ...todaysTest, [testName]: value }
    setTodaysTest(newTest)

    const existing = f2fData.find(s => s.session_date === todaysDate)
    let error
    if (existing) {
      ;({ error } = await supabase.from('fit2fight_sessions').update({ test: newTest }).eq('id', existing.id))
      if (!error) setF2fData(prev => prev.map(s => s.id === existing.id ? { ...s, test: newTest } : s))
    } else {
      const { data, error: insertErr } = await supabase.from('fit2fight_sessions')
        .insert({ student_id: selected.id, session_date: todaysDate, test: newTest })
        .select().single()
      error = insertErr
      if (!error && data) setF2fData(prev => [data, ...prev])
    }
    if (error) alert('Error saving: ' + error.message)
    setSavingTest(false)
  }

  async function clearTestCategory(catKey) {
    const cat = TEST_CATEGORIES.find(c => c.key === catKey)
    if (!cat) return
    setSavingTest(true)
    const newTest = { ...todaysTest }
    cat.tests.forEach(t => delete newTest[t.name])
    setTodaysTest(newTest)

    const todaysDate = new Date().toISOString().split('T')[0]
    const existing = f2fData.find(s => s.session_date === todaysDate)
    if (existing) {
      const { error } = await supabase.from('fit2fight_sessions').update({ test: newTest }).eq('id', existing.id)
      if (!error) setF2fData(prev => prev.map(s => s.id === existing.id ? { ...s, test: newTest } : s))
      if (error) alert('Error saving: ' + error.message)
    }
    setSavingTest(false)
  }

  // Generic save for Running/Watt bike/Bodyweight/Stretch flows -- these
  // are single-object fields (not flat multi-value maps like Test), so
  // saving means writing the whole updated object/array for that field.
  async function savePhysicalField(dbField, newValue, localSetter) {
    setSavingPhysical(true)
    localSetter(newValue)
    const todaysDate = new Date().toISOString().split('T')[0]
    const existing = f2fData.find(s => s.session_date === todaysDate)
    let error
    if (existing) {
      ;({ error } = await supabase.from('fit2fight_sessions').update({ [dbField]: newValue }).eq('id', existing.id))
      if (!error) setF2fData(prev => prev.map(s => s.id === existing.id ? { ...s, [dbField]: newValue } : s))
    } else {
      const { data, error: insertErr } = await supabase.from('fit2fight_sessions')
        .insert({ student_id: selected.id, session_date: todaysDate, [dbField]: newValue })
        .select().single()
      error = insertErr
      if (!error && data) setF2fData(prev => [data, ...prev])
    }
    if (error) alert('Error saving: ' + error.message)
    setSavingPhysical(false)
  }

  function goHome() {
    setSelected(null)
    if (searchParams.get('id')) setSearchParams(prev => { const next = new URLSearchParams(prev); next.delete('id'); next.delete('tab'); return next })
  }

  async function selectStudent(s) {
    selectingIdRef.current = s.id
    setSelected(s)
    setTab('home')
    setEditing(false)
    setReportData(null)
    if (searchParams.get('id') !== s.id) {
      setSearchParams(prev => { const next = new URLSearchParams(prev); next.set('id', s.id); return next })
    }
    setF2fData([])
    setTptData({ kickboxing: [], boxing: [] })
    setAttendanceData([])
    setSessionPoints([])
    setOpenSession(null)
    // Load F2F sessions
    supabase.from('fit2fight_sessions').select('*').eq('student_id', s.id)
      .order('session_date', { ascending: false })
      .then(({ data }) => { if (selectingIdRef.current === s.id) setF2fData(data || []) })
    // Load TTP data -- latest 2, to show side by side for comparison
    supabase.from('tpt_kickboxing').select('*').eq('student_id', s.id)
      .order('assessed_at', { ascending: false }).limit(2)
      .then(({ data }) => { if (selectingIdRef.current === s.id) setTptData(prev => ({ ...prev, kickboxing: data || [] })) })
    supabase.from('tpt_boxing').select('*').eq('student_id', s.id)
      .order('assessed_at', { ascending: false }).limit(2)
      .then(({ data }) => { if (selectingIdRef.current === s.id) setTptData(prev => ({ ...prev, boxing: data || [] })) })
    // Load attendance history + coach points for the Sessions tab
    supabase.from('attendance').select('id, session_date, attendance_type, attended_at, note')
      .eq('student_id', s.id).neq('attendance_type', 'absent').neq('attendance_type', 'excused')
      .order('session_date', { ascending: false })
      .then(({ data, error }) => { if (!error && selectingIdRef.current === s.id) setAttendanceData(data || []) })
    // Load classes this athlete is explicitly assigned to
    supabase.from('student_class_assignments').select('id, class_id, classes(*)')
      .eq('student_id', s.id)
      .then(({ data, error }) => { if (!error && selectingIdRef.current === s.id) setAssignedClasses(data || []) })
    supabase.from('athlete_notes_log').select('*')
      .eq('student_id', s.id)
      .order('logged_at', { ascending: false })
      .then(({ data, error }) => { if (!error && selectingIdRef.current === s.id) setNotesLog(data || []) })
    supabase.from('points_log').select('id, point_type, points_awarded, point_scope, note, awarded_at')
      .eq('student_id', s.id)
      .order('awarded_at', { ascending: false })
      .then(({ data, error }) => { if (!error && selectingIdRef.current === s.id) setSessionPoints(data || []) })
    const { data } = await supabase
      .from('athlete_profiles')
      .select('*, pdp_notes, pdp_shared')
      .eq('student_id', s.id)
      .single()
    if (selectingIdRef.current !== s.id) return // a newer selection has since started; don't apply this stale response
    setApData(data || null)
    if (data) {
      setEditForm({
        age_division_kickboxing: data.age_division_kickboxing || '',
        age_division_boxing: data.age_division_boxing || '',
        weight_division: data.weight_division || '',
        kode_red_debut: data.kode_red_debut || '',
        top_achievements: data.top_achievements || '',
        favourite_technique: data.favourite_technique || '',
        training_music: data.training_music || '',
        social_media: data.social_media || '',
        sponsor_links: data.sponsor_links || '',
        show_on_website: data.show_on_website || false,
      })
      setResults(data.recent_results || ['', ''])
    } else {
      setEditForm({
        age_division_kickboxing: '', age_division_boxing: '', weight_division: '',
        kode_red_debut: '', top_achievements: '', favourite_technique: '',
        training_music: '', social_media: '', sponsor_links: '', show_on_website: false,
      })
      setResults(['', ''])
    }
  }

  // Prev/next navigation between athletes -- an alternative to using
  // the list, matching the order shown there (alphabetical, respecting
  // any active search filter).
  function goToAdjacentAthlete(direction) {
    if (!selected) return
    const idx = filtered.findIndex(s => s.id === selected.id)
    if (idx === -1) return
    const nextIdx = idx + direction
    if (nextIdx < 0) { goHome(); return }
    if (nextIdx >= filtered.length) return
    selectStudent(filtered[nextIdx])
  }

  // Keeps students.weight_kg in sync with whichever weigh-in is most
  // recent across the known sources (Fit2Fight session weight checks,
  // TTP kickboxing assessments), rather than relying on it being
  // manually kept up to date.
  async function syncStudentWeightFromLatest(studentId) {
    const [{ data: f2fRows }, { data: tptRows }] = await Promise.all([
      supabase.from('fit2fight_sessions').select('session_date, weight_before, weight_after')
        .eq('student_id', studentId).order('session_date', { ascending: false }).limit(5),
      supabase.from('tpt_kickboxing').select('assessed_at, weight_kg')
        .eq('student_id', studentId).order('assessed_at', { ascending: false }).limit(1),
    ])
    let latestDate = null, latestWeight = null
    const latestF2f = (f2fRows || []).find(s => (s.weight_after ?? s.weight_before) != null)
    if (latestF2f) { latestDate = latestF2f.session_date; latestWeight = latestF2f.weight_after ?? latestF2f.weight_before }
    const tpt = tptRows?.[0]
    if (tpt?.weight_kg != null && tpt.assessed_at) {
      const tptDate = tpt.assessed_at.slice(0, 10)
      if (!latestDate || tptDate > latestDate) { latestDate = tptDate; latestWeight = tpt.weight_kg }
    }
    if (latestWeight == null) return
    const { error } = await supabase.from('students').update({ weight_kg: latestWeight }).eq('id', studentId)
    if (error) return
    setStudents(prev => prev.map(s => s.id === studentId ? { ...s, weight_kg: latestWeight } : s))
    setSelected(prev => prev?.id === studentId ? { ...prev, weight_kg: latestWeight } : prev)
  }

  async function saveFit2FightSession() {
    if (!selected) return
    setSavingSession(true)
    const payload = {
      student_id: selected.id,
      session_date: sessionForm.session_date,
      weight_before: sessionForm.weight_before === '' ? null : sessionForm.weight_before,
      weight_after: sessionForm.weight_after === '' ? null : sessionForm.weight_after,
      height_cm: sessionForm.height_cm === '' ? null : sessionForm.height_cm,
      reach_cm: sessionForm.reach_cm === '' ? null : sessionForm.reach_cm,
      notes: sessionForm.notes || null,
    }
    let error
    if (sessionForm.id) {
      ({ error } = await supabase.from('fit2fight_sessions').update(payload).eq('id', sessionForm.id))
    } else {
      ({ error } = await supabase.from('fit2fight_sessions').insert(payload))
    }
    if (error) { alert('Error saving session: ' + error.message); setSavingSession(false); return }
    const { data } = await supabase.from('fit2fight_sessions').select('*').eq('student_id', selected.id).order('session_date', { ascending: false })
    setF2fData(data || [])
    if (payload.weight_before != null || payload.weight_after != null) await syncStudentWeightFromLatest(selected.id)
    setEditingSession(null)
    setSavingSession(false)
  }

  async function deleteFit2FightSession(session) {
    if (!confirm(`Delete the ${new Date(session.session_date).toLocaleDateString('en-GB')} entry? This can't be undone.`)) return
    const { data, error } = await supabase.from('fit2fight_sessions').delete().eq('id', session.id).select('id')
    if (error) { alert('Error deleting: ' + error.message); return }
    if (!data || data.length === 0) {
      alert('The entry could not be deleted — this usually means a permissions (RLS) policy is blocking the delete rather than a real error. Check with whoever manages the database.')
      return
    }
    setF2fData(prev => prev.filter(s => s.id !== session.id))
  }

  async function saveSessionNote() {
    if (!openSession) return
    setSavingSessionNote(true)
    const { error } = await supabase.from('attendance').update({ note: sessionNoteDraft }).eq('id', openSession.id)
    if (error) {
      alert('Error saving note: ' + error.message)
    } else {
      setAttendanceData(prev => prev.map(a => a.id === openSession.id ? { ...a, note: sessionNoteDraft } : a))
      setOpenSession(s => ({ ...s, note: sessionNoteDraft }))
    }
    setSavingSessionNote(false)
  }

  async function saveProfile() {
    setSaving(true)
    const payload = {
      student_id: selected.id,
      ...editForm,
      recent_results: results.filter(r => r.trim()),
      updated_at: new Date().toISOString(),
    }
    let error
    if (apData?.id) {
      ({ error } = await supabase.from('athlete_profiles').update(payload).eq('id', apData.id))
    } else {
      const res = await supabase.from('athlete_profiles').insert(payload).select().single()
      error = res.error
      if (!error) setApData(res.data)
    }
    if (error) {
      alert('Error saving profile: ' + error.message)
      setSaving(false)
      return
    }
    setApData(p => ({ ...(p || {}), ...payload }))
    setEditing(false)
    setSaving(false)
  }

  async function buildReportData(student, from, to) {
    const [{ data: pts }, { data: sessions }, { data: tptKb }, { data: tptBox }, { data: apRows }] = await Promise.all([
      supabase.from('points_log')
        .select('point_type, points_awarded, point_scope, awarded_at')
        .eq('student_id', student.id)
        .gte('awarded_at', from)
        .lte('awarded_at', to + 'T23:59:59')
        .order('awarded_at', { ascending: false }),

      supabase.from('fit2fight_sessions')
        .select('session_date, weight_before, weight_after, running, watt_bike, bodyweight')
        .eq('student_id', student.id)
        .gte('session_date', from)
        .lte('session_date', to)
        .order('session_date', { ascending: false }),

      supabase.from('tpt_kickboxing')
        .select('assessed_at, weight_kg, straight_punches, push_ups, flat_plank, bleep_test_level, vertical_jump')
        .eq('student_id', student.id)
        .order('assessed_at', { ascending: false })
        .limit(5),

      supabase.from('tpt_boxing')
        .select('assessed_at, shapes, punch_quality, footwork, defence, heart_grit')
        .eq('student_id', student.id)
        .order('assessed_at', { ascending: false })
        .limit(5),

      supabase.from('athlete_profiles').select('*').eq('student_id', student.id).limit(1),
    ])

    const totalPts = (pts || []).reduce((s, p) => s + (p.points_awarded || 0), 0)
    const champCount = (pts || []).filter(p => p.point_type === 'Class Champ').length
    const firstWeight = sessions?.find(s => s.weight_before)?.weight_before
    const lastWeight  = [...(sessions || [])].reverse().find(s => s.weight_after)?.weight_after

    return {
      student,
      period: { from, to },
      points: { total: totalPts, champ: champCount, log: pts || [] },
      sessions: sessions || [],
      tptKb: tptKb || [],
      tptBox: tptBox || [],
      weightChange: firstWeight && lastWeight ? (parseFloat(lastWeight) - parseFloat(firstWeight)).toFixed(2) : null,
      profile: apRows?.[0] || null,
    }
  }

  async function generateReport() {
    if (!selected) return
    setReportLoading(true)
    const data = await buildReportData(selected, reportFrom, reportTo)
    setReportData(data)
    setReportLoading(false)
  }

  const athletes = students
    .filter(s => s.is_kr || s.is_pts || s.discipline === 'KRBA')
    .sort((a, b) => {
      const an = `${a.members?.first_name || ''} ${a.members?.last_name || ''}`.trim().toLowerCase()
      const bn = `${b.members?.first_name || ''} ${b.members?.last_name || ''}`.trim().toLowerCase()
      return an.localeCompare(bn)
    })
  const filtered = athletes.filter(s => {
    if (!search) return true
    const q = search.toLowerCase()
    return `${s.members?.first_name} ${s.members?.last_name} ${s.student_ref}`.toLowerCase().includes(q)
  })

  const m = selected?.members
  const houseName = m?.houses?.name
  const colour = HOUSE_COLOURS[houseName] || '#888'
  const age = m?.date_of_birth
    ? Math.floor((Date.now() - new Date(m.date_of_birth)) / (365.25 * 24 * 60 * 60 * 1000))
    : null
  const initials = `${m?.first_name?.[0] || ''}${m?.last_name?.[0] || ''}`.toUpperCase()

  // House rank/total points, and this athlete's position within their
  // house vs across everyone -- used in the enlarged header
  let houseRank = null, houseTotalPoints = null, contributionPct = null, positionInHouse = null, overallPosition = null
  try {
    const safeHouses = Array.isArray(houses) ? houses : []
    const safeStudents = Array.isArray(students) ? students : []
    const sortedHouses = [...safeHouses].sort((a, b) => (b?.points || 0) - (a?.points || 0))
    houseRank = houseName ? sortedHouses.findIndex(h => h?.name === houseName) + 1 : null
    houseTotalPoints = houseName ? (sortedHouses.find(h => h?.name === houseName)?.points || 0) : null
    contributionPct = (houseTotalPoints && selected?.house_points)
      ? ((selected.house_points / houseTotalPoints) * 100).toFixed(1) : null

    const sameHouseSorted = safeStudents
      .filter(s => s?.members?.houses?.name === houseName)
      .sort((a, b) => (b?.house_points || 0) - (a?.house_points || 0))
    positionInHouse = selected ? sameHouseSorted.findIndex(s => s?.id === selected.id) + 1 : null

    const safeTotals = truePointTotals || {}
    const overallSorted = [...safeStudents].sort((a, b) => (safeTotals[b?.id] || 0) - (safeTotals[a?.id] || 0))
    overallPosition = selected ? overallSorted.findIndex(s => s?.id === selected.id) + 1 : null
  } catch (e) {
    console.error('AthleteProfiles header calc error:', e)
  }

  if (loading) return <div className="loading">Loading athlete profiles…</div>

  return (
    <div style={{ minHeight: 600 }}>

      {/* ── Athlete Dashboard / profile detail ── */}
      <div style={{ minWidth: 0 }}>
        {!selected ? (
          <div style={{ maxWidth: 900 }}
            onTouchStart={e => {
              swipeStartX.current = e.target.closest('.swipe-zone') ? e.touches[0].clientX : null
            }}
            onTouchEnd={e => {
              if (swipeStartX.current == null) return
              const delta = e.changedTouches[0].clientX - swipeStartX.current
              if (delta < -60 && filtered.length > 0) selectStudent(filtered[0])
              swipeStartX.current = null
            }}>
            <div className="empty-state swipe-zone" style={{ paddingTop: 20, paddingBottom: 20 }}>
              <h3>Athlete Dashboard</h3>
            </div>

            {/* Team KR / KRBA -- dropdown of respective athletes, positioned above the row below */}
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
              <div ref={teamKrDropdownRef} style={{ position: 'relative' }}>
                <button className="btn btn-sm" onClick={() => setShowTeamKrDropdown(v => !v)}>
                  👥 Team KR {showTeamKrDropdown ? '▲' : '▼'}
                </button>
                {showTeamKrDropdown && (() => {
                  const krAthletes = students.filter(s => s.is_kr)
                    .filter(s => !teamKrSearch || `${s.members?.first_name || ''} ${s.members?.last_name || ''}`.toLowerCase().includes(teamKrSearch.toLowerCase()))
                    .sort((a, b) => `${a.members?.first_name} ${a.members?.last_name}`.localeCompare(`${b.members?.first_name} ${b.members?.last_name}`))
                  return (
                    <div className="card" style={{ position: 'absolute', top: '100%', left: 0, zIndex: 20, width: 320, marginTop: 4, padding: 12, maxHeight: 420, overflowY: 'auto' }}>
                      <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>Team KR athletes</p>
                      <input value={teamKrSearch} onChange={e => setTeamKrSearch(e.target.value)}
                        placeholder="Search athletes…" autoFocus
                        style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius)', fontSize: 14, background: 'var(--bg-secondary)', color: 'var(--text)', marginBottom: 10 }} />
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {krAthletes.length === 0 ? (
                          <p style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>No KR athletes found.</p>
                        ) : krAthletes.map(s => {
                          const col = HOUSE_COLOURS[s.members?.houses?.name] || '#888'
                          return (
                            <div key={s.id} onClick={() => { selectStudent(s); setShowTeamKrDropdown(false); setTeamKrSearch('') }} style={{
                              padding: '12px 14px', borderRadius: 'var(--border-radius-lg)', cursor: 'pointer',
                              background: 'var(--bg)', border: '1px solid var(--border)',
                              display: 'flex', alignItems: 'center', gap: 10,
                            }}>
                              <div style={{ width: 36, height: 36, borderRadius: '50%', background: col + '22', color: col, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
                                {(s.members?.first_name?.[0] || '') + (s.members?.last_name?.[0] || '')}
                              </div>
                              <div style={{ minWidth: 0 }}>
                                <div style={{ fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {s.members?.first_name} {s.members?.last_name}
                                </div>
                                <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{s.student_ref}</div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })()}
              </div>
              <div ref={teamKrbaDropdownRef} style={{ position: 'relative' }}>
                <button className="btn btn-sm" onClick={() => setShowTeamKrbaDropdown(v => !v)}>
                  👥 KRBA {showTeamKrbaDropdown ? '▲' : '▼'}
                </button>
                {showTeamKrbaDropdown && (() => {
                  const krbaAthletes = students.filter(s => s.discipline === 'KRBA')
                    .filter(s => !teamKrbaSearch || `${s.members?.first_name || ''} ${s.members?.last_name || ''}`.toLowerCase().includes(teamKrbaSearch.toLowerCase()))
                    .sort((a, b) => `${a.members?.first_name} ${a.members?.last_name}`.localeCompare(`${b.members?.first_name} ${b.members?.last_name}`))
                  return (
                    <div className="card" style={{ position: 'absolute', top: '100%', right: 0, zIndex: 20, width: 320, marginTop: 4, padding: 12, maxHeight: 420, overflowY: 'auto' }}>
                      <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>KRBA athletes</p>
                      <input value={teamKrbaSearch} onChange={e => setTeamKrbaSearch(e.target.value)}
                        placeholder="Search athletes…" autoFocus
                        style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius)', fontSize: 14, background: 'var(--bg-secondary)', color: 'var(--text)', marginBottom: 10 }} />
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {krbaAthletes.length === 0 ? (
                          <p style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>No KRBA athletes found.</p>
                        ) : krbaAthletes.map(s => {
                          const col = HOUSE_COLOURS[s.members?.houses?.name] || '#888'
                          return (
                            <div key={s.id} onClick={() => { selectStudent(s); setShowTeamKrbaDropdown(false); setTeamKrbaSearch('') }} style={{
                              padding: '12px 14px', borderRadius: 'var(--border-radius-lg)', cursor: 'pointer',
                              background: 'var(--bg)', border: '1px solid var(--border)',
                              display: 'flex', alignItems: 'center', gap: 10,
                            }}>
                              <div style={{ width: 36, height: 36, borderRadius: '50%', background: col + '22', color: col, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
                                {(s.members?.first_name?.[0] || '') + (s.members?.last_name?.[0] || '')}
                              </div>
                              <div style={{ minWidth: 0 }}>
                                <div style={{ fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {s.members?.first_name} {s.members?.last_name}
                                </div>
                                <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{s.student_ref}</div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })()}
              </div>
            </div>

            {/* All sessions / F2F sessions / PDP -- above Physical, side by side */}
            {(() => {
              const teamAthletes = students.filter(s => s.is_kr || s.is_pts || s.discipline === 'KRBA')
              const teamCount = teamAthletes.length || 1
              const teamIds = new Set(teamAthletes.map(s => s.id))
              const todayStr = new Date().toISOString().split('T')[0]
              const hasContent = v => Array.isArray(v) ? v.length > 0 : (v && typeof v === 'object' ? Object.keys(v).length > 0 : !!v)
              const pctFromIds = idList => {
                const loggedIds = new Set(idList.filter(id => teamIds.has(id)))
                return { count: loggedIds.size, pct: Math.round((loggedIds.size / teamCount) * 100) }
              }
              const targetFor = key => teamTargets.find(t => t.section_key === key && !t.question_label && !t.student_id)

              const attendedIds = todaysAllAttendance.map(a => a.student_id)
              const allSessions = pctFromIds(attendedIds)

              const f2fIds = todaysAllSessions.filter(s =>
                ['running','watt_bike','bodyweight','stretch_flows','snc','other_session','techniques','tactical','mentality_log','wellbeing','test'].some(f => hasContent(s[f]))
              ).map(s => s.student_id)
              const f2fSessions = pctFromIds(f2fIds)

              const pdpIds = allAthleteProfiles.filter(ap => {
                const pdp = ap.pdp_notes || {}
                return Array.from(PDP_CHECKABLE_SECTIONS).some(k =>
                  Object.values(pdp[`__timetable_${k}`] || {}).some(e => e.date === todayStr))
              }).map(ap => ap.student_id)
              const pdp = pctFromIds(pdpIds)

              const cards = [
                { key: 'all_sessions', icon: '📅', label: 'All sessions', ...allSessions },
                { key: 'f2f_sessions', icon: '💪', label: 'F2F sessions', ...f2fSessions },
                { key: 'pdp', icon: '🎯', label: 'PDP', ...pdp },
              ]

              return (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 14 }}>
                  {cards.map(c => {
                    const target = targetFor(c.key)
                    return (
                      <div key={c.key} style={{
                        display: 'flex', flexDirection: 'column', gap: 6,
                        padding: '10px 12px', fontFamily: 'var(--font-sans)',
                        background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius)',
                      }}>
                        <span
                          onClick={c.key === 'all_sessions' ? () => setDashboardTab('calendar') : c.key === 'pdp' ? () => setDashboardTab('pdp') : undefined}
                          style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: (c.key === 'all_sessions' || c.key === 'pdp') ? 'pointer' : 'default' }}>
                          <span style={{ fontSize: 16 }}>{c.icon}</span>
                          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{c.label}</span>
                        </span>
                        <span style={{ fontSize: 18, fontWeight: 700, color: colour }}>{c.pct}%</span>
                        <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{c.count}/{teamCount}</span>
                        {target && <span style={{ fontSize: 10, color: '#EF9F27' }}>🎯 {target.target_value}</span>}
                        <button className="btn btn-sm" style={{ fontSize: 10 }} onClick={() => {
                          setNewTargetSection(c.key); setNewTargetQuestion(''); setShowAddTarget(true)
                        }}>{target ? 'Edit target' : '+ Target'}</button>
                        {showAddTarget && newTargetSection === c.key && newTargetQuestion === '' && renderInlineTargetForm()}
                      </div>
                    )
                  })}
                </div>
              )
            })()}

            {/* Coach Profile card -- team-wide, mirrors the athlete's own Profile card structure */}
            <div className="card" style={{ padding: 0, marginBottom: 14 }}>
              <div style={{ padding: '10px 14px', fontWeight: 600, fontSize: 13, borderBottom: '1px solid var(--border)' }}>Profile</div>
              {(() => {
                const clubFiltered = students.filter(s =>
                  (s.is_kr || s.is_pts || s.discipline === 'KRBA') && (dashClubFilter === 'all' || s.discipline === dashClubFilter)
                )
                const count = clubFiltered.length || 1
                const totalWins = clubFiltered.reduce((a, s) => a + (Number(s.wins) || 0), 0)
                const totalLosses = clubFiltered.reduce((a, s) => a + (Number(s.losses) || 0), 0)
                const totalDraws = clubFiltered.reduce((a, s) => a + (Number(s.draws) || 0), 0)
                const totalGames = totalWins + totalLosses + totalDraws
                const winPct = totalGames > 0 ? Math.round((totalWins / totalGames) * 100) : 0

                const levelOf = s => s.discipline === 'KRBA' ? (s.krba_level || '—') : s.is_kr ? (s.competition_team || '—') : (s.pka_belt || '—')
                const levelCounts = {}
                clubFiltered.forEach(s => { const l = levelOf(s); levelCounts[l] = (levelCounts[l] || 0) + 1 })
                const levelBreakdown = Object.entries(levelCounts).sort((a, b) => b[1] - a[1])

                const weightSorted = [...clubFiltered].filter(s => s.weight_kg).sort((a, b) => (a.weight_kg || 0) - (b.weight_kg || 0))

                return (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 14px', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                      <span style={{ color: 'var(--text-secondary)' }}>Club</span>
                      <div style={{ display: 'flex', gap: 4 }}>
                        {['all', 'PKA', 'KRBA'].map(f => (
                          <button key={f} onClick={() => setDashClubFilter(f)} style={{
                            fontSize: 11, padding: '3px 8px', borderRadius: 20, cursor: 'pointer', fontFamily: 'var(--font-sans)',
                            border: `1px solid ${dashClubFilter === f ? '#378ADD' : 'var(--border-strong)'}`,
                            background: dashClubFilter === f ? '#378ADD20' : 'none', color: dashClubFilter === f ? '#378ADD' : 'var(--text-secondary)',
                          }}>{f === 'all' ? 'All' : f}</button>
                        ))}
                      </div>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 14px', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                      <span style={{ color: 'var(--text-secondary)' }}>Record</span>
                      <span
                        onMouseDown={() => { recordPressTimer.current = setTimeout(() => setShowRecordAsPct(true), 400) }}
                        onMouseUp={() => { clearTimeout(recordPressTimer.current); setShowRecordAsPct(false) }}
                        onMouseLeave={() => { clearTimeout(recordPressTimer.current); setShowRecordAsPct(false) }}
                        onTouchStart={() => { recordPressTimer.current = setTimeout(() => setShowRecordAsPct(true), 400) }}
                        onTouchEnd={() => { clearTimeout(recordPressTimer.current); setShowRecordAsPct(false) }}
                        title="Hold to see win %"
                        style={{ fontWeight: 500, cursor: 'pointer', userSelect: 'none' }}>
                        {showRecordAsPct ? `${winPct}% wins` : `${totalWins}W ${totalLosses}L ${totalDraws}D`}
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 14px', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                      <span style={{ color: 'var(--text-secondary)' }}>Level</span>
                      {levelBreakdown.length === 0 ? (
                        <span style={{ fontWeight: 500, fontSize: 12 }}>—</span>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <button onClick={() => setDashLevelIndex(i => (i - 1 + levelBreakdown.length) % levelBreakdown.length)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--text-tertiary)', padding: 2 }}>◀</button>
                          <span style={{
                            fontWeight: 500, fontSize: 12, padding: '3px 10px', borderRadius: 20,
                            background: 'var(--bg-secondary)', border: '1px solid var(--border-strong)', whiteSpace: 'nowrap',
                          }}>
                            {levelBreakdown[dashLevelIndex % levelBreakdown.length]?.[0]}: {levelBreakdown[dashLevelIndex % levelBreakdown.length]?.[1]}
                          </span>
                          <button onClick={() => setDashLevelIndex(i => (i + 1) % levelBreakdown.length)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--text-tertiary)', padding: 2 }}>▶</button>
                        </div>
                      )}
                    </div>
                    <div ref={dashWeightListRef} style={{ position: 'relative', padding: '8px 14px', fontSize: 13 }}>
                      <button onClick={() => setShowDashWeightList(v => !v)} style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%',
                        background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'var(--font-sans)', color: 'var(--text)',
                      }}>
                        <span style={{ color: 'var(--text-secondary)' }}>Weight</span>
                        <span style={{ fontWeight: 500 }}>{showDashWeightList ? '▲' : '▼'} View by weight</span>
                      </button>
                      {showDashWeightList && (
                        <div className="card" style={{ position: 'absolute', top: '100%', left: 14, right: 14, zIndex: 20, marginTop: 4, padding: 8, maxHeight: 280, overflowY: 'auto' }}>
                          {weightSorted.length === 0 ? (
                            <p style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>No weights recorded.</p>
                          ) : weightSorted.map(s => {
                            const wAge = s.members?.date_of_birth ? Math.floor((Date.now() - new Date(s.members.date_of_birth)) / (365.25 * 24 * 60 * 60 * 1000)) : null
                            return (
                              <button key={s.id} onClick={() => { selectStudent(s); setShowDashWeightList(false) }}
                                style={{
                                  display: 'flex', justifyContent: 'space-between', width: '100%', textAlign: 'left',
                                  padding: '6px 8px', fontSize: 12, borderBottom: '1px solid var(--border)',
                                  background: 'none', border: 'none', borderRadius: 6, cursor: 'pointer',
                                  color: 'var(--text)', fontFamily: 'var(--font-sans)',
                                }}>
                                <span>{s.members?.first_name} {s.members?.last_name}{wAge ? ` (${wAge})` : ''}</span>
                                <span style={{ fontWeight: 600 }}>{s.weight_kg}kg</span>
                              </button>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  </>
                )
              })()}
            </div>

            {/* Dashboard tabs -- Overview / Calendar / Results */}
            <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border)', marginBottom: 14 }}>
              {[['overview', '🏠 Overview'], ['calendar', '📅 Calendar'], ['results', '📊 F2F Results'], ['pdp', '🎯 PDP']].map(([key, label]) => (
                <button key={key} onClick={() => setDashboardTab(key)} style={{
                  padding: '8px 16px', fontSize: 13, border: 'none', background: 'none', cursor: 'pointer',
                  borderBottom: `2px solid ${dashboardTab === key ? 'var(--text)' : 'transparent'}`,
                  color: dashboardTab === key ? 'var(--text)' : 'var(--text-secondary)',
                  fontWeight: dashboardTab === key ? 500 : 400,
                }}>{label}</button>
              ))}
            </div>

            {dashboardTab === 'calendar' && (
              <div>
            {/* Team calendar -- shows the recurring class schedule, colour-coded by type */}
            <div className="card" id="team-calendar" style={{ marginBottom: 14 }}>
              {(() => {
                const { year, month } = teamCalMonth
                const firstDay = new Date(year, month, 1)
                const startWeekday = (firstDay.getDay() + 6) % 7
                const daysInMonth = new Date(year, month + 1, 0).getDate()
                const cells = []
                for (let i = 0; i < startWeekday; i++) cells.push(null)
                for (let d = 1; d <= daysInMonth; d++) cells.push(d)

                const classColour = cl => {
                  const n = (cl.name || '').toLowerCase()
                  if (n.includes('krba')) return '#E24B4A' // red
                  if (n.includes('khaos') || n.includes('snc') || n.includes('s&c') || n.includes('strength')) return '#888' // grey
                  if (n.includes('kr')) return '#1a1a1a' // black
                  return '#378ADD' // fallback for anything else
                }

                return (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 8 }}>
                      <h2 style={{ fontSize: 14, fontWeight: 600 }}>📅 Team calendar</h2>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <button className="btn btn-sm" onClick={() => setTeamCalMonth(m => m.month === 0 ? { year: m.year - 1, month: 11 } : { year: m.year, month: m.month - 1 })}>←</button>
                        <span style={{ fontSize: 13, fontWeight: 600, minWidth: 120, textAlign: 'center' }}>{new Date(year, month, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</span>
                        <button className="btn btn-sm" onClick={() => setTeamCalMonth(m => m.month === 11 ? { year: m.year + 1, month: 0 } : { year: m.year, month: m.month + 1 })}>→</button>
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 4, marginBottom: 8 }}>
                      {['Mo','Tu','We','Th','Fr','Sa','Su'].map(d => (
                        <div key={d} style={{ textAlign: 'center', fontSize: 10, color: 'var(--text-tertiary)' }}>{d}</div>
                      ))}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 4 }}>
                      {cells.map((d, i) => {
                        if (d === null) return <div key={i} />
                        const jsDay = new Date(year, month, d).getDay()
                        const classesThatDay = allClasses.filter(cl => (DAY_TO_JS_DAYS[cl.day_of_week] || []).includes(jsDay))
                        const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`
                        const eventsThatDay = clubEvents.filter(ev => ev.event_date === dateStr)
                        return (
                          <div key={i} style={{ minHeight: 52, border: '1px solid var(--border)', borderRadius: 6, padding: 3 }}>
                            <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{d}</div>
                            {classesThatDay.map(cl => (
                              <div key={cl.id} title={`${cl.name} ${cl.start_time?.slice(0,5) || ''}`} style={{ height: 3, background: classColour(cl), borderRadius: 2, marginTop: 2 }} />
                            ))}
                            {eventsThatDay.map(ev => (
                              <div key={ev.id} title={ev.title} style={{ height: 3, background: '#EF9F27', borderRadius: 2, marginTop: 2, border: '1px dashed #EF9F27' }} />
                            ))}
                          </div>
                        )
                      })}
                    </div>
                    <div style={{ display: 'flex', gap: 14, marginTop: 10, fontSize: 11, color: 'var(--text-secondary)', flexWrap: 'wrap' }}>
                      <span><span style={{ display: 'inline-block', width: 10, height: 10, background: '#E24B4A', borderRadius: 2, marginRight: 4 }} />KRBA sessions</span>
                      <span><span style={{ display: 'inline-block', width: 10, height: 10, background: '#1a1a1a', borderRadius: 2, marginRight: 4 }} />KR sessions</span>
                      <span><span style={{ display: 'inline-block', width: 10, height: 10, background: '#888', borderRadius: 2, marginRight: 4 }} />Khaos / SnC</span>
                      <span><span style={{ display: 'inline-block', width: 10, height: 10, background: '#EF9F27', border: '1px dashed #EF9F27', borderRadius: 2, marginRight: 4 }} />Events</span>
                    </div>
                  </>
                )
              })()}
            </div>

              </div>
            )}

            {dashboardTab === 'results' && (
              <div>
            {/* F2F Results -- team-wide graph at top, full sortable/customisable table at bottom */}
            <div className="card" style={{ marginBottom: 14 }}>
              <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>📊 F2F Results</h2>
              {(() => {
                const teamIds = new Set(students.filter(s => s.is_kr || s.is_pts || s.discipline === 'KRBA').map(s => s.id))
                const teamSessions = allTeamSessions.filter(s => teamIds.has(s.student_id))

                // Sessions logged per week, last 8 weeks
                const weeks = []
                const now = new Date()
                for (let i = 7; i >= 0; i--) {
                  const start = new Date(now); start.setDate(now.getDate() - now.getDay() - (i * 7) + 1)
                  start.setHours(0,0,0,0)
                  const end = new Date(start); end.setDate(start.getDate() + 6)
                  weeks.push({ label: start.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }), start, end, count: 0 })
                }
                teamSessions.forEach(s => {
                  const d = new Date(s.session_date)
                  const w = weeks.find(wk => d >= wk.start && d <= wk.end)
                  if (w) w.count++
                })
                const maxCount = Math.max(1, ...weeks.map(w => w.count))

                const hasContent = v => Array.isArray(v) ? v.length > 0 : (v && typeof v === 'object' ? Object.keys(v).length > 0 : !!v)
                const summarise = v => {
                  if (!hasContent(v)) return '—'
                  if (Array.isArray(v)) return `${v.length} entr${v.length === 1 ? 'y' : 'ies'}`
                  return 'Logged'
                }

                const rows = teamSessions.map(s => ({
                  id: s.id,
                  student_id: s.student_id,
                  athlete: `${s.students?.members?.first_name || ''} ${s.students?.members?.last_name || ''}`.trim() || '—',
                  date: s.session_date,
                  weight_before: s.weight_before ?? null,
                  weight_after: s.weight_after ?? null,
                  weight_change: (s.weight_before != null && s.weight_after != null) ? (parseFloat(s.weight_after) - parseFloat(s.weight_before)).toFixed(1) : null,
                  running: summarise(s.running), watt_bike: summarise(s.watt_bike), bodyweight: summarise(s.bodyweight),
                  stretch_flows: summarise(s.stretch_flows), snc: summarise(s.snc), other_session: summarise(s.other_session),
                  techniques: summarise(s.techniques), tactical: summarise(s.tactical),
                  mentality_log: summarise(s.mentality_log), wellbeing: summarise(s.wellbeing), test: summarise(s.test),
                }))

                const sorted = [...rows].sort((a, b) => {
                  let av = a[resultsSortKey], bv = b[resultsSortKey]
                  if (av == null) av = ''
                  if (bv == null) bv = ''
                  if (typeof av === 'number' || typeof bv === 'number' || (!isNaN(parseFloat(av)) && !isNaN(parseFloat(bv)) && av !== '' && bv !== '')) {
                    av = parseFloat(av) || 0; bv = parseFloat(bv) || 0
                    return resultsSortDir === 'asc' ? av - bv : bv - av
                  }
                  return resultsSortDir === 'asc' ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av))
                })

                function toggleResultsSort(key) {
                  if (resultsSortKey === key) setResultsSortDir(d => d === 'asc' ? 'desc' : 'asc')
                  else { setResultsSortKey(key); setResultsSortDir('asc') }
                }
                function toggleResultsCol(key) {
                  setResultsVisibleCols(prev => {
                    const next = prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
                    localStorage.setItem('results_visible_cols', JSON.stringify(next))
                    return next
                  })
                }
                const visibleColumns = RESULTS_ALL_COLUMNS.filter(c => resultsVisibleCols.includes(c.key))

                return (
                  <>
                    {/* Graph: sessions logged per week */}
                    <div style={{ marginBottom: 20 }}>
                      <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 8 }}>Sessions logged per week</p>
                      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 100 }}>
                        {weeks.map((w, i) => (
                          <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                            <span style={{ fontSize: 10, fontWeight: 600 }}>{w.count}</span>
                            <div style={{ width: '100%', height: `${(w.count / maxCount) * 70}px`, minHeight: w.count > 0 ? 4 : 0, background: colour, borderRadius: 3 }} />
                            <span style={{ fontSize: 8, color: 'var(--text-tertiary)' }}>{w.label}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Column show/hide */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <p style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{sorted.length} sessions across the team</p>
                      <button className="btn btn-sm" onClick={() => setShowResultsColPicker(v => !v)}>{showResultsColPicker ? 'Close' : '⚙ Columns'}</button>
                    </div>
                    {showResultsColPicker && (
                      <div className="card" style={{ marginBottom: 12, padding: 12, background: 'var(--bg-secondary)' }}>
                        <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Show / hide columns</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          {RESULTS_ALL_COLUMNS.map(c => (
                            <button key={c.key} onClick={() => toggleResultsCol(c.key)} style={{
                              padding: '4px 10px', borderRadius: 20, fontSize: 11, cursor: 'pointer',
                              border: `1px solid ${resultsVisibleCols.includes(c.key) ? 'var(--text)' : 'var(--border-strong)'}`,
                              background: resultsVisibleCols.includes(c.key) ? 'var(--text)' : 'var(--bg)',
                              color: resultsVisibleCols.includes(c.key) ? 'var(--bg)' : 'var(--text-secondary)',
                            }}>{c.label}</button>
                          ))}
                        </div>
                        <button className="btn btn-sm" style={{ marginTop: 8 }} onClick={() => {
                          setResultsVisibleCols(RESULTS_DEFAULT_VISIBLE); localStorage.setItem('results_visible_cols', JSON.stringify(RESULTS_DEFAULT_VISIBLE))
                        }}>Reset to default</button>
                      </div>
                    )}

                    {/* Table */}
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                        <thead>
                          <tr style={{ borderBottom: '1px solid var(--border)' }}>
                            {visibleColumns.map(c => (
                              <th key={c.key} onClick={() => toggleResultsSort(c.key)} style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap', textAlign: 'left', padding: '6px 8px' }}>
                                {c.label}<span style={{ marginLeft: 4, fontSize: 9, opacity: resultsSortKey === c.key ? 1 : 0.35 }}>
                                  {resultsSortKey === c.key ? (resultsSortDir === 'asc' ? '↑' : '↓') : '↕'}
                                </span>
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {sorted.map(r => (
                            <tr key={r.id} onClick={() => { const s = students.find(st => st.id === r.student_id); if (s) selectStudent(s) }}
                              style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>
                              {visibleColumns.map(c => (
                                <td key={c.key} style={{ padding: '6px 8px', whiteSpace: 'nowrap' }}>
                                  {c.key === 'date' ? new Date(r.date).toLocaleDateString('en-GB') :
                                   c.key === 'weight_before' ? (r.weight_before != null ? `${r.weight_before}kg` : '—') :
                                   c.key === 'weight_after' ? (r.weight_after != null ? `${r.weight_after}kg` : '—') :
                                   c.key === 'weight_change' ? (r.weight_change != null ? `${r.weight_change > 0 ? '+' : ''}${r.weight_change}kg` : '—') :
                                   r[c.key]}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )
              })()}
            </div>

              </div>
            )}

            {dashboardTab === 'pdp' && (
              <div>
                {!teamTemplateStudent ? (
                  <div className="empty-state"><h3>Team PDP template not set up yet</h3><p>Run the setup migration to enable this.</p></div>
                ) : (
                  <>
                    <div className="card" style={{ marginBottom: 14 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: showPushPdp ? 10 : 0 }}>
                        <div>
                          <h2 style={{ fontSize: 14, fontWeight: 600 }}>🎯 Team PDP template</h2>
                          <p style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Build this once here, then push any section to individual athletes or the whole team</p>
                        </div>
                        <button className="btn btn-sm" onClick={() => setShowPushPdp(v => !v)}>{showPushPdp ? 'Cancel' : '→ Push to athletes'}</button>
                      </div>
                      {showPushPdp && (
                        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10 }}>
                          <select value={pushPdpSection} onChange={e => setPushPdpSection(e.target.value)} style={{ width: '100%', marginBottom: 8 }}>
                            <option value="">— Select a section to push —</option>
                            {PDP_SECTIONS.filter(s => (teamPdpApData?.pdp_notes?.[s.key] || []).length > 0).map(s => (
                              <option key={s.key} value={s.key}>{s.label} ({(teamPdpApData?.pdp_notes?.[s.key] || []).length} items)</option>
                            ))}
                          </select>
                          <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                            <button onClick={() => setPushPdpTarget('all')} style={{
                              fontSize: 12, padding: '5px 10px', borderRadius: 20, cursor: 'pointer', fontFamily: 'var(--font-sans)',
                              border: `1px solid ${pushPdpTarget === 'all' ? '#378ADD' : 'var(--border-strong)'}`,
                              background: pushPdpTarget === 'all' ? '#378ADD20' : 'none', color: pushPdpTarget === 'all' ? '#378ADD' : 'var(--text-secondary)',
                            }}>👥 Whole team</button>
                            <button onClick={() => setPushPdpTarget('individual')} style={{
                              fontSize: 12, padding: '5px 10px', borderRadius: 20, cursor: 'pointer', fontFamily: 'var(--font-sans)',
                              border: `1px solid ${pushPdpTarget === 'individual' ? '#378ADD' : 'var(--border-strong)'}`,
                              background: pushPdpTarget === 'individual' ? '#378ADD20' : 'none', color: pushPdpTarget === 'individual' ? '#378ADD' : 'var(--text-secondary)',
                            }}>👤 One athlete</button>
                          </div>
                          {pushPdpTarget === 'individual' && (
                            <div style={{ marginBottom: 8 }}>
                              {pushPdpAthlete ? (
                                <span className="btn btn-sm" style={{ background: '#1D9E7520', borderColor: '#1D9E75', cursor: 'pointer' }}
                                  onClick={() => setPushPdpAthlete(null)}>→ {pushPdpAthlete.members?.first_name} {pushPdpAthlete.members?.last_name} ×</span>
                              ) : (
                                <div style={{ position: 'relative' }}>
                                  <input value={pushPdpAthleteSearch} onChange={e => setPushPdpAthleteSearch(e.target.value)} placeholder="Search athlete…" style={{ width: '100%' }} />
                                  {pushPdpAthleteSearch && (
                                    <div className="card" style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20, padding: 4, maxHeight: 200, overflowY: 'auto' }}>
                                      {students.filter(s => `${s.members?.first_name || ''} ${s.members?.last_name || ''}`.toLowerCase().includes(pushPdpAthleteSearch.toLowerCase())).slice(0, 10).map(s => (
                                        <button key={s.id} onClick={() => { setPushPdpAthlete(s); setPushPdpAthleteSearch('') }}
                                          style={{ display: 'block', width: '100%', textAlign: 'left', padding: '6px 8px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, borderRadius: 6, color: 'var(--text)', fontFamily: 'var(--font-sans)' }}>
                                          {s.members?.first_name} {s.members?.last_name}
                                        </button>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                          <button className="btn btn-primary btn-sm" disabled={!pushPdpSection || (pushPdpTarget === 'individual' && !pushPdpAthlete) || pushingPdp} onClick={pushPdpSectionToAthletes}>
                            {pushingPdp ? 'Sending…' : 'Push section'}
                          </button>
                        </div>
                      )}
                    </div>
                    <PDPTab apData={teamPdpApData} setApData={setTeamPdpApData} student={teamTemplateStudent} isAdmin={isAdmin} />
                  </>
                )}
              </div>
            )}

            {dashboardTab === 'overview' && (
              <>
            {/* Athlete Home overview -- same banner/card form as a real athlete's Home page */}
            {(() => {
              const teamAthletes = students.filter(s => s.is_kr || s.is_pts || s.discipline === 'KRBA')
              const teamCount = teamAthletes.length || 1
              const teamIds = new Set(teamAthletes.map(s => s.id))
              const teamSessions = todaysAllSessions.filter(s => teamIds.has(s.student_id))
              const hasContent = v => Array.isArray(v) ? v.length > 0 : (v && typeof v === 'object' ? Object.keys(v).length > 0 : !!v)

              const subItemLogged = (subItem, s) => {
                if (subItem.field) return hasContent(s[subItem.field])
                if (subItem.matchStyle) return (s.techniques || []).some(t => t.style === subItem.matchStyle)
                if (subItem.matchCategory) return (s.tactical || []).some(t => t.category === subItem.matchCategory)
                if (subItem.mentalityQ) return isMentalityQComplete(subItem.mentalityQ, s.mentality_log)
                if (subItem.wellbeingQ) return isWellbeingQComplete(subItem.wellbeingQ, s.wellbeing)
                if (subItem.testCategory) return subItem.testCategory.tests.some(t => s.test?.[t.name])
                return false
              }
              const pctFor = (subItems, requiredCount = 1) => {
                const loggedIds = new Set(
                  teamSessions.filter(s => subItems.filter(si => subItemLogged(si, s)).length >= requiredCount).map(s => s.student_id)
                )
                return { count: loggedIds.size, pct: Math.round((loggedIds.size / teamCount) * 100) }
              }
              const targetFor = (sectionKey, questionLabel = null) =>
                teamTargets.find(t => t.section_key === sectionKey && (t.question_label || null) === questionLabel && !t.student_id)
              // Section-level target frequency (e.g. "3x per week" or "3
              // items" -> 3): the athlete needs to complete at least this
              // many distinct items in the section, regardless of which
              // ones or their individual values. No target = just 1
              // (matches previous "logged anything" behaviour).
              const parseFrequency = targetValue => {
                if (!targetValue) return null
                const match = targetValue.match(/(\d+)/)
                return match ? parseInt(match[1], 10) : null
              }

              const parseNumericTarget = targetValue => {
                if (!targetValue) return null
                const match = targetValue.match(/(\d+(\.\d+)?)/)
                return match ? parseFloat(match[1]) : null
              }
              // Question-level numeric evaluation (Phase 2): resolves a
              // "get value from this athlete's session" function per
              // sub-item type, then -- if the target has a parseable
              // number -- checks the athlete's actual logged value
              // against it, rather than just completion.
              //
              // - Wellbeing/Mentality: uses the extractor maps above
              //   (only for genuinely numeric questions)
              // - Physical/Technique/Tactical: no single "value" exists,
              //   so this counts how many sessions/items were logged
              //   today as a frequency (e.g. "Running: 3x" = 3 sessions)
              // - Test: uses the first test in the category as the
              //   representative metric, rather than averaging, since
              //   some categories (e.g. Watt Bike) mix units (W vs km)
              //   that can't be meaningfully averaged together
              const resolveExtractor = sub => {
                if (sub.wellbeingQ && WELLBEING_VALUE_EXTRACTORS[sub.wellbeingQ]) {
                  const e = WELLBEING_VALUE_EXTRACTORS[sub.wellbeingQ]
                  return { get: s => e.get(s.wellbeing), unit: e.unit }
                }
                if (sub.mentalityQ && MENTALITY_VALUE_EXTRACTORS[sub.mentalityQ]) {
                  const e = MENTALITY_VALUE_EXTRACTORS[sub.mentalityQ]
                  return { get: s => e.get(s.mentality_log), unit: e.unit }
                }
                if (sub.field) return { get: s => toEntries(s[sub.field]).length, unit: 'sessions' }
                if (sub.matchStyle) return { get: s => (s.techniques || []).filter(t => t.style === sub.matchStyle).length, unit: 'techniques' }
                if (sub.matchCategory) return { get: s => (s.tactical || []).filter(t => t.category === sub.matchCategory).length, unit: 'items' }
                if (sub.testCategory) {
                  const firstTest = sub.testCategory.tests[0]
                  return { get: s => parseFloat(s.test?.[firstTest.name]), unit: firstTest.unit }
                }
                return null
              }
              const pctForSubItem = (sub, target) => {
                const extractor = resolveExtractor(sub)
                const targetNum = target && parseNumericTarget(target.target_value)
                if (extractor && targetNum != null) {
                  const values = teamSessions
                    .map(s => ({ id: s.student_id, val: extractor.get(s) }))
                    .filter(v => v.val != null && !isNaN(v.val))
                  const metIds = new Set(values.filter(v => v.val >= targetNum).map(v => v.id))
                  const avg = values.length ? (values.reduce((a, v) => a + v.val, 0) / values.length) : null
                  return { count: metIds.size, pct: Math.round((metIds.size / teamCount) * 100), avg, unit: extractor.unit, numeric: true }
                }
                return { ...pctFor([sub]), numeric: false }
              }

              return DASHBOARD_SECTIONS.map(section => {
                const sectionTarget = targetFor(section.key)
                const requiredCount = sectionTarget ? (parseFrequency(sectionTarget.target_value) || 1) : 1
                const overall = pctFor(section.subItems, requiredCount)
                const isOpen = expandedDashSection === section.key
                return (
                  <div key={section.key} style={{ marginBottom: 8 }}>
                    <button type="button" onClick={() => { setExpandedDashSection(isOpen ? null : section.key); setExpandedDashSubItem(null) }}
                      title={sectionTarget ? `% of team who completed at least ${requiredCount} item${requiredCount === 1 ? '' : 's'} in this section today` : '% of team who logged anything in this section today'}
                      style={{
                      width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                      padding: '10px 14px', cursor: 'pointer', fontFamily: 'var(--font-sans)',
                      background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius)',
                    }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 18 }}>{section.icon}</span>
                        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{section.label}</span>
                      </span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontSize: 15, fontWeight: 700, color: colour }}>{overall.pct}%</span>
                        <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{overall.count}/{teamCount}</span>
                        {sectionTarget && <span style={{ fontSize: 10, color: '#EF9F27' }}>🎯 {sectionTarget.target_value}</span>}
                        <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{isOpen ? '▲' : '▼'}</span>
                      </span>
                    </button>

                    {isOpen && (
                      <div className="card" style={{ marginTop: 6 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                          <p style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Tap a card for more insight & to set a target</p>
                          <button className="btn btn-sm" onClick={() => {
                            setNewTargetSection(section.key); setNewTargetQuestion(''); setShowAddTarget(true)
                          }}>+ Section target</button>
                        </div>
                        {showAddTarget && newTargetSection === section.key && newTargetQuestion === '' && renderInlineTargetForm()}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 8 }}>
                          {section.subItems.map(sub => {
                            const target = targetFor(section.key, sub.label)
                            const stat = pctForSubItem(sub, target)
                            const subKey = `${section.key}::${sub.key}`
                            const active = expandedDashSubItem === subKey
                            return (
                              <button key={sub.key} type="button"
                                onClick={() => setExpandedDashSubItem(active ? null : subKey)}
                                title={stat.numeric ? `${stat.count}/${teamCount} athletes hit this numeric target today` : undefined}
                                style={{
                                  display: 'flex', flexDirection: 'column', gap: 2, padding: '8px 10px', textAlign: 'left',
                                  borderRadius: 'var(--radius)', cursor: 'pointer', fontFamily: 'var(--font-sans)',
                                  border: `2px solid ${active ? '#E24B4A' : 'var(--border)'}`, background: 'var(--bg-secondary)',
                                }}>
                                <span style={{ fontSize: 10, fontWeight: 500, color: 'var(--text)' }}>{sub.label}</span>
                                <span style={{ fontSize: 15, fontWeight: 700, color: colour }}>{stat.pct}%</span>
                                <span style={{ fontSize: 9, color: 'var(--text-tertiary)' }}>{stat.count}/{teamCount}{stat.numeric ? ' hit target' : ''}</span>
                                {stat.numeric && stat.avg != null && <span style={{ fontSize: 9, color: 'var(--text-secondary)' }}>Avg: {stat.avg.toFixed(1)} {stat.unit}</span>}
                                {target && <span style={{ fontSize: 9, color: '#EF9F27' }}>🎯 {target.target_value}</span>}
                              </button>
                            )
                          })}
                        </div>

                        {section.subItems.map(sub => {
                          const subKey = `${section.key}::${sub.key}`
                          if (expandedDashSubItem !== subKey) return null
                          const target = targetFor(section.key, sub.label)
                          const stat = pctForSubItem(sub, target)
                          return (
                            <div key={subKey} style={{ marginTop: 10, padding: 10, background: 'var(--bg-secondary)', borderRadius: 'var(--radius)' }}>
                              <p style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>{sub.label}</p>
                              {target ? (
                                <div style={{ marginBottom: 8 }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ fontSize: 12, color: '#EF9F27' }}>🎯 Current target: {target.target_value}</span>
                                    <button onClick={() => deleteTeamTarget(target.id)} className="btn btn-sm" style={{ fontSize: 10 }}>Remove</button>
                                  </div>
                                  <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>
                                    {stat.numeric
                                      ? `Checking actual logged value (${stat.avg != null ? `team avg ${stat.avg.toFixed(1)} ${stat.unit}` : 'no data yet'}) against this target — ${stat.count}/${teamCount} athletes hit it today.`
                                      : `This question doesn't have a numeric value tracked yet, so this target still checks simple completion (logged or not) rather than an exact number.`}
                                  </p>
                                </div>
                              ) : (
                                <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 8 }}>No target set for {sub.label} yet.</p>
                              )}
                              <button className="btn btn-sm" onClick={() => {
                                setNewTargetSection(section.key); setNewTargetQuestion(sub.label); setShowAddTarget(true)
                              }}>{target ? 'Change target' : '+ Set target'}</button>
                              {showAddTarget && newTargetSection === section.key && newTargetQuestion === sub.label && renderInlineTargetForm()}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })
            })()}

            {/* Media/Notes/TTP/Check in -- stay at the bottom, laid out two by two */}
            {(() => {
              const teamAthletes = students.filter(s => s.is_kr || s.is_pts || s.discipline === 'KRBA')
              const teamCount = teamAthletes.length || 1
              const teamIds = new Set(teamAthletes.map(s => s.id))
              const todayStr = new Date().toISOString().split('T')[0]
              const pctFromIds = idList => {
                const loggedIds = new Set(idList.filter(id => teamIds.has(id)))
                return { count: loggedIds.size, pct: Math.round((loggedIds.size / teamCount) * 100) }
              }
              const targetFor = key => teamTargets.find(t => t.section_key === key && !t.question_label && !t.student_id)

              const attendedIds = todaysAllAttendance.map(a => a.student_id)
              const checkIn = pctFromIds(attendedIds)

              const mediaIds = allAthleteProfiles.filter(ap =>
                (ap.media_files || []).some(f => f.uploaded_at?.slice(0, 10) === todayStr)
              ).map(ap => ap.student_id)
              const media = pctFromIds(mediaIds)

              const notesIds = todaysAllNotes.map(n => n.student_id)
              const notes = pctFromIds(notesIds)

              const ttpIds = todaysAllTtp.map(t => t.student_id)
              const ttp = pctFromIds(ttpIds)

              const cards = [
                { key: 'media', icon: '🖼', label: 'Media', ...media },
                { key: 'notes', icon: '📝', label: 'Notes', ...notes },
                { key: 'ttp', icon: '📊', label: 'TTP', ...ttp },
                { key: 'check_in', icon: '✅', label: 'Check in', ...checkIn },
              ]

              return (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, marginBottom: 14 }}>
                  {cards.map(c => {
                    const target = targetFor(c.key)
                    return (
                      <div key={c.key} style={{
                        display: 'flex', flexDirection: 'column', gap: 6,
                        padding: '10px 14px', fontFamily: 'var(--font-sans)',
                        background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius)',
                      }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 18 }}>{c.icon}</span>
                          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{c.label}</span>
                        </span>
                        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 15, fontWeight: 700, color: colour }}>{c.pct}%</span>
                            <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{c.count}/{teamCount}</span>
                          </span>
                          {target && <span style={{ fontSize: 10, color: '#EF9F27' }}>🎯 {target.target_value}</span>}
                          <button className="btn btn-sm" style={{ fontSize: 10 }} onClick={() => {
                            setNewTargetSection(c.key); setNewTargetQuestion(''); setShowAddTarget(true)
                          }}>{target ? 'Edit' : '+ Target'}</button>
                        </span>
                        {showAddTarget && newTargetSection === c.key && newTargetQuestion === '' && renderInlineTargetForm()}
                      </div>
                    )
                  })}
                </div>
              )
            })()}

            {/* TTP Benchmark */}
            <div className="card" style={{ padding: 0, marginBottom: 14 }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h2 style={{ fontSize: 14, fontWeight: 600 }}>🎯 TTP Benchmark</h2>
                <button className="btn btn-sm" onClick={() => {
                  if (!showSetBenchmark) setBenchmarkScores(ttpBenchmark ? Object.fromEntries(TTP_BENCHMARK_FIELDS.map(f => [f, ttpBenchmark[f] ?? ''])) : {})
                  setShowSetBenchmark(v => !v)
                }}>{showSetBenchmark ? 'Cancel' : '+ Set new benchmark'}</button>
              </div>
              <div style={{ padding: 16 }}>
                {ttpBenchmark ? (
                  <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: showSetBenchmark ? 14 : 0 }}>
                    Current benchmark set {new Date(ttpBenchmark.set_at).toLocaleDateString('en-GB')}
                    {ttpBenchmark.notes ? ` — ${ttpBenchmark.notes}` : ''}. Shown for comparison on every athlete's TTP page.
                  </p>
                ) : (
                  <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: showSetBenchmark ? 14 : 0 }}>No benchmark set yet.</p>
                )}

                {showSetBenchmark && (
                  <div style={{ borderTop: ttpBenchmark ? '1px solid var(--border)' : 'none', paddingTop: ttpBenchmark ? 14 : 0 }}>
                    <p style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Complete a TTP form to set this as the new team benchmark</p>
                    {[
                      { label: 'Technical', fields: ['shapes','punch_quality','footwork','defence','counters','attack','combinations','change_of_tempo','use_of_phases','distance','flow','self_expression'] },
                      { label: 'Tactical', fields: ['read_opponent','tempo_rhythm','tactical_intelligence','ring_awareness','know_strengths_weaknesses','heart_grit','concentration','timing'] },
                      { label: 'Physical', fields: ['foot_speed','limb_speed','combination_speed','reaction','punching_power','strength_upper','strength_lower','stability_core','agility','stop_n_go','stamina_aerobic','stamina_anaerobic','suppleness_upper','suppleness_lower','recovery','health'] },
                    ].map(group => (
                      <div key={group.label} style={{ marginBottom: 14 }}>
                        <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 6, textTransform: 'uppercase' }}>{group.label}</p>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 8 }}>
                          {group.fields.map(f => (
                            <div key={f} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
                              <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{BOX_LABELS[f] || f}</span>
                              <input type="number" min="0" max="10" value={benchmarkScores[f] ?? ''}
                                onChange={e => setBenchmarkScores(prev => ({ ...prev, [f]: e.target.value }))}
                                style={{ width: 50, padding: '3px 6px', fontSize: 12 }} />
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                    <textarea value={benchmarkNotes} onChange={e => setBenchmarkNotes(e.target.value)} placeholder="Notes (optional)" rows={2}
                      style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius)', fontSize: 13, background: 'var(--bg-secondary)', color: 'var(--text)', fontFamily: 'var(--font-sans)', resize: 'vertical', marginBottom: 8 }} />
                    <button className="btn btn-primary btn-sm" disabled={savingBenchmark} onClick={saveNewBenchmark}>
                      {savingBenchmark ? 'Saving…' : 'Save as new benchmark'}
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Team notes */}
            <div className="card" style={{ padding: 0, marginBottom: 14 }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
                <h2 style={{ fontSize: 14, fontWeight: 600 }}>📝 Notes</h2>
              </div>
              <div style={{ padding: 16 }}>
                <textarea value={dashNoteText} onChange={e => setDashNoteText(e.target.value)}
                  placeholder="Write a note…" rows={2}
                  style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius)', fontSize: 13, background: 'var(--bg-secondary)', color: 'var(--text)', fontFamily: 'var(--font-sans)', resize: 'vertical', marginBottom: 8 }} />
                <button className="btn btn-primary btn-sm" disabled={!dashNoteText.trim() || savingDashNote} onClick={addDashNote}>
                  {savingDashNote ? 'Saving…' : 'Save here'}
                </button>

                {teamNotes.length > 0 && (
                  <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {teamNotes.map(note => {
                      const sentIds = note.sent_to_student_ids || []
                      const sentStudents = students.filter(s => sentIds.includes(s.id))
                      const isIndividual = sentIds.length > 0
                      const targeting = expandedNoteTargeting === note.id
                      return (
                        <div key={note.id} style={{ padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 4 }}>
                              {new Date(note.created_at).toLocaleDateString('en-GB')} · {new Date(note.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                            </div>
                            <button onClick={() => deleteTeamNote(note.id)} style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: 14 }}>×</button>
                          </div>
                          <p style={{ fontSize: 13, margin: '0 0 8px' }}>{note.note_text}</p>

                          <button className="btn btn-sm" style={{ fontSize: 11 }}
                            onClick={() => { setExpandedNoteTargeting(targeting ? null : note.id); setNoteTargetSearch('') }}>
                            {isIndividual ? `☑ Individual (${sentIds.length})` : '👥 Team'} {targeting ? '▲' : '▼'}
                          </button>

                          {targeting && (
                            <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
                              {sentStudents.length > 0 && (
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                                  {sentStudents.map(s => (
                                    <span key={s.id} className="btn btn-sm" style={{ background: '#1D9E7520', borderColor: '#1D9E75', cursor: 'pointer', fontSize: 11 }}
                                      onClick={() => removeNoteTarget(note, s.id)} title="Click to remove">
                                      → {s.members?.first_name} {s.members?.last_name} ×
                                    </span>
                                  ))}
                                </div>
                              )}
                              <div style={{ position: 'relative' }}>
                                <input value={noteTargetSearch} onChange={e => setNoteTargetSearch(e.target.value)}
                                  placeholder="Search athletes to also send this note to…" style={{ width: '100%', fontSize: 12 }} />
                                <div className="card" style={{ marginTop: 4, padding: 4, maxHeight: 200, overflowY: 'auto' }}>
                                  {noteDropdownResultsFor(note).length === 0 ? (
                                    <p style={{ fontSize: 12, color: 'var(--text-tertiary)', padding: '6px 8px' }}>No matching athletes.</p>
                                  ) : noteDropdownResultsFor(note).map(s => (
                                    <button key={s.id} onClick={() => sendNoteToAthlete(note, s)}
                                      style={{ display: 'block', width: '100%', textAlign: 'left', padding: '6px 8px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, borderRadius: 6 }}>
                                      {s.members?.first_name} {s.members?.last_name}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Send Reports */}
            <div className="card" style={{ padding: 0, marginBottom: 14 }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h2 style={{ fontSize: 14, fontWeight: 600 }}>📄 Send Reports</h2>
                <button className="btn btn-sm" onClick={() => setShowSendReports(v => !v)}>{showSendReports ? 'Cancel' : '+ Send reports'}</button>
              </div>
              <div style={{ padding: 16 }}>
                {showSendReports && (
                  <div style={{ marginBottom: 14, paddingBottom: 14, borderBottom: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                      <button className="btn btn-sm" onClick={() => setSendReportsTarget('all')}
                        style={{ background: sendReportsTarget === 'all' ? '#378ADD20' : undefined, borderColor: sendReportsTarget === 'all' ? '#378ADD' : undefined }}>
                        👥 All athletes
                      </button>
                      <button className="btn btn-sm" onClick={() => setSendReportsTarget('selected')}
                        style={{ background: sendReportsTarget === 'selected' ? '#378ADD20' : undefined, borderColor: sendReportsTarget === 'selected' ? '#378ADD' : undefined }}>
                        ☑ Checked individuals {sendReportsSelected.length > 0 ? `(${sendReportsSelected.length})` : ''}
                      </button>
                    </div>

                    {sendReportsTarget === 'selected' && (
                      <div style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 8, marginBottom: 10 }}>
                        {students.filter(s => s.is_kr || s.is_pts || s.discipline === 'KRBA').map(s => {
                          const checked = sendReportsSelected.some(t => t.id === s.id)
                          return (
                            <label key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, padding: '4px 0', cursor: 'pointer' }}>
                              <input type="checkbox" checked={checked}
                                onChange={() => setSendReportsSelected(prev => checked ? prev.filter(t => t.id !== s.id) : [...prev, s])}
                                style={{ width: 15, height: 15 }} />
                              {s.members?.first_name} {s.members?.last_name}
                            </label>
                          )
                        })}
                      </div>
                    )}

                    <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                      <div>
                        <label style={{ fontSize: 11, color: 'var(--text-tertiary)', display: 'block', marginBottom: 2 }}>From</label>
                        <input type="date" value={sendReportsFrom} onChange={e => setSendReportsFrom(e.target.value)} />
                      </div>
                      <div>
                        <label style={{ fontSize: 11, color: 'var(--text-tertiary)', display: 'block', marginBottom: 2 }}>To</label>
                        <input type="date" value={sendReportsTo} onChange={e => setSendReportsTo(e.target.value)} />
                      </div>
                    </div>

                    <button className="btn btn-primary btn-sm"
                      disabled={sendingReports || (sendReportsTarget === 'selected' && sendReportsSelected.length === 0)}
                      onClick={sendReportsBulk}>
                      {sendingReports ? `Sending… ${sendReportsProgress?.done ?? 0}/${sendReportsProgress?.total ?? 0}` : 'Generate & Send'}
                    </button>
                    <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 6 }}>
                      Reports appear in each athlete's own app, and in the list below for you to view too.
                    </p>
                  </div>
                )}

                {recentSentReports.length === 0 ? (
                  <p style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>No reports sent yet.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {recentSentReports.map(r => (
                      <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: 12 }}>
                        <span>{r.students?.members?.first_name} {r.students?.members?.last_name} — {new Date(r.date_from).toLocaleDateString('en-GB')} to {new Date(r.date_to).toLocaleDateString('en-GB')}</span>
                        <span style={{ color: 'var(--text-tertiary)' }}>{new Date(r.sent_at).toLocaleDateString('en-GB')}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Club events */}
            <div className="card" style={{ padding: 0, marginBottom: 14 }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h2 style={{ fontSize: 14, fontWeight: 600 }}>📅 Events</h2>
                <button className="btn btn-sm" onClick={() => setShowAddEvent(v => !v)}>{showAddEvent ? 'Cancel' : '+ Add event'}</button>
              </div>
              <div style={{ padding: 16 }}>
                {showAddEvent && (
                  <div style={{ marginBottom: 14, paddingBottom: 14, borderBottom: '1px solid var(--border)' }}>
                    <input value={newEventTitle} onChange={e => setNewEventTitle(e.target.value)} placeholder="Event title" style={{ marginBottom: 8 }} />
                    <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                      <input type="date" value={newEventDate} onChange={e => setNewEventDate(e.target.value)} style={{ flex: 1, minWidth: 140 }} />
                      <input type="time" value={newEventTime} onChange={e => setNewEventTime(e.target.value)} style={{ flex: 1, minWidth: 100 }} />
                    </div>
                    <textarea value={newEventDesc} onChange={e => setNewEventDesc(e.target.value)} placeholder="Description (optional)" rows={2}
                      style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius)', fontSize: 13, background: 'var(--bg-secondary)', color: 'var(--text)', fontFamily: 'var(--font-sans)', resize: 'vertical', marginBottom: 8 }} />
                    <label style={{ fontSize: 11, color: 'var(--text-tertiary)', display: 'block', marginBottom: 4 }}>Who is this event for?</label>
                    <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
                      {[['all', 'Everyone'], ['kr', 'All KR'], ['krba', 'All KRBA'], ['individual', 'One athlete']].map(([val, label]) => (
                        <button key={val} onClick={() => setShowAddEventTarget(val)} style={{
                          fontSize: 12, padding: '5px 10px', borderRadius: 20, cursor: 'pointer', fontFamily: 'var(--font-sans)',
                          border: `1px solid ${showAddEventTarget === val ? '#378ADD' : 'var(--border-strong)'}`,
                          background: showAddEventTarget === val ? '#378ADD20' : 'none', color: showAddEventTarget === val ? '#378ADD' : 'var(--text-secondary)',
                        }}>{label}</button>
                      ))}
                    </div>
                    {showAddEventTarget === 'individual' && (
                      <div style={{ marginBottom: 10 }}>
                        {addEventAthlete ? (
                          <span className="btn btn-sm" style={{ background: '#1D9E7520', borderColor: '#1D9E75', cursor: 'pointer' }}
                            onClick={() => setAddEventAthlete(null)} title="Click to remove">
                            → {addEventAthlete.members?.first_name} {addEventAthlete.members?.last_name} ×
                          </span>
                        ) : (
                          <div style={{ position: 'relative' }}>
                            <input value={addEventAthleteSearch} onChange={e => setAddEventAthleteSearch(e.target.value)}
                              placeholder="Search athlete…" style={{ width: '100%' }} />
                            {addEventAthleteSearch && (
                              <div className="card" style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20, padding: 4, maxHeight: 200, overflowY: 'auto' }}>
                                {students.filter(s => `${s.members?.first_name || ''} ${s.members?.last_name || ''}`.toLowerCase().includes(addEventAthleteSearch.toLowerCase())).slice(0, 10).map(s => (
                                  <button key={s.id} onClick={() => { setAddEventAthlete(s); setAddEventAthleteSearch('') }}
                                    style={{ display: 'block', width: '100%', textAlign: 'left', padding: '6px 8px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, borderRadius: 6, color: 'var(--text)', fontFamily: 'var(--font-sans)' }}>
                                    {s.members?.first_name} {s.members?.last_name}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginBottom: 10, cursor: 'pointer' }}>
                      <input type="checkbox" checked={newEventSendAll} onChange={e => setNewEventSendAll(e.target.checked)} style={{ width: 16, height: 16 }} />
                      Also show in the Sessions tab of whoever this targets
                    </label>
                    <button className="btn btn-primary btn-sm" disabled={!newEventTitle.trim() || !newEventDate || (showAddEventTarget === 'individual' && !addEventAthlete) || savingEvent} onClick={addEvent}>
                      {savingEvent ? 'Saving…' : 'Add event'}
                    </button>
                  </div>
                )}
                {clubEvents.filter(e => e.event_date >= new Date().toISOString().split('T')[0]).length === 0 ? (
                  <p style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>No upcoming events.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {clubEvents.filter(e => e.event_date >= new Date().toISOString().split('T')[0]).map(ev => (
                      <div key={ev.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600 }}>{ev.title}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                            {new Date(ev.event_date + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}{ev.event_time ? ` · ${ev.event_time.slice(0,5)}` : ''}
                            {ev.target_type === 'individual' && ev.target_student_id && (() => {
                              const s = students.find(st => st.id === ev.target_student_id)
                              return s ? <span style={{ marginLeft: 6, color: '#EF9F27' }}>· {s.members?.first_name} {s.members?.last_name}</span> : null
                            })()}
                            {ev.target_type === 'kr' && <span style={{ marginLeft: 6, color: '#EF9F27' }}>· All KR</span>}
                            {ev.target_type === 'krba' && <span style={{ marginLeft: 6, color: '#EF9F27' }}>· All KRBA</span>}
                            {ev.send_to_all_students && <span style={{ marginLeft: 6, color: '#1D9E75' }}>· sent to Sessions tab</span>}
                          </div>
                          {ev.description && <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>{ev.description}</div>}
                        </div>
                        <button onClick={() => deleteEvent(ev.id)} style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: 14 }}>×</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

              </>
            )}

            {/* Scroll to browse athlete profiles -- same as swiping */}
            <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginBottom: 14 }}>
              <button className="btn btn-sm" disabled>← Prev</button>
              <button className="btn btn-sm" disabled={filtered.length === 0}
                onClick={() => filtered.length > 0 && selectStudent(filtered[0])} title="Browse athlete profiles">Next →</button>
            </div>

            {/* Targets management -- all existing targets in one place; use the "+ Target"/"+ Set target" buttons on each card above to add a new one right where you need it */}
            <div className="card" style={{ padding: 0, marginBottom: 14, marginTop: 14 }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
                <h2 style={{ fontSize: 14, fontWeight: 600 }}>🎯 All Targets</h2>
              </div>
              <div style={{ padding: 16 }}>
                {teamTargets.length === 0 ? (
                  <p style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>No targets set yet. Use the "+ Target" button on any card above to add one.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {teamTargets.map(t => {
                      const forStudent = t.student_id ? students.find(s => s.id === t.student_id) : null
                      return (
                      <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600, textTransform: 'capitalize' }}>
                            {t.section_key.replace(/_/g, ' ')}{t.question_label ? ` — ${t.question_label}` : ''}
                          </div>
                          <div style={{ fontSize: 12, color: '#EF9F27' }}>Target: {t.target_value}</div>
                          <div style={{ fontSize: 11, color: forStudent ? '#1D9E75' : 'var(--text-tertiary)' }}>
                            {forStudent ? `👤 Individual: ${forStudent.members?.first_name} ${forStudent.members?.last_name}` : '👥 Whole team'}
                          </div>
                          {t.notes && <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>{t.notes}</div>}
                        </div>
                        <button onClick={() => deleteTeamTarget(t.id)} style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: 14 }}>×</button>
                      </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div style={{ maxWidth: 640, margin: '0 auto' }}
            onTouchStart={e => {
              swipeStartX.current = e.target.closest('.swipe-zone') ? e.touches[0].clientX : null
            }}
            onTouchEnd={e => {
              if (swipeStartX.current == null) return
              const delta = e.changedTouches[0].clientX - swipeStartX.current
              if (Math.abs(delta) > 60) goToAdjacentAthlete(delta < 0 ? 1 : -1)
              swipeStartX.current = null
            }}>
            <div className="swipe-zone" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <button className="btn btn-sm" onClick={goHome}>← Athlete Dashboard</button>
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="btn btn-sm"
                  onClick={() => goToAdjacentAthlete(-1)} title="Previous athlete (or back to Dashboard)">← Prev</button>
                <button className="btn btn-sm" disabled={filtered.findIndex(s => s.id === selected.id) >= filtered.length - 1}
                  onClick={() => goToAdjacentAthlete(1)} title="Next athlete">Next →</button>
              </div>
            </div>

            {/* Athlete header */}
            <div className="card swipe-zone" style={{ marginBottom: 12, borderLeft: `3px solid ${colour}`, borderRadius: '0 var(--border-radius-lg) var(--border-radius-lg) 0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <div style={{ width: 64, height: 64, borderRadius: '50%', background: colour + '22', color: colour, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 700, flexShrink: 0 }}>
                  {initials}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {positionInHouse > 0 && (
                      <button onClick={() => setShowOverallPos(v => !v)}
                        title={showOverallPos ? 'Showing overall position — click for position in house' : 'Showing position in house — click for overall position'}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 13, fontWeight: 700, color: colour }}>
                        #{showOverallPos ? overallPosition : positionInHouse}
                      </button>
                    )}
                    <div ref={nameDropdownRef} style={{ position: 'relative', display: 'inline-block' }}>
                      <button onClick={() => setShowNameDropdown(v => !v)} title="Click to switch athlete"
                        style={{ fontSize: 21, fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'var(--font-sans)', color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 6 }}>
                        {m?.first_name} {m?.last_name} <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{showNameDropdown ? '▲' : '▼'}</span>
                      </button>
                      {showNameDropdown && (
                        <div className="card" style={{ position: 'absolute', top: '100%', left: 0, zIndex: 20, width: '100%', minWidth: 220, marginTop: 4, padding: 8, maxHeight: 320, overflowY: 'auto' }}>
                          <input value={nameDropdownSearch} onChange={e => setNameDropdownSearch(e.target.value)}
                            placeholder="Search athletes…" autoFocus style={{ width: '100%', fontSize: 13, marginBottom: 6 }} />
                          {athletes
                            .filter(s => !nameDropdownSearch || `${s.members?.first_name || ''} ${s.members?.last_name || ''}`.toLowerCase().includes(nameDropdownSearch.toLowerCase()))
                            .map(s => (
                              <button key={s.id} onClick={() => { selectStudent(s); setShowNameDropdown(false); setNameDropdownSearch('') }}
                                style={{
                                  display: 'block', width: '100%', textAlign: 'left', padding: '6px 8px', borderRadius: 6, fontSize: 13,
                                  background: s.id === selected.id ? colour + '15' : 'none', border: 'none', cursor: 'pointer', color: 'var(--text)', fontFamily: 'var(--font-sans)',
                                }}>
                                {s.members?.first_name} {s.members?.last_name}
                              </button>
                            ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <div style={{ fontSize: 14, color: 'var(--text-secondary)', marginTop: 3 }}>
                    {selected.discipline}{age ? ` · Age ${age}` : ''}
                    {selected.pka_belt || selected.krba_level ? ` · ${selected.pka_belt || selected.krba_level}` : ''}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 6, background: colour + '15',
                      border: `1px solid ${colour}35`, borderRadius: 20, padding: '4px 12px',
                    }}>
                      {houseRank > 0 && (
                        <span style={{ background: colour, color: '#fff', borderRadius: '50%', width: 18, height: 18, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, flexShrink: 0 }}>
                          {houseRank}
                        </span>
                      )}
                      <span style={{ color: colour, fontWeight: 700, fontSize: 13 }}>{houseName || '—'}</span>
                      {houseTotalPoints != null && <span style={{ color: colour, fontSize: 12, opacity: 0.75 }}>{houseTotalPoints} pts</span>}
                    </div>
                    {selected.house_points != null && (
                      <button onClick={() => setShowContribution(v => !v)}
                        title={showContribution ? 'Showing % contribution to house — click to show points' : 'Showing house points — click to show % contribution'}
                        style={{
                          background: 'var(--bg-secondary)', border: '1px solid var(--border-strong)', borderRadius: 20,
                          padding: '4px 12px', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)',
                        }}>
                        {showContribution ? `${contributionPct ?? 0}% of house` : `⭐ ${selected.house_points} pts`}
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Actions row -- moved below the name/house details so it fits better on mobile */}
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                {isAdmin && m?.status !== 'stopped' && (
                  <button className="btn btn-sm" onClick={() => setShowInviteMenu(true)}>📨 Invite</button>
                )}
                {isAdmin && !editing && (
                  <button className="btn btn-sm" onClick={() => setEditing(true)}>Edit profile</button>
                )}
                {isAdmin && (
                  <button className="btn btn-sm" onClick={() => setTab('membership')} style={{ marginLeft: 'auto' }}>Membership</button>
                )}
              </div>
            </div>

            {showInviteMenu && (() => {
              const hasRealEmail = m?.email && !m.email.includes('@kr-centre.placeholder')
              return (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60, padding: 16 }}
                  onClick={() => setShowInviteMenu(false)}>
                  <div className="card" style={{ maxWidth: 320, width: '100%' }} onClick={e => e.stopPropagation()}>
                    <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>Invite {m?.first_name}</h3>
                    <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 14 }}>Choose how to share their invite</p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <button className="btn btn-sm" style={{ justifyContent: 'flex-start' }} disabled={!hasRealEmail || invitingId === selected.id}
                        onClick={() => { setShowInviteMenu(false); inviteStudent(selected, 'email') }}
                        title={hasRealEmail ? `Email invite to ${m.email}` : 'No real email on file'}>
                        {invitingId === selected.id ? '…' : '✉️ Email invite'}
                      </button>
                      <button className="btn btn-sm" style={{ justifyContent: 'flex-start' }} disabled={!m?.phone}
                        onClick={() => { setShowInviteMenu(false); inviteStudent(selected, 'sms') }}
                        title={m?.phone ? `SMS invite to ${m.phone}` : 'No phone on file'}>
                        📱 SMS invite
                      </button>
                      <button className="btn btn-sm" style={{ justifyContent: 'flex-start' }}
                        onClick={() => { setShowInviteMenu(false); whatsappInvite(selected) }}
                        title="Share via WhatsApp">
                        💬 WhatsApp invite
                      </button>
                      <button className="btn btn-sm" style={{ justifyContent: 'flex-start' }}
                        onClick={() => { setShowInviteMenu(false); copyInviteLink(selected) }}
                        title="Copy the invite message to share any way you like">
                        📋 Copy link
                      </button>
                      <button className="btn btn-sm" style={{ justifyContent: 'flex-start' }}
                        onClick={() => { setShowInviteMenu(false); setShowQr(true) }}
                        title="Show a QR code for this athlete's invite link">
                        ▦ QR code
                      </button>
                    </div>
                    <button className="btn" style={{ width: '100%', justifyContent: 'center', marginTop: 12 }} onClick={() => setShowInviteMenu(false)}>Cancel</button>
                  </div>
                </div>
              )
            })()}

            {showQr && (
              <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60, padding: 16 }}
                onClick={() => setShowQr(false)}>
                <div className="card" style={{ maxWidth: 320, textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                  <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>{m?.first_name} {m?.last_name}</h3>
                  <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 14 }}>Scan to confirm and set up their login</p>
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(`https://klasschamp.netlify.app/claim?ref=${selected.student_ref}`)}`}
                    alt="QR code" width={240} height={240} style={{ borderRadius: 'var(--radius)', marginBottom: 14 }} />
                  <button className="btn" style={{ width: '100%', justifyContent: 'center' }} onClick={() => setShowQr(false)}>Close</button>
                </div>
              </div>
            )}

                  <div style={{ height: 4 }} />

                  <div className="card" style={{ padding: 0, marginBottom: 14 }}>
                    <div style={{ padding: '10px 14px', fontWeight: 600, fontSize: 13, borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between' }}>
                      <span>Profile</span>
                      {isAdmin && <span style={{ fontSize: 10, color: 'var(--text-tertiary)', fontWeight: 400 }}>Tap a field to edit</span>}
                    </div>
                    {[
                      { label: 'Club', editable: true, render: () => isAdmin ? (
                        <select value={selected.discipline || ''} onChange={e => updateSelectedField('discipline', e.target.value)}
                          style={{ fontSize: 12, padding: '4px 6px', border: '1px solid var(--border-strong)', borderRadius: 6, background: 'var(--bg-secondary)', color: 'var(--text)' }}>
                          <option value="PKA">PKA</option>
                          <option value="KRBA">KRBA</option>
                        </select>
                      ) : (selected.discipline || '—') },
                      ...(selected.is_kr ? [{ label: 'Discipline', editable: false, render: () => selected.discipline_codes || '—' }] : []),
                      { label: selected.discipline === 'KRBA' ? 'Level' : selected.is_kr ? 'Experience' : 'Grade', editable: true, render: () => {
                        if (selected.discipline === 'KRBA') {
                          return isAdmin ? (
                            <select value={selected.krba_level || ''} onChange={e => updateSelectedField('krba_level', e.target.value || null)}
                              style={{ fontSize: 12, padding: '4px 6px', border: '1px solid var(--border-strong)', borderRadius: 6, background: 'var(--bg-secondary)', color: 'var(--text)' }}>
                              <option value="">— Select —</option>
                              {belts.krba.map(b => <option key={b}>{b}</option>)}
                            </select>
                          ) : (selected.krba_level || '—')
                        }
                        if (selected.is_kr) {
                          return isAdmin ? (
                            <select value={selected.competition_team || ''} onChange={e => updateSelectedField('competition_team', e.target.value || null)}
                              style={{ fontSize: 12, padding: '4px 6px', border: '1px solid var(--border-strong)', borderRadius: 6, background: 'var(--bg-secondary)', color: 'var(--text)' }}>
                              <option value="">— Select —</option>
                              <option>Beginner</option><option>Intermediate</option><option>Advanced</option>
                            </select>
                          ) : (selected.competition_team || '—')
                        }
                        const opts = age < 16 ? belts.junior : belts.senior
                        return isAdmin ? (
                          <select value={selected.pka_belt || ''} onChange={e => updateSelectedField('pka_belt', e.target.value || null)}
                            style={{ fontSize: 12, padding: '4px 6px', border: '1px solid var(--border-strong)', borderRadius: 6, background: 'var(--bg-secondary)', color: 'var(--text)' }}>
                            <option value="">— Select —</option>
                            {opts.map(b => <option key={b}>{b}</option>)}
                          </select>
                        ) : (selected.pka_belt || '—')
                      } },
                      { label: 'Record', editable: true, render: () => isAdmin ? (
                        <div key={`record-${selected.id}`} style={{ display: 'flex', gap: 4, alignItems: 'center', justifyContent: 'flex-end' }}
                          onTouchStart={e => e.stopPropagation()} onTouchEnd={e => e.stopPropagation()} onClick={e => e.stopPropagation()}>
                          <input key={`wins-${selected.id}`} type="number" min="0" defaultValue={selected.wins || 0} title="Wins"
                            onBlur={e => { const v = parseInt(e.target.value) || 0; if (v !== (selected.wins || 0)) updateSelectedField('wins', v) }}
                            style={{ width: 38, fontSize: 12, padding: '4px 4px', textAlign: 'center', border: '1px solid var(--border-strong)', borderRadius: 6, background: 'var(--bg-secondary)', color: 'var(--text)' }} />
                          <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>W</span>
                          <input key={`losses-${selected.id}`} type="number" min="0" defaultValue={selected.losses || 0} title="Losses"
                            onBlur={e => { const v = parseInt(e.target.value) || 0; if (v !== (selected.losses || 0)) updateSelectedField('losses', v) }}
                            style={{ width: 38, fontSize: 12, padding: '4px 4px', textAlign: 'center', border: '1px solid var(--border-strong)', borderRadius: 6, background: 'var(--bg-secondary)', color: 'var(--text)' }} />
                          <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>L</span>
                          <input key={`draws-${selected.id}`} type="number" min="0" defaultValue={selected.draws || 0} title="Draws"
                            onBlur={e => { const v = parseInt(e.target.value) || 0; if (v !== (selected.draws || 0)) updateSelectedField('draws', v) }}
                            style={{ width: 38, fontSize: 12, padding: '4px 4px', textAlign: 'center', border: '1px solid var(--border-strong)', borderRadius: 6, background: 'var(--bg-secondary)', color: 'var(--text)' }} />
                          <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>D</span>
                        </div>
                      ) : `${selected.wins || 0}W ${selected.losses || 0}L ${selected.draws || 0}D` },
                      { label: 'Weight', editable: true, render: () => isAdmin ? (
                        <input key={`weight-${selected.id}`} type="number" step="0.1" defaultValue={selected.weight_kg || ''} placeholder="kg"
                          onBlur={e => { const v = e.target.value ? parseFloat(e.target.value) : null; if (v !== selected.weight_kg) updateSelectedField('weight_kg', v) }}
                          style={{ width: 70, fontSize: 12, padding: '4px 6px', textAlign: 'right', border: '1px solid var(--border-strong)', borderRadius: 6, background: 'var(--bg-secondary)', color: 'var(--text)' }} />
                      ) : (selected.weight_kg ? `${selected.weight_kg}kg${selected.weight_category ? ` (${selected.weight_category})` : ''}` : '—') },
                      { label: 'Comp weight', editable: true, render: () => isAdmin ? (
                        <input key={`compweight-${selected.id}`} defaultValue={apData?.weight_division || ''} placeholder="e.g. -60kg"
                          onBlur={e => { if (e.target.value !== (apData?.weight_division || '')) saveCompWeightHere(e.target.value || null) }}
                          style={{ width: 90, fontSize: 12, padding: '4px 6px', textAlign: 'right', border: '1px solid var(--border-strong)', borderRadius: 6, background: 'var(--bg-secondary)', color: 'var(--text)' }} />
                      ) : (apData?.weight_division || '—') },
                      { label: 'Groups', editable: true, render: () => isAdmin ? (
                        <div style={{ display: 'flex', gap: 3 }}>
                          {[
                            { key: 'is_kr', label: 'KR', cls: 'badge-purple' },
                            { key: 'is_pts', label: 'PTs', cls: 'badge-blue' },
                            { key: 'is_leader', label: 'Leader', cls: 'badge-green' },
                            { key: 'is_coach', label: 'Coach', cls: 'badge-amber' },
                          ].map(g => (
                            <button key={g.key} onClick={() => toggleSelectedGroup(g.key)}
                              className={`badge ${g.cls}`}
                              style={{ fontSize: 9, cursor: 'pointer', border: 'none', opacity: selected[g.key] ? 1 : 0.25 }}>
                              {g.label}
                            </button>
                          ))}
                        </div>
                      ) : ([selected.is_kr && 'KR', selected.is_pts && 'PTs', selected.is_leader && 'Leader', selected.is_coach && 'Coach'].filter(Boolean).join(', ') || 'None') },
                      ...(selected.is_kr || selected.discipline === 'KRBA' ? [{ label: 'Competition status', editable: true, render: () => isAdmin ? (
                        <button onClick={() => toggleSelectedGroup('in_comp')}
                          className={`badge ${selected.in_comp ? 'badge-green' : 'badge-gray'}`}
                          style={{ fontSize: 10, cursor: 'pointer', border: 'none' }}>
                          {selected.in_comp ? 'In comp' : 'Out of comp'}
                        </button>
                      ) : (selected.in_comp ? 'In comp' : 'Out of comp') }] : []),
                      ...(apData?.show_on_website ? [{ label: 'Website', editable: false, render: () => (
                        <span className="badge badge-green" style={{ fontSize: 10 }}>🌐 On website</span>
                      ) }] : []),
                    ].map(({ label, render }, i, arr) => (
                      <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 14px', borderBottom: i < arr.length - 1 ? '1px solid var(--border)' : 'none', fontSize: 13 }}>
                        <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
                        <span style={{ fontWeight: 500, textAlign: 'right' }}>{render()}</span>
                      </div>
                    ))}
                  </div>

                  {apData && (
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
                      {(apData.favourite_technique || apData.training_music || apData.social_media || apData.sponsor_links) && (
                        <div className="card">
                          <h3 style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, color: colour }}>Athlete info</h3>
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

            {/* Tabs */}
            <div className="hide-scrollbar hscroll-area" style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: 14, overflowX: 'auto' }}>
              {['home', 'sessions', 'fit2fight', 'pdp', 'tpt', 'media', 'notes', 'report'].map(t => (
                <button key={t} onClick={() => setTab(t)} style={{
                  padding: '8px 16px', fontSize: 13, border: 'none', background: 'none', cursor: 'pointer',
                  borderBottom: `2px solid ${tab === t ? 'var(--text)' : 'transparent'}`,
                  color: tab === t ? 'var(--text)' : 'var(--text-secondary)',
                  fontWeight: tab === t ? 500 : 400, textTransform: 'capitalize', whiteSpace: 'nowrap', flexShrink: 0,
                }}>{t === 'tpt' ? 'TTP' : t === 'sessions' ? 'Attendance' : t === 'fit2fight' ? 'Results' : t}</button>
              ))}
            </div>

            {/* ── Profile tab ── */}
            {/* ── Home tab -- mirrors what the athlete sees on My app ── */}
            {tab === 'home' && (() => {
              const totalPts = sessionPoints.reduce((s, p) => s + (p.points_awarded || 0), 0)
              const sorted = [...f2fData].sort((a,b) => new Date(a.session_date) - new Date(b.session_date))

              const scopeOptions = ['All sessions', selected.discipline, [selected.class_schedule, selected.class_time].filter(Boolean).join(' ')]
                .filter(Boolean)
                .filter((v, i, a) => a.indexOf(v) === i)
              const scopeLen = scopeOptions.length || 1
              const scopeLabel = scopeOptions[((f2fStatsScope % scopeLen) + scopeLen) % scopeLen] || 'All sessions'
              const matchesScope = att => {
                if (scopeLabel === 'All sessions') return true
                if (scopeLabel === selected.discipline) return att?.students?.discipline === selected.discipline
                return att?.students?.class_schedule === selected.class_schedule && att?.students?.class_time === selected.class_time
              }
              const possibleSessions = new Set((allAttendance || []).filter(matchesScope).map(a => a?.session_date)).size

              // Distinct sub-types this athlete actually has logged for a module,
              // used to drive the hold-to-cycle options on each card
              const modules = [
                { key: 'running',    label: 'Running',       icon: '🏃' },
                { key: 'watt_bike',  label: 'Watt bike',     icon: '🚴' },
                { key: 'bodyweight', label: 'Bodyweight',    icon: '💪' },
                { key: 'stretch',    label: 'Stretch flows', icon: '🤸' },
                { key: 'test',       label: 'Test',          icon: '📋' },
              ]
              const modules2 = [
                // { key: 'techniques', label: 'Techniques', icon: '🥋' }, // removed for now, kept for possible future use
                { key: 'mentality',      label: 'Mentality',      icon: '🧠' },
                { key: 'wellbeing',      label: 'Wellbeing',      icon: '🌱' },
              ]
              const togglePhysicalLog = key => {
                setActivePhysicalCategory(cur => cur === key ? null : key)
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
                <div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 8 }}>
                    <div className="card" style={{ textAlign: 'center', padding: '10px 4px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2, background: 'var(--bg-secondary)' }}>
                      <button onClick={() => setF2fStatsScope(v => v - 1)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: 'var(--text-tertiary)', padding: 4, appearance: 'none', WebkitAppearance: 'none', fontFamily: 'var(--font-sans)' }}>◀</button>
                      <div style={{ flex: 1 }}>
                        <button onClick={() => setTab('sessions')} title="View Sessions tab"
                          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, marginBottom: 2, padding: 0, fontFamily: 'var(--font-sans)', appearance: 'none', WebkitAppearance: 'none' }}>✅</button>
                        <div onClick={() => setAttendanceDisplayPct(v => !v)} title="Click to toggle percentage/numbers"
                          style={{ fontSize: 19, fontWeight: 700, color: colour, cursor: 'pointer' }}>
                          {attendanceDisplayPct
                            ? `${possibleSessions ? Math.round((attendanceData.length / possibleSessions) * 100) : 0}%`
                            : `${attendanceData.length}/${possibleSessions || attendanceData.length}`}
                        </div>
                        <div style={{ fontSize: 9, color: 'var(--text-secondary)' }}>{scopeLabel}</div>
                      </div>
                      <button onClick={() => setF2fStatsScope(v => v + 1)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: 'var(--text-tertiary)', padding: 4 }}>▶</button>
                    </div>
                    <button onClick={() => setTab('fit2fight')} className="card" style={{ textAlign: 'center', padding: '12px 8px', cursor: 'pointer', width: '100%', fontFamily: 'var(--font-sans)', background: 'var(--bg)', appearance: 'none', WebkitAppearance: 'none' }} title="View Fit II Fight results">
                      <div style={{ fontSize: 22, marginBottom: 4 }}>🔥</div>
                      <div style={{ fontSize: 22, fontWeight: 700, color: '#378ADD' }}>
                        {(() => {
                          const hasContent = v => Array.isArray(v) ? v.length > 0 : (v && typeof v === 'object' ? Object.keys(v).length > 0 : !!v)
                          const activityFields = ['running', 'watt_bike', 'bodyweight', 'stretch_flows', 'snc', 'other_session', 'techniques', 'tactical', 'mentality_log', 'wellbeing', 'test']
                          return f2fData.filter(s => activityFields.some(f => hasContent(s[f]))).length
                        })()}
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>F2F Results</div>
                    </button>
                    <button onClick={() => setTab('pdp')} className="card" style={{ textAlign: 'center', padding: '12px 8px', cursor: 'pointer', width: '100%', fontFamily: 'var(--font-sans)', background: 'var(--bg)', appearance: 'none', WebkitAppearance: 'none' }} title="View PDP">
                      <div style={{ fontSize: 22, marginBottom: 4 }}>🎯</div>
                      <div style={{ fontSize: 22, fontWeight: 700, color: '#EF9F27' }}>
                        {notesLog.filter(n => n.note_text?.startsWith('Completed PDP task') && !/weigh/i.test(n.note_text)).length}
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
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                    <ModuleButton b={modules[0]} sorted={sorted} moduleSubType={moduleSubType} setModuleSubType={setModuleSubType} colour={colour} setTab={setTab} setRunChartFilter={setRunChartFilter} studentId={selected?.id} onToggleLog={togglePhysicalLog} />
                    <ModuleButton b={modules[1]} sorted={sorted} moduleSubType={moduleSubType} setModuleSubType={setModuleSubType} colour={colour} setTab={setTab} setRunChartFilter={setRunChartFilter} studentId={selected?.id} onToggleLog={togglePhysicalLog} />
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

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                    <ModuleButton b={modules[2]} sorted={sorted} moduleSubType={moduleSubType} setModuleSubType={setModuleSubType} colour={colour} setTab={setTab} setRunChartFilter={setRunChartFilter} studentId={selected?.id} onToggleLog={togglePhysicalLog} />
                    <ModuleButton b={modules[3]} sorted={sorted} moduleSubType={moduleSubType} setModuleSubType={setModuleSubType} colour={colour} setTab={setTab} setRunChartFilter={setRunChartFilter} studentId={selected?.id} onToggleLog={togglePhysicalLog} />
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

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                    <div style={{
                      display: 'flex', alignItems: 'stretch', width: '100%',
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
                    <div style={{
                      display: 'flex', alignItems: 'stretch', width: '100%',
                      background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius)',
                      overflow: 'hidden', fontFamily: 'var(--font-sans)',
                    }}>
                      <button onClick={() => setShowOtherSessionCards(v => !v)} style={{
                        flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2,
                        padding: '8px 4px', background: 'none', border: 'none', borderRight: '1px solid var(--border)', cursor: 'pointer',
                        minWidth: 0,
                      }}>
                        <span style={{ fontSize: 16 }}>🥋</span>
                        <span style={{ fontSize: 9, fontWeight: 500, whiteSpace: 'nowrap' }}>Other session</span>
                      </button>
                      <button onClick={() => setShowOtherSessionCards(v => !v)} style={{
                        width: 58, flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                        padding: '8px 4px', background: 'none', border: 'none', cursor: 'pointer',
                      }}>
                        <span style={{ fontSize: 8, color: 'var(--text-tertiary)', textAlign: 'center', lineHeight: 1.3 }}>
                          {todaysOtherSession.length > 0 ? `Logged ${todaysOtherSession.length}×` : 'Not logged'}
                        </span>
                      </button>
                    </div>
                  </div>
                  {showOtherSessionCards && (
                    <div className="card" style={{ marginBottom: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
                        <button type="button" className="btn btn-sm" style={{ fontSize: 11 }}
                          onClick={() => savePhysicalField('other_session', [], setTodaysOtherSession)}>✕ Clear all</button>
                      </div>
                      {todaysOtherSession.map((entry, i) => (
                        <div key={i} style={{ marginBottom: 12, paddingBottom: 12, borderBottom: '1px solid var(--border)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                            <span style={{ fontSize: 13, fontWeight: 600 }}>{entry.type}</span>
                            <button onClick={() => savePhysicalField('other_session', todaysOtherSession.filter((_, idx) => idx !== i), setTodaysOtherSession)}
                              style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: 14 }}>×</button>
                          </div>
                          <input defaultValue={entry.description || ''}
                            onBlur={e => { const next = [...todaysOtherSession]; next[i] = { ...next[i], description: e.target.value }; savePhysicalField('other_session', next, setTodaysOtherSession) }}
                            placeholder="Notes about this session" style={{ marginBottom: 6 }} />
                          <SetInput sets={entry.sets || []}
                            onChange={sets => { const next = [...todaysOtherSession]; next[i] = { ...next[i], sets }; savePhysicalField('other_session', next, setTodaysOtherSession) }}
                            placeholder="e.g. result, score, or notes" />
                        </div>
                      ))}
                      <div className="field"><label>Add a session type</label>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                          {OTHER_SESSION_PRESETS.filter(r => !todaysOtherSession.some(e => e.type === r)).map(r => (
                            <button key={r} type="button" className="btn btn-sm"
                              onClick={() => savePhysicalField('other_session', [...todaysOtherSession, { type: r, description: '', sets: [] }], setTodaysOtherSession)}>{r}</button>
                          ))}
                          <input value={otherSessionDraft} onChange={e => setOtherSessionDraft(e.target.value)} placeholder="Or write your own…" style={{ width: 130 }} />
                          <button type="button" className="btn btn-sm" disabled={!otherSessionDraft}
                            onClick={() => { savePhysicalField('other_session', [...todaysOtherSession, { type: otherSessionDraft, description: '', sets: [] }], setTodaysOtherSession); setOtherSessionDraft('') }}>Add</button>
                        </div>
                      </div>
                      {savingPhysical && <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>Saving…</p>}
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



                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 8, marginBottom: 8 }}>
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

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 8, marginBottom: 14 }}>
                    {(() => {
                      const completedPdpNotes = notesLog.filter(n =>
                        n.note_text?.startsWith('Completed PDP task') && !/weigh/i.test(n.note_text)
                      )
                      const completedPdpCount = completedPdpNotes.length
                      return [
                        { label: 'PDP', icon: '🎯', colour: '#1D9E75', tab: 'pdp', badge: completedPdpCount > 0 ? `${completedPdpCount} completed → Notes` : null, diagNotes: completedPdpNotes },
                        { label: 'TTP', icon: '📊', colour: '#E24B4A', tab: 'tpt', badge: null, diagNotes: null },
                      ].map(l => (
                        <div key={l.label} style={{ position: 'relative' }}>
                          <button onClick={() => setTab(l.tab)} style={{
                            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, width: '100%',
                            padding: '14px 8px', background: l.colour + '12',
                            border: `1px solid ${l.colour}30`, borderRadius: 'var(--border-radius-lg)',
                            cursor: 'pointer', fontFamily: 'var(--font-sans)',
                          }}>
                            <span style={{ fontSize: 24 }}>{l.icon}</span>
                            <span style={{ fontSize: 12, fontWeight: 500, color: l.colour }}>{l.label}</span>
                            {l.badge && <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{l.badge}</span>}
                          </button>
                          {l.diagNotes && l.diagNotes.length > 0 && (
                            <button onClick={() => {
                              const sample = l.diagNotes.slice(0, 15).map(n => `• ${n.note_text}  (${new Date(n.logged_at).toLocaleDateString('en-GB')})`).join('\n')
                              alert(`Total counted: ${l.diagNotes.length} (raw notesLog size: ${notesLog.length})\n\nFirst 15:\n${sample}`)
                            }} title="Show what's being counted" style={{
                              position: 'absolute', top: 4, right: 4, width: 22, height: 22, borderRadius: '50%',
                              background: 'var(--bg)', border: '1px solid var(--border-strong)', cursor: 'pointer', fontSize: 11,
                              display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
                            }}>🔍</button>
                          )}
                        </div>
                      ))
                    })()}
                    <a href={`/fit2fight?student_id=${selected?.id}`} style={{
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                      padding: '14px 8px', background: '#EF9F2712',
                      border: '1px solid #EF9F2730', borderRadius: 'var(--border-radius-lg)',
                      cursor: 'pointer', fontFamily: 'var(--font-sans)', textDecoration: 'none', gridColumn: 'span 2',
                    }} title="Log a Fit II Fight session">
                      <span style={{ fontSize: 24 }}>💪</span>
                      <span style={{ fontSize: 12, fontWeight: 500, color: '#EF9F27' }}>Fit II Fight — log session</span>
                    </a>
                  </div>

                  {sessionPoints.length > 0 && (
                    <div className="card" style={{ padding: 0, marginBottom: 14 }}>
                      <div style={{ padding: '10px 14px', fontWeight: 600, fontSize: 13, borderBottom: '1px solid var(--border)' }}>Recent points</div>
                      <table><tbody>
                        {sessionPoints.slice(0,5).map((p,i) => (
                          <tr key={i}>
                            <td style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{new Date(p.awarded_at).toLocaleDateString('en-GB')}</td>
                            <td style={{ fontSize: 13 }}>{p.point_type}</td>
                            <td style={{ textAlign: 'right', fontWeight: 700, color: p.points_awarded < 0 ? '#a32d2d' : '#1d9e75' }}>{p.points_awarded > 0 ? '+' : ''}{p.points_awarded}</td>
                          </tr>
                        ))}
                      </tbody></table>
                    </div>
                  )}
                </div>
              )
            })()}

            {editing && (
                  <div className="card" ref={editProfileRef}>
                    <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: 14 }}>Edit athlete profile</h2>
                    <div className="field-row">
                      <div className="field"><label>Age division (kickboxing)</label>
                        <select value={editForm.age_division_kickboxing} onChange={e => setEditForm(f => ({ ...f, age_division_kickboxing: e.target.value }))}>
                          <option value="">Select…</option>{KB_DIVISIONS.map(d => <option key={d}>{d}</option>)}
                        </select>
                      </div>
                      <div className="field"><label>Age division (boxing)</label>
                        <select value={editForm.age_division_boxing} onChange={e => setEditForm(f => ({ ...f, age_division_boxing: e.target.value }))}>
                          <option value="">Select…</option>{BOX_DIVISIONS.map(d => <option key={d}>{d}</option>)}
                        </select>
                      </div>
                    </div>
                    <div className="field-row">
                      <div className="field"><label>Weight division</label><input value={editForm.weight_division} onChange={e => setEditForm(f => ({ ...f, weight_division: e.target.value }))} placeholder="e.g. -47kg, 63-69kg" /></div>
                      <div className="field"><label>Kode Red debut</label><input type="date" value={editForm.kode_red_debut} onChange={e => setEditForm(f => ({ ...f, kode_red_debut: e.target.value }))} /></div>
                    </div>
                    <div className="field"><label>Top achievements to date</label>
                      <textarea rows={3} value={editForm.top_achievements} onChange={e => setEditForm(f => ({ ...f, top_achievements: e.target.value }))}
                        placeholder="Gold at nationals, Bronze at WAKO Europeans…" style={{ resize: 'none' }} />
                    </div>
                    <div style={{ marginBottom: 12 }}>
                      <label style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 500, display: 'block', marginBottom: 6 }}>Recent results</label>
                      {results.map((r, i) => (
                        <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                          <input value={r} onChange={e => { const next = [...results]; next[i] = e.target.value; setResults(next) }}
                            placeholder={`Result ${i + 1}`}
                            style={{ flex: 1, padding: '7px 10px', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius)', fontSize: 13, background: 'var(--bg-secondary)', color: 'var(--text)' }} />
                          {results.length > 1 && <button onClick={() => setResults(results.filter((_, idx) => idx !== i))} style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: 16 }}>×</button>}
                        </div>
                      ))}
                      <button className="btn btn-sm" onClick={() => setResults([...results, ''])}>+ Add result</button>
                    </div>
                    <div className="field-row">
                      <div className="field"><label>Favourite technique</label><input value={editForm.favourite_technique} onChange={e => setEditForm(f => ({ ...f, favourite_technique: e.target.value }))} placeholder="e.g. Chop kick" /></div>
                      <div className="field"><label>Training music</label><input value={editForm.training_music} onChange={e => setEditForm(f => ({ ...f, training_music: e.target.value }))} placeholder="e.g. Drum & bass" /></div>
                    </div>
                    <div className="field"><label>Social media</label><input value={editForm.social_media} onChange={e => setEditForm(f => ({ ...f, social_media: e.target.value }))} placeholder="e.g. Instagram @athlete_name" /></div>
                    <div className="field"><label>Sponsor / GoFundMe links</label><input value={editForm.sponsor_links} onChange={e => setEditForm(f => ({ ...f, sponsor_links: e.target.value }))} placeholder="Sponsor name + link" /></div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                      <input type="checkbox" id="website" checked={editForm.show_on_website} onChange={e => setEditForm(f => ({ ...f, show_on_website: e.target.checked }))} style={{ width: 15, height: 15 }} />
                      <label htmlFor="website" style={{ fontSize: 13, cursor: 'pointer' }}>Show profile on website</label>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="btn" onClick={() => setEditing(false)}>Cancel</button>
                      <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={saveProfile} disabled={saving}>{saving ? 'Saving…' : 'Save profile'}</button>
                    </div>
              </div>
            )}
            {tab === 'membership' && (
              <StudentProfile student={selected} isAdmin={isAdmin} embedded={true} onClose={() => {}} />
            )}

            {/* ── Sessions tab ── */}
            {tab === 'sessions' && (() => {
              const now = new Date()
              const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
              const thirtyDaysAgo = new Date(now); thirtyDaysAgo.setDate(now.getDate() - 30)

              const totalSessions = attendanceData.length
              const fullKitCount = attendanceData.filter(a => a.attendance_type === 'full_kit').length
              const thisMonthCount = attendanceData.filter(a => new Date(a.session_date) >= startOfMonth).length
              const last30Count = attendanceData.filter(a => new Date(a.session_date) >= thirtyDaysAgo).length

              // Build last 6 months of counts for the bar graph
              const months = []
              for (let i = 5; i >= 0; i--) {
                const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
                months.push({ key: `${d.getFullYear()}-${d.getMonth()}`, label: d.toLocaleDateString(undefined, { month: 'short' }), count: 0 })
              }
              attendanceData.forEach(a => {
                const d = new Date(a.session_date)
                const key = `${d.getFullYear()}-${d.getMonth()}`
                const m = months.find(mo => mo.key === key)
                if (m) m.count++
              })
              const maxCount = Math.max(1, ...months.map(m => m.count))

              // Points grouped by calendar date, to match against sessions
              const pointsByDate = {}
              sessionPoints.forEach(p => {
                const day = (p.awarded_at || '').slice(0, 10)
                if (!pointsByDate[day]) pointsByDate[day] = []
                pointsByDate[day].push(p)
              })

              return (
                <div>
                  {/* Attendance calendar */}
                  <div className="card" style={{ marginBottom: 20 }}>
                    {(() => {
                      const { year, month } = sessionsCalMonth
                      const firstDay = new Date(year, month, 1)
                      const startWeekday = (firstDay.getDay() + 6) % 7
                      const daysInMonth = new Date(year, month + 1, 0).getDate()
                      const assignedWeekdays = new Set(
                        assignedClasses.flatMap(a => DAY_TO_JS_DAYS[a.classes?.day_of_week] || [])
                      )
                      const daysInMonthList = Array.from({ length: daysInMonth }, (_, i) => i + 1)
                      const todayStr = new Date().toISOString().split('T')[0]
                      const allTrainingDays = new Set(
                        daysInMonthList
                          .filter(d => assignedWeekdays.has(new Date(year, month, d).getDay()))
                          .map(d => `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`)
                          .filter(dateStr => dateStr <= todayStr)
                      )
                      const attendedDays = new Set(
                        attendanceData
                          .map(a => a.session_date)
                          .filter(d => d && new Date(d).getFullYear() === year && new Date(d).getMonth() === month)
                      )
                      const explicitlyAbsentDays = new Set(
                        (allAttendance || [])
                          .filter(a => a?.student_id === selected.id && a?.attendance_type === 'absent')
                          .map(a => a?.session_date)
                          .filter(d => d && new Date(d).getFullYear() === year && new Date(d).getMonth() === month)
                      )
                      const explicitlyExcusedDays = new Set(
                        (allAttendance || [])
                          .filter(a => a?.student_id === selected.id && a?.attendance_type === 'excused')
                          .map(a => a?.session_date)
                          .filter(d => d && new Date(d).getFullYear() === year && new Date(d).getMonth() === month)
                      )
                      const cells = []
                      for (let i = 0; i < startWeekday; i++) cells.push(null)
                      for (let d = 1; d <= daysInMonth; d++) cells.push(d)
                      return (
                        <>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 8 }}>
                            <button className="btn btn-sm" onClick={() => setSessionsCalMonth(m => m.month === 0 ? { year: m.year - 1, month: 11 } : { year: m.year, month: m.month - 1 })}>←</button>
                            <span style={{ fontSize: 13, fontWeight: 600 }}>{new Date(year, month, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</span>
                            <input type="month" value={`${year}-${String(month+1).padStart(2,'0')}`}
                              onChange={e => { const [y, m] = e.target.value.split('-').map(Number); if (y && m) setSessionsCalMonth({ year: y, month: m - 1 }) }}
                              style={{ fontSize: 11, padding: '4px 6px', border: '1px solid var(--border-strong)', borderRadius: 6, background: 'var(--bg-secondary)', color: 'var(--text)' }} />
                            <button className="btn btn-sm" onClick={() => setSessionsCalMonth(m => m.month === 11 ? { year: m.year + 1, month: 0 } : { year: m.year, month: m.month + 1 })}>→</button>
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 4, marginBottom: 8 }}>
                            {['Mo','Tu','We','Th','Fr','Sa','Su'].map(d => (
                              <div key={d} style={{ textAlign: 'center', fontSize: 10, color: 'var(--text-tertiary)' }}>{d}</div>
                            ))}
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 4 }}>
                            {cells.map((d, i) => {
                              if (d === null) return <div key={i} />
                              const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`
                              const attended = attendedDays.has(dateStr)
                              const explicitlyAbsent = explicitlyAbsentDays.has(dateStr)
                              const explicitlyExcused = explicitlyExcusedDays.has(dateStr)
                              const wasTrainingDay = allTrainingDays.has(dateStr)
                              const showAsRed = explicitlyAbsent || (wasTrainingDay && !attended && !explicitlyExcused)
                              const bg = attended ? '#1D9E75' : showAsRed ? '#E24B4A' : 'transparent'
                              const fg = attended || showAsRed ? '#fff' : 'var(--text-secondary)'
                              const jsDay = new Date(year, month, d).getDay()
                              const classesToday = assignedClasses.filter(a => (DAY_TO_JS_DAYS[a.classes?.day_of_week] || []).includes(jsDay))
                              const pdpNotesData = apData?.pdp_notes || {}
                              const pdpItemsToday = Array.from(PDP_CHECKABLE_SECTIONS).flatMap(sectionKey =>
                                Object.entries(pdpNotesData[`__timetable_${sectionKey}`] || {}).map(([item, entry]) => ({ sectionKey, item, ...entry }))
                              ).filter(e => e.date === dateStr)
                              const eventsToday = clubEvents.filter(e => e.event_date === dateStr)
                              return (
                                <button key={i} type="button" onClick={() => cycleAttendanceDay(dateStr)}
                                  title={(attended ? 'Attended — click to mark absent' : explicitlyAbsent ? 'Marked absent — click to clear' : explicitlyExcused ? 'Cleared — click to mark attended' : wasTrainingDay ? 'Missed (a session happened this day) — click to mark attended' : 'Click to mark attended')
                                    + (classesToday.length ? `\nClass: ${classesToday.map(a => `${a.classes?.name} ${a.classes?.start_time?.slice(0,5)}`).join(', ')}` : '')
                                    + (pdpItemsToday.length ? `\nPDP: ${pdpItemsToday.map(e => `${e.item}${e.time ? ` ${e.time}` : ''}`).join(', ')}` : '')
                                    + (eventsToday.length ? `\nEvent: ${eventsToday.map(e => `${e.title}${e.event_time ? ` ${e.event_time.slice(0,5)}` : ''}`).join(', ')}` : '')}
                                  style={{
                                    aspectRatio: '0.85', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    borderRadius: 6, fontSize: 12, background: bg, color: fg, cursor: 'pointer', fontFamily: 'var(--font-sans)',
                                    border: !attended && !showAsRed ? '1px solid var(--border)' : 'none', position: 'relative', overflow: 'hidden',
                                  }}>
                                  <span style={{ position: 'relative', zIndex: 1 }}>{d}</span>
                                  {classesToday.map((a, ci) => {
                                    const pct = timeToTimelinePercent(a.classes?.start_time?.slice(0, 5))
                                    if (pct == null) return null
                                    return <div key={ci} title={`${a.classes?.name} ${a.classes?.start_time?.slice(0,5)}`}
                                      style={{ position: 'absolute', left: 2, right: 2, top: `${pct}%`, height: 2, background: '#378ADD', borderRadius: 1 }} />
                                  })}
                                  {pdpItemsToday.map((e, pi) => {
                                    const pct = timeToTimelinePercent(e.time)
                                    if (pct == null) return null
                                    return <div key={pi} title={`${e.item}${e.time ? ` ${e.time}` : ''}`}
                                      style={{ position: 'absolute', left: 2, right: 2, top: `${pct}%`, height: 2, background: '#8B5CF6', borderRadius: 1 }} />
                                  })}
                                  {eventsToday.map((e, ei) => {
                                    const pct = timeToTimelinePercent(e.event_time?.slice(0, 5)) ?? 2
                                    return <div key={ei} title={`${e.title}${e.event_time ? ` ${e.event_time.slice(0,5)}` : ''}`}
                                      style={{ position: 'absolute', left: 2, right: 2, top: `${pct}%`, height: 2, background: '#EF9F27', borderRadius: 1 }} />
                                  })}
                                </button>
                              )
                            })}
                          </div>
                          {(() => {
                            const pdpNotesData2 = apData?.pdp_notes || {}
                            const allEntries = Array.from(PDP_CHECKABLE_SECTIONS).flatMap(sectionKey =>
                              Object.entries(pdpNotesData2[`__timetable_${sectionKey}`] || {}).map(([item, entry]) => ({ sectionKey, item, ...entry }))
                            )
                            const monthItems = allEntries.filter(e => {
                              const d = new Date(e.date)
                              return d.getFullYear() === year && d.getMonth() === month
                            }).sort((a, b) => a.date.localeCompare(b.date))
                            if (monthItems.length === 0) return null
                            return (
                              <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                                <p style={{ fontSize: 11, fontWeight: 600, marginBottom: 6 }}>📌 PDP actions scheduled this month</p>
                                {monthItems.map((e, idx) => (
                                  <div key={idx} style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>
                                    <strong>{new Date(e.date + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}{e.time ? ` ${e.time}` : ''}</strong> — {e.item}
                                  </div>
                                ))}
                              </div>
                            )
                          })()}
                          <div style={{ display: 'flex', gap: 14, marginTop: 12, fontSize: 11, color: 'var(--text-secondary)', flexWrap: 'wrap' }}>
                            <span><span style={{ display: 'inline-block', width: 8, height: 8, background: '#1D9E75', borderRadius: 2, marginRight: 4 }} />Attended</span>
                            <span><span style={{ display: 'inline-block', width: 8, height: 8, background: '#E24B4A', borderRadius: 2, marginRight: 4 }} />Absent</span>
                            <span><span style={{ display: 'inline-block', width: 8, height: 2, background: '#378ADD', borderRadius: 2, marginRight: 4 }} />Class time</span>
                            <span><span style={{ display: 'inline-block', width: 8, height: 2, background: '#8B5CF6', borderRadius: 2, marginRight: 4 }} />PDP action</span>
                            <span><span style={{ display: 'inline-block', width: 8, height: 2, background: '#EF9F27', borderRadius: 2, marginRight: 4 }} />Event</span>
                          </div>
                          <p style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 6 }}>Red shows automatically for missed sessions, or tap any date to mark attended/absent/clear. Lines show roughly where in the day (6am-10pm) a class or PDP action falls.</p>
                        </>
                      )
                    })()}
                  </div>

                  {/* Weekly timetable */}
                  <div className="card" style={{ marginBottom: 20 }}>
                    {(() => {
                      const weekDays = Array.from({ length: 7 }, (_, i) => {
                        const d = new Date(weekTimetableStart)
                        d.setDate(d.getDate() + i)
                        return d
                      })
                      const hourMarks = Array.from({ length: 9 }, (_, i) => 6 + i * 2) // 6,8,...,22
                      const pdpNotesData = apData?.pdp_notes || {}
                      const allPdpEntries = Array.from(PDP_CHECKABLE_SECTIONS).flatMap(sectionKey =>
                        Object.entries(pdpNotesData[`__timetable_${sectionKey}`] || {}).map(([item, entry]) => ({ sectionKey, item, ...entry }))
                      )
                      return (
                        <>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                            <button className="btn btn-sm" onClick={() => setWeekTimetableStart(d => { const n = new Date(d); n.setDate(n.getDate() - 7); return n })}>←</button>
                            <span style={{ fontSize: 13, fontWeight: 600 }}>
                              Weekly timetable — {weekDays[0].toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} – {weekDays[6].toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                            </span>
                            <button className="btn btn-sm" onClick={() => setWeekTimetableStart(d => { const n = new Date(d); n.setDate(n.getDate() + 7); return n })}>→</button>
                          </div>
                          <div className="hscroll-area" style={{ display: 'flex', overflowX: 'auto' }}>
                            {/* Hour axis */}
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
                              const isToday = dateStr === new Date().toISOString().split('T')[0]
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
                        </>
                      )
                    })()}
                  </div>

                  {/* Assigned classes/sessions */}
                  <div className="card" style={{ marginBottom: 20 }}>
                    <h3 style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Assigned sessions</h3>
                    {assignedClasses.length === 0 ? (
                      <p style={{ fontSize: 13, color: 'var(--text-tertiary)', marginBottom: 12 }}>No classes assigned yet.</p>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
                        {assignedClasses.slice().sort((a, b) => {
                          const DAY_ORDER = ['Monday','Mon/Fri','Tuesday','Tue/Thu','Wednesday','Saturday','Sunday','Derby Moore','Moorways']
                          const da = DAY_ORDER.indexOf(a.classes?.day_of_week), db = DAY_ORDER.indexOf(b.classes?.day_of_week)
                          if (da !== db) return da - db
                          return (a.classes?.start_time || '').localeCompare(b.classes?.start_time || '')
                        }).map(a => (
                          <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
                            <div>
                              <div style={{ fontSize: 13, fontWeight: 600 }}>{a.classes?.name}</div>
                              <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                                {a.classes?.day_of_week} · {a.classes?.start_time?.slice(0,5)}–{a.classes?.end_time?.slice(0,5)} · {a.classes?.discipline}
                              </div>
                            </div>
                            {isAdmin && (
                              <button className="btn btn-sm" onClick={() => removeClassAssignment(a.id)}>Remove</button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    {isAdmin && (
                      <div style={{ display: 'flex', gap: 8 }}>
                        <select value={addingClassId} onChange={e => setAddingClassId(e.target.value)} style={{ flex: 1 }}>
                          <option value="">Add a class/session…</option>
                          {allClasses.filter(c => !assignedClasses.some(a => a.class_id === c.id))
                            .slice().sort((a, b) => (a.name || '').localeCompare(b.name || '')).map(c => (
                            <option key={c.id} value={c.id}>{c.name} — {c.day_of_week} {c.start_time?.slice(0,5)}</option>
                          ))}
                        </select>
                        <button className="btn btn-sm" disabled={!addingClassId || savingClassAssignment} onClick={addClassAssignment}>Add</button>
                      </div>
                    )}
                  </div>

                  {/* Per-class breakdown: potential/attended/%/hours */}
                  {assignedClasses.length > 0 && (() => {
                    const now = new Date()
                    let rangeStart
                    if (sessionsBreakdownRange === 'month') rangeStart = new Date(now.getFullYear(), now.getMonth(), 1)
                    else if (sessionsBreakdownRange === '30days') { rangeStart = new Date(now); rangeStart.setDate(now.getDate() - 30) }
                    else if (sessionsBreakdownRange === '90days') { rangeStart = new Date(now); rangeStart.setDate(now.getDate() - 90) }
                    else rangeStart = new Date(2015, 0, 1) // "all time"

                    function countWeekdaysInRange(jsDays) {
                      let count = 0
                      const d = new Date(rangeStart)
                      while (d <= now) { if (jsDays.includes(d.getDay())) count++; d.setDate(d.getDate() + 1) }
                      return count
                    }
                    function classDurationHours(cls) {
                      if (!cls.start_time || !cls.end_time) return 0
                      const [sh, sm] = cls.start_time.split(':').map(Number)
                      const [eh, em] = cls.end_time.split(':').map(Number)
                      return Math.max(0, ((eh * 60 + em) - (sh * 60 + sm)) / 60)
                    }

                    return (
                      <div className="card" style={{ marginBottom: 20 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                          <h3 style={{ fontSize: 13, fontWeight: 600 }}>Session breakdown</h3>
                          <div style={{ display: 'flex', gap: 6 }}>
                            {[['month', 'This month'], ['30days', 'Last 30 days'], ['90days', 'Last 90 days'], ['all', 'All time']].map(([key, label]) => (
                              <button key={key} className="btn btn-sm" onClick={() => setSessionsBreakdownRange(key)}
                                style={{ background: sessionsBreakdownRange === key ? colour + '20' : undefined, borderColor: sessionsBreakdownRange === key ? colour : undefined, fontSize: 11 }}>{label}</button>
                            ))}
                          </div>
                        </div>
                        <div className="hscroll-area" style={{ overflowX: 'auto' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                            <thead>
                              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                                <th style={{ padding: '6px 8px', width: 24 }}></th>
                                <th style={{ textAlign: 'left', padding: '6px 8px' }}>Class</th>
                                <th style={{ textAlign: 'center', padding: '6px 8px' }}>Potential</th>
                                <th style={{ textAlign: 'center', padding: '6px 8px' }}>Attended</th>
                                <th style={{ textAlign: 'center', padding: '6px 8px' }}>%</th>
                                <th style={{ textAlign: 'center', padding: '6px 8px' }}>Hours</th>
                              </tr>
                            </thead>
                            <tbody>
                              {(() => {
                                let totalPotential = 0, totalAttended = 0, totalHours = 0
                                const rows = assignedClasses.map(a => {
                                  const cls = a.classes
                                  if (!cls) return null
                                  const jsDays = DAY_TO_JS_DAYS[cls.day_of_week]
                                  const potential = jsDays ? countWeekdaysInRange(jsDays) : null
                                  const attended = jsDays
                                    ? attendanceData.filter(att => {
                                        const d = new Date(att.session_date)
                                        return d >= rangeStart && d <= now && jsDays.includes(d.getDay())
                                      }).length
                                    : null
                                  const pct = potential ? Math.round((attended / potential) * 100) : null
                                  const hours = attended != null ? +(attended * classDurationHours(cls)).toFixed(1) : null
                                  const included = !breakdownExcluded.has(a.id)
                                  if (included) {
                                    totalPotential += potential || 0
                                    totalAttended += attended || 0
                                    totalHours += hours || 0
                                  }
                                  return (
                                    <tr key={a.id} style={{ borderBottom: '1px solid var(--border)' }}>
                                      <td style={{ padding: '6px 8px' }}>
                                        <input type="checkbox" checked={included}
                                          onChange={() => setBreakdownExcluded(prev => {
                                            const next = new Set(prev)
                                            included ? next.add(a.id) : next.delete(a.id)
                                            return next
                                          })}
                                          style={{ width: 14, height: 14, cursor: 'pointer' }} />
                                      </td>
                                      <td style={{ padding: '6px 8px' }}>{cls.name}</td>
                                      <td style={{ textAlign: 'center', padding: '6px 8px' }}>{potential ?? '—'}</td>
                                      <td style={{ textAlign: 'center', padding: '6px 8px' }}>{attended ?? '—'}</td>
                                      <td style={{ textAlign: 'center', padding: '6px 8px', fontWeight: 600, color: pct != null ? colour : undefined }}>{pct != null ? `${pct}%` : '—'}</td>
                                      <td style={{ textAlign: 'center', padding: '6px 8px' }}>{hours ?? '—'}</td>
                                    </tr>
                                  )
                                })
                                const totalPct = totalPotential ? Math.round((totalAttended / totalPotential) * 100) : null
                                return (
                                  <>
                                    {rows}
                                    <tr style={{ borderTop: `2px solid ${colour}`, fontWeight: 700 }}>
                                      <td></td>
                                      <td style={{ padding: '6px 8px' }}>Total</td>
                                      <td style={{ textAlign: 'center', padding: '6px 8px' }}>{totalPotential}</td>
                                      <td style={{ textAlign: 'center', padding: '6px 8px' }}>{totalAttended}</td>
                                      <td style={{ textAlign: 'center', padding: '6px 8px', color: colour }}>{totalPct != null ? `${totalPct}%` : '—'}</td>
                                      <td style={{ textAlign: 'center', padding: '6px 8px' }}>{+totalHours.toFixed(1)}</td>
                                    </tr>
                                  </>
                                )
                              })()}
                            </tbody>
                          </table>
                        </div>
                        <p style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 8 }}>
                          Attended sessions are matched by day of week within the selected range, since attendance isn't recorded against a specific class. Classes at Derby Moore/Moorways aren't day-based, so potential/attended can't be calculated for those.
                        </p>
                      </div>
                    )
                  })()}

                  {/* Attendance numbers */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10, marginBottom: 20 }}>
                    {[
                      { label: 'Total sessions', value: totalSessions },
                      { label: 'Full kit', value: fullKitCount },
                      { label: 'This month', value: thisMonthCount },
                      { label: 'Last 30 days', value: last30Count },
                    ].map(stat => (
                      <div key={stat.label} style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '12px 14px', background: 'var(--bg-secondary)' }}>
                        <div style={{ fontSize: 22, fontWeight: 700 }}>{stat.value}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{stat.label}</div>
                      </div>
                    ))}
                  </div>

                  {/* Attendance graph */}
                  <div style={{ marginBottom: 24 }}>
                    <h4 style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Attendance — last 6 months</h4>
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, height: 120, borderBottom: '1px solid var(--border)', paddingBottom: 4 }}>
                      {months.map(m => (
                        <div key={m.key} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                          <div style={{ fontSize: 11, fontWeight: 600 }}>{m.count || ''}</div>
                          <div style={{
                            width: '60%', minHeight: m.count ? 4 : 0,
                            height: `${(m.count / maxCount) * 90}px`,
                            background: 'var(--accent, #378ADD)', borderRadius: '3px 3px 0 0',
                          }} />
                        </div>
                      ))}
                    </div>
                    <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                      {months.map(m => (
                        <div key={m.key} style={{ flex: 1, textAlign: 'center', fontSize: 11, color: 'var(--text-secondary)' }}>{m.label}</div>
                      ))}
                    </div>
                  </div>

                  {/* Session list */}
                  <h4 style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Sessions attended</h4>
                  {attendanceData.length === 0 ? (
                    <div className="empty-state"><h3>No sessions yet</h3><p>Attendance will appear here once marked on a register</p></div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 420, overflowY: 'auto' }}>
                      {attendanceData.map(a => {
                        const day = a.session_date
                        const dayPoints = pointsByDate[day] || []
                        const dayTotal = dayPoints.reduce((s, p) => s + (p.points_awarded || 0), 0)
                        return (
                          <button key={a.id} onClick={() => { setOpenSession(a); setSessionNoteDraft(a.note || '') }}
                            style={{
                              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                              textAlign: 'left', padding: '10px 12px', border: '1px solid var(--border)',
                              borderRadius: 'var(--radius)', background: 'var(--bg-secondary)', cursor: 'pointer',
                            }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span style={{ fontSize: 13, fontWeight: 500 }}>
                                {new Date(day).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
                              </span>
                              <span className={`badge ${a.attendance_type === 'full_kit' ? 'badge-blue' : 'badge-green'}`} style={{ fontSize: 10 }}>
                                {a.attendance_type === 'full_kit' ? 'Full kit' : 'Attended'}
                              </span>
                              {a.note && <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>📝 Note</span>}
                            </div>
                            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                              {dayPoints.length > 0 ? `+${dayTotal} pts (${dayPoints.length})` : 'No points'}
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  )}

                  {/* Session detail modal */}
                  {openSession && (
                    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 }}
                      onClick={() => setOpenSession(null)}>
                      <div className="card" style={{ width: '100%', maxWidth: 460 }} onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                          <h2 style={{ fontSize: 15, fontWeight: 600 }}>
                            {new Date(openSession.session_date).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                          </h2>
                          <button onClick={() => setOpenSession(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18 }}>✕</button>
                        </div>

                        <div style={{ marginBottom: 14 }}>
                          <label style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 500, display: 'block', marginBottom: 6 }}>
                            Coach points awarded
                          </label>
                          {(pointsByDate[openSession.session_date] || []).length === 0 ? (
                            <p style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>No points awarded for this session</p>
                          ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                              {(pointsByDate[openSession.session_date] || []).map(p => (
                                <div key={p.id} style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '8px 10px', fontSize: 12 }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 500 }}>
                                    <span>{p.point_type}</span>
                                    <span>+{p.points_awarded} pts ({p.point_scope})</span>
                                  </div>
                                  {p.note && <div style={{ color: 'var(--text-secondary)', marginTop: 3 }}>{p.note}</div>}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        <div>
                          <label style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 500, display: 'block', marginBottom: 6 }}>
                            Session notes
                          </label>
                          <textarea rows={4} value={sessionNoteDraft} onChange={e => setSessionNoteDraft(e.target.value)}
                            placeholder="Notes on how this session went…" style={{ resize: 'none', width: '100%' }}
                            disabled={!isAdmin} />
                          {isAdmin && (
                            <button className="btn btn-primary btn-sm" style={{ marginTop: 8 }} onClick={saveSessionNote} disabled={savingSessionNote}>
                              {savingSessionNote ? 'Saving…' : 'Save note'}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )
            })()}

            {/* ── PDP tab ── */}
            {tab === 'pdp' && (
              <PDPTab
                apData={apData}
                setApData={setApData}
                student={selected}
                isAdmin={isAdmin}
              />
            )}

                        {/* ── Fit II Fight tab ── */}
            {tab === 'fit2fight' && (() => {
              // Apply date range filter
              const filtered = f2fData.filter(s => {
                if (f2fFrom && s.session_date < f2fFrom) return false
                if (f2fTo && s.session_date > f2fTo) return false
                return true
              })
              // Build chart data from sessions
              const sorted = [...filtered].sort((a,b) => new Date(a.session_date) - new Date(b.session_date))
              const weightData = sorted.filter(s => s.weight_before || s.weight_after)
              // Flattened to one row per entry (not per session), since a
              // session can now hold multiple Watt bike/Running entries.
              // Downstream code below is unchanged -- it still reads
              // s.watt_bike.* / s.running.* the same way as before.
              const wattData = sorted.flatMap(s => toEntries(s.watt_bike)
                .filter(e => Array.isArray(e.sets) && e.sets.length > 0)
                .map(e => ({ id: s.id, session_date: s.session_date, watt_bike: e })))
              const runData = sorted.flatMap(s => toEntries(s.running)
                .filter(e => Array.isArray(e.sets) && e.sets.length > 0)
                .map(e => ({ id: s.id, session_date: s.session_date, running: e })))

              // SVG line chart helper
              function LineChart({ data, lines, height=160, title, unit='' }) {
                const [hidden, setHidden] = useState({})
                const [chartPopup, setChartPopup] = useState(null) // { x, y, label, value }
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
                                    const el = document.getElementById(`f2f-entry-${d.id}`)
                                    if (!el) return
                                    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
                                    setHighlightedEntryId(d.id)
                                    setTimeout(() => setHighlightedEntryId(cur => cur === d.id ? null : cur), 2000)
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
                    {/* Toggle buttons */}
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

              return (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
                  <h3 style={{ fontSize: 14, fontWeight: 600 }}>Fit II Fight Sessions</h3>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{filtered.length} of {f2fData.length} sessions</span>
                    {isAdmin && (
                      <button className="btn btn-sm btn-primary" style={{ fontSize: 11 }}
                        onClick={() => { setSessionForm({ session_date: new Date().toISOString().split('T')[0] }); setEditingSession({}) }}>
                        + Quick entry
                      </button>
                    )}
                    <a href={`/fit2fight?student_id=${selected?.id}`} className="btn btn-sm" style={{ fontSize: 11 }}>+ Full session log</a>
                  </div>
                </div>

                {/* Date range filter */}
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
                  <div className="field" style={{ marginBottom: 0 }}>
                    <label style={{ fontSize: 11 }}>From</label>
                    <input type="date" value={f2fFrom} onChange={e => setF2fFrom(e.target.value)} style={{ fontSize: 12, padding: '5px 8px' }} />
                  </div>
                  <div className="field" style={{ marginBottom: 0 }}>
                    <label style={{ fontSize: 11 }}>To</label>
                    <input type="date" value={f2fTo} onChange={e => setF2fTo(e.target.value)} style={{ fontSize: 12, padding: '5px 8px' }} />
                  </div>
                  {(f2fFrom || f2fTo) && (
                    <button className="btn btn-sm" style={{ fontSize: 11, marginTop: 16 }} onClick={() => { setF2fFrom(''); setF2fTo('') }}>Clear</button>
                  )}
                </div>

                {/* Charts */}
                {weightData.length > 1 && (
                  <div className="card" style={{ marginBottom: 12, position: 'relative' }}>
                    <a href={`/fit2fight?student_id=${selected?.id}`} className="btn btn-sm" style={{ position: 'absolute', top: 12, right: 12, fontSize: 11, zIndex: 1 }}>+ Log</a>
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
                )}

                <div id="f2f-chart-watt_bike">
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
                    ;(s.watt_bike?.sets || []).forEach((v,i) => {
                      // New shape is {wattage, distance}; older entries were a plain number/string
                      obj[`set${i}`] = (v && typeof v === 'object') ? v.wattage : v
                    })
                    return obj
                  })
                  return (
                    <div className="card" style={{ marginBottom: 12, position: 'relative' }}>
                      <a href={`/fit2fight?student_id=${selected?.id}&module=watt_bike`} className="btn btn-sm" style={{ position: 'absolute', top: 12, right: 12, fontSize: 11, zIndex: 1 }}>+ Log</a>
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

                <div id="f2f-chart-running">
                {(() => {
                  const SET_COLOURS = ['#E24B4A','#378ADD','#1D9E75','#EF9F27','#8B5CF6','#EC4899','#06B6D4','#84CC16']
                  const runTests = [...new Set(runData.map(s => s.running?.test).filter(Boolean))]
                  const filteredRun = runChartFilter === 'all' ? runData : runData.filter(s => s.running?.test === runChartFilter)
                  const isDistanceTest = filteredRun.some(s => (s.running?.category) === 'Distance over time')
                  const maxSets = Math.max(1, ...filteredRun.map(s => s.running?.sets?.length || 0))
                  const setLines = Array.from({length: maxSets}, (_,i) => ({
                    key: `set${i}`, label: `Attempt ${i+1}`, colour: SET_COLOURS[i % SET_COLOURS.length]
                  }))
                  // Time values (mm:ss) are converted to seconds for the chart; distance stays as-is
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
                      <a href={`/fit2fight?student_id=${selected?.id}&module=running`} className="btn btn-sm" style={{ position: 'absolute', top: 12, right: 12, fontSize: 11, zIndex: 1 }}>+ Log</a>
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

                {/* Bleep test chart */}
                <div id="f2f-chart-bleep">
                {(() => {
                  const bleepData = sorted.filter(s => s.test && Object.keys(s.test).some(k => k.toLowerCase().includes('bleep')))
                    .map(s => {
                      const entry = Object.entries(s.test).find(([k]) => k.toLowerCase().includes('bleep'))
                      return { id: s.id, session_date: s.session_date, level: entry ? parseFloat(entry[1]) : null }
                    }).filter(s => s.level != null)
                  return (
                    <div className="card" style={{ marginBottom: 12, position: 'relative' }}>
                      <a href={`/fit2fight?student_id=${selected?.id}&module=test`} className="btn btn-sm" style={{ position: 'absolute', top: 12, right: 12, fontSize: 11, zIndex: 1 }}>+ Log</a>
                      <LineChart
                        data={bleepData}
                        lines={[{ key: 'level', label: 'Bleep test', colour: '#1D9E75' }]}
                        title="🏃 Bleep test over time"
                        unit=""
                      />
                    </div>
                  )
                })()}
                </div>

                {/* Grip test chart */}
                <div id="f2f-chart-grip">
                {(() => {
                  const gripData = sorted.filter(s => s.test && Object.keys(s.test).some(k => k.toLowerCase().includes('grip')))
                    .map(s => {
                      const left = Object.entries(s.test).find(([k]) => k.toLowerCase().includes('left') && k.toLowerCase().includes('grip'))
                      const right = Object.entries(s.test).find(([k]) => k.toLowerCase().includes('right') && k.toLowerCase().includes('grip'))
                      return {
                        id: s.id,
                        session_date: s.session_date,
                        left: left ? parseFloat(left[1]) : null,
                        right: right ? parseFloat(right[1]) : null,
                      }
                    }).filter(s => s.left != null || s.right != null)
                  return (
                    <div className="card" style={{ marginBottom: 12, position: 'relative' }}>
                      <a href={`/fit2fight?student_id=${selected?.id}&module=test`} className="btn btn-sm" style={{ position: 'absolute', top: 12, right: 12, fontSize: 11, zIndex: 1 }}>+ Log</a>
                      <LineChart
                        data={gripData}
                        lines={[
                          { key: 'left',  label: 'Grip left',  colour: '#378ADD' },
                          { key: 'right', label: 'Grip right', colour: '#E24B4A' },
                        ]}
                        title="✊ Grip test over time"
                        unit="kg"
                      />
                    </div>
                  )
                })()}
                </div>

                {/* Fixed load circuit chart */}
                <div id="f2f-chart-circuit">
                {(() => {
                  const circuitData = sorted.filter(s => s.test && Object.keys(s.test).some(k => k.toLowerCase().includes('fixed load circuit')))
                    .map(s => {
                      const entry = Object.entries(s.test).find(([k]) => k.toLowerCase().includes('fixed load circuit'))
                      return { id: s.id, session_date: s.session_date, value: entry ? parseFloat(entry[1]) : null }
                    }).filter(s => s.value != null)
                  return (
                    <div className="card" style={{ marginBottom: 12, position: 'relative' }}>
                      <a href={`/fit2fight?student_id=${selected?.id}&module=test`} className="btn btn-sm" style={{ position: 'absolute', top: 12, right: 12, fontSize: 11, zIndex: 1 }}>+ Log</a>
                      <LineChart
                        data={circuitData}
                        lines={[{ key: 'value', label: 'Fixed load circuit', colour: '#854F0B' }]}
                        title="⭕ Fixed load circuit over time"
                        unit=""
                      />
                    </div>
                  )
                })()}
                </div>

                {/* Bodyweight chart */}
                <div id="f2f-chart-bodyweight">
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
                      <a href={`/fit2fight?student_id=${selected?.id}&module=bodyweight`} className="btn btn-sm" style={{ position: 'absolute', top: 12, right: 12, fontSize: 11, zIndex: 1 }}>+ Log</a>
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

                {/* Techniques chart */}
                <div id="f2f-chart-techniques">
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
                      <a href={`/fit2fight?student_id=${selected?.id}&module=techniques`} className="btn btn-sm" style={{ position: 'absolute', top: 12, right: 12, fontSize: 11, zIndex: 1 }}>+ Log</a>
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

                {filtered.length === 0 ? (
                  <div className="empty-state"><p>{f2fData.length === 0 ? 'No Fit II Fight sessions logged yet.' : 'No sessions in this date range.'}</p></div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {filtered.map((s, i) => {
                      const change = s.weight_before && s.weight_after
                        ? (parseFloat(s.weight_after) - parseFloat(s.weight_before)).toFixed(1) : null
                      const exercises = [
                        s.running && { label: '🏃 Running', data: s.running },
                        s.watt_bike && { label: '🚴 Watt bike', data: s.watt_bike },
                        s.bodyweight && { label: '💪 Bodyweight', data: s.bodyweight },
                        s.techniques && { label: '🥋 Techniques', data: s.techniques },
                        s.test && { label: '📊 Test', data: s.test },
                      ].filter(Boolean)
                      const isWeightOnly = exercises.length === 0 && !s.notes && (s.weight_before || s.weight_after)
                      return (
                        <div key={i} id={`f2f-entry-${s.id}`} className="card" style={{
                          borderLeft: '3px solid #378ADD',
                          outline: highlightedEntryId === s.id ? '2px solid #EF9F27' : 'none',
                          transition: 'outline 0.3s',
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span style={{ fontWeight: 600, fontSize: 13 }}>
                                {new Date(s.session_date).toLocaleDateString('en-GB')}
                              </span>
                              <span className="badge" style={{ fontSize: 9, background: 'var(--bg-secondary)' }}>
                                {isWeightOnly ? '⚖️ Check-in' : '💪 Fit II Fight'}
                              </span>
                            </div>
                            <div style={{ display: 'flex', gap: 12, fontSize: 12, alignItems: 'center' }}>
                              {s.weight_before && <span>⚖️ Before: <strong>{s.weight_before}kg</strong></span>}
                              {s.weight_after  && <span>After: <strong>{s.weight_after}kg</strong></span>}
                              {change && <span style={{ fontWeight: 700, color: change < 0 ? '#1d9e75' : '#a32d2d' }}>
                                {change > 0 ? '+' : ''}{change}kg
                              </span>}
                              {isAdmin && (
                                <div style={{ display: 'flex', gap: 4 }}>
                                  <button onClick={() => { setSessionForm({
                                      id: s.id, session_date: s.session_date,
                                      weight_before: s.weight_before ?? '', weight_after: s.weight_after ?? '',
                                      height_cm: s.height_cm ?? '', reach_cm: s.reach_cm ?? '', notes: s.notes ?? '',
                                    }); setEditingSession(s) }}
                                    style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: '3px 8px', fontSize: 11, cursor: 'pointer' }}>
                                    Edit
                                  </button>
                                  <button onClick={() => deleteFit2FightSession(s)}
                                    style={{ background: 'none', border: '1px solid #a32d2d', color: '#a32d2d', borderRadius: 6, padding: '3px 8px', fontSize: 11, cursor: 'pointer' }}>
                                    Delete
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                          {s.height_cm && <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 6 }}>
                            Height: {s.height_cm}cm · Reach: {s.reach_cm || '—'}cm
                          </div>}
                          {exercises.length > 0 && (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
                              {exercises.map((ex, j) => (
                                <span key={j} style={{ background: 'var(--bg-secondary)', borderRadius: 20, padding: '3px 10px', fontSize: 11 }}>
                                  {ex.label}
                                </span>
                              ))}
                            </div>
                          )}
                          {s.notes && <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>📝 {s.notes}</div>}
                          {s.heart_rate?.avg_bpm && <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                            ❤️ Avg: {s.heart_rate.avg_bpm} BPM{s.heart_rate.peak_bpm ? ` · Peak: ${s.heart_rate.peak_bpm} BPM` : ''}
                          </div>}
                          {s.watt_bike && (
                            <div style={{ marginTop: 6 }}>
                              <div style={{ fontSize: 11, fontWeight: 600, color: '#378ADD', marginBottom: 4 }}>
                                🚴 {s.watt_bike.type || 'Watt bike'}
                                {s.watt_bike.max_wattage ? ` · Max: ${s.watt_bike.max_wattage}W` : ''}
                                {s.watt_bike.avg_wattage ? ` · Avg: ${s.watt_bike.avg_wattage}W` : ''}
                                {s.watt_bike.total_distance ? ` · ${s.watt_bike.total_distance}km` : ''}
                              </div>
                              {Array.isArray(s.watt_bike.sets) && s.watt_bike.sets.length > 0 && (
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                                  {s.watt_bike.sets.map((v, i) => (
                                    <span key={i} style={{ background: '#378ADD20', color: '#378ADD', borderRadius: 12, padding: '2px 8px', fontSize: 11, fontWeight: 600 }}>
                                      {i+1}: {v && typeof v === 'object'
                                        ? `${v.wattage ?? '—'}W${v.distance ? ` · ${v.distance}km` : ''}`
                                        : `${v}${typeof v === 'number' && v > 10 ? 'W' : ''}`}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                          {s.test && Object.entries(s.test).map(([k, v]) => (
                            <div key={k} style={{ fontSize: 11, color: '#1d9e75', fontWeight: 600, marginTop: 4 }}>
                              📊 {k}: {v}
                            </div>
                          ))}
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* Add/edit session modal */}
                {editingSession && isAdmin && (
                  <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 }}>
                    <div className="card" style={{ width: '100%', maxWidth: 400 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14 }}>
                        <h2 style={{ fontSize: 15, fontWeight: 600 }}>{sessionForm.id ? 'Edit entry' : 'Quick entry'}</h2>
                        <button onClick={() => setEditingSession(null)} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer' }}>✕</button>
                      </div>
                      <div className="field">
                        <label>Session date</label>
                        <input type="date" value={sessionForm.session_date || ''} onChange={e => setSessionForm(f => ({ ...f, session_date: e.target.value }))} />
                      </div>
                      <div className="field-row">
                        <div className="field"><label>Weight before (kg)</label><input type="number" step="0.1" value={sessionForm.weight_before ?? ''} onChange={e => setSessionForm(f => ({ ...f, weight_before: e.target.value }))} /></div>
                        <div className="field"><label>Weight after (kg)</label><input type="number" step="0.1" value={sessionForm.weight_after ?? ''} onChange={e => setSessionForm(f => ({ ...f, weight_after: e.target.value }))} /></div>
                      </div>
                      <div className="field-row">
                        <div className="field"><label>Height (cm)</label><input type="number" value={sessionForm.height_cm ?? ''} onChange={e => setSessionForm(f => ({ ...f, height_cm: e.target.value }))} /></div>
                        <div className="field"><label>Reach (cm)</label><input type="number" value={sessionForm.reach_cm ?? ''} onChange={e => setSessionForm(f => ({ ...f, reach_cm: e.target.value }))} /></div>
                      </div>
                      <div className="field">
                        <label>Notes</label>
                        <textarea rows={3} value={sessionForm.notes ?? ''} onChange={e => setSessionForm(f => ({ ...f, notes: e.target.value }))} style={{ resize: 'none' }} />
                      </div>
                      <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 10 }}>
                        For running, watt bike, techniques and other training modules, use "+ Full session log" instead.
                      </p>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button className="btn" onClick={() => setEditingSession(null)}>Cancel</button>
                        <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={saveFit2FightSession} disabled={savingSession || !sessionForm.session_date}>
                          {savingSession ? 'Saving…' : 'Save'}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
              )
            })()}

            {/* ── TTP tab ── */}
                        {tab === 'tpt' && (() => {
              const BOXING_GROUPS = [
                { label: '🥊 Technical', colour: '#E24B4A', keys: ['shapes','punch_quality','footwork','defence','counters','attack','combinations','change_of_tempo','use_of_phases','distance','flow','self_expression'] },
                { label: '🧠 Tactical',  colour: '#8B5CF6', keys: ['read_opponent','tempo_rhythm','tactical_intelligence','ring_awareness','know_strengths_weaknesses','heart_grit','concentration','timing'] },
                { label: '💪 Physical',  colour: '#1D9E75', keys: ['foot_speed','limb_speed','combination_speed','reaction','punching_power','strength_upper','strength_lower','stability_core','agility','stop_n_go','stamina_aerobic','stamina_anaerobic','suppleness_upper','suppleness_lower','recovery','health'] },
              ]
              const KB_GROUPS = [
                { label: '📏 Measurements', colour: '#378ADD', keys: [
                  ['weight_kg','Weight (kg)'], ['height_cm','Height (cm)'], ['arm_span_cm','Arm span (cm)'], ['leg_reach_cm','Leg reach (cm)'],
                  ['straight_punches','Straight punches'], ['round_kicks_floor_left','Round kicks floor L'], ['round_kicks_floor_right','Round kicks floor R'],
                  ['round_kicks_air_left','Round kicks air L'], ['round_kicks_air_right','Round kicks air R'],
                ]},
                { label: '❤️ Cardio', colour: '#E24B4A', keys: [
                  ['resting_hr','Resting HR'], ['session_peak_hr','Session peak HR'],
                  ['run_20min_distance','20min run (m)'], ['run_20min_peak_hr','20min run peak HR'],
                  ['bleep_test_level','Bleep test level'], ['bleep_test_peak_hr','Bleep test peak HR'],
                  ['run_200m_1','200m run 1'], ['run_200m_2','200m run 2'], ['run_200m_3','200m run 3'], ['run_200m_4','200m run 4'],
                  ['sprint_peak_hr','Sprint peak HR'], ['run_1600m','1600m run'], ['run_4800m','4800m run'],
                ]},
                { label: '💪 Strength', colour: '#1D9E75', keys: [
                  ['fixed_load_circuit_time','Fixed load circuit'], ['dips','Dips'], ['push_ups','Push ups'], ['pull_ups','Pull ups'],
                  ['full_sit_up','Sit ups'], ['squats','Squats'], ['flat_plank','Flat plank'], ['side_plank_right','Side plank R'], ['side_plank_left','Side plank L'],
                  ['kick_hold_front_left','Kick hold front L'], ['kick_hold_front_right','Kick hold front R'],
                  ['kick_hold_side_left','Kick hold side L'], ['kick_hold_side_right','Kick hold side R'],
                  ['pinch_left','Pinch L'], ['pinch_right','Pinch R'], ['grip_left','Grip L'], ['grip_right','Grip R'],
                ]},
                { label: '🤸 Flexibility & Power', colour: '#EF9F27', keys: [
                  ['hamstring_stretch','Hamstring stretch'], ['box_splits','Box splits'],
                  ['front_splits_left','Front splits L'], ['front_splits_right','Front splits R'],
                  ['shoulder_range_right','Shoulder range R'], ['shoulder_range_left','Shoulder range L'],
                  ['vertical_jump','Vertical jump'], ['long_jump','Long jump'],
                ]},
              ]
              const b = tptData.boxing[0]
              const bPrev = tptData.boxing[1]
              const kb = tptData.kickboxing[0]
              return (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <h3 style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>Technical Tactical Physical (TTP)</h3>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <a href={`/boxing-tpt-form?student_id=${selected?.id}`} className="btn btn-sm" style={{ fontSize: 11 }}>+ Boxing TTP</a>
                    </div>
                  </div>
                  {!b && !kb ? (
                    <div className="empty-state"><p>No TTP data recorded yet.</p></div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

                      {/* Boxing TTP */}
                      {b && <>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <h4 style={{ fontSize: 13, fontWeight: 600, color: '#E24B4A', margin: 0 }}>🥊 Boxing TTP</h4>
                          <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                            {b.assessed_at ? new Date(b.assessed_at).toLocaleDateString('en-GB') : ''}
                          </span>
                        </div>
                        {BOXING_GROUPS.map(group => {
                          const groupTotal = group.keys.reduce((s, k) => s + (b[k] || 0), 0)
                          return (
                          <div key={group.label} className="card" style={{ borderLeft: `3px solid ${group.colour}`, padding: '10px 14px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                              <span style={{ fontSize: 12, fontWeight: 600, color: group.colour }}>{group.label}</span>
                              <span style={{ fontSize: 12, fontWeight: 700, color: group.colour }}>{groupTotal}</span>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 6 }}>
                              {group.keys.map(k => {
                                const plainBox = (val, style = {}) => (
                                  <span style={{
                                    fontWeight: 700, color: val >= 8 ? '#1d9e75' : val >= 5 ? '#EF9F27' : val ? '#E24B4A' : 'var(--text-tertiary)',
                                    background: 'var(--bg-secondary)', borderRadius: 6, padding: '1px 8px', minWidth: 22, textAlign: 'center',
                                    border: 'none', ...style,
                                  }}>{val ?? '—'}</span>
                                )
                                const latestVal = b[k]
                                const prevVal = bPrev?.[k]
                                let trendColour = '#EF9F27', arrow = ''
                                if (prevVal != null && latestVal != null) {
                                  if (latestVal > prevVal) { trendColour = '#1d9e75'; arrow = '▲' }
                                  else if (latestVal < prevVal) { trendColour = '#E24B4A'; arrow = '▼' }
                                }
                                return (
                                  <div key={k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, gap: 4 }}>
                                    <span style={{ color: 'var(--text-secondary)' }}>{BOX_LABELS[k]}</span>
                                    <span style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                                      {ttpBenchmark && plainBox(ttpBenchmark[k], { opacity: 0.7, border: '1px dashed #EF9F27' })}
                                      {bPrev ? plainBox(prevVal, { opacity: 0.5, border: '1px dashed var(--border-strong)' })
                                        : <span style={{ minWidth: 22, textAlign: 'center', color: 'var(--text-tertiary)' }}>—</span>}
                                      <span style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                        {arrow && <span style={{ color: trendColour, fontSize: 10 }}>{arrow}</span>}
                                        {plainBox(latestVal, { color: prevVal != null ? trendColour : undefined })}
                                      </span>
                                    </span>
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                          )
                        })}
                        {(tptData.boxing.length > 0 || ttpBenchmark) && (
                          <p style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: -4, marginBottom: 8 }}>
                            {ttpBenchmark && `Orange dashed = team benchmark (${new Date(ttpBenchmark.set_at).toLocaleDateString('en-GB')}) · `}
                            Grey dashed = previous assessment{bPrev ? ` (${new Date(bPrev.assessed_at).toLocaleDateString('en-GB')})` : ' — shows as a dash until a second assessment exists'}
                            {' · '}Rightmost = latest ({new Date(b.assessed_at).toLocaleDateString('en-GB')}), green ▲ if improved, red ▼ if lower, orange if unchanged
                          </p>
                        )}
                        {b.notes && <div className="card" style={{ fontSize: 12 }}><strong>Notes:</strong> {b.notes}</div>}
                      </>}

                      {/* Kickboxing TTP */}
                      {kb && <>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: b ? 8 : 0 }}>
                          <h4 style={{ fontSize: 13, fontWeight: 600, color: '#378ADD', margin: 0 }}>🥋 Kickboxing TTP</h4>
                          <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                            {kb.assessed_at ? new Date(kb.assessed_at).toLocaleDateString('en-GB') : ''}
                          </span>
                        </div>
                        {KB_GROUPS.map(group => (
                          <div key={group.label} className="card" style={{ borderLeft: `3px solid ${group.colour}`, padding: '10px 14px' }}>
                            <div style={{ fontSize: 12, fontWeight: 600, color: group.colour, marginBottom: 8 }}>{group.label}</div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 6 }}>
                              {group.keys.map(([k, label]) => kb[k] != null && (
                                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                                  <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
                                  <span style={{ fontWeight: 700, background: 'var(--bg-secondary)', borderRadius: 20, padding: '1px 8px' }}>{kb[k]}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                        {kb.notes && <div className="card" style={{ fontSize: 12 }}><strong>Notes:</strong> {kb.notes}</div>}
                      </>}

                    </div>
                  )}
                </div>
              )
            })()}


            {/* ── Media tab ── */}
            {tab === 'media' && (
              <div>
                <div className="card" style={{ marginBottom: 12 }}>
                  <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Media files</h2>
                  <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 14 }}>
                    Upload photos, videos, and documents for this athlete. Files are stored in Supabase Storage.
                  </p>
                  <div style={{ border: '2px dashed var(--border-strong)', borderRadius: 'var(--radius)', padding: '28px 20px', textAlign: 'center', color: 'var(--text-secondary)', marginBottom: 12 }}>
                    <div style={{ fontSize: 28, marginBottom: 8 }}>📁</div>
                    <p style={{ fontSize: 13, marginBottom: 8 }}>Drag files here or click to upload</p>
                    <p style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Photos, videos, PDFs — max 50MB per file</p>
                    <input type="file" multiple accept="image/*,video/*,.pdf" style={{ display: 'none' }} id="file-upload"
                      onChange={async e => {
                        const files = Array.from(e.target.files)
                        for (const file of files) {
                          const path = `athletes/${selected.id}/${Date.now()}-${file.name}`
                          const { data, error } = await supabase.storage.from('athlete-media').upload(path, file)
                          if (!error) {
                            const { data: urlData } = supabase.storage.from('athlete-media').getPublicUrl(path)
                            const existing = apData?.media_files || []
                            const updated = [...existing, { name: file.name, url: urlData.publicUrl, type: file.type, uploaded_at: new Date().toISOString() }]
                            await supabase.from('athlete_profiles').upsert({ student_id: selected.id, media_files: updated }, { onConflict: 'student_id' })
                            setApData(p => ({ ...(p || {}), media_files: updated }))
                          }
                        }
                      }} />
                    <label htmlFor="file-upload" className="btn btn-primary" style={{ display: 'inline-flex', marginTop: 10, cursor: 'pointer' }}>Choose files</label>
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

                <div className="card">
                  <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>Media restriction</h2>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {['Yes', 'No', 'Limited'].map(v => (
                      <button key={v} onClick={async () => {
                        await supabase.from('students').update({ media_restriction: v }).eq('id', selected.id)
                        setSelected(s => ({ ...s, media_restriction: v }))
                      }} style={{
                        padding: '6px 14px', borderRadius: 'var(--radius)', fontSize: 13, cursor: 'pointer',
                        border: `1px solid ${selected.media_restriction === v ? 'var(--text)' : 'var(--border-strong)'}`,
                        background: selected.media_restriction === v ? 'var(--text)' : 'var(--bg)',
                        color: selected.media_restriction === v ? 'var(--bg)' : 'var(--text)',
                        fontFamily: 'var(--font-sans)',
                      }}>{v === 'Yes' ? '✅ Media OK' : v === 'No' ? '🚫 No media' : '⚠️ Limited'}</button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ── Notes tab ── */}
            {tab === 'notes' && (
              <div>
                <div className="card" style={{ marginBottom: 12 }}>
                  <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>Log a note</h2>
                  <textarea value={newNoteText} onChange={e => setNewNoteText(e.target.value)}
                    placeholder="Write a note about this athlete…" rows={3}
                    style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius)', fontSize: 13, background: 'var(--bg-secondary)', color: 'var(--text)', fontFamily: 'var(--font-sans)', resize: 'vertical', marginBottom: 8 }} />
                  <button className="btn btn-primary btn-sm" disabled={!newNoteText.trim() || savingNote} onClick={addNote}>
                    {savingNote ? 'Saving…' : '+ Log note'}
                  </button>
                </div>

                {notesLog.length === 0 ? (
                  <div className="empty-state"><h3>No notes yet</h3><p>Notes logged here can be sent to any PDP category</p></div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {notesLog.map(note => (
                      <div key={note.id} className="card">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                          <div>
                            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 4 }}>
                              {new Date(note.logged_at).toLocaleDateString('en-GB')} · {new Date(note.logged_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                            </div>
                            <p style={{ fontSize: 13, lineHeight: 1.5, margin: 0 }}>{note.note_text}</p>
                          </div>
                          <button onClick={() => deleteNote(note.id)} title="Delete note"
                            style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: 16, flexShrink: 0 }}>×</button>
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                          <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Send to:</span>
                          {Object.keys(NOTE_PDP_TARGETS).map(label => {
                            const sent = (note.sent_to || []).includes(label)
                            return (
                              <button key={label} className="btn btn-sm" disabled={sent}
                                onClick={() => sendNoteToPdpCategory(note, label)}
                                style={{ fontSize: 11, opacity: sent ? 0.5 : 1 }}
                                title={sent ? `Already sent to ${label}` : `Send to ${label}`}>
                                {sent ? `✓ ${label}` : label}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── Report tab ── */}
            {tab === 'report' && (
              <div>
                <div className="card" style={{ marginBottom: 12 }}>
                  <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Generate student report</h2>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--bg-secondary)', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius)', padding: '6px 10px' }}>
                      <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>From</span>
                      <input type="date" value={reportFrom} onChange={e => setReportFrom(e.target.value)}
                        style={{ border: 'none', background: 'transparent', fontSize: 13, color: 'var(--text)', outline: 'none' }} />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--bg-secondary)', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius)', padding: '6px 10px' }}>
                      <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>To</span>
                      <input type="date" value={reportTo} onChange={e => setReportTo(e.target.value)}
                        style={{ border: 'none', background: 'transparent', fontSize: 13, color: 'var(--text)', outline: 'none' }} />
                    </div>
                    <button className="btn btn-primary" onClick={generateReport} disabled={reportLoading}>
                      {reportLoading ? 'Generating…' : 'Generate report'}
                    </button>
                  </div>
                </div>

                {reportData && (
                  <div id="report-content">
                    {/* Report header */}
                    <div className="card" style={{ marginBottom: 12, borderLeft: `3px solid ${colour}`, borderRadius: '0 var(--border-radius-lg) var(--border-radius-lg) 0' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
                        <div style={{ width: 48, height: 48, borderRadius: '50%', background: colour + '22', color: colour, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 700 }}>{initials}</div>
                        <div>
                          <div style={{ fontSize: 17, fontWeight: 600 }}>{m?.first_name} {m?.last_name}</div>
                          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                            {selected.student_ref} · {selected.discipline} · {houseName} · {selected.pka_belt || selected.krba_level}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>
                            Report period: {new Date(reportFrom).toLocaleDateString('en-GB')} – {new Date(reportTo).toLocaleDateString('en-GB')}
                          </div>
                        </div>
                      </div>

                      {/* Summary stats */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                        {[
                          { label: 'Total points', value: reportData.points.total, colour: colour },
                          { label: 'Class champ', value: `🏆 ${reportData.points.champ}x`, colour: '#EF9F27' },
                          { label: 'Sessions', value: reportData.sessions.length, colour: '#378ADD' },
                          { label: 'Weight change', value: reportData.weightChange ? `${reportData.weightChange > 0 ? '+' : ''}${reportData.weightChange}kg` : '—', colour: '#1D9E75' },
                        ].map(s => (
                          <div key={s.label} style={{ background: s.colour + '12', borderRadius: 'var(--radius)', padding: '10px 12px', textAlign: 'center' }}>
                            <div style={{ fontSize: 20, fontWeight: 700, color: s.colour }}>{s.value}</div>
                            <div style={{ fontSize: 10, color: s.colour, marginTop: 2 }}>{s.label}</div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Points breakdown */}
                    {reportData.points.log.length > 0 && (
                      <div className="card" style={{ marginBottom: 12, padding: 0 }}>
                        <div style={{ padding: '12px 14px 10px', fontWeight: 600, fontSize: 13, borderBottom: '1px solid var(--border)' }}>
                          Points log ({reportData.points.log.length} entries)
                        </div>
                        <table>
                          <thead><tr><th>Date</th><th>Type</th><th>Scope</th><th style={{ textAlign: 'right' }}>Pts</th></tr></thead>
                          <tbody>
                            {reportData.points.log.slice(0, 15).map((p, i) => (
                              <tr key={i}>
                                <td style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{new Date(p.awarded_at).toLocaleDateString('en-GB')}</td>
                                <td style={{ fontSize: 13 }}>{p.point_type}</td>
                                <td><span className={`badge ${p.point_scope === 'both' ? 'badge-green' : 'badge-blue'}`} style={{ fontSize: 10 }}>{p.point_scope}</span></td>
                                <td style={{ textAlign: 'right', fontWeight: 700, fontSize: 13, color: p.points_awarded < 0 ? '#a32d2d' : '#1d9e75' }}>
                                  {p.points_awarded > 0 ? '+' : ''}{p.points_awarded}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {reportData.points.log.length > 15 && (
                          <div style={{ padding: '8px 14px', fontSize: 12, color: 'var(--text-tertiary)' }}>
                            +{reportData.points.log.length - 15} more entries
                          </div>
                        )}
                      </div>
                    )}

                    {/* TTP snapshots */}
                    {(reportData.tptKb.length > 0 || reportData.tptBox.length > 0) && (
                      <div className="card" style={{ marginBottom: 12 }}>
                        <h3 style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Latest TTP assessments</h3>
                        {reportData.tptKb[0] && (
                          <div style={{ marginBottom: 10 }}>
                            <div style={{ fontSize: 12, fontWeight: 600, color: '#378ADD', marginBottom: 6 }}>Kickboxing TTP — {new Date(reportData.tptKb[0].assessed_at).toLocaleDateString('en-GB')}</div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                              {[
                                ['Weight', `${reportData.tptKb[0].weight_kg}kg`],
                                ['Punches', reportData.tptKb[0].straight_punches],
                                ['Push-ups', reportData.tptKb[0].push_ups],
                                ['Plank', `${reportData.tptKb[0].flat_plank}s`],
                                ['Bleep test', reportData.tptKb[0].bleep_test_level],
                                ['Vert. jump', `${reportData.tptKb[0].vertical_jump}cm`],
                              ].filter(([, v]) => v !== null && v !== undefined).map(([l, v]) => (
                                <div key={l} style={{ background: 'var(--bg-secondary)', borderRadius: 'var(--radius)', padding: '7px 10px' }}>
                                  <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{l}</div>
                                  <div style={{ fontSize: 14, fontWeight: 600 }}>{v}</div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        {reportData.tptBox[0] && (
                          <div>
                            <div style={{ fontSize: 12, fontWeight: 600, color: '#E24B4A', marginBottom: 6 }}>Boxing TTP — {new Date(reportData.tptBox[0].assessed_at).toLocaleDateString('en-GB')}</div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                              {[['Shape', reportData.tptBox[0].shapes], ['Punch quality', reportData.tptBox[0].punch_quality], ['Footwork', reportData.tptBox[0].footwork], ['Defence', reportData.tptBox[0].defence], ['Heart/grit', reportData.tptBox[0].heart_grit]].map(([l, v]) => (
                                <div key={l} style={{ background: 'var(--bg-secondary)', borderRadius: 'var(--radius)', padding: '7px 10px' }}>
                                  <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{l}</div>
                                  <div style={{ fontSize: 14, fontWeight: 600 }}>{v}/10</div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Competition profile */}
                    {reportData.profile && (
                      <div className="card" style={{ marginBottom: 12 }}>
                        <h3 style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Competition profile</h3>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                          {[
                            ['Kickboxing division', reportData.profile.age_division_kickboxing],
                            ['Weight division', reportData.profile.weight_division],
                            ['Top achievements', reportData.profile.top_achievements],
                            ['Fav. technique', reportData.profile.favourite_technique],
                          ].filter(([, v]) => v).map(([l, v]) => (
                            <div key={l} style={{ padding: '7px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 2 }}>{l}</div>
                              <div style={{ fontWeight: 500 }}>{v}</div>
                            </div>
                          ))}
                        </div>
                        {Array.isArray(reportData.profile.recent_results) && reportData.profile.recent_results.length > 0 && (
                          <div style={{ marginTop: 10 }}>
                            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>Recent results</div>
                            {reportData.profile.recent_results.map((r, i) => (
                              <div key={i} style={{ fontSize: 13, padding: '4px 0', borderBottom: '1px solid var(--border)' }}>🎖 {r}</div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }}
                      onClick={() => window.print()}>
                      🖨️ Print / save as PDF
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
