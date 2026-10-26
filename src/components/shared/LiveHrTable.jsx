import { useEffect, useState } from 'react'
import { supabasePublic } from '../../lib/supabasePublic.js'
import { zoneOf, HR_ZONES } from '../../lib/liveHr.js'

// Live heart rate table: everyone recording right now (first name + initial),
// refreshed every 3 seconds. Used in the athlete + coach Wearables and the League board.
const HOUSE = { 'Dragon House': '#E24B4A', 'Super House': '#F5821F', 'Ice House': '#378ADD', 'Jet House': '#22B14C' }
let lastRows = null // shared between instances so a re-mounted table shows the latest straight away
export default function LiveHrTable({ dark = false, onRows, title = '❤️ Live heart rate', meId = null }) {
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
  const list = rows || []
  const avg = list.length ? Math.round(list.reduce((n, r) => n + (r.pct || 0), 0) / list.length) : null
  const zoneCounts = HR_ZONES.map(zz => ({ ...zz, n2: list.filter(r => r.bpm && r.max_hr && zoneOf(r.bpm, r.max_hr)?.n === zz.n).length }))
  const txt = dark ? '#fff' : 'var(--text)', sub = '#9A9A9A', card = dark ? '#1A1F24' : 'var(--bg-secondary)'
  return (
    <div className={dark ? '' : 'card'} style={{ padding: dark ? 0 : 12, marginBottom: 12 }}>
      {!dark && <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
        <b style={{ fontSize: 15 }}>{title}</b><span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{rows == null ? 'Loading…' : `${list.length} recording now`}</span>
      </div>}
      {rows && list.length === 0 && <p style={{ fontSize: 12, color: dark ? sub : 'var(--text-tertiary)', margin: 0 }}>Nobody is recording heart rate right now.</p>}
      {list.length > 0 && (
        // team at a glance: how many are working in each zone + the team average
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <div style={{ flex: 1, display: 'flex', height: 10, borderRadius: 5, overflow: 'hidden', background: card }}>
            {zoneCounts.filter(z => z.n2).map(z => <div key={z.n} title={`Zone ${z.n}: ${z.n2}`} style={{ flex: z.n2, background: z.colour }} />)}
          </div>
          <span style={{ fontFamily: 'Orbitron, sans-serif', fontSize: 13, color: txt, whiteSpace: 'nowrap' }}>team {avg}%</span>
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {list.map((r, i) => {
          const z = r.bpm && r.max_hr ? zoneOf(r.bpm, r.max_hr) : null, me = meId && r.student_id === meId
          return (
            <div key={r.student_id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 8, background: card,
              border: `1px solid ${me ? (z?.colour || '#F5C542') : '#2A3138'}`, boxShadow: me ? `0 0 10px ${z?.colour || '#F5C542'}66` : 'none' }}>
              <span style={{ fontFamily: 'Orbitron, sans-serif', fontSize: 12, width: 18, textAlign: 'center', color: sub }}>{i + 1}</span>
              <div style={{ width: 92, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: txt, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.display_name}</div>
                <div style={{ fontSize: 9, letterSpacing: 1, color: HOUSE[r.house_name] || sub, textTransform: 'uppercase', whiteSpace: 'nowrap', overflow: 'hidden' }}>{r.house_name ? r.house_name.replace(' House', '') : ''}{r.minutes ? ` · ${r.minutes}m` : ''}</div>
              </div>
              {/* % of max as a bar in the zone colour */}
              <div style={{ flex: 1, height: 22, borderRadius: 6, background: dark ? '#0E1114' : 'var(--bg)', position: 'relative', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', inset: 0, width: `${Math.min(100, r.pct || 0)}%`, background: z?.colour || '#666', opacity: 0.85, transition: 'width 0.8s ease' }} />
                <span style={{ position: 'absolute', left: 8, top: 2, fontFamily: 'Orbitron, sans-serif', fontSize: 12, fontWeight: 800, color: '#fff', textShadow: '0 1px 2px #000' }}>{r.pct}%</span>
                <span style={{ position: 'absolute', right: 8, top: 4, fontSize: 10, color: '#fff', textShadow: '0 1px 2px #000' }}>{z ? `Z${z.n}` : ''}</span>
              </div>
              <span style={{ fontFamily: 'Orbitron, sans-serif', fontSize: 20, fontWeight: 800, color: z?.colour || txt, minWidth: 44, textAlign: 'right' }}>{r.bpm}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
