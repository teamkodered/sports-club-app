
function OneOffStudent({ displayStudents, onAdd, date }) {
  const [search, setSearch] = useState('')
  const [results, setResults] = useState([])
  const [added, setAdded] = useState([])

  useEffect(() => {
    if (search.length < 2) { setResults([]); return }
    const t = setTimeout(async () => {
      const { data: memberData } = await supabase
        .from('members').select('id, first_name, last_name')
        .or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%`).limit(8)
      if (!memberData?.length) { setResults([]); return }
      const { data: stuData } = await supabase
        .from('students').select('id, student_ref, pka_belt, house_name, member_id, members(first_name, last_name, houses(name))')
        .in('member_id', memberData.map(m => m.id))
      // Filter out students already in register
      const existing = new Set(displayStudents.map(s => s.id))
      const filtered = (stuData || []).filter(s => !existing.has(s.id) && !added.includes(s.id))
      setResults(filtered.map(s => ({ ...s, members: memberData.find(m => m.id === s.member_id) || s.members })))
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
import { useNavigate } from 'react-router-dom'
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
    <th onClick={() => onSort(col)} style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap', ...style }}>
      {label}<span style={{ marginLeft: 4, fontSize: 9, opacity: active ? 1 : 0.35 }}>{active ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}</span>
    </th>
  )
}

export default function Registers() {
  const { isAdmin, isCoach, isLeader, isStaff } = useAuth()
  const navigate = useNavigate()
  const [regType, setRegType]           = useState('class')
  const [date, setDate]                 = useState(new Date().toISOString().split('T')[0])
  const [classFilter, setClassFilter]   = useState('all')
  const [students, setStudents]         = useState([])
  const [todayClasses, setTodayClasses] = useState([])
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
  const [attendance, setAttendance]     = useState({})
  const [search, setSearch]             = useState('')
  const [sortKey, setSortKey]           = useState('first_name')
  const [sortDir, setSortDir]           = useState('asc')
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

  async function loadPointTypes() {
    const { data } = await supabase.from('settings').select('value').eq('key', 'point_types').single()
    setPointTypes(data?.value || [])
  }

  async function loadStudents() {
    setLoading(true)
    const disc = REGISTER_TYPES.find(r => r.key === regType)?.discipline || 'PKA'
    let query = supabase
      .from('students')
      .select('*, members(first_name, last_name, phone, email, date_of_birth, houses(name))')

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
      .from('classes').select('*').eq('discipline', disc).eq('active', true).order('start_time')

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
    setStudents(data || [])

    // Load today's check-ins from attendance table
    try {
      const { data: todayAtt } = await supabase
        .from('attendance')
        .select('student_id, attendance_type')
        .eq('session_date', date)
      if (todayAtt?.length) {
        const attMap = {}
        todayAtt.forEach(a => { attMap[a.student_id] = a.attendance_type === 'full_kit' ? 'full_kit' : 'attended' })
        setAttendance(attMap)
      }
    } catch(e) { console.error('Attendance load error:', e) }
    setLoading(false)
  }

  function toggleSort(key) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  function calcAge(dob) {
    if (!dob) return '—'
    return Math.floor((Date.now() - new Date(dob)) / (365.25 * 24 * 60 * 60 * 1000))
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

  const displayStudents = (regType === 'adhoc' ? adhocPills.map(p => students.find(s => s.id === p.id)).filter(Boolean) : students)
    .filter(s => {
      if (classFilter === 'all') return true

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
        case 'first_name':   aVal = am?.first_name || ''; bVal = bm?.first_name || ''; break
        case 'age':          aVal = am?.date_of_birth || ''; bVal = bm?.date_of_birth || ''; break
        case 'house':        aVal = am?.houses?.name || ''; bVal = bm?.houses?.name || ''; break
        case 'grade':        aVal = a.pka_belt || ''; bVal = b.pka_belt || ''; break
        case 'house_points': aVal = a.house_points || 0; bVal = b.house_points || 0; return sortDir === 'asc' ? aVal - bVal : bVal - aVal
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

  async function toggleAttendance(id) {
    setAttendance(prev => {
      const cur = prev[id] || 'none'
      const next = cur === 'none' ? 'attended' : cur === 'attended' ? 'full_kit' : 'none'
      // Save to attendance table
      if (next !== 'none') {
        supabase.from('attendance').insert({
          student_id: id,
          present: true,
          attendance_type: next,
          session_date: date,
          attended_at: new Date(date + 'T12:00:00').toISOString(),
        }).then(() => {})
      }
      return { ...prev, [id]: next }
    })
  }

  async function markAttendance(type) {
    if (selectedStudents.length === 0) return
    setSaving(true)

    const targets = displayStudents.filter(s => selectedStudents.includes(s.id))
    const newAtt = {}

    // Find matching point type for this attendance type
    const pointLabel = type === 'full_kit' ? 'Full Kit' : 'Attendance'
    const pt = pointTypes.find(p => p.label === pointLabel)
    const pts = pt ? pt.points : (type === 'full_kit' ? 2 : 1)

    for (const s of targets) {
      newAtt[s.id] = type

      // Log to attendance table
      await supabase.from('attendance').insert({
        student_id: s.id,
        present: true,
        late: false,
        attendance_type: type,
        session_date: date,
        attended_at: new Date(date + 'T12:00:00').toISOString(),
      })

      // Award points
      await supabase.from('points_log').insert({
        student_id: s.id, point_type: pointLabel,
        points_awarded: pts, point_scope: 'both',
        awarded_at: new Date(date).toISOString(),
      })
      await supabase.from('students').update({
        house_points: (s.house_points || 0) + pts,
        individual_points: (s.individual_points || 0) + pts,
      }).eq('id', s.id)

      const houseName = s.members?.houses?.name
      if (houseName) {
        const { data: house } = await supabase.from('houses').select('points').eq('name', houseName).single()
        if (house) await supabase.from('houses').update({ points: (house.points || 0) + pts }).eq('name', houseName)
      }
    }

    setAttendance(prev => ({ ...prev, ...newAtt }))
    setStudents(prev => prev.map(s =>
      selectedStudents.includes(s.id)
        ? { ...s, house_points: (s.house_points || 0) + pts, individual_points: (s.individual_points || 0) + pts }
        : s
    ))
    // Keep selection at current position - don't clear
    setSaving(false)
  }

  async function submitPoints(studentIds, points) {
    setSaving(true)
    const total = points.reduce((s, p) => s + p.points, 0)
    const isChamp = points.some(p => p.label === 'Class Champ')
    for (const sid of studentIds) {
      const s = students.find(x => x.id === sid)
      if (!s) continue
      for (const pt of points) {
        await supabase.from('points_log').insert({
          student_id: sid, point_type: pt.label,
          points_awarded: pt.points, point_scope: 'both',
          awarded_at: new Date(date).toISOString(),
        })
      }
      const updates = {
        house_points: (s.house_points || 0) + total,
        individual_points: (s.individual_points || 0) + total,
      }
      if (isChamp) updates.class_champion_count = (s.class_champion_count || 0) + 1
      await supabase.from('students').update(updates).eq('id', sid)
      const houseName = s.members?.houses?.name
      if (houseName && total > 0) {
        const { data: house } = await supabase.from('houses').select('points').eq('name', houseName).single()
        if (house) await supabase.from('houses').update({ points: (house.points || 0) + total }).eq('name', houseName)
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
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <div className="page-header" style={{ marginBottom: 0 }}>
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

      {/* Quick attendance + search + select row */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search students…"
          style={{ flex: 1, minWidth: 160, padding: '7px 10px', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius)', fontSize: 13, background: 'var(--bg-secondary)', color: 'var(--text)' }} />
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
          <table style={{ minWidth: isKR ? 900 : 680 }}>
            <thead>
              <tr>
                {visibleCols.includes('checkbox') && <th style={{ width: 32, paddingLeft: 12 }}></th>}
                {visibleCols.includes('student_ref') && <SortTh col="student_ref" label="ID" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />}
                {visibleCols.includes('name')        && <SortTh col="first_name" label="Name" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />}
                {visibleCols.includes('age')         && <SortTh col="age" label="Age" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />}
                {visibleCols.includes('house')       && <SortTh col="house" label="House" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />}
                {visibleCols.includes('grade')       && <SortTh col="grade" label="Grade" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />}
                {visibleCols.includes('class_time')  && <th>Class time</th>}
                {isKR && <><th>Experience</th><th>Discipline</th><th>Weight</th><th>Age cat.</th></>}
                {visibleCols.includes('groups')      && <th>Groups</th>}
                {visibleCols.includes('attendance')  && <th style={{ textAlign: 'center' }}>
                  <div>Attend.</div>
                  <div style={{ fontSize: 9, fontWeight: 400, color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>
                    ✓{Object.keys(attendance).filter(id => attendance[id] && attendance[id] !== 'none').length}/{displayStudents.length}
                    {' '}kit:{Object.values(attendance).filter(v => v === 'full_kit').length}
                  </div>
                </th>}
                {visibleCols.includes('champ')       && <th style={{ textAlign: 'center' }}>🏆</th>}
                {visibleCols.includes('media')       && <th style={{ textAlign: 'center' }}>Media</th>}
                {visibleCols.includes('points')      && <SortTh col="house_points" label="Pts" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} style={{ textAlign: 'center' }} />}
                {isAdmin && <th></th>}
              </tr>
            </thead>
            <tbody>
              {displayStudents.length === 0 ? (
                <tr><td colSpan={12} style={{ textAlign: 'center', padding: 40, color: 'var(--text-tertiary)' }}>No students found</td></tr>
              ) : displayStudents.map((s, idx) => {
                const m = s.members
                const houseName = m?.houses?.name
                const colour = HOUSE_COLOURS[houseName] || '#888'
                const age = calcAge(m?.date_of_birth)
                const isSelected = selectedStudents.includes(s.id)
                const attendState = attendance[s.id] || 'none'
                const groups = [s.is_kr&&'KR', s.is_pts&&'PTs', s.is_leader&&'Leader', s.is_coach&&'Coach'].filter(Boolean)

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
                    {visibleCols.includes('name') && <td onClick={e => e.stopPropagation()}>
                      <a href={`/athletes?id=${s.id}`}
                        style={{ color: 'var(--text)', fontWeight: 500, fontSize: 13, textDecoration: 'none', cursor: 'pointer' }}>
                        {m?.first_name} {m?.last_name}
                      </a>
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
                    {visibleCols.includes('groups') && <td onClick={e => e.stopPropagation()}>
                      <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                        {groups.length > 0 ? groups.map(g => (
                          <span key={g} className={`badge ${g==='KR'?'badge-purple':g==='PTs'?'badge-blue':g==='Leader'?'badge-green':'badge-amber'}`} style={{ fontSize: 9 }}>{g}</span>
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
                    {visibleCols.includes('champ') && <td style={{ textAlign: 'center', fontWeight: 600, fontSize: 13 }}>
                      {s.class_champion_count > 0 ? `🏆 ${s.class_champion_count}` : <span style={{ color: 'var(--text-tertiary)' }}>0</span>}
                    </td>}
                    {visibleCols.includes('media') && <td style={{ textAlign: 'center' }}>
                      <span className={`badge ${s.media_restriction==='No'?'badge-red':s.media_restriction==='Limited'?'badge-amber':'badge-green'}`} style={{ fontSize: 10 }}>
                        {s.media_restriction==='No'?'⚠ No':s.media_restriction==='Limited'?'Limited':'OK'}
                      </span>
                    </td>}
                    {visibleCols.includes('points') && <td style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 11, lineHeight: 1.4 }}>
                        <div><span style={{ color: 'var(--text-tertiary)', fontSize: 10 }}>H </span><strong>{s.house_points || 0}</strong></div>
                        <div><span style={{ color: 'var(--text-tertiary)', fontSize: 10 }}>I </span><strong>{s.individual_points || 0}</strong></div>
                      </div>
                    </td>}
                    {isAdmin && (
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
              ['House', contactModal.members?.houses?.name || '—'],
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
              <button className="btn" style={{ flex: 1, justifyContent: 'center' }} onClick={() => { setContactModal(null); navigate(`/athletes?id=${contactModal.id}`) }}>View profile →</button>
            </div>
          </div>
        </div>
      )}

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
