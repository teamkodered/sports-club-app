import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase.js'

const fmt = d => new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
const KIND = { holiday: ['🏖️', 'Holiday'], injury: ['🩹', 'Injury'] }

// Athlete app (Sessions): ask for holiday / injury time -- waits for a coach to authorise
export function AbsenceRequestAthlete({ studentId }) {
  const [list, setList] = useState(null)
  const [open, setOpen] = useState(false)
  const [f, setF] = useState({ kind: 'holiday', start_date: '', end_date: '', note: '' })
  const load = () => studentId && supabase.from('absence_requests').select('*').eq('student_id', studentId).order('created_at', { ascending: false }).limit(10)
    .then(({ data }) => setList(data || []), () => setList([]))
  useEffect(() => { load() }, [studentId]) // eslint-disable-line react-hooks/exhaustive-deps
  async function send() {
    if (!f.start_date || !f.end_date) { alert('Pick the first and last day.'); return }
    if (f.end_date < f.start_date) { alert('The last day is before the first day.'); return }
    const { error } = await supabase.from('absence_requests').insert({ student_id: studentId, kind: f.kind, start_date: f.start_date, end_date: f.end_date, note: f.note.trim() || null })
    if (error) { alert(/absence_requests/.test(error.message) ? 'This needs a quick database update (supabase_absence_requests.sql).' : 'Could not send: ' + error.message); return }
    setF({ kind: 'holiday', start_date: '', end_date: '', note: '' }); setOpen(false); load()
  }
  async function cancel(id) { if (!confirm('Cancel this request?')) return; await supabase.from('absence_requests').delete().eq('id', id); load() }
  return (
    <div className="kc-abs">
      <button type="button" className="kc-abs-btn" onClick={() => setOpen(o => !o)}>🏖️ / 🩹 Holiday or injury time {open ? '▲' : '▼'}</button>
      {open && (
        <div className="kc-abs-form">
          <div className="kc-abs-kinds">{Object.entries(KIND).map(([k, [e, l]]) => <button key={k} type="button" className={f.kind === k ? 'on' : ''} onClick={() => setF(x => ({ ...x, kind: k }))}>{e} {l}</button>)}</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <label>First day<input type="date" value={f.start_date} onChange={e => setF(x => ({ ...x, start_date: e.target.value, end_date: x.end_date || e.target.value }))} /></label>
            <label>Last day<input type="date" value={f.end_date} onChange={e => setF(x => ({ ...x, end_date: e.target.value }))} /></label>
          </div>
          <textarea rows={2} placeholder={f.kind === 'injury' ? 'What happened? (e.g. sprained ankle -- back when the physio says)' : 'Where / any note for your coach'} value={f.note} onChange={e => setF(x => ({ ...x, note: e.target.value }))} />
          <button type="button" className="btn btn-primary" onClick={send}>Send to my coach</button>
          <p className="kc-abs-hint">Your coach authorises it -- then those sessions won't count against your attendance.</p>
        </div>
      )}
      {(list || []).length > 0 && (
        <div className="kc-abs-list">
          {list.map(r => (
            <div key={r.id} className={`kc-abs-item ${r.status}`}>
              <span>{KIND[r.kind]?.[0]} {fmt(r.start_date)}{r.end_date !== r.start_date ? ` – ${fmt(r.end_date)}` : ''}</span>
              <b>{r.status === 'pending' ? 'Waiting for coach' : r.status === 'approved' ? '✓ Authorised' : '✗ Declined'}</b>
              {r.status === 'pending' && <button type="button" onClick={() => cancel(r.id)} aria-label="Cancel">×</button>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// Coach view (Sessions, under the holiday button): requests waiting for authorisation
export function AbsenceRequestCoach({ studentId, coachName, onApproved }) {
  const [list, setList] = useState(null)
  const load = () => {
    let q = supabase.from('absence_requests').select('*, students(id, members(first_name, last_name))').eq('status', 'pending').order('created_at')
    if (studentId) q = q.eq('student_id', studentId)
    q.then(({ data }) => setList(data || []), () => setList([]))
  }
  useEffect(() => { load() }, [studentId]) // eslint-disable-line react-hooks/exhaustive-deps
  async function decide(r, ok) {
    let holidayId = null
    if (ok) {
      const { data, error } = await supabase.from('holidays').insert({ name: r.kind === 'injury' ? `Injury${r.note ? ' -- ' + r.note.slice(0, 60) : ''}` : `Holiday${r.note ? ' -- ' + r.note.slice(0, 60) : ''}`, start_date: r.start_date, end_date: r.end_date, student_id: r.student_id }).select().single()
      if (error) { alert('Could not add the holiday: ' + error.message); return }
      holidayId = data?.id; onApproved?.(data)
    }
    const { error } = await supabase.from('absence_requests').update({ status: ok ? 'approved' : 'declined', decided_by: coachName || 'Coach', decided_at: new Date().toISOString(), holiday_id: holidayId }).eq('id', r.id)
    if (error) { alert('Could not save: ' + error.message); return }
    load()
  }
  if (!list || !list.length) return null
  return (
    <div className="kc-abs-coach">
      <div className="kc-abs-coach-title">Waiting for authorisation ({list.length})</div>
      {list.map(r => (
        <div key={r.id} className="kc-abs-coach-row">
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12 }}>{KIND[r.kind]?.[0]} <b>{!studentId && r.students?.members ? `${r.students.members.first_name} ${r.students.members.last_name} · ` : ''}{KIND[r.kind]?.[1]}</b> {fmt(r.start_date)}{r.end_date !== r.start_date ? ` – ${fmt(r.end_date)}` : ''}</div>
            {r.note && <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{r.note}</div>}
          </div>
          <button type="button" className="btn btn-sm btn-primary" onClick={() => decide(r, true)}>✓ Authorise</button>
          <button type="button" className="btn btn-sm" onClick={() => decide(r, false)}>✗</button>
        </div>
      ))}
    </div>
  )
}
