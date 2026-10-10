import { useState } from 'react'

// Which venue a join form is for. A link can carry it (?venue=derby-moore) -- set by
// the share window -- so the applicant isn't asked; otherwise the form asks once.
export const VENUES = [
  { key: 'kr-centre',   label: 'KR Centre (Spondon)' },
  { key: 'derby-moore', label: 'Derby Moore' },
  { key: 'moorways',    label: 'Moorways' },
]
// What's stored: students.class_schedule uses 'Derby Moore' / 'Moorways' for those venues
// (KR Centre students get their class/day from the coach as before)
export const venueSchedule = key => key === 'derby-moore' ? 'Derby Moore' : key === 'moorways' ? 'Moorways' : null
export const venueLabel = key => VENUES.find(v => v.key === key)?.label || null

export function useJoinVenue() {
  const fromLink = (() => {
    try { const v = new URLSearchParams(window.location.search).get('venue'); return VENUES.some(x => x.key === v) ? v : null } catch { return null }
  })()
  const [venue, setVenue] = useState(fromLink)
  return { venue, setVenue, fromLink }
}

export function VenueQuestion({ venue, setVenue, fromLink }) {
  if (fromLink) return null   // the link already says where -- don't ask
  return (
    <div className="field">
      <label>Where will you train? <span className="required">*</span></label>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {VENUES.map(v => (
          <button key={v.key} type="button" onClick={() => setVenue(v.key)}
            style={{ padding: '9px 14px', borderRadius: 10, fontSize: 14, cursor: 'pointer', fontFamily: 'var(--font-sans)',
              border: `2px solid ${venue === v.key ? '#E24B4A' : 'var(--border-strong)'}`, background: venue === v.key ? '#E24B4A14' : 'var(--bg)',
              color: 'var(--text)', fontWeight: venue === v.key ? 700 : 400 }}>{v.label}</button>
        ))}
      </div>
    </div>
  )
}
