import { useState } from 'react'

// 📊 Where someone's points come from: grouped by type, biggest first, with an app / coach split.
// Shown in the points pop-up (League) -- open by default, press to hide.
const APP_RE = /^(F2F question|PDP|Self check|Weigh (in|out)|Full check-in|Weekly target|Test|Bleep|PB:|Monthly improvement)/i
// "undone" / "cleared" entries net off against the award they cancel (one line per type)
const groupOf = t => String(t || 'Other').split(':')[0].replace(/\s*\(.*\)\s*$/, '').replace(/\s+undone$/i, '').replace(/^F2F question cleared/i, 'F2F question logged').trim() || 'Other'
const isUndo = t => /undone|cleared/i.test(String(t || '').split(':')[0])

export default function PointsBreakdown({ rows }) {
  const [open, setOpen] = useState(true)
  const by = {}
  let app = 0, coach = 0
  for (const r of rows || []) {
    const g = groupOf(r.point_type), p = Number(r.points_awarded || 0)
    const x = (by[g] ||= { pts: 0, n: 0, app: APP_RE.test(r.point_type || '') })
    x.pts += p; if (isUndo(r.point_type)) x.u = (x.u || 0) + 1; else x.n++
    if (APP_RE.test(r.point_type || '')) app += p; else coach += p
  }
  const list = Object.entries(by).sort((a, b) => b[1].pts - a[1].pts)
  const max = Math.max(1, ...list.map(([, v]) => Math.abs(v.pts)))
  const total = app + coach
  return (
    <div className="card" style={{ marginBottom: 12, padding: 12 }}>
      <button type="button" onClick={() => setOpen(o => !o)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--text)', fontFamily: 'var(--font-sans)', textAlign: 'left' }}>
        <b style={{ flex: 1, fontSize: 14 }}>📊 Where the points come from</b>
        <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{open ? '▲' : '▼'}</span>
      </button>
      <div className={`kc-slide${open ? ' open' : ''}`}><div>
        {/* app vs coach */}
        <div style={{ display: 'flex', height: 10, borderRadius: 5, overflow: 'hidden', margin: '10px 0 4px', background: 'var(--bg-secondary)' }}>
          <div style={{ width: `${total ? Math.max(0, coach) / Math.max(1, Math.abs(app) + Math.abs(coach)) * 100 : 0}%`, background: '#378ADD' }} />
          <div style={{ width: `${total ? Math.max(0, app) / Math.max(1, Math.abs(app) + Math.abs(coach)) * 100 : 0}%`, background: '#EF9F27' }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 8 }}>
          <span style={{ color: '#378ADD', fontWeight: 700 }}>🧑‍🏫 Coach {coach} pts{total ? ` (${Math.round(coach / total * 100)}%)` : ''}</span>
          <span style={{ color: '#EF9F27', fontWeight: 700 }}>📱 App {app} pts{total ? ` (${Math.round(app / total * 100)}%)` : ''}</span>
        </div>
        {list.map(([g, v]) => (
          <div key={g} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, padding: '3px 0' }}>
            <span style={{ width: '42%', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.app ? '📱' : '🧑‍🏫'} {g}</span>
            <div style={{ flex: 1, height: 8, background: 'var(--bg-secondary)', borderRadius: 4, overflow: 'hidden' }}>
              <div style={{ width: `${Math.abs(v.pts) / max * 100}%`, height: '100%', background: v.pts < 0 ? '#E24B4A' : v.app ? '#EF9F27' : '#378ADD' }} />
            </div>
            <span style={{ width: 70, textAlign: 'right', fontWeight: 700, color: v.pts < 0 ? '#E24B4A' : 'var(--text)' }}>{v.pts > 0 ? '+' : ''}{v.pts}</span>
            <span style={{ width: 34, textAlign: 'right', color: 'var(--text-tertiary)' }} title={v.u ? `${v.n} given, ${v.u} taken back (unticked)` : undefined}>×{v.n - (v.u || 0)}</span>
          </div>
        ))}
      </div></div>
    </div>
  )
}
