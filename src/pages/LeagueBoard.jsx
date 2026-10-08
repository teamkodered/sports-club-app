import { useEffect, useMemo, useRef, useState } from 'react'
import { supabasePublic as supabase } from '../lib/supabasePublic.js'
import { CATEGORIES, buildLeaderboard, maskName } from './ResultsPublic.jsx'

// Combined League board (Oct 2026) -- public display (/results-public) and the
// athlete app's league tile. Rotates through: house standings, house points
// (top individuals), most tasks completed (KR + KRBA: overall + each area),
// exercise PBs and most notes. House + individual boards use the same scoring
// and admin settings as the main public league (dates, top-N); task + exercise
// boards use board_topn, rotation speed board_seconds.
// Period: app = League / Month switch; public display = auto-alternates each
// full cycle (league totals, then this month), with buttons to fix either.

const HOUSE_COLOUR = { 'Dragon House': '#E24B4A', 'Super House': '#F5821F', 'Ice House': '#378ADD', 'Jet House': '#22B14C' }
const HOUSE_TEXT = { 'Dragon House': '/logos/text-dragon.png', 'Super House': '/logos/text-super.png', 'Ice House': '/logos/text-ice.png', 'Jet House': '/logos/text-jet.png' }
const HOUSE_LOGO = { 'Dragon House': '/logos/house-dragon.png', 'Super House': '/logos/house-super.png', 'Ice House': '/logos/house-ice.png', 'Jet House': '/logos/house-jet.png' }
const AREAS = [
  { key: 'all', label: 'Most tasks completed', colour: '#FFFFFF', icon: '/logos/f2f-logo-red.png' },
  { key: 'mentality', label: 'Mentality', colour: '#22B14C', icon: '/logos/icon-mentality.png' },
  { key: 'technical', label: 'Technical', colour: '#2F6BFF', icon: '/logos/icon-technical.png' },
  { key: 'tactical', label: 'Tactical', colour: '#FF2A2A', icon: '/logos/icon-tactical.png' },
  { key: 'physical', label: 'Physical', colour: '#E6B800', icon: '/logos/icon-physical.png' },
  { key: 'foundation', label: 'Foundation', colour: '#C93BFF', icon: '/logos/icon-foundation.png' },
]
const TITLE = { fontFamily: "'Saira Condensed', sans-serif", fontStyle: 'italic', fontWeight: 800, letterSpacing: 1, lineHeight: 1, textTransform: 'uppercase' }
const NUM = { fontFamily: 'Orbitron, sans-serif' }
const iso = d => d.toISOString().split('T')[0]
const num = v => Number(v) || 0
// Overall = questions completed per day (same rule in every area); area boards = items logged
const taskValue = (r, k) => k === 'all' ? (r.questions != null ? num(r.questions) : num(r.physical) + num(r.technical) + num(r.tactical) + num(r.mentality) + num(r.foundation)) : num(r[k])

async function fetchAllRows(build) {
  const out = []; const size = 1000
  for (let from = 0; ; from += size) {
    const { data, error } = await build().range(from, from + size - 1)
    if (error) throw error
    out.push(...(data || []))
    if (!data || data.length < size) break
  }
  return out
}

