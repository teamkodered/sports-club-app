import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.jsx'
import { supabase } from '../lib/supabase.js'
import { studentProfileLink } from '../lib/studentLinks.js'

const HOUSE_COLOURS = {
  'Dragon House': '#E24B4A', 'Super House': '#378ADD',
  'Ice House': '#1D9E75', 'Jet House': '#EF9F27',
}
const MEDALS = ['🥇','🥈','🥉','🎖️']

export default function Dashboard() {
  const { profile, isAdmin } = useAuth()
  const [stats, setStats]         = useState({})
  const [standings, setStandings] = useState([])
  const [topStudents, setTopStudents] = useState([])
  const [recentPts, setRecentPts] = useState([])
  const [loading, setLoading]     = useState(true)
  const [showAddPoints, setShowAddPoints] = useState(false)
  const [pointTypes, setPointTypes] = useState([])
  const [apSearch, setApSearch] = useState('')
  const [apResults, setApResults] = useState([])
  const [apSelected, setApSelected] = useState([]) // array of student objects
  const [apSaving, setApSaving] = useState(false)
  const [apLastAwarded, setApLastAwarded] = useState(null)

  // Team notes
  const [teamNotes, setTeamNotes] = useState([])
  const [newNoteText, setNewNoteText] = useState('')
  const [noteTarget, setNoteTarget] = useState('team') // 'team' or a student object
  const [noteSearch, setNoteSearch] = useState('')
  const [noteSearchResults, setNoteSearchResults] = useState([])
  const [savingNote, setSavingNote] = useState(false)

  // Club events
  const [clubEvents, setClubEvents] = useState([])
  const [showAddEvent, setShowAddEvent] = useState(false)
  const [newEventTitle, setNewEventTitle] = useState('')
  const [newEventDate, setNewEventDate] = useState('')
  const [newEventTime, setNewEventTime] = useState('')
  const [newEventDesc, setNewEventDesc] = useState('')
  const [newEventSendAll, setNewEventSendAll] = useState(true)
  const [savingEvent, setSavingEvent] = useState(false)

  useEffect(() => {
    async function load() {
      const today = new Date().toISOString().split('T')[0]
      const monthAgo = new Date(Date.now() - 30*24*60*60*1000).toISOString().split('T')[0]

      const [
        { count: memberCount },
        { count: studentCount },
        { data: houses },
        { data: topPts },
        { data: recentPoints },
        { data: checkIns },
        { count: todayCount },
        { count: athleteCount },
      ] = await Promise.all([
        supabase.from('members').select('id', { count: 'exact', head: true }).eq('status', 'active'),
        supabase.from('students').select('id, members!inner(status)', { count: 'exact', head: true }).neq('members.status', 'stopped').neq('members.status', 'not_started'),
        supabase.from('houses').select('*').order('points', { ascending: false }),
        supabase.from('students').select('id, house_points, individual_points, class_champion_count, house_name, member_id, is_kr, is_pts, discipline, members(first_name, last_name, houses(name))').order('house_points', { ascending: false }).limit(5),
        supabase.from('points_log').select('*, student_id, students(member_id, is_kr, is_pts, discipline, members(first_name, last_name))').order('awarded_at', { ascending: false }).limit(8),
        supabase.from('attendance').select('id', { count: 'exact', head: true }).gte('attended_at', monthAgo),
        supabase.from('attendance').select('id', { count: 'exact', head: true }).eq('session_date', today),
        supabase.from('students').select('id', { count: 'exact', head: true }).eq('in_comp', true).or('is_kr.eq.true,discipline.eq.KRBA'),
      ])

      setStats({ memberCount: memberCount || 0, studentCount: studentCount || 0, checkIns: checkIns?.count || 0, todayCount: todayCount || 0, athleteCount: athleteCount || 0 })
      setStandings(houses || [])
      setTopStudents(topPts || [])
      setRecentPts(recentPoints || [])
      setLoading(false)

      const { data: notesData } = await supabase.from('team_notes').select('*').order('created_at', { ascending: false }).limit(20)
      setTeamNotes(notesData || [])

      const { data: eventsData } = await supabase.from('club_events').select('*').order('event_date', { ascending: true })
      setClubEvents(eventsData || [])
    }
    load()
  }, [])

  // Athlete search for targeting a note
  useEffect(() => {
    if (noteSearch.length < 3) { setNoteSearchResults([]); return }
    const t = setTimeout(async () => {
      const { data: memberData } = await supabase
        .from('members').select('id, first_name, last_name, status')
        .or(`first_name.ilike.%${noteSearch}%,last_name.ilike.%${noteSearch}%`).limit(10)
      const eligible = (memberData || []).filter(m => m.status !== 'stopped' && m.status !== 'not_started')
      if (!eligible.length) { setNoteSearchResults([]); return }
      const { data: stuData } = await supabase
        .from('students').select('id, student_ref, member_id, members(first_name, last_name)')
        .in('member_id', eligible.map(m => m.id))
      setNoteSearchResults(stuData || [])
    }, 250)
    return () => clearTimeout(t)
  }, [noteSearch])

  async function addNote() {
    if (!newNoteText.trim()) return
    setSavingNote(true)
    if (noteTarget === 'team') {
      const { data, error } = await supabase.from('team_notes').insert({ note_text: newNoteText.trim() }).select('*').single()
      if (error) { alert('Error saving note: ' + error.message); setSavingNote(false); return }
      setTeamNotes(prev => [data, ...prev])
    } else {
      const { error } = await supabase.from('athlete_notes_log').insert({ student_id: noteTarget.id, note_text: newNoteText.trim() })
      if (error) { alert('Error saving note: ' + error.message); setSavingNote(false); return }
    }
    setNewNoteText('')
    setNoteTarget('team')
    setNoteSearch('')
    setSavingNote(false)
  }

  async function deleteTeamNote(id) {
    if (!confirm('Delete this note?')) return
    const { error } = await supabase.from('team_notes').delete().eq('id', id)
    if (error) return alert('Error: ' + error.message)
    setTeamNotes(prev => prev.filter(n => n.id !== id))
  }

  async function addEvent() {
    if (!newEventTitle.trim() || !newEventDate) return
    setSavingEvent(true)
    const { data, error } = await supabase.from('club_events').insert({
      title: newEventTitle.trim(), description: newEventDesc.trim() || null,
      event_date: newEventDate, event_time: newEventTime || null,
      send_to_all_students: newEventSendAll,
    }).select('*').single()
    if (error) { alert('Error saving event: ' + error.message); setSavingEvent(false); return }
    setClubEvents(prev => [...prev, data].sort((a, b) => a.event_date.localeCompare(b.event_date)))
    setNewEventTitle(''); setNewEventDate(''); setNewEventTime(''); setNewEventDesc(''); setNewEventSendAll(true)
    setShowAddEvent(false)
    setSavingEvent(false)
  }

  async function deleteEvent(id) {
    if (!confirm('Delete this event?')) return
    const { error } = await supabase.from('club_events').delete().eq('id', id)
    if (error) return alert('Error: ' + error.message)
    setClubEvents(prev => prev.filter(e => e.id !== id))
  }

  useEffect(() => {
    if (showAddPoints) {
      supabase.from('settings').select('value').eq('key', 'point_types').single()
        .then(({ data }) => setPointTypes(data?.value || []))
    }
  }, [showAddPoints])

  useEffect(() => {
    if (apSearch.length < 3) { setApResults([]); return }
    const t = setTimeout(async () => {
      const { data: memberData } = await supabase
        .from('members').select('id, first_name, last_name, status')
        .or(`first_name.ilike.%${apSearch}%,last_name.ilike.%${apSearch}%`).limit(10)
      const eligible = (memberData || []).filter(m => m.status !== 'stopped' && m.status !== 'not_started')
      if (!eligible.length) { setApResults([]); return }
      const { data: stuData } = await supabase
        .from('students').select('id, student_ref, house_name, member_id, members(first_name, last_name, houses(name))')
        .in('member_id', eligible.map(m => m.id))
      setApResults((stuData || []).filter(s => !apSelected.find(sel => sel.id === s.id)))
    }, 250)
    return () => clearTimeout(t)
  }, [apSearch])

  function toggleApSelect(s) {
    setApSelected(prev => prev.find(x => x.id === s.id) ? prev.filter(x => x.id !== s.id) : [...prev, s])
    setApResults(prev => prev.filter(x => x.id !== s.id))
    setApSearch('')
  }

  async function awardQuickPoints(pt) {
    if (apSelected.length === 0) return
    setApSaving(true)
    for (const s of apSelected) {
      const { error } = await supabase.from('points_log').insert({
        student_id: s.id, point_type: pt.label, points_awarded: pt.points,
        point_scope: 'both', awarded_at: new Date().toISOString(),
      })
      if (error) { alert(`Error awarding to ${s.members?.first_name}: ${error.message}`); continue }
      const { data: current } = await supabase.from('students').select('house_points, individual_points').eq('id', s.id).single()
      await supabase.from('students').update({
        house_points: (current?.house_points || 0) + pt.points,
        individual_points: (current?.individual_points || 0) + pt.points,
      }).eq('id', s.id)
      const houseName = s.members?.houses?.name || s.house_name
      if (houseName) {
        const { data: house } = await supabase.from('houses').select('points').eq('name', houseName).single()
        if (house) await supabase.from('houses').update({ points: (house.points || 0) + pt.points }).eq('name', houseName)
      }
    }
    setApLastAwarded({ label: pt.label, points: pt.points, count: apSelected.length, names: apSelected.map(s => s.members?.first_name).join(', ') })
    setTimeout(() => setApLastAwarded(null), 4000)
    setApSaving(false)
    // Keep the modal open and selection intact -- lets you stack another
    // point type onto the same group right away for speed
  }

  function closeAddPoints() {
    setShowAddPoints(false)
    setApSearch(''); setApResults([]); setApSelected([]); setApLastAwarded(null)
  }

  async function editRecentPoint(p, field, value) {
    const oldValue = p[field]
    if (value === oldValue) return
    const payload = { [field]: value }
    const { error } = await supabase.from('points_log').update(payload).eq('id', p.id)
    if (error) { alert('Error saving: ' + error.message); return }
    if (field === 'points_awarded') {
      const diff = parseFloat(value) - parseFloat(oldValue || 0)
      if (diff !== 0 && p.student_id) {
        const { data: current } = await supabase.from('students').select('house_points, individual_points').eq('id', p.student_id).single()
        await supabase.from('students').update({
          house_points: (current?.house_points || 0) + diff,
          individual_points: (current?.individual_points || 0) + diff,
        }).eq('id', p.student_id)
      }
    }
    setRecentPts(prev => prev.map(x => x.id === p.id ? { ...x, ...payload } : x))
  }

  if (loading) return <div className="loading">Loading dashboard…</div>

  const dayName = new Date().toLocaleDateString('en-GB', { weekday: 'long' })
  const dateStr = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700 }}>
          Welcome back{profile?.first_name ? `, ${profile.first_name}` : ''} 👋
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 2 }}>{dayName}, {dateStr}</p>
      </div>

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 18 }}>
        {[
          { label: 'Active members', value: stats.memberCount, icon: '👥', colour: '#378ADD', to: '/students' },
          { label: 'Register',       value: stats.todayCount, icon: '📋', colour: '#1D9E75', to: '/registers' },
          { label: 'Athletes',       value: stats.athleteCount, icon: '🏅', colour: '#EF9F27', to: '/athletes' },
          { label: 'Houses',         value: standings.length,   icon: '🛡️', colour: '#E24B4A', to: '/league' },
        ].map(s => (
          <Link key={s.label} to={s.to} className="card" style={{ textAlign: 'center', borderTop: `3px solid ${s.colour}`, textDecoration: 'none', color: 'inherit', display: 'block' }}>
            <div style={{ fontSize: 26, marginBottom: 4 }}>{s.icon}</div>
            <div style={{ fontSize: 26, fontWeight: 700, color: s.colour }}>{s.value}</div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>{s.label}</div>
          </Link>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
        {/* House standings */}
        <div className="card" style={{ padding: 0 }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ fontSize: 14, fontWeight: 600 }}>🛡️ House standings</h2>
            <Link to="/league" style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Full league →</Link>
          </div>
          {standings.map((h, i) => {
            const colour = HOUSE_COLOURS[h.name] || '#888'
            const maxPts = standings[0]?.points || 1
            const pct = Math.round(((h.points || 0) / maxPts) * 100)
            return (
              <div key={h.id} style={{ padding: '10px 16px', borderBottom: i < standings.length-1 ? '1px solid var(--border)' : 'none' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 5 }}>
                  <span style={{ fontSize: 18, width: 24 }}>{MEDALS[i] || i+1}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: colour }}>{h.name}</span>
                      <span style={{ fontSize: 14, fontWeight: 700, color: colour }}>{h.points || 0}</span>
                    </div>
                    <div style={{ height: 6, background: 'var(--bg-tertiary)', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: colour, borderRadius: 3, transition: 'width 0.5s ease' }} />
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Top students */}
        <div className="card" style={{ padding: 0 }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ fontSize: 14, fontWeight: 600 }}>⭐ Top students</h2>
            <Link to="/league" style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Individual →</Link>
          </div>
          <table>
            <tbody>
              {topStudents.map((s, i) => {
                const m = s.members
                const houseName = s.house_name || m?.houses?.name
                const colour = HOUSE_COLOURS[houseName] || '#888'
                return (
                  <tr key={s.id}>
                    <td style={{ width: 28, textAlign: 'center', fontSize: 16 }}>{MEDALS[i] || <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{i+1}</span>}</td>
                    <td>
                      <Link to={studentProfileLink(s)} style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)', textDecoration: 'underline' }}>{m?.first_name} {m?.last_name}</Link>
                      <div style={{ fontSize: 10, color: colour }}>{houseName}</div>
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: colour, paddingRight: 4 }}>{s.house_points || 0}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Quick links */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginBottom: 14 }}>
        {[
          { label: 'Classes',    icon: '🗓️', to: '/classes',    colour: '#378ADD' },
          { label: 'Check in',   icon: '✅', to: '/checkin',    colour: '#1D9E75' },
          { label: 'Forms',      icon: '📝', to: '/forms',      colour: '#EF9F27' },
          { label: 'Trackers',   icon: '📈', to: '/trackers',   colour: '#E24B4A' },
          { label: 'My App',     icon: '🎽', to: '/athlete-app', colour: '#8B5CF6' },
          { label: 'Add Points', icon: '⭐', to: null, action: 'addPoints', colour: '#EC4899' },
          { label: 'Fixtures',   icon: '📅', to: '/fixtures',   colour: '#06B6D4' },
        ].map(l => l.action ? (
          <button key={l.label} onClick={() => setShowAddPoints(true)} style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
            padding: '14px 8px', background: l.colour + '12',
            border: `1px solid ${l.colour}30`, borderRadius: 'var(--border-radius-lg)',
            cursor: 'pointer', fontFamily: 'var(--font-sans)',
          }}>
            <span style={{ fontSize: 24 }}>{l.icon}</span>
            <span style={{ fontSize: 12, fontWeight: 500, color: l.colour }}>{l.label}</span>
          </button>
        ) : (
          <Link key={l.label} to={l.to} style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
            padding: '14px 8px', background: l.colour + '12',
            border: `1px solid ${l.colour}30`, borderRadius: 'var(--border-radius-lg)',
            textDecoration: 'none',
          }}>
            <span style={{ fontSize: 24 }}>{l.icon}</span>
            <span style={{ fontSize: 12, fontWeight: 500, color: l.colour }}>{l.label}</span>
          </Link>
        ))}
      </div>

      {/* Recent points */}
      {recentPts.length > 0 && (
        <div className="card" style={{ padding: 0 }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
            <h2 style={{ fontSize: 14, fontWeight: 600 }}>Recent points</h2>
          </div>
          <div style={{ maxHeight: 320, overflowY: 'auto' }}>
          <table>
            <thead><tr><th>Student</th><th>Reason</th><th style={{ textAlign: 'right' }}>Pts</th><th>When</th></tr></thead>
            <tbody>
              {recentPts.map((p, i) => {
                const m = p.students?.members
                return (
                  <tr key={i}>
                    <td style={{ fontSize: 13, fontWeight: 500 }}>
                      <Link to={studentProfileLink({ ...p.students, id: p.student_id })} style={{ color: 'var(--text)', textDecoration: 'underline' }}>{m?.first_name} {m?.last_name}</Link>
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                      <input defaultValue={p.point_type || ''} onBlur={e => editRecentPoint(p, 'point_type', e.target.value)}
                        style={{ width: '100%', minWidth: 90, padding: '3px 5px', fontSize: 12, border: '1px solid transparent', borderRadius: 4, background: 'transparent', color: 'var(--text-secondary)' }}
                        onFocus={e => e.target.style.border = '1px solid var(--border-strong)'}
                        onMouseLeave={e => { if (document.activeElement !== e.target) e.target.style.border = '1px solid transparent' }} />
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 700 }}>
                      <input type="number" defaultValue={p.points_awarded} onBlur={e => editRecentPoint(p, 'points_awarded', parseFloat(e.target.value))}
                        style={{ width: 48, padding: '3px 5px', fontSize: 13, fontWeight: 700, textAlign: 'right', border: '1px solid transparent', borderRadius: 4, background: 'transparent', color: p.points_awarded < 0 ? '#a32d2d' : '#1d9e75' }}
                        onFocus={e => e.target.style.border = '1px solid var(--border-strong)'}
                        onMouseLeave={e => { if (document.activeElement !== e.target) e.target.style.border = '1px solid transparent' }} />
                    </td>
                    <td style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                      {new Date(p.awarded_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {/* Add Points quick scorer */}
      {showAddPoints && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 50, padding: 16, overflowY: 'auto' }}
          onClick={closeAddPoints}>
          <div className="card" style={{ width: '100%', maxWidth: 480, marginTop: 16 }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h2 style={{ fontSize: 16, fontWeight: 600 }}>⭐ Add points</h2>
              <button onClick={closeAddPoints} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', padding: 8 }}>✕</button>
            </div>

            <input value={apSearch} onChange={e => setApSearch(e.target.value)} placeholder="Search students to add… (min 3 letters)" autoFocus
              style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius)', fontSize: 14, background: 'var(--bg-secondary)', color: 'var(--text)', marginBottom: 10 }} />

            {apResults.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 10, maxHeight: 160, overflowY: 'auto' }}>
                {apResults.map(s => (
                  <button key={s.id} onClick={() => toggleApSelect(s)} className="btn btn-sm" style={{ justifyContent: 'flex-start', textAlign: 'left' }}>
                    + {s.members?.first_name} {s.members?.last_name} <span style={{ marginLeft: 6, fontSize: 11, color: 'var(--text-tertiary)' }}>{s.student_ref}</span>
                  </button>
                ))}
              </div>
            )}

            {apSelected.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 6 }}>
                  {apSelected.length} selected — tap a name to remove
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {apSelected.map(s => (
                    <button key={s.id} onClick={() => setApSelected(prev => prev.filter(x => x.id !== s.id))}
                      className="badge badge-blue" style={{ border: 'none', cursor: 'pointer', fontSize: 12 }}>
                      {s.members?.first_name} {s.members?.last_name} ✕
                    </button>
                  ))}
                </div>
              </div>
            )}

            {apLastAwarded && (
              <div style={{ background: '#1D9E7515', border: '1px solid #1D9E7530', color: '#1D9E75', borderRadius: 'var(--radius)', padding: '8px 12px', fontSize: 13, marginBottom: 12 }}>
                ✓ +{apLastAwarded.points} "{apLastAwarded.label}" awarded to {apLastAwarded.count} student{apLastAwarded.count === 1 ? '' : 's'} ({apLastAwarded.names})
              </div>
            )}

            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>
              {apSelected.length === 0 ? 'Search and select students above, then tap a point type' : 'Tap a point type to award to everyone selected'}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {pointTypes.map(pt => (
                <button key={pt.label} disabled={apSelected.length === 0 || apSaving} onClick={() => awardQuickPoints(pt)}
                  className="btn btn-sm" style={{ opacity: apSelected.length === 0 ? 0.4 : 1 }}>
                  {pt.label} <strong style={{ marginLeft: 4 }}>+{pt.points}</strong>
                </button>
              ))}
              {pointTypes.length === 0 && <p style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>No point types configured — add some in Settings.</p>}
            </div>
          </div>
        </div>
      )}

      {/* Team notes */}
      <div className="card" style={{ padding: 0, marginBottom: 14 }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
          <h2 style={{ fontSize: 14, fontWeight: 600 }}>📝 Notes</h2>
        </div>
        <div style={{ padding: 16 }}>
          <textarea value={newNoteText} onChange={e => setNewNoteText(e.target.value)}
            placeholder="Write a note…" rows={2}
            style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius)', fontSize: 13, background: 'var(--bg-secondary)', color: 'var(--text)', fontFamily: 'var(--font-sans)', resize: 'vertical', marginBottom: 8 }} />
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
            <button className="btn btn-sm" onClick={() => { setNoteTarget('team'); setNoteSearch('') }}
              style={{ background: noteTarget === 'team' ? '#378ADD20' : undefined, borderColor: noteTarget === 'team' ? '#378ADD' : undefined }}>
              👥 Team
            </button>
            {noteTarget !== 'team' && (
              <span className="btn btn-sm" style={{ background: '#1D9E7520', borderColor: '#1D9E75' }}>
                → {noteTarget.members?.first_name} {noteTarget.members?.last_name}
              </span>
            )}
            <div style={{ position: 'relative', flex: 1, minWidth: 160 }}>
              <input value={noteSearch} onChange={e => setNoteSearch(e.target.value)} placeholder="Or search an athlete to send to…"
                style={{ width: '100%' }} />
              {noteSearchResults.length > 0 && (
                <div className="card" style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10, padding: 4, maxHeight: 200, overflowY: 'auto' }}>
                  {noteSearchResults.map(s => (
                    <button key={s.id} onClick={() => { setNoteTarget(s); setNoteSearch('') }}
                      style={{ display: 'block', width: '100%', textAlign: 'left', padding: '6px 8px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, borderRadius: 6 }}>
                      {s.members?.first_name} {s.members?.last_name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <button className="btn btn-primary btn-sm" disabled={!newNoteText.trim() || savingNote} onClick={addNote}>
            {savingNote ? 'Saving…' : noteTarget === 'team' ? '+ Post to team' : `+ Send to ${noteTarget.members?.first_name}`}
          </button>

          {teamNotes.length > 0 && (
            <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {teamNotes.map(note => (
                <div key={note.id} style={{ padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 4 }}>
                      {new Date(note.created_at).toLocaleDateString('en-GB')} · {new Date(note.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                    <button onClick={() => deleteTeamNote(note.id)} style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: 14 }}>×</button>
                  </div>
                  <p style={{ fontSize: 13, margin: 0 }}>{note.note_text}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Club events */}
      <div className="card" style={{ padding: 0, marginBottom: 14 }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontSize: 14, fontWeight: 600 }}>📅 Events</h2>
          <button className="btn btn-sm" onClick={() => setShowAddEvent(v => !v)}>{showAddEvent ? 'Cancel' : '+ Add event'}</button>
        </div>
        <div style={{ padding: 16 }}>
          {showAddEvent && (
            <div style={{ marginBottom: 14, paddingBottom: 14, borderBottom: '1px solid var(--border)' }}>
              <input value={newEventTitle} onChange={e => setNewEventTitle(e.target.value)} placeholder="Event title" style={{ marginBottom: 8 }} />
              <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                <input type="date" value={newEventDate} onChange={e => setNewEventDate(e.target.value)} style={{ flex: 1, minWidth: 140 }} />
                <input type="time" value={newEventTime} onChange={e => setNewEventTime(e.target.value)} style={{ flex: 1, minWidth: 100 }} />
              </div>
              <textarea value={newEventDesc} onChange={e => setNewEventDesc(e.target.value)} placeholder="Description (optional)" rows={2}
                style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius)', fontSize: 13, background: 'var(--bg-secondary)', color: 'var(--text)', fontFamily: 'var(--font-sans)', resize: 'vertical', marginBottom: 8 }} />
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginBottom: 10, cursor: 'pointer' }}>
                <input type="checkbox" checked={newEventSendAll} onChange={e => setNewEventSendAll(e.target.checked)} style={{ width: 16, height: 16 }} />
                Send to all students (shows in their Sessions tab)
              </label>
              <button className="btn btn-primary btn-sm" disabled={!newEventTitle.trim() || !newEventDate || savingEvent} onClick={addEvent}>
                {savingEvent ? 'Saving…' : 'Add event'}
              </button>
            </div>
          )}
          {clubEvents.filter(e => e.event_date >= new Date().toISOString().split('T')[0]).length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>No upcoming events.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {clubEvents.filter(e => e.event_date >= new Date().toISOString().split('T')[0]).map(ev => (
                <div key={ev.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{ev.title}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                      {new Date(ev.event_date + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}{ev.event_time ? ` · ${ev.event_time.slice(0,5)}` : ''}
                      {ev.send_to_all_students && <span style={{ marginLeft: 6, color: '#1D9E75' }}>· sent to all students</span>}
                    </div>
                    {ev.description && <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>{ev.description}</div>}
                  </div>
                  <button onClick={() => deleteEvent(ev.id)} style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: 14 }}>×</button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
