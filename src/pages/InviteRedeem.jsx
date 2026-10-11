import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'

// /invite/:token -- sign in (or create an account), then the invite links you automatically.
export default function InviteRedeem() {
  const { token } = useParams()
  const [session, setSession] = useState(null)
  const [ready, setReady] = useState(false)
  const [mode, setMode] = useState('signup')   // 'signup' | 'signin'
  const [email, setEmail] = useState(''); const [password, setPassword] = useState('')
  const [msg, setMsg] = useState(''); const [busy, setBusy] = useState(false)

  useEffect(() => {
    try { localStorage.setItem('kc_pending_invite', token) } catch {}
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true) })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [token])
  useEffect(() => { if (session) redeem() }, [session])

  async function redeem() {
    setBusy(true); setMsg('Linking your account…')
    const { data, error } = await supabase.rpc('kc_redeem_invite', { p_token: token })
    setBusy(false)
    if (error) return setMsg('Something went wrong: ' + error.message)
    if (data?.error) return setMsg(data.error)
    try { localStorage.removeItem('kc_pending_invite') } catch {}
    window.location.href = data.kind === 'parent' ? '/parent' : '/athlete-app'
  }
  async function submit(e) {
    e.preventDefault(); setBusy(true); setMsg('')
    const fn = mode === 'signup'
      ? supabase.auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: window.location.href } })
      : supabase.auth.signInWithPassword({ email: email.trim(), password })
    const { data, error } = await fn
    setBusy(false)
    if (error) return setMsg(error.message)
    if (mode === 'signup' && !data.session) setMsg('Nearly there — check your email to confirm, then open this invite link again.')
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'var(--bg-secondary)' }}>
      <div className="card" style={{ width: '100%', maxWidth: 400 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 6 }}>KR Centre app</h2>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 14 }}>You've been invited by your coach. {session ? '' : mode === 'signup' ? 'Create your login to continue.' : 'Sign in to continue.'}</p>
        {!ready ? <p>Loading…</p> : session ? (
          <p style={{ fontSize: 14 }}>{msg || 'Linking your account…'}</p>
        ) : (
          <form onSubmit={submit}>
            <div className="field"><label>Email</label><input type="email" required value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" /></div>
            <div className="field"><label>Password</label><input type="password" required minLength={6} value={password} onChange={e => setPassword(e.target.value)} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} /></div>
            <button className="btn btn-primary" disabled={busy} style={{ width: '100%', justifyContent: 'center' }}>{busy ? 'Please wait…' : mode === 'signup' ? 'Create login' : 'Sign in'}</button>
            <button type="button" className="btn btn-sm" style={{ marginTop: 10, width: '100%', justifyContent: 'center' }} onClick={() => { setMode(m => m === 'signup' ? 'signin' : 'signup'); setMsg('') }}>
              {mode === 'signup' ? 'Already have a login? Sign in' : 'New here? Create a login'}
            </button>
            {msg && <p style={{ fontSize: 13, marginTop: 10, color: '#E24B4A' }}>{msg}</p>}
          </form>
        )}
      </div>
    </div>
  )
}
