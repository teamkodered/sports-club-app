import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase.js'
import { useAuth } from '../../hooks/useAuth.jsx'

// 🎽 Coaches: grading requests from the students in THEIR classes -- check and confirm.
// Confirming here or in the admin grading list is the same thing, so either shows ✓ Confirmed.
export default function MyGradingStudents() {
  const { profile, registerAccess, isAdmin } = useAuth()
  const [rows, setRows] = useState(null)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(null)
  const classIds = registerAccess?.classes || null

  useEffect(() => {
    if (isAdmin || !classIds?.length) { setRows([]); return }
    let cancelled = false
    ;(async () => {
      const today = new Date().toISOString().split('T')[0]
      const { data: asg } = await supabase.from('student_class_assignments').select('*, classes(name, day_of_week, start_time)').in('class_id', classIds)
      const active = (asg || []).filter(a => (!a.start_date || a.start_date <= today) && (!a.end_date || a.end_date >= today))
      const cls = {}; active.forEach(a => { (cls[a.student_id] ||= []).push(a.classes) })
      const ids = Object.keys(cls)
      if (!ids.length) { if (!cancelled) setRows([]); return }
      const since = new Date(); since.setMonth(since.getMonth() - 3)
      const { data } = await supabase.from('grading_expressions')
        .select('*, students(id, members(first_name, last_name))').in('student_id', ids).not('sent_to_coach_at', 'is', null)
        .gte('created_at', since.toISOString()).order('created_at', { ascending: false })
      if (!cancelled) setRows((data || []).map(r => ({ ...r, classes: cls[r.student_id] || [] })))
    })()
    return () => { cancelled = true }
  }, [isAdmin, JSON.stringify(classIds)]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!rows || !rows.length) return null
  const waiting = rows.filter(r => !r.coach_ok).length

  async function confirm(r) {
    setBusy(r.id)
    const by = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || 'Coach'
    const { error } = await supabase.from('grading_expressions').update({ coach_ok: true, coach_ok_by: by, coach_ok_at: new Date().toISOString() }).eq('id', r.id)
    setBusy(null)
    if (error) { alert('Could not OK: ' + error.message); return }
    setRows(prev => prev.map(x => x.id === r.id ? { ...x, coach_ok: true, coach_ok_by: by } : x))
  }

  return (
    <div className="card" style={{ marginBottom: 16, border: '1px solid #8B5CF666' }}>
      <button type="button" onClick={() => setOpen(o => !o)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--text)', textAlign: 'left', fontFamily: 'var(--font-sans)' }}>
        <b style={{ fontSize: 15, flex: 1 }}>🎽 Grading — my students</b>
        {waiting > 0 && <span style={{ background: '#8B5CF6', color: '#fff', borderRadius: 999, fontSize: 11, fontWeight: 700, padding: '2px 8px' }}>{waiting} to OK</span>}
        <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{open ? '▲' : '▼'}</span>
      </button>
      <div className={`kc-slide${open ? ' open' : ''}`}><div>
        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', margin: '8px 0 4px' }}>Students from your classes taking the grading. Check each one's grade and press ✓ OK -- the admin is told, then confirms with the student.</div>
        {rows.map(r => {
          const m = r.students?.members
          return (
            <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderTop: '1px solid var(--border)' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{m ? `${m.first_name} ${m.last_name}` : (r.student_name || 'Student')}</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{r.discipline} · {r.current_belt || '—'} → <b>{r.grading_for}</b></div>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>🏫 {r.classes.map(c => `${c.day_of_week?.slice(0, 3) || ''} ${String(c.start_time || '').slice(0, 5)} ${c.name}`).join(' | ')}</div>
              </div>
              {r.coach_ok
                ? <span style={{ fontSize: 12, fontWeight: 700, color: '#1D9E75', textAlign: 'right' }}>✓ OK'd{r.coach_approved ? <><br /><span style={{ fontWeight: 500, color: 'var(--text-tertiary)' }}>admin approved</span></> : null}</span>
                : <button type="button" className="btn btn-sm btn-primary" disabled={busy === r.id} onClick={() => confirm(r)}>{busy === r.id ? '…' : '✓ OK'}</button>}
            </div>
          )
        })}
      </div></div>
    </div>
  )
}
