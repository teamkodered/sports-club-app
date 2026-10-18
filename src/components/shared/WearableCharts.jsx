import { useState } from 'react'

// Wearables shown as charts (Oct 2026): 7-day bars (strain, sleep, recovery,
// resting HR) and workout cards with a heart rate gauge (% of max heart rate),
// zone bar and strain bar. The raw numbers are folded away under "Numbers ▾".

const ZONE_COLOURS = ['#5C6670', '#9A9A9A', '#378ADD', '#1D9E75', '#EF9F27', '#E24B4A']
const fmtH = s => s ? `${Math.floor(s / 3600)}h ${Math.round((s % 3600) / 60)}m` : '—'
const recCol = r => r == null ? '#5C6670' : r >= 67 ? '#1D9E75' : r >= 34 ? '#EF9F27' : '#E24B4A'

function MiniBars({ title, values, max, colourOf, fmt, unit }) {
  const top = max ?? Math.max(1, ...values.map(v => v.value || 0))
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>
        <b style={{ color: 'var(--text)' }}>{title}</b>
        <span>{values.length && values[values.length - 1].value != null ? `latest ${fmt(values[values.length - 1].value)}${unit || ''}` : ''}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 54 }}>
        {values.map((v, i) => (
          <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, height: '100%', justifyContent: 'flex-end' }}>
            <span style={{ fontSize: 9, color: 'var(--text-tertiary)' }}>{v.value != null ? fmt(v.value) : ''}</span>
            <div title={`${v.label}: ${v.value != null ? fmt(v.value) + (unit || '') : '—'}`} style={{ width: '100%', maxWidth: 26, borderRadius: 3, background: v.value != null ? colourOf(v.value) : 'var(--border)', height: `${v.value != null ? Math.max(6, (v.value / top) * 100) : 6}%`, opacity: v.value != null ? 1 : 0.4 }} />
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 4 }}>{values.map((v, i) => <span key={i} style={{ flex: 1, textAlign: 'center', fontSize: 9, color: 'var(--text-tertiary)' }}>{v.label}</span>)}</div>
    </div>
  )
}

export function DailyCharts({ daily = [], children }) {
  const [open, setOpen] = useState(false)
  const days = [...daily].slice(0, 7).reverse()
  const lab = d => new Date(d.day + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'narrow' })
  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <h3 style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Last 7 days</h3>
      <StrainRecovery days={days} />
      <MiniBars title="Sleep" values={days.map(d => ({ label: lab(d), value: d.sleep_seconds ? d.sleep_seconds / 3600 : null }))} max={10} colourOf={v => v >= 8 ? '#1D9E75' : v >= 6.5 ? '#378ADD' : '#EF9F27'} fmt={v => v.toFixed(1)} unit="h" />
      <MiniBars title="Resting heart rate" unit=" bpm" values={days.map(d => ({ label: lab(d), value: d.resting_heart_rate }))} colourOf={() => '#C93BFF'} fmt={v => Math.round(v)} />
      <button type="button" className="btn btn-sm" onClick={() => setOpen(o => !o)}>{open ? 'Hide numbers ▲' : 'Numbers ▾'}</button>
      {open && <div style={{ marginTop: 10 }}>{children}</div>}
    </div>
  )
}

// 7-day strain line (0-21) with each day's recovery % as a coloured dot underneath
export function StrainRecovery({ days = [] }) {
  if (!days.length) return null
  const W = 320, H = 120, pl = 22, pr = 8, pt = 14, pb = 18
  const x = i => pl + (days.length === 1 ? (W - pl - pr) / 2 : i * (W - pl - pr) / (days.length - 1))
  const y = v => pt + (1 - Math.min(21, v) / 21) * (H - pt - pb)
  const pts = days.map((d, i) => d.day_strain != null ? [x(i), y(d.day_strain), d.day_strain] : null)
  const line = pts.filter(Boolean).map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')
  const lab = d => new Date(d.day + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short' })
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', gap: 14, fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 12, height: 3, background: '#378ADD' }} />Strain (0-21)</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 10, height: 10, borderRadius: '50%', background: '#EF9F27' }} />Recovery %</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block' }} role="img" aria-label="Strain over the last 7 days">
        {[0, 7, 14, 21].map(v => <g key={v}><line x1={pl} x2={W - pr} y1={y(v)} y2={y(v)} stroke="var(--border)" strokeWidth="1" /><text x={pl - 4} y={y(v) + 3} textAnchor="end" fontSize="9" fill="var(--text-tertiary)">{v}</text></g>)}
        {line && <path d={line} fill="none" stroke="#378ADD" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />}
        {pts.map((p, i) => p && <g key={i}><circle cx={p[0]} cy={p[1]} r="4" fill="#378ADD" stroke="var(--bg-secondary, #1A1F24)" strokeWidth="2" /><text x={p[0]} y={p[1] - 7} textAnchor="middle" fontSize="9" fontWeight="700" fill="#378ADD">{Number(p[2]).toFixed(1)}</text></g>)}
        {days.map((d, i) => <text key={i} x={x(i)} y={H - 4} textAnchor="middle" fontSize="9" fill="var(--text-tertiary)">{lab(d)}</text>)}
      </svg>
      <div style={{ display: 'grid', gridTemplateColumns: `${pl}px repeat(${days.length}, 1fr) ${pr}px`, alignItems: 'center', marginTop: 2 }}>
        <span />
        {days.map((d, i) => (
          <span key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
            <span style={{ width: 11, height: 11, borderRadius: '50%', background: recCol(d.recovery_score), opacity: d.recovery_score == null ? 0.35 : 1 }} />
            <span style={{ fontSize: 9, color: 'var(--text-tertiary)' }}>{d.recovery_score != null ? `${Math.round(d.recovery_score)}%` : '–'}</span>
          </span>
        ))}
        <span />
      </div>
    </div>
  )
}

