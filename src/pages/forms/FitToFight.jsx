import { useState, useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase.js'
import { useAuth } from '../../hooks/useAuth.jsx'
import FormLogo from '../../components/shared/FormLogo.jsx'

// ── Module definitions ──
const MODULES = [
  { key: 'running',      label: 'Running',       icon: '🏃', colour: '#E24B4A' },
  { key: 'watt_bike',    label: 'Watt / assault bike', icon: '🚴', colour: '#378ADD' },
  { key: 'bodyweight',   label: 'Bodyweight',    icon: '💪', colour: '#1D9E75' },
  { key: 'stretch',      label: 'Stretch flows',  icon: '🤸', colour: '#EF9F27' },
  { key: 'test',         label: 'Test',           icon: '📋', colour: '#8B5CF6' },
  { key: 'techniques',   label: 'Techniques',     icon: '🥋', colour: '#E24B4A' },
  { key: 'mentality',      label: 'Mentality',      icon: '🧠', colour: '#6D28D9' },
  { key: 'wellbeing',      label: 'Wellbeing',      icon: '🌱', colour: '#0E9F6E' },
]

const DEFAULT_RUN_CATEGORIES = {
  'Distance over time': ['2 Minute Run', '3 Minute Run', '10 Minute Run', '20 Minute Run', '30 Minute Run'],
  'Timed Sprints': ['30m run', '40m run', '50m run', '100m run', '200m run', '300m run', '400m run', '800m run'],
  'Timed Distance Run': ['1600m run', '4800m run', '2K', '5K', '10K', '15K'],
}
const DEFAULT_WATT_TYPES = ['Interval', 'Power Circuit', 'Sprints']
const DEFAULT_BODYWEIGHT_TYPES = ['Push-ups', 'Pull-ups', 'Squats', 'Dips', 'Sit-ups', 'Burpees', 'Other']
const DEFAULT_STRETCH_OPTIONS = [
  'Box Splits Stretch', 'Seated toe-touch stretch', 'Arm across the body',
  'Head rotation left and right', 'Hip flexor stretch', 'Standing quad stretch',
  'Hamstring stretch', 'Calf stretch', 'Shoulder rotation', 'Other',
]
const DEFAULT_TEST_TYPES = ['Bleep test', 'Fixed load circuit', '200m sprint', '1600m time trial', '4800m time trial', 'Other']
const DEFAULT_TECHNIQUE_TYPES = ['Straight punches', 'Round kicks', 'Pads', 'Bag work', 'Combinations', 'Other']
const DEFAULT_MENTALITY_TYPES = [
  'Video analysis (Self in competition)', 'Video analysis (Self in training)',
  'Video analysis (Elite athlete in competition)', 'Video analysis (Elite athlete in training)',
  'Meditation', 'Visualisation (Performing a technique)', 'Visualisation (Performing in competition)',
  'Play chess', 'Reading (out loud)', 'Gaming (combat)',
  'Active recovery day (Swimming/Walking/Yoga)',
  // Merged in from Eye training
  'Eye tracking drills', 'Reaction/reflex drills',
  // Merged in from One percenters
  'Ice bath', 'Sleep tracking', 'Nutrition log', 'Hydration tracking', 'Recovery routine',
  'Other',
]

// Combined from the young men's / young women's mental health toolkits --
// genuine duplicates merged, everything else kept so nothing is lost.
const WELLBEING_CHECKLIST = [
  'Woke up at a consistent time',
  'Ate balanced, nutritious meals',
  'Drank enough water / stayed hydrated',
  'Exercised / moved my body for at least 30 minutes',
  'Spent at least 20 minutes outside',
  'Talked with someone I trust (friend or family)',
  'Limited social media if it affected my mood',
  'Completed one productive task',
  'Practiced self-care',
  'Practiced gratitude (wrote three good things)',
  'Got 8–9 hours of sleep',
]
const WELLBEING_COPING_TOOLS = [
  'Breathing exercises (box / mindfulness breathing)', 'Progressive muscle relaxation',
  'Journaling / gratitude journal', 'Weight training or sport', 'Running or walking',
  'Listening to calming music', 'Meditation / guided meditation', 'Grounding exercise (5-4-3-2-1)',
  'Reading', 'Creative hobbies / art', 'Cold water face splash', 'Stretching or yoga',
  'Positive self-talk / affirmations', 'Setting achievable daily goals', 'Asking for help early',
  'Dancing', 'Talking with trusted adults', 'Vision boards', 'Mood tracking',
  'Spending time with pets', 'Relaxation exercises', 'Other',
]
const WELLBEING_CHECK_CATEGORIES = [
  'Sleep', 'Energy', 'Mood', 'Anxiety', 'Confidence', 'Exercise', 'Nutrition',
  'Friendships', 'Family relationships', 'Stress management', 'School or work', 'Enjoyment of hobbies',
]
// Reference guidance shown alongside the check -- kept in full from the
// original toolkit rather than turned into loggable fields, since it's
// guidance rather than something to record per-session.
const WELLBEING_GUIDANCE = `Build resilience: accept that setbacks happen, focus on progress not perfection, learn from mistakes, keep realistic expectations.

Build confidence: set small goals, celebrate achievements, practice new skills, speak kindly to yourself.

Stay connected: join clubs or sports, volunteer, spend time with family, keep in touch with friends.

When life feels difficult, remember A.C.T. — Acknowledge how you're feeling, Connect with someone you trust, Take one small positive action.

When feeling angry: exercise, breathing, take space before reacting.
When feeling stressed: break tasks into smaller steps, take regular breaks.
When feeling lonely: message someone, attend a club or training session.
When feeling unmotivated: complete one small task first.
When feeling anxious: focus on what you can control today, slow breathing and grounding.
When overthinking: write thoughts down instead of replaying them.
When overwhelmed: pause and focus on one task.
When sad: reach out to someone you trust.
When comparing yourself to others: reduce time on social media and focus on your own strengths.
When confidence is low: list personal achievements and qualities.

Weekly goals: meet a friend / spend time with family or friends, learn something new / try a new activity, complete one challenge, celebrate one achievement, practice kindness toward yourself, reflect on the week's successes.`
const DEFAULT_INTERVAL_MODES = ['20 seconds on 20 seconds off', '30 seconds on 30 seconds off', '40 seconds on 20 seconds off']
const LAST_SELECTION_KEY = 'f2f_last_selection'

// ── Small helpers ──
// Distance input (km) -- plain decimal, formatted to reduce entry errors
function DistanceInput({ value, onChange, placeholder = '0.00' }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <input type="number" step="0.01" min="0" inputMode="decimal" value={value} onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{ width: 90, padding: '4px 6px', border: '1px solid var(--border-strong)', borderRadius: 6, fontSize: 12, background: 'var(--bg-secondary)', color: 'var(--text)', fontFamily: 'var(--font-sans)', textAlign: 'right' }} />
      <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>km</span>
    </div>
  )
}

