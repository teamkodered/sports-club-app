import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase.js'
import { useAuth } from '../../hooks/useAuth.jsx'

// CRM -> Stock: stock levels, selling (discounts + coach commission), sales history with refunds,
// monthly commission per coach (mark paid), and managing items / discount presets.
const money = n => `£${(Number(n) || 0).toFixed(2)}`
const monthKey = d => String(d).slice(0, 7)
const thisMonth = () => new Date().toISOString().slice(0, 7)
const STAFF = ['admin', 'captain', 'coach', 'leader', 'head_coach']

// section: 'sell' (customer-facing), 'sales' (history + commission), 'stock' (levels + items/discounts)
export default function StockPanel({ section = 'stock' }) {
  const { isAdmin, profile } = useAuth()
  const [view, setView] = useState(section === 'sell' ? 'sell' : section === 'sales' ? 'sales' : 'stock')
  const [items, setItems] = useState(null)        // with variants
  const [coaches, setCoaches] = useState([])
  const [discounts, setDiscounts] = useState([])
  const [sales, setSales] = useState([])
  const [month, setMonth] = useState(thisMonth())
  const [err, setErr] = useState('')

  async function load() {
    const [it, co, ds, sa] = await Promise.all([
      supabase.from('stock_items').select('*, stock_variants(*)').order('name'),
      supabase.from('members').select('id, first_name, last_name, role').in('role', STAFF).order('first_name'),
      supabase.from('settings').select('value').eq('key', 'stock_discounts').maybeSingle(),
      supabase.from('stock_sales').select('*, coach:members!coach_member_id(first_name, last_name), students(members(first_name, last_name))').order('sold_at', { ascending: false }).limit(500),
    ])
    if (it.error) { setErr(/stock_items/.test(it.error.message) ? 'Run supabase_stock.sql first to switch on stock.' : it.error.message); setItems([]); return }
    setItems((it.data || []).map(i => ({ ...i, stock_variants: [...(i.stock_variants || [])].sort((a, b) => a.sort - b.sort) })))
    setCoaches(co.data || [])
    setDiscounts(Array.isArray(ds.data?.value) ? ds.data.value : [])
    setSales(sa.data || [])
  }
  useEffect(() => { load() }, [])

  const coachName = c => c ? `${c.first_name || ''} ${c.last_name || ''}`.trim() : '—'
  const lowCount = (items || []).reduce((n, i) => n + i.stock_variants.filter(v => v.qty <= i.low_stock).length, 0)

  if (items === null) return <div className="loading">Loading…</div>
  return (
    <div className="stk">
      {err && <div className="card" style={{ color: '#E24B4A', marginBottom: 12 }}>{err}</div>}
      {section !== 'sell' && (
        <div className="stk-tabs">
          {(section === 'sales' ? [['sales', '🧾 Sales'], ['commission', '💷 Commission']] : [['stock', `📦 Stock levels${lowCount ? ` · ${lowCount} low` : ''}`], ['items', '⚙️ Items & discounts']]).map(([k, l]) => (
            <button key={k} type="button" className={view === k ? 'on' : ''} onClick={() => setView(k)}>{l}</button>
          ))}
        </div>
      )}

      {view === 'stock' && <StockLevels items={items} onChanged={load} />}
      {view === 'sell' && <SellForm items={items} coaches={coaches} discounts={discounts} defaultCoach={profile?.id} onSold={load} />}
      {view === 'sales' && <SalesList sales={sales} month={month} setMonth={setMonth} coachName={coachName} onChanged={load} />}
      {view === 'commission' && <Commission sales={sales} month={month} setMonth={setMonth} coachName={coachName} isAdmin={isAdmin} onChanged={load} />}
      {view === 'items' && <ItemsEditor items={items} discounts={discounts} isAdmin={isAdmin} onChanged={load} />}
    </div>
  )
}

