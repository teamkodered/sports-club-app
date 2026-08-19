import { useState, useEffect } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import { supabasePublic } from '../lib/supabasePublic.js'

const HOUSE_COLOURS = {
  'Dragon House': '#E24B4A', 'Super House': '#378ADD',
  'Ice House': '#1D9E75', 'Jet House': '#EF9F27',
}

export default function Claim() {
  const [searchParams] = useSearchParams()
  const ref = searchParams.get('ref')

  const [loading, setLoading] = useState(true)
  const [student, setStudent] = useState(null)
  const [notFound, setNotFound] = useState(false)
  const [session, setSession] = useState(undefined) // undefined = not checked yet
  const [linking, setLinking] = useState(false)
  const [linkError, setLinkError] = useState('')
  const [linked, setLinked] = useState(false)
  const [wrongAccount, setWrongAccount] = useState(false)

  const [showCreateLogin, setShowCreateLogin] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [creating, setCreating] = useState(false)
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
  }, [])

  useEffect(() => {
    if (!ref) { setLoading(false); setNotFound(true); return }
    supabasePublic
      .from('students')
      .select('id, student_ref, discipline, pka_belt, krba_level, house_name, member_id, members(first_name, last_name, houses(name))')
      .eq('student_ref', ref)
      .limit(1)
      .then(({ data }) => {
        const s = data?.[0]
        if (!s) setNotFound(true)
        else setStudent(s)
        setLoading(false)
      })
  }, [ref])

  // If signup required email confirmation, createLoginAndLink() stores
  // the ref being claimed in localStorage before showing "check your
  // email". When the confirmation link is clicked, Supabase redirects
  // back to this exact page (emailRedirectTo) with a fresh session --
  // but landing back on the "Is this you?" screen looks like nothing
  // happened, and it's easy to assume confirming the email was the
  // last step. So instead of waiting for another manual "Yes, that's
  // me" click, this finishes the link automatically the moment a
  // session appears for the same ref that was pending confirmation --
  // matching the person's own explicit signup action a few minutes
  // earlier, not just any already-active session (a shared-device
  // session with a stranger still gets the manual confirmation screen
  // as before, since there'd be no matching pending-claim flag for it).
  useEffect(() => {
    if (!session || !student || linked || linking) return
    let pendingRef = null
    try { pendingRef = window.localStorage.getItem('pending_claim_ref') } catch {}
    if (pendingRef && pendingRef === ref) {
      try { window.localStorage.removeItem('pending_claim_ref') } catch {}
      doLink(session.access_token)
    }
  }, [session, student])

  async function doLink(accessToken) {
    setLinking(true)
    setLinkError('')
    try {
      const res = await fetch('/.netlify/functions/link-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ studentId: student.id }),
      })
      const data = await res.json()
      if (data.success) {
        setLinked(true)
        setTimeout(() => { window.location.href = '/athlete-app' }, 1200)
      } else if (data.error && data.error.includes('already linked to a different login')) {
        // This almost always means someone else's login session is
        // still active on this device (e.g. a shared family phone) --
        // not a genuine data problem. Offer to sign that session out
        // directly, rather than a dead-end "ask an admin" message.
        setWrongAccount(true)
      } else {
        setLinkError(data.error || 'Something went wrong linking your profile.')
      }
    } catch (e) {
      setLinkError('Something went wrong linking your profile.')
    }
    setLinking(false)
  }

  function confirmYes() {
    if (session) doLink(session.access_token)
    else setShowCreateLogin(true)
  }

  async function createLoginAndLink() {
    if (password !== confirmPw) { setLinkError('Passwords do not match.'); return }
    if (password.length < 8) { setLinkError('Password must be at least 8 characters.'); return }
    setCreating(true)
    setLinkError('')
    const { data, error } = await supabase.auth.signUp({
      email, password,
      options: { emailRedirectTo: `${window.location.origin}/claim?ref=${encodeURIComponent(ref)}` },
    })
    if (error) { setLinkError(error.message); setCreating(false); return }
    if (data?.user && data.user.identities?.length === 0) {
      setLinkError('An account with this email already exists. Try logging in instead, then come back to this exact link.')
      setCreating(false)
      return
    }
    if (data?.session) {
      await doLink(data.session.access_token)
    } else {
      // No session yet -- email confirmation is required first. Remember
      // which ref this signup was for, so the link can complete
      // automatically the moment a session appears (see the effect
      // above), instead of relying on a second manual "Yes, that's me"
      // click after coming back from the confirmation email.
      try { window.localStorage.setItem('pending_claim_ref', ref) } catch {}
      setAwaitingConfirmation(true)
    }
    setCreating(false)
  }

  async function handleGoogleSignIn() {
    setLinkError('')
    // Same reason as the email path above: if this needs an extra
    // hop (Google's consent screen) the browser leaves this page
    // entirely and comes back later, so remember which ref this was
    // for -- the existing auto-link effect (above) picks this up the
    // moment a session appears matching it, completing the link
    // without a second manual click.
    try { window.localStorage.setItem('pending_claim_ref', ref) } catch {}
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/claim?ref=${encodeURIComponent(ref)}` },
    })
    if (error) setLinkError(error.message)
  }

  if (loading || session === undefined) return <div className="loading">Loading…</div>

  const m = student?.members
  const houseName = student?.house_name || m?.houses?.name
  const colour = HOUSE_COLOURS[houseName] || '#378ADD'

  return (
    <div style={{ minHeight: '100vh', background: '#111', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ width: '100%', maxWidth: 400 }}>
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <img src="/kr-logo.png" alt="KR" style={{ height: 52, objectFit: 'contain', marginBottom: 8 }} />
        </div>

        <div className="card">
          {notFound ? (
            <div style={{ textAlign: 'center', padding: '12px 0' }}>
              <p style={{ fontSize: 14, marginBottom: 14 }}>We couldn't find a profile for this link. It may have expired, or the reference may be incorrect.</p>
              <Link to="/athlete-app" className="btn btn-primary" style={{ justifyContent: 'center', width: '100%' }}>Find your profile instead</Link>
            </div>
          ) : wrongAccount ? (
            <div style={{ textAlign: 'center', padding: '12px 0' }}>
              <div style={{ fontSize: 40, marginBottom: 8 }}>👤</div>
              <p style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>This looks like someone else's device</p>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
                {m?.first_name}'s profile is already linked to their own login — but this browser is currently
                signed in as a different person (common on a shared family phone). Sign out here first,
                then come back to this exact link to sign in as {m?.first_name}.
              </p>
              <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }}
                onClick={async () => { await supabase.auth.signOut(); window.location.reload() }}>
                Sign out and try again
              </button>
            </div>
          ) : linked ? (
            <div style={{ textAlign: 'center', padding: '12px 0' }}>
              <div style={{ fontSize: 40, marginBottom: 8 }}>✅</div>
              <p style={{ fontSize: 15, fontWeight: 600 }}>Linked! Taking you to your profile…</p>
            </div>
          ) : awaitingConfirmation ? (
            <div style={{ textAlign: 'center', padding: '12px 0' }}>
              <div style={{ fontSize: 40, marginBottom: 8 }}>📧</div>
              <p style={{ fontSize: 14, marginBottom: 8 }}>Account created! Check your email to confirm it.</p>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Once confirmed, come back to this exact link (or use the same one again) to finish linking your profile.</p>
            </div>
          ) : !showCreateLogin ? (
            <>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', textAlign: 'center', marginBottom: 14 }}>Is this you?</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18 }}>
                <div style={{ width: 52, height: 52, borderRadius: '50%', background: colour + '22', color: colour, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 700, flexShrink: 0 }}>
                  {m?.first_name?.[0]}{m?.last_name?.[0]}
                </div>
                <div>
                  <div style={{ fontSize: 17, fontWeight: 600 }}>{m?.first_name} {m?.last_name}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    {houseName || '—'} · {student.discipline} · {student.pka_belt || student.krba_level || '—'}
                  </div>
                </div>
              </div>
              {linkError && <p className="error-msg" style={{ marginBottom: 10 }}>{linkError}</p>}
              <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', marginBottom: 8 }}
                onClick={confirmYes} disabled={linking}>
                {linking ? 'Linking…' : '✓ Yes, that\'s me'}
              </button>
              <Link to="/athlete-app" style={{ display: 'block', textAlign: 'center', fontSize: 12, color: 'var(--text-secondary)' }}>
                Not you? Find your profile instead
              </Link>
            </>
          ) : (
            <>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', textAlign: 'center', marginBottom: 14 }}>
                Set up your login to link {m?.first_name}'s profile
              </p>
              <button type="button" onClick={handleGoogleSignIn} className="btn" style={{ width: '100%', justifyContent: 'center', gap: 8, marginBottom: 14 }}>
                <svg width="16" height="16" viewBox="0 0 24 24"><path fill="#4285F4" d="M23.52 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.47c-.28 1.5-1.13 2.78-2.4 3.63v3.02h3.89c2.28-2.1 3.56-5.2 3.56-8.84z"/><path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.9l-3.89-3.02c-1.08.72-2.45 1.15-4.04 1.15-3.11 0-5.74-2.1-6.68-4.92H1.3v3.09C3.26 21.3 7.31 24 12 24z"/><path fill="#FBBC05" d="M5.32 14.31A7.2 7.2 0 0 1 4.93 12c0-.8.14-1.58.39-2.31V6.6H1.3A11.98 11.98 0 0 0 0 12c0 1.94.46 3.77 1.3 5.4l4.02-3.09z"/><path fill="#EA4335" d="M12 4.77c1.76 0 3.34.6 4.58 1.79l3.44-3.44C17.94 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.3 6.6l4.02 3.09C6.26 6.87 8.89 4.77 12 4.77z"/></svg>
                Continue with Google
              </button>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '4px 0 16px', color: 'var(--text-tertiary)', fontSize: 12 }}>
                <div style={{ flex: 1, height: 1, background: 'var(--border)' }} /> or <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
              </div>
              <div className="field"><label>Email</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" />
              </div>
              <div className="field"><label>Password</label>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Min 8 characters" />
              </div>
              <div className="field"><label>Confirm password</label>
                <input type="password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} placeholder="Repeat password" />
              </div>
              {linkError && <p className="error-msg" style={{ marginBottom: 10 }}>{linkError}</p>}
              <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }}
                onClick={createLoginAndLink} disabled={creating || !email || !password}>
                {creating ? 'Creating…' : 'Create login & link profile'}
              </button>
              <p style={{ fontSize: 12, color: 'var(--text-secondary)', textAlign: 'center', marginTop: 10 }}>
                Already have a login? <Link to="/login" style={{ color: 'var(--text)', fontWeight: 500 }}>Sign in</Link>, then come back to this link.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
