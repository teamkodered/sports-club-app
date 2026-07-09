import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabase.js'
import { useAuth } from '../../hooks/useAuth.jsx'

// ── Category definitions matching the exact sheet ──
const CATEGORIES = {
  Technical: [
    { key: 'shapes',           label: 'Shape(s)' },
    { key: 'punch_quality',    label: 'Punch quality & repertoire' },
    { key: 'footwork',         label: 'Footwork' },
    { key: 'defence',          label: 'Defence(s)' },
    { key: 'counters',         label: 'Counters' },
    { key: 'attack',           label: 'Attack' },
    { key: 'combinations',     label: 'Combinations' },
    { key: 'change_of_tempo',  label: 'Change of tempo' },
    { key: 'use_of_phases',    label: 'Use of phases' },
    { key: 'distance',         label: 'Distance' },
    { key: 'flow',             label: 'Flow' },
    { key: 'self_expression',  label: 'Self expression' },
  ],
  Physical: [
    { key: 'foot_speed',         label: 'Foot speed' },
    { key: 'limb_speed',         label: 'Limb speed' },
    { key: 'combination_speed',  label: 'Combination speed' },
    { key: 'reaction',           label: 'Reaction' },
    { key: 'punching_power',     label: 'Punching power' },
    { key: 'strength_upper',     label: 'Strength — upper body' },
    { key: 'strength_lower',     label: 'Strength — lower body' },
    { key: 'stability_core',     label: 'Stability — core' },
    { key: 'agility',            label: 'Agility' },
    { key: 'stop_n_go',          label: 'Stop & go' },
    { key: 'stamina_aerobic',    label: 'Stamina — aerobic' },
    { key: 'stamina_anaerobic',  label: 'Stamina — anaerobic' },
    { key: 'suppleness_upper',   label: 'Suppleness — upper body' },
    { key: 'suppleness_lower',   label: 'Suppleness — lower body' },
    { key: 'recovery',           label: 'Recovery' },
    { key: 'health',             label: 'Health' },
  ],
  Mental: [
    { key: 'read_opponent',             label: 'Ability to read opponent' },
    { key: 'tempo_rhythm',              label: 'Tempo / rhythm control' },
    { key: 'tactical_intelligence',     label: 'Tactical / strategic intelligence' },
    { key: 'ring_awareness',            label: 'Ring awareness' },
    { key: 'know_strengths_weaknesses', label: 'Know own strengths & weaknesses' },
    { key: 'heart_grit',                label: 'Heart / grit / mental toughness' },
    { key: 'concentration',             label: 'Concentration / thinking speed' },
    { key: 'timing',                    label: 'Timing' },
  ],
}

const ALL_KEYS = Object.values(CATEGORIES).flat().map(c => c.key)
const GROUP_COLOURS = { Technical: '#378ADD', Physical: '#1D9E75', Mental: '#E24B4A' }

function emptyScores() {
  return Object.fromEntries(ALL_KEYS.map(k => [k, 5]))
}

