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
      <MiniBars title="Recovery" unit="%" values={days.map(d => ({ label: lab(d), value: d.recovery_score }))} max={100} colourOf={recCol} fmt={v => Math.round(v)} />
      <MiniBars title="Sleep" values={days.map(d => ({ label: lab(d), value: d.sleep_seconds ? d.sleep_seconds / 3600 : null }))} max={10} colourOf={v => v >= 8 ? '#1D9E75' : v >= 6.5 ? '#378ADD' : '#EF9F27'} fmt={v => v.toFixed(1)} unit="h" />
      <MiniBars title="Strain" values={days.map(d => ({ label: lab(d), value: d.day_strain }))} max={21} colourOf={v => v >= 14 ? '#E24B4A' : v >= 10 ? '#EF9F27' : '#378ADD'} fmt={v => Number(v).toFixed(1)} />
      <MiniBars title="Resting heart rate" unit=" bpm" values={days.map(d => ({ label: lab(d), value: d.resting_heart_rate }))} colourOf={() => '#C93BFF'} fmt={v => Math.round(v)} />
      <button type="button" className="btn btn-sm" onClick={() => setOpen(o => !o)}>{open ? 'Hide numbers ▲' : 'Numbers ▾'}</button>
      {open && <div style={{ marginTop: 10 }}>{children}</div>}
    </div>
  )
}

// zone durations: Whoop { zone_zero_milli … zone_five_milli }, Polar [{ index, 'in-zone': 'PT..' }]
function zoneSeconds(z) {
  if (!z) return null
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
  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <h3 style={{ fontSize: 13, fontWeight: 600 }}>{s.sport_name || 'Workout'} {providerName && <span style={{ fontSize: 10, fontWeight: 400, color: providerColour || 'var(--text-tertiary)' }}>· {providerName}</span>}</h3>
        <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{s.start_time ? new Date(s.start_time).toLocaleDateString('en-GB') : '—'}{mins ? ` · ${mins} min` : ''}</span>
      </div>
      {/* heart rate gauge: average + max as % of max heart rate */}
      {(avgPct || maxPct) && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
            <span style={{ color: 'var(--text-secondary)' }}>Heart rate · % of max ({maxHr})</span>
            <span><b style={{ color: '#EF9F27' }}>avg {avgPct ?? '—'}%</b> · <b style={{ color: '#E24B4A' }}>max {maxPct ?? '—'}%</b></span>
          </div>
          <div style={{ position: 'relative', height: 14, borderRadius: 7, background: 'linear-gradient(90deg, #9A9A9A 0 50%, #378ADD 50% 60%, #1D9E75 60% 70%, #EF9F27 70% 80%, #E24B4A 80% 100%)', opacity: 0.85 }}>
            {avgPct != null && <span title={`Average ${s.avg_heart_rate} bpm`} style={{ position: 'absolute', left: `${Math.min(100, avgPct)}%`, top: -3, width: 4, height: 20, marginLeft: -2, borderRadius: 2, background: '#fff', boxShadow: '0 0 4px #000' }} />}
            {maxPct != null && <span title={`Max ${s.max_heart_rate} bpm`} style={{ position: 'absolute', left: `${Math.min(100, maxPct)}%`, top: -3, width: 4, height: 20, marginLeft: -2, borderRadius: 2, background: '#111', border: '1px solid #fff' }} />}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--text-tertiary)', marginTop: 2 }}><span>50%</span><span>70%</span><span>90%</span><span>100%</span></div>
        </div>
      )}
      {/* time in zones */}
      {zones && zTotal > 0 && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>Time in zones</div>
          <div style={{ display: 'flex', height: 12, borderRadius: 6, overflow: 'hidden' }}>
            {zones.map((v, i) => v > 0 && <div key={i} title={`Zone ${i}: ${Math.round(v / 60)} min`} style={{ width: `${(v / zTotal) * 100}%`, background: ZONE_COLOURS[i] }} />)}
          </div>
        </div>
      )}
      {/* strain bar (Whoop, 0-21) */}
      {s.strain != null && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}><span style={{ color: 'var(--text-secondary)' }}>Strain</span><b style={{ color: '#1D9E75' }}>{Number(s.strain).toFixed(1)} / 21</b></div>
          <div style={{ height: 8, borderRadius: 4, background: 'var(--border)' }}><div style={{ width: `${Math.min(100, (s.strain / 21) * 100)}%`, height: '100%', borderRadius: 4, background: '#1D9E75' }} /></div>
        </div>
      )}
      <button type="button" className="btn btn-sm" onClick={() => setOpen(o => !o)}>{open ? 'Hide numbers ▲' : 'Numbers ▾'}</button>
      {open && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, textAlign: 'center', marginTop: 10 }}>
          {[['Strain', s.strain != null ? Number(s.strain).toFixed(1) : '—'], ['Avg HR', s.avg_heart_rate ? `${s.avg_heart_rate} (${avgPct}%)` : '—'], ['Max HR', s.max_heart_rate ? `${s.max_heart_rate} (${maxPct}%)` : '—'],
            ['Calories', s.calories != null ? Math.round(s.calories) : '—'], ['Duration', mins ? `${mins} min` : '—'], ['Distance', s.distance_m ? `${(s.distance_m / 1000).toFixed(2)} km` : '—']].map(([l, v]) => (
            <div key={l}><div style={{ fontSize: 14, fontWeight: 700 }}>{v}</div><div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{l}</div></div>
          ))}
          {zones && zTotal > 0 && <div style={{ gridColumn: '1 / -1', fontSize: 11, color: 'var(--text-secondary)' }}>{zones.map((v, i) => `Z${i} ${Math.round(v / 60)}m`).join(' · ')}</div>}
        </div>
      )}
    </div>
  )
}