// Time input (mm:ss) -- two small boxes combined, avoids "1:234" typos
function TimeInput({ value, onChange }) {
  const [mm, ss] = (value || '').split(':')
  function update(newMm, newSs) {
    const m = (newMm ?? mm ?? '').toString().padStart(2, '0').slice(-2)
    const s = (newSs ?? ss ?? '').toString().padStart(2, '0').slice(-2)
    onChange(`${m}:${s}`)
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <input type="number" min="0" max="59" value={mm || ''} onChange={e => update(e.target.value, null)}
        placeholder="mm" style={{ width: 44, padding: '4px 6px', border: '1px solid var(--border-strong)', borderRadius: 6, fontSize: 12, background: 'var(--bg-secondary)', color: 'var(--text)', textAlign: 'center', fontFamily: 'var(--font-sans)' }} />
      <span style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>:</span>
      <input type="number" min="0" max="59" value={ss || ''} onChange={e => update(null, e.target.value)}
        placeholder="ss" style={{ width: 44, padding: '4px 6px', border: '1px solid var(--border-strong)', borderRadius: 6, fontSize: 12, background: 'var(--bg-secondary)', color: 'var(--text)', textAlign: 'center', fontFamily: 'var(--font-sans)' }} />
      <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>mm:ss</span>
    </div>
  )
}

// A list of run attempts/sets, each using either a distance or time input
// depending on the selected run category
function RunSetInput({ sets, onChange, mode }) {
  function update(i, val) {
    const next = [...sets]
    next[i] = val
    onChange(next)
  }
  function add() { onChange([...sets, '']) }
  function remove(i) { onChange(sets.filter((_, idx) => idx !== i)) }
  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 6 }}>
        {sets.map((s, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: 10, color: 'var(--text-tertiary)', width: 12 }}>{i + 1}</span>
            {mode === 'distance'
              ? <DistanceInput value={s} onChange={v => update(i, v)} />
              : <TimeInput value={s} onChange={v => update(i, v)} />}
            <button onClick={() => remove(i)} style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: 14, padding: 0 }}>×</button>
          </div>
        ))}
      </div>
      <button className="btn btn-sm" onClick={add} style={{ fontSize: 11 }}>+ Add attempt</button>
    </div>
  )
}

// Watt bike sets: each set has a wattage AND a distance figure
function WattSetInput({ sets, onChange }) {
  function update(i, field, val) {
    const next = [...sets]
    next[i] = { ...(next[i] || {}), [field]: val }
    onChange(next)
  }
  function add() { onChange([...sets, { wattage: '', distance: '' }]) }
  function remove(i) { onChange(sets.filter((_, idx) => idx !== i)) }
  return (
    <div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 6 }}>
        {sets.map((s, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 10, color: 'var(--text-tertiary)', width: 12 }}>{i + 1}</span>
            <input type="number" step="1" min="0" value={s?.wattage ?? ''} onChange={e => update(i, 'wattage', e.target.value)}
              placeholder="0" style={{ width: 64, padding: '4px 6px', border: '1px solid var(--border-strong)', borderRadius: 6, fontSize: 12, background: 'var(--bg-secondary)', color: 'var(--text)', textAlign: 'right', fontFamily: 'var(--font-sans)' }} />
            <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>W</span>
            <input type="number" step="0.01" min="0" value={s?.distance ?? ''} onChange={e => update(i, 'distance', e.target.value)}
              placeholder="0.00" style={{ width: 70, padding: '4px 6px', border: '1px solid var(--border-strong)', borderRadius: 6, fontSize: 12, background: 'var(--bg-secondary)', color: 'var(--text)', textAlign: 'right', fontFamily: 'var(--font-sans)' }} />
            <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>km</span>
            <button onClick={() => remove(i)} style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: 14, padding: 0, marginLeft: 2 }}>×</button>
          </div>
        ))}
      </div>
      <button className="btn btn-sm" onClick={add} style={{ fontSize: 11 }}>+ Add set</button>
    </div>
  )
}

