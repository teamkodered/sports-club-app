import { createRoot } from 'react-dom/client'
import { useState } from 'react'
import { supabase } from './supabase.js'

// Dated class assignments (Oct 2026). A student's assignment to a class can
// have start_date / end_date (inclusive). A class only counts as "due" for a
// student between those dates, so removing a class (= setting its end date)
// no longer rewrites past attendance, and adding one doesn't create past
// misses. Rows without dates behave exactly as before (always due).

const pad = n => String(n).padStart(2, '0')
export const isoDay = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const todayISO = () => isoDay(new Date())
export const addDaysISO = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return isoDay(d) }
export const fmtDMY = iso => iso ? String(iso).slice(0, 10).split('-').reverse().join('/') : ''

export function assignmentActiveOn(a, dateStr) {
  if (!a) return false
  if (a.start_date && String(a.start_date).slice(0, 10) > dateStr) return false
  if (a.end_date && String(a.end_date).slice(0, 10) < dateStr) return false
  return true
}
export const isPastAssignment = (a, today = todayISO()) => !!a?.end_date && String(a.end_date).slice(0, 10) < today
export const isFutureAssignment = (a, today = todayISO()) => !!a?.start_date && String(a.start_date).slice(0, 10) > today

// Little pop-up asking for dates. mode 'add' -> { start_date, end_date|null } ; 'remove' -> { end_date }
// Resolves null if cancelled.
export function askAssignmentDates({ mode = 'add', label = '' } = {}) {
  return new Promise(resolve => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    const done = v => { resolve(v); setTimeout(() => { root.unmount(); host.remove() }, 0) }
    function Dialog() {
      const today = todayISO()
      const [start, setStart] = useState(today)
      const [temp, setTemp] = useState(false)
      const [end, setEnd] = useState(addDaysISO(today, 28))
      const [removedFrom, setRemovedFrom] = useState(today)
      const field = { width: '100%', boxSizing: 'border-box', padding: '8px 10px', fontSize: 15, borderRadius: 8, border: '1px solid var(--border-strong, #444)', background: 'var(--bg-secondary, #111)', color: 'var(--text, #fff)' }
      const ok = mode === 'add' ? (!!start && (!temp || (end && end >= start))) : !!removedFrom
      return (
        <div onClick={() => done(null)} style={{ position: 'fixed', inset: 0, zIndex: 600, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={e => e.stopPropagation()} className="card" style={{ width: '100%', maxWidth: 360, padding: 18 }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>{mode === 'add' ? 'Assign class' : 'Remove from class'}</h3>
            {label && <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 }}>{label}</p>}
            {mode === 'add' ? (
              <>
                <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Starts on</label>
                <input type="date" value={start} onChange={e => setStart(e.target.value)} style={{ ...field, marginBottom: 4 }} />
                <p style={{ fontSize: 11, color: 'var(--text-tertiary)', margin: '0 0 10px' }}>Today by default -- pick an earlier date to backdate, or a later one to start in the future.</p>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginBottom: 8 }}>
                  <input type="checkbox" checked={temp} onChange={e => setTemp(e.target.checked)} /> Temporary (ends automatically)
                </label>
                {temp && (<>
                  <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Last day</label>
                  <input type="date" value={end} min={start} onChange={e => setEnd(e.target.value)} style={{ ...field, marginBottom: 10 }} />
                </>)}
              </>
            ) : (
              <>
                <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Removed from</label>
                <input type="date" value={removedFrom} max={addDaysISO(today, 365)} onChange={e => setRemovedFrom(e.target.value)} style={{ ...field, marginBottom: 4 }} />
                <p style={{ fontSize: 11, color: 'var(--text-tertiary)', margin: '0 0 10px' }}>Sessions from this date onwards no longer count. Pick an earlier date if they stopped coming before today. Past attendance stays as it was.</p>
              </>
            )}
            <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
              <button type="button" className="btn" onClick={() => done(null)} style={{ flex: 1, justifyContent: 'center' }}>Cancel</button>
              <button type="button" className="btn btn-primary" disabled={!ok} style={{ flex: 1, justifyContent: 'center' }}
                onClick={() => done(mode === 'add' ? { start_date: start, end_date: temp ? end : null } : { end_date: addDaysISO(removedFrom, -1), removedFrom })}>
                {mode === 'add' ? 'Assign' : 'Remove'}
              </button>
            </div>
          </div>
        </div>
      )
    }
    root.render(<Dialog />)
  })
}

// Insert with dates; if the date columns don't exist yet (SQL not run), insert without them.
export async function insertAssignment(row, selectStr) {
  let q = await supabase.from('student_class_assignments').insert(row).select(selectStr).single()
  if (q.error && /start_date|end_date/.test(q.error.message || '')) {
    const { start_date, end_date, ...plain } = row
    q = await supabase.from('student_class_assignments').insert(plain).select(selectStr).single()
  }
  return q
}

// End an assignment (keeps the row so history stays right).
export async function endAssignment(id, end_date) {
  const { error } = await supabase.from('student_class_assignments').update({ end_date }).eq('id', id)
  if (error && /end_date/.test(error.message || '')) return { error: { message: 'The class dates update has not been set up yet -- run supabase_class_assignment_dates.sql first.' } }
  return { error }
}

// Reinstate / edit dates on an assignment
export async function setAssignmentDates(id, patch) {
  return supabase.from('student_class_assignments').update(patch).eq('id', id)
}
