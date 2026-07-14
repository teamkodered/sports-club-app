import { useState, useEffect } from 'react'
import { useAuth } from '../hooks/useAuth.jsx'
import { supabase } from '../lib/supabase.js'

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
  {
    key: 'checkin',
    label: 'Check in',
    desc: 'Staff/kiosk session check-in — attendance, full kit, and weigh-in/out.',
    icon: '✅',
    path: '/checkin',
    colour: '#1D9E75',
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
  const [selectedForm, setSelectedForm] = useState(null)
  const [responses, setResponses] = useState([])
  const [responsesLoading, setResponsesLoading] = useState(false)
  const [viewResponse, setViewResponse] = useState(null)

  useEffect(() => {
    if (selectedForm) loadResponses(selectedForm)
  }, [selectedForm])

  function printResponse(r) {
    const w = window.open('', '_blank')
    const fields = Object.entries(r).filter(([k,v]) => v && !['id','form_type','waiver_agreed'].includes(k))
    w.document.write(`
      <html><head><title>${r.first_name} ${r.last_name} — Membership Form</title>
      <style>
        body { font-family: Arial, sans-serif; max-width: 600px; margin: 40px auto; font-size: 13px; }
        h1 { font-size: 18px; border-bottom: 2px solid #333; padding-bottom: 8px; }
        .field { display: flex; gap: 16px; padding: 6px 0; border-bottom: 1px solid #eee; }
        .label { min-width: 180px; font-weight: bold; color: #555; text-transform: capitalize; }
        .value { flex: 1; }
        @media print { body { margin: 20px; } }
      </style></head>
      <body>
        <h1>KR Centre — Membership Form</h1>
        <p><strong>Form type:</strong> ${r.form_type?.replace('_',' ').toUpperCase()}</p>
        ${fields.map(([k,v]) => `<div class="field"><div class="label">${k.replace(/_/g,' ')}</div><div class="value">${v}</div></div>`).join('')}
        <br><br>
        <p>Signature: _________________________ &nbsp;&nbsp; Date: _________________________</p>
      </body></html>
    `)
    w.document.close()
    setTimeout(() => w.print(), 500)
  }

  async function loadResponses(form) {
    setResponsesLoading(true)
    setResponses([])
    const { data } = await supabase
      .from('membership_forms')
      .select('*')
      .eq('form_type', form.key)
      .order('submitted_at', { ascending: false })
    setResponses(data || [])
    setResponsesLoading(false)
  }

  return (
    <div>
      <div className="page-header">
        <h1>Forms</h1>
        <p>Membership forms and analysis tools</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: selectedForm ? '280px 1fr' : '1fr', gap: 16, alignItems: 'start' }}>

        {/* Left — forms list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {FORMS.map(f => (
            <div key={f.key} className="card" style={{
              borderLeft: `3px solid ${f.colour}`,
              borderRadius: '0 var(--border-radius-lg) var(--border-radius-lg) 0',
              cursor: 'pointer',
              background: selectedForm?.key === f.key ? f.colour + '10' : 'var(--bg)',
              outline: selectedForm?.key === f.key ? `2px solid ${f.colour}` : 'none',
            }}>
              {/* Form info row */}
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 10 }}>
                <span style={{ fontSize: 22 }}>{f.icon}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{f.label}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2, lineHeight: 1.4 }}>{f.desc}</div>
                </div>
              </div>

              {/* Action buttons */}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <a href={f.path} target="_blank" rel="noreferrer" className="btn btn-sm"
                  style={{ flex: 1, justifyContent: 'center', fontSize: 11 }}>
                  Open
                </a>
                <button className="btn btn-sm btn-primary" onClick={() => setShareForm(f)}
                  style={{ flex: 1, justifyContent: 'center', fontSize: 11 }}>
                  Share
                </button>
                <a href={f.path} target="_blank" rel="noreferrer" className="btn btn-sm"
                  onClick={e => { e.preventDefault(); const w = window.open(f.path, '_blank'); setTimeout(() => w?.print(), 1000) }}
                  style={{ justifyContent: 'center', fontSize: 11 }} title="Print">
                  🖨️
                </a>
                <button className="btn btn-sm" onClick={() => setSelectedForm(selectedForm?.key === f.key ? null : f)}
                  style={{ justifyContent: 'center', fontSize: 11,
                    background: selectedForm?.key === f.key ? f.colour : '',
                    color: selectedForm?.key === f.key ? '#fff' : '',
                    borderColor: f.colour }}>
                  📋 Responses
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Right — responses panel */}
        {selectedForm && (
          <div className="card" style={{ position: 'sticky', top: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div>
                <h2 style={{ fontSize: 15, fontWeight: 600 }}>{selectedForm.icon} {selectedForm.label}</h2>
                <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                  {responsesLoading ? 'Loading…' : `${responses.length} response${responses.length !== 1 ? 's' : ''}`}
                </p>
              </div>
              <button onClick={() => setSelectedForm(null)}
                style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--text-secondary)' }}>✕</button>
            </div>

            {responsesLoading ? (
              <div className="loading">Loading…</div>
            ) : responses.length === 0 ? (
              <div className="empty-state" style={{ padding: '24px 0' }}>
                <p>No responses yet.</p>
                <a href={selectedForm.path} target="_blank" rel="noreferrer" className="btn btn-sm btn-primary" style={{ marginTop: 8 }}>
                  Open form →
                </a>
              </div>
            ) : (
              <div>
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Name</th>
                      <th>Email</th>
                      <th style={{ textAlign: 'center' }}>Status</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {responses.map((r, i) => (
                      <tr key={i} style={{ cursor: 'pointer' }} onClick={() => setViewResponse(r)}>
                        <td style={{ fontSize: 11, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                          {r.submitted_at ? new Date(r.submitted_at).toLocaleDateString('en-GB') : '—'}
                        </td>
                        <td style={{ fontWeight: 500, fontSize: 13 }}>{r.first_name} {r.last_name}</td>
                        <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{r.email || '—'}</td>
                        <td style={{ textAlign: 'center' }}>
                          <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 20,
                            background: r.status === 'active' ? '#1d9e7520' : r.status === 'stopped' ? '#a32d2d20' : '#EF9F2720',
                            color: r.status === 'active' ? '#1d9e75' : r.status === 'stopped' ? '#a32d2d' : '#EF9F27' }}>
                            {r.status || 'pending'}
                          </span>
                        </td>
                        <td>
                          <button className="btn btn-sm" onClick={e => { e.stopPropagation(); setViewResponse(r) }}>
                            View →
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Share modal */}
      {shareForm && <ShareModal form={shareForm} onClose={() => setShareForm(null)} />}

      {/* View response modal */}
      {viewResponse && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 }}>
          <div className="card" style={{ width: '100%', maxWidth: 540, maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexShrink: 0 }}>
              <h2 style={{ fontSize: 15, fontWeight: 600 }}>{viewResponse.first_name} {viewResponse.last_name}</h2>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-sm" onClick={() => printResponse(viewResponse)}>🖨️ Print</button>
                <button onClick={() => setViewResponse(null)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer' }}>✕</button>
              </div>
            </div>
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {Object.entries(viewResponse)
                .filter(([k]) => !['id'].includes(k))
                .map(([k, v]) => v && (
                  <div key={k} style={{ display: 'flex', gap: 12, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)', minWidth: 140, textTransform: 'capitalize' }}>
                      {k.replace(/_/g, ' ')}
                    </span>
                    <span style={{ fontSize: 13, flex: 1 }}>{String(v)}</span>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

