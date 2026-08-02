import { useState, useEffect } from 'react'
import { supabasePublic as supabase } from '../lib/supabasePublic.js'

const HOUSE_COLOURS = {
  'Dragon House': '#E24B4A', 'Super House': '#378ADD',
  'Ice House': '#1D9E75', 'Jet House': '#EF9F27',
}

// Shared display board -- intended for a TV/projector in the gym, not
// a personal device. Shows each active athlete's most recent
// completed Whoop session. Note this is NOT truly live/mid-workout --
// Whoop's API only provides a session summary once it finishes
// processing after the workout ends (typically within a few minutes),
// so a card here updates shortly after someone finishes training,
// not while they're still going.
export default function WhoopDisplayBoard() {
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)

  async function load() {
    // Most recent whoop_sessions row per student, joined with their
    // name/house for display.
    const { data, error } = await supabase
      .from('whoop_sessions')
      .select('*, students(id, members(first_name, last_name, houses(name)))')
      .order('start_time', { ascending: false })
      .limit(200)
    if (!error) {
      const seen = new Set()
      const latestPerStudent = []
      for (const row of data || []) {
        if (seen.has(row.student_id)) continue
        seen.add(row.student_id)
        latestPerStudent.push(row)
      }
      setSessions(latestPerStudent)
    }
    setLoading(false)
  }

  useEffect(() => {
    load()
    // Re-poll periodically as a fallback, and subscribe to Realtime
    // for near-instant updates when a new session lands.
    const interval = setInterval(load, 30000)
    const channel = supabase
      .channel('whoop_sessions_board')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'whoop_sessions' }, load)
      .subscribe()
    return () => { clearInterval(interval); supabase.removeChannel(channel) }
  }, [])

  return (
    <div style={{ minHeight: '100vh', background: '#0B0F14', padding: 24, color: '#fff', fontFamily: 'var(--font-sans, sans-serif)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 12 }}>
          ⌚ Whoop — Session Board
        </h1>
        <p style={{ fontSize: 13, color: '#9AA5B1' }}>
          Updates shortly after each workout finishes — not a live mid-session feed
        </p>
      </div>

      {loading ? (
        <p style={{ color: '#9AA5B1' }}>Loading…</p>
      ) : sessions.length === 0 ? (
        <p style={{ color: '#9AA5B1' }}>No Whoop sessions logged yet.</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
          {sessions.map(s => {
            const name = `${s.students?.members?.first_name || ''} ${s.students?.members?.last_name || ''}`.trim() || 'Unknown'
            const house = s.students?.members?.houses?.name
            const colour = HOUSE_COLOURS[house] || '#378ADD'
            const minutesAgo = s.start_time ? Math.round((Date.now() - new Date(s.start_time).getTime()) / 60000) : null
            return (
              <div key={s.id} style={{ background: '#151B23', borderRadius: 14, padding: 18, borderLeft: `4px solid ${colour}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 700 }}>{name}</div>
                    {house && <div style={{ fontSize: 11, color: colour, fontWeight: 600 }}>{house}</div>}
                  </div>
                  <div style={{ fontSize: 11, color: '#9AA5B1', textAlign: 'right' }}>
                    {s.sport_name || 'Workout'}<br />
                    {minutesAgo != null && (minutesAgo < 60 ? `${minutesAgo}m ago` : `${Math.round(minutesAgo/60)}h ago`)}
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, textAlign: 'center' }}>
                  <div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: colour }}>{s.strain != null ? s.strain.toFixed(1) : '—'}</div>
                    <div style={{ fontSize: 10, color: '#9AA5B1' }}>STRAIN</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 22, fontWeight: 800 }}>{s.avg_heart_rate ?? '—'}</div>
                    <div style={{ fontSize: 10, color: '#9AA5B1' }}>AVG HR</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 22, fontWeight: 800 }}>{s.max_heart_rate ?? '—'}</div>
                    <div style={{ fontSize: 10, color: '#9AA5B1' }}>MAX HR</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 22, fontWeight: 800 }}>{s.calories != null ? Math.round(s.calories) : '—'}</div>
                    <div style={{ fontSize: 10, color: '#9AA5B1' }}>CAL</div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
