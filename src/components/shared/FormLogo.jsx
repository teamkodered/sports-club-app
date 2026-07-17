import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../../hooks/useAuth.jsx'
import { supabase } from '../../lib/supabase.js'

// Shows a form's logo, defaulting to defaultSrc (or an emoji if none given).
// Admins see a small edit control to upload a custom logo for this specific
// form, stored in Supabase Storage with the URL saved to Settings -- so it
// persists and applies for everyone, not just the admin who uploaded it.
export default function FormLogo({ formKey, defaultSrc, fallbackEmoji = '🥋', size = 56 }) {
  const { isAdmin } = useAuth()
  const [logoUrl, setLogoUrl] = useState(null)
  const [editing, setEditing] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef(null)

  useEffect(() => {
    supabase.from('settings').select('value').eq('key', `form_logo_${formKey}`).maybeSingle()
      .then(({ data }) => { if (data?.value) setLogoUrl(data.value) })
  }, [formKey])

  async function handleUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const ext = file.name.split('.').pop()
      const path = `logos/${formKey}-${Date.now()}.${ext}`
      const { error: upErr } = await supabase.storage.from('athlete-media').upload(path, file, { upsert: true })
      if (upErr) throw upErr
      const { data: urlData } = supabase.storage.from('athlete-media').getPublicUrl(path)
      const { error: setErr } = await supabase.from('settings').upsert({ key: `form_logo_${formKey}`, value: urlData.publicUrl }, { onConflict: 'key' })
      if (setErr) throw setErr
      setLogoUrl(urlData.publicUrl)
      setEditing(false)
    } catch (err) {
      alert('Error uploading logo: ' + err.message)
    }
    setUploading(false)
  }

  async function handleRemove() {
    if (!confirm('Remove the custom logo and go back to the default?')) return
    const { error } = await supabase.from('settings').upsert({ key: `form_logo_${formKey}`, value: null }, { onConflict: 'key' })
    if (error) { alert('Error: ' + error.message); return }
    setLogoUrl(null)
    setEditing(false)
  }

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      {logoUrl ? (
        <img src={logoUrl} alt="Logo" style={{ height: size, marginBottom: 8, objectFit: 'contain' }} />
      ) : defaultSrc ? (
        <img src={defaultSrc} alt="Logo" style={{ height: size, marginBottom: 8, objectFit: 'contain' }} />
      ) : (
        <div style={{ fontSize: size * 0.55, marginBottom: 8 }}>{fallbackEmoji}</div>
      )}
      {isAdmin && !editing && (
        <button onClick={() => setEditing(true)}
          style={{ position: 'absolute', top: -4, right: -26, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '50%', width: 22, height: 22, cursor: 'pointer', fontSize: 11, lineHeight: 1 }}
          title="Edit logo (admin only)">✏️</button>
      )}
      {isAdmin && editing && (
        <div style={{ position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 10, zIndex: 20, boxShadow: 'var(--shadow)', whiteSpace: 'nowrap', textAlign: 'center' }}>
          <input ref={fileRef} type="file" accept="image/*" onChange={handleUpload} disabled={uploading} style={{ fontSize: 11, marginBottom: 6, display: 'block' }} />
          <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
            {logoUrl && <button className="btn btn-sm" onClick={handleRemove} style={{ fontSize: 10 }}>Reset to default</button>}
            <button className="btn btn-sm" onClick={() => setEditing(false)} style={{ fontSize: 10 }}>Close</button>
          </div>
          {uploading && <p style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 4 }}>Uploading…</p>}
        </div>
      )}
    </div>
  )
}
