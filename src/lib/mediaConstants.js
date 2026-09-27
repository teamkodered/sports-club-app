// Shared between Media.jsx, Uploads.jsx, and ViewIt.jsx -- kept in
// their own file rather than exported from Media.jsx itself, since
// Uploads/ViewIt already import things back from Media.jsx and having
// Media.jsx also export constants those files need would make that a
// circular import.

// Full flat list of every belt name used across all PKA age bands --
// this tag is just for categorising a clip's technique level, not tied
// to any specific student's own age-banded progression, so one flat
// list covering everything is simplest.
export const ALL_GRADES = ['Red', 'Yellow', 'Yellow tag', 'Orange', 'Orange tag', 'Green', 'Green tag', 'Blue', 'Blue tag', 'Purple', 'Purple tag', 'Brown', 'Brown tag', 'Black']

export const EVENT_TYPES = [
  { value: 'competition', label: 'Competition' },
  { value: 'grading', label: 'Grading' },
  { value: 'training', label: 'Training' },
  { value: 'other', label: 'Other' },
]

// Who can watch a fight_footage clip. 'featured' = the athletes tagged as
// being in the fight (fight_footage_featured); 'select_athletes' = a
// separate hand-picked viewer list (fight_footage_athletes).
export const FOOTAGE_ACCESS_MODES = [
  { value: 'coach_only', label: 'Coach only' },
  { value: 'featured', label: 'Athletes in this fight' },
  { value: 'select_athletes', label: 'Specific athletes' },
  { value: 'all', label: 'Whole team' },
]

export function footageAccessLabel(item) {
  if (item.access_mode === 'select_athletes') {
    const n = item.fight_footage_athletes?.length || 0
    return `${n} athlete${n === 1 ? '' : 's'}`
  }
  return FOOTAGE_ACCESS_MODES.find(m => m.value === item.access_mode)?.label || item.access_mode
}

export function eventLabel(ev) {
  if (!ev.event_date) return ev.name
  return `${ev.name} · ${new Date(ev.event_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`
}
