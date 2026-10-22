import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase.js'
import { matchClass, workoutDate, workoutRange, fmtTime } from '../../lib/sessionMatch.js'

// Physical -> "Other sessions": training outside the club timetable (last 30 days).
// Wearable workouts that don't match one of the athlete's classes, with their details
// (sport, time, duration, strain, heart rate, calories), plus sessions added by hand.
// Recorded only -- no attendance, no points.
const fmtDay = d => new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })

// The original Other session question (back, Oct 2026): quick types, notes and a result / score,
// saved to today's other_session as before (counts toward Physical).
export const OTHER_SESSION_PRESETS = ['Bout/Comp', 'External Sparring', 'Squad training session', 'Training in other sport'] // A-Z
const norm = a => String(a || 'Other').trim().replace(/\s+/g, ' ').toLowerCase().replace(/^\w/, c => c.toUpperCase())

export default function OtherSessions({ studentId, canAdd = true, title = 'Other sessions', todaysOther = [], onSaveOther, history = [] }) {
  const [rows, setRows] = useState(null)
  const [adding, setAdding] = useState(null)
  const [open, setOpen] = useState(false)
  const [openGroup, setOpenGroup] = useState(null)
  const [customType, setCustomType] = useState('')
  const [savedIdx, setSavedIdx] = useState(null)

  async function load() {
    if (!studentId) return
    const from = new Date(); from.setDate(from.getDate() - 30)
    const [wk, asg, man] = await Promise.all([
      supabase.from('wearable_workouts').select('*').eq('student_id', studentId).gte('start_time', from.toISOString()).order('start_time', { ascending: false }),
      supabase.from('student_class_assignments').select('classes(day_of_week, start_time, end_time, name)').eq('student_id', studentId),
      supabase.from('extra_sessions').select('*').eq('student_id', studentId).gte('session_date', from.toISOString().slice(0, 10)).order('session_date', { ascending: false }),
    ])
    const classes = (asg.data || []).map(a => a.classes).filter(Boolean)
    const fromWear = (wk.data || []).filter(w => !matchClass(w, classes)).map(w => {
      const { s, e } = workoutRange(w)
      const minutes = Math.round((w.duration_seconds || (e - s) / 1000) / 60)
      return { key: `w-${w.id}`, date: workoutDate(w), when: `${fmtTime(s)}–${fmtTime(e)}`, activity: w.sport_name || 'Workout', minutes, provider: w.provider,
        strain: w.strain, avgHr: w.avg_heart_rate, maxHr: w.max_heart_rate, kcal: w.kilojoules ? Math.round(w.kilojoules / 4.184) : (w.calories ?? null) }
    })
    const manual = (man.data || []).map(m => ({ key: `m-${m.id}`, id: m.id, date: m.session_date, activity: m.activity, minutes: m.minutes, note: m.note, manual: true }))
    const fromIso = from.toISOString().slice(0, 10)
    const logged = (history || []).filter(h => h.session_date >= fromIso).flatMap(h => [].concat(h.other_session || []).filter(e => e && typeof e === 'object').map((e, i) => ({
      key: `q-${h.session_date}-${i}`, date: h.session_date, activity: e.type || 'Other session', note: e.description || '', result: (e.sets || []).filter(Boolean).join(', '), logged: true, minutes: e.heart_rate?.minutes || null })))
    setRows([...fromWear, ...manual, ...logged].sort((a, b) => String(b.date).localeCompare(String(a.date))))
  }
  const todayKey = JSON.stringify((todaysOther || []).map(e => [e.type, e.description]))
  useEffect(() => { load() }, [studentId, history.length, todayKey]) // eslint-disable-line react-hooks/exhaustive-deps

  async function save() {
    if (!adding.activity?.trim()) return alert('What did you do? e.g. Run, Gym, Swimming')
    const { error } = await supabase.from('extra_sessions').insert({ student_id: studentId, session_date: adding.date, activity: adding.activity.trim(), minutes: parseInt(adding.minutes, 10) || null, note: adding.note?.trim() || null })
    if (error) return alert('Could not save: ' + error.message + (/extra_sessions/.test(error.message) ? '\n\n(Has supabase_other_sessions.sql been run?)' : ''))
    setAdding(null); load()
  }
  async function remove(r) {
    if (!window.confirm(`Remove "${r.activity}" on ${fmtDay(r.date)}?`)) return
    await supabase.from('extra_sessions').delete().eq('id', r.id); load()
  }

  const total = (rows || []).reduce((n, r) => n + (r.minutes || 0), 0)
  return (
    <div className="oth">
      <button type="button" className="oth-head" onClick={() => setOpen(v => !v)} aria-expanded={open}>
        <span>🏃 {title}</span>
        <span className="oth-sum">{rows ? `${rows.length} in 30 days${total ? ` · ${Math.round(total / 60 * 10) / 10}h` : ''}` : '…'} {open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div className="oth-body">
          <p className="oth-hint">Training outside the club timetable -- logged here, wearable workouts are added automatically.</p>

          {/* Today: the original question -- pick a type (or write your own), add notes + result */}
          {onSaveOther && canAdd && (
            <div className="oth-today">
              <div className="oth-today-title">Today</div>
              {todaysOther.filter(e => !e.heart_rate).map((entry, i) => {
                const idx = todaysOther.indexOf(entry)
                const upd = patch => { const next = [...todaysOther]; next[idx] = { ...next[idx], ...patch }; onSaveOther(next) }
                return (
                  <div key={idx} className="oth-entry">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                      <b>📦 {entry.type || 'Other session'}</b>
                      <button type="button" className="oth-x" onClick={() => onSaveOther(todaysOther.filter((_, j) => j !== idx))} aria-label="Remove">×</button>
                    </div>
                    <textarea id={`oth-notes-${idx}`} defaultValue={entry.description || ''} rows={4} placeholder="Notes about this session (how it went, result, what to work on…)" onBlur={e => e.target.value !== (entry.description || '') && upd({ description: e.target.value })} />
                    <button type="button" className="oth-save-btn" onClick={() => { const v = document.getElementById(`oth-notes-${idx}`)?.value ?? ''; upd({ description: v }); setSavedIdx(idx); setTimeout(() => setSavedIdx(x => x === idx ? null : x), 2000) }}>
                      {savedIdx === idx ? '✓ Saved' : '💾 Save session'}
                    </button>
                  </div>
                )
              })}
              <div className="oth-presets">
                {OTHER_SESSION_PRESETS.filter(r => !todaysOther.some(e => e.type === r)).map(r => (
                  <button key={r} type="button" className="oth-preset-btn" onClick={() => onSaveOther([...todaysOther, { type: r, sets: [] }])}>+ {r}</button>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                <input value={customType} onChange={e => setCustomType(e.target.value)} placeholder="Or write your own…" style={{ flex: 1 }} />
                <button type="button" className="btn btn-sm" disabled={!customType.trim()} onClick={() => { onSaveOther([...todaysOther, { type: customType.trim(), sets: [] }]); setCustomType('') }}>Add</button>
              </div>
            </div>
          )}

          {/* Last 30 days, grouped by activity (wearable + added + logged), each group collapsible */}
          {rows?.length === 0 && <p className="oth-hint">Nothing in the last 30 days.</p>}
          {Object.entries((rows || []).reduce((m, r) => ((m[norm(r.activity)] ||= []).push(r), m), {}))
            .sort((x, y) => x[0].localeCompare(y[0], undefined, { sensitivity: 'base' }))
            .map(([act, list]) => {
              const mins = list.reduce((n, r) => n + (r.minutes || 0), 0), isOpen = openGroup === act
              return (
                <div key={act} className="oth-group">
                  <button type="button" className="oth-group-head" onClick={() => setOpenGroup(g => g === act ? null : act)} aria-expanded={isOpen}>
                    <b>{act}</b>
                    <span className="oth-sum">{list.length}×{mins ? ` · ${Math.round(mins / 60 * 10) / 10}h` : ''} {isOpen ? '▾' : '▸'}</span>
                  </button>
                  {isOpen && list.map(r => (
                    <div key={r.key} className="oth-row">
                      <div>
                        <span className="oth-muted">{fmtDay(r.date)}{r.when ? ` · ${r.when}` : ''}{r.minutes ? ` · ${r.minutes} min` : ''}</span>
                        {!r.manual && !r.logged && (r.strain != null || r.avgHr || r.maxHr || r.kcal) && (
                          <div className="oth-stats">
                            {r.strain != null && <span>Strain <b>{Number(r.strain).toFixed(1)}</b></span>}
                            {r.avgHr ? <span>Avg HR <b>{Math.round(r.avgHr)}</b></span> : null}
                            {r.maxHr ? <span>Max HR <b>{Math.round(r.maxHr)}</b></span> : null}
                            {r.kcal ? <span><b>{r.kcal}</b> kcal</span> : null}
                            <span className="oth-src">⌚ {r.provider || 'wearable'}</span>
                          </div>
                        )}
                        {r.logged && <div className="oth-stats"><span className="oth-src" style={{ color: '#E6B800' }}>📦 logged</span>{r.result && <span>Result <b>{r.result}</b></span>}</div>}
                        {r.note && <div className="oth-muted">{r.note}</div>}
                      </div>
                      {r.manual && canAdd && <button type="button" className="oth-x" onClick={() => remove(r)} aria-label="Remove">×</button>}
                    </div>
                  ))}
                </div>
              )
            })}
          {canAdd && (adding ? (
            <div className="oth-add">
              <div style={{ display: 'flex', gap: 6 }}>
                <input type="date" value={adding.date} max={new Date().toISOString().slice(0, 10)} onChange={e => setAdding(a => ({ ...a, date: e.target.value }))} />
                <input type="number" inputMode="numeric" placeholder="Minutes" value={adding.minutes} onChange={e => setAdding(a => ({ ...a, minutes: e.target.value }))} style={{ width: 90 }} />
              </div>
              <input placeholder="Activity, e.g. Run, Gym, Swim" value={adding.activity} onChange={e => setAdding(a => ({ ...a, activity: e.target.value }))} />
              <input placeholder="Note (optional)" value={adding.note} onChange={e => setAdding(a => ({ ...a, note: e.target.value }))} />
              <div style={{ display: 'flex', gap: 6 }}><button type="button" className="btn btn-sm btn-primary" onClick={save}>Save</button><button type="button" className="btn btn-sm" onClick={() => setAdding(null)}>Cancel</button></div>
            </div>
          ) : <button type="button" className="btn btn-sm" style={{ marginTop: 8 }} onClick={() => setAdding({ date: new Date().toISOString().slice(0, 10), activity: '', minutes: '', note: '' })}>+ Add a past session</button>)}
        </div>
      )}
    </div>
  )
}
