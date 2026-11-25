import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase.js'
import { postName } from '../../lib/postIdeas.js'

// 📚 Media library: the club's Dropbox photos and videos, browsed and checked here.
// Nothing is copied or changed in Dropbox -- previews come from Dropbox when you look.
// SAFEGUARDING: everything starts "Not checked" and can't be used. Once checked, it's only
// usable if nobody is recognisable, or EVERY tagged person has media consent = Yes now.

async function dbx(action, body = {}) {
  const { data: sd } = await supabase.auth.getSession()
  const res = await fetch('/.netlify/functions/dropbox-api', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sd?.session?.access_token}` },
    body: JSON.stringify({ action, ...body }),
  })
  const j = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(j.error || res.statusText)
  return j
}
const PAGE = 60
const FILTERS = [['unchecked', 'Not checked'], ['usable', '✓ Usable'], ['blocked', '⚠ Can’t use'], ['binned', 'Binned'], ['all', 'All']]
const folderOf = p => { const parts = String(p).split('/'); return parts.slice(0, -1).join('/') || '/' }
const lastPart = p => String(p).split('/').filter(Boolean).pop() || 'Dropbox'
const fmtDate = d => (d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'date unknown')

export default function MediaLibrary({ students, onUseInGraphic }) {
  const [conn, setConn] = useState(null)          // { connected, account } | { error }
  const [folders, setFolders] = useState([])
  const [choosing, setChoosing] = useState(false)
  const [syncing, setSyncing] = useState(null)
  const [filter, setFilter] = useState('unchecked')
  const [kind, setKind] = useState('all')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [items, setItems] = useState(null)
  const [total, setTotal] = useState(0)
  const [thumbs, setThumbs] = useState({})
  const [selected, setSelected] = useState(new Set())
  const [viewing, setViewing] = useState(null)
  const [tagFor, setTagFor] = useState(null)       // array of item ids to tag
  const thumbAsked = useRef(new Set())

  const usable = it => it.status === 'checked' && it.consent_ok && (it.student_ids || []).every(id => students[id]?.media_restriction === 'Yes')

  async function loadStatus() {
    try { setConn(await dbx('status')) } catch (e) { setConn({ error: e.message }) }
    const { data } = await supabase.from('media_folders').select('*').order('path')
    setFolders(data || [])
  }
  async function loadItems(p = page) {
    setItems(null)
    let q = supabase.from('media_items').select('*', { count: 'exact' }).eq('missing', false)
    if (filter === 'unchecked') q = q.eq('status', 'unchecked')
    if (filter === 'usable') q = q.eq('status', 'checked').eq('consent_ok', true)
    if (filter === 'blocked') q = q.eq('status', 'checked').eq('consent_ok', false)
    if (filter === 'binned') q = q.eq('status', 'binned')
    if (filter === 'all') q = q.neq('status', 'binned')
    if (kind !== 'all') q = q.eq('kind', kind)
    if (search.trim()) q = q.ilike('path', `%${search.trim().replace(/[%_]/g, '')}%`)
    const { data, count, error } = await q.order('taken_at', { ascending: false, nullsFirst: false }).range(p * PAGE, p * PAGE + PAGE - 1)
    if (error) { setItems([]); return }
    setItems(data || []); setTotal(count || 0); setSelected(new Set())
  }
  useEffect(() => {
    loadStatus()
    const p = new URLSearchParams(window.location.search).get('dropbox')
    if (p) {
      alert({ connected: '✓ Dropbox connected (read-only). Now choose which folders to include.', cancelled: 'Dropbox connection cancelled.', expired: 'That took too long -- press Connect Dropbox again.', failed: 'Dropbox connection failed -- try again.' }[p] || p)
      if (p === 'connected') setChoosing(true)
      window.history.replaceState(window.history.state, '', window.location.pathname)
    }
  }, [])
  useEffect(() => { setPage(0); loadItems(0) }, [filter, kind])

  // previews for what's on screen, 25 at a time
  useEffect(() => {
    if (!items?.length) return
    const need = items.map(i => i.path).filter(p => !thumbs[p] && !thumbAsked.current.has(p))
    need.forEach(p => thumbAsked.current.add(p))
    for (let i = 0; i < need.length; i += 25) {
      dbx('thumbs', { paths: need.slice(i, i + 25) }).then(r => setThumbs(t => ({ ...t, ...r.thumbs }))).catch(() => {})
    }
  }, [items])

  async function indexNow() {
    setSyncing({ added: 0 })
    let added = 0
    try {
      for (let i = 0; i < 400; i++) {
        const r = await dbx('sync')
        added += r.added; setSyncing({ added })
        if (!r.more) break
      }
    } catch (e) { alert('Indexing stopped: ' + e.message + '\nWhat was found so far is saved -- press Index again to carry on.') }
    setSyncing(null); loadStatus(); loadItems(0); setPage(0)
  }

  async function patchItems(ids, patchFn) {
    const before = items
    const next = items.map(it => ids.includes(it.id) ? { ...it, ...patchFn(it) } : it)
    setItems(next)
    for (const it of next.filter(x => ids.includes(x.id))) {
      const p = patchFn(before.find(b => b.id === it.id))
      const { data, error } = await supabase.from('media_items').update(p).eq('id', it.id).select('id, consent_ok')
      if (error || !data?.length) { alert('Not saved: ' + (error?.message || 'no permission')); loadItems(page); return }
      setItems(list => list.map(x => x.id === it.id ? { ...x, consent_ok: data[0].consent_ok } : x))   // the database decides consent
    }
    setSelected(new Set())
    if (viewing && ids.includes(viewing.id)) setViewing(v => ({ ...v, ...patchFn(v) }))
  }
  const now = () => new Date().toISOString()
  const markNoOne = ids => patchItems(ids, () => ({ no_one_identifiable: true, student_ids: [], status: 'checked', checked_at: now() }))
  const addPeople = (ids, people) => patchItems(ids, it => ({ student_ids: [...new Set([...(it.student_ids || []), ...people])], no_one_identifiable: false, status: 'checked', checked_at: now() }))
  const bin = (ids, yes) => patchItems(ids, () => ({ status: yes ? 'binned' : 'unchecked' }))

  async function openItem(it) {
    setViewing({ ...it, big: null, video: null })
    try {
      if (it.kind === 'video') { const r = await dbx('link', { path: it.path }); setViewing(v => v?.id === it.id ? { ...v, video: r.url } : v) }
      else { const r = await dbx('image', { path: it.path }); setViewing(v => v?.id === it.id ? { ...v, big: r.dataUrl } : v) }
    } catch (e) { setViewing(v => v?.id === it.id ? { ...v, loadError: e.message } : v) }
  }

  // group the page by folder (event)
  const groups = useMemo(() => {
    const g = []
    ;(items || []).forEach(it => {
      const f = it.event_name || lastPart(folderOf(it.path))
      if (!g.length || g[g.length - 1][0] !== f) g.push([f, []])
      g[g.length - 1][1].push(it)
    })
    return g
  }, [items])

  // ── not connected ──
  if (!conn) return <div className="card" style={{ padding: 16, color: 'var(--text-secondary)' }}>Checking Dropbox…</div>
  if (conn.error || !conn.connected) return (
    <div className="card" style={{ padding: 16 }}>
      <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 6 }}>📚 Media library</div>
      <div style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 12 }}>
        Connect the club Dropbox to browse old photos and videos here and use them in posts. The connection is <b>read-only</b>: nothing in Dropbox is ever changed, moved or deleted, and nothing is copied out of it.
      </div>
      {conn.error && <div style={{ fontSize: 13, color: '#E24B4A', marginBottom: 10 }}>{/supabase_media|relation|does not exist/i.test(conn.error) ? 'Run supabase_media_library.sql first.' : conn.error}</div>}
      <button className="btn btn-primary" onClick={async () => { try { window.location.href = (await dbx('connect')).url } catch (e) { alert(e.message) } }}>Connect Dropbox (read-only)</button>
    </div>
  )

  const included = folders.filter(f => f.included)
  return (
    <div>
      <div className="card" style={{ padding: 12, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200, fontSize: 13, color: 'var(--text-secondary)' }}>
          📦 Dropbox: <b style={{ color: 'var(--text)' }}>{conn.account}</b> (read-only) · {included.length} {included.length === 1 ? 'folder' : 'folders'} included
          {included.some(f => !f.done) && ' · indexing not finished'}
        </div>
        <button className="btn btn-sm" onClick={() => setChoosing(true)}>📁 Folders</button>
        <button className="btn btn-sm btn-primary" disabled={!!syncing || !included.length} onClick={indexNow}>{syncing ? `Indexing… ${syncing.added.toLocaleString()} found` : '🔄 Index now'}</button>
      </div>
      {included.length === 0 && <div className="card" style={{ padding: 16, marginBottom: 10, color: 'var(--text-secondary)' }}>Press 📁 Folders and include the folders with club photos and videos (not personal ones). Then press 🔄 Index now.</div>}

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
        {FILTERS.map(([k, l]) => <button key={k} className={`btn btn-sm${filter === k ? ' btn-primary' : ''}`} onClick={() => setFilter(k)}>{l}</button>)}
        <select value={kind} onChange={e => setKind(e.target.value)} style={{ fontSize: 14 }}>
          <option value="all">Photos + videos</option><option value="photo">Photos</option><option value="video">Videos</option>
        </select>
        <input value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { setPage(0); loadItems(0) } }}
          placeholder="Search folder / file name…" style={{ fontSize: 14, padding: '6px 8px', minWidth: 170, flex: 1 }} />
        <button className="btn btn-sm" onClick={() => { setPage(0); loadItems(0) }}>Search</button>
      </div>
      {filter === 'unchecked' && <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 8 }}>Tick photos from the same occasion, then tag who’s in them (or “No one recognisable”). Nothing can be used until it’s checked.</div>}

      {selected.size > 0 && (
        <div className="card" style={{ position: 'sticky', top: 'env(safe-area-inset-top, 0px)', zIndex: 5, padding: 10, marginBottom: 8, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', borderColor: '#EC4899' }}>
          <b style={{ fontSize: 14 }}>{selected.size} ticked</b>
          <button className="btn btn-sm" onClick={() => setTagFor([...selected])}>👤 Tag people</button>
          <button className="btn btn-sm" onClick={() => markNoOne([...selected])}>🙈 No one recognisable</button>
          {filter === 'binned' ? <button className="btn btn-sm" onClick={() => bin([...selected], false)}>Restore</button>
            : <button className="btn btn-sm" onClick={() => bin([...selected], true)}>🗑 Bin (hide)</button>}
          <button className="btn btn-sm" onClick={() => setSelected(new Set())}>Untick</button>
        </div>
      )}

      {items === null ? <div className="card" style={{ padding: 16, color: 'var(--text-secondary)' }}>Loading…</div>
        : items.length === 0 ? <div className="card" style={{ padding: 16, color: 'var(--text-secondary)' }}>Nothing here.</div>
        : groups.map(([name, list]) => (
          <div key={name + list[0].id} style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '6px 0' }}>
              <div style={{ fontWeight: 700, fontSize: 14, flex: 1 }}>📁 {name} <span style={{ fontWeight: 400, color: 'var(--text-tertiary)', fontSize: 12 }}>{fmtDate(list[0].taken_at)}</span></div>
              <button className="btn btn-sm" onClick={() => setSelected(s => { const n = new Set(s); const all = list.every(i => n.has(i.id)); list.forEach(i => all ? n.delete(i.id) : n.add(i.id)); return n })}>Tick all {list.length}</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))', gap: 6 }}>
              {list.map(it => {
                const on = selected.has(it.id), ok = usable(it)
                return (
                  <div key={it.id} style={{ position: 'relative', aspectRatio: '1', borderRadius: 8, overflow: 'hidden', background: 'var(--bg-secondary)', outline: on ? '3px solid #EC4899' : 'none', cursor: 'pointer' }}
                    onClick={() => openItem(it)}>
                    {thumbs[it.path] ? <img src={thumbs[it.path]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontSize: 26 }}>{it.kind === 'video' ? '🎬' : '🖼'}</div>}
                    {it.kind === 'video' && <span style={{ position: 'absolute', bottom: 4, left: 4, fontSize: 14 }}>▶️</span>}
                    {it.status === 'checked' && <span style={{ position: 'absolute', bottom: 4, right: 4, fontSize: 12, background: ok ? '#1D9E75' : '#E24B4A', color: '#fff', borderRadius: 10, padding: '0 6px' }}>{ok ? '✓' : '⚠'}</span>}
                    <button onClick={e => { e.stopPropagation(); setSelected(s => { const n = new Set(s); n.has(it.id) ? n.delete(it.id) : n.add(it.id); return n }) }}
                      style={{ position: 'absolute', top: 4, left: 4, width: 28, height: 28, borderRadius: 14, border: '2px solid #fff', background: on ? '#EC4899' : 'rgba(0,0,0,0.35)', color: '#fff', fontSize: 14, padding: 0 }}>{on ? '✓' : ''}</button>
                  </div>
                )
              })}
            </div>
          </div>
        ))}

      {total > PAGE && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'center', margin: '12px 0' }}>
          <button className="btn btn-sm" disabled={page === 0} onClick={() => { setPage(page - 1); loadItems(page - 1); window.scrollTo(0, 0) }}>◀ Newer</button>
          <span style={{ fontSize: 13 }}>{page * PAGE + 1}–{Math.min(total, (page + 1) * PAGE)} of {total.toLocaleString()}</span>
          <button className="btn btn-sm" disabled={(page + 1) * PAGE >= total} onClick={() => { setPage(page + 1); loadItems(page + 1); window.scrollTo(0, 0) }}>Older ▶</button>
        </div>
      )}

      {viewing && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.85)', overflowY: 'auto', padding: 12 }} onClick={e => { if (e.target === e.currentTarget) setViewing(null) }}>
          <div className="card" style={{ maxWidth: 820, margin: '0 auto', padding: 14 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
              <div style={{ flex: 1, fontSize: 13, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{viewing.path}</div>
              <button className="btn btn-sm" onClick={() => setViewing(null)}>✕</button>
            </div>
            {viewing.loadError ? <div style={{ padding: 20, color: '#E24B4A' }}>{viewing.loadError}</div>
              : viewing.kind === 'video' ? (viewing.video ? <video src={viewing.video} controls playsInline style={{ width: '100%', maxHeight: '60vh', borderRadius: 8, background: '#000' }} /> : <div style={{ padding: 40, textAlign: 'center' }}>Loading video…</div>)
              : (viewing.big || thumbs[viewing.path]) ? <img src={viewing.big || thumbs[viewing.path]} alt="" style={{ width: '100%', maxHeight: '60vh', objectFit: 'contain', borderRadius: 8, background: '#000' }} />
              : <div style={{ padding: 40, textAlign: 'center' }}>Loading…</div>}
            <div style={{ fontSize: 14, marginTop: 8 }}>{fmtDate(viewing.taken_at)} · {viewing.event_name || lastPart(folderOf(viewing.path))}</div>
            <div style={{ fontSize: 14, marginTop: 4 }}>
              {viewing.status === 'unchecked' ? <span style={{ color: '#EF9F27' }}>Not checked yet — can’t be used</span>
                : viewing.no_one_identifiable && !(viewing.student_ids || []).length ? 'No one recognisable'
                : (viewing.student_ids || []).map(id => students[id]).filter(Boolean).map(s => (
                  <span key={s.id} style={{ marginRight: 8, color: s.media_restriction === 'Yes' ? '#1D9E75' : '#E24B4A' }}>{postName(s)} {s.media_restriction === 'Yes' ? '✓' : '⚠ no consent'}</span>
                ))}
            </div>
            {viewing.status === 'checked' && !usable(viewing) && <div style={{ fontSize: 13, color: '#E24B4A', marginTop: 4 }}>⚠ Can’t be used — someone tagged hasn’t got media consent.</div>}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
              <button className="btn btn-sm" onClick={() => setTagFor([viewing.id])}>👤 Tag people</button>
              <button className="btn btn-sm" onClick={() => markNoOne([viewing.id])}>🙈 No one recognisable</button>
              {(viewing.student_ids || []).length > 0 && <button className="btn btn-sm" onClick={() => patchItems([viewing.id], () => ({ student_ids: [], no_one_identifiable: false, status: 'unchecked' }))}>Clear tags</button>}
              {usable(viewing) && viewing.kind === 'photo' && viewing.big && (
                <button className="btn btn-sm btn-primary" onClick={() => { onUseInGraphic(viewing.big, (viewing.student_ids || []).map(id => students[id]).filter(Boolean).map(postName)); setViewing(null) }}>🎨 Use in graphic</button>
              )}
              {usable(viewing) && <button className="btn btn-sm" onClick={async () => { try { window.open((await dbx('link', { path: viewing.path })).url, '_blank') } catch (e) { alert(e.message) } }}>⬇ Original</button>}
              <button className="btn btn-sm" onClick={() => { bin([viewing.id], viewing.status !== 'binned'); setViewing(null) }}>{viewing.status === 'binned' ? 'Restore' : '🗑 Bin'}</button>
            </div>
          </div>
        </div>
      )}

      {tagFor && <TagPeople students={students} count={tagFor.length} onClose={() => setTagFor(null)}
        onSave={ids => { addPeople(tagFor, ids); setTagFor(null) }} />}
      {choosing && <FolderChooser folders={folders} onClose={() => { setChoosing(false); loadStatus() }} />}
    </div>
  )
}

function TagPeople({ students, count, onSave, onClose }) {
  const [q, setQ] = useState('')
  const [picked, setPicked] = useState([])
  const list = Object.values(students)
  const nameOf = s => `${s.members?.first_name || ''} ${s.members?.last_name || ''}`.trim()
  const matches = q.trim().length < 2 ? [] : list.filter(s => nameOf(s).toLowerCase().includes(q.trim().toLowerCase()) && !picked.includes(s.id)).slice(0, 8)
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1001, background: 'rgba(0,0,0,0.7)', padding: 12, overflowY: 'auto' }} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="card" style={{ maxWidth: 460, margin: '40px auto', padding: 16 }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Who can be recognised? <span style={{ fontWeight: 400, fontSize: 13, color: 'var(--text-secondary)' }}>({count} {count === 1 ? 'item' : 'items'})</span></div>
        <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Type a name…" style={{ width: '100%', fontSize: 16, padding: '9px 10px' }} />
        {matches.map(s => (
          <button key={s.id} className="btn" style={{ display: 'block', width: '100%', textAlign: 'left', marginTop: 4, fontSize: 15 }} onClick={() => { setPicked(p => [...p, s.id]); setQ('') }}>
            {nameOf(s)}{s.media_restriction !== 'Yes' && <span style={{ color: '#E24B4A', fontSize: 13 }}> — no media consent</span>}
          </button>
        ))}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
          {picked.map(id => { const s = students[id]; return (
            <span key={id} className={`badge ${s.media_restriction === 'Yes' ? 'badge-green' : 'badge-red'}`} style={{ fontSize: 13, padding: '5px 8px', cursor: 'pointer' }} onClick={() => setPicked(p => p.filter(x => x !== id))}>
              {nameOf(s)} {s.media_restriction === 'Yes' ? '✓' : '⚠'} ✕
            </span>
          ) })}
        </div>
        {picked.some(id => students[id]?.media_restriction !== 'Yes') && <div style={{ fontSize: 13, color: '#E24B4A', marginTop: 8 }}>Anyone without media consent makes these unusable — that’s still worth recording, so they’re never posted by mistake.</div>}
        <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 8 }}>People are added to what’s already tagged. Only current students can be tagged — if someone recognisable isn’t in the app, bin the photo.</div>
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button className="btn btn-primary" disabled={!picked.length} onClick={() => onSave(picked)}>Save</button>
          <button className="btn" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

function FolderChooser({ folders, onClose }) {
  const [path, setPath] = useState('')
  const [subs, setSubs] = useState(null)
  const [rows, setRows] = useState(folders)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    setSubs(null)
    dbx('folders', { path }).then(r => setSubs(r.folders)).catch(e => { alert(e.message); setSubs([]) })
  }, [path])
  const low = p => p.toLowerCase()
  const rowFor = p => rows.find(r => low(r.path) === low(p))
  const under = (p, parent) => low(p).startsWith(low(parent) + '/')
  // the nearest folder above (or this one) with a setting decides: included or left out
  function stateOf(p) {
    const own = rowFor(p)
    if (own) return own.included ? 'included' : (rows.some(r => r.included && under(p, r.path)) ? 'left_out' : 'none')
    const above = rows.filter(r => under(p, r.path)).sort((a, b) => b.path.length - a.path.length)[0]
    return above?.included ? 'inherited' : 'none'
  }
  async function forgetIndexed(p) {
    // removes the library's index entries only -- nothing in Dropbox changes
    const esc = p.replace(/[%_]/g, '')
    await supabase.from('media_items').delete().ilike('path', `${esc}/%`)
  }
  async function setRow(p, name, included) {
    const ex = rowFor(p)
    const q = ex ? supabase.from('media_folders').update({ included, cursor: null, done: false, file_count: 0 }).eq('id', ex.id)
      : supabase.from('media_folders').insert({ path: p, name, included })
    const { data, error } = await q.select()
    if (error || !data?.length) { alert('Not saved: ' + (error?.message || 'no permission')); return false }
    setRows(list => ex ? list.map(x => x.id === ex.id ? data[0] : x) : [...list, data[0]])
    return true
  }
  async function act(f) {
    const st = stateOf(f.path)
    setBusy(true)
    if (st === 'none') await setRow(f.path, f.name, true)
    else if (st === 'included' || st === 'inherited') {
      const msg = st === 'included'
        ? `Stop including "${f.name}"?\n\nIts photos and videos are taken out of the library (any tags on them are lost). Nothing in Dropbox changes.`
        : `Leave out "${f.name}"?\n\nIt won't be shown or indexed, and anything already found in it is taken out of the library. Nothing in Dropbox changes.`
      if (confirm(msg) && await setRow(f.path, f.name, false)) await forgetIndexed(f.path)
    } else if (st === 'left_out') {
      // put it back: remove the "leave out" and re-walk the included folder above so its files come back
      const ex = rowFor(f.path)
      await supabase.from('media_folders').delete().eq('id', ex.id)
      const parent = rows.filter(r => r.included && under(f.path, r.path)).sort((a, b) => b.path.length - a.path.length)[0]
      if (parent) await supabase.from('media_folders').update({ cursor: null, done: false }).eq('id', parent.id)
      setRows(list => list.filter(x => x.id !== ex.id).map(x => x.id === parent?.id ? { ...x, cursor: null, done: false } : x))
      alert('Put back. Press 🔄 Index now to bring its photos in.')
    }
    setBusy(false)
  }
  const crumbs = path.split('/').filter(Boolean)
  const BTN = { none: ['+ Include', ''], included: ['✓ Included', ' btn-primary'], inherited: ['Leave out', ''], left_out: ['🚫 Left out', ''] }
  const included = rows.filter(r => r.included), leftOut = rows.filter(r => !r.included && rows.some(x => x.included && under(r.path, x.path)))
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1001, background: 'rgba(0,0,0,0.7)', padding: 12, overflowY: 'auto' }} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="card" style={{ maxWidth: 560, margin: '30px auto', padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
          <div style={{ fontWeight: 700, flex: 1 }}>📁 Folders to include</div>
          <button className="btn btn-sm btn-primary" onClick={onClose}>Done</button>
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 8 }}>
          Only folders you include are ever shown or indexed — everything else stays private. Including a folder includes its subfolders too; open it and press <b>Leave out</b> on any private subfolder.
        </div>
        <div style={{ fontSize: 14, marginBottom: 8, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          <a style={{ cursor: 'pointer', color: '#378ADD' }} onClick={() => setPath('')}>Dropbox</a>
          {crumbs.map((c, i) => <span key={i}> › <a style={{ cursor: 'pointer', color: '#378ADD' }} onClick={() => setPath('/' + crumbs.slice(0, i + 1).join('/'))}>{c}</a></span>)}
        </div>
        {subs === null ? <div style={{ color: 'var(--text-secondary)', padding: 10 }}>Loading…</div>
          : subs.length === 0 ? <div style={{ color: 'var(--text-secondary)', padding: 10 }}>No folders inside this one.</div>
          : subs.map(f => {
            const st = stateOf(f.path)
            return (
              <div key={f.path} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderTop: '1px solid var(--border)', opacity: st === 'left_out' ? 0.6 : 1 }}>
                <a style={{ flex: 1, cursor: 'pointer', fontSize: 15 }} onClick={() => setPath(f.path)}>
                  📁 {f.name} ›{st === 'inherited' && <span style={{ fontSize: 12, color: '#1D9E75' }}> included</span>}
                </a>
                <button className={`btn btn-sm${BTN[st][1]}`} disabled={busy} onClick={() => act(f)}>{BTN[st][0]}</button>
              </div>
            )
          })}
        {(included.length > 0 || leftOut.length > 0) && (
          <div style={{ marginTop: 12, fontSize: 13 }}>
            {included.length > 0 && <div><b>Included:</b> {included.map(f => f.path).join(', ')}</div>}
            {leftOut.length > 0 && <div style={{ marginTop: 4 }}><b>Left out:</b> {leftOut.map(f => f.path).join(', ')}</div>}
          </div>
        )}
      </div>
    </div>
  )
}
