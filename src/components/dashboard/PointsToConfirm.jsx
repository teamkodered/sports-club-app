import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase.js'

// 🏆 PBs and monthly improvements the app has spotted: a coach confirms (✓ adds the points) or
// turns them down (✗ -- e.g. a typo like an 18.3 bleep). Shows nothing when the list is empty.
let generatedThisSession = false
export default function PointsToConfirm() {
  const [rows, setRows] = useState(null)
  const [busy, setBusy] = useState(null)
  const [open, setOpen] = useState(false)   // closed until the header is pressed (slides open)
  async function load() {
    if (!generatedThisSession) { generatedThisSession = true; await supabase.rpc('kc_generate_monthly_improvements').then(() => {}, () => {}); supabase.rpc('kc_auto_checkout').then(() => {}, () => {}) }   // + close forgotten check-outs
    const { data, error } = await supabase.from('points_pending')
      .select('id, kind, label, detail, points, big_jump, created_at, students(id, members(first_name, last_name))')
      .eq('status', 'pending').order('created_at', { ascending: true }).limit(100)
    setRows(error ? [] : (data || []))
  }
  useEffect(() => { load() }, [])
  async function decide(r, ok) {
    setBusy(r.id)
    const { error } = await supabase.rpc('kc_decide_points_pending', { p_id: r.id, p_approve: ok })
    setBusy(null)
    if (error) return alert('Could not save: ' + error.message)
    setRows(prev => prev.filter(x => x.id !== r.id))
  }
  if (!rows || !rows.length) return null
  return (
    <div className="card" style={{ marginTop: 14, marginBottom: 0, border: '1px solid #EF9F2766' }}>
      <button type="button" onClick={() => setOpen(o => !o)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--text)', textAlign: 'left', fontFamily: 'var(--font-sans)' }}>
        <b style={{ fontSize: 15, flex: 1 }}>🏆 Points to confirm</b>
        <span style={{ background: '#EF9F27', color: '#fff', borderRadius: 999, fontSize: 11, fontWeight: 700, padding: '2px 8px' }}>{rows.length} waiting</span>
        <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{open ? '▲' : '▼'}</span>
      </button>
      <div className={`kc-slide${open ? ' open' : ''}`}><div>
      <div style={{ fontSize: 11, color: 'var(--text-tertiary)', margin: '8px 0 2px' }}>PBs +5 · monthly improvement +10 · ✓ gives the points, ✗ turns it down</div>
      {rows.map(r => {
        const name = `${r.students?.members?.first_name || ''} ${r.students?.members?.last_name || ''}`.trim()
        const what = r.label.replace(/ \(\d{4}-\d{2}-\d{2}\)$/, '')
        return (
          <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderTop: '1px solid var(--border)' }}>
            <span style={{ fontSize: 20 }}>{r.kind === 'pb' ? '🏆' : '📈'}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{name} — {what}</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                {r.detail} · +{r.points}
                {r.big_jump && <span style={{ color: '#E24B4A', fontWeight: 700 }}> · ⚠ big jump — check it's not a typo</span>}
              </div>
            </div>
            <button className="btn btn-sm" disabled={busy === r.id} onClick={() => decide(r, true)} style={{ background: '#1D9E75', color: '#fff', borderColor: '#1D9E75' }}>✓</button>
            <button className="btn btn-sm" disabled={busy === r.id} onClick={() => decide(r, false)}>✗</button>
          </div>
        )
      })}
      </div></div>
    </div>
  )
}
