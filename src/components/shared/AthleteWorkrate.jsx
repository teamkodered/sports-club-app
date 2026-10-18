import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase.js'

// "You vs team": an athlete's average heart rate per day as % of their max, against
// the team average for the same days (team_workrate_daily -- averages only).
const iso = d => d.toISOString().split('T')[0]
export default function AthleteWorkrate({ studentId, maxHr = 190, weeks = 8 }) {
  const [me, setMe] = useState(null)
  const [team, setTeam] = useState({})
  useEffect(() => {
    if (!studentId) return
    let stop = false
    const from = new Date(); from.setDate(from.getDate() - weeks * 7)
    ;(async () => {
      const [{ data: w }, { data: h }, { data: t }] = await Promise.all([
        supabase.from('wearable_workouts').select('start_time, avg_heart_rate').eq('student_id', studentId).gte('start_time', from.toISOString()),
        supabase.from('hr_sessions').select('session_date, avg_hr').eq('student_id', studentId).gte('session_date', iso(from)),
        supabase.rpc('team_workrate_daily', { p_from: iso(from) }),
      ])
      if (stop) return
      const days = {}
      for (const r of w || []) if (r.avg_heart_rate) (days[iso(new Date(r.start_time))] ||= []).push(r.avg_heart_rate)
      for (const r of h || []) if (r.avg_hr) (days[r.session_date] ||= []).push(r.avg_hr)
      setMe(Object.fromEntries(Object.entries(days).map(([d, v]) => [d, v.reduce((a, b) => a + b, 0) / v.length * 100 / maxHr])))
      setTeam(Object.fromEntries((t || []).map(r => [r.day, Number(r.avg_pct)])))
    })().catch(() => !stop && setMe({}))
    return () => { stop = true }
  }, [studentId, maxHr, weeks])
  if (me == null) return null
  const dates = Object.keys(me).sort()
  if (!dates.length) return null
  const W = 320, H = 130, pl = 28, pr = 8, pt = 10, pb = 20
  const x = i => pl + (dates.length <= 1 ? (W - pl - pr) / 2 : i * (W - pl - pr) / (dates.length - 1))
  const y = v => pt + (1 - (Math.max(50, Math.min(100, v)) - 50) / 50) * (H - pt - pb)
  const path = get => dates.map((d, i) => get(d) != null ? [x(i), y(get(d))] : null).filter(Boolean).map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')
  const myAvg = dates.reduce((a, d) => a + me[d], 0) / dates.length
  const tDays = dates.filter(d => team[d] != null), tAvg = tDays.length ? tDays.reduce((a, d) => a + team[d], 0) / tDays.length : null
  const diff = tAvg != null ? Math.round(dates.filter(d => team[d] != null).reduce((a, d) => a + me[d], 0) / (tDays.length || 1) - tAvg) : null
  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
        <h3 style={{ fontSize: 13, fontWeight: 600 }}>Heart rate % · you vs team</h3>
        <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>last {weeks} weeks</span>
      </div>
      <div style={{ display: 'flex', gap: 12, fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>
        <span style={{ color: '#EF9F27' }}>━ You · avg {Math.round(myAvg)}%</span>
        {tAvg != null && <span>┅ Team · avg {Math.round(tAvg)}%</span>}
        {diff != null && <b style={{ marginLeft: 'auto', color: diff >= 0 ? '#1D9E75' : '#E24B4A' }}>{diff >= 0 ? '+' : ''}{diff}% vs team</b>}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block' }} role="img" aria-label="Your heart rate % of max per session compared with the team average">
        {[50, 70, 90, 100].map(v => <g key={v}><line x1={pl} x2={W - pr} y1={y(v)} y2={y(v)} stroke="var(--border)" strokeWidth="1" /><text x={pl - 4} y={y(v) + 3} textAnchor="end" fontSize="9" fill="var(--text-tertiary)">{v}%</text></g>)}
        <path d={path(d => team[d])} fill="none" stroke="var(--text-tertiary)" strokeWidth="1.8" strokeDasharray="5 4" />
        <path d={path(d => me[d])} fill="none" stroke="#EF9F27" strokeWidth="2.5" strokeLinejoin="round" />
        {dates.map((d, i) => <circle key={d} cx={x(i)} cy={y(me[d])} r="3" fill="#EF9F27" />)}
        {dates.map((d, i) => (dates.length <= 7 || i % Math.ceil(dates.length / 7) === 0) && <text key={d} x={x(i)} y={H - 5} textAnchor="middle" fontSize="9" fill="var(--text-tertiary)">{new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</text>)}
      </svg>
    </div>
  )
}
