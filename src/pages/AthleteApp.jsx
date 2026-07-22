import { useEffect, useState, useRef } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import { supabasePublic } from '../lib/supabasePublic.js'
import { useAuth } from '../hooks/useAuth.jsx'

const HOUSE_COLOURS = {
  'Dragon House': '#E24B4A', 'Super House': '#378ADD',
  'Ice House': '#1D9E75', 'Jet House': '#EF9F27',
}

function getSubTypeOptions(sorted, key) {
  try {
    if (key === 'running') return [...new Set(sorted.map(s => s.running?.category).filter(Boolean))]
    if (key === 'watt_bike') return [...new Set(sorted.map(s => s.watt_bike?.interval_mode || s.watt_bike?.type).filter(Boolean))]
    if (key === 'bodyweight') return [...new Set(sorted.map(s => s.bodyweight?.type).filter(Boolean))]
    if (key === 'test') return [...new Set(sorted.flatMap(s => Object.keys(s.test || {})))]
    if (key === 'techniques') return [...new Set(sorted.map(s => s.techniques?.type).filter(Boolean))]
    return []
  } catch (e) { return [] }
}

function computeModuleStats(sorted, key, subType) {
  try {
    let entries = [], unit = '', higherIsBetter = true
    const numSets = arr => Array.isArray(arr) ? arr.map(v => parseFloat((v && typeof v === 'object') ? v.wattage : v)).filter(v => !isNaN(v)) : []
    if (key === 'running') {
      const filtered = sorted.filter(s => !subType || s.running?.category === subType)
      entries = filtered.filter(s => Array.isArray(s.running?.sets) && s.running.sets.length > 0)
        .map(s => ({ date: s.session_date, value: s.running.sets[s.running.sets.length - 1] }))
      higherIsBetter = subType === 'Distance over time'
    } else if (key === 'watt_bike') {
      const filtered = sorted.filter(s => !subType || (s.watt_bike?.interval_mode || s.watt_bike?.type) === subType)
      entries = filtered.map(s => ({ date: s.session_date, value: numSets(s.watt_bike?.sets).length ? Math.max(...numSets(s.watt_bike?.sets)) : null })).filter(e => e.value != null)
      unit = 'W'
    } else if (key === 'bodyweight') {
      const filtered = sorted.filter(s => !subType || s.bodyweight?.type === subType)
      entries = filtered.map(s => ({ date: s.session_date, value: numSets(s.bodyweight?.sets).length ? Math.max(...numSets(s.bodyweight?.sets)) : null })).filter(e => e.value != null)
      unit = ' reps'
    } else if (key === 'test') {
      entries = subType ? sorted.filter(s => s.test?.[subType] != null).map(s => ({ date: s.session_date, value: s.test[subType] })) : []
      higherIsBetter = !['200m sprint', '1600m time trial', '4800m time trial'].includes(subType)
    } else if (key === 'techniques') {
      const filtered = sorted.filter(s => !subType || s.techniques?.type === subType)
      entries = filtered.map(s => ({ date: s.session_date, value: numSets(s.techniques?.sets).length ? Math.max(...numSets(s.techniques?.sets)) : null })).filter(e => e.value != null)
    }
    const mostRecent = entries[entries.length - 1] || null
    const pb = entries.reduce((best, e) => !best ? e : ((higherIsBetter ? e.value > best.value : e.value < best.value) ? e : best), null)
    return { mostRecent, pb, unit }
  } catch (e) { return { mostRecent: null, pb: null, unit: '' } }
}

function computeLastLogged(sorted, key) {
  try {
    const entries = sorted.filter(s => key === 'stretch' ? s.stretch_flows?.some?.(Boolean) : s.eye_training)
    return entries.length ? { count: entries.length, lastDate: entries[entries.length - 1].session_date } : { count: 0, lastDate: null }
  } catch (e) { return { count: 0, lastDate: null } }
}

