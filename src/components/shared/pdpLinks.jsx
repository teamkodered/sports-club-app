import { useState } from 'react'

// PDP <-> question-card links (Sep 2026).
// A PDP item stays a plain line of text in pdp_notes (nothing about the PDP
// changes); athlete_profiles.pdp_links records which question / item a line
// belongs to:  { "<sectionKey>::<item text>": { pillar, q, item } }
//   pillar: 'mentality' | 'technique' | 'tactical' | 'physical'
//   q:      question key (mentality), tactical area, "Style::Group" (technique), physical key
//   item:   optional specific item (e.g. 'Jab'); null = the whole question / area
// Linked questions / items show in GOLD on the question cards, with the note.

export const PDP_GOLD = '#F5C542'
export const PDP_AREA_FOR_PILLAR = { mentality: 'psychology', technique: 'tech', tactical: 'tact', physical: 'physical' }
export const PDP_COLUMNS = [
  { key: 'work_on', label: 'Work on' },
  { key: 'maintain', label: 'Maintain' },
  { key: 'what_to_do', label: 'To do' },
  { key: 'notes', label: 'Notes' },
]
const COLUMN_LABEL = { notes: 'Notes', maintain: 'Maintain', work_on: 'Work on', what_to_do: 'To do' }
export const pdpSectionKey = (pillar, column) => `${PDP_AREA_FOR_PILLAR[pillar]}_${column}`
export const pdpLinkKey = (sectionKey, text) => `${sectionKey}::${text}`

// Is this PDP line visible to the athlete? "To do" columns are always live;
// other columns only once the coach has sent (shared) them.
export function pdpVisibleToAthlete(apData, sectionKey, text) {
  if (sectionKey.endsWith('what_to_do')) return true
  return ((apData?.pdp_shared || {})[sectionKey] || []).includes(text)
}

// All current links for one question (and its items). Links whose PDP line no
// longer exists (edited / removed in the PDP) are ignored automatically.
export function pdpLinksFor(apData, pillar, q, { athleteView = false } = {}) {
  const links = apData?.pdp_links || {}
  const notes = apData?.pdp_notes || {}
  const out = []
  for (const [k, link] of Object.entries(links)) {
    if (!link || link.pillar !== pillar) continue
    // a combination line (e.g. Jab–Cross–Hook) lights up each of its parts
    const parts = (Array.isArray(link.combo) && link.combo.length ? link.combo : [link]).filter(pt => pt.q === q)
    if (!parts.length) continue
    const i = k.indexOf('::')
    let sectionKey = k.slice(0, i)
    const text = k.slice(i + 2)
    if (!(notes[sectionKey] || []).includes(text)) {
      // The line may have moved to another column of the same area (e.g. a To do
      // checked off into Maintain) -- follow it there; otherwise the link is stale.
      const area = sectionKey.replace(/_(notes|maintain|work_on|what_to_do)$/, '')
      const moved = ['notes', 'maintain', 'work_on', 'what_to_do'].map(c => `${area}_${c}`).find(sk => (notes[sk] || []).includes(text))
      if (!moved) continue
      sectionKey = moved
    }
    if (athleteView && !pdpVisibleToAthlete(apData, sectionKey, text)) continue
    const column = sectionKey.replace(/^[a-z]+_/, '')
    const note = text.includes(' — ') ? text.slice(text.indexOf(' — ') + 3) : ''
    parts.forEach((pt, n) => out.push({ key: `${k}#${n}`, sectionKey, column, columnLabel: COLUMN_LABEL[column] || column, text, note, item: pt.item || null, combo: parts.length > 1 || !!link.combo }))
  }
  return out
}

// Gold note block listing a question's PDP lines
export function PdpNotes({ links, onlyItem }) {
  const list = onlyItem === undefined ? links : links.filter(l => l.item === onlyItem)
  if (!list.length) return null
  return (
    <div className="neon-pdp-notes" style={{ display: 'flex', flexDirection: 'column', gap: 4, margin: '0 0 10px', padding: '8px 10px', borderRadius: 6, border: `1px solid ${PDP_GOLD}`, background: PDP_GOLD + '14' }}>
      {list.map(l => (
        <div key={l.key} style={{ fontSize: 12, lineHeight: 1.35 }}>
          <span style={{ fontFamily: 'Orbitron, sans-serif', fontSize: 8, letterSpacing: 1.5, color: PDP_GOLD, marginRight: 6 }}>PDP · {l.columnLabel.toUpperCase()}</span>
          <span style={{ color: '#F2F2F2' }}>{l.combo ? l.text : <>{l.item ? <b>{l.item}{l.note ? ': ' : ''}</b> : null}{l.note || (l.item ? '' : l.text)}</>}</span>
        </div>
      ))}
    </div>
  )
}

