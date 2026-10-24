import { useState, useEffect, useRef } from 'react'
import EventsStrip, { eventTitle } from '../components/shared/EventsStrip.jsx'
import { useAuth } from '../hooks/useAuth.jsx'
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
  const { isAdmin } = useAuth()
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
  const [holidayClassIds, setHolidayClassIds] = useState(new Set()) // classes picked for a class holiday
  const [dayPickedClasses, setDayPickedClasses] = useState(new Set()) // ticked in the selected-day list
  const [holidayStudentId, setHolidayStudentId] = useState('')
  const [holidayStudentLabel, setHolidayStudentLabel] = useState('') // display name once picked
  const [studentSearch, setStudentSearch] = useState('')
  const [studentSearchResults, setStudentSearchResults] = useState([])
  const [savingHoliday, setSavingHoliday] = useState(false)
  const dragStateRef = useRef({ dragging: false, mode: 'add' }) // mode: whether this drag is adding or removing
  // Shared Google calendars (read-only) + Month / Week / List views + filters
  const [view, setView] = useState(() => localStorage.getItem('kc_cal_view') || 'month')
  useEffect(() => { try { localStorage.setItem('kc_cal_view', view) } catch { /* ignore */ } }, [view])
  const [weekStart, setWeekStart] = useState(() => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d })
  const [gEvents, setGEvents] = useState([])
  const [gFeeds, setGFeeds] = useState([])
  const [gErrors, setGErrors] = useState([])
  const [show, setShow] = useState({ sessions: true, holidays: true, fixtures: true, courses: true })
  const [hiddenFeeds, setHiddenFeeds] = useState(new Set())

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
  const isoD = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  // the date range on screen -> fetch those Google events
  const range = (() => {
    if (view === 'week') { const e = new Date(weekStart); e.setDate(e.getDate() + 6); return [isoD(weekStart), isoD(e)] }
    if (view === 'list') { const a = new Date(); const b = new Date(); b.setDate(b.getDate() + 90); return [isoD(a), isoD(b)] }
    const a = new Date(year, m, 1); a.setDate(a.getDate() - 7); const b = new Date(year, m + 1, 0); b.setDate(b.getDate() + 7); return [isoD(a), isoD(b)]
  })()
  useEffect(() => {
    let stop = false
    ;(async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      try {
        const res = await fetch(`/.netlify/functions/calendar-events?from=${range[0]}&to=${range[1]}`, { headers: { Authorization: `Bearer ${session.access_token}` } })
        const r = await res.json()
        if (stop) return
        setGEvents(r.events || []); setGFeeds(r.feeds || []); setGErrors(r.errors || [])
      } catch { /* calendar still works without Google */ }
    })()
    return () => { stop = true }
  }, [range[0], range[1]])
  // a Google event's days (all-day events end the day AFTER their last day)
  function gEventDays(ev) {
    const s0 = new Date(ev.start), e0 = new Date(ev.end)
    const first = ev.allDay ? ev.start.slice(0, 10) : isoD(s0)
    let last = ev.allDay ? (() => { const d = new Date(ev.end.slice(0, 10) + 'T12:00:00'); d.setDate(d.getDate() - 1); return isoD(d) })() : isoD(new Date(e0 - 1))
    if (last < first) last = first
    return [first, last]
  }
  function gEventsForDate(dateStr) {
    return gEvents.filter(ev => !hiddenFeeds.has(ev.feedId)).filter(ev => { const [a, b] = gEventDays(ev); return a <= dateStr && b >= dateStr })
  }
  const looksClosed = ev => /\b(closed|closure|holiday|holidays|half[ -]?term|no (classes|training|sessions)|bank holiday|christmas|xmas|easter break)\b/i.test(ev.title)
  const linkedHoliday = ev => holidays.find(h => h.google_event_uid && h.google_event_uid === ev.uid && h.start_date === gEventDays(ev)[0])
  async function makeClubHoliday(ev) {
    const [a, b] = gEventDays(ev)
    const { data, error } = await supabase.from('holidays').insert({ name: ev.title, start_date: a, end_date: b, google_event_uid: ev.uid }).select('*, classes(name)')
    if (error) return alert('Could not add the holiday: ' + error.message + (/google_event_uid/.test(error.message) ? '\n\n(Has supabase_google_calendars.sql been run?)' : ''))
    setHolidays(prev => [...(data || []), ...prev])
  }
  const fmtT = iso => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  const gEventRow = ev => {
    const linked = linkedHoliday(ev)
    return (
      <div key={ev.id} className="gcal-row" style={{ borderLeftColor: ev.colour }}>
        <div style={{ minWidth: 0 }}>
          <b>{ev.title}</b>
          <span>{ev.allDay ? 'All day' : `${fmtT(ev.start)}–${fmtT(ev.end)}`}{ev.location ? ` · ${ev.location}` : ''} · <i style={{ color: ev.colour }}>{ev.feed}</i></span>
        </div>
        {linked ? <span className="gcal-linked">🏖 Club holiday ✓</span>
          : (looksClosed(ev) || ev.allDay) && <button className="btn btn-sm" title="Close the club on these dates (registers and missed training will respect it)" onClick={() => makeClubHoliday(ev)}>🏖 Make club holiday</button>}
      </div>
    )
  }
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
    return fixtures.filter(f => f.date <= dateStr && (f.end_date || f.date) >= dateStr)
  }
  function coursesForDate(dateStr) {
    return courses.filter(c => c.start_date <= dateStr && (c.end_date || c.start_date) >= dateStr)
  }

  const selectedClasses = selectedDate ? classesForDate(selectedDate) : []
  useEffect(() => { setDayPickedClasses(new Set()) }, [selectedDate])
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
    setHolidayClassIds(new Set())
    setHolidayStudentId('')
    setHolidayStudentLabel('')
    setStudentSearch('')
    setStudentSearchResults([])
    setSelectedDate(null)
  }
  function startHolidayForDayClasses() {
    const day = selectedDate, picked = new Set(dayPickedClasses)
    startSettingHolidays()
    setHolidaySelected(new Set([day]))
    setHolidayScope(picked.size ? 'class' : 'club')
    setHolidayClassIds(picked)
    setDayPickedClasses(new Set())
    setTimeout(() => document.getElementById('holiday-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
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
    if (holidayScope === 'class' && holidayClassIds.size === 0) { alert('Tick at least one class.'); return }
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

    const classIds = holidayScope === 'class' ? [...holidayClassIds] : [null]
    const rows = blocks.flatMap(b => classIds.map(cid => ({
      name: holidayName.trim(),
      start_date: b.start_date,
      end_date: b.end_date,
      class_id: cid,
      student_id: holidayScope === 'student' ? holidayStudentId : null,
    })))
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
          <p>Sessions, holidays, events and your Google calendars in one place</p>
        </div>
        <div className="cal-views">
          {[['month', 'Month'], ['week', 'Week'], ['list', 'List']].map(([k, l]) => <button key={k} type="button" className={view === k ? 'on' : ''} onClick={() => setView(k)}>{l}</button>)}
        </div>
        {!settingHolidays ? (
          <button className="btn btn-primary" onClick={startSettingHolidays}>🏖️ Set holidays</button>
        ) : (
          <button className="btn" onClick={cancelSettingHolidays}>Cancel</button>
        )}
      </div>

      <div className="cal-filters">
        {[['sessions', '● Sessions', '#378ADD'], ['holidays', '🏖 Closed', '#E24B4A'], ['fixtures', '🏆 Events', '#EF9F27'], ['courses', '🎓 Courses', '#8B5CF6']].map(([k, l, c]) => (
          <button key={k} type="button" className={show[k] ? 'on' : ''} style={show[k] ? { borderColor: c } : undefined} onClick={() => setShow(x => ({ ...x, [k]: !x[k] }))}>{l}</button>
        ))}
        {gFeeds.map(f => (
          <button key={f.id} type="button" className={!hiddenFeeds.has(f.id) ? 'on' : ''} style={!hiddenFeeds.has(f.id) ? { borderColor: f.colour } : undefined}
            onClick={() => setHiddenFeeds(prev => { const n = new Set(prev); n.has(f.id) ? n.delete(f.id) : n.add(f.id); return n })}>
            <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 4, background: f.colour, marginRight: 5 }} />{f.name}
          </button>
        ))}
      </div>
      {!loading && <EventsStrip fixtures={fixtures} canEdit={isAdmin} onChanged={load} />}
      {gErrors.length > 0 && <div style={{ fontSize: 12, color: '#B45309', margin: '0 0 8px' }}>⚠ Couldn't read: {gErrors.map(e => `${e.feed} (${e.error})`).join('; ')}</div>}
      {(() => {
        const pending = gEvents.filter(ev => looksClosed(ev) && !linkedHoliday(ev) && gEventDays(ev)[1] >= isoD(new Date()))
        return pending.length > 0 && !settingHolidays ? (
          <div className="card gcal-suggest">
            <b>🏖 {pending.length} Google event{pending.length === 1 ? '' : 's'} look{pending.length === 1 ? 's' : ''} like club closures</b>
            {pending.slice(0, 6).map(ev => <div key={ev.id} className="gcal-sugg-row"><span>{ev.title} · {new Date(gEventDays(ev)[0] + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}{gEventDays(ev)[1] !== gEventDays(ev)[0] ? `–${new Date(gEventDays(ev)[1] + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : ''}</span><button className="btn btn-sm" onClick={() => makeClubHoliday(ev)}>Make club holiday</button></div>)}
          </div>
        ) : null
      })()}

      {!loading && view !== 'month' && (() => {
        // Week / List: each day with everything on it
        const days = []
        if (view === 'week') for (let i = 0; i < 7; i++) { const d = new Date(weekStart); d.setDate(d.getDate() + i); days.push(isoD(d)) }
        else { const d = new Date(); for (let i = 0; i < 90; i++) { days.push(isoD(d)); d.setDate(d.getDate() + 1) } }
        const rows = days.map(ds => {
          const hol = show.holidays ? holidayCoveringDate(ds) : null
          const cls = show.sessions && !hol ? classesForDate(ds) : []
          const fx = show.fixtures ? fixturesForDate(ds) : []
          const co = show.courses ? coursesForDate(ds) : []
          const ge = gEventsForDate(ds)
          return { ds, hol, cls, fx, co, ge, empty: !hol && !fx.length && !co.length && !ge.length && (view === 'list' || !cls.length) }
        }).filter(r => view === 'week' || !r.empty)
        return (
          <div className="card">
            {view === 'week' && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <button className="btn btn-sm" onClick={() => setWeekStart(w => { const d = new Date(w); d.setDate(d.getDate() - 7); return d })}>←</button>
                <h2 style={{ fontSize: 15, fontWeight: 600 }}>Week of {weekStart.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}</h2>
                <button className="btn btn-sm" onClick={() => setWeekStart(w => { const d = new Date(w); d.setDate(d.getDate() + 7); return d })}>→</button>
              </div>
            )}
            {view === 'list' && <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 10 }}>Coming up — next 90 days</h2>}
            {!rows.length && <p style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>Nothing coming up.</p>}
            {rows.map(r => (
              <div key={r.ds} className="cal-day">
                <div className="cal-day-h">{new Date(r.ds + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}{r.ds === isoD(new Date()) ? ' · Today' : ''}</div>
                {r.hol && <div className="cal-item" style={{ borderLeftColor: '#E24B4A' }}>🏖 <b>{r.hol.name}</b> — club closed</div>}
                {r.cls.length > 0 && <div className="cal-item" style={{ borderLeftColor: '#378ADD' }}>● {r.cls.length} session{r.cls.length === 1 ? '' : 's'}: {r.cls.slice(0, 4).map(c => `${String(c.start_time).slice(0, 5)} ${c.name}`).join(' · ')}{r.cls.length > 4 ? ' …' : ''}</div>}
                {r.fx.map(f => <div key={f.id} className="cal-item" style={{ borderLeftColor: '#EF9F27' }}>🏆 {eventTitle(f)}{f.venue ? ` · ${f.venue}` : ''}</div>)}
                {r.co.map(c => <div key={c.id} className="cal-item" style={{ borderLeftColor: '#8B5CF6' }}>🎓 {c.title}</div>)}
                {r.ge.map(gEventRow)}
                {view === 'week' && r.empty && !r.cls.length && <div className="cal-item muted">Nothing on</div>}
              </div>
            ))}
          </div>
        )
      })()}

      {loading ? <p>Loading…</p> : view !== 'month' ? null : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 16 }}>
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
                    {!settingHolidays && show.holidays && clubWideHoliday && <span style={{ fontSize: 8 }}>🏖️</span>}
                    {!settingHolidays && gEventsForDate(dateStr).length > 0 && (
                      <span className="gcal-dots">{gEventsForDate(dateStr).slice(0, 3).map(ev => <i key={ev.id} style={{ background: ev.colour }} title={ev.title} />)}</span>
                    )}
                    {!settingHolidays && show.sessions && !clubWideHoliday && runningClasses.length > 0 && <span style={{ fontSize: 8, color: '#378ADD' }}>●{runningClasses.length > 1 ? runningClasses.length : ''}</span>}
                    {!settingHolidays && show.fixtures && dayFixtures.length > 0 && <span style={{ fontSize: 8, color: '#EF9F27' }}>🏆</span>}
                    {!settingHolidays && show.courses && dayCourses.length > 0 && <span style={{ fontSize: 8, color: '#8B5CF6' }}>🎓</span>}
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

        {settingHolidays && (
          <div id="holiday-panel" className="card" style={{ marginTop: 16, borderLeft: '3px solid #EF9F27' }}>
            <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>🏖️ Setting a holiday</p>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12 }}>
              Tap days, or drag across several days on the calendar above to select them — selected days show in orange.
              You can also just type a From/To range directly instead.
            </p>
            <div className="hol-label">REASON</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
              {['Christmas break', 'Half term', 'Bank holiday', 'Venue closed', 'Coach away', 'Registers not taken'].map(r => (
                <button key={r} type="button" className="btn btn-sm" onClick={() => setHolidayName(r)}
                  style={holidayName === r ? { background: '#EF9F27', borderColor: '#EF9F27', color: '#1A1206', fontWeight: 700 } : undefined}>{r}</button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
              <input value={holidayName} onChange={e => setHolidayName(e.target.value)} placeholder="…or type your own reason" style={{ flex: '1 1 200px' }} />
            </div>
            <div className="hol-label">WHO IT APPLIES TO</div>
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
            {holidayScope === 'class' && (() => {
              // Classes that run on the picked days come first; every other class is under "Other classes"
              const days = [...holidaySelected]
              const onDays = new Map()
              days.forEach(d => classesForDate(d).forEach(c => onDays.set(c.id, c)))
              const DAY = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }
            const dayRank = c => DAY[String(c.day_of_week || '').slice(0, 3)] || 9
            const byDayTime = (a, b) => dayRank(a) - dayRank(b) || String(a.start_time).localeCompare(String(b.start_time)) || String(a.name).localeCompare(String(b.name))
            const others = classes.filter(c => !onDays.has(c.id)).sort(byDayTime)
            const onDaysSorted = [...onDays.values()].sort(byDayTime)
            // "Other classes" grouped under day headings
            const otherGroups = []
            others.forEach(c => { const k = c.day_of_week || 'Other'; const g = otherGroups.find(x => x.k === k); g ? g.items.push(c) : otherGroups.push({ k, items: [c] }) })
              const toggle = id => setHolidayClassIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
              const row = c => (
                <label key={c.id} className="hol-class">
                  <input type="checkbox" checked={holidayClassIds.has(c.id)} onChange={() => toggle(c.id)} />
                  <b>{c.day_of_week} {c.start_time?.slice(0, 5)}</b> <span>{c.name}</span>
                </label>
              )
              return (
                <div style={{ marginBottom: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{days.length ? `Classes on the ${days.length} selected day${days.length === 1 ? '' : 's'}` : 'Pick days on the calendar to see their classes'}</span>
                    {onDays.size > 0 && <span style={{ display: 'flex', gap: 6 }}>
                      <button type="button" className="btn btn-sm" onClick={() => setHolidayClassIds(new Set(onDays.keys()))}>All</button>
                      <button type="button" className="btn btn-sm" onClick={() => setHolidayClassIds(new Set())}>None</button>
                    </span>}
                  </div>
                  <div className="hol-classes">{onDaysSorted.map(row)}</div>
                  {others.length > 0 && (
                    <details style={{ marginTop: 6 }}>
                      <summary style={{ fontSize: 12, color: 'var(--text-secondary)', cursor: 'pointer' }}>Other classes ({others.length})</summary>
                      {otherGroups.map(g => (
                      <div key={g.k} style={{ marginTop: 6 }}>
                        <div className="hol-label" style={{ margin: '6px 0 2px' }}>{String(g.k).toUpperCase()}</div>
                        <div className="hol-classes">{g.items.map(row)}</div>
                      </div>
                    ))}
                    </details>
                  )}
                </div>
              )
            })()}
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
            <button className="btn btn-primary" onClick={saveHolidaySelection} disabled={savingHoliday}>
              {savingHoliday ? 'Saving…' : `✓ Save holiday · ${holidaySelected.size} day${holidaySelected.size === 1 ? '' : 's'}${holidayScope === 'class' ? ` · ${holidayClassIds.size} class${holidayClassIds.size === 1 ? '' : 'es'}` : holidayScope === 'club' ? ' · club-wide' : ''}`}
            </button>
          </div>
        )}

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
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: closedForThis ? 'default' : 'pointer' }}>
                                {!closedForThis && <input type="checkbox" checked={dayPickedClasses.has(c.id)} aria-label={`Pick ${c.name} for a holiday`}
                                  onChange={() => setDayPickedClasses(prev => { const n = new Set(prev); n.has(c.id) ? n.delete(c.id) : n.add(c.id); return n })} />}
                                <span style={{ fontSize: 12, fontWeight: 600 }}>{c.name}</span>
                              </label>
                              {closedForThis && <button className="btn btn-sm" onClick={() => deleteHoliday(closedForThis.id)}>Remove closure</button>}
                            </div>
                            <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{c.start_time?.slice(0,5)}{c.end_time ? `–${c.end_time.slice(0,5)}` : ''}</span>
                            {closedForThis && <div style={{ fontSize: 10, color: '#E24B4A' }}>Closed: {closedForThis.name}</div>}
                          </div>
                        )
                      })}
                      <button type="button" className="btn btn-sm" style={{ alignSelf: 'flex-start', marginTop: 2 }} onClick={startHolidayForDayClasses}>
                        🏖️ {dayPickedClasses.size ? `Holiday ${dayPickedClasses.size} ticked class${dayPickedClasses.size === 1 ? '' : 'es'}…` : 'Holiday this day…'}
                      </button>
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
                <p style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>No events</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {selectedFixtures.map(f => (
                    <div key={f.id} style={{ padding: '6px 10px', background: '#EF9F2712', borderRadius: 'var(--radius)' }}>
                      <span style={{ fontSize: 12, fontWeight: 600 }}>🏆 {eventTitle(f)}</span>
                      {f.venue && <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{f.venue}</div>}
                      {f.status === 'completed' && <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{f.home_score} – {f.away_score}</div>}
                    </div>
                  ))}
                </div>
              )}

              {gEventsForDate(selectedDate).length > 0 && (
                <>
                  <p style={{ fontSize: 12, fontWeight: 600, marginBottom: 6, marginTop: 12 }}>📅 Google calendar</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>{gEventsForDate(selectedDate).map(gEventRow)}</div>
                </>
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
