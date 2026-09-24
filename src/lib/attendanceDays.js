// Shared attendance rules -- used by the attendance calendar popup and the
// Registers "Attendance %" column so the two always agree.

export const DAY_TO_JS_DAYS = {
  Monday: [1], Tuesday: [2], Wednesday: [3], Thursday: [4], Friday: [5], Saturday: [6], Sunday: [0],
  'Mon/Fri': [1, 5], 'Tue/Thu': [2, 4],
}

// A date is a holiday for this student if a club-wide holiday, one of their
// individual holidays, or per-class holidays for every class due that day
// cover it.
export function isDateOnHoliday(dateStr, holidays, classIds, studentId) {
  if (holidays.some(h => !h.class_id && !h.student_id && h.start_date <= dateStr && h.end_date >= dateStr)) return true
  if (studentId && holidays.some(h => h.student_id === studentId && h.start_date <= dateStr && h.end_date >= dateStr)) return true
  if (!classIds || classIds.length === 0) return false
  return classIds.every(cid => holidays.some(h => h.class_id === cid && h.start_date <= dateStr && h.end_date >= dateStr))
}

const pad = n => String(n).padStart(2, '0')
export const toLocalISO = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const isAttendedType = t => t !== 'absent' && t !== 'excused'

// Classes (assignment rows with .classes) due for this student on a date.
export function classesDueOn(dateStr, assignments, holidays, studentId) {
  const jsDay = new Date(dateStr + 'T12:00:00').getDay()
  return assignments.filter(a =>
    (DAY_TO_JS_DAYS[a.classes?.day_of_week] || []).includes(jsDay) &&
    !isDateOnHoliday(dateStr, holidays, a.classes?.id ? [a.classes.id] : [], studentId))
}

// A student's own attendance rate over [from, to], counted by day exactly as
// the calendar colours them:
//   attended = any attendance row that day (not absent/excused)
//   missed   = marked absent, or a class was due (not holiday) with no
//              attendance and not cleared, on a day before today
// rows: that student's attendance rows { session_date, attendance_type }.
// Returns { attended, missed, pct } -- pct is null when nothing was due.
export function ownAttendanceRate({ rows, assignments, holidays, studentId, from, to, today }) {
  const byDate = {}
  rows.forEach(r => {
    if (!r.session_date) return
    const e = (byDate[r.session_date] ||= { attended: false, absent: false, excused: false })
    if (r.attendance_type === 'absent') e.absent = true
    else if (r.attendance_type === 'excused') e.excused = true
    else e.attended = true
  })
  let attended = 0, missed = 0
  const counted = new Set()
  const tally = dateStr => {
    if (counted.has(dateStr)) return
    counted.add(dateStr)
    const e = byDate[dateStr]
    if (e?.attended) { attended++; return }
    if (e?.absent) { missed++; return }
    if (e?.excused) return
    if (dateStr < today && classesDueOn(dateStr, assignments, holidays, studentId).length > 0) missed++
  }
  // Every date with a record, plus every scheduled date in range
  Object.keys(byDate).forEach(d => { if ((!from || d >= from) && (!to || d <= to)) tally(d) })
  if (assignments.length && from) {
    const end = to && to < today ? to : today
    for (let d = new Date(from + 'T12:00:00'); toLocalISO(d) <= end; d.setDate(d.getDate() + 1)) tally(toLocalISO(d))
  }
  const denom = attended + missed
  return { attended, missed, pct: denom ? Math.round((attended / denom) * 100) : null }
}
