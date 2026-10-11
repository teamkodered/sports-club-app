import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../hooks/useAuth.jsx'
import { openMemberDoc } from '../lib/memberDocs.js'

// Parent screen: one parent login, any number of children (linked only through a coach's invite).
// The database decides what's visible: a child aged 16+ with their own login shows attendance,
// holidays and club info only. Athlete-only parts (wellbeing, notes, mentality, wearables) never show.
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const fmt = d => new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
const ageOf = dob => { if (!dob) return null; const b = new Date(dob), n = new Date(); let a = n.getFullYear() - b.getFullYear(); if (n < new Date(n.getFullYear(), b.getMonth(), b.getDate())) a--; return a }

export default function ParentView() {
  const { profile } = useAuth()
  const [children, setChildren] = useState(null)
  const [sel, setSel] = useState(null)
  const [data, setData] = useState(null)
  const [courses, setCourses] = useState([])
  const [absence, setAbsence] = useState(null)      // form state
  const [contact, setContact] = useState(null)
  const [sent, setSent] = useState('')

  useEffect(() => {
    if (!profile?.id) return
    supabase.from('guardians').select('student_id, students(id, member_id, pka_belt, krba_level, discipline, house_name, house_points, individual_points, class_champion_count, photo_url, members(first_name, last_name, date_of_birth, auth_id, houses(name)))')
      .eq('parent_member_id', profile.id)
      .then(({ data }) => { const kids = (data || []).map(g => g.students).filter(Boolean); setChildren(kids); if (kids[0]) setSel(kids[0].id) })
    supabase.from('courses').select('id, title, start_date, poster_url, description').gte('start_date', iso(new Date())).order('start_date').limit(6)
      .then(({ data }) => setCourses(data || []))
  }, [profile?.id])

  useEffect(() => {
    if (!sel) return
    setData(null)
    const from = new Date(); from.setDate(from.getDate() - 56)
    const member = children.find(c => c.id === sel)?.members
    Promise.all([
      supabase.from('attendance').select('session_date, attendance_type, classes(name, day_of_week, start_time)').eq('student_id', sel).gte('session_date', iso(from)).order('session_date', { ascending: false }),
      supabase.from('holidays').select('name, start_date, end_date, student_id, class_id').or(`student_id.eq.${sel},student_id.is.null`).gte('end_date', iso(from)),
      supabase.from('points_log').select('point_type, points_awarded, awarded_at').eq('student_id', sel).order('awarded_at', { ascending: false }).limit(8),
      supabase.from('student_class_assignments').select('classes(name, day_of_week, start_time, end_time)').eq('student_id', sel),
      supabase.from('membership_forms').select('id, document_url, created_at').eq('member_id', children.find(c => c.id === sel)?.member_id || '00000000-0000-0000-0000-000000000000').order('created_at', { ascending: false }).limit(1),
      supabase.from('absence_requests').select('start_date, end_date, reason, status, created_at').eq('student_id', sel).order('created_at', { ascending: false }).limit(5),
    ]).then(([att, hol, pts, cls, form, reqs]) => setData({ form: (form.data || [])[0] || null, att: att.data || [], hol: hol.data || [], pts: pts.data || [], ptsBlocked: !!pts.error, cls: (cls.data || []).map(r => r.classes).filter(Boolean), reqs: reqs.data || [], member }))
  }, [sel])

  const child = children?.find(c => c.id === sel)
  const m = child?.members
  const limited = m && m.auth_id && ageOf(m.date_of_birth) >= 16   // 16+ with own login: attendance + club info only

  async function sendAbsence() {
    if (!absence.start || !absence.end) return alert('Please choose the dates.')
    if (absence.end < absence.start) return alert('The end date must be on or after the start date.')
    const { error } = await supabase.from('absence_requests').insert({ student_id: sel, parent_member_id: profile.id, start_date: absence.start, end_date: absence.end, reason: absence.reason?.trim() || null })
    if (error) return alert('Could not send: ' + error.message)
    setAbsence(null); setSent('Thanks — the club will confirm the absence.')
    setData(d => ({ ...d, reqs: [{ start_date: absence.start, end_date: absence.end, reason: absence.reason, status: 'pending', created_at: new Date().toISOString() }, ...(d?.reqs || [])] }))
  }
  async function sendContact() {
    if (!contact.details?.trim()) return alert('Please describe what has changed.')
    const { error } = await supabase.from('contact_update_requests').insert({ student_id: sel, parent_member_id: profile.id, details: contact.details.trim() })
    if (error) return alert('Could not send: ' + error.message)
    setContact(null); setSent('Thanks — the club will update the details.')
  }

  if (children === null) return <div className="pv"><p>Loading…</p></div>
  if (!children.length) return (
    <div className="pv">
      <h1 className="pv-title">Parent app</h1>
      <div className="card"><p style={{ fontSize: 14 }}>No children are linked to your login yet. Ask your coach to send you a <b>parent invite</b> link for each child.</p></div>
    </div>
  )

  // attendance summary (last 4 weeks)
  const fourWeeks = (() => { const d = new Date(); d.setDate(d.getDate() - 28); return iso(d) })()
  const att4 = (data?.att || []).filter(a => a.session_date >= fourWeeks)
  const sessions4 = new Set(att4.map(a => a.session_date)).size

  return (
    <div className="pv">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 className="pv-title">Parent app</h1>
        <button className="btn btn-sm" onClick={async () => { await supabase.auth.signOut(); window.location.href = '/athlete-login' }}>↩ Sign out</button>
      </div>

      {/* child switcher */}
      <div className="pv-kids">
        {children.map(c => (
          <button key={c.id} type="button" className={c.id === sel ? 'on' : ''} onClick={() => { setSel(c.id); setSent('') }}>
            {c.photo_url ? <img src={c.photo_url} alt="" /> : <span className="pv-init">{(c.members?.first_name || '?')[0]}</span>}
            <span><b>{c.members?.first_name}</b><small>{c.members?.houses?.name || c.house_name || ''}</small></span>
          </button>
        ))}
      </div>

      {sent && <div className="pv-sent">{sent}</div>}

      {/* attendance */}
      <div className="card pv-card">
        <div className="pv-h">📅 Attendance</div>
        {!data ? <p>Loading…</p> : <>
          <div className="pv-stats">
            <div><b>{sessions4}</b><span>sessions in the last 4 weeks</span></div>
            <div><b>{data.att.length ? fmt(data.att[0].session_date) : '—'}</b><span>last trained</span></div>
          </div>
          <div className="pv-list">
            {data.att.slice(0, 8).map((a, i) => <div key={i}><span>{fmt(a.session_date)}</span><span>{a.classes?.name || 'Session'}{a.attendance_type === 'full_kit' ? ' · full kit' : ''}</span></div>)}
            {!data.att.length && <p className="pv-muted">No sessions in the last 8 weeks.</p>}
          </div>
          {data.hol.filter(h => h.student_id === sel || !h.class_id).length > 0 && (
            <div className="pv-muted" style={{ marginTop: 6 }}>Holidays: {data.hol.filter(h => h.student_id === sel || !h.class_id).map(h => `${h.name} (${fmt(h.start_date)}–${fmt(h.end_date)})`).join(' · ')}</div>
          )}
          <button className="btn btn-sm btn-primary" style={{ marginTop: 10 }} onClick={() => setAbsence({ start: iso(new Date()), end: iso(new Date()), reason: '' })}>Report an absence</button>
          {data.reqs.length > 0 && (
            <div className="pv-list" style={{ marginTop: 8 }}>
              {data.reqs.map((r, i) => <div key={i}><span>{fmt(r.start_date)}{r.end_date !== r.start_date ? `–${fmt(r.end_date)}` : ''}</span><span className={`pv-status ${r.status}`}>{r.status === 'pending' ? 'Waiting for the club' : r.status === 'approved' ? 'Approved' : 'Declined'}</span></div>)}
            </div>
          )}
        </>}
      </div>

      {absence && (
        <div className="card pv-card">
          <div className="pv-h">Report an absence for {m?.first_name}</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <div className="field" style={{ flex: 1 }}><label>From</label><input type="date" value={absence.start} onChange={e => setAbsence(a => ({ ...a, start: e.target.value }))} /></div>
            <div className="field" style={{ flex: 1 }}><label>To</label><input type="date" value={absence.end} onChange={e => setAbsence(a => ({ ...a, end: e.target.value }))} /></div>
          </div>
          <div className="field"><label>Reason (optional)</label><input value={absence.reason} onChange={e => setAbsence(a => ({ ...a, reason: e.target.value }))} placeholder="e.g. family holiday" /></div>
          <div style={{ display: 'flex', gap: 8 }}><button className="btn btn-primary" onClick={sendAbsence}>Send to the club</button><button className="btn" onClick={() => setAbsence(null)}>Cancel</button></div>
        </div>
      )}

      {/* progress (not for 16+ with their own login) */}
      {!limited && (
        <div className="card pv-card">
          <div className="pv-h">⭐ Progress</div>
          <div className="pv-stats">
            <div><b>{child?.house_points ?? 0}</b><span>house points</span></div>
            <div><b>{child?.pka_belt || child?.krba_level || '—'}</b><span>grade</span></div>
            <div><b>{child?.class_champion_count ?? 0}</b><span>Class Champ</span></div>
          </div>
          {data?.pts?.length > 0 && (
            <div className="pv-list">{data.pts.map((p, i) => <div key={i}><span>{fmt(String(p.awarded_at).slice(0, 10))}</span><span>{p.point_type} <b style={{ color: p.points_awarded < 0 ? '#E24B4A' : '#1D9E75' }}>{p.points_awarded > 0 ? '+' : ''}{p.points_awarded}</b></span></div>)}</div>
          )}
        </div>
      )}

      {/* membership form (not for 16+ with their own login) */}
      {!limited && data?.form?.document_url && (
        <div className="card pv-card">
          <div className="pv-h">📝 Membership form</div>
          <p className="pv-muted">Signed {fmt(String(data.form.created_at).slice(0, 10))}</p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-sm" onClick={() => openMemberDoc(data.form.document_url)}>View</button>
            <button className="btn btn-sm" onClick={() => openMemberDoc(data.form.document_url, { print: true })}>Print</button>
          </div>
        </div>
      )}

      {/* club info */}
      <div className="card pv-card">
        <div className="pv-h">🏠 Club info</div>
        {data?.cls?.length > 0 && <div style={{ marginBottom: 8 }}><div className="pv-sub">{m?.first_name}'s classes</div>{data.cls.map((c, i) => <div key={i} className="pv-muted">{c.day_of_week} {c.start_time?.slice(0, 5)}{c.end_time ? `–${c.end_time.slice(0, 5)}` : ''} · {c.name}</div>)}</div>}
        <div className="pv-sub">Coming up</div>
        {courses.length ? courses.map(c => (
          <div key={c.id} className="pv-course">{c.poster_url && <img src={c.poster_url} alt="" />}<div><b>{c.title}</b><div className="pv-muted">{fmt(c.start_date)}</div></div></div>
        )) : <p className="pv-muted">Nothing announced yet.</p>}
      </div>

      {/* contact details */}
      <div className="card pv-card">
        <div className="pv-h">✉️ Contact & medical details</div>
        {!contact ? (
          <><p className="pv-muted">Moved house, new phone number or a medical change? Let the club know.</p>
          <button className="btn btn-sm" onClick={() => setContact({ details: '' })}>Request an update</button></>
        ) : (
          <><textarea rows={4} value={contact.details} onChange={e => setContact({ details: e.target.value })} placeholder="What's changed? e.g. new mobile 07…, new address…, new allergy…"
            style={{ width: '100%', boxSizing: 'border-box', padding: 10, borderRadius: 8, border: '1px solid var(--border-strong)', background: 'var(--bg-secondary)', color: 'var(--text)', fontFamily: 'inherit', fontSize: 14 }} />
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}><button className="btn btn-primary" onClick={sendContact}>Send to the club</button><button className="btn" onClick={() => setContact(null)}>Cancel</button></div></>
        )}
      </div>

      <p className="pv-muted" style={{ textAlign: 'center', margin: '18px 0' }}><Link to="/athlete-app">Go to my own athlete app</Link></p>
    </div>
  )
}
