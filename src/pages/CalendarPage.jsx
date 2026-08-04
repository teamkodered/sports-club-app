import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase.js'

const DAY_TO_JS_DAYS = {
  Monday: [1], Tuesday: [2], Wednesday: [3], Thursday: [4], Friday: [5], Saturday: [6], Sunday: [0],
  'Mon/Fri': [1, 5], 'Tue/Thu': [2, 4],
}

// Unified calendar -- shows classes/sessions, holiday closures, and
// fixtures (inter-house competitions) all together on one monthly
// view. Uses the exact same holidays data (and day-matching logic)
// as the athlete app's own calendar, so what a coach sees here always
// stays consistent with what an athlete sees on their own profile.
export default function CalendarPage() {
  const [classes, setClasses] = useState([])
  const [holidays, setHolidays] = useState([])
  const [fixtures, setFixtures] = useState([])
  const [loading, setLoading] = useState(true)
  const [month, setMonth] = useState(() => { const d = new Date(); return { year: d.getFullYear(), month: d.getMonth() } })
  const [selectedDate, setSelectedDate] = useState(null)

  useEffect(() => { load() }, [])

  async function load() {
    const [{ data: c }, { data: h }, { data: f }] = await Promise.all([
      supabase.from('classes').select('*').eq('active', true).eq('is_custom', false).order('start_time'),
      supabase.from('holidays').select('*, classes(name)').order('start_date', { ascending: false }),
      supabase.from('fixtures').select('*, home_house:houses!home_house_id(name), away_house:houses!away_house_id(name)').order('date'),
    ])
    setClasses(c || [])
    setHolidays(h || [])
    setFixtures(f || [])
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
    return holidays.find(h => !h.class_id && h.start_date <= dateStr && h.end_date >= dateStr)
  }
  function fixturesForDate(dateStr) {
    return fixtures.filter(f => f.date === dateStr)
  }

  const selectedClasses = selectedDate ? classesForDate(selectedDate) : []
  const selectedHoliday = selectedDate ? holidayCoveringDate(selectedDate) : null
  const selectedPerClassHolidays = selectedDate ? holidays.filter(h => h.class_id && h.start_date <= selectedDate && h.end_date >= selectedDate) : []
  const selectedFixtures = selectedDate ? fixturesForDate(selectedDate) : []

  return (
    <div>
      <div className="page-header">
        <h1>Calendar</h1>
        <p>Sessions, holiday closures, and fixtures all in one place</p>
      </div>

      {loading ? <p>Loading…</p> : (
        <div style={{ display: 'grid', gridTemplateColumns: selectedDate ? '1fr 320px' : '1fr', gap: 20 }}>
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
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 4 }}>
              {cells.map((d, i) => {
                if (d === null) return <div key={i} />
                const dateStr = `${year}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`
                const dayClasses = classesForDate(dateStr)
                const clubWideHoliday = holidayCoveringDate(dateStr)
                const perClassHolidayIds = new Set(holidays.filter(h => h.class_id && h.start_date <= dateStr && h.end_date >= dateStr).map(h => h.class_id))
                const runningClasses = clubWideHoliday ? [] : dayClasses.filter(c => !perClassHolidayIds.has(c.id))
                const dayFixtures = fixturesForDate(dateStr)
                const isToday = dateStr === new Date().toISOString().split('T')[0]
                const isSelected = dateStr === selectedDate
                return (
                  <button key={i} onClick={() => setSelectedDate(isSelected ? null : dateStr)} style={{
                    aspectRatio: '0.85', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start',
                    padding: '6px 2px', borderRadius: 6, cursor: 'pointer', fontFamily: 'var(--font-sans)', gap: 2,
                    border: isSelected ? '2px solid var(--text)' : isToday ? '2px solid #378ADD' : '1px solid var(--border)',
                    background: clubWideHoliday ? '#E24B4A12' : 'var(--bg-secondary)',
                  }}>
                    <span style={{ fontSize: 11, fontWeight: isToday ? 700 : 500 }}>{d}</span>
                    {clubWideHoliday && <span style={{ fontSize: 8 }}>🏖️</span>}
                    {!clubWideHoliday && runningClasses.length > 0 && <span style={{ fontSize: 8, color: '#378ADD' }}>●{runningClasses.length > 1 ? runningClasses.length : ''}</span>}
                    {dayFixtures.length > 0 && <span style={{ fontSize: 8, color: '#EF9F27' }}>🏆</span>}
                  </button>
                )
              })}
            </div>
            <div style={{ display: 'flex', gap: 14, marginTop: 12, fontSize: 11, color: 'var(--text-secondary)' }}>
              <span>● Session(s)</span>
              <span>🏖️ Closed</span>
              <span>🏆 Fixture</span>
            </div>
          </div>

          {selectedDate && (
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <h3 style={{ fontSize: 14, fontWeight: 600 }}>{new Date(selectedDate).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</h3>
                <button onClick={() => setSelectedDate(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16 }}>✕</button>
              </div>

              {selectedHoliday && (
                <div style={{ padding: '8px 10px', background: '#E24B4A15', borderRadius: 'var(--radius)', marginBottom: 10 }}>
                  <span style={{ fontSize: 12, fontWeight: 600 }}>🏖️ {selectedHoliday.name}</span>
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
                            <span style={{ fontSize: 12, fontWeight: 600 }}>{c.name}</span>
                            <span style={{ fontSize: 11, color: 'var(--text-tertiary)', marginLeft: 6 }}>{c.start_time?.slice(0,5)}{c.end_time ? `–${c.end_time.slice(0,5)}` : ''}</span>
                            {closedForThis && <div style={{ fontSize: 10, color: '#E24B4A' }}>Closed: {closedForThis.name}</div>}
                          </div>
                        )
                      })}
                    </div>
                  )}
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
            </div>
          )}
        </div>
      )}
    </div>
  )
}
