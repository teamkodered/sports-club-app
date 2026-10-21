// Enquiries: ⭐ what they're interested in (a group) and 📅 their free intro session.
export const INTEREST_GROUPS = ['Tiny Tots', 'Juniors', 'Adults', 'Ladies', 'Boxing']

// a group guessed from the enquiry's notes (Facebook form, website enquiry, booking) -- shown as a guess
export function guessInterest(enq) {
  const n = `${enq?.notes || ''}`
  if (/\b(tiny|tinys|tots)\b/i.test(n)) return 'Tiny Tots'
  if (/\b(ladies|women only)\b/i.test(n)) return 'Ladies'
  if (/\b(boxing|krba)\b/i.test(n) && !/kickboxing/i.test(n)) return 'Boxing'
  if (/\b(kids?|junior|juniors|jnr|small soldiers|jedi|child|children)\b/i.test(n)) return 'Juniors'
  if (/\b(adults?|mixed|men|14\+|16\+|senior)\b/i.test(n)) return 'Adults'
  return null
}
export const interestOf = enq => enq?.interest_group ? { group: enq.interest_group, guessed: false } : (guessInterest(enq) ? { group: guessInterest(enq), guessed: true } : null)

// the next date (on/after `from`) that falls on `dayName` (Monday…Sunday)
const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
export function nextDateForDay(dayName, from = new Date()) {
  const want = DAYS.findIndex(d => d.startsWith(String(dayName || '').trim().toLowerCase().slice(0, 3)))
  if (want < 0) return null
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate())
  d.setDate(d.getDate() + ((want - d.getDay() + 7) % 7))
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export const VENUE_ADDRESS = {
  'The KR Centre': 'The KR Centre\nKedleston House\nAspen Drive\nSpondon\nDerby\nDE21 7SS',
}
export const venueOfClass = name => /derby moore/i.test(name || '') ? 'Derby Moore' : /moorway/i.test(name || '') ? 'Moorways' : 'The KR Centre'
const fmtTime = t => { if (!t) return ''; const [h, m] = String(t).split(':').map(Number); const h12 = ((h + 11) % 12) + 1; return `${h12}${m ? '.' + String(m).padStart(2, '0') : ''}${h < 12 ? 'am' : 'pm'}` }

// everything a message needs about the intro session
export function introOf(enq, classes = []) {
  if (!enq?.intro_date && !enq?.intro_class_id && !enq?.intro_label) return null
  const cls = classes.find(c => c.id === enq.intro_class_id)
  const date = enq.intro_date ? new Date(enq.intro_date + 'T12:00:00') : null
  let time = cls ? fmtTime(cls.start_time) : ''
  if (!time && enq.intro_label) { const m = enq.intro_label.match(/(\d{1,2})[.:](\d{2})/); if (m) time = fmtTime(`${m[1]}:${m[2]}`) }
  const venue = cls ? venueOfClass(cls.name) : (/derby moore/i.test(enq.intro_label || '') ? 'Derby Moore' : /moorway/i.test(enq.intro_label || '') ? 'Moorways' : 'The KR Centre')
  return {
    date: date ? date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }) : '',
    day: date ? date.toLocaleDateString('en-GB', { weekday: 'long' }) : (cls?.day_of_week || ''),
    time, venue, address: VENUE_ADDRESS[venue] || venue,
    className: cls?.name || (enq.intro_label || '').split(',')[0] || '',
    short: [date ? date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) : '', time, venue].filter(Boolean).join(' · '),
  }
}
