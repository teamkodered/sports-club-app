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
