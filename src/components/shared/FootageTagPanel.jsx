import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../../lib/supabase.js'
import { saveFootageAthletes } from '../../lib/fightFootageTags.js'
import { loadCalendarItems, unusedCalendarItems, eventIdForCalendarItem } from '../../lib/footageEvents.js'
import { EVENT_TYPES, eventLabel } from '../../lib/mediaConstants.js'
import AthletePicker from './AthletePicker.jsx'

// 🏷 Tag this video, from inside the View iT player (coaches only): who's in
// the fight and which event it's from. Events: the existing footage events,
// fixtures / club events from the calendar (one tap; reused or created as a
// footage event), or a new one typed in (free write). Who-can-watch is left
// as it is -- if it's "Athletes in this fight", the new tags decide who sees it.
const studentName = s => `${s.members?.first_name || ''} ${s.members?.last_name || ''}`.trim()

export default function FootageTagPanel({ footageId, onClose, onSaved, zIndex = 650 }) {
  const [row, setRow] = useState(null)
  const [students, setStudents] = useState([])
  const [events, setEvents] = useState([])
  const [calendar, setCalendar] = useState([])
  const [featured, setFeatured] = useState(() => new Set())
  const [choice, setChoice] = useState('')   // '' none | event id | 'cal:<key>' | '__new__'
  const [newName, setNewName] = useState('')
  const [newDate, setNewDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [newType, setNewType] = useState('competition')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    (async () => {
      const [{ data: r }, { data: st }, { data: ev }, cal] = await Promise.all([
        supabase.from('fight_footage').select('id, title, event_id, access_mode, fight_footage_featured(student_id), fight_footage_athletes(student_id)').eq('id', footageId).single(),
        supabase.from('students').select('id, members(first_name, last_name)'),
        supabase.from('events').select('id, name, event_type, event_date').order('event_date', { ascending: false }),
        loadCalendarItems().catch(() => []),
      ])
      setRow(r)
      setStudents((st || []).sort((a, b) => studentName(a).localeCompare(studentName(b))))
      setEvents(ev || [])
      setCalendar(cal)
      setFeatured(new Set((r?.fight_footage_featured || []).map(a => a.student_id)))
      setChoice(r?.event_id || '')
    })()
  }, [footageId])

  async function save() {
    setSaving(true)
    try {
      let eventId = choice || null
      if (choice.startsWith('cal:')) {
        const item = calendar.find(i => i.key === choice.slice(4))
        eventId = item ? (await eventIdForCalendarItem(item, events)).id : null
      } else if (choice === '__new__') {
        if (!newName.trim()) { alert('Type a name for the new event.'); return }
        const { data, error } = await supabase.from('events').insert({ name: newName.trim(), event_date: newDate || null, event_type: newType }).select().single()
        if (error) throw error
        eventId = data.id
      }
      const { error } = await supabase.from('fight_footage').update({ event_id: eventId }).eq('id', footageId)
      if (error) throw error
      await saveFootageAthletes(footageId, {
        accessMode: row.access_mode,
        featuredIds: featured,
        viewerIds: new Set((row.fight_footage_athletes || []).map(a => a.student_id)),
      })
      onSaved?.()
      onClose()
    } catch (err) {
      alert('Could not save tags: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  const cal = unusedCalendarItems(calendar, events)
  const fmtDate = d => new Date(String(d).slice(0, 10) + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

  return createPortal(
    <div role="dialog" aria-modal="true" onClick={e => e.stopPropagation()} onPointerDown={e => e.stopPropagation()} onPointerUp={e => e.stopPropagation()}
      style={{ position: 'fixed', inset: 0, zIndex, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div style={{ width: '100%', maxWidth: 520, maxHeight: '88vh', overflowY: 'auto', background: 'var(--bg, #0B0F12)', color: 'var(--text, #fff)', borderRadius: '14px 14px 0 0', padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <h3 style={{ flex: 1, fontSize: 16, fontWeight: 700 }}>🏷 Tag video{row?.title ? ` · ${row.title}` : ''}</h3>
          <button type="button" className="btn btn-sm" onClick={onClose}>✕</button>
        </div>
        {!row ? <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Loading…</p> : (
          <>
            <div className="field">
              <label>Athletes in this fight</label>
              <AthletePicker students={students} studentName={studentName} selected={featured} onChange={setFeatured} maxHeight={170} />
            </div>

            <div className="field">
              <label>Event</label>
              <select value={choice} onChange={e => setChoice(e.target.value)} style={{ width: '100%', fontSize: 15, padding: '10px 12px', borderRadius: 8 }}>
                <option value="">No event</option>
                {events.length > 0 && <optgroup label="Footage events">
                  {events.map(ev => <option key={ev.id} value={ev.id}>{eventLabel(ev)}</option>)}
                </optgroup>}
                {cal.length > 0 && <optgroup label="📅 From the calendar">
                  {cal.map(i => <option key={i.key} value={`cal:${i.key}`}>{i.name} · {fmtDate(i.date)} ({i.source})</option>)}
                </optgroup>}
                <option value="__new__">+ New event (type a name)…</option>
              </select>
              {choice === '__new__' && (
                <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                  <input autoFocus value={newName} onChange={e => setNewName(e.target.value)} placeholder="Event name" style={{ flex: '1 1 200px', fontSize: 15, padding: '10px 12px', borderRadius: 8 }} />
                  <input type="date" value={newDate} onChange={e => setNewDate(e.target.value)} style={{ width: 160, padding: '10px 12px', borderRadius: 8 }} />
                  <select value={newType} onChange={e => setNewType(e.target.value)} style={{ width: 150, padding: '10px 12px', borderRadius: 8 }}>
                    {EVENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
              )}
            </div>

            <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 12 }}>
              {row.access_mode === 'featured' ? 'This video is set to "Athletes in this fight", so the athletes ticked here are the ones who can watch it (once published).' : 'Who can watch this video stays as it is.'}
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="btn" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
              <button type="button" className="btn btn-primary" style={{ flex: 2 }} disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save tags'}</button>
            </div>
          </>
        )}
      </div>
    </div>, document.body)
}
