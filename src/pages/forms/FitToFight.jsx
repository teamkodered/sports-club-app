import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase.js'
import { useAuth } from '../../hooks/useAuth.jsx'

// ── Module definitions ──
const MODULES = [
  { key: 'running',      label: 'Running',       icon: '🏃', colour: '#E24B4A' },
  { key: 'watt_bike',    label: 'Watt / assault bike', icon: '🚴', colour: '#378ADD' },
  { key: 'bodyweight',   label: 'Bodyweight',    icon: '💪', colour: '#1D9E75' },
  { key: 'stretch',      label: 'Stretch flows',  icon: '🤸', colour: '#EF9F27' },
  { key: 'test',         label: 'Test',           icon: '📋', colour: '#8B5CF6' },
  { key: 'techniques',   label: 'Techniques',     icon: '🥋', colour: '#E24B4A' },
  { key: 'eye_training', label: 'Eye training',   icon: '👁', colour: '#185FA5' },
  { key: 'heart_rate',   label: 'Heart rate',     icon: '❤️', colour: '#A32D2D' },
  { key: 'one_percenters', label: 'One percenters', icon: '⚡', colour: '#854F0B' },
]

const RUN_TYPES = [
  '1600m run', '4800m run', '20 Minute Run (Distance)',
  '2 Minute Run - Distance', '200m run 4', 'Interval circuit',
  'Single set (Distance)', 'Bleep test', 'Other',
]
const WATT_TYPES = ['Watt/Assault bike', 'Interval circuit', 'Single set']
const BODYWEIGHT_TYPES = ['Push-ups', 'Pull-ups', 'Squats', 'Dips', 'Sit-ups', 'Burpees', 'Other']
const STRETCH_OPTIONS = [
  'Box Splits Stretch', 'Seated toe-touch stretch', 'Arm across the body',
  'Head rotation left and right', 'Hip flexor stretch', 'Standing quad stretch',
  'Hamstring stretch', 'Calf stretch', 'Shoulder rotation', 'Other',
]
const TEST_TYPES = ['Bleep test', 'Fixed load circuit', '200m sprint', '1600m time trial', '4800m time trial', 'Other']
const TECHNIQUE_TYPES = ['Straight punches', 'Round kicks', 'Pads', 'Bag work', 'Combinations', 'Other']
const INTERVAL_MODES = ['20 seconds on 20 seconds off', '30 seconds on 30 seconds off', '40 seconds on 20 seconds off']

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

function BpmRow({ label, value, onChange }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
      <span style={{ fontSize: 12, color: 'var(--text-secondary)', flex: 1 }}>{label}</span>
      <input type="number" value={value} onChange={e => onChange(e.target.value)} placeholder="—"
        style={{ width: 72, padding: '4px 8px', border: '1px solid var(--border-strong)', borderRadius: 6, fontSize: 13, fontWeight: 600, textAlign: 'right', background: 'var(--bg-secondary)', color: 'var(--text)', fontFamily: 'var(--font-sans)' }} />
      <span style={{ fontSize: 11, color: 'var(--text-tertiary)', width: 26 }}>bpm</span>
    </div>
  )
}