// heart rate curve from saved samples (app-recorded sessions), coloured by zone
function HrCurve({ samples, maxHr }) {
  if (!Array.isArray(samples) || samples.length < 3) return null
  const W = 320, H = 110, pl = 26, pr = 6, pt = 8, pb = 8
  const lo = Math.max(40, Math.min(...samples) - 10), hi = Math.max(...samples) + 6
  const x = i => pl + i * (W - pl - pr) / (samples.length - 1)
  const y = v => pt + (1 - (v - lo) / (hi - lo)) * (H - pt - pb)
  const zc = v => { const r = v / maxHr; return r >= 0.9 ? '#E24B4A' : r >= 0.8 ? '#EF9F27' : r >= 0.7 ? '#1D9E75' : r >= 0.6 ? '#378ADD' : '#9A9A9A' }
  const ticks = [lo, Math.round((lo + hi) / 2), hi].map(Math.round)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block', marginBottom: 10 }} role="img" aria-label="Heart rate during the session">
      {ticks.map(v => <g key={v}><line x1={pl} x2={W - pr} y1={y(v)} y2={y(v)} stroke="var(--border)" strokeWidth="1" /><text x={pl - 4} y={y(v) + 3} textAnchor="end" fontSize="9" fill="var(--text-tertiary)">{v}</text></g>)}
      {samples.slice(1).map((v, i) => <line key={i} x1={x(i)} y1={y(samples[i])} x2={x(i + 1)} y2={y(v)} stroke={zc(v)} strokeWidth="2.2" strokeLinecap="round" />)}
    </svg>
  )
}

// zone durations: Whoop { zone_zero_milli … zone_five_milli }, Polar [{ index, 'in-zone': 'PT..' }]
function zoneSeconds(z) {
  if (!z) return null
  if (!Array.isArray(z) && ('z1' in z || 'z2' in z || 'z3' in z || 'z4' in z || 'z5' in z)) return [0, 1, 2, 3, 4, 5].map(i => (z[`z${i}`] || 0) * 60)
  if (Array.isArray(z)) {
    const out = [0, 0, 0, 0, 0, 0]
    for (const r of z) { const m = /PT(?:(\d+)H)?(?:(\d+)M)?(?:([\d.]+)S)?/.exec(r['in-zone'] || ''); if (m && r.index != null) out[Math.min(5, r.index)] += (+(m[1] || 0)) * 3600 + (+(m[2] || 0)) * 60 + (+(m[3] || 0)) }
    return out
  }
  const keys = ['zone_zero_milli', 'zone_one_milli', 'zone_two_milli', 'zone_three_milli', 'zone_four_milli', 'zone_five_milli']
  return keys.map(k => (z[k] || 0) / 1000)
}