// ── Stock levels: every item and size, low ones in red; + delivery / count correction ──
function StockLevels({ items, onChanged }) {
  const [adj, setAdj] = useState(null)   // { item, variant, change, reason, note }
  async function save() {
    let change = parseInt(adj.change, 10)
    if (!change) return alert('Enter how many (use a minus for a correction down).')
    if (adj.reason === 'damaged') change = -Math.abs(change)
    if (adj.reason === 'delivery') change = Math.abs(change)
    const { error } = await supabase.rpc('kc_stock_adjust', { p_variant: adj.variant.id, p_change: change, p_reason: adj.reason, p_note: adj.note || null })
    if (error) return alert(error.message)
    setAdj(null); onChanged()
  }
  const value = items.reduce((n, i) => n + i.stock_variants.reduce((m, v) => m + Math.max(0, v.qty) * Number(i.cost_price || 0), 0), 0)
  return (
    <>
      <div className="stk-note">Stock value at cost: <b>{money(value)}</b> · tap a size to add a delivery or correct the count</div>
      {items.filter(i => i.active).map(i => (
        <div key={i.id} className="card stk-item">
          <div className="stk-item-head"><b>{i.name}</b><span>{i.category || ''} · sells {money(i.sell_price)}</span></div>
          <div className="stk-vars">
            {i.stock_variants.map(v => (
              <button key={v.id} type="button" className={`stk-var${v.qty <= i.low_stock ? ' low' : ''}`} onClick={() => setAdj({ item: i, variant: v, change: '', reason: 'delivery', note: '' })}>
                <span>{v.label}</span><b>{v.qty}</b>
              </button>
            ))}
          </div>
        </div>
      ))}
      {adj && (
        <div className="stk-backdrop" onClick={() => setAdj(null)}>
          <div className="card stk-sheet" onClick={e => e.stopPropagation()}>
            <b>{adj.item.name} — {adj.variant.label}</b> <span className="stk-muted">(now {adj.variant.qty})</span>
            <div className="stk-seg" style={{ margin: '10px 0' }}>
              {[['delivery', '📥 Delivery'], ['adjust', '✏️ Count correction'], ['damaged', '⚠️ Damaged / lost']].map(([k, l]) => (
                <button key={k} type="button" className={adj.reason === k ? 'on' : ''} onClick={() => setAdj(a => ({ ...a, reason: k }))}>{l}</button>
              ))}
            </div>
            <div className="field"><label>{adj.reason === 'delivery' ? 'How many arrived' : 'Change (+ or −)'}</label>
              <input type="number" inputMode="numeric" value={adj.change} onChange={e => setAdj(a => ({ ...a, change: e.target.value }))} placeholder={adj.reason === 'delivery' ? 'e.g. 10' : 'e.g. -1'} /></div>
            <div className="field"><label>Note (optional)</label><input value={adj.note} onChange={e => setAdj(a => ({ ...a, note: e.target.value }))} /></div>
            <div style={{ display: 'flex', gap: 8 }}><button className="btn btn-primary" onClick={save}>Save</button><button className="btn" onClick={() => setAdj(null)}>Cancel</button></div>
          </div>
        </div>
      )}
    </>
  )
}

