import { useState } from 'react'

// Searchable checkbox list of athletes, with the currently selected ones
// shown as removable chips above it so you can see your picks without
// scrolling. Used for "Athletes in this fight" and the viewer list.
export default function AthletePicker({ students, studentName, selected, onChange, maxHeight = 160 }) {
  const [search, setSearch] = useState('')
  const q = search.trim().toLowerCase()
  const shown = students.filter(s => !q || studentName(s).toLowerCase().includes(q))
  const selectedStudents = students.filter(s => selected.has(s.id))

  function toggle(id, on) {
    const next = new Set(selected)
    if (on) next.add(id); else next.delete(id)
    onChange(next)
  }

  return (
    <div>
      {selectedStudents.length > 0 && (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 6 }}>
          {selectedStudents.map(s => (
            <button key={s.id} type="button" className="btn btn-sm" onClick={() => toggle(s.id, false)} style={{ fontSize: 11, padding: '2px 8px' }}>
              {studentName(s)} ✕
            </button>
          ))}
        </div>
      )}
      <input type="text" placeholder="🔍 Search by name…" value={search} onChange={e => setSearch(e.target.value)} style={{ width: '100%', fontSize: 13, marginBottom: 6 }} />
      <div style={{ maxHeight, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 6 }}>
        {shown.map(s => (
          <label key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, padding: '4px 8px' }}>
            <input type="checkbox" checked={selected.has(s.id)} onChange={e => toggle(s.id, e.target.checked)} />
            {studentName(s)}
          </label>
        ))}
        {shown.length === 0 && <p style={{ fontSize: 12, color: 'var(--text-tertiary)', padding: '6px 8px' }}>No matches</p>}
      </div>
    </div>
  )
}
