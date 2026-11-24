import { supabase } from './supabase.js'
import { fetchAll } from './fetchAll.js'

// 📸 Post ideas built from what's already in the app.
// SAFEGUARDING: a person only ever appears if their student record says media consent = 'Yes'
// (blank / No / Limited are all left out). Under-18s -- and anyone whose age isn't known --
// show as first name + initial, and no idea ever includes a venue, school or age.

export const BRANDS = {
  KR:   { label: 'KR',   colour: '#FF3B3B', logo: '/kr-logo.png' },
  PKA:  { label: 'PKA',  colour: '#FFD400', logo: '/images/pka-logo.png' },
  F2F:  { label: 'F2F',  colour: '#39FF88', logo: '/logos/f2f-logo.png' },
  KRBA: { label: 'KRBA', colour: '#2F9BFF', logo: '/logos/krba-logo.png' },
}
const TAGS = '#KRCentre #TeamKodeRed #Derby'

const isoDay = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const ageOf = dob => {
  if (!dob) return null
  const b = new Date(dob + 'T12:00:00'), n = new Date()
  let a = n.getFullYear() - b.getFullYear()
  if (n.getMonth() < b.getMonth() || (n.getMonth() === b.getMonth() && n.getDate() < b.getDate())) a--
  return a
}
export function postName(st) {
  const m = st?.members || {}
  const first = (m.first_name || '').trim(), last = (m.last_name || '').trim()
  const age = ageOf(m.date_of_birth)
  if (age != null && age >= 18) return `${first} ${last}`.trim()
  return `${first}${last ? ' ' + last[0].toUpperCase() + '.' : ''}`   // child or age unknown
}
export const consentOk = st => st?.media_restriction === 'Yes'
const listNames = names => names.length <= 1 ? (names[0] || '') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
const plural = (n, one, many) => (n === 1 ? one : many)

// split people into who can be shown and how many are left out
function pick(ids, byId) {
  const seen = new Set(), people = []
  let hidden = 0
  for (const id of ids) {
    if (!id || seen.has(id)) continue
    seen.add(id)
    const st = byId[id]
    if (st && consentOk(st)) people.push({ id, name: postName(st) })
    else hidden++
  }
  return { people, hidden }
}

