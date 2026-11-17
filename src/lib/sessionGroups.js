// Which tracker group a training SESSION belongs to -- by the CLASS it was in (venue / discipline),
// not by the student's own groups. (A PKA child who also does KR has their KR sessions counted as KR.)
// Falls back to the student's groups when a session has no class.
export function classGroups(cls) {
  const n = String(cls?.name || '').toLowerCase(), d = String(cls?.discipline || '').toUpperCase()
  const special = /register/.test(n) && /pts?|leader/.test(n)
  const krba = d === 'KRBA' || /krba|\bboxing\b|\bgb\b/.test(n)
  const derbyMoore = /derby moore/.test(n), moorways = /moorways/.test(n)
  const krCentre = /kr centre/.test(n)
  const pka = d === 'PKA' || derbyMoore || moorways || krCentre
  const kr = !krba && !pka && (d === 'KR' || /\bkr\b/.test(n))
  return { all: !special, pka: pka && !special, krCentrePka: krCentre && !special, derbyMoore, moorways, noClass: false, kr, krba: krba && !special }
}
export function sessionGroups(row, classesById, studentGroupsById) {
  const cls = row.class_id ? classesById[row.class_id] : null
  return cls ? classGroups(cls) : (studentGroupsById?.[row.student_id] || { all: true })
}
export const isTrainingRow = a => a.attendance_type === 'attended' || a.attendance_type === 'full_kit' || !a.attendance_type
