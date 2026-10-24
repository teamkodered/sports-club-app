import { supabase } from './supabase.js'

// Calendar items (fixtures + club events) offered as one-tap event choices when
// uploading or tagging fight footage. Footage still links to the `events` table:
// picking a calendar item reuses the footage event with the same name and date,
// or creates it. Typing a new event (free write) still works as before.

export async function loadCalendarItems() {
  const from = new Date(Date.now() - 180 * 864e5).toISOString().slice(0, 10)
  const to = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10)
  const [fx, ce] = await Promise.all([
    supabase.from('fixtures').select('id, title, date').gte('date', from).lte('date', to),
    supabase.from('club_events').select('id, title, event_date').gte('event_date', from).lte('event_date', to),
  ])
  const items = [
    ...(fx.data || []).filter(f => f.title && f.date).map(f => ({ key: `fx:${f.id}`, name: f.title.trim(), date: String(f.date).slice(0, 10), source: 'Fixture' })),
    ...(ce.data || []).filter(e => e.title && e.event_date).map(e => ({ key: `ce:${e.id}`, name: e.title.trim(), date: String(e.event_date).slice(0, 10), source: 'Club event' })),
  ]
  // newest first; drop exact duplicates (same name + date in both tables)
  const seen = new Set()
  return items.sort((a, b) => b.date.localeCompare(a.date)).filter(i => {
    const k = `${i.name.toLowerCase()}|${i.date}`
    if (seen.has(k)) return false
    seen.add(k); return true
  })
}

// The footage event (events row) matching a calendar item, if one exists already.
export function matchingEvent(item, events) {
  return (events || []).find(ev => ev.name?.trim().toLowerCase() === item.name.toLowerCase() && String(ev.event_date || '').slice(0, 10) === item.date)
}

// Calendar items not yet used as a footage event (so they aren't listed twice).
export function unusedCalendarItems(items, events) {
  return (items || []).filter(i => !matchingEvent(i, events))
}

// Returns the events.id for a calendar item, creating the footage event if needed.
export async function eventIdForCalendarItem(item, events, type = 'competition') {
  const existing = matchingEvent(item, events)
  if (existing) return { id: existing.id, created: null }
  const { data, error } = await supabase.from('events').insert({ name: item.name, event_date: item.date, event_type: type }).select().single()
  if (error) throw error
  return { id: data.id, created: data }
}
