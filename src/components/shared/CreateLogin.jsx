import { useState } from 'react'
import { supabase } from '../../lib/supabase.js'

// Admin: create a login directly -- already confirmed, NO email sent (avoids Supabase's email
// limit and "expired link" problems). You give the person their temporary password.
// memberId: link to this existing record (e.g. from a student's profile). Otherwise a new
// staff/member record is created (or an existing unlinked record with the same email is used).
const genPassword = () => {
  const words = ['Kick', 'Jab', 'Hook', 'Guard', 'Dragon', 'Tiger', 'Champ', 'Spar', 'Pad', 'Belt']
  const w = () => words[Math.floor(Math.random() * words.length)]
  return `${w()}${w()}${Math.floor(100 + Math.random() * 900)}!`
}

export default function CreateLogin({ memberId = null, defaults = {}, label = '🔑 Create login', hasLogin = false, onDone }) {
  const [open, setOpen] = useState(false)
  const [f, setF] = useState(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(null)
  const start = () => { setF({ firstName: defaults.firstName || '', lastName: defaults.lastName || '', email: defaults.email && !/placeholder/.test(defaults.email) ? defaults.email : '', phone: defaults.phone || '', role: defaults.role || (memberId ? '' : 'leader'), password: genPassword() }); setDone(null); setOpen(true) }
  async function create() {
    setBusy(true)
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch('/.netlify/functions/create-login', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({ ...f, memberId, role: f.role || undefined }) })
    const data = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) return alert(data.error || 'Could not create the login.')
    setDone({ email: data.loginEmail || f.email, password: f.password, reset: !!data.reset })
    onDone && onDone()
  }
  const msg = done && `Your KR Centre app login:\nEmail: ${done.email}\nPassword: ${done.password}\nSign in at ${window.location.origin}/login — you can change the password afterwards.`
  return (
    <>
      <button type="button" className="btn btn-sm" onClick={start}>{label}</button>
      {open && (
        <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 400, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div className="card" onClick={e => e.stopPropagation()} role="dialog" aria-label="Create login" style={{ width: '100%', maxWidth: 420, maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}><b style={{ fontSize: 16 }}>{hasLogin ? '🔑 Reset password' : '🔑 Create login'}</b><button className="btn btn-sm" onClick={() => setOpen(false)}>Close</button></div>
            {done ? (
              <>
                <p style={{ fontSize: 13, marginBottom: 8 }}>{done.reset ? '✓ New password set — it works straight away. Send them:' : '✓ Login ready — it works straight away (no email needed). Send them:'}</p>
                <pre style={{ whiteSpace: 'pre-wrap', fontSize: 13, background: 'var(--bg-secondary)', padding: 10, borderRadius: 8 }}>{msg}</pre>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button className="btn btn-sm btn-primary" onClick={async () => { try { await navigator.clipboard.writeText(msg) } catch {} ; alert('Copied') }}>Copy</button>
                  {f.phone && <a className="btn btn-sm" href={`https://wa.me/${f.phone.replace(/[^0-9]/g, '').replace(/^0/, '44')}?text=${encodeURIComponent(msg)}`} target="_blank" rel="noreferrer">WhatsApp</a>}
                  {navigator.share && <button className="btn btn-sm" onClick={() => navigator.share({ text: msg }).catch(() => {})}>Share…</button>}
                </div>
              </>
            ) : (
              <>
                <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 10 }}>{hasLogin ? 'They already have a login — this sets a NEW password on it (their email stays the same). ' : ''}Creates a ready-to-use login with no confirmation email (avoids the email limit). {memberId ? 'Linked to this person\'s record (if a login already exists for this email, e.g. from a sign-up that didn\'t finish, it\'s linked and given this password).' : 'If a record with this email already exists (and has no login), it\'s used.'}</p>
                {!memberId && <div style={{ display: 'flex', gap: 8 }}>
                  <div className="field" style={{ flex: 1 }}><label>First name</label><input value={f.firstName} onChange={e => setF(x => ({ ...x, firstName: e.target.value }))} /></div>
                  <div className="field" style={{ flex: 1 }}><label>Last name</label><input value={f.lastName} onChange={e => setF(x => ({ ...x, lastName: e.target.value }))} /></div>
                </div>}
                {!hasLogin && <div className="field"><label>Email (their username)</label><input type="email" value={f.email} onChange={e => setF(x => ({ ...x, email: e.target.value }))} /></div>}
                {!memberId && <div className="field"><label>Phone (optional)</label><input value={f.phone} onChange={e => setF(x => ({ ...x, phone: e.target.value }))} /></div>}
                {!memberId && <div className="field"><label>Role</label>
                  <select value={f.role} onChange={e => setF(x => ({ ...x, role: e.target.value }))}>
                    <option value="member">Member (athlete / parent)</option><option value="leader">Leader</option><option value="captain">Coach</option><option value="head_coach">Head Coach</option>
                  </select>
                  <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>Set their classes and pages in Settings → Team afterwards.</div></div>}
                <div className="field"><label>Temporary password</label>
                  <div style={{ display: 'flex', gap: 6 }}><input value={f.password} onChange={e => setF(x => ({ ...x, password: e.target.value }))} style={{ flex: 1 }} /><button type="button" className="btn btn-sm" onClick={() => setF(x => ({ ...x, password: genPassword() }))}>New</button></div></div>
                <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} disabled={busy || (!hasLogin && !f.email) || f.password.length < 8} onClick={create}>{busy ? 'Saving…' : hasLogin ? 'Set new password' : 'Create login'}</button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