// ── Small helpers ──
function SetInput({ sets, onChange, placeholder = 'e.g. 0.24' }) {
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
      <button className="btn btn-sm" onClick={add} style={{ fontSize: 11 }}>+ Add set</button>
    </div>
  )
}

function ModuleCard({ mod, enabled, onToggle, children }) {
  return (
    <div style={{ border: `1px solid ${enabled ? mod.colour : 'var(--border)'}`, borderRadius: 'var(--border-radius-lg)', overflow: 'hidden', marginBottom: 10 }}>
      <div onClick={onToggle} style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', cursor: 'pointer',
        background: enabled ? mod.colour + '12' : 'var(--bg)',
      }}>
        <span style={{ fontSize: 18 }}>{mod.icon}</span>
        <span style={{ fontSize: 14, fontWeight: 500, flex: 1 }}>{mod.label}</span>
        <div style={{
          width: 20, height: 20, borderRadius: '50%', border: `2px solid ${enabled ? mod.colour : 'var(--border-strong)'}`,
          background: enabled ? mod.colour : 'transparent',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'all 0.15s',
        }}>
          {enabled && <span style={{ color: '#fff', fontSize: 12, lineHeight: 1 }}>✓</span>}
        </div>
      </div>
      {enabled && (
        <div style={{ padding: '12px 14px', borderTop: `1px solid ${mod.colour}22`, background: 'var(--bg)' }}>
          {children}
        </div>
      )}
    </div>
  )
}

