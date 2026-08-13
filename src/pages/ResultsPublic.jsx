import { useEffect, useState } from 'react'
import { supabasePublic as supabase } from '../lib/supabasePublic.js'

function maskName(first, last) {
  if (!first) return '—'
  const lastInitial = last ? last[0].toUpperCase() + '.' : ''
  return `${first} ${lastInitial}`
}

function toEntries(val) {
  if (Array.isArray(val)) return val
  if (val && typeof val === 'object' && Object.keys(val).length > 0) return [val]
  return []
}

function normalizeIntervalMode(raw) {
  if (!raw) return ''
  const s = String(raw).toLowerCase()
  if (s.includes('sprint')) return 'Sprints'
  if (s.includes('steady')) return 'Steady state'
  if (s.includes('fixed')) return 'Fixed intervals'
  return raw
}

function setValues(sets) {
  return (sets || []).map(v => (v && typeof v === 'object') ? (v.wattage ?? v.value ?? 0) : (typeof v === 'number' ? v : parseFloat(v) || 0))
}

// Each category: how to build one "best value" entry per athlete from
// the public_results_leaderboard rows. Weight is deliberately not
// included anywhere here -- it's excluded from what's shared publicly.
const CATEGORIES = [
  {
    key: 'watt_bike', label: '🚴 Watt Bike', unit: 'W', colour: '#378ADD',
    extract: r => toEntries(r.watt_bike).map(e => ({ value: Math.max(...setValues(e.sets), e.max_wattage || 0), sub: normalizeIntervalMode(e.interval_mode || e.type) })),
  },
  {
    // Running is logged as a time -- lower is better (a faster run wins).
    key: 'running', label: '🏃 Running', unit: '', colour: '#1D9E75', lowerIsBetter: true,
    extract: r => toEntries(r.running).map(e => ({ value: Math.max(...setValues(e.sets), 0), sub: e.category || e.test || 'Running' })),
  },
  {
    key: 'bodyweight', label: '💪 Bodyweight', unit: ' reps', colour: '#EF9F27',
    extract: r => toEntries(r.bodyweight).map(e => ({ value: Math.max(...setValues(e.sets), 0), sub: e.type || 'Bodyweight' })),
  },
  {
    key: 'techniques', label: '🥋 Techniques', unit: ' reps', colour: '#E24B4A',
    extract: r => toEntries(r.techniques).map(e => ({ value: (e.sets || []).reduce((a, b) => a + (parseFloat(b) || 0), 0), sub: e.type || 'Techniques' })),
  },
  {
    key: 'bleep', label: '🏃 Bleep Test', unit: '', colour: '#8B5CF6',
    extract: r => Object.entries(r.test || {}).filter(([k]) => k.toLowerCase().includes('bleep')).map(([, v]) => ({ value: parseFloat(v) || 0, sub: 'Bleep Test' })),
  },
  {
    key: 'grip', label: '✊ Grip Test', unit: '', colour: '#059669',
    extract: r => Object.entries(r.test || {}).filter(([k]) => k.toLowerCase().includes('grip')).map(([, v]) => ({ value: parseFloat(v) || 0, sub: 'Grip Test' })),
  },
  {
    // Fixed Load Circuit is logged as a completion time -- lower is
    // better (faster through the circuit wins).
    key: 'circuit', label: '⭕ Fixed Load Circuit', unit: '', colour: '#DC2626', lowerIsBetter: true,
    extract: r => Object.entries(r.test || {}).filter(([k]) => k.toLowerCase().includes('fixed load circuit')).map(([, v]) => ({ value: parseFloat(v) || 0, sub: 'Fixed Load Circuit' })),
  },
]

const AUTO_SCROLL_SECONDS = 8

// Best value per athlete for a category, plus the final ranking order --
// both respect lowerIsBetter (e.g. a faster running/circuit time is the
// "best" value to keep per athlete, and ranks first, not last).
function buildLeaderboard(cat, rows) {
  const perAthlete = {}
  rows.forEach(r => {
    const name = maskName(r.first_name, r.last_name)
    cat.extract(r).forEach(({ value, sub }) => {
      if (!value) return
      const better = cat.lowerIsBetter ? value < perAthlete[name]?.value : value > perAthlete[name]?.value
      if (!perAthlete[name] || better) perAthlete[name] = { name, value, sub }
    })
  })
  return Object.values(perAthlete)
    .sort((a, b) => cat.lowerIsBetter ? a.value - b.value : b.value - a.value)
    .slice(0, 10)
}

