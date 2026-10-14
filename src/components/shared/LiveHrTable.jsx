import { useEffect, useState } from 'react'
import { supabasePublic } from '../../lib/supabasePublic.js'
import { zoneOf, HR_ZONES } from '../../lib/liveHr.js'

// Live heart rate table: everyone recording right now (first name + initial),
// refreshed every 3 seconds. Used in the athlete + coach Wearables and the League board.
const HOUSE = { 'Dragon House': '#E24B4A', 'Super House': '#F5821F', 'Ice House': '#378ADD', 'Jet House': '#22B14C' }
let lastRows = null // shared between instances so a re-mounted table shows the latest straight away
export default function LiveHrTable({ dark = false, onRows, title = '❤️ Live heart rate' }) {
  const [rows, setRows] = useState(lastRows)
  useEffect(() => {
    let stop = false
    const load = async () => {
      const { data, error } = await supabasePublic.rpc('public_live_hr')
      if (stop) return
      const list = error ? [] : (data || []).sort((a, b) => (b.pct || 0) - (a.pct || 0))
      lastRows = list; setRows(list); onRows?.(list)
    }
    load(); const t = setInterval(load, 3000)
    return () => { stop = true; clearInterval(t) }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className={dark ? '' : 'card'} style={{ padding: dark ? 0 : 12, marginBottom: 12 }}>
      {!dark && <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
        <b style={{ fontSize: 15 }}>{title}</b><span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{rows == null ? 'Loading…' : `${rows.length} recording now`}</span>
      </div>}
      {rows && rows.length === 0 && <p style={{ fontSize: 12, color: dark ? '#9A9A9A' : 'var(--text-tertiary)', margin: 0 }}>Nobody is recording heart rate right now.</p>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8 }}>
        {(rows || []).map(r => {
          const z = r.bpm && r.max_hr ? zoneOf(r.bpm, r.max_hr) : null
          return (
            <div key={r.student_id} style={{ padding: '10px 12px', borderRadius: 8, background: dark ? '#1A1F24' : 'var(--bg-secondary)', border: `1px solid ${z?.colour || '#2A3138'}`, boxShadow: z ? `0 0 10px ${z.colour}55` : 'none' }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: dark ? '#fff' : 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.display_name}</div>
              <div style={{ fontSize: 9, letterSpacing: 1, color: HOUSE[r.house_name] || '#9A9A9A', textTransform: 'uppercase' }}>{r.house_name || ''}</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 4 }}>
                <span style={{ fontFamily: 'Orbitron, sans-serif', fontSize: 30, fontWeight: 800, color: z?.colour || (dark ? '#fff' : 'var(--text)') }}>{r.bpm}</span>
                <span style={{ fontSize: 11, color: '#9A9A9A' }}>bpm · {r.pct}%</span>
              </div>
              <div style={{ display: 'flex', gap: 3, height: 5, margin: '6px 0 4px' }}>
                {HR_ZONES.map(zz => <div key={zz.n} style={{ flex: 1, borderRadius: 3, background: zz.colour, opacity: z?.n === zz.n ? 1 : 0.2 }} />)}
              </div>
              <div style={{ fontSize: 10, color: '#9A9A9A' }}>{z ? `Zone ${z.n} · ${z.label}` : ''}{r.minutes ? ` · ${r.minutes} min` : ''}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
