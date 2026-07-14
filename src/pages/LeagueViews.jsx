import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../hooks/useAuth.jsx'

function SortTh({ children, col, sortKey, sortDir, onSort, style = {} }) {
  const active = sortKey === col
  return (
    <th onClick={() => onSort(col)} style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap', color: active ? 'var(--text)' : undefined, ...style }}>
      {children}<span style={{ marginLeft: 4, fontSize: 9, opacity: active ? 1 : 0.4 }}>{active ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}</span>
    </th>
  )
}

const HOUSE_COLOURS = {
  'Dragon House': '#E24B4A',
  'Super House':  '#378ADD',
  'Ice House':    '#1D9E75',
  'Jet House':    '#EF9F27',
}
const HOUSE_BG = {
  'Dragon House': '#fcebeb',
  'Super House':  '#e6f1fb',
  'Ice House':    '#e1f5ee',
  'Jet House':    '#faeeda',
}

const TABS = ['House league', 'Individual', 'Student house', 'Score check', 'Points log']

export default function LeagueViews() {
  const { isAdmin } = useAuth()
  const [tab, setTab] = useState('House league')
  const [showMedals, setShowMedals] = useState(true)

  // Date filter — default current season
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date(); d.setMonth(d.getMonth() - 3)
    return d.toISOString().split('T')[0]
  })
  const [dateTo, setDateTo] = useState(new Date().toISOString().split('T')[0])
  const [classFilter, setClassFilter] = useState('All')

  // Data
  const [houseStandings, setHouseStandings] = useState([])
  const [editingHouse, setEditingHouse] = useState(null)
  const [savingHouse, setSavingHouse] = useState(false)
  const [individualRankings, setIndividualRankings] = useState([])
  const [houses, setHouses] = useState([])
  const [pointsLog, setPointsLog] = useState([])
  const [indivSortKey, setIndivSortKey] = useState('total')
  const [topN, setTopN] = useState(50)
  const [indivSortDir, setIndivSortDir] = useState('desc')
  const [logSortKey, setLogSortKey] = useState('awarded_at')
  const [logSortDir, setLogSortDir] = useState('desc')
  const [houseLogFilter, setHouseLogFilter] = useState('')
  const [typeLogFilter, setTypeLogFilter] = useState('')
  const [loading, setLoading] = useState(true)

  // Score check
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searching, setSearching] = useState(false)

  // Edit points
  const [editingPoint, setEditingPoint] = useState(null)
  const [editVal, setEditVal] = useState('')
  const [saving, setSaving] = useState(false)

  const CLASS_OPTIONS = ['All', 'Class', 'PTs', 'KR', 'Leader', 'KRBA']

  useEffect(() => { loadAll() }, [dateFrom, dateTo, classFilter])

  async function loadAll() {
    setLoading(true)
    const { data: houseData } = await supabase.from('houses').select('*').order('points', { ascending: false })
    setHouses(houseData || [])
    await Promise.all([loadHouseStandings(), loadIndividual(), loadPointsLog()])
    setLoading(false)
  }

  async function saveHouseEdit() {
    setSavingHouse(true)
    const { error } = await supabase.from('houses').update({
      points: editingHouse.points, wins: editingHouse.wins, draws: editingHouse.draws, losses: editingHouse.losses,
    }).eq('id', editingHouse.id)
    if (error) { alert('Error saving: ' + error.message); setSavingHouse(false); return }
    await loadHouseStandings()
    setEditingHouse(null)
    setSavingHouse(false)
  }

  async function loadHouseStandings() {
    // Fetch points_log, students, and members SEPARATELY to avoid unreliable nested joins
    const [{ data: ptsData }, { data: studentsData }, { data: housesData }] = await Promise.all([
      supabase.from('points_log')
        .select('points_awarded, point_scope, student_id')
        .gte('awarded_at', dateFrom)
        .lte('awarded_at', dateTo + 'T23:59:59')
        .in('point_scope', ['house', 'both']),
      supabase.from('students').select('id, house_name, member_id, members(houses(name))'),
      supabase.from('houses').select('id, name, points, wins, draws, losses, members(count)'),
    ])

    // Build student → house lookup
    const studentHouseMap = {}
    for (const s of (studentsData || [])) {
      studentHouseMap[s.id] = s.members?.houses?.name || s.house_name || null
    }

    // Aggregate points by house
    const totals = {}
    for (const row of (ptsData || [])) {
      const house = studentHouseMap[row.student_id]
      if (!house) continue
      if (!totals[house]) totals[house] = 0
      totals[house] += row.points_awarded || 0
    }

    const merged = (housesData || []).map(h => ({
      ...h,
      sessionPoints: totals[h.name] || 0,
      memberCount: h.members?.[0]?.count || 0,
    })).sort((a, b) => b.sessionPoints - a.sessionPoints)
      .map((h, i) => ({ ...h, rank: i + 1 }))

    setHouseStandings(merged)
  }

  async function loadIndividual() {
    const [{ data: ptsData }, { data: studentsData }] = await Promise.all([
      supabase.from('points_log')
        .select('points_awarded, point_scope, point_type, student_id')
        .gte('awarded_at', dateFrom)
        .lte('awarded_at', dateTo + 'T23:59:59'),
      supabase.from('students')
        .select('id, student_ref, class_champion_count, house_name, member_id, members(first_name, last_name, date_of_birth, houses(name))'),
    ])
    if (!ptsData) return

    // Build student lookup
    const studentMap = {}
    for (const s of (studentsData || [])) {
      const m = s.members
      studentMap[s.id] = {
        ref: s.student_ref,
        name: `${m?.first_name || ''} ${m?.last_name || ''}`.trim(),
        house: m?.houses?.name || s.house_name || '',
        champCount: s.class_champion_count || 0,
        dob: m?.date_of_birth,
      }
    }

    // Aggregate by student
    const map = {}
    for (const row of ptsData) {
      const sid = row.student_id
      if (!sid) continue
      const info = studentMap[sid] || { ref: '', name: '', house: '', champCount: 0, dob: null }
      if (!map[sid]) {
        map[sid] = {
          id: sid,
          ref: info.ref,
          name: info.name,
          house: info.house,
          champCount: info.champCount,
          dob: info.dob,
          housePoints: 0,
          individualPoints: 0,
          total: 0,
          sessions: 0,
        }
      }
      if (row.point_scope === 'house' || row.point_scope === 'both') map[sid].housePoints += row.points_awarded || 0
      if (row.point_scope === 'individual' || row.point_scope === 'both') map[sid].individualPoints += row.points_awarded || 0
      map[sid].total += row.points_awarded || 0
      map[sid].sessions++
    }

    const ranked = Object.values(map)
      .sort((a, b) => b.total - a.total)
      .map((s, i) => ({ ...s, rank: i + 1 }))

    setIndividualRankings(ranked)
  }

  async function loadPointsLog() {
    const [{ data: logData }, { data: studentsData }] = await Promise.all([
      supabase.from('points_log')
        .select('*')
        .gte('awarded_at', dateFrom)
        .lte('awarded_at', dateTo + 'T23:59:59')
        .order('awarded_at', { ascending: false })
        .limit(100),
      supabase.from('students')
        .select('id, student_ref, house_name, member_id, members(first_name, last_name, houses(name))'),
    ])

    // Build student lookup
    const studentMap = {}
    for (const s of (studentsData || [])) {
      const m = s.members
      studentMap[s.id] = {
        student_ref: s.student_ref,
        members: {
          first_name: m?.first_name || '',
          last_name: m?.last_name || '',
          houses: { name: m?.houses?.name || s.house_name || '' },
        },
      }
    }

    // Attach student info to each log row in the SAME shape as before (students.members.houses.name)
    // so existing rendering code keeps working without further changes
    const enriched = (logData || []).map(row => ({
      ...row,
      students: studentMap[row.student_id] || { student_ref: '', members: { first_name: '', last_name: '', houses: { name: '' } } },
    }))

    setPointsLog(enriched)
  }

  async function searchStudent() {
    if (!searchQuery.trim()) return
    setSearching(true)
    const q = searchQuery.trim().toLowerCase()

    const { data } = await supabase
      .from('students')
      .select('*, members(first_name, last_name, houses(name))')
      .or(`student_ref.ilike.%${q}%`)
      .limit(10)

    // Also search by name
    const { data: byName } = await supabase
      .from('members')
      .select('*, students(*, members(first_name, last_name, houses(name)))')
      .or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%`)
      .limit(10)

    const studentIds = [...(data || []).map(s => s.id)]
    if (byName) {
      for (const m of byName) {
        for (const s of (m.students || [])) {
          if (!studentIds.includes(s.id)) studentIds.push(s.id)
        }
      }
    }

    if (studentIds.length === 0) { setSearchResults([]); setSearching(false); return }

    // Get points for found students within date range
    const { data: pts } = await supabase
      .from('points_log')
      .select('*, students(student_ref, members(first_name, last_name, houses(name)))')
      .in('student_id', studentIds)
      .gte('awarded_at', dateFrom)
      .lte('awarded_at', dateTo + 'T23:59:59')
      .order('awarded_at', { ascending: false })

    setSearchResults(pts || [])
    setSearching(false)
  }

  async function saveEditPoint() {
    setSaving(true)
    await supabase.from('points_log').update({ points_awarded: parseInt(editVal) }).eq('id', editingPoint.id)
    setEditingPoint(null)
    await loadAll()
    setSaving(false)
  }

  async function deletePoint(id) {
    if (!confirm('Delete this points entry?')) return
    await supabase.from('points_log').delete().eq('id', id)
    await loadAll()
  }

  function calcAge(dob) {
    if (!dob) return ''
    return Math.floor((Date.now() - new Date(dob)) / (365.25 * 24 * 60 * 60 * 1000))
  }

  const RANK_MEDAL = showMedals ? ['🥇', '🥈', '🥉', '🎖️'] : ['1', '2', '3', '4']

  function toggleIndiv(key) {
    if (indivSortKey === key) setIndivSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setIndivSortKey(key); setIndivSortDir('asc') }
  }
  function toggleLog(key) {
    if (logSortKey === key) setLogSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setLogSortKey(key); setLogSortDir('asc') }
  }

  const sortedIndiv = [...individualRankings].sort((a, b) => {
    const aVal = a[indivSortKey] ?? 0
    const bVal = b[indivSortKey] ?? 0
    if (typeof aVal === 'number') return indivSortDir === 'asc' ? aVal - bVal : bVal - aVal
    return indivSortDir === 'asc' ? String(aVal).localeCompare(String(bVal)) : String(bVal).localeCompare(String(aVal))
  }).slice(0, topN)

  const filteredLog = pointsLog
    .filter(r => !houseLogFilter || r.students?.members?.houses?.name === houseLogFilter)
    .filter(r => !typeLogFilter || r.point_type === typeLogFilter)
    .sort((a, b) => {
      const aVal = a[logSortKey] || ''
      const bVal = b[logSortKey] || ''
      if (logSortKey === 'points_awarded') return logSortDir === 'asc' ? (a.points_awarded||0) - (b.points_awarded||0) : (b.points_awarded||0) - (a.points_awarded||0)
      return logSortDir === 'asc' ? String(aVal).localeCompare(String(bVal)) : String(bVal).localeCompare(String(aVal))
    })

  const allHouses = [...new Set(pointsLog.map(r => r.students?.members?.houses?.name).filter(Boolean))].sort()
  const allTypes  = [...new Set(pointsLog.map(r => r.point_type).filter(Boolean))].sort()

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
        <div className="page-header" style={{ marginBottom: 0 }}>
          <h1>League</h1>
          <p>Points standings across all classes</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <a href="/league-public" target="_blank" rel="noreferrer" className="btn btn-sm">
            🔗 Public view
          </a>
          <button className="btn btn-sm" onClick={() => { navigator.clipboard.writeText(window.location.origin + '/league-public'); alert('Public league link copied!') }}>
            Share league
          </button>
        </div>
      </div>

      {/* Date filter bar */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--bg)', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius)', padding: '6px 10px' }}>
          <span style={{ fontSize: 11, color: 'var(--text-secondary)', flexShrink: 0 }}>From</span>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            style={{ border: 'none', background: 'transparent', fontSize: 13, color: 'var(--text)', outline: 'none' }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--bg)', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius)', padding: '6px 10px' }}>
          <span style={{ fontSize: 11, color: 'var(--text-secondary)', flexShrink: 0 }}>To</span>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            style={{ border: 'none', background: 'transparent', fontSize: 13, color: 'var(--text)', outline: 'none' }} />
        </div>
        <select value={classFilter} onChange={e => setClassFilter(e.target.value)}
          style={{ padding: '7px 10px', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius)', background: 'var(--bg)', fontSize: 13, color: 'var(--text)' }}>
          {CLASS_OPTIONS.map(c => <option key={c}>{c}</option>)}
        </select>
        {/* Quick range buttons */}
        {[
          { label: 'This week',  days: 7 },
          { label: 'This month', days: 30 },
          { label: 'This term',  days: 90 },
          { label: 'This year',  days: 365 },
        ].map(r => (
          <button key={r.label} className="btn btn-sm" onClick={() => {
            const from = new Date(); from.setDate(from.getDate() - r.days)
            setDateFrom(from.toISOString().split('T')[0])
            setDateTo(new Date().toISOString().split('T')[0])
          }}>{r.label}</button>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
        <button className="btn btn-sm" onClick={() => setShowMedals(v => !v)}>
          {showMedals ? '🎖️ Hide medals' : '🎖️ Show medals'}
        </button>
      </div>
      {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '8px 16px', fontSize: 13, border: 'none', background: 'none', cursor: 'pointer',
            borderBottom: `2px solid ${tab === t ? 'var(--text)' : 'transparent'}`,
            color: tab === t ? 'var(--text)' : 'var(--text-secondary)',
            fontWeight: tab === t ? 500 : 400,
          }}>{t}</button>
        ))}
      </div>

      {loading && <div className="loading">Loading league data…</div>}

      {/* ── HOUSE LEAGUE ── */}
      {!loading && tab === 'House league' && (
        <div>
          {/* House score cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 20 }}>
            {houseStandings.map((h, i) => {
              const colour = HOUSE_COLOURS[h.name] || '#888'
              const bg = HOUSE_BG[h.name] || '#f5f5f5'
              return (
                <div key={h.name} className="card" style={{ borderLeft: `3px solid ${colour}`, borderRadius: '0 var(--border-radius-lg) var(--border-radius-lg) 0', position: 'relative', overflow: 'hidden' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                    <div style={{ fontSize: 15, fontWeight: 600 }}>{h.name}</div>
                    <div style={{ fontSize: 22 }}>{RANK_MEDAL[i] || `${i + 1}th`}</div>
                  </div>
                  <div style={{ fontSize: 32, fontWeight: 700, color: colour }}>{h.sessionPoints}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>points this period</div>
                  <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 6 }}>
                    {h.memberCount} members · All time: {h.points || 0} pts
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4, display: 'flex', gap: 10 }}>
                    <span>W: {h.wins || 0}</span>
                    <span>D: {h.draws || 0}</span>
                    <span>L: {h.losses || 0}</span>
                  </div>
                  {isAdmin && (
                    <button className="btn btn-sm" style={{ marginTop: 10, width: '100%', justifyContent: 'center' }}
                      onClick={() => setEditingHouse(h)}>
                      Edit points
                    </button>
                  )}
                </div>
              )
            })}
          </div>

          {/* Top scorers per house */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
            {houseStandings.map(h => {
              const colour = HOUSE_COLOURS[h.name] || '#888'
              const houseMembers = individualRankings.filter(s => s.house === h.name).slice(0, 8)
              return (
                <div key={h.name} className="card" style={{ padding: '14px 0' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 14px 10px', borderBottom: '1px solid var(--border)' }}>
                    <span style={{ width: 10, height: 10, borderRadius: '50%', background: colour, display: 'inline-block' }} />
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{h.name}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-tertiary)', marginLeft: 'auto' }}>Top scorers</span>
                  </div>
                  {houseMembers.length === 0
                    ? <div style={{ fontSize: 12, color: 'var(--text-tertiary)', padding: '12px 14px' }}>No scores this period</div>
                    : houseMembers.map((s, i) => (
                      <div key={s.id} style={{ display: 'flex', alignItems: 'center', padding: '7px 14px', borderBottom: i < houseMembers.length - 1 ? '1px solid var(--border)' : 'none' }}>
                        <span style={{ fontSize: 11, color: 'var(--text-tertiary)', width: 20, flexShrink: 0 }}>{i + 1}</span>
                        <span style={{ fontSize: 13, flex: 1 }}>{s.name}</span>
                        {s.champCount > 0 && <span style={{ fontSize: 10, marginRight: 4 }}>🏆{s.champCount}</span>}
                        <span style={{ fontSize: 13, fontWeight: 700, color: colour }}>{s.total}</span>
                      </div>
                    ))
                  }
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── INDIVIDUAL LEAGUE ── */}
      {!loading && tab === 'Individual' && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{individualRankings.length} students ranked</p>
          </div>
          <div style={{ display: 'flex', gap: 6, marginBottom: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Show top:</span>
            {[10, 15, 25, 50, 100].map(n => (
              <button key={n} onClick={() => setTopN(n)} style={{
                padding: '4px 10px', borderRadius: 20, fontSize: 11, cursor: 'pointer',
                border: `1px solid ${topN === n ? 'var(--text)' : 'var(--border-strong)'}`,
                background: topN === n ? 'var(--text)' : 'var(--bg)',
                color: topN === n ? 'var(--bg)' : 'var(--text-secondary)',
              }}>{n}</button>
            ))}
            <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{sortedIndiv.length} shown</span>
          </div>
          <div className="card" style={{ padding: 0 }}>
            <table>
              <thead>
                <tr>
                  <th style={{ width: 40 }}>#</th>
                  <th>Student</th>
                  <th>House</th>
                  <th style={{ textAlign: 'center' }}>Sessions</th>
                  <th style={{ textAlign: 'center' }}>🏆</th>
                  <th style={{ textAlign: 'center' }}>H pts</th>
                  <th style={{ textAlign: 'center' }}>I pts</th>
                  <th style={{ textAlign: 'center', fontWeight: 700 }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {sortedIndiv.length === 0
                  ? <tr><td colSpan={8} style={{ textAlign: 'center', padding: 40, color: 'var(--text-tertiary)' }}>No scores in this date range</td></tr>
                  : sortedIndiv.map((s, i) => {
                    const colour = HOUSE_COLOURS[s.house] || '#888'
                    const isTop3 = i < 3
                    return (
                      <tr key={s.id} style={isTop3 ? { background: 'var(--bg-secondary)' } : {}}>
                        <td style={{ fontSize: 16, textAlign: 'center' }}>
                          {RANK_MEDAL[i] || <span style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>{i + 1}</span>}
                        </td>
                        <td>
                          <div style={{ fontWeight: 500 }}>{s.name}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono, monospace)' }}>{s.ref}</div>
                        </td>
                        <td>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 13 }}>
                            <span style={{ width: 8, height: 8, borderRadius: '50%', background: colour, display: 'inline-block' }} />
                            {s.house || '—'}
                          </span>
                        </td>
                        <td style={{ textAlign: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>{s.sessions}</td>
                        <td style={{ textAlign: 'center' }}>
                          {s.champCount > 0 && <span style={{ fontSize: 12 }}>🏆 {s.champCount}</span>}
                        </td>
                        <td style={{ textAlign: 'center', fontSize: 13, color: 'var(--text-secondary)' }}>{s.housePoints}</td>
                        <td style={{ textAlign: 'center', fontSize: 13, color: 'var(--text-secondary)' }}>{s.individualPoints}</td>
                        <td style={{ textAlign: 'center', fontSize: 15, fontWeight: 700, color: colour }}>{s.total}</td>
                      </tr>
                    )
                  })
                }
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── SCORE CHECK ── */}
      {/* ── Student House view ── */}
      {!loading && tab === 'Student house' && (
        <div>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 14 }}>
            Individual rankings grouped by house — showing top students in each house
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
            {houses.map(house => {
              const colour = HOUSE_COLOURS[house.name] || '#888'
              const houseStudents = [...individualRankings]
                .filter(s => s.house === house.name)
                .sort((a, b) => b.total - a.total)
              const MEDALS = ['🥇','🥈','🥉','🎖️']
              return (
                <div key={house.id} className="card" style={{ padding: 0, borderTop: `3px solid ${colour}` }}>
                  <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 18 }}>🛡️</span>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: colour }}>{house.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{house.points || 0} house pts · {houseStudents.length} students</div>
                    </div>
                  </div>
                  <table>
                    <tbody>
                      {houseStudents.length === 0 ? (
                        <tr><td style={{ padding: '12px 14px', fontSize: 12, color: 'var(--text-tertiary)' }}>No students</td></tr>
                      ) : houseStudents.slice(0, 10).map((s, i) => (
                        <tr key={i} style={i < 3 ? { background: colour + '08' } : {}}>
                          <td style={{ width: 28, textAlign: 'center', fontSize: 14 }}>{MEDALS[i] || <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{i+1}</span>}</td>
                          <td style={{ fontSize: 12, fontWeight: i < 3 ? 600 : 400 }}>{s.name}</td>
                          <td style={{ textAlign: 'right', fontSize: 13, fontWeight: 700, color: colour, paddingRight: 12 }}>{s.total}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {tab === 'Score check' && (
        <div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && searchStudent()}
              placeholder="Search by student name or ID…"
              style={{ flex: 1, padding: '9px 12px', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius)', fontSize: 13, background: 'var(--bg-secondary)', color: 'var(--text)' }} />
            <button className="btn btn-primary" onClick={searchStudent} disabled={searching}>
              {searching ? 'Searching…' : 'Search'}
            </button>
          </div>

          {searchResults.length > 0 && (
            <>
              {/* Student summary */}
              {(() => {
                const total = searchResults.reduce((s, r) => s + (r.points_awarded || 0), 0)
                const first = searchResults[0]
                const name = `${first.students?.members?.first_name || ''} ${first.students?.members?.last_name || ''}`.trim()
                const house = first.students?.members?.houses?.name
                const colour = HOUSE_COLOURS[house] || '#888'
                return (
                  <div className="card" style={{ marginBottom: 14, display: 'flex', alignItems: 'center', gap: 16 }}>
                    <div style={{ width: 44, height: 44, borderRadius: '50%', background: colour + '22', color: colour, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 700, flexShrink: 0 }}>
                      {name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 16, fontWeight: 600 }}>{name}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{first.students?.student_ref} · {house}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 26, fontWeight: 700, color: colour }}>{total}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>total pts · {searchResults.length} entries</div>
                    </div>
                  </div>
                )
              })()}

              <div className="card" style={{ padding: 0 }}>
                <table>
                  <thead>
                    <tr>
                      <th>Date</th><th>Point type</th><th>Scope</th><th style={{ textAlign: 'right' }}>Points</th>
                      {isAdmin && <th></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {searchResults.map(r => (
                      <tr key={r.id}>
                        <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{new Date(r.awarded_at).toLocaleDateString('en-GB')}</td>
                        <td style={{ fontWeight: 500 }}>{r.point_type}</td>
                        <td><span className={`badge ${r.point_scope === 'both' ? 'badge-green' : r.point_scope === 'house' ? 'badge-blue' : 'badge-purple'}`} style={{ fontSize: 10 }}>{r.point_scope}</span></td>
                        <td style={{ textAlign: 'right', fontWeight: 700, color: r.points_awarded < 0 ? '#a32d2d' : 'var(--success, #1d9e75)' }}>
                          {r.points_awarded > 0 ? '+' : ''}{r.points_awarded}
                        </td>
                        {isAdmin && (
                          <td style={{ display: 'flex', gap: 4 }}>
                            <button className="btn btn-sm" onClick={() => { setEditingPoint(r); setEditVal(String(r.points_awarded)) }}>Edit</button>
                            <button className="btn btn-sm btn-danger" onClick={() => deletePoint(r.id)}>Del</button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {searchResults.length === 0 && searchQuery && !searching && (
            <div className="empty-state"><h3>No results</h3><p>No points found for "{searchQuery}" in this date range</p></div>
          )}
        </div>
      )}

      {/* ── POINTS LOG ── */}
      {!loading && tab === 'Points log' && (
        <div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            <select value={houseLogFilter} onChange={e => setHouseLogFilter(e.target.value)}
              style={{ padding: '7px 10px', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius)', background: 'var(--bg-secondary)', fontSize: 13, color: 'var(--text)' }}>
              <option value="">All houses</option>
              {allHouses.map(h => <option key={h}>{h}</option>)}
            </select>
            <select value={typeLogFilter} onChange={e => setTypeLogFilter(e.target.value)}
              style={{ padding: '7px 10px', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius)', background: 'var(--bg-secondary)', fontSize: 13, color: 'var(--text)' }}>
              <option value="">All point types</option>
              {allTypes.map(t => <option key={t}>{t}</option>)}
            </select>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)', alignSelf: 'center' }}>{filteredLog.length} entries</span>
          </div>
          <div className="card" style={{ padding: 0 }}>
            <table>
              <thead>
                <tr>
                  <SortTh col="awarded_at" sortKey={logSortKey} sortDir={logSortDir} onSort={toggleLog}>Date</SortTh>
                  <th>Student</th>
                  <SortTh col="house" sortKey={logSortKey} sortDir={logSortDir} onSort={toggleLog}>House</SortTh>
                  <SortTh col="point_type" sortKey={logSortKey} sortDir={logSortDir} onSort={toggleLog}>Point type</SortTh>
                  <th>Scope</th>
                  <SortTh col="points_awarded" sortKey={logSortKey} sortDir={logSortDir} onSort={toggleLog} style={{ textAlign: 'right' }}>Pts</SortTh>
                  {isAdmin && <th></th>}
                </tr>
              </thead>
              <tbody>
                {filteredLog.length === 0
                  ? <tr><td colSpan={7} style={{ textAlign: 'center', padding: 32, color: 'var(--text-tertiary)' }}>No points logged in this period</td></tr>
                  : filteredLog.map(r => {
                    const house = r.students?.members?.houses?.name
                    const colour = HOUSE_COLOURS[house] || '#888'
                    const name = `${r.students?.members?.first_name || ''} ${r.students?.members?.last_name || ''}`.trim()
                    return (
                      <tr key={r.id}>
                        <td style={{ fontSize: 11, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                          {new Date(r.awarded_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' })}
                        </td>
                        <td>
                          <div style={{ fontWeight: 500, fontSize: 13 }}>{name}</div>
                          <div style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: 'monospace' }}>{r.students?.student_ref}</div>
                        </td>
                        <td>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
                            <span style={{ width: 7, height: 7, borderRadius: '50%', background: colour, display: 'inline-block' }} />
                            {house || '—'}
                          </span>
                        </td>
                        <td style={{ fontSize: 13 }}>{r.point_type}</td>
                        <td>
                          <span className={`badge ${r.point_scope === 'both' ? 'badge-green' : r.point_scope === 'house' ? 'badge-blue' : 'badge-purple'}`} style={{ fontSize: 10 }}>
                            {r.point_scope}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 700, fontSize: 13, color: r.points_awarded < 0 ? '#a32d2d' : 'var(--success, #1d9e75)' }}>
                          {r.points_awarded > 0 ? '+' : ''}{r.points_awarded}
                        </td>
                        {isAdmin && (
                          <td>
                            <div style={{ display: 'flex', gap: 4 }}>
                              <button className="btn btn-sm" onClick={() => { setEditingPoint(r); setEditVal(String(r.points_awarded)) }}>Edit</button>
                              <button className="btn btn-sm btn-danger" onClick={() => deletePoint(r.id)}>Del</button>
                            </div>
                          </td>
                        )}
                      </tr>
                    )
                  })
                }
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Edit house points modal */}
      {editingHouse && isAdmin && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 }}>
          <div className="card" style={{ width: '100%', maxWidth: 380 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
              <h2 style={{ fontSize: 16, fontWeight: 600 }}>Edit {editingHouse.name}</h2>
              <button onClick={() => setEditingHouse(null)} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer' }}>✕</button>
            </div>
            <div className="field-row">
              <div className="field"><label>Points</label><input type="number" value={editingHouse.points || 0} onChange={e => setEditingHouse(v => ({ ...v, points: +e.target.value }))} /></div>
              <div className="field"><label>Wins</label><input type="number" value={editingHouse.wins || 0} onChange={e => setEditingHouse(v => ({ ...v, wins: +e.target.value }))} /></div>
            </div>
            <div className="field-row">
              <div className="field"><label>Draws</label><input type="number" value={editingHouse.draws || 0} onChange={e => setEditingHouse(v => ({ ...v, draws: +e.target.value }))} /></div>
              <div className="field"><label>Losses</label><input type="number" value={editingHouse.losses || 0} onChange={e => setEditingHouse(v => ({ ...v, losses: +e.target.value }))} /></div>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn" onClick={() => setEditingHouse(null)}>Cancel</button>
              <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={saveHouseEdit} disabled={savingHouse}>{savingHouse ? 'Saving…' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit points modal */}
      {editingPoint && isAdmin && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 }}>
          <div className="card" style={{ width: '100%', maxWidth: 340 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14 }}>
              <h2 style={{ fontSize: 15, fontWeight: 600 }}>Edit points entry</h2>
              <button onClick={() => setEditingPoint(null)} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--text-secondary)' }}>✕</button>
            </div>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 14 }}>
              {editingPoint.point_type} · {new Date(editingPoint.awarded_at).toLocaleDateString('en-GB')}
            </p>
            <div className="field">
              <label>Points value</label>
              <input type="number" value={editVal} onChange={e => setEditVal(e.target.value)}
                style={{ fontSize: 20, fontWeight: 700, textAlign: 'center' }} />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn" onClick={() => setEditingPoint(null)}>Cancel</button>
              <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={saveEditPoint} disabled={saving}>
                {saving ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
