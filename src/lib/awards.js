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
export const classLabel = c => `${String(c.day_of_week || '').slice(0, 3)} ${String(c.start_time || '').slice(0, 5)} ${c.name}`.trim()
export const nominationsOpen = cur => !!cur?.open && (!cur.close || cur.close >= new Date().toISOString().split('T')[0])
