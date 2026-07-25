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
// results charts already use, so nothing already recorded is affected.
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
      entries = filtered.map(s => ({ date: s.session_date, value: numSets(s.techniques?.sets).length ? Math.max(...numSets(s.techniques?.sets)) : null })).filter(e => e.value != null)
    }
    const mostRecent = entries[entries.length - 1] || null
    const pb = entries.reduce((best, e) => !best ? e : ((higherIsBetter ? e.value > best.value : e.value < best.value) ? e : best), null)
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
function ModuleButton({ b, sorted, moduleSubType, setModuleSubType, colour, setTab, studentId, onToggleLog }) {
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
          section as the button below the card. For Test, tap switches to
          results (icon only, no label/sub-type text -- Test has its own
          dedicated card grid below for logging). Other modules keep
          cycling sub-type. */}
      <button onClick={() => isPhysicalModule ? onToggleLog?.(b.key) : b.key === 'test' ? setTab('fit2fight') : cycleType()} style={{
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
  const { profile } = useAuth()
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
  const [points, setPoints]     = useState([])
  const [sessions, setSessions] = useState([])
  const [attendanceData, setAttendanceData] = useState([])
  const [allAttendance, setAllAttendance] = useState([])
  const [f2fStatsScope, setF2fStatsScope] = useState(0)
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
  const physicalSectionRef = useRef(null)
  const runPanelRef = useRef(null)
  const wattPanelRef = useRef(null)
  const bodyweightPanelRef = useRef(null)
  const stretchPanelRef = useRef(null)
  const [showRunCards, setShowRunCards] = useState(false)
  const [showWattCards, setShowWattCards] = useState(false)
  const [showBodyweightCards, setShowBodyweightCards] = useState(false)
  const [showStretchCards, setShowStretchCards] = useState(false)
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
    ['pdp',       '🎯 My PDP'],
    ['analysis',  '📊 Analysis'],
    ['fit2fight', '💪 Fit II Fight'],
    ['points',    '⭐ Points'],
    ['search',    '🔍 Find athlete'],
  ]

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: '20px 16px', minHeight: '100vh' }}>

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
                  const setters = { running: setShowRunCards, watt_bike: setShowWattCards, bodyweight: setShowBodyweightCards, stretch: setShowStretchCards }
                  setters[key]?.(v => !v)
                }

                return (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 8 }}>
                      <div className="card" style={{ textAlign: 'center', padding: '10px 4px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
                        <button onClick={() => setF2fStatsScope(v => v - 1)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: 'var(--text-tertiary)', padding: 4 }}>◀</button>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 20, marginBottom: 2 }}>✅</div>
                          <div style={{ fontSize: 19, fontWeight: 700, color: colour }}>{attendanceData.length}/{possibleSessions || attendanceData.length}</div>
                          <div style={{ fontSize: 9, color: 'var(--text-secondary)' }}>{scopeLabel}</div>
                        </div>
                        <button onClick={() => setF2fStatsScope(v => v + 1)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: 'var(--text-tertiary)', padding: 4 }}>▶</button>
                      </div>
                      <button onClick={() => setTab('fit2fight')} className="card" style={{ textAlign: 'center', padding: '12px 8px', cursor: 'pointer', width: '100%', fontFamily: 'var(--font-sans)', background: 'var(--bg)', appearance: 'none', WebkitAppearance: 'none' }}>
                        <div style={{ fontSize: 22, marginBottom: 4 }}>📈</div>
                        <div style={{ fontSize: 22, fontWeight: 700, color: '#378ADD' }}>{sessions.length}</div>
                        <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>F2F sessions</div>
                      </button>
                      <button onClick={() => setTab('pdp')} className="card" style={{ textAlign: 'center', padding: '12px 8px', cursor: 'pointer', width: '100%', fontFamily: 'var(--font-sans)', background: 'var(--bg)', appearance: 'none', WebkitAppearance: 'none' }}>
                        <div style={{ fontSize: 22, marginBottom: 4 }}>🎯</div>
                        <div style={{ fontSize: 22, fontWeight: 700, color: '#EF9F27' }}>
                          {Object.entries(apData?.pdp_notes || {}).filter(([k]) => !k.startsWith('__')).reduce((sum, [, v]) => sum + (Array.isArray(v) ? v.length : 0), 0)}
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>PDP</div>
                      </button>
                    </div>

                    <div ref={physicalSectionRef}>
                    <button type="button" onClick={() => setShowPhysicalSection(v => !v)} style={{
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
                      <ModuleButton b={modules[0]} sorted={sorted} moduleSubType={moduleSubType} setModuleSubType={setModuleSubType} colour={colour} setTab={setTab} studentId={student.id} onToggleLog={togglePhysicalLog} />
                      <ModuleButton b={modules[1]} sorted={sorted} moduleSubType={moduleSubType} setModuleSubType={setModuleSubType} colour={colour} setTab={setTab} studentId={student.id} onToggleLog={togglePhysicalLog} />
                    </div>
                    {showRunCards && (
                    <>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: expandedHomeRun ? 10 : 8 }}>
                      {RUN_CATEGORY_CARDS.map(cat => {
                        const complete = todaysRunning.some(e => e.category === cat.key)
                        const active = expandedHomeRun === cat.key
                        return (
                          <button key={cat.key} type="button" onClick={() => setExpandedHomeRun(active ? null : cat.key)} style={{
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
                          <button key={grp.key} type="button" onClick={() => setExpandedHomeWatt(active ? null : grp.key)} style={{
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
                      <ModuleButton b={modules[2]} sorted={sorted} moduleSubType={moduleSubType} setModuleSubType={setModuleSubType} colour={colour} setTab={setTab} studentId={student.id} onToggleLog={togglePhysicalLog} />
                      <ModuleButton b={modules[3]} sorted={sorted} moduleSubType={moduleSubType} setModuleSubType={setModuleSubType} colour={colour} setTab={setTab} studentId={student.id} onToggleLog={togglePhysicalLog} />
                    </div>
                    {showBodyweightCards && (
                    <>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: expandedHomeBodyweight ? 10 : 8 }}>
                      {BODYWEIGHT_GROUPS.map(grp => {
                        const complete = todaysBodyweight.some(e => grp.match(e.type))
                        const active = expandedHomeBodyweight === grp.key
                        return (
                          <button key={grp.key} type="button" onClick={() => setExpandedHomeBodyweight(active ? null : grp.key)} style={{
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
                          <button key={i} type="button" onClick={() => setExpandedHomeStretch(active ? null : i)} style={{
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
                      <ModuleButton b={modules[4]} sorted={sorted} moduleSubType={moduleSubType} setModuleSubType={setModuleSubType} colour={colour} setTab={setTab} studentId={student.id} />
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
                      <ModuleButton b={modules[modules.length - 2]} sorted={sorted} moduleSubType={moduleSubType} setModuleSubType={setModuleSubType} colour={colour} setTab={setTab} studentId={student.id} />
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
                      <ModuleButton b={modules[modules.length - 1]} sorted={sorted} moduleSubType={moduleSubType} setModuleSubType={setModuleSubType} colour={colour} setTab={setTab} studentId={student.id} />
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

                    <div className="card" style={{ padding: 0, marginBottom: 14 }}>
                      <div style={{ padding: '10px 14px', fontWeight: 600, fontSize: 13, borderBottom: '1px solid var(--border)' }}>Profile</div>
                      {[
                        ['Discipline', student.discipline_codes || student.discipline || '—'],
                        [student.discipline === 'KRBA' ? 'Level' : student.is_kr ? 'Experience' : 'Grade',
                          student.discipline === 'KRBA' ? (student.krba_level || '—') : student.is_kr ? (student.competition_team || '—') : (student.pka_belt || '—')],
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

            </>
          ) : (
            <div className="card" style={{ textAlign: 'center', padding: 32 }}>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>Your account isn't linked to a student record yet.</p>
              <button className="btn btn-primary" onClick={() => setTab('search')}>🔍 Find your profile</button>
            </div>
          )}
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

      {/* ── Analysis ── */}
      {tab === 'analysis' && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Link to="/kickboxing-tpt" className="card" style={{ textDecoration: 'none', textAlign: 'center', padding: 20, color: '#378ADD' }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>📊</div>
              <div style={{ fontWeight: 600 }}>Kickboxing TPT</div>
            </Link>
            <Link to="/boxing-tpt" className="card" style={{ textDecoration: 'none', textAlign: 'center', padding: 20, color: '#E24B4A' }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>📊</div>
              <div style={{ fontWeight: 600 }}>Boxing TPT</div>
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
            <div className="card" style={{ padding: 0 }}>
              <table>
                <thead><tr><th>Date</th><th style={{ textAlign: 'center' }}>Before</th><th style={{ textAlign: 'center' }}>After</th><th style={{ textAlign: 'center' }}>Change</th></tr></thead>
                <tbody>
                  {sessions.map((s,i) => {
                    const wc = s.weight_before && s.weight_after ? (parseFloat(s.weight_after) - parseFloat(s.weight_before)).toFixed(1) : null
                    return (
                      <tr key={i}>
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
