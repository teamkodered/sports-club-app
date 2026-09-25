import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase.js'
import { generateStudentId } from '../../lib/studentId.js'

// Join applications that were saved but didn't finish creating the member
// (see src/lib/submitJoinApplication.js). Staff can check the answers,
// correct the main details if needed, and complete them in one tap.

const FORM_LABELS = { pka_adult: 'PKA adult', pka_child: 'PKA child', krba: 'KRBA' }
const EDITABLE = [
  ['first_name', 'First name', 'text'], ['last_name', 'Surname', 'text'],
  ['date_of_birth', 'Date of birth', 'date'], ['email', 'Email', 'email'], ['phone', 'Phone', 'tel'],
]

export default function JoinApplicationsPanel() {
  const [apps, setApps] = useState(null) // null = not loaded / table not installed
  const [showCompleted, setShowCompleted] = useState(false)
  const [openId, setOpenId] = useState(null)
  const [edits, setEdits] = useState({})
  const [busyId, setBusyId] = useState(null)

  async function load() {
    let q = supabase.from('join_applications').select('*').order('created_at', { ascending: false }).limit(100)
    if (!showCompleted) q = q.in('status', ['failed', 'received'])
    const { data, error } = await q
    if (error) { setApps(null); return } // SQL not installed yet, or no access
    setApps(data || [])
  }
  useEffect(() => { load() }, [showCompleted])

  async function complete(app) {
    setBusyId(app.id)
    let payload = null
    const e = edits[app.id]
    if (e && Object.keys(e).length) {
      const member = { ...app.payload.member, ...e }
      // Keep the student ID in step with any corrected name / date of birth
      const ref = generateStudentId(member.last_name, member.first_name, member.date_of_birth)
      member.member_id = ref
      const student = { ...app.payload.student, student_ref: ref }
      const form = app.payload.form ? { ...app.payload.form, first_name: member.first_name, last_name: member.last_name, email: member.email, phone: member.phone, date_of_birth: member.date_of_birth } : null
      payload = { member, student, form }
    }
    const { data, error } = await supabase.rpc('complete_join_application', { p_id: app.id, p_payload: payload })
    setBusyId(null)
    if (error) return alert('Could not complete: ' + error.message)
    if (data?.status === 'completed') { setOpenId(null); setEdits(x => ({ ...x, [app.id]: undefined })) }
    else alert('Still not completed: ' + (data?.error || 'unknown error'))
    load()
  }

  async function dismiss(app) {
    if (!window.confirm(`Dismiss ${app.applicant_name}'s application? Use this for duplicates or test entries. It stays saved and can be completed later.`)) return
    setBusyId(app.id)
    const { error } = await supabase.from('join_applications').update({ status: 'dismissed' }).eq('id', app.id)
    setBusyId(null)
    if (error) return alert('Could not dismiss: ' + error.message)
    load()
  }

  if (apps === null) return null
  const waiting = apps.filter(a => a.status !== 'completed' && a.status !== 'dismissed')
  if (!waiting.length && !showCompleted) return null

  return (
    <div className="card" style={{ marginBottom: 16, borderLeft: `3px solid ${waiting.length ? '#E24B4A' : '#1D9E75'}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
        <div>
          <h3 style={{ fontSize: 15, fontWeight: 600 }}>
            {waiting.length ? `⚠️ ${waiting.length} join application${waiting.length === 1 ? '' : 's'} to complete` : 'Join applications'}
          </h3>
          <p style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
            These were saved but didn't finish creating the member. The applicant was told their application was received — no need to contact them.
          </p>
        </div>
        <label style={{ fontSize: 12, display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
          <input type="checkbox" checked={showCompleted} onChange={e => setShowCompleted(e.target.checked)} /> Show all
        </label>
      </div>

      {apps.map(app => {
        const open = openId === app.id
        const m = app.payload?.member || {}
        const e = edits[app.id] || {}
        const done = app.status === 'completed'
        return (
          <div key={app.id} style={{ borderTop: '1px solid var(--border)', padding: '10px 0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ cursor: 'pointer' }} onClick={() => setOpenId(open ? null : app.id)}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{open ? '▾' : '▸'} {app.applicant_name || '(no name)'}</div>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                  {FORM_LABELS[app.form_type] || app.form_type} · {new Date(app.created_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} · {app.email}
                  {' · '}<span style={{ color: done ? '#1D9E75' : app.status === 'dismissed' ? 'var(--text-tertiary)' : '#E24B4A', fontWeight: 600 }}>{app.status}</span>
                </div>
              </div>
              {!done && (
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn btn-primary btn-sm" disabled={busyId === app.id} onClick={() => complete(app)}>{busyId === app.id ? 'Working…' : 'Complete'}</button>
                  {app.status !== 'dismissed' && <button className="btn btn-sm" disabled={busyId === app.id} onClick={() => dismiss(app)}>Dismiss</button>}
                </div>
              )}
            </div>
            {app.error && !done && (
              <p style={{ fontSize: 12, color: '#E24B4A', marginTop: 6 }}>Problem: {app.error}</p>
            )}
            {open && (
              <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 8 }}>
                {EDITABLE.map(([k, label, type]) => (
                  <div key={k} className="field" style={{ margin: 0 }}>
                    <label style={{ fontSize: 11 }}>{label}</label>
                    <input type={type} disabled={done} value={e[k] ?? m[k] ?? ''}
                      onChange={ev => setEdits(x => ({ ...x, [app.id]: { ...(x[app.id] || {}), [k]: ev.target.value } }))} />
                  </div>
                ))}
                <details style={{ gridColumn: '1 / -1', fontSize: 12 }}>
                  <summary style={{ cursor: 'pointer', color: 'var(--text-secondary)' }}>All answers</summary>
                  <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {['member', 'student', 'form'].flatMap(part =>
                      Object.entries(app.payload?.[part] || {})
                        .filter(([k, v]) => v !== null && v !== '' && !['id', 'member_id'].includes(k))
                        .map(([k, v]) => (
                          <div key={part + k}><span style={{ color: 'var(--text-tertiary)' }}>{k.replace(/_/g, ' ')}:</span> {Array.isArray(v) ? v.join(', ') : typeof v === 'object' ? JSON.stringify(v) : String(v)}</div>
                        )))}
                  </div>
                </details>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