// ── Sell: item -> size -> qty -> discount -> coach -> customer -> record ──
function SellForm({ items, coaches, discounts, defaultCoach, onSold }) {
  const live = items.filter(i => i.active)
  const [itemId, setItemId] = useState(live[0]?.id || '')
  const item = live.find(i => i.id === itemId)
  const [variantId, setVariantId] = useState('')
  const [qty, setQty] = useState(1)
  const [unit, setUnit] = useState('')
  const [disc, setDisc] = useState({ type: 'none', value: 0, name: '' })
  const [coach, setCoach] = useState(defaultCoach || '')
  const [customer, setCustomer] = useState('')
  const [studentId, setStudentId] = useState(null)
  const [found, setFound] = useState([])
  const [payment, setPayment] = useState('card')
  const [busy, setBusy] = useState(false)
  useEffect(() => { setVariantId(item?.stock_variants?.[0]?.id || ''); setUnit(item ? String(item.sell_price) : '') }, [itemId])
  useEffect(() => {
    if (studentId || customer.trim().length < 2) { setFound([]); return }
    const t = setTimeout(() => supabase.from('students').select('id, members!inner(first_name, last_name)').or(`first_name.ilike.%${customer.trim()}%,last_name.ilike.%${customer.trim()}%`, { referencedTable: 'members' }).limit(6)
      .then(({ data }) => setFound(data || [])), 250)
    return () => clearTimeout(t)
  }, [customer, studentId])

  const variant = item?.stock_variants.find(v => v.id === variantId)
  const gross = (Number(unit) || 0) * (Number(qty) || 0)
  const net = disc.type === 'pct' ? gross * (1 - Math.min(100, Math.max(0, disc.value)) / 100) : disc.type === 'amount' ? Math.max(0, gross - disc.value) : gross

  async function record() {
    if (!variant) return alert('Choose a size / option.')
    if (qty < 1) return alert('Quantity must be at least 1.')
    if (variant.qty < qty && !window.confirm(`Not enough ${variant.label} in stock for this. Record the sale anyway?`)) return
    setBusy(true)
    const { error } = await supabase.rpc('kc_stock_sale', { p_variant: variant.id, p_qty: Number(qty), p_unit: Number(unit) || 0, p_disc_type: disc.type, p_disc_value: Number(disc.value) || 0, p_disc_name: disc.name || null,
      p_coach: coach || null, p_student: studentId, p_customer: customer, p_payment: payment })
    setBusy(false)
    if (error) return alert('Could not record the sale: ' + error.message)
    alert(`Thank you! ${qty} × ${item.name} (${variant.label}) — ${money(net)}`)
    setQty(1); setDisc({ type: 'none', value: 0, name: '' }); setCustomer(''); setStudentId(null)
    onSold()
  }

  if (!live.length) return <p>No items yet — add some under Items & discounts.</p>
  return (
    <div className="card stk-sell">
      <div className="field"><label>Item</label>
        <select value={itemId} onChange={e => setItemId(e.target.value)}>{live.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}</select></div>
      {item && <div className="field"><label>Size / option</label>
        <div className="stk-vars">{item.stock_variants.map(v => (
          <button key={v.id} type="button" className={`stk-var stk-var-sell${variantId === v.id ? ' on' : ''}${v.qty <= 0 ? ' low' : ''}`} onClick={() => setVariantId(v.id)}>
            <b>{v.label}</b><span>{v.qty <= 0 ? 'Out of stock' : v.qty <= item.low_stock ? 'Last few' : 'In stock'}</span>
          </button>
        ))}</div></div>}
      <div style={{ display: 'flex', gap: 8 }}>
        <div className="field" style={{ flex: 1 }}><label>Quantity</label><input type="number" min="1" value={qty} onChange={e => setQty(Math.max(1, parseInt(e.target.value, 10) || 1))} /></div>
        <div className="field" style={{ flex: 1 }}><label>Price each (£)</label><input type="number" step="0.01" value={unit} onChange={e => setUnit(e.target.value)} /></div>
      </div>
      <div className="field"><label>Discount</label>
        <div className="stk-chips">
          <button type="button" className={disc.type === 'none' ? 'on' : ''} onClick={() => setDisc({ type: 'none', value: 0, name: '' })}>None</button>
          {discounts.map(d => <button key={d.name} type="button" className={disc.name === d.name ? 'on' : ''} onClick={() => setDisc({ type: d.type, value: Number(d.value), name: d.name })}>{d.name}</button>)}
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
          <select value={disc.type} onChange={e => setDisc(d => ({ ...d, type: e.target.value, name: '' }))} style={{ width: 120 }}><option value="none">No discount</option><option value="pct">% off</option><option value="amount">£ off</option></select>
          {disc.type !== 'none' && <input type="number" step="0.01" value={disc.value} onChange={e => setDisc(d => ({ ...d, value: Number(e.target.value), name: '' }))} style={{ width: 100 }} />}
        </div>
      </div>

      <div className="field" style={{ position: 'relative' }}><label>Customer (optional)</label>
        <input value={customer} onChange={e => { setCustomer(e.target.value); setStudentId(null) }} placeholder="Student name, or anyone" />
        {found.length > 0 && <div className="stk-found">{found.map(s => (
          <button key={s.id} type="button" onClick={() => { setStudentId(s.id); setCustomer(`${s.members.first_name} ${s.members.last_name}`); setFound([]) }}>{s.members.first_name} {s.members.last_name}</button>
        ))}</div>}
      </div>
      <div className="field"><label>Paid by</label>
        <div className="stk-seg">{[['card', 'Card'], ['cash', 'Cash'], ['bank', 'Bank transfer'], ['other', 'Other']].map(([k, l]) => <button key={k} type="button" className={payment === k ? 'on' : ''} onClick={() => setPayment(k)}>{l}</button>)}</div></div>
      <div className="stk-total">
        <div><span>Total to pay</span><b>{money(net)}</b>{net !== gross && <s>{money(gross)}</s>}{net !== gross && <em className="stk-save">You save {money(gross - net)}</em>}</div>
      </div>
      {/* staff-only detail, kept small and out of the way when a customer is looking */}
      <details className="stk-staff">
        <summary>Sold by: {coaches.find(c => c.id === coach) ? `${coaches.find(c => c.id === coach).first_name}` : 'club sale'}</summary>
        <select value={coach} onChange={e => setCoach(e.target.value)} style={{ width: '100%', marginTop: 6 }}>
          <option value="">No coach (club sale)</option>
          {coaches.map(c => <option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>)}
        </select>
      </details>
      <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', height: 46 }} disabled={busy} onClick={record}>{busy ? 'Saving…' : 'Record sale'}</button>
    </div>
  )
}

