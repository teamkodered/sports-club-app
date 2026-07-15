import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'

const HOUSE_COLOURS = { 'Dragon House': '#E24B4A', 'Super House': '#378ADD', 'Ice House': '#1D9E75', 'Jet House': '#EF9F27' }

function SortTh({ children, col, sortKey, sortDir, onSort, style = {} }) {
  const active = sortKey === col
  return (
    <th onClick={() => onSort(col)} style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap', ...style }}>
      {children}<span style={{ marginLeft: 4, fontSize: 9, opacity: active ? 1 : 0.4 }}>{active ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}</span>
    </th>
  )
}

export default function Trackers() {
  const [tab, setTab]               = useState('dashboard')
  const [attendance, setAttendance]   = useState([])
  const [attFilter, setAttFilter]     = useState('all')
  const [students, setStudents]     = useState([])
  const [sessions, setSessions]     = useState([])
  const [allMembers, setAllMembers] = useState([]) // for join/stop duration tracking
  const [loading, setLoading]       = useState(true)
  const [search, setSearch]         = useState('')
  const [houseFilter, setHouseFilter] = useState('')
  const [sortKey, setSortKey]       = useState('total_sessions')
  const [sortDir, setSortDir]       = useState('desc')

  useEffect(() => { load() }, [])

  async function load() {
    const [{ data: s }, { data: f }, { data: m }] = await Promise.all([
      supabase.from('students').select('*, members(first_name, last_name, date_of_birth, houses(name))').eq('discipline', 'PKA'),
      supabase.from('fit2fight_sessions').select('*').order('session_date', { ascending: false }),
      supabase.from('members').select('id, first_name, last_name, joined_date, status, stopped_at'),
    ])
    setStudents(s || [])
    setSessions(f || [])
    setAllMembers(m || [])
    const { data: att } = await supabase
      .from('attendance')
      .select('student_id, attended_at, attendance_type')
      .order('attended_at', { ascending: false })
    setAttendance(att || [])
    setLoading(false)
  }

  function toggleSort(key) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  function calcAge(dob) {
    if (!dob) return null
    return Math.floor((Date.now() - new Date(dob)) / (365.25*24*60*60*1000))
  }

  // Build student stats
  const stats = students.map(s => {
    const name = `${s.members?.first_name} ${s.members?.last_name}`
    const studentSessions = sessions.filter(f => f.student_id === s.id)
    const weights = studentSessions.filter(f => f.weight_before).map(f => ({ date: f.session_date, before: f.weight_before, after: f.weight_after })).sort((a,b) => a.date.localeCompare(b.date))
    const firstWeight = weights[0]?.before
    const lastWeight  = weights[weights.length-1]?.after || weights[weights.length-1]?.before
    const weightChange = firstWeight && lastWeight ? (parseFloat(lastWeight) - parseFloat(firstWeight)).toFixed(1) : null
    const trainedFor = s.members?.date_of_birth && s.joined_date
      ? Math.round((Date.now() - new Date(s.joined_date || s.created_at)) / (30*24*60*60*1000))
      : null

    return {
      id: s.id, name, student_ref: s.student_ref,
      house: s.members?.houses?.name || '—',
      age: calcAge(s.members?.date_of_birth),
      grade: s.pka_belt || '—',
      class_schedule: s.class_schedule || '—',
      class_time: s.class_time || '—',
      total_sessions: studentSessions.length,
      house_points: s.house_points || 0,
      individual_points: s.individual_points || 0,
      class_champ: s.class_champion_count || 0,
      first_weight: firstWeight, last_weight: lastWeight, weight_change: weightChange,
      is_kr: s.is_kr, is_pts: s.is_pts, is_leader: s.is_leader,
      trained_for_months: trainedFor,
      media: s.media_restriction,
    }
  })

  const filtered = stats
    .filter(s => !houseFilter || s.house === houseFilter)
    .filter(s => !search || s.name.toLowerCase().includes(search.toLowerCase()) || s.student_ref?.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      const aVal = a[sortKey] ?? (typeof a[sortKey] === 'number' ? 0 : '')
      const bVal = b[sortKey] ?? (typeof b[sortKey] === 'number' ? 0 : '')
      if (typeof aVal === 'number') return sortDir === 'asc' ? aVal - bVal : bVal - aVal
      return sortDir === 'asc' ? String(aVal).localeCompare(String(bVal)) : String(bVal).localeCompare(String(aVal))
    })

  const houses = [...new Set(students.map(s => s.members?.houses?.name).filter(Boolean))].sort()

  // Dashboard stats
  const totalStudents = students.length
  const activeThisMonth = sessions.filter(s => {
    const d = new Date(s.session_date)
    const now = new Date()
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
  }).length
  const avgSessions = totalStudents > 0 ? (sessions.length / totalStudents).toFixed(1) : 0
  const mediaOk = students.filter(s => s.media_restriction !== 'No').length

  // Average length of training: joined_date -> stopped_at, for members who
  // have actually stopped and have a recorded stop date. Members stopped
  // before stopped_at existed won't have a value and are excluded.
  const completedDurations = allMembers
    .filter(m => m.status === 'stopped' && m.joined_date && m.stopped_at)
    .map(m => {
      const months = (new Date(m.stopped_at) - new Date(m.joined_date)) / (1000*60*60*24*30.44)
      return months
    })
    .filter(m => m >= 0)
  const avgMonthsTrained = completedDurations.length > 0
    ? (completedDurations.reduce((a,b) => a+b, 0) / completedDurations.length).toFixed(1)
    : null
  const missingStopDates = allMembers.filter(m => m.status === 'stopped' && (!m.stopped_at || !m.joined_date)).length

  // Join/stop timeline: group by exact date
  const timelineMap = {}
  allMembers.forEach(m => {
    if (m.joined_date) {
      const key = m.joined_date
      timelineMap[key] = timelineMap[key] || { date: key, joined: 0, stopped: 0 }
      timelineMap[key].joined++
    }
    if (m.stopped_at) {
      const key = m.stopped_at.split('T')[0]
      timelineMap[key] = timelineMap[key] || { date: key, joined: 0, stopped: 0 }
      timelineMap[key].stopped++
    }
  })
  const timeline = Object.values(timelineMap).sort((a,b) => b.date.localeCompare(a.date))

  // Monthly aggregation for the bar graph
  const monthMap = {}
  timeline.forEach(t => {
    const monthKey = t.date.slice(0,7) // YYYY-MM
    monthMap[monthKey] = monthMap[monthKey] || { month: monthKey, joined: 0, stopped: 0 }
    monthMap[monthKey].joined += t.joined
    monthMap[monthKey].stopped += t.stopped
  })
  const months = Object.values(monthMap).sort((a,b) => a.month.localeCompare(b.month)).slice(-12)
  const maxMonthCount = Math.max(1, ...months.map(m => Math.max(m.joined, m.stopped)))

  if (loading) return <div className="loading">Loading trackers…</div>

  return (
    <div>
      <div className="page-header">
        <h1>Trackers</h1>
        <p>Student progress, attendance and weight tracking</p>
      </div>

      <div style={{ display: 'flex', gap: 2, borderBottom: '1px solid var(--border)', marginBottom: 16 }}>
        {[['dashboard','📊 Dashboard'], ['spreadsheet','📋 Spreadsheet'], ['weight','⚖️ Weight tracker'], ['attendance','✅ Attendance']].map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)} style={{
            padding: '8px 16px', fontSize: 13, border: 'none', background: 'none', cursor: 'pointer',
            borderBottom: `2px solid ${tab === key ? 'var(--text)' : 'transparent'}`,
            color: tab === key ? 'var(--text)' : 'var(--text-secondary)',
            fontWeight: tab === key ? 500 : 400,
          }}>{label}</button>
        ))}
      </div>

      {/* Dashboard */}
      {tab === 'dashboard' && (
        <div>
          {/* Average training duration -- top of page as requested */}
          <div className="card" style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 32 }}>⏱️</div>
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ fontSize: 24, fontWeight: 700 }}>
                {avgMonthsTrained !== null ? `${avgMonthsTrained} months` : 'Not enough data yet'}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                Average length of training (joined → stopped), based on {completedDurations.length} member{completedDurations.length === 1 ? '' : 's'} with a recorded stop date
              </div>
              {missingStopDates > 0 && (
                <div style={{ fontSize: 11, color: '#EF9F27', marginTop: 4 }}>
                  ⚠️ {missingStopDates} stopped member{missingStopDates === 1 ? '' : 's'} {missingStopDates === 1 ? 'has' : 'have'} no recorded stop date and {missingStopDates === 1 ? "isn't" : "aren't"} included
                </div>
              )}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 20 }}>
            {[
              { label: 'Total students', value: totalStudents, colour: '#378ADD', icon: '🎽' },
              { label: 'Sessions this month', value: activeThisMonth, colour: '#1D9E75', icon: '💪' },
              { label: 'Avg sessions/student', value: avgSessions, colour: '#EF9F27', icon: '📈' },
              { label: 'Media OK', value: mediaOk, colour: '#E24B4A', icon: '📷' },
            ].map(s => (
              <div key={s.label} className="card" style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 28, marginBottom: 4 }}>{s.icon}</div>
                <div style={{ fontSize: 26, fontWeight: 700, color: s.colour }}>{s.value}</div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Joins vs stops over time */}
          <div className="card" style={{ marginBottom: 20 }}>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 14 }}>📈 Joins vs stops — last 12 months</div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 130, borderBottom: '1px solid var(--border)', paddingBottom: 4, overflowX: 'auto' }}>
              {months.map(m => (
                <div key={m.month} style={{ flex: 1, minWidth: 32, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 100 }}>
                    <div title={`${m.joined} joined`} style={{
                      width: 10, minHeight: m.joined ? 3 : 0, height: `${(m.joined / maxMonthCount) * 90}px`,
                      background: '#1D9E75', borderRadius: '2px 2px 0 0',
                    }} />
                    <div title={`${m.stopped} stopped`} style={{
                      width: 10, minHeight: m.stopped ? 3 : 0, height: `${(m.stopped / maxMonthCount) * 90}px`,
                      background: '#E24B4A', borderRadius: '2px 2px 0 0',
                    }} />
                  </div>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
              {months.map(m => (
                <div key={m.month} style={{ flex: 1, minWidth: 32, textAlign: 'center', fontSize: 9, color: 'var(--text-secondary)' }}>
                  {new Date(m.month + '-02').toLocaleDateString(undefined, { month: 'short' })}
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 16, marginTop: 10, fontSize: 11, color: 'var(--text-secondary)' }}>
              <span><span style={{ display: 'inline-block', width: 8, height: 8, background: '#1D9E75', borderRadius: 2, marginRight: 4 }} />Joined</span>
              <span><span style={{ display: 'inline-block', width: 8, height: 8, background: '#E24B4A', borderRadius: 2, marginRight: 4 }} />Stopped</span>
            </div>

            {/* Exact date-by-date list */}
            <div style={{ marginTop: 16, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: 'var(--text-secondary)' }}>By date</div>
              <div style={{ maxHeight: 220, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
                {timeline.length === 0 ? (
                  <p style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>No join/stop data yet.</p>
                ) : timeline.map(t => (
                  <div key={t.date} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '4px 0' }}>
                    <span>{new Date(t.date).toLocaleDateString('en-GB')}</span>
                    <span style={{ display: 'flex', gap: 10 }}>
                      {t.joined > 0 && <span style={{ color: '#1D9E75' }}>{t.joined} joined</span>}
                      {t.stopped > 0 && <span style={{ color: '#E24B4A' }}>{t.stopped} stopped</span>}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Top performers */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="card" style={{ padding: 0 }}>
              <div style={{ padding: '12px 14px', fontWeight: 600, fontSize: 13, borderBottom: '1px solid var(--border)' }}>🏆 Top 10 by points</div>
              <table>
                <thead><tr><th>#</th><th>Student</th><th style={{ textAlign: 'right' }}>Pts</th></tr></thead>
                <tbody>
                  {[...stats].sort((a,b) => b.house_points - a.house_points).slice(0,10).map((s,i) => (
                    <tr key={s.id}>
                      <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{i+1}</td>
                      <td style={{ fontSize: 13 }}>{s.name}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600, color: HOUSE_COLOURS[s.house] }}>{s.house_points}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="card" style={{ padding: 0 }}>
              <div style={{ padding: '12px 14px', fontWeight: 600, fontSize: 13, borderBottom: '1px solid var(--border)' }}>💪 Most Fit II Fight sessions</div>
              <table>
                <thead><tr><th>#</th><th>Student</th><th style={{ textAlign: 'right' }}>Sessions</th></tr></thead>
                <tbody>
                  {[...stats].sort((a,b) => b.total_sessions - a.total_sessions).filter(s => s.total_sessions > 0).slice(0,10).map((s,i) => (
                    <tr key={s.id}>
                      <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{i+1}</td>
                      <td style={{ fontSize: 13 }}>{s.name}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>{s.total_sessions}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Spreadsheet view */}
      {tab === 'spreadsheet' && (
        <div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search students…"
              style={{ flex: 1, minWidth: 180, padding: '7px 10px', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius)', background: 'var(--bg-secondary)', fontSize: 13, color: 'var(--text)' }} />
            <select value={houseFilter} onChange={e => setHouseFilter(e.target.value)}
              style={{ padding: '7px 10px', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius)', background: 'var(--bg-secondary)', fontSize: 13, color: 'var(--text)' }}>
              <option value="">All houses</option>
              {houses.map(h => <option key={h}>{h}</option>)}
            </select>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)', alignSelf: 'center' }}>{filtered.length} students</span>
          </div>
          <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
            <table style={{ minWidth: 1100 }}>
              <thead>
                <tr>
                  <SortTh col="student_ref" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>ID</SortTh>
                  <SortTh col="name" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>Name</SortTh>
                  <SortTh col="age" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>Age</SortTh>
                  <SortTh col="house" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>House</SortTh>
                  <SortTh col="grade" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>Grade</SortTh>
                  <SortTh col="class_schedule" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>Class</SortTh>
                  <SortTh col="class_time" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>Time</SortTh>
                  <SortTh col="trained_for_months" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>Trained (mo)</SortTh>
                  <SortTh col="total_sessions" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} style={{ textAlign: 'center' }}>Sessions</SortTh>
                  <SortTh col="house_points" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} style={{ textAlign: 'center' }}>H pts</SortTh>
                  <SortTh col="individual_points" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} style={{ textAlign: 'center' }}>I pts</SortTh>
                  <SortTh col="class_champ" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} style={{ textAlign: 'center' }}>🏆</SortTh>
                  <SortTh col="weight_change" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} style={{ textAlign: 'center' }}>Wt Δ</SortTh>
                  <th>Groups</th>
                  <SortTh col="media" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>Media</SortTh>
                </tr>
              </thead>
              <tbody>
                {filtered.map(s => {
                  const colour = HOUSE_COLOURS[s.house] || '#888'
                  return (
                    <tr key={s.id}>
                      <td style={{ fontSize: 11, fontFamily: 'monospace', color: '#185fa5' }}>{s.student_ref}</td>
                      <td style={{ fontWeight: 500, whiteSpace: 'nowrap' }}>{s.name}</td>
                      <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{s.age || '—'}</td>
                      <td>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
                          <span style={{ width: 7, height: 7, borderRadius: '50%', background: colour, display: 'inline-block' }} />
                          {s.house}
                        </span>
                      </td>
                      <td style={{ fontSize: 12 }}>{s.grade}</td>
                      <td style={{ fontSize: 12 }}>{s.class_schedule}</td>
                      <td style={{ fontSize: 12 }}>{s.class_time}</td>
                      <td style={{ textAlign: 'center', fontSize: 12 }}>{s.trained_for_months || '—'}</td>
                      <td style={{ textAlign: 'center', fontSize: 13, fontWeight: s.total_sessions > 0 ? 600 : 400, color: s.total_sessions > 0 ? '#1d9e75' : 'var(--text-tertiary)' }}>{s.total_sessions}</td>
                      <td style={{ textAlign: 'center', fontWeight: 600 }}>{s.house_points}</td>
                      <td style={{ textAlign: 'center', fontWeight: 600 }}>{s.individual_points}</td>
                      <td style={{ textAlign: 'center' }}>{s.class_champ > 0 ? `🏆 ${s.class_champ}` : <span style={{ color: 'var(--text-tertiary)' }}>—</span>}</td>
                      <td style={{ textAlign: 'center', fontSize: 12, fontWeight: 600, color: s.weight_change < 0 ? '#1d9e75' : s.weight_change > 0 ? '#a32d2d' : 'var(--text-secondary)' }}>
                        {s.weight_change !== null ? `${s.weight_change > 0 ? '+' : ''}${s.weight_change}kg` : '—'}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 2 }}>
                          {s.is_kr     && <span className="badge badge-purple" style={{ fontSize: 8 }}>KR</span>}
                          {s.is_pts    && <span className="badge badge-blue"   style={{ fontSize: 8 }}>PTs</span>}
                          {s.is_leader && <span className="badge badge-green"  style={{ fontSize: 8 }}>L</span>}
                        </div>
                      </td>
                      <td><span className={`badge ${s.media === 'No' ? 'badge-red' : 'badge-green'}`} style={{ fontSize: 9 }}>{s.media === 'No' ? 'No' : 'OK'}</span></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Attendance comparison */}
      {tab === 'attendance' && (
        <div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 14, alignItems: 'center', flexWrap: 'wrap' }}>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>
              {attendance.length} total records
            </p>
            <div style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
              {['all','attended','full_kit'].map(f => (
                <button key={f} onClick={() => setAttFilter(f)} style={{
                  padding: '4px 10px', borderRadius: 20, fontSize: 11, cursor: 'pointer',
                  border: `1px solid ${attFilter === f ? 'var(--text)' : 'var(--border-strong)'}`,
                  background: attFilter === f ? 'var(--text)' : 'var(--bg)',
                  color: attFilter === f ? 'var(--bg)' : 'var(--text-secondary)',
                }}>{f === 'all' ? 'All sessions' : f === 'attended' ? 'Attended' : 'Full kit'}</button>
              ))}
            </div>
          </div>
          <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Student</th>
                  <th>House</th>
                  <th style={{ textAlign: 'center' }}>Total sessions</th>
                  <th style={{ textAlign: 'center' }}>Full kit</th>
                  <th style={{ textAlign: 'center' }}>Last attended</th>
                  <th style={{ textAlign: 'center' }}>Attendance %</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  // Apply filter before grouping
                  const filteredAttendance = attFilter === 'all' 
                    ? attendance 
                    : attendance.filter(a => a.attendance_type === attFilter)

                  // Group by student
                  const byStudent = {}
                  filteredAttendance.forEach(a => {
                    if (!byStudent[a.student_id]) byStudent[a.student_id] = { total: 0, fullKit: 0, last: null }
                    byStudent[a.student_id].total++
                    if (a.attendance_type === 'full_kit') byStudent[a.student_id].fullKit++
                    if (!byStudent[a.student_id].last || a.session_date > byStudent[a.student_id].last)
                      byStudent[a.student_id].last = a.session_date
                  })
                  // Total unique session dates = total possible sessions
                  const uniqueDates = new Set(filteredAttendance.map(a => a.session_date || a.attended_at?.split('T')[0])).size
                  const maxSessions = uniqueDates || Math.max(...Object.values(byStudent).map(x => x.total), 1)
                  return stats
                    .filter(s => byStudent[s.id])
                    .sort((a, b) => (byStudent[b.id]?.total || 0) - (byStudent[a.id]?.total || 0))
                    .map(s => {
                      const att = byStudent[s.id] || { total: 0, fullKit: 0, last: null }
                      const pct = Math.round((att.total / maxSessions) * 100)
                      const colour = HOUSE_COLOURS[s.house] || '#888'
                      return (
                        <tr key={s.id}>
                          <td style={{ fontWeight: 500 }}>{s.name}</td>
                          <td>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
                              <span style={{ width: 7, height: 7, borderRadius: '50%', background: colour, display: 'inline-block' }} />
                              {s.house}
                            </span>
                          </td>
                          <td style={{ textAlign: 'center', fontWeight: 700, fontSize: 15, color: '#1d9e75' }}>
                            {att.total}/{maxSessions}
                          </td>
                          <td style={{ textAlign: 'center', fontSize: 13 }}>{att.fullKit > 0 ? `✓ ${att.fullKit}` : '—'}</td>
                          <td style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-secondary)' }}>
                            {att.last ? new Date(att.last).toLocaleDateString('en-GB') : '—'}
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <div style={{ flex: 1, height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
                                <div style={{ width: `${pct}%`, height: '100%', background: colour, borderRadius: 3 }} />
                              </div>
                              <span style={{ fontSize: 11, color: 'var(--text-secondary)', minWidth: 30 }}>{pct}%</span>
                            </div>
                          </td>
                        </tr>
                      )
                    })
                })()}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Weight tracker */}
      {tab === 'weight' && (
        <div>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
            Weight data from Fit II Fight sessions. {sessions.filter(s => s.weight_before).length} entries recorded.
          </p>
          <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Student</th>
                  <th>House</th>
                  <th style={{ textAlign: 'center' }}>First weight</th>
                  <th style={{ textAlign: 'center' }}>Latest weight</th>
                  <th style={{ textAlign: 'center' }}>Change</th>
                  <th style={{ textAlign: 'center' }}>Entries</th>
                </tr>
              </thead>
              <tbody>
                {stats.filter(s => s.first_weight).sort((a,b) => Math.abs(parseFloat(b.weight_change||0)) - Math.abs(parseFloat(a.weight_change||0))).map(s => {
                  const colour = HOUSE_COLOURS[s.house] || '#888'
                  const wc = parseFloat(s.weight_change || 0)
                  const sessionCount = sessions.filter(f => f.student_id === s.id && f.weight_before).length
                  return (
                    <tr key={s.id}>
                      <td style={{ fontWeight: 500 }}>{s.name}</td>
                      <td>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
                          <span style={{ width: 7, height: 7, borderRadius: '50%', background: colour, display: 'inline-block' }} />
                          {s.house}
                        </span>
                      </td>
                      <td style={{ textAlign: 'center', fontSize: 13 }}>{s.first_weight}kg</td>
                      <td style={{ textAlign: 'center', fontSize: 13, fontWeight: 600 }}>{s.last_weight}kg</td>
                      <td style={{ textAlign: 'center', fontWeight: 700, fontSize: 14, color: wc < 0 ? '#1d9e75' : wc > 0 ? '#a32d2d' : 'var(--text-secondary)' }}>
                        {s.weight_change !== null ? `${wc > 0 ? '+' : ''}${s.weight_change}kg` : '—'}
                      </td>
                      <td style={{ textAlign: 'center', color: 'var(--text-secondary)', fontSize: 12 }}>{sessionCount}</td>
                    </tr>
                  )
                })}
                {stats.filter(s => s.first_weight).length === 0 && (
                  <tr><td colSpan={6} style={{ textAlign: 'center', padding: 32, color: 'var(--text-tertiary)' }}>No weight data yet — log sessions in Fit II Fight</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
