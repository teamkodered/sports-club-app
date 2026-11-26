import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase.js'

// Coach view: the Check in side menu (matches the athlete app's) -- check this athlete in to one of today's classes,
// log a Fit II Fight session for them, Sweep the sheds, Wearables, MTP.
const today = () => new Date().toISOString().split('T')[0]
const dowName = () => new Date().toLocaleDateString('en-GB', { weekday: 'long' }).toLowerCase()

export default function CoachCheckInDrawer({ student, onClose, onDone, onLogSession, onSweep, onWearables, wearablesLabel, onMtp }) {
  const [classes, setClasses] = useState(null)
  const [have, setHave] = useState({})
  const [busy, setBusy] = useState('')
  const name = student?.members ? `${student.members.first_name} ${student.members.last_name}` : 'this athlete'
  const load = async () => {
    if (!student?.id) return
    const d = today()
    const [{ data: asg }, { data: att }] = await Promise.all([
      supabase.from('student_class_assignments').select('class_id, start_date, end_date, classes(id, name, day_of_week, start_time, end_time)').eq('student_id', student.id),
      supabase.from('attendance').select('id, class_id, attendance_type').eq('student_id', student.id).eq('session_date', d),
    ])
    const todays = (asg || []).filter(a => a.classes && String(a.classes.day_of_week || '').toLowerCase().includes(dowName())
      && (!a.start_date || a.start_date <= d) && (!a.end_date || a.end_date >= d))
      .map(a => a.classes).sort((a, b) => String(a.start_time).localeCompare(String(b.start_time)))
    setClasses(todays)
    setHave(Object.fromEntries((att || []).filter(a => a.attendance_type !== 'absent' && a.attendance_type !== 'excused').map(a => [a.class_id || '__none', a.id])))
  }
  useEffect(() => { load() }, [student?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const checkIn = async classId => {
    setBusy(classId || '__none')
    const { error } = await supabase.from('attendance').insert({ student_id: student.id, present: true, attendance_type: 'attended', session_date: today(), attended_at: new Date().toISOString(), class_id: classId || null })
    setBusy('')
    if (error) { alert('Could not check in: ' + error.message); return }
    await load(); onDone?.()
  }
  const big = { width: '100%', justifyContent: 'center', padding: '12px', fontWeight: 800, fontStyle: 'italic', marginBottom: 8 }
  return (
    <div role="dialog" aria-modal="true" onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 400, background: 'rgba(0,0,0,.55)', display: 'flex', justifyContent: 'flex-end' }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 'min(360px, 88vw)', height: '100%', overflowY: 'auto', background: 'var(--bg-secondary, #14181C)', borderLeft: '1px solid var(--border)', padding: 'calc(16px + env(safe-area-inset-top, 0px)) 16px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
          <b style={{ flex: 1, fontSize: 16 }}>Check in · {name}</b>
          <button type="button" className="btn btn-sm" onClick={onClose}>✕</button>
        </div>
        <div style={{ fontSize: 11, letterSpacing: 2, color: 'var(--text-tertiary)', marginBottom: 6 }}>TODAY'S CLASSES</div>
        {classes == null ? <p style={{ fontSize: 12 }}>Loading…</p> : classes.length === 0 ? (
          <>
            <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: '0 0 8px' }}>No class assigned today.</p>
            <button type="button" className="btn btn-primary" style={big} disabled={!!have.__none || busy === '__none'} onClick={() => checkIn(null)}>{have.__none ? '✓ Checked in today' : `✓ Check ${student?.members?.first_name || 'in'} in (no class)`}</button>
          </>
        ) : classes.map(c => (
          <button key={c.id} type="button" className={`btn ${have[c.id] ? '' : 'btn-primary'}`} style={big} disabled={!!have[c.id] || busy === c.id} onClick={() => checkIn(c.id)}>
            {have[c.id] ? '✓ Checked in' : '✓ Check in'} · {c.name} {String(c.start_time || '').slice(0, 5)}
          </button>
        ))}
        <div style={{ height: 1, background: 'var(--border)', margin: '12px 0' }} />
        <button type="button" className="btn" style={big} onClick={onLogSession}>💪 Log session</button>
        <button type="button" className="btn" style={{ ...big, color: '#C9CED6' }} onClick={onSweep}>🧹 Sweep the sheds</button>
        <button type="button" className="btn" style={big} onClick={onWearables}>⌚ {wearablesLabel || 'Wearables'}</button>
        <button type="button" className="btn" style={big} onClick={onMtp}>📊 MTP</button>
      </div>
    </div>
  )
}
