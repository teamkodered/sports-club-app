import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../../lib/supabase.js'
import { useAuth } from '../../hooks/useAuth.jsx'

// 🎽 Coaches: grading requests from the students in THEIR classes (shared automatically when submitted).
// ✓ OK or ✗ Not ready (with a reason) -- the admin sees it in their list; their own approval + the
// messages to students are unchanged. "Please OK by" = a week before the grading date; a reminder
// pops up once per login while there are requests waiting and the OK-by date hasn't passed.
const fmt = d => new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
const okByOf = gd => { if (!gd) return null; const x = new Date(gd + 'T12:00:00'); x.setDate(x.getDate() - 7); return x.toISOString().split('T')[0] }

export default function MyGradingStudents() {
  const { profile, registerAccess, isAdmin } = useAuth()
  const [rows, setRows] = useState(null)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(null)
  const [reminder, setReminder] = useState(false)
  const cardRef = useRef(null)
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
      if (cancelled) return
      const list = (data || []).map(r => ({ ...r, classes: cls[r.student_id] || [] }))
      setRows(list)
      // 🔔 reminder once per login while some are waiting and the OK-by date hasn't passed
      const due = list.filter(r => !r.coach_ok && !r.coach_not_ready && (!okByOf(r.grading_date) || okByOf(r.grading_date) >= today))
      let shown = false; try { shown = sessionStorage.getItem('kc_grading_reminder') === '1' } catch { /* */ }
      if (due.length && !shown) { setReminder(true); try { sessionStorage.setItem('kc_grading_reminder', '1') } catch { /* */ } }
    })()
    return () => { cancelled = true }
  }, [isAdmin, JSON.stringify(classIds)]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!rows || !rows.length) return null
  const today = new Date().toISOString().split('T')[0]
  const waitingRows = rows.filter(r => !r.coach_ok && !r.coach_not_ready)
  const okBy = waitingRows.map(r => okByOf(r.grading_date)).filter(Boolean).sort()[0] || null
  const by = () => [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || 'Coach'

  async function setStatus(r, ok, note = null) {
    setBusy(r.id)
    const patch = ok ? { coach_ok: true, coach_not_ready: false, coach_note: null } : { coach_ok: false, coach_not_ready: true, coach_note: note }
    const { error } = await supabase.from('grading_expressions').update({ ...patch, coach_ok_by: by(), coach_ok_at: new Date().toISOString() }).eq('id', r.id)
    setBusy(null)
    if (error) { alert('Could not save: ' + error.message + (/coach_(not_ready|note)/.test(error.message) ? ' (run supabase_grading_coach_auto.sql)' : '')); return }
    setRows(prev => prev.map(x => x.id === r.id ? { ...x, ...patch, coach_ok_by: by() } : x))
  }
  function notReady(r) {
    const why = prompt(`Why isn't ${r.students?.members?.first_name || 'this student'} ready to grade? (e.g. needs more sessions)`)
    if (why == null) return
    setStatus(r, false, why.trim() || 'Not ready')
  }

  return (
    <>
      {reminder && createPortal(
        <div onClick={() => setReminder(false)} style={{ position: 'fixed', inset: 0, zIndex: 600, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div className="card" onClick={e => e.stopPropagation()} style={{ maxWidth: 360, width: '100%', padding: 20, textAlign: 'center' }}>
            <div style={{ fontSize: 30 }}>🎽</div>
            <div style={{ fontSize: 17, fontWeight: 700, margin: '6px 0' }}>{waitingRows.length} grading student{waitingRows.length === 1 ? '' : 's'} to check</div>
            <div style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 14 }}>
              From your classes{okBy ? <> · please OK by <b>{fmt(okBy)}</b></> : ''}. ✓ OK or ✗ Not ready for each one.
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn" style={{ flex: 1, justifyContent: 'center' }} onClick={() => setReminder(false)}>Later</button>
              <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={() => { setReminder(false); setOpen(true); setTimeout(() => cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100) }}>Check now</button>
            </div>
          </div>
        </div>, document.body)}
      <div ref={cardRef} className="card" style={{ marginBottom: 16, border: '1px solid #8B5CF666' }}>
        <button type="button" onClick={() => setOpen(o => !o)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--text)', textAlign: 'left', fontFamily: 'var(--font-sans)' }}>
          <b style={{ fontSize: 15, flex: 1 }}>🎽 Grading — my students</b>
          {waitingRows.length > 0 && <span style={{ background: '#8B5CF6', color: '#fff', borderRadius: 999, fontSize: 11, fontWeight: 700, padding: '2px 8px' }}>{waitingRows.length} to OK</span>}
          {okBy && waitingRows.length > 0 && <span style={{ fontSize: 11, fontWeight: 600, color: okBy < today ? 'var(--text-tertiary)' : '#EF9F27' }}>{okBy < today ? `OK-by date passed (${fmt(okBy)})` : `Please OK by ${fmt(okBy)}`}</span>}
          <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{open ? '▲' : '▼'}</span>
        </button>
        <div className={`kc-slide${open ? ' open' : ''}`}><div>
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', margin: '8px 0 4px' }}>Students from your classes taking the grading. ✓ OK if they're ready, ✗ Not ready with a reason if not -- the admin sees it before approving.</div>
          {rows.map(r => {
            const m = r.students?.members
            return (
              <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderTop: '1px solid var(--border)', flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 180px', minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{m ? `${m.first_name} ${m.last_name}` : (r.student_name || 'Student')}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{r.discipline} · {r.current_belt || '—'} → <b>{r.grading_for}</b>{r.grading_date ? ` · grading ${fmt(r.grading_date)}` : ''}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>🏫 {r.classes.map(c => `${c.day_of_week?.slice(0, 3) || ''} ${String(c.start_time || '').slice(0, 5)} ${c.name}`).join(' | ')}</div>
                  {r.coach_not_ready && <div style={{ fontSize: 12, color: '#E24B4A', marginTop: 2 }}>✗ Not ready: {r.coach_note}</div>}
                </div>
                {r.coach_ok ? (
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#1D9E75', textAlign: 'right' }}>✓ OK'd{r.coach_approved ? <><br /><span style={{ fontWeight: 500, color: 'var(--text-tertiary)' }}>admin approved</span></> : null}
                    <br /><button type="button" className="btn btn-sm" style={{ fontSize: 10, padding: '1px 6px', marginTop: 2 }} disabled={busy === r.id} onClick={() => notReady(r)}>change</button></span>
                ) : (
                  <span style={{ display: 'flex', gap: 6 }}>
                    <button type="button" className="btn btn-sm btn-primary" disabled={busy === r.id} onClick={() => setStatus(r, true)}>✓ OK</button>
                    <button type="button" className="btn btn-sm" style={{ color: '#E24B4A', borderColor: '#E24B4A' }} disabled={busy === r.id} onClick={() => notReady(r)}>{r.coach_not_ready ? '✗ Edit reason' : '✗ Not ready'}</button>
                  </span>
                )}
              </div>
            )
          })}
        </div></div>
      </div>
    </>
  )
}
