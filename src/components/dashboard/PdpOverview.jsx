import { useEffect, useMemo, useRef, useState } from 'react'
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
  const [clip, setClip] = useState([])               // copied notes
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
    .filter(showFilters[show] || showFilters.all)
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
  const toggleClip = t => setClip(c => c.includes(t) ? c.filter(x => x !== t) : [...c, t])

  const pill = (on, colour) => ({ fontSize: 12, padding: '4px 10px', borderRadius: 20, cursor: 'pointer', fontFamily: 'var(--font-sans)',
    border: `1px solid ${on ? colour : 'var(--border-strong)'}`, background: on ? colour + '22' : 'none', color: on ? colour : 'var(--text-secondary)' })
  const th = { textAlign: 'left', padding: '6px 8px', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap', position: 'sticky', top: 0, background: 'var(--bg-primary, #0f1318)', zIndex: 1 }
  const tdBase = { padding: '6px 8px', verticalAlign: 'top', borderBottom: '1px solid var(--border)' }

  if (rows === null) return <p style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>Loading PDP notes…</p>

  return (
    <div>
      {/* views */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
        <button style={pill(view === 'overview', '#06B6D4')} onClick={() => setView('overview')}>All sections (counts)</button>
        <button style={pill(view === 'General', '#1D9E75')} onClick={() => setView('General')}>General</button>
        {groups.map(g => <button key={g.label} style={pill(view === g.label, '#378ADD')} onClick={() => setView(g.label)}>{g.label}</button>)}
      </div>
      {/* hide / search */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search athlete…" style={{ flex: '1 1 160px', minWidth: 140 }} />
        <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 6 }}>Show
          <select value={show} onChange={e => pickShow(e.target.value)} style={{ minWidth: 90 }}>
            <option value="all">All</option>
            <option value="kr">KR</option>
            <option value="krba">KRBA</option>
          </select>
        </label>
        <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{visible.length} athlete{visible.length === 1 ? '' : 's'}</span>
      </div>
      {/* clipboard */}
      {cols && (
        <div className="card" style={{ padding: 10, marginBottom: 10, borderLeft: '3px solid #EF9F27' }}>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: clip.length ? 6 : 0 }}>
            {clip.length ? <b>Copied ({clip.length}):</b> : 'Tap notes to copy them (or a cell\'s Copy), then Paste into another athlete\'s cell — or tick athletes and paste into all of them. + Add types a new note into a cell.'}
          </div>
          {clip.length > 0 && (
            <>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
                {clip.map(t => <span key={t} onClick={() => toggleClip(t)} style={{ fontSize: 12, padding: '2px 8px', borderRadius: 12, background: '#EF9F2722', border: '1px solid #EF9F27', cursor: 'pointer' }}>{t} ×</span>)}
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                {ticked.size > 0 && cols.map(c => (
                  <button key={c.key} className="btn btn-sm" disabled={busy} onClick={() => pasteInto([...ticked], c.key, clip)}>Paste into {ticked.size} ticked · {c.label}</button>
                ))}
                <button className="btn btn-sm" onClick={() => setClip([])}>Clear</button>
              </div>
            </>
          )}
        </div>
      )}

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
                <tr key={s.id}>
                  {cols && <td style={tdBase}><input type="checkbox" checked={ticked.has(s.id)} onChange={() => setTicked(t => { const n = new Set(t); n.has(s.id) ? n.delete(s.id) : n.add(s.id); return n })} aria-label={`Tick ${nameOf(s)}`} /></td>}
                  <td style={{ ...tdBase, whiteSpace: 'nowrap', position: 'sticky', left: 0, background: 'var(--bg-primary, #0f1318)' }}>
                    <button onClick={() => onOpenAthlete?.(s)} style={{ all: 'unset', cursor: 'pointer', fontWeight: 600 }} title="Open athlete">{nameOf(s)}</button>
                    <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{s.discipline === 'KRBA' ? 'KRBA' : s.in_comp ? 'In comp' : 'Out of comp'}</div>
                  </td>
                  {cols ? cols.map(c => {
                    const items = (pdp[c.key] || []).map(itemText).filter(Boolean)
                    return (
                      <td key={c.key} data-cell={`${s.id}:${c.key}`} style={{ ...tdBase, background: focus && focus.id === s.id && focus.key === c.key ? '#06B6D433' : items.length ? undefined : '#E24B4A0D', outline: focus && focus.id === s.id && focus.key === c.key ? '2px solid #06B6D4' : 'none', transition: 'background 0.4s' }}>
                        {items.length ? (
                          <ul style={{ margin: 0, paddingLeft: 16 }}>
                            {items.map((t, i) => (
                              <li key={i} onClick={() => toggleClip(t)} title="Tap to copy" style={{ cursor: 'pointer', marginBottom: 2, background: clip.includes(t) ? '#EF9F2733' : undefined, borderRadius: 4 }}>{t}</li>
                            ))}
                          </ul>
                        ) : <span style={{ color: '#E24B4A', fontSize: 11 }}>— none —</span>}
                        <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                          {items.length > 0 && <button className="btn btn-sm" style={{ padding: '0 6px', fontSize: 10 }} onClick={() => setClip(items)}>Copy</button>}
                          {clip.length > 0 && <button className="btn btn-sm" disabled={busy} style={{ padding: '0 6px', fontSize: 10, borderColor: '#EF9F27', color: '#EF9F27' }} onClick={() => pasteInto([s.id], c.key, clip)}>Paste</button>}
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
              )
            })}
            {!visible.length && <tr><td colSpan={20} style={{ ...tdBase, color: 'var(--text-tertiary)' }}>No athletes to show.</td></tr>}
          </tbody>
        </table>
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 6 }}>
        Counts: N Notes · M Maintain · W Work on · T To do — tap a count to go to those notes. Red = no notes in that area. Added and pasted notes go straight onto the athlete's own PDP.
      </div>
    </div>
  )
}
