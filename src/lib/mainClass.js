// The student's MAIN class (their usual lesson, from the student record: class + time) first, then other
// PKA classes, then extras (KR, PTs / Leader, projects...).
const norm = t => String(t || '').slice(0, 5)
export function classRank(c, student) {
  const sched = String(student?.class_schedule || '').toLowerCase(), time = norm(student?.class_time)
  const day = String(c?.day_of_week || '').toLowerCase(), name = String(c?.name || '').toLowerCase()
  const timeOk = !time || norm(c?.start_time) === time
  if (sched && timeOk && (day === sched || name.includes(sched))) return 0
  if (/kr centre|derby moore|moorways/.test(name) && !/register/.test(name)) return 1
  return 2
}
export function mainFirst(classes, student) {
  return [...(classes || [])].sort((a, b) => classRank(a, student) - classRank(b, student))
}