export default function ResultsPublic() {
  const [rows, setRows] = useState([])
  const [clubName, setClubName] = useState('KR Centre')
  const [clubEmoji, setClubEmoji] = useState('🔥')
  const [loading, setLoading] = useState(true)
  const [activeIdx, setActiveIdx] = useState(0)
  const [paused, setPaused] = useState(false)

  useEffect(() => {
    async function load() {
      const [{ data: settings }, { data: leaderboardRows }] = await Promise.all([
        supabase.from('settings').select('key,value').in('key', ['club_name', 'club_emoji']),
        supabase.from('public_results_leaderboard').select('*'),
      ])
      const sm = Object.fromEntries((settings || []).map(r => [r.key, r.value]))
      if (sm.club_name) setClubName(sm.club_name)
      if (sm.club_emoji) setClubEmoji(sm.club_emoji)
      setRows(leaderboardRows || [])
      setLoading(false)
    }
    load()
  }, [])

  // Only categories with at least one real result are shown at all --
  // an empty "No results logged yet" page would just be dead air on an
  // unattended display.
  const categoriesWithData = CATEGORIES.filter(cat => buildLeaderboard(cat, rows).length > 0)

  // Auto-scroll through each category leaderboard in turn, pausing
  // while the visitor is actively interacting with it -- meant to run
  // unattended on a shared/TV display otherwise.
  useEffect(() => {
    if (paused || categoriesWithData.length === 0) return
    const t = setInterval(() => setActiveIdx(i => (i + 1) % categoriesWithData.length), AUTO_SCROLL_SECONDS * 1000)
    return () => clearInterval(t)
  }, [paused, categoriesWithData.length])

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-tertiary)' }}>
      <div className="loading">Loading results…</div>
    </div>
  )

  if (categoriesWithData.length === 0) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-tertiary)', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontSize: 40 }}>{clubEmoji}</div>
      <h1 style={{ fontSize: 20, fontWeight: 700 }}>{clubName}</h1>
      <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>No results logged yet — check back soon.</p>
    </div>
  )

  const safeIdx = activeIdx % categoriesWithData.length
  const cat = categoriesWithData[safeIdx]
  const leaderboard = buildLeaderboard(cat, rows)
  const MEDALS = ['🥇', '🥈', '🥉', '🎖️']

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-tertiary)', padding: '24px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}
      onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}
      onTouchStart={() => setPaused(true)}>
      <div style={{ maxWidth: 560, width: '100%', margin: '0 auto' }}>
        <button onClick={() => window.history.back()} className="btn btn-sm" style={{ marginBottom: 14 }}>← Back</button>
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>{clubEmoji}</div>
          <h1 style={{ fontSize: 22, fontWeight: 700 }}>{clubName}</h1>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>Results leaderboard</p>
        </div>

        <div key={cat.key} className="card" style={{
          borderTop: `4px solid ${cat.colour}`, animation: 'resultsFadeIn 0.5s ease',
        }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: cat.colour, textAlign: 'center', marginBottom: 16 }}>{cat.label}</h2>
          {leaderboard.length === 0 ? (
            <p style={{ textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13, padding: '20px 0' }}>No results logged yet</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {leaderboard.map((row, i) => (
                <div key={row.name + i} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '8px 12px', borderRadius: 8, background: i === 0 ? cat.colour + '15' : 'var(--bg-secondary)',
                }}>
                  <span style={{ fontSize: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 24, textAlign: 'center' }}>{MEDALS[i] || i + 1}</span>
                    {row.name}
                    <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{row.sub}</span>
                  </span>
                  <span style={{ fontSize: 15, fontWeight: 700, color: cat.colour }}>{row.value}{cat.unit}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Dots + manual arrows -- also pause auto-scroll while used */}
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 10, marginTop: 16 }}>
          <button onClick={() => { setPaused(true); setActiveIdx(i => (i - 1 + categoriesWithData.length) % categoriesWithData.length) }}
            style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--text-tertiary)' }}>◀</button>
          {categoriesWithData.map((c, i) => (
            <button key={c.key} onClick={() => { setPaused(true); setActiveIdx(i) }}
              style={{ width: 8, height: 8, borderRadius: '50%', border: 'none', cursor: 'pointer', background: i === safeIdx ? cat.colour : 'var(--border-strong)', padding: 0 }} />
          ))}
          <button onClick={() => { setPaused(true); setActiveIdx(i => (i + 1) % categoriesWithData.length) }}
            style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--text-tertiary)' }}>▶</button>
        </div>
        {paused && (
          <p style={{ textAlign: 'center', fontSize: 11, color: 'var(--text-tertiary)', marginTop: 8 }}>
            Auto-scroll paused — <button onClick={() => setPaused(false)} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', textDecoration: 'underline', cursor: 'pointer', fontSize: 11, padding: 0 }}>resume</button>
          </p>
        )}

        <p style={{ textAlign: 'center', fontSize: 11, color: 'var(--text-tertiary)', marginTop: 16 }}>
          Share this page: {typeof window !== 'undefined' ? window.location.href : ''}
        </p>
      </div>
      <style>{`@keyframes resultsFadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }`}</style>
    </div>
  )
}
