import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase.js'

// PDP overview (coach PDP page): every athlete's PDP notes in one table -- a row per athlete, a column per
// section -- so it's easy to see who has and who hasn't got notes in each area. Notes can be copied from
// one athlete and pasted into others (same work-ons), added straight into a cell, and the list filtered
// with Show: All / KR / KRBA. Notes live in athlete_profiles.pdp_notes ({ sectionKey: [text…] }), so
// anything added or pasted here shows on the athlete's own PDP too. Tapping a count jumps to that note.

const SHOW_KEY = 'pdp_overview_show'
const showFilters = { all: () => true, kr: s => s.discipline !== 'KRBA', krba: s => s.discipline === 'KRBA' }
const itemText = it => typeof it === 'string' ? it : (it && (it.text || it.label || it.title)) || ''
const nameOf = s => `${s.members?.first_name || ''} ${s.members?.last_name || ''}`.trim() || 'Unnamed'
const SUB = [['notes', 'Notes'], ['maintain', 'Maintain'], ['work_on', 'Work on'], ['what_to_do', 'To do']]

export default function PdpOverview({ athletes, sections, groups, colours, onOpenAthlete }) {
  const [rows, setRows] = useState(null)             // student_id -> pdp_notes
  const [show, setShow] = useState(() => { try { return localStorage.getItem(SHOW_KEY) || 'all' } catch (e) { return 'all' } })
  const [focus, setFocus] = useState(null)           // { id, key } cell jumped to from a count
  const [adding, setAdding] = useState(null)         // { id, key } cell with the add box open
  const [addText, setAddText] = useState('')
  const tableRef = useRef(null)
  const [view, setView] = useState('overview')       // 'overview' | group label | 'General'
  const [clip, setClip] = useState([])               // copied notes: { t, id, key } (id/key = where it came from)
  const [clipEdit, setClipEdit] = useState(null)      // { idx, t, key } editing a copied note
  // phones: register-style cards (columns under the names, swipe for the next ones, zoom = how many at once)
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches)
  useEffect(() => { const m = window.matchMedia('(max-width: 767px)'); const f = () => setNarrow(m.matches); m.addEventListener?.('change', f); return () => m.removeEventListener?.('change', f) }, [])
  const [perView, setPerView] = useState(() => { try { return parseInt(localStorage.getItem('kc_pdp_cols') || '1') || 1 } catch { return 1 } })
  const [colStart, setColStart] = useState(0)
  const swipeRef = useRef(null)
  const [ticked, setTicked] = useState(new Set())    // athletes ticked for bulk paste
  const [busy, setBusy] = useState(false)
  const [search, setSearch] = useState('')

  async function load() {
    const ids = athletes.map(a => a.id)
    if (!ids.length) { setRows({}); return }
    const out = {}
    for (let i = 0; i < ids.length; i += 200) {
      const { data } = await supabase.from('athlete_profiles').select('student_id, pdp_notes').in('student_id', ids.slice(i, i + 200))
      for (const r of data || []) out[r.student_id] = r.pdp_notes || {}
    }
    setRows(out)
  }
  useEffect(() => { load() }, [athletes.map(a => a.id).join(',')])
  const pickShow = v => { setShow(v); try { localStorage.setItem(SHOW_KEY, v) } catch (e) { /* ignore */ } }
  // after jumping from a count, scroll the cell into view
  useEffect(() => {
    if (!focus) return
    const el = tableRef.current?.querySelector(`[data-cell="${focus.id}:${focus.key}"]`)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' })
    const t = setTimeout(() => setFocus(null), 2500)
    return () => clearTimeout(t)
  }, [focus, view])
  const visible = useMemo(() => athletes
    .filter(s => !search || nameOf(s).toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => nameOf(a).localeCompare(nameOf(b))), [athletes, show, search])
  const jumpTo = (id, key) => { const g = groups.find(x => x.keys.includes(key)); setView(g ? g.label : 'General'); setFocus({ id, key }) }

  // which section columns this view shows
  const general = [{ key: 'winning_ways', label: 'Winning ways' }, { key: 'what_to_do', label: 'What to do' }]
  const cols = view === 'General' ? general
    : view === 'overview' ? null
    : (groups.find(g => g.label === view)?.keys || []).map((k, i) => ({ key: k, label: SUB[i]?.[1] || k }))
  const sectionColour = k => (sections.find(s => s.key === k) || {}).colour || '#888'

  async function pasteInto(studentIds, key, items) {
    if (!items.length || !studentIds.length) return
    setBusy(true)
    for (const id of studentIds) {
      // read fresh so nothing another coach just added is lost
      const { data } = await supabase.from('athlete_profiles').select('pdp_notes').eq('student_id', id).maybeSingle()
      const pdp = data?.pdp_notes || {}
      const existing = pdp[key] || []
      const have = new Set(existing.map(itemText))
      const merged = [...existing, ...items.filter(t => !have.has(t))]
      const next = { ...pdp, [key]: merged }
      const { error } = await supabase.from('athlete_profiles').upsert({ student_id: id, pdp_notes: next }, { onConflict: 'student_id' })
      if (error) { alert('Could not save: ' + error.message); break }
      setRows(r => ({ ...r, [id]: next }))
    }
    setBusy(false)
  }
  const clipHas = t => clip.some(c => c.t === t)
  const toggleClip = (t, id, key) => setClip(c => c.some(x => x.t === t) ? c.filter(x => x.t !== t) : [...c, { t, id, key }])
  const clipTexts = () => clip.map(c => c.t)
  // edit a copied note and/or move it to another section (on the athlete it came from)
  async function saveClipEdit() {
    const e = clipEdit, src = clip[e.idx]
    const text = e.t.trim(); if (!text) return
    if (src.id && src.key) {
      setBusy(true)
      const { data } = await supabase.from('athlete_profiles').select('pdp_notes').eq('student_id', src.id).maybeSingle()
      const pdp = { ...(data?.pdp_notes || {}) }
      const from = (pdp[src.key] || []).filter(x => itemText(x) !== src.t)
      pdp[src.key] = from
      const to = pdp[e.key] || []
      if (!to.map(itemText).includes(text)) pdp[e.key] = [...(e.key === src.key ? from : to), text]
      const { error } = await supabase.from('athlete_profiles').upsert({ student_id: src.id, pdp_notes: pdp }, { onConflict: 'student_id' })
      setBusy(false)
      if (error) { alert('Could not save: ' + error.message); return }
      setRows(r => ({ ...r, [src.id]: pdp }))
    }
    setClip(c => c.map((x, i) => i === e.idx ? { ...x, t: text, key: e.key } : x))
    setClipEdit(null)
  }

  const pill = (on, colour) => ({ fontSize: 12, padding: '4px 10px', borderRadius: 20, cursor: 'pointer', fontFamily: 'var(--font-sans)',
    border: `1px solid ${on ? colour : 'var(--border-strong)'}`, background: on ? colour + '22' : 'none', color: on ? colour : 'var(--text-secondary)' })
  const th = { textAlign: 'left', padding: '6px 8px', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap', position: 'sticky', top: 0, background: 'var(--bg-primary, #0f1318)', zIndex: 1 }
  const tdBase = { padding: '6px 8px', verticalAlign: 'top', borderBottom: '1px solid var(--border)' }

  // athlete quick view (press a name): their PDP at a glance + open profile
  const [quick, setQuick] = useState(null)
  const [openCell, setOpenCell] = useState(null) // All sections: { id, key } -- that athlete's notes for the section, opened in place
  const PdpQuick = ({ s, pdp }) => {
    const today = new Date().toISOString().split('T')[0]
    const counts = sections.map(sec => ({ ...sec, n: (pdp[sec.key] || []).map(itemText).filter(Boolean).length })).filter(x => x.n > 0)
    const total = counts.reduce((a, b) => a + b.n, 0)
    const done = Object.keys(pdp).filter(k => k.startsWith('__completed_')).reduce((a, k) => a + (pdp[k] || []).length, 0)
    let overdue = 0
    for (const k of Object.keys(pdp)) if (k.startsWith('__timetable_')) { const sec = k.slice(12), fin = new Set(pdp[`__completed_${sec}`] || []), still = new Set((pdp[sec] || []).map(itemText)); for (const [item, e] of Object.entries(pdp[k] || {})) if (e?.date && e.date < today && still.has(item) && !fin.has(item)) overdue++ }
    return (
      <div style={{ padding: '8px 4px 10px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 6, marginBottom: 8 }}>
          {[['PDP items', total, 'var(--text)'], ['Completed', done, '#1D9E75'], ['Overdue', overdue, overdue ? '#E24B4A' : 'var(--text-tertiary)']].map(([l, v, c]) => (
            <div key={l} style={{ background: 'var(--bg-secondary)', borderRadius: 8, padding: '6px 8px' }}>
              <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{l}</div>
              <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: 16, fontWeight: 700, color: c }}>{v}</div>
            </div>
          ))}
        </div>
        {counts.length > 0 ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
            {counts.map(c => <span key={c.key} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, border: `1px solid ${c.colour || 'var(--border)'}`, color: c.colour || 'var(--text-secondary)' }}>{c.label} · {c.n}</span>)}
          </div>
        ) : <div style={{ fontSize: 12, color: '#E24B4A', marginBottom: 8 }}>No PDP notes yet</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button className="btn btn-sm btn-primary" onClick={() => onOpenAthlete?.(s)}>Open profile ›</button>
        </div>
      </div>
    )
  }

  // one athlete x section: notes (tap to copy), Paste / + Add
  const cellBody = (s, c, items) => (
    <>
                        {items.length ? (
                          <ul style={{ margin: 0, paddingLeft: 16 }}>
                            {items.map((t, i) => (
                              <li key={i} onClick={() => toggleClip(t, s.id, c.key)} title="Tap to copy" style={{ cursor: 'pointer', marginBottom: 2, background: clipHas(t) ? '#EF9F2733' : undefined, borderRadius: 4 }}>{t}</li>
                            ))}
                          </ul>
                        ) : <span style={{ color: '#E24B4A', fontSize: 11 }}>— none —</span>}
                        <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                          {clip.length > 0 && <button className="btn btn-sm" disabled={busy} style={{ padding: '0 6px', fontSize: 10, borderColor: '#EF9F27', color: '#EF9F27' }} onClick={() => pasteInto([s.id], c.key, clipTexts())}>Paste</button>}
                          {!(adding && adding.id === s.id && adding.key === c.key) && <button className="btn btn-sm" style={{ padding: '0 6px', fontSize: 10 }} onClick={() => { setAdding({ id: s.id, key: c.key }); setAddText('') }}>+ Add</button>}
                        </div>
                        {adding && adding.id === s.id && adding.key === c.key && (
                          <div style={{ marginTop: 4 }}>
                            <textarea rows={2} autoFocus value={addText} onChange={e => setAddText(e.target.value)} placeholder="New note (one per line)"
                              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); const lines = addText.split('\n').map(x => x.trim()).filter(Boolean); if (lines.length) pasteInto([s.id], c.key, lines).then(() => setAdding(null)) } if (e.key === 'Escape') setAdding(null) }}
                              style={{ width: '100%', boxSizing: 'border-box', fontSize: 12, padding: 6, borderRadius: 6, border: '1px solid var(--border-strong)', background: 'var(--bg-secondary)', color: 'var(--text)', fontFamily: 'inherit' }} />
                            <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                              <button className="btn btn-sm btn-primary" disabled={busy || !addText.trim()} style={{ padding: '0 8px', fontSize: 11 }}
                                onClick={() => { const lines = addText.split('\n').map(x => x.trim()).filter(Boolean); pasteInto([s.id], c.key, lines).then(() => setAdding(null)) }}>Save</button>
                              <button className="btn btn-sm" style={{ padding: '0 8px', fontSize: 11 }} onClick={() => setAdding(null)}>Cancel</button>
                            </div>
                          </div>
                        )}
    </>
  )

  if (rows === null) return <p style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>Loading PDP notes…</p>

  return (
    <div>
      {/* views */}
      {(() => {
        // one big button: press (or swipe) to step through All sections -> General -> each section group
        const opts = [['overview', 'All sections', '#06B6D4'], ['General', 'General', '#1D9E75'], ...groups.map(g => [g.label, g.label, g.colour || '#378ADD'])]
        const i = Math.max(0, opts.findIndex(o => o[0] === view)), cur = opts[i]
        const step = d => setView(opts[(i + d + opts.length) % opts.length][0])
        return (
          <button type="button" className="pdp-view-cycle" style={{ '--c': cur[2] }} onClick={() => step(1)}
            onTouchStart={e => { e.currentTarget.dataset.x = e.touches[0].clientX }}
            onTouchEnd={e => { const dx = e.changedTouches[0].clientX - Number(e.currentTarget.dataset.x || 0); if (Math.abs(dx) > 40) { e.preventDefault(); step(dx < 0 ? 1 : -1) } }}>
            <span className="pdp-view-label">{cur[1]}</span>
            <span className="reg-title-dots">{opts.map(o => <i key={o[0]} className={o[0] === cur[0] ? 'on' : ''} />)}</span>
          </button>
        )
      })()}
      {/* hide / search */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search athlete…" style={{ flex: '1 1 160px', minWidth: 140 }} />
        <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{visible.length} athlete{visible.length === 1 ? '' : 's'}</span>
      </div>
      {/* clipboard */}
      {cols && clip.length > 0 && (
        <div className="card" style={{ padding: 10, marginBottom: 10, borderLeft: '3px solid #EF9F27' }}>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: clip.length ? 6 : 0 }}>
            {clip.length ? <b>Copied ({clip.length}) -- press one to edit or move it:</b> : null}
          </div>
          {clip.length > 0 && (
            <>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
                {clip.map((c, idx) => <span key={c.t} onClick={() => setClipEdit({ idx, t: c.t, key: c.key || (cols?.[0]?.key) })} title="Press to edit or move this note" style={{ fontSize: 12, padding: '2px 8px', borderRadius: 12, background: '#EF9F2722', border: '1px solid #EF9F27', cursor: 'pointer' }}>{c.t} ✎</span>)}
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                {ticked.size > 0 && cols.map(c => (
                  <button key={c.key} className="btn btn-sm" disabled={busy} onClick={() => pasteInto([...ticked], c.key, clipTexts())}>Paste into {ticked.size} ticked · {c.label}</button>
                ))}
                <button className="btn btn-sm" onClick={() => setClip([])}>Clear</button>
              </div>
            </>
          )}
        </div>
      )}

      {cols && narrow ? (() => {
        const n = Math.min(perView, cols.length), start = Math.min(colStart, Math.max(0, cols.length - n))
        const shown = cols.slice(start, start + n)
        const fs = n === 1 ? 15 : n === 2 ? 13 : 11
        const go = d => setColStart(Math.max(0, Math.min(cols.length - n, start + d * n)))
        const zoom = d => { const v = Math.max(1, Math.min(3, perView + d)); setPerView(v); try { localStorage.setItem('kc_pdp_cols', String(v)) } catch { /* */ } }
        return (
          <div onTouchStart={e => { swipeRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY } }}
            onTouchEnd={e => { const c0 = swipeRef.current; swipeRef.current = null; if (!c0) return; const dx = e.changedTouches[0].clientX - c0.x, dy = e.changedTouches[0].clientY - c0.y; if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5 && !['TEXTAREA', 'INPUT'].includes(document.activeElement?.tagName)) go(dx < 0 ? 1 : -1) }}>
            {/* column header: which sections are showing, swipe / arrows, zoom */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, position: 'sticky', top: 0, zIndex: 2, background: 'var(--bg-primary, #0f1318)', padding: '6px 0' }}>
              <button className="btn btn-sm" disabled={start === 0} onClick={() => go(-1)}>‹</button>
              <div style={{ flex: 1, display: 'grid', gridTemplateColumns: `repeat(${n}, 1fr)`, gap: 6 }}>
                {shown.map(c => <b key={c.key} style={{ fontSize: 12, color: sectionColour(c.key), textAlign: 'center' }}>{c.label}</b>)}
              </div>
              <button className="btn btn-sm" disabled={start + n >= cols.length} onClick={() => go(1)}>›</button>
              <button className="btn btn-sm" title="Zoom in (fewer columns, bigger text)" disabled={perView <= 1} onClick={() => zoom(-1)}>＋</button>
              <button className="btn btn-sm" title="Zoom out (more columns)" disabled={perView >= 3 || perView >= cols.length} onClick={() => zoom(1)}>－</button>
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 4, marginBottom: 8 }}>
              {Array.from({ length: Math.ceil(cols.length / n) }, (_, i) => <i key={i} style={{ width: i === Math.floor(start / n) ? 16 : 6, height: 6, borderRadius: 3, background: i === Math.floor(start / n) ? '#06B6D4' : 'var(--border-strong)' }} />)}
            </div>
            {visible.map(s => {
              const pdp = rows[s.id] || {}
              return (
                <div key={s.id} className="card" style={{ padding: 10, marginBottom: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <input type="checkbox" checked={ticked.has(s.id)} onChange={() => setTicked(t => { const nn = new Set(t); nn.has(s.id) ? nn.delete(s.id) : nn.add(s.id); return nn })} aria-label="Tick for bulk paste" />
                    <button onClick={() => setQuick(q => q === s.id ? null : s.id)} style={{ all: 'unset', cursor: 'pointer', fontWeight: 700, fontSize: 14 }}>{quick === s.id ? '▾' : '▸'} {nameOf(s)}</button>
                    <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{s.discipline === 'KRBA' ? 'KRBA' : s.in_comp ? 'In comp' : 'Out of comp'}</span>
                  </div>
                  {quick === s.id && <PdpQuick s={s} pdp={pdp} />}
                  <div style={{ display: 'grid', gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))`, gap: 8, fontSize: fs }}>
                    {shown.map(c => {
                      const items = (pdp[c.key] || []).map(itemText).filter(Boolean)
                      return <div key={c.key} data-cell={`${s.id}:${c.key}`} style={{ minWidth: 0, borderTop: `2px solid ${sectionColour(c.key)}`, paddingTop: 4 }}>{cellBody(s, c, items)}</div>
                    })}
                  </div>
                </div>
              )
            })}
            {!visible.length && <p style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>No athletes to show.</p>}
          </div>
        )
      })() : (
      !cols ? (
        <div>
          {visible.map(s => {
            const pdp = rows[s.id] || {}
            const block = (k, n, bg, title) => (
              <button key={k} onClick={() => setOpenCell(o => o && o.id === s.id && o.key === k ? null : { id: s.id, key: k })} title={title}
                style={{ all: 'unset', cursor: 'pointer', minWidth: 30, textAlign: 'center', padding: '5px 6px', borderRadius: 6, fontSize: 14, fontWeight: 800, fontFamily: 'Orbitron, sans-serif',
                  color: n ? '#fff' : '#E24B4A', background: n ? bg : 'transparent', border: n ? 'none' : '1px dashed #E24B4A88' }}>{n || '·'}</button>
            )
            return (
              <div key={s.id} className="card" style={{ padding: 12, marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
                  <button onClick={() => setQuick(q => q === s.id ? null : s.id)} style={{ all: 'unset', cursor: 'pointer', fontWeight: 700, fontSize: 16 }}>{quick === s.id ? '▾' : '▸'} {nameOf(s)}</button>
                  <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{s.discipline === 'KRBA' ? 'KRBA' : s.in_comp ? 'In comp' : 'Out of comp'}</span>
                </div>
                {quick === s.id && <PdpQuick s={s} pdp={pdp} />}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, rowGap: 10 }}>
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginBottom: 4 }}>General</div>
                    <div style={{ display: 'flex', gap: 4 }}>{general.map(c => block(c.key, (pdp[c.key] || []).length, '#1D9E75', c.label))}</div>
                  </div>
                  {groups.map(g => (
                    <div key={g.label}>
                      <div style={{ fontSize: 10, color: g.colour || 'var(--text-tertiary)', marginBottom: 4 }}>{g.label}</div>
                      <div style={{ display: 'flex', gap: 4 }}>{g.keys.map((k, i) => block(k, (pdp[k] || []).length, colours[SUB[i][0]] || '#666', `${g.label} · ${SUB[i][1]}`))}</div>
                    </div>
                  ))}
                </div>
                {openCell?.id === s.id && (() => {
                  const sec = [...general, ...sections].find(x => x.key === openCell.key) || { key: openCell.key, label: openCell.key }
                  const g = groups.find(x => x.keys.includes(openCell.key)), i = g ? g.keys.indexOf(openCell.key) : -1
                  const label = g ? `${g.label} · ${SUB[i]?.[1] || ''}` : sec.label
                  const items = (pdp[openCell.key] || []).map(itemText).filter(Boolean)
                  return (
                    <div style={{ marginTop: 10, padding: '8px 10px', borderRadius: 8, background: 'var(--bg-secondary)', borderLeft: `3px solid ${g ? (colours[SUB[i]?.[0]] || '#666') : '#1D9E75'}`, animation: 'kcSlideDown 0.2s ease' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                        <b style={{ fontSize: 13 }}>{label}</b>
                        <button type="button" onClick={() => setOpenCell(null)} style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer' }}>✕</button>
                      </div>
                      <div style={{ fontSize: 13 }}>{cellBody(s, { key: openCell.key, label }, items)}</div>
                    </div>
                  )
                })()}
              </div>
            )
          })}
          {!visible.length && <p style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>No athletes to show.</p>}
        </div>
      ) : (
      <div ref={tableRef} style={{ overflowX: 'auto', maxHeight: '70vh', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr>
              {cols && <th style={{ ...th, width: 28 }}>
                <input type="checkbox" checked={visible.length > 0 && visible.every(s => ticked.has(s.id))} onChange={e => setTicked(e.target.checked ? new Set(visible.map(s => s.id)) : new Set())} aria-label="Tick all" />
              </th>}
              <th style={{ ...th, left: 0, zIndex: 2 }}>Athlete</th>
              {cols ? cols.map(c => <th key={c.key} style={{ ...th, color: sectionColour(c.key), minWidth: 180 }}>{c.label}</th>)
                : <>
                    {general.map(c => <th key={c.key} style={{ ...th, color: sectionColour(c.key) }}>{c.label}</th>)}
                    {groups.map(g => <th key={g.label} style={th}>{g.label}<div style={{ fontWeight: 500, color: 'var(--text-tertiary)' }}>N · M · W · T</div></th>)}
                  </>}
            </tr>
          </thead>
          <tbody>
            {visible.map(s => {
              const pdp = rows[s.id] || {}
              return (
                <Fragment key={s.id}>
                <tr>
                  {cols && <td style={tdBase}><input type="checkbox" checked={ticked.has(s.id)} onChange={() => setTicked(t => { const n = new Set(t); n.has(s.id) ? n.delete(s.id) : n.add(s.id); return n })} aria-label={`Tick ${nameOf(s)}`} /></td>}
                  <td style={{ ...tdBase, whiteSpace: 'nowrap', position: 'sticky', left: 0, background: 'var(--bg-primary, #0f1318)' }}>
                    <button onClick={() => setQuick(q => q === s.id ? null : s.id)} style={{ all: 'unset', cursor: 'pointer', fontWeight: 600 }} title="Quick view">{quick === s.id ? '▾' : '▸'} {nameOf(s)}</button>
                    <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{s.discipline === 'KRBA' ? 'KRBA' : s.in_comp ? 'In comp' : 'Out of comp'}</div>
                  </td>
                  {cols ? cols.map(c => {
                    const items = (pdp[c.key] || []).map(itemText).filter(Boolean)
                    return (
                      <td key={c.key} data-cell={`${s.id}:${c.key}`} style={{ ...tdBase, background: focus && focus.id === s.id && focus.key === c.key ? '#06B6D433' : items.length ? undefined : '#E24B4A0D', outline: focus && focus.id === s.id && focus.key === c.key ? '2px solid #06B6D4' : 'none', transition: 'background 0.4s' }}>
                        {cellBody(s, c, items)}
                      </td>
                    )
                  }) : <>
                    {general.map(c => { const n = (pdp[c.key] || []).length; return <td key={c.key} style={{ ...tdBase, textAlign: 'center' }}><button onClick={() => jumpTo(s.id, c.key)} title="Go to these notes" style={{ all: 'unset', cursor: 'pointer', minWidth: 24, padding: '1px 6px', borderRadius: 4, fontWeight: 700, color: n ? 'var(--text)' : '#E24B4A', border: '1px solid var(--border)' }}>{n || '—'}</button></td> })}
                    {groups.map(g => (
                      <td key={g.label} style={{ ...tdBase, whiteSpace: 'nowrap' }}>
                        {g.keys.map((k, i) => { const n = (pdp[k] || []).length; return <button key={k} onClick={() => jumpTo(s.id, k)} title={`Go to ${g.label} · ${SUB[i][1]}`} style={{ all: 'unset', cursor: 'pointer', display: 'inline-block', minWidth: 20, textAlign: 'center', marginRight: 2, borderRadius: 4, padding: '1px 3px', fontWeight: 700, color: n ? '#fff' : '#E24B4A', background: n ? (colours[SUB[i][0]] || '#666') : 'transparent', border: n ? 'none' : '1px dashed #E24B4A55' }}>{n || '·'}</button> })}
                      </td>
                    ))}
                  </>}
                </tr>
                {quick === s.id && <tr><td colSpan={99} style={{ padding: '0 10px', borderBottom: '1px solid var(--border)' }}><PdpQuick s={s} pdp={pdp} /></td></tr>}
                </Fragment>
              )
            })}
            {!visible.length && <tr><td colSpan={20} style={{ ...tdBase, color: 'var(--text-tertiary)' }}>No athletes to show.</td></tr>}
          </tbody>
        </table>
      </div>
      )
      )}
      {clipEdit && (
        <div onClick={() => setClipEdit(null)} style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '70px 12px 0' }}>
          <div className="card" onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 420, padding: 14 }}>
            <b style={{ fontSize: 14 }}>Edit / move note</b>
            {clip[clipEdit.idx]?.id && <div style={{ fontSize: 11, color: 'var(--text-tertiary)', margin: '2px 0 8px' }}>From {nameOf(athletes.find(a => a.id === clip[clipEdit.idx].id) || {})}</div>}
            <textarea rows={3} value={clipEdit.t} onChange={e => setClipEdit(x => ({ ...x, t: e.target.value }))}
              style={{ width: '100%', boxSizing: 'border-box', fontSize: 13, padding: 8, borderRadius: 6, border: '1px solid var(--border-strong)', background: 'var(--bg-secondary)', color: 'var(--text)', margin: '6px 0' }} />
            {clip[clipEdit.idx]?.id && (
              <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>Section
                <select value={clipEdit.key || ''} onChange={e => setClipEdit(x => ({ ...x, key: e.target.value }))} style={{ flex: 1 }}>
                  {sections.map(sec => <option key={sec.key} value={sec.key}>{sec.label}</option>)}
                </select>
              </label>
            )}
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="btn btn-sm btn-primary" disabled={busy || !clipEdit.t.trim()} onClick={saveClipEdit}>Save</button>
              <button className="btn btn-sm" onClick={() => { setClip(c => c.filter((_, i) => i !== clipEdit.idx)); setClipEdit(null) }}>Remove from copied</button>
              <button className="btn btn-sm" style={{ marginLeft: 'auto' }} onClick={() => setClipEdit(null)}>Cancel</button>
            </div>
            {clip[clipEdit.idx]?.id && <p style={{ fontSize: 11, color: 'var(--text-tertiary)', margin: '8px 0 0' }}>Saving changes the note on that athlete's PDP (and moves it if you pick another section).</p>}
          </div>
        </div>
      )}
      <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 6 }}>
        Counts: N Notes · M Maintain · W Work on · T To do — tap a count to go to those notes. Red = no notes in that area. Added and pasted notes go straight onto the athlete's own PDP.
      </div>
    </div>
  )
}
