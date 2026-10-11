import { useState } from 'react'
import { supabase } from '../../lib/supabase.js'

// Coach: "📲 App invite" on a student's profile -> one-time link (14 days, single use)
// for the athlete (links their own login) or a parent (adds this child to the parent's app).
const BASE = typeof window !== 'undefined' ? window.location.origin : 'https://klasschamp.netlify.app'
const newToken = () => {
  const a = new Uint8Array(18); crypto.getRandomValues(a)
  return Array.from(a, b => b.toString(36).padStart(2, '0')).join('').slice(0, 24)
}

export default function AppInviteButton({ student }) {
  const [open, setOpen] = useState(false)
  const [link, setLink] = useState(null)     // { url, kind }
  const [busy, setBusy] = useState(false)
  const name = student?.members?.first_name || 'this athlete'
  const phone = (student?.guardian_phone || student?.members?.phone || '').replace(/[^0-9+]/g, '')
  const email = student?.members?.email && !/placeholder/.test(student.members.email) ? student.members.email : ''

  async function make(kind) {
    setBusy(true)
    const { data: me } = await supabase.from('members').select('id').eq('auth_id', (await supabase.auth.getUser()).data.user?.id).maybeSingle()
    const token = newToken()
    const { error } = await supabase.from('app_invites').insert({ token, student_id: student.id, kind, created_by: me?.id || null })
    setBusy(false)
    if (error) return alert('Could not create the invite: ' + error.message + (/app_invites/.test(error.message) ? '\n\n(Has supabase_parent_view.sql been run?)' : ''))
    setLink({ url: `${BASE}/invite/${token}`, kind })
  }
  const message = link && (link.kind === 'parent'
    ? `Hi! Here's your link to the KR Centre parent app for ${name} — see attendance, progress and club news, and let us know about absences:\n${link.url}\n(The link works once and lasts 14 days.)`
    : `Hi ${name}! Here's your link to set up your KR Centre athlete app:\n${link.url}\n(The link works once and lasts 14 days.)`)
  const waNum = phone.startsWith('0') ? '44' + phone.slice(1) : phone.replace('+', '')

  return (
    <>
      <button type="button" className="btn btn-sm" onClick={() => { setOpen(true); setLink(null) }} title="Send a one-time app invite link">📲 App invite</button>
      {open && (
        <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div className="card" onClick={e => e.stopPropagation()} role="dialog" aria-label="App invite" style={{ width: '100%', maxWidth: 420 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <b style={{ fontSize: 16 }}>📲 App invite — {student?.members?.first_name} {student?.members?.last_name}</b>
              <button className="btn btn-sm" onClick={() => setOpen(false)}>Close</button>
            </div>
            {!link ? (
              <>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 }}>Creates a one-time link (lasts 14 days). Whoever opens it and signs in is linked automatically — no searching.</p>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-primary" disabled={busy} style={{ flex: 1, justifyContent: 'center' }} onClick={() => make('athlete')}>🥋 For the athlete</button>
                  <button className="btn btn-primary" disabled={busy} style={{ flex: 1, justifyContent: 'center' }} onClick={() => make('parent')}>👪 For a parent</button>
                </div>
              </>
            ) : (
              <>
                <p style={{ fontSize: 13, marginBottom: 8 }}>{link.kind === 'parent' ? 'Parent' : 'Athlete'} invite ready. Send it:</p>
                <input readOnly value={link.url} onFocus={e => e.target.select()} style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border-strong)', background: 'var(--bg-secondary)', color: 'var(--text)', fontSize: 12, marginBottom: 10 }} />
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {waNum && <a className="btn btn-sm btn-primary" href={`https://wa.me/${waNum}?text=${encodeURIComponent(message)}`} target="_blank" rel="noreferrer">WhatsApp</a>}
                  {phone && <a className="btn btn-sm" href={`sms:${phone}?body=${encodeURIComponent(message)}`}>Text</a>}
                  <a className="btn btn-sm" href={`mailto:${email}?subject=${encodeURIComponent('Your KR Centre app link')}&body=${encodeURIComponent(message)}`}>Email</a>
                  {navigator.share && <button className="btn btn-sm" onClick={() => navigator.share({ text: message }).catch(() => {})}>Share…</button>}
                  <button className="btn btn-sm" onClick={async () => { try { await navigator.clipboard.writeText(message) } catch {} ; alert('Copied') }}>Copy</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
