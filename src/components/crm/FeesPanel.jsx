import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase.js'
import { useAuth } from '../../hooks/useAuth.jsx'

// 🧾 Fees & bookings (in Sell): gradings (coloured / Brown / Black belt prices), BBBC courses, Level Up.
// Pick the student -> the app finds their grading request / course -> take full, deposit / part, or pay later;
// cash, card or bank transfer. Bookings list: paid / part / owed, + payment, attended (BBBC adds a course).
const money = n => `£${Number(n || 0).toFixed(2)}`
const KINDS = [['grading', '🎽 Grading'], ['bbbc', '🥋 BBBC course'], ['levelup', '⚡ Level Up']]
const METHODS = [['cash', '💵 Cash'], ['card', '💳 Card'], ['transfer', '🏦 Bank transfer']]
export const bandFor = gf => /black|\bdan\b/i.test(gf || '') ? 'black' : /brown/i.test(gf || '') ? 'brown' : 'standard'
const paidOf = b => (b.fee_payments || []).reduce((n, p) => n + Number(p.amount || 0), 0)
export const feeStatus = b => { const p = paidOf(b); return p <= 0 ? 'owed' : p + 0.001 >= Number(b.price) ? 'paid' : 'part' }
const fmtD = d => d ? new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' }) : ''

