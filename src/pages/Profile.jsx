import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../hooks/useAuth.jsx'

export default function Profile() {
  const { profile, setProfile } = useAuth()
  const [form, setForm]       = useState({})
  const [editing, setEditing] = useState(false)
  const [saving, setSaving]   = useState(false)
  const [saved, setSaved]     = useState(false)
  const [pwForm, setPwForm]   = useState({ current: '', new: '', confirm: '' })
  const [pwSaving, setPwSaving] = useState(false)
  const [pwMsg, setPwMsg]     = useState('')

  useEffect(() => {
    if (profile) setForm({
      first_name: profile.first_name || '',
      last_name:  profile.last_name  || '',
      email:      profile.email      || '',
      phone:      profile.phone      || '',
      address_line1: profile.address_line1 || '',
      date_of_birth: profile.date_of_birth || '',
    })
  }, [profile])

  async function saveProfile() {
    setSaving(true)
    const { error } = await supabase.from('members').update({
      first_name: form.first_name,
      last_name:  form.last_name,
      phone:      form.phone,
      address_line1: form.address_line1,
      date_of_birth: form.date_of_birth || null,
    }).eq('id', profile.id)
    if (!error) {
      setSaved(true)
      setEditing(false)
      setTimeout(() => setSaved(false), 2500)
    }
    setSaving(false)
  }

  async function changePassword() {
    if (pwForm.new !== pwForm.confirm) { setPwMsg('Passwords do not match'); return }
    if (pwForm.new.length < 8) { setPwMsg('Password must be at least 8 characters'); return }
    setPwSaving(true)
    const { error } = await supabase.auth.updateUser({ password: pwForm.new })
    if (error) { setPwMsg(error.message) }
    else { setPwMsg('Password updated successfully ✓'); setPwForm({ current: '', new: '', confirm: '' }) }
    setPwSaving(false)
  }

  if (!profile) return <div className="loading">Loading profile…</div>

  const initials = `${profile.first_name?.[0] || ''}${profile.last_name?.[0] || ''}`.toUpperCase()

  function set(field) { return e => setForm(f => ({ ...f, [field]: e.target.value })) }

  return (
    <div style={{ maxWidth: 560 }}>
      <div className="page-header">
        <h1>My profile</h1>
        <p>Manage your personal details and password</p>
      </div>

      {/* Avatar */}
      <div className="card" style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: editing ? 16 : 0 }}>
          <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#378ADD22', color: '#378ADD', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 700 }}>
            {initials}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 17, fontWeight: 600 }}>{profile.first_name} {profile.last_name}</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2, textTransform: 'capitalize' }}>{profile.role} · {profile.email}</div>
          </div>
          {!editing && (
            <button className="btn btn-sm" onClick={() => setEditing(true)}>Edit</button>
          )}
          {saved && <span style={{ fontSize: 12, color: '#1d9e75', fontWeight: 600 }}>✓ Saved</span>}
        </div>

        {editing && (
          <>
            <div className="field-row">
              <div className="field"><label>First name</label><input value={form.first_name} onChange={set('first_name')} /></div>
              <div className="field"><label>Last name</label><input value={form.last_name} onChange={set('last_name')} /></div>
            </div>
            <div className="field"><label>Phone</label><input type="tel" value={form.phone} onChange={set('phone')} /></div>
            <div className="field"><label>Address</label><input value={form.address_line1} onChange={set('address_line1')} /></div>
            <div className="field"><label>Date of birth</label><input type="date" value={form.date_of_birth} onChange={set('date_of_birth')} /></div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Email</label>
              <input value={form.email} readOnly style={{ opacity: 0.6 }} />
              <p className="hint">Email can't be changed here — contact your admin.</p>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              <button className="btn" onClick={() => setEditing(false)}>Cancel</button>
              <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={saveProfile} disabled={saving}>
                {saving ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </>
        )}
      </div>

      {/* Change password */}
      <div className="card">
        <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: 14 }}>Change password</h2>
        <div className="field"><label>New password</label><input type="password" value={pwForm.new} onChange={e => setPwForm(f => ({ ...f, new: e.target.value }))} placeholder="Min 8 characters" /></div>
        <div className="field"><label>Confirm new password</label><input type="password" value={pwForm.confirm} onChange={e => setPwForm(f => ({ ...f, confirm: e.target.value }))} placeholder="Repeat new password" /></div>
        {pwMsg && <p style={{ fontSize: 12, color: pwMsg.includes('✓') ? '#1d9e75' : '#a32d2d', marginBottom: 10 }}>{pwMsg}</p>}
        <button className="btn btn-primary" onClick={changePassword} disabled={pwSaving || !pwForm.new || !pwForm.confirm}>
          {pwSaving ? 'Updating…' : 'Update password'}
        </button>
      </div>
    </div>
  )
}
