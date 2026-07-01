import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'

export default function Login() {
  const navigate = useNavigate()
  const [tab, setTab]             = useState('login')
  const [email, setEmail]         = useState('')
  const [password, setPassword]   = useState('')
  const [error, setError]         = useState('')
  const [loading, setLoading]     = useState(false)
  const [resetSent, setResetSent] = useState(false)

  async function handleLogin(e) {
    e.preventDefault()
    setLoading(true); setError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setError(error.message)
    else navigate('/dashboard')
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
          {/* Tabs */}
          <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: 20 }}>
            {[['login','Sign in'],['reset','Reset password']].map(([key, label]) => (
              <button key={key} onClick={() => { setTab(key); setError(''); setResetSent(false) }} style={{
                flex: 1, padding: '8px', fontSize: 13, border: 'none', background: 'none', cursor: 'pointer',
                borderBottom: `2px solid ${tab === key ? 'var(--text)' : 'transparent'}`,
                color: tab === key ? 'var(--text)' : 'var(--text-secondary)',
                fontWeight: tab === key ? 500 : 400,
              }}>{label}</button>
            ))}
          </div>

          {tab === 'login' && (
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
        </div>

        <p style={{ textAlign: 'center', fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 16 }}>
          New member?{' '}
          <Link to="/join-pka-adult" style={{ color: 'rgba(255,255,255,0.7)', fontWeight: 500 }}>Register here</Link>
          {' · '}
          <Link to="/coach-signup" style={{ color: 'rgba(255,255,255,0.7)', fontWeight: 500 }}>Coach signup</Link>
        </p>
      </div>
    </div>
  )
}
