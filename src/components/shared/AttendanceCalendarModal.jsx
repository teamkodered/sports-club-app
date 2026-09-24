import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase.js'
import { toLocalISO, classesDueOn } from '../../lib/attendanceDays.js'

// Popup attendance calendar for one student -- same colours, rules and
// database writes as the calendar on the athlete profile's Sessions tab:
//   dark green  = attended every class that day
//   light green = attended some of that day's classes
//   red         = marked absent, or missed a class they were due at
//   plain       = no class / holiday / cleared (excused)
// Tapping a day cycles it (attended -> absent -> cleared -> attended),
// or opens a per-class picker on days with more than one class.
// Closes with the X button, a click outside, or Escape.

const pad = n => String(n).padStart(2, '0')

export default function AttendanceCalendarModal({ student, onClose, onChanged }) {
  const studentId = student.id
  const name = [student.members?.first_name, student.members?.last_name].filter(Boolean).join(' ')
  const [calMonth, setCalMonth] = useState(() => { const d = new Date(); return { year: d.getFullYear(), month: d.getMonth() } })
  const [rows, setRows] = useState([])
  const [assignedClasses, setAssignedClasses] = useState([])
  const [holidays, setHolidays] = useState([])
  const [loading, setLoading] = useState(true)
  const [busyDate, setBusyDate] = useState(null)
  const [multiDay, setMultiDay] = useState(null) // { dateStr, classes }
  const [multiSelected, setMultiSelected] = useState(new Set())
  const [savingMulti, setSavingMulti] = useState(false)

  async function refetchAttendance() {
    const { data } = await supabase.from('attendance')
      .select('id, session_date, attendance_type, class_id').eq('student_id', studentId)
    setRows(data || [])
  }

  useEffect(() => {
    let cancelled = false
    Promise.all([
      supabase.from('attendance').select('id, session_date, attendance_type, class_id').eq('student_id', studentId),
      supabase.from('student_class_assignments').select('id, class_id, classes(*)').eq('student_id', studentId),
      supabase.from('holidays').select('*'),
    ]).then(([att, cls, hol]) => {
      if (cancelled) return
      setRows(att.data || [])
      setAssignedClasses(cls.data || [])
      setHolidays(hol.data || [])
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [studentId])

  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') { multiDay ? setMultiDay(null) : onClose() } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [multiDay, onClose])

  async function cycleDay(dateStr) {
    setBusyDate(dateStr)
    try {
      const { data: existingRows, error: fetchErr } = await supabase.from('attendance')
        .select('id, attendance_type').eq('student_id', studentId).eq('session_date', dateStr)
        .order('id', { ascending: false })
      if (fetchErr) return alert('Error checking attendance: ' + fetchErr.message)
      const existing = existingRows?.[0] || null
      let error
      if (existing?.attendance_type && existing.attendance_type !== 'absent' && existing.attendance_type !== 'excused') {
        ({ error } = await supabase.from('attendance').update({ present: false, attendance_type: 'absent' }).eq('id', existing.id))
      } else if (existing?.attendance_type === 'absent') {
        ({ error } = await supabase.from('attendance').update({ attendance_type: 'excused' }).eq('id', existing.id))
      } else if (existing?.attendance_type === 'excused') {
        ({ error } = await supabase.from('attendance').update({ present: true, attendance_type: 'attended' }).eq('id', existing.id))
      } else {
        ({ error } = await supabase.from('attendance').insert({
          student_id: studentId, present: true, attendance_type: 'attended',
          session_date: dateStr, attended_at: new Date(dateStr + 'T12:00:00').toISOString(),
        }))
      }
      if (error) return alert('Error saving attendance: ' + error.message)
      await refetchAttendance()
      onChanged?.(dateStr)
    } finally {
      setBusyDate(null)
    }
  }

  async function openMultiDay(dateStr, classes) {
    const classIds = classes.map(a => a.classes?.id).filter(Boolean)
    const { data: existing } = await supabase.from('attendance')
      .select('class_id').eq('student_id', studentId).eq('session_date', dateStr)
      .in('class_id', classIds).neq('attendance_type', 'absent').neq('attendance_type', 'excused')
    setMultiSelected(new Set((existing || []).map(a => a.class_id)))
    setMultiDay({ dateStr, classes })
  }

  async function saveMultiDay() {
    if (!multiDay) return
    setSavingMulti(true)
    const { dateStr, classes } = multiDay
    for (const a of classes) {
      const classId = a.classes?.id
      if (!classId) continue
      const want = multiSelected.has(classId)
      const { data: existingRows } = await supabase.from('attendance')
        .select('id, attendance_type').eq('student_id', studentId).eq('session_date', dateStr).eq('class_id', classId)
      const existing = existingRows?.[0] || null
      if (want && !existing) {
        await supabase.from('attendance').insert({
          student_id: studentId, present: true, attendance_type: 'attended',
          session_date: dateStr, attended_at: new Date(dateStr + 'T12:00:00').toISOString(), class_id: classId,
        })
      } else if (want && existing && (existing.attendance_type === 'absent' || existing.attendance_type === 'excused')) {
        await supabase.from('attendance').update({ present: true, attendance_type: 'attended' }).eq('id', existing.id)
      } else if (!want && existing && existing.attendance_type !== 'absent' && existing.attendance_type !== 'excused') {
        await supabase.from('attendance').update({ attendance_type: 'excused' }).eq('id', existing.id)
      }
    }
    await refetchAttendance()
    setSavingMulti(false)
    setMultiDay(null)
    onChanged?.(dateStr)
  }

  const { year, month } = calMonth
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const startWeekday = (new Date(year, month, 1).getDay() + 6) % 7
  const todayStr = toLocalISO(new Date())
  const inMonth = d => d && d.startsWith(`${year}-${pad(month + 1)}-`)

  const attendedDays = new Set()
  const absentDays = new Set()
  const excusedDays = new Set()
  const attendedClassIdsByDate = {}
  rows.forEach(r => {
    if (!inMonth(r.session_date)) return
    if (r.attendance_type === 'absent') absentDays.add(r.session_date)
    else if (r.attendance_type === 'excused') excusedDays.add(r.session_date)
    else {
      attendedDays.add(r.session_date)
      ;(attendedClassIdsByDate[r.session_date] ||= new Set()).add(r.class_id || 'none')
    }
  })


  let attendedCount = 0, missedCount = 0
  const cells = []
  for (let i = 0; i < startWeekday; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${pad(month + 1)}-${pad(d)}`
    const classesToday = classesDueOn(dateStr, assignedClasses, holidays, studentId)
    const attended = attendedDays.has(dateStr)
    const absent = absentDays.has(dateStr)
    const excused = excusedDays.has(dateStr)
    const wasTrainingDay = classesToday.length > 0 && dateStr <= todayStr
    const red = !attended && (absent || (wasTrainingDay && !excused && dateStr < todayStr))
    const partial = attended && (attendedClassIdsByDate[dateStr]?.size || 0) < Math.max(classesToday.length, 1)
    if (attended) attendedCount++
    if (red) missedCount++
    cells.push({ d, dateStr, classesToday, attended, absent, excused, red, partial, wasTrainingDay })
  }

  const stepMonth = delta => setCalMonth(m => {
    const dt = new Date(m.year, m.month + delta, 1)
    return { year: dt.getFullYear(), month: dt.getMonth() }
  })

  return (
    <div onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 16 }}>
      <div className="card" onClick={e => e.stopPropagation()} role="dialog" aria-label={`Attendance for ${name}`}
        style={{ width: '100%', maxWidth: 380, maxHeight: '90vh', overflowY: 'auto', position: 'relative' }}>
        <button onClick={onClose} aria-label="Close"
          style={{ position: 'absolute', top: 10, right: 10, background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--text-secondary)', lineHeight: 1 }}>✕</button>
        <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 2, paddingRight: 28 }}>{name}</h3>
        <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 12 }}>
          {loading ? 'Loading attendance…' : `${attendedCount} attended · ${missedCount} missed this month`}
        </p>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <button className="btn btn-sm" onClick={() => stepMonth(-1)} aria-label="Previous month">←</button>
          <span style={{ fontSize: 13, fontWeight: 600 }}>{new Date(year, month, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</span>
          <button className="btn btn-sm" onClick={() => stepMonth(1)} aria-label="Next month">→</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 4, marginBottom: 6 }}>
          {['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map(d => (
            <div key={d} style={{ textAlign: 'center', fontSize: 10, color: 'var(--text-tertiary)' }}>{d}</div>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 4, opacity: loading ? 0.4 : 1 }}>
          {cells.map((c, i) => {
            if (!c) return <div key={i} />
            const bg = c.attended ? (c.partial ? '#8ED1B0' : '#1D9E75') : c.red ? '#E24B4A' : 'transparent'
            const fg = c.attended || c.red ? '#fff' : 'var(--text-secondary)'
            const title = (c.attended ? 'Attended — tap to mark absent'
              : c.absent ? 'Marked absent — tap to clear'
              : c.excused ? 'Cleared — tap to mark attended'
              : c.red ? 'Missed — tap to mark attended'
              : 'Tap to mark attended')
              + (c.classesToday.length ? `\nClass: ${c.classesToday.map(a => `${a.classes?.name} ${a.classes?.start_time?.slice(0, 5) || ''}`).join(', ')}` : '')
            return (
              <button key={i} type="button" title={title} disabled={loading || busyDate === c.dateStr}
                onClick={() => c.classesToday.length > 1 ? openMultiDay(c.dateStr, c.classesToday) : cycleDay(c.dateStr)}
                style={{
                  aspectRatio: '0.9', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  borderRadius: 6, fontSize: 12, background: bg, color: fg, cursor: 'pointer', fontFamily: 'var(--font-sans)',
                  border: c.dateStr === todayStr ? '2px solid var(--text)' : (!c.attended && !c.red ? '1px solid var(--border)' : 'none'),
                  opacity: busyDate === c.dateStr ? 0.5 : 1,
                }}>
                {c.d}
              </button>
            )
          })}
        </div>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 12, fontSize: 11, color: 'var(--text-secondary)' }}>
          {[['#1D9E75', 'Attended'], ['#8ED1B0', 'Some classes'], ['#E24B4A', 'Missed / absent']].map(([col, label]) => (
            <span key={label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: col, display: 'inline-block' }} />{label}
            </span>
          ))}
        </div>

        {multiDay && (
          <div onClick={() => setMultiDay(null)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 210, padding: 16 }}>
            <div className="card" onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 340 }}>
              <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>
                {new Date(multiDay.dateStr + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' })}
              </h3>
              <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 12 }}>
                {multiDay.classes.length} classes this day. Tick which ones {student.members?.first_name} attended.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                {multiDay.classes.map((a, i) => {
                  const classId = a.classes?.id
                  return (
                    <label key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
                      <input type="checkbox" checked={multiSelected.has(classId)}
                        onChange={() => setMultiSelected(prev => { const n = new Set(prev); n.has(classId) ? n.delete(classId) : n.add(classId); return n })} />
                      {a.classes?.name} — {a.classes?.start_time?.slice(0, 5)}
                    </label>
                  )
                })}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-primary" disabled={savingMulti} onClick={saveMultiDay}>{savingMulti ? 'Saving…' : 'Save'}</button>
                <button className="btn" onClick={() => setMultiDay(null)}>Cancel</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
