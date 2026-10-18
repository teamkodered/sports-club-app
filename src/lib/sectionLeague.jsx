import { useEffect, useState } from 'react'
import { supabasePublic as supabase } from './supabasePublic.js'

// An athlete's place + score in each section's league -- the same numbers as the
// League board's area boards (items logged per area over the League period).
const AREAS = ['mentality', 'technical', 'tactical', 'physical', 'foundation']
const iso = d => d.toISOString().split('T')[0]
let cache = null, cacheAt = 0

async function loadAll() {
  if (cache && Date.now() - cacheAt < 120000) return cache
  const { data: settings } = await supabase.from('settings').select('key,value').in('key', ['league_date_from', 'league_date_to', 'board_date_from', 'board_date_to'])
  const sm = Object.fromEntries((settings || []).map(r => [r.key, r.value]))
  const now = new Date(), today = iso(now)
  const bFrom = sm.board_date_from || sm.league_date_from
  const bTo = sm.board_date_from ? sm.board_date_to : sm.league_date_to
  const from = bFrom || iso(new Date(now.getFullYear(), now.getMonth(), 1, 12))
  const to = bTo ? (bTo < today ? bTo : today) : today
  const { data: tasks } = await supabase.rpc('public_f2f_tasks', { p_from: from, p_to: to })
  const out = {}
  for (const a of AREAS) {
    const list = (tasks || []).map(r => ({ id: r.student_id, v: Number(r[a]) || 0 })).filter(r => r.v > 0).sort((x, y) => y.v - x.v)
    let rank = 0, prev = null
    out[a] = Object.fromEntries(list.map((r, i) => { if (r.v !== prev) { rank = i + 1; prev = r.v } return [r.id, { rank, score: r.v, of: list.length }] }))
  }
  cache = out; cacheAt = Date.now()
  return out
}

export function useSectionLeague(studentId) {
  const [pos, setPos] = useState({})
  useEffect(() => {
    if (!studentId) return
    let stop = false
    loadAll().then(all => { if (!stop) setPos(Object.fromEntries(AREAS.map(a => [a, all[a]?.[studentId] || null]))) }).catch(() => {})
    return () => { stop = true }
  }, [studentId])
  return pos
}

const ord = n => n + (['th', 'st', 'nd', 'rd'][(n % 100 - 20) % 10] || ['th', 'st', 'nd', 'rd'][n % 100] || 'th')
// small badge after a section title: "3rd · 24"
export function LeaguePos({ p, big, open }) {
  // no entries yet this period: show a dash so the place is still there
  if (!p) p = { rank: null, score: 0, of: 0 }
  return (
    <span className={(big ? 'neon-league-pos neon-league-big' : 'neon-league-pos') + (open ? ' neon-league-open' : '')} title={p.rank ? `League: ${ord(p.rank)} of ${p.of} · ${p.score} done` : 'Nothing logged in this section yet this league period'}>
      <span className="neon-league-rank">{p.rank ? ord(p.rank) : '–'}</span>
    </span>
  )
}
