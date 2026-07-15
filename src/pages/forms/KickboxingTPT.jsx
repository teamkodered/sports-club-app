import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase.js'
import { useAuth } from '../../hooks/useAuth.jsx'

// ── Field definitions — all 51 fields grouped ──
const SECTIONS = [
  {
    key: 'measurements', label: 'Body measurements', icon: '📏',
    fields: [
      { key: 'weight_kg',     label: 'Weight (kg)',              unit: 'kg',   type: 'decimal' },
      { key: 'height_cm',     label: 'Height (cm)',              unit: 'cm',   type: 'decimal' },
      { key: 'arm_span_cm',   label: 'Arm span (index to index)',unit: 'cm',   type: 'decimal' },
      { key: 'leg_reach_cm',  label: 'Outer leg reach (hip to ankle)', unit: 'cm', type: 'decimal' },
    ],
  },
  {
    key: 'technique', label: 'Technique counts', icon: '🥊',
    fields: [
      { key: 'straight_punches',          label: 'Straight punches',               unit: 'reps', type: 'int' },
      { key: 'round_kicks_floor_left',    label: 'Round kicks — foot to floor (L)', unit: 'reps', type: 'int' },
      { key: 'round_kicks_floor_right',   label: 'Round kicks — foot to floor (R)', unit: 'reps', type: 'int' },
      { key: 'round_kicks_air_left',      label: 'Round kicks — foot off floor (L)', unit: 'reps', type: 'int' },
      { key: 'round_kicks_air_right',     label: 'Round kicks — foot off floor (R)', unit: 'reps', type: 'int' },
    ],
  },
  {
    key: 'cardio', label: 'Cardiovascular', icon: '❤️',
    fields: [
      { key: 'resting_hr',            label: 'Resting heart rate',        unit: 'bpm',  type: 'int' },
      { key: 'session_peak_hr',       label: 'Session peak heart rate',   unit: 'bpm',  type: 'int' },
      { key: 'run_20min_distance',    label: '20 min run — distance',     unit: 'km',   type: 'decimal' },
      { key: 'run_20min_peak_hr',     label: '20 min run — peak HR',      unit: 'bpm',  type: 'int' },
      { key: 'bleep_test_level',      label: 'Bleep test level',          unit: 'lvl',  type: 'decimal' },
      { key: 'bleep_test_peak_hr',    label: 'Bleep test peak HR',        unit: 'bpm',  type: 'int' },
      { key: 'run_200m_1',            label: '200m run 1',                unit: 's',    type: 'decimal' },
      { key: 'run_200m_2',            label: '200m run 2',                unit: 's',    type: 'decimal' },
      { key: 'run_200m_3',            label: '200m run 3',                unit: 's',    type: 'decimal' },
      { key: 'run_200m_4',            label: '200m run 4',                unit: 's',    type: 'decimal' },
      { key: 'sprint_peak_hr',        label: 'Sprint peak heart rate',    unit: 'bpm',  type: 'int' },
      { key: 'run_1600m',             label: '1600m run time',            unit: 'min',  type: 'decimal' },
      { key: 'run_4800m',             label: '4800m run time',            unit: 'min',  type: 'decimal' },
      { key: 'fixed_load_circuit_time', label: 'Fixed load circuit time', unit: 's',    type: 'decimal' },
    ],
  },
  {
    key: 'strength', label: 'Strength & endurance', icon: '💪',
    fields: [
      { key: 'dips',         label: 'Dips',       unit: 'reps', type: 'int' },
      { key: 'push_ups',     label: 'Push ups',   unit: 'reps', type: 'int' },
      { key: 'pull_ups',     label: 'Pull ups',   unit: 'reps', type: 'int' },
      { key: 'full_sit_up',  label: 'Full sit up', unit: 'reps', type: 'int' },
      { key: 'squats',       label: 'Squats',     unit: 'reps', type: 'int' },
    ],
  },
  {
    key: 'holds', label: 'Plank & kick holds', icon: '⏱',
    fields: [
      { key: 'flat_plank',           label: 'Flat plank',               unit: 's', type: 'int' },
      { key: 'side_plank_right',     label: 'Side plank — right up',    unit: 's', type: 'int' },
      { key: 'side_plank_left',      label: 'Side plank — left up',     unit: 's', type: 'int' },
      { key: 'kick_hold_front_left', label: 'Front kick hold (L)',      unit: 's', type: 'int' },
      { key: 'kick_hold_front_right',label: 'Front kick hold (R)',      unit: 's', type: 'int' },
      { key: 'kick_hold_side_left',  label: 'Side kick hold (L)',       unit: 's', type: 'int' },
      { key: 'kick_hold_side_right', label: 'Side kick hold (R)',       unit: 's', type: 'int' },
    ],
  },
  {
    key: 'grip', label: 'Grip & pinch strength', icon: '✊',
    fields: [
      { key: 'pinch_left',  label: 'Pinch test — left (5/10kg)',  unit: 'kg', type: 'decimal' },
      { key: 'pinch_right', label: 'Pinch test — right (5/10kg)', unit: 'kg', type: 'decimal' },
      { key: 'grip_left',   label: 'Grip test — left (20/30kg)',  unit: 'kg', type: 'decimal' },
      { key: 'grip_right',  label: 'Grip test — right (20/30kg)', unit: 'kg', type: 'decimal' },
    ],
  },
  {
    key: 'flexibility', label: 'Flexibility', icon: '🤸',
    fields: [
      { key: 'hamstring_stretch',     label: 'Hamstring stretch',             unit: 'cm', type: 'decimal' },
      { key: 'box_splits',            label: 'Box splits stretch range',      unit: 'cm', type: 'decimal' },
      { key: 'front_splits_left',     label: 'Front splits (left in front)',  unit: 'cm', type: 'decimal' },
      { key: 'front_splits_right',    label: 'Front splits (right in front)', unit: 'cm', type: 'decimal' },
      { key: 'shoulder_range_right',  label: 'Shoulder range (right hand up)', unit: 'cm', type: 'decimal' },
      { key: 'shoulder_range_left',   label: 'Shoulder range (left hand up)',  unit: 'cm', type: 'decimal' },
    ],
  },
  {
    key: 'power', label: 'Power & explosiveness', icon: '⚡',
    fields: [
      { key: 'vertical_jump', label: 'Vertical jump', unit: 'cm', type: 'decimal' },
      { key: 'long_jump',     label: 'Long jump',     unit: 'cm', type: 'decimal' },
    ],
  },
]

