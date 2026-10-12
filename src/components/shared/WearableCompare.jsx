import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase.js'

// Coach view -- Wearables "By day" / "By session": compare every athlete's wearable
// data for one day, or for one class session (the athletes who attended that class,
// with their workouts that overlap the class time, plus any heart rate sessions
// they recorded with the app's live / background reader).

const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
const iso = d => { const z = new Date(d); return `${z.getFullYear()}-${String(z.getMonth() + 1).padStart(2, '0')}-${String(z.getDate()).padStart(2, '0')}` }
const hm = s => s ? `${Math.floor(s / 3600) ? Math.floor(s / 3600) + 'h ' : ''}${Math.round((s % 3600) / 60)}m` : '—'
const t5 = t => (t || '').slice(0, 5)
const nameOf = s => `${s?.members?.first_name || ''} ${s?.members?.last_name || ''}`.trim()

export default function WearableCompare({ mode, students = [], classes = [], onOpen, providerLabel = p => p }) {
  const [date, setDate] = useState(iso(new Date()))
  const [classId, setClassId] = useState('')
  const [rows, setRows] = useState(null)
  const [sortBy, setSortBy] = useState('avg')
  const dayName = DAYS[new Date(date + 'T12:00:00').getDay()]
  const dayClasses = useMemo(() => classes.filter(c => (c.day_of_week || '').toLowerCase() === dayName), [classes, dayName])
  useEffect(() => { if (mode === 'session' && dayClasses.length && !dayClasses.some(c => c.id === classId)) setClassId(dayClasses[0].id) }, [mode, dayClasses]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let cancelled = false
    setRows(null)
    ;(async () => {
      const dayStart = new Date(date + 'T00:00:00'), dayEnd = new Date(date + 'T23:59:59')
      let ids = null, windowFor = () => [dayStart, dayEnd], attBy = {}
      if (mode === 'session') {
        const cls = classes.find(c => c.id === classId)
        if (!cls) { setRows([]); return }
        const { data: att } = await supabase.from('attendance').select('student_id, attended_at, checked_out_at, present, attendance_type').eq('session_date', date).eq('class_id', classId)
        const here = (att || []).filter(a => a.present !== false && a.attendance_type !== 'absent' && a.attendance_type !== 'excused')
        ids = here.map(a => a.student_id)
        attBy = Object.fromEntries(here.map(a => [a.student_id, a]))
        const cs = new Date(`${date}T${t5(cls.start_time) || '00:00'}:00`), ce = new Date(`${date}T${t5(cls.end_time) || '23:59'}:00`)
        // class window, widened to the athlete's own check-in / check-out when they have one
        windowFor = id => {
          const a = attBy[id]
          const s = a?.attended_at && !String(a.attended_at).includes('T12:00:00') ? new Date(Math.min(cs, new Date(a.attended_at))) : cs
          const e = a?.checked_out_at ? new Date(Math.max(ce, new Date(a.checked_out_at))) : ce
          return [new Date(s.getTime() - 15 * 60000), new Date(e.getTime() + 15 * 60000)]
        }
        if (!ids.length) { if (!cancelled) setRows([]); return }
      }
      let wq = supabase.from('wearable_workouts').select('*').gte('start_time', new Date(dayStart.getTime() - 6 * 3600000).toISOString()).lte('start_time', dayEnd.toISOString())
      let dq = supabase.from('wearable_daily').select('*').eq('day', date)
      let fq = supabase.from('fit2fight_sessions').select('student_id, other_session').eq('session_date', date)
      if (ids) { wq = wq.in('student_id', ids); dq = dq.in('student_id', ids); fq = fq.in('student_id', ids) }
      const [{ data: wk }, { data: dl }, { data: f2f }] = await Promise.all([wq, dq, fq])
      if (cancelled) return
      const byS = {}
      const add = id => (byS[id] ||= { id, workouts: [], daily: null, hr: [] })
      for (const w of wk || []) {
        const [ws, we] = windowFor(w.student_id)
        const st = new Date(w.start_time), en = w.end_time ? new Date(w.end_time) : new Date(st.getTime() + (w.duration_seconds || 0) * 1000)
        if (en >= ws && st <= we) add(w.student_id).workouts.push(w)
      }
      for (const d of dl || []) add(d.student_id).daily = d
      for (const f of f2f || []) for (const e of [].concat(f.other_session || [])) if (e?.heart_rate) add(f.student_id).hr.push(e.heart_rate)
      if (ids) for (const id of ids) add(id)
      const list = Object.values(byS).map(r => {
        const s = students.find(x => x.id === r.id)
        const w = r.workouts, h = r.hr
        const secs = w.reduce((n, x) => n + (x.duration_seconds || 0), 0) + h.reduce((n, x) => n + (x.minutes || 0) * 60, 0)
        const avgs = [...w.map(x => x.avg_heart_rate), ...h.map(x => x.avg)].filter(Boolean)
        const maxs = [...w.map(x => x.max_heart_rate), ...h.map(x => x.max)].filter(Boolean)
        return {
          ...r, student: s, name: nameOf(s) || 'Athlete',
          devices: [...new Set([...w.map(x => providerLabel(x.provider)), ...(h.length ? ['HR strap'] : [])])].join(', '),
          secs, avg: avgs.length ? Math.round(avgs.reduce((a, b) => a + b, 0) / avgs.length) : null, max: maxs.length ? Math.max(...maxs) : null,
          strain: w.reduce((n, x) => n + (x.strain || 0), 0) || null, kcal: w.reduce((n, x) => n + (x.calories || 0), 0) || null,
          sports: [...new Set(w.map(x => x.sport_name).filter(Boolean))].join(', '),
        }
      }).filter(r => r.student)
      setRows(list)
    })().catch(() => !cancelled && setRows([]))
    return () => { cancelled = true }
  }, [mode, date, classId]) // eslint-disable-line react-hooks/exhaustive-deps

  const sorted = useMemo(() => {
    if (!rows) return null
    const key = { avg: r => r.avg, max: r => r.max, time: r => r.secs, strain: r => r.strain ?? r.kcal, name: null }[sortBy]
    return [...rows].sort((a, b) => key ? ((key(b) ?? -1) - (key(a) ?? -1)) : a.name.localeCompare(b.name))
  }, [rows, sortBy])
  const shiftDay = n => { const d = new Date(date + 'T12:00:00'); d.setDate(d.getDate() + n); setDate(iso(d)) }
  const th = (k, l) => <button type="button" onClick={() => setSortBy(k)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: sortBy === k ? 'var(--text)' : 'var(--text-tertiary)', fontWeight: 700, fontSize: 11, fontFamily: 'inherit' }}>{l}{sortBy === k ? ' ▾' : ''}</button>

  return (
    <div className="card" style={{ padding: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
        <button type="button" className="btn btn-sm" onClick={() => shiftDay(-1)}>‹</button>
        <input type="date" value={date} onChange={e => e.target.value && setDate(e.target.value)} style={{ fontSize: 13 }} />
        <button type="button" className="btn btn-sm" onClick={() => shiftDay(1)}>›</button>
        {mode === 'session' && (
          <select value={classId} onChange={e => setClassId(e.target.value)} style={{ fontSize: 13, flex: 1, minWidth: 160 }}>
            {dayClasses.length === 0 && <option value="">No classes on this day</option>}
            {dayClasses.map(c => <option key={c.id} value={c.id}>{c.name} {t5(c.start_time)}–{t5(c.end_time)}</option>)}
          </select>
        )}
      </div>
      <p style={{ fontSize: 11, color: 'var(--text-tertiary)', margin: '0 0 8px' }}>
        {mode === 'session' ? 'Athletes who attended this class, with their wearable workouts during the class (and any heart rate sessions recorded in the app).' : 'Every athlete with wearable data on this day.'} Tap a column to sort, a name to open the athlete.
      </p>
      {sorted == null ? <p style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Loading…</p> : sorted.length === 0 ? (
        <p style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{mode === 'session' ? 'Nobody marked in for this class yet.' : 'No wearable data for this day.'}</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead><tr style={{ textAlign: 'left' }}>
              <th style={{ padding: '4px 6px' }}>{th('name', 'Athlete')}</th>
              <th style={{ padding: '4px 6px' }}>{th('time', 'Time')}</th>
              <th style={{ padding: '4px 6px' }}>{th('avg', 'Avg HR')}</th>
              <th style={{ padding: '4px 6px' }}>{th('max', 'Max HR')}</th>
              <th style={{ padding: '4px 6px' }}>{th('strain', 'Strain / kcal')}</th>
              {mode === 'day' && <th style={{ padding: '4px 6px', fontSize: 11, color: 'var(--text-tertiary)' }}>Sleep · Recovery</th>}
            </tr></thead>
            <tbody>
              {sorted.map(r => (
                <tr key={r.id} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '6px' }}>
                    <button type="button" onClick={() => onOpen?.(r.student)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--text)', fontWeight: 600, fontFamily: 'inherit', textAlign: 'left' }}>{r.name}</button>
                    <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{r.devices || 'no wearable data'}{r.sports ? ` · ${r.sports}` : ''}</div>
                  </td>
                  <td style={{ padding: '6px', fontFamily: 'Orbitron, sans-serif', fontSize: 11 }}>{r.secs ? hm(r.secs) : '—'}</td>
                  <td style={{ padding: '6px', fontFamily: 'Orbitron, sans-serif', fontSize: 11, color: '#EF9F27' }}>{r.avg ?? '—'}</td>
                  <td style={{ padding: '6px', fontFamily: 'Orbitron, sans-serif', fontSize: 11, color: '#E24B4A' }}>{r.max ?? '—'}</td>
                  <td style={{ padding: '6px', fontFamily: 'Orbitron, sans-serif', fontSize: 11 }}>{r.strain != null ? Number(r.strain).toFixed(1) : r.kcal ? `${Math.round(r.kcal)} kcal` : '—'}</td>
                  {mode === 'day' && <td style={{ padding: '6px', fontSize: 11 }}>{r.daily?.sleep_seconds ? hm(r.daily.sleep_seconds) : '—'} · {r.daily?.recovery_score != null ? `${Math.round(r.daily.recovery_score)}%` : '—'}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
