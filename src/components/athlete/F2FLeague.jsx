import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase.js'

// FIIF League -- a fresh, read-only league for KR + KRBA athletes in the
// athlete app. Uses the same league period (settings league_date_from /
// league_date_to) and the same house scoring as the club league; nothing
// here writes or changes any points. Data: f2f_league / f2f_league_houses RPCs.

const HOUSE = { 'Dragon House': '#E24B4A', 'Super House': '#F5821F', 'Ice House': '#378ADD', 'Jet House': '#22B14C' }
const houseColour = n => HOUSE[n] || '#9A9A9A'
const TITLE = { fontFamily: "'Saira Condensed', sans-serif", fontStyle: 'italic', fontWeight: 800, letterSpacing: 1, lineHeight: 1 }
const NUM = { fontFamily: 'Orbitron, sans-serif' }

const F2F_METRICS = [
  { key: 'all', label: 'All', colour: '#FFFFFF' },
  { key: 'physical', label: 'Physical', colour: '#E6B800' },
  { key: 'technical', label: 'Technical', colour: '#2F6BFF' },
  { key: 'tactical', label: 'Tactical', colour: '#FF2A2A' },
  { key: 'mentality', label: 'Mentality', colour: '#22B14C' },
  { key: 'foundation', label: 'Foundation', colour: '#C93BFF' },
  { key: 'days_logged', label: 'Days', colour: '#C0C4CC' },
]
const metricValue = (r, key) => key === 'all'
  ? Number(r.physical) + Number(r.technical) + Number(r.tactical) + Number(r.mentality) + Number(r.foundation)
  : Number(r[key] || 0)

function Chip({ on, colour = '#C0C4CC', onClick, children }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on} style={{
      height: 32, padding: '0 14px', border: 'none', cursor: 'pointer', flexShrink: 0,
      clipPath: 'polygon(8px 0, 100% 0, calc(100% - 8px) 100%, 0 100%)',
      background: on ? colour : '#2A3138', color: on ? '#0A0A0A' : '#F2F2F2', ...TITLE, fontSize: 15,
    }}>{children}</button>
  )
}

function Row({ rank, name, sub, value, unit, colour, me }) {
  const medal = rank <= 3 ? ['#F5C542', '#C0C4CC', '#CD7F32'][rank - 1] : null
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 6, background: '#1A1F24',
      border: me ? `1px solid ${colour}` : '1px solid #2A3138', boxShadow: me ? `0 0 10px ${colour}66` : 'none' }}>
      <span style={{ ...NUM, width: 26, textAlign: 'center', fontSize: 13, color: medal || '#9A9A9A', textShadow: medal ? `0 0 6px ${medal}` : 'none' }}>{rank}</span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontFamily: 'Rajdhani, sans-serif', fontWeight: 700, fontSize: 15, color: '#FFFFFF', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}{me ? ' (you)' : ''}</span>
        {sub && <span style={{ display: 'block', ...NUM, fontSize: 8, letterSpacing: 1.5, color: houseColour(sub) }}>{sub.toUpperCase()}</span>}
      </span>
      <span style={{ ...NUM, fontSize: 16, color: colour, textShadow: `0 0 6px ${colour}66` }}>{value}<span style={{ fontSize: 9, color: '#9A9A9A', marginLeft: 3 }}>{unit}</span></span>
    </div>
  )
}

