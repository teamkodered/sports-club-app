import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase.js'
import { ownAttendanceRate, toLocalISO } from '../../lib/attendanceDays.js'

// Coach dashboard "Needs attention" (Oct 2026): who to follow up, in priority order --
//   1. low attendance (under 50% over the last 4 weeks)
//   2. no F2F logged in the last 7 days
//   3. overdue PDP to-dos (sent to a date that has passed, not ticked off)
//   4. weight off target (in comp, latest weigh-in above their target weight)
//   5. wearables not syncing (connected, no sync for 3+ days)
// One tap on a name opens the athlete.

const LOW_ATT = 50
const daysAgo = n => { const d = new Date(); d.setDate(d.getDate() - n); return toLocalISO(d) }
const chunk = (arr, n) => { const out = []; for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out }
async function inAll(table, select, ids, extra = q => q) {
  const rows = []
  for (const part of chunk(ids, 150)) { const { data } = await extra(supabase.from(table).select(select).in('student_id', part)); rows.push(...(data || [])) }
  return rows
}

export default function NeedsAttention({ athletes = [], onOpen }) {
  const [data, setData] = useState(null)
  const [open, setOpen] = useState({})
  const ids = useMemo(() => athletes.map(a => a.id), [athletes])
  const idsKey = ids.slice().sort().join(',')

  useEffect(() => {
    if (!ids.length) { setData({}); return }
    let cancelled = false
    ;(async () => {
      const today = toLocalISO(new Date()), from28 = daysAgo(28), from7 = daysAgo(7)
      const [att, asg, hol, f2f, profiles, ts, wear] = await Promise.all([
        inAll('attendance', 'student_id, session_date, attendance_type', ids, q => q.gte('session_date', from28)),
        inAll('student_class_assignments', '*, classes(id, day_of_week)', ids),
        supabase.from('holidays').select('*').then(r => r.data || []),
        inAll('fit2fight_sessions', 'student_id, session_date, weight_before, weight_after', ids, q => q.gte('session_date', daysAgo(90))),
        inAll('athlete_profiles', 'student_id, pdp_notes, weight_division, weight_target_override', ids),
        supabase.from('team_settings').select('key, value').in('key', ['weight_target_pct_in_comp', 'weight_target_pct_out_comp', 'weight_target_active_mode']).then(r => r.data || []),
        inAll('wearable_connections', 'student_id, provider, last_sync_at', ids).catch(() => []),
      ])
      if (cancelled) return
      const by = (rows, key = 'student_id') => rows.reduce((m, r) => ((m[r[key]] ||= []).push(r), m), {})
      const attBy = by(att), asgBy = by(asg), f2fBy = by(f2f), profBy = Object.fromEntries(profiles.map(p => [p.student_id, p])), wearBy = by(wear)
      const tsm = Object.fromEntries(ts.map(r => [r.key, r.value]))
      const mode = tsm.weight_target_active_mode || 'in_comp'
      const pct = mode === 'in_comp' ? (parseFloat(tsm.weight_target_pct_in_comp) || 0.025) : (parseFloat(tsm.weight_target_pct_out_comp) || 0.05)

      const low = [], noF2f = [], pdp = [], weight = [], sync = []
      for (const a of athletes) {
        // 1. attendance (last 4 weeks)
        const r = ownAttendanceRate({ rows: attBy[a.id] || [], assignments: asgBy[a.id] || [], holidays: hol, studentId: a.id, from: from28, to: today, today })
        const rate = r?.pct ?? (r && (r.attended + r.missed) ? Math.round(r.attended / (r.attended + r.missed) * 100) : null)
        if (rate != null && rate < LOW_ATT) low.push({ a, note: `${rate}% attendance (4 weeks)`, sort: rate })
        // 2. no F2F in 7 days
        const recent = (f2fBy[a.id] || []).filter(s => s.session_date >= from7)
        if (!recent.length) {
          const last = (f2fBy[a.id] || []).map(s => s.session_date).sort().pop()
          noF2f.push({ a, note: last ? `last logged ${new Date(last + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : 'nothing logged recently', sort: last || '' })
        }
        // 3. overdue PDP to-dos
        const notes = profBy[a.id]?.pdp_notes || {}
        let overdue = 0
        for (const k of Object.keys(notes)) {
          if (!k.startsWith('__timetable_') || !k.endsWith('what_to_do')) continue
          const sec = k.replace('__timetable_', '')
          const done = new Set(notes[`__completed_${sec}`] || [])
          const still = new Set(notes[sec] || [])
          for (const [item, e] of Object.entries(notes[k] || {})) if (e?.date && e.date < today && still.has(item) && !done.has(item)) overdue++
        }
        if (overdue) pdp.push({ a, note: `${overdue} overdue to-do${overdue === 1 ? '' : 's'}`, sort: -overdue })
        // 4. weight off target (in comp)
        if (a.in_comp) {
          const ws = (f2fBy[a.id] || []).filter(s => (s.weight_after ?? s.weight_before) != null).sort((x, y) => x.session_date.localeCompare(y.session_date))
          const current = ws.length ? (ws[ws.length - 1].weight_after ?? ws[ws.length - 1].weight_before) : null
          const m = profBy[a.id]?.weight_division?.match(/([+-]?)\s*([\d.]+)/)
          if (current != null && m && m[1] !== '+') {
            const base = parseFloat(m[2]), ov = profBy[a.id]?.weight_target_override
            let target = +(base * (1 + pct)).toFixed(1)
            if (ov?.type === 'actual' && ov.value) target = +parseFloat(ov.value).toFixed(1)
            else if (ov?.type === 'percent' && ov.value) target = +(base * (1 + parseFloat(ov.value))).toFixed(1)
            if (current > target) weight.push({ a, note: `${current}kg · target ${target}kg (+${(current - target).toFixed(1)})`, sort: -(current - target) })
          }
        }
        // 5. wearables not syncing (3+ days)
        for (const c of (wearBy[a.id] || [])) {
          if (!c.last_sync_at || c.last_sync_at < daysAgo(3)) { sync.push({ a, note: `${c.provider || 'Wearable'} · ${c.last_sync_at ? 'last sync ' + new Date(c.last_sync_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : 'never synced'}`, sort: c.last_sync_at || '' }); break }
        }
      }
      low.sort((x, y) => x.sort - y.sort); noF2f.sort((x, y) => String(x.sort).localeCompare(String(y.sort))); pdp.sort((x, y) => x.sort - y.sort); weight.sort((x, y) => x.sort - y.sort)
      setData({ low, noF2f, pdp, weight, sync })
    })().catch(() => !cancelled && setData({}))
    return () => { cancelled = true }
  }, [idsKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const groups = [
    ['low', '📉 Low attendance', 'under 50% · last 4 weeks', '#E24B4A'],
    ['noF2f', '💤 No F2F logged', 'last 7 days', '#EF9F27'],
    ['pdp', '🎯 Overdue PDP', 'to-dos past their date', '#E6B800'],
    ['weight', '⚖️ Weight off target', 'in comp', '#2F6BFF'],
    ['sync', '⌚ Wearables not syncing', '3+ days', '#C93BFF'],
  ]
  const total = data ? groups.reduce((n, [k]) => n + (data[k]?.length || 0), 0) : null
  return (
    <div className="card coach-attention" style={{ marginBottom: 12, padding: 12 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
        <span className="coach-attention-title">⚠ Needs attention</span>
        <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{data == null ? 'Checking…' : total === 0 ? 'All good 👍' : `${total} to follow up`}</span>
      </div>
      {data && groups.map(([k, label, sub, c]) => {
        const list = data[k] || []
        if (!list.length) return null
        const isOpen = !!open[k] // all groups start collapsed
        return (
          <div key={k} style={{ borderTop: '1px solid var(--border)', padding: '6px 0' }}>
            <button type="button" onClick={() => setOpen(o => ({ ...o, [k]: !isOpen }))}
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', padding: '4px 0', cursor: 'pointer', color: 'var(--text)', fontFamily: 'inherit', textAlign: 'left' }}>
              <span style={{ fontWeight: 700, fontSize: 14 }}>{label}</span>
              <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{sub}</span>
              <span style={{ marginLeft: 'auto', fontFamily: 'Orbitron, sans-serif', fontSize: 14, color: c }}>{list.length}</span>
              <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{isOpen ? '▲' : '▼'}</span>
            </button>
            {isOpen && list.map(({ a, note }) => (
              <button key={a.id} type="button" onClick={() => onOpen(a)} className="coach-who-name" style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <span>{a.members?.first_name} {a.members?.last_name}</span>
                <span style={{ fontSize: 12, color: c, whiteSpace: 'nowrap' }}>{note}</span>
              </button>
            ))}
          </div>
        )
      })}
    </div>
  )
}
