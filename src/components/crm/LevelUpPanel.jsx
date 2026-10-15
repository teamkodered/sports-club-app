import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase.js'
import { levelUpWeekStart, sessionDate } from '../../pages/LevelUp.jsx'

// CRM -> Level Up: each week's extra-session requests, per session, in the order they came in.
// Optional cap per session is a guide only (nothing auto-closes). Confirm / Waiting / Decline,
// Paid tick, and ready WhatsApp messages (the Sunday post and each confirmation).
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const fmt = d => new Date(d).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
const STATUS = { pending: ['Pending', '#EF9F27'], confirmed: ['Confirmed', '#1D9E75'], waiting: ['Waiting list', '#378ADD'], declined: ['Declined', '#9CA3AF'] }
const waNum = p => { const d = String(p || '').replace(/[^0-9]/g, ''); return d.startsWith('0') ? '44' + d.slice(1) : d }

export default function LevelUpPanel() {
  const [week, setWeek] = useState(() => levelUpWeekStart())
  const [rows, setRows] = useState(null)
  const [sessions, setSessions] = useState([])
  const [caps, setCaps] = useState({})          // { 'YYYY-MM-DD': { label: cap } }
  const [err, setErr] = useState('')
  const wk = iso(week)

  async function load() {
    const [b, s, c] = await Promise.all([
      supabase.from('level_up_bookings').select('*, students(id, members(first_name, last_name))').eq('week_start', wk).order('created_at'),
      supabase.from('settings').select('value').eq('key', 'level_up_sessions').maybeSingle(),
      supabase.from('settings').select('value').eq('key', 'level_up_caps').maybeSingle(),
    ])
    if (b.error) { setErr(/level_up/.test(b.error.message) ? 'Run supabase_level_up.sql to switch Level Up on.' : b.error.message); setRows([]); return }
    setRows(b.data || []); setSessions(Array.isArray(s.data?.value) ? s.data.value : []); setCaps(c.data?.value || {})
  }
  useEffect(() => { load() }, [wk])

  const bySession = useMemo(() => {
    const m = {}; (sessions.length ? sessions : []).forEach(s => { m[s.label] = [] })
    ;(rows || []).forEach(r => { (m[r.session_label] ||= []).push(r) })
    return m
  }, [rows, sessions])

  async function setStatus(r, status) {
    setRows(prev => prev.map(x => x.id === r.id ? { ...x, status } : x))
    const { error } = await supabase.from('level_up_bookings').update({ status }).eq('id', r.id)
    if (error) { alert(error.message); load() }
  }
  async function setPaid(r, paid) {
    setRows(prev => prev.map(x => x.id === r.id ? { ...x, paid } : x))
    const { error } = await supabase.from('level_up_bookings').update({ paid }).eq('id', r.id)
    if (error) { alert(error.message); load() }
  }
  async function setCap(label, val) {
    const next = { ...caps, [wk]: { ...(caps[wk] || {}), [label]: val === '' ? undefined : Number(val) } }
    setCaps(next)
    await supabase.from('settings').upsert({ key: 'level_up_caps', value: next }, { onConflict: 'key' })
  }
  const link = `${window.location.origin}/level-up`
  const post = `Here's the link to book your extra sessions this week coming 🔥\n\n${link}\n\nRemember places are limited, first come first served basis! You will receive a confirmation message to confirm your place. 💪❤️`
  const confirmMsg = r => `Hi ${r.first_name}, your Level Up place is confirmed 💪 ${r.session_label} on ${fmt(r.session_date || wk)}. It's £5 per session — please pay by bank transfer with the reference "LEVEL UP ${r.first_name} ${r.surname}". See you there! ❤️`
  const waitMsg = r => `Hi ${r.first_name}, thanks for booking ${r.session_label} on ${fmt(r.session_date || wk)} — it's full at the moment, so you're on the waiting list. We'll message you if a place comes up 💪❤️`
  const copy = async t => { try { await navigator.clipboard.writeText(t); alert('Copied') } catch { prompt('Copy this:', t) } }

  const shift = n => { const d = new Date(week); d.setDate(d.getDate() + 7 * n); setWeek(d) }
  const total = (rows || []).length, confirmed = (rows || []).filter(r => r.status === 'confirmed').length, unpaid = (rows || []).filter(r => r.status === 'confirmed' && !r.paid).length

  return (
    <div className="lu">
      {err && <div className="card" style={{ color: '#E24B4A', marginBottom: 12 }}>{err}</div>}
      <div className="lu-top">
        <div className="lu-week">
          <button className="btn btn-sm" onClick={() => shift(-1)}>‹</button>
          <b>Week of {fmt(week)}</b>
          <button className="btn btn-sm" onClick={() => shift(1)}>›</button>
        </div>
        <div className="lu-actions">
          <button className="btn btn-sm btn-primary" onClick={() => copy(post)} title="The Sunday 1pm message for the WhatsApp groups">📋 Copy Sunday message</button>
          <button className="btn btn-sm" onClick={() => copy(link)}>🔗 Copy booking link</button>
        </div>
      </div>
      <div className="lu-sum">{total} request{total === 1 ? '' : 's'} · {confirmed} confirmed{unpaid ? ` · ${unpaid} not paid yet` : ''}</div>

      {rows === null ? <p>Loading…</p> : Object.entries(bySession).map(([label, list]) => {
        const day = sessions.find(s => s.label === label)?.day
        const date = day ? sessionDate(week, day) : null
        const cap = caps[wk]?.[label]
        const conf = list.filter(r => r.status === 'confirmed').length
        return (
          <div key={label} className="card lu-sess">
            <div className="lu-sess-head">
              <div><b>{label}</b>{date && <span className="lu-muted"> · {fmt(date)}</span>}</div>
              <div className="lu-cap">
                <span className={cap && conf >= cap ? 'full' : ''}>{conf}{cap ? ` / ${cap}` : ''} confirmed · {list.length} request{list.length === 1 ? '' : 's'}</span>
                <input type="number" min="0" placeholder="Cap" value={cap ?? ''} onChange={e => setCap(label, e.target.value)} aria-label={`Places for ${label}`} />
              </div>
            </div>
            {!list.length && <div className="lu-muted" style={{ padding: '4px 0' }}>No requests yet.</div>}
            {list.map((r, i) => {
              const [sl, sc] = STATUS[r.status] || STATUS.pending
              return (
                <div key={r.id} className="lu-row">
                  <div className="lu-who">
                    <span className="lu-n">{i + 1}</span>
                    <div>
                      <b>{r.first_name} {r.surname}</b>{r.age ? <span className="lu-muted"> · {r.age}</span> : null}
                      {!r.student_id && <span className="lu-flag" title="No PKA member with this name — check before confirming">not matched</span>}
                      <div className="lu-muted">{new Date(r.created_at).toLocaleString('en-GB', { weekday: 'short', hour: '2-digit', minute: '2-digit' })} · {r.phone}</div>
                    </div>
                  </div>
                  <div className="lu-ctl">
                    <span className="lu-status" style={{ color: sc, borderColor: sc }}>{sl}</span>
                    {r.status !== 'confirmed' && <button className="btn btn-sm btn-primary" onClick={() => setStatus(r, 'confirmed')}>Confirm</button>}
                    {r.status !== 'waiting' && <button className="btn btn-sm" onClick={() => setStatus(r, 'waiting')}>Waiting</button>}
                    {r.status !== 'declined' && <button className="btn btn-sm" onClick={() => setStatus(r, 'declined')}>Decline</button>}
                    {r.status === 'confirmed' && <label className="lu-paid"><input type="checkbox" checked={r.paid} onChange={e => setPaid(r, e.target.checked)} /> Paid</label>}
                    {(r.status === 'confirmed' || r.status === 'waiting') && r.phone && (
                      <a className="btn btn-sm" href={`https://wa.me/${waNum(r.phone)}?text=${encodeURIComponent(r.status === 'confirmed' ? confirmMsg(r) : waitMsg(r))}`} target="_blank" rel="noreferrer">💬 {r.status === 'confirmed' ? 'Send confirmation' : 'Send waiting msg'}</a>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}