export default function F2FLeague({ student, onBack }) {
  const [view, setView] = useState('houses') // houses | points | f2f
  const [metric, setMetric] = useState('all')
  const [scope, setScope] = useState('all') // all | house
  const [rows, setRows] = useState([])
  const [houses, setHouses] = useState([])
  const [range, setRange] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true); setError(null)
      try {
        // Same league period as the club league (settings), falling back to this month
        const { data: settings } = await supabase.from('settings').select('key,value').in('key', ['league_date_from', 'league_date_to'])
        const sm = Object.fromEntries((settings || []).map(r => [r.key, r.value]))
        const now = new Date()
        const todayStr = now.toISOString().split('T')[0]
        const from = sm.league_date_from || new Date(now.getFullYear(), now.getMonth(), 1, 12).toISOString().split('T')[0]
        const to = (sm.league_date_to && sm.league_date_to >= todayStr) ? sm.league_date_to : todayStr
        const [lg, hs] = await Promise.all([
          supabase.rpc('f2f_league', { p_from: from, p_to: to }),
          supabase.rpc('f2f_league_houses', { p_from: from, p_to: to }),
        ])
        if (lg.error) throw lg.error
        if (hs.error) throw hs.error
        if (cancelled) return
        setRange({ from, to })
        setRows(lg.data || [])
        const byHouse = Object.fromEntries((hs.data || []).map(h => [h.house_name, Number(h.house_points) || 0]))
        setHouses(Object.keys(HOUSE).map(n => ({ name: n, points: byHouse[n] || 0 }))
          .concat((hs.data || []).filter(h => !HOUSE[h.house_name]).map(h => ({ name: h.house_name, points: Number(h.house_points) || 0 })))
          .sort((a, b) => b.points - a.points))
      } catch (e) {
        if (!cancelled) setError(e.message || String(e))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  const myHouse = student?.house_name || rows.find(r => r.student_id === student?.id)?.house_name
  const fmtD = ds => new Date(ds + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

  function ranked(valueOf) {
    const pool = scope === 'house' && myHouse ? rows.filter(r => r.house_name === myHouse) : rows
    const list = pool.map(r => ({ ...r, v: valueOf(r) })).filter(r => r.v > 0 || r.student_id === student?.id)
      .sort((a, b) => b.v - a.v || String(a.display_name).localeCompare(String(b.display_name)))
    let rank = 0, prev = null
    return list.map((r, i) => { if (r.v !== prev) { rank = i + 1; prev = r.v } return { ...r, rank } })
  }

  function RankedList({ list, unit, colour }) {
    const top = list.slice(0, 10)
    const me = list.find(r => r.student_id === student?.id)
    if (!list.length) return <p style={{ color: '#9A9A9A', fontSize: 13 }}>No entries yet in this league period.</p>
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {top.map(r => <Row key={r.student_id} rank={r.rank} name={r.display_name} sub={r.house_name} value={Math.round(r.v)} unit={unit} colour={colour} me={r.student_id === student?.id} />)}
        {me && !top.includes(me) && (
          <>
            <div style={{ textAlign: 'center', color: '#666', letterSpacing: 4 }}>···</div>
            <Row rank={me.rank} name={me.display_name} sub={me.house_name} value={Math.round(me.v)} unit={unit} colour={colour} me />
          </>
        )}
      </div>
    )
  }

  const m = F2F_METRICS.find(x => x.key === metric)
  const maxHouse = Math.max(1, ...houses.map(h => h.points))

  return (
    <div style={{ background: '#000', margin: '-20px -16px', padding: '20px 16px 40px', minHeight: '100vh', color: '#F2F2F2' }}>
      <button onClick={onBack} className="btn btn-sm" style={{ marginBottom: 14 }}>← Back to Home</button>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
        <img src="/logos/f2f-logo-red.png" alt="Fit II Fight" style={{ height: 52, width: 'auto', filter: 'drop-shadow(0 0 8px rgba(255,42,42,0.6))' }} />
        <div>
          <div style={{ ...TITLE, fontSize: 34, color: '#FFFFFF', textShadow: '0 0 10px rgba(255,42,42,0.55)' }}>FIIF LEAGUE</div>
          {range && <div style={{ ...NUM, fontSize: 9, letterSpacing: 2, color: '#9A9A9A', marginTop: 4 }}>{fmtD(range.from).toUpperCase()} – {fmtD(range.to).toUpperCase()}</div>}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6, margin: '16px 0 12px' }}>
        <Chip on={view === 'houses'} colour="#C0C4CC" onClick={() => setView('houses')}>HOUSES</Chip>
        <Chip on={view === 'points'} colour="#F5C542" onClick={() => setView('points')}>HOUSE POINTS</Chip>
        <Chip on={view === 'f2f'} colour="#FF2A2A" onClick={() => setView('f2f')}>F2F</Chip>
      </div>

      {loading ? (
        <p style={{ color: '#9A9A9A' }}>Loading league…</p>
      ) : error ? (
        <div style={{ padding: 14, borderRadius: 6, background: '#1A1F24', border: '1px solid #2A3138', fontSize: 13, color: '#CFCFCF' }}>
          The league couldn't load ({error}). If it's brand new, the one-time database update (supabase_f2f_league.sql) may not have been run yet.
        </div>
      ) : view === 'houses' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {houses.map((h, i) => {
            const c = houseColour(h.name), mine = h.name === myHouse
            return (
              <div key={h.name} style={{ padding: '12px 14px', borderRadius: 6, background: '#1A1F24', border: `1px solid ${mine ? c : '#2A3138'}`, boxShadow: mine ? `0 0 12px ${c}66` : 'none' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  <span style={{ ...NUM, fontSize: 14, width: 22, color: i === 0 ? '#F5C542' : '#9A9A9A' }}>{i + 1}</span>
                  <span style={{ ...TITLE, fontSize: 22, color: c, flex: 1, textShadow: `0 0 8px ${c}88` }}>{h.name.replace(/ House$/, '').toUpperCase()} <span style={{ fontSize: 14, color: '#FFFFFF' }}>HOUSE</span>{mine ? <span style={{ ...NUM, fontStyle: 'normal', fontSize: 8, letterSpacing: 1.5, color: '#9A9A9A', marginLeft: 8 }}>YOURS</span> : null}</span>
                  <span style={{ ...NUM, fontSize: 18, color: '#FFFFFF' }}>{Math.round(h.points)}</span>
                </div>
                <div style={{ height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.08)' }}>
                  <div style={{ width: `${(h.points / maxHouse) * 100}%`, height: '100%', borderRadius: 2, background: c, boxShadow: `0 0 6px ${c}` }} />
                </div>
              </div>
            )
          })}
          <p style={{ fontSize: 11, color: '#666', marginTop: 4 }}>Same house scoring as the club league, for the current league period.</p>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
            <Chip on={scope === 'all'} onClick={() => setScope('all')}>KR + KRBA</Chip>
            {myHouse && <Chip on={scope === 'house'} colour={houseColour(myHouse)} onClick={() => setScope('house')}>MY HOUSE</Chip>}
          </div>
          {view === 'f2f' && (
            <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 6, marginBottom: 8 }}>
              {F2F_METRICS.map(x => <Chip key={x.key} on={metric === x.key} colour={x.colour} onClick={() => setMetric(x.key)}>{x.label.toUpperCase()}</Chip>)}
            </div>
          )}
          {view === 'points'
            ? <RankedList list={ranked(r => Number(r.house_points) || 0)} unit="PTS" colour="#F5C542" />
            : <RankedList list={ranked(r => metricValue(r, metric))} unit={metric === 'days_logged' ? 'DAYS' : 'DONE'} colour={m.colour === '#FFFFFF' ? '#FF2A2A' : m.colour} />}
          <p style={{ fontSize: 11, color: '#666', marginTop: 10 }}>
            {view === 'points' ? 'House points each athlete earned this league period.' : 'Questions answered and exercises logged in F2F this league period.'}
          </p>
        </>
      )}

      <div style={{ display: 'flex', gap: 14, marginTop: 24, fontSize: 12 }}>
        <a href="/league-public?limit=10" style={{ color: '#9A9A9A' }}>Club house league ↗</a>
        <a href="/results-public" style={{ color: '#9A9A9A' }}>Exercise leaderboards ↗</a>
      </div>
    </div>
  )
}
