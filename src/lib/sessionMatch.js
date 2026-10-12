import { DAY_TO_JS_DAYS } from './attendanceDays.js'

// Wearable workout <-> timetable class matching (Whoop etc).
// A workout is "club training" if its sport is one we coach AND its time overlaps a class
// (15 min leeway either side). Anything else is an "other session" -- recorded, not attendance.
export const CLUB_SPORT_RE = /box|kickbox|martial|mma|muay|thai|functional|power ?lift|fight|combat|jiu|judo|karate|taekwon/i
export const isClubSport = name => CLUB_SPORT_RE.test(name || '')

const mins = t => { if (!t) return null; const [h, m] = String(t).split(':').map(Number); return h * 60 + (m || 0) }
const localDate = d => { const x = new Date(d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}` }
export const workoutDate = w => localDate(w.start_time)
export const workoutRange = w => {
  const s = new Date(w.start_time)
  const e = w.end_time ? new Date(w.end_time) : new Date(s.getTime() + (w.duration_seconds || 3600) * 1000)
  return { s, e, startMin: s.getHours() * 60 + s.getMinutes(), endMin: e.getHours() * 60 + e.getMinutes() + (localDate(e) !== localDate(s) ? 1440 : 0) }
}
export const fmtTime = d => d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })

// Does this class run on the workout's day and overlap its time?
export function classOverlaps(cls, w, leeway = 15) {
  if (!cls || !w?.start_time) return false
  const day = new Date(w.start_time).getDay()
  if (!(DAY_TO_JS_DAYS[cls.day_of_week] || []).includes(day)) return false
  const cs = mins(cls.start_time), ce = mins(cls.end_time) ?? (cs != null ? cs + 60 : null)
  if (cs == null) return false
  const { startMin, endMin } = workoutRange(w)
  return startMin < ce + leeway && endMin > cs - leeway
}

// The first class (from a list) this workout matches, if it's a club sport
export function matchClass(w, classes) {
  if (!isClubSport(w?.sport_name)) return null
  return (classes || []).find(c => classOverlaps(c, w)) || null
}
