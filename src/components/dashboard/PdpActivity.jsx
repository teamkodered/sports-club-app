import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase.js'

// Coach dashboard (PDP): recent PDP actions ticked / tasks completed by the athletes, with a
// quick 👍 🔥 💪 the athlete sees next time they open the app.
const EMOJIS = ['👍', '🔥', '💪']
export default function PdpActivity({ students = [], coachName }) {
  const [rows, setRows] = useState(null)
  const [sent, setSent] = useState({}) // logId -> emoji
  const byId = Object.fromEntries(students.map(s => [s.id, s]))
  useEffect(() => {
    const ids = students.map(s => s.id)
    if (!ids.length) { setRows([]); return }
    const from = new Date(); from.setDate(from.getDate() - 7)
    ;(async () => {
      const out = []
      for (let i = 0; i < ids.length; i += 150) {
        const { data } = await supabase.from('points_log').select('id, student_id, point_type, awarded_at')
          .in('student_id', ids.slice(i, i + 150)).gte('awarded_at', from.toISOString())
          .or('point_type.like.PDP action done%,point_type.like.PDP task completed%')
        out.push(...(data || []))
      }
      out.sort((a, b) => String(b.awarded_at).localeCompare(String(a.awarded_at)))
      setRows(out.slice(0, 40))
      const { data: r } = await supabase.from('kc_reactions').select('target, student_id, emoji').gte('created_at', from.toISOString())
      const m = {}; for (const x of r || []) { const hit = out.find(o => o.student_id === x.student_id && o.point_type === x.target); if (hit) m[hit.id] = x.emoji }
      setSent(m)
    })().catch(() => setRows([]))
  }, [students.length]) // eslint-disable-line react-hooks/exhaustive-deps
  async function react(row, emoji) {
    const { error } = await supabase.from('kc_reactions').insert({ student_id: row.student_id, target: row.point_type, emoji, from_name: coachName || 'Coach' })
    if (error) { alert(/kc_reactions/.test(error.message) ? 'Reactions need a quick database update (supabase_reactions.sql).' : 'Could not send: ' + error.message); return }
    setSent(s => ({ ...s, [row.id]: emoji }))
  }
  return (
    <div className="card" style={{ padding: 12, marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
        <b style={{ fontSize: 14 }}>🎯 PDP activity · last 7 days</b>
        <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>react -- they see it in their app</span>
      </div>
      {rows == null ? <p style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Loading…</p> : !rows.length ? <p style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>No PDP actions ticked this week yet.</p> : rows.map(r => {
        const st = byId[r.student_id], what = r.point_type.replace(/^PDP (action done|task completed):?\s*/, '')
        return (
          <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0', borderTop: '1px solid var(--border)' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13 }}><b>{st?.members?.first_name} {st?.members?.last_name}</b> <span style={{ color: r.point_type.startsWith('PDP task') ? '#1D9E75' : 'var(--text-secondary)' }}>{r.point_type.startsWith('PDP task') ? 'completed' : 'did'}</span></div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{what || 'a PDP action'} · {new Date(r.awarded_at).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' })}</div>
            </div>
            {sent[r.id] ? <span style={{ fontSize: 20 }} title="Sent">{sent[r.id]}</span> : EMOJIS.map(e => (
              <button key={e} type="button" onClick={() => react(r, e)} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 8, fontSize: 18, padding: '2px 6px', cursor: 'pointer' }}>{e}</button>
            ))}
          </div>
        )
      })}
    </div>
  )
}
