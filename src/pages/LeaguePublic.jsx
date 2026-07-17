import { useEffect, useState } from 'react'
import { supabasePublic as supabase } from '../lib/supabasePublic.js'

const HOUSE_COLOURS = {
  'Dragon House': '#E24B4A', 'Super House': '#378ADD',
  'Ice House': '#1D9E75', 'Jet House': '#EF9F27',
}

function maskName(first, last) {
  if (!first) return '—'
  const lastInitial = last ? last[0].toUpperCase() + '.' : ''
  return `${first} ${lastInitial}`
}

export default function LeaguePublic() {
  const [houses, setHouses]     = useState([])
  const [individual, setIndividual] = useState([])
  const [clubName, setClubName] = useState('KR Centre')
  const [clubEmoji, setClubEmoji] = useState('🔥')
  const [loading, setLoading]   = useState(true)
  const [tab, setTab]           = useState('houses')
  const [topN, setTopN]         = useState(50)
  const [houseTopN, setHouseTopN] = useState(8)
  const [showMedals, setShowMedals] = useState(true)
  const [dateFrom] = useState(() => { const d = new Date(); d.setMonth(d.getMonth()-3); return d.toISOString().split('T')[0] })
  const [dateTo]   = useState(new Date().toISOString().split('T')[0])

  useEffect(() => {
    async function load() {
      try {
      const [{ data: h }, { data: pts }, { data: settings }, { data: studentsData }] = await Promise.all([
        supabase.from('houses').select('*'),
        supabase.from('points_log')
          .select('points_awarded, point_scope, student_id')
          .gte('awarded_at', dateFrom).lte('awarded_at', dateTo + 'T23:59:59'),
        supabase.from('settings').select('key,value').in('key', ['club_name','club_emoji','league_topn_individual','league_topn_house']),
        supabase.from('students').select('id, house_name, member_id, members(first_name, last_name, houses(name))'),
      ])

      // Build student lookup map (separate query avoids unreliable nested joins)
      const studentMap = {}
      for (const s of (studentsData || [])) {
        const m = s.members
        studentMap[s.id] = {
          first: m?.first_name || '',
          last:  m?.last_name  || '',
          house: m?.houses?.name || s.house_name || '',
        }
      }

      // Aggregate individual + house totals from the SAME points_log data (matches internal League page)
      const map = {}
      const houseTotals = {}
      for (const r of (pts || [])) {
        const sid = r.student_id
        if (!sid) continue
        const info = studentMap[sid] || { first: '', last: '', house: '' }
        if (!map[sid]) {
          map[sid] = { first: info.first, last: info.last, house: info.house, total: 0 }
        }
        map[sid].total += r.points_awarded || 0

        if (info.house && (r.point_scope === 'house' || r.point_scope === 'both')) {
          houseTotals[info.house] = (houseTotals[info.house] || 0) + (r.points_awarded || 0)
        }
      }
      const ranked = Object.values(map).sort((a, b) => b.total - a.total).slice(0, 50)
      setIndividual(ranked)

      // House standings use session points (date-filtered) to match internal League page
      const housesWithSessionPoints = (h || []).map(house => ({
        ...house,
        points: houseTotals[house.name] || 0,
      })).sort((a, b) => b.points - a.points)
      setHouses(housesWithSessionPoints)

      if (settings) {
        const sm = Object.fromEntries(settings.map(r => [r.key, r.value]))
        if (sm.club_name)  setClubName(sm.club_name)
        if (sm.club_emoji) setClubEmoji(sm.club_emoji)
        if (sm.league_topn_individual) setTopN(sm.league_topn_individual)
        if (sm.league_topn_house) setHouseTopN(sm.league_topn_house)
      }
      setLoading(false)
    } catch(e) {
      console.error('LeaguePublic load error:', e)
      setLoading(false)
    }
  }
    load()
  }, [])

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-tertiary)' }}>
      <div className="loading">Loading league…</div>
    </div>
  )

  const MEDALS = showMedals ? ['🥇','🥈','🥉','🎖️'] : ['1','2','3','4']

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-tertiary)', padding: '24px 16px' }}>
      <div style={{ maxWidth: tab === 'student-house' ? 960 : 560, margin: '0 auto', transition: 'max-width 0.2s' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>{clubEmoji}</div>
          <h1 style={{ fontSize: 22, fontWeight: 700 }}>{clubName}</h1>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>League standings</p>
          <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>
            Last 3 months · Updated live
          </p>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: 16 }}>
          {[['houses','🛡️ House league'], ['individual','👤 Individual'], ['student-house','🏠 By house']].map(([key, label]) => (
            <button key={key} onClick={() => setTab(key)} style={{
              flex: 1, padding: '10px', fontSize: 13, border: 'none', background: 'none', cursor: 'pointer',
              borderBottom: `2px solid ${tab === key ? 'var(--text)' : 'transparent'}`,
              color: tab === key ? 'var(--text)' : 'var(--text-secondary)',
              fontWeight: tab === key ? 600 : 400,
            }}>{label}</button>
          ))}
        </div>

        {/* House standings */}
        {tab === 'houses' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {houses.map((h, i) => {
              const colour = HOUSE_COLOURS[h.name] || '#888'
              return (
                <div key={h.id} className="card" style={{ borderLeft: `4px solid ${colour}`, borderRadius: '0 var(--border-radius-lg) var(--border-radius-lg) 0', display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{ fontSize: 28 }}>{MEDALS[i] || `${i+1}`}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 16, fontWeight: 700, color: colour }}>{h.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                      W: {h.wins||0} · D: {h.draws||0} · L: {h.losses||0}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 28, fontWeight: 800, color: colour }}>{h.points || 0}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>points</div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Individual standings — names masked to First + Last initial */}
        {tab === 'individual' && (
          <div>
            <div style={{ display: 'flex', gap: 6, marginBottom: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Showing top {Math.min(topN, individual.length)} of {individual.length}</span>
            </div>
          <div className="card" style={{ padding: 0 }}>
            <table>
              <thead>
                <tr>
                  <th style={{ width: 40 }}>#</th>
                  <th>Student</th>
                  <th>House</th>
                  <th style={{ textAlign: 'right', fontWeight: 700 }}>Points</th>
                </tr>
              </thead>
              <tbody>
                {individual.length === 0 ? (
                  <tr><td colSpan={4} style={{ textAlign: 'center', padding: 32, color: 'var(--text-tertiary)' }}>No scores yet</td></tr>
                ) : individual.slice(0, topN).map((s, i) => {
                  const colour = HOUSE_COLOURS[s.house] || '#888'
                  return (
                    <tr key={i} style={i < 3 ? { background: 'var(--bg-secondary)' } : {}}>
                      <td style={{ fontSize: 16, textAlign: 'center' }}>{MEDALS[i] || <span style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>{i+1}</span>}</td>
                      <td style={{ fontWeight: 500 }}>{maskName(s.first, s.last)}</td>
                      <td>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12 }}>
                          <span style={{ width: 8, height: 8, borderRadius: '50%', background: colour, display: 'inline-block' }} />
                          {s.house || '—'}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 700, fontSize: 15, color: colour }}>{s.total}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
        )}

        {/* Student house view */}
        {tab === 'student-house' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
            {houses.map((h, hIdx) => {
              const colour = HOUSE_COLOURS[h.name] || '#888'
              const houseStudents = individual.filter(s => s.house === h.name)
              return (
                <div key={h.id} className="card" style={{ padding: 0, borderTop: `3px solid ${colour}` }}>
                  <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: colour }}>{hIdx+1}. {h.name}</span>
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{h.points || 0} pts</span>
                  </div>
                  <table>
                    <tbody>
                      {houseStudents.length === 0 ? (
                        <tr><td colSpan={3} style={{ padding: '10px 14px', fontSize: 12, color: 'var(--text-tertiary)' }}>No students yet</td></tr>
                      ) : houseStudents.slice(0, houseTopN).map((s, i) => (
                        <tr key={i} style={i < 3 ? { background: colour + '08' } : {}}>
                          <td style={{ width: 32, textAlign: 'center', fontSize: 14 }}>{MEDALS[i] || <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{i+1}</span>}</td>
                          <td style={{ fontSize: 13, fontWeight: i < 3 ? 600 : 400 }}>{maskName(s.first, s.last)}</td>
                          <td style={{ textAlign: 'right', fontSize: 13, fontWeight: 700, color: colour, paddingRight: 12 }}>{s.total}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            })}
          </div>
        )}

        <p style={{ textAlign: 'center', fontSize: 11, color: 'var(--text-tertiary)', marginTop: 20 }}>
          {clubName} · Powered by KR Centre app
        </p>
      </div>
    </div>
  )
}
