import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase.js'

// Coach Wearables "Over time": workrate per session across the weeks -- average heart
// rate as % of each athlete's max (from wearable workouts + heart rate sessions recorded
// in the app). Team average line, tap athletes to compare their own lines.
const COLS = ['#EF9F27', '#1D9E75', '#C93BFF', '#E24B4A']
const APP = 'Recorded in app' // heart rate sessions recorded in Klass Champ (class check-in or started by hand)
const maxHrOf = s => { const d = s?.members?.date_of_birth; if (!d) return 190; const b = new Date(d), n = new Date(); return Math.max(150, 220 - (n.getFullYear() - b.getFullYear() - ((n.getMonth() < b.getMonth() || (n.getMonth() === b.getMonth() && n.getDate() < b.getDate())) ? 1 : 0))) }
const iso = d => d.toISOString().split('T')[0]

export default function TeamWorkrate({ students = [], onOpen }) {
  const [weeks, setWeeks] = useState(8)
  const [rows, setRows] = useState(null) // { student_id, date, pct, strain }
  const [picked, setPicked] = useState([])
  const [openSid, setOpenSid] = useState(null) // athlete quick view (slide down)
  // Activity filter -- the same buttons + remembered choice as View by day (e.g. Boxing / Kickboxing / Martial arts)
  const [sportSel, setSportSel] = useState(() => { try { return JSON.parse(localStorage.getItem('kc_wear_sports') || '[]') } catch { return [] } })
  const saveSel = next => { setSportSel(next); try { localStorage.setItem('kc_wear_sports', JSON.stringify(next)) } catch { /* ignore */ } }
  const toggleSport = sp => saveSel(sportSel.includes(sp) ? sportSel.filter(x => x !== sp) : [...sportSel, sp])
  const sports = useMemo(() => [...new Set([...(rows || []).map(r => r.sport), ...sportSel])].sort((a, b) => (a === APP) - (b === APP) || a.localeCompare(b)), [rows, sportSel])
  const shown = useMemo(() => rows && (sportSel.length ? rows.filter(r => sportSel.includes(r.sport)) : rows), [rows, sportSel])
  const byId = useMemo(() => Object.fromEntries(students.map(s => [s.id, s])), [students])

  useEffect(() => {
    let stop = false
    setRows(null)
    ;(async () => {
      const from = new Date(); from.setDate(from.getDate() - weeks * 7)
      const ids = students.map(s => s.id)
      const out = []
      for (let i = 0; i < ids.length; i += 150) {
        const part = ids.slice(i, i + 150)
        const [{ data: w }, { data: h }] = await Promise.all([
          supabase.from('wearable_workouts').select('student_id, start_time, avg_heart_rate, strain, sport_name').in('student_id', part).gte('start_time', from.toISOString()),
          supabase.from('hr_sessions').select('student_id, session_date, avg_hr').in('student_id', part).gte('session_date', iso(from)),
        ])
        for (const r of w || []) if (r.avg_heart_rate) out.push({ student_id: r.student_id, date: iso(new Date(r.start_time)), pct: r.avg_heart_rate * 100 / maxHrOf(byId[r.student_id]), strain: r.strain, sport: (r.sport_name || 'Other').trim() })
        for (const r of h || []) if (r.avg_hr) out.push({ student_id: r.student_id, date: r.session_date, pct: r.avg_hr * 100 / maxHrOf(byId[r.student_id]), strain: null, sport: APP })
      }
      if (!stop) setRows(out)
    })().catch(() => !stop && setRows([]))
    return () => { stop = true }
  }, [weeks, students.length]) // eslint-disable-line react-hooks/exhaustive-deps

  // one point per athlete per day (their average that day), team = average of athletes that day
  const { dates, team, per, table } = useMemo(() => {
    if (!shown) return { dates: [], team: {}, per: {}, table: [] }
    const per = {}
    for (const r of shown) { ((per[r.student_id] ||= {})[r.date] ||= []).push(r) }
    const perAvg = {}
    for (const [sid, days] of Object.entries(per)) perAvg[sid] = Object.fromEntries(Object.entries(days).map(([d, list]) => [d, list.reduce((a, b) => a + b.pct, 0) / list.length]))
    const dates = [...new Set(shown.map(r => r.date))].sort()
    const team = Object.fromEntries(dates.map(d => { const v = Object.values(perAvg).map(x => x[d]).filter(v => v != null); return [d, v.reduce((a, b) => a + b, 0) / v.length] }))
    const table = Object.entries(per).map(([sid, days]) => {
      const all = Object.values(days).flat(), pcts = Object.values(perAvg[sid]), strains = all.map(r => r.strain).filter(v => v != null)
      return { sid, s: byId[sid], sessions: pcts.length, avg: pcts.reduce((a, b) => a + b, 0) / pcts.length, best: Math.max(...pcts), strain: strains.length ? strains.reduce((a, b) => a + b, 0) / strains.length : null }
    }).filter(r => r.s).sort((a, b) => b.avg - a.avg)
    return { dates, team, per: perAvg, table }
  }, [shown, byId])

  const W = 340, H = 170, pl = 28, pr = 8, pt = 10, pb = 22
  const lo = 50, hi = 100
  const x = i => pl + (dates.length <= 1 ? (W - pl - pr) / 2 : i * (W - pl - pr) / (dates.length - 1))
  const y = v => pt + (1 - (Math.max(lo, Math.min(hi, v)) - lo) / (hi - lo)) * (H - pt - pb)
  const path = series => dates.map((d, i) => series[d] != null ? [x(i), y(series[d])] : null).filter(Boolean).map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')
  const name = s => `${s?.members?.first_name || ''} ${s?.members?.last_name || ''}`.trim()
  const toggle = sid => setPicked(p => p.includes(sid) ? p.filter(x => x !== sid) : p.length >= 4 ? [...p.slice(1), sid] : [...p, sid])

  return (
    <div className="card" style={{ padding: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
        <b style={{ fontSize: 14, flex: 1 }}>📈 Workrate over time</b>
        {[4, 8, 12].map(w => <button key={w} type="button" className={weeks === w ? 'btn btn-sm btn-primary' : 'btn btn-sm'} onClick={() => setWeeks(w)}>{w} wk</button>)}
      </div>
      {sports.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
          <button type="button" className={sportSel.length === 0 ? 'btn btn-sm btn-primary' : 'btn btn-sm'} onClick={() => saveSel([])}>All</button>
          {sports.map(sp => <button key={sp} type="button" className={sportSel.includes(sp) ? 'btn btn-sm btn-primary' : 'btn btn-sm'} onClick={() => toggleSport(sp)}>{sp === APP ? '❤️ ' + sp : sp}</button>)}
        </div>
      )}
      <p style={{ fontSize: 11, color: 'var(--text-tertiary)', margin: '0 0 6px' }}>{sportSel.length ? `Only: ${sportSel.join(', ')}. ` : 'All activities. '}Average heart rate per session as % of each athlete's max (age-based). White = team average. Tap an athlete for their quick view (compare on the chart or open their profile from there).</p>
      {rows == null ? <p style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Loading…</p> : !dates.length ? <p style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>No heart rate sessions in this period yet.</p> : (
        <>
          <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block' }} role="img" aria-label="Team workrate over time">
            {[50, 60, 70, 80, 90, 100].map(v => <g key={v}><line x1={pl} x2={W - pr} y1={y(v)} y2={y(v)} stroke="var(--border)" strokeWidth="1" /><text x={pl - 4} y={y(v) + 3} textAnchor="end" fontSize="9" fill="var(--text-tertiary)">{v}%</text></g>)}
            <path d={path(team)} fill="none" stroke="var(--text)" strokeWidth="2.5" strokeLinejoin="round" />
            {dates.map((d, i) => team[d] != null && <circle key={d} cx={x(i)} cy={y(team[d])} r="3" fill="var(--text)" />)}
            {picked.map((sid, k) => per[sid] && <g key={sid}><path d={path(per[sid])} fill="none" stroke={COLS[k]} strokeWidth="2" strokeDasharray={k % 2 ? '5 3' : undefined} />
              {dates.map((d, i) => per[sid][d] != null && <circle key={d} cx={x(i)} cy={y(per[sid][d])} r="3" fill={COLS[k]} />)}</g>)}
            {dates.map((d, i) => (dates.length <= 8 || i % Math.ceil(dates.length / 8) === 0) && <text key={d} x={x(i)} y={H - 6} textAnchor="middle" fontSize="9" fill="var(--text-tertiary)">{new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</text>)}
          </svg>
          {picked.length > 0 && <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 11, margin: '4px 0' }}>{picked.map((sid, k) => <span key={sid} style={{ color: COLS[k] }}>━ {name(byId[sid])}</span>)}</div>}
          <div style={{ marginTop: 8 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 52px 56px 56px', gap: 4, fontSize: 10, color: 'var(--text-tertiary)', padding: '0 0 4px' }}><span>Athlete</span><span>Sessions</span><span>Avg</span><span>Best</span></div>
            {table.map(r => {
              const k = picked.indexOf(r.sid), isOpen = openSid === r.sid
              const mine = dates.filter(d => per[r.sid]?.[d] != null)
              const last = mine[mine.length - 1]
              const vsTeam = Math.round(r.avg - (mine.reduce((a, d) => a + (team[d] || 0), 0) / (mine.length || 1)))
              return (
                <div key={r.sid} style={{ borderTop: '1px solid var(--border)' }}>
                  <div onClick={() => setOpenSid(o => o === r.sid ? null : r.sid)} style={{ display: 'grid', gridTemplateColumns: '1fr 52px 56px 56px', gap: 4, alignItems: 'center', padding: '7px 0', cursor: 'pointer', fontSize: 13 }}>
                    <span style={{ fontWeight: k >= 0 || isOpen ? 700 : 400, color: k >= 0 ? COLS[k] : 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{isOpen ? '▾' : '▸'} {name(r.s)}</span>
                    <span style={{ fontFamily: 'Orbitron, sans-serif', fontSize: 11 }}>{r.sessions}</span>
                    <span style={{ fontFamily: 'Orbitron, sans-serif', fontSize: 11, color: '#EF9F27' }}>{Math.round(r.avg)}%</span>
                    <span style={{ fontFamily: 'Orbitron, sans-serif', fontSize: 11, color: '#E24B4A' }}>{Math.round(r.best)}%</span>
                  </div>
                  {/* quick view: their own stats + mini trend, compare / open profile */}
                  <div style={{ maxHeight: isOpen ? 260 : 0, overflow: 'hidden', transition: 'max-height 0.3s ease' }}>
                    <div style={{ padding: '4px 0 10px' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 6, marginBottom: 8 }}>
                        {[['Average workrate', `${Math.round(r.avg)}%`, '#EF9F27'], ['Best session', `${Math.round(r.best)}%`, '#E24B4A'],
                          ['vs team (same days)', `${vsTeam > 0 ? '+' : ''}${vsTeam}%`, vsTeam >= 0 ? '#1D9E75' : '#E24B4A'], ['Avg strain', r.strain != null ? r.strain.toFixed(1) : '—', '#378ADD']].map(([l, v, c]) => (
                          <div key={l} style={{ background: 'var(--bg-secondary)', borderRadius: 8, padding: '6px 8px' }}>
                            <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{l}</div>
                            <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: 15, fontWeight: 700, color: c }}>{v}</div>
                          </div>
                        ))}
                      </div>
                      {mine.length > 1 && (() => {
                        const w = 300, h = 46, px = i => 4 + i * (w - 8) / (mine.length - 1), py = v => 4 + (1 - (Math.max(50, Math.min(100, v)) - 50) / 50) * (h - 8)
                        return (
                          <svg viewBox={`0 0 ${w} ${h}`} width="100%" style={{ display: 'block', marginBottom: 6 }} aria-label="Their workrate per session">
                            <path d={mine.map((d, i) => `${i ? 'L' : 'M'}${px(i).toFixed(1)},${py(team[d]).toFixed(1)}`).join(' ')} fill="none" stroke="var(--text-tertiary)" strokeWidth="1.5" strokeDasharray="4 3" />
                            <path d={mine.map((d, i) => `${i ? 'L' : 'M'}${px(i).toFixed(1)},${py(per[r.sid][d]).toFixed(1)}`).join(' ')} fill="none" stroke="#EF9F27" strokeWidth="2.2" strokeLinejoin="round" />
                            {mine.map((d, i) => <circle key={d} cx={px(i)} cy={py(per[r.sid][d])} r="2.5" fill="#EF9F27" />)}
                          </svg>
                        )
                      })()}
                      <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 8 }}>{r.sessions} session{r.sessions === 1 ? '' : 's'}{last ? ` · last ${new Date(last + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : ''} · dashed = team</div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button type="button" className="btn btn-sm" style={{ borderColor: k >= 0 ? COLS[k] : undefined, color: k >= 0 ? COLS[k] : undefined }} onClick={() => toggle(r.sid)}>{k >= 0 ? '✓ On the chart' : '📈 Compare on chart'}</button>
                        {onOpen && <button type="button" className="btn btn-sm btn-primary" style={{ marginLeft: 'auto' }} onClick={() => onOpen(r.s)}>Open profile ›</button>}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