export default function FeesPanel() {
  const { profile, isAdmin } = useAuth()
  const by = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || 'Coach'
  const [items, setItems] = useState(null), [bookings, setBookings] = useState([]), [students, setStudents] = useState([])
  const [kind, setKind] = useState('grading'), [q, setQ] = useState(''), [stu, setStu] = useState(null)
  const [req, setReq] = useState(undefined)              // their grading request (null = none)
  const [itemId, setItemId] = useState(''), [mode, setMode] = useState('full'), [amount, setAmount] = useState(''), [method, setMethod] = useState('cash')
  const [busy, setBusy] = useState(false), [msg, setMsg] = useState('')
  const [listKind, setListKind] = useState('all'), [listItem, setListItem] = useState(''), [listStatus, setListStatus] = useState('all'), [listQ, setListQ] = useState('')
  const [showPrices, setShowPrices] = useState(false)

  async function load() {
    const [it, bk] = await Promise.all([
      supabase.from('fee_items').select('*').order('kind').order('sort').order('event_date'),
      supabase.from('fee_bookings').select('*, fee_payments(*), fee_items(kind, band, name, event_date), students(id, members(first_name, last_name))').order('created_at', { ascending: false }).limit(1000),
    ])
    if (it.error) { setItems([]); setMsg(/fee_items/.test(it.error.message) ? 'Run supabase_fees_bookings.sql first to switch on fees & bookings.' : it.error.message); return }
    setItems(it.data || []); setBookings(bk.data || [])
  }
  useEffect(() => {
    load()
    supabase.from('students').select('id, members(first_name, last_name, status)').then(({ data }) =>
      setStudents((data || []).filter(s => s.members && (s.members.status || 'active') !== 'stopped').map(s => ({ id: s.id, name: `${s.members.first_name} ${s.members.last_name}`.trim() })).sort((a, b) => a.name.localeCompare(b.name))))
  }, [])

  // the student's current grading request (newest still to come)
  useEffect(() => {
    setReq(undefined)
    if (!stu || kind !== 'grading') return
    const today = new Date().toISOString().split('T')[0]
    supabase.from('grading_expressions').select('id, grading_for, current_belt, grading_date, grading_list, created_at').eq('student_id', stu.id).order('created_at', { ascending: false }).limit(5)
      .then(({ data }) => setReq((data || []).find(r => r.grading_list || !r.grading_date || r.grading_date >= today) || null))
  }, [stu?.id, kind])

  const kindItems = (items || []).filter(i => i.kind === kind && i.active)
  const gradeItem = kind === 'grading' && req ? kindItems.find(i => i.band === bandFor(req.grading_for)) : null
  const item = kind === 'grading' ? gradeItem : kindItems.find(i => i.id === itemId)
  const existing = stu && item ? bookings.find(b => b.fee_item_id === item.id && b.student_id === stu.id && (kind !== 'grading' || b.grading_request_id === req?.id)) : null
  const owedNow = existing ? Math.max(0, Number(existing.price) - paidOf(existing)) : Number(item?.price || 0)
  const placesLeft = it => it.places ? it.places - bookings.filter(b => b.fee_item_id === it.id).length : null
  useEffect(() => { setMode('full'); setAmount('') }, [stu?.id, item?.id])

  async function take() {
    if (!stu) return alert('Pick the student first.')
    if (!item) return alert(kind === 'grading' ? (req ? 'Set the grading prices first (⚙️ Prices & courses).' : 'No grading request for this student -- they need to fill in the grading form first.') : 'Pick the course / session.')
    const amt = mode === 'later' ? 0 : mode === 'full' ? owedNow : Number(amount)
    if (mode !== 'later' && !(amt > 0)) return alert('Enter the amount being paid.')
    setBusy(true)
    let booking = existing
    if (!booking) {
      const { data, error } = await supabase.from('fee_bookings').insert({ fee_item_id: item.id, student_id: stu.id, price: item.price, grading_request_id: kind === 'grading' ? req.id : null, created_by: profile?.id, created_by_name: by }).select().single()
      if (error) { setBusy(false); return alert('Could not book: ' + error.message) }
      booking = data
    }
    if (amt > 0) {
      const { error } = await supabase.from('fee_payments').insert({ booking_id: booking.id, amount: amt, method, taken_by: profile?.id, taken_by_name: by })
      if (error) { setBusy(false); return alert('Could not save the payment: ' + error.message) }
    }
    setBusy(false)
    setMsg(`✓ ${stu.name} -- ${item.name}: ${amt > 0 ? `${money(amt)} ${method === 'transfer' ? 'bank transfer' : method}` : 'booked, pay later'}`)
    setStu(null); setQ(''); load()
  }
  async function addPayment(b) {
    const left = Math.max(0, Number(b.price) - paidOf(b))
    const a = prompt(`Payment for ${b.students?.members ? `${b.students.members.first_name} ${b.students.members.last_name}` : 'this booking'} -- ${money(left)} still owed. Amount (£):`, left ? String(left.toFixed(2)) : '')
    if (a == null || !(Number(a) > 0)) return
    const mth = prompt('How was it paid? Type cash, card or transfer', 'cash')
    if (!mth) return
    const m = /card/i.test(mth) ? 'card' : /trans|bank/i.test(mth) ? 'transfer' : 'cash'
    const { error } = await supabase.from('fee_payments').insert({ booking_id: b.id, amount: Number(a), method: m, taken_by: profile?.id, taken_by_name: by })
    if (error) return alert(error.message)
    load()
  }
  async function setAttended(b, on) {
    const { error } = await supabase.rpc('kc_bbbc_attended', { p_booking: b.id, p_attended: on })
    if (error) return alert(error.message)
    setBookings(prev => prev.map(x => x.id === b.id ? { ...x, attended: on } : x))
  }
  async function removeBooking(b) {
    if (!confirm('Delete this booking and its payments?')) return
    const { error } = await supabase.from('fee_bookings').delete().eq('id', b.id)
    if (error) return alert(error.message)
    setBookings(prev => prev.filter(x => x.id !== b.id))
  }

  const shownBookings = useMemo(() => bookings.filter(b => (listKind === 'all' || b.fee_items?.kind === listKind) && (!listItem || b.fee_item_id === listItem)
    && (listStatus === 'all' || (listStatus === 'owing' ? feeStatus(b) !== 'paid' : feeStatus(b) === listStatus))
    && (!listQ.trim() || `${b.students?.members?.first_name || ''} ${b.students?.members?.last_name || ''}`.toLowerCase().includes(listQ.trim().toLowerCase()))), [bookings, listKind, listItem, listStatus, listQ])

  if (items === null) return <div className="loading">Loading…</div>
  const matches = q.trim().length >= 2 ? students.filter(s => s.name.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 12) : []
  const chip = (on, label, onClick, col = '#378ADD') => <button type="button" className="btn btn-sm" onClick={onClick} style={on ? { borderColor: col, background: col + '22', color: col, fontWeight: 700 } : undefined}>{label}</button>
  const stCol = { paid: '#1D9E75', part: '#EF9F27', owed: '#E24B4A' }

  return (
    <div>
      {msg && <div className="card" style={{ marginBottom: 10, fontSize: 13, color: msg.startsWith('✓') ? '#1D9E75' : '#E24B4A' }}>{msg}</div>}
      <div className="card" style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
          {KINDS.map(([k, l]) => chip(kind === k, l, () => { setKind(k); setItemId('') }))}
          {isAdmin && <button type="button" className="btn btn-sm" style={{ marginLeft: 'auto' }} onClick={() => setShowPrices(v => !v)}>⚙️ Prices &amp; courses</button>}
        </div>
        {showPrices && isAdmin && <PricesEditor items={items} onChanged={load} />}

        <div className="field"><label>Student</label>
          {stu ? <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><b style={{ fontSize: 15 }}>{stu.name}</b><button type="button" className="btn btn-sm" onClick={() => setStu(null)}>Change</button></div>
            : <><input value={q} onChange={e => setQ(e.target.value)} placeholder="🔍 Type a name…" />
              {matches.length > 0 && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>{matches.map(s => <button key={s.id} type="button" className="btn btn-sm" onClick={() => { setStu(s); setQ('') }}>{s.name}</button>)}</div>}</>}
        </div>

        {kind === 'grading' && stu && (
          <div style={{ fontSize: 13, marginBottom: 10 }}>
            {req === undefined ? 'Checking their grading request…' : req ? <>🎽 Grading for <b>{req.grading_for}</b> ({req.current_belt || '—'} → {req.grading_for}){req.grading_list ? ` · ${req.grading_list}` : req.grading_date ? ` · ${fmtD(req.grading_date)}` : ''} · <b>{gradeItem ? `${gradeItem.name} ${money(gradeItem.price)}` : 'set the grading prices first'}</b></>
              : <span style={{ color: '#E24B4A' }}>No grading request for {stu.name} -- they need to fill in the grading form first.</span>}
          </div>
        )}
        {kind !== 'grading' && (
          <div className="field"><label>{kind === 'bbbc' ? 'BBBC course' : 'Level Up session'}</label>
            {kindItems.length ? <select value={itemId} onChange={e => setItemId(e.target.value)}>
              <option value="">Choose…</option>
              {kindItems.map(i => { const pl = placesLeft(i); return <option key={i.id} value={i.id} disabled={pl != null && pl <= 0}>{i.name}{i.event_date ? ` · ${fmtD(i.event_date)}` : ''} · {money(i.price)}{pl != null ? ` · ${pl} place${pl === 1 ? '' : 's'} left` : ''}</option> })}
            </select> : <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>None set up yet{isAdmin ? ' -- add one in ⚙️ Prices & courses' : ''}.</div>}
          </div>
        )}

        {stu && item && (
          <>
            {existing && <div style={{ fontSize: 13, marginBottom: 8 }}>Already booked: paid <b>{money(paidOf(existing))}</b> of {money(existing.price)} -- <b>{money(owedNow)}</b> left.</div>}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
              {chip(mode === 'full', `Pay ${existing ? 'the rest' : 'in full'} ${money(owedNow)}`, () => setMode('full'), '#1D9E75')}
              {chip(mode === 'part', 'Deposit / part', () => setMode('part'), '#EF9F27')}
              {!existing && chip(mode === 'later', 'Pay later', () => setMode('later'), '#E24B4A')}
            </div>
            {mode === 'part' && <input type="number" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} placeholder="Amount £" style={{ maxWidth: 160, marginBottom: 8 }} />}
            {mode !== 'later' && <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>{METHODS.map(([k, l]) => chip(method === k, l, () => setMethod(k)))}</div>}
            <button type="button" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', padding: 12 }} disabled={busy} onClick={take}>
              {busy ? 'Saving…' : mode === 'later' ? `Book ${stu.name.split(' ')[0]} -- pay later` : `Take ${money(mode === 'full' ? owedNow : Number(amount || 0))}`}
            </button>
          </>
        )}
      </div>

      {/* bookings */}
      <div className="card">
        <b style={{ fontSize: 15 }}>📋 Bookings</b>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '8px 0' }}>
          <input value={listQ} onChange={e => setListQ(e.target.value)} placeholder="🔍 Name…" style={{ flex: '1 1 140px' }} />
          <select value={listKind} onChange={e => { setListKind(e.target.value); setListItem('') }}><option value="all">All types</option>{KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          <select value={listItem} onChange={e => setListItem(e.target.value)}><option value="">All {listKind === 'all' ? 'items' : 'of this type'}</option>{items.filter(i => listKind === 'all' || i.kind === listKind).map(i => <option key={i.id} value={i.id}>{i.name}{i.event_date ? ` · ${fmtD(i.event_date)}` : ''}</option>)}</select>
          {[['owing', 'Still owing'], ['paid', 'Paid'], ['part', 'Part paid'], ['owed', 'Nothing paid']].map(([k, l]) => chip(listStatus === k, l, () => setListStatus(s => s === k ? 'all' : k)))}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>{shownBookings.length} booking{shownBookings.length === 1 ? '' : 's'} · paid {money(shownBookings.reduce((n, b) => n + paidOf(b), 0))} · owed {money(shownBookings.reduce((n, b) => n + Math.max(0, Number(b.price) - paidOf(b)), 0))}</div>
        {shownBookings.map(b => {
          const st = feeStatus(b), nm = b.students?.members ? `${b.students.members.first_name} ${b.students.members.last_name}` : (b.customer_name || '—')
          return (
            <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '8px 0', borderTop: '1px solid var(--border)' }}>
              <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                <div style={{ fontWeight: 600 }}>{nm}</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{b.fee_items?.name}{b.fee_items?.event_date ? ` · ${fmtD(b.fee_items.event_date)}` : ''} · booked by {b.created_by_name || '—'}</div>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{(b.fee_payments || []).map(p => `${money(p.amount)} ${p.method} (${new Date(p.created_at).toLocaleDateString('en-GB')}${p.taken_by_name ? `, ${p.taken_by_name.split(' ')[0]}` : ''})`).join(' · ')}</div>
              </div>
              <span style={{ fontSize: 12, fontWeight: 700, color: stCol[st] }}>{st === 'paid' ? `✓ Paid ${money(b.price)}` : st === 'part' ? `Part: ${money(paidOf(b))} of ${money(b.price)}` : `Owes ${money(b.price)}`}</span>
              {st !== 'paid' && <button type="button" className="btn btn-sm" onClick={() => addPayment(b)}>+ Payment</button>}
              {b.fee_items?.kind !== 'grading' && <label style={{ fontSize: 12, display: 'flex', gap: 4, alignItems: 'center' }}><input type="checkbox" checked={!!b.attended} onChange={e => setAttended(b, e.target.checked)} />Attended</label>}
              {isAdmin && <button type="button" className="btn btn-sm" title="Delete booking" onClick={() => removeBooking(b)}>🗑️</button>}
            </div>
          )
        })}
        {!shownBookings.length && <div style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>No bookings yet.</div>}
      </div>
    </div>
  )
}

