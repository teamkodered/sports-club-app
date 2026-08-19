
function OneOffStudent({ displayStudents, onAdd, date }) {
  const [search, setSearch] = useState('')
  const [results, setResults] = useState([])
  const [added, setAdded] = useState([])

  useEffect(() => {
    if (search.length < 2) { setResults([]); return }
    const t = setTimeout(async () => {
      const { data: memberData } = await supabase
        .from('members').select('id, first_name, last_name, status')
        .or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%`).limit(8)
      if (!memberData?.length) { setResults([]); return }
      const eligibleMembers = memberData.filter(m => m.status !== 'stopped' && m.status !== 'not_started')
      const { data: stuData } = await supabase
        .from('students').select('id, student_ref, pka_belt, house_name, member_id, members(first_name, last_name, houses(name))')
        .in('member_id', eligibleMembers.map(m => m.id))
      // Filter out students already in register
      const existing = new Set(displayStudents.map(s => s.id))
      const filtered = (stuData || []).filter(s => !existing.has(s.id) && !added.includes(s.id))
      setResults(filtered.map(s => ({ ...s, members: eligibleMembers.find(m => m.id === s.member_id) || s.members })))
    }, 200)
    return () => clearTimeout(t)
  }, [search, displayStudents, added])

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
        Add one-off student to this session
      </div>
      <div style={{ position: 'relative' }}>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search name to add for this session only…"
          style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius)', fontSize: 13, background: 'var(--bg-secondary)', color: 'var(--text)' }} />
        {results.length > 0 && (
          <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', zIndex: 20, boxShadow: 'var(--shadow)', maxHeight: 200, overflowY: 'auto' }}>
            {results.map(s => (
              <button key={s.id} onClick={() => {
                onAdd(s)
                setAdded(prev => [...prev, s.id])
                setSearch('')
                setResults([])
              }} style={{
                display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                padding: '10px 12px', fontSize: 13, border: 'none',
                borderBottom: '1px solid var(--border)', background: 'none',
                cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--font-sans)', color: 'var(--text)',
              }}>
                <span style={{ fontWeight: 500 }}>{s.members?.first_name} {s.members?.last_name}</span>
                <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{s.student_ref}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

import { useEffect, useState, useRef } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../hooks/useAuth.jsx'

const HOUSE_COLOURS = {
  'Dragon House': '#E24B4A', 'Super House': '#378ADD',
  'Ice House': '#1D9E75', 'Jet House': '#EF9F27',
}

const REGISTER_TYPES = [
  { key: 'class',  label: 'Class',  discipline: 'PKA'  },
  { key: 'kr',     label: 'KR',     discipline: 'PKA'  },
  { key: 'pts',    label: 'PTs',    discipline: 'PKA'  },
  { key: 'leader', label: 'Leader', discipline: 'PKA'  },
  { key: 'krba',   label: 'KRBA',   discipline: 'KRBA' },
  { key: 'adhoc',  label: 'Adhoc',  discipline: 'PKA'  },
]

function SortTh({ col, label, sortKey, sortDir, onSort, style = {} }) {
  const active = sortKey === col
  return (
    <th onClick={() => onSort(col)} style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap', background: 'var(--bg)', ...style }}>
      {label}<span style={{ marginLeft: 4, fontSize: 9, opacity: active ? 1 : 0.35 }}>{active ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}</span>
    </th>
  )
}

// Groups column header: the arrow keeps the normal sort-toggle
// behaviour, but clicking the word itself opens a dropdown to filter
// the list down to just one group (KR/PTs/Leader/Coach/PKA/KRBA)
// instead. Click elsewhere in the header row to close the dropdown.
const GROUP_FILTER_OPTIONS = ['KR', 'PTs', 'Leader', 'Coach', 'PKA', 'KRBA']
function GroupFilterTh({ sortKey, sortDir, onSort, groupFilter, setGroupFilter, filterOpen, setFilterOpen }) {
  const active = sortKey === 'groups'
  return (
    <th style={{ whiteSpace: 'nowrap', background: 'var(--bg)', position: 'relative' }}>
      <span onClick={e => { e.stopPropagation(); setFilterOpen(v => !v) }}
        style={{ cursor: 'pointer', userSelect: 'none', textDecoration: groupFilter ? 'underline' : 'none', textDecorationColor: groupFilter ? 'var(--text)' : undefined }}>
        {groupFilter ? `Groups: ${groupFilter}` : 'Groups'}
      </span>
      <span onClick={e => { e.stopPropagation(); onSort('groups') }}
        style={{ marginLeft: 4, fontSize: 9, opacity: active ? 1 : 0.35, cursor: 'pointer', padding: '4px 2px' }}>
        {active ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}
      </span>
      {filterOpen && (
        <div className="card" onClick={e => e.stopPropagation()}
          style={{ position: 'absolute', top: '100%', left: 0, zIndex: 25, padding: 6, minWidth: 130, marginTop: 2 }}>
          <button onClick={() => { setGroupFilter(''); setFilterOpen(false) }}
            style={{ display: 'block', width: '100%', textAlign: 'left', padding: '5px 8px', borderRadius: 6, fontSize: 12, background: !groupFilter ? 'var(--bg-secondary)' : 'none', border: 'none', cursor: 'pointer', fontWeight: !groupFilter ? 600 : 400, fontFamily: 'var(--font-sans)', color: 'var(--text)' }}>
            All groups
          </button>
          {GROUP_FILTER_OPTIONS.map(g => (
            <button key={g} onClick={() => { setGroupFilter(g); setFilterOpen(false) }}
              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '5px 8px', borderRadius: 6, fontSize: 12, background: groupFilter === g ? 'var(--bg-secondary)' : 'none', border: 'none', cursor: 'pointer', fontWeight: groupFilter === g ? 600 : 400, fontFamily: 'var(--font-sans)', color: 'var(--text)' }}>
              {g}
            </button>
          ))}
        </div>
      )}
    </th>
  )
}

// Confirmed double-session pairs -- same cohort, split across two
// back-to-back slots (usually for capacity). When a student is marked
// present for the FIRST class in a pair, and they're already assigned
// to the SECOND one too, attendance is automatically covered for both
// -- so a coach only has to check them in once. Always undoable from
// the banner that appears after marking attendance.
const DOUBLE_SESSION_PAIRS = [
  { first: 'f15115b7-44fe-4581-92b4-0245afff6123', second: '7f86f077-fa72-45e7-87ec-fcdf9787e1a1', secondLabel: 'KR 10:00' },
  { first: '50866030-a2ea-41c9-8c99-13342f38194d', second: 'b71979d9-7b81-4c8c-a037-da33d371f384', secondLabel: 'KRBA Register 13:00' },
  { first: 'cb4623b1-0113-450f-ae44-1f990d73d17a', second: 'c2e674e8-8360-4817-aef9-e5bf1b62f4f9', secondLabel: 'KRBA Register 19:00' },
]

export default function Registers() {
  const { isAdmin, isCoach, isLeader, isStaff } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [regType, setRegType]           = useState('class')
  const [date, setDate]                 = useState(new Date().toISOString().split('T')[0])
  const [classFilter, setClassFilter]   = useState(() => searchParams.get('class_id') || 'all')
  const [students, setStudents]         = useState([])
  const [explicitAssignments, setExplicitAssignments] = useState([])
  const [todayClasses, setTodayClasses] = useState([])
  const [showEndTimeEditor, setShowEndTimeEditor] = useState(false)
  const [endTimeDraft, setEndTimeDraft] = useState('')
  const [savingEndTime, setSavingEndTime] = useState(false)
  const [derbyMooreClasses, setDerbyMooreClasses] = useState([])
  const [moorwaysClasses, setMoorwaysClasses] = useState([])
  const [loading, setLoading]           = useState(true)
  const [pointTypes, setPointTypes]     = useState([])
  const [awardingFor, setAwardingFor]   = useState(null)
  const [multiAward, setMultiAward]     = useState(false)
  const [selectedStudents, setSelectedStudents] = useState([])
  const [selectedPoints, setSelectedPoints]     = useState([])
  const [customLabel, setCustomLabel]           = useState('')
  const [customPoints, setCustomPoints]         = useState('')
  const [saving, setSaving]             = useState(false)
  const [attendHistory, setAttendHistory] = useState([])
  const [attendFuture, setAttendFuture]   = useState([])
  const [contactModal, setContactModal] = useState(null)
  const [birthdayPopup, setBirthdayPopup] = useState(null) // { name, info } or null
  const [attendance, setAttendance]     = useState({})
  // Entries auto-added by the double-session cascade, shown as an
  // undoable banner so a coach can remove any that shouldn't have been
  // covered (e.g. a student only staying for one of the two sessions).
  const [cascadedEntries, setCascadedEntries] = useState([])
  const [showOnlyAttended, setShowOnlyAttended] = useState(false)
  const [pointsByStudent, setPointsByStudent] = useState({}) // student_id -> points_log rows for the selected date
  const [weightByStudent, setWeightByStudent] = useState({}) // student_id -> {weight_before, weight_after} for the selected date (KRBA)
  const [pointsPanelFor, setPointsPanelFor] = useState(null) // student currently open in the points-for-this-day panel
  const [search, setSearch]             = useState('')
  const [sortKey, setSortKey]           = useState('first_name')
  const [sortDir, setSortDir]           = useState('asc')
  const [groupFilter, setGroupFilter]   = useState('') // '' = all groups; else 'KR'|'PTs'|'Leader'|'Coach'|'PKA'|'KRBA'
  const [groupFilterOpen, setGroupFilterOpen] = useState(false)
  // Adhoc register
  const [adhocSearch, setAdhocSearch]   = useState('')
  const [adhocResults, setAdhocResults] = useState([])
  const [adhocPills, setAdhocPills]     = useState([]) // { id, name, student_ref }
  const tableRef = useRef(null)
  const [showColPicker, setShowColPicker] = useState(false)
  const [visibleCols, setVisibleCols] = useState(() => {
    const saved = localStorage.getItem('register_cols')
    return saved ? JSON.parse(saved) : ['checkbox','student_ref','name','age','house','grade','groups','attendance','media','points']
  })

  const ALL_REG_COLS = [
    { key: 'checkbox',    label: 'Select' },
    { key: 'student_ref', label: 'ID' },
    { key: 'name',        label: 'Name' },
    { key: 'age',         label: 'Age' },
    { key: 'house',       label: 'House' },
    { key: 'grade',       label: 'Grade' },
    { key: 'class_time',  label: 'Class time' },
    { key: 'groups',      label: 'Groups' },
    { key: 'attendance',  label: 'Attend.' },
    { key: 'champ',       label: '🏆' },
    { key: 'media',       label: 'Media' },
    { key: 'points',      label: 'Pts' },
  ]

  function toggleRegCol(key) {
    setVisibleCols(prev => {
      const next = prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
      localStorage.setItem('register_cols', JSON.stringify(next))
      return next
    })
  }

  useEffect(() => { loadPointTypes() }, [])
  useEffect(() => { loadStudents() }, [regType, date])
  // Clear the double-session undo banner when switching date/class --
  // those entries only make sense in the context they were created in.
  useEffect(() => { setCascadedEntries([]) }, [date, classFilter])

  async function loadPointTypes() {
    const { data } = await supabase.from('settings').select('value').eq('key', 'point_types').single()
    setPointTypes(data?.value || [])
  }

  async function loadStudents() {
    setLoading(true)
    const disc = REGISTER_TYPES.find(r => r.key === regType)?.discipline || 'PKA'
    let query = supabase
      .from('students')
      .select('*, members(first_name, last_name, phone, email, date_of_birth, status, houses(name))')

    if (regType === 'krba')        query = query.eq('discipline', 'KRBA')
    else if (regType === 'kr')     query = query.eq('discipline', 'PKA').eq('is_kr', true)
    else if (regType === 'pts')    query = query.eq('discipline', 'PKA').eq('is_pts', true)
    else if (regType === 'leader') query = query.eq('discipline', 'PKA').eq('is_leader', true)
    else if (regType === 'adhoc')  { setLoading(false); return }
    else                           query = query.eq('discipline', 'PKA')

    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    const dow = dayNames[new Date(date + 'T12:00:00').getDay()]
    const isMonFri = dow === 'Mon' || dow === 'Fri'
    const isTueThu = dow === 'Tue' || dow === 'Thu'

    const { data: allClasses } = await supabase
      .from('classes').select('*').eq('discipline', disc).eq('active', true).eq('is_custom', false).order('start_time')

    // Match classes for today by actual day_of_week (handles Mon/Fri, Tue/Thu groups too)
    const fullDayMap = { Sun:'Sunday',Mon:'Monday',Tue:'Tuesday',Wed:'Wednesday',Thu:'Thursday',Fri:'Friday',Sat:'Saturday' }
    const fullDay = fullDayMap[dow] || dow
    const matchesToday = (c) => {
      if (c.day_of_week === 'Mon/Fri')  return isMonFri
      if (c.day_of_week === 'Tue/Thu')  return isTueThu
      if (c.day_of_week === 'Saturday' || c.day_of_week === 'Sat') return dow === 'Sat'
      if (c.day_of_week === 'Sunday'   || c.day_of_week === 'Sun') return dow === 'Sun'
      return c.day_of_week === dow || c.day_of_week === fullDay
    }

    const allToday = (allClasses || []).filter(matchesToday)
    // Separate Derby Moore and Moorways venue classes from main KR Centre classes (matched by name, not day field)
    const derbyMoore = allToday.filter(c => c.name?.toLowerCase().includes('derby moore'))
    const moorways   = allToday.filter(c => c.name?.toLowerCase().includes('moorway'))
    const todayFiltered = allToday.filter(c => !derbyMoore.includes(c) && !moorways.includes(c))

    setTodayClasses(todayFiltered)
    setDerbyMooreClasses(derbyMoore)
    setMoorwaysClasses(moorways)
    setClassFilter('all')
    setAttendance({})
    setSelectedStudents([])

    const { data, error } = await query
    const filteredStudents = (data || []).filter(s => s.members?.status !== 'stopped' && s.members?.status !== 'not_started')
    setStudents(filteredStudents)

    // Also fetch explicit class assignments (student_class_assignments)
    // for these students -- this is a second, independent source of
    // "who's in this class" alongside each student's own
    // class_schedule/class_time fields, since the two can diverge
    // (e.g. someone assigned via the Attendance/PDP system whose own
    // class_time field hasn't been updated to match a newly added class).
    if (filteredStudents.length) {
      const { data: assignments } = await supabase
        .from('student_class_assignments')
        .select('student_id, class_id')
        .in('student_id', filteredStudents.map(s => s.id))
      setExplicitAssignments(assignments || [])
    } else {
      setExplicitAssignments([])
    }

    // Load today's check-ins from attendance table -- scoped to the
    // currently selected class where one is selected, so a mark from
    // an earlier class today doesn't bleed into this class's checkboxes.
    // "All classes" has no single class to scope to, so it keeps showing
    // the day-level picture as before.
    await syncLiveData()

    setLoading(false)
  }

  // Re-fetches just the "live" per-day data (attendance, points, weights)
  // for the currently selected date/class, WITHOUT touching students,
  // classes, or any local UI state (selection, search, sort, filters).
  // Used both by loadStudents() on first load and by the auto-refresh
  // below, so that if another coach has this same register open on a
  // different device/PC and checks someone in, this device converges
  // to match within a few seconds -- instead of both coaches working
  // from stale local state and risking a duplicate check-in.
  async function syncLiveData() {
    try {
      let attQuery = supabase.from('attendance').select('student_id, attendance_type').eq('session_date', date)
      if (classFilter && classFilter !== 'all') attQuery = attQuery.eq('class_id', classFilter)
      const { data: todayAtt } = await attQuery
      const attMap = {}
      ;(todayAtt || []).forEach(a => {
        if (a.attendance_type === 'full_kit') attMap[a.student_id] = 'full_kit'
        else if (a.attendance_type === 'attended') attMap[a.student_id] = 'attended'
        // any other/stale value is treated as not attended, rather than
        // silently defaulting to 'attended'
      })
      setAttendance(attMap)
    } catch(e) { console.error('Attendance sync error:', e) }

    // Load points awarded on this specific date, grouped by student
    try {
      const dayStart = `${date}T00:00:00.000Z`
      const dayEnd   = `${date}T23:59:59.999Z`
      const { data: dayPoints } = await supabase
        .from('points_log')
        .select('id, student_id, point_type, points_awarded, point_scope, note, awarded_at')
        .gte('awarded_at', dayStart).lte('awarded_at', dayEnd)
      const map = {}
      ;(dayPoints || []).forEach(p => { (map[p.student_id] ||= []).push(p) })
      setPointsByStudent(map)
    } catch (e) { console.error('Points sync error:', e) }

    // Load weigh-in/out for this specific date (KRBA register), grouped by student
    if (regType === 'krba') {
      try {
        const { data: dayWeights } = await supabase
          .from('fit2fight_sessions')
          .select('student_id, weight_before, weight_after')
          .eq('session_date', date)
        const wMap = {}
        ;(dayWeights || []).forEach(w => { wMap[w.student_id] = w })
        setWeightByStudent(wMap)
      } catch (e) { console.error('Weight sync error:', e) }
    }
  }

  // Auto-refresh so two coaches on different devices don't work from
  // stale state and risk double-checking someone in. Two layers:
  // Realtime (near-instant when Supabase's realtime replication is
  // enabled for these tables) and a polling fallback every 15s in case
  // it isn't -- realtime is opt-in per table in Supabase and easy to
  // forget to enable, so the poll guarantees this still converges
  // either way.
  useEffect(() => {
    if (regType === 'adhoc') return // no date-scoped live data to sync for the adhoc register
    const channel = supabase
      .channel(`register-live-${date}-${classFilter}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance', filter: `session_date=eq.${date}` }, () => syncLiveData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'points_log' }, () => syncLiveData())
      .subscribe()

    const interval = setInterval(() => syncLiveData(), 15000)

    return () => {
      supabase.removeChannel(channel)
      clearInterval(interval)
    }
  }, [date, classFilter, regType])

  function toggleSort(key) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  function calcAge(dob) {
    if (!dob) return '—'
    return Math.floor((Date.now() - new Date(dob)) / (365.25 * 24 * 60 * 60 * 1000))
  }

  // Same calculation as the CRM's Birthdays list (within the next 28
  // days) -- kept identical so a student flagged here matches exactly
  // who'd show up there.
  function getBirthdayInfo(dob) {
    if (!dob) return null
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const birth = new Date(dob + 'T00:00:00')
    let next = new Date(today.getFullYear(), birth.getMonth(), birth.getDate())
    if (next < today) next = new Date(today.getFullYear() + 1, birth.getMonth(), birth.getDate())
    const daysUntil = Math.round((next - today) / (24 * 60 * 60 * 1000))
    if (daysUntil > 28) return null
    const turningAge = next.getFullYear() - birth.getFullYear()
    return { nextBirthday: next, daysUntil, turningAge }
  }

  const selectedClass = todayClasses.find(c => c.id === classFilter)
    || derbyMooreClasses.find(c => c.id === classFilter)
    || moorwaysClasses.find(c => c.id === classFilter)

  const _dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
  const _dow = _dayNames[new Date(date + 'T12:00:00').getDay()]
  const _shortToFull = { Sun:'Sunday',Mon:'Monday',Tue:'Tuesday',Wed:'Wednesday',Thu:'Thursday',Fri:'Friday',Sat:'Saturday' }
  const _fullToShort = { Sunday:'Sun',Monday:'Mon',Tuesday:'Tue',Wednesday:'Wed',Thursday:'Thu',Friday:'Fri',Saturday:'Sat' }
  const _fullDay = _shortToFull[_dow] || _dow
  const _isMonFri = _dow === 'Mon' || _dow === 'Fri'
  const _isTueThu = _dow === 'Tue' || _dow === 'Thu'

  function studentGroups(s, m) {
    return [
      s.discipline === 'PKA' && 'PKA',
      s.is_kr && 'KR',
      s.is_pts && 'PTs',
      s.is_leader && 'Leader',
      s.is_coach && 'Coach',
      s.discipline === 'KRBA' && m?.status === 'active' && 'KRBA',
    ].filter(Boolean)
  }

  const displayStudents = (regType === 'adhoc' ? adhocPills.map(p => students.find(s => s.id === p.id)).filter(Boolean) : students)
    .filter(s => !showOnlyAttended || (attendance[s.id] && attendance[s.id] !== 'none'))
    .filter(s => !groupFilter || studentGroups(s, s.members).includes(groupFilter))
    .filter(s => {
      if (classFilter === 'all') return true

      // Explicit assignment (student_class_assignments) is a second,
      // independent way to match -- covers anyone assigned via the
      // sync tool/Attendance system whose own class_time field
      // doesn't happen to match this specific class.
      if (explicitAssignments.some(a => a.student_id === s.id && a.class_id === classFilter)) return true

      if (!selectedClass) return true
      const classStart = selectedClass.start_time?.slice(0, 5)
      const shortDay = _fullToShort[selectedClass.day_of_week] || selectedClass.day_of_week
      const fullDay2 = _shortToFull[selectedClass.day_of_week] || selectedClass.day_of_week
      const fullSchedule = (s.class_schedule || '').trim()
      const className = (selectedClass.name || '').trim()
      const timeMatch = s.class_time === classStart || s.class_time_2 === classStart
      const schedMatch = fullSchedule === selectedClass.day_of_week
        || fullSchedule === className
        || fullSchedule === shortDay
        || fullSchedule === fullDay2
        || fullSchedule.split('/').map(p => p.trim()).some(p => p === selectedClass.day_of_week || p === shortDay || p === fullDay2)
      return timeMatch && schedMatch
    })
    .filter(s => {
      if (!search) return true
      const q = search.toLowerCase()
      return `${s.members?.first_name} ${s.members?.last_name} ${s.student_ref}`.toLowerCase().includes(q)
    })
    .sort((a, b) => {
      let aVal, bVal
      const am = a.members, bm = b.members
      switch(sortKey) {
        case 'first_name':   aVal = am?.first_name || ''; bVal = bm?.first_name || ''; break
        case 'last_name':    aVal = am?.last_name || '';  bVal = bm?.last_name || '';  break
        case 'age':          aVal = am?.date_of_birth || ''; bVal = bm?.date_of_birth || ''; break
        case 'house':        aVal = am?.houses?.name || ''; bVal = bm?.houses?.name || ''; break
        case 'grade':        aVal = a.pka_belt || ''; bVal = b.pka_belt || ''; break
        case 'house_points': aVal = a.house_points || 0; bVal = b.house_points || 0; return sortDir === 'asc' ? aVal - bVal : bVal - aVal
        case 'competition_team':  aVal = a.competition_team || ''; bVal = b.competition_team || ''; break
        case 'discipline_codes':  aVal = a.discipline_codes || ''; bVal = b.discipline_codes || ''; break
        case 'weight_kg':    aVal = a.weight_kg || 0; bVal = b.weight_kg || 0; return sortDir === 'asc' ? aVal - bVal : bVal - aVal
        case 'age_category_kr':   aVal = a.age_category_kr || a.age_category || ''; bVal = b.age_category_kr || b.age_category || ''; break
        case 'in_comp':      aVal = a.in_comp ? 1 : 0; bVal = b.in_comp ? 1 : 0; return sortDir === 'asc' ? aVal - bVal : bVal - aVal
        // "Record" sorts by wins -- the clearest single number to rank by
        // out of wins/losses/draws
        case 'wins':         aVal = a.wins || 0; bVal = b.wins || 0; return sortDir === 'asc' ? aVal - bVal : bVal - aVal
        case 'groups': {
          const g = x => [x.is_kr && 'KR', x.is_pts && 'PTs', x.is_leader && 'Leader', x.is_coach && 'Coach'].filter(Boolean).join(',')
          aVal = g(a); bVal = g(b); break
        }
        case 'attendance': {
          const rank = id => { const v = attendance[id]; return v === 'full_kit' ? 2 : v === 'attended' ? 1 : 0 }
          aVal = rank(a.id); bVal = rank(b.id); return sortDir === 'asc' ? aVal - bVal : bVal - aVal
        }
        case 'media_restriction': aVal = a.media_restriction || ''; bVal = b.media_restriction || ''; break
        default:             aVal = ''; bVal = ''
      }
      return sortDir === 'asc' ? String(aVal).localeCompare(String(bVal)) : String(bVal).localeCompare(String(aVal))
    })

  // Adhoc search
  useEffect(() => {
    if (adhocSearch.length < 2) { setAdhocResults([]); return }
    const timer = setTimeout(async () => {
      const { data } = await supabase
        .from('students')
        .select('id, student_ref, members(first_name, last_name)')
        .ilike('members.last_name', `%${adhocSearch}%`)
        .limit(8)
      setAdhocResults((data || []).filter(s => !adhocPills.find(p => p.id === s.id)))
    }, 200)
    return () => clearTimeout(timer)
  }, [adhocSearch, adhocPills])

  function addAdhoc(s) {
    setAdhocPills(prev => [...prev, { id: s.id, name: `${s.members?.first_name} ${s.members?.last_name}`, student_ref: s.student_ref }])
    // Also add to students array if not there
    setStudents(prev => prev.find(x => x.id === s.id) ? prev : [...prev, s])
    setAdhocSearch(''); setAdhocResults([])
  }

  function removeAdhoc(id) {
    setAdhocPills(prev => prev.filter(p => p.id !== id))
  }

  async function awardAttendancePoints(student, type, classId) {    // Reverse any attendance points already awarded to this student for
    // THIS SPECIFIC CLASS today, so cycling attended -> full_kit reflects
    // only the final state's points rather than stacking both awards.
    // Scoped by class_id (not just date) so a student attending two
    // different classes on the same day -- e.g. via the double-session
    // auto-cascade -- gets points for both, instead of the second
    // class's award wiping out the first's.
    let reverseQuery = supabase.from('points_log')
      .select('id, points_awarded, point_type')
      .eq('student_id', student.id)
      .in('point_type', ['Attendance', 'Full Kit'])
      .gte('awarded_at', date + 'T00:00:00')
      .lt('awarded_at', date + 'T23:59:59')
    reverseQuery = classId ? reverseQuery.eq('class_id', classId) : reverseQuery.is('class_id', null)
    const { data: previousEntries } = await reverseQuery
    let reversedPts = 0
    if (previousEntries?.length) {
      reversedPts = previousEntries.reduce((sum, e) => sum + (e.points_awarded || 0), 0)
      await supabase.from('points_log').delete().in('id', previousEntries.map(e => e.id))
    }

    const pointLabel = type === 'full_kit' ? 'Full Kit' : 'Attendance'
    const pt = pointTypes.find(p => p.label === pointLabel)
    const pts = pt ? pt.points : (type === 'full_kit' ? 2 : 1)
    const netChange = pts - reversedPts

    await supabase.from('points_log').insert({
      student_id: student.id, point_type: pointLabel,
      points_awarded: pts, point_scope: 'both',
      awarded_at: new Date(date).toISOString(),
      class_id: classId || null,
    })
    await supabase.from('students').update({
      house_points: (student.house_points || 0) + netChange,
      individual_points: (student.individual_points || 0) + netChange,
    }).eq('id', student.id)

    const houseName = student.house_name || student.members?.houses?.name
    if (houseName && netChange !== 0) {
      const { error: houseErr } = await supabase.rpc('adjust_house_points', { p_house_name: houseName, p_delta: netChange })
      if (houseErr) alert(`Attendance points saved for ${student.members?.first_name}, but the house total failed to update: ${houseErr.message}`)
    }

    setStudents(prev => prev.map(s => s.id === student.id ? { ...s, house_points: (s.house_points || 0) + netChange, individual_points: (s.individual_points || 0) + netChange } : s))
    return netChange
  }

  // If the class currently being marked is the FIRST half of a known
  // double-session pair, and this student is already assigned to the
  // SECOND half too, automatically mark them present there as well --
  // covers the common case of staying for both without checking in
  // twice. Only cascades forward (first -> second), never assumes
  // backward. Skips silently if already marked, or not assigned to the
  // second class. Returns the cascaded entry (for the undo banner) or
  // null if nothing was added.
  async function cascadeDoubleSession(student, type) {
    const pair = DOUBLE_SESSION_PAIRS.find(p => p.first === classFilter)
    if (!pair) return null

    const { data: assignment } = await supabase.from('student_class_assignments')
      .select('id').eq('student_id', student.id).eq('class_id', pair.second).maybeSingle()
    if (!assignment) return null

    const { data: existing } = await supabase.from('attendance')
      .select('id').eq('student_id', student.id).eq('class_id', pair.second).eq('session_date', date).maybeSingle()
    if (existing) return null

    const { error } = await supabase.from('attendance').insert({
      student_id: student.id, present: true, attendance_type: type,
      session_date: date, attended_at: new Date(date + 'T12:00:00').toISOString(),
      class_id: pair.second,
    })
    if (error) return null

    const pointsAwarded = await awardAttendancePoints(student, type, pair.second)
    return { studentId: student.id, studentName: `${student.members?.first_name} ${student.members?.last_name}`, classId: pair.second, classLabel: pair.secondLabel, pointsAwarded: pointsAwarded || 0 }
  }

  async function undoCascadedEntry(entry) {
    await supabase.from('attendance').delete().eq('student_id', entry.studentId).eq('class_id', entry.classId).eq('session_date', date)
    await supabase.from('points_log').delete().eq('student_id', entry.studentId).eq('class_id', entry.classId)
      .in('point_type', ['Attendance', 'Full Kit'])
      .gte('awarded_at', date + 'T00:00:00').lt('awarded_at', date + 'T23:59:59')

    // The points_log row was just a record -- it doesn't touch the
    // actual running totals on its own, so those need reversing
    // explicitly by the same amount that was awarded.
    if (entry.pointsAwarded) {
      const s = students.find(x => x.id === entry.studentId)
      if (s) {
        await supabase.from('students').update({
          house_points: (s.house_points || 0) - entry.pointsAwarded,
          individual_points: (s.individual_points || 0) - entry.pointsAwarded,
        }).eq('id', entry.studentId)
        setStudents(prev => prev.map(x => x.id === entry.studentId
          ? { ...x, house_points: (x.house_points || 0) - entry.pointsAwarded, individual_points: (x.individual_points || 0) - entry.pointsAwarded }
          : x))
        const houseName = s.house_name || s.members?.houses?.name
        if (houseName) await supabase.rpc('adjust_house_points', { p_house_name: houseName, p_delta: -entry.pointsAwarded })
      }
    }
    setCascadedEntries(prev => prev.filter(e => !(e.studentId === entry.studentId && e.classId === entry.classId)))
  }

  // When attendance is marked while viewing a specific class (not
  // "All"), also ensure the student has a real assignment to that
  // class -- so attending a session (even without being formally
  // assigned beforehand) makes it show up in their own "Assigned
  // sessions" list on their profile going forward.
  async function ensureClassAssignment(studentId) {
    if (!classFilter || classFilter === 'all') return
    const { data: existing } = await supabase.from('student_class_assignments')
      .select('id').eq('student_id', studentId).eq('class_id', classFilter).maybeSingle()
    if (existing) return
    await supabase.from('student_class_assignments').insert({ student_id: studentId, class_id: classFilter })
  }

  // When marking attendance from the "All classes" combined view (not
  // scoped to one specific class), the resulting row previously always
  // got class_id = null -- which meant it could never show up on any
  // specific class's own register afterwards, even though the student
  // genuinely has just one class that day. If the student has exactly
  // one assigned class matching today's day-of-week, use that;
  // multiple (a double-session day) stays null rather than guessing
  // which one was actually meant.
  function detectClassIdForStudent(studentId) {
    const allTodayClasses = [...todayClasses, ...derbyMooreClasses, ...moorwaysClasses]
    const assignedIds = new Set(explicitAssignments.filter(a => a.student_id === studentId).map(a => a.class_id))
    const matches = allTodayClasses.filter(c => assignedIds.has(c.id))
    return matches.length === 1 ? matches[0].id : null
  }

  async function toggleAttendance(id) {
    const cur = attendance[id] || 'none'
    const next = cur === 'none' ? 'attended' : cur === 'attended' ? 'full_kit' : 'none'
    setAttendance(prev => ({ ...prev, [id]: next }))

    // Clear any existing row for THIS class (not just this date) first --
    // handles the undo case and prevents duplicate rows as the type
    // cycles through attended -> full_kit -> none, without touching a
    // separate class's attendance mark from earlier the same day.
    const scopedToClass = classFilter && classFilter !== 'all'
    let delQuery = supabase.from('attendance').delete().eq('student_id', id).eq('session_date', date)
    if (scopedToClass) delQuery = delQuery.eq('class_id', classFilter)
    await delQuery

    if (next !== 'none') {
      const detectedClassId = scopedToClass ? classFilter : detectClassIdForStudent(id)
      const { error } = await supabase.from('attendance').insert({
        student_id: id,
        present: true,
        attendance_type: next,
        session_date: date,
        attended_at: new Date(date + 'T12:00:00').toISOString(),
        class_id: detectedClassId,
      })
      if (error) {
        alert('Error saving attendance: ' + error.message)
        setAttendance(prev => ({ ...prev, [id]: cur })) // revert the optimistic update
        return
      }
      await ensureClassAssignment(id)
      const student = students.find(s => s.id === id)
      if (student) {
        await awardAttendancePoints(student, next, detectedClassId)
        if (scopedToClass) {
          const cascaded = await cascadeDoubleSession(student, next)
          if (cascaded) setCascadedEntries(prev => [...prev, cascaded])
        }
      }
    }
  }

  async function toggleInComp(s) {
    const { error } = await supabase.from('students').update({ in_comp: !s.in_comp }).eq('id', s.id)
    if (error) { alert('Error updating: ' + error.message); return }
    setStudents(prev => prev.map(x => x.id === s.id ? { ...x, in_comp: !s.in_comp } : x))
  }

  async function updateWLD(studentId, field, value) {
    const { error } = await supabase.from('students').update({ [field]: value }).eq('id', studentId)
    if (error) { alert('Error updating: ' + error.message); return }
    setStudents(prev => prev.map(x => x.id === studentId ? { ...x, [field]: value } : x))
  }

  // Lets a coach extend a specific session's effective end time (e.g.
  // it ran over), so athletes checked in that day get credit for the
  // full duration rather than being auto-checked-out at the class's
  // normal scheduled time. Stored per-date on the class itself
  // (session_end_overrides), so it can be set or changed at any time --
  // including well after the session has already happened.
  async function saveSessionEndTimeOverride() {
    if (!selectedClass || !endTimeDraft) return
    setSavingEndTime(true)
    const current = selectedClass.session_end_overrides || {}
    const updated = { ...current, [date]: endTimeDraft }
    const { error } = await supabase.from('classes').update({ session_end_overrides: updated }).eq('id', selectedClass.id)
    setSavingEndTime(false)
    if (error) { alert('Error saving: ' + error.message); return }
    setTodayClasses(prev => prev.map(c => c.id === selectedClass.id ? { ...c, session_end_overrides: updated } : c))
    setShowEndTimeEditor(false)
  }
  async function clearSessionEndTimeOverride() {
    if (!selectedClass) return
    const current = { ...(selectedClass.session_end_overrides || {}) }
    delete current[date]
    const { error } = await supabase.from('classes').update({ session_end_overrides: current }).eq('id', selectedClass.id)
    if (error) { alert('Error clearing: ' + error.message); return }
    setTodayClasses(prev => prev.map(c => c.id === selectedClass.id ? { ...c, session_end_overrides: current } : c))
    setShowEndTimeEditor(false)
  }

  async function markAttendance(type) {
    if (selectedStudents.length === 0) return
    setSaving(true)

    const targets = displayStudents.filter(s => selectedStudents.includes(s.id))
    const newAtt = {}
    const scopedToClass = classFilter && classFilter !== 'all'

    for (const s of targets) {
      newAtt[s.id] = type

      // Clear any existing row for this student on THIS class (not just
      // this date) first -- prevents duplicate rows piling up if they
      // were already marked something else for this specific session,
      // without touching a separate class's attendance mark logged
      // earlier the same day.
      let delQuery = supabase.from('attendance').delete().eq('student_id', s.id).eq('session_date', date)
      if (scopedToClass) delQuery = delQuery.eq('class_id', classFilter)
      await delQuery

      // Log to attendance table
      const detectedClassId = scopedToClass ? classFilter : detectClassIdForStudent(s.id)
      await supabase.from('attendance').insert({
        student_id: s.id,
        present: true,
        late: false,
        attendance_type: type,
        session_date: date,
        attended_at: new Date(date + 'T12:00:00').toISOString(),
        class_id: detectedClassId,
      })

      await awardAttendancePoints(s, type, detectedClassId)
      await ensureClassAssignment(s.id)
      if (scopedToClass) {
        const cascaded = await cascadeDoubleSession(s, type)
        if (cascaded) setCascadedEntries(prev => [...prev, cascaded])
      }
    }

    setAttendance(prev => ({ ...prev, ...newAtt }))
    // Keep selection at current position - don't clear
    setSaving(false)
  }

  async function updatePointEntry(entry, newPoints, newNote) {
    const diff = newPoints - entry.points_awarded
    const { error } = await supabase.from('points_log').update({ points_awarded: newPoints, note: newNote }).eq('id', entry.id)
    if (error) { alert('Error saving: ' + error.message); return }

    const s = students.find(x => x.id === entry.student_id)
    if (s && diff !== 0) {
      const updates = {}
      if (entry.point_scope === 'house' || entry.point_scope === 'both') updates.house_points = (s.house_points || 0) + diff
      if (entry.point_scope === 'individual' || entry.point_scope === 'both') updates.individual_points = (s.individual_points || 0) + diff
      const { error: updErr } = await supabase.from('students').update(updates).eq('id', s.id)
      if (updErr) { alert('Points entry saved, but updating the total failed: ' + updErr.message) }
      else setStudents(prev => prev.map(x => x.id === s.id ? { ...x, ...updates } : x))

      // Same adjustment needs to land on the house total too -- this
      // used to be skipped here entirely, which is a big part of why
      // house totals drifted away from what students actually held.
      if (entry.point_scope === 'house' || entry.point_scope === 'both') {
        const houseName = s.house_name || s.members?.houses?.name
        if (houseName) {
          const { error: houseErr } = await supabase.rpc('adjust_house_points', { p_house_name: houseName, p_delta: diff })
          if (houseErr) alert('Points entry saved, but the house total failed to update: ' + houseErr.message)
        }
      }
    }

    setPointsByStudent(prev => ({
      ...prev,
      [entry.student_id]: (prev[entry.student_id] || []).map(p => p.id === entry.id ? { ...p, points_awarded: newPoints, note: newNote } : p),
    }))
  }

  async function deletePointEntry(entry) {
    if (!confirm('Remove this points entry? This cannot be undone.')) return
    const { error } = await supabase.from('points_log').delete().eq('id', entry.id)
    if (error) { alert('Error deleting: ' + error.message); return }

    const s = students.find(x => x.id === entry.student_id)
    if (s) {
      const updates = {}
      if (entry.point_scope === 'house' || entry.point_scope === 'both') updates.house_points = Math.max(0, (s.house_points || 0) - entry.points_awarded)
      if (entry.point_scope === 'individual' || entry.point_scope === 'both') updates.individual_points = Math.max(0, (s.individual_points || 0) - entry.points_awarded)
      const { error: updErr } = await supabase.from('students').update(updates).eq('id', s.id)
      if (updErr) { alert('Entry deleted, but updating the total failed: ' + updErr.message) }
      else setStudents(prev => prev.map(x => x.id === s.id ? { ...x, ...updates } : x))

      if (entry.point_scope === 'house' || entry.point_scope === 'both') {
        const houseName = s.house_name || s.members?.houses?.name
        if (houseName) {
          const { error: houseErr } = await supabase.rpc('adjust_house_points', { p_house_name: houseName, p_delta: -entry.points_awarded })
          if (houseErr) alert('Entry deleted, but the house total failed to update: ' + houseErr.message)
        }
      }
    }

    setPointsByStudent(prev => ({
      ...prev,
      [entry.student_id]: (prev[entry.student_id] || []).filter(p => p.id !== entry.id),
    }))
  }

  async function submitPoints(studentIds, points) {
    setSaving(true)
    const total = points.reduce((s, p) => s + p.points, 0)
    const isChamp = points.some(p => p.label === 'Class Champ')
    for (const sid of studentIds) {
      const s = students.find(x => x.id === sid)
      if (!s) continue
      for (const pt of points) {
        const { error: logError } = await supabase.from('points_log').insert({
          student_id: sid, point_type: pt.label,
          points_awarded: pt.points, point_scope: 'both',
          awarded_at: new Date(date).toISOString(),
        })
        if (logError) {
          alert(`Error saving "${pt.label}" for ${s.members?.first_name}: ${logError.message}`)
          setSaving(false)
          return
        }
      }
      const updates = {
        house_points: (s.house_points || 0) + total,
        individual_points: (s.individual_points || 0) + total,
      }
      if (isChamp) updates.class_champion_count = (s.class_champion_count || 0) + 1
      const { error: updateError } = await supabase.from('students').update(updates).eq('id', sid)
      if (updateError) {
        alert(`Points were logged, but saving totals for ${s.members?.first_name} failed: ${updateError.message}`)
        setSaving(false)
        return
      }
      const houseName = s.house_name || s.members?.houses?.name
      if (houseName && total > 0) {
        const { error: houseErr } = await supabase.rpc('adjust_house_points', { p_house_name: houseName, p_delta: total })
        if (houseErr) alert(`Points saved for ${s.members?.first_name}, but the house total failed to update: ${houseErr.message}`)
      }
    }
    setStudents(prev => prev.map(s =>
      studentIds.includes(s.id)
        ? { ...s, house_points: (s.house_points || 0) + total, individual_points: (s.individual_points || 0) + total }
        : s
    ))
    setAwardingFor(null); setMultiAward(false); setSelectedStudents([]); setSelectedPoints([])
    setSaving(false)
  }

  function togglePoint(pt) {
    setSelectedPoints(prev =>
      prev.find(p => p.label === pt.label) ? prev.filter(p => p.label !== pt.label) : [...prev, pt]
    )
  }

  const pointsTotal = selectedPoints.reduce((s, p) => s + p.points, 0)
  const isKR = regType === 'kr'

  return (
    <div onClick={e => {
      if (!e.target.closest('tr') && !e.target.closest('button') && !e.target.closest('input') && !e.target.closest('select'))
        setSelectedStudents([])
      if (groupFilterOpen) setGroupFilterOpen(false)
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <div className="page-header" style={{ marginBottom: 0 }}>
          {searchParams.get('student_id') && (
            <button className="btn btn-sm" style={{ marginBottom: 8 }} onClick={() => navigate(-1)}>← Back</button>
          )}
          <h1>Registers</h1>
          <p>{displayStudents.length} students · {new Date(date + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-sm" onClick={() => setShowColPicker(v => !v)}>⚙️ Columns</button>
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            style={{ padding: '7px 10px', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius)', fontSize: 13, background: 'var(--bg-secondary)', color: 'var(--text)' }} />
        </div>
      </div>

      {/* Column picker */}
      {showColPicker && (
        <div className="card" style={{ marginBottom: 10, padding: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Show / hide columns</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {ALL_REG_COLS.map(c => (
              <button key={c.key} onClick={() => toggleRegCol(c.key)} style={{
                padding: '4px 10px', borderRadius: 20, fontSize: 11, cursor: 'pointer',
                border: `1px solid ${visibleCols.includes(c.key) ? 'var(--text)' : 'var(--border-strong)'}`,
                background: visibleCols.includes(c.key) ? 'var(--text)' : 'var(--bg)',
                color: visibleCols.includes(c.key) ? 'var(--bg)' : 'var(--text-secondary)',
              }}>{c.label}</button>
            ))}
          </div>
        </div>
      )}

      {/* Register tabs */}
      <div style={{ display: 'flex', gap: 2, borderBottom: '1px solid var(--border)', marginBottom: 12 }}>
        {REGISTER_TYPES.map(r => (
          <button key={r.key} onClick={() => setRegType(r.key)} style={{
            padding: '8px 14px', fontSize: 13, border: 'none', background: 'none', cursor: 'pointer',
            borderBottom: `2px solid ${regType === r.key ? 'var(--text)' : 'transparent'}`,
            color: regType === r.key ? 'var(--text)' : 'var(--text-secondary)',
            fontWeight: regType === r.key ? 500 : 400,
          }}>{r.label}</button>
        ))}
      </div>

      {/* Adhoc register */}
      {regType === 'adhoc' && (
        <div className="card" style={{ marginBottom: 12 }}>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 10 }}>Build a custom register — search and add students</p>
          <div style={{ position: 'relative' }}>
            <input value={adhocSearch} onChange={e => setAdhocSearch(e.target.value)}
              placeholder="Search student name…"
              style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius)', fontSize: 13, background: 'var(--bg-secondary)', color: 'var(--text)' }} />
            {adhocResults.length > 0 && (
              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', zIndex: 20, boxShadow: 'var(--shadow)' }}>
                {adhocResults.map(s => (
                  <button key={s.id} onClick={() => addAdhoc(s)} style={{
                    display: 'block', width: '100%', padding: '9px 12px', fontSize: 13,
                    border: 'none', borderBottom: '1px solid var(--border)', background: 'none',
                    cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--font-sans)', color: 'var(--text)',
                  }}>{s.members?.first_name} {s.members?.last_name} <span style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>{s.student_ref}</span></button>
                ))}
              </div>
            )}
          </div>
          {adhocPills.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
              {adhocPills.map(p => (
                <span key={p.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 20, padding: '4px 10px', fontSize: 12 }}>
                  {p.name}
                  <button onClick={() => removeAdhoc(p.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', fontSize: 14, padding: 0, lineHeight: 1 }}>×</button>
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Class time pills — KR Centre classes, with Derby Moore nested under, Moorways nested under Derby Moore */}
      {(todayClasses.length > 0 || derbyMooreClasses.length > 0 || moorwaysClasses.length > 0) && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {todayClasses.map(c => (
              <div key={c.id} onClick={() => setClassFilter(c.id)} style={{
                background: classFilter === c.id ? 'var(--text)' : 'var(--bg-secondary)',
                color: classFilter === c.id ? 'var(--bg)' : 'var(--text)',
                border: '1px solid var(--border)', borderRadius: 'var(--radius)',
                padding: '6px 12px', fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap',
              }}>
                <span style={{ fontWeight: 500 }}>{c.name}</span>
                <span style={{ marginLeft: 6, opacity: 0.7 }}>{c.start_time?.slice(0,5)}–{c.end_time?.slice(0,5)}</span>
              </div>
            ))}
            <div onClick={() => setClassFilter('all')} style={{
              background: classFilter === 'all' ? 'var(--text)' : 'var(--bg-secondary)',
              color: classFilter === 'all' ? 'var(--bg)' : 'var(--text)',
              border: '1px solid var(--border)', borderRadius: 'var(--radius)',
              padding: '6px 12px', fontSize: 12, cursor: 'pointer',
            }}>All classes</div>
          </div>

          {/* Derby Moore — nested under KR Centre */}
          {derbyMooreClasses.length > 0 && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8, marginLeft: 20, paddingLeft: 10, borderLeft: '2px solid var(--border)' }}>
              <span style={{ fontSize: 10, color: 'var(--text-tertiary)', alignSelf: 'center', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Derby Moore</span>
              {derbyMooreClasses.map(c => (
                <div key={c.id} onClick={() => setClassFilter(c.id)} style={{
                  background: classFilter === c.id ? 'var(--text)' : 'var(--bg-secondary)',
                  color: classFilter === c.id ? 'var(--bg)' : 'var(--text)',
                  border: '1px solid var(--border)', borderRadius: 'var(--radius)',
                  padding: '5px 10px', fontSize: 11, cursor: 'pointer', whiteSpace: 'nowrap',
                }}>
                  <span style={{ fontWeight: 500 }}>{c.name}</span>
                  <span style={{ marginLeft: 5, opacity: 0.7 }}>{c.start_time?.slice(0,5)}–{c.end_time?.slice(0,5)}</span>
                </div>
              ))}

              {/* Moorways — nested under Derby Moore */}
              {moorwaysClasses.length > 0 && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginLeft: 16, paddingLeft: 10, borderLeft: '2px solid var(--border)' }}>
                  <span style={{ fontSize: 10, color: 'var(--text-tertiary)', alignSelf: 'center', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Moorways</span>
                  {moorwaysClasses.map(c => (
                    <div key={c.id} onClick={() => setClassFilter(c.id)} style={{
                      background: classFilter === c.id ? 'var(--text)' : 'var(--bg-secondary)',
                      color: classFilter === c.id ? 'var(--bg)' : 'var(--text)',
                      border: '1px solid var(--border)', borderRadius: 'var(--radius)',
                      padding: '5px 10px', fontSize: 11, cursor: 'pointer', whiteSpace: 'nowrap',
                    }}>
                      <span style={{ fontWeight: 500 }}>{c.name}</span>
                      <span style={{ marginLeft: 5, opacity: 0.7 }}>{c.start_time?.slice(0,5)}–{c.end_time?.slice(0,5)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* If no Derby Moore classes but Moorways exist, show Moorways directly under KR Centre */}
          {derbyMooreClasses.length === 0 && moorwaysClasses.length > 0 && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8, marginLeft: 20, paddingLeft: 10, borderLeft: '2px solid var(--border)' }}>
              <span style={{ fontSize: 10, color: 'var(--text-tertiary)', alignSelf: 'center', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Moorways</span>
              {moorwaysClasses.map(c => (
                <div key={c.id} onClick={() => setClassFilter(c.id)} style={{
                  background: classFilter === c.id ? 'var(--text)' : 'var(--bg-secondary)',
                  color: classFilter === c.id ? 'var(--bg)' : 'var(--text)',
                  border: '1px solid var(--border)', borderRadius: 'var(--radius)',
                  padding: '5px 10px', fontSize: 11, cursor: 'pointer', whiteSpace: 'nowrap',
                }}>
                  <span style={{ fontWeight: 500 }}>{c.name}</span>
                  <span style={{ marginLeft: 5, opacity: 0.7 }}>{c.start_time?.slice(0,5)}–{c.end_time?.slice(0,5)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Large headcount display for quick visual reference during a session -- click to shortlist to only attended students, click again to show everyone */}
      <div onClick={() => setShowOnlyAttended(v => !v)} title="Click to shortlist to attended students only"
        style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 10, cursor: 'pointer' }}>
        <span style={{ fontSize: 36, fontWeight: 700, lineHeight: 1, color: showOnlyAttended ? '#1D9E75' : 'var(--text)' }}>
          {displayStudents.filter(s => attendance[s.id] && attendance[s.id] !== 'none').length}
        </span>
        <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
          attending today{showOnlyAttended ? ' (shortlisted)' : ''}
          <span style={{ marginLeft: 6, color: 'var(--text-tertiary)' }}>
            ({displayStudents.filter(s => attendance[s.id] === 'full_kit').length} full kit)
          </span>
        </span>
      </div>

      {/* Quick attendance + select row (moved above search, per Aug 2026 request).
          Sticky so these stay reachable while scrolling through a long
          student list -- picking students, then attendance/points,
          without scrolling back up each time. */}
      <div style={{
        display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap', alignItems: 'center',
        position: 'sticky', top: 0, zIndex: 15, background: 'var(--bg)', padding: '8px 0',
      }}>
        <button className="btn btn-sm" style={{ background: selectedStudents.length ? '#e6f1fb' : 'var(--bg-tertiary)', color: selectedStudents.length ? '#185fa5' : 'var(--text-tertiary)', border: `1px solid ${selectedStudents.length ? '#185fa540' : 'var(--border)'}`, cursor: selectedStudents.length ? 'pointer' : 'not-allowed' }}
          onClick={() => markAttendance('attended')} disabled={!selectedStudents.length || saving}>
          ✓ Attended{selectedStudents.length ? ` (${selectedStudents.length})` : ''}
        </button>
        <button className="btn btn-sm" style={{ background: selectedStudents.length ? '#eaf3de' : 'var(--bg-tertiary)', color: selectedStudents.length ? '#3b6d11' : 'var(--text-tertiary)', border: `1px solid ${selectedStudents.length ? '#3b6d1140' : 'var(--border)'}`, cursor: selectedStudents.length ? 'pointer' : 'not-allowed' }}
          onClick={() => markAttendance('full_kit')} disabled={!selectedStudents.length || saving}>
          ✓ Full Kit{selectedStudents.length ? ` (${selectedStudents.length})` : ''}
        </button>
        {selectedStudents.length > 0 ? (
          <>
            <button className="btn btn-sm" onClick={() => setSelectedStudents([])}>✕ Deselect all</button>
            <button className="btn btn-primary btn-sm" onClick={() => setMultiAward(true)}>+ Points ({selectedStudents.length})</button>
          </>
        ) : (
          <button className="btn btn-sm" onClick={() => setSelectedStudents(displayStudents.map(s => s.id))}>☐ Select all</button>
        )}
      </div>

      {/* Search row */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search students…"
          style={{ flex: 1, minWidth: 160, padding: '7px 10px', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius)', fontSize: 13, background: 'var(--bg-secondary)', color: 'var(--text)' }} />
      </div>

      {/* Double-session cascade undo banner -- appears when marking
          attendance for the first half of a known double-session pair
          also auto-covered the second half for one or more students. */}
      {cascadedEntries.length > 0 && (
        <div className="card" style={{ marginBottom: 10, padding: '10px 14px', background: '#1D9E7512', border: '1px solid #1D9E7540' }}>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6, color: '#1D9E75' }}>
            Also marked present for the following session{cascadedEntries.length === 1 ? '' : 's'} (double session — undo any who are only staying for one):
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {cascadedEntries.map((entry, i) => (
              <div key={`${entry.studentId}-${entry.classId}-${i}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12 }}>
                <span>{entry.studentName} — {entry.classLabel}</span>
                <button className="btn btn-sm" onClick={() => undoCascadedEntry(entry)}>Undo</button>
              </div>
            ))}
          </div>
        </div>
      )}


      {/* Table */}
      {loading ? <div className="loading">Loading…</div> : (
        <div className="card" style={{ padding: 0, overflowX: 'auto' }} ref={tableRef}
          tabIndex={0}
          onKeyDown={e => {
            const ids = displayStudents.map(s => s.id)
            const lastSel = selectedStudents[selectedStudents.length - 1]
            const currentIdx = ids.indexOf(lastSel)
            if (e.key === 'ArrowDown') { e.preventDefault(); const next = ids[Math.min(currentIdx + 1, ids.length - 1)]; setSelectedStudents([next]) }
            if (e.key === 'ArrowUp') { e.preventDefault(); const prev = ids[Math.max(currentIdx - 1, 0)]; setSelectedStudents([prev]) }
            if (e.key === 'Enter' && selectedStudents.length > 0) {
              e.preventDefault()
              const curId = selectedStudents[selectedStudents.length - 1]
              const ids = displayStudents.map(s => s.id)
              const curIdx = ids.indexOf(curId)
              markAttendance('attended').then ? markAttendance('attended').then(() => {
                // Stay at same position
                setSelectedStudents([curId])
              }) : (markAttendance('attended'), setSelectedStudents([curId]))
            }
            if ((e.key === 'k' || e.key === 'K') && selectedStudents.length > 0) {
              e.preventDefault()
              const curId = selectedStudents[selectedStudents.length - 1]
              markAttendance('full_kit')
              setTimeout(() => setSelectedStudents([curId]), 100)
            }
            if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); if (attendHistory.length > 0) { setAttendFuture(f => [attendance, ...f]); setAttendance(attendHistory[attendHistory.length-1]); setAttendHistory(h => h.slice(0,-1)) } }
            if ((e.ctrlKey || e.metaKey) && e.key === 'y') { e.preventDefault(); if (attendFuture.length > 0) { setAttendHistory(h => [...h, attendance]); setAttendance(attendFuture[0]); setAttendFuture(f => f.slice(1)) } }
          }}>
          {selectedClass && (
            <div style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <Link to={`/classes?class_id=${selectedClass.id}`} className="btn btn-sm">📋 View class</Link>
              {!showEndTimeEditor ? (
                <button className="btn btn-sm" onClick={() => {
                  setEndTimeDraft((selectedClass.session_end_overrides || {})[date] || selectedClass.end_time || '')
                  setShowEndTimeEditor(true)
                }}>
                  ⏱ Session end: {((selectedClass.session_end_overrides || {})[date] || selectedClass.end_time || '—').slice(0, 5)}
                  {(selectedClass.session_end_overrides || {})[date] && ' (extended)'}
                </button>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--bg-secondary)', padding: '4px 8px', borderRadius: 'var(--radius)' }}>
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Session ran over — actual end time:</span>
                  <input type="time" value={endTimeDraft} onChange={e => setEndTimeDraft(e.target.value)} style={{ fontSize: 12, padding: '3px 6px' }} />
                  <button className="btn btn-sm btn-primary" disabled={savingEndTime || !endTimeDraft} onClick={saveSessionEndTimeOverride}>
                    {savingEndTime ? 'Saving…' : 'Save'}
                  </button>
                  {(selectedClass.session_end_overrides || {})[date] && (
                    <button className="btn btn-sm" onClick={clearSessionEndTimeOverride}>Reset to default</button>
                  )}
                  <button className="btn btn-sm" onClick={() => setShowEndTimeEditor(false)}>Cancel</button>
                </div>
              )}
            </div>
          )}
          <table style={{ minWidth: isKR ? 900 : 680 }}>
            <thead style={{ position: 'sticky', top: 46, zIndex: 12, background: 'var(--bg)' }}>
              <tr>
                {visibleCols.includes('checkbox') && <th style={{ width: 32, paddingLeft: 12, background: 'var(--bg)' }}></th>}
                {visibleCols.includes('student_ref') && <SortTh col="student_ref" label="ID" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />}
                {visibleCols.includes('name')        && <SortTh col="first_name" label="Name" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />}
                {visibleCols.includes('age')         && <SortTh col="age" label="Age" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />}
                {visibleCols.includes('house')       && <SortTh col="house" label="House" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />}
                {visibleCols.includes('grade')       && <SortTh col="grade" label="Grade" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />}
                {visibleCols.includes('class_time')  && <th style={{ background: 'var(--bg)' }}>Class time</th>}
                {isKR && <>
                  <SortTh col="competition_team" label="Experience" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  <SortTh col="discipline_codes" label="Discipline" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  <SortTh col="weight_kg" label="Weight" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  <SortTh col="age_category_kr" label="Age cat." sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                </>}
                {(regType === 'kr' || regType === 'krba') && (() => {
                  const inCount = displayStudents.filter(s => s.in_comp).length
                  const outCount = displayStudents.length - inCount
                  return (
                    <SortTh col="in_comp" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} style={{ textAlign: 'center' }}
                      label={<>
                        <div>In comp</div>
                        <div style={{ fontSize: 9, fontWeight: 400, color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>{inCount} in · {outCount} out</div>
                      </>} />
                  )
                })()}
                {(regType === 'kr' || regType === 'krba') && <SortTh col="wins" label="Record" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} style={{ textAlign: 'center' }} />}
                {visibleCols.includes('groups')      && <GroupFilterTh sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} groupFilter={groupFilter} setGroupFilter={setGroupFilter} filterOpen={groupFilterOpen} setFilterOpen={setGroupFilterOpen} />}
                {visibleCols.includes('attendance')  && (
                  <SortTh col="attendance" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} style={{ textAlign: 'center' }}
                    label={<>
                      <div>Attend.</div>
                      <div style={{ fontSize: 9, fontWeight: 400, color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>
                        ✓{Object.keys(attendance).filter(id => attendance[id] && attendance[id] !== 'none').length}/{displayStudents.length}
                        {' '}kit:{Object.values(attendance).filter(v => v === 'full_kit').length}
                      </div>
                    </>} />
                )}
                {regType === 'krba' && <th style={{ textAlign: 'center', background: 'var(--bg)' }}>Weight (in → out)</th>}
                {visibleCols.includes('champ')       && <th style={{ textAlign: 'center', background: 'var(--bg)' }}>🏆</th>}
                {visibleCols.includes('media')       && <SortTh col="media_restriction" label="Media" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} style={{ textAlign: 'center' }} />}
                {visibleCols.includes('points')      && <SortTh col="house_points" label="Pts" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} style={{ textAlign: 'center' }} />}
                {(isAdmin || isLeader) && <th style={{ background: 'var(--bg)' }}></th>}
              </tr>
            </thead>
            <tbody>
              {displayStudents.length === 0 ? (
                <tr><td colSpan={12} style={{ textAlign: 'center', padding: 40, color: 'var(--text-tertiary)' }}>No students found</td></tr>
              ) : displayStudents.map((s, idx) => {
                const m = s.members
                const houseName = s.house_name || m?.houses?.name
                const colour = HOUSE_COLOURS[houseName] || '#888'
                const age = calcAge(m?.date_of_birth)
                const isSelected = selectedStudents.includes(s.id)
                const attendState = attendance[s.id] || 'none'
                const groups = studentGroups(s, m)

                return (
                  <tr key={s.id}
                    onClick={() => setSelectedStudents(prev => prev.includes(s.id) ? prev.filter(x => x !== s.id) : [...prev, s.id])}
                    style={{
                      background: isSelected ? '#e6f1fb' : undefined,
                      outline: isSelected ? '2px solid #378ADD' : undefined,
                      cursor: 'pointer',
                    }}>
                    {visibleCols.includes('checkbox') && <td style={{ paddingLeft: 12 }} onClick={e => e.stopPropagation()}>
                      <input type="checkbox" checked={isSelected}
                        onChange={() => setSelectedStudents(prev => prev.includes(s.id) ? prev.filter(x => x !== s.id) : [...prev, s.id])}
                        style={{ width: 14, height: 14 }} />
                    </td>}
                    {visibleCols.includes('student_ref') && <td onClick={e => { e.stopPropagation(); setContactModal(s) }}>
                      <span style={{ color: '#185fa5', fontSize: 11, fontWeight: 600, cursor: 'pointer', textDecoration: 'underline', fontFamily: 'monospace' }}>
                        {s.student_ref || '—'}
                      </span>
                    </td>}
                    {visibleCols.includes('name') && <td>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ color: 'var(--text)', fontWeight: 500, fontSize: 13 }}>
                          {m?.first_name} {m?.last_name}
                        </span>
                        {(() => {
                          const bday = getBirthdayInfo(m?.date_of_birth)
                          if (!bday) return null
                          return (
                            <button onClick={e => { e.stopPropagation(); setBirthdayPopup({ name: `${m?.first_name} ${m?.last_name}`, info: bday }) }}
                              title="Upcoming birthday" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, padding: 0, lineHeight: 1 }}>
                              🎂
                            </button>
                          )
                        })()}
                      </span>
                    </td>}
                    {visibleCols.includes('age') && <td style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{age}</td>}
                    {visibleCols.includes('house') && <td>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12 }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: colour, display: 'inline-block' }} />
                        {houseName || '—'}
                      </span>
                    </td>}
                    {visibleCols.includes('grade') && <td style={{ fontSize: 12 }}>{s.pka_belt || s.krba_level || '—'}</td>}
                    {visibleCols.includes('class_time') && <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{s.class_time || '—'}</td>}
                    {isKR && (
                      <>
                        <td><span className={`badge ${s.competition_team==='Advanced'?'badge-purple':s.competition_team==='Intermediate'?'badge-blue':'badge-gray'}`} style={{ fontSize: 10 }}>{s.competition_team || '—'}</span></td>
                        <td style={{ fontSize: 11 }}>{s.discipline_codes || '—'}</td>
                        <td style={{ fontSize: 12 }}>{s.weight_kg ? `${s.weight_kg}kg` : '—'}</td>
                        <td style={{ fontSize: 11 }}>{s.age_category_kr || s.age_category || '—'}</td>
                      </>
                    )}
                    {(regType === 'kr' || regType === 'krba') && (
                      <td style={{ textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                        <button onClick={() => toggleInComp(s)}
                          className={`badge ${s.in_comp ? 'badge-green' : 'badge-gray'}`}
                          style={{ fontSize: 9, cursor: 'pointer', border: 'none' }}
                          title={s.in_comp ? 'Click to mark out of comp' : 'Click to mark in comp'}>
                          {s.in_comp ? 'In comp' : 'Out of comp'}
                        </button>
                      </td>
                    )}
                    {(regType === 'kr' || regType === 'krba') && (
                      <td style={{ textAlign: 'center' }} onClick={e => e.stopPropagation()} onTouchStart={e => e.stopPropagation()} onTouchEnd={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', gap: 2, alignItems: 'center', justifyContent: 'center' }}>
                          <input type="number" min="0" defaultValue={s.wins || 0} title="Wins"
                            onBlur={e => { const v = parseInt(e.target.value) || 0; if (v !== (s.wins || 0)) updateWLD(s.id, 'wins', v) }}
                            style={{ width: 30, fontSize: 11, padding: '2px 2px', textAlign: 'center', border: '1px solid var(--border-strong)', borderRadius: 4, background: 'var(--bg-secondary)', color: 'var(--text)' }} />
                          <input type="number" min="0" defaultValue={s.losses || 0} title="Losses"
                            onBlur={e => { const v = parseInt(e.target.value) || 0; if (v !== (s.losses || 0)) updateWLD(s.id, 'losses', v) }}
                            style={{ width: 30, fontSize: 11, padding: '2px 2px', textAlign: 'center', border: '1px solid var(--border-strong)', borderRadius: 4, background: 'var(--bg-secondary)', color: 'var(--text)' }} />
                          <input type="number" min="0" defaultValue={s.draws || 0} title="Draws"
                            onBlur={e => { const v = parseInt(e.target.value) || 0; if (v !== (s.draws || 0)) updateWLD(s.id, 'draws', v) }}
                            style={{ width: 30, fontSize: 11, padding: '2px 2px', textAlign: 'center', border: '1px solid var(--border-strong)', borderRadius: 4, background: 'var(--bg-secondary)', color: 'var(--text)' }} />
                        </div>
                      </td>
                    )}
                    {visibleCols.includes('groups') && <td onClick={e => e.stopPropagation()}>
                      <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                        {groups.length > 0 ? groups.map(g => (
                          <span key={g}
                            className={`badge ${g==='KR'?'badge-purple':g==='PTs'?'badge-blue':g==='Leader'?'badge-green':g==='Coach'?'badge-amber':g==='PKA'?'badge-gray':'badge-red'}`}
                            style={{ fontSize: 9, cursor: 'pointer' }}
                            title={g==='PKA' ? 'View membership profile' : g==='KR' || g==='KRBA' ? 'View athlete profile' : undefined}
                            onClick={e => {
                              e.stopPropagation()
                              if (g === 'PKA') setContactModal(s)
                              else if (g === 'KR' || g === 'KRBA') navigate(`/athletes?id=${s.id}&from=register`)
                            }}>{g}</span>
                        )) : <span style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>—</span>}
                      </div>
                    </td>}
                    {visibleCols.includes('attendance') && <td style={{ textAlign: 'center' }} onClick={e => { e.stopPropagation(); toggleAttendance(s.id) }}>
                      <span style={{
                        display: 'inline-block', padding: '3px 8px', borderRadius: 20, fontSize: 10, fontWeight: 600, cursor: 'pointer',
                        background: attendState==='full_kit'?'#eaf3de':attendState==='attended'?'#e6f1fb':'var(--bg-tertiary)',
                        color: attendState==='full_kit'?'#3b6d11':attendState==='attended'?'#185fa5':'var(--text-tertiary)',
                      }}>
                        {attendState==='full_kit'?'✓ Full kit':attendState==='attended'?'✓ Attended':'—'}
                      </span>
                    </td>}
                    {regType === 'krba' && (() => {
                      const w = weightByStudent[s.id]
                      return (
                        <td style={{ textAlign: 'center', fontSize: 12 }}>
                          {!w ? <span style={{ color: 'var(--text-tertiary)' }}>—</span> : (
                            <span>
                              {w.weight_before != null ? `${w.weight_before}kg` : '—'}
                              {w.weight_after != null ? ` → ${w.weight_after}kg` : ''}
                            </span>
                          )}
                        </td>
                      )
                    })()}
                    {visibleCols.includes('champ') && <td style={{ textAlign: 'center', fontWeight: 600, fontSize: 13 }}>
                      {s.class_champion_count > 0 ? `🏆 ${s.class_champion_count}` : <span style={{ color: 'var(--text-tertiary)' }}>0</span>}
                    </td>}
                    {visibleCols.includes('media') && <td style={{ textAlign: 'center' }}>
                      <span className={`badge ${s.media_restriction==='No'?'badge-red':s.media_restriction==='Limited'?'badge-amber':'badge-green'}`} style={{ fontSize: 10 }}>
                        {s.media_restriction==='No'?'⚠ No':s.media_restriction==='Limited'?'Limited':'OK'}
                      </span>
                    </td>}
                    {visibleCols.includes('points') && <td style={{ textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                      <div style={{ fontSize: 11, lineHeight: 1.4 }}>
                        <div><span style={{ color: 'var(--text-tertiary)', fontSize: 10 }}>H </span><strong>{s.house_points || 0}</strong></div>
                        <div><span style={{ color: 'var(--text-tertiary)', fontSize: 10 }}>I </span><strong>{s.individual_points || 0}</strong></div>
                      </div>
                      {(() => {
                        const dayEntries = pointsByStudent[s.id] || []
                        const dayTotal = dayEntries.reduce((sum, p) => sum + (p.points_awarded || 0), 0)
                        return dayEntries.length > 0 ? (
                          <button onClick={() => setPointsPanelFor(s)}
                            style={{ marginTop: 4, fontSize: 10, fontWeight: 600, color: '#1D9E75', background: '#1D9E7515', border: 'none', borderRadius: 10, padding: '2px 7px', cursor: 'pointer' }}>
                            +{dayTotal} today ({dayEntries.length})
                          </button>
                        ) : null
                      })()}
                    </td>}
                    {(isAdmin || isLeader) && (
                      <td onClick={e => e.stopPropagation()}>
                        <button className="btn btn-sm btn-primary" onClick={() => { setAwardingFor(s); setSelectedPoints([]) }} style={{ fontSize: 11, padding: '4px 8px' }}>+ Pts</button>
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* One-off student addition */}
      <OneOffStudent displayStudents={displayStudents} onAdd={(s) => setStudents(prev => prev.find(x => x.id === s.id) ? prev : [...prev, s])} date={date} />

      {/* Contact modal */}
      {birthdayPopup && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 55, padding: 16 }}
          onClick={() => setBirthdayPopup(null)}>
          <div className="card" style={{ width: '100%', maxWidth: 320, textAlign: 'center' }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 36, marginBottom: 8 }}>🎂</div>
            <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 10 }}>{birthdayPopup.name}</h2>
            <p style={{ fontSize: 13, marginBottom: 4 }}>
              {birthdayPopup.info.nextBirthday.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
            </p>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 4 }}>
              {birthdayPopup.info.daysUntil === 0 ? "Today! 🎉" : birthdayPopup.info.daysUntil === 1 ? 'Tomorrow' : `${birthdayPopup.info.daysUntil} days to go`}
            </p>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 14 }}>
              Turning {birthdayPopup.info.turningAge}
            </p>
            <button className="btn btn-sm" onClick={() => setBirthdayPopup(null)}>Close</button>
          </div>
        </div>
      )}

      {contactModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 }}>
          <div className="card" style={{ width: '100%', maxWidth: 380 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14 }}>
              <h2 style={{ fontSize: 15, fontWeight: 600 }}>{contactModal.members?.first_name} {contactModal.members?.last_name}</h2>
              <button onClick={() => setContactModal(null)} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer' }}>✕</button>
            </div>
            {[
              ['Student ID', contactModal.student_ref],
              ['Phone', contactModal.members?.phone || '—'],
              ['Email', contactModal.members?.email || '—'],
              ['DOB', contactModal.members?.date_of_birth || '—'],
              ['House', contactModal.house_name || contactModal.members?.houses?.name || '—'],
              ['Grade', contactModal.pka_belt || contactModal.krba_level || '—'],
              ['Class', `${contactModal.class_schedule || '—'} ${contactModal.class_time || ''}`],
              ['Groups', [contactModal.is_kr&&'KR', contactModal.is_pts&&'PTs', contactModal.is_leader&&'Leader'].filter(Boolean).join(', ') || 'None'],
            ].map(([label, val]) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
                <span style={{ fontWeight: 500 }}>{val}</span>
              </div>
            ))}
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              {contactModal.members?.phone && <a href={`tel:${contactModal.members.phone}`} className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }}>📞 Call</a>}
              <button className="btn" style={{ flex: 1, justifyContent: 'center' }} onClick={() => { setContactModal(null); navigate(`/students?id=${contactModal.id}`) }}>View profile →</button>
            </div>
          </div>
        </div>
      )}

      {pointsPanelFor && (() => {
        const entries = pointsByStudent[pointsPanelFor.id] || []
        return (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 }}>
            <div className="card" style={{ width: '100%', maxWidth: 440 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <h2 style={{ fontSize: 15, fontWeight: 600 }}>{pointsPanelFor.members?.first_name} {pointsPanelFor.members?.last_name}</h2>
                <button onClick={() => setPointsPanelFor(null)} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer' }}>✕</button>
              </div>
              <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 14 }}>
                Points awarded on {new Date(date + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
              </p>
              {entries.length === 0 ? (
                <p style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>No points awarded this day.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {entries.map(entry => (
                    <div key={entry.id} style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '10px 12px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <span style={{ fontSize: 13, fontWeight: 500 }}>{entry.point_type}</span>
                        <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{entry.point_scope}</span>
                      </div>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                        <input type="number" defaultValue={entry.points_awarded}
                          onBlur={e => { const v = parseInt(e.target.value); if (!isNaN(v) && v !== entry.points_awarded) updatePointEntry(entry, v, entry.note) }}
                          style={{ width: 70, padding: '4px 6px', fontSize: 13, textAlign: 'center', border: '1px solid var(--border-strong)', borderRadius: 6, background: 'var(--bg-secondary)', color: 'var(--text)' }} />
                        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>points</span>
                        <button onClick={() => deletePointEntry(entry)} style={{ marginLeft: 'auto', fontSize: 11, color: '#a32d2d', background: 'none', border: '1px solid #a32d2d', borderRadius: 6, padding: '3px 8px', cursor: 'pointer' }}>Remove</button>
                      </div>
                      <input defaultValue={entry.note || ''} placeholder="Note / reason"
                        onBlur={e => { if (e.target.value !== (entry.note || '')) updatePointEntry(entry, entry.points_awarded, e.target.value) }}
                        style={{ width: '100%', padding: '5px 8px', fontSize: 12, border: '1px solid var(--border-strong)', borderRadius: 6, background: 'var(--bg-secondary)', color: 'var(--text)' }} />
                    </div>
                  ))}
                </div>
              )}
              <button className="btn" style={{ width: '100%', justifyContent: 'center', marginTop: 14 }} onClick={() => setPointsPanelFor(null)}>Close</button>
            </div>
          </div>
        )
      })()}

      {/* Award points modal */}
      {(awardingFor || multiAward) && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 }}>
          <div className="card" style={{ width: '100%', maxWidth: 500, maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <h2 style={{ fontSize: 15, fontWeight: 600 }}>Award points</h2>
              <button onClick={() => { setAwardingFor(null); setMultiAward(false); setSelectedPoints([]) }} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer' }}>✕</button>
            </div>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 14 }}>
              {multiAward ? `${selectedStudents.length} students selected` : `${awardingFor?.members?.first_name} ${awardingFor?.members?.last_name}`}
            </p>
            {/* Grouped points — Group → Reason: Points */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}>
              {(() => {
                // Group point types by their group field, or 'General' if none
                const groups = {}
                pointTypes.forEach(pt => {
                  const grp = pt.group || 'General'
                  if (!groups[grp]) groups[grp] = []
                  groups[grp].push(pt)
                })
                return Object.entries(groups).map(([grpName, pts]) => (
                  <div key={grpName}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6, paddingLeft: 2 }}>{grpName}</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                      {pts.map(pt => {
                        const sel = selectedPoints.find(p => p.label === pt.label)
                        const isNeg = pt.points < 0
                        return (
                          <button key={pt.label} onClick={() => togglePoint(pt)} style={{
                            padding: '8px 10px', borderRadius: 'var(--radius)', cursor: 'pointer',
                            border: `${sel ? 2 : 1}px solid ${sel ? (isNeg?'#a32d2d':'var(--text)') : 'var(--border-strong)'}`,
                            background: sel ? (isNeg?'#fcebeb':'var(--bg-secondary)') : 'var(--bg)',
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            fontFamily: 'var(--font-sans)', textAlign: 'left',
                          }}>
                            <span style={{ fontSize: 12, fontWeight: sel?600:400, color: isNeg?'#a32d2d':'var(--text)' }}>{pt.label}</span>
                            <span style={{ fontSize: 13, fontWeight: 700, color: isNeg?'#a32d2d':'#1d9e75', marginLeft: 6 }}>{pt.points > 0 ? '+' : ''}{pt.points}</span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))
              })()}

              {/* Custom points */}
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6, paddingLeft: 2 }}>Custom</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input type="number" value={customPoints} onChange={e => setCustomPoints(e.target.value)}
                    placeholder="±pts" style={{ width: 70, padding: '8px 10px', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius)', fontSize: 13, fontWeight: 700, textAlign: 'center', background: 'var(--bg-secondary)', color: 'var(--text)' }} />
                  <input value={customLabel} onChange={e => setCustomLabel(e.target.value)}
                    placeholder="Reason for custom points…"
                    style={{ flex: 1, padding: '8px 10px', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius)', fontSize: 13, background: 'var(--bg-secondary)', color: 'var(--text)' }} />
                  <button className="btn btn-sm" disabled={!customLabel.trim() || customPoints === ''}
                    onClick={() => {
                      const pts = parseInt(customPoints)
                      if (isNaN(pts) || !customLabel.trim()) return
                      setSelectedPoints(prev => [...prev, { label: customLabel.trim(), points: pts }])
                      setCustomLabel(''); setCustomPoints('')
                    }}>+ Add</button>
                </div>
              </div>
            </div>
            {selectedPoints.length > 0 && (
              <div style={{ background: 'var(--bg-secondary)', borderRadius: 'var(--radius)', padding: '10px 12px', marginBottom: 12 }}>
                {selectedPoints.map(p => (
                  <div key={p.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                    <span>{p.label}</span>
                    <span style={{ fontWeight: 600, color: p.points<0?'#a32d2d':'#1d9e75' }}>{p.points>0?'+':''}{p.points}</span>
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, fontWeight: 700, marginTop: 6, paddingTop: 6, borderTop: '1px solid var(--border)' }}>
                  <span>Total {multiAward ? `× ${selectedStudents.length}` : ''}</span>
                  <span style={{ color: pointsTotal<0?'#a32d2d':'#1d9e75' }}>{pointsTotal>0?'+':''}{pointsTotal} pts</span>
                </div>
              </div>
            )}
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn" onClick={() => { setAwardingFor(null); setMultiAward(false); setSelectedPoints([]) }}>Cancel</button>
              <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }}
                onClick={() => submitPoints(multiAward ? selectedStudents : [awardingFor.id], selectedPoints)}
                disabled={saving || selectedPoints.length === 0}>
                {saving ? 'Saving…' : `Award to ${multiAward ? selectedStudents.length + ' students' : awardingFor?.members?.first_name}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
