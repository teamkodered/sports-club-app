import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'

export default function ResetPassword() {
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm]   = useState('')
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState('')
  const [done, setDone]         = useState(false)

  async function handleReset(e) {
    e.preventDefault()
    if (password !== confirm) { setError('Passwords do not match'); return }
    if (password.length < 8) { setError('Minimum 8 characters'); return }
    setSaving(true)
    const { error } = await supabase.auth.updateUser({ password })
    if (error) setError(error.message)
    else { setDone(true); setTimeout(() => navigate('/dashboard'), 2000) }
    setSaving(false)
  }

  if (done) return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div className="card" style={{ maxWidth: 380, textAlign: 'center', padding: 32 }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
        <h2 style={{ fontSize: 18, fontWeight: 600 }}>Password updated!</h2>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 8 }}>Redirecting you to the app…</p>
      </div>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ width: '100%', maxWidth: 380 }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>🔑</div>
          <h1 style={{ fontSize: 20, fontWeight: 600 }}>Set new password</h1>
        </div>
        <div className="card">
          <form onSubmit={handleReset}>
            <div className="field"><label>New password</label><input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Min 8 characters" autoFocus required /></div>
            <div className="field"><label>Confirm password</label><input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="Repeat new password" required /></div>
            {error && <p style={{ fontSize: 12, color: '#a32d2d', marginBottom: 10 }}>{error}</p>}
            <button type="submit" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} disabled={saving}>
              {saving ? 'Updating…' : 'Update password'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