export function WorkoutCard({ s, maxHr = 190, providerColour, providerName }) {
  const [open, setOpen] = useState(false)
  const avgPct = s.avg_heart_rate ? Math.round(s.avg_heart_rate * 100 / maxHr) : null
  const maxPct = s.max_heart_rate ? Math.round(s.max_heart_rate * 100 / maxHr) : null
  const zones = zoneSeconds(s.zone_durations)
  const zTotal = zones ? zones.reduce((a, b) => a + b, 0) : 0
  const mins = s.duration_seconds ? Math.round(s.duration_seconds / 60) : (s.start_time && s.end_time ? Math.round((new Date(s.end_time) - new Date(s.start_time)) / 60000) : null)
  const t = d => d ? new Date(d).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : ''
  const ZN = [null, ['Zone 1', 0.5], ['Zone 2', 0.6], ['Zone 3', 0.7], ['Zone 4', 0.8], ['Zone 5', 0.9]]
  const mmss = sec => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`
  return (
    <div className="card wear-card">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>{s.sport_name || 'Workout'} {providerName && <span style={{ fontSize: 10, fontWeight: 400, color: providerColour || 'var(--text-tertiary)' }}>· {providerName}</span>}</div>
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{s.start_time ? new Date(s.start_time).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) : s.session_date || ''}{s.start_time && s.end_time ? ` · ${t(s.start_time)} to ${t(s.end_time)}` : ''}{mins ? ` · ${mins} min` : ''}</div>
        </div>
        {s.strain != null && <div style={{ textAlign: 'right' }}><div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: 24, fontWeight: 800, color: '#378ADD', lineHeight: 1 }}>{Number(s.strain).toFixed(1)}</div><div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>strain</div></div>}
      </div>
      {(avgPct || maxPct) && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8, marginBottom: 10 }}>
          {[['Avg heart rate', s.avg_heart_rate, avgPct, '#EF9F27'], ['Max heart rate', s.max_heart_rate, maxPct, '#E24B4A']].map(([l, v, p, c]) => (
            <div key={l} style={{ background: 'var(--bg-secondary)', borderRadius: 8, padding: '8px 10px' }}>
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{l}</div>
              <div><b style={{ fontFamily: 'Orbitron, sans-serif', fontSize: 18, color: c }}>{v ?? '—'}</b> {p != null && <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{p}% of max</span>}</div>
            </div>
          ))}
        </div>
      )}
      <HrCurve samples={s.samples} maxHr={maxHr} />
      {zones && zTotal > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginBottom: 8 }}>
          {[5, 4, 3, 2, 1].map(i => {
            const sec = zones[i] || 0, pct = Math.round(sec * 100 / zTotal)
            if (!sec) return null
            const lo = Math.round(maxHr * ZN[i][1]), hi = i < 5 ? Math.round(maxHr * ZN[i + 1][1]) - 1 : null
            return (
              <div key={i}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 3 }}>
                  <span><b>{ZN[i][0]}</b> <span style={{ color: 'var(--text-tertiary)' }}>{hi ? `${lo}-${hi}` : `${lo}+`} bpm · <span style={{ color: ZONE_COLOURS[i] }}>{pct}%</span></span></span>
                  <b style={{ fontFamily: 'Orbitron, sans-serif', fontSize: 11 }}>{mmss(sec)}</b>
                </div>
                <div style={{ height: 9, borderRadius: 5, background: 'var(--bg-secondary)' }}><div style={{ width: `${Math.max(3, pct)}%`, height: '100%', borderRadius: 5, background: ZONE_COLOURS[i] }} /></div>
              </div>
            )
          })}
        </div>
      )}
      <button type="button" className="btn btn-sm" onClick={() => setOpen(o => !o)}>{open ? 'Hide numbers ▲' : 'Numbers ▾'}</button>
      {open && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, textAlign: 'center', marginTop: 10 }}>
          {[['Strain', s.strain != null ? Number(s.strain).toFixed(1) : '—'], ['Avg HR', s.avg_heart_rate ? `${s.avg_heart_rate} (${avgPct}%)` : '—'], ['Max HR', s.max_heart_rate ? `${s.max_heart_rate} (${maxPct}%)` : '—'],
            ['Calories', s.calories != null ? Math.round(s.calories) : '—'], ['Duration', mins ? `${mins} min` : '—'], ['Distance', s.distance_m ? `${(s.distance_m / 1000).toFixed(2)} km` : '—']].map(([l, v]) => (
            <div key={l}><div style={{ fontSize: 14, fontWeight: 700 }}>{v}</div><div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{l}</div></div>
          ))}
        </div>
      )}
    </div>
  )
}

// app-recorded heart rate sessions (hr_sessions) shaped like wearable workouts
export const hrSessionAsWorkout = h => ({
  id: 'hr-' + h.id, sport_name: `Heart rate session${h.device ? ` (${/whoop/i.test(h.device) ? 'Whoop' : /polar/i.test(h.device) ? 'Polar H10' : h.device})` : ''}`,
  start_time: h.created_at && h.minutes ? new Date(new Date(h.created_at).getTime() - h.minutes * 60000).toISOString() : h.created_at, end_time: h.created_at,
  duration_seconds: (h.minutes || 0) * 60, avg_heart_rate: h.avg_hr, max_heart_rate: h.max_hr, zone_durations: h.zones, samples: h.samples, provider: 'app',
})