function MonthPicker({ month, setMonth }) {
  return <input type="month" value={month} onChange={e => setMonth(e.target.value || thisMonth())} style={{ height: 34, padding: '0 8px', borderRadius: 8, border: '1px solid var(--border-strong)', background: 'var(--bg)', color: 'var(--text)' }} />
}

// ── Sales: the month's sales, refunds put stock back ──
function SalesList({ sales, month, setMonth, coachName, onChanged }) {
  const list = sales.filter(s => monthKey(s.sold_at) === month)
  const live = list.filter(s => !s.refunded_at)
  async function refund(s) {
    if (!window.confirm(`Refund ${s.qty} × ${s.item_name} (${s.variant_label}), ${money(s.total)}? The stock goes back and no commission is due on it.`)) return
    const { error } = await supabase.rpc('kc_stock_refund', { p_sale: s.id })
    if (error) return alert(error.message)
    onChanged()
  }
  return (
    <>
      <div className="stk-row"><MonthPicker month={month} setMonth={setMonth} /><span className="stk-note">{live.length} sale{live.length === 1 ? '' : 's'} · <b>{money(live.reduce((n, s) => n + Number(s.total), 0))}</b></span></div>
      {!list.length && <p className="stk-muted">No sales this month.</p>}
      {list.map(s => (
        <div key={s.id} className="card stk-sale" style={{ opacity: s.refunded_at ? 0.5 : 1 }}>
          <div><b>{s.qty} × {s.item_name}</b> <span className="stk-muted">({s.variant_label})</span>
            <div className="stk-muted">{new Date(s.sold_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} · {s.students?.members ? `${s.students.members.first_name} ${s.students.members.last_name}` : s.customer_name || 'Customer'} · {s.payment_method}{s.discount_type !== 'none' ? ` · ${s.discount_name || (s.discount_type === 'pct' ? `${s.discount_value}% off` : `£${s.discount_value} off`)}` : ''}{s.coach_member_id ? ` · sold by ${coachName(s.coach)}` : ''}</div></div>
          <div style={{ textAlign: 'right' }}><b>{money(s.total)}</b>{s.refunded_at ? <div className="stk-muted">Refunded</div> : <button className="btn btn-sm" style={{ marginTop: 4 }} onClick={() => refund(s)}>Refund</button>}</div>
        </div>
      ))}
    </>
  )
}

// ── Commission: per coach for the month; admin marks paid ──
function Commission({ sales, month, setMonth, coachName, isAdmin, onChanged }) {
  const rows = useMemo(() => {
    const by = {}
    sales.filter(s => monthKey(s.sold_at) === month && !s.refunded_at && s.coach_member_id).forEach(s => {
      const r = (by[s.coach_member_id] ||= { id: s.coach_member_id, name: coachName(s.coach), count: 0, sales: 0, owed: 0, paid: 0, unpaidIds: [] })
      r.count += s.qty; r.sales += Number(s.total)
      if (s.commission_paid_at) r.paid += Number(s.commission_amount)
      else { r.owed += Number(s.commission_amount); r.unpaidIds.push(s.id) }
    })
    return Object.values(by).sort((a, b) => b.owed - a.owed)
  }, [sales, month])
  async function markPaid(r) {
    if (!window.confirm(`Mark ${money(r.owed)} commission as paid to ${r.name} for ${month}?`)) return
    const { error } = await supabase.from('stock_sales').update({ commission_paid_at: new Date().toISOString() }).in('id', r.unpaidIds)
    if (error) return alert(error.message)
    onChanged()
  }
  return (
    <>
      <div className="stk-row"><MonthPicker month={month} setMonth={setMonth} /><span className="stk-note">Owed this month: <b>{money(rows.reduce((n, r) => n + r.owed, 0))}</b></span></div>
      {!rows.length && <p className="stk-muted">No coach sales this month.</p>}
      {rows.map(r => (
        <div key={r.id} className="card stk-sale">
          <div><b>{r.name}</b><div className="stk-muted">{r.count} item{r.count === 1 ? '' : 's'} · sales {money(r.sales)}{r.paid ? ` · paid ${money(r.paid)}` : ''}</div></div>
          <div style={{ textAlign: 'right' }}><b style={{ color: r.owed ? '#EF9F27' : '#1D9E75' }}>{r.owed ? `${money(r.owed)} owed` : 'All paid'}</b>
            {isAdmin && r.owed > 0 && <div><button className="btn btn-sm btn-primary" style={{ marginTop: 4 }} onClick={() => markPaid(r)}>Mark paid</button></div>}</div>
        </div>
      ))}
    </>
  )
}

// ── Items & discounts ──
function ItemsEditor({ items, discounts, isAdmin, onChanged }) {
  const [edit, setEdit] = useState(null)   // { id?, name, category, cost_price, sell_price, commission_pct, low_stock, sizes, active }
  const [discEdit, setDiscEdit] = useState(null)
  async function saveItem() {
    const e = edit
    if (!e.name.trim()) return alert('Give the item a name.')
    const row = { name: e.name.trim(), category: e.category || null, cost_price: Number(e.cost_price) || 0, sell_price: Number(e.sell_price) || 0, commission_pct: Number(e.commission_pct) || 0, low_stock: parseInt(e.low_stock, 10) || 0, active: e.active !== false }
    let id = e.id
    if (id) { const { error } = await supabase.from('stock_items').update(row).eq('id', id); if (error) return alert(error.message) }
    else { const { data, error } = await supabase.from('stock_items').insert(row).select('id').single(); if (error) return alert(error.message); id = data.id }
    // sizes: add any new labels (existing ones keep their counts)
    const labels = e.sizes.split(',').map(x => x.trim()).filter(Boolean)
    const existing = items.find(i => i.id === id)?.stock_variants || []
    const add = labels.filter(l => !existing.some(v => v.label.toLowerCase() === l.toLowerCase())).map((label, k) => ({ item_id: id, label, qty: 0, sort: existing.length + k + 1 }))
    if (add.length) { const { error } = await supabase.from('stock_variants').insert(add); if (error) return alert(error.message) }
    setEdit(null); onChanged()
  }
  async function saveDiscounts(next) {
    const { error } = await supabase.from('settings').upsert({ key: 'stock_discounts', value: next }, { onConflict: 'key' })
    if (error) return alert(error.message)
    setDiscEdit(null); onChanged()
  }
  return (
    <>
      <div className="stk-row"><b>Items</b><button className="btn btn-sm btn-primary" onClick={() => setEdit({ name: '', category: '', cost_price: '', sell_price: '', commission_pct: 10, low_stock: 3, sizes: 'One size', active: true })}>+ New item</button></div>
      {items.map(i => (
        <div key={i.id} className="card stk-sale" style={{ opacity: i.active ? 1 : 0.5 }}>
          <div><b>{i.name}</b><div className="stk-muted">cost {money(i.cost_price)} · sells {money(i.sell_price)} · margin {money(i.sell_price - i.cost_price)} · commission {Number(i.commission_pct)}% · low at {i.low_stock}</div>
            <div className="stk-muted">{i.stock_variants.map(v => v.label).join(', ')}</div></div>
          <button className="btn btn-sm" onClick={() => setEdit({ ...i, sizes: i.stock_variants.map(v => v.label).join(', ') })}>Edit</button>
        </div>
      ))}
      <div className="stk-row" style={{ marginTop: 16 }}><b>Discount presets</b>{isAdmin && <button className="btn btn-sm" onClick={() => setDiscEdit({ name: '', type: 'pct', value: 10 })}>+ Add</button>}</div>
      <div className="stk-chips">{discounts.map(d => (
        <span key={d.name} className="stk-chip">{d.name}{isAdmin && <button type="button" onClick={() => window.confirm(`Remove "${d.name}"?`) && saveDiscounts(discounts.filter(x => x.name !== d.name))}>×</button>}</span>
      ))}</div>
      {discEdit && (
        <div className="card" style={{ marginTop: 10 }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <input value={discEdit.name} onChange={e => setDiscEdit(d => ({ ...d, name: e.target.value }))} placeholder="Name, e.g. Grading day 10%" style={{ flex: 1, minWidth: 160 }} />
            <select value={discEdit.type} onChange={e => setDiscEdit(d => ({ ...d, type: e.target.value }))}><option value="pct">% off</option><option value="amount">£ off</option></select>
            <input type="number" step="0.01" value={discEdit.value} onChange={e => setDiscEdit(d => ({ ...d, value: e.target.value }))} style={{ width: 90 }} />
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}><button className="btn btn-sm btn-primary" onClick={() => discEdit.name.trim() && saveDiscounts([...discounts, { name: discEdit.name.trim(), type: discEdit.type, value: Number(discEdit.value) || 0 }])}>Save</button><button className="btn btn-sm" onClick={() => setDiscEdit(null)}>Cancel</button></div>
        </div>
      )}
      {edit && (
        <div className="stk-backdrop" onClick={() => setEdit(null)}>
          <div className="card stk-sheet" onClick={e => e.stopPropagation()}>
            <b>{edit.id ? 'Edit item' : 'New item'}</b>
            <div className="field"><label>Name</label><input value={edit.name} onChange={e => setEdit(x => ({ ...x, name: e.target.value }))} /></div>
            <div className="field"><label>Category</label><input value={edit.category || ''} onChange={e => setEdit(x => ({ ...x, category: e.target.value }))} placeholder="e.g. Clothing, Equipment" /></div>
            <div style={{ display: 'flex', gap: 8 }}>
              <div className="field" style={{ flex: 1 }}><label>Cost £</label><input type="number" step="0.01" value={edit.cost_price} onChange={e => setEdit(x => ({ ...x, cost_price: e.target.value }))} /></div>
              <div className="field" style={{ flex: 1 }}><label>Sell £</label><input type="number" step="0.01" value={edit.sell_price} onChange={e => setEdit(x => ({ ...x, sell_price: e.target.value }))} /></div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <div className="field" style={{ flex: 1 }}><label>Coach commission %</label><input type="number" step="0.5" value={edit.commission_pct} onChange={e => setEdit(x => ({ ...x, commission_pct: e.target.value }))} /></div>
              <div className="field" style={{ flex: 1 }}><label>Low stock at</label><input type="number" value={edit.low_stock} onChange={e => setEdit(x => ({ ...x, low_stock: e.target.value }))} /></div>
            </div>
            <div className="field"><label>Sizes / options (comma separated — new ones are added)</label><input value={edit.sizes} onChange={e => setEdit(x => ({ ...x, sizes: e.target.value }))} placeholder="e.g. S, M, L or Red, Blue" /></div>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, marginBottom: 10 }}><input type="checkbox" checked={edit.active !== false} onChange={e => setEdit(x => ({ ...x, active: e.target.checked }))} /> Selling this item</label>
            <div style={{ display: 'flex', gap: 8 }}><button className="btn btn-primary" onClick={saveItem}>Save</button><button className="btn" onClick={() => setEdit(null)}>Cancel</button></div>
          </div>
        </div>
      )}
    </>
  )
}