const ALL_FIELDS = SECTIONS.flatMap(s => s.fields)
const SECTION_COLOURS = {
  measurements: '#888780', technique: '#E24B4A', cardio: '#A32D2D',
  strength: '#378ADD', holds: '#185FA5', grip: '#1D9E75',
  flexibility: '#0F6E56', power: '#EF9F27',
}

function emptyForm() {
  return Object.fromEntries(ALL_FIELDS.map(f => [f.key, '']))
}

// ── Compact number input row ──
function FieldRow({ field, value, onChange, prevValue }) {
  const hasVal = value !== '' && value !== null && value !== undefined
  const hasPrev = prevValue !== null && prevValue !== undefined && prevValue !== ''
  const diff = hasVal && hasPrev ? parseFloat(value) - parseFloat(prevValue) : null
  const improved = diff !== null && (
    ['weight_kg', 'resting_hr', 'run_200m_1', 'run_200m_2', 'run_200m_3', 'run_200m_4',
     'run_1600m', 'run_4800m', 'fixed_load_circuit_time'].includes(field.key)
      ? diff < 0 : diff > 0
  )

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
      <span style={{ fontSize: 12, flex: 1, color: 'var(--text)' }}>{field.label}</span>
      {hasPrev && (
        <span style={{ fontSize: 11, color: 'var(--text-tertiary)', flexShrink: 0 }}>
          prev: {prevValue}
        </span>
      )}
      {diff !== null && (
        <span style={{ fontSize: 11, fontWeight: 600, flexShrink: 0, color: improved ? '#1d9e75' : '#a32d2d' }}>
          {diff > 0 ? '+' : ''}{diff.toFixed(1)}
        </span>
      )}
      <input
        type="number"
        step={field.type === 'decimal' ? '0.1' : '1'}
        min="0"
        value={value}
        onChange={e => onChange(field.key, e.target.value)}
        placeholder="—"
        style={{
          width: 72, padding: '5px 8px', textAlign: 'right',
          border: '1px solid var(--border-strong)', borderRadius: 'var(--radius)',
          background: hasVal ? 'var(--bg)' : 'var(--bg-secondary)',
          fontSize: 13, fontWeight: hasVal ? 600 : 400, color: 'var(--text)',
          fontFamily: 'var(--font-sans)',
        }}
      />
      <span style={{ fontSize: 11, color: 'var(--text-tertiary)', width: 26, flexShrink: 0 }}>{field.unit}</span>
    </div>
  )
}