export default function FitToFight() {
  const { profile, isAdmin } = useAuth()
  const [view, setView] = useState('log') // 'log' | 'history'
  const [students, setStudents] = useState([])
  const [student, setStudent] = useState({ first_name: '', last_name: '' })
  const [sessionDate, setSessionDate] = useState(new Date().toISOString().split('T')[0])
  const [weightBefore, setWeightBefore] = useState('')
  const [weightAfter, setWeightAfter]   = useState('')
  const [height, setHeight]             = useState('')
  const [reach, setReach]               = useState('')

  // Enabled modules
  const [enabled, setEnabled] = useState({})

  // Module data
  const [running, setRunning]         = useState({ type: '', notes: '', sets: [], avg_bpm: '', peak_bpm: '' })
  const [wattBike, setWattBike]       = useState({ type: '', interval_mode: '', sets: [], total_distance: '', max_wattage: '', avg_wattage: '', avg_bpm: '', peak_bpm: '' })
  const [bodyweight, setBodyweight]   = useState({ type: '', notes: '', sets: [] })
  const [stretches, setStretches]     = useState(['', '', ''])
  const [test, setTest]               = useState({ type: '', notes: '' })
  const [techniques, setTechniques]   = useState({ type: '', notes: '', sets: [] })
  const [eyeTraining, setEyeTraining] = useState('')
  const [heartRate, setHeartRate]     = useState({ type: '', notes: '', avg_bpm: '', peak_bpm: '' })
  const [onePercenters, setOnePercenters] = useState({ type: '', notes: '' })
  const [trainedFurther, setTrainedFurther] = useState(false)
  const [notes, setNotes]             = useState('')

  const [submitting, setSubmitting]   = useState(false)
  const [submitted, setSubmitted]     = useState(false)

  // History
  const [history, setHistory]         = useState([])
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [expandedSession, setExpandedSession] = useState(null)

  useEffect(() => { if (isAdmin) loadStudents() }, [isAdmin])
  useEffect(() => { if (view === 'history') loadHistory() }, [view])
  useEffect(() => {
    if (isAdmin || !profile?.id) return
    supabase.from('students').select('id, members(first_name, last_name)')
      .eq('member_id', profile.id).maybeSingle()
      .then(({ data }) => {
        if (data) setStudent({ id: data.id, first_name: data.members?.first_name || '', last_name: data.members?.last_name || '' })
      })
  }, [isAdmin, profile?.id])

  async function loadStudents() {
    const { data } = await supabase
      .from('students')
      .select('id, student_ref, members(first_name, last_name)')
    setStudents(data || [])
  }

  async function loadHistory() {
    setLoadingHistory(true)
    const { data } = await supabase
      .from('fit2fight_sessions')
      .select('*')
      .order('session_date', { ascending: false })
      .limit(60)
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
      eye_training:  enabled.eye_training ? eyeTraining : null,
      heart_rate:    enabled.heart_rate  ? heartRate    : null,
      one_percenters: enabled.one_percenters ? onePercenters : null,
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
    setHeight(''); setReach(''); setEnabled({}); setRunning({ type: '', notes: '', sets: [], avg_bpm: '', peak_bpm: '' })
    setWattBike({ type: '', interval_mode: '', sets: [], total_distance: '', max_wattage: '', avg_wattage: '', avg_bpm: '', peak_bpm: '' })
    setBodyweight({ type: '', notes: '', sets: [] }); setStretches(['', '', ''])
    setTest({ type: '', notes: '' }); setTechniques({ type: '', notes: '', sets: [] })
    setEyeTraining(''); setHeartRate({ type: '', notes: '', avg_bpm: '', peak_bpm: '' })
    setOnePercenters({ type: '', notes: '' }); setTrainedFurther(false); setNotes('')
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

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 600 }}>💪 Fit II Fight</h1>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Training session logger</p>
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
              <div className="field"><label>Run type</label>
                <select value={running.type} onChange={e => setRunning(r => ({ ...r, type: e.target.value }))}>
                  <option value="">Select…</option>{RUN_TYPES.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div className="field"><label>Interval mode</label>
                <select value={running.interval_mode || ''} onChange={e => setRunning(r => ({ ...r, interval_mode: e.target.value }))}>
                  <option value="">Select…</option>{INTERVAL_MODES.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div className="field"><label>Sets / splits</label>
                <SetInput sets={running.sets} onChange={sets => setRunning(r => ({ ...r, sets }))} placeholder="e.g. 0.24km" />
              </div>
              <div className="field"><label>Notes</label><input value={running.notes} onChange={e => setRunning(r => ({ ...r, notes: e.target.value }))} placeholder="What did you do?" /></div>
              <BpmRow label="Avg BPM" value={running.avg_bpm} onChange={v => setRunning(r => ({ ...r, avg_bpm: v }))} />
              <BpmRow label="Peak BPM" value={running.peak_bpm} onChange={v => setRunning(r => ({ ...r, peak_bpm: v }))} />
            </ModuleCard>

            {/* Watt / assault bike */}
            <ModuleCard mod={MODULES[1]} enabled={!!enabled.watt_bike} onToggle={() => toggle('watt_bike')}>
              <div className="field"><label>Type</label>
                <select value={wattBike.type} onChange={e => setWattBike(w => ({ ...w, type: e.target.value }))}>
                  <option value="">Select…</option>{WATT_TYPES.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div className="field"><label>Interval mode</label>
                <select value={wattBike.interval_mode} onChange={e => setWattBike(w => ({ ...w, interval_mode: e.target.value }))}>
                  <option value="">Select…</option>{INTERVAL_MODES.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div className="field"><label>Sets (wattage or distance per set)</label>
                <SetInput sets={wattBike.sets} onChange={sets => setWattBike(w => ({ ...w, sets }))} placeholder="e.g. 712W or 0.38km" />
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
              <BpmRow label="Avg BPM" value={wattBike.avg_bpm} onChange={v => setWattBike(w => ({ ...w, avg_bpm: v }))} />
              <BpmRow label="Peak BPM" value={wattBike.peak_bpm} onChange={v => setWattBike(w => ({ ...w, peak_bpm: v }))} />
            </ModuleCard>

            {/* Bodyweight */}
            <ModuleCard mod={MODULES[2]} enabled={!!enabled.bodyweight} onToggle={() => toggle('bodyweight')}>
              <div className="field"><label>Exercise type</label>
                <select value={bodyweight.type} onChange={e => setBodyweight(b => ({ ...b, type: e.target.value }))}>
                  <option value="">Select…</option>{BODYWEIGHT_TYPES.map(t => <option key={t}>{t}</option>)}
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
                    <option value="">Select stretch…</option>{STRETCH_OPTIONS.map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
              ))}
            </ModuleCard>

            {/* Test */}
            <ModuleCard mod={MODULES[4]} enabled={!!enabled.test} onToggle={() => toggle('test')}>
              <div className="field"><label>Test type</label>
                <select value={test.type} onChange={e => setTest(t => ({ ...t, type: e.target.value }))}>
                  <option value="">Select…</option>{TEST_TYPES.map(t => <option key={t}>{t}</option>)}
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
                  <option value="">Select…</option>{TECHNIQUE_TYPES.map(t => <option key={t}>{t}</option>)}
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
            <ModuleCard mod={MODULES[6]} enabled={!!enabled.eye_training} onToggle={() => toggle('eye_training')}>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>Eye training notes</label>
                <input value={eyeTraining} onChange={e => setEyeTraining(e.target.value)} placeholder="e.g. Reading out loud, tracking drills…" />
              </div>
            </ModuleCard>

            {/* Heart rate */}
            <ModuleCard mod={MODULES[7]} enabled={!!enabled.heart_rate} onToggle={() => toggle('heart_rate')}>
              <div className="field"><label>Type</label>
                <select value={heartRate.type} onChange={e => setHeartRate(h => ({ ...h, type: e.target.value }))}>
                  <option value="">Select…</option>
                  <option>Session Peak Heart Rate</option>
                  <option>Resting Heart Rate</option>
                  <option>Other</option>
                </select>
              </div>
              <BpmRow label="Avg BPM" value={heartRate.avg_bpm} onChange={v => setHeartRate(h => ({ ...h, avg_bpm: v }))} />
              <BpmRow label="Peak BPM" value={heartRate.peak_bpm} onChange={v => setHeartRate(h => ({ ...h, peak_bpm: v }))} />
              <div className="field" style={{ marginBottom: 0 }}><label>Notes</label>
                <input value={heartRate.notes} onChange={e => setHeartRate(h => ({ ...h, notes: e.target.value }))} placeholder="Additional notes…" />
              </div>
            </ModuleCard>

            {/* One percenters */}
            <ModuleCard mod={MODULES[8]} enabled={!!enabled.one_percenters} onToggle={() => toggle('one_percenters')}>
              <div className="field"><label>Type / activity</label>
                <input value={onePercenters.type} onChange={e => setOnePercenters(o => ({ ...o, type: e.target.value }))} placeholder="e.g. Ice bath, sleep tracking, nutrition log…" />
              </div>
              <div className="field" style={{ marginBottom: 0 }}><label>Notes</label>
                <input value={onePercenters.notes} onChange={e => setOnePercenters(o => ({ ...o, notes: e.target.value }))} placeholder="Details…" />
              </div>
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
