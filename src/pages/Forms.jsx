import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.jsx'
import { viewAsVenueScope } from '../lib/viewAsScope.js'
import JoinApplicationsPanel from '../components/shared/JoinApplicationsPanel.jsx'
import { supabase } from '../lib/supabase.js'
import { printMembershipForm, printGenericResponse, printBlankForm } from '../lib/printForm.jsx'

function SortTh({ children, col, sortKey, sortDir, onSort, style = {} }) {
  const active = sortKey === col
  return (
    <th onClick={() => onSort(col)} style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap', ...style }}>
      {children}<span style={{ marginLeft: 4, fontSize: 9, opacity: active ? 1 : 0.4 }}>{active ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}</span>
    </th>
  )
}

const BASE_URL = 'https://klasschamp.netlify.app'

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
    label: 'Boxing MTP Analysis',
    desc: 'Mental, Technical and Physical assessment for boxing.',
    icon: '📊',
    path: '/boxing-tpt',
    colour: '#E24B4A',
    driveId: null,
  },
  {
    key: 'kb_tpt',
    label: 'Kickboxing MTP Analysis',
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
    path: '/checkin-public',
    colour: '#1D9E75',
    driveId: null,
  },
  {
    key: 'coach_signup',
    label: 'Coach Signup',
    desc: 'Invite a new coach to create their account. Requires the coach access code from Settings.',
    icon: '🧑‍🏫',
    path: '/coach-signup',
    colour: '#8B5CF6',
    driveId: null,
    adminOnly: true,
  },
]

