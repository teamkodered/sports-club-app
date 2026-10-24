import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase.js'
import { fetchAll } from '../../lib/fetchAll.js'

// Calendar -> 🏆 Events strip: current + upcoming events (competitions, gradings, shows…) as cards.
// Tap one to see / edit it and the athletes entered; "+ Add athletes" opens a hidden list of
// KR and KRBA athletes with type-to-search. Old house-v-house fixtures show as "Dragon v Ice".
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const fmt = (d, o = { weekday: 'short', day: 'numeric', month: 'short' }) => d ? new Date(d + 'T12:00:00').toLocaleDateString('en-GB', o) : ''
export const eventTitle = f => f?.title || (f?.home_house?.name || f?.away_house?.name ? `${f.home_house?.name || '?'} v ${f.away_house?.name || '?'}` : 'Event')

export default function EventsStrip({ fixtures = [], canEdit = false, onChanged }) {
  const [entries, setEntries] = useState({})      // fixture id -> [student ids]
  const [athletes, setAthletes] = useState(null)  // KR + KRBA athletes (loaded when needed)
  const [open, setOpen] = useState(null)          // the event being viewed / edited (null = closed, {} = new)
  const [picker, setPicker] = useState(false)
  const [q, setQ] = useState('')
  const [showPast, setShowPast] = useState(false)
  const today = iso(new Date())

  const list = useMemo(() => fixtures
    .filter(f => showPast ? (f.end_date || f.date) < today : (f.end_date || f.date) >= today)
    .sort((a, b) => showPast ? String(b.date).localeCompare(String(a.date)) : String(a.date).localeCompare(String(b.date))), [fixtures, showPast, today])

  useEffect(() => {
    const ids = list.map(f => f.id); if (!ids.length) return
    supabase.from('fixture_athletes').select('fixture_id, student_id').in('fixture_id', ids)
      .then(({ data, error }) => {
        if (error) return
        const m = {}; (data || []).forEach(r => { (m[r.fixture_id] ||= []).push(r.student_id) }); setEntries(prev => ({ ...prev, ...m }))
      })
  }, [list.map(f => f.id).join(',')])

  async function loadAthletes() {
    if (athletes) return
    const { data } = await fetchAll(() => supabase.from('students').select('id, discipline, is_kr, photo_url, members!inner(first_name, last_name, status)').order('id'))
    setAthletes((data || []).filter(s => (s.is_kr || s.discipline === 'KRBA') && s.members?.status !== 'stopped')
      .sort((a, b) => `${a.members.first_name} ${a.members.last_name}`.localeCompare(`${b.members.first_name} ${b.members.last_name}`)))
  }
  const nameOf = id => { const s = (athletes || []).find(a => a.id === id); return s ? `${s.members.first_name} ${s.members.last_name}` : '…' }

  async function openEvent(f) { setOpen({ ...f }); setPicker(false); setQ(''); loadAthletes() }
  async function saveEvent() {
    const f = open
    if (!f.title?.trim() || !f.date) return alert('Give the event a name and a date.')
    const row = { title: f.title.trim(), date: f.date, end_date: f.end_date || null, venue: f.venue || null, notes: f.notes || null }
    const r = f.id ? await supabase.from('fixtures').update(row).eq('id', f.id).select().single()
      : await supabase.from('fixtures').insert({ ...row, status: 'scheduled' }).select().single()
    if (r.error) return alert('Could not save: ' + r.error.message + (/title|end_date|notes|null value/.test(r.error.message) ? '\n\n(Has supabase_events.sql been run?)' : ''))
    setOpen(o => ({ ...o, ...r.data })); onChanged && onChanged()
  }
  async function deleteEvent() {
    if (!window.confirm(`Delete "${eventTitle(open)}"?`)) return
    await supabase.from('fixtures').delete().eq('id', open.id); setOpen(null); onChanged && onChanged()
  }
  async function toggleAthlete(sid) {
    if (!open?.id) return alert('Save the event first, then add athletes.')
    const on = (entries[open.id] || []).includes(sid)
    setEntries(prev => ({ ...prev, [open.id]: on ? (prev[open.id] || []).filter(x => x !== sid) : [...(prev[open.id] || []), sid] }))
    const r = on ? await supabase.from('fixture_athletes').delete().eq('fixture_id', open.id).eq('student_id', sid)
      : await supabase.from('fixture_athletes').insert({ fixture_id: open.id, student_id: sid })
    if (r.error) alert('Could not update: ' + r.error.message)
  }

  const entered = open?.id ? (entries[open.id] || []) : []
  const ql = q.trim().toLowerCase()
  const pickList = (athletes || []).filter(a => !ql || `${a.members.first_name} ${a.members.last_name}`.toLowerCase().includes(ql))

  return (
    <div className="ev-strip-wrap">
      <div className="ev-strip-head">
        <b>🏆 Events</b>
        <span style={{ display: 'flex', gap: 6 }}>
          <button className="btn btn-sm" onClick={() => setShowPast(v => !v)}>{showPast ? 'Upcoming' : 'Past'}</button>
          {canEdit && <button className="btn btn-sm btn-primary" onClick={() => { setOpen({ title: '', date: today, end_date: '', venue: '', notes: '' }); setPicker(false) }}>+ Add event</button>}
        </span>
      </div>
      <div className="ev-strip">
        {!list.length && <div className="ev-empty">{showPast ? 'No past events.' : 'No upcoming events.'}</div>}
        {list.map(f => {
          const now = f.date <= today && (f.end_date || f.date) >= today
          return (
            <button key={f.id} type="button" className={`ev-card${now ? ' now' : ''}`} onClick={() => openEvent(f)}>
              <span className="ev-date">{now ? 'ON NOW' : fmt(f.date)}{f.end_date && f.end_date !== f.date ? ` – ${fmt(f.end_date, { day: 'numeric', month: 'short' })}` : ''}</span>
              <b>{eventTitle(f)}</b>
              {f.venue && <span className="ev-venue">📍 {f.venue}</span>}
              <span className="ev-count">👥 {(entries[f.id] || []).length} athlete{(entries[f.id] || []).length === 1 ? '' : 's'}</span>
            </button>
          )
        })}
      </div>

      {open && (
        <div className="ets-backdrop" onClick={() => setOpen(null)}>
          <div className="ets-sheet" style={{ maxWidth: 520 }} onClick={e => e.stopPropagation()} role="dialog" aria-label="Event">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <b style={{ fontSize: 16 }}>🏆 {open.id ? eventTitle(open) : 'New event'}</b>
              <button className="btn btn-sm" onClick={() => setOpen(null)}>Close</button>
            </div>
            {canEdit ? (
              <div className="ev-form">
                <input value={open.title || ''} onChange={e => setOpen(o => ({ ...o, title: e.target.value }))} placeholder="Event name, e.g. British Championships" />
                <div style={{ display: 'flex', gap: 8 }}>
                  <label>From<input type="date" value={open.date || ''} onChange={e => setOpen(o => ({ ...o, date: e.target.value }))} /></label>
                  <label>To (optional)<input type="date" value={open.end_date || ''} min={open.date || undefined} onChange={e => setOpen(o => ({ ...o, end_date: e.target.value }))} /></label>
                </div>
                <input value={open.venue || ''} onChange={e => setOpen(o => ({ ...o, venue: e.target.value }))} placeholder="Venue" />
                <textarea rows={2} value={open.notes || ''} onChange={e => setOpen(o => ({ ...o, notes: e.target.value }))} placeholder="Notes (weigh-in time, entry deadline…)" />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-primary" onClick={saveEvent}>{open.id ? 'Save changes' : 'Save event'}</button>
                  {open.id && <button className="btn" onClick={deleteEvent}>Delete</button>}
                </div>
              </div>
            ) : (
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8 }}>
                {fmt(open.date, { weekday: 'long', day: 'numeric', month: 'long' })}{open.venue ? ` · ${open.venue}` : ''}{open.notes ? <div style={{ marginTop: 4 }}>{open.notes}</div> : null}
              </div>
            )}

            {open.id && (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>Athletes entered ({entered.length})</div>
                <div className="ev-chips">
                  {!entered.length && <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Nobody yet.</span>}
                  {entered.map(sid => (
                    <span key={sid} className="ev-chip">{nameOf(sid)}{canEdit && <button type="button" onClick={() => toggleAthlete(sid)} aria-label={`Remove ${nameOf(sid)}`}>×</button>}</span>
                  ))}
                </div>
                {canEdit && (
                  <>
                    <button className="btn btn-sm" style={{ marginTop: 8 }} onClick={() => { setPicker(v => !v); loadAthletes() }}>{picker ? '▾ Hide athletes' : '+ Add athletes'}</button>
                    {picker && (
                      <div className="ev-picker">
                        <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="🔍 Type a name — KR & KRBA athletes" />
                        <div className="ev-pick-list">
                          {athletes === null && <div className="ev-empty">Loading…</div>}
                          {athletes && !pickList.length && <div className="ev-empty">No match.</div>}
                          {pickList.map(a => {
                            const on = entered.includes(a.id)
                            return (
                              <button key={a.id} type="button" className={on ? 'on' : ''} onClick={() => toggleAthlete(a.id)}>
                                <span>{on ? '✓' : '+'}</span> {a.members.first_name} {a.members.last_name}
                                <em>{a.discipline === 'KRBA' ? 'KRBA' : 'KR'}</em>
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