function PricesEditor({ items, onChanged }) {
  const [form, setForm] = useState({ kind: 'bbbc', name: '', price: '', event_date: '', places: '' })
  async function savePrice(i, v) {
    const { error } = await supabase.from('fee_items').update({ price: Number(v) || 0 }).eq('id', i.id)
    if (error) return alert(error.message)
    onChanged()
  }
  async function add() {
    if (!form.name.trim()) return alert('Give it a name, e.g. "BBBC course -- Spring 2027".')
    const { error } = await supabase.from('fee_items').insert({ kind: form.kind, name: form.name.trim(), price: Number(form.price) || 0, event_date: form.event_date || null, places: form.places ? Number(form.places) : null })
    if (error) return alert(error.message)
    setForm({ kind: form.kind, name: '', price: '', event_date: '', places: '' }); onChanged()
  }
  async function toggle(i) {
    const { error } = await supabase.from('fee_items').update({ active: !i.active }).eq('id', i.id)
    if (error) return alert(error.message)
    onChanged()
  }
  return (
    <div style={{ border: '1px dashed var(--border-strong)', borderRadius: 8, padding: 10, marginBottom: 12 }}>
      <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Grading prices</div>
      {items.filter(i => i.kind === 'grading').map(i => (
        <label key={i.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginBottom: 4 }}>
          <span style={{ flex: 1 }}>{i.name}</span>£<input type="number" step="0.01" defaultValue={i.price} onBlur={e => Number(e.target.value) !== Number(i.price) && savePrice(i, e.target.value)} style={{ width: 90 }} />
        </label>
      ))}
      <div style={{ fontSize: 12, fontWeight: 700, margin: '10px 0 6px' }}>BBBC courses &amp; Level Up sessions</div>
      {items.filter(i => i.kind !== 'grading').map(i => (
        <div key={i.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginBottom: 4, opacity: i.active ? 1 : 0.5 }}>
          <span style={{ flex: 1 }}>{i.kind === 'bbbc' ? '🥋' : '⚡'} {i.name}{i.event_date ? ` · ${fmtD(i.event_date)}` : ''}{i.places ? ` · ${i.places} places` : ''}</span>
          £<input type="number" step="0.01" defaultValue={i.price} onBlur={e => Number(e.target.value) !== Number(i.price) && savePrice(i, e.target.value)} style={{ width: 80 }} />
          <button type="button" className="btn btn-sm" onClick={() => toggle(i)}>{i.active ? 'Hide' : 'Show'}</button>
        </div>
      ))}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
        <select value={form.kind} onChange={e => setForm(f => ({ ...f, kind: e.target.value }))}><option value="bbbc">🥋 BBBC course</option><option value="levelup">⚡ Level Up</option></select>
        <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Name, e.g. BBBC course -- Spring 2027" style={{ flex: '1 1 200px' }} />
        <input type="date" value={form.event_date} onChange={e => setForm(f => ({ ...f, event_date: e.target.value }))} />
        <input type="number" step="0.01" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} placeholder="£" style={{ width: 80 }} />
        <input type="number" value={form.places} onChange={e => setForm(f => ({ ...f, places: e.target.value }))} placeholder="Places" style={{ width: 80 }} />
        <button type="button" className="btn btn-sm btn-primary" onClick={add}>+ Add</button>
      </div>
    </div>
  )
}

