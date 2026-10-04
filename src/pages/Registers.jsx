
function OneOffStudent({ displayStudents, onAdd, date }) {
  const [search, setSearch] = useState('')
  const [results, setResults] = useState([])
  const [added, setAdded] = useState([])

  useEffect(() => {
    if (search.length < 2) { setResults([]); return }
    const t = setTimeout(async () => {
      // A single .or() only ever checked whether the WHOLE typed
      // string matched one field or the other, so a full-name search
      // like "Anthony Piorkowski" could never match anyone, since
      // neither their first name nor their last name alone contains
      // both words together. Fetches a broader candidate set (anyone
      // matching ANY word) via one combined .or(), then filters
      // client-side to require every word to match first_name,
      // last_name, or the full name somewhere -- avoiding any
      // uncertainty about whether chaining multiple .or() calls
      // ANDs them together the way a single query needs here.
      const words = search.trim().split(/\s+/).filter(Boolean)
      const orClause = words.map(w => `first_name.ilike.%${w}%,last_name.ilike.%${w}%`).join(',')
      const { data: candidates } = await supabase
        .from('members').select('id, first_name, last_name, status')
        .or(orClause).limit(50)
      const memberData = (candidates || []).filter(m => matchesSearch(search, m.first_name, m.last_name)).slice(0, 8)
      if (!memberData?.length) { setResults([]); return }
      const eligibleMembers = memberData.filter(m => m.status !== 'stopped' && m.status !== 'not_started')
      const { data: stuData } = await supabase
        .from('students').select('id, student_ref, pka_belt, house_name, weight_kg, member_id, members(first_name, last_name, houses(name))')
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
import { assignmentActiveOn, todayISO } from '../lib/classAssignments.jsx'
import { matchesSearch } from '../lib/searchMatch.js'
import { useAuth } from '../hooks/useAuth.jsx'
import StudentProfile from '../components/students/StudentProfile.jsx'
import { useSyncedPreference } from '../hooks/useSyncedPreference.js'
import { studentProfileLink } from '../lib/studentLinks.js'
import AttendanceCalendarModal from '../components/shared/AttendanceCalendarModal.jsx'
import { ownAttendanceRate, isAttendedType, toLocalISO as toLocalISODate } from '../lib/attendanceDays.js'

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

// Media consent as a coloured camera icon: green = OK, orange = limited, red (crossed) = no media
function MediaCam({ restriction, size = 18 }) {
  const c = restriction === 'No' ? '#E24B4A' : restriction === 'Limited' ? '#EF9F27' : '#1D9E75'
  const label = restriction === 'No' ? 'No media' : restriction === 'Limited' ? 'Limited media' : 'Media OK'
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" role="img" aria-label={label} style={{ flexShrink: 0 }}>
      <title>{label}</title>
      <path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" />
      {restriction === 'No' && <path d="M3 3l18 18" />}
    </svg>
  )
}
const fmtDob = d => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d || ''); return m ? `${m[3]}-${m[2]}-${m[1]}` : (d || '—') }

// Grade text colours (belt / level) used on the register + contact card
const GRADE_COLOURS = {
  white: '#E8E8E8', yellow: '#F5C542', orange: '#F5821F', green: '#1D9E75', blue: '#378ADD', purple: '#8B5CF6',
  red: '#E24B4A', brown: '#B5733C', black: '#C0C4CC',
  beginner: '#1D9E75', novice: '#378ADD', intermediate: '#EF9F27', advanced: '#E24B4A', professional: '#F5C542', elite: '#F5C542',
}
function gradeColour(g) {
  if (!g) return undefined
  const k = String(g).toLowerCase()
  const hit = Object.keys(GRADE_COLOURS).find(c => k.startsWith(c) || k.includes(` ${c}`))
  return hit ? GRADE_COLOURS[hit] : undefined
}

// Mobile register: house names in their house colour; last-in / start dates
const HOUSE_TEXT = { dragon: '#E24B4A', super: '#F5821F', ice: '#378ADD', jet: '#22B14C' }
const houseText = name => HOUSE_TEXT[String(name || '').toLowerCase().replace(' house', '').trim()]
const ddmm = d => { const [, mm, dd] = String(d).slice(0, 10).split('-'); return `${dd}/${mm}` }
const monthsSince = d => { const a = new Date(String(d).slice(0, 10) + 'T12:00:00'), b = new Date(); let m = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth()); if (b.getDate() < a.getDate()) m--; return Math.max(0, m) }
const mmyy = d => { const [yy, mm] = String(d).slice(0, 10).split('-'); return `${mm}/${yy.slice(2)}` }
const lastInColour = d => ((Date.now() - new Date(String(d).slice(0, 10) + 'T12:00:00')) / 86400000 < 28 ? '#EF9F27' : '#E24B4A') // < 4 weeks orange, else red

export default function Registers({ initialRegType, onStudentNameClick, onWeightClick } = {}) {
  const { isAdmin, isCoach, isLeader, isStaff, registerAccess } = useAuth()
  // Per-person register access (Settings -> Team): which register types and classes this person may take
  const allowedRegTypes = registerAccess?.types || null     // null = all
  const allowedClassIds = registerAccess?.classes || null   // null = all
  const regTypeAllowed = k => !allowedRegTypes || allowedRegTypes.includes(k)
  const classAllowed = c => !allowedClassIds || allowedClassIds.includes(c.id)
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [regType, setRegType]           = useState(initialRegType || 'class')
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
  const [dobPopupStudentId, setDobPopupStudentId] = useState(null)
  useEffect(() => {
    if (!dobPopupStudentId) return
    function handleOutsideClick() { setDobPopupStudentId(null) }
    document.addEventListener('click', handleOutsideClick)
    return () => document.removeEventListener('click', handleOutsideClick)
  }, [dobPopupStudentId])
  // The table header below is sticky, positioned just under this
  // toolbar -- it previously assumed a hardcoded 46px gap, but the
  // toolbar can genuinely wrap onto two lines (narrow screens, or once
  // "+ Points (N)"/"Deselect all" appear after selecting students),
  // making it taller than that guess and causing the header -- and the
  // first row of students -- to end up partially hidden underneath it.
  // Measuring the toolbar's real height keeps the header positioned
  // correctly regardless of how many lines it's actually wrapped to.
  const registerToolbarRef = useRef(null)
  const [registerToolbarHeight, setRegisterToolbarHeight] = useState(46)
  useEffect(() => {
    const el = registerToolbarRef.current
    if (!el) return
    const observer = new ResizeObserver(entries => {
      const h = entries[0]?.contentRect?.height
      if (h) setRegisterToolbarHeight(Math.ceil(h))
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  const [selectedPoints, setSelectedPoints]     = useState([])
  const [customLabel, setCustomLabel]           = useState('')
  const [customPoints, setCustomPoints]         = useState('')
  const [saving, setSaving]             = useState(false)
  const [attendHistory, setAttendHistory] = useState([])
  const [attendFuture, setAttendFuture]   = useState([])
  const [contactModal, setContactModal] = useState(null)
  const [enlargedPhoto, setEnlargedPhoto] = useState(null)
  const photoHoldTimer = useRef(null)
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
  const [sortThen, setSortThen]         = useState([])      // tie-breaker sorts (previously tapped columns)
  const [selectedFirst, setSelectedFirst] = useState(false) // selected students to the top
  const [sortDir, setSortDir]           = useState('asc')
  const [groupFilter, setGroupFilter]   = useState('') // '' = all groups; else 'KR'|'PTs'|'Leader'|'Coach'|'PKA'|'KRBA'
  const [groupFilterOpen, setGroupFilterOpen] = useState(false)
  // Adhoc register
  const [adhocSearch, setAdhocSearch]   = useState('')
  const [adhocResults, setAdhocResults] = useState([])
  const [adhocPills, setAdhocPills]     = useState([]) // { id, name, student_ref }
  const oneOffStudentsRef = useRef([]) // full student objects added via "one-off" this session -- kept separately so a reload (date/regType change, or a slow fetch resolving after they were added) can never silently wipe them back out
  const tableRef = useRef(null)
  const [registerZoom, setRegisterZoom] = useSyncedPreference('register_zoom', 100)
  // Distinguishes a horizontal swipe (to see other columns) from a
  // genuine tap-to-select -- mobile browsers can still fire a click
  // after a touch that moved a little, so this tracks the actual
  // distance moved and suppresses the row's select-toggle if it looks
  // like a swipe rather than a tap.
  const touchStartRef = useRef(null)
  function handleRowTouchStart(e) {
    const t = e.touches?.[0]
    if (t) touchStartRef.current = { x: t.clientX, y: t.clientY }
  }
  function handleRowTouchMove(e) {
    const start = touchStartRef.current
    const t = e.touches?.[0]
    if (!start || !t) return
    if (Math.abs(t.clientX - start.x) > 10 || Math.abs(t.clientY - start.y) > 10) touchStartRef.current = { ...start, moved: true }
  }
  function handleRowClick(studentId) {
    if (touchStartRef.current?.moved) { touchStartRef.current = null; return } // was a swipe, not a tap -- don't toggle selection
    touchStartRef.current = null
    setSelectedStudents(prev => prev.includes(studentId) ? prev.filter(x => x !== studentId) : [...prev, studentId])
  }
  const [showColPicker, setShowColPicker] = useState(false)
  const [visibleColsRaw, setVisibleCols] = useSyncedPreference('register_cols', ['checkbox','student_ref','name','age','house','grade','groups','attendance','media','points','record'])
  // "record" wasn't a toggleable option before -- it was always shown
  // for KR/KRBA regardless of any saved preference, so an existing
  // saved list predating this change shouldn't be read as "the user
  // chose to hide it".
  const visibleCols = visibleColsRaw.includes('record') ? visibleColsRaw : [...visibleColsRaw, 'record']

  const ALL_REG_COLS = [
    { key: 'checkbox',    label: 'Select' },
    { key: 'student_ref', label: 'ID' },
    { key: 'name',        label: 'Name' },
    { key: 'age',         label: 'Age' },
    { key: 'house',       label: 'House' },
    { key: 'grade',       label: 'Grade' },
    { key: 'weight',      label: 'Weight' },
    { key: 'record',      label: 'Record' },
    { key: 'class_time',  label: 'Class time' },
    { key: 'weight_trend',   label: 'Trend' },
    { key: 'weight_last5',   label: 'Last 5 weights' },
    { key: 'weight_current', label: 'Current weight' },
    { key: 'weight_comp',    label: 'Comp weight' },
    { key: 'weight_pctdiff', label: '% diff' },
    { key: 'weight_entries', label: 'Entries' },
    { key: 'att_total',   label: 'Total sessions' },
    { key: 'att_last',    label: 'Last attended' },
    { key: 'att_pct',     label: 'Attendance %' },
    { key: 'groups',      label: 'Groups' },
    { key: 'attendance',  label: 'Attend.' },
    { key: 'champ',       label: '🏆' },
    { key: 'media',       label: 'Media' },
    { key: 'points',      label: 'Pts' },
  ]

  function toggleRegCol(key) {
    setVisibleCols(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key])
  }

  useEffect(() => { loadPointTypes() }, [])
  // Default range: the last 4 weeks up to today (local dates, YYYY-MM-DD)
  const toLocalISO = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const [attStatsDateFrom, setAttStatsDateFrom] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 28); return toLocalISO(d) })
  const [attStatsDateTo, setAttStatsDateTo] = useState(() => toLocalISO(new Date()))
  useEffect(() => { loadAttendanceStats() }, [attStatsDateFrom, attStatsDateTo])
  useEffect(() => { loadStudents() }, [regType, date])
  useEffect(() => { oneOffStudentsRef.current = [] }, [date]) // one-off additions are "for this session only" -- shouldn't carry over to a genuinely different day
  // Clear the double-session undo banner when switching date/class --
  // those entries only make sense in the context they were created in.
  useEffect(() => { setCascadedEntries([]) }, [date, classFilter])

  async function loadPointTypes() {
    const { data } = await supabase.from('settings').select('value').eq('key', 'point_types').single()
    setPointTypes(data?.value || [])
  }

  // Attendance stats (total sessions, last attended, %) -- same
  // calculation as Trackers' attendance table: total sessions per
  // student within the chosen date range, their most recent
  // session_date, and attendance % as their sessions attended out of
  // the highest number any single student in the range has attended
  // (used as the "maximum possible" benchmark, exactly as Trackers
  // does it). Defaults to all-time (no range set) but is independent
  // of the currently-selected register date, since this is a broader
  // attendance history view, not tied to today specifically.
  const [attendanceStats, setAttendanceStats] = useState({})
  const [calendarStudent, setCalendarStudent] = useState(null) // student whose attendance calendar popup is open
  // Phone layout (cards) -- same data and functions as the table
  const [mPage, setMPage] = useState(0)                 // 0 = Age/Weight/Attend., 1 = Level/Record/Weight trend
  const [mFilter, setMFilter] = useState('all')         // 'all' | 'out' | 'in'
  const [mExpanded, setMExpanded] = useState(null)      // student id opened in place
  const [mSettingsOpen, setMSettingsOpen] = useState(false)
  const [mShowTable, setMShowTable] = useSyncedPreference('register_phone_table', false) // phone: show the full table instead of cards
  const mLongPress = useRef(null)
  const mLongPressFired = useRef(false)
  const mLastSel = useRef(null)   // last card added to the selection (hold another to select the range between)
  const cardSwipe = useRef(null)
  // Register rows: mini photo or initials in the avatar (remembered on this device)
  const showRowPhotos = true // photos always on for now (the photos/initials toggle was removed)
  const [mCardTab, setMCardTab] = useState({})
  const [contactMore, setContactMore] = useState({}) // contact card: parent/guardian + emergency open, per student // mobile expanded card: 'contact' | 'profile' per student
  const photoInputRef = useRef(null)
  const photoTargetRef = useRef(null)
  const photoHeldRef = useRef(false)
  const [uploadingPhotoFor, setUploadingPhotoFor] = useState(null)
  async function uploadRegisterPhoto(st, file) {
    if (!st || !file) return
    setUploadingPhotoFor(st.id)
    try {
      const path = `student-photos/${st.id}-${Date.now()}-${file.name}`
      const { error } = await supabase.storage.from('athlete-media').upload(path, file)
      if (error) throw error
      const { data: urlData } = supabase.storage.from('athlete-media').getPublicUrl(path)
      const { error: upErr } = await supabase.from('students').update({ photo_url: urlData.publicUrl }).eq('id', st.id)
      if (upErr) throw upErr
      setStudents(prev => prev.map(x => x.id === st.id ? { ...x, photo_url: urlData.publicUrl } : x))
      setContactModal(cm => cm && cm.id === st.id ? { ...cm, photo_url: urlData.publicUrl } : cm)
    } catch (e) { alert('Could not save the photo: ' + (e.message || e)) }
    finally { setUploadingPhotoFor(null) }
  }
  // Contact card (register popup + mobile drop-down). Photo: tap = enlarge, hold = take / choose a new picture.
  function renderContactCard(st, { onClose, showProfileButton = true } = {}) {
    const m = st.members
    const grade = st.pka_belt || st.krba_level
    const photoHandlers = {
      onPointerDown: () => { photoHeldRef.current = false; clearTimeout(photoHoldTimer.current); photoHoldTimer.current = setTimeout(() => { photoHeldRef.current = true; if (navigator.vibrate) navigator.vibrate(25); photoTargetRef.current = st; photoInputRef.current?.click() }, 550) },
      onPointerUp: () => clearTimeout(photoHoldTimer.current),
      onPointerLeave: () => clearTimeout(photoHoldTimer.current),
      onPointerCancel: () => clearTimeout(photoHoldTimer.current),
      onClick: e => { e.stopPropagation(); if (photoHeldRef.current) { photoHeldRef.current = false; return } if (st.photo_url) setEnlargedPhoto(st.photo_url) },
      onContextMenu: e => e.preventDefault(),
      title: st.photo_url ? 'Tap to enlarge · hold for a new photo' : 'Hold to add a photo',
    }
    return (
      <div className="reg-contact-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {st.photo_url ? (
              <img src={st.photo_url} alt="" {...photoHandlers} style={{ width: 52, height: 52, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, cursor: 'pointer', opacity: uploadingPhotoFor === st.id ? 0.5 : 1, userSelect: 'none', WebkitTouchCallout: 'none' }} />
            ) : (
              <div {...photoHandlers} style={{ width: 52, height: 52, borderRadius: '50%', background: 'var(--bg-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 600, color: 'var(--text-secondary)', flexShrink: 0, cursor: 'pointer', userSelect: 'none', WebkitTouchCallout: 'none' }}>
                {uploadingPhotoFor === st.id ? '…' : `${m?.first_name?.[0] || ''}${m?.last_name?.[0] || ''}`}
              </div>
            )}
            <h2 style={{ fontSize: 15, fontWeight: 600 }}>{m?.first_name} {m?.last_name}</h2>
          </div>
          {onClose && <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer' }}>✕</button>}
        </div>
        {[
          ['Student ID', st.student_ref],
          ['Phone', m?.phone || '—'],
          ['Email', m?.email || '—'],
          ['DOB', m?.date_of_birth ? fmtDob(m.date_of_birth) : '—'],
          ['House', st.house_name || m?.houses?.name || '—'],
          ['Grade', grade ? <span style={{ color: gradeColour(grade), fontWeight: 700 }}>{grade}</span> : '—'],
          ['Class', `${st.class_schedule || '—'} ${st.class_time || ''}`],
          ['Groups', [st.is_kr && 'KR', st.is_pts && 'PTs', st.is_leader && 'Leader'].filter(Boolean).join(', ') || 'None'],
        ].map(([label, val]) => (
          <div key={label} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
            <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
            <span style={{ fontWeight: 500, textAlign: 'right', wordBreak: 'break-word' }}>{val}</span>
          </div>
        ))}
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          {m?.phone && <a href={`tel:${m.phone}`} className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }}>📞 Call</a>}
          {showProfileButton && <button className="btn" style={{ flex: 1, justifyContent: 'center' }} onClick={() => { onClose?.(); navigate(studentProfileLink(st)) }}>View profile →</button>}
        </div>
        {/* Parent / guardian + emergency contact: hidden until pressed, so Call is on screen straight away */}
        <button type="button" onClick={() => setContactMore(o => ({ ...o, [st.id]: !o[st.id] }))} aria-expanded={!!contactMore[st.id]}
          style={{ width: '100%', marginTop: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', background: 'var(--bg-secondary)', color: 'var(--text)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-sans)' }}>
          <span>Parent / guardian & emergency contact</span>
          <span style={{ transition: 'transform 0.2s', transform: contactMore[st.id] ? 'rotate(180deg)' : 'none' }}>▾</span>
        </button>
        <div style={{ overflow: 'hidden', transition: 'max-height 0.3s ease', maxHeight: contactMore[st.id] ? 600 : 0 }}>
          {(st.guardian_name || st.guardian_phone || calcAge(m?.date_of_birth) < 16) && (
            <>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', margin: '12px 0 2px', textTransform: 'uppercase', letterSpacing: 1 }}>Parent / guardian</div>
              {[['Name', st.guardian_name || '—'], ['Relationship', st.guardian_relationship || '—'], ['Phone', st.guardian_phone ? <a href={`tel:${st.guardian_phone}`}>{st.guardian_phone}</a> : '—'], ['Email', st.guardian_email || '—']].map(([label, val]) => (
                <div key={'g' + label} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                  <span style={{ color: 'var(--text-secondary)' }}>{label}</span><span style={{ fontWeight: 500, textAlign: 'right' }}>{val}</span>
                </div>
              ))}
            </>
          )}
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', margin: '12px 0 2px', textTransform: 'uppercase', letterSpacing: 1 }}>Emergency contact</div>
          {[['Name', st.ec_name || '—'], ['Relationship', st.ec_relationship || '—'], ['Phone', st.ec_phone ? <a href={`tel:${st.ec_phone}`}>{st.ec_phone}</a> : '—']].map(([label, val]) => (
            <div key={'e' + label} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
              <span style={{ color: 'var(--text-secondary)' }}>{label}</span><span style={{ fontWeight: 500, textAlign: 'right' }}>{val}</span>
            </div>
          ))}
        </div>
      </div>
    )
  }
  const mSwipeX = useRef(null)
  const [pointSearch, setPointSearch] = useState('')    // award-points modal: search / write a reason
  const [fightersMenuOpen, setFightersMenuOpen] = useState(false)
  const [fightersCopied, setFightersCopied] = useState('')
  const [saveNewReason, setSaveNewReason] = useState(true)
  const [pmOn, setPmOn] = useState(false)               // Points mode: tap a card to award pmReason
  const [pmReason, setPmReason] = useState(null)
  const [pmPickerOpen, setPmPickerOpen] = useState(false)
  const [pmSearch, setPmSearch] = useState('')
  const [pmNewPts, setPmNewPts] = useState(1)          // points for a new reason typed in the Points-mode search
  const [lastAward, setLastAward] = useState(null)      // { label, points, entries, names } -- Undo bar
  const undoTimer = useRef(null)
  const [reasonUsage, setReasonUsage] = useSyncedPreference('register_reason_usage', {}) // learns each coach's most-used reasons
  // Total sessions / Last attended / Attendance % for the chosen range.
  // Attendance % is each student's OWN rate -- days attended out of days
  // attended + missed -- using the same rules as the attendance calendar
  // popup (src/lib/attendanceDays.js), so the bar and the calendar agree.
  async function loadAttendanceStats() {
    const fetchAll = async build => {
      const pageSize = 1000
      let all = [], from = 0
      while (true) {
        const { data, error } = await build().range(from, from + pageSize - 1)
        if (error) { console.error('Attendance stats fetch error:', error); break }
        all = all.concat(data || [])
        if (!data || data.length < pageSize) break
        from += pageSize
      }
      return all
    }
    const [att, assignments, { data: holidays }] = await Promise.all([
      fetchAll(() => {
        let q = supabase.from('attendance').select('id, student_id, session_date, attendance_type').order('id')
        if (attStatsDateFrom) q = q.gte('session_date', attStatsDateFrom)
        if (attStatsDateTo) q = q.lte('session_date', attStatsDateTo)
        return q
      }),
      fetchAll(() => supabase.from('student_class_assignments').select('*, classes(id, day_of_week)').order('id')),
      supabase.from('holidays').select('*'),
    ])
    const rowsByStudent = {}, assignByStudent = {}
    att.forEach(a => { (rowsByStudent[a.student_id] ||= []).push(a) })
    assignments.forEach(a => { (assignByStudent[a.student_id] ||= []).push(a) })
    const today = toLocalISODate(new Date())
    const byStudent = {}
    new Set([...Object.keys(rowsByStudent), ...Object.keys(assignByStudent)]).forEach(sid => {
      const rows = rowsByStudent[sid] || []
      const attendedRows = rows.filter(r => isAttendedType(r.attendance_type))
      // All-time: rate starts from the student's first record
      const from = attStatsDateFrom || rows.map(r => r.session_date).filter(Boolean).sort()[0] || null
      const rate = ownAttendanceRate({ rows, assignments: assignByStudent[sid] || [], holidays: holidays || [], studentId: (rows[0] || assignByStudent[sid]?.[0])?.student_id ?? sid, from, to: attStatsDateTo || null, today })
      byStudent[sid] = {
        total: attendedRows.length,
        last: attendedRows.reduce((m, r) => (!m || r.session_date > m ? r.session_date : m), null),
        first: rows.map(r => r.session_date).filter(Boolean).sort()[0] || null, // start date = first record
        pct: rate.pct, attendedDays: rate.attended, missedDays: rate.missed,
      }
    })
    setAttendanceStats(byStudent)
  }

  const [weightDataByStudent, setWeightDataByStudent] = useState({})

  async function loadStudents() {
    setLoading(true)
    const disc = REGISTER_TYPES.find(r => r.key === regType)?.discipline || 'PKA'
    let query = supabase
      .from('students')
      .select('*, members(id, first_name, last_name, phone, email, date_of_birth, status, joined_date, houses(name))')

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
    // Re-merges any one-off students added this session back in, since
    // they're not part of the official query above (they're not
    // assigned to this class) -- without this, a reload triggered by
    // changing date/regType, or even just a slow fetch resolving after
    // someone was added, would silently wipe them back out with no
    // indication anything had gone wrong.
    const stillMissing = oneOffStudentsRef.current.filter(s => !filteredStudents.find(x => x.id === s.id))
    setStudents([...filteredStudents, ...stillMissing])

    // Weight tracker columns (Trend/Last 5 weights/Current/Comp/% diff/
    // Entries) only apply to KR/KRBA registers -- same underlying data
    // as the weight graph on each athlete's own profile (Fit II Fight
    // sessions' weight_before/weight_after, and athlete_profiles'
    // free-text weight_division for comp weight), computed here per
    // student for the whole visible list at once.
    if (regType === 'kr' || regType === 'krba') {
      const allStudentIds = [...filteredStudents, ...stillMissing].map(s => s.id)
      if (allStudentIds.length > 0) {
        const [{ data: sessions }, { data: profiles }, { data: targetSettings }] = await Promise.all([
          supabase.from('fit2fight_sessions').select('student_id, session_date, weight_before, weight_after').in('student_id', allStudentIds).order('session_date'),
          supabase.from('athlete_profiles').select('student_id, weight_division, weight_target_override').in('student_id', allStudentIds),
          supabase.from('team_settings').select('key, value').in('key', ['weight_target_pct_in_comp', 'weight_target_pct_out_comp', 'weight_target_active_mode']),
        ])
        // Target weight -- same rule as the athlete app / athlete profile: comp weight
        // (or body weight) x (1 + the team's active in-comp/out-of-comp %), unless the
        // athlete has a coach override (an actual kg, or their own %).
        const ts = Object.fromEntries((targetSettings || []).map(r => [r.key, r.value]))
        // Same defaults as the athlete profile + athlete app when a setting hasn't been
        // saved yet: mode 'in_comp', 2.5% in comp, 5% out of comp. (Previously a missing
        // mode fell back to out-of-comp here, so the register showed a different target.)
        const activeMode = ts.weight_target_active_mode || 'in_comp'
        const pctIn = ts.weight_target_pct_in_comp != null && !isNaN(parseFloat(ts.weight_target_pct_in_comp)) ? parseFloat(ts.weight_target_pct_in_comp) : 0.025
        const pctOut = ts.weight_target_pct_out_comp != null && !isNaN(parseFloat(ts.weight_target_pct_out_comp)) ? parseFloat(ts.weight_target_pct_out_comp) : 0.05
        const targetPct = activeMode === 'in_comp' ? pctIn : pctOut
        const overrideByStudent = Object.fromEntries((profiles || []).map(p => [p.student_id, p.weight_target_override]))
        // Preserves the +/- sign for display (standard combat-sports
        // weight-class notation, e.g. "-69kg" means "under 69kg",
        // matching exactly how the athlete's own profile shows this
        // same field) -- but % diff below needs the plain numeric
        // value regardless of sign, since that's a genuine magnitude
        // comparison, not a weight-class label.
        const compWeightByStudent = Object.fromEntries((profiles || []).map(p => {
          const match = p.weight_division?.match(/([+-]?)\s*([\d.]+)/)
          if (!match) return [p.student_id, null]
          return [p.student_id, { sign: match[1] || '', value: parseFloat(match[2]) }]
        }))
        const entriesByStudent = {}
        for (const s of (sessions || [])) {
          const w = s.weight_after ?? s.weight_before
          if (w == null) continue
          entriesByStudent[s.student_id] = entriesByStudent[s.student_id] || []
          entriesByStudent[s.student_id].push({ date: s.session_date, weight: w })
        }
        const computed = {}
        for (const id of allStudentIds) {
          const entries = (entriesByStudent[id] || []).sort((a, b) => new Date(a.date) - new Date(b.date))
          const last5 = entries.slice(-5)
          const current = last5.length > 0 ? last5[last5.length - 1].weight : null
          const previous = last5.length > 1 ? last5[last5.length - 2].weight : null
          const trend = previous == null || current == null ? null : current > previous ? 'up' : current < previous ? 'down' : 'same'
          const compWeightInfo = compWeightByStudent[id] ?? null
          const compWeight = compWeightInfo?.value ?? null
          const compWeightLabel = compWeightInfo ? `${compWeightInfo.sign}${compWeightInfo.value}kg` : null
          const isPlusDivision = compWeightInfo?.sign === '+'
          const pctDiff = compWeight && current != null ? ((current - compWeight) / compWeight * 100) : null
          const baseWeight = compWeight ?? ([...filteredStudents, ...stillMissing].find(x => x.id === id)?.weight_kg ?? null)
          const ov = overrideByStudent[id]
          let targetWeight = baseWeight ? +(baseWeight * (1 + targetPct)).toFixed(1) : null
          if (ov?.type === 'actual' && ov.value) targetWeight = +parseFloat(ov.value).toFixed(1)
          else if (ov?.type === 'percent' && ov.value && baseWeight) targetWeight = +(baseWeight * (1 + parseFloat(ov.value))).toFixed(1)
          computed[id] = { entries, last5, current, trend, compWeight, compWeightLabel, isPlusDivision, pctDiff, targetWeight, entryCount: entries.length }
        }
        setWeightDataByStudent(computed)
      } else {
        setWeightDataByStudent({})
      }
    } else {
      setWeightDataByStudent({})
    }

    // Also fetch explicit class assignments (student_class_assignments)
    // for these students -- this is a second, independent source of
    // "who's in this class" alongside each student's own
    // class_schedule/class_time fields, since the two can diverge
    // (e.g. someone assigned via the Attendance/PDP system whose own
    // class_time field hasn't been updated to match a newly added class).
    if (filteredStudents.length) {
      const { data: assignments } = await supabase
        .from('student_class_assignments')
        .select('*')
        .in('student_id', filteredStudents.map(s => s.id))
      // only assignments running on the register's date count towards who's in this class
      setExplicitAssignments((assignments || []).filter(a => assignmentActiveOn(a, date || todayISO())))
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

  // One sort rule (column + direction); the register sorts by a chain of these
  function compareBy(key, dir, a, b) {
      let aVal, bVal
      const am = a.members, bm = b.members
      switch(key) {
        case 'first_name':   aVal = am?.first_name || ''; bVal = bm?.first_name || ''; break
        case 'last_name':    aVal = am?.last_name || '';  bVal = bm?.last_name || '';  break
        case 'age':          aVal = am?.date_of_birth || ''; bVal = bm?.date_of_birth || ''; break
        case 'house':        aVal = am?.houses?.name || ''; bVal = bm?.houses?.name || ''; break
        case 'grade':        aVal = a.pka_belt || ''; bVal = b.pka_belt || ''; break
        case 'house_points': aVal = a.house_points || 0; bVal = b.house_points || 0; return dir === 'asc' ? aVal - bVal : bVal - aVal
        case 'competition_team':  aVal = a.competition_team || ''; bVal = b.competition_team || ''; break
        case 'discipline_codes':  aVal = a.discipline_codes || ''; bVal = b.discipline_codes || ''; break
        case 'weight_kg':    aVal = a.weight_kg || 0; bVal = b.weight_kg || 0; return dir === 'asc' ? aVal - bVal : bVal - aVal
        case 'age_category_kr':   aVal = a.age_category_kr || a.age_category || ''; bVal = b.age_category_kr || b.age_category || ''; break
        case 'in_comp':      aVal = a.in_comp ? 1 : 0; bVal = b.in_comp ? 1 : 0; return dir === 'asc' ? aVal - bVal : bVal - aVal
        // "Record" sorts by wins -- the clearest single number to rank by
        // out of wins/losses/draws
        case 'wins':         aVal = a.wins || 0; bVal = b.wins || 0; return dir === 'asc' ? aVal - bVal : bVal - aVal
        case 'groups': {
          const g = x => [x.is_kr && 'KR', x.is_pts && 'PTs', x.is_leader && 'Leader', x.is_coach && 'Coach'].filter(Boolean).join(',')
          aVal = g(a); bVal = g(b); break
        }
        case 'attendance': {
          const rank = id => { const v = attendance[id]; return v === 'full_kit' ? 2 : v === 'attended' ? 1 : 0 }
          aVal = rank(a.id); bVal = rank(b.id); return dir === 'asc' ? aVal - bVal : bVal - aVal
        }
        case 'media_restriction': aVal = a.media_restriction || ''; bVal = b.media_restriction || ''; break
        case 'att_last': aVal = attendanceStats[a.id]?.last || ''; bVal = attendanceStats[b.id]?.last || ''; break
        case 'att_total': aVal = attendanceStats[a.id]?.total ?? 0; bVal = attendanceStats[b.id]?.total ?? 0; return dir === 'asc' ? aVal - bVal : bVal - aVal
        case 'house_points': aVal = a.house_points || 0; bVal = b.house_points || 0; return dir === 'asc' ? aVal - bVal : bVal - aVal
        case 'start_date': aVal = am?.joined_date || attendanceStats[a.id]?.first || ''; bVal = bm?.joined_date || attendanceStats[b.id]?.first || ''; break
        case 'att_pct': aVal = attendanceStats[a.id]?.pct ?? -1; bVal = attendanceStats[b.id]?.pct ?? -1; return dir === 'asc' ? aVal - bVal : bVal - aVal
        case 'weight_current': aVal = weightDataByStudent[a.id]?.current ?? a.weight_kg ?? 0; bVal = weightDataByStudent[b.id]?.current ?? b.weight_kg ?? 0; return dir === 'asc' ? aVal - bVal : bVal - aVal
        default:             aVal = ''; bVal = ''
      }
      return dir === 'asc' ? String(aVal).localeCompare(String(bVal)) : String(bVal).localeCompare(String(aVal))
  }

  function toggleSort(key) {
    if (sortKey === key) { setSortDir(d => d === 'asc' ? 'desc' : 'asc'); return }
    // the previous column becomes the tie-breaker (keeps the last 2), so you can sort by several at once
    setSortThen(prev => [{ key: sortKey, dir: sortDir }, ...prev.filter(r => r.key !== key && r.key !== sortKey)].slice(0, 2))
    setSortKey(key); setSortDir('asc')
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
    .filter(s => matchesSearch(search, s.members?.first_name, s.members?.last_name, s.student_ref))
    .sort((a, b) => {
      // Multi-sort: selected-to-top (optional) -> the column you tapped last -> the ones before it
      if (selectedFirst) { const d = (selectedStudents.includes(b.id) ? 1 : 0) - (selectedStudents.includes(a.id) ? 1 : 0); if (d) return d }
      for (const r of [{ key: sortKey, dir: sortDir }, ...sortThen]) { const c = compareBy(r.key, r.dir, a, b); if (c) return c }
      return 0
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

  // Awards for the same student run one after another (quick double taps used to
  // overlap: both read 'nothing to reverse' and both awards stuck).
  const awardQueueRef = useRef({})
  function awardAttendancePoints(student, type, classId) {
    const q = awardQueueRef.current
    const run = (q[student.id] || Promise.resolve()).then(() => awardAttendancePointsNow(student, type, classId))
    q[student.id] = run.catch(() => {})
    return run
  }
  async function awardAttendancePointsNow(student, type, classId) {    // Reverse any attendance points already awarded to this student for
    // THIS SPECIFIC CLASS today, so cycling attended -> full_kit reflects
    // only the final state's points rather than stacking both awards.
    // Scoped by class_id (not just date) so a student attending two
    // different classes on the same day -- e.g. via the double-session
    // auto-cascade -- gets points for both, instead of the second
    // class's award wiping out the first's.
    //
    // Only entries that genuinely applied to the running total
    // (applied_to_total = true) are counted as "reversed" here -- a
    // past adjust_student_points call can fail (network hiccup etc.)
    // even though its points_log row still got written, and blindly
    // trusting every log row as if its points had definitely landed
    // caused a real case of a student ending up short: an award that
    // never actually applied got subtracted anyway when a later award
    // replaced it. Un-applied entries are still deleted below along
    // with everything else, just never counted against the new total.
    let reverseQuery = supabase.from('points_log')
      .select('id, points_awarded, point_type, applied_to_total')
      .eq('student_id', student.id)
      .in('point_type', ['Attendance', 'Full Kit'])
      .gte('awarded_at', date + 'T00:00:00')
      .lt('awarded_at', date + 'T23:59:59')
    // Attended and Full Kit are one OR the other: the earlier award may have been logged against
    // this class OR with no class (e.g. marked from 'All classes' / bulk) -- reverse both, so the
    // student never ends up with Attendance AND Full Kit for the same session.
    reverseQuery = classId ? reverseQuery.or(`class_id.eq.${classId},class_id.is.null`) : reverseQuery
    const { data: previousEntries } = await reverseQuery
    let reversedPts = 0
    if (previousEntries?.length) {
      reversedPts = previousEntries.filter(e => e.applied_to_total).reduce((sum, e) => sum + (e.points_awarded || 0), 0)
      await supabase.from('points_log').delete().in('id', previousEntries.map(e => e.id))
    }

    const pointLabel = type === 'full_kit' ? 'Full Kit' : 'Attendance'
    const pt = pointTypes.find(p => p.label === pointLabel)
    const pts = pt ? pt.points : (type === 'full_kit' ? 2 : 1)
    const netChange = pts - reversedPts

    const { data: newLogEntry, error: logInsertErr } = await supabase.from('points_log').insert({
      student_id: student.id, point_type: pointLabel,
      points_awarded: pts, point_scope: 'both',
      awarded_at: new Date(date).toISOString(),
      class_id: classId || null,
    }).select().single()

    const { error: adjustErr } = await supabase.rpc('adjust_student_points', { p_student_id: student.id, p_house_delta: netChange, p_individual_delta: netChange })
    if (adjustErr) {
      alert(`Attendance points logged for ${student.members?.first_name}, but updating their points total failed: ${adjustErr.message}`)
      // Marks this specific row so a future award change (e.g.
      // switching Attended <-> Full Kit later) knows not to count
      // these points as something that needs reversing -- they never
      // actually landed in the total to begin with.
      if (!logInsertErr && newLogEntry) {
        await supabase.from('points_log').update({ applied_to_total: false }).eq('id', newLogEntry.id)
      }
    }

    const houseName = student.house_name || student.members?.houses?.name
    if (houseName && netChange !== 0 && !adjustErr) {
      const { error: houseErr } = await supabase.rpc('adjust_house_points', { p_house_name: houseName, p_delta: netChange })
      if (houseErr) alert(`Attendance points saved for ${student.members?.first_name}, but the house total failed to update: ${houseErr.message}`)
    }

    if (!adjustErr) {
      setStudents(prev => prev.map(s => s.id === student.id ? { ...s, house_points: (s.house_points || 0) + netChange, individual_points: (s.individual_points || 0) + netChange } : s))
    }
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

    const { data: pairRows } = await supabase.from('student_class_assignments')
      .select('*').eq('student_id', student.id).eq('class_id', pair.second)
    const assignment = (pairRows || []).find(a => assignmentActiveOn(a, date))
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
        await supabase.rpc('adjust_student_points', { p_student_id: entry.studentId, p_house_delta: -entry.pointsAwarded, p_individual_delta: -entry.pointsAwarded })
        setStudents(prev => prev.map(x => x.id === entry.studentId
          ? { ...x, house_points: Math.max(0, (x.house_points || 0) - entry.pointsAwarded), individual_points: Math.max(0, (x.individual_points || 0) - entry.pointsAwarded) }
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
    const { data: existingRows } = await supabase.from('student_class_assignments')
      .select('*').eq('student_id', studentId).eq('class_id', classFilter)
    if ((existingRows || []).some(a => !a.end_date || String(a.end_date).slice(0, 10) >= todayISO())) return
    let { error } = await supabase.from('student_class_assignments').insert({ student_id: studentId, class_id: classFilter, start_date: todayISO() })
    if (error && /start_date/.test(error.message || '')) await supabase.from('student_class_assignments').insert({ student_id: studentId, class_id: classFilter })
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
    const failures = []
    const scopedToClass = classFilter && classFilter !== 'all'

    for (const s of targets) {
      // Clear any existing row for this student on THIS class (not just
      // this date) first -- prevents duplicate rows piling up if they
      // were already marked something else for this specific session,
      // without touching a separate class's attendance mark logged
      // earlier the same day.
      let delQuery = supabase.from('attendance').delete().eq('student_id', s.id).eq('session_date', date)
      if (scopedToClass) delQuery = delQuery.eq('class_id', classFilter)
      await delQuery

      // Log to attendance table -- only marks this student as changed
      // locally (newAtt) if this actually succeeds. Multi-select
      // marking every selected student as Attended/Full Kit
      // optimistically regardless of whether each individual insert
      // actually landed was found to be the same bug already caught
      // and fixed elsewhere (points-awarding silently failing while
      // the UI still showed success) -- same fix applied here.
      const detectedClassId = scopedToClass ? classFilter : detectClassIdForStudent(s.id)
      const { error: insertErr } = await supabase.from('attendance').insert({
        student_id: s.id,
        present: true,
        late: false,
        attendance_type: type,
        session_date: date,
        attended_at: new Date(date + 'T12:00:00').toISOString(),
        class_id: detectedClassId,
      })
      if (insertErr) {
        failures.push(`${s.members?.first_name} ${s.members?.last_name}`)
        continue
      }
      newAtt[s.id] = type

      await awardAttendancePoints(s, type, detectedClassId)
      await ensureClassAssignment(s.id)
      if (scopedToClass) {
        const cascaded = await cascadeDoubleSession(s, type)
        if (cascaded) setCascadedEntries(prev => [...prev, cascaded])
      }
    }

    setAttendance(prev => ({ ...prev, ...newAtt }))
    if (failures.length > 0) {
      alert(`Marked everyone else, but this failed for: ${failures.join(', ')} -- try marking them again individually.`)
    }
    // Keep selection at current position - don't clear
    setSaving(false)
  }

  async function updatePointEntry(entry, newPoints, newNote) {
    const diff = newPoints - entry.points_awarded
    const { error } = await supabase.from('points_log').update({ points_awarded: newPoints, note: newNote }).eq('id', entry.id)
    if (error) { alert('Error saving: ' + error.message); return }

    const s = students.find(x => x.id === entry.student_id)
    if (s && diff !== 0) {
      const houseDelta = (entry.point_scope === 'house' || entry.point_scope === 'both') ? diff : 0
      const individualDelta = (entry.point_scope === 'individual' || entry.point_scope === 'both') ? diff : 0
      const { error: updErr } = await supabase.rpc('adjust_student_points', { p_student_id: s.id, p_house_delta: houseDelta, p_individual_delta: individualDelta })
      if (updErr) { alert('Points entry saved, but updating the total failed: ' + updErr.message) }
      else setStudents(prev => prev.map(x => x.id === s.id
        ? { ...x, house_points: Math.max(0, (x.house_points || 0) + houseDelta), individual_points: Math.max(0, (x.individual_points || 0) + individualDelta) }
        : x))

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
      const houseDelta = (entry.point_scope === 'house' || entry.point_scope === 'both') ? -entry.points_awarded : 0
      const individualDelta = (entry.point_scope === 'individual' || entry.point_scope === 'both') ? -entry.points_awarded : 0
      const { error: updErr } = await supabase.rpc('adjust_student_points', { p_student_id: s.id, p_house_delta: houseDelta, p_individual_delta: individualDelta })
      if (updErr) { alert('Entry deleted, but updating the total failed: ' + updErr.message) }
      else setStudents(prev => prev.map(x => x.id === s.id
        ? { ...x, house_points: Math.max(0, (x.house_points || 0) + houseDelta), individual_points: Math.max(0, (x.individual_points || 0) + individualDelta) }
        : x))

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
    const savedEntries = []   // returned so quick awards can be undone
    const total = points.reduce((s, p) => s + p.points, 0)
    const isChamp = points.some(p => p.label === 'Class Champ')
    for (const sid of studentIds) {
      const s = students.find(x => x.id === sid)
      if (!s) continue

      // Awarding points via this side button implies the student was
      // actually there -- if they're not already marked on the
      // register at all, mark them attended too (same insert +
      // standard attendance-point award as ticking "Attended"
      // directly), rather than leaving them logged with points but
      // silently absent from the register.
      if (!attendance[sid] || attendance[sid] === 'none') {
        const scopedToClass = classFilter && classFilter !== 'all'
        const detectedClassId = scopedToClass ? classFilter : detectClassIdForStudent(sid)
        const { error: attendErr } = await supabase.from('attendance').insert({
          student_id: sid,
          present: true,
          attendance_type: 'attended',
          session_date: date,
          attended_at: new Date(date + 'T12:00:00').toISOString(),
          class_id: detectedClassId,
        })
        if (attendErr) {
          alert(`Couldn't mark ${s.members?.first_name} as attended: ${attendErr.message} -- continuing to award the selected points anyway.`)
        } else {
          setAttendance(prev => ({ ...prev, [sid]: 'attended' }))
          await ensureClassAssignment(sid)
          await awardAttendancePoints(s, 'attended', detectedClassId)
          if (scopedToClass) {
            const cascaded = await cascadeDoubleSession(s, 'attended')
            if (cascaded) setCascadedEntries(prev => [...prev, cascaded])
          }
        }
      }

      for (const pt of points) {
        const { data: logRow, error: logError } = await supabase.from('points_log').insert({
          student_id: sid, point_type: pt.label,
          points_awarded: pt.points, point_scope: 'both',
          awarded_at: new Date(date).toISOString(),
        }).select('id, student_id, point_type, points_awarded, point_scope, note, awarded_at').single()
        if (logRow) {
          savedEntries.push(logRow)
          setPointsByStudent(prev => ({ ...prev, [sid]: [...(prev[sid] || []), logRow] }))
        }
        if (logError) {
          alert(`Error saving "${pt.label}" for ${s.members?.first_name}: ${logError.message}`)
          setSaving(false)
          return
        }
      }
      const { error: adjustErr } = await supabase.rpc('adjust_student_points', { p_student_id: sid, p_house_delta: total, p_individual_delta: total })
      if (adjustErr) {
        alert(`"${points.map(p => p.label).join(', ')}" was logged for ${s.members?.first_name}, but updating their points total failed: ${adjustErr.message} -- their running total will be wrong until this is fixed.`)
        setSaving(false)
        return
      }
      if (isChamp) {
        const { error: champErr } = await supabase.from('students').update({ class_champion_count: (s.class_champion_count || 0) + 1 }).eq('id', sid)
        if (champErr) alert(`Points saved for ${s.members?.first_name}, but updating class champion count failed: ${champErr.message}`)
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
    setAwardingFor(null); setMultiAward(false); setSelectedStudents([]); setSelectedPoints([]); setPointSearch('')
    setSaving(false)
    return savedEntries
  }

  // ── Quick awards (phone register): Points mode, reason chips, group undo ──
  async function quickAward(studentIds, pt) {
    if (!studentIds.length || !pt) return
    if (navigator.vibrate) navigator.vibrate(15)
    studentIds.forEach(id => floatPoints(id, pt.points))
    const entries = await submitPoints(studentIds, [{ label: pt.label, points: pt.points }])
    setReasonUsage(u => ({ ...(u || {}), [pt.label]: ((u || {})[pt.label] || 0) + studentIds.length }))
    if (entries?.length) {
      const names = studentIds.map(id => students.find(x => x.id === id)?.members?.first_name).filter(Boolean)
      clearTimeout(undoTimer.current)
      setLastAward({ label: pt.label, points: pt.points, entries, names })
      undoTimer.current = setTimeout(() => setLastAward(null), 6000)
    }
  }
  function floatPoints(studentId, pts) {
    const card = document.getElementById(`regm-${studentId}`)
    if (!card) return
    const el = document.createElement('span')
    el.className = 'reg-m-float' + (pts < 0 ? ' neg' : '')
    el.textContent = `${pts > 0 ? '+' : ''}${pts}`
    card.appendChild(el)
    setTimeout(() => el.remove(), 900)
  }
  async function undoLastAward() {
    const a = lastAward
    if (!a) return
    clearTimeout(undoTimer.current); setLastAward(null)
    const { error } = await supabase.from('points_log').delete().in('id', a.entries.map(e => e.id))
    if (error) { alert('Could not undo: ' + error.message); return }
    const byStudent = {}
    a.entries.forEach(e => { byStudent[e.student_id] = (byStudent[e.student_id] || 0) + e.points_awarded })
    for (const [sid, total] of Object.entries(byStudent)) {
      await supabase.rpc('adjust_student_points', { p_student_id: sid, p_house_delta: -total, p_individual_delta: -total })
      const st = students.find(x => x.id === sid)
      const houseName = st?.house_name || st?.members?.houses?.name
      if (houseName && total > 0) await supabase.rpc('adjust_house_points', { p_house_name: houseName, p_delta: -total })
    }
    const ids = new Set(a.entries.map(e => e.id))
    setPointsByStudent(prev => Object.fromEntries(Object.entries(prev).map(([k, list]) => [k, (list || []).filter(e => !ids.has(e.id))])))
    setStudents(prev => prev.map(x => byStudent[x.id] ? { ...x, house_points: Math.max(0, (x.house_points || 0) - byStudent[x.id]), individual_points: Math.max(0, (x.individual_points || 0) - byStudent[x.id]) } : x))
    if (navigator.vibrate) navigator.vibrate(10)
  }

  function togglePoint(pt) {
    setSelectedPoints(prev =>
      prev.find(p => p.label === pt.label) ? prev.filter(p => p.label !== pt.label) : [...prev, pt]
    )
  }


  // Athlete register: copy a fighters list to paste to other coaches for matching.
  // One line per ACTIVE athlete on this register: Name – Age – Year of birth – Record / Level
  async function copyFightersList(order) {
    // Re-read in-comp + member status from the database at the moment of copying, so a
    // fighter marked out of comp elsewhere (profile / student database / another device)
    // since this register loaded is never included from stale page data.
    let fresh = null
    try {
      const ids = displayStudents.map(st => st.id)
      if (ids.length) {
        const { data, error } = await supabase.from('students').select('id, in_comp, members(status)').in('id', ids)
        if (!error && data) fresh = Object.fromEntries(data.map(r => [r.id, r]))
      }
    } catch { /* fall back to page data */ }
    const isInComp = st => (fresh ? fresh[st.id]?.in_comp === true : st.in_comp === true)
    const isActive = st => ((fresh ? fresh[st.id]?.members?.status : st.members?.status) || 'active') === 'active'
    if (fresh) setStudents(prev => prev.map(x => fresh[x.id] ? { ...x, in_comp: fresh[x.id].in_comp } : x))
    const rows = displayStudents
      .filter(st => isActive(st) && isInComp(st))   // active, in-comp athletes only (checked live)
      .map(st => {
        const m = st.members
        const dob = m?.date_of_birth
        const age = calcAge(dob)
        const yob = dob ? String(dob).slice(0, 4) : '—'
        const hasRecord = (st.wins || st.losses || st.draws)
        const record = hasRecord ? `${st.wins || 0}W ${st.losses || 0}L ${st.draws || 0}D` : '0 fights'
        const level = st.pka_belt || st.krba_level || ''
        return { name: `${m?.first_name || ''} ${m?.last_name || ''}`.trim(), age: age ?? null, dob: dob || '',
                 // KRBA: record only · KR: experience level only
                 line: `${`${m?.first_name || ''} ${m?.last_name || ''}`.trim()} – ${age ?? '—'} – ${yob} – ${regType === 'krba' ? record : (level || '—')}` }
      })
    rows.sort(order === 'age'
      ? (a, b) => (a.dob && b.dob ? b.dob.localeCompare(a.dob) : a.dob ? -1 : 1) // youngest first
      : (a, b) => a.name.localeCompare(b.name))
    const heading = `${REGISTER_TYPES.find(r => r.key === regType)?.label || 'Fighters'} fighters (${rows.length}) — ${order === 'age' ? 'by age' : 'by name'}\nName – Age – Born – ${regType === 'krba' ? 'Record' : 'Level'}`
    const text = `${heading}\n${rows.map(r => r.line).join('\n')}`
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0'
      document.body.appendChild(ta); ta.select(); try { document.execCommand('copy') } catch { /* ignore */ } ta.remove()
    }
    if (navigator.vibrate) navigator.vibrate(15)
    setFightersMenuOpen(false)
    setFightersCopied(`Copied ${rows.length} in-comp fighters (${order === 'age' ? 'age order' : 'name order'}) — paste it into a message`)
    setTimeout(() => setFightersCopied(''), 3500)
  }
  // Access limits: move to an allowed register type / class if the current one isn't
  useEffect(() => {
    if (allowedRegTypes && !allowedRegTypes.includes(regType)) setRegType(allowedRegTypes[0])
  }, [allowedRegTypes?.join(','), regType])
  useEffect(() => {
    if (!allowedClassIds || regType !== 'class') return
    const pool = [...todayClasses, ...derbyMooreClasses, ...moorwaysClasses].filter(classAllowed)
    if (classFilter === 'all' || !allowedClassIds.includes(classFilter)) {
      if (pool[0]) setClassFilter(pool[0].id)
    }
  }, [allowedClassIds?.join(','), todayClasses, derbyMooreClasses, moorwaysClasses, classFilter, regType])

  const pointsTotal = selectedPoints.reduce((s, p) => s + p.points, 0)
  const isKR = regType === 'kr'

  return (
    <div className={`reg-root${mShowTable ? ' reg-force-table' : ''}`} style={{ zoom: `${registerZoom}%` }} onClick={e => {
      if (!e.target.closest('tr') && !e.target.closest('button') && !e.target.closest('input') && !e.target.closest('select') && !e.target.closest('.reg-m-card') && !e.target.closest('.reg-m-bulk') && !e.target.closest('.reg-award-modal'))
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
        <div className="reg-desktop-only" style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-sm" onClick={() => setShowColPicker(v => !v)}>⚙️ Columns</button>
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            style={{ padding: '7px 10px', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius)', fontSize: 13, background: 'var(--bg-secondary)', color: 'var(--text)' }} />
        </div>
      </div>

      {/* Column picker */}
      {showColPicker && (
        <div className="card" style={{ marginBottom: 10, padding: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Show / hide columns</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6 }}>
            {ALL_REG_COLS.filter(c => (regType === 'kr' || regType === 'krba') || !['record', 'weight_trend', 'weight_last5', 'weight_current', 'weight_comp', 'weight_pctdiff', 'weight_entries'].includes(c.key)).map(c => (
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

      {/* Register tabs -- restricted to just KR/KRBA when embedded within
          the Athlete Profile page (signalled by initialRegType being
          set), since that's the only context Team KR/KRBA buttons there
          are meant to offer, not the full set of registers. */}
      <div className={initialRegType ? 'reg-desktop-only' : ''} style={{ display: 'flex', gap: 2, borderBottom: '1px solid var(--border)', marginBottom: 12 }}>
        {(initialRegType ? REGISTER_TYPES.filter(r => r.key === 'kr' || r.key === 'krba') : REGISTER_TYPES).filter(r => regTypeAllowed(r.key)).map(r => (
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

      {/* Class time pills — KR Centre classes, with Derby Moore nested under, Moorways nested under Derby Moore.
          Hidden entirely when embedded in the Athlete Profile (initialRegType set) -- always shows the full
          KR/KRBA register there for now, rather than narrowing down to one specific class time. */}
      {!initialRegType && (todayClasses.length > 0 || derbyMooreClasses.length > 0 || moorwaysClasses.length > 0) && (
        <div className="reg-class-pills" style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {todayClasses.filter(classAllowed).map(c => (
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
            {!allowedClassIds && <div onClick={() => setClassFilter('all')} style={{
              background: classFilter === 'all' ? 'var(--text)' : 'var(--bg-secondary)',
              color: classFilter === 'all' ? 'var(--bg)' : 'var(--text)',
              border: '1px solid var(--border)', borderRadius: 'var(--radius)',
              padding: '6px 12px', fontSize: 12, cursor: 'pointer',
            }}>All classes</div>}
          </div>

          {/* Derby Moore — nested under KR Centre */}
          {derbyMooreClasses.length > 0 && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8, marginLeft: 20, paddingLeft: 10, borderLeft: '2px solid var(--border)' }}>
              <span style={{ fontSize: 10, color: 'var(--text-tertiary)', alignSelf: 'center', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Derby Moore</span>
              {derbyMooreClasses.filter(classAllowed).map(c => (
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
                  {moorwaysClasses.filter(classAllowed).map(c => (
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
              {moorwaysClasses.filter(classAllowed).map(c => (
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
      <div className="reg-desktop-only" onClick={() => setShowOnlyAttended(v => !v)} title="Click to shortlist to attended students only"
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
      <div ref={registerToolbarRef} className="reg-desktop-only" style={{
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
      <div className="reg-desktop-only" style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search students…"
          style={{ flex: 1, minWidth: 160, padding: '7px 10px', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius)', fontSize: 13, background: 'var(--bg-secondary)', color: 'var(--text)' }} />
      </div>

      {/* Date range for the Total sessions / Last attended / Attendance %
          columns -- only shown when at least one of those is actually
          visible, since it has no effect otherwise. Defaults to
          all-time when left blank. */}
      {(visibleCols.includes('att_total') || visibleCols.includes('att_last') || visibleCols.includes('att_pct')) && (
        <div className="reg-desktop-only" style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Attendance stats:</span>
          <input type="date" value={attStatsDateFrom} onChange={e => setAttStatsDateFrom(e.target.value)}
            style={{ fontSize: 12, padding: '4px 6px', border: '1px solid var(--border-strong)', borderRadius: 6, background: 'var(--bg-secondary)', color: 'var(--text)' }} />
          <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>to</span>
          <input type="date" value={attStatsDateTo} onChange={e => setAttStatsDateTo(e.target.value)}
            style={{ fontSize: 12, padding: '4px 6px', border: '1px solid var(--border-strong)', borderRadius: 6, background: 'var(--bg-secondary)', color: 'var(--text)' }} />
          {(attStatsDateFrom || attStatsDateTo) && (
            <button className="btn btn-sm" style={{ fontSize: 11 }} onClick={() => { setAttStatsDateFrom(''); setAttStatsDateTo('') }}>Clear (all-time)</button>
          )}
        </div>
      )}

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


      {mShowTable && (
        <button type="button" className="reg-phone-cards-btn" onClick={() => setMShowTable(false)}>Back to card view</button>
      )}
      {/* ── Phone layout: cards (shown under 640px; the table above/below is desktop-only) ──
          Uses exactly the same state and functions as the table: toggleAttendance,
          markAttendance, selection, the award-points modal, the attendance calendar,
          sorting (sortKey/sortDir), search, the shortlist and the stats date range. */}
      {!loading && (() => {
        const inCount = displayStudents.filter(x => attendance[x.id] && attendance[x.id] !== 'none').length
        const kitCount = displayStudents.filter(x => attendance[x.id] === 'full_kit').length
        const total = displayStudents.length
        const list = displayStudents.filter(x => mFilter === 'all' ? true : mFilter === 'in' ? (attendance[x.id] && attendance[x.id] !== 'none') : !(attendance[x.id] && attendance[x.id] !== 'none'))
        const selecting = selectedStudents.length > 0
        const isMainReg = !initialRegType   // standalone Registers page (not the Athlete Profile's embedded register)
        const reasonsByUse = [...pointTypes].map((pt, i) => ({ pt, i })).sort((a, b) => ((reasonUsage || {})[b.pt.label] || 0) - ((reasonUsage || {})[a.pt.label] || 0) || a.i - b.i).map(x => x.pt)
        const ReasonChip = ({ pt, onPick, on }) => (
          <button type="button" className={`reg-m-reason${on ? ' on' : ''}${pt.points < 0 ? ' neg' : ''}`} onClick={() => onPick(pt)}>
            {pt.label} <b>{pt.points > 0 ? '+' : ''}{pt.points}</b>
          </button>
        )
        const toggleSel = id => {
          if (navigator.vibrate) navigator.vibrate(10)
          setSelectedStudents(prev => { if (prev.includes(id)) return prev.filter(x => x !== id); mLastSel.current = id; return [...prev, id] })
        }
        // Hold while selecting: add every card between the last picked one and this one (in the order shown)
        const selectRangeTo = id => {
          const from = list.findIndex(x => x.id === mLastSel.current), to = list.findIndex(x => x.id === id)
          if (from < 0 || to < 0) return toggleSel(id)
          const [lo, hi] = from < to ? [from, to] : [to, from]
          const ids = list.slice(lo, hi + 1).map(x => x.id)
          if (navigator.vibrate) navigator.vibrate([15, 30, 15])
          setSelectedStudents(prev => [...new Set([...prev, ...ids])])
          mLastSel.current = id
        }
        const stepDate = d => { const x = new Date(date + 'T12:00:00'); x.setDate(x.getDate() + d); setDate(toLocalISO(x)) }
        const dateLabel = new Date(date + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
        const pctColour = p => p == null ? 'var(--text-tertiary)' : p >= 50 ? '#1D9E75' : p > 0 ? '#EF9F27' : '#E24B4A'
        const SortBtn = ({ k, label, grow }) => {
          const active = sortKey === k
          return (
            <button type="button" onClick={() => toggleSort(k)} aria-label={`Sort by ${label.toLowerCase()}`} aria-pressed={active}
              className="reg-m-sort" style={{ flex: grow ? '1 1 auto' : '0 0 auto', color: active ? 'var(--text)' : 'var(--text-tertiary)' }}>
              {label}{(() => { const i = sortThen.findIndex(r => r.key === k); return i >= 0 ? <sup className="reg-m-sortrank">{i + 2}</sup> : null })()}
              <svg width="7" height="12" viewBox="0 0 7 12" aria-hidden="true">
                <path d="M3.5 0L7 4.5H0z" fill={active && sortDir === 'asc' ? 'var(--text)' : '#666'} />
                <path d="M3.5 12L0 7.5H7z" fill={active && sortDir === 'desc' ? 'var(--text)' : '#666'} />
              </svg>
            </button>
          )
        }
        const AttBtn = ({ st }) => {
          const v = attendance[st.id] || 'none'
          return (
            <button type="button" className={`reg-m-att reg-m-att-${v}`} disabled={saving}
              onClick={e => { e.stopPropagation(); if (navigator.vibrate) navigator.vibrate(12); toggleAttendance(st.id) }}
              aria-label={v === 'none' ? 'Not in — tap to mark attended' : v === 'attended' ? 'Attended — tap for full kit' : 'Full kit — tap to clear'}>
              {v === 'none' ? 'Mark' : v === 'attended' ? '✓ In' : '✓ KIT'}
            </button>
          )
        }
        const Spark = ({ wd }) => {
          const vals = (wd?.last5 || []).map(e => e.weight)
          // Only the difference to the athlete's target is shown (e.g. -3.1kg / +1.8kg) --
          // the weight itself is in the graph / profile.
          const TargetDiff = () => {
            const cur = wd?.current
            if (cur == null || wd?.targetWeight == null) return null
            if (wd?.isPlusDivision) return <span style={{ color: '#1D9E75' }}>{wd.compWeightLabel}</span>
            const diff = +(cur - wd.targetWeight).toFixed(1)
            if (diff === 0) return <span style={{ color: '#1D9E75' }}>On target</span>
            return <span style={{ color: diff < 0 ? '#1D9E75' : '#E24B4A', fontWeight: 700 }} title={`Target ${wd.targetWeight}kg`}>{diff > 0 ? '+' : '−'}{Math.abs(diff)}kg</span>
          }
          if (vals.length < 2) return <div className="reg-m-spark-empty">{vals.length ? <TargetDiff /> : 'No weights yet'}</div>
          const lo = Math.min(...vals), hi = Math.max(...vals), rng = (hi - lo) || 1
          const pts = vals.map((v, i) => `${(4 + i * (72 / (vals.length - 1))).toFixed(1)},${(26 - ((v - lo) / rng) * 20).toFixed(1)}`)
          const change = vals[vals.length - 1] - vals[0]
          const col = '#9A9A9A' // line stays grey; the +/- to target keeps its colour
          const [lx, ly] = pts[pts.length - 1].split(',')
          return (
            <div className="reg-m-spark">
              <svg width="80" height="30" viewBox="0 0 80 30" aria-label={`Last ${vals.length} weights, ${vals[0]} to ${vals[vals.length - 1]} kg`}>
                <polyline points={pts.join(' ')} fill="none" stroke={col} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                <circle cx={lx} cy={ly} r="2.5" fill={col} />
              </svg>
              <TargetDiff />
            </div>
          )
        }
        return (
          <div className="reg-mobile-only">
            {/* Date stepper + settings */}
            <div className="reg-m-row">
              <div className="reg-m-date">
                <button type="button" aria-label="Previous day" onClick={() => stepDate(-1)}>‹</button>
                <label className="reg-m-date-label">
                  {dateLabel}
                  <input type="date" value={date} onChange={e => setDate(e.target.value)} aria-label="Pick a date" />
                </label>
                <button type="button" aria-label="Next day" onClick={() => stepDate(1)}>›</button>
              </div>
              <button type="button" className={`reg-m-icon reg-m-text${pmOn ? ' reg-m-pm-on' : ''}`} aria-pressed={pmOn}
                onClick={() => { setSelectedStudents([]); setMExpanded(null); setPmOn(v => !v); if (!pmReason) setPmPickerOpen(true) }}
                title="Points mode: pick a reason, then tap students to award it">⭐ Points</button>
              <button type="button" className="reg-m-icon reg-m-text" onClick={() => setMShowTable(true)} title="Show the full table (all columns and editing)">Table</button>
              <button type="button" className="reg-m-icon" aria-label="Register settings" onClick={() => setMSettingsOpen(true)}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12" /><circle cx="16" cy="6" r="2" /><circle cx="10" cy="12" r="2" /><circle cx="18" cy="18" r="2" /></svg>
              </button>
            </div>

            {/* Headcount (tap = shortlist to attended, as before) */}
            <button type="button" className="reg-m-count" onClick={() => setShowOnlyAttended(v => !v)} aria-pressed={showOnlyAttended}>
              <span className="reg-m-count-num" style={{ color: showOnlyAttended ? '#1D9E75' : 'var(--text)' }}>{inCount}</span>
              <span className="reg-m-count-of">/ {total} in{showOnlyAttended ? ' (shortlisted)' : ''}</span>
              <span className="reg-m-count-bar"><span style={{ width: `${total ? (kitCount / total) * 100 : 0}%`, background: '#EF9F27' }} /><span style={{ width: `${total ? ((inCount - kitCount) / total) * 100 : 0}%`, background: '#1D9E75' }} /></span>
              <span className="reg-m-count-kit">{kitCount} kit</span>
            </button>

            {pmOn && (
              <div className="reg-m-pm">
                <div className="reg-m-pm-head">
                  <span>{pmReason ? <>Tap students to give <b>{pmReason.label} {pmReason.points > 0 ? '+' : ''}{pmReason.points}</b></> : 'Pick a reason, then tap students'}</span>
                  <button type="button" onClick={() => { setPmOn(false); setPmPickerOpen(false) }}>Done</button>
                </div>
                <div className="reg-m-reasons">
                  {reasonsByUse.slice(0, 6).map(pt => <ReasonChip key={pt.label} pt={pt} on={pmReason?.label === pt.label} onPick={r => { setPmReason(r); setPmPickerOpen(false) }} />)}
                  <button type="button" className="reg-m-reason more" onClick={() => setPmPickerOpen(v => !v)}>{pmPickerOpen ? 'Less' : 'More…'}</button>
                </div>
                {pmPickerOpen && (
                  <div className="reg-m-pm-picker">
                    <input type="search" value={pmSearch} onChange={e => setPmSearch(e.target.value)} placeholder="Search reasons…" aria-label="Search reasons" />
                    <div className="reg-m-reasons wrap">
                      {reasonsByUse.filter(pt => !pmSearch.trim() || `${pt.label} ${pt.group || ''}`.toLowerCase().includes(pmSearch.trim().toLowerCase()))
                        .map(pt => <ReasonChip key={pt.label} pt={pt} on={pmReason?.label === pt.label} onPick={r => { setPmReason(r); setPmPickerOpen(false); setPmSearch('') }} />)}
                    </div>
                    {pmSearch.trim() && !pointTypes.some(pt => pt.label.toLowerCase() === pmSearch.trim().toLowerCase()) && (
                      <div className="reg-m-newreason">
                        <div>Add “<b>{pmSearch.trim()}</b>” as a new reason</div>
                        <div className="reg-m-newreason-row">
                          <button type="button" aria-label="Fewer points" onClick={() => setPmNewPts(n => n - 1)}>−</button>
                          <b className={pmNewPts < 0 ? 'neg' : ''}>{pmNewPts > 0 ? '+' : ''}{pmNewPts}</b>
                          <button type="button" aria-label="More points" onClick={() => setPmNewPts(n => n + 1)}>+</button>
                          <button type="button" className="add" disabled={pmNewPts === 0} onClick={async () => {
                            const label = pmSearch.trim(), pts = pmNewPts
                            const reason = { label, points: pts, group: 'Custom' }
                            if (saveNewReason) {
                              const next = [...pointTypes, reason]
                              const { error } = await supabase.from('settings').update({ value: next }).eq('key', 'point_types')
                              if (error) alert('Using it for now, but it could not be added to the reasons list: ' + error.message)
                              else setPointTypes(next)
                            }
                            setPmReason(reason); setPmPickerOpen(false); setPmSearch(''); setPmNewPts(1)
                          }}>Add &amp; use</button>
                        </div>
                        <label><input type="checkbox" checked={saveNewReason} onChange={e => setSaveNewReason(e.target.checked)} /> Save to the reasons list for next time</label>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            <input className="reg-m-search" type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder={`Search ${total} students`} aria-label="Search students" />
            <div className="reg-m-chips">
              {[['all', `All ${total}`], ['out', `Not in ${total - inCount}`], ['in', `In ${inCount}`]].map(([k, l]) => (
                <button key={k} type="button" aria-pressed={mFilter === k} className={mFilter === k ? 'on' : ''} onClick={() => setMFilter(k)}>{l}</button>
              ))}
            </div>

            {/* Sort headers + page dots (swipe the list to switch detail sets) */}
            <div className="reg-m-dots" role="tablist" aria-label="Detail columns">
              {(isMainReg ? [0, 1, 2] : [0, 1, 2, 3]).map(i => <button key={i} type="button" role="tab" aria-selected={mPage === i} aria-label={isMainReg ? (['Age, attendance, media', 'Grade, house, points', 'Sessions, last in, start date'][i]) : (['Age, weight, attendance', 'Level, record, weight trend', 'Sessions, last in, start date', 'House, points, media'][i])} className={mPage === i ? 'on' : ''} onClick={() => setMPage(i)} />)}
            </div>
            {sortThen.length > 0 && (
              <div className="reg-m-sortchain">
                Sorted by <b>{({ first_name: 'Name', age: 'Age', weight_current: 'Weight', att_pct: 'Attend.', media_restriction: 'Media', grade: 'Grade', house: 'House', att_last: 'Last in', wins: 'Record', attendance: 'In/out', last_name: 'Surname' })[sortKey] || sortKey} {sortDir === 'asc' ? '↑' : '↓'}</b>
                {sortThen.map(r => <span key={r.key}> → {({ first_name: 'Name', age: 'Age', weight_current: 'Weight', att_pct: 'Attend.', media_restriction: 'Media', grade: 'Grade', house: 'House', att_last: 'Last in', wins: 'Record', attendance: 'In/out', last_name: 'Surname' })[r.key] || r.key} {r.dir === 'asc' ? '↑' : '↓'}</span>)}
                <button type="button" onClick={() => setSortThen([])} aria-label="Just sort by the first column">✕</button>
              </div>
            )}
            <div className="reg-m-headers">
              <SortBtn k="first_name" label="NAME" grow />
              {isMainReg
                ? (mPage === 0 ? <><SortBtn k="age" label="AGE" /><SortBtn k="att_pct" label="ATTEND." /><SortBtn k="media_restriction" label="MEDIA" /><span style={{ width: 58, flexShrink: 0 }} /></>
                               : mPage === 1 ? <><SortBtn k="grade" label="GRADE" /><SortBtn k="house" label="HOUSE" /><SortBtn k="house_points" label="POINTS" /></>
                               : <><SortBtn k="att_total" label="SESSIONS" /><SortBtn k="att_last" label="LAST IN" /><SortBtn k="start_date" label="STARTED" /></>)
                : (mPage === 0 ? <><SortBtn k="age" label="AGE" /><SortBtn k="weight_current" label="WEIGHT" /><SortBtn k="att_pct" label="ATTEND." /><span style={{ width: 58, flexShrink: 0 }} /></>
                               : mPage === 1 ? <><SortBtn k="grade" label="LEVEL" /><SortBtn k="wins" label="RECORD" /><SortBtn k="weight_current" label="WEIGHT" /></>
                               : mPage === 2 ? <><SortBtn k="att_total" label="SESSIONS" /><SortBtn k="att_last" label="LAST IN" /><SortBtn k="start_date" label="STARTED" /></>
                               : <><SortBtn k="house" label="HOUSE" /><SortBtn k="house_points" label="POINTS" /><SortBtn k="media_restriction" label="MEDIA" /></>)}
            </div>

            <div className="reg-m-list"
              onTouchStart={e => { mSwipeX.current = { x: e.touches[0].clientX, y: e.touches[0].clientY } }}
              onTouchEnd={e => {
                const st = mSwipeX.current; mSwipeX.current = null
                if (!st) return
                const dx = e.changedTouches[0].clientX - st.x, dy = e.changedTouches[0].clientY - st.y
                if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) setMPage(p => Math.max(0, Math.min(isMainReg ? 2 : 3, p + (dx < 0 ? 1 : -1))))
              }}>
              {list.length === 0 && <div className="reg-m-empty">{search ? 'No students match your search' : 'No students here'}</div>}
              {list.map(st => {
                const m = st.members
                const wd = weightDataByStudent[st.id]
                const stats = attendanceStats[st.id]
                const pct = stats?.pct ?? null
                const weight = wd?.current ?? st.weight_kg
                const isSel = selectedStudents.includes(st.id)
                const open = mExpanded === st.id
                const initials = `${m?.first_name?.[0] || ''}${m?.last_name?.[0] || ''}`.toUpperCase()
                const rec = (st.wins || st.losses || st.draws) ? { w: st.wins || 0, l: st.losses || 0, d: st.draws || 0 } : null
                const bday = getBirthdayInfo(m?.date_of_birth)
                return (
                  <div key={st.id} id={`regm-${st.id}`} className={`reg-m-card${isSel ? ' sel' : ''}${pmOn && pmReason ? ' pm' : ''}`}
                    // Long-press starts multi-select; once selecting, a normal tap anywhere
                    // on a card adds/removes it (no need to hold again). The click that
                    // follows a long-press is swallowed so it doesn't undo the selection.
                    onClick={() => {
                      if (mLongPressFired.current) { mLongPressFired.current = false; return }
                      if (pmOn) { if (pmReason) quickAward([st.id], pmReason); else setPmPickerOpen(true); return }
                      if (selecting) toggleSel(st.id)
                    }}
                    onTouchStart={() => {
                      if (pmOn) return   // Points mode: taps award, no hold-to-select
                      // Hold selects -- also while already selecting (tap works too)
                      mLongPress.current = setTimeout(() => { mLongPressFired.current = true; if (navigator.vibrate) navigator.vibrate(25); if (selecting && mLastSel.current && mLastSel.current !== st.id) selectRangeTo(st.id); else toggleSel(st.id) }, 450)
                    }}
                    onTouchEnd={() => { clearTimeout(mLongPress.current); mLongPress.current = null }}
                    onTouchMove={() => { clearTimeout(mLongPress.current); mLongPress.current = null }}
                    onContextMenu={e => e.preventDefault()}>
                    <div className="reg-m-card-main">
                      {isSel ? <span className="reg-m-tick" aria-label="Selected">✓</span> : (
                        <button type="button" className={`reg-m-avatar${open ? ' open' : ''}`} aria-expanded={open} aria-label={showRowPhotos && st.photo_url ? `Show ${m?.first_name}'s photo` : `${open ? 'Hide' : 'Show'} details for ${m?.first_name} ${m?.last_name}`}
                          onClick={e => {
                            if (selecting || pmOn) return
                            e.stopPropagation()
                            // Photo: tap shows it large (tap again to close). No photo: initials open the details as before.
                            if (showRowPhotos && st.photo_url) setEnlargedPhoto(st.photo_url)
                            else setMExpanded(open ? null : st.id)
                          }}>{showRowPhotos && st.photo_url ? <img src={st.photo_url} alt="" loading="lazy" className="reg-m-avatar-img" /> : initials}</button>
                      )}
                      <div className="reg-m-body">
                        <div className="reg-m-name">
                          {!selecting && !pmOn
                            ? <button type="button" className="reg-m-namelink" onClick={e => { e.stopPropagation(); setMExpanded(open ? null : st.id) }}>{m?.first_name} {m?.last_name}</button>
                            : <span>{m?.first_name} {m?.last_name}</span>}
                          {(() => { const t = (pointsByStudent[st.id] || []).reduce((n, pp) => n + (pp.points_awarded || 0), 0); return t ? <span className="reg-m-today">+{t}</span> : null })()}
                          {bday && <button type="button" className="reg-m-bday" title={bday.daysUntil === 0 ? 'Birthday today!' : 'Upcoming birthday'} onClick={e => { e.stopPropagation(); setBirthdayPopup({ name: `${m?.first_name} ${m?.last_name}`, info: bday }) }}>{bday.daysUntil === 0 ? '🥳' : '🎂'}</button>}
                        </div>
                        {isMainReg ? (mPage === 0 ? (
                          <div className="reg-m-details reg-m-cols reg-m-cols-main">
                            <span>Age <b>{calcAge(m?.date_of_birth) ?? '—'}</b></span>
                            <span className="reg-m-pct"><span className="bar"><span style={{ width: `${pct || 0}%`, background: pctColour(pct) }} /></span><b style={{ color: pctColour(pct) }}>{pct != null ? `${pct}%` : '—'}</b></span>
                            <span style={{ display: 'inline-flex', alignItems: 'center' }}><MediaCam restriction={st.media_restriction} /></span>
                          </div>
                        ) : mPage === 1 ? (
                          <div className="reg-m-details reg-m-details-3">
                            <span><b style={{ color: gradeColour(st.pka_belt || st.krba_level) }}>{st.pka_belt || st.krba_level || '—'}</b></span>
                            <span><b style={{ color: houseText(st.house_name || m?.houses?.name) }}>{(st.house_name || m?.houses?.name)?.replace(' House', '') || '—'}</b></span>
                            <span><b>{st.house_points || 0}</b> pts</span>
                          </div>
                        ) : (
                          <div className="reg-m-details reg-m-details-3">
                            <span><b>{stats?.total ?? 0}</b></span>
                            <span>{stats?.last ? <b style={{ color: lastInColour(stats.last) }}>{ddmm(stats.last)}</b> : '—'}</span>
                            <span>{(m?.joined_date || stats?.first) ? <><b style={{ color: '#1D9E75' }}>{mmyy(m?.joined_date || stats?.first)}</b><span className="reg-m-months" title="Months trained">={monthsSince(m?.joined_date || stats?.first)}</span></> : '—'}</span>
                          </div>
                        )) : mPage === 0 ? (
                          <div className="reg-m-details reg-m-cols">
                            <span>Age <b>{calcAge(m?.date_of_birth) ?? '—'}</b></span>
                            <span><b>{weight != null ? `${weight}kg` : '—'}</b></span>
                            <span className="reg-m-pct"><span className="bar"><span style={{ width: `${pct || 0}%`, background: pctColour(pct) }} /></span><b style={{ color: pctColour(pct) }}>{pct != null ? `${pct}%` : '—'}</b></span>
                          </div>
                        ) : mPage === 2 ? (
                          <div className="reg-m-details reg-m-details-3">
                            <span><b>{stats?.total ?? 0}</b></span>
                            <span>{stats?.last ? <b style={{ color: lastInColour(stats.last) }}>{ddmm(stats.last)}</b> : '—'}</span>
                            <span>{(m?.joined_date || stats?.first) ? <><b style={{ color: '#1D9E75' }}>{mmyy(m?.joined_date || stats?.first)}</b><span className="reg-m-months" title="Months trained">={monthsSince(m?.joined_date || stats?.first)}</span></> : '—'}</span>
                          </div>
                        ) : mPage === 3 ? (
                          <div className="reg-m-details reg-m-details-3">
                            <span><b style={{ color: houseText(st.house_name || m?.houses?.name) }}>{(st.house_name || m?.houses?.name)?.replace(' House', '') || '—'}</b></span>
                            <span><b>{st.house_points || 0}</b> pts</span>
                            <span style={{ display: 'inline-flex', alignItems: 'center' }}><MediaCam restriction={st.media_restriction} /></span>
                          </div>
                        ) : (
                          <div className="reg-m-details reg-m-details-2">
                            <span><b style={{ color: gradeColour(st.pka_belt || st.krba_level) }}>{st.pka_belt || st.krba_level || '—'}</b></span>
                            <span>{rec ? <><b style={{ color: '#1D9E75' }}>{rec.w}W</b> <b style={{ color: '#E24B4A' }}>{rec.l}L</b> <b style={{ color: '#9A9A9A' }}>{rec.d}D</b></> : '—'}</span>
                          </div>
                        )}
                      </div>
                      {mPage === 0 ? <AttBtn st={st} /> : (!isMainReg && mPage === 1) ? <Spark wd={wd} /> : null /* Mark only on the first page -- more room on the others */}
                    </div>
                    {open && !selecting && isMainReg && (
                      <div className="reg-m-open reg-m-open-profile" onClick={e => e.stopPropagation()}>
                        <div className="reg-m-actions">
                          <button type="button" onClick={() => { setMultiAward(false); setAwardingFor(st) }}>+ Points</button>
                          <button type="button" onClick={() => setCalendarStudent(st)}>Calendar</button>
                          {(pointsByStudent[st.id] || []).length > 0 && <button type="button" onClick={() => setPointsPanelFor(st)}>Today's points</button>}
                          {(st.is_kr || st.discipline === 'KRBA') && (
                            <button type="button" className="reg-m-ath" title="Open athlete profile" onClick={() => navigate(`/athletes?id=${st.id}&from=register`)}>ATH</button>
                          )}
                        </div>
                        {/* Swipe: Contact card -> Profile -> Points -> Grading (the profile's own Contact tab is
                            left out -- the contact card above has the same details). Card swipes don't change the
                            register's column pages; swiping the list outside the card still does. */}
                        <div className="reg-m-cardswipe"
                          onTouchStart={e => { e.stopPropagation(); cardSwipe.current = { x: e.touches[0].clientX, y: e.touches[0].clientY } }}
                          onTouchEnd={e => {
                            e.stopPropagation()
                            const c = cardSwipe.current; cardSwipe.current = null
                            if (!c || (mCardTab[st.id] || 'contact') !== 'contact') return
                            const dx = e.changedTouches[0].clientX - c.x, dy = e.changedTouches[0].clientY - c.y
                            if (dx < -60 && Math.abs(dx) > Math.abs(dy) * 1.5) setMCardTab(t => ({ ...t, [st.id]: 'profile' }))
                          }}>
                          {(mCardTab[st.id] || 'contact') === 'contact' ? (
                            <>
                              <div className="reg-m-cardhead"><span>Contact</span><span className="reg-m-cardhint">swipe for profile ›</span></div>
                              {renderContactCard(st, { showProfileButton: false })}
                            </>
                          ) : (
                            <>
                              <StudentProfile student={st} isAdmin={isAdmin} embedded={true} hideIdentity={true} onClose={() => setMExpanded(null)}
                                swipeTabs omitTabs={['contact']} onSwipeBeforeFirst={() => setMCardTab(t => ({ ...t, [st.id]: 'contact' }))} />
                              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
                                <button type="button" className="btn btn-sm" onClick={() => navigate(studentProfileLink(st))}>Full profile →</button>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    )}
                    {open && !selecting && !isMainReg && (
                      <div className="reg-m-open" onClick={e => e.stopPropagation()}>
                        <div className="reg-m-stats">
                          <div><span>Sessions</span><b>{stats?.total ?? 0}</b></div>
                          <div><span>Last in</span><b style={{ color: stats?.last ? lastInColour(stats.last) : undefined }}>{stats?.last ? ddmm(stats.last) : '—'}</b></div>
                          <div><span>Attend.</span><b style={{ color: pctColour(pct) }}>{pct != null ? `${pct}%` : '—'}</b></div>
                          <div><span>Weight</span><b>{weight != null ? `${weight}kg` : '—'}</b></div>
                          <div><span>Target wt</span><b>{wd?.targetWeight ? `${wd.targetWeight}kg` : '—'}</b></div>
                          <div><span>Comp weight</span><b>{wd?.compWeightLabel || st.weight_division || '—'}</b></div>
                        </div>
                        <div className="reg-m-note">Weights come from the weigh check-in / athlete app</div>
                        <div className="reg-m-actions">
                          <button type="button" onClick={() => { setMultiAward(false); setAwardingFor(st) }}>+ Points</button>
                          <button type="button" onClick={() => setCalendarStudent(st)}>Calendar</button>
                          {(pointsByStudent[st.id] || []).length > 0 && <button type="button" onClick={() => setPointsPanelFor(st)}>Today's points</button>}
                          {(st.is_kr || st.discipline === 'KRBA') && <button type="button" className="reg-m-ath" title="Open athlete profile" onClick={() => onStudentNameClick ? onStudentNameClick(st) : navigate(`/athletes?id=${st.id}&from=register`)}>ATH</button>}
                          {onWeightClick && <button type="button" onClick={() => onWeightClick(st)}>Weights</button>}
                        </div>
                        <div className="reg-m-cardswipe"
                          onTouchStart={e => { e.stopPropagation(); cardSwipe.current = { x: e.touches[0].clientX, y: e.touches[0].clientY } }}
                          onTouchEnd={e => {
                            e.stopPropagation()
                            const c = cardSwipe.current; cardSwipe.current = null
                            if (!c || (mCardTab[st.id] || 'contact') !== 'contact') return
                            const dx = e.changedTouches[0].clientX - c.x, dy = e.changedTouches[0].clientY - c.y
                            if (dx < -60 && Math.abs(dx) > Math.abs(dy) * 1.5) setMCardTab(t => ({ ...t, [st.id]: 'profile' }))
                          }}>
                          {(mCardTab[st.id] || 'contact') === 'contact' ? (
                            <>
                              <div className="reg-m-cardhead"><span>Contact</span><span className="reg-m-cardhint">swipe for profile ›</span></div>
                              {renderContactCard(st, { showProfileButton: false })}
                            </>
                          ) : (
                            <StudentProfile student={st} isAdmin={isAdmin} embedded={true} hideIdentity={true} onClose={() => setMExpanded(null)}
                              swipeTabs omitTabs={['contact']} onSwipeBeforeFirst={() => setMCardTab(t => ({ ...t, [st.id]: 'contact' }))} />
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
              <div className="reg-m-hint">Tap the button: Mark → In → Kit → clear · Initials / name = details · ATH = athlete profile · Hold to select, tap to add one, hold another to add everyone in between · Swipe for more details</div>
            </div>

            {/* Bulk bar -- only while selecting */}
            {selecting && (
              <div className="reg-m-bulk">
                <div className="reg-m-bulk-top">
                  <b>{selectedStudents.length} selected</b>
                  <button type="button" onClick={() => setSelectedStudents(list.map(x => x.id))}>All</button>
                  <button type="button" onClick={() => setSelectedStudents(list.filter(x => attendance[x.id] && attendance[x.id] !== 'none').map(x => x.id))}>All in</button>
                  <button type="button" onClick={() => setSelectedStudents(list.filter(x => attendance[x.id] === 'full_kit').map(x => x.id))}>All kit</button>
                  <button type="button" className={selectedFirst ? 'on' : ''} aria-pressed={selectedFirst} onClick={() => setSelectedFirst(v => !v)}>Selected to top</button>
                  <button type="button" onClick={() => { setSelectedStudents([]); setSelectedFirst(false) }}>Cancel</button>
                </div>
                <div className="reg-m-reasons">
                  {reasonsByUse.slice(0, 3).map(pt => <ReasonChip key={pt.label} pt={pt} onPick={r => quickAward([...selectedStudents], r)} />)}
                  <button type="button" className="reg-m-reason more" onClick={() => setMultiAward(true)}>More…</button>
                </div>
                <div className="reg-m-bulk-actions">
                  <button type="button" className="in" disabled={saving} onClick={() => markAttendance('attended')}>✓ In</button>
                  <button type="button" className="kit" disabled={saving} onClick={() => markAttendance('full_kit')}>✓ Kit</button>
                  <button type="button" disabled={saving} onClick={() => setMultiAward(true)}>+ Points</button>
                </div>
              </div>
            )}

            {lastAward && (
              <div className="reg-m-undo" role="status">
                <span><b>{lastAward.points > 0 ? '+' : ''}{lastAward.points} {lastAward.label}</b> → {lastAward.names.length === 1 ? lastAward.names[0] : `${lastAward.names.length} students`}</span>
                <button type="button" onClick={undoLastAward}>Undo</button>
              </div>
            )}

            {/* Settings sheet: stats range (moved off the page); columns still set the desktop table */}
            {mSettingsOpen && (
              <div className="reg-m-sheet-backdrop" onClick={() => setMSettingsOpen(false)}>
                <div className="reg-m-sheet" onClick={e => e.stopPropagation()} role="dialog" aria-label="Register settings">
                  <div className="reg-m-sheet-head"><b>Register settings</b><button type="button" onClick={() => setMSettingsOpen(false)}>Done</button></div>
                  <div className="reg-m-sheet-label">ATTENDANCE STATS RANGE</div>
                  <div className="reg-m-seg">
                    {[['4 weeks', 28], ['3 months', 91], ['All time', null]].map(([l, days]) => {
                      const from = days ? toLocalISO(new Date(Date.now() - days * 86400000)) : ''
                      const on = days ? attStatsDateFrom === from : (!attStatsDateFrom && !attStatsDateTo)
                      return <button key={l} type="button" className={on ? 'on' : ''} onClick={() => { setAttStatsDateFrom(from); setAttStatsDateTo(days ? toLocalISO(new Date()) : '') }}>{l}</button>
                    })}
                  </div>
                  <div className="reg-m-range">
                    <input type="date" value={attStatsDateFrom} onChange={e => setAttStatsDateFrom(e.target.value)} aria-label="Stats from" />
                    <span>to</span>
                    <input type="date" value={attStatsDateTo} onChange={e => setAttStatsDateTo(e.target.value)} aria-label="Stats to" />
                  </div>
                  <div className="reg-m-sheet-label">DEFAULT ORDER</div>
                  <div className="reg-m-seg">
                    {[['Name', 'first_name', 'asc'], ['Not in first', 'attendance', 'asc'], ['Attendance', 'att_pct', 'desc']].map(([l, k, d]) => (
                      <button key={l} type="button" className={sortKey === k ? 'on' : ''} onClick={() => { setSortKey(k); setSortDir(d) }}>{l}</button>
                    ))}
                  </div>
                  <button type="button" className="reg-m-table-btn" onClick={() => { setMShowTable(true); setMSettingsOpen(false) }}>Show the full table (all columns, W/L/D, in-comp, groups…)</button>
                  <div className="reg-m-sheet-note">The ⚙ Columns picker controls the full table.</div>
                </div>
              </div>
            )}
          </div>
        )
      })()}

      {/* Table */}
      {loading ? <div className="loading">Loading…</div> : (<>
        <div className="desktop-only-zoom-controls" style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Zoom:</span>
          <button className="btn btn-sm" onClick={() => setRegisterZoom(z => Math.max(70, z - 10))}>−</button>
          <span style={{ fontSize: 12, minWidth: 40, textAlign: 'center' }}>{registerZoom}%</span>
          <button className="btn btn-sm" onClick={() => setRegisterZoom(z => Math.min(200, z + 10))}>+</button>
          {registerZoom !== 100 && <button className="btn btn-sm" onClick={() => setRegisterZoom(100)}>Reset</button>}
        </div>
        <div className="card reg-desktop-only" style={{ padding: 0, overflowX: 'auto' }} ref={tableRef}
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
          <table style={{ minWidth: isKR ? 900 : 680, borderCollapse: 'separate', borderSpacing: 0 }}>
            <thead style={{ position: 'sticky', top: registerToolbarHeight, zIndex: 12, background: 'var(--bg)' }}>
              <tr>
                {visibleCols.includes('checkbox') && <th style={{ width: 32, paddingLeft: 12, background: 'var(--bg)', position: 'sticky', left: 0, zIndex: 13 }}></th>}
                {visibleCols.includes('student_ref') && <SortTh col="student_ref" label="ID" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />}
                {visibleCols.includes('name')        && <SortTh col="first_name" label="Name" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} style={{ position: 'sticky', left: visibleCols.includes('checkbox') ? 32 : 0, zIndex: 13, background: 'var(--bg)' }} />}
                {visibleCols.includes('age')         && <SortTh col="age" label="Age" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />}
                {visibleCols.includes('house')       && <SortTh col="house" label="House" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />}
                {visibleCols.includes('grade')       && <SortTh col="grade" label="Grade" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />}
                {visibleCols.includes('weight') && !isKR && regType !== 'krba' && <SortTh col="weight_kg" label="Weight" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} style={{ textAlign: 'center' }} />}
                {visibleCols.includes('record') && (regType === 'kr' || regType === 'krba') && <SortTh col="wins" label="Record" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} style={{ textAlign: 'center' }} />}
                {visibleCols.includes('class_time')  && <th style={{ background: 'var(--bg)' }}>Class time</th>}
                {isKR && <>
                  <SortTh col="competition_team" label="Experience" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  <SortTh col="discipline_codes" label="Discipline" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  <SortTh col="age_category_kr" label="Age cat." sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                </>}
                {(regType === 'kr' || regType === 'krba') && <>
                  {visibleCols.includes('weight_trend')   && <th style={{ background: 'var(--bg)', textAlign: 'center' }} title="Since the previous weigh-in">Trend</th>}
                  {visibleCols.includes('weight_last5')   && <th style={{ background: 'var(--bg)' }}>Last 5 weights</th>}
                  {visibleCols.includes('weight_current') && <th style={{ background: 'var(--bg)', textAlign: 'center' }}>Current weight</th>}
                  {visibleCols.includes('weight_comp')    && <th style={{ background: 'var(--bg)', textAlign: 'center' }}>Comp weight</th>}
                  {visibleCols.includes('weight_pctdiff') && <th style={{ background: 'var(--bg)', textAlign: 'center' }} title="Current weight vs comp weight">% diff</th>}
                  {visibleCols.includes('weight_entries') && <th style={{ background: 'var(--bg)', textAlign: 'center' }} title="Total weigh-ins on record">Entries</th>}
                </>}
                {visibleCols.includes('att_total') && <th style={{ background: 'var(--bg)', textAlign: 'center' }} title="All-time sessions attended">Total sessions</th>}
                {visibleCols.includes('att_last') && <th style={{ background: 'var(--bg)', textAlign: 'center' }}>Last attended</th>}
                {visibleCols.includes('att_pct') && <th style={{ background: 'var(--bg)', textAlign: 'center' }} title="Days attended out of days attended + missed (same rules as the attendance calendar)">Attendance %</th>}
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
                    onClick={() => handleRowClick(s.id)}
                    onTouchStart={handleRowTouchStart}
                    onTouchMove={handleRowTouchMove}
                    style={{
                      background: isSelected ? '#e6f1fb' : undefined,
                      outline: isSelected ? '2px solid #378ADD' : undefined,
                      cursor: 'pointer',
                    }}>
                    {visibleCols.includes('checkbox') && <td style={{ paddingLeft: 12, position: 'sticky', left: 0, zIndex: 1, background: isSelected ? '#e6f1fb' : 'var(--bg)' }} onClick={e => e.stopPropagation()}>
                      <input type="checkbox" checked={isSelected}
                        onChange={() => setSelectedStudents(prev => prev.includes(s.id) ? prev.filter(x => x !== s.id) : [...prev, s.id])}
                        style={{ width: 14, height: 14 }} />
                    </td>}
                    {visibleCols.includes('student_ref') && <td onClick={e => { e.stopPropagation(); setContactModal(s) }}>
                      <span style={{ color: '#185fa5', fontSize: 11, fontWeight: 600, cursor: 'pointer', textDecoration: 'underline', fontFamily: 'monospace' }}>
                        {s.student_ref || '—'}
                      </span>
                    </td>}
                    {visibleCols.includes('name') && <td className="register-name-cell" style={{ position: 'sticky', left: visibleCols.includes('checkbox') ? 32 : 0, zIndex: 1, background: isSelected ? '#e6f1fb' : 'var(--bg)' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span
                          onClick={onStudentNameClick ? (e => { e.stopPropagation(); onStudentNameClick(s) }) : undefined}
                          style={{ color: onStudentNameClick ? 'var(--text-link, #378ADD)' : 'var(--text)', fontWeight: 500, fontSize: 13, cursor: onStudentNameClick ? 'pointer' : 'default', textDecoration: onStudentNameClick ? 'underline' : 'none' }}
                          className="register-name-text">
                          {m?.first_name} {m?.last_name}
                        </span>
                        {(() => {
                          const bday = getBirthdayInfo(m?.date_of_birth)
                          if (!bday) return null
                          return (
                            <button onClick={e => { e.stopPropagation(); setBirthdayPopup({ name: `${m?.first_name} ${m?.last_name}`, info: bday }) }}
                              title={bday.daysUntil === 0 ? 'Birthday today!' : 'Upcoming birthday'} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, padding: 0, lineHeight: 1 }}>
                              {bday.daysUntil === 0 ? '🥳' : '🎂'}
                            </button>
                          )
                        })()}
                      </span>
                    </td>}
                    {visibleCols.includes('age') && (
                      <td style={{ fontSize: 13, color: 'var(--text-secondary)', position: 'relative' }}>
                        <span style={{ cursor: 'pointer' }}
                          onClick={e => { e.stopPropagation(); setDobPopupStudentId(prev => prev === s.id ? null : s.id) }}>
                          {age}
                        </span>
                        {dobPopupStudentId === s.id && (
                          <div onClick={e => e.stopPropagation()}
                            style={{ position: 'absolute', top: '100%', left: 0, zIndex: 20, marginTop: 4, padding: '6px 10px', borderRadius: 'var(--radius)', background: 'var(--bg)', border: '1px solid var(--border-strong)', boxShadow: '0 2px 8px rgba(0,0,0,0.15)', whiteSpace: 'nowrap', fontSize: 12 }}>
                            <div style={{ fontWeight: 600, marginBottom: 2 }}>Date of birth</div>
                            <div>{m?.date_of_birth ? new Date(m.date_of_birth + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : 'Not on record'}</div>
                          </div>
                        )}
                      </td>
                    )}
                    {visibleCols.includes('house') && <td>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12 }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: colour, display: 'inline-block' }} />
                        {houseName || '—'}
                      </span>
                    </td>}
                    {visibleCols.includes('grade') && <td style={{ fontSize: 12, fontWeight: 600, color: gradeColour(s.pka_belt || s.krba_level) }}>{s.pka_belt || s.krba_level || '—'}</td>}
                    {visibleCols.includes('weight') && !isKR && regType !== 'krba' && <td style={{ fontSize: 12, textAlign: 'center' }}>{s.weight_kg ? `${s.weight_kg}kg` : '—'}</td>}
                    {visibleCols.includes('record') && (regType === 'kr' || regType === 'krba') && (
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
                    {visibleCols.includes('class_time') && <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{s.class_time || '—'}</td>}
                    {isKR && (
                      <>
                        <td><span className={`badge ${s.competition_team==='Advanced'?'badge-purple':s.competition_team==='Intermediate'?'badge-blue':'badge-gray'}`} style={{ fontSize: 10 }}>{s.competition_team || '—'}</span></td>
                        <td style={{ fontSize: 11 }}>{s.discipline_codes || '—'}</td>
                        <td style={{ fontSize: 11 }}>{s.age_category_kr || s.age_category || '—'}</td>
                      </>
                    )}
                    {(regType === 'kr' || regType === 'krba') && (() => {
                      const wd = weightDataByStudent[s.id]
                      return <>
                        {visibleCols.includes('weight_trend') && (
                          <td style={{ textAlign: 'center', cursor: onWeightClick ? 'pointer' : undefined }}
                            onClick={onWeightClick ? (e => { e.stopPropagation(); onWeightClick(s) }) : undefined}
                            title={onWeightClick ? 'View full weight history and graph' : wd?.last5?.length > 1 ? `Last ${wd.last5.length} weigh-ins: ${wd.last5.map(e => `${e.weight}kg`).join(' → ')}` : 'Not enough weigh-ins yet'}>
                            {wd?.last5?.length > 1 ? (() => {
                              const vals = wd.last5.map(e => e.weight)
                              const min = Math.min(...vals), max = Math.max(...vals)
                              const range = max - min || 1
                              const w = 50, h = 20, pad = 2
                              const points = vals.map((v, i) => {
                                const x = pad + (i / (vals.length - 1)) * (w - pad * 2)
                                const y = pad + (1 - (v - min) / range) * (h - pad * 2)
                                return `${x},${y}`
                              })
                              const lineColour = wd.trend === 'up' ? '#E24B4A' : wd.trend === 'down' ? '#1D9E75' : 'var(--text-tertiary)'
                              return (
                                <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: 'block', margin: '0 auto' }}>
                                  <polyline points={points.join(' ')} fill="none" stroke={lineColour} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
                                  <circle cx={points[points.length - 1].split(',')[0]} cy={points[points.length - 1].split(',')[1]} r="2" fill={lineColour} />
                                </svg>
                              )
                            })() : <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>—</span>}
                          </td>
                        )}
                        {visibleCols.includes('weight_last5') && (
                          <td style={{ fontSize: 11, color: 'var(--text-secondary)', whiteSpace: 'nowrap', cursor: onWeightClick ? 'pointer' : undefined, textDecoration: onWeightClick ? 'underline' : undefined }}
                            onClick={onWeightClick ? (e => { e.stopPropagation(); onWeightClick(s) }) : undefined}
                            title={onWeightClick ? 'View full weight history and graph' : undefined}>
                            {wd?.last5?.length > 0 ? wd.last5.map(e => `${e.weight}kg`).join(' → ') : '—'}
                          </td>
                        )}
                        {visibleCols.includes('weight_current') && (
                          <td style={{ textAlign: 'center', fontSize: 12, fontWeight: 600, color: wd?.pctDiff == null ? undefined : wd.isPlusDivision ? '#1D9E75' : wd.pctDiff > 0 ? '#E24B4A' : '#1D9E75', cursor: onWeightClick ? 'pointer' : undefined, textDecoration: onWeightClick ? 'underline' : undefined }}
                            onClick={onWeightClick ? (e => { e.stopPropagation(); onWeightClick(s) }) : undefined}
                            title={onWeightClick ? 'View full weight history and graph' : wd?.isPlusDivision ? "Plus division (no upper weight limit) -- always shown as fine" : wd?.pctDiff != null ? "Green if in line with comp weight, red if not" : undefined}>
                            {wd?.current != null ? `${wd.current}kg` : '—'}
                          </td>
                        )}
                        {visibleCols.includes('weight_comp') && (
                          <td style={{ textAlign: 'center', fontSize: 12 }}>{wd?.compWeightLabel || '—'}</td>
                        )}
                        {visibleCols.includes('weight_pctdiff') && (
                          <td style={{ textAlign: 'center', fontSize: 12, fontWeight: 600, color: wd?.pctDiff == null ? 'var(--text-tertiary)' : wd.isPlusDivision ? '#1D9E75' : wd.pctDiff > 0 ? '#E24B4A' : '#1D9E75' }}
                            title={wd?.isPlusDivision ? "Plus division (no upper weight limit) -- always shown as fine" : undefined}>
                            {wd?.pctDiff != null ? `${wd.pctDiff > 0 ? '+' : ''}${wd.pctDiff.toFixed(1)}%` : '—'}
                          </td>
                        )}
                        {visibleCols.includes('weight_entries') && (
                          <td style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-secondary)' }}>{wd?.entryCount ?? 0}</td>
                        )}
                      </>
                    })()}
                    {visibleCols.includes('att_total') && (
                      <td style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-secondary)' }}>{attendanceStats[s.id]?.total ?? 0}</td>
                    )}
                    {visibleCols.includes('att_last') && (
                      <td style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-secondary)' }}>
                        {attendanceStats[s.id]?.last ? new Date(attendanceStats[s.id].last + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                      </td>
                    )}
                    {visibleCols.includes('att_pct') && (
                      <td style={{ textAlign: 'center', cursor: 'pointer' }} title={`${attendanceStats[s.id]?.attendedDays ?? 0} days attended, ${attendanceStats[s.id]?.missedDays ?? 0} missed — tap to view calendar`}
                        onClick={e => { e.stopPropagation(); setCalendarStudent(s) }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 70 }}>
                          <div style={{ flex: 1, height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
                            <div style={{ width: `${attendanceStats[s.id]?.pct ?? 0}%`, height: '100%', background: colour, borderRadius: 3 }} />
                          </div>
                          <span style={{ fontSize: 11, color: 'var(--text-secondary)', minWidth: 30 }}>{attendanceStats[s.id]?.pct == null ? '—' : `${attendanceStats[s.id].pct}%`}</span>
                        </div>
                      </td>
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
                      <div style={{ fontSize: 13 }}><strong>{s.individual_points || 0}</strong></div>
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
      </>)}

      {/* One-off student addition */}
      <OneOffStudent displayStudents={displayStudents} date={date}
        onAdd={(s) => {
          oneOffStudentsRef.current = [...oneOffStudentsRef.current, s]
          if (regType === 'adhoc') addAdhoc(s)
          else setStudents(prev => prev.find(x => x.id === s.id) ? prev : [...prev, s])
        }} />

      {/* Contact modal */}
      {birthdayPopup && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 55, padding: 16 }}
          onClick={() => setBirthdayPopup(null)}>
          <div className="card" style={{ width: '100%', maxWidth: 320, textAlign: 'center' }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 36, marginBottom: 8 }}>{birthdayPopup.info.daysUntil === 0 ? '🥳' : '🎂'}</div>
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

      {calendarStudent && (
        <AttendanceCalendarModal student={calendarStudent} onClose={() => setCalendarStudent(null)}
          onChanged={changedDate => { loadAttendanceStats(); if (changedDate === date) loadStudents() }} />
      )}
      {contactModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 }}>
          <div className="card" style={{ width: '100%', maxWidth: 380 }}>
            {renderContactCard(contactModal, { onClose: () => setContactModal(null) })}
          </div>
        </div>
      )}

      <input ref={photoInputRef} type="file" accept="image/*" style={{ display: 'none' }}
        onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) uploadRegisterPhoto(photoTargetRef.current, f) }} />
      {enlargedPhoto && (
        <div onClick={() => setEnlargedPhoto(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60, padding: 24, cursor: 'zoom-out' }}>
          <img src={enlargedPhoto} alt="" style={{ maxWidth: '90vw', maxHeight: '90vh', borderRadius: 8 }} />
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
      {(awardingFor || multiAward) && (() => {
        // A typed reason that isn't in the list is used straight away by Award
        // (points preset to 5, adjustable); no separate Add step.
        const newLabel = pointSearch.trim()
        const isNewReason = !!newLabel && !pointTypes.some(pt => pt.label.toLowerCase() === newLabel.toLowerCase())
        const newPts = customPoints === '' ? 5 : parseInt(customPoints)
        const awardList = [...selectedPoints, ...(isNewReason && !isNaN(newPts) && !selectedPoints.some(p => p.label === newLabel) ? [{ label: newLabel, points: newPts }] : [])]
        const awardTotal = awardList.reduce((n, p) => n + p.points, 0)
        const clearIfEmptySpace = e => { e.stopPropagation(); if (!e.target.closest('button, input, label, a, select, textarea')) setSelectedPoints([]) }
        return (
        <div className="reg-award-modal" onClick={clearIfEmptySpace} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 }}>
          <div className="card" onClick={clearIfEmptySpace} style={{ width: '100%', maxWidth: 500, maxHeight: '90vh', overflowY: 'auto', paddingBottom: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <h2 style={{ fontSize: 15, fontWeight: 600 }}>Award points</h2>
              <button onClick={() => { setAwardingFor(null); setMultiAward(false); setSelectedPoints([]); setPointSearch('') }} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer' }}>✕</button>
            </div>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 14 }}>
              {multiAward ? `${selectedStudents.length} students selected` : `${awardingFor?.members?.first_name} ${awardingFor?.members?.last_name}`}
            </p>
            {/* Search the reasons list, or type a new reason */}
            <input type="search" value={pointSearch} onChange={e => setPointSearch(e.target.value)} autoFocus
              placeholder="Search or write a reason…" aria-label="Search or write a reason"
              style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', marginBottom: 12, border: '2px solid #378ADD', borderRadius: 'var(--radius)', fontSize: 15, background: 'var(--bg-secondary)', color: 'var(--text)', fontFamily: 'var(--font-sans)' }} />
            {/* Grouped points — Group → Reason: Points */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}>
              {(() => {
                // Group point types by their group field, or 'General' if none
                const groups = {}
                const q = pointSearch.trim().toLowerCase()
                pointTypes.filter(pt => !q || `${pt.label} ${pt.group || ''}`.toLowerCase().includes(q)).forEach(pt => {
                  const grp = pt.group || 'General'
                  if (!groups[grp]) groups[grp] = []
                  groups[grp].push(pt)
                })
                Object.values(groups).forEach(list => list.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' })))
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

              {/* Typed a reason that isn't in the list: use it (and optionally save it for next time) */}
              {pointSearch.trim() && !pointTypes.some(pt => pt.label.toLowerCase() === pointSearch.trim().toLowerCase()) && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '10px 12px', border: '1px dashed var(--border-strong)', borderRadius: 'var(--radius)' }}>
                  <div style={{ fontSize: 13 }}>New reason “<b>{pointSearch.trim()}</b>” — set the points, then press Award</div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <button type="button" className="btn btn-sm" aria-label="Fewer points" onClick={() => setCustomPoints(v => String((v === '' ? 5 : (parseInt(v) || 0)) - 1))}>−</button>
                    <input type="number" value={customPoints === '' ? 5 : customPoints} onChange={e => setCustomPoints(e.target.value)} aria-label="Points"
                      style={{ width: 64, padding: '7px 8px', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius)', fontSize: 14, fontWeight: 700, textAlign: 'center', background: 'var(--bg-secondary)', color: 'var(--text)' }} />
                    <button type="button" className="btn btn-sm" aria-label="More points" onClick={() => setCustomPoints(v => String((v === '' ? 5 : (parseInt(v) || 0)) + 1))}>+</button>
                  </div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-secondary)' }}>
                    <input type="checkbox" checked={saveNewReason} onChange={e => setSaveNewReason(e.target.checked)} />
                    Save to the reasons list for next time
                  </label>
                </div>
              )}

            </div>
            <div className="reg-award-bar" style={{ position: 'sticky', bottom: 0, background: 'var(--bg)', padding: '10px 0 14px', marginTop: 4, borderTop: awardList.length ? '1px solid var(--border)' : 'none', boxShadow: awardList.length ? '0 -8px 16px rgba(0,0,0,0.25)' : 'none' }}>
            {awardList.length > 0 && (
              <div style={{ background: 'var(--bg-secondary)', borderRadius: 'var(--radius)', padding: '10px 12px', marginBottom: 12, maxHeight: '28vh', overflowY: 'auto' }}>
                {awardList.map(p => (
                  <div key={p.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                    <span>{p.label}</span>
                    <span style={{ fontWeight: 600, color: p.points<0?'#a32d2d':'#1d9e75' }}>{p.points>0?'+':''}{p.points}</span>
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, fontWeight: 700, marginTop: 6, paddingTop: 6, borderTop: '1px solid var(--border)' }}>
                  <span>Total {multiAward ? `× ${selectedStudents.length}` : ''}</span>
                  <span style={{ color: awardTotal<0?'#a32d2d':'#1d9e75' }}>{awardTotal>0?'+':''}{awardTotal} pts</span>
                </div>
              </div>
            )}
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn" onClick={() => { setAwardingFor(null); setMultiAward(false); setSelectedPoints([]); setPointSearch('') }}>Cancel</button>
              <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }}
                onClick={async () => {
                  if (isNewReason && saveNewReason && !isNaN(newPts)) {
                    const next = [...pointTypes, { label: newLabel, points: newPts, group: 'Custom' }]
                    const { error } = await supabase.from('settings').update({ value: next }).eq('key', 'point_types')
                    if (error) alert('Awarding now, but could not save the new reason to the list: ' + error.message)
                    else setPointTypes(next)
                  }
                  setCustomPoints('')
                  submitPoints(multiAward ? selectedStudents : [awardingFor.id], awardList)
                }}
                disabled={saving || awardList.length === 0}>
                {saving ? 'Saving…' : `Award to ${multiAward ? selectedStudents.length + ' students' : awardingFor?.members?.first_name}`}
              </button>
            </div>
            </div>
          </div>
        </div>
        )
      })()}

      {/* Athlete register: Fighters list -- copy to paste to other coaches for matching */}
      {initialRegType && (
        <div className="reg-fighters">
          <button type="button" className="btn btn-sm reg-fighters-btn" aria-expanded={fightersMenuOpen} onClick={() => setFightersMenuOpen(v => !v)}>
            🥊 Fighters list
          </button>
          {fightersMenuOpen && (
            <div className="reg-fighters-menu" role="menu">
              <button type="button" role="menuitem" onClick={() => copyFightersList('name')}>Name order</button>
              <button type="button" role="menuitem" onClick={() => copyFightersList('age')}>Age order</button>
            </div>
          )}
          {fightersCopied && <div className="reg-fighters-toast" role="status">✓ {fightersCopied}</div>}
        </div>
      )}
    </div>
  )
}
