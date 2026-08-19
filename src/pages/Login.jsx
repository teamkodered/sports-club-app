import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../hooks/useAuth.jsx'

export default function Login() {
  const navigate = useNavigate()
  const { session, profile, profileError, isStaff } = useAuth()
  const [tab, setTab]             = useState('login')
  const [email, setEmail]         = useState('')
  const [password, setPassword]   = useState('')
  const [error, setError]         = useState('')
  const [loading, setLoading]     = useState(false)
  const [resetSent, setResetSent] = useState(false)
  const [createSent, setCreateSent] = useState(false)

  // Google sign-in redirects the whole page away and back rather than
  // resolving inline like the email/password form, so there's no
  // submit handler to navigate() from directly. Once a session +
  // profile appear (from ANY sign-in method, including landing back
  // here after Google), route to the right place the same way
  // handleLogin's success path already does.
  useEffect(() => {
    if (session && profile) navigate(isStaff ? '/dashboard' : '/athlete-app')
  }, [session, profile])

  // If a session exists but no profile could be matched (even after
  // the automatic email-linking attempt in useAuth), surface that
  // clearly instead of silently sitting on this page forever looking
  // like nothing happened.
  const stuckWithNoProfile = session && !profile && profileError

  async function handleGoogleSignIn() {
    setError('')
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/login`,
        // Without this, Google silently reuses whatever account is
        // already signed into the browser and skips the picker
        // entirely -- easy to end up signed in with the wrong Google
        // account (e.g. a personal Gmail) with no chance to notice or
        // choose differently.
        queryParams: { prompt: 'select_account' },
      },
    })
    if (error) setError(error.message)
  }

  async function handleLogin(e) {
    e.preventDefault()
    setLoading(true); setError('')
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError(error.message)
    } else {
      const { data: member } = await supabase.from('members').select('role').eq('auth_id', data.user.id).single()
      const isStaff = member?.role === 'admin' || member?.role === 'captain' || member?.role === 'coach' || member?.role === 'leader'
      navigate(isStaff ? '/dashboard' : '/athlete-app')
    }
    setLoading(false)
  }

  async function handleReset(e) {
    e.preventDefault()
    setLoading(true); setError('')
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`
    })
    if (error) setError(error.message)
    else setResetSent(true)
    setLoading(false)
  }

  // For an athlete who already has a student record but no login yet
  // (e.g. invited via SMS/copy-link rather than email). This only
  // creates the bare login -- no membership/student record -- they then
  // claim their existing profile via 'Find your profile' in My app.
  async function handleCreateLogin(e) {
    e.preventDefault()
    setLoading(true); setError('')
    const { error } = await supabase.auth.signUp({
      email, password,
      options: { emailRedirectTo: `${window.location.origin}/login` }
    })
    if (error) setError(error.message)
    else setCreateSent(true)
    setLoading(false)
  }

  return (
    <div style={{ minHeight: '100vh', background: '#111', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ width: '100%', maxWidth: 380 }}>

        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <img src="/kr-logo.png" alt="KR Centre" style={{ height: 90, objectFit: 'contain', marginBottom: 12 }} />
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#fff' }}>KR Centre</h1>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginTop: 3 }}>Sports Club Portal</p>
        </div>

        <div className="card">
          {stuckWithNoProfile ? (
            <div style={{ textAlign: 'center', padding: '8px 0' }}>
              <div style={{ fontSize: 36, marginBottom: 10 }}>🔗</div>
              <p style={{ fontSize: 14, fontWeight: 500, marginBottom: 6 }}>Couldn't match this to an existing profile</p>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 14 }}>
                {profileError === 'no_member_record'
                  ? "We signed you in, but couldn't find a member record with a matching email. If you're already a member, make sure you're using the same email address as on file — or ask an admin to check it."
                  : profileError}
              </p>
              <button className="btn btn-sm" onClick={async () => { await supabase.auth.signOut(); window.location.reload() }}>
                Sign out and try again
              </button>
            </div>
          ) : (
          <>
          {/* Tabs */}
          <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: 20 }}>
            {[['login','Sign in'],['reset','Reset password'],['create','Create login']].map(([key, label]) => (
              <button key={key} onClick={() => { setTab(key); setError(''); setResetSent(false); setCreateSent(false) }} style={{
                flex: 1, padding: '8px', fontSize: 13, border: 'none', background: 'none', cursor: 'pointer',
                borderBottom: `2px solid ${tab === key ? 'var(--text)' : 'transparent'}`,
                color: tab === key ? 'var(--text)' : 'var(--text-secondary)',
                fontWeight: tab === key ? 500 : 400,
              }}>{label}</button>
            ))}
          </div>

          {tab === 'login' && (
            <>
              <button type="button" onClick={handleGoogleSignIn} className="btn" style={{ width: '100%', justifyContent: 'center', gap: 8, marginBottom: 14 }}>
                <svg width="16" height="16" viewBox="0 0 24 24"><path fill="#4285F4" d="M23.52 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.47c-.28 1.5-1.13 2.78-2.4 3.63v3.02h3.89c2.28-2.1 3.56-5.2 3.56-8.84z"/><path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.9l-3.89-3.02c-1.08.72-2.45 1.15-4.04 1.15-3.11 0-5.74-2.1-6.68-4.92H1.3v3.09C3.26 21.3 7.31 24 12 24z"/><path fill="#FBBC05" d="M5.32 14.31A7.2 7.2 0 0 1 4.93 12c0-.8.14-1.58.39-2.31V6.6H1.3A11.98 11.98 0 0 0 0 12c0 1.94.46 3.77 1.3 5.4l4.02-3.09z"/><path fill="#EA4335" d="M12 4.77c1.76 0 3.34.6 4.58 1.79l3.44-3.44C17.94 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.3 6.6l4.02 3.09C6.26 6.87 8.89 4.77 12 4.77z"/></svg>
                Continue with Google
              </button>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '4px 0 16px', color: 'var(--text-tertiary)', fontSize: 12 }}>
                <div style={{ flex: 1, height: 1, background: 'var(--border)' }} /> or <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
              </div>
              <form onSubmit={handleLogin}>
                <div className="field"><label>Email</label>
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="your@email.com" autoFocus required />
                </div>
                <div className="field"><label>Password</label>
                  <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Your password" required />
                </div>
                {error && <p style={{ fontSize: 12, color: '#e24b4a', marginBottom: 10 }}>{error}</p>}
                <button type="submit" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} disabled={loading}>
                  {loading ? 'Signing in…' : 'Sign in'}
                </button>
              </form>
            </>
          )}

          {tab === 'reset' && !resetSent && (
            <form onSubmit={handleReset}>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 14 }}>Enter your email and we'll send you a reset link.</p>
              <div className="field"><label>Email</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="your@email.com" autoFocus required />
              </div>
              {error && <p style={{ fontSize: 12, color: '#e24b4a', marginBottom: 10 }}>{error}</p>}
              <button type="submit" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} disabled={loading}>
                {loading ? 'Sending…' : 'Send reset link'}
              </button>
            </form>
          )}

          {tab === 'reset' && resetSent && (
            <div style={{ textAlign: 'center', padding: '8px 0' }}>
              <div style={{ fontSize: 36, marginBottom: 10 }}>📧</div>
              <p style={{ fontSize: 14, fontWeight: 500, marginBottom: 6 }}>Check your email</p>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Reset link sent to <strong>{email}</strong></p>
              <button className="btn btn-sm" style={{ marginTop: 14 }} onClick={() => { setTab('login'); setResetSent(false) }}>Back to sign in</button>
            </div>
          )}

          {tab === 'create' && !createSent && (
            <form onSubmit={handleCreateLogin}>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 14 }}>
                Already have a student profile at KR Centre but no login yet? Create one here with your own email, then link it to your profile from "My app".
              </p>
              <div className="field"><label>Your email</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="your@email.com" autoFocus required />
              </div>
              <div className="field"><label>Choose a password</label>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="At least 6 characters" minLength={6} required />
              </div>
              {error && <p style={{ fontSize: 12, color: '#e24b4a', marginBottom: 10 }}>{error}</p>}
              <button type="submit" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} disabled={loading}>
                {loading ? 'Creating…' : 'Create login'}
              </button>
            </form>
          )}

          {tab === 'create' && createSent && (
            <div style={{ textAlign: 'center', padding: '8px 0' }}>
              <div style={{ fontSize: 36, marginBottom: 10 }}>✓</div>
              <p style={{ fontSize: 14, fontWeight: 500, marginBottom: 6 }}>Login created!</p>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 14 }}>
                Sign in with your new email and password, then go to "My app" → "Find your profile" to link your account.
              </p>
              <button className="btn btn-sm btn-primary" onClick={() => { setTab('login'); setCreateSent(false) }}>Go to sign in</button>
            </div>
          )}
          </>
          )}
        </div>

        <p style={{ textAlign: 'center', fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 16 }}>
          <Link to="/coach-signup" style={{ color: 'rgba(255,255,255,0.7)', fontWeight: 500 }}>Coach signup</Link>
        </p>
      </div>
    </div>
  )
}
