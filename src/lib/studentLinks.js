// Returns the right profile URL for a student: their Athlete Profile if
// they're a KR/PTs/KRBA athlete, otherwise their Membership (Student
// Database) profile. Used throughout the app so names link consistently.
export function studentProfileLink(s) {
  if (!s) return null
  const isAthlete = s.is_kr || s.is_pts || s.discipline === 'KRBA'
  return isAthlete ? `/athletes?id=${s.id}` : `/students?id=${s.id}`
}