// ── Radar chart (pure SVG, no deps) ──
function RadarChart({ scores, compare, width = 320 }) {
  const groups = Object.entries(CATEGORIES)
  // Use first 10 keys as radar points for readability
  const RADAR_KEYS = [
    'shapes','footwork','defence','attack','combinations',
    'foot_speed','reaction','stamina_aerobic','heart_grit','timing',
  ]
  const RADAR_LABELS = [
    'Shape','Footwork','Defence','Attack','Combos',
    'Foot spd','Reaction','Stamina','Mental','Timing',
  ]
  const N = RADAR_KEYS.length
  const cx = width / 2, cy = width / 2, r = width * 0.38
  const angle = (i) => (Math.PI * 2 * i) / N - Math.PI / 2

  function pts(vals, scale = 10) {
    return RADAR_KEYS.map((k, i) => {
      const v = (vals[k] || 0) / scale
      return [cx + r * v * Math.cos(angle(i)), cy + r * v * Math.sin(angle(i))]
    })
  }

  const gridLevels = [2, 4, 6, 8, 10]
  const mainPts = pts(scores)
  const cmpPts  = compare ? pts(compare) : null

  return (
    <svg width={width} height={width} viewBox={`0 0 ${width} ${width}`} style={{ display: 'block', margin: '0 auto' }}>
      {/* Grid rings */}
      {gridLevels.map(level => {
        const ringPts = RADAR_KEYS.map((_, i) => {
          const v = level / 10
          return `${cx + r * v * Math.cos(angle(i))},${cy + r * v * Math.sin(angle(i))}`
        }).join(' ')
        return <polygon key={level} points={ringPts} fill="none" stroke="var(--border)" strokeWidth="0.5" />
      })}
      {/* Spokes */}
      {RADAR_KEYS.map((_, i) => (
        <line key={i} x1={cx} y1={cy}
          x2={cx + r * Math.cos(angle(i))} y2={cy + r * Math.sin(angle(i))}
          stroke="var(--border)" strokeWidth="0.5" />
      ))}
      {/* Compare polygon */}
      {cmpPts && (
        <polygon points={cmpPts.map(([x, y]) => `${x},${y}`).join(' ')}
          fill="#EF9F2722" stroke="#EF9F27" strokeWidth="1.5" />
      )}
      {/* Main polygon */}
      <polygon points={mainPts.map(([x, y]) => `${x},${y}`).join(' ')}
        fill="#378ADD33" stroke="#378ADD" strokeWidth="2" />
      {/* Dots */}
      {mainPts.map(([x, y], i) => <circle key={i} cx={x} cy={y} r={3} fill="#378ADD" />)}
      {/* Labels */}
      {RADAR_KEYS.map((k, i) => {
        const lx = cx + (r + 18) * Math.cos(angle(i))
        const ly = cy + (r + 18) * Math.sin(angle(i))
        return (
          <text key={i} x={lx} y={ly} textAnchor="middle" dominantBaseline="central"
            fontSize="9" fill="var(--text-secondary)" fontFamily="var(--font-sans, sans-serif)">
            {RADAR_LABELS[i]}
          </text>
        )
      })}
    </svg>
  )
}

// ── Score slider row ──
function ScoreRow({ label, field, value, onChange }) {
  const colour = value <= 3 ? '#E24B4A' : value <= 6 ? '#EF9F27' : '#1D9E75'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
      <span style={{ fontSize: 12, flex: 1, color: 'var(--text)' }}>{label}</span>
      <input type="range" min={1} max={10} value={value}
        onChange={e => onChange(field, parseInt(e.target.value))}
        style={{ width: 110, accentColor: colour }} />
      <div style={{
        width: 28, height: 28, borderRadius: '50%', background: colour + '22',
        color: colour, fontSize: 13, fontWeight: 700,
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>{value}</div>
    </div>
  )
}

// ── Group average badge ──
function GroupAvg({ group, scores }) {
  const keys = CATEGORIES[group].map(c => c.key)
  const avg = (keys.reduce((s, k) => s + (scores[k] || 0), 0) / keys.length).toFixed(1)
  const colour = GROUP_COLOURS[group] || '#888'
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0 6px', marginBottom: 4 }}>
      <h3 style={{ fontSize: 14, fontWeight: 600, color: colour }}>{group}</h3>
      <div style={{ fontSize: 12, background: colour + '18', color: colour, borderRadius: 20, padding: '2px 10px', fontWeight: 600 }}>
        avg {avg} / 10
      </div>
    </div>
  )
}

