import { useState, useEffect, useRef } from 'react'
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

function SetInput({ sets, onChange, placeholder = 'e.g. 12.3' }) {
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
            <input value={s} onChange={e => update(i, e.target.value)} placeholder={placeholder}
              style={{ width: 72, padding: '4px 6px', border: '1px solid var(--border-strong)', borderRadius: 6, fontSize: 12, background: 'var(--bg-secondary)', color: 'var(--text)', fontFamily: 'var(--font-sans)' }} />
            <button onClick={() => remove(i)} style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: 14, padding: 0 }}>×</button>
          </div>
        ))}
      </div>
      <button type="button" className="btn btn-sm" onClick={add} style={{ fontSize: 11 }}>+ Add set</button>
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
const RUN_CATEGORY_CARDS = [
  { key: 'Timed Sprints', label: 'Timed Sprints', icon: '⚡' },
  { key: 'Timed Distance Run', label: 'Timed Distance Run', icon: '🏁' },
]
const RUN_PRESET_TESTS = {
  'Timed Sprints': ['30m', '40m', '50m', '100m', '200m', '300m', '400m', '800m'],
  'Timed Distance Run': ['2000m', '1600m', '4800m', '5000m', '10000m', '15000m'],
}
const WATT_BIKE_GROUPS = [
  { key: 'standard', label: 'Standard intervals', icon: '🚴', match: m => !/Output \(wattage\)|Distance \(km\)/i.test(m || '') },
  { key: 'output', label: 'Output intervals', icon: '⚡', match: m => /Output \(wattage\)/i.test(m || '') },
  { key: 'distance', label: 'Distance intervals', icon: '📏', match: m => /Distance \(km\)/i.test(m || '') },
]
const BODYWEIGHT_GROUPS = [
  { key: 'planks', label: 'Planks', icon: '🧘', match: t => /plank/i.test(t || '') },
  { key: 'circuits', label: 'Fixed load circuits', icon: '🔴', match: t => /circuit/i.test(t || '') },
  { key: 'reps', label: 'Reps', icon: '💪', match: t => !/plank|circuit/i.test(t || '') },
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
      higherIsBetter = subType === 'Distance over time'
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

  function cycleType() {
    if (!subTypeOptions.length) return
    const idx = subTypeOptions.indexOf(currentSubType)
    const next = subTypeOptions[(idx + 1) % subTypeOptions.length]
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

  return (
    <div style={{
      display: 'flex', alignItems: 'stretch', width: '100%',
      background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius)',
      overflow: 'hidden', fontFamily: 'var(--font-sans)',
    }}>
      {/* Left: quick-log link to the full form. Wellbeing/Mentality/
          Test/Running/Watt bike/Bodyweight/Stretch flows all have their
          own dedicated card grids on this page, so this zone is skipped
          for them entirely. */}
      {!hideLeftZone && (
        <a href={logHref} title={`Log ${b.label}${currentSubType ? ` — ${currentSubType}` : ''}`} style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', width: 34, flexShrink: 0,
          color: colour, fontSize: 18, fontWeight: 700, textDecoration: 'none', borderRight: '1px solid var(--border)',
        }}>+</a>
      )}

      {/* Middle: for Physical modules, tap opens the same "Log a result"
          section as the button below the card. For Test, tap scrolls to
          its results chart (icon only, no label/sub-type text -- Test
          has its own dedicated card grid below for logging). Other
          modules keep cycling sub-type. */}
      <button onClick={() => isPhysicalModule ? onToggleLog?.(b.key) : b.key === 'test' ? goToChart() : cycleType()} style={{
        flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2,
        padding: '8px 4px', background: 'none', border: 'none', borderRight: isSimplifiedModule ? 'none' : '1px solid var(--border)',
        cursor: (b.key === 'test' || subTypeOptions.length > 1) ? 'pointer' : 'default',
        minWidth: 0,
      }}>
        <span style={{ fontSize: 16 }}>{b.icon}</span>
        {b.key !== 'test' && <span style={{ fontSize: 9, fontWeight: 500, whiteSpace: 'nowrap' }}>{b.label}</span>}
        {b.key !== 'test' && currentSubType && <span style={{ fontSize: 7, color: colour, fontWeight: 600, textAlign: 'center', lineHeight: 1.2 }}>{currentSubType}</span>}
        {!isPhysicalModule && b.key !== 'test' && subTypeOptions.length > 1 && <span style={{ fontSize: 7, color: 'var(--text-tertiary)' }}>tap to cycle</span>}
      </button>

      {/* Right: recent/PB (or last-logged), tap to view results --
          skipped for Wellbeing/Mentality/Test, which have their own
          dedicated card grids below instead. */}
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
    </div>
  )
}

const KB_DIVISIONS  = ['Children', 'Younger Cadet (10-12)', 'Older Cadet (13-15)', 'Junior (16-18)', 'Senior (19-40)', 'Masters (40+)']
const BOX_DIVISIONS = ['Schoolboy', 'Schoolgirl', 'Junior', 'Youth', 'Elite', 'Senior']


