import { useEffect, useState, useCallback, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../hooks/useAuth.jsx'
import { useBackableTab } from '../hooks/useBackableTab.js'
import { studentProfileLink } from '../lib/studentLinks.js'

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
const HOUSE_LOGOS = {
  'Dragon House': '/logos/house-dragon.png',
  'Super House':  '/logos/house-super.png',
  'Ice House':    '/logos/house-ice.png',
  'Jet House':    '/logos/house-jet.png',
}
const HOUSE_TEXT_LOGOS = {
  'Dragon House': '/logos/text-dragon.png',
  'Super House':  '/logos/text-super.png',
  'Ice House':    '/logos/text-ice.png',
  'Jet House':    '/logos/text-jet.png',
}
const HOUSE_BG = {
  'Dragon House': '#fcebeb',
  'Super House':  '#e6f1fb',
  'Ice House':    '#e1f5ee',
  'Jet House':    '#faeeda',
}

const TABS = ['House league', 'Individual', 'Student house', 'Score check', 'Points log']

// Press-and-hold a name to open a quick profile popup, instead of a
// normal tap navigating straight to the student's profile page --
// keeps the coach/admin on whatever League tab they're currently
// looking at. Uses the same onPointerDown/onPointerUp + timer pattern
// already established elsewhere in the app for hold gestures (works
// for both mouse and touch via Pointer Events).
function HoldableName({ student, name, onHold, style }) {
  const holdTimer = useRef(null)
  const heldRef = useRef(false)
  return (
    <span
      onPointerDown={() => {
        heldRef.current = false
        holdTimer.current = setTimeout(() => {
          heldRef.current = true
          onHold(student)
        }, 500)
      }}
      onPointerUp={() => clearTimeout(holdTimer.current)}
      onPointerLeave={() => clearTimeout(holdTimer.current)}
      onClick={e => { e.preventDefault(); heldRef.current = false }}
      style={{ cursor: 'pointer', userSelect: 'none', ...style }}
    >
      {name || student.name}
    </span>
  )
}

export default function LeagueViews() {
  const { isAdmin } = useAuth()
  const navigate = useNavigate()
  const [tab, setTab] = useBackableTab('House league')
  const [showMedals, setShowMedals] = useState(true)

  // Date filter — default current season
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date(); d.setMonth(d.getMonth() - 3)
    return d.toISOString().split('T')[0]
  })
  const [dateTo, setDateTo] = useState(new Date().toISOString().split('T')[0])
  const [classFilter, setClassFilter] = useState('All')
  const [selectedClassId, setSelectedClassId] = useState('')
  const [timetableClasses, setTimetableClasses] = useState([])
  const [studentClassMap, setStudentClassMap] = useState({}) // student_id -> Set of class_ids they're assigned to

  // Data
  const [houseStandings, setHouseStandings] = useState([])
  const [editingHouse, setEditingHouse] = useState(null)
  const [savingHouse, setSavingHouse] = useState(false)
  const [individualRankings, setIndividualRankings] = useState([])
  const [houses, setHouses] = useState([])
  const [pointsLog, setPointsLog] = useState([])
  const [indivSortKey, setIndivSortKey] = useState('total')
  const [topN, setTopN] = useState(50)
  const [houseTopN, setHouseTopN] = useState(8)
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
  const [scoreHistoryOpen, setScoreHistoryOpen] = useState(false) // shows the score-history popup using searchResults, without switching to Score check tab
  const [profilePopupFor, setProfilePopupFor] = useState(null) // student object for the hold-triggered quick-profile popup
  const [fullProfileModal, setFullProfileModal] = useState(null) // richer profile fetched on demand, shown as a second same-page popup (never navigates away)
  const [loadingFullProfile, setLoadingFullProfile] = useState(false)
  const [editVal, setEditVal] = useState('')
  const [saving, setSaving] = useState(false)

  const CLASS_OPTIONS = ['All', 'Class', 'PTs', 'KR', 'Leader', 'KRBA']

  // Real classes from the timetable, for the "Class" option's sub-list
  // -- "GB ..." sessions (GB Boxing/GB S&C/GB Training) are deliberately
  // excluded, matched by name prefix since is_custom isn't consistent
  // across them (some are flagged individual sessions, some aren't).
  useEffect(() => {
    async function loadTimetableClasses() {
      const [{ data: classesData }, assignmentsData] = await Promise.all([
        supabase.from('classes').select('id, name, day_of_week, start_time')
          .eq('active', true).order('day_of_week').order('start_time'),
        fetchAllRows(() => supabase.from('student_class_assignments').select('student_id, class_id')),
      ])
      setTimetableClasses((classesData || []).filter(c => !c.name?.toUpperCase().startsWith('GB')))
      const map = {}
      for (const a of assignmentsData) {
        (map[a.student_id] ||= new Set()).add(a.class_id)
      }
      setStudentClassMap(map)
    }
    loadTimetableClasses()
  }, [])

  // classFilter was fully wired up in the UI (dropdown + triggers a
  // reload) but never actually used to filter anything -- selecting an
  // option just reloaded the same unfiltered data every time. This
  // checks a student against the selected filter; "Class" means a
  // regular PKA-discipline student who isn't specifically KR/PTs/
  // Leader (matches the same Groups convention used in Registers.jsx)
  // UNLESS a specific timetable class has been picked from the
  // sub-list, in which case it checks actual class assignment instead.
  function studentMatchesClassFilter(s) {
    if (classFilter === 'All') return true
    if (classFilter === 'KR') return !!s.is_kr
    if (classFilter === 'PTs') return !!s.is_pts
    if (classFilter === 'Leader') return !!s.is_leader
    if (classFilter === 'KRBA') return s.discipline === 'KRBA'
    if (classFilter === 'Class') {
      if (selectedClassId) return !!studentClassMap[s.id]?.has(selectedClassId)
      return s.discipline !== 'KRBA' && !s.is_kr && !s.is_pts && !s.is_leader
    }
    return true
  }

  useEffect(() => { loadAll() }, [dateFrom, dateTo, classFilter, selectedClassId])

  // Load saved "show top" selections and date range so the public
  // league display can mirror whatever is currently set here. dateFrom
  // is kept as whatever was last saved (a season start date shouldn't
  // move on its own). dateTo: read from settings, but only actually
  // use it if it's today or later -- a forgotten stale PAST date still
  // falls back to live "today" automatically (the original problem
  // this was guarding against), but a deliberately chosen FUTURE end
  // date (e.g. extending the league period to a set finish date) is
  // now respected instead of being silently overwritten back to
  // "today" on every single page load, which is what broke a real
  // admin-chosen end date before.
  useEffect(() => {
    supabase.from('settings').select('key,value').in('key', ['league_topn_individual', 'league_topn_house', 'league_date_from', 'league_date_to'])
      .then(({ data }) => {
        const map = Object.fromEntries((data || []).map(r => [r.key, r.value]))
        if (map.league_topn_individual) setTopN(map.league_topn_individual)
        if (map.league_topn_house) setHouseTopN(map.league_topn_house)
        if (map.league_date_from) setDateFrom(map.league_date_from)
        const todayStr = new Date().toISOString().split('T')[0]
        const resolvedTo = (map.league_date_to && map.league_date_to >= todayStr) ? map.league_date_to : todayStr
        setDateTo(resolvedTo)
        if (resolvedTo !== map.league_date_to) {
          supabase.from('settings').upsert({ key: 'league_date_to', value: resolvedTo }, { onConflict: 'key' })
        }
      })
  }, [])

  async function updateTopN(n) {
    setTopN(n)
    const { error } = await supabase.from('settings').upsert({ key: 'league_topn_individual', value: n }, { onConflict: 'key' })
    if (error) alert('Error saving "show top" setting: ' + error.message)
  }

  async function updateHouseTopN(n) {
    setHouseTopN(n)
    const { error } = await supabase.from('settings').upsert({ key: 'league_topn_house', value: n }, { onConflict: 'key' })
    if (error) alert('Error saving "show top" setting: ' + error.message)
  }

  async function updateDateRange(from, to) {
    setDateFrom(from)
    setDateTo(to)
    await supabase.from('settings').upsert({ key: 'league_date_from', value: from }, { onConflict: 'key' })
    await supabase.from('settings').upsert({ key: 'league_date_to', value: to }, { onConflict: 'key' })
  }

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

  // Supabase/PostgREST caps any query with no explicit range at 1000
  // rows -- fine for small clubs, but a date range spanning a year (or
  // a growing student roster) can easily exceed that, silently
  // dropping rows past the cutoff with no error and no warning. This
  // fetches every matching page until exhausted, so aggregates (house/
  // individual point totals) are always computed from the complete
  // data set regardless of how large it's grown.
  async function fetchAllRows(buildQuery) {
    const pageSize = 1000
    let allRows = []
    let from = 0
    while (true) {
      const { data, error } = await buildQuery().range(from, from + pageSize - 1)
      if (error) { console.error('Pagination fetch error:', error); break }
      allRows = allRows.concat(data || [])
      if (!data || data.length < pageSize) break
      from += pageSize
    }
    return allRows
  }

  async function loadHouseStandings() {
    // Fetch points_log, students, and members SEPARATELY to avoid unreliable nested joins
    const [ptsData, studentsData, { data: housesData }] = await Promise.all([
      fetchAllRows(() => supabase.from('points_log')
        .select('points_awarded, point_scope, student_id')
        .gte('awarded_at', dateFrom)
        .lte('awarded_at', dateTo + 'T23:59:59')
        .in('point_scope', ['house', 'both'])),
      fetchAllRows(() => supabase.from('students').select('id, house_name, member_id, is_kr, is_pts, is_leader, discipline, members(houses(name))')),
      supabase.from('houses').select('id, name, points, wins, draws, losses, members(count)'),
    ])

    // Build student → house lookup, respecting the class/group filter
    const studentHouseMap = {}
    for (const s of (studentsData || [])) {
      if (!studentMatchesClassFilter(s)) continue
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
    const [ptsData, studentsData] = await Promise.all([
      fetchAllRows(() => supabase.from('points_log')
        .select('points_awarded, point_scope, point_type, student_id')
        .gte('awarded_at', dateFrom)
        .lte('awarded_at', dateTo + 'T23:59:59')),
      fetchAllRows(() => supabase.from('students')
        .select('id, student_ref, class_champion_count, house_name, member_id, is_kr, is_pts, is_leader, discipline, members(first_name, last_name, date_of_birth, houses(name))')),
    ])
    if (!ptsData) return

    // Build student lookup, respecting the class/group filter
    const studentMap = {}
    for (const s of (studentsData || [])) {
      if (!studentMatchesClassFilter(s)) continue
      const m = s.members
      studentMap[s.id] = {
        ref: s.student_ref,
        name: `${m?.first_name || ''} ${m?.last_name || ''}`.trim(),
        house: m?.houses?.name || s.house_name || '',
        champCount: s.class_champion_count || 0,
        dob: m?.date_of_birth,
        is_kr: s.is_kr, is_pts: s.is_pts, discipline: s.discipline,
      }
    }

    // Aggregate by student
    const map = {}
    for (const row of ptsData) {
      const sid = row.student_id
      if (!sid) continue
      const info = studentMap[sid]
      if (!info) continue // filtered out by classFilter, or no matching student record
      if (!map[sid]) {
        map[sid] = {
          id: sid,
          ref: info.ref,
          name: info.name,
          house: info.house,
          champCount: info.champCount,
          dob: info.dob,
          is_kr: info.is_kr, is_pts: info.is_pts, discipline: info.discipline,
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
    const [{ data: logData }, studentsData] = await Promise.all([
      supabase.from('points_log')
        .select('*')
        .gte('awarded_at', dateFrom)
        .lte('awarded_at', dateTo + 'T23:59:59')
        .order('awarded_at', { ascending: false })
        .limit(100),
      fetchAllRows(() => supabase.from('students')
        .select('id, student_ref, house_name, member_id, is_kr, is_pts, is_leader, discipline, members(first_name, last_name, houses(name))')),
    ])

    // Build student lookup
    const studentMap = {}
    for (const s of (studentsData || [])) {
      const m = s.members
      studentMap[s.id] = {
        id: s.id,
        student_ref: s.student_ref,
        is_kr: s.is_kr, is_pts: s.is_pts, is_leader: s.is_leader, discipline: s.discipline,
        members: {
          first_name: m?.first_name || '',
          last_name: m?.last_name || '',
          houses: { name: m?.houses?.name || s.house_name || '' },
        },
      }
    }

    // Attach student info to each log row in the SAME shape as before (students.members.houses.name)
    // so existing rendering code keeps working without further changes. Rows for a student who
    // doesn't match the selected class/group filter are dropped entirely, same as the ranking tabs.
    const enriched = (logData || [])
      .filter(row => classFilter === 'All' || studentMatchesClassFilter(studentMap[row.student_id] || {}))
      .map(row => ({
        ...row,
        students: studentMap[row.student_id] || { id: row.student_id, student_ref: '', is_kr: false, is_pts: false, discipline: '', members: { first_name: '', last_name: '', houses: { name: '' } } },
      }))

    setPointsLog(enriched)
  }

  // Fetches a fuller profile (phone/email/DOB/grade/class/groups) on
  // demand for the "View full profile" popup -- same fields/layout as
  // the Register page's own contact popup, so this stays a same-page
  // popup rather than navigating away like it used to.
  async function openFullProfile(studentId) {
    setLoadingFullProfile(true)
    setFullProfileModal({ id: studentId })
    const { data } = await supabase
      .from('students')
      .select('*, members(first_name, last_name, phone, email, date_of_birth, houses(name))')
      .eq('id', studentId).maybeSingle()
    setFullProfileModal(data)
    setLoadingFullProfile(false)
  }

  // The quick hold-triggered popup opens instantly with whatever
  // lightweight {id, name, ref, house} object the list already has --
  // it was never built to carry a photo. Rather than threading
  // photo_url through every list query that can trigger this popup,
  // just fetch it the moment the popup opens and merge it in -- name/
  // ref/house show immediately as before, the photo fills in a beat
  // later once it arrives.
  useEffect(() => {
    if (!profilePopupFor?.id || profilePopupFor.photo_url !== undefined) return
    let cancelled = false
    supabase.from('students').select('photo_url').eq('id', profilePopupFor.id).maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setProfilePopupFor(prev => prev && prev.id === profilePopupFor.id ? { ...prev, photo_url: data?.photo_url || null } : prev)
      })
    return () => { cancelled = true }
  }, [profilePopupFor?.id])

  // Opens the same results the Score check tab shows, in a popup on
  // top of whatever tab is currently active -- avoids needing to
  // switch tabs and re-search to see a student's score history.
  async function openScoreHistoryFor(studentId) {
    setSearching(true)
    setScoreHistoryOpen(true)
    const { data: pts } = await supabase
      .from('points_log')
      .select('*, students(student_ref, members(first_name, last_name, houses(name)))')
      .eq('student_id', studentId)
      .gte('awarded_at', dateFrom)
      .lte('awarded_at', dateTo + 'T23:59:59')
      .order('awarded_at', { ascending: false })
    setSearchResults(pts || [])
    setSearching(false)
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
      .neq('status', 'stopped').neq('status', 'not_started')
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
    const newPoints = parseInt(editVal)
    const diff = newPoints - editingPoint.points_awarded
    const { error } = await supabase.from('points_log').update({ points_awarded: newPoints }).eq('id', editingPoint.id)
    if (error) { alert('Error saving: ' + error.message); setSaving(false); return }

    // This used to stop at the points_log row -- the student's own
    // running total and the house total were never adjusted to match,
    // which is one of the reasons house totals drift from reality
    // every time a coach corrects a point value from this page.
    if (diff !== 0 && editingPoint.student_id) {
      const houseDelta = (editingPoint.point_scope === 'house' || editingPoint.point_scope === 'both') ? diff : 0
      const individualDelta = (editingPoint.point_scope === 'individual' || editingPoint.point_scope === 'both') ? diff : 0
      if (houseDelta !== 0 || individualDelta !== 0) {
        await supabase.rpc('adjust_student_points', { p_student_id: editingPoint.student_id, p_house_delta: houseDelta, p_individual_delta: individualDelta })
      }
      if (editingPoint.point_scope === 'house' || editingPoint.point_scope === 'both') {
        const houseName = editingPoint.students?.members?.houses?.name
        if (houseName) await supabase.rpc('adjust_house_points', { p_house_name: houseName, p_delta: diff })
      }
    }

    setEditingPoint(null)
    await loadAll()
    setSaving(false)
  }

  async function deletePoint(id, entry) {
    if (!confirm('Delete this points entry?')) return
    const { error } = await supabase.from('points_log').delete().eq('id', id)
    if (error) { alert('Error deleting: ' + error.message); return }

    if (entry?.student_id) {
      const houseDelta = (entry.point_scope === 'house' || entry.point_scope === 'both') ? -entry.points_awarded : 0
      const individualDelta = (entry.point_scope === 'individual' || entry.point_scope === 'both') ? -entry.points_awarded : 0
      if (houseDelta !== 0 || individualDelta !== 0) {
        await supabase.rpc('adjust_student_points', { p_student_id: entry.student_id, p_house_delta: houseDelta, p_individual_delta: individualDelta })
      }
      if (entry.point_scope === 'house' || entry.point_scope === 'both') {
        const houseName = entry.students?.members?.houses?.name
        if (houseName) await supabase.rpc('adjust_house_points', { p_house_name: houseName, p_delta: -entry.points_awarded })
      }
    }
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
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <div className="page-header" style={{ marginBottom: 0 }}>
          <h1>League</h1>
          <p>Points standings across all classes</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
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
          <input type="date" value={dateFrom} onChange={e => updateDateRange(e.target.value, dateTo)}
            style={{ border: 'none', background: 'transparent', fontSize: 13, color: 'var(--text)', outline: 'none' }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--bg)', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius)', padding: '6px 10px' }}>
          <span style={{ fontSize: 11, color: 'var(--text-secondary)', flexShrink: 0 }}>To</span>
          <input type="date" value={dateTo} onChange={e => updateDateRange(dateFrom, e.target.value)}
            style={{ border: 'none', background: 'transparent', fontSize: 13, color: 'var(--text)', outline: 'none' }} />
        </div>
        <select value={classFilter} onChange={e => { setClassFilter(e.target.value); setSelectedClassId('') }}
          style={{ padding: '7px 10px', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius)', background: 'var(--bg)', fontSize: 13, color: 'var(--text)' }}>
          {CLASS_OPTIONS.map(c => <option key={c}>{c}</option>)}
        </select>
        {classFilter === 'Class' && (
          <select value={selectedClassId} onChange={e => setSelectedClassId(e.target.value)}
            style={{ padding: '7px 10px', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius)', background: 'var(--bg)', fontSize: 13, color: 'var(--text)' }}>
            <option value="">Any regular class</option>
            {timetableClasses.map(c => (
              <option key={c.id} value={c.id}>{c.name} — {c.day_of_week} {c.start_time?.slice(0, 5)}</option>
            ))}
          </select>
        )}
        {/* Quick range buttons */}
        {[
          { label: 'This week',  days: 7 },
          { label: 'This month', days: 30 },
          { label: 'This term',  days: 90 },
          { label: 'This year',  days: 365 },
        ].map(r => (
          <button key={r.label} className="btn btn-sm" onClick={() => {
            const from = new Date(); from.setDate(from.getDate() - r.days)
            updateDateRange(from.toISOString().split('T')[0], new Date().toISOString().split('T')[0])
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
                <div key={h.name} className="card" style={{ borderLeft: `3px solid ${colour}`, borderRadius: '0 var(--border-radius-lg) var(--border-radius-lg) 0', position: 'relative', overflow: 'hidden', cursor: 'pointer' }}
                  onClick={() => navigate(`/students?house=${encodeURIComponent(h.name)}`)}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                    <div style={{ fontSize: 15, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
                      {HOUSE_TEXT_LOGOS[h.name] ? (
                        <img src={HOUSE_TEXT_LOGOS[h.name]} alt={h.name} style={{ height: 26, width: 'auto', objectFit: 'contain', display: 'block' }} />
                      ) : h.name}
                    </div>
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
                    <div style={{ display: 'flex', gap: 6, marginTop: 10 }} onClick={e => e.stopPropagation()}>
                      <button className="btn btn-sm" style={{ flex: 1, justifyContent: 'center' }}
                        onClick={() => { setHouseLogFilter(h.name); setTab('Points log') }}>
                        Edit points
                      </button>
                      <button className="btn btn-sm" onClick={() => setEditingHouse(h)} title="Edit wins/draws/losses">
                        W/D/L
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Top scorers per house */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Show top:</span>
            {[5, 8, 10, 15, 20, 30, 50].map(n => (
              <button key={n} onClick={() => updateHouseTopN(n)} style={{
                padding: '4px 10px', borderRadius: 20, fontSize: 11, cursor: 'pointer',
                border: `1px solid ${houseTopN === n ? 'var(--text)' : 'var(--border-strong)'}`,
                background: houseTopN === n ? 'var(--text)' : 'var(--bg)',
                color: houseTopN === n ? 'var(--bg)' : 'var(--text-secondary)',
              }}>{n}</button>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
            {houseStandings.map(h => {
              const colour = HOUSE_COLOURS[h.name] || '#888'
              const houseMembers = individualRankings.filter(s => s.house === h.name).slice(0, houseTopN)
              return (
                <div key={h.name} className="card" style={{ padding: '14px 0' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 14px 10px', borderBottom: '1px solid var(--border)' }}>
                    {HOUSE_TEXT_LOGOS[h.name] ? (
                      <img src={HOUSE_TEXT_LOGOS[h.name]} alt={h.name} style={{ height: 20, width: 'auto', objectFit: 'contain', display: 'block' }} />
                    ) : (
                      <span style={{ fontSize: 13, fontWeight: 600 }}>{h.name}</span>
                    )}
                    <span style={{ fontSize: 11, color: 'var(--text-tertiary)', marginLeft: 'auto' }}>Top scorers</span>
                  </div>
                  {houseMembers.length === 0
                    ? <div style={{ fontSize: 12, color: 'var(--text-tertiary)', padding: '12px 14px' }}>No scores this period</div>
                    : houseMembers.map((s, i) => (
                      <div key={s.id} style={{ display: 'flex', alignItems: 'center', padding: '7px 14px', borderBottom: i < houseMembers.length - 1 ? '1px solid var(--border)' : 'none' }}>
                        <span style={{ fontSize: 11, color: 'var(--text-tertiary)', width: 20, flexShrink: 0 }}>{i + 1}</span>
                        <HoldableName student={s} onHold={setProfilePopupFor} style={{ fontSize: 13, flex: 1, color: 'var(--text)', textDecoration: 'underline' }} />
                        {s.champCount > 0 && <span style={{ fontSize: 10, marginRight: 4 }}>🏆{s.champCount}</span>}
                        <span onClick={() => openScoreHistoryFor(s.id)} style={{ fontSize: 13, fontWeight: 700, color: colour, cursor: 'pointer', textDecoration: 'underline dotted' }}>{s.total}</span>
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
              <button key={n} onClick={() => updateTopN(n)} style={{
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
                          <HoldableName student={s} onHold={setProfilePopupFor} style={{ fontWeight: 500, color: 'var(--text)', textDecoration: 'underline' }} />
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
                        <td onClick={() => openScoreHistoryFor(s.id)} style={{ textAlign: 'center', fontSize: 15, fontWeight: 700, color: colour, cursor: 'pointer', textDecoration: 'underline dotted' }}>{s.total}</td>
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
                          <td style={{ fontSize: 12, fontWeight: i < 3 ? 600 : 400 }}><HoldableName student={s} onHold={setProfilePopupFor} style={{ color: 'var(--text)', textDecoration: 'underline' }} /></td>
                          <td onClick={() => openScoreHistoryFor(s.id)} style={{ textAlign: 'right', fontSize: 13, fontWeight: 700, color: colour, paddingRight: 12, cursor: 'pointer', textDecoration: 'underline dotted' }}>{s.total}</td>
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
                      <th>Date</th><th>Point type</th><th style={{ textAlign: 'right' }}>Points</th>
                      {isAdmin && <th></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {searchResults.map(r => (
                      <tr key={r.id}>
                        <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{new Date(r.awarded_at).toLocaleDateString('en-GB')}</td>
                        <td style={{ fontWeight: 500 }}>{r.point_type}</td>
                        <td style={{ textAlign: 'right', fontWeight: 700, color: r.points_awarded < 0 ? '#a32d2d' : 'var(--success, #1d9e75)' }}>
                          {r.points_awarded > 0 ? '+' : ''}{r.points_awarded}
                        </td>
                        {isAdmin && (
                          <td style={{ display: 'flex', gap: 4 }}>
                            <button className="btn btn-sm" onClick={() => { setEditingPoint(r); setEditVal(String(r.points_awarded)) }}>Edit</button>
                            <button className="btn btn-sm btn-danger" onClick={() => deletePoint(r.id, r)}>Del</button>
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
                          <HoldableName name={name} student={{ id: r.student_id, name, house, ref: r.students?.student_ref }} onHold={setProfilePopupFor} style={{ fontWeight: 500, fontSize: 13, color: 'var(--text)', textDecoration: 'underline' }} />
                          <div style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: 'monospace' }}>{r.students?.student_ref}</div>
                        </td>
                        <td>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
                            <span style={{ width: 7, height: 7, borderRadius: '50%', background: colour, display: 'inline-block' }} />
                            {house || '—'}
                          </span>
                        </td>
                        <td style={{ fontSize: 13 }}>{r.point_type}</td>
                        <td style={{ textAlign: 'right', fontWeight: 700, fontSize: 13, color: r.points_awarded < 0 ? '#a32d2d' : 'var(--success, #1d9e75)' }}>
                          {r.points_awarded > 0 ? '+' : ''}{r.points_awarded}
                        </td>
                        {isAdmin && (
                          <td>
                            <div style={{ display: 'flex', gap: 4 }}>
                              <button className="btn btn-sm" onClick={() => { setEditingPoint(r); setEditVal(String(r.points_awarded)) }}>Edit</button>
                              <button className="btn btn-sm btn-danger" onClick={() => deletePoint(r.id, r)}>Del</button>
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

      {/* Score history popup -- same content as the Score check tab,
          without switching tabs or losing whatever's currently on screen. */}
      {scoreHistoryOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60, padding: 16 }}
          onClick={() => setScoreHistoryOpen(false)}>
          <div className="card" style={{ width: '100%', maxWidth: 480, maxHeight: '85vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 4 }}>
              <button onClick={() => setScoreHistoryOpen(false)} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--text-secondary)' }}>✕</button>
            </div>
            {searching ? (
              <div className="loading">Loading…</div>
            ) : searchResults.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--text-tertiary)', textAlign: 'center', padding: 20 }}>No points found in this date range.</p>
            ) : (
              <>
                {(() => {
                  const total = searchResults.reduce((s, r) => s + (r.points_awarded || 0), 0)
                  const first = searchResults[0]
                  const name = `${first.students?.members?.first_name || ''} ${first.students?.members?.last_name || ''}`.trim()
                  const house = first.students?.members?.houses?.name
                  const colour = HOUSE_COLOURS[house] || '#888'
                  return (
                    <div style={{ marginBottom: 14, display: 'flex', alignItems: 'center', gap: 16 }}>
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
                <table>
                  <thead>
                    <tr>
                      <th>Date</th><th>Point type</th><th style={{ textAlign: 'right' }}>Points</th>
                      {isAdmin && <th></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {searchResults.map(r => (
                      <tr key={r.id}>
                        <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{new Date(r.awarded_at).toLocaleDateString('en-GB')}</td>
                        <td style={{ fontWeight: 500 }}>{r.point_type}</td>
                        <td style={{ textAlign: 'right', fontWeight: 700, color: r.points_awarded < 0 ? '#a32d2d' : 'var(--success, #1d9e75)' }}>
                          {r.points_awarded > 0 ? '+' : ''}{r.points_awarded}
                        </td>
                        {isAdmin && (
                          <td style={{ display: 'flex', gap: 4 }}>
                            <button className="btn btn-sm" onClick={() => { setEditingPoint(r); setEditVal(String(r.points_awarded)) }}>Edit</button>
                            <button className="btn btn-sm btn-danger" onClick={() => deletePoint(r.id, r)}>Del</button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </div>
        </div>
      )}

      {/* Quick profile popup -- triggered by holding a name, instead of
          a normal tap navigating away to the student's profile page. */}
      {profilePopupFor && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60, padding: 16 }}
          onClick={() => setProfilePopupFor(null)}>
          <div className="card" style={{ width: '100%', maxWidth: 340 }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 4 }}>
              <button onClick={() => setProfilePopupFor(null)} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--text-secondary)' }}>✕</button>
            </div>
            {(() => {
              const colour = HOUSE_COLOURS[profilePopupFor.house] || '#888'
              return (
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
                  {profilePopupFor.photo_url ? (
                    <img src={profilePopupFor.photo_url} alt="" style={{ width: 48, height: 48, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                  ) : (
                    <div style={{ width: 48, height: 48, borderRadius: '50%', background: colour + '22', color: colour, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17, fontWeight: 700, flexShrink: 0 }}>
                      {profilePopupFor.name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                    </div>
                  )}
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 600 }}>{profilePopupFor.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{profilePopupFor.ref} · {profilePopupFor.house || '—'}</div>
                  </div>
                </div>
              )
            })()}
            <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }}
              onClick={() => { const id = profilePopupFor.id; setProfilePopupFor(null); openFullProfile(id) }}>
              View full profile →
            </button>
          </div>
        </div>
      )}

      {/* Full profile popup -- fetched on demand, same fields/layout as
          the Register page's own contact popup. Stays on this same
          page (no navigation) -- previously this was a Link that took
          you away to a separate Students/Athletes page entirely. */}
      {fullProfileModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 70, padding: 16 }}
          onClick={() => setFullProfileModal(null)}>
          <div className="card" style={{ width: '100%', maxWidth: 380 }} onClick={e => e.stopPropagation()}>
            {loadingFullProfile ? (
              <div className="loading">Loading…</div>
            ) : (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    {fullProfileModal.photo_url ? (
                      <img src={fullProfileModal.photo_url} alt="" style={{ width: 44, height: 44, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                    ) : (
                      <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--bg-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 600, color: 'var(--text-secondary)', flexShrink: 0 }}>
                        {(fullProfileModal.members?.first_name?.[0] || '')}{(fullProfileModal.members?.last_name?.[0] || '')}
                      </div>
                    )}
                    <h2 style={{ fontSize: 15, fontWeight: 600 }}>{fullProfileModal.members?.first_name} {fullProfileModal.members?.last_name}</h2>
                  </div>
                  <button onClick={() => setFullProfileModal(null)} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer' }}>✕</button>
                </div>
                {[
                  ['Student ID', fullProfileModal.student_ref],
                  ['Phone', fullProfileModal.members?.phone || '—'],
                  ['Email', fullProfileModal.members?.email || '—'],
                  ['DOB', fullProfileModal.members?.date_of_birth || '—'],
                  ['House', fullProfileModal.house_name || fullProfileModal.members?.houses?.name || '—'],
                  ['Grade', fullProfileModal.pka_belt || fullProfileModal.krba_level || '—'],
                  ['Class', `${fullProfileModal.class_schedule || '—'} ${fullProfileModal.class_time || ''}`],
                  ['Groups', [fullProfileModal.is_kr && 'KR', fullProfileModal.is_pts && 'PTs', fullProfileModal.is_leader && 'Leader'].filter(Boolean).join(', ') || 'None'],
                ].map(([label, val]) => (
                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                    <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
                    <span style={{ fontWeight: 500 }}>{val}</span>
                  </div>
                ))}
                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                  {fullProfileModal.members?.phone && <a href={`tel:${fullProfileModal.members.phone}`} className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }}>📞 Call</a>}
                  <Link to={studentProfileLink(fullProfileModal)} className="btn" style={{ flex: 1, justifyContent: 'center' }} onClick={() => setFullProfileModal(null)}>
                    Open full page →
                  </Link>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