export default function BoxingTPT() {
  const { profile, isAdmin } = useAuth()
  const [mode, setMode] = useState('form') // 'form' | 'history'
  const [scores, setScores] = useState(emptyScores)
  const [student, setStudent] = useState({ first_name: '', last_name: '' })
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(null)
  const [history, setHistory] = useState([])
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [compareId, setCompareId] = useState(null)
  const [students, setStudents] = useState([])
  const [activeGroup, setActiveGroup] = useState('Technical')

  useEffect(() => {
    if (mode === 'history') loadHistory()
    if (isAdmin) loadStudents()
  }, [mode])

  async function loadStudents() {
    const { data } = await supabase
      .from('students')
      .select('id, student_ref, members(first_name, last_name)')
      .eq('discipline', 'KRBA')
    setStudents(data || [])
  }

  async function loadHistory() {
    setLoadingHistory(true)
    const { data } = await supabase
      .from('tpt_boxing')
      .select('*')
      .order('assessed_at', { ascending: false })
      .limit(50)
    setHistory(data || [])
    setLoadingHistory(false)
  }

  function setScore(key, val) {
    setScores(s => ({ ...s, [key]: val }))
  }

  function groupTotal(group) {
    const keys = CATEGORIES[group].map(c => c.key)
    return keys.reduce((s, k) => s + (scores[k] || 0), 0)
  }

  function grandTotal() {
    return ALL_KEYS.reduce((s, k) => s + (scores[k] || 0), 0)
  }

  async function submit() {
    setSubmitting(true)
    const payload = {
      first_name: student.first_name,
      last_name: student.last_name,
      student_id: student.id || null,
      assessed_by: profile?.id || null,
      notes,
      ...scores,
    }
    const { data, error } = await supabase.from('tpt_boxing').insert(payload).select().single()
    if (!error) setSubmitted(data)
    setSubmitting(false)
  }

  const compareEntry = compareId ? history.find(h => h.id === compareId) : null

  if (submitted) {
    const total = grandTotal()
    const maxTotal = ALL_KEYS.length * 10
    const pct = Math.round((total / maxTotal) * 100)
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg-tertiary)', padding: '24px 16px' }}>
        <div style={{ maxWidth: 560, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 20 }}>
            <div style={{ fontSize: 36, marginBottom: 8 }}>🥊</div>
            <h1 style={{ fontSize: 20, fontWeight: 600 }}>TPT Analysis saved</h1>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{student.first_name} {student.last_name}</p>
          </div>
          <div className="card" style={{ marginBottom: 14 }}>
            <RadarChart scores={scores} width={280} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginTop: 14 }}>
              {Object.keys(CATEGORIES).map(g => {
                const avg = (CATEGORIES[g].map(c => scores[c.key] || 0).reduce((a, b) => a + b, 0) / CATEGORIES[g].length).toFixed(1)
                const col = GROUP_COLOURS[g]
                return (
                  <div key={g} style={{ background: col + '12', borderRadius: 'var(--radius)', padding: '10px 12px', textAlign: 'center' }}>
                    <div style={{ fontSize: 18, fontWeight: 700, color: col }}>{avg}</div>
                    <div style={{ fontSize: 11, color: col, marginTop: 2 }}>{g}</div>
                  </div>
                )
              })}
            </div>
            <div style={{ textAlign: 'center', marginTop: 14, padding: '10px 0', borderTop: '1px solid var(--border)' }}>
              <div style={{ fontSize: 28, fontWeight: 700 }}>{total} / {maxTotal}</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Total score — {pct}%</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn" style={{ flex: 1, justifyContent: 'center' }} onClick={() => { setSubmitted(null); setScores(emptyScores()); setStudent({ first_name: '', last_name: '' }); setNotes('') }}>New analysis</button>
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
            <h1 style={{ fontSize: 20, fontWeight: 600 }}>🥊 Boxing TPT analysis</h1>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Technical, Physical & Mental assessment</p>
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            {['form','history'].map(m => (
              <button key={m} onClick={() => setMode(m)} className={m === mode ? 'btn btn-primary btn-sm' : 'btn btn-sm'}
                style={{ textTransform: 'capitalize' }}>{m}</button>
            ))}
          </div>
        </div>

        {/* ── FORM MODE ── */}
        {mode === 'form' && (
          <>
            {/* Student */}
            <div className="card" style={{ marginBottom: 12 }}>
              <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Student</h2>
              {isAdmin && students.length > 0 ? (
                <div className="field">
                  <label>Select student</label>
                  <select onChange={e => {
                    const s = students.find(s => s.id === e.target.value)
                    if (s) setStudent({ id: s.id, first_name: s.members?.first_name || '', last_name: s.members?.last_name || '' })
                  }}>
                    <option value="">Select KRBA student…</option>
                    {students.map(s => (
                      <option key={s.id} value={s.id}>{s.members?.first_name} {s.members?.last_name} · {s.student_ref}</option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="field-row">
                  <div className="field"><label>First name</label><input value={student.first_name} onChange={e => setStudent(s => ({ ...s, first_name: e.target.value }))} placeholder="First name" /></div>
                  <div className="field"><label>Last name</label><input value={student.last_name} onChange={e => setStudent(s => ({ ...s, last_name: e.target.value }))} placeholder="Last name" /></div>
                </div>
              )}
            </div>

            {/* Live radar */}
            <div className="card" style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <h2 style={{ fontSize: 14, fontWeight: 600 }}>Live radar</h2>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{grandTotal()} / {ALL_KEYS.length * 10}</div>
              </div>
              <RadarChart scores={scores} compare={compareEntry} width={260} />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginTop: 10 }}>
                {Object.keys(CATEGORIES).map(g => {
                  const col = GROUP_COLOURS[g]
                  const avg = (groupTotal(g) / CATEGORIES[g].length).toFixed(1)
                  return (
                    <div key={g} onClick={() => setActiveGroup(g)} style={{
                      background: activeGroup === g ? col : col + '12',
                      borderRadius: 'var(--radius)', padding: '8px 10px', textAlign: 'center', cursor: 'pointer',
                    }}>
                      <div style={{ fontSize: 16, fontWeight: 700, color: activeGroup === g ? '#fff' : col }}>{avg}</div>
                      <div style={{ fontSize: 10, color: activeGroup === g ? '#fff' : col, marginTop: 1 }}>{g}</div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Group tabs + sliders */}
            <div className="card" style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: 12 }}>
                {Object.keys(CATEGORIES).map(g => (
                  <button key={g} onClick={() => setActiveGroup(g)} style={{
                    padding: '7px 14px', fontSize: 13, border: 'none', background: 'none', cursor: 'pointer',
                    borderBottom: `2px solid ${activeGroup === g ? GROUP_COLOURS[g] : 'transparent'}`,
                    color: activeGroup === g ? GROUP_COLOURS[g] : 'var(--text-secondary)',
                    fontWeight: activeGroup === g ? 600 : 400,
                  }}>{g}</button>
                ))}
              </div>
              <GroupAvg group={activeGroup} scores={scores} />
              {CATEGORIES[activeGroup].map(c => (
                <ScoreRow key={c.key} label={c.label} field={c.key} value={scores[c.key]} onChange={setScore} />
              ))}
            </div>

            {/* Notes */}
            <div className="card" style={{ marginBottom: 12 }}>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>Coaching notes</label>
                <textarea rows={3} value={notes} onChange={e => setNotes(e.target.value)}
                  placeholder="Key observations, areas to focus on, next steps…" style={{ resize: 'none' }} />
              </div>
            </div>

            <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', padding: '11px' }}
              onClick={submit} disabled={submitting || !student.first_name}>
              {submitting ? 'Saving…' : 'Save TPT analysis'}
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
                  {compareId && (
                    <div style={{ background: '#faeeda', borderRadius: 'var(--radius)', padding: '8px 12px', fontSize: 12, marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#854f0b' }}>
                      <span>Comparing against: <strong>{compareEntry?.first_name} {compareEntry?.last_name}</strong> — {new Date(compareEntry?.assessed_at).toLocaleDateString('en-GB')}</span>
                      <button onClick={() => setCompareId(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#854f0b', fontSize: 16 }}>✕</button>
                    </div>
                  )}
                  <div className="card" style={{ padding: 0 }}>
                    <table>
                      <thead>
                        <tr>
                          <th>Date</th><th>Student</th>
                          <th style={{ textAlign: 'center' }}>Tech</th>
                          <th style={{ textAlign: 'center' }}>Phys</th>
                          <th style={{ textAlign: 'center' }}>Mental</th>
                          <th style={{ textAlign: 'center', fontWeight: 700 }}>Total</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {history.map(h => {
                          const techAvg  = (CATEGORIES.Technical.map(c => h[c.key] || 0).reduce((a, b) => a + b) / CATEGORIES.Technical.length).toFixed(1)
                          const physAvg  = (CATEGORIES.Physical.map(c => h[c.key] || 0).reduce((a, b) => a + b) / CATEGORIES.Physical.length).toFixed(1)
                          const mentAvg  = (CATEGORIES.Mental.map(c => h[c.key] || 0).reduce((a, b) => a + b) / CATEGORIES.Mental.length).toFixed(1)
                          const total    = ALL_KEYS.reduce((s, k) => s + (h[k] || 0), 0)
                          const isCompare = h.id === compareId
                          return (
                            <tr key={h.id} style={isCompare ? { background: '#faeeda44' } : {}}>
                              <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                                {new Date(h.assessed_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' })}
                              </td>
                              <td style={{ fontWeight: 500 }}>{h.first_name} {h.last_name}</td>
                              <td style={{ textAlign: 'center', color: GROUP_COLOURS.Technical, fontWeight: 600 }}>{techAvg}</td>
                              <td style={{ textAlign: 'center', color: GROUP_COLOURS.Physical, fontWeight: 600 }}>{physAvg}</td>
                              <td style={{ textAlign: 'center', color: GROUP_COLOURS.Mental, fontWeight: 600 }}>{mentAvg}</td>
                              <td style={{ textAlign: 'center', fontWeight: 700 }}>{total}</td>
                              <td>
                                <button className="btn btn-sm" onClick={() => setCompareId(isCompare ? null : h.id)}>
                                  {isCompare ? 'Clear' : 'Compare'}
                                </button>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )
            }
          </>
        )}
      </div>
    </div>
  )
}