// 💷 Sales: fees & bookings payments for a month (by type and method)
export function FeesSales({ month }) {
  const [rows, setRows] = useState(null)
  useEffect(() => {
    const [y, m] = month.split('-').map(Number), from = new Date(y, m - 1, 1).toISOString(), to = new Date(y, m, 1).toISOString()
    supabase.from('fee_payments').select('*, fee_bookings(fee_items(kind, name), students(members(first_name, last_name)))').gte('created_at', from).lt('created_at', to).order('created_at', { ascending: false })
      .then(({ data }) => setRows(data || []))
  }, [month])
  if (!rows) return <div className="loading">Loading…</div>
  const sum = f => rows.filter(f).reduce((n, r) => n + Number(r.amount || 0), 0)
  return (
    <div>
      <div className="stk-note">Fees &amp; bookings taken: <b>{money(sum(() => true))}</b> · 🎽 gradings {money(sum(r => r.fee_bookings?.fee_items?.kind === 'grading'))} · 🥋 BBBC {money(sum(r => r.fee_bookings?.fee_items?.kind === 'bbbc'))} · ⚡ Level Up {money(sum(r => r.fee_bookings?.fee_items?.kind === 'levelup'))} · 💵 cash {money(sum(r => r.method === 'cash'))} · 💳 card {money(sum(r => r.method === 'card'))} · 🏦 transfer {money(sum(r => r.method === 'transfer'))}</div>
      {rows.map(r => (
        <div key={r.id} className="card" style={{ display: 'flex', gap: 8, padding: '8px 12px', marginBottom: 6, fontSize: 13 }}>
          <span style={{ flex: 1 }}><b>{r.fee_bookings?.students?.members ? `${r.fee_bookings.students.members.first_name} ${r.fee_bookings.students.members.last_name}` : '—'}</b> · {r.fee_bookings?.fee_items?.name}</span>
          <span>{money(r.amount)} {r.method}</span>
          <span style={{ color: 'var(--text-tertiary)' }}>{new Date(r.created_at).toLocaleDateString('en-GB')}{r.taken_by_name ? ` · ${r.taken_by_name}` : ''}</span>
        </div>
      ))}
      {!rows.length && <div style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>None this month.</div>}
    </div>
  )
}