export async function loadPostIdeas(days = 30) {
  const today = new Date()
  const since = isoDay(new Date(Date.now() - days * 864e5))
  const todayIso = isoDay(today)

  const [{ data: students }, { data: planned }] = await Promise.all([
    fetchAll(() => supabase.from('students').select('id, media_restriction, discipline, is_kr, members(first_name, last_name, date_of_birth, status, joined_date)').order('id')),
    supabase.from('marketing_posts').select('idea_key').not('idea_key', 'is', null),
  ])
  const byId = Object.fromEntries((students || []).map(s => [s.id, s]))
  const plannedKeys = new Set((planned || []).map(p => p.idea_key))
  const ideas = []
  const add = idea => { if (idea.people.length || idea.allowEmpty) ideas.push({ ...idea, planned: plannedKeys.has(idea.key) }) }

  // 1. Gradings: everyone on a grading list whose grading date has been and gone
  const { data: grads } = await supabase.from('grading_expressions').select('student_id, grading_for, grading_date, discipline')
    .gte('grading_date', since).lte('grading_date', todayIso)
  const gGroups = {}
  ;(grads || []).forEach(g => { const k = `${g.grading_date}|${(g.grading_for || '').trim()}`; (gGroups[k] ||= []).push(g) })
  Object.entries(gGroups).forEach(([k, rows]) => {
    const [date, belt] = k.split('|')
    const { people, hidden } = pick(rows.map(r => r.student_id), byId)
    const brand = rows[0]?.discipline === 'KRBA' ? 'KRBA' : 'PKA'
    const names = people.map(p => p.name)
    add({
      key: `grading:${date}:${belt}`, type: 'grading', icon: '🥋', date, brand, people, hidden,
      title: `New ${belt} ${plural(people.length, 'belt', 'belts')}`,
      headline: `New ${belt} ${plural(people.length, 'belt', 'belts')}`, subline: 'Congratulations!',
      note: 'Check everyone on the list passed before posting.',
      caption: `Huge congratulations to our newest ${belt} ${plural(people.length, 'belt', 'belts')}! 🥋🔥\n\n${listNames(names)} — all that hard work paying off. So proud of you!\n\n${TAGS} #Kickboxing #Grading`,
    })
  })

  // 2. Club awards: the latest year with winners
  const { data: aw } = await supabase.from('awards_categories').select('year, name, winner_name, winner_student_id').not('winner_student_id', 'is', null).order('year', { ascending: false })
  const lastYear = aw?.[0]?.year
  if (lastYear) {
    const rows = aw.filter(a => a.year === lastYear)
    const { people, hidden } = pick(rows.map(r => r.winner_student_id), byId)
    const lines = rows.filter(r => consentOk(byId[r.winner_student_id])).map(r => `🏆 ${r.name}: ${postName(byId[r.winner_student_id])}`)
    add({
      key: `awards:${lastYear}`, type: 'awards', icon: '🏆', date: `${lastYear}-12-31`, brand: 'KR', people, hidden,
      title: `Club award winners ${lastYear}`, headline: `Award winners ${lastYear}`, subline: 'KR Centre club awards',
      caption: `Our ${lastYear} club award winners! 🏆\n\n${lines.join('\n')}\n\nWell deserved, every one of you. ${TAGS} #Awards`,
    })
  }

  // 3. Fight records updated recently
  const { data: rec, error: recErr } = await supabase.from('students').select('id, discipline, wins, losses, draws, record_updated_at')
    .gte('record_updated_at', since).gt('wins', 0)
  if (!recErr) (rec || []).forEach(r => {
    const { people, hidden } = pick([r.id], byId)
    if (!people.length) return
    const w = r.wins || 0, l = r.losses || 0, d = r.draws || 0
    const brand = r.discipline === 'KRBA' ? 'KRBA' : 'KR'
    add({
      key: `record:${r.id}:${String(r.record_updated_at).slice(0, 10)}`, type: 'record', icon: '🥊', date: String(r.record_updated_at).slice(0, 10), brand, people, hidden,
      title: `${people[0].name} — record ${w}-${l}-${d}`, headline: people[0].name, subline: `Record ${w}W ${l}L ${d}D`,
      note: 'Add the event name and result to the caption.',
      caption: `Another one for ${people[0].name}! 🥊🔥 Record now ${w}W ${l}L ${d}D.\n\nProud of the work going in. ${TAGS} #Fight`,
    })
  })

  // 4. Coach-confirmed PBs
  const { data: pbs } = await supabase.from('points_pending').select('student_id, label, detail, decided_at').eq('kind', 'pb').eq('status', 'approved').gte('decided_at', since)
  const okPbs = (pbs || []).filter(p => consentOk(byId[p.student_id]))
  if (okPbs.length) {
    const { people, hidden } = pick((pbs || []).map(p => p.student_id), byId)
    const lines = okPbs.map(p => `💪 ${postName(byId[p.student_id])} — ${p.label.replace(/^PB:\s*/, '').replace(/\s*\(.*\)\s*$/, '')}: ${String(p.detail || '').replace(/\s*\(was.*\)$/, '')}`)
    const last = okPbs.map(p => String(p.decided_at).slice(0, 10)).sort().pop()
    add({
      key: `pbs:${last}`, type: 'pb', icon: '💪', date: last, brand: 'F2F', people, hidden,
      title: `${okPbs.length} new ${plural(okPbs.length, 'PB', 'PBs')}`, headline: 'New PBs', subline: 'Hard work = results',
      caption: `New PBs! 💪📈\n\n${lines.join('\n')}\n\nThe work is working. ${TAGS} #PB #FitIIFight`,
    })
  }

  // 5. Session milestones
  const { data: ms } = await supabase.rpc('kc_session_milestones', { p_days: days })
  const mGroups = {}
  ;(ms || []).forEach(m => { (mGroups[m.milestone] ||= []).push(m) })
  Object.entries(mGroups).forEach(([n, rows]) => {
    const { people, hidden } = pick(rows.map(r => r.student_id), byId)
    const last = rows.map(r => r.reached_on).sort().pop()
    add({
      key: `milestone:${n}:${last}`, type: 'milestone', icon: '🎯', date: last, brand: 'KR', people, hidden,
      title: `${n} sessions club`, headline: `${n} sessions`, subline: 'Consistency is king',
      caption: `${n} sessions! 🎯 Massive well done to ${listNames(people.map(p => p.name))} — turning up week after week is what it's all about.\n\n${TAGS} #Consistency`,
    })
  })

  // 6. New adult members (children are never included in welcome posts)
  const joiners = (students || []).filter(s => s.members?.status === 'active' && s.members?.joined_date >= since && (ageOf(s.members?.date_of_birth) ?? 0) >= 18)
  if (joiners.length) {
    const { people, hidden } = pick(joiners.map(s => s.id), byId)
    const last = joiners.map(s => s.members.joined_date).sort().pop()
    add({
      key: `welcome:${last}`, type: 'welcome', icon: '👋', date: last, brand: 'KR', people, hidden,
      title: `Welcome ${people.length} new ${plural(people.length, 'member', 'members')}`, headline: 'Welcome to the team', subline: 'New members',
      note: 'Adults only. Check they are happy to be welcomed publicly.',
      caption: `A big welcome to our newest members! 👋\n\n${listNames(people.map(p => p.name))} — great to have you with us.\n\nThinking about starting? Message us to book a free trial. ${TAGS}`,
    })
  }

  // 7. Birthdays in the next 7 days (no ages ever shown)
  const soon = []
  for (let i = 0; i < 7; i++) { const d = new Date(today); d.setDate(d.getDate() + i); soon.push(isoDay(d).slice(5)) }
  const bdays = (students || []).filter(s => s.members?.status === 'active' && s.members?.date_of_birth && soon.includes(s.members.date_of_birth.slice(5)))
  if (bdays.length) {
    const { people, hidden } = pick(bdays.map(s => s.id), byId)
    const weekKey = isoDay(today)
    add({
      key: `birthdays:${weekKey.slice(0, 4)}-w${Math.ceil((((today - new Date(today.getFullYear(), 0, 1)) / 864e5) + 1) / 7)}`, type: 'birthday', icon: '🎂', date: todayIso, brand: 'KR', people, hidden,
      title: `${people.length} ${plural(people.length, 'birthday', 'birthdays')} this week`, headline: 'Happy birthday', subline: 'From all at KR',
      caption: `Happy birthday to ${listNames(people.map(p => p.name))}! 🎂🎉 Have a great one from everyone at the club.\n\n${TAGS}`,
    })
  }

  ideas.sort((a, b) => String(b.date).localeCompare(String(a.date)))
  return ideas
}
