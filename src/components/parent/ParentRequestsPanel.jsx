import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase.js'

// Staff: absences and contact/medical changes sent from the parent app. Approving an absence
// adds a holiday for that child (so it doesn't count against attendance / Missed training).
const fmt = d => new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

export default function ParentRequestsPanel({ onCount }) {
  const [abs, setAbs] = useState(null)
  const [con, setCon] = useState([])
  const [showDone, setShowDone] = useState(false)
  async function load() {
    const sel = 'students(id, members(first_name, last_name)), parent:members!parent_member_id(first_name, last_name, email, phone)'
    const [a, c] = await Promise.all([
      supabase.from('absence_requests').select(`*, ${sel}`).order('created_at', { ascending: false }).limit(60),
      supabase.from('contact_update_requests').select(`*, ${sel}`).order('created_at', { ascending: false }).limit(60),
    ])
    if (a.error) { setAbs([]); return }
    setAbs(a.data || []); setCon(c.data || [])
    onCount && onCount((a.data || []).filter(x => x.status === 'pending').length + (c.data || []).filter(x => x.status === 'pending').length)
  }
  useEffect(() => { load() }, [])
  async function me() { const { data } = await supabase.from('members').select('id').eq('auth_id', (await supabase.auth.getUser()).data.user?.id).maybeSingle(); return data?.id || null }

  async function decideAbsence(r, approve) {
    const by = await me()
    if (approve) {
      const { error: hErr } = await supabase.from('holidays').insert({ name: r.reason ? `Absence: ${r.reason}` : 'Absence (parent)', start_date: r.start_date, end_date: r.end_date, student_id: r.student_id })
      if (hErr) return alert('Could not add the holiday: ' + hErr.message)
    }
    const { error } = await supabase.from('absence_requests').update({ status: approve ? 'approved' : 'declined', decided_by: by, decided_at: new Date().toISOString() }).eq('id', r.id)
    if (error) return alert(error.message)
    load()
  }
  async function decideContact(r, done) {
    const by = await me()
    const { error } = await supabase.from('contact_update_requests').update({ status: done ? 'done' : 'declined', decided_by: by, decided_at: new Date().toISOString() }).eq('id', r.id)
    if (error) return alert(error.message)
    load()
  }

  if (abs === null) return <div className="loading">Loading…</div>
  const who = r => `${r.students?.members?.first_name || ''} ${r.students?.members?.last_name || ''}`.trim()
  const parent = r => r.parent ? `${r.parent.first_name || ''} ${r.parent.last_name || ''}`.trim() || r.parent.email : 'Parent'
  const A = abs.filter(r => showDone || r.status === 'pending'), C = con.filter(r => showDone || r.status === 'pending')
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Sent from the parent app. Approving an absence adds a holiday for that child, so it doesn't count against attendance.</p>
        <label style={{ fontSize: 12, display: 'flex', gap: 6, alignItems: 'center', whiteSpace: 'nowrap' }}><input type="checkbox" checked={showDone} onChange={e => setShowDone(e.target.checked)} /> Show done</label>
      </div>
      <div className="card" style={{ marginBottom: 12 }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>🏖️ Absences {A.filter(r => r.status === 'pending').length ? `(${A.filter(r => r.status === 'pending').length})` : ''}</div>
        {!A.length && <p style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>Nothing waiting.</p>}
        {A.map(r => (
          <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
            <div><b>{who(r)}</b> · {fmt(r.start_date)}{r.end_date !== r.start_date ? `–${fmt(r.end_date)}` : ''}{r.reason ? ` · ${r.reason}` : ''}<div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>from {parent(r)}</div></div>
            {r.status === 'pending' ? (
              <div style={{ display: 'flex', gap: 6 }}><button className="btn btn-sm btn-primary" onClick={() => decideAbsence(r, true)}>Approve</button><button className="btn btn-sm" onClick={() => decideAbsence(r, false)}>Decline</button></div>
            ) : <span style={{ fontSize: 12, fontWeight: 600, color: r.status === 'approved' ? '#1D9E75' : '#E24B4A' }}>{r.status}</span>}
          </div>
        ))}
      </div>
      <div className="card">
        <div style={{ fontWeight: 700, marginBottom: 8 }}>✉️ Contact & medical changes {C.filter(r => r.status === 'pending').length ? `(${C.filter(r => r.status === 'pending').length})` : ''}</div>
        {!C.length && <p style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>Nothing waiting.</p>}
        {C.map(r => (
          <div key={r.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
            <div><b>{who(r)}</b> <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>from {parent(r)}{r.parent?.phone ? ` · ${r.parent.phone}` : ''}</span></div>
            <div style={{ fontSize: 13, whiteSpace: 'pre-wrap', margin: '4px 0 6px' }}>{r.details}</div>
            {r.status === 'pending' ? (
              <div style={{ display: 'flex', gap: 6 }}><button className="btn btn-sm btn-primary" onClick={() => decideContact(r, true)} title="Update the student's details, then mark it done">Updated — mark done</button><button className="btn btn-sm" onClick={() => decideContact(r, false)}>Decline</button></div>
            ) : <span style={{ fontSize: 12, fontWeight: 600, color: r.status === 'done' ? '#1D9E75' : '#E24B4A' }}>{r.status}</span>}
          </div>
        ))}
      </div>
    </div>
  )
}