// ── PDP Tab Component ──────────────────────────────────────────────────────
const PDP_SECTIONS = [
  { key: 'winning_ways',          label: '🏆 Winning ways',             colour: '#1D9E75', coachOnly: false },
  { key: 'maintain',              label: '✅ Maintain',                  colour: '#378ADD', coachOnly: false },
  { key: 'to_work_on',            label: '🎯 To work on',                colour: '#EF9F27', coachOnly: false },
  { key: 'what_to_do',            label: '📋 What to do',                colour: '#8B5CF6', coachOnly: false },
  { key: 'technical_notes',       label: '⚙️ Technical notes',           colour: '#E24B4A', coachOnly: true  },
  { key: 'tech_maintain',         label: '✅ Technical — maintain',      colour: '#378ADD', coachOnly: true  },
  { key: 'tech_work_on',          label: '🎯 Technical — work on',       colour: '#EF9F27', coachOnly: true  },
  { key: 'tact_maintain',         label: '✅ Tactical — maintain',       colour: '#1D9E75', coachOnly: true  },
  { key: 'tact_work_on',          label: '🎯 Tactical — work on',        colour: '#E24B4A', coachOnly: true  },
  { key: 'psychology_maintain',   label: '🧠 Psychology — maintain',     colour: '#8B5CF6', coachOnly: true  },
  { key: 'psychology_work_on',    label: '🧠 Psychology — work on',      colour: '#7C3AED', coachOnly: true  },
  { key: 'physical_maintain',     label: '💪 Physical — maintain',       colour: '#1D9E75', coachOnly: true  },
  { key: 'physical_work_on',      label: '💪 Physical — work on',        colour: '#059669', coachOnly: true  },
  { key: 'coach_drills',          label: '🥊 Coach drills',              colour: '#E24B4A', coachOnly: true  },
  { key: 'sparring_notes',        label: '🥋 Sparring / partners',       colour: '#854F0B', coachOnly: true  },
  { key: 'notes',                 label: '📝 Coach notes',               colour: '#666',    coachOnly: true  },
  { key: 'athlete_notes',         label: '📝 Your notes',                colour: '#185FA5', coachOnly: false },
]

