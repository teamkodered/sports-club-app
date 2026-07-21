import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'

const COACH_ACCESS_CODE = 'KODERED2025' // Change this in Settings once logged in

export default function CoachSignup() {
  const navigate = useNavigate()
  const [step, setStep] = useState(0) // 0=code, 1=details, 2=done
  const [code, setCode] = useState('')
  const [codeError, setCodeError] = useState('')
  const [form, setForm] = useState({
    first_name: '', last_name: '', email: '',
    phone: '', password: '', confirm: '',
    role: 'captain', // captain or admin
  })
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  function set(field) {
    return e => setForm(f => ({ ...f, [field]: e.target.value }))
  }

  function checkCode() {
    if (code.trim().toUpperCase() === COACH_ACCESS_CODE) {
      setStep(1)
      setCodeError('')
    } else {
      setCodeError('Incorrect access code. Contact your administrator.')
    }
  }

  async function submit() {
    if (form.password !== form.confirm) { setError('Passwords do not match.'); return }
    if (form.password.length < 8) { setError('Password must be at least 8 characters.'); return }
    setSubmitting(true)
    setError('')

    try {
      const { data: authData, error: authErr } = await supabase.auth.signUp({
        email: form.email,
        password: form.password,
        options: { emailRedirectTo: `${window.location.origin}/login` }
      })
      if (authErr) throw authErr

      // Supabase returns a user object with an empty identities array (and
      // no real auth.users row) when the email is already registered --
      // it does this to avoid leaking which emails exist. Catch that here
      // rather than trying to link a members row to an auth_id that
      // doesn't actually exist, which fails with a foreign key error.
      if (authData?.user && authData.user.identities?.length === 0) {
        throw new Error('An account with this email already exists. Try signing in instead, or reset your password if you\'ve forgotten it.')
      }
      if (!authData?.user?.id) {
        throw new Error('Something went wrong creating your login — please try again.')
      }

      const { error: memberErr } = await supabase.from('members').insert({
        auth_id: authData.user?.id,
        member_id: `COACH-${Date.now().toString().slice(-5)}`,
        first_name: form.first_name,
        last_name: form.last_name,
        email: form.email,
        phone: form.phone,
        role: form.role,
        status: 'active',
        joined_date: new Date().toISOString().split('T')[0],
      })
      if (memberErr) throw memberErr

      // Redirect straight into the app
      navigate('/dashboard')
    } catch (err) {
      setError(err.message || 'Something went wrong.')
    }
    setSubmitting(false)
  }

  return (
    <div style={{ minHeight: '100vh', background: '#111', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ width: '100%', maxWidth: 400 }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>👤</div>
          <h1 style={{ fontSize: 20, fontWeight: 600 }}>Coach / Staff signup</h1>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 3 }}>For coaches and administrators only</p>
        </div>

        {/* Step 0 — access code */}
        {step === 0 && (
          <div className="card">
            <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>Enter access code</h2>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 14 }}>
              You need an access code from your administrator to create a coach account.
            </p>
            <div className="field">
              <label>Access code</label>
              <input
                value={code}
                onChange={e => setCode(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && checkCode()}
                placeholder="Enter code"
                style={{ textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 600 }}
                autoFocus
              />
              {codeError && <p className="error-msg">{codeError}</p>}
            </div>
            <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} onClick={checkCode}>
              Continue →
            </button>
          </div>
        )}

        {/* Step 1 — details */}
        {step === 1 && (
          <div className="card">
            <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 14 }}>Your details</h2>
            <div className="field-row">
              <div className="field"><label>First name <span className="required">*</span></label><input value={form.first_name} onChange={set('first_name')} placeholder="First name" /></div>
              <div className="field"><label>Last name <span className="required">*</span></label><input value={form.last_name} onChange={set('last_name')} placeholder="Last name" /></div>
            </div>
            <div className="field"><label>Email <span className="required">*</span></label><input type="email" value={form.email} onChange={set('email')} placeholder="coach@example.com" /></div>
            <div className="field"><label>Phone</label><input type="tel" value={form.phone} onChange={set('phone')} placeholder="+44 7700 000000" /></div>
            <div className="field">
              <label>Role</label>
              <select value={form.role} onChange={set('role')}>
                <option value="captain">Coach / Captain</option>
                <option value="admin">Administrator</option>
              </select>
            </div>
            <div className="field"><label>Password <span className="required">*</span></label><input type="password" value={form.password} onChange={set('password')} placeholder="Min 8 characters" /></div>
            <div className="field"><label>Confirm password <span className="required">*</span></label><input type="password" value={form.confirm} onChange={set('confirm')} placeholder="Repeat password" /></div>
            {error && <p className="error-msg" style={{ marginBottom: 10 }}>{error}</p>}
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn" onClick={() => setStep(0)}>← Back</button>
              <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }}
                onClick={submit}
                disabled={submitting || !form.first_name || !form.last_name || !form.email || !form.password}>
                {submitting ? 'Creating account…' : 'Create account'}
              </button>
            </div>
          </div>
        )}

        {/* Step 2 — done */}
        {step === 2 && (
          <div className="card" style={{ textAlign: 'center', padding: 32 }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
            <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Account created</h2>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20, lineHeight: 1.6 }}>
              Welcome, {form.first_name}! Check your email to confirm your address, then log in.
            </p>
            <Link to="/login" className="btn btn-primary" style={{ display: 'inline-flex', justifyContent: 'center', width: '100%' }}>
              Go to login →
            </Link>
          </div>
        )}

        {step < 2 && (
          <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-secondary)', marginTop: 16 }}>
            Member? <Link to="/join-pka-adult" style={{ color: 'var(--text)', fontWeight: 500 }}>Register as a member</Link>
            {' · '}
            <Link to="/login" style={{ color: 'var(--text)', fontWeight: 500 }}>Sign in</Link>
          </p>
        )}
      </div>
    </div>
  )
}