export function ShareModal({ form, onClose }) {
  // Join forms: pick the venue before sending (one tap) -- the link carries it, so the
  // applicant isn't asked. A Head Coach's share window starts on Derby Moore.
  const isJoinForm = /^\/join-/.test(form.path || '')
  const { role } = useAuth()
  const [venue, setVenue] = useState(role === 'head_coach' ? 'derby-moore' : 'kr-centre')
  const url = `${BASE_URL}${form.path}${isJoinForm ? `?venue=${venue}` : ''}`
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

  const hasNativeShare = typeof navigator !== 'undefined' && !!navigator.share
  async function nativeShare() {
    // Passing url as its own field (rather than only embedded inside
    // text) is what lets the receiving app -- WhatsApp etc -- reliably
    // recognise this as a link and pull in its preview card/logo.
    // Some share targets showed no preview when the link was only
    // ever a substring of the text field.
    try { await navigator.share({ text: `Hi! Please use this link to complete your ${form.label} form:`, url }) } catch (e) { /* user cancelled — ignore */ }
  }

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

        {isJoinForm && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, color: 'var(--text-tertiary)', marginBottom: 6 }}>WHICH VENUE?</div>
            <div style={{ display: 'flex', gap: 6 }}>
              {[['kr-centre', 'KR Centre'], ['derby-moore', 'Derby Moore'], ['moorways', 'Moorways']].map(([k, l]) => (
                <button key={k} type="button" onClick={() => setVenue(k)}
                  style={{ flex: 1, padding: '8px 6px', borderRadius: 8, fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font-sans)',
                    border: `1px solid ${venue === k ? '#E24B4A' : 'var(--border-strong)'}`, background: venue === k ? '#E24B4A14' : 'transparent',
                    color: 'var(--text)', fontWeight: venue === k ? 700 : 400 }}>{l}</button>
              ))}
            </div>
          </div>
        )}

        {/* URL display */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <input readOnly value={url}
            style={{ flex: 1, padding: '8px 10px', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius)', fontSize: 12, background: 'var(--bg-secondary)', color: 'var(--text)', fontFamily: 'monospace' }} />
          <button className="btn btn-primary" onClick={copyLink}>{copied ? '✓ Copied!' : 'Copy'}</button>
        </div>

        {hasNativeShare && (
          <>
            <button onClick={nativeShare} className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', marginBottom: 6 }}>
              📤 Share…
            </button>
            <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 14 }}>
              Recommended — opens your phone's own share menu with a clean message each time. The WhatsApp button below can sometimes glue two messages together if a previous share is still sitting unsent in WhatsApp's compose box.
            </p>
          </>
        )}

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
  const { isAdmin, isStaff, viewAs } = useAuth()
  const navigate = useNavigate()
  const [shareForm, setShareForm] = useState(null)
  const [selectedForm, setSelectedForm] = useState(null)
  const [responses, setResponses] = useState([])
  const [responsesLoading, setResponsesLoading] = useState(false)
  const [viewResponse, setViewResponse] = useState(null)
  const [colFilters, setColFilters] = useState({ date: '', name: '', email: '', status: '' })
  const [sortKey, setSortKey] = useState('date')
  const [sortDir, setSortDir] = useState('desc')
  // phone: one column -- picking 📋 Responses shows the responses full width (with a back button)
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 760px)').matches)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 760px)')
    const on = () => setIsMobile(mq.matches)
    mq.addEventListener?.('change', on)
    return () => mq.removeEventListener?.('change', on)
  }, [])
  useEffect(() => { if (isMobile && selectedForm) window.scrollTo({ top: 0, behavior: 'smooth' }) }, [selectedForm, isMobile])
  function toggleSort(col) {
    if (sortKey === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(col); setSortDir('asc') }
  }

  useEffect(() => {
    if (selectedForm) loadResponses(selectedForm)
  }, [selectedForm])

  function printResponse(r) {
    if (['pka_child', 'pka_adult', 'krba'].includes(selectedForm?.key) || ['pka_child', 'pka_adult', 'krba'].includes(r.form_type)) printMembershipForm(r)
    else printGenericResponse(r, selectedForm?.label)
  }

  // These four forms save to their own dedicated table rather than the
  // generic membership_forms table -- this mapping is what was missing
  // before, which is why their response counts always silently showed
  // zero regardless of how many people had actually submitted.
  const RESPONSE_TABLE_BY_FORM_KEY = {
    grading: { table: 'grading_expressions', dateField: 'created_at' },
    fit2fight: { table: 'fit2fight_sessions', dateField: 'session_date' },
    boxing_tpt: { table: 'tpt_boxing', dateField: 'created_at' },
    kb_tpt: { table: 'tpt_kickboxing', dateField: 'created_at' },
  }

  async function loadResponses(form) {
    setResponsesLoading(true)
    setResponses([])

    const override = RESPONSE_TABLE_BY_FORM_KEY[form.key]
    if (override) {
      const { data, error } = await supabase.from(override.table).select(form.key === 'grading' ? '*, students(members(first_name, last_name))' : '*')
      if (error) { alert(`Error loading responses: ${error.message}`); setResponsesLoading(false); return }
      // Normalised to submitted_at so the existing generic date
      // display/sort/print logic below works unchanged regardless of
      // what this particular table actually calls its own date column.
      const normalized = (data || [])
        .map(r => {
          const row = { ...r, submitted_at: r[override.dateField] || null }
          if (form.key === 'grading') {
            // the linked student's name, or the name typed on the form (flagged) if it wasn't matched
            const m = r.students?.members
            let typed = null; try { typed = (typeof r.notes === 'string' ? JSON.parse(r.notes) : r.notes)?.name } catch { /* ignore */ }
            if (m) { row.first_name = m.first_name; row.last_name = m.last_name }
            else { row.first_name = typed || 'Unknown student'; row.last_name = typed ? '(not linked — link it in CRM → Grading requests)' : '' }
          }
          return row
        })
        .sort((a, b) => (b.submitted_at || '').localeCompare(a.submitted_at || ''))
      setResponses(normalized)
      setResponsesLoading(false)
      return
    }

    const { data, error } = await supabase
      .from('membership_forms')
      .select('*, members(id, status, students(media_restriction))')
      .eq('form_type', form.key)
      .order('submitted_at', { ascending: false })
    if (error) { alert(`Error loading responses: ${error.message}`); setResponsesLoading(false); return }
    // Flatten the joined media_restriction up to the top level and drop
    // the nested "members" object -- both the on-screen response viewer
    // and the print view render every field generically with
    // Object.entries(), which would otherwise show the raw nested
    // object instead of a clean "Media permission" row.
    //
    // IMPORTANT: membership_forms has its own (separate, disconnected)
    // "status" column, which used to leak through here via the `*`
    // wildcard select and never actually matched the real, current
    // status stored on members.status -- the one Stopped Training and
    // everywhere else in the app actually relies on. member_status
    // below always overrides it with the real value.
    const flattened = (data || []).map(r => {
      const studentsData = r.members?.students
      const mediaRestriction = Array.isArray(studentsData) ? studentsData[0]?.media_restriction : studentsData?.media_restriction
      const memberId = r.members?.id
      const memberStatus = r.members?.status
      const { members, ...rest } = r
      return { ...rest, member_id: memberId, status: memberStatus || 'pending', media_permission: mediaRestriction === 'Yes' ? 'Yes' : mediaRestriction === 'No' ? 'No' : null }
    })
    // Admin "View as": show only what that person can really see (Head Coach: his venue's students)
    const scope = await viewAsVenueScope(viewAs)
    setResponses(scope ? flattened.filter(r => r.member_id && scope.venueMemberIds.has(r.member_id)) : flattened)
    setResponsesLoading(false)
  }

  async function updateResponseStatus(memberId, newStatus) {
    if (!memberId) { alert("Can't update status -- this response isn't linked to a member record."); return }
    const { error } = await supabase.from('members').update({ status: newStatus }).eq('id', memberId)
    if (error) { alert('Error updating status: ' + error.message); return }
    setResponses(prev => prev.map(r => r.member_id === memberId ? { ...r, status: newStatus } : r))
  }

  return (
    <div>
      <div className="page-header">
        <h1>Forms</h1>
        <p>Membership forms and analysis tools</p>
      </div>

      {isStaff && <JoinApplicationsPanel />}

      <div style={{ display: 'grid', gridTemplateColumns: selectedForm && !isMobile ? '280px 1fr' : 'minmax(0, 1fr)', gap: 16, alignItems: 'start' }}>

        {/* Left — forms list */}
        <div style={selectedForm && isMobile ? { display: 'none' } : selectedForm ? { display: 'flex', flexDirection: 'column', gap: 8 } : { display: 'grid', gridTemplateColumns: isMobile ? 'minmax(0, 1fr)' : '1fr 1fr', gap: 12 }}>
          {FORMS.filter(f => !f.adminOnly || isAdmin).map(f => (
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
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <a href={f.path} target="_blank" rel="noreferrer" className="btn btn-sm"
                  style={{ justifyContent: 'center', fontSize: 11 }}>
                  Open
                </a>
                <button className="btn btn-sm btn-primary" onClick={() => setShareForm(f)}
                  style={{ justifyContent: 'center', fontSize: 11 }}>
                  Share
                </button>
                <div style={{ display: 'flex', gap: 6 }}>
                  <a href={f.path} target="_blank" rel="noreferrer" className="btn btn-sm"
                    onClick={e => { e.preventDefault(); ['pka_child', 'pka_adult', 'krba'].includes(f.key) ? printMembershipForm({ form_type: f.key }, { blank: true }) : printBlankForm(f.path) }}
                    style={{ flex: 1, justifyContent: 'center', fontSize: 11 }} title="Print">
                    🖨️
                  </a>
                  <button className="btn btn-sm" onClick={() => setSelectedForm(selectedForm?.key === f.key ? null : f)}
                    style={{ flex: 1, justifyContent: 'center', fontSize: 11,
                      background: selectedForm?.key === f.key ? f.colour : '',
                      color: selectedForm?.key === f.key ? '#fff' : '',
                      borderColor: f.colour }}>
                    📋 Responses
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Right — responses panel */}
        {selectedForm && (
          <div className="card" style={{ position: isMobile ? 'static' : 'sticky', top: 20, minWidth: 0 }}>
            {isMobile && (
              <button className="btn btn-sm" onClick={() => setSelectedForm(null)} style={{ marginBottom: 10 }}>← All forms</button>
            )}
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
              <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', maxWidth: '100%' }}>
                <table style={{ minWidth: isMobile ? 520 : undefined }}>
                  <thead>
                    <tr>
                      <SortTh col="date" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>Date</SortTh>
                      <SortTh col="name" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>Name</SortTh>
                      <SortTh col="email" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>Email</SortTh>
                      <SortTh col="status" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} style={{ textAlign: 'center' }}>Status</SortTh>
                      <th></th>
                    </tr>
                    <tr>
                      <th style={{ padding: '4px 4px' }}>
                        <input value={colFilters.date} onChange={e => setColFilters(f => ({ ...f, date: e.target.value }))}
                          placeholder="Filter…" style={{ width: '100%', fontSize: 11, padding: '4px 6px' }} />
                      </th>
                      <th style={{ padding: '4px 4px' }}>
                        <input value={colFilters.name} onChange={e => setColFilters(f => ({ ...f, name: e.target.value }))}
                          placeholder="Filter…" style={{ width: '100%', fontSize: 11, padding: '4px 6px' }} />
                      </th>
                      <th style={{ padding: '4px 4px' }}>
                        <input value={colFilters.email} onChange={e => setColFilters(f => ({ ...f, email: e.target.value }))}
                          placeholder="Filter…" style={{ width: '100%', fontSize: 11, padding: '4px 6px' }} />
                      </th>
                      <th style={{ padding: '4px 4px' }}>
                        <input value={colFilters.status} onChange={e => setColFilters(f => ({ ...f, status: e.target.value }))}
                          placeholder="Filter…" style={{ width: '100%', fontSize: 11, padding: '4px 6px' }} />
                      </th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {responses.filter(r => {
                      const dateStr = r.submitted_at ? new Date(r.submitted_at).toLocaleDateString('en-GB') : ''
                      const nameStr = `${r.first_name || ''} ${r.last_name || ''}`
                      if (colFilters.date && !dateStr.toLowerCase().includes(colFilters.date.toLowerCase())) return false
                      if (colFilters.name && !nameStr.toLowerCase().includes(colFilters.name.toLowerCase())) return false
                      if (colFilters.email && !(r.email || '').toLowerCase().includes(colFilters.email.toLowerCase())) return false
                      if (colFilters.status && !(r.status || 'pending').toLowerCase().includes(colFilters.status.toLowerCase())) return false
                      return true
                    }).sort((a, b) => {
                      let aVal, bVal
                      if (sortKey === 'date') { aVal = a.submitted_at || ''; bVal = b.submitted_at || '' }
                      else if (sortKey === 'name') { aVal = `${a.first_name || ''} ${a.last_name || ''}`.toLowerCase(); bVal = `${b.first_name || ''} ${b.last_name || ''}`.toLowerCase() }
                      else if (sortKey === 'email') { aVal = (a.email || '').toLowerCase(); bVal = (b.email || '').toLowerCase() }
                      else if (sortKey === 'status') { aVal = (a.status || 'pending').toLowerCase(); bVal = (b.status || 'pending').toLowerCase() }
                      if (aVal < bVal) return sortDir === 'asc' ? -1 : 1
                      if (aVal > bVal) return sortDir === 'asc' ? 1 : -1
                      return 0
                    }).map((r, i) => (
                      <tr key={i} style={{ cursor: 'pointer' }}
                        onClick={() => selectedForm.key === 'grading' ? navigate('/crm', { state: { initialTab: 'grading_requests' } }) : setViewResponse(r)}>
                        <td style={{ fontSize: 11, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                          {r.submitted_at ? new Date(r.submitted_at).toLocaleDateString('en-GB') : '—'}
                        </td>
                        <td style={{ fontWeight: 500, fontSize: 13 }}>{r.first_name} {r.last_name}</td>
                        <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{r.email || '—'}</td>
                        <td style={{ textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                          <select value={r.status || 'pending'} onChange={e => updateResponseStatus(r.member_id, e.target.value)}
                            style={{ fontSize: 10, padding: '2px 6px', borderRadius: 20, border: 'none', cursor: r.member_id ? 'pointer' : 'not-allowed',
                              background: r.status === 'active' ? '#1d9e7520' : r.status === 'stopped' ? '#a32d2d20' : '#EF9F2720',
                              color: r.status === 'active' ? '#1d9e75' : r.status === 'stopped' ? '#a32d2d' : '#EF9F27' }}
                            disabled={!r.member_id} title={!r.member_id ? "Not linked to a member record" : ''}>
                            <option value="pending">pending</option>
                            <option value="active">active</option>
                            <option value="stopped">stopped</option>
                            <option value="inactive">inactive</option>
                            <option value="not_started">not_started</option>
                          </select>
                        </td>
                        <td>
                          <button className="btn btn-sm"
                            onClick={e => { e.stopPropagation(); selectedForm.key === 'grading' ? navigate('/crm', { state: { initialTab: 'grading_requests' } }) : setViewResponse(r) }}>
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
                    <span style={{ fontSize: 13, flex: 1 }}>{/^\d{4}-\d{2}-\d{2}$/.test(String(v)) ? new Date(v + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : String(v)}</span>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}


// Used by Settings -> Team to share the coach sign-up link with the same share window
export const COACH_SIGNUP_FORM = FORMS.find(f => f.key === 'coach_signup')