function PDPTab({ apData, setApData, student, isAdmin }) {
  const [pdpView, setPdpView]       = useState('coach') // 'coach' | 'athlete' | 'split'
  const [editSection, setEditSection] = useState(null)
  const [editItems, setEditItems]   = useState([])
  const [newItem, setNewItem]       = useState('')
  const [saving, setSaving]         = useState(false)
  const [sendModal, setSendModal]   = useState(null)
  const [pdpHistory, setPdpHistory] = useState([]) // for undo
  const [editSectionMeta, setEditSectionMeta] = useState(null) // {key, label, colour}
  const [clipboard, setClipboard] = useState(null)
  const [selectedItems, setSelectedItems] = useState([]) // multi-select indices
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
    return {
      ...base,
      background: sc + '15', color: sc, borderRadius: 20,
      padding: hl ? '6px 14px' : (base.padding || '2px 8px'),
      fontSize: hl ? (base.fontSize || 11) * 2 : (base.fontSize || 11),
      fontWeight: hl ? 700 : (base.fontWeight || 400),
    }
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
          {PDP_SECTIONS.filter(s => !s.coachOnly).map(section => {
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
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
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
          {(() => {
            const allSections = [...PDP_SECTIONS, ...customSections]
            if (pdp.section_order) {
              const ordered = pdp.section_order.map(key => allSections.find(s => s.key === key)).filter(Boolean)
              // Append any custom sections not yet in section_order
              const missing = allSections.filter(s => !pdp.section_order.includes(s.key))
              return [...ordered, ...missing]
            }
            return allSections
          })().map(section => {
            const meta = pdp[`__meta_${section.key}`]
            const sectionLabel = meta?.label || section.label
            const sectionColour = meta?.colour || section.colour
            const items = pdp[section.key] || []
            const isShared = !!(shared[section.key]?.length)
            const isEditing = editSection === section.key

            return (
              <div key={section.key} className="card"
                draggable
                onDragStart={e => e.dataTransfer.setData('pdp-section', section.key)}
                onDragOver={e => { e.preventDefault(); e.currentTarget.style.outline = `2px dashed ${sectionColour}` }}
                onDragLeave={e => { e.currentTarget.style.outline = 'none' }}
                onDrop={e => {
                  e.preventDefault()
                  e.currentTarget.style.outline = 'none'
                  const fromKey = e.dataTransfer.getData('pdp-section')
                  if (!fromKey || fromKey === section.key) return
                  // Reorder section_order array — move fromKey to position of section.key
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
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: isEditing ? 12 : items.length ? 8 : 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <span style={{ cursor: 'grab', color: 'var(--text-tertiary)', fontSize: 16, lineHeight: 1, userSelect: 'none' }}>⋮⋮</span>
                    <h3 style={{ fontSize: 13, fontWeight: 600, color: sectionColour, margin: 0 }}>
                      {sectionLabel}
                      {section.coachOnly && <span style={{ fontSize: 9, color: 'var(--text-tertiary)', marginLeft: 6, fontWeight: 400 }}>coach only</span>}
                      {isShared && !section.coachOnly && <span style={{ fontSize: 9, color: '#1d9e75', marginLeft: 6 }}>✓ shared</span>}
                    </h3>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }} onClick={e => e.stopPropagation()}>
                    {items.length > 0 && (
                      <button className="btn btn-sm" style={{ fontSize: 10, background: '#eaf3de', color: '#3b6d11', border: '1px solid #3b6d1140' }}
                        onClick={() => setSendModal(section.key)}>
                        → Send to athlete
                      </button>
                    )}
                    {!isEditing && (
                      <button className="btn btn-sm" style={{ fontSize: 10 }} onClick={() => duplicateSection(section)} title="Duplicate section">⧉</button>
                    )}
                    <button className="btn btn-sm" style={{ fontSize: 10 }} onClick={() => isEditing ? setEditSection(null) : startEdit(section)}>
                      {isEditing ? 'Cancel' : items.length ? 'Edit' : '+ Add'}
                    </button>
                  </div>
                </div>

                {!isEditing && items.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }} onClick={e => e.stopPropagation()}>
                    {items.map((item, i) => (
                      <span key={i} onClick={() => toggleHighlight(section.key, item)} title="Click to highlight"
                        style={notePillStyle(sectionColour, section.key, item, { border: `1px solid ${section.colour}30`, padding: '4px 10px', fontSize: 12, cursor: 'pointer' })}>{item}</span>
                    ))}
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
                      if (e.key === 'Escape') setSelectedItems([])
                      if ((e.key === 'Backspace' || e.key === 'Delete') && selectedItems.length > 0) {
                        e.preventDefault()
                        setEditItems(prev => prev.filter((_,i) => !selectedItems.includes(i)))
                        setSelectedItems([])
                      }
                    }}>
                    {/* Section title + colour editor */}
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

                    {/* Items with drag, cut, copy */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                      {editItems.map((item, i) => {
                        const col = editSectionMeta?.colour || section.colour
                        const isSel = selectedItems.includes(i)
                        return (
                        <span key={i} draggable
                          onClick={(e) => { if (e.shiftKey) { setSelectedItems(prev => prev.includes(i) ? prev.filter(x=>x!==i) : [...prev,i]) } else { setSelectedItems(prev => prev.includes(i) && prev.length === 1 ? [] : [i]) } }}
                          onDragStart={e => e.dataTransfer.setData('text/plain', i)}
                          onDragOver={e => {
                            e.preventDefault()
                            // Scroll page if near edges during drag
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
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: isSel ? col+'35' : col+'15', color: col, border: `${isSel?2:1}px solid ${col}${isSel?'':'30'}`, borderRadius: 20, padding: '4px 10px', fontSize: 12, cursor: 'grab', userSelect: 'none' }}>
                          <span style={{ fontSize: 10, opacity: 0.5 }}>⠿</span>
                          {item}
                          <button title="Cut (Ctrl+X)" onClick={e => { e.stopPropagation(); const sel = selectedItems.includes(i) ? selectedItems : [i]; setClipboard(sel.map(idx=>editItems[idx])); setEditItems(prev => prev.filter((_,j)=>!sel.includes(j))); setSelectedItems([]) }}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, opacity: 0.6, padding: '0 2px' }}>✂</button>
                          <button title="Copy (Ctrl+C)" onClick={e => { e.stopPropagation(); const sel = selectedItems.includes(i) ? selectedItems : [i]; setClipboard(sel.map(idx=>editItems[idx])); setSelectedItems(sel) }}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, opacity: 0.6, padding: '0 2px' }}>⧉</button>
                          <button onClick={e => { e.stopPropagation(); removeItem(i) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: col, fontSize: 14, lineHeight: 1, padding: 0 }}>×</button>
                        </span>
                        )
                      })}
                      {selectedItems.length > 0 && <p style={{ fontSize: 10, color: 'var(--text-tertiary)', width: '100%', margin: '4px 0' }}>{selectedItems.length} selected · Ctrl+C copy · Ctrl+X cut · Ctrl+V paste · Shift+click multi-select · Esc deselect</p>}
                      {clipboard && (
                        <button onClick={() => { const items = Array.isArray(clipboard) ? clipboard : [clipboard]; setEditItems(prev => [...prev, ...items]) }}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'var(--bg-tertiary)', border: '1px dashed var(--border-strong)', borderRadius: 20, padding: '4px 10px', fontSize: 11, cursor: 'pointer', color: 'var(--text-secondary)', fontFamily: 'var(--font-sans)' }}>
                          {Array.isArray(clipboard) ? `📋 Paste ${clipboard.length} item${clipboard.length>1?'s':''}` : `📋 Paste: "${clipboard?.slice?.(0,20)}${clipboard?.length>20?'…':''}"` }
                        </button>
                      )}
                    </div>

                    {/* Add new item */}
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

                    {/* Save + Undo */}
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="btn btn-primary btn-sm" onClick={saveSection} disabled={saving}>
                        {saving ? 'Saving…' : 'Save'}
                      </button>
                      {pdpHistory.length > 0 && (
                        <button className="btn btn-sm" onClick={async () => {
                          const prev = pdpHistory[pdpHistory.length - 1]
                          await supabase.from('athlete_profiles').upsert({ student_id: student.id, pdp_notes: prev }, { onConflict: 'student_id' })
                          setApData(a => ({ ...a, pdp_notes: prev }))
                          setPdpHistory(h => h.slice(0, -1))
                          setEditSection(null)
                        }}>↩ Undo</button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
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
  const [students, setStudents]     = useState([])
  const [houses, setHouses]         = useState([])
  const [truePointTotals, setTruePointTotals] = useState({})
  const [allAttendance, setAllAttendance] = useState([])
  const [f2fStatsScope, setF2fStatsScope] = useState(0) // cycles through scope options
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
  const [invitingId, setInvitingId] = useState(null)
  const [showQr, setShowQr] = useState(false)

  useEffect(() => { loadStudents() }, [])

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
        selectStudent(found)
        const initialTab = searchParams.get('tab')
        if (initialTab) setTab(initialTab)
      }
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
      .select('student_id, session_date, attendance_type, students(discipline, class_schedule, class_time)')
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
    setSelected(s)
    setTab('home')
    setEditing(false)
    setReportData(null)
    setF2fData([])
    setTptData({ kickboxing: [], boxing: [] })
    setAttendanceData([])
    setSessionPoints([])
    setOpenSession(null)
    // Load F2F sessions
    supabase.from('fit2fight_sessions').select('*').eq('student_id', s.id)
      .order('session_date', { ascending: false })
      .then(({ data }) => setF2fData(data || []))
    // Load TPT data
    supabase.from('tpt_kickboxing').select('*').eq('student_id', s.id)
      .order('assessed_at', { ascending: false }).limit(1)
      .then(({ data }) => setTptData(prev => ({ ...prev, kickboxing: data || [] })))
    supabase.from('tpt_boxing').select('*').eq('student_id', s.id)
      .order('assessed_at', { ascending: false }).limit(1)
      .then(({ data }) => setTptData(prev => ({ ...prev, boxing: data || [] })))
    // Load attendance history + coach points for the Sessions tab
    supabase.from('attendance').select('id, session_date, attendance_type, attended_at, note')
      .eq('student_id', s.id)
      .order('session_date', { ascending: false })
      .then(({ data, error }) => { if (!error) setAttendanceData(data || []) })
    supabase.from('points_log').select('id, point_type, points_awarded, point_scope, note, awarded_at')
      .eq('student_id', s.id)
      .order('awarded_at', { ascending: false })
      .then(({ data, error }) => { if (!error) setSessionPoints(data || []) })
    const { data } = await supabase
      .from('athlete_profiles')
      .select('*, pdp_notes, pdp_shared')
      .eq('student_id', s.id)
      .single()
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
    setEditingSession(null)
    setSavingSession(false)
  }

  async function deleteFit2FightSession(session) {
    if (!confirm(`Delete the ${new Date(session.session_date).toLocaleDateString('en-GB')} entry? This can't be undone.`)) return
    const { error } = await supabase.from('fit2fight_sessions').delete().eq('id', session.id)
    if (error) { alert('Error deleting: ' + error.message); return }
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

  async function generateReport() {
    if (!selected) return
    setReportLoading(true)

    const [{ data: pts }, { data: sessions }, { data: tptKb }, { data: tptBox }] = await Promise.all([
      supabase.from('points_log')
        .select('point_type, points_awarded, point_scope, awarded_at')
        .eq('student_id', selected.id)
        .gte('awarded_at', reportFrom)
        .lte('awarded_at', reportTo + 'T23:59:59')
        .order('awarded_at', { ascending: false }),

      supabase.from('fit2fight_sessions')
        .select('session_date, weight_before, weight_after, running, watt_bike, bodyweight')
        .eq('student_id', selected.id)
        .gte('session_date', reportFrom)
        .lte('session_date', reportTo)
        .order('session_date', { ascending: false }),

      supabase.from('tpt_kickboxing')
        .select('assessed_at, weight_kg, straight_punches, push_ups, flat_plank, bleep_test_level, vertical_jump')
        .eq('student_id', selected.id)
        .order('assessed_at', { ascending: false })
        .limit(5),

      supabase.from('tpt_boxing')
        .select('assessed_at, shapes, punch_quality, footwork, defence, heart_grit')
        .eq('student_id', selected.id)
        .order('assessed_at', { ascending: false })
        .limit(5),
    ])

    const totalPts = (pts || []).reduce((s, p) => s + (p.points_awarded || 0), 0)
    const champCount = (pts || []).filter(p => p.point_type === 'Class Champ').length
    const firstWeight = sessions?.find(s => s.weight_before)?.weight_before
    const lastWeight  = [...(sessions || [])].reverse().find(s => s.weight_after)?.weight_after

    setReportData({
      student: selected,
      period: { from: reportFrom, to: reportTo },
      points: { total: totalPts, champ: champCount, log: pts || [] },
      sessions: sessions || [],
      tptKb: tptKb || [],
      tptBox: tptBox || [],
      weightChange: firstWeight && lastWeight ? (parseFloat(lastWeight) - parseFloat(firstWeight)).toFixed(2) : null,
      profile: apData,
    })
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
    <div style={{ display: 'flex', gap: 16, minHeight: 600 }}>

      {/* ── Left: student list ── */}
      {!selected && (
      <div style={{ width: 220, flexShrink: 0 }}>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search athletes…"
          style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius)', fontSize: 12, background: 'var(--bg-secondary)', color: 'var(--text)', marginBottom: 8 }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 560, overflowY: 'auto' }}>
          {filtered.map(s => {
            const col = HOUSE_COLOURS[s.members?.houses?.name] || '#888'
            const isSelected = selected?.id === s.id
            return (
              <div key={s.id} onClick={() => selectStudent(s)} style={{
                padding: '9px 10px', borderRadius: 'var(--radius)', cursor: 'pointer',
                background: isSelected ? col + '18' : 'var(--bg)',
                border: `1px solid ${isSelected ? col : 'var(--border)'}`,
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <div style={{ width: 28, height: 28, borderRadius: '50%', background: col + '22', color: col, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, flexShrink: 0 }}>
                  {(s.members?.first_name?.[0] || '') + (s.members?.last_name?.[0] || '')}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {s.members?.first_name} {s.members?.last_name}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{s.student_ref}</div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
      )}

      {/* ── Right: profile detail ── */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {!selected ? (
          <div className="empty-state" style={{ paddingTop: 80 }}>
            <h3>Select an athlete</h3>
            <p>Choose an athlete from the list to view their profile</p>
          </div>
        ) : (
          <div style={{ maxWidth: 640, margin: '0 auto' }}>
            <button className="btn btn-sm" onClick={() => navigate(-1)} style={{ marginBottom: 10 }}>← Back</button>

            {/* Athlete header */}
            <div className="card" style={{ marginBottom: 12, borderLeft: `3px solid ${colour}`, borderRadius: '0 var(--border-radius-lg) var(--border-radius-lg) 0' }}>
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
                    <div style={{ fontSize: 21, fontWeight: 600 }}>{m?.first_name} {m?.last_name}</div>
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
                {apData?.show_on_website && (
                  <span className="badge badge-green" style={{ fontSize: 10, alignSelf: 'flex-start' }}>🌐 On website</span>
                )}
              </div>

              {/* Actions row -- moved below the name/house details so it fits better on mobile */}
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                {isAdmin && m?.status !== 'stopped' && (() => {
                  const hasRealEmail = m?.email && !m.email.includes('@kr-centre.placeholder')
                  return (
                    <>
                      <button className="btn btn-sm" onClick={() => inviteStudent(selected, 'email')} disabled={invitingId === selected.id}
                        title={hasRealEmail ? `Email invite to ${m.email}` : 'No real email on file'}
                        style={!hasRealEmail ? { opacity: 0.4 } : undefined}>
                        {invitingId === selected.id ? '…' : '✉️ Email invite'}
                      </button>
                      <button className="btn btn-sm" onClick={() => inviteStudent(selected, 'sms')} disabled={invitingId === selected.id}
                        title={m?.phone ? `SMS invite to ${m.phone}` : 'No phone on file'}
                        style={!m?.phone ? { opacity: 0.4 } : undefined}>
                        📱 SMS invite
                      </button>
                      <button className="btn btn-sm" onClick={() => copyInviteLink(selected)}
                        title="Copy the invite message to share any way you like">
                        📋 Copy link
                      </button>
                      <button className="btn btn-sm" onClick={() => setShowQr(true)}
                        title="Show a QR code for this athlete's invite link">
                        ▦ QR code
                      </button>
                    </>
                  )
                })()}
                {isAdmin && !editing && (
                  <button className="btn btn-sm" onClick={() => setEditing(true)}>Edit profile</button>
                )}
                {isAdmin && (
                  <button className="btn btn-sm" onClick={() => setTab('membership')} style={{ marginLeft: 'auto' }}>Membership</button>
                )}
              </div>
            </div>

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

            {/* Tabs */}
            <div className="hide-scrollbar" style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: 14, overflowX: 'auto' }}>
              {['home', 'sessions', 'pdp', 'fit2fight', 'tpt', 'media', 'report'].map(t => (
                <button key={t} onClick={() => setTab(t)} style={{
                  padding: '8px 16px', fontSize: 13, border: 'none', background: 'none', cursor: 'pointer',
                  borderBottom: `2px solid ${tab === t ? 'var(--text)' : 'transparent'}`,
                  color: tab === t ? 'var(--text)' : 'var(--text-secondary)',
                  fontWeight: tab === t ? 500 : 400, textTransform: 'capitalize', whiteSpace: 'nowrap', flexShrink: 0,
                }}>{t}</button>
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
                    <div className="card" style={{ textAlign: 'center', padding: '10px 4px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
                      <button onClick={() => setF2fStatsScope(v => v - 1)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: 'var(--text-tertiary)', padding: 4 }}>◀</button>
                      <div style={{ flex: 1, cursor: 'pointer' }} onClick={() => setTab('sessions')} title="View sessions">
                        <div style={{ fontSize: 20, marginBottom: 2 }}>✅</div>
                        <div style={{ fontSize: 19, fontWeight: 700, color: colour }}>{attendanceData.length}/{possibleSessions || attendanceData.length}</div>
                        <div style={{ fontSize: 9, color: 'var(--text-secondary)' }}>{scopeLabel}</div>
                      </div>
                      <button onClick={() => setF2fStatsScope(v => v + 1)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: 'var(--text-tertiary)', padding: 4 }}>▶</button>
                    </div>
                    <button onClick={() => setTab('fit2fight')} className="card" style={{ textAlign: 'center', padding: '12px 8px', cursor: 'pointer', width: '100%', fontFamily: 'var(--font-sans)', background: 'var(--bg)', appearance: 'none', WebkitAppearance: 'none' }} title="View Fit II Fight results">
                      <div style={{ fontSize: 22, marginBottom: 4 }}>📈</div>
                      <div style={{ fontSize: 22, fontWeight: 700, color: '#378ADD' }}>{f2fData.length}</div>
                      <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>F2F sessions</div>
                    </button>
                    <button onClick={() => setTab('pdp')} className="card" style={{ textAlign: 'center', padding: '12px 8px', cursor: 'pointer', width: '100%', fontFamily: 'var(--font-sans)', background: 'var(--bg)', appearance: 'none', WebkitAppearance: 'none' }} title="View PDP">
                      <div style={{ fontSize: 22, marginBottom: 4 }}>🎯</div>
                      <div style={{ fontSize: 22, fontWeight: 700, color: '#EF9F27' }}>
                        {Object.entries(apData?.pdp_notes || {}).filter(([k]) => !k.startsWith('__')).reduce((sum, [, v]) => sum + (Array.isArray(v) ? v.length : 0), 0)}
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
                  <>
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
                    return (
                      <div ref={runPanelRef} className="card" style={{ marginBottom: 8 }}>
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
                        </div>
                        <div className="field" style={{ marginBottom: 0 }}><label>Results</label>
                          <SetInput sets={entry.sets || []} onChange={sets => upsert({ ...entry, sets })} placeholder="e.g. 12.3" />
                        </div>
                        {savingPhysical && <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 8 }}>Saving…</p>}
                      </div>
                    )
                  })()}
                  </>
                  )}

                  {showWattCards && (
                  <>
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
                    const groupModes = intervalModes.filter(m => grp.match(m))
                    const entry = todaysWattBike.find(e => grp.match(e.interval_mode || e.type)) || { interval_mode: '', sets: [] }
                    const upsert = updatedEntry => savePhysicalField('watt_bike', [...todaysWattBike.filter(e => !grp.match(e.interval_mode || e.type)), updatedEntry], setTodaysWattBike)
                    return (
                      <div ref={wattPanelRef} className="card" style={{ marginBottom: 8 }}>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
                          <button type="button" className="btn btn-sm" style={{ fontSize: 11 }}
                            onClick={() => savePhysicalField('watt_bike', todaysWattBike.filter(e => !grp.match(e.interval_mode || e.type)), setTodaysWattBike)}>✕ Clear</button>
                        </div>
                        <div className="field"><label>Interval</label>
                          <select value={entry.interval_mode || ''} onChange={e => upsert({ ...entry, interval_mode: e.target.value })}>
                            <option value="">Select…</option>
                            {groupModes.map(m => <option key={m}>{m}</option>)}
                          </select>
                        </div>
                        <div className="field" style={{ marginBottom: 0 }}><label>Result</label>
                          <input defaultValue={entry.sets?.[0]?.wattage || ''}
                            onBlur={e => upsert({ ...entry, sets: [{ wattage: e.target.value }] })}
                            placeholder="e.g. 650" />
                        </div>
                        {savingPhysical && <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 8 }}>Saving…</p>}
                      </div>
                    )
                  })()}
                  </>
                  )}

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                    <ModuleButton b={modules[2]} sorted={sorted} moduleSubType={moduleSubType} setModuleSubType={setModuleSubType} colour={colour} setTab={setTab} setRunChartFilter={setRunChartFilter} studentId={selected?.id} onToggleLog={togglePhysicalLog} />
                    <ModuleButton b={modules[3]} sorted={sorted} moduleSubType={moduleSubType} setModuleSubType={setModuleSubType} colour={colour} setTab={setTab} setRunChartFilter={setRunChartFilter} studentId={selected?.id} onToggleLog={togglePhysicalLog} />
                  </div>
                  {showBodyweightCards && (
                  <>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: expandedHomeBodyweight ? 10 : 8 }}>
                    {BODYWEIGHT_GROUPS.map(grp => {
                      const complete = todaysBodyweight.some(e => grp.match(e.type))
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
                    const groupTypes = bodyweightTypeOptions.filter(t => grp.match(t))
                    const entry = todaysBodyweight.find(e => grp.match(e.type)) || { type: '', sets: [] }
                    const upsert = updatedEntry => savePhysicalField('bodyweight', [...todaysBodyweight.filter(e => !grp.match(e.type)), updatedEntry], setTodaysBodyweight)
                    return (
                      <div ref={bodyweightPanelRef} className="card" style={{ marginBottom: 8 }}>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
                          <button type="button" className="btn btn-sm" style={{ fontSize: 11 }}
                            onClick={() => savePhysicalField('bodyweight', todaysBodyweight.filter(e => !grp.match(e.type)), setTodaysBodyweight)}>✕ Clear</button>
                        </div>
                        <div className="field"><label>Exercise</label>
                          <select value={entry.type || ''} onChange={e => upsert({ ...entry, type: e.target.value })}>
                            <option value="">Select…</option>
                            {groupTypes.map(t => <option key={t}>{t}</option>)}
                          </select>
                        </div>
                        <div className="field" style={{ marginBottom: 0 }}><label>Result</label>
                          <input defaultValue={entry.sets?.[0] || ''}
                            onBlur={e => upsert({ ...entry, sets: [e.target.value] })}
                            placeholder="e.g. 20 reps or 1:30" />
                        </div>
                        {savingPhysical && <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 8 }}>Saving…</p>}
                      </div>
                    )
                  })()}
                  </>
                  )}

                  {showStretchCards && (
                  <>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: expandedHomeStretch ? 10 : 8 }}>
                    {[0,1,2].map(i => {
                      const complete = !!todaysStretches[i]
                      const active = expandedHomeStretch === i
                      return (
                        <button key={i} type="button" onClick={() => openOnlyPhysicalPanel('stretch', active ? null : i)} style={{
                          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '10px 6px',
                          borderRadius: 'var(--radius)', cursor: 'pointer', fontFamily: 'var(--font-sans)',
                          border: `2px solid ${active ? colour : complete ? '#EF9F27' : 'var(--border)'}`,
                          background: complete ? '#EF9F2712' : 'var(--bg-secondary)',
                        }}>
                          <span style={{ fontSize: 16 }}>🤸</span>
                          <span style={{ fontSize: 9, fontWeight: 500, color: 'var(--text)', textAlign: 'center', lineHeight: 1.2 }}>Stretch flow {i+1}</span>
                        </button>
                      )
                    })}
                  </div>
                  {expandedHomeStretch != null && (
                    <div ref={stretchPanelRef} className="card" style={{ marginBottom: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
                        <button type="button" className="btn btn-sm" style={{ fontSize: 11 }}
                          onClick={() => { const next = [...todaysStretches]; next[expandedHomeStretch] = ''; savePhysicalField('stretch_flows', next, setTodaysStretches) }}>✕ Clear</button>
                      </div>
                      <div className="field" style={{ marginBottom: 0 }}><label>Stretch performed</label>
                        <select value={todaysStretches[expandedHomeStretch] || ''}
                          onChange={e => { const next = [...todaysStretches]; next[expandedHomeStretch] = e.target.value; savePhysicalField('stretch_flows', next, setTodaysStretches) }}>
                          <option value="">Select…</option>
                          {stretchOptionsList.map(s => <option key={s}>{s}</option>)}
                        </select>
                      </div>
                      {savingPhysical && <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 8 }}>Saving…</p>}
                    </div>
                  )}
                  </>
                  )}
                  </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 8 }}>
                    <ModuleButton b={modules[4]} sorted={sorted} moduleSubType={moduleSubType} setModuleSubType={setModuleSubType} colour={colour} setTab={setTab} setRunChartFilter={setRunChartFilter} studentId={selected?.id} />
                  </div>

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
                        {cat.tests.map(t => (
                          <div className="field" key={t.name}><label>{t.name}{t.unit ? ` (${t.unit})` : ''}</label>
                            <input type="text" inputMode="decimal" defaultValue={todaysTest[t.name] ?? ''}
                              onBlur={e => saveTestValue(t.name, e.target.value)}
                              placeholder={`e.g. ${t.unit === 'sec' ? '32:15' : t.unit === 'level' ? '11.4' : '25'}`} />
                          </div>
                        ))}
                        {savingTest && <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>Saving…</p>}
                      </div>
                    )
                  })()}

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 8 }}>
                    {modules2.slice(0, -1).map(b => (
                      <ModuleButton key={b.key} b={b} sorted={sorted} moduleSubType={moduleSubType} setModuleSubType={setModuleSubType} colour={colour} setTab={setTab} setRunChartFilter={setRunChartFilter} studentId={selected?.id} />
                    ))}
                  </div>

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

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 8 }}>
                    <ModuleButton b={modules2[modules2.length - 1]} sorted={sorted} moduleSubType={moduleSubType} setModuleSubType={setModuleSubType} colour={colour} setTab={setTab} setRunChartFilter={setRunChartFilter} studentId={selected?.id} />
                  </div>

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

                  <div style={{ height: 4 }} />

                  <div className="card" style={{ padding: 0, marginBottom: 14 }}>
                    <div style={{ padding: '10px 14px', fontWeight: 600, fontSize: 13, borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between' }}>
                      <span>Profile</span>
                      {isAdmin && <span style={{ fontSize: 10, color: 'var(--text-tertiary)', fontWeight: 400 }}>Tap a field to edit</span>}
                    </div>
                    {[
                      { label: 'Discipline', editable: true, render: () => {
                        const codeDisplay = selected.discipline_codes || selected.discipline || '—'
                        return isAdmin ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
                            {selected.discipline_codes && <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{selected.discipline_codes}</span>}
                            <select value={selected.discipline || ''} onChange={e => updateSelectedField('discipline', e.target.value)}
                              style={{ fontSize: 12, padding: '4px 6px', border: '1px solid var(--border-strong)', borderRadius: 6, background: 'var(--bg-secondary)', color: 'var(--text)' }}>
                              <option value="PKA">PKA</option>
                              <option value="KRBA">KRBA</option>
                            </select>
                          </div>
                        ) : codeDisplay
                      } },
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
                      { label: 'Weight', editable: true, render: () => isAdmin ? (
                        <input type="number" step="0.1" defaultValue={selected.weight_kg || ''} placeholder="kg"
                          onBlur={e => { const v = e.target.value ? parseFloat(e.target.value) : null; if (v !== selected.weight_kg) updateSelectedField('weight_kg', v) }}
                          style={{ width: 70, fontSize: 12, padding: '4px 6px', textAlign: 'right', border: '1px solid var(--border-strong)', borderRadius: 6, background: 'var(--bg-secondary)', color: 'var(--text)' }} />
                      ) : (selected.weight_kg ? `${selected.weight_kg}kg${selected.weight_category ? ` (${selected.weight_category})` : ''}` : '—') },
                      { label: 'Comp weight', editable: true, render: () => isAdmin ? (
                        <input defaultValue={apData?.weight_division || ''} placeholder="e.g. -60kg"
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

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 8, marginBottom: 14 }}>
                    {[
                      { label: 'PDP', icon: '🎯', colour: '#1D9E75', tab: 'pdp' },
                      { label: 'TPT', icon: '📊', colour: '#E24B4A', tab: 'tpt' },
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
                  <div className="card">
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
                      const allTrainingDays = new Set(
                        (allAttendance || [])
                          .map(a => a?.session_date)
                          .filter(d => d && new Date(d).getFullYear() === year && new Date(d).getMonth() === month)
                      )
                      const attendedDays = new Set(
                        attendanceData
                          .map(a => a.session_date)
                          .filter(d => d && new Date(d).getFullYear() === year && new Date(d).getMonth() === month)
                      )
                      const cells = []
                      for (let i = 0; i < startWeekday; i++) cells.push(null)
                      for (let d = 1; d <= daysInMonth; d++) cells.push(d)
                      return (
                        <>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                            <button className="btn btn-sm" onClick={() => setSessionsCalMonth(m => m.month === 0 ? { year: m.year - 1, month: 11 } : { year: m.year, month: m.month - 1 })}>←</button>
                            <span style={{ fontSize: 13, fontWeight: 600 }}>{new Date(year, month, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</span>
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
                              const wasTrainingDay = allTrainingDays.has(dateStr)
                              const bg = attended ? '#1D9E75' : wasTrainingDay ? '#E24B4A' : 'transparent'
                              const fg = attended || wasTrainingDay ? '#fff' : 'var(--text-secondary)'
                              return (
                                <div key={i} title={attended ? 'Attended' : wasTrainingDay ? 'Missed' : ''} style={{
                                  aspectRatio: '1', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  borderRadius: 6, fontSize: 12, background: bg, color: fg,
                                  border: !attended && !wasTrainingDay ? '1px solid var(--border)' : 'none',
                                }}>{d}</div>
                              )
                            })}
                          </div>
                          <div style={{ display: 'flex', gap: 14, marginTop: 12, fontSize: 11, color: 'var(--text-secondary)' }}>
                            <span><span style={{ display: 'inline-block', width: 8, height: 8, background: '#1D9E75', borderRadius: 2, marginRight: 4 }} />Attended</span>
                            <span><span style={{ display: 'inline-block', width: 8, height: 8, background: '#E24B4A', borderRadius: 2, marginRight: 4 }} />Missed</span>
                          </div>
                        </>
                      )
                    })()}
                  </div>

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
                .map(e => ({ session_date: s.session_date, watt_bike: e })))
              const runData = sorted.flatMap(s => toEntries(s.running)
                .filter(e => Array.isArray(e.sets) && e.sets.length > 0)
                .map(e => ({ session_date: s.session_date, running: e })))

              // SVG line chart helper
              function LineChart({ data, lines, height=160, title, unit='' }) {
                const [hidden, setHidden] = useState({})
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
                    <div style={{ overflowX: 'auto' }}>
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
                                <circle cx={x(i)} cy={y(d[line.key])} r="4" fill={line.colour} stroke="var(--bg)" strokeWidth="1.5"/>
                                <title>{new Date(d.session_date).toLocaleDateString('en-GB')}: {d[line.key]}{unit}</title>
                              </g>
                            ))}
                          </g>
                        })}
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
                      data={weightData.map(s => ({ session_date: s.session_date, before: s.weight_before, after: s.weight_after }))}
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
                    const obj = { session_date: s.session_date }
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
                    const obj = { session_date: s.session_date }
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
                      return { session_date: s.session_date, level: entry ? parseFloat(entry[1]) : null }
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
                      return { session_date: s.session_date, value: entry ? parseFloat(entry[1]) : null }
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
                    .map(e => ({ session_date: s.session_date, bodyweight: e })))
                  const bwTypes = [...new Set(bwData.map(s => s.bodyweight?.type).filter(Boolean))]
                  const filteredBw = bwChartFilter === 'all' ? bwData : bwData.filter(s => s.bodyweight?.type === bwChartFilter)
                  const maxSets = Math.max(1, ...filteredBw.map(s => s.bodyweight?.sets?.length || 0))
                  const SET_COLOURS = ['#1D9E75','#378ADD','#E24B4A','#EF9F27','#8B5CF6','#EC4899']
                  const setLines = Array.from({length: maxSets}, (_,i) => ({ key: `set${i}`, label: `Set ${i+1}`, colour: SET_COLOURS[i % SET_COLOURS.length] }))
                  const chartData = filteredBw.map(s => {
                    const obj = { session_date: s.session_date }
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
                    const obj = { session_date: s.session_date }
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
                        <div key={i} className="card" style={{ borderLeft: '3px solid #378ADD' }}>
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

            {/* ── TPT tab ── */}
                        {tab === 'tpt' && (() => {
              const BOXING_GROUPS = [
                { label: '🥊 Technical', colour: '#E24B4A', keys: ['shapes','punch_quality','footwork','defence','counters','attack','combinations','change_of_tempo','use_of_phases','distance','flow','self_expression'] },
                { label: '⚡ Speed',     colour: '#EF9F27', keys: ['foot_speed','limb_speed','combination_speed','reaction'] },
                { label: '💪 Physical',  colour: '#1D9E75', keys: ['punching_power','strength_upper','strength_lower','stability_core','agility','stop_n_go','stamina_aerobic','stamina_anaerobic','suppleness_upper','suppleness_lower','recovery','health'] },
                { label: '🧠 Tactical',  colour: '#8B5CF6', keys: ['read_opponent','tempo_rhythm','tactical_intelligence','ring_awareness','know_strengths_weaknesses','heart_grit','concentration','timing'] },
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
              const b = tptData.boxing[0]
              const kb = tptData.kickboxing[0]
              return (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <h3 style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>Technical Performance Tracker</h3>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <a href={`/boxing-tpt-form?student_id=${selected?.id}`} className="btn btn-sm" style={{ fontSize: 11 }}>+ Boxing TPT</a>
                    </div>
                  </div>
                  {!b && !kb ? (
                    <div className="empty-state"><p>No TPT data recorded yet.</p></div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

                      {/* Boxing TPT */}
                      {b && <>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <h4 style={{ fontSize: 13, fontWeight: 600, color: '#E24B4A', margin: 0 }}>🥊 Boxing TPT</h4>
                          <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                            {b.assessed_at ? new Date(b.assessed_at).toLocaleDateString('en-GB') : ''}
                          </span>
                        </div>
                        {BOXING_GROUPS.map(group => (
                          <div key={group.label} className="card" style={{ borderLeft: `3px solid ${group.colour}`, padding: '10px 14px' }}>
                            <div style={{ fontSize: 12, fontWeight: 600, color: group.colour, marginBottom: 8 }}>{group.label}</div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 6 }}>
                              {group.keys.map(k => (
                                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                                  <span style={{ color: 'var(--text-secondary)' }}>{BOX_LABELS[k]}</span>
                                  <span style={{ fontWeight: 700, color: b[k] >= 8 ? '#1d9e75' : b[k] >= 5 ? '#EF9F27' : b[k] ? '#E24B4A' : 'var(--text-tertiary)', background: 'var(--bg-secondary)', borderRadius: 20, padding: '1px 8px' }}>
                                    {b[k] ?? '—'}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                        {b.notes && <div className="card" style={{ fontSize: 12 }}><strong>Notes:</strong> {b.notes}</div>}
                      </>}

                      {/* Kickboxing TPT */}
                      {kb && <>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: b ? 8 : 0 }}>
                          <h4 style={{ fontSize: 13, fontWeight: 600, color: '#378ADD', margin: 0 }}>🥋 Kickboxing TPT</h4>
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

                    {/* TPT snapshots */}
                    {(reportData.tptKb.length > 0 || reportData.tptBox.length > 0) && (
                      <div className="card" style={{ marginBottom: 12 }}>
                        <h3 style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Latest TPT assessments</h3>
                        {reportData.tptKb[0] && (
                          <div style={{ marginBottom: 10 }}>
                            <div style={{ fontSize: 12, fontWeight: 600, color: '#378ADD', marginBottom: 6 }}>Kickboxing TPT — {new Date(reportData.tptKb[0].assessed_at).toLocaleDateString('en-GB')}</div>
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
                            <div style={{ fontSize: 12, fontWeight: 600, color: '#E24B4A', marginBottom: 6 }}>Boxing TPT — {new Date(reportData.tptBox[0].assessed_at).toLocaleDateString('en-GB')}</div>
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
