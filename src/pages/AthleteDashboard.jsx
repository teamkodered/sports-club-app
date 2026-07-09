import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../hooks/useAuth.jsx'
import { Link } from 'react-router-dom'

const HOUSE_COLOURS = {
  'Dragon House': '#E24B4A', 'Super House': '#378ADD',
  'Ice House': '#1D9E75', 'Jet House': '#EF9F27',
}

export default function AthleteDashboard() {
  const { profile } = useAuth()
  const [student, setStudent]     = useState(null)
  const [apData, setApData]       = useState(null)
  const [points, setPoints]       = useState([])
  const [sessions, setSessions]   = useState([])
  const [loading, setLoading]     = useState(true)
  const [dateFrom] = useState(() => { const d = new Date(); d.setMonth(d.getMonth()-3); return d.toISOString().split('T')[0] })
  const [dateTo]   = useState(new Date().toISOString().split('T')[0])

  useEffect(() => { if (profile) load() }, [profile])

  async function load() {
    // Get student record for this member
    const { data: s } = await supabase
      .from('students')
      .select('*, members(first_name, last_name, date_of_birth, email, phone, houses(name))')
      .eq('member_id', profile.id)
      .single()

    if (!s) { setLoading(false); return }
    setStudent(s)

    const [{ data: ap }, { data: pts }, { data: sess }] = await Promise.all([
      supabase.from('athlete_profiles').select('*').eq('student_id', s.id).single(),
      supabase.from('points_log').select('*').eq('student_id', s.id)
        .gte('awarded_at', dateFrom).lte('awarded_at', dateTo + 'T23:59:59')
        .order('awarded_at', { ascending: false }),
      supabase.from('fit2fight_sessions').select('*').eq('student_id', s.id)
        .order('session_date', { ascending: false }).limit(10),
    ])
    setApData(ap)
    setPoints(pts || [])
    setSessions(sess || [])
    setLoading(false)
  }

  if (loading) return <div className="loading">Loading your dashboard…</div>

  if (!student) return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div className="card" style={{ maxWidth: 420, textAlign: 'center', padding: 32 }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>🎽</div>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>No student record found</h2>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20 }}>Your account isn't linked to a student record yet. Ask your coach to set this up.</p>
        <Link to="/join-pka-adult" className="btn btn-primary" style={{ display: 'inline-flex', justifyContent: 'center' }}>Complete membership form →</Link>
      </div>
    </div>
  )

  const m = student.members
  const houseName = m?.houses?.name
  const colour = HOUSE_COLOURS[houseName] || '#888'
  const age = m?.date_of_birth ? Math.floor((Date.now() - new Date(m.date_of_birth)) / (365.25*24*60*60*1000)) : null
  const totalPts = points.reduce((s, p) => s + (p.points_awarded || 0), 0)
  const champCount = points.filter(p => p.point_type === 'Class Champ').length
  const initials = `${m?.first_name?.[0] || ''}${m?.last_name?.[0] || ''}`.toUpperCase()

  // Shared PDP notes
  const sharedPDP = apData?.pdp_shared || {}
  const hasSharedPDP = Object.keys(sharedPDP).some(k => !k.endsWith('_sent_at') && sharedPDP[k]?.length)

  const PDP_LABELS = {
    winning_ways: { label: '🏆 Winning ways', colour: '#1D9E75' },
    maintain:     { label: '✅ Maintain',      colour: '#378ADD' },
    to_work_on:   { label: '🎯 To work on',    colour: '#EF9F27' },
    what_to_do:   { label: '📋 What to do',    colour: '#8B5CF6' },
  }

  return (
    <div style={{ maxWidth: 680, margin: '0 auto' }}>
      {/* Header card */}
      <div className="card" style={{ marginBottom: 14, borderLeft: `4px solid ${colour}`, borderRadius: '0 var(--border-radius-lg) var(--border-radius-lg) 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 56, height: 56, borderRadius: '50%', background: colour + '22', color: colour, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 700, flexShrink: 0 }}>
            {initials}
          </div>
          <div style={{ flex: 1 }}>
            <h1 style={{ fontSize: 20, fontWeight: 700 }}>{m?.first_name} {m?.last_name}</h1>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 2 }}>
              {student.student_ref} · {student.discipline}
              {age ? ` · Age ${age}` : ''}
              {student.pka_belt || student.krba_level ? ` · ${student.pka_belt || student.krba_level}` : ''}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
              {houseName && <span style={{ background: colour + '18', color: colour, borderRadius: 20, padding: '2px 10px', fontSize: 11, fontWeight: 600 }}>{houseName}</span>}
              {student.class_schedule && <span className="badge badge-gray" style={{ fontSize: 10 }}>{student.class_schedule} {student.class_time}</span>}
              {student.is_kr     && <span className="badge badge-purple" style={{ fontSize: 10 }}>KR</span>}
              {student.is_pts    && <span className="badge badge-blue"   style={{ fontSize: 10 }}>PTs</span>}
              {student.is_leader && <span className="badge badge-green"  style={{ fontSize: 10 }}>Leader</span>}
            </div>
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 14 }}>
        {[
          { label: 'Points',       value: totalPts,             colour: colour,    icon: '⭐' },
          { label: 'Class champ',  value: `🏆 ${champCount}x`, colour: '#EF9F27', icon: '' },
          { label: 'F2F sessions', value: sessions.length,      colour: '#378ADD', icon: '💪' },
          { label: 'House',        value: student.house_points || 0, colour: colour, icon: '🛡️' },
        ].map(s => (
          <div key={s.label} className="card" style={{ textAlign: 'center', padding: '12px 8px' }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: s.colour }}>{s.value}</div>
            <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Quick links */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 14 }}>
        {[
          { label: 'Check in',     icon: '✅', path: '/checkin',        colour: '#1D9E75' },
          { label: 'Weight check', icon: '⚖️', path: '/fit2fight',      colour: '#378ADD' },
          { label: 'Fit II Fight', icon: '💪', path: '/fit2fight',      colour: '#EF9F27' },
          { label: 'My forms',     icon: '📝', path: '/my-forms',       colour: '#8B5CF6' },
          { label: 'My PDP',       icon: '🎯', path: '/my-pdp',         colour: '#E24B4A' },
          { label: 'My profile',   icon: '👤', path: '/profile',        colour: '#185FA5' },
        ].map(l => (
          <Link key={l.label} to={l.path} style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
            padding: '14px 8px', background: l.colour + '12',
            border: `1px solid ${l.colour}30`, borderRadius: 'var(--border-radius-lg)',
            textDecoration: 'none', color: l.colour, cursor: 'pointer',
          }}>
            <span style={{ fontSize: 24 }}>{l.icon}</span>
            <span style={{ fontSize: 12, fontWeight: 500 }}>{l.label}</span>
          </Link>
        ))}
      </div>

      {/* Shared PDP notes */}
      {hasSharedPDP && (
        <div className="card" style={{ marginBottom: 14 }}>
          <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>🎯 Your PDP — Coach notes</h2>
          {Object.entries(PDP_LABELS).map(([key, { label, colour: c }]) => {
            const items = sharedPDP[key]
            if (!items?.length) return null
            return (
              <div key={key} style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: c, marginBottom: 5 }}>{label}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                  {items.map((item, i) => (
                    <span key={i} style={{ background: c + '15', color: c, border: `1px solid ${c}30`, borderRadius: 20, padding: '3px 10px', fontSize: 12 }}>{item}</span>
                  ))}
                </div>
              </div>
            )
          })}
          <Link to="/my-pdp" style={{ fontSize: 12, color: '#185FA5' }}>View full PDP →</Link>
        </div>
      )}

      {/* Recent points */}
      {points.length > 0 && (
        <div className="card" style={{ padding: 0, marginBottom: 14 }}>
          <div style={{ padding: '12px 14px', fontWeight: 600, fontSize: 13, borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between' }}>
            <span>Recent points</span>
            <span style={{ color: totalPts >= 0 ? '#1d9e75' : '#a32d2d', fontWeight: 700 }}>{totalPts > 0 ? '+' : ''}{totalPts} pts this period</span>
          </div>
          <table>
            <tbody>
              {points.slice(0,8).map((p, i) => (
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
        </div>
      )}

      {/* Recent F2F sessions */}
      {sessions.length > 0 && (
        <div className="card" style={{ padding: 0 }}>
          <div style={{ padding: '12px 14px', fontWeight: 600, fontSize: 13, borderBottom: '1px solid var(--border)' }}>Recent Fit II Fight sessions</div>
          <table>
            <thead><tr><th>Date</th><th>Weight before</th><th>Weight after</th><th>Change</th></tr></thead>
            <tbody>
              {sessions.slice(0,5).map((s, i) => {
                const wc = s.weight_before && s.weight_after ? (parseFloat(s.weight_after) - parseFloat(s.weight_before)).toFixed(1) : null
                return (
                  <tr key={i}>
                    <td style={{ fontSize: 12 }}>{new Date(s.session_date).toLocaleDateString('en-GB')}</td>
                    <td style={{ fontSize: 13 }}>{s.weight_before ? `${s.weight_before}kg` : '—'}</td>
                    <td style={{ fontSize: 13 }}>{s.weight_after  ? `${s.weight_after}kg`  : '—'}</td>
                    <td style={{ fontSize: 13, fontWeight: 600, color: wc < 0 ? '#1d9e75' : wc > 0 ? '#a32d2d' : 'var(--text-secondary)' }}>
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
  )
}
