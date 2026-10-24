import { useEffect, useMemo, useState } from 'react'
import AthletePicker from './AthletePicker.jsx'

// 👀 Tag one by one (Oct 2026): step through the chosen videos before uploading.
// The current clip plays (muted, from the device -- nothing uploaded yet) with big
// buttons for the batch's athletes underneath: tap who's in it, Next. "+ Add
// athlete" adds someone to the batch and ticks them on this clip. Opened on one
// video it doubles as the tap-to-preview.
export default function TagVideosStepper({ items, startIndex = 0, batchIds, students, studentName, onToggle, onAddToBatch, onClose }) {
  const [i, setI] = useState(Math.min(startIndex, items.length - 1))
  const [adding, setAdding] = useState(false)
  const item = items[i]
  const url = useMemo(() => (item ? URL.createObjectURL(item.file) : null), [item?.key]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { if (url) URL.revokeObjectURL(url) }, [url])
  if (!item) return null

  const batch = students.filter(s => batchIds.has(s.id))
  const ticked = item.featuredIds
  const btn = { minHeight: 52, padding: '8px 12px', borderRadius: 10, fontSize: 15, fontWeight: 700, cursor: 'pointer' }
  const untagged = items.filter(it => it.featuredIds.size === 0).length

  return (
    <div role="dialog" aria-modal="true" style={{ position: 'fixed', inset: 0, zIndex: 520, background: 'var(--bg, #0B0F12)', color: 'var(--text, #fff)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: '1px solid var(--border, #2A3138)' }}>
        <button type="button" className="btn btn-sm" onClick={onClose}>✕</button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>{items.length > 1 ? `Video ${i + 1} of ${items.length}` : 'Preview'}</div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.file.name}{items.length > 1 ? ` · ${untagged} still untagged` : ''}</div>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 14 }}>
        <video key={item.key} src={url} controls muted playsInline autoPlay loop style={{ width: '100%', maxHeight: '42vh', background: '#000', borderRadius: 10, display: 'block' }} />
        {item.frames?.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${item.frames.length}, 1fr)`, gap: 4, marginTop: 6 }}>
            {item.frames.map((f, k) => <img key={k} src={f} alt="" style={{ width: '100%', borderRadius: 6, display: 'block' }} />)}
          </div>
        )}

        <div style={{ fontSize: 13, fontWeight: 600, margin: '14px 0 8px' }}>Who's in this video?</div>
        {batch.length === 0 && <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>No athletes in this batch yet -- add them below.</p>}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8 }}>
          {batch.map(s => {
            const on = ticked.has(s.id)
            return (
              <button key={s.id} type="button" onClick={() => onToggle(item.key, s.id)} className={on ? 'btn btn-primary' : 'btn'} style={btn}>
                {on ? '✓ ' : ''}{studentName(s)}
              </button>
            )
          })}
        </div>
        {!adding ? (
          <button type="button" className="btn" style={{ marginTop: 10, width: '100%' }} onClick={() => setAdding(true)}>+ Add athlete</button>
        ) : (
          <div style={{ marginTop: 10 }}>
            <AthletePicker students={students.filter(s => !batchIds.has(s.id))} studentName={studentName} selected={new Set()}
              onChange={next => { const id = [...next][0]; if (id) { onAddToBatch(id); onToggle(item.key, id, true); setAdding(false) } }} maxHeight={180} />
          </div>
        )}
      </div>

      <div style={{ padding: 14, borderTop: '1px solid var(--border, #2A3138)', display: 'flex', gap: 8 }}>
        {items.length > 1 && <button type="button" className="btn" style={{ flex: 1, ...btn }} disabled={i === 0} onClick={() => setI(i - 1)}>◀ Back</button>}
        {i < items.length - 1
          ? <button type="button" className="btn btn-primary" style={{ flex: 2, ...btn }} onClick={() => { setAdding(false); setI(i + 1) }}>Next ▶</button>
          : <button type="button" className="btn btn-primary" style={{ flex: 2, ...btn }} onClick={onClose}>Done</button>}
      </div>
    </div>
  )
}
