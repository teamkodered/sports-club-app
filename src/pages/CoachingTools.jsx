import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../hooks/useAuth.jsx'

// Coaching tools: documents, videos and links for coaches. Admin adds / removes; Head Coaches,
// Coaches and Leaders open them. Files live in the private 'coaching-tools' store (short-lived links).
const BUCKET = 'coaching-tools'
const KIND = { doc: { icon: '📄', label: 'Document' }, video: { icon: '🎬', label: 'Video' }, link: { icon: '🔗', label: 'Link' } }

export default function CoachingTools() {
  const { isAdmin, profile } = useAuth()
  const [items, setItems] = useState(null)
  const [err, setErr] = useState('')
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('all')
  const [adding, setAdding] = useState(null)   // { title, description, category, kind, url, file }
  const [busy, setBusy] = useState(false)
  const [playing, setPlaying] = useState(null) // { title, src } for videos

  async function load() {
    const { data, error } = await supabase.from('coaching_tools').select('*').order('created_at', { ascending: false })
    if (error) { setErr(/coaching_tools/.test(error.message) ? 'Run supabase_coaching_tools.sql to switch this on.' : error.message); setItems([]); return }
    setItems(data || [])
  }
  useEffect(() => { load() }, [])

  const cats = useMemo(() => [...new Set((items || []).map(i => i.category).filter(Boolean))].sort(), [items])
  const shown = (items || []).filter(i => (cat === 'all' || i.category === cat) &&
    (!q.trim() || `${i.title} ${i.description || ''} ${i.category || ''}`.toLowerCase().includes(q.trim().toLowerCase())))

  async function open(i) {
    if (i.url && !i.file_path) { window.open(i.url, '_blank', 'noopener'); return }
    const w = i.kind === 'video' ? null : window.open('', '_blank')
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(i.file_path, 60 * 60)
    if (error) { if (w) w.close(); return alert("Couldn't open it: " + error.message) }
    if (i.kind === 'video') setPlaying({ title: i.title, src: data.signedUrl })
    else if (w) w.location.href = data.signedUrl
  }

  async function save() {
    const a = adding
    if (!a.title.trim()) return alert('Give it a title.')
    if (a.kind === 'link' && !/^https?:\/\//i.test(a.url || '')) return alert('Paste the full link, starting with https://')
    if (a.kind !== 'link' && !a.file) return alert('Choose the file to upload.')
    setBusy(true)
    let file_path = null
    if (a.kind !== 'link') {
      const safe = a.file.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]/g, '_')
      file_path = `${Date.now()}-${safe}`
      const { error } = await supabase.storage.from(BUCKET).upload(file_path, a.file, { contentType: a.file.type || undefined })
      if (error) { setBusy(false); return alert('Upload failed: ' + error.message) }
    }
    const { error } = await supabase.from('coaching_tools').insert({ title: a.title.trim(), description: a.description?.trim() || null, category: a.category?.trim() || null,
      kind: a.kind, file_path, url: a.kind === 'link' ? a.url.trim() : null, created_by: profile?.id || null })
    setBusy(false)
    if (error) return alert('Could not save: ' + error.message)
    setAdding(null); load()
  }
  async function remove(i) {
    if (!window.confirm(`Remove "${i.title}"?`)) return
    if (i.file_path) await supabase.storage.from(BUCKET).remove([i.file_path])
    await supabase.from('coaching_tools').delete().eq('id', i.id)
    load()
  }

  return (
    <div className="ct">
      <div className="ct-head">
        <div><h1>🧰 Coaching tools</h1><p>Documents, videos and links for coaches</p></div>
        {isAdmin && <button className="btn btn-primary" onClick={() => setAdding({ title: '', description: '', category: '', kind: 'doc', url: '', file: null })}>+ Add</button>}
      </div>
      {err && <div className="card" style={{ color: '#E24B4A', marginBottom: 12 }}>{err}</div>}

      <div className="ct-filters">
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search…" aria-label="Search coaching tools" />
        {cats.length > 0 && (
          <div className="ct-cats">
            {['all', ...cats].map(c => <button key={c} type="button" className={cat === c ? 'on' : ''} onClick={() => setCat(c)}>{c === 'all' ? 'All' : c}</button>)}
          </div>
        )}
      </div>

      {items === null ? <p>Loading…</p> : !shown.length ? (
        <div className="card"><p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>{items.length ? 'Nothing matches.' : isAdmin ? 'Nothing here yet — tap + Add to upload a document, video or link.' : 'Nothing here yet.'}</p></div>
      ) : (
        <div className="ct-grid">
          {shown.map(i => (
            <div key={i.id} className="card ct-item">
              <button type="button" className="ct-open" onClick={() => open(i)}>
                <span className="ct-icon">{KIND[i.kind]?.icon || '📄'}</span>
                <span className="ct-text">
                  <b>{i.title}</b>
                  {i.description && <span className="ct-desc">{i.description}</span>}
                  <span className="ct-meta">{KIND[i.kind]?.label}{i.category ? ` · ${i.category}` : ''}</span>
                </span>
              </button>
              {isAdmin && <button type="button" className="ct-x" onClick={() => remove(i)} aria-label={`Remove ${i.title}`}>×</button>}
            </div>
          ))}
        </div>
      )}

      {adding && (
        <div className="ct-backdrop" onClick={() => !busy && setAdding(null)}>
          <div className="card ct-sheet" onClick={e => e.stopPropagation()} role="dialog" aria-label="Add a coaching tool">
            <b style={{ fontSize: 16 }}>Add a coaching tool</b>
            <div className="ct-seg">
              {Object.entries(KIND).map(([k, v]) => <button key={k} type="button" className={adding.kind === k ? 'on' : ''} onClick={() => setAdding(a => ({ ...a, kind: k }))}>{v.icon} {v.label}</button>)}
            </div>
            <div className="field"><label>Title</label><input value={adding.title} onChange={e => setAdding(a => ({ ...a, title: e.target.value }))} placeholder="e.g. Lead leg kick drills" /></div>
            <div className="field"><label>Category (optional)</label><input value={adding.category} list="ct-cats" onChange={e => setAdding(a => ({ ...a, category: e.target.value }))} placeholder="e.g. Drills, Session plans, Safeguarding" />
              <datalist id="ct-cats">{cats.map(c => <option key={c} value={c} />)}</datalist></div>
            <div className="field"><label>Description (optional)</label><textarea rows={3} value={adding.description} onChange={e => setAdding(a => ({ ...a, description: e.target.value }))} /></div>
            {adding.kind === 'link'
              ? <div className="field"><label>Link</label><input value={adding.url} onChange={e => setAdding(a => ({ ...a, url: e.target.value }))} placeholder="https://…" /></div>
              : <div className="field"><label>{adding.kind === 'video' ? 'Video file' : 'Document (PDF, Word, Excel, image…)'}</label>
                  <input type="file" accept={adding.kind === 'video' ? 'video/*' : undefined} onChange={e => setAdding(a => ({ ...a, file: e.target.files?.[0] || null }))} /></div>}
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-primary" disabled={busy} onClick={save}>{busy ? 'Uploading…' : 'Save'}</button>
              <button className="btn" disabled={busy} onClick={() => setAdding(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {playing && (
        <div className="ct-backdrop" onClick={() => setPlaying(null)}>
          <div className="card ct-sheet ct-video" onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}><b>{playing.title}</b><button className="btn btn-sm" onClick={() => setPlaying(null)}>Close</button></div>
            <video src={playing.src} controls playsInline autoPlay style={{ width: '100%', borderRadius: 8, background: '#000' }} />
          </div>
        </div>
      )}
    </div>
  )
}