async function loadPeriod(from, to) {
  const args = { p_from: from, p_to: to + 'T23:59:59' }
  let pts = []
  const probe = await supabase.rpc('kc_public_league_points', args).range(0, 0)
  if (!probe.error) pts = await fetchAllRows(() => supabase.rpc('kc_public_league_points', args))
  else {
    // same fallback as the main public league: read the points directly when the points function isn't there
    try { pts = await fetchAllRows(() => supabase.from('points_log').select('points_awarded, point_scope, student_id').gte('awarded_at', from).lte('awarded_at', to + 'T23:59:59')) } catch { pts = [] }
  }
  const { data: studs } = await supabase.rpc('public_league_students')
  const sm = Object.fromEntries((studs || []).map(s => [s.id, s]))
  const indiv = {}, houses = {}
  for (const r of pts) {
    const s = sm[r.student_id]; if (!s) continue
    indiv[r.student_id] = indiv[r.student_id] || { id: r.student_id, name: maskName(s.first_name, s.last_name), house: s.house_name || '', total: 0, housePts: 0 }
    indiv[r.student_id].total += r.points_awarded || 0
    if (r.point_scope === 'house' || r.point_scope === 'both') indiv[r.student_id].housePts += r.points_awarded || 0
    if (s.house_name && (r.point_scope === 'house' || r.point_scope === 'both')) houses[s.house_name] = (houses[s.house_name] || 0) + (r.points_awarded || 0)
  }
  const { data: tasks, error: tErr } = await supabase.rpc('public_f2f_tasks', { p_from: from, p_to: to })
  const krIds = new Set((tErr ? [] : tasks || []).map(t => t.student_id))
  const { data: notesP, error: nErr } = await supabase.rpc('public_notes_period', { p_from: from, p_to: to })
  return {
    houses: Object.keys(HOUSE_COLOUR).map(n => ({ name: n, points: houses[n] || 0 })).concat(Object.keys(houses).filter(n => !HOUSE_COLOUR[n]).map(n => ({ name: n, points: houses[n] })))
      .sort((a, b) => b.points - a.points),
    // house points board: KR + KRBA athletes only (all students if the tasks function isn't set up yet)
    individuals: Object.values(indiv).filter(x => x.total > 0 && (krIds.size === 0 || krIds.has(x.id))).sort((a, b) => b.total - a.total),
    tasks: tErr ? [] : (tasks || []),
    notes: nErr ? null : (notesP || []), // null = function not set up yet -> all-time notes
  }
}

function Row({ rank, name, sub, subColour, value, unit, colour, me }) {
  const medal = rank <= 3 ? ['#F5C542', '#C0C4CC', '#CD7F32'][rank - 1] : null
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 6, background: '#1A1F24',
      border: me ? `1px solid ${colour}` : '1px solid #2A3138', boxShadow: me ? `0 0 10px ${colour}66` : 'none' }}>
      <span style={{ ...NUM, width: 26, textAlign: 'center', fontSize: 13, color: medal || '#9A9A9A', textShadow: medal ? `0 0 6px ${medal}` : 'none' }}>{rank}</span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontFamily: 'Rajdhani, sans-serif', fontWeight: 700, fontSize: 16, color: '#FFFFFF', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}{me ? ' (you)' : ''}</span>
        {sub && <span style={{ display: 'block', ...NUM, fontSize: 8, letterSpacing: 1.5, color: subColour || '#9A9A9A' }}>{String(sub).toUpperCase()}</span>}
      </span>
      <span style={{ ...NUM, fontSize: 16, color: colour, textShadow: `0 0 6px ${colour}66` }}>{value}<span style={{ fontSize: 9, color: '#9A9A9A', marginLeft: 3 }}>{unit}</span></span>
    </div>
  )
}