// Coach: "+ PDP" pop-up -- choose column (Work on by default), write the note, Save.
export function PdpAddModal({ target, onClose, onSave }) {
  const [column, setColumn] = useState('work_on')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  if (!target) return null
  const name = target.item || target.label
  const save = async () => { setSaving(true); try { await onSave({ ...target, column, note: note.trim() }) } finally { setSaving(false) } }
  return (
    <div role="dialog" aria-modal="true" aria-label="Add to PDP" onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 460, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 520, boxSizing: 'border-box', padding: '16px 16px calc(18px + env(safe-area-inset-bottom, 0px))', borderRadius: '14px 14px 0 0', background: '#111518', border: `1px solid ${PDP_GOLD}`, borderBottom: 'none', boxShadow: `0 -6px 24px ${PDP_GOLD}44`, color: '#F2F2F2' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div>
            <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: 9, letterSpacing: 2, color: PDP_GOLD }}>ADD TO PDP · {target.pillarLabel?.toUpperCase()}</div>
            <div style={{ fontFamily: "'Saira Condensed', sans-serif", fontStyle: 'italic', fontWeight: 800, fontSize: 24, textTransform: 'uppercase', lineHeight: 1.1 }}>{name}</div>
          </div>
          <button type="button" aria-label="Close" onClick={onClose} style={{ background: 'none', border: 'none', color: '#9A9A9A', fontSize: 22, cursor: 'pointer' }}>✕</button>
        </div>
        <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
          {PDP_COLUMNS.map(c => (
            <button key={c.key} type="button" aria-pressed={column === c.key} onClick={() => setColumn(c.key)}
              style={{ height: 32, padding: '0 14px', border: 'none', cursor: 'pointer', clipPath: 'polygon(8px 0, 100% 0, calc(100% - 8px) 100%, 0 100%)', background: column === c.key ? PDP_GOLD : '#2A3138', color: column === c.key ? '#0A0A0A' : '#F2F2F2', fontFamily: "'Saira Condensed', sans-serif", fontStyle: 'italic', fontWeight: 800, fontSize: 15, letterSpacing: 1 }}>
              {c.label.toUpperCase()}
            </button>
          ))}
        </div>
        <textarea value={note} onChange={e => setNote(e.target.value)} rows={3} placeholder={`Note for ${name} (optional)`}
          style={{ width: '100%', boxSizing: 'border-box', padding: 10, borderRadius: 6, border: '1px solid #2A3138', background: '#0B0F12', color: '#FFFFFF', fontSize: 14, fontFamily: 'inherit', marginBottom: 12 }} />
        <button type="button" disabled={saving} onClick={save}
          style={{ width: '100%', height: 46, border: 'none', cursor: 'pointer', clipPath: 'polygon(14px 0, calc(100% - 14px) 0, 100% 50%, calc(100% - 14px) 100%, 14px 100%, 0 50%)', background: PDP_GOLD, color: '#0A0A0A', fontFamily: "'Saira Condensed', sans-serif", fontStyle: 'italic', fontWeight: 800, fontSize: 20, letterSpacing: 2, opacity: saving ? 0.6 : 1 }}>
          {saving ? 'SAVING…' : 'ADD TO PDP'}
        </button>
      </div>
    </div>
  )
}

// Which pillar a PDP section belongs to (null = general / skill / winning ways)
export function pdpPillarForSection(sectionKey) {
  const m = /^(psychology|tech|tact|physical)_/.exec(sectionKey || '')
  return m ? { psychology: 'mentality', tech: 'technique', tact: 'tactical', physical: 'physical' }[m[1]] : null
}
// Existing link for a PDP line (following it within its area), or null
export function pdpLinkForLine(apData, sectionKey, text) {
  const links = apData?.pdp_links || {}
  const area = sectionKey.replace(/_(notes|maintain|work_on|what_to_do)$/, '')
  for (const c of ['notes', 'maintain', 'work_on', 'what_to_do']) {
    const l = links[`${area}_${c}::${text}`]
    if (l) return l
  }
  return null
}
