import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase.js'
import { fetchAll } from '../../lib/fetchAll.js'

// 🔁 Admin: people worth contacting again, in four lists, with a message for each list.
// Anyone marked "Don't message" (members.do_not_contact / enquiries.do_not_contact) is never
// included. Every email / WhatsApp sent from here is logged so you can see who was messaged when.
// Plus 🤝 Referrals: who brought who in (credited automatically when the friend is approved).

const LISTS = [
  { key: 'stopped', icon: '⏸', label: 'Stopped', help: 'Members who stopped training in the period chosen.' },
  { key: 'not_started', icon: '🕒', label: 'Never started', help: 'Approved, but never came to a session.' },
  { key: 'trial', icon: '🥊', label: 'Trial, not joined', help: 'Enquiries that came to a trial but haven\u2019t joined.' },
  { key: 'cold', icon: '❄️', label: 'Cold enquiries', help: 'Enquiries still at Enquiry or Contacted after 3 weeks (last 6 months).' },
]
const STARTERS = {
  stopped: { subject: 'We miss you at KR Centre', adult: "Hi {name}, it's KR Centre 👋 We've missed seeing you at training! Whenever you're ready to come back, just reply to this message and we'll find a class that fits around you. Hope you're well!", child: "Hi {to}, it's KR Centre 👋 We've missed seeing {name} at training! Whenever {name} is ready to come back, just reply and we'll find a class that suits. Hope you're all well!" },
  not_started: { subject: 'Ready for your first session?', adult: "Hi {name}, it's KR Centre 👋 You're all signed up but we haven't seen you yet! Reply and we'll help you pick your first class — no experience needed.", child: "Hi {to}, it's KR Centre 👋 {name} is all signed up but we haven't seen them yet! Reply and we'll help you pick a first class — no experience needed." },
  trial: { subject: 'How was your trial?', adult: "Hi {name}, thanks for coming to try a session at KR Centre! 👊 How did you find it? If you'd like to join, just reply and we'll send everything over.", child: '' },
  cold: { subject: 'Still interested in KR Centre?', adult: "Hi {name}, it's KR Centre 👋 You got in touch with us a little while ago — are you still interested in classes? Reply and we'll book you a session.", child: '' },
}
const PERIODS = [[3, '3 months'], [6, '6 months'], [12, '12 months'], [36, '3 years']]
const daysAgo = d => (d ? Math.floor((Date.now() - new Date(d).getTime()) / 864e5) : null)
const ago = d => { const n = daysAgo(d); return n == null ? '' : n < 1 ? 'today' : n < 14 ? `${n}d ago` : n < 60 ? `${Math.round(n / 7)}w ago` : `${Math.round(n / 30)}mo ago` }
const waNumber = p => { const d = String(p || '').replace(/[^0-9]/g, ''); return d.startsWith('0') ? '44' + d.slice(1) : d }

