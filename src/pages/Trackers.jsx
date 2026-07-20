import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import { studentProfileLink } from '../lib/studentLinks.js'

const HOUSE_COLOURS = { 'Dragon House': '#E24B4A', 'Super House': '#378ADD', 'Ice House': '#1D9E75', 'Jet House': '#EF9F27' }

function SortTh({ children, col, sortKey, sortDir, onSort, style = {} }) {
  const active = sortKey === col
  return (
    <th onClick={() => onSort(col)} style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap', ...style }}>
      {children}<span style={{ marginLeft: 4, fontSize: 9, opacity: active ? 1 : 0.4 }}>{active ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}</span>
    </th>
  )
}

function Sparkline({ data, colour = '#378ADD', width = 110, height = 32, onClick, mode = 'after' }) {
  if (!data || data.length < 2) {
    return <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>—</span>
  }
  const getVal = (d, key) => key === 'before' ? d.before : key === 'after' ? (d.after ?? d.before) : d.value
  const seriesKeys = mode === 'both' ? ['before', 'after'] : [mode]
  const seriesColours = { before: '#9CA3AF', after: colour, value: colour }

  const allValues = data.flatMap(d => seriesKeys.map(k => getVal(d, k)).filter(v => v != null))
  if (allValues.length < 2) {
    return <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>—</span>
  }
  const min = Math.min(...allValues)
  const max = Math.max(...allValues)
  const range = max - min || 1
  const pad = 3
  const xFor = i => pad + (i / (data.length - 1)) * (width - pad * 2)
  const yFor = v => height - pad - ((v - min) / range) * (height - pad * 2)

  return (
    <svg width={width} height={height} style={{ display: 'block', cursor: onClick ? 'pointer' : 'default' }} onClick={onClick}>
      {seriesKeys.map(key => {
        const pts = data.map((d, i) => {
          const v = getVal(d, key)
          return v != null ? `${xFor(i)},${yFor(v)}` : null
        }).filter(Boolean).join(' ')
        return <polyline key={key} points={pts} fill="none" stroke={seriesColours[key]} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      })}
      {data.map((d, i) => {
        const dateLabel = d.date ? new Date(d.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : ''
        return (
          <g key={i}>
            {seriesKeys.map(key => {
              const v = getVal(d, key)
              if (v == null) return null
              const x = xFor(i), y = yFor(v)
              return (
                <g key={key}>
                  <circle cx={x} cy={y} r={6} fill="transparent">
                    <title>{dateLabel}{mode === 'both' ? ` (${key})` : ''}: {v}kg</title>
                  </circle>
                  <circle cx={x} cy={y} r={i === data.length - 1 ? 2.5 : 1.5} fill={seriesColours[key]} />
                </g>
              )
            })}
          </g>
        )
      })}
    </svg>
  )
}

export default function Trackers() {
  const [tab, setTab]               = useState('dashboard')
  const [attendance, setAttendance]   = useState([])
  const [attFilter, setAttFilter]     = useState('all')
  const [attDateFrom, setAttDateFrom] = useState('')
  const [attDateTo, setAttDateTo]     = useState('')
  const [attSortKey, setAttSortKey]   = useState('total')
  const [attSortDir, setAttSortDir]   = useState('desc')
  const [calendarFor, setCalendarFor] = useState(null) // student stats object, or null
  const [calendarMonth, setCalendarMonth] = useState(() => { const d = new Date(); return { year: d.getFullYear(), month: d.getMonth() } })
  const [students, setStudents]     = useState([])
  const [weightViewN, setWeightViewN] = useState(5)
  const [weightMode, setWeightMode] = useState('after')
  const [weightSheetFor, setWeightSheetFor] = useState(null) // student stats object, or null
  const [sheetEntries, setSheetEntries] = useState([])
  const [savingEntry, setSavingEntry] = useState(null)
  const [sessions, setSessions]     = useState([])
  const [allMembers, setAllMembers] = useState([]) // for join/stop duration tracking
  const [weightDivisions, setWeightDivisions] = useState({}) // student_id -> weight_division (comp weight)
  const [loading, setLoading]       = useState(true)
  const [search, setSearch]         = useState('')
  const [houseFilter, setHouseFilter] = useState('')
  const [sortKey, setSortKey]       = useState('total_sessions')
  const [sortDir, setSortDir]       = useState('desc')

  useEffect(() => { load() }, [])

  async function load() {
    const [{ data: s }, { data: f }, { data: m }, { data: ap }] = await Promise.all([
      supabase.from('students').select('*, members(first_name, last_name, date_of_birth, status, houses(name))').eq('discipline', 'PKA'),
      supabase.from('fit2fight_sessions').select('*').order('session_date', { ascending: false }),
      supabase.from('members').select('id, first_name, last_name, joined_date, status, stopped_at'),
      supabase.from('athlete_profiles').select('student_id, weight_division'),
    ])
    setStudents(s || [])
    setSessions(f || [])
    setAllMembers(m || [])
    setWeightDivisions(Object.fromEntries((ap || []).map(r => [r.student_id, r.weight_division])))
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

  function getModeValue(d, mode) {
    if (mode === 'before') return d.before
    if (mode === 'after') return d.after ?? d.before
    return d.value // 'both' falls back to the standard value for single-number contexts
  }

  function changeOverLastN(history, n, mode = 'after') {
    if (!history || history.length < 2) return null
    const slice = n === 'all' ? history : history.slice(-n)
    const valid = slice.filter(d => getModeValue(d, mode) != null)
    if (valid.length < 2) return null
    const diff = getModeValue(valid[valid.length - 1], mode) - getModeValue(valid[0], mode)
    return diff.toFixed(1)
  }

  function valuesOverLastN(history, n, mode = 'after') {
    if (!history || history.length === 0) return []
    const slice = n === 'all' ? history : history.slice(-n)
    return slice.map(d => ({ date: d.date, value: getModeValue(d, mode) })).filter(d => d.value != null)
  }

  function parseCompWeight(text) {
    if (!text) return null
    const match = String(text).match(/(\d+(\.\d+)?)/)
    return match ? parseFloat(match[1]) : null
  }

  async function openWeightSheet(s) {
    setWeightSheetFor(s)
    const { data } = await supabase.from('fit2fight_sessions')
      .select('id, session_date, weight_before, weight_after')
      .eq('student_id', s.id)
      .order('session_date', { ascending: false })
    setSheetEntries((data || []).filter(e => e.weight_before != null || e.weight_after != null))
  }

  async function saveSheetEntry(entry) {
    setSavingEntry(entry.id)
    const payload = { weight_before: entry.weight_before === '' ? null : entry.weight_before, weight_after: entry.weight_after === '' ? null : entry.weight_after }
    const { error } = await supabase.from('fit2fight_sessions').update(payload).eq('id', entry.id)
    if (error) { alert('Error saving: ' + error.message); setSavingEntry(null); return }
    setSheetEntries(prev => prev.map(e => e.id === entry.id ? { ...e, ...payload } : e))
    setSessions(prev => prev.map(f => f.id === entry.id ? { ...f, ...payload } : f))
    setSavingEntry(null)
  }

  async function addSheetEntry() {
    if (!weightSheetFor) return
    const today = new Date().toISOString().split('T')[0]
    const { data, error } = await supabase.from('fit2fight_sessions')
      .insert({ student_id: weightSheetFor.id, session_date: today })
      .select().single()
    if (error) { alert('Error adding entry: ' + error.message); return }
    setSheetEntries(prev => [data, ...prev])
    setSessions(prev => [data, ...prev])
  }

  async function deleteSheetEntry(entry) {
    if (!confirm(`Delete the ${new Date(entry.session_date).toLocaleDateString('en-GB')} entry?`)) return
    const { error } = await supabase.from('fit2fight_sessions').delete().eq('id', entry.id)
    if (error) { alert('Error deleting: ' + error.message); return }
    setSheetEntries(prev => prev.filter(e => e.id !== entry.id))
    setSessions(prev => prev.filter(f => f.id !== entry.id))
  }

  async function saveCompWeight(studentId, value) {
    const { error } = await supabase.from('athlete_profiles').upsert({ student_id: studentId, weight_division: value }, { onConflict: 'student_id' })
    if (error) { alert('Error saving comp weight: ' + error.message); return }
    setWeightDivisions(prev => ({ ...prev, [studentId]: value }))
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
    const firstWeightDate = weights[0]?.date
    const lastWeight  = weights[weights.length-1]?.after || weights[weights.length-1]?.before
    const lastWeightDate = weights[weights.length-1]?.date
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
      first_weight_date: firstWeightDate, last_weight_date: lastWeightDate,
      weight_history: weights.map(w => ({
        date: w.date,
        before: w.before != null ? parseFloat(w.before) : null,
        after: w.after != null ? parseFloat(w.after) : null,
        value: parseFloat(w.after ?? w.before), // kept for back-compat where a single value is needed
      })),
      comp_weight: weightDivisions[s.id] || null,
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
  const totalStudents = students.filter(s => s.members?.status !== 'stopped' && s.members?.status !== 'not_started').length
  const avgSessions = totalStudents > 0 ? (sessions.length / totalStudents).toFixed(1) : 0

  // "Trained this month" -- real attendance (attended + full kit), not
  // Fit II Fight logs, plus a per-day breakdown for the graph below
  const now = new Date()
  const attendanceThisMonth = attendance.filter(a => {
    const d = new Date(a.attended_at)
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
  })
  const attendedCount = attendanceThisMonth.filter(a => a.attendance_type !== 'full_kit').length
  const fullKitCount = attendanceThisMonth.filter(a => a.attendance_type === 'full_kit').length
  const trainedThisMonth = attendedCount + fullKitCount

  const dayMap = {}
  attendanceThisMonth.forEach(a => {
    const day = new Date(a.attended_at).toISOString().split('T')[0]
    dayMap[day] = (dayMap[day] || 0) + 1
  })
  const trainedByDay = Object.entries(dayMap).map(([date, count]) => ({ date, count })).sort((a,b) => a.date.localeCompare(b.date))
  const maxDayCount = Math.max(1, ...trainedByDay.map(d => d.count))

  // New members this month
  const newMembersThisMonth = allMembers.filter(m => {
    if (!m.joined_date) return false
    const d = new Date(m.joined_date)
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
  }).length

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

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 10 }}>
            {[
              { label: 'Total students', value: totalStudents, colour: '#378ADD', icon: '🎽' },
              { label: 'Trained this month', value: trainedThisMonth, colour: '#1D9E75', icon: '💪' },
              { label: 'Avg sessions/student', value: avgSessions, colour: '#EF9F27', icon: '📈' },
              { label: 'New members this month', value: newMembersThisMonth, colour: '#E24B4A', icon: '🆕' },
            ].map(s => (
              <div key={s.label} className="card" style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 28, marginBottom: 4 }}>{s.icon}</div>
                <div style={{ fontSize: 26, fontWeight: 700, color: s.colour }}>{s.value}</div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>{s.label}</div>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 16, marginBottom: 20, fontSize: 12, color: 'var(--text-secondary)', paddingLeft: 2 }}>
            <span>✓ Attended: <strong style={{ color: 'var(--text)' }}>{attendedCount}</strong></span>
            <span>✓ Full kit: <strong style={{ color: 'var(--text)' }}>{fullKitCount}</strong></span>
          </div>

          {/* Students trained per day this month */}
          <div className="card" style={{ marginBottom: 20 }}>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 14 }}>📅 Students trained per day — this month</div>
            {trainedByDay.length === 0 ? (
              <p style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>No attendance recorded yet this month.</p>
            ) : (
              <>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 110, borderBottom: '1px solid var(--border)', paddingBottom: 4, overflowX: 'auto' }}>
                  {trainedByDay.map(d => (
                    <div key={d.date} title={`${new Date(d.date).toLocaleDateString('en-GB')}: ${d.count} trained`} style={{ flex: 1, minWidth: 6, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                      <div style={{
                        width: '100%', minHeight: d.count ? 3 : 0,
                        height: `${(d.count / maxDayCount) * 90}px`,
                        background: '#1D9E75', borderRadius: '2px 2px 0 0',
                      }} />
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 3, marginTop: 4 }}>
                  {trainedByDay.map(d => (
                    <div key={d.date} style={{ flex: 1, minWidth: 6, textAlign: 'center', fontSize: 8, color: 'var(--text-tertiary)' }}>
                      {new Date(d.date).getDate()}
                    </div>
                  ))}
                </div>
              </>
            )}
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
                      <td style={{ fontSize: 13 }}><Link to={studentProfileLink(s)} style={{ color: 'var(--text)', textDecoration: 'underline' }}>{s.name}</Link></td>
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
                      <td style={{ fontSize: 13 }}>
                        <Link to={`/athletes?id=${s.id}&tab=fit2fight`} style={{ color: 'var(--text)', textDecoration: 'underline' }}>{s.name}</Link>
                      </td>
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
                      <td style={{ fontWeight: 500, whiteSpace: 'nowrap' }}><Link to={studentProfileLink(s)} style={{ color: 'var(--text)', textDecoration: 'underline' }}>{s.name}</Link></td>
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
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input type="date" value={attDateFrom} onChange={e => setAttDateFrom(e.target.value)}
                style={{ fontSize: 12, padding: '4px 6px', border: '1px solid var(--border-strong)', borderRadius: 6, background: 'var(--bg-secondary)', color: 'var(--text)' }} />
              <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>to</span>
              <input type="date" value={attDateTo} onChange={e => setAttDateTo(e.target.value)}
                style={{ fontSize: 12, padding: '4px 6px', border: '1px solid var(--border-strong)', borderRadius: 6, background: 'var(--bg-secondary)', color: 'var(--text)' }} />
              {(attDateFrom || attDateTo) && (
                <button className="btn btn-sm" style={{ fontSize: 11 }} onClick={() => { setAttDateFrom(''); setAttDateTo('') }}>Clear</button>
              )}
            </div>
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
                  <SortTh col="name" sortKey={attSortKey} sortDir={attSortDir} onSort={k => { if (attSortKey===k) setAttSortDir(d=>d==='asc'?'desc':'asc'); else { setAttSortKey(k); setAttSortDir('asc') } }}>Student</SortTh>
                  <SortTh col="house" sortKey={attSortKey} sortDir={attSortDir} onSort={k => { if (attSortKey===k) setAttSortDir(d=>d==='asc'?'desc':'asc'); else { setAttSortKey(k); setAttSortDir('asc') } }}>House</SortTh>
                  <SortTh col="total" sortKey={attSortKey} sortDir={attSortDir} onSort={k => { if (attSortKey===k) setAttSortDir(d=>d==='asc'?'desc':'asc'); else { setAttSortKey(k); setAttSortDir('asc') } }} style={{ textAlign: 'center' }}>Total sessions</SortTh>
                  <SortTh col="fullKit" sortKey={attSortKey} sortDir={attSortDir} onSort={k => { if (attSortKey===k) setAttSortDir(d=>d==='asc'?'desc':'asc'); else { setAttSortKey(k); setAttSortDir('asc') } }} style={{ textAlign: 'center' }}>Full kit</SortTh>
                  <SortTh col="last" sortKey={attSortKey} sortDir={attSortDir} onSort={k => { if (attSortKey===k) setAttSortDir(d=>d==='asc'?'desc':'asc'); else { setAttSortKey(k); setAttSortDir('asc') } }} style={{ textAlign: 'center' }}>Last attended</SortTh>
                  <SortTh col="pct" sortKey={attSortKey} sortDir={attSortDir} onSort={k => { if (attSortKey===k) setAttSortDir(d=>d==='asc'?'desc':'asc'); else { setAttSortKey(k); setAttSortDir('asc') } }} style={{ textAlign: 'center' }}>Attendance %</SortTh>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  // Apply type + date filters before grouping
                  let filteredAttendance = attFilter === 'all' 
                    ? attendance 
                    : attendance.filter(a => a.attendance_type === attFilter)
                  if (attDateFrom) filteredAttendance = filteredAttendance.filter(a => (a.session_date || a.attended_at?.split('T')[0]) >= attDateFrom)
                  if (attDateTo) filteredAttendance = filteredAttendance.filter(a => (a.session_date || a.attended_at?.split('T')[0]) <= attDateTo)

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
                  const rows = stats
                    .filter(s => byStudent[s.id])
                    .map(s => ({ s, att: byStudent[s.id] || { total: 0, fullKit: 0, last: null }, pct: Math.round(((byStudent[s.id]?.total || 0) / maxSessions) * 100) }))
                  rows.sort((a, b) => {
                    let av, bv
                    if (attSortKey === 'name') { av = a.s.name; bv = b.s.name }
                    else if (attSortKey === 'house') { av = a.s.house; bv = b.s.house }
                    else if (attSortKey === 'total') { av = a.att.total; bv = b.att.total }
                    else if (attSortKey === 'fullKit') { av = a.att.fullKit; bv = b.att.fullKit }
                    else if (attSortKey === 'last') { av = a.att.last || ''; bv = b.att.last || '' }
                    else { av = a.pct; bv = b.pct }
                    if (av < bv) return attSortDir === 'asc' ? -1 : 1
                    if (av > bv) return attSortDir === 'asc' ? 1 : -1
                    return 0
                  })
                  return rows.map(({ s, att, pct }) => {
                      const colour = HOUSE_COLOURS[s.house] || '#888'
                      return (
                        <tr key={s.id}>
                          <td style={{ fontWeight: 500 }}><Link to={studentProfileLink(s)} style={{ color: 'var(--text)', textDecoration: 'underline' }}>{s.name}</Link></td>
                          <td>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
                              <span style={{ width: 7, height: 7, borderRadius: '50%', background: colour, display: 'inline-block' }} />
                              {s.house}
                            </span>
                          </td>
                          <td style={{ textAlign: 'center', fontWeight: 700, fontSize: 15, color: '#1d9e75', cursor: 'pointer' }}
                            onClick={() => setCalendarFor(s)} title="Click to view calendar">
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

          {/* Attendance calendar modal */}
          {calendarFor && (() => {
            const { year, month } = calendarMonth
            const firstDay = new Date(year, month, 1)
            const startWeekday = (firstDay.getDay() + 6) % 7 // Monday-first
            const daysInMonth = new Date(year, month + 1, 0).getDate()

            // All club training days this month (any student's attendance)
            const allTrainingDays = new Set(
              attendance
                .map(a => a.session_date || a.attended_at?.split('T')[0])
                .filter(d => d && new Date(d).getFullYear() === year && new Date(d).getMonth() === month)
            )
            // This student's attended days this month
            const attendedDays = new Set(
              attendance
                .filter(a => a.student_id === calendarFor.id)
                .map(a => a.session_date || a.attended_at?.split('T')[0])
                .filter(d => d && new Date(d).getFullYear() === year && new Date(d).getMonth() === month)
            )

            const cells = []
            for (let i = 0; i < startWeekday; i++) cells.push(null)
            for (let d = 1; d <= daysInMonth; d++) cells.push(d)

            return (
              <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 }}
                onClick={() => setCalendarFor(null)}>
                <div className="card" style={{ width: '100%', maxWidth: 420 }} onClick={e => e.stopPropagation()}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <h2 style={{ fontSize: 15, fontWeight: 600 }}>{calendarFor.name}</h2>
                    <button onClick={() => setCalendarFor(null)} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer' }}>✕</button>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <button className="btn btn-sm" onClick={() => setCalendarMonth(m => m.month === 0 ? { year: m.year - 1, month: 11 } : { year: m.year, month: m.month - 1 })}>←</button>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{new Date(year, month, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</span>
                    <button className="btn btn-sm" onClick={() => setCalendarMonth(m => m.month === 11 ? { year: m.year + 1, month: 0 } : { year: m.year, month: m.month + 1 })}>→</button>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 4, marginBottom: 8 }}>
                    {['Mo','Tu','We','Th','Fr','Sa','Su'].map(d => (
                      <div key={d} style={{ textAlign: 'center', fontSize: 10, color: 'var(--text-tertiary)' }}>{d}</div>
                    ))}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 4 }}>
                    {cells.map((d, i) => {
                      if (d === null) return <div key={i} />
                      const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`
                      const attended = attendedDays.has(dateStr)
                      const wasTrainingDay = allTrainingDays.has(dateStr)
                      const bg = attended ? '#1D9E75' : wasTrainingDay ? '#E24B4A' : 'transparent'
                      const fg = attended || wasTrainingDay ? '#fff' : 'var(--text-secondary)'
                      return (
                        <div key={i} title={attended ? 'Attended' : wasTrainingDay ? 'Missed' : ''} style={{
                          aspectRatio: '1', display: 'flex', alignItems: 'center', justifyContent: 'center',
                          borderRadius: 6, fontSize: 12, background: bg, color: fg,
                          border: !attended && !wasTrainingDay ? '1px solid var(--border)' : 'none',
                        }}>{d}</div>
                      )
                    })}
                  </div>
                  <div style={{ display: 'flex', gap: 14, marginTop: 14, fontSize: 11, color: 'var(--text-secondary)' }}>
                    <span><span style={{ display: 'inline-block', width: 8, height: 8, background: '#1D9E75', borderRadius: 2, marginRight: 4 }} />Attended</span>
                    <span><span style={{ display: 'inline-block', width: 8, height: 8, background: '#E24B4A', borderRadius: 2, marginRight: 4 }} />Missed</span>
                  </div>
                  <p style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 10 }}>
                    "Missed" means the club had a session that day and this student didn't attend — it doesn't check whether that specific class was actually on their schedule.
                  </p>
                </div>
              </div>
            )
          })()}
        </div>
      )}

      {/* Weight tracker */}
      {tab === 'weight' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>
              Weight data from Fit II Fight sessions and Check-in weigh-ins. {sessions.filter(s => s.weight_before).length} entries recorded.
            </p>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Show weights:</span>
              {[1, 5, 10, 'all'].map(n => (
                <button key={n} onClick={() => setWeightViewN(n)} style={{
                  padding: '4px 10px', borderRadius: 20, fontSize: 11, cursor: 'pointer',
                  border: `1px solid ${weightViewN === n ? 'var(--text)' : 'var(--border-strong)'}`,
                  background: weightViewN === n ? 'var(--text)' : 'var(--bg)',
                  color: weightViewN === n ? 'var(--bg)' : 'var(--text-secondary)',
                }}>{n === 'all' ? 'All' : n === 1 ? 'Last' : `Last ${n}`}</button>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 12 }}>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Graph & values show:</span>
            {[['before', 'Before'], ['after', 'After'], ['both', 'Both']].map(([key, label]) => (
              <button key={key} onClick={() => setWeightMode(key)} style={{
                padding: '4px 10px', borderRadius: 20, fontSize: 11, cursor: 'pointer',
                border: `1px solid ${weightMode === key ? 'var(--text)' : 'var(--border-strong)'}`,
                background: weightMode === key ? 'var(--text)' : 'var(--bg)',
                color: weightMode === key ? 'var(--bg)' : 'var(--text-secondary)',
              }}>{label}</button>
            ))}
          </div>
          <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Student</th>
                  <th>House</th>
                  <th style={{ textAlign: 'center' }}>Trend</th>
                  <th style={{ textAlign: 'center' }}>{weightViewN === 'all' ? 'All weights' : weightViewN === 1 ? 'Last weight' : `Last ${weightViewN} weights`}</th>
                  <th style={{ textAlign: 'center' }}>Current weight</th>
                  <th style={{ textAlign: 'center' }}>Comp weight</th>
                  <th style={{ textAlign: 'center' }}>% diff</th>
                  <th style={{ textAlign: 'center' }}>Entries</th>
                </tr>
              </thead>
              <tbody>
                {stats.filter(s => s.first_weight).sort((a,b) => Math.abs(parseFloat(b.weight_change||0)) - Math.abs(parseFloat(a.weight_change||0))).map(s => {
                  const colour = HOUSE_COLOURS[s.house] || '#888'
                  const change = changeOverLastN(s.weight_history, weightViewN, weightMode)
                  const values = valuesOverLastN(s.weight_history, weightViewN, weightMode)
                  const compNum = parseCompWeight(s.comp_weight)
                  const modeValues = s.weight_history?.map(d => getModeValue(d, weightMode)).filter(v => v != null) || []
                  const currentNum = modeValues.length ? modeValues[modeValues.length - 1] : null
                  const pctDiff = (compNum && currentNum) ? (((currentNum - compNum) / compNum) * 100).toFixed(1) : null
                  const sessionCount = sessions.filter(f => f.student_id === s.id && f.weight_before).length
                  return (
                    <tr key={s.id}>
                      <td style={{ fontWeight: 500 }}><Link to={studentProfileLink(s)} style={{ color: 'var(--text)', textDecoration: 'underline' }}>{s.name}</Link></td>
                      <td>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
                          <span style={{ width: 7, height: 7, borderRadius: '50%', background: colour, display: 'inline-block' }} />
                          {s.house}
                        </span>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <Sparkline data={s.weight_history} colour={colour} onClick={() => openWeightSheet(s)} mode={weightMode} />
                      </td>
                      <td style={{ textAlign: 'center', cursor: 'pointer' }} onClick={() => openWeightSheet(s)}>
                        <div style={{ display: 'flex', gap: 4, justifyContent: 'center', flexWrap: 'wrap', maxWidth: 220 }}>
                          {values.map((v, i) => (
                            <span key={i} title={v.date ? new Date(v.date).toLocaleDateString('en-GB') : ''}
                              style={{ fontSize: 12, fontWeight: i === values.length - 1 ? 700 : 400, color: i === values.length - 1 ? 'var(--text)' : 'var(--text-secondary)' }}>
                              {v.value}{i < values.length - 1 ? 'kg →' : 'kg'}
                            </span>
                          ))}
                          {values.length === 0 && <span style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>—</span>}
                        </div>
                      </td>
                      <td style={{ textAlign: 'center', fontWeight: 700, fontSize: 14, cursor: 'pointer' }} onClick={() => openWeightSheet(s)}>
                        {currentNum ? `${currentNum}kg` : '—'}
                      </td>
                      <td style={{ textAlign: 'center', fontSize: 13 }} onClick={e => e.stopPropagation()}>
                        <input defaultValue={s.comp_weight || ''} placeholder="e.g. -60kg"
                          onBlur={e => { if (e.target.value !== (s.comp_weight || '')) saveCompWeight(s.id, e.target.value || null) }}
                          style={{ width: 90, padding: '4px 6px', fontSize: 12, textAlign: 'center', border: '1px solid var(--border-strong)', borderRadius: 6, background: 'var(--bg-secondary)', color: 'var(--text)' }} />
                      </td>
                      <td style={{ textAlign: 'center', fontWeight: 600, fontSize: 13, color: pctDiff === null ? 'var(--text-tertiary)' : parseFloat(pctDiff) > 0 ? '#a32d2d' : parseFloat(pctDiff) < 0 ? '#1d9e75' : 'var(--text-secondary)' }}>
                        {pctDiff !== null ? `${pctDiff > 0 ? '+' : ''}${pctDiff}%` : '—'}
                      </td>
                      <td style={{ textAlign: 'center', color: 'var(--text-secondary)', fontSize: 12, cursor: 'pointer' }} onClick={() => openWeightSheet(s)}>{sessionCount}</td>
                    </tr>
                  )
                })}
                {stats.filter(s => s.first_weight).length === 0 && (
                  <tr><td colSpan={8} style={{ textAlign: 'center', padding: 32, color: 'var(--text-tertiary)' }}>No weight data yet — log sessions in Fit II Fight or Check-in</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Full spreadsheet view — all weight entries for one athlete, editable */}
          {weightSheetFor && (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 }}
              onClick={() => setWeightSheetFor(null)}>
              <div className="card" style={{ width: '100%', maxWidth: 560, maxHeight: '85vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                  <h2 style={{ fontSize: 16, fontWeight: 600 }}>{weightSheetFor.name} — all weight entries</h2>
                  <button onClick={() => setWeightSheetFor(null)} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer' }}>✕</button>
                </div>
                <button className="btn btn-sm btn-primary" style={{ marginBottom: 10 }} onClick={addSheetEntry}>+ Add entry (today)</button>
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th style={{ textAlign: 'center' }}>Before (kg)</th>
                      <th style={{ textAlign: 'center' }}>After (kg)</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {sheetEntries.map(entry => (
                      <tr key={entry.id}>
                        <td style={{ fontSize: 12 }}>{new Date(entry.session_date).toLocaleDateString('en-GB')}</td>
                        <td style={{ textAlign: 'center' }}>
                          <input type="number" step="0.1" defaultValue={entry.weight_before ?? ''}
                            onBlur={e => { const v = e.target.value === '' ? null : parseFloat(e.target.value); if (v !== entry.weight_before) saveSheetEntry({ ...entry, weight_before: v }) }}
                            style={{ width: 64, padding: '3px 5px', fontSize: 12, textAlign: 'center', border: '1px solid var(--border-strong)', borderRadius: 6, background: 'var(--bg-secondary)', color: 'var(--text)' }} />
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <input type="number" step="0.1" defaultValue={entry.weight_after ?? ''}
                            onBlur={e => { const v = e.target.value === '' ? null : parseFloat(e.target.value); if (v !== entry.weight_after) saveSheetEntry({ ...entry, weight_after: v }) }}
                            style={{ width: 64, padding: '3px 5px', fontSize: 12, textAlign: 'center', border: '1px solid var(--border-strong)', borderRadius: 6, background: 'var(--bg-secondary)', color: 'var(--text)' }} />
                        </td>
                        <td>
                          {savingEntry === entry.id
                            ? <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>saving…</span>
                            : <button onClick={() => deleteSheetEntry(entry)} style={{ background: 'none', border: '1px solid #a32d2d', color: '#a32d2d', borderRadius: 6, padding: '2px 7px', fontSize: 10, cursor: 'pointer' }}>Delete</button>}
                        </td>
                      </tr>
                    ))}
                    {sheetEntries.length === 0 && (
                      <tr><td colSpan={4} style={{ textAlign: 'center', padding: 20, color: 'var(--text-tertiary)' }}>No entries yet</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
