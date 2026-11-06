import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase.js'

// 🏖️ A student's own holidays / time off. All their classes are ticked by default (= the whole day off);
// untick classes to put them on holiday for just some sessions (saved per class). Holidays don't count
// against their attendance %.
const fmt = d => new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' })
const label = c => `${c?.name || 'Class'} — ${c?.day_of_week || ''} ${String(c?.start_time || '').slice(0, 5)}`

export default function StudentHolidays({ studentId, classes = [], canEdit = true }) {
  const [rows, setRows] = useState(null)
  const [form, setForm] = useState(null)       // { name, start_date, end_date, picked:Set }
  const [busy, setBusy] = useState(false)
  async function load() {
    const { data } = await supabase.from('holidays').select('*, classes(name, day_of_week, start_time)').eq('student_id', studentId).order('start_date', { ascending: false })
    setRows(data || [])
  }
  useEffect(() => { if (studentId) load() }, [studentId]) // eslint-disable-line react-hooks/exhaustive-deps

  const today = new Date().toISOString().split('T')[0]
  function start() { setForm({ name: 'Holiday', start_date: today, end_date: today, picked: new Set(classes.map(c => c.id)) }) }

  async function save() {
    if (!form.start_date || !form.end_date) return alert('Set both dates.')
    if (form.end_date < form.start_date) return alert('The To date must be on or after the From date.')
    if (!form.picked.size) return alert('Tick at least one class.')
    const base = { name: form.name.trim() || 'Holiday', start_date: form.start_date, end_date: form.end_date, student_id: studentId }
    // all classes ticked -> one whole-day holiday; otherwise one per ticked class
    const all = classes.length > 0 && classes.every(c => form.picked.has(c.id))
    const ins = all || !classes.length ? [base] : [...form.picked].map(cid => ({ ...base, class_id: cid }))
    setBusy(true)
    const { error } = await supabase.from('holidays').insert(ins)
    setBusy(false)
    if (error) return alert('Could not save: ' + error.message)
    setForm(null); load()
  }
  async function remove(h) {
    if (!confirm(`Remove "${h.name}" (${fmt(h.start_date)} – ${fmt(h.end_date)})?`)) return
    const { error } = await supabase.from('holidays').delete().eq('id', h.id)
    if (error) return alert('Could not remove: ' + error.message)
    load()
  }

  const upcoming = (rows || []).filter(h => h.end_date >= today), past = (rows || []).filter(h => h.end_date < today)
  const Row = ({ h }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: 13, opacity: h.end_date < today ? 0.6 : 1 }}>
      <span>🏖️ <b>{h.name}</b> · {fmt(h.start_date)}{h.end_date !== h.start_date ? ` – ${fmt(h.end_date)}` : ''}
        <span style={{ display: 'block', fontSize: 11, color: 'var(--text-tertiary)' }}>{h.class_id ? `Only: ${label(h.classes)}` : 'All their sessions'}</span></span>
      {canEdit && <button type="button" onClick={() => remove(h)} style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: 14 }}>✕</button>}
    </div>
  )
  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <h3 style={{ fontSize: 13, fontWeight: 600 }}>Holidays / time off</h3>
        {canEdit && <button className="btn btn-sm" onClick={() => form ? setForm(null) : start()}>{form ? 'Cancel' : '+ Add holiday'}</button>}
      </div>
      {form && (
        <div style={{ border: '1px dashed var(--border-strong)', borderRadius: 'var(--radius)', padding: 10, marginBottom: 8 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Holiday / Injury / Exams…" style={{ flex: '1 1 140px' }} />
            <label style={{ fontSize: 12 }}>From <input type="date" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value, end_date: f.end_date < e.target.value ? e.target.value : f.end_date }))} /></label>
            <label style={{ fontSize: 12 }}>To <input type="date" value={form.end_date} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))} /></label>
          </div>
          {classes.length > 0 && (
            <>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>Sessions it covers (all ticked = every session; untick any they'll still come to):</div>
              {classes.map(c => {
                const on = form.picked.has(c.id)
                return (
                  <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, padding: '6px 4px', cursor: 'pointer' }}>
                    <input type="checkbox" checked={on} style={{ width: 20, height: 20 }} onChange={() => setForm(f => { const p = new Set(f.picked); p.has(c.id) ? p.delete(c.id) : p.add(c.id); return { ...f, picked: p } })} />
                    {label(c)}
                  </label>
                )
              })}
            </>
          )}
          <button className="btn btn-sm btn-primary" style={{ marginTop: 8 }} disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save holiday'}</button>
        </div>
      )}
      {rows && !rows.length && !form && <p style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>No holidays recorded.</p>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {upcoming.map(h => <Row key={h.id} h={h} />)}
        {past.slice(0, 5).map(h => <Row key={h.id} h={h} />)}
      </div>
    </div>
  )
}
