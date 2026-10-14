import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase.js'
import { useAuth } from '../../hooks/useAuth.jsx'

// Dashboard: "Current focus" (latest focus note; tap for every past focus) and "Format" (club format
// notes, edited by admins). Focus notes: table focus_notes. Format: settings 'dashboard_format'.
// The Format card shows a short summary (the header); tap for the full notes. Both are edited together.
const DEFAULT_SUMMARY = '• First session of the week: partner work / sequences\n• Second session: equipment / circuit'
const fmtDate = d => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

export default function FocusAndFormat() {
  const { isAdmin, isStaff, profile } = useAuth()
  const [notes, setNotes] = useState(null)          // newest first
  const [historyOpen, setHistoryOpen] = useState(false)
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState('')
  const [format, setFormat] = useState('')
  const [editingFormat, setEditingFormat] = useState(false)
  const [formatDraft, setFormatDraft] = useState('')
  const [formatOpen, setFormatOpen] = useState(false)
  const [focusShown, setFocusShown] = useState(false)    // both cards start collapsed -- tap the title to open
  const [formatShown, setFormatShown] = useState(false)
  const [summary, setSummary] = useState('')
  const [summaryDraft, setSummaryDraft] = useState('')

  async function load() {
    const [{ data: f, error }, { data: s }] = await Promise.all([
      supabase.from('focus_notes').select('id, body, created_at, members(first_name, last_name)').order('created_at', { ascending: false }).limit(100),
      supabase.from('settings').select('value').eq('key', 'dashboard_format').maybeSingle(),
    ])
    setNotes(error ? [] : (f || []))
    setFormat(typeof s?.value === 'string' ? s.value : s?.value?.text || '')
    setSummary(typeof s?.value === 'object' && s?.value?.summary != null ? s.value.summary : DEFAULT_SUMMARY)
  }
  useEffect(() => { load() }, [])

  async function addFocus() {
    if (!draft.trim()) return
    const { error } = await supabase.from('focus_notes').insert({ body: draft.trim(), created_by: profile?.id || null })
    if (error) return alert('Could not save: ' + error.message + (/focus_notes/.test(error.message) ? '\n\n(Has supabase_focus_notes.sql been run?)' : ''))
    setDraft(''); setAdding(false); load()
  }
  async function deleteFocus(id) {
    if (!window.confirm('Delete this focus note?')) return
    await supabase.from('focus_notes').delete().eq('id', id); load()
  }
  async function saveFormat() {
    const { error } = await supabase.from('settings').upsert({ key: 'dashboard_format', value: { text: formatDraft, summary: summaryDraft } }, { onConflict: 'key' })
    if (error) return alert('Could not save: ' + error.message)
    setFormat(formatDraft); setSummary(summaryDraft); setEditingFormat(false)
  }
  function startEditFormat() { setFormatDraft(format); setSummaryDraft(summary); setEditingFormat(true)
  }

  const current = notes?.[0]
  const area = { width: '100%', boxSizing: 'border-box', padding: 10, borderRadius: 8, border: '1px solid var(--border-strong)', background: 'var(--bg-secondary)', color: 'var(--text)', fontFamily: 'inherit', fontSize: 14 }
  const formatEditor = (
    <>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 4 }}>Card summary (shown on the Dashboard)</label>
      <textarea rows={3} value={summaryDraft} onChange={e => setSummaryDraft(e.target.value)} placeholder={DEFAULT_SUMMARY} style={area} />
      <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', margin: '10px 0 4px' }}>Full format (shown when the card is tapped)</label>
      <textarea rows={12} value={formatDraft} onChange={e => setFormatDraft(e.target.value)} placeholder="Paste or type the format notes" style={area} />
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}><button className="btn btn-sm btn-primary" onClick={saveFormat}>Save</button><button className="btn btn-sm" onClick={() => setEditingFormat(false)}>Cancel</button></div>
    </>
  )
  const box = { padding: 14, borderRadius: 'var(--radius-lg, 12px)' }
  const text = { fontSize: 14, whiteSpace: 'pre-wrap', lineHeight: 1.5 }

  return (
    <div className="dash-two" style={{ marginBottom: 14 }}>
      {/* ── Current focus ── */}
      <div className="card" style={{ ...box, borderTop: '3px solid #8B5CF6' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: focusShown ? 8 : 0 }}>
          <button type="button" className="ff-toggle" onClick={() => setFocusShown(v => !v)} aria-expanded={focusShown}><span>{focusShown ? '▾' : '▸'}</span> 🎯 Current focus</button>
          {focusShown && isStaff && !adding && <button className="btn btn-sm" onClick={() => { setAdding(true); setDraft('') }}>+ New focus</button>}
        </div>
        {!focusShown ? null : adding ? (
          <>
            <textarea rows={5} value={draft} onChange={e => setDraft(e.target.value)} placeholder="What's the focus for this block? (Becomes the current focus; the old one moves to history)" autoFocus
              style={{ width: '100%', boxSizing: 'border-box', padding: 10, borderRadius: 8, border: '1px solid var(--border-strong)', background: 'var(--bg-secondary)', color: 'var(--text)', fontFamily: 'inherit', fontSize: 14 }} />
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}><button className="btn btn-sm btn-primary" onClick={addFocus}>Save as current focus</button><button className="btn btn-sm" onClick={() => setAdding(false)}>Cancel</button></div>
          </>
        ) : notes === null ? <p style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>Loading…</p> : current ? (
          <button type="button" onClick={() => setHistoryOpen(true)} title="Tap to see every past focus"
            style={{ all: 'unset', cursor: 'pointer', display: 'block', width: '100%' }}>
            <div style={{ ...text, display: '-webkit-box', WebkitLineClamp: 6, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{current.body}</div>
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 8 }}>Since {fmtDate(current.created_at)} · {notes.length > 1 ? `${notes.length - 1} past focus note${notes.length === 2 ? '' : 's'} — tap to see all` : 'tap to open'}</div>
          </button>
        ) : <p style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>No focus set yet.</p>}
      </div>

      {/* ── Format ── */}
      <div className="card" style={{ ...box, borderTop: '3px solid #06B6D4' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: formatShown ? 8 : 0 }}>
          <button type="button" className="ff-toggle" onClick={() => setFormatShown(v => !v)} aria-expanded={formatShown}><span>{formatShown ? '▾' : '▸'}</span> 🧭 Format</button>
          {formatShown && isAdmin && !editingFormat && <button className="btn btn-sm" onClick={startEditFormat}>Edit</button>}
        </div>
        {!formatShown ? null : editingFormat && !formatOpen ? formatEditor : (
          (summary || format) ? (
            <button type="button" onClick={() => setFormatOpen(true)} style={{ all: 'unset', cursor: 'pointer', display: 'block', width: '100%' }} title="Tap to see the full format">
              <div style={text}>{summary || format}</div>
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 8 }}>Tap to see the full format</div>
            </button>
          ) : <p style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>No format notes yet{isAdmin ? ' — tap Edit to add them.' : '.'}</p>
        )}
      </div>

      {/* ── pop-ups ── */}
      {historyOpen && (
        <div onClick={() => setHistoryOpen(false)} className="ff-backdrop">
          <div className="card ff-sheet" onClick={e => e.stopPropagation()} role="dialog" aria-label="Focus notes">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <b style={{ fontSize: 16 }}>🎯 Focus notes</b><button className="btn btn-sm" onClick={() => setHistoryOpen(false)}>Close</button>
            </div>
            {(notes || []).map((n, i) => (
              <div key={n.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 4 }}>
                  <span>{i === 0 ? <b style={{ color: '#8B5CF6' }}>CURRENT · </b> : null}{fmtDate(n.created_at)}{n.members ? ` · ${n.members.first_name || ''}` : ''}</span>
                  {isAdmin && <button className="btn btn-sm" style={{ padding: '0 8px', color: '#E24B4A' }} onClick={() => deleteFocus(n.id)}>Delete</button>}
                </div>
                <div style={text}>{n.body}</div>
              </div>
            ))}
          </div>
        </div>
      )}
      {formatOpen && (
        <div onClick={() => setFormatOpen(false)} className="ff-backdrop">
          <div className="card ff-sheet" onClick={e => e.stopPropagation()} role="dialog" aria-label="Format">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <b style={{ fontSize: 16 }}>🧭 Format</b>
              <div style={{ display: 'flex', gap: 6 }}>
                {isAdmin && !editingFormat && <button className="btn btn-sm" onClick={startEditFormat}>Edit</button>}
                <button className="btn btn-sm" onClick={() => { setFormatOpen(false); setEditingFormat(false) }}>Close</button>
              </div>
            </div>
            {editingFormat ? formatEditor : (
              <>
                {summary ? <div style={{ ...text, fontWeight: 600, paddingBottom: 10, marginBottom: 10, borderBottom: '1px solid var(--border)' }}>{summary}</div> : null}
                <div style={text}>{format || 'No full format notes yet.'}</div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
