import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../../lib/supabase.js'
import { useAuth } from '../../hooks/useAuth.jsx'
import { beltStyle } from '../../lib/beltColours.js'
import BbbcLine from '../shared/BbbcLine.jsx'
import GradingRequestSheet from '../shared/GradingRequestSheet.jsx'

// 🎽 Coaches: grading requests from the students in THEIR classes (shared automatically when submitted).
// ✓ OK or ✗ Not ready (with a reason) -- the admin sees it in their list; their own approval + the
// messages to students are unchanged. "Please OK by" = a week before the grading date; a reminder
// pops up once per login while there are requests waiting and the OK-by date hasn't passed.
const fmt = d => new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
const okByOf = gd => { if (!gd) return null; const x = new Date(gd + 'T12:00:00'); x.setDate(x.getDate() - 7); return x.toISOString().split('T')[0] }

export default function MyGradingStudents() {
  const { profile, registerAccess, isAdmin } = useAuth()
  const [allClasses, setAllClasses] = useState([])          // admins: pick "my classes"
  const [pickMine, setPickMine] = useState(false)
  const [mineSaved, setMineSaved] = useState(null)          // admin's chosen class ids (members.access.my_classes)
  const [reload, setReload] = useState(0)
  const [q, setQ] = useState(''), [okF, setOkF] = useState('all'), [apprF, setApprF] = useState('all'), [sheet, setSheet] = useState(null)   // search + All / Not OK'd / OK'd
  const [rows, setRows] = useState(null)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(null)
  const [reminder, setReminder] = useState(false)
  const cardRef = useRef(null)
  const classIds = registerAccess?.classes || null

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      // which classes are "mine": coaches -> the classes in their access; admins -> classes where they're
      // the instructor (their initials, e.g. "DR", or their first / full name in the class's Instructor)
      let myIds = classIds
      if (isAdmin) {
        const fn = String(profile?.first_name || '').trim().toLowerCase(), ln = String(profile?.last_name || '').trim().toLowerCase()
        const initials = (fn[0] || '') + (ln[0] || '')
        const { data: cl } = await supabase.from('classes').select('id, name, day_of_week, start_time, instructor, active').order('day_of_week')
        if (!cancelled) setAllClasses((cl || []).filter(c => c.active !== false && !/register/i.test(c.name || '')))
        // classes they've picked themselves win; otherwise the classes with their initials / name as Instructor
        const { data: me } = await supabase.from('members').select('access').eq('id', profile?.id).maybeSingle()
        const picked = me?.access?.my_classes
        if (!cancelled) setMineSaved(Array.isArray(picked) ? picked : null)
        if (Array.isArray(picked) && picked.length) myIds = picked
        else myIds = (cl || []).filter(c => {
          const ins = String(c.instructor || '').toLowerCase()
          return ins && ins.split(/[,&/+]| and /).map(x => x.trim()).some(x => x === initials || (fn && (x === fn || x.startsWith(fn + ' ') || x === `${fn} ${ln}`)))
        }).map(c => c.id)
      }
      if (!myIds?.length) { if (!cancelled) setRows([]); return }
      const today = new Date().toISOString().split('T')[0]
      const from3 = new Date(); from3.setMonth(from3.getMonth() - 3)
      const { data: asg } = await supabase.from('student_class_assignments').select('*, classes(name, day_of_week, start_time)').in('class_id', myIds)
      const active = (asg || []).filter(a => (!a.start_date || a.start_date <= today) && (!a.end_date || a.end_date >= today))
      const cls = {}; active.forEach(a => { (cls[a.student_id] ||= []).push(a.classes) })
      const ids = Object.keys(cls)
      if (!ids.length) { if (!cancelled) setRows([]); return }
      const since = new Date(); since.setMonth(since.getMonth() - 3)
      const { data } = await supabase.from('grading_expressions')
        .select('*, students(id, photo_url, members(first_name, last_name))').in('student_id', ids).not('sent_to_coach_at', 'is', null)
        .gte('created_at', since.toISOString()).order('created_at', { ascending: false })
      if (cancelled) return
      // sessions done in the last 3 months (normal classes -- not the PT / Leader registers)
      const sids = [...new Set((data || []).map(r => r.student_id))]
      const sessions = {}
      if (sids.length) {
        const { data: att } = await supabase.from('attendance').select('student_id, session_date, attendance_type, classes(name)')
          .in('student_id', sids).gte('session_date', from3.toISOString().split('T')[0])
        const seen = new Set()
        ;(att || []).filter(a => ['attended', 'full_kit'].includes(a.attendance_type) && !/register/i.test(a.classes?.name || ''))
          .forEach(a => { const k = `${a.student_id}:${a.session_date}`; if (!seen.has(k)) { seen.add(k); sessions[a.student_id] = (sessions[a.student_id] || 0) + 1 } })
      }
      // ALL their current classes (so coaches see if they also train elsewhere); mine are highlighted
      const allCls = {}
      if (sids.length) {
        const { data: asg2 } = await supabase.from('student_class_assignments').select('*, classes(id, name, day_of_week, start_time)').in('student_id', sids)
        ;(asg2 || []).filter(a => a.classes && (!a.start_date || a.start_date <= today) && (!a.end_date || a.end_date >= today) && !/register/i.test(a.classes.name || ''))
          .forEach(a => { const l = (allCls[a.student_id] ||= []); if (!l.some(x => x.id === a.classes.id)) l.push({ ...a.classes, mine: myIds.includes(a.class_id) }) })
      }
      const list = (data || []).map(r => ({ ...r, classes: allCls[r.student_id]?.length ? allCls[r.student_id] : (cls[r.student_id] || []).map(c => ({ ...c, mine: true })), sessions: sessions[r.student_id] || 0 }))
      setRows(list)
      // 🔔 reminder once per login while some are waiting and the OK-by date hasn't passed
      const due = list.filter(r => !r.coach_ok && !r.coach_not_ready && (!okByOf(r.grading_date) || okByOf(r.grading_date) >= today))
      let shown = false; try { shown = sessionStorage.getItem('kc_grading_reminder') === '1' } catch { /* */ }
      if (due.length && !shown) { setReminder(true); try { sessionStorage.setItem('kc_grading_reminder', '1') } catch { /* */ } }
    })()
    return () => { cancelled = true }
  }, [isAdmin, JSON.stringify(classIds), reload]) // eslint-disable-line react-hooks/exhaustive-deps

  async function saveMine(ids) {
    const { data: me } = await supabase.from('members').select('access').eq('id', profile?.id).maybeSingle()
    const { error } = await supabase.from('members').update({ access: { ...(me?.access || {}), my_classes: ids } }).eq('id', profile?.id)
    if (error) return alert('Could not save: ' + error.message)
    setMineSaved(ids); setPickMine(false); setReload(n => n + 1)
  }
  const picker = pickMine && (
    <div style={{ marginTop: 8, padding: 10, border: '1px dashed var(--border-strong)', borderRadius: 8 }}>
      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>Tick the classes you coach -- their grading students come to you to OK.</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 4, maxHeight: 260, overflowY: 'auto' }}>
        {allClasses.map(c => {
          const on = (mineSaved || []).includes(c.id)
          return (
            <label key={c.id} style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12, cursor: 'pointer' }}>
              <input type="checkbox" checked={on} onChange={() => setMineSaved(m => on ? (m || []).filter(x => x !== c.id) : [...(m || []), c.id])} />
              {c.day_of_week?.slice(0, 3)} {String(c.start_time || '').slice(0, 5)} {c.name}{c.instructor ? ` · ${c.instructor}` : ''}
            </label>
          )
        })}
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <button type="button" className="btn btn-sm btn-primary" onClick={() => saveMine(mineSaved || [])}>Save my classes</button>
        <button type="button" className="btn btn-sm" onClick={() => setPickMine(false)}>Cancel</button>
      </div>
    </div>
  )
  if (!rows) return null
  if (!rows.length) {
    if (!isAdmin) return null
    return (
      <div className="card" style={{ marginBottom: 16, border: '1px dashed #8B5CF666' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <b style={{ fontSize: 14, flex: 1 }}>🎽 Gradings to confirm</b>
          <button type="button" className="btn btn-sm" onClick={() => setPickMine(v => !v)}>⚙ My classes</button>
        </div>
        {!pickMine && <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 4 }}>No grading students from your classes{mineSaved?.length ? '' : ' -- tap ⚙ My classes to choose the classes you coach'}.</div>}
        {picker}
      </div>
    )
  }
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
      {sheet && <GradingRequestSheet r={sheet} isAdmin={false} byName={by()}
        name={sheet.students?.members ? `${sheet.students.members.first_name} ${sheet.students.members.last_name}` : (sheet.student_name || 'Student')}
        onClose={() => setSheet(null)} onSaved={u => setRows(prev => prev.map(x => x.id === u.id ? { ...x, ...u } : x))} />}
      <div ref={cardRef} className="card" style={{ marginBottom: 16, border: '1px solid #8B5CF666' }}>
        <button type="button" onClick={() => setOpen(o => !o)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--text)', textAlign: 'left', fontFamily: 'var(--font-sans)' }}>
          <b style={{ fontSize: 15, flex: 1 }}>🎽 Gradings to confirm</b>
          {waitingRows.length > 0 && <span style={{ background: '#8B5CF6', color: '#fff', borderRadius: 999, fontSize: 11, fontWeight: 700, padding: '2px 8px' }}>{waitingRows.length} to OK</span>}
          {okBy && waitingRows.length > 0 && <span style={{ fontSize: 11, fontWeight: 600, color: okBy < today ? 'var(--text-tertiary)' : '#EF9F27' }}>{okBy < today ? `OK-by date passed (${fmt(okBy)})` : `Please OK by ${fmt(okBy)}`}</span>}
          <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{open ? '▲' : '▼'}</span>
        </button>
        {isAdmin && <div style={{ textAlign: 'right', marginTop: 4 }}><button type="button" className="btn btn-sm" style={{ fontSize: 11 }} onClick={() => setPickMine(v => !v)}>⚙ My classes</button></div>}
        {picker}
        <div className={`kc-slide${open ? ' open' : ''}`}><div>
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', margin: '8px 0 4px' }}>Students from your classes taking the grading. ✓ OK if they're ready, ✗ Not ready with a reason if not -- the admin sees it before approving.</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', margin: '4px 0 6px' }}>
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="🔍 Type a name…" style={{ flex: '1 1 150px', fontSize: 13 }} />
            {[['approved', '✓ Approved'], ['not', 'Not approved']].map(([k, l]) => (
              <button key={k} type="button" className={`btn btn-sm${apprF === k ? ' btn-primary' : ''}`} onClick={() => setApprF(f => f === k ? 'all' : k)}>{l} ({rows.filter(r => k === 'approved' ? r.coach_approved : !r.coach_approved).length})</button>
            ))}
            {[['all', 'All'], ['waiting', 'Not OK\'d'], ['ok', 'OK\'d']].map(([k, l]) => (
              <button key={k} type="button" className={`btn btn-sm${okF === k ? ' btn-primary' : ''}`} onClick={() => setOkF(f => f === k && k !== 'all' ? 'all' : k)}>{l}{k !== 'all' ? ` (${rows.filter(r => k === 'ok' ? r.coach_ok : !r.coach_ok).length})` : ''}</button>
            ))}
          </div>
          {rows.filter(r => {
            const nm = `${r.students?.members?.first_name || ''} ${r.students?.members?.last_name || ''} ${r.student_name || ''}`.toLowerCase()
            return (!q.trim() || nm.includes(q.trim().toLowerCase())) && (okF === 'all' || (okF === 'ok' ? r.coach_ok : !r.coach_ok))
              && (apprF === 'all' || (apprF === 'approved' ? r.coach_approved : !r.coach_approved))
          }).map(r => {
            const m = r.students?.members
            return (
              <div key={r.id} onClick={e => { if (e.target.closest('button, input, select, textarea, a')) return; setSheet(r) }}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderTop: '1px solid var(--border)', flexWrap: 'wrap', cursor: 'pointer' }}>
                <div style={{ flex: '1 1 180px', minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{m ? `${m.first_name} ${m.last_name}` : (r.student_name || 'Student')}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{r.discipline} · {r.current_belt || '—'} → <b style={beltStyle(r.grading_for)}>{r.grading_for}</b>{r.grading_list ? ` · ${r.grading_list}${r.grading_date ? ` ${fmt(r.grading_date)}` : ' (date TBC)'}` : r.grading_date ? ` · grading ${fmt(r.grading_date)}` : ''}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>🏫 {r.classes.map((c, i) => (
                    <span key={c.id || i}>{i > 0 ? ' | ' : ''}<span style={c.mine ? { color: 'var(--text)', fontWeight: 700 } : undefined}>{String(c.day_of_week || '').includes('/') ? c.day_of_week : String(c.day_of_week || '').slice(0, 3)} {String(c.start_time || '').slice(0, 5)} {c.name}</span></span>
                  ))}</div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: r.sessions >= 12 ? '#1D9E75' : r.sessions >= 6 ? '#EF9F27' : '#E24B4A' }}>🥋 {r.sessions} session{r.sessions === 1 ? '' : 's'} in the last 3 months</div>
                  <BbbcLine r={r} />
                  {r.coach_not_ready && <div style={{ fontSize: 12, color: '#E24B4A', marginTop: 2 }}>✗ Not ready: {r.coach_note}</div>}
                </div>
                {r.students?.photo_url && <img src={r.students.photo_url} alt="" loading="lazy" style={{ width: 48, height: 48, borderRadius: 10, objectFit: 'cover', border: '1px solid var(--border)', order: 9 }} />}
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