export default function WinBackPanel({ sendRealEmail }) {
  const [view, setView] = useState('stopped')
  const [months, setMonths] = useState(6)
  const [students, setStudents] = useState(null)
  const [enqs, setEnqs] = useState([])
  const [log, setLog] = useState({})            // 'm:<member id>' / 'e:<enquiry id>' -> last messaged
  const [tpl, setTpl] = useState(STARTERS)
  const [editTpl, setEditTpl] = useState(false)
  const [picked, setPicked] = useState(new Set())
  const [sending, setSending] = useState(null)
  const [showOptedOut, setShowOptedOut] = useState(false)
  const [refs, setRefs] = useState(null)
  const [missingSql, setMissingSql] = useState(false)

  async function load() {
    const [{ data: st }, { data: en, error: enErr }, { data: lg, error: lgErr }, { data: t }] = await Promise.all([
      fetchAll(() => supabase.from('students').select('id, guardian_name, members!inner(id, first_name, last_name, email, phone, status, status_changed_at, do_not_contact)').in('members.status', ['stopped', 'not_started']).order('id')),
      fetchAll(() => supabase.from('enquiries').select('id, name, contact_phone, contact_email, status, enquiry_date, updated_at, do_not_contact').in('status', ['attended', 'not_started', 'contacted']).order('id')),
      fetchAll(() => supabase.from('winback_log').select('member_id, enquiry_id, created_at').order('created_at', { ascending: false })),
      supabase.from('settings').select('value').eq('key', 'winback_templates').maybeSingle(),
    ])
    if (enErr || lgErr) { setMissingSql(true); setStudents([]); return }
    setStudents(st || []); setEnqs(en || [])
    const last = {}
    ;(lg || []).forEach(l => { const k = l.member_id ? 'm:' + l.member_id : 'e:' + l.enquiry_id; if (!last[k]) last[k] = l.created_at })
    setLog(last)
    if (t?.value) setTpl(prev => ({ ...prev, ...t.value }))
  }
  async function loadRefs() {
    const { data, error } = await supabase.from('referrals')
      .select('id, created_at, code, reward_given, referrer:members!referrals_referrer_member_id_fkey(first_name, last_name), friend:members!referrals_new_member_id_fkey(first_name, last_name)')
      .order('created_at', { ascending: false })
    setRefs(error ? [] : data || [])
  }
  useEffect(() => { load(); loadRefs() }, [])

  // everyone on the current list, as one shape: { key, kind, id, name, to, phone, email, since, optedOut }
  const people = useMemo(() => {
    if (!students) return []
    const cutoff = Date.now() - months * 30 * 864e5
    if (view === 'stopped' || view === 'not_started') {
      return students.filter(s => s.members.status === view && (view !== 'stopped' || !s.members.status_changed_at || new Date(s.members.status_changed_at).getTime() >= cutoff))
        .map(s => ({
          key: 'm:' + s.members.id, kind: 'member', id: s.members.id, child: !!s.guardian_name,
          name: s.members.first_name || '', full: `${s.members.first_name || ''} ${s.members.last_name || ''}`.trim(),
          to: (s.guardian_name || '').trim().split(/\s+/)[0] || s.members.first_name || '',
          phone: s.members.phone, email: s.members.email, since: s.members.status_changed_at, optedOut: !!s.members.do_not_contact,
        }))
    }
    const sixMonths = Date.now() - 182 * 864e5, threeWeeks = Date.now() - 21 * 864e5
    return enqs.filter(e => view === 'trial' ? e.status === 'attended'
      : ['not_started', 'contacted'].includes(e.status) && e.enquiry_date && new Date(e.enquiry_date).getTime() < threeWeeks && new Date(e.enquiry_date).getTime() >= sixMonths)
      .map(e => ({
        key: 'e:' + e.id, kind: 'enquiry', id: e.id, child: false, name: (e.name || '').split(/\s+/)[0], full: e.name || 'No name',
        to: (e.name || '').split(/\s+/)[0], phone: e.contact_phone, email: e.contact_email, since: view === 'trial' ? e.updated_at : e.enquiry_date, optedOut: !!e.do_not_contact,
      }))
  }, [view, students, enqs, months])
  useEffect(() => { setPicked(new Set()) }, [view, months])

  const active = people.filter(p => !p.optedOut).sort((a, b) => String(b.since || '').localeCompare(String(a.since || '')))
  const optedOut = people.filter(p => p.optedOut)
  const T = tpl[view] || STARTERS[view]
  const messageFor = p => ((p.child && T.child) ? T.child : T.adult).replace(/\{name\}/gi, p.name).replace(/\{to\}/gi, p.to || p.name)

  async function logSent(p, channel) {
    const row = { list: view, channel, ...(p.kind === 'member' ? { member_id: p.id } : { enquiry_id: p.id }) }
    setLog(l => ({ ...l, [p.key]: new Date().toISOString() }))
    await supabase.from('winback_log').insert(row)
  }
  async function setOptOut(p, value) {
    const table = p.kind === 'member' ? 'members' : 'enquiries'
    const patch = { do_not_contact: value }
    // show the change straight away
    if (p.kind === 'member') setStudents(list => list.map(s => s.members.id === p.id ? { ...s, members: { ...s.members, do_not_contact: value } } : s))
    else setEnqs(list => list.map(e => e.id === p.id ? { ...e, do_not_contact: value } : e))
    setPicked(s => { const n = new Set(s); n.delete(p.key); return n })
    const { data, error } = await supabase.from(table).update(patch).eq('id', p.id).select('id')
    if (error || !data?.length) { alert('Not saved: ' + (error?.message || 'no permission')); load() }
  }
  async function emailPicked() {
    const list = active.filter(p => picked.has(p.key))
    const withEmail = list.filter(p => p.email)
    if (!withEmail.length) return alert('None of the people ticked have an email address.')
    if (!confirm(`Email ${withEmail.length} ${withEmail.length === 1 ? 'person' : 'people'} with the "${LISTS.find(l => l.key === view).label}" message?${withEmail.length < list.length ? `\n(${list.length - withEmail.length} have no email and will be skipped -- use WhatsApp for them.)` : ''}`)) return
    setSending({ done: 0, total: withEmail.length, ok: 0 })
    let ok = 0
    for (const p of withEmail) {
      const sent = await sendRealEmail(p.email, T.subject || 'KR Centre', messageFor(p), true)
      if (sent) { ok++; await logSent(p, 'email') }
      setSending(s => ({ ...s, done: s.done + 1, ok }))
    }
    alert(`✓ Sent to ${ok} of ${withEmail.length}.`)
    setSending(null); setPicked(new Set())
  }
  async function saveTpl(next) {
    setTpl(next)
    const { error } = await supabase.from('settings').upsert({ key: 'winback_templates', value: next }, { onConflict: 'key' })
    if (error) alert('Message not saved: ' + error.message)
  }
  async function toggleReward(r) {
    setRefs(list => list.map(x => x.id === r.id ? { ...x, reward_given: !r.reward_given } : x))
    const { data, error } = await supabase.from('referrals').update({ reward_given: !r.reward_given }).eq('id', r.id).select('id')
    if (error || !data?.length) { alert('Not saved'); loadRefs() }
  }

  if (missingSql) return (
    <div className="card" style={{ padding: 16 }}>
      <div style={{ fontWeight: 700, marginBottom: 6 }}>🔁 Win back</div>
      <div style={{ fontSize: 14, color: 'var(--text-secondary)' }}>Run <b>supabase_winback_referrals.sql</b> in the Supabase SQL editor, then open this tab again.</div>
    </div>
  )
  if (!students) return <div className="card" style={{ padding: 16, color: 'var(--text-secondary)' }}>Loading…</div>

  const listInfo = LISTS.find(l => l.key === view)

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
        <div style={{ fontSize: 18, fontWeight: 800, fontStyle: 'italic', marginRight: 8 }}>🔁 Win back</div>
        {LISTS.map(l => <button key={l.key} className={`btn btn-sm${view === l.key ? ' btn-primary' : ''}`} onClick={() => setView(l.key)}>{l.icon} {l.label}</button>)}
        <button className={`btn btn-sm${view === 'referrals' ? ' btn-primary' : ''}`} onClick={() => setView('referrals')}>🤝 Referrals{refs?.length ? ` (${refs.length})` : ''}</button>
      </div>

      {view === 'referrals' ? (
        <div>
          <div className="card" style={{ padding: 14, marginBottom: 10, fontSize: 14, color: 'var(--text-secondary)' }}>
            Every member has their own code in the athlete app (🤝 Bring a friend). When a friend uses it — typed as a promo code or from the member’s share link — the referral is credited here as soon as you approve the friend.
          </div>
          {(() => {
            const board = {}
            ;(refs || []).forEach(r => { const n = `${r.referrer?.first_name || ''} ${r.referrer?.last_name || ''}`.trim(); board[n] = (board[n] || 0) + 1 })
            const top = Object.entries(board).sort((a, b) => b[1] - a[1]).slice(0, 5)
            return top.length > 0 && (
              <div className="card" style={{ padding: 14, marginBottom: 10 }}>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>Top referrers</div>
                {top.map(([n, c], i) => <div key={n} style={{ fontSize: 15, padding: '3px 0' }}>{['🥇', '🥈', '🥉'][i] || '•'} {n} — {c}</div>)}
              </div>
            )
          })()}
          {refs?.length === 0 && <div className="card" style={{ padding: 16, color: 'var(--text-secondary)' }}>No referrals yet.</div>}
          {(refs || []).map(r => (
            <div key={r.id} className="card" style={{ padding: 12, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 200, fontSize: 15 }}>
                <b>{`${r.referrer?.first_name || ''} ${r.referrer?.last_name || ''}`.trim()}</b> brought in <b>{`${r.friend?.first_name || ''} ${r.friend?.last_name || ''}`.trim()}</b>
                <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{new Date(r.created_at).toLocaleDateString('en-GB')} · code {r.code}</div>
              </div>
              <label style={{ fontSize: 14, display: 'flex', gap: 6, alignItems: 'center' }}>
                <input type="checkbox" checked={r.reward_given} onChange={() => toggleReward(r)} /> Thank-you given
              </label>
            </div>
          ))}
        </div>
      ) : (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8, fontSize: 13, color: 'var(--text-secondary)' }}>
            <span>{listInfo.help}</span>
            {view === 'stopped' && (
              <select value={months} onChange={e => setMonths(Number(e.target.value))} style={{ fontSize: 14 }}>
                {PERIODS.map(([m, l]) => <option key={m} value={m}>Last {l}</option>)}
              </select>
            )}
          </div>

          <div className="card" style={{ padding: 12, marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ fontWeight: 700, flex: 1 }}>Message for this list</div>
              <button className="btn btn-sm" onClick={() => setEditTpl(v => !v)}>{editTpl ? 'Done' : '✏️ Edit'}</button>
            </div>
            {editTpl ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
                <input defaultValue={T.subject} placeholder="Email subject" onBlur={e => saveTpl({ ...tpl, [view]: { ...T, subject: e.target.value } })} style={{ fontSize: 15, padding: '8px 10px' }} />
                <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{view === 'stopped' || view === 'not_started' ? 'Adults' : 'Message'} — {'{name}'} = their first name</label>
                <textarea rows={4} defaultValue={T.adult} onBlur={e => saveTpl({ ...tpl, [view]: { ...T, adult: e.target.value } })} style={{ fontSize: 15, padding: '8px 10px' }} />
                {(view === 'stopped' || view === 'not_started') && <>
                  <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Children (goes to the parent) — {'{to}'} = parent’s first name, {'{name}'} = child’s first name</label>
                  <textarea rows={4} defaultValue={T.child} onBlur={e => saveTpl({ ...tpl, [view]: { ...T, child: e.target.value } })} style={{ fontSize: 15, padding: '8px 10px' }} />
                </>}
              </div>
            ) : <div style={{ fontSize: 14, color: 'var(--text-secondary)', marginTop: 6, whiteSpace: 'pre-wrap' }}>{T.adult}</div>}
          </div>

          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10, alignItems: 'center' }}>
            <button className="btn btn-sm" onClick={() => setPicked(new Set(active.filter(p => daysAgo(log[p.key]) == null || daysAgo(log[p.key]) > 30).map(p => p.key)))}>Tick all not messaged in 30 days</button>
            {picked.size > 0 && <button className="btn btn-sm" onClick={() => setPicked(new Set())}>Untick all</button>}
            <button className="btn btn-sm btn-primary" disabled={!picked.size || !!sending} onClick={emailPicked}>
              {sending ? `Sending ${sending.done}/${sending.total}…` : `✉️ Email ticked (${picked.size})`}
            </button>
          </div>

          {active.length === 0 && <div className="card" style={{ padding: 16, color: 'var(--text-secondary)' }}>No one on this list right now.</div>}
          {active.map(p => (
            <div key={p.key} className="card" style={{ padding: 12, marginBottom: 8, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <input type="checkbox" checked={picked.has(p.key)} style={{ width: 20, height: 20 }}
                onChange={() => setPicked(s => { const n = new Set(s); n.has(p.key) ? n.delete(p.key) : n.add(p.key); return n })} />
              <div style={{ flex: 1, minWidth: 170 }}>
                <div style={{ fontSize: 16, fontWeight: 600 }}>{p.full}{p.child && <span style={{ fontSize: 12, color: 'var(--text-tertiary)', fontWeight: 400 }}> · parent {p.to}</span>}</div>
                <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                  {p.since ? ago(p.since) : 'date not known'}
                  {log[p.key] ? <span style={{ color: '#EF9F27' }}> · messaged {ago(log[p.key])}</span> : ''}
                  {!p.phone && !p.email ? ' · no phone or email' : ''}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {p.phone && <a className="btn btn-sm" href={`https://wa.me/${waNumber(p.phone)}?text=${encodeURIComponent(messageFor(p))}`} target="_blank" rel="noreferrer" onClick={() => logSent(p, 'whatsapp')}>💬 WhatsApp</a>}
                {p.email && <button className="btn btn-sm" onClick={async () => { if (await sendRealEmail(p.email, T.subject || 'KR Centre', messageFor(p))) { logSent(p, 'email'); alert('✓ Email sent') } }}>✉️</button>}
                <button className="btn btn-sm" title="Never include them in these lists again" onClick={() => setOptOut(p, true)}>🚫 Don’t message</button>
              </div>
            </div>
          ))}

          {optedOut.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <button className="btn btn-sm" onClick={() => setShowOptedOut(v => !v)}>{showOptedOut ? 'Hide' : 'Show'} {optedOut.length} not to be messaged</button>
              {showOptedOut && optedOut.map(p => (
                <div key={p.key} className="card" style={{ padding: 10, marginTop: 6, display: 'flex', alignItems: 'center', gap: 8, opacity: 0.7 }}>
                  <div style={{ flex: 1, fontSize: 14 }}>🚫 {p.full}</div>
                  <button className="btn btn-sm" onClick={() => setOptOut(p, false)}>Allow messages again</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