// ── Progress bar for a stat ──
function StatBar({ label, value, max, colour }) {
  const pct = Math.min(100, (value / max) * 100)
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 3 }}>
        <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
        <span style={{ fontWeight: 600, color: colour }}>{value}</span>
      </div>
      <div style={{ height: 5, background: 'var(--bg-tertiary)', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: colour, borderRadius: 4, transition: 'width 0.4s' }} />
      </div>
    </div>
  )
}

export default function KickboxingTPT() {
  const { profile, isAdmin } = useAuth()
  const [mode, setMode] = useState('form')
  const [activeSection, setActiveSection] = useState('measurements')
  const [form, setForm] = useState(emptyForm())
  const [student, setStudent] = useState({ first_name: '', last_name: '', house: '' })
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(null)
  const [history, setHistory] = useState([])
  const [prevEntry, setPrevEntry] = useState(null)
  const [students, setStudents] = useState([])
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [selectedHistory, setSelectedHistory] = useState(null)

  useEffect(() => { if (isAdmin) loadStudents() }, [isAdmin])
  useEffect(() => { if (mode === 'history') loadHistory() }, [mode])

  async function loadStudents() {
    const { data } = await supabase
      .from('students')
      .select('id, student_ref, members(first_name, last_name, houses(name))')
      .eq('discipline', 'PKA')
    setStudents(data || [])
  }

  async function loadHistory() {
    setLoadingHistory(true)
    const { data } = await supabase
      .from('tpt_kickboxing')
      .select('*')
      .order('assessed_at', { ascending: false })
      .limit(60)
    setHistory(data || [])
    setLoadingHistory(false)
  }

  async function deleteEntry(h) {
    if (!confirm(`Delete ${h.first_name} ${h.last_name}'s analysis from ${new Date(h.assessed_at).toLocaleDateString('en-GB')}? This can't be undone.`)) return
    const { error } = await supabase.from('tpt_kickboxing').delete().eq('id', h.id)
    if (error) { alert('Error deleting: ' + error.message); return }
    setHistory(prev => prev.filter(x => x.id !== h.id))
  }

  async function loadPreviousEntry(firstName, lastName) {
    const { data } = await supabase
      .from('tpt_kickboxing')
      .select('*')
      .eq('first_name', firstName)
      .eq('last_name', lastName)
      .order('assessed_at', { ascending: false })
      .limit(1)
      .single()
    setPrevEntry(data || null)
  }

  function setField(key, val) {
    setForm(f => ({ ...f, [key]: val }))
  }

  function countFilled() {
    return ALL_FIELDS.filter(f => form[f.key] !== '' && form[f.key] !== null).length
  }

  async function submit() {
    setSubmitting(true)
    const payload = {
      first_name: student.first_name,
      last_name: student.last_name,
      house: student.house,
      student_id: student.id || null,
      assessed_by: profile?.id || null,
      notes,
      ...Object.fromEntries(ALL_FIELDS.map(f => [f.key, form[f.key] !== '' ? parseFloat(form[f.key]) : null])),
    }
    const { data, error } = await supabase.from('tpt_kickboxing').insert(payload).select().single()
    if (!error) setSubmitted(data)
    setSubmitting(false)
  }

  const currentSection = SECTIONS.find(s => s.key === activeSection)
  const colour = SECTION_COLOURS[activeSection] || '#888'

  // ── Results screen ──
  if (submitted) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg-tertiary)', padding: '24px 16px' }}>
        <div style={{ maxWidth: 560, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 20 }}>
            <div style={{ fontSize: 36, marginBottom: 8 }}>🥋</div>
            <h1 style={{ fontSize: 20, fontWeight: 600 }}>TPT Analysis saved</h1>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
              {student.first_name} {student.last_name} · {countFilled()} / {ALL_FIELDS.length} fields recorded
            </p>
          </div>
          <div className="card" style={{ marginBottom: 12 }}>
            <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Summary</h2>
            {SECTIONS.filter(s => s.fields.some(f => submitted[f.key] !== null)).map(s => {
              const col = SECTION_COLOURS[s.key] || '#888'
              const filled = s.fields.filter(f => submitted[f.key] !== null)
              return (
                <div key={s.key} style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: col, marginBottom: 6 }}>{s.icon} {s.label}</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 16px' }}>
                    {filled.map(f => (
                      <div key={f.key} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '3px 0', borderBottom: '1px solid var(--border)' }}>
                        <span style={{ color: 'var(--text-secondary)' }}>{f.label}</span>
                        <span style={{ fontWeight: 600 }}>{submitted[f.key]} <span style={{ fontWeight: 400, color: 'var(--text-tertiary)' }}>{f.unit}</span></span>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn" style={{ flex: 1, justifyContent: 'center' }} onClick={() => { setSubmitted(null); setForm(emptyForm()); setStudent({ first_name: '', last_name: '', house: '' }); setNotes('') }}>New analysis</button>
            <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={() => setMode('history')}>View history</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-tertiary)', padding: '24px 16px' }}>
      <div style={{ maxWidth: 640, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 600 }}>🥋 Kickboxing TPT analysis</h1>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Kode Red — physical performance assessment</p>
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            {['form', 'history'].map(m => (
              <button key={m} onClick={() => setMode(m)} className={m === mode ? 'btn btn-primary btn-sm' : 'btn btn-sm'}
                style={{ textTransform: 'capitalize' }}>{m}</button>
            ))}
          </div>
        </div>

        {/* ── FORM MODE ── */}
        {mode === 'form' && (
          <>
            {/* Student selector */}
            <div className="card" style={{ marginBottom: 12 }}>
              <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Student</h2>
              {isAdmin && students.length > 0 ? (
                <div className="field-row">
                  <div className="field" style={{ gridColumn: '1/-1' }}>
                    <label>Select student</label>
                    <select onChange={e => {
                      const s = students.find(s => s.id === e.target.value)
                      if (s) {
                        const fn = s.members?.first_name || ''
                        const ln = s.members?.last_name || ''
                        const hn = s.members?.houses?.name || ''
                        setStudent({ id: s.id, first_name: fn, last_name: ln, house: hn })
                        loadPreviousEntry(fn, ln)
                      }
                    }}>
                      <option value="">Select PKA student…</option>
                      {students.map(s => (
                        <option key={s.id} value={s.id}>
                          {s.members?.first_name} {s.members?.last_name} · {s.student_ref} · {s.members?.houses?.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              ) : (
                <div className="field-row">
                  <div className="field"><label>First name</label><input value={student.first_name} onChange={e => setStudent(s => ({ ...s, first_name: e.target.value }))} placeholder="First name" /></div>
                  <div className="field"><label>Last name</label><input value={student.last_name} onChange={e => { setStudent(s => ({ ...s, last_name: e.target.value })); if (student.first_name) loadPreviousEntry(student.first_name, e.target.value) }} placeholder="Last name" /></div>
                </div>
              )}
              {student.house && (
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 6 }}>
                  House: <strong>{student.house}</strong>
                  {prevEntry && <span style={{ marginLeft: 8, color: '#1d9e75' }}>✓ Previous entry found — showing progress</span>}
                </div>
              )}
            </div>

            {/* Progress indicator */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <div style={{ flex: 1, height: 5, background: 'var(--bg-tertiary)', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${(countFilled() / ALL_FIELDS.length) * 100}%`, background: '#1D9E75', borderRadius: 4, transition: 'width 0.3s' }} />
              </div>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)', flexShrink: 0 }}>{countFilled()} / {ALL_FIELDS.length} fields</span>
            </div>

            {/* Section tabs — scrollable */}
            <div style={{ display: 'flex', gap: 4, overflowX: 'auto', paddingBottom: 4, marginBottom: 12 }}>
              {SECTIONS.map(s => {
                const col = SECTION_COLOURS[s.key]
                const filledCount = s.fields.filter(f => form[f.key] !== '').length
                const isActive = activeSection === s.key
                return (
                  <button key={s.key} onClick={() => setActiveSection(s.key)} style={{
                    flexShrink: 0, padding: '6px 12px', borderRadius: 'var(--radius)',
                    border: `1px solid ${isActive ? col : 'var(--border-strong)'}`,
                    background: isActive ? col : 'var(--bg)',
                    color: isActive ? '#fff' : 'var(--text-secondary)',
                    fontSize: 12, fontWeight: isActive ? 600 : 400, cursor: 'pointer',
                    fontFamily: 'var(--font-sans)',
                  }}>
                    {s.icon} {s.label}
                    {filledCount > 0 && <span style={{ marginLeft: 5, background: isActive ? 'rgba(255,255,255,0.25)' : col + '22', color: isActive ? '#fff' : col, borderRadius: 10, padding: '0 5px', fontSize: 10 }}>{filledCount}</span>}
                  </button>
                )
              })}
            </div>

            {/* Active section fields */}
            <div className="card" style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, paddingBottom: 10, borderBottom: '1px solid var(--border)' }}>
                <span style={{ fontSize: 18 }}>{currentSection?.icon}</span>
                <h2 style={{ fontSize: 14, fontWeight: 600, color: colour }}>{currentSection?.label}</h2>
                <span style={{ fontSize: 12, color: 'var(--text-tertiary)', marginLeft: 'auto' }}>
                  {currentSection?.fields.filter(f => form[f.key] !== '').length} / {currentSection?.fields.length} filled
                </span>
              </div>
              {currentSection?.fields.map(f => (
                <FieldRow
                  key={f.key} field={f} value={form[f.key]}
                  onChange={setField}
                  prevValue={prevEntry?.[f.key]}
                />
              ))}
            </div>

            {/* Notes */}
            <div className="card" style={{ marginBottom: 12 }}>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>Coaching notes</label>
                <textarea rows={3} value={notes} onChange={e => setNotes(e.target.value)}
                  placeholder="Observations, targets for next session…" style={{ resize: 'none' }} />
              </div>
            </div>

            <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', padding: 11 }}
              onClick={submit} disabled={submitting || !student.first_name || countFilled() === 0}>
              {submitting ? 'Saving…' : `Save TPT analysis (${countFilled()} fields)`}
            </button>
          </>
        )}

        {/* ── HISTORY MODE ── */}
        {mode === 'history' && (
          <>
            {loadingHistory
              ? <div className="loading">Loading history…</div>
              : history.length === 0
              ? <div className="empty-state"><h3>No analyses yet</h3><p>Saved analyses will appear here</p></div>
              : (
                <>
                  {/* Summary table */}
                  <div className="card" style={{ padding: 0, marginBottom: 12, overflowX: 'auto' }}>
                    <table style={{ minWidth: 600 }}>
                      <thead>
                        <tr>
                          <th>Date</th><th>Student</th><th>House</th>
                          <th style={{ textAlign: 'center' }}>Weight</th>
                          <th style={{ textAlign: 'center' }}>Punches</th>
                          <th style={{ textAlign: 'center' }}>Push-ups</th>
                          <th style={{ textAlign: 'center' }}>Plank</th>
                          <th style={{ textAlign: 'center' }}>V-jump</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {history.map(h => (
                          <tr key={h.id} style={selectedHistory?.id === h.id ? { background: 'var(--bg-secondary)' } : {}}>
                            <td style={{ fontSize: 11, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                              {new Date(h.assessed_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' })}
                            </td>
                            <td style={{ fontWeight: 500 }}>{h.first_name} {h.last_name}</td>
                            <td style={{ fontSize: 12 }}>{h.house || '—'}</td>
                            <td style={{ textAlign: 'center', fontSize: 13 }}>{h.weight_kg ?? '—'}</td>
                            <td style={{ textAlign: 'center', fontSize: 13 }}>{h.straight_punches ?? '—'}</td>
                            <td style={{ textAlign: 'center', fontSize: 13 }}>{h.push_ups ?? '—'}</td>
                            <td style={{ textAlign: 'center', fontSize: 13 }}>{h.flat_plank ?? '—'}s</td>
                            <td style={{ textAlign: 'center', fontSize: 13 }}>{h.vertical_jump ?? '—'}</td>
                            <td>
                              <button className="btn btn-sm" onClick={() => setSelectedHistory(selectedHistory?.id === h.id ? null : h)}>
                                {selectedHistory?.id === h.id ? 'Close' : 'View'}
                              </button>
                              {isAdmin && (
                                <button className="btn btn-sm" style={{ color: '#a32d2d', marginLeft: 4 }} onClick={() => deleteEntry(h)}>
                                  Delete
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Expanded detail card */}
                  {selectedHistory && (
                    <div className="card" style={{ marginBottom: 12 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14 }}>
                        <div>
                          <h2 style={{ fontSize: 15, fontWeight: 600 }}>{selectedHistory.first_name} {selectedHistory.last_name}</h2>
                          <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                            {new Date(selectedHistory.assessed_at).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                          </p>
                        </div>
                        <button onClick={() => setSelectedHistory(null)} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--text-secondary)' }}>✕</button>
                      </div>
                      {SECTIONS.map(s => {
                        const filled = s.fields.filter(f => selectedHistory[f.key] !== null && selectedHistory[f.key] !== undefined)
                        if (filled.length === 0) return null
                        const col = SECTION_COLOURS[s.key]
                        return (
                          <div key={s.key} style={{ marginBottom: 14 }}>
                            <div style={{ fontSize: 12, fontWeight: 600, color: col, marginBottom: 6 }}>{s.icon} {s.label}</div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '3px 16px' }}>
                              {filled.map(f => (
                                <div key={f.key} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
                                  <span style={{ color: 'var(--text-secondary)' }}>{f.label}</span>
                                  <span style={{ fontWeight: 600 }}>{selectedHistory[f.key]} <span style={{ fontWeight: 400, color: 'var(--text-tertiary)', fontSize: 10 }}>{f.unit}</span></span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )
                      })}
                      {selectedHistory.notes && (
                        <div style={{ background: 'var(--bg-secondary)', borderRadius: 'var(--radius)', padding: '10px 12px', fontSize: 13, color: 'var(--text-secondary)', marginTop: 8 }}>
                          <strong style={{ color: 'var(--text)' }}>Notes: </strong>{selectedHistory.notes}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )
            }
          </>
        )}
      </div>
    </div>
  )
}