// Defined at module scope (not inside the page component's render) so
// React treats it as a stable component across renders, rather than
// unmounting/remounting it every time the parent re-renders.
function ModuleButton({ b, sorted, moduleSubType, setModuleSubType, colour, setTab }) {
  const subTypeOptions = getSubTypeOptions(sorted, b.key)
  const currentSubType = moduleSubType[b.key] ?? subTypeOptions[0] ?? null
  const noNumericStat = b.key === 'stretch' || b.key === 'eye_training'
  const { mostRecent, pb, unit } = noNumericStat ? { mostRecent: null, pb: null, unit: '' } : computeModuleStats(sorted, b.key, currentSubType)
  const lastLogged = noNumericStat ? computeLastLogged(sorted, b.key) : null

  const pressTimer = useRef(null)
  const longPressed = useRef(false)
  const startPos = useRef({ x: 0, y: 0 })
  const scrolled = useRef(false)

  function getPoint(e) { return e.touches ? e.touches[0] : e }
  function startPress(e) {
    longPressed.current = false
    scrolled.current = false
    const p = getPoint(e)
    startPos.current = { x: p.clientX, y: p.clientY }
    if (!subTypeOptions.length) return
    pressTimer.current = setTimeout(() => {
      if (scrolled.current) return
      longPressed.current = true
      const idx = subTypeOptions.indexOf(currentSubType)
      const next = subTypeOptions[(idx + 1) % subTypeOptions.length]
      setModuleSubType(prev => ({ ...prev, [b.key]: next }))
      if (navigator.vibrate) navigator.vibrate(15)
    }, 500)
  }
  function moved(e) {
    const p = getPoint(e)
    const dx = Math.abs(p.clientX - startPos.current.x)
    const dy = Math.abs(p.clientY - startPos.current.y)
    if (dx > 8 || dy > 8) { scrolled.current = true; clearTimeout(pressTimer.current) }
  }
  function endPress() {
    clearTimeout(pressTimer.current)
    if (!longPressed.current && !scrolled.current) setTab('fit2fight')
  }
  function cancelPress() { clearTimeout(pressTimer.current) }

  return (
    <button
      onMouseDown={startPress} onMouseMove={moved} onMouseUp={endPress} onMouseLeave={cancelPress}
      onTouchStart={startPress} onTouchMove={moved} onTouchEnd={endPress} onTouchCancel={cancelPress}
      style={{
        display: 'flex', flexDirection: 'column', gap: 4, padding: '10px 10px', width: '100%',
        background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius)',
        cursor: 'pointer', userSelect: 'none', WebkitUserSelect: 'none', textAlign: 'center', fontFamily: 'var(--font-sans)',
        touchAction: 'pan-y',
      }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
        {!noNumericStat && (
          <div style={{ textAlign: 'center', minWidth: 30 }}>
            <div style={{ fontSize: 9, color: 'var(--text-tertiary)' }}>Recent</div>
            <div style={{ fontSize: 11, fontWeight: 700 }}>{mostRecent ? `${mostRecent.value}${unit}` : '—'}</div>
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, flex: 1 }}>
          <span style={{ fontSize: 18 }}>{b.icon}</span>
          <span style={{ fontSize: 10, fontWeight: 500, whiteSpace: 'nowrap' }}>{b.label}</span>
        </div>
        {!noNumericStat && (
          <div style={{ textAlign: 'center', minWidth: 30 }}>
            <div style={{ fontSize: 9, color: 'var(--text-tertiary)' }}>🏅 PB</div>
            <div style={{ fontSize: 11, fontWeight: 700, color: colour }}>{pb ? `${pb.value}${unit}` : '—'}</div>
          </div>
        )}
      </div>
      {noNumericStat && (
        <div style={{ fontSize: 9, color: 'var(--text-tertiary)' }}>
          {lastLogged.count > 0 ? `Logged ${lastLogged.count}× · last ${new Date(lastLogged.lastDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : 'Not logged yet'}
        </div>
      )}
      {currentSubType && <div style={{ fontSize: 8, color, fontWeight: 600 }}>{currentSubType}</div>}
      {subTypeOptions.length > 1 && <div style={{ fontSize: 7, color: 'var(--text-tertiary)' }}>hold to change</div>}
    </button>
  )
}

const PDP_SECTIONS = [
  { key: 'winning_ways',        label: '🏆 Winning ways',         colour: '#1D9E75' },
  { key: 'maintain',            label: '✅ Maintain',              colour: '#378ADD' },
  { key: 'to_work_on',          label: '🎯 To work on',            colour: '#EF9F27' },
  { key: 'psychology_maintain', label: '🧠 Psychology — maintain', colour: '#8B5CF6' },
  { key: 'psychology_work_on',  label: '🧠 Psychology — work on',  colour: '#7C3AED' },
  { key: 'tech_maintain',       label: '⚙️ Technical — maintain',  colour: '#378ADD' },
  { key: 'tech_work_on',        label: '⚙️ Technical — work on',   colour: '#EF9F27' },
  { key: 'tact_maintain',       label: '🎯 Tactical — maintain',   colour: '#1D9E75' },
  { key: 'tact_work_on',        label: '🎯 Tactical — work on',    colour: '#E24B4A' },
  { key: 'physical_maintain',   label: '💪 Physical — maintain',   colour: '#1D9E75' },
  { key: 'physical_work_on',    label: '💪 Physical — work on',    colour: '#059669' },
  { key: 'athlete_notes',       label: '📝 My notes',              colour: '#185FA5' },
]

export default function AthleteApp() {
  const { profile } = useAuth()
  const [tab, setTab]           = useState('home')
  const [checkingIn, setCheckingIn]   = useState(false)
  const [checkedInMsg, setCheckedInMsg] = useState(null)
  const [student, setStudent]   = useState(null)
  const [houses, setHouses] = useState([])
  const [rankList, setRankList] = useState([])
  const [truePointTotals, setTruePointTotals] = useState({})
  const [showContribution, setShowContribution] = useState(false)
  const [showOverallPos, setShowOverallPos] = useState(false)
  const [apData, setApData]     = useState(null)
  const [points, setPoints]     = useState([])
  const [sessions, setSessions] = useState([])
  const [attendanceData, setAttendanceData] = useState([])
  const [allAttendance, setAllAttendance] = useState([])
  const [f2fStatsScope, setF2fStatsScope] = useState(0)
  const [moduleSubType, setModuleSubType] = useState({})
  const [loading, setLoading]   = useState(true)
  const [editNote, setEditNote] = useState(false)
  const [noteText, setNoteText] = useState('')
  const [saving, setSaving]     = useState(false)

  useEffect(() => {
    if (profile) load()
    else if (profile === null) setLoading(false)
  }, [profile])

  async function load() {
    try {
      const { data: sRows } = await supabase
        .from('students')
        .select('*, members(first_name, last_name, date_of_birth, email, phone, houses(name))')
        .eq('member_id', profile.id)
        .limit(1)
      const s = sRows?.[0] || null
      setStudent(s)
      if (s) {
        const [{ data: ap }, { data: pts }, { data: sess }, { data: myAtt }] = await Promise.all([
          supabase.from('athlete_profiles').select('*').eq('student_id', s.id).limit(1),
          supabase.from('points_log').select('*').eq('student_id', s.id).order('awarded_at', { ascending: false }).limit(20),
          supabase.from('fit2fight_sessions').select('*').eq('student_id', s.id).order('session_date', { ascending: false }),
          supabase.from('attendance').select('*').eq('student_id', s.id).order('session_date', { ascending: false }),
        ])
        setApData(ap?.[0] || null)
        setPoints(pts || [])
        setSessions(sess || [])
        setAttendanceData(myAtt || [])

        const { data: allAtt } = await supabase.from('attendance')
          .select('student_id, session_date, attendance_type, students(discipline, class_schedule, class_time)')
        setAllAttendance(allAtt || [])

        const [{ data: houseData }, { data: rankData }] = await Promise.all([
          supabase.from('houses').select('id, name, points').order('points', { ascending: false }),
          supabase.from('students').select('id, house_points, members(houses(name))')
            .or('is_kr.eq.true,is_pts.eq.true,discipline.eq.KRBA'),
        ])
        setHouses(houseData || [])
        setRankList(rankData || [])

        if (rankData?.length) {
          const { data: ptsLog } = await supabase.from('points_log').select('student_id, points_awarded')
            .in('student_id', rankData.map(r => r.id))
          const totals = {}
          ;(ptsLog || []).forEach(p => { totals[p.student_id] = (totals[p.student_id] || 0) + (p.points_awarded || 0) })
          setTruePointTotals(totals)
        }
      }
    } catch(e) {
      console.error('AthleteApp load error:', e)
    }
    setLoading(false)
  }

  async function saveNote(text) {
    if (!student) return
    setSaving(true)
    const current = apData?.pdp_notes || {}
    const updated = { ...current, athlete_notes: text ? [text] : [] }
    await supabase.from('athlete_profiles')
      .upsert({ student_id: student.id, pdp_notes: updated }, { onConflict: 'student_id' })
    setApData(a => ({ ...(a || {}), pdp_notes: updated }))
    setEditNote(false)
    setSaving(false)
  }

  async function checkInNow(attendanceType) {
    if (!student) return
    setCheckingIn(true)
    const { error } = await supabase.from('attendance').insert({
      student_id: student.id,
      present: true,
      late: false,
      attendance_type: attendanceType,
      session_date: new Date().toISOString().split('T')[0],
      attended_at: new Date().toISOString(),
    })
    if (error) {
      alert('Error checking in: ' + error.message)
    } else {
      setCheckedInMsg(attendanceType === 'full_kit' ? '✓ Checked in — Full Kit!' : '✓ Checked in!')
      setTimeout(() => setCheckedInMsg(null), 4000)
    }
    setCheckingIn(false)
  }

  if (loading) return <div className="loading">Loading…</div>

  // Safe values - all null-safe
  const m         = student?.members || null
  const houseName = student?.house_name || m?.houses?.name || null
  const colour    = HOUSE_COLOURS[houseName] || '#378ADD'
  const initials  = m ? `${m.first_name?.[0] || ''}${m.last_name?.[0] || ''}`.toUpperCase() : '?'
  const age       = m?.date_of_birth ? Math.floor((Date.now() - new Date(m.date_of_birth)) / (365.25*24*60*60*1000)) : null
  const totalPts  = Array.isArray(points) ? points.reduce((s, p) => s + (p?.points_awarded || 0), 0) : 0
  const shared    = apData?.pdp_shared || {}
  const pdp       = apData?.pdp_notes || {}

  let houseRank = null, houseTotalPoints = null, contributionPct = null, positionInHouse = null, overallPosition = null
  try {
    const safeHouses = Array.isArray(houses) ? houses : []
    const safeRankList = Array.isArray(rankList) ? rankList : []
    const sortedHouses = [...safeHouses].sort((a, b) => (b?.points || 0) - (a?.points || 0))
    houseRank = houseName ? sortedHouses.findIndex(h => h?.name === houseName) + 1 : null
    houseTotalPoints = houseName ? (sortedHouses.find(h => h?.name === houseName)?.points || 0) : null
    contributionPct = (houseTotalPoints && student?.house_points)
      ? ((student.house_points / houseTotalPoints) * 100).toFixed(1) : null
    const sameHouseSorted = safeRankList
      .filter(s => s?.members?.houses?.name === houseName)
      .sort((a, b) => (b?.house_points || 0) - (a?.house_points || 0))
    positionInHouse = student ? sameHouseSorted.findIndex(s => s?.id === student.id) + 1 : null
    const safeTotals = truePointTotals || {}
    const overallSorted = [...safeRankList].sort((a, b) => (safeTotals[b?.id] || 0) - (safeTotals[a?.id] || 0))
    overallPosition = student ? overallSorted.findIndex(s => s?.id === student.id) + 1 : null
  } catch (e) {
    console.error('AthleteApp header calc error:', e)
  }

  const TABS = [
    ['home',      '🏠 Home'],
    ['pdp',       '🎯 My PDP'],
    ['analysis',  '📊 Analysis'],
    ['fit2fight', '💪 Fit II Fight'],
    ['points',    '⭐ Points'],
    ['search',    '🔍 Find athlete'],
  ]

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: '20px 16px', minHeight: '100vh' }}>

      {/* Profile header */}
      <div className="card" style={{ marginBottom: 12, borderLeft: `4px solid ${colour}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ width: 64, height: 64, borderRadius: '50%', background: colour + '22', color: colour, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 700, flexShrink: 0 }}>
            {initials}
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            {student ? (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {positionInHouse > 0 && (
                    <button onClick={() => setShowOverallPos(v => !v)}
                      title={showOverallPos ? 'Showing overall position — tap for position in house' : 'Showing position in house — tap for overall position'}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 15, fontWeight: 700, color: colour }}>
                      #{showOverallPos ? overallPosition : positionInHouse}
                    </button>
                  )}
                  <div style={{ fontSize: 20, fontWeight: 700 }}>{m?.first_name} {m?.last_name}</div>
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 3 }}>
                  {student.student_ref} · {student.discipline}{age ? ` · Age ${age}` : ''}{student.pka_belt || student.krba_level ? ` · ${student.pka_belt || student.krba_level}` : ''}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, fontSize: 13 }}>
                  {houseRank > 0 && <span style={{ color: 'var(--text-tertiary)', fontWeight: 600 }}>#{houseRank}</span>}
                  <span style={{ color: colour, fontWeight: 600 }}>{houseName || '—'}</span>
                  {houseTotalPoints != null && <span style={{ color: 'var(--text-tertiary)' }}>({houseTotalPoints} pts)</span>}
                  {student.house_points != null && (
                    <button onClick={() => setShowContribution(v => !v)}
                      title={showContribution ? 'Showing % contribution to house — tap to show points' : 'Showing house points — tap to show % contribution'}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginLeft: 6, fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', textDecoration: 'underline dotted' }}>
                      {showContribution ? `${contributionPct ?? 0}% of house` : `${student.house_points} house pts`}
                    </button>
                  )}
                </div>
              </>
            ) : (
              <>
                <div style={{ fontSize: 16, fontWeight: 600 }}>{profile?.first_name} {profile?.last_name}</div>
                <div style={{ fontSize: 12, color: '#EF9F27', marginTop: 2 }}>No student record linked — ask your coach</div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="hide-scrollbar" style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: 14, overflowX: 'auto' }}>
        {TABS.map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)} style={{
            padding: '10px 14px', fontSize: 13, border: 'none', background: 'none', cursor: 'pointer',
            borderBottom: `2px solid ${tab === key ? colour : 'transparent'}`,
            color: tab === key ? 'var(--text)' : 'var(--text-secondary)',
            fontWeight: tab === key ? 600 : 400, whiteSpace: 'nowrap',
          }}>{label}</button>
        ))}
      </div>

      {/* ── Home ── */}
      {tab === 'home' && (
        <div>
          {student ? (
            <>
              {(() => {
               try {
                const sorted = [...sessions].sort((a,b) => new Date(a.session_date) - new Date(b.session_date))
                const scopeOptions = ['All sessions', student.discipline, [student.class_schedule, student.class_time].filter(Boolean).join(' ')]
                  .filter(Boolean).filter((v, i, a) => a.indexOf(v) === i)
                const scopeLen = scopeOptions.length || 1
                const scopeLabel = scopeOptions[((f2fStatsScope % scopeLen) + scopeLen) % scopeLen] || 'All sessions'
                const matchesScope = att => {
                  if (scopeLabel === 'All sessions') return true
                  if (scopeLabel === student.discipline) return att?.students?.discipline === student.discipline
                  return att?.students?.class_schedule === student.class_schedule && att?.students?.class_time === student.class_time
                }
                const possibleSessions = new Set((allAttendance || []).filter(matchesScope).map(a => a?.session_date)).size

                const modules = [
                  { key: 'running',    label: 'Running',       icon: '🏃' },
                  { key: 'watt_bike',  label: 'Watt bike',     icon: '🚴' },
                  { key: 'bodyweight', label: 'Bodyweight',    icon: '💪' },
                  { key: 'stretch',    label: 'Stretch flows', icon: '🤸' },
                  { key: 'test',       label: 'Test',          icon: '📋' },
                  { key: 'techniques',   label: 'Techniques',   icon: '🥋' },
                  { key: 'eye_training', label: 'Eye training', icon: '👁' },
                ]

                return (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 8 }}>
                      <div className="card" style={{ textAlign: 'center', padding: '10px 4px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
                        <button onClick={() => setF2fStatsScope(v => v - 1)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: 'var(--text-tertiary)', padding: 4 }}>◀</button>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 20, marginBottom: 2 }}>✅</div>
                          <div style={{ fontSize: 19, fontWeight: 700, color: colour }}>{attendanceData.length}/{possibleSessions || attendanceData.length}</div>
                          <div style={{ fontSize: 9, color: 'var(--text-secondary)' }}>{scopeLabel}</div>
                        </div>
                        <button onClick={() => setF2fStatsScope(v => v + 1)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: 'var(--text-tertiary)', padding: 4 }}>▶</button>
                      </div>
                      <button onClick={() => setTab('fit2fight')} className="card" style={{ textAlign: 'center', padding: '12px 8px', cursor: 'pointer', width: '100%', fontFamily: 'var(--font-sans)', background: 'var(--bg)', appearance: 'none', WebkitAppearance: 'none' }}>
                        <div style={{ fontSize: 22, marginBottom: 4 }}>📈</div>
                        <div style={{ fontSize: 22, fontWeight: 700, color: '#378ADD' }}>{sessions.length}</div>
                        <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>F2F sessions</div>
                      </button>
                      <button onClick={() => setTab('pdp')} className="card" style={{ textAlign: 'center', padding: '12px 8px', cursor: 'pointer', width: '100%', fontFamily: 'var(--font-sans)', background: 'var(--bg)', appearance: 'none', WebkitAppearance: 'none' }}>
                        <div style={{ fontSize: 22, marginBottom: 4 }}>🎯</div>
                        <div style={{ fontSize: 22, fontWeight: 700, color: '#EF9F27' }}>
                          {Object.entries(apData?.pdp_notes || {}).filter(([k]) => !k.startsWith('__')).reduce((sum, [, v]) => sum + (Array.isArray(v) ? v.length : 0), 0)}
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>PDP</div>
                      </button>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 8 }}>
                      {modules.map(b => <ModuleButton key={b.key} b={b} sorted={sorted} moduleSubType={moduleSubType} setModuleSubType={setModuleSubType} colour={colour} setTab={setTab} />)}
                    </div>

                    <div className="card" style={{ padding: 0, marginBottom: 14 }}>
                      <div style={{ padding: '10px 14px', fontWeight: 600, fontSize: 13, borderBottom: '1px solid var(--border)' }}>Profile</div>
                      {[
                        ['Discipline', student.discipline_codes || student.discipline || '—'],
                        [student.discipline === 'KRBA' ? 'Level' : student.is_kr ? 'Experience' : 'Grade',
                          student.discipline === 'KRBA' ? (student.krba_level || '—') : student.is_kr ? (student.competition_team || '—') : (student.pka_belt || '—')],
                        ['Weight', student.weight_kg ? `${student.weight_kg}kg${student.weight_category ? ` (${student.weight_category})` : ''}` : '—'],
                        ['Comp weight', apData?.weight_division || '—'],
                        ['Groups', [student.is_kr && 'KR', student.is_pts && 'PTs', student.is_leader && 'Leader', student.is_coach && 'Coach'].filter(Boolean).join(', ') || 'None'],
                      ].map(([label, val], i, arr) => (
                        <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 14px', borderBottom: i < arr.length - 1 ? '1px solid var(--border)' : 'none', fontSize: 13 }}>
                          <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
                          <span style={{ fontWeight: 500, textAlign: 'right' }}>{val}</span>
                        </div>
                      ))}
                    </div>

                    {apData && (apData.age_division_kickboxing || apData.age_division_boxing || apData.weight_division || apData.top_achievements || (Array.isArray(apData.recent_results) && apData.recent_results.length > 0)) && (
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                        {(apData.age_division_kickboxing || apData.age_division_boxing || apData.weight_division || apData.kode_red_debut) && (
                          <div className="card">
                            <h3 style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, color: colour }}>Competition divisions</h3>
                            {[
                              ['Kickboxing', apData.age_division_kickboxing],
                              ['Boxing', apData.age_division_boxing],
                              ['Weight division', apData.weight_division],
                              ['Kode Red debut', apData.kode_red_debut],
                            ].map(([l, v]) => v && (
                              <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                                <span style={{ color: 'var(--text-secondary)' }}>{l}</span>
                                <span style={{ fontWeight: 500 }}>{v}</span>
                              </div>
                            ))}
                          </div>
                        )}
                        {apData.top_achievements && (
                          <div className="card" style={{ gridColumn: '1/-1' }}>
                            <h3 style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: colour }}>🏆 Top achievements</h3>
                            <p style={{ fontSize: 13, lineHeight: 1.6 }}>{apData.top_achievements}</p>
                          </div>
                        )}
                        {Array.isArray(apData.recent_results) && apData.recent_results.length > 0 && (
                          <div className="card" style={{ gridColumn: '1/-1' }}>
                            <h3 style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Recent results</h3>
                            {apData.recent_results.map((r, i) => (
                              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                                <span style={{ fontSize: 16 }}>🎖</span>{r}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {points.length > 0 && (
                      <div className="card" style={{ padding: 0, marginBottom: 14 }}>
                        <div style={{ padding: '10px 14px', fontWeight: 600, fontSize: 13, borderBottom: '1px solid var(--border)' }}>Recent points</div>
                        <table><tbody>
                          {points.slice(0,5).map((p,i) => (
                            <tr key={i}>
                              <td style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{new Date(p.awarded_at).toLocaleDateString('en-GB')}</td>
                              <td style={{ fontSize: 13 }}>{p.point_type}</td>
                              <td style={{ textAlign: 'right', fontWeight: 700, color: p.points_awarded < 0 ? '#a32d2d' : '#1d9e75' }}>{p.points_awarded > 0 ? '+' : ''}{p.points_awarded}</td>
                            </tr>
                          ))}
                        </tbody></table>
                      </div>
                    )}
                    {checkedInMsg ? (
                      <div className="card" style={{ textAlign: 'center', padding: 12, background: '#1D9E7515', border: '1px solid #1D9E7530', color: '#1D9E75', fontWeight: 600, fontSize: 14 }}>
                        {checkedInMsg}
                      </div>
                    ) : (
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center', padding: 12, fontSize: 14 }}
                          onClick={() => checkInNow('attended')} disabled={checkingIn}>
                          ✅ Check in
                        </button>
                        <button className="btn" style={{ flex: 1, justifyContent: 'center', padding: 12, fontSize: 14 }}
                          onClick={() => checkInNow('full_kit')} disabled={checkingIn}>
                          ✅ Full Kit
                        </button>
                      </div>
                    )}
                  </>
                )
               } catch (e) {
                 console.error('Home tab render error:', e)
                 return (
                   <div className="card" style={{ textAlign: 'center', padding: 20 }}>
                     <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8 }}>
                       Something didn't load correctly here. Try refreshing the app.
                     </p>
                     <p style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: 'monospace', wordBreak: 'break-word' }}>
                       {e?.message || String(e)}
                     </p>
                   </div>
                 )
               }
              })()}

            </>
          ) : (
            <div className="card" style={{ textAlign: 'center', padding: 32 }}>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>Your account isn't linked to a student record yet.</p>
              <button className="btn btn-primary" onClick={() => setTab('search')}>🔍 Find your profile</button>
            </div>
          )}
        </div>
      )}

      {/* ── PDP ── */}
      {tab === 'pdp' && (
        <div>
          {!student ? <p style={{ color: 'var(--text-secondary)' }}>No student record linked.</p> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {!PDP_SECTIONS.some(section => section.key !== 'athlete_notes' && (shared[section.key] || []).length > 0) && (
                <div className="card" style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '20px 16px' }}>
                  <div style={{ fontSize: 24, marginBottom: 6 }}>🎯</div>
                  <p style={{ fontSize: 13, fontWeight: 500, marginBottom: 2 }}>No PDP added yet</p>
                  <p style={{ fontSize: 12 }}>Your coach hasn't shared any development plan notes for you yet — check back after your next assessment.</p>
                </div>
              )}
              {PDP_SECTIONS.map(section => {
                const items = section.key === 'athlete_notes' ? (pdp.athlete_notes || []) : (shared[section.key] || [])
                if (section.key !== 'athlete_notes' && !items.length) return null
                return (
                  <div key={section.key} className="card" style={{ borderLeft: `3px solid ${section.colour}` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <h3 style={{ fontSize: 13, fontWeight: 600, color: section.colour, margin: 0 }}>{section.label}</h3>
                      {section.key === 'athlete_notes' && (
                        <button className="btn btn-sm" style={{ fontSize: 10 }} onClick={() => { setEditNote(true); setNoteText(items[0] || '') }}>
                          {items.length ? 'Edit' : '+ Add'}
                        </button>
                      )}
                    </div>
                    {editNote && section.key === 'athlete_notes' ? (
                      <div>
                        <textarea rows={4} value={noteText} onChange={e => setNoteText(e.target.value)}
                          style={{ width: '100%', padding: '8px', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius)', fontSize: 13, resize: 'vertical', background: 'var(--bg-secondary)', color: 'var(--text)' }} />
                        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                          <button className="btn btn-sm" onClick={() => setEditNote(false)}>Cancel</button>
                          <button className="btn btn-primary btn-sm" onClick={() => saveNote(noteText)} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {items.length > 0 ? items.map((item, i) => (
                          <span key={i} style={{ background: section.colour + '15', color: section.colour, borderRadius: 20, padding: '4px 10px', fontSize: 12 }}>{item}</span>
                        )) : <span style={{ fontSize: 12, color: 'var(--text-tertiary)', fontStyle: 'italic' }}>No notes yet</span>}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Analysis ── */}
      {tab === 'analysis' && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Link to="/kickboxing-tpt" className="card" style={{ textDecoration: 'none', textAlign: 'center', padding: 20, color: '#378ADD' }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>📊</div>
              <div style={{ fontWeight: 600 }}>Kickboxing TPT</div>
            </Link>
            <Link to="/boxing-tpt" className="card" style={{ textDecoration: 'none', textAlign: 'center', padding: 20, color: '#E24B4A' }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>📊</div>
              <div style={{ fontWeight: 600 }}>Boxing TPT</div>
            </Link>
            <Link to="/grading" className="card" style={{ textDecoration: 'none', textAlign: 'center', padding: 20, color: '#1D9E75' }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>🎽</div>
              <div style={{ fontWeight: 600 }}>Grading</div>
            </Link>
          </div>
        </div>
      )}

      {/* ── Fit II Fight ── */}
      {tab === 'fit2fight' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{sessions.length} sessions</p>
            <Link to="/fit2fight" className="btn btn-primary btn-sm">+ Log session</Link>
          </div>
          {sessions.length === 0 ? (
            <div className="empty-state"><h3>No sessions yet</h3></div>
          ) : (
            <div className="card" style={{ padding: 0 }}>
              <table>
                <thead><tr><th>Date</th><th style={{ textAlign: 'center' }}>Before</th><th style={{ textAlign: 'center' }}>After</th><th style={{ textAlign: 'center' }}>Change</th></tr></thead>
                <tbody>
                  {sessions.map((s,i) => {
                    const wc = s.weight_before && s.weight_after ? (parseFloat(s.weight_after) - parseFloat(s.weight_before)).toFixed(1) : null
                    return (
                      <tr key={i}>
                        <td style={{ fontSize: 12 }}>{new Date(s.session_date).toLocaleDateString('en-GB')}</td>
                        <td style={{ textAlign: 'center', fontSize: 13 }}>{s.weight_before ? `${s.weight_before}kg` : '—'}</td>
                        <td style={{ textAlign: 'center', fontSize: 13 }}>{s.weight_after  ? `${s.weight_after}kg`  : '—'}</td>
                        <td style={{ textAlign: 'center', fontWeight: 700, color: wc < 0 ? '#1d9e75' : wc > 0 ? '#a32d2d' : 'var(--text-secondary)' }}>
                          {wc ? `${wc > 0 ? '+' : ''}${wc}kg` : '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Points ── */}
      {tab === 'points' && (
        <div>
          <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
            <div className="card" style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ fontSize: 24, fontWeight: 700, color: colour }}>{student?.house_points || 0}</div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>House points</div>
            </div>
            <div className="card" style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ fontSize: 24, fontWeight: 700, color: '#1d9e75' }}>{student?.individual_points || 0}</div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Individual points</div>
            </div>
          </div>
          <div className="card" style={{ padding: 0 }}>
            {points.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>No points yet</div>
            ) : (
              <table>
                <thead><tr><th>Date</th><th>Reason</th><th style={{ textAlign: 'right' }}>Points</th></tr></thead>
                <tbody>
                  {points.map((p,i) => (
                    <tr key={i}>
                      <td style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{new Date(p.awarded_at).toLocaleDateString('en-GB')}</td>
                      <td style={{ fontSize: 13 }}>{p.point_type}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700, fontSize: 13, color: p.points_awarded < 0 ? '#a32d2d' : '#1d9e75' }}>
                        {p.points_awarded > 0 ? '+' : ''}{p.points_awarded}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ── Find athlete ── */}
      {tab === 'search' && (
        <div>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 }}>Search for any athlete by name</p>
          <AthleteSearch />
        </div>
      )}
    </div>
  )
}

function AthleteSearch() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [claimingId, setClaimingId] = useState(null)

  useEffect(() => {
    if (query.length < 2) { setResults([]); return }
    const t = setTimeout(async () => {
      const { data: memberData } = await supabasePublic
        .from('members').select('id, first_name, last_name, date_of_birth')
        .or(`first_name.ilike.%${query}%,last_name.ilike.%${query}%`).limit(8)
      if (!memberData?.length) { setResults([]); return }
      const { data: athletes } = await supabasePublic
        .from('students').select('id, student_ref, pka_belt, krba_level, discipline, house_name, member_id')
        .in('member_id', memberData.map(m => m.id))
      const merged = (athletes || []).map(s => ({ ...s, members: memberData.find(m => m.id === s.member_id) }))
      setResults(merged)
    }, 200)
    return () => clearTimeout(t)
  }, [query])

  async function claimProfile(s) {
    const m = s.members
    if (!confirm(`Link your login to ${m?.first_name} ${m?.last_name}'s profile? You won't need to search for it again.`)) return
    setClaimingId(s.id)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/.netlify/functions/link-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ studentId: s.id }),
      })
      const data = await res.json()
      if (data.success) {
        alert('Linked! Reloading your profile…')
        window.location.href = '/athlete-app'
      } else {
        alert('Error: ' + data.error)
      }
    } catch (e) {
      alert('Failed to link profile')
    }
    setClaimingId(null)
  }

  return (
    <div>
      <input value={query} onChange={e => setQuery(e.target.value)}
        placeholder="Type name to find athlete…" autoFocus
        style={{ width: '100%', padding: '12px', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius)', fontSize: 15, background: 'var(--bg-secondary)', color: 'var(--text)', marginBottom: 10 }} />
      {query.length >= 2 && results.length === 0 && (
        <p style={{ fontSize: 13, color: 'var(--text-tertiary)', textAlign: 'center' }}>No athletes found</p>
      )}
      {(() => {
        const names = results.map(s => `${s.members?.first_name} ${s.members?.last_name}`.toLowerCase())
        const hasDuplicateName = new Set(names).size !== names.length
        return hasDuplicateName ? (
          <p style={{ fontSize: 12, color: '#EF9F27', background: '#EF9F2715', padding: '8px 10px', borderRadius: 'var(--radius)', marginBottom: 8 }}>
            ⚠️ More than one person with this name — check the date of birth carefully before choosing.
          </p>
        ) : null
      })()}
      {results.map(s => {
        const m = s.members
        return (
          <div key={s.id}
            style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
              border: '1px solid var(--border)', borderRadius: 'var(--radius)',
              marginBottom: 8, background: 'var(--bg)' }}>
            <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--bg-secondary)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 700, flexShrink: 0 }}>
              {m?.first_name?.[0]}{m?.last_name?.[0]}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{m?.first_name} {m?.last_name}</div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                {s.student_ref} · {s.discipline} · {s.pka_belt || s.krba_level || '—'}
                {m?.date_of_birth ? ` · DOB ${new Date(m.date_of_birth).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}
              </div>
            </div>
            <button className="btn btn-primary btn-sm" onClick={() => claimProfile(s)} disabled={claimingId === s.id}>
              {claimingId === s.id ? 'Linking…' : 'This is me'}
            </button>
          </div>
        )
      })}
    </div>
  )
}
