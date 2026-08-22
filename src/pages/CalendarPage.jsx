import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase.js'

const DAY_TO_JS_DAYS = {
  Monday: [1], Tuesday: [2], Wednesday: [3], Thursday: [4], Friday: [5], Saturday: [6], Sunday: [0],
  'Mon/Fri': [1, 5], 'Tue/Thu': [2, 4],
}

function toDateStr(d) { return d.toISOString().split('T')[0] }

// Unified calendar -- shows classes/sessions, holiday closures, and
// fixtures (inter-house competitions) all together on one monthly
// view. Uses the exact same holidays data (and day-matching logic)
// as the athlete app's own calendar, so what a coach sees here always
// stays consistent with what an athlete sees on their own profile.
export default function CalendarPage() {
  const [classes, setClasses] = useState([])
  const [holidays, setHolidays] = useState([])
  const [fixtures, setFixtures] = useState([])
  const [courses, setCourses] = useState([])
  const [loading, setLoading] = useState(true)
  const [month, setMonth] = useState(() => { const d = new Date(); return { year: d.getFullYear(), month: d.getMonth() } })
  const [selectedDate, setSelectedDate] = useState(null)

  // Set Holidays mode
  const [settingHolidays, setSettingHolidays] = useState(false)
  const [holidaySelected, setHolidaySelected] = useState(new Set()) // date strings, shown in orange
  const [holidayName, setHolidayName] = useState('')
  const [holidayScope, setHolidayScope] = useState('club') // 'club' | 'class' | 'student'
  const [holidayClassId, setHolidayClassId] = useState('')
  const [holidayStudentId, setHolidayStudentId] = useState('')
  const [holidayStudentLabel, setHolidayStudentLabel] = useState('') // display name once picked
  const [studentSearch, setStudentSearch] = useState('')
  const [studentSearchResults, setStudentSearchResults] = useState([])
  const [savingHoliday, setSavingHoliday] = useState(false)
  const dragStateRef = useRef({ dragging: false, mode: 'add' }) // mode: whether this drag is adding or removing

  useEffect(() => { load() }, [])

  async function load() {
    const [{ data: c }, { data: h }, { data: f }, { data: co }] = await Promise.all([
      supabase.from('classes').select('*').eq('active', true).eq('is_custom', false).order('start_time'),
      supabase.from('holidays').select('*, classes(name), students(student_ref, members(first_name, last_name))').order('start_date', { ascending: false }),
      supabase.from('fixtures').select('*, home_house:houses!home_house_id(name), away_house:houses!away_house_id(name)').order('date'),
      supabase.from('courses').select('*').order('start_date'),
    ])
    setClasses(c || [])
    setHolidays(h || [])
    setFixtures(f || [])
    setCourses(co || [])
    setLoading(false)
  }

  const { year, month: m } = month
  const firstDay = new Date(year, m, 1)
  const startWeekday = (firstDay.getDay() + 6) % 7 // Monday-first
  const daysInMonth = new Date(year, m + 1, 0).getDate()
  const cells = []
  for (let i = 0; i < startWeekday; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)

  function classesForDate(dateStr) {
    const jsDay = new Date(dateStr + 'T12:00:00').getDay()
    return classes.filter(c => (DAY_TO_JS_DAYS[c.day_of_week] || []).includes(jsDay))
  }
  function holidayCoveringDate(dateStr) {
    // A row with only student_id set (individual athlete holiday) is
    // not club-wide -- must be excluded here too, or an individual's
    // time off would incorrectly show as closing the whole club.
    return holidays.find(h => !h.class_id && !h.student_id && h.start_date <= dateStr && h.end_date >= dateStr)
  }
  function fixturesForDate(dateStr) {
    return fixtures.filter(f => f.date === dateStr)
  }
  function coursesForDate(dateStr) {
    return courses.filter(c => c.start_date <= dateStr && (c.end_date || c.start_date) >= dateStr)
  }

  const selectedClasses = selectedDate ? classesForDate(selectedDate) : []
  const selectedHoliday = selectedDate ? holidayCoveringDate(selectedDate) : null
  const selectedPerClassHolidays = selectedDate ? holidays.filter(h => h.class_id && h.start_date <= selectedDate && h.end_date >= selectedDate) : []
  const selectedStudentHolidays = selectedDate ? holidays.filter(h => h.student_id && h.start_date <= selectedDate && h.end_date >= selectedDate) : []
  const selectedFixtures = selectedDate ? fixturesForDate(selectedDate) : []
  const selectedCourses = selectedDate ? coursesForDate(selectedDate) : []

  // Derived From/To for the holiday selection, shown in editable inputs
  const sortedSelected = [...holidaySelected].sort()
  const holidayFrom = sortedSelected[0] || ''
  const holidayTo = sortedSelected[sortedSelected.length - 1] || ''

  function toggleHolidayDate(dateStr, forceMode) {
    setHolidaySelected(prev => {
      const next = new Set(prev)
      const mode = forceMode || (next.has(dateStr) ? 'remove' : 'add')
      if (mode === 'add') next.add(dateStr)
      else next.delete(dateStr)
      return next
    })
  }

  function handleMouseDown(dateStr) {
    if (!settingHolidays) return
    const mode = holidaySelected.has(dateStr) ? 'remove' : 'add'
    dragStateRef.current = { dragging: true, mode }
    toggleHolidayDate(dateStr, mode)
  }
  function handleMouseEnter(dateStr) {
    if (!settingHolidays || !dragStateRef.current.dragging) return
    toggleHolidayDate(dateStr, dragStateRef.current.mode)
  }
  useEffect(() => {
    if (!settingHolidays) return
    const stopDrag = () => { dragStateRef.current.dragging = false }
    window.addEventListener('mouseup', stopDrag)
    window.addEventListener('touchend', stopDrag)
    return () => { window.removeEventListener('mouseup', stopDrag); window.removeEventListener('touchend', stopDrag) }
  }, [settingHolidays])

  // Editing From/To directly replaces the selection with that
  // contiguous range
  function setRangeFromInputs(from, to) {
    if (!from || !to) return
    const next = new Set()
    const start = new Date(from + 'T12:00:00')
    const end = new Date(to + 'T12:00:00')
    if (end < start) return
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) next.add(toDateStr(d))
    setHolidaySelected(next)
  }

  function startSettingHolidays() {
    setSettingHolidays(true)
    setHolidaySelected(new Set())
    setHolidayName('')
    setHolidayScope('club')
    setHolidayClassId('')
    setHolidayStudentId('')
    setHolidayStudentLabel('')
    setStudentSearch('')
    setStudentSearchResults([])
    setSelectedDate(null)
  }
  function cancelSettingHolidays() {
    setSettingHolidays(false)
    setHolidaySelected(new Set())
  }

  // Live search as the admin types, matching the same name-search
  // pattern used on the League page's Score check tab.
  async function searchStudentsForHoliday(q) {
    setStudentSearch(q)
    setHolidayStudentId('')
    setHolidayStudentLabel('')
    if (!q.trim()) { setStudentSearchResults([]); return }
    const { data } = await supabase
      .from('members')
      .select('id, first_name, last_name, students(id, student_ref)')
      .or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%`)
      .neq('status', 'stopped').neq('status', 'not_started')
      .limit(8)
    const results = []
    for (const m of (data || [])) {
      for (const s of (m.students || [])) {
        results.push({ studentId: s.id, name: `${m.first_name} ${m.last_name}`, ref: s.student_ref })
      }
    }
    setStudentSearchResults(results)
  }

  async function saveHolidaySelection() {
    if (!holidayName.trim()) { alert('Please give this holiday a name.'); return }
    if (holidaySelected.size === 0) { alert('Select at least one day on the calendar, or set a From/To range.'); return }
    if (holidayScope === 'student' && !holidayStudentId) { alert('Search for and select a student first.'); return }
    setSavingHoliday(true)

    // Group the selected (possibly non-contiguous) dates into
    // contiguous blocks, so e.g. selecting two separate weeks creates
    // two holiday rows rather than one row spanning the gap between them.
    const sorted = [...holidaySelected].sort()
    const blocks = []
    let blockStart = sorted[0]
    let prev = sorted[0]
    for (let i = 1; i <= sorted.length; i++) {
      const cur = sorted[i]
      const prevDate = new Date(prev + 'T12:00:00')
      const nextDay = toDateStr(new Date(prevDate.setDate(prevDate.getDate() + 1)))
      if (cur !== nextDay) {
        blocks.push({ start_date: blockStart, end_date: prev })
        blockStart = cur
      }
      prev = cur
    }

    const rows = blocks.map(b => ({
      name: holidayName.trim(),
      start_date: b.start_date,
      end_date: b.end_date,
      class_id: holidayScope === 'class' ? (holidayClassId || null) : null,
      student_id: holidayScope === 'student' ? holidayStudentId : null,
    }))
    const { data, error } = await supabase.from('holidays').insert(rows).select('*, classes(name)')
    setSavingHoliday(false)
    if (error) { alert('Error saving holiday: ' + error.message); return }
    setHolidays(prev => [...(data || []), ...prev])
    cancelSettingHolidays()
  }

  async function deleteHoliday(id) {
    if (!confirm('Remove this holiday period?')) return
    const { error } = await supabase.from('holidays').delete().eq('id', id)
    if (error) { alert('Error removing holiday: ' + error.message); return }
    setHolidays(prev => prev.filter(h => h.id !== id))
  }

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1>Calendar</h1>
          <p>Sessions, holiday closures, and fixtures all in one place</p>
        </div>
        {!settingHolidays ? (
          <button className="btn btn-primary" onClick={startSettingHolidays}>🏖️ Set holidays</button>
        ) : (
          <button className="btn" onClick={cancelSettingHolidays}>Cancel</button>
        )}
      </div>

      {settingHolidays && (
        <div className="card" style={{ marginBottom: 16, borderLeft: '3px solid #EF9F27' }}>
          <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>🏖️ Setting a holiday</p>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12 }}>
            Click a day, or click and drag across several days on the calendar below to select them — selected days show in orange.
            You can also just type a From/To range directly instead.
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
            <input value={holidayName} onChange={e => setHolidayName(e.target.value)} placeholder="Holiday name, e.g. Christmas break" style={{ flex: '1 1 200px' }} />
          </div>
          <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
            {[['club', 'Club-wide'], ['class', 'Specific class'], ['student', '👤 Individual student']].map(([key, label]) => (
              <button key={key} className="btn btn-sm" onClick={() => setHolidayScope(key)}
                style={{
                  background: holidayScope === key ? 'var(--text)' : 'var(--bg)',
                  color: holidayScope === key ? 'var(--bg)' : 'var(--text-secondary)',
                  borderColor: holidayScope === key ? 'var(--text)' : 'var(--border-strong)',
                }}>{label}</button>
            ))}
          </div>
          {holidayScope === 'class' && (
            <select value={holidayClassId} onChange={e => setHolidayClassId(e.target.value)} style={{ width: '100%', marginBottom: 10 }}>
              <option value="">Select a class…</option>
              {classes.map(c => <option key={c.id} value={c.id}>{c.name} — {c.day_of_week} {c.start_time?.slice(0,5)}</option>)}
            </select>
          )}
          {holidayScope === 'student' && (
            <div style={{ marginBottom: 10, position: 'relative' }}>
              {holidayStudentId ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', background: 'var(--bg-secondary)', borderRadius: 'var(--radius)', border: '1px solid var(--border-strong)' }}>
                  <span style={{ fontSize: 13, fontWeight: 500, flex: 1 }}>{holidayStudentLabel}</span>
                  <button className="btn btn-sm" onClick={() => { setHolidayStudentId(''); setHolidayStudentLabel(''); setStudentSearch('') }}>Change</button>
                </div>
              ) : (
                <>
                  <input value={studentSearch} onChange={e => searchStudentsForHoliday(e.target.value)}
                    placeholder="Search student by name…" style={{ width: '100%' }} />
                  {studentSearchResults.length > 0 && (
                    <div className="card" style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20, padding: 6, marginTop: 2, maxHeight: 220, overflowY: 'auto' }}>
                      {studentSearchResults.map(r => (
                        <button key={r.studentId} onClick={() => {
                          setHolidayStudentId(r.studentId)
                          setHolidayStudentLabel(`${r.name} (${r.ref})`)
                          setStudentSearchResults([])
                        }} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '6px 8px', borderRadius: 6, fontSize: 13, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-sans)', color: 'var(--text)' }}>
                          {r.name} <span style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>{r.ref}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
            <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>From</label>
            <input type="date" value={holidayFrom} onChange={e => setRangeFromInputs(e.target.value, holidayTo || e.target.value)} style={{ flex: '0 0 160px' }} />
            <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>To</label>
            <input type="date" value={holidayTo} onChange={e => setRangeFromInputs(holidayFrom || e.target.value, e.target.value)} style={{ flex: '0 0 160px' }} />
            <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{holidaySelected.size} day{holidaySelected.size === 1 ? '' : 's'} selected</span>
          </div>
          <button className="btn btn-primary" onClick={saveHolidaySelection} disabled={savingHoliday}>{savingHoliday ? 'Saving…' : '✓ Save holiday'}</button>
        </div>
      )}

      {loading ? <p>Loading…</p> : (
        <div style={{ display: 'grid', gridTemplateColumns: (selectedDate && !settingHolidays) ? '1fr 320px' : '1fr', gap: 20 }}>
          <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <button className="btn btn-sm" onClick={() => setMonth(({ year, month }) => month === 0 ? { year: year - 1, month: 11 } : { year, month: month - 1 })}>←</button>
              <h2 style={{ fontSize: 15, fontWeight: 600 }}>{new Date(year, m, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</h2>
              <button className="btn btn-sm" onClick={() => setMonth(({ year, month }) => month === 11 ? { year: year + 1, month: 0 } : { year, month: month + 1 })}>→</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 4, marginBottom: 6 }}>
              {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d => (
                <div key={d} style={{ textAlign: 'center', fontSize: 11, color: 'var(--text-tertiary)', fontWeight: 600 }}>{d}</div>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 4, userSelect: settingHolidays ? 'none' : 'auto' }}>
              {cells.map((d, i) => {
                if (d === null) return <div key={i} />
                const dateStr = `${year}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`
                const dayClasses = classesForDate(dateStr)
                const clubWideHoliday = holidayCoveringDate(dateStr)
                const perClassHolidayIds = new Set(holidays.filter(h => h.class_id && h.start_date <= dateStr && h.end_date >= dateStr).map(h => h.class_id))
                const runningClasses = clubWideHoliday ? [] : dayClasses.filter(c => !perClassHolidayIds.has(c.id))
                const dayFixtures = fixturesForDate(dateStr)
                const dayCourses = coursesForDate(dateStr)
                const isToday = dateStr === new Date().toISOString().split('T')[0]
                const isSelected = dateStr === selectedDate
                const isHolidaySelected = holidaySelected.has(dateStr)
                return (
                  <button key={i}
                    onMouseDown={() => settingHolidays ? handleMouseDown(dateStr) : null}
                    onMouseEnter={() => settingHolidays ? handleMouseEnter(dateStr) : null}
                    onClick={() => { if (!settingHolidays) setSelectedDate(isSelected ? null : dateStr) }}
                    style={{
                      aspectRatio: '0.85', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start',
                      padding: '6px 2px', borderRadius: 6, cursor: 'pointer', fontFamily: 'var(--font-sans)', gap: 2,
                      border: isHolidaySelected ? '2px solid #EF9F27' : isSelected ? '2px solid var(--text)' : isToday ? '2px solid #378ADD' : '1px solid var(--border)',
                      background: isHolidaySelected ? '#EF9F2725' : clubWideHoliday ? '#E24B4A12' : 'var(--bg-secondary)',
                    }}>
                    <span style={{ fontSize: 11, fontWeight: isToday ? 700 : 500 }}>{d}</span>
                    {!settingHolidays && clubWideHoliday && <span style={{ fontSize: 8 }}>🏖️</span>}
                    {!settingHolidays && !clubWideHoliday && runningClasses.length > 0 && <span style={{ fontSize: 8, color: '#378ADD' }}>●{runningClasses.length > 1 ? runningClasses.length : ''}</span>}
                    {!settingHolidays && dayFixtures.length > 0 && <span style={{ fontSize: 8, color: '#EF9F27' }}>🏆</span>}
                    {!settingHolidays && dayCourses.length > 0 && <span style={{ fontSize: 8, color: '#8B5CF6' }}>🎓</span>}
                  </button>
                )
              })}
            </div>
            <div style={{ display: 'flex', gap: 14, marginTop: 12, fontSize: 11, color: 'var(--text-secondary)' }}>
              <span>● Session(s)</span>
              <span>🏖️ Closed</span>
              <span>🏆 Fixture</span>
              <span>🎓 Course</span>
            </div>
          </div>

          {selectedDate && !settingHolidays && (
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <h3 style={{ fontSize: 14, fontWeight: 600 }}>{new Date(selectedDate).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</h3>
                <button onClick={() => setSelectedDate(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16 }}>✕</button>
              </div>

              {selectedHoliday && (
                <div style={{ padding: '8px 10px', background: '#E24B4A15', borderRadius: 'var(--radius)', marginBottom: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 12, fontWeight: 600 }}>🏖️ {selectedHoliday.name}</span>
                    <button className="btn btn-sm" onClick={() => deleteHoliday(selectedHoliday.id)}>Remove</button>
                  </div>
                  <p style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Club-wide closure — no sessions running</p>
                </div>
              )}

              {!selectedHoliday && (
                <>
                  <p style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Sessions</p>
                  {selectedClasses.length === 0 ? (
                    <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 12 }}>No sessions scheduled</p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
                      {selectedClasses.map(c => {
                        const closedForThis = selectedPerClassHolidays.find(h => h.class_id === c.id)
                        return (
                          <div key={c.id} style={{ padding: '6px 10px', background: 'var(--bg-secondary)', borderRadius: 'var(--radius)', opacity: closedForThis ? 0.5 : 1 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ fontSize: 12, fontWeight: 600 }}>{c.name}</span>
                              {closedForThis && <button className="btn btn-sm" onClick={() => deleteHoliday(closedForThis.id)}>Remove closure</button>}
                            </div>
                            <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{c.start_time?.slice(0,5)}{c.end_time ? `–${c.end_time.slice(0,5)}` : ''}</span>
                            {closedForThis && <div style={{ fontSize: 10, color: '#E24B4A' }}>Closed: {closedForThis.name}</div>}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </>
              )}

              {selectedStudentHolidays.length > 0 && (
                <>
                  <p style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>👤 Individual holidays</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
                    {selectedStudentHolidays.map(h => {
                      const m = h.students?.members
                      return (
                        <div key={h.id} style={{ padding: '6px 10px', background: '#EF9F2712', borderRadius: 'var(--radius)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: 12, fontWeight: 600 }}>{m ? `${m.first_name} ${m.last_name}` : 'Unknown student'}</span>
                            <button className="btn btn-sm" onClick={() => deleteHoliday(h.id)}>Remove</button>
                          </div>
                          <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{h.name}{h.students?.student_ref ? ` · ${h.students.student_ref}` : ''}</span>
                        </div>
                      )
                    })}
                  </div>
                </>
              )}

              <p style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Fixtures</p>
              {selectedFixtures.length === 0 ? (
                <p style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>No fixtures</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {selectedFixtures.map(f => (
                    <div key={f.id} style={{ padding: '6px 10px', background: '#EF9F2712', borderRadius: 'var(--radius)' }}>
                      <span style={{ fontSize: 12, fontWeight: 600 }}>{f.home_house?.name} vs {f.away_house?.name}</span>
                      {f.venue && <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{f.venue}</div>}
                      {f.status === 'completed' && <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{f.home_score} – {f.away_score}</div>}
                    </div>
                  ))}
                </div>
              )}

              <p style={{ fontSize: 12, fontWeight: 600, marginBottom: 6, marginTop: 12 }}>Courses</p>
              {selectedCourses.length === 0 ? (
                <p style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>No courses</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {selectedCourses.map(c => (
                    <a key={c.id} href="/crm" style={{ padding: '6px 10px', background: '#8B5CF612', borderRadius: 'var(--radius)', textDecoration: 'none', color: 'inherit', display: 'flex', gap: 8, alignItems: 'center' }}>
                      {c.poster_url ? <img src={c.poster_url} alt="" style={{ width: 32, height: 32, borderRadius: 6, objectFit: 'cover' }} /> : <span style={{ fontSize: 18 }}>🎓</span>}
                      <div>
                        <span style={{ fontSize: 12, fontWeight: 600, display: 'block' }}>{c.title}</span>
                        {c.location && <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{c.location}</span>}
                      </div>
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