export default function LeagueBoard({ embedded = false, student = null, onBack }) {
  const [cfg, setCfg] = useState({ from: null, to: null, topHouse: 10, topIndiv: 10, topBoard: 10, seconds: 8, club: 'KR Centre' })
  const [data, setData] = useState({ league: null, month: null })
  const [exRows, setExRows] = useState([])
  const [notesRows, setNotesRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [periodMode, setPeriodMode] = useState(embedded ? 'league' : 'auto') // auto | league | month
  const [cycle, setCycle] = useState(0)
  const [idx, setIdx] = useState(0)
  const [paused, setPaused] = useState(false)
  const pauseTimer = useRef(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const { data: settings } = await supabase.from('settings').select('key,value')
        .in('key', ['club_name', 'league_date_from', 'league_date_to', 'league_topn_house', 'league_topn_individual', 'board_topn', 'board_seconds', 'board_date_from', 'board_date_to', 'board_topn_house'])
      const sm = Object.fromEntries((settings || []).map(r => [r.key, r.value]))
      const now = new Date(), today = iso(now)
      // League period: the board's own dates (League page -> League board), else the main league's, else this month.
      // A finished period stays frozen at its end date.
      const bFrom = sm.board_date_from || sm.league_date_from
      const bTo = sm.board_date_from ? sm.board_date_to : sm.league_date_to
      const from = bFrom || iso(new Date(now.getFullYear(), now.getMonth(), 1, 12))
      const to = bTo ? (bTo < today ? bTo : today) : today
      const monthFrom = iso(new Date(now.getFullYear(), now.getMonth(), 1, 12))
      const c = { from, to, monthFrom, today, club: sm.club_name || 'KR Centre',
        topHouse: parseInt(sm.board_topn_house) || parseInt(sm.league_topn_house) || 10, // board's own 'show top per house', else the main league's topIndiv: parseInt(sm.league_topn_individual) || 10,
        topBoard: parseInt(sm.board_topn) || 10, seconds: parseInt(sm.board_seconds) || 8 }
      const [league, month, ex, notes] = await Promise.all([
        loadPeriod(from, to), loadPeriod(monthFrom, today),
        supabase.from('public_results_leaderboard').select('*'), supabase.rpc('public_notes_leaderboard'),
      ])
      if (cancelled) return
      setCfg(c); setData({ league, month }); setExRows(ex.data || []); setNotesRows(notes.data || []); setLoading(false)
    }
    load().catch(() => setLoading(false))
    return () => { cancelled = true }
  }, [])

  const period = periodMode === 'auto' ? (cycle % 2 === 0 ? 'league' : 'month') : periodMode
  const pd = data[period]
  const periodLabel = period === 'league'
    ? `League · ${cfg.from ? new Date(cfg.from + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : ''} – ${cfg.to ? new Date(cfg.to + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : ''}`
    : `This month · ${new Date().toLocaleDateString('en-GB', { month: 'long' })}`

  const slides = useMemo(() => {
    if (!pd) return []
    const out = []
    if (pd.houses.some(h => h.points > 0)) out.push({ kind: 'houses' })
    if (pd.individuals.length) out.push({ kind: 'individuals' })
    for (const a of AREAS) if (pd.tasks.some(r => taskValue(r, a.key) > 0)) out.push({ kind: 'tasks', area: a })
    for (const cat of CATEGORIES) if (!cat.aggregate && buildLeaderboard(cat, exRows, cfg.topBoard).length) out.push({ kind: 'exercise', cat })
    if ((pd.notes ? pd.notes.length : notesRows.length)) out.push({ kind: 'notes' })
    return out
  }, [pd, exRows, notesRows, cfg.topBoard])

  // rotation; a full cycle flips the period when on auto
  useEffect(() => {
    if (paused || slides.length === 0) return
    const t = setInterval(() => setIdx(i => { const n = i + 1; if (n >= slides.length) { setCycle(c => c + 1); return 0 } return n }), cfg.seconds * 1000)
    return () => clearInterval(t)
  }, [paused, slides.length, cfg.seconds])
  const slideKey = sl => !sl ? '' : sl.kind === 'tasks' ? `tasks:${sl.area.key}` : sl.kind === 'exercise' ? `ex:${sl.cat.key}` : sl.kind
  const lastKeyRef = useRef('')
  useEffect(() => {
    // when the slide list changes (e.g. League period <-> This month) stay on the same board if it exists
    const i = slides.findIndex(sl => slideKey(sl) === lastKeyRef.current)
    if (i >= 0) { if (i !== idx) setIdx(i) } else if (idx >= slides.length) setIdx(0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slides])
  useEffect(() => { lastKeyRef.current = slideKey(slides[idx]) }, [idx, slides])

  function interact() { setPaused(true); clearTimeout(pauseTimer.current); pauseTimer.current = setTimeout(() => setPaused(false), 30000) }
  const go = d => { interact(); setIdx(i => (i + d + slides.length) % Math.max(1, slides.length)) }
  const swipe = useRef(null)

  const s = slides[idx]
  const meId = student?.id
  const ranked = (list, valueOf) => {
    let rank = 0, prev = null
    return list.map((r, i) => { const v = valueOf(r); if (v !== prev) { rank = i + 1; prev = v } return { ...r, v, rank } })
  }

  function Board() {
    if (!s) return <p style={{ color: '#9A9A9A', textAlign: 'center', marginTop: 40 }}>Nothing to show yet.</p>
    if (s.kind === 'houses') {
      const max = Math.max(1, ...pd.houses.map(h => h.points))
      return (
        <Slide title="House standings" colour="#F5C542">
          {pd.houses.map((h, i) => {
            const c = HOUSE_COLOUR[h.name] || '#9A9A9A'
            return (
              <div key={h.name} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 6, background: '#1A1F24', border: `1px solid ${h.name === student?.house_name ? c : '#2A3138'}` }}>
                <span style={{ ...NUM, width: 22, color: i === 0 ? '#F5C542' : '#9A9A9A' }}>{i + 1}</span>
                <span style={{ flex: 1 }}>
                  {HOUSE_TEXT[h.name] ? <img src={HOUSE_TEXT[h.name]} alt={h.name} style={{ height: 30, width: 'auto', objectFit: 'contain', display: 'block' }} /> : <span style={{ ...TITLE, display: 'block', fontSize: 22, color: c }}>{h.name}</span>}
                  <span style={{ display: 'block', height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.08)', marginTop: 6 }}><span style={{ display: 'block', width: `${(h.points / max) * 100}%`, height: '100%', borderRadius: 2, background: c, boxShadow: `0 0 6px ${c}` }} /></span>
                </span>
                <span style={{ ...NUM, fontSize: 20, color: '#fff' }}>{Math.round(h.points)}</span>
              </div>
            )
          })}
        </Slide>
      )
    }
    if (s.kind === 'individuals') {
      // Same layout as the main league's "By house": four columns side by side, house text
      // logo + house total at the top, then that house's athletes (KR + KRBA only here)
      // totals here are KR + KRBA only (the House standings board keeps the full house scoring)
      const krTotal = h => pd.individuals.filter(r => r.house === h).reduce((n, r) => n + (r.housePts || 0), 0)
      const order = [...new Set([...Object.keys(HOUSE_COLOUR), ...pd.individuals.map(r => r.house).filter(Boolean)])].sort((a, b) => krTotal(b) - krTotal(a))
      const extra = []
      const medals = ['🥇', '🥈', '🥉']
      return (
        <Slide title="House points" colour="#F5C542" sub="KR + KRBA">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 6 }}>
            {[...order, ...extra].map((h, hIdx) => {
              const c = HOUSE_COLOUR[h] || '#9A9A9A'
              const total = krTotal(h)
              const list = pd.individuals.filter(r => r.house === h)
              const top = list.slice(0, cfg.topHouse)
              const myIdx = list.findIndex(r => r.id === meId)
              return (
                <div key={h} style={{ background: '#1A1F24', border: '1px solid #2A3138', borderTop: `3px solid ${c}`, borderRadius: 6, overflow: 'hidden', minWidth: 0 }}>
                  <div style={{ padding: '8px 6px', borderBottom: '1px solid #2A3138', textAlign: 'center' }}>
                    <div style={{ ...NUM, fontSize: 9, color: '#9A9A9A' }}>{hIdx + 1}</div>
                    {HOUSE_TEXT[h] ? <img src={HOUSE_TEXT[h]} alt={h} style={{ height: 20, maxWidth: '100%', objectFit: 'contain', display: 'block', margin: '2px auto' }} /> : <div style={{ ...TITLE, fontSize: 13, color: c }}>{h}</div>}
                    <div style={{ ...NUM, fontSize: 14, color: c, textShadow: `0 0 6px ${c}66` }}>{Math.round(total)}</div>
                    <div style={{ ...NUM, fontSize: 7, letterSpacing: 1, color: '#9A9A9A' }}>PTS</div>
                  </div>
                  {top.length === 0 ? <div style={{ padding: 8, fontSize: 11, color: '#666', textAlign: 'center' }}>—</div> : top.map((r, i) => (
                    <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '5px 5px', borderBottom: '1px solid #20262c', background: r.id === meId ? c + '33' : i < 3 ? c + '10' : 'transparent' }}>
                      <span style={{ width: 16, textAlign: 'center', fontSize: i < 3 ? 12 : 10, color: '#9A9A9A', flexShrink: 0 }}>{medals[i] || i + 1}</span>
                      <span style={{ flex: 1, minWidth: 0, fontSize: 11, fontWeight: i < 3 ? 700 : 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.name}</span>
                      <span style={{ ...NUM, fontSize: 10, color: c, flexShrink: 0 }}>{r.total}</span>
                    </div>
                  ))}
                  {myIdx >= cfg.topHouse && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '5px 5px', background: c + '33' }}>
                      <span style={{ width: 16, textAlign: 'center', fontSize: 10, color: '#9A9A9A' }}>{myIdx + 1}</span>
                      <span style={{ flex: 1, minWidth: 0, fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{list[myIdx].name}</span>
                      <span style={{ ...NUM, fontSize: 10, color: c }}>{list[myIdx].total}</span>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </Slide>
      )
    }
    if (s.kind === 'tasks') {
      const a = s.area
      const list = ranked(pd.tasks.map(r => ({ ...r, val: taskValue(r, a.key) })).filter(r => r.val > 0).sort((x, y) => y.val - x.val), r => r.val)
      const top = list.slice(0, cfg.topBoard), me = list.find(r => r.student_id === meId)
      const col = a.key === 'all' ? '#FF2A2A' : a.colour
      return (
        <Slide title={a.key === 'all' ? 'Most questions completed' : `${a.label} · most completed`} colour={col} icon={a.icon} sub={a.key === 'all' ? 'KR + KRBA · 1 per question, test or note per day' : 'KR + KRBA'}>
          {top.map(r => <Row key={r.student_id} rank={r.rank} name={r.display_name} sub={r.house_name} subColour={HOUSE_COLOUR[r.house_name]} value={r.val} unit={a.key === 'all' ? 'QS' : 'DONE'} colour={col} me={r.student_id === meId} />)}
          {me && !top.includes(me) && <><div style={{ textAlign: 'center', color: '#666' }}>···</div><Row rank={me.rank} name={me.display_name} sub={me.house_name} value={me.val} unit="DONE" colour={col} me /></>}
        </Slide>
      )
    }
    if (s.kind === 'exercise') {
      const cat = s.cat, list = buildLeaderboard(cat, exRows, cfg.topBoard)
      return (
        <Slide title={cat.label.replace(/^\S+\s/, '')} colour={cat.colour} emoji={cat.label.split(' ')[0]} sub="Personal bests" fixedPeriod>
          {list.map((r, i) => <Row key={r.name + i} rank={i + 1} name={r.name} sub={r.sub} value={r.value} unit={cat.unit} colour={cat.colour} />)}
        </Slide>
      )
    }
    const notes = (pd.notes ? pd.notes.map(r => ({ name: r.display_name, value: Number(r.notes_count) || 0 })) : notesRows.map(r => ({ name: maskName(r.first_name, r.last_name), value: r.notes_count }))).sort((a, b) => b.value - a.value).slice(0, cfg.topBoard)
    return <Slide title="Most notes" colour="#9A9A9A" emoji="📝" fixedPeriod={!pd.notes}>{notes.map((r, i) => <Row key={r.name + i} rank={i + 1} name={r.name} value={r.value} unit="NOTES" colour="#C0C4CC" />)}</Slide>
  }

  function Slide({ title, colour, icon, emoji, sub, fixedPeriod, children }) {
    return (
      <div key={idx + ':' + period} style={{ animation: 'lbFade 0.4s ease' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          {icon ? <img src={icon} alt="" style={{ width: 40, height: 40, objectFit: 'contain' }} /> : emoji ? <span style={{ fontSize: 30 }}>{emoji}</span> : null}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ ...TITLE, fontSize: 28, color: colour, textShadow: `0 0 10px ${colour}66` }}>{title}</div>
            <div style={{ ...NUM, fontSize: 9, letterSpacing: 2, color: '#9A9A9A', marginTop: 4 }}>{(fixedPeriod ? 'ALL TIME' : periodLabel).toUpperCase()}{sub ? ` · ${sub.toUpperCase()}` : ''}</div>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>{children}</div>
      </div>
    )
  }

  const chip = (on, label, onClick, colour = '#F5C542') => (
    <button type="button" onClick={onClick} aria-pressed={on} style={{ height: 30, padding: '0 12px', border: 'none', cursor: 'pointer', clipPath: 'polygon(8px 0, 100% 0, calc(100% - 8px) 100%, 0 100%)', background: on ? colour : '#2A3138', color: on ? '#0A0A0A' : '#F2F2F2', ...TITLE, fontSize: 14 }}>{label}</button>
  )

  return (
    <div onPointerDown={interact}
      onTouchStart={e => { swipe.current = { x: e.touches[0].clientX, y: e.touches[0].clientY } }}
      onTouchEnd={e => { const c = swipe.current; swipe.current = null; if (!c) return; const dx = e.changedTouches[0].clientX - c.x, dy = e.changedTouches[0].clientY - c.y; if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) go(dx < 0 ? 1 : -1) }}
      style={{ background: '#000', color: '#F2F2F2', minHeight: '100vh', margin: embedded ? '-20px -16px' : 0, padding: embedded ? '20px 16px 40px' : '20px 16px 40px', boxSizing: 'border-box' }}>
      <style>{'@keyframes lbFade { from { opacity: 0; transform: translateY(6px) } to { opacity: 1; transform: none } }'}</style>
      <div style={{ maxWidth: 640, margin: '0 auto' }}>
        {embedded && onBack && <button onClick={onBack} className="btn btn-sm" style={{ marginBottom: 12 }}>← Back to Home</button>}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 14 }}>
          <img src="/logos/kr-dragon.gif" alt="KR" style={{ height: 48, width: 'auto' }} />
          <img src="/logos/f2f-logo-red.png" alt="Fit II Fight" style={{ height: 48, width: 'auto', filter: 'drop-shadow(0 0 8px rgba(255,42,42,0.5))' }} />
          <img src="/logos/krba-logo.png" alt="KRBA" style={{ height: 44, width: 'auto' }} />
        </div>
        <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
          {!embedded && chip(periodMode === 'auto', 'AUTO', () => setPeriodMode('auto'))}
          {chip(period === 'league' && periodMode !== 'auto', 'LEAGUE PERIOD', () => setPeriodMode('league'))}
          {chip(period === 'month' && periodMode !== 'auto', 'THIS MONTH', () => setPeriodMode('month'))}
          {periodMode === 'auto' && <span style={{ ...NUM, fontSize: 9, letterSpacing: 1.5, color: '#9A9A9A', alignSelf: 'center' }}>NOW: {period === 'league' ? 'LEAGUE' : 'THIS MONTH'}</span>}
        </div>
        {slides.length > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, marginBottom: 12 }}>
            <button type="button" onClick={() => go(-1)} style={{ background: 'none', border: '1px solid #2A3138', color: '#F2F2F2', borderRadius: 6, width: 40, height: 36, cursor: 'pointer' }}>‹</button>
            <span style={{ ...NUM, fontSize: 11, color: '#9A9A9A' }}>{idx + 1} / {slides.length}{paused ? ' · paused' : ''}</span>
            <button type="button" onClick={() => go(1)} style={{ background: 'none', border: '1px solid #2A3138', color: '#F2F2F2', borderRadius: 6, width: 40, height: 36, cursor: 'pointer' }}>›</button>
          </div>
        )}
        {loading ? <p style={{ color: '#9A9A9A' }}>Loading league…</p> : <Board />}
      </div>
    </div>
  )
}
