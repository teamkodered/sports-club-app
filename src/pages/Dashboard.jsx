import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.jsx'
import { supabase } from '../lib/supabase.js'

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
      ] = await Promise.all([
        supabase.from('members').select('id', { count: 'exact', head: true }).eq('status', 'active'),
        supabase.from('students').select('id, members!inner(status)', { count: 'exact', head: true }).neq('members.status', 'stopped').neq('members.status', 'not_started'),
        supabase.from('houses').select('*').order('points', { ascending: false }),
        supabase.from('students').select('id, house_points, individual_points, class_champion_count, house_name, member_id, members(first_name, last_name, houses(name))').order('house_points', { ascending: false }).limit(5),
        supabase.from('points_log').select('*, student_id, students(member_id, members(first_name, last_name))').order('awarded_at', { ascending: false }).limit(8),
        supabase.from('attendance').select('id', { count: 'exact', head: true }).gte('attended_at', monthAgo),
        supabase.from('attendance').select('id', { count: 'exact', head: true }).eq('session_date', today),
      ])

      setStats({ memberCount: memberCount || 0, studentCount: studentCount || 0, checkIns: checkIns?.count || 0, todayCount: todayCount || 0 })
      setStandings(houses || [])
      setTopStudents(topPts || [])
      setRecentPts(recentPoints || [])
      setLoading(false)
    }
    load()
  }, [])

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
          { label: 'Check-ins (30d)',value: stats.checkIns,     icon: '✅', colour: '#EF9F27', to: '/checkin' },
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
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{m?.first_name} {m?.last_name}</div>
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
          { label: 'Registers',  icon: '📋', to: '/registers',  colour: '#378ADD' },
          { label: 'Check in',   icon: '✅', to: '/checkin',    colour: '#1D9E75' },
          { label: 'Students',   icon: '🎽', to: '/students',   colour: '#EF9F27' },
          { label: 'Trackers',   icon: '📈', to: '/trackers',   colour: '#E24B4A' },
        ].map(l => (
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
          <table>
            <thead><tr><th>Student</th><th>Reason</th><th style={{ textAlign: 'right' }}>Pts</th><th>When</th></tr></thead>
            <tbody>
              {recentPts.map((p, i) => {
                const m = p.students?.members
                return (
                  <tr key={i}>
                    <td style={{ fontSize: 13, fontWeight: 500 }}>{m?.first_name} {m?.last_name}</td>
                    <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{p.point_type}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: p.points_awarded < 0 ? '#a32d2d' : '#1d9e75' }}>
                      {p.points_awarded > 0 ? '+' : ''}{p.points_awarded}
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
      )}
    </div>
  )
}
