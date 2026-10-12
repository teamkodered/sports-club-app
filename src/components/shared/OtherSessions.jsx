import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase.js'
import { matchClass, workoutDate, workoutRange, fmtTime } from '../../lib/sessionMatch.js'

// Physical -> "Other sessions": training outside the club timetable (last 30 days).
// Wearable workouts that don't match one of the athlete's classes, with their details
// (sport, time, duration, strain, heart rate, calories), plus sessions added by hand.
// Recorded only -- no attendance, no points.
const fmtDay = d => new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })

export default function OtherSessions({ studentId, canAdd = true, title = 'Other sessions' }) {
  const [rows, setRows] = useState(null)
  const [adding, setAdding] = useState(null)
  const [open, setOpen] = useState(false)

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
    setRows([...fromWear, ...manual].sort((a, b) => String(b.date).localeCompare(String(a.date))))
  }
  useEffect(() => { load() }, [studentId])

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
          <p className="oth-hint">Training outside the club timetable — recorded here, it doesn't count as class attendance.</p>
          {rows?.length === 0 && <p className="oth-hint">Nothing in the last 30 days.</p>}
          {(rows || []).map(r => (
            <div key={r.key} className="oth-row">
              <div>
                <b>{r.activity}</b> <span className="oth-muted">{fmtDay(r.date)}{r.when ? ` · ${r.when}` : ''}{r.minutes ? ` · ${r.minutes} min` : ''}</span>
                {!r.manual && (r.strain != null || r.avgHr || r.maxHr || r.kcal) && (
                  <div className="oth-stats">
                    {r.strain != null && <span>Strain <b>{Number(r.strain).toFixed(1)}</b></span>}
                    {r.avgHr ? <span>Avg HR <b>{Math.round(r.avgHr)}</b></span> : null}
                    {r.maxHr ? <span>Max HR <b>{Math.round(r.maxHr)}</b></span> : null}
                    {r.kcal ? <span><b>{r.kcal}</b> kcal</span> : null}
                    <span className="oth-src">⌚ {r.provider || 'wearable'}</span>
                  </div>
                )}
                {r.note && <div className="oth-muted">{r.note}</div>}
              </div>
              {r.manual && canAdd && <button type="button" className="oth-x" onClick={() => remove(r)} aria-label="Remove">×</button>}
            </div>
          ))}
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
          ) : <button type="button" className="btn btn-sm" style={{ marginTop: 8 }} onClick={() => setAdding({ date: new Date().toISOString().slice(0, 10), activity: '', minutes: '', note: '' })}>+ Add a session</button>)}
        </div>
      )}
    </div>
  )
}