export default function FitToFight() {
  const { profile, isAdmin } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [view, setView] = useState('log') // 'log' | 'history'
  const [students, setStudents] = useState([])
  const [runCategories, setRunCategories]     = useState(DEFAULT_RUN_CATEGORIES)
  const [wattTypes, setWattTypes]             = useState(DEFAULT_WATT_TYPES)
  const [bodyweightTypes, setBodyweightTypes] = useState(DEFAULT_BODYWEIGHT_TYPES)
  const [stretchOptions, setStretchOptions]   = useState(DEFAULT_STRETCH_OPTIONS)
  const [testTypes, setTestTypes]             = useState(DEFAULT_TEST_TYPES)
  const [techniqueTypes, setTechniqueTypes]   = useState(DEFAULT_TECHNIQUE_TYPES)
  const [intervalModes, setIntervalModes]     = useState([...DEFAULT_INTERVAL_MODES, 'Custom'])
  const [student, setStudent] = useState({ first_name: '', last_name: '' })
  const [sessionDate, setSessionDate] = useState(new Date().toISOString().split('T')[0])
  const [weightBefore, setWeightBefore] = useState('')
  const [weightAfter, setWeightAfter]   = useState('')
  const [height, setHeight]             = useState('')
  const [reach, setReach]               = useState('')

  // Enabled modules
  const [enabled, setEnabled] = useState({})

  // Module data
  const [running, setRunning]         = useState({ category: '', test: '', notes: '', sets: [] })
  const [wattBike, setWattBike]       = useState({ type: '', interval_mode: '', custom_on: '', custom_off: '', sets: [], total_distance: '', max_wattage: '', avg_wattage: '' })
  const [bodyweight, setBodyweight]   = useState({ type: '', notes: '', sets: [] })
  const [stretches, setStretches]     = useState(['', '', ''])
  const [test, setTest]               = useState({ type: '', notes: '' })
  const [techniques, setTechniques]   = useState({ type: '', notes: '', sets: [] })
  const [mentality, setMentality] = useState({ types: [], notes: '' })
  const [mentalityTypes, setMentalityTypes] = useState(DEFAULT_MENTALITY_TYPES)
  const [wellbeing, setWellbeing] = useState({ checklist: [], ratings: {}, copingTools: [], notes: '' })
  const [showWellbeingGuidance, setShowWellbeingGuidance] = useState(false)
  const [trainedFurther, setTrainedFurther] = useState(false)
  const [notes, setNotes]             = useState('')

  const [submitting, setSubmitting]   = useState(false)
  const [submitted, setSubmitted]     = useState(false)

  // History
  const [history, setHistory]         = useState([])
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [expandedSession, setExpandedSession] = useState(null)

  useEffect(() => { if (isAdmin) loadStudents() }, [isAdmin])

  useEffect(() => {
    const studentId = searchParams.get('student_id')
    if (studentId && students.length > 0) {
      const s = students.find(s => s.id === studentId)
      if (s) setStudent({ id: s.id, first_name: s.members?.first_name || '', last_name: s.members?.last_name || '' })
    }
    const moduleKey = searchParams.get('module')
    if (moduleKey) setEnabled(prev => ({ ...prev, [moduleKey]: true }))
  }, [searchParams, students])

  useEffect(() => {
    supabase.from('settings').select('key,value')
      .in('key', ['f2f_run_categories', 'f2f_watt_types', 'f2f_bodyweight_types', 'f2f_stretch_options', 'f2f_test_types', 'f2f_technique_types', 'f2f_interval_modes', 'f2f_mentality_types'])
      .then(({ data }) => {
        const map = Object.fromEntries((data || []).map(r => [r.key, r.value]))
        if (map.f2f_run_categories) setRunCategories(map.f2f_run_categories)
        if (map.f2f_watt_types) setWattTypes(map.f2f_watt_types)
        if (map.f2f_bodyweight_types) setBodyweightTypes(map.f2f_bodyweight_types)
        if (map.f2f_stretch_options) setStretchOptions(map.f2f_stretch_options)
        if (map.f2f_test_types) setTestTypes(map.f2f_test_types)
        if (map.f2f_technique_types) setTechniqueTypes(map.f2f_technique_types)
        if (map.f2f_mentality_types) setMentalityTypes(map.f2f_mentality_types)
        if (map.f2f_interval_modes) setIntervalModes([...map.f2f_interval_modes, 'Custom'])
      })
  }, [])
  useEffect(() => { if (view === 'history') loadHistory() }, [view])
  useEffect(() => {
    if (isAdmin || !profile?.id) return
    supabase.from('students').select('id, members(first_name, last_name)')
      .eq('member_id', profile.id).maybeSingle()
      .then(({ data }) => {
        if (data) setStudent({ id: data.id, first_name: data.members?.first_name || '', last_name: data.members?.last_name || '' })
      })
  }, [isAdmin, profile?.id])

  // Remember the last-used running/watt bike selections for convenience
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(LAST_SELECTION_KEY) || '{}')
      if (saved.running_category) setRunning(r => ({ ...r, category: saved.running_category, test: saved.running_test || '' }))
      if (saved.watt_type) setWattBike(w => ({ ...w, type: saved.watt_type, interval_mode: saved.watt_interval_mode || '' }))
    } catch (e) { /* ignore */ }
  }, [])

  function rememberSelection(patch) {
    try {
      const saved = JSON.parse(localStorage.getItem(LAST_SELECTION_KEY) || '{}')
      localStorage.setItem(LAST_SELECTION_KEY, JSON.stringify({ ...saved, ...patch }))
    } catch (e) { /* ignore */ }
  }

  async function loadStudents() {
    const { data } = await supabase
      .from('students')
      .select('id, student_ref, members(first_name, last_name)')
    setStudents(data || [])
  }

  async function loadHistory() {
    setLoadingHistory(true)
    let query = supabase
      .from('fit2fight_sessions')
      .select('*')
      .order('session_date', { ascending: false })
      .limit(60)
    if (!isAdmin) {
      if (!profile?.student?.id) { setHistory([]); setLoadingHistory(false); return }
      query = query.eq('student_id', profile.student.id)
    }
    const { data } = await query
    setHistory(data || [])
    setLoadingHistory(false)
  }

  function toggle(key) {
    setEnabled(e => ({ ...e, [key]: !e[key] }))
  }

  function enabledCount() {
    return MODULES.filter(m => enabled[m.key]).length
  }

  async function submit() {
    setSubmitting(true)
    const payload = {
      first_name: student.first_name,
      last_name: student.last_name,
      student_id: student.id || null,
      logged_by: profile?.id || null,
      session_date: sessionDate,
      weight_before: weightBefore || null,
      weight_after:  weightAfter  || null,
      height_cm: height || null,
      reach_cm:  reach  || null,
      running:      enabled.running      ? running      : null,
      watt_bike:    enabled.watt_bike    ? wattBike     : null,
      bodyweight:   enabled.bodyweight   ? bodyweight   : null,
      stretch_flows: enabled.stretch     ? stretches    : null,
      test:          enabled.test        ? test         : null,
      techniques:    enabled.techniques  ? techniques   : null,
      mentality:      enabled.mentality      ? mentality     : null,
      wellbeing:      enabled.wellbeing      ? wellbeing     : null,
      trained_further: trainedFurther,
      notes,
    }
    const { error } = await supabase.from('fit2fight_sessions').insert(payload)
    if (!error) setSubmitted(true)
    setSubmitting(false)
  }

  function reset() {
    if (isAdmin) setStudent({ first_name: '', last_name: '' })
    setWeightBefore(''); setWeightAfter('')
    setHeight(''); setReach(''); setEnabled({}); setRunning({ category: '', test: '', notes: '', sets: [] })
    setWattBike({ type: '', interval_mode: '', custom_on: '', custom_off: '', sets: [], total_distance: '', max_wattage: '', avg_wattage: '' })
    setBodyweight({ type: '', notes: '', sets: [] }); setStretches(['', '', ''])
    setTest({ type: '', notes: '' }); setTechniques({ type: '', notes: '', sets: [] })
    setMentality({ types: [], notes: '' }); setWellbeing({ checklist: [], ratings: {}, copingTools: [], notes: '' }); setTrainedFurther(false); setNotes('')
    setSubmitted(false)
  }

  if (submitted) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg-tertiary)', padding: '24px 16px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="card" style={{ maxWidth: 400, width: '100%', textAlign: 'center', padding: 32 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
          <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 6 }}>Session logged!</h2>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6 }}>
            {student.first_name} {student.last_name} · {new Date(sessionDate).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 24 }}>
            {enabledCount()} workout modules recorded
            {weightBefore && weightAfter ? ` · Weight: ${weightBefore}→${weightAfter}kg` : ''}
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn" style={{ flex: 1, justifyContent: 'center' }} onClick={reset}>Log another</button>
            <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={() => { reset(); setView('history') }}>View history</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-tertiary)', padding: '24px 16px' }}>
      <div style={{ maxWidth: 620, margin: '0 auto' }}>

        <button onClick={() => navigate(-1)} className="btn btn-sm" style={{ marginBottom: 12 }}>← Back</button>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <FormLogo formKey="fit2fight" fallbackEmoji="💪" size={40} />
            <div>
              <h1 style={{ fontSize: 20, fontWeight: 600 }}>Fit II Fight</h1>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Training session logger</p>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            {['log', 'history'].map(v => (
              <button key={v} onClick={() => setView(v)} className={v === view ? 'btn btn-primary btn-sm' : 'btn btn-sm'}
                style={{ textTransform: 'capitalize' }}>{v}</button>
            ))}
          </div>
        </div>

        {view === 'log' && (
          <>
            {/* Student & basics */}
            <div className="card" style={{ marginBottom: 12 }}>
              <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Session details</h2>
              {isAdmin && students.length > 0 ? (
                <div className="field">
                  <label>Student</label>
                  <select onChange={e => {
                    const s = students.find(s => s.id === e.target.value)
                    if (s) setStudent({ id: s.id, first_name: s.members?.first_name || '', last_name: s.members?.last_name || '' })
                  }}>
                    <option value="">Select student…</option>
                    {students.map(s => (
                      <option key={s.id} value={s.id}>{s.members?.first_name} {s.members?.last_name} · {s.student_ref}</option>
                    ))}
                  </select>
                </div>
              ) : !isAdmin && student.id ? (
                <div className="field">
                  <label>Logging session for</label>
                  <div style={{ padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', background: 'var(--bg-secondary)', fontSize: 14, fontWeight: 500 }}>
                    {student.first_name} {student.last_name}
                  </div>
                </div>
              ) : (
                <div className="field-row">
                  <div className="field"><label>First name</label><input value={student.first_name} onChange={e => setStudent(s => ({ ...s, first_name: e.target.value }))} placeholder="First name" /></div>
                  <div className="field"><label>Last name</label><input value={student.last_name} onChange={e => setStudent(s => ({ ...s, last_name: e.target.value }))} placeholder="Last name" /></div>
                </div>
              )}
              <div className="field"><label>Session date</label><input type="date" value={sessionDate} onChange={e => setSessionDate(e.target.value)} /></div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8 }}>
                {[
                  { label: 'Weight before', val: weightBefore, set: setWeightBefore, unit: 'kg' },
                  { label: 'Weight after',  val: weightAfter,  set: setWeightAfter,  unit: 'kg' },
                  { label: 'Height',        val: height,       set: setHeight,       unit: 'cm' },
                  { label: 'Reach',         val: reach,        set: setReach,        unit: 'cm' },
                ].map(f => (
                  <div key={f.label} className="field" style={{ marginBottom: 0 }}>
                    <label style={{ fontSize: 11 }}>{f.label} <span style={{ color: 'var(--text-tertiary)', fontWeight: 400 }}>({f.unit})</span></label>
                    <input type="number" step="0.1" value={f.val} onChange={e => f.set(e.target.value)} placeholder="—"
                      style={{ textAlign: 'right' }} />
                  </div>
                ))}
              </div>
              {weightBefore && weightAfter && (
                <div style={{ marginTop: 8, fontSize: 12, color: parseFloat(weightAfter) < parseFloat(weightBefore) ? '#1d9e75' : 'var(--text-secondary)' }}>
                  Weight change: {(parseFloat(weightAfter) - parseFloat(weightBefore)).toFixed(2)} kg
                </div>
              )}
            </div>

            {/* Module toggles */}
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>
              Toggle the workout modules you completed today:
            </p>

            {/* Running */}
            <ModuleCard mod={MODULES[0]} enabled={!!enabled.running} onToggle={() => toggle('running')}>
              <div className="field"><label>Category</label>
                <select value={running.category} onChange={e => {
                  const category = e.target.value
                  setRunning(r => ({ ...r, category, test: '' }))
                  rememberSelection({ running_category: category, running_test: '' })
                }}>
                  <option value="">Select…</option>
                  {Object.keys(runCategories).map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              {running.category && (
                <div className="field"><label>Test</label>
                  <select value={running.test} onChange={e => {
                    const test = e.target.value
                    setRunning(r => ({ ...r, test }))
                    rememberSelection({ running_test: test })
                  }}>
                    <option value="">Select…</option>
                    {runCategories[running.category].map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
              )}
              {running.category && running.test && (
                <div className="field"><label>{running.category === 'Distance over time' ? 'Distance covered' : 'Time'}</label>
                  <RunSetInput sets={running.sets} onChange={sets => setRunning(r => ({ ...r, sets }))}
                    mode={running.category === 'Distance over time' ? 'distance' : 'time'} />
                </div>
              )}
              <div className="field"><label>Notes</label><input value={running.notes} onChange={e => setRunning(r => ({ ...r, notes: e.target.value }))} placeholder="What did you do?" /></div>
            </ModuleCard>

            {/* Watt / assault bike */}
            <ModuleCard mod={MODULES[1]} enabled={!!enabled.watt_bike} onToggle={() => toggle('watt_bike')}>
              <div className="field"><label>Type</label>
                <select value={wattBike.type} onChange={e => {
                  const type = e.target.value
                  setWattBike(w => ({ ...w, type }))
                  rememberSelection({ watt_type: type })
                }}>
                  <option value="">Select…</option>{wattTypes.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div className="field"><label>Interval mode</label>
                <select value={wattBike.interval_mode} onChange={e => {
                  const interval_mode = e.target.value
                  setWattBike(w => ({ ...w, interval_mode }))
                  rememberSelection({ watt_interval_mode: interval_mode })
                }}>
                  <option value="">Select…</option>{intervalModes.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              {wattBike.interval_mode === 'Custom' && (
                <div className="field-row">
                  <div className="field"><label>On (seconds)</label><input type="number" min="0" value={wattBike.custom_on} onChange={e => setWattBike(w => ({ ...w, custom_on: e.target.value }))} /></div>
                  <div className="field"><label>Off (seconds)</label><input type="number" min="0" value={wattBike.custom_off} onChange={e => setWattBike(w => ({ ...w, custom_off: e.target.value }))} /></div>
                </div>
              )}
              <div className="field"><label>Sets (wattage & distance)</label>
                <WattSetInput sets={wattBike.sets} onChange={sets => setWattBike(w => ({ ...w, sets }))} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 8 }}>
                {[
                  { label: 'Total distance', val: wattBike.total_distance, key: 'total_distance', unit: 'km' },
                  { label: 'Max wattage',    val: wattBike.max_wattage,    key: 'max_wattage',    unit: 'W'  },
                  { label: 'Avg wattage',    val: wattBike.avg_wattage,    key: 'avg_wattage',    unit: 'W'  },
                ].map(f => (
                  <div key={f.key}>
                    <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 3 }}>{f.label} ({f.unit})</label>
                    <input type="number" step="0.01" value={f.val} onChange={e => setWattBike(w => ({ ...w, [f.key]: e.target.value }))} placeholder="—"
                      style={{ width: '100%', padding: '5px 8px', border: '1px solid var(--border-strong)', borderRadius: 6, fontSize: 13, background: 'var(--bg-secondary)', textAlign: 'right', color: 'var(--text)', fontFamily: 'var(--font-sans)' }} />
                  </div>
                ))}
              </div>
            </ModuleCard>

            {/* Bodyweight */}
            <ModuleCard mod={MODULES[2]} enabled={!!enabled.bodyweight} onToggle={() => toggle('bodyweight')}>
              <div className="field"><label>Exercise type</label>
                <select value={bodyweight.type} onChange={e => setBodyweight(b => ({ ...b, type: e.target.value }))}>
                  <option value="">Select…</option>{bodyweightTypes.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div className="field"><label>Sets (reps per set)</label>
                <SetInput sets={bodyweight.sets} onChange={sets => setBodyweight(b => ({ ...b, sets }))} placeholder="e.g. 12" />
              </div>
              <div className="field"><label>Notes</label><input value={bodyweight.notes} onChange={e => setBodyweight(b => ({ ...b, notes: e.target.value }))} placeholder="Additional notes…" /></div>
            </ModuleCard>

            {/* Stretch flows */}
            <ModuleCard mod={MODULES[3]} enabled={!!enabled.stretch} onToggle={() => toggle('stretch')}>
              <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>40 seconds on · 20 seconds off</p>
              {[0, 1, 2].map(i => (
                <div key={i} className="field">
                  <label>Flow {i + 1}</label>
                  <select value={stretches[i]} onChange={e => { const s = [...stretches]; s[i] = e.target.value; setStretches(s) }}>
                    <option value="">Select stretch…</option>{stretchOptions.map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
              ))}
            </ModuleCard>

            {/* Test */}
            <ModuleCard mod={MODULES[4]} enabled={!!enabled.test} onToggle={() => toggle('test')}>
              <div className="field"><label>Test type</label>
                <select value={test.type} onChange={e => setTest(t => ({ ...t, type: e.target.value }))}>
                  <option value="">Select…</option>{testTypes.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div className="field"><label>Result / notes</label>
                <input value={test.notes} onChange={e => setTest(t => ({ ...t, notes: e.target.value }))} placeholder="e.g. Level 11.4 / 2.0km / 32:15" />
              </div>
            </ModuleCard>

            {/* Techniques */}
            <ModuleCard mod={MODULES[5]} enabled={!!enabled.techniques} onToggle={() => toggle('techniques')}>
              <div className="field"><label>Technique type</label>
                <select value={techniques.type} onChange={e => setTechniques(t => ({ ...t, type: e.target.value }))}>
                  <option value="">Select…</option>{techniqueTypes.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div className="field"><label>Sets</label>
                <SetInput sets={techniques.sets} onChange={sets => setTechniques(t => ({ ...t, sets }))} placeholder="e.g. 20 reps" />
              </div>
              <div className="field"><label>Notes</label>
                <input value={techniques.notes} onChange={e => setTechniques(t => ({ ...t, notes: e.target.value }))} placeholder="e.g. Pads with dad" />
              </div>
            </ModuleCard>

            {/* Eye training */}
            <ModuleCard mod={MODULES[6]} enabled={!!enabled.mentality} onToggle={() => toggle('mentality')}>
              <div className="field">
                <label>Type / activity (select all that apply)</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {mentalityTypes.filter(t => t !== 'Other').map(t => (
                    <label key={t} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                      <input type="checkbox" checked={mentality.types.includes(t)}
                        onChange={e => setMentality(m => ({ ...m, types: e.target.checked ? [...m.types, t] : m.types.filter(x => x !== t) }))}
                        style={{ width: 16, height: 16 }} />
                      {t}
                    </label>
                  ))}
                </div>
              </div>
              <div className="field" style={{ marginBottom: 0 }}><label>Notes</label>
                <input value={mentality.notes} onChange={e => setMentality(m => ({ ...m, notes: e.target.value }))} placeholder="Details, or anything else not listed above…" />
              </div>
            </ModuleCard>

            <ModuleCard mod={MODULES[7]} enabled={!!enabled.wellbeing} onToggle={() => toggle('wellbeing')}>
              <div className="field">
                <label>Daily checklist</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {WELLBEING_CHECKLIST.map(item => (
                    <label key={item} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                      <input type="checkbox" checked={wellbeing.checklist.includes(item)}
                        onChange={e => setWellbeing(w => ({ ...w, checklist: e.target.checked ? [...w.checklist, item] : w.checklist.filter(x => x !== item) }))}
                        style={{ width: 16, height: 16 }} />
                      {item}
                    </label>
                  ))}
                </div>
              </div>

              <div className="field">
                <label>Personal wellbeing check (rate 1–5)</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {WELLBEING_CHECK_CATEGORIES.map(cat => (
                    <div key={cat} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: 13 }}>{cat}</span>
                      <div style={{ display: 'flex', gap: 4 }}>
                        {[1,2,3,4,5].map(n => (
                          <button key={n} type="button" onClick={() => setWellbeing(w => ({ ...w, ratings: { ...w.ratings, [cat]: n } }))}
                            style={{
                              width: 26, height: 26, borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                              border: `1px solid ${wellbeing.ratings[cat] === n ? '#0E9F6E' : 'var(--border-strong)'}`,
                              background: wellbeing.ratings[cat] === n ? '#0E9F6E' : 'var(--bg-secondary)',
                              color: wellbeing.ratings[cat] === n ? '#fff' : 'var(--text)',
                            }}>{n}</button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="field">
                <label>Coping tools used</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {WELLBEING_COPING_TOOLS.map(tool => {
                    const active = wellbeing.copingTools.includes(tool)
                    return (
                      <button key={tool} type="button"
                        onClick={() => setWellbeing(w => ({ ...w, copingTools: active ? w.copingTools.filter(t => t !== tool) : [...w.copingTools, tool] }))}
                        style={{
                          fontSize: 11, padding: '4px 10px', borderRadius: 20, cursor: 'pointer',
                          border: `1px solid ${active ? '#0E9F6E' : 'var(--border-strong)'}`,
                          background: active ? '#0E9F6E20' : 'var(--bg-secondary)',
                          color: active ? '#0E9F6E' : 'var(--text-secondary)',
                        }}>{tool}</button>
                    )
                  })}
                </div>
              </div>

              <div className="field" style={{ marginBottom: 8 }}><label>Notes</label>
                <input value={wellbeing.notes} onChange={e => setWellbeing(w => ({ ...w, notes: e.target.value }))} placeholder="Anything else to note…" />
              </div>

              <button type="button" className="btn btn-sm" onClick={() => setShowWellbeingGuidance(v => !v)} style={{ marginBottom: showWellbeingGuidance ? 8 : 0 }}>
                {showWellbeingGuidance ? 'Hide' : 'Show'} wellbeing guidance
              </button>
              {showWellbeingGuidance && (
                <div style={{ fontSize: 12, lineHeight: 1.6, whiteSpace: 'pre-line', background: 'var(--bg-secondary)', padding: 12, borderRadius: 'var(--radius)', color: 'var(--text-secondary)' }}>
                  {WELLBEING_GUIDANCE}
                </div>
              )}
            </ModuleCard>

            {/* Trained further + notes */}
            <div className="card" style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <input type="checkbox" id="further" checked={trainedFurther} onChange={e => setTrainedFurther(e.target.checked)} style={{ width: 16, height: 16 }} />
                <label htmlFor="further" style={{ fontSize: 13, cursor: 'pointer' }}>Trained on further exercises after this session</label>
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>Session notes</label>
                <textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)}
                  placeholder="Any additional observations or comments…" style={{ resize: 'none' }} />
              </div>
            </div>

            <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', padding: 11 }}
              onClick={submit} disabled={submitting || !student.first_name}>
              {submitting ? 'Saving…' : `Save session${enabledCount() > 0 ? ` (${enabledCount()} modules)` : ''}`}
            </button>
          </>
        )}

        {/* ── HISTORY ── */}
        {view === 'history' && (
          <>
            {loadingHistory
              ? <div className="loading">Loading sessions…</div>
              : history.length === 0
              ? <div className="empty-state"><h3>No sessions yet</h3><p>Logged sessions will appear here</p></div>
              : (
                <div className="card" style={{ padding: 0 }}>
                  <table>
                    <thead>
                      <tr>
                        <th>Date</th><th>Student</th>
                        <th style={{ textAlign: 'center' }}>Modules</th>
                        <th style={{ textAlign: 'center' }}>Weight Δ</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.map(h => {
                        const activeModules = MODULES.filter(m => h[m.key === 'stretch' ? 'stretch_flows' : m.key])
                        const wt = h.weight_before && h.weight_after ? (h.weight_after - h.weight_before).toFixed(2) : null
                        const isExp = expandedSession?.id === h.id
                        return (
                          <>
                            <tr key={h.id} style={isExp ? { background: 'var(--bg-secondary)' } : {}}>
                              <td style={{ fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                                {new Date(h.session_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' })}
                              </td>
                              <td style={{ fontWeight: 500 }}>{h.first_name} {h.last_name}</td>
                              <td style={{ textAlign: 'center' }}>
                                <div style={{ display: 'flex', gap: 3, justifyContent: 'center', flexWrap: 'wrap' }}>
                                  {activeModules.map(m => (
                                    <span key={m.key} title={m.label} style={{ fontSize: 14 }}>{m.icon}</span>
                                  ))}
                                </div>
                              </td>
                              <td style={{ textAlign: 'center', fontSize: 13, fontWeight: 600, color: wt && parseFloat(wt) < 0 ? '#1d9e75' : 'var(--text-secondary)' }}>
                                {wt ? `${wt > 0 ? '+' : ''}${wt}kg` : '—'}
                              </td>
                              <td>
                                <button className="btn btn-sm" onClick={() => setExpandedSession(isExp ? null : h)}>
                                  {isExp ? 'Close' : 'View'}
                                </button>
                              </td>
                            </tr>
                            {isExp && (
                              <tr key={h.id + '-exp'}>
                                <td colSpan={5} style={{ padding: '12px 16px', background: 'var(--bg-secondary)' }}>
                                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                                    {h.weight_before && <div style={{ fontSize: 12 }}><span style={{ color: 'var(--text-secondary)' }}>Weight before:</span> <strong>{h.weight_before}kg</strong></div>}
                                    {h.weight_after  && <div style={{ fontSize: 12 }}><span style={{ color: 'var(--text-secondary)' }}>Weight after:</span> <strong>{h.weight_after}kg</strong></div>}
                                    {h.height_cm && <div style={{ fontSize: 12 }}><span style={{ color: 'var(--text-secondary)' }}>Height:</span> <strong>{h.height_cm}cm</strong></div>}
                                    {h.reach_cm  && <div style={{ fontSize: 12 }}><span style={{ color: 'var(--text-secondary)' }}>Reach:</span> <strong>{h.reach_cm}cm</strong></div>}
                                  </div>
                                  {activeModules.map(m => {
                                    const data = h[m.key === 'stretch' ? 'stretch_flows' : m.key]
                                    if (!data) return null
                                    return (
                                      <div key={m.key} style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
                                        <div style={{ fontSize: 12, fontWeight: 600, color: m.colour, marginBottom: 4 }}>{m.icon} {m.label}</div>
                                        <pre style={{ fontSize: 11, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', fontFamily: 'var(--font-sans)', margin: 0 }}>
                                          {typeof data === 'string' ? data : JSON.stringify(data, null, 2)}
                                        </pre>
                                      </div>
                                    )
                                  })}
                                  {h.notes && <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text-secondary)' }}><strong>Notes:</strong> {h.notes}</div>}
                                </td>
                              </tr>
                            )}
                          </>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )
            }
          </>
        )}
      </div>
    </div>
  )
}
