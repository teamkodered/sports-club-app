// 🏆 Awards: categories per group, the current awards year (settings.awards_current)
import { supabase } from './supabase.js'

export const CLASS_CATS = ['Best newcomer', 'Most improved', 'Most committed', 'Student of the year']
export const SQUAD_CATS = ['Best newcomer', 'Most improved', 'Most committed', 'Most determined', 'Coaches fighter', 'Fighters fighter']
export const CLUB_CATS = ['Coaches coach', 'Junior leader', 'Tinys leader', 'Special warrior award', 'Mentions']
export const VOTE_CATS = ['Fighters fighter']

// suggestion hint + how to sort the picker for a category
export function catHint(name) {
  const n = name.toLowerCase()
  if (n.includes('newcomer')) return { hint: 'joined this year', sort: 'joined' }
  if (n.includes('committed')) return { hint: 'most sessions this year', sort: 'sessions' }
  if (n.includes('improved')) return { hint: 'most grades / sessions this year', sort: 'sessions' }
  if (n.includes('student of the year') || n.includes('determined') || n.includes('fighter')) return { hint: 'most points', sort: 'points' }
  return { hint: '', sort: 'name' }
}

export async function loadAwardsCurrent() {
  const { data } = await supabase.from('settings').select('value').eq('key', 'awards_current').maybeSingle()
  const v = data?.value && typeof data.value === 'object' ? data.value : null
  return v || { year: new Date().getFullYear(), close: '', open: false }
}
export async function saveAwardsCurrent(v) {
  return supabase.from('settings').upsert({ key: 'awards_current', value: v }, { onConflict: 'key' })
}
// "Mon/Fri 18:00 KR Centre" (pairs kept as they are in Classes), "Tue 18:30 Moorways"
const dayShort = d => String(d || '').includes('/') ? String(d) : String(d || '').slice(0, 3)
export const classLabel = c => `${dayShort(c.day_of_week)} ${String(c.start_time || '').slice(0, 5)} ${c.name}`.trim()

// classes that run as a pair on two separate days (e.g. KR Centre Wednesday 19:00 + Sunday 12:00) become one
// awards group "Wed/Sun 19:00/12:00 KR Centre"
const PAIRS = [['Wednesday', 'Sunday']]
export function awardGroupsFromClasses(classes) {
  const used = new Set(), out = []
  classes.forEach(c => {
    if (used.has(c.id)) return
    const pair = PAIRS.find(p => p[0] === c.day_of_week)
    const mate = pair && classes.find(x => !used.has(x.id) && x.id !== c.id && x.name === c.name && x.day_of_week === pair[1])
    if (mate) {
      used.add(c.id); used.add(mate.id)
      out.push({ label: `${dayShort(c.day_of_week)}/${dayShort(mate.day_of_week)} ${String(c.start_time || '').slice(0, 5)}/${String(mate.start_time || '').slice(0, 5)} ${c.name}`, ids: [c.id, mate.id] })
    } else if (!classes.some(x => x.id !== c.id && x.name === c.name && PAIRS.some(p => p[1] === c.day_of_week && p[0] === x.day_of_week && !used.has(x.id)))) {
      used.add(c.id); out.push({ label: classLabel(c), ids: [c.id] })
    }
  })
  // anything not placed (a Sunday whose Wednesday came later in the list)
  classes.filter(c => !used.has(c.id)).forEach(c => out.push({ label: classLabel(c), ids: [c.id] }))
  return out
}
export const nominationsOpen = cur => !!cur?.open && (!cur.close || cur.close >= new Date().toISOString().split('T')[0])
