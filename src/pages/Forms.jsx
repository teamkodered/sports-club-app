import { useState } from 'react'
import { useAuth } from '../hooks/useAuth.jsx'

const BASE_URL = typeof window !== 'undefined' ? window.location.origin : 'https://klasschamp.netlify.app'

const FORMS = [
  {
    key: 'pka_child',
    label: 'PKA Child Membership',
    desc: 'For members under 16. Includes parent/guardian details, medical, media permission.',
    icon: '🥋',
    path: '/join-pka-child',
    colour: '#378ADD',
    driveId: '1L5QuUTMHliD-QzajZz07uYmUKksy-LzYl5jao2cFuo8',
  },
  {
    key: 'pka_adult',
    label: 'PKA Adult Membership',
    desc: 'For members 16+. Includes goals, fitness level, waiver.',
    icon: '🥋',
    path: '/join-pka-adult',
    colour: '#378ADD',
    driveId: '1FX-DHutI6aFpcg-_VtjgYOcVNbuUxQ0hcRr3IoAsJqU',
  },
  {
    key: 'krba',
    label: 'KRBA Membership',
    desc: 'Kode Red Boxing Academy. Includes medical, emergency contact, waiver.',
    icon: '🥊',
    path: '/join-krba',
    colour: '#E24B4A',
    driveId: null,
  },
  {
    key: 'grading',
    label: 'Grading Expression of Interest',
    desc: 'Students express interest in grading. Coach approval required.',
    icon: '🎽',
    path: '/grading',
    colour: '#1D9E75',
    driveId: null,
  },
  {
    key: 'fit2fight',
    label: 'Fit II Fight Training Log',
    desc: 'Session training logger for students.',
    icon: '💪',
    path: '/fit2fight',
    colour: '#EF9F27',
    driveId: null,
  },
  {
    key: 'boxing_tpt',
    label: 'Boxing TPT Analysis',
    desc: 'Technical, Physical & Mental assessment for boxing.',
    icon: '📊',
    path: '/boxing-tpt',
    colour: '#E24B4A',
    driveId: null,
  },
  {
    key: 'kb_tpt',
    label: 'Kickboxing TPT Analysis',
    desc: 'Kode Red physical performance assessment.',
    icon: '📊',
    path: '/kickboxing-tpt',
    colour: '#378ADD',
    driveId: null,
  },
]

function ShareModal({ form, onClose }) {
  const url = `${BASE_URL}${form.path}`
  const [copied, setCopied] = useState(false)
  const msg = `Hi! Please use this link to complete your ${form.label} form: ${url}`

  function copyLink() {
    navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const SHARE_OPTIONS = [
    {
      label: 'WhatsApp',
      icon: '💬',
      colour: '#25D366',
      url: `https://wa.me/?text=${encodeURIComponent(msg)}`,
    },
    {
      label: 'SMS / Text',
      icon: '📱',
      colour: '#185FA5',
      url: `sms:?body=${encodeURIComponent(msg)}`,
    },
    {
      label: 'Email',
      icon: '📧',
      colour: '#EF9F27',
      url: `mailto:?subject=${encodeURIComponent(form.label)}&body=${encodeURIComponent(msg)}`,
    },
    {
      label: 'Facebook',
      icon: '📘',
      colour: '#1877F2',
      url: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
    },
  ]

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 }}>
      <div className="card" style={{ width: '100%', maxWidth: 420 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 600 }}>{form.icon} {form.label}</h2>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>Share this form link</p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer' }}>✕</button>
        </div>

        {/* URL display */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <input readOnly value={url}
            style={{ flex: 1, padding: '8px 10px', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius)', fontSize: 12, background: 'var(--bg-secondary)', color: 'var(--text)', fontFamily: 'monospace' }} />
          <button className="btn btn-primary" onClick={copyLink}>{copied ? '✓ Copied!' : 'Copy'}</button>
        </div>

        {/* Share buttons */}
        <p style={{ fontSize: 12, fontWeight: 600, marginBottom: 10, color: 'var(--text-secondary)' }}>Share via</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
          {SHARE_OPTIONS.map(s => (
            <a key={s.label} href={s.url} target="_blank" rel="noreferrer" style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
              border: `1px solid ${s.colour}22`, borderRadius: 'var(--radius)',
              background: s.colour + '10', textDecoration: 'none', color: 'var(--text)',
            }}>
              <span style={{ fontSize: 20 }}>{s.icon}</span>
              <span style={{ fontSize: 13, fontWeight: 500, color: s.colour }}>{s.label}</span>
            </a>
          ))}
        </div>

        {/* Google Drive template */}
        {form.driveId && (
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
            <p style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: 'var(--text-secondary)' }}>Original Google Drive form template</p>
            <a href={`https://docs.google.com/document/d/${form.driveId}/view`} target="_blank" rel="noreferrer"
              className="btn" style={{ width: '100%', justifyContent: 'center', fontSize: 12 }}>
              📄 View Drive template
            </a>
          </div>
        )}

        {/* Open form */}
        <div style={{ marginTop: 10 }}>
          <a href={form.path} target="_blank" rel="noreferrer"
            className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }}>
            Open form →
          </a>
        </div>
      </div>
    </div>
  )
}

export default function Forms() {
  const { isAdmin } = useAuth()
  const [shareForm, setShareForm] = useState(null)

  return (
    <div>
      <div className="page-header">
        <h1>Forms</h1>
        <p>Membership forms and analysis tools — share links with students</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
        {FORMS.map(f => (
          <div key={f.key} className="card" style={{ borderLeft: `3px solid ${f.colour}`, borderRadius: '0 var(--border-radius-lg) var(--border-radius-lg) 0' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 10 }}>
              <span style={{ fontSize: 24 }}>{f.icon}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{f.label}</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2, lineHeight: 1.5 }}>{f.desc}</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <a href={f.path} target="_blank" rel="noreferrer" className="btn btn-sm" style={{ flex: 1, justifyContent: 'center' }}>
                Open form
              </a>
              <button className="btn btn-sm btn-primary" onClick={() => setShareForm(f)} style={{ flex: 1, justifyContent: 'center' }}>
                Share link
              </button>
            </div>
          </div>
        ))}
      </div>

      {shareForm && <ShareModal form={shareForm} onClose={() => setShareForm(null)} />}
    </div>
  )
}
