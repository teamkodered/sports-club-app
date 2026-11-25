import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase.js'
import { fetchAll } from '../../lib/fetchAll.js'
import { cleanCampaignCode } from '../../lib/campaignCode.js'

// 📊 Admin: one month of marketing at a glance, compared with the month before.
// New members / returned use the same rules as Trackers (approved students only).
// Campaign spend is shared out by the days each campaign ran in the month.

const METHOD = { email: 'Email / website', facebook_ad: 'Facebook / Instagram ad', call: 'Phone call', text: 'Text message', in_person: 'In person', other: 'Other' }
const TRIAL = ['trial_booked', 'attended', 'joined']
const ym = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
const monthLabel = m => new Date(m + '-15').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
const addMonths = (m, n) => { const d = new Date(m + '-15'); d.setMonth(d.getMonth() + n); return ym(d) }
const money = n => '£' + (Math.round(n * 100) / 100).toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
const pct = (a, b) => (b ? Math.round((a / b) * 100) + '%' : '—')
const inMonth = (v, m) => String(v || '').startsWith(m)
function countBy(rows, fn) {
  const out = {}
  rows.forEach(r => { const k = fn(r) || 'Not given'; out[k] = (out[k] || 0) + 1 })
  return Object.entries(out).sort((a, b) => b[1] - a[1])
}
function spendIn(c, m) {           // campaign spend shared out by days in this month
  if (!Number(c.spend)) return 0
  const start = new Date((c.starts_on || c.created_at.slice(0, 10)) + 'T12:00:00')
  const end = new Date((c.ends_on || new Date().toISOString().slice(0, 10)) + 'T12:00:00')
  const ms = new Date(m + '-01T12:00:00'), me = new Date(addMonths(m, 1) + '-01T12:00:00'); me.setDate(me.getDate() - 1)
  const total = Math.max(1, Math.round((end - start) / 864e5) + 1)
  const a = start > ms ? start : ms, b = end < me ? end : me
  const days = Math.round((b - a) / 864e5) + 1
  return days > 0 ? (Number(c.spend) * days) / total : 0
}

async function loadMonth(m) {
  const from = m + '-01', to = addMonths(m, 1) + '-01'
  const safe = async q => { const r = await q; return r.error ? [] : (r.data || []) }
  const [enqs, forms, members, campaigns, refs, wb, posts, moments] = await Promise.all([
    fetchAll(() => supabase.from('enquiries').select('id, contact_method, status, enquiry_date, campaign_id').gte('enquiry_date', from).lt('enquiry_date', to).order('id')).then(r => r.data || []),
    fetchAll(() => supabase.from('membership_forms').select('id, member_id, form_type, hear_about, promo_code, campaign_code, submitted_at').gte('submitted_at', from).lt('submitted_at', to).order('id')).then(r => r.data || []),
    fetchAll(() => supabase.from('members').select('id, status, joined_date, rejoined_at, status_changed_at, students!inner(id)').order('id')).then(r => r.data || []),
    safe(supabase.from('campaigns').select('id, name, code, spend, starts_on, ends_on, created_at')),
    safe(supabase.from('referrals').select('id').gte('created_at', from).lt('created_at', to)),
    safe(supabase.from('winback_log').select('member_id, enquiry_id, list, created_at').gte('created_at', from).lt('created_at', to)),
    safe(supabase.from('marketing_posts').select('id, status, channels, post_date').gte('post_date', from).lt('post_date', to)),
    safe(supabase.from('moments').select('id').gte('created_at', from).lt('created_at', to)),
  ])
  const newMembers = members.filter(x => inMonth(x.joined_date, m) && !['pending', 'not_started'].includes(x.status))
  const returned = members.filter(x => inMonth(x.rejoined_at, m) && x.status !== 'stopped')
  const stopped = members.filter(x => x.status === 'stopped' && inMonth(x.status_changed_at, m))
  const memberStatus = Object.fromEntries(members.map(x => [x.id, x.status]))

  // campaigns: in-month enquiries, join forms and spend
  const camp = campaigns.map(c => {
    const ce = enqs.filter(e => e.campaign_id === c.id)
    const cf = c.code ? forms.filter(f => cleanCampaignCode(f.campaign_code) === c.code || cleanCampaignCode(f.promo_code) === c.code) : []
    const joined = new Set([...ce.filter(e => e.status === 'joined').map(e => 'e' + e.id), ...cf.filter(f => ['active', 'stopped', 'inactive'].includes(memberStatus[f.member_id])).map(f => f.member_id)])
    return { name: c.name, spend: spendIn(c, m), enquiries: ce.length, forms: cf.length, joined: joined.size }
  }).filter(c => c.spend > 0 || c.enquiries || c.forms)
  const spend = camp.reduce((t, c) => t + c.spend, 0)

  // win back: stopped / never-started people messaged this month who are now active
  const messagedMembers = [...new Set(wb.filter(w => w.member_id).map(w => w.member_id))]
  const cameBack = messagedMembers.filter(id => memberStatus[id] === 'active').length
  const postedPosts = posts.filter(p => p.status === 'posted')
  const channels = {}
  postedPosts.forEach(p => (p.channels || []).forEach(c => { channels[c] = (channels[c] || 0) + 1 }))

  return {
    enquiries: enqs.length, trials: enqs.filter(e => TRIAL.includes(e.status)).length, enqJoined: enqs.filter(e => e.status === 'joined').length,
    bySource: countBy(enqs, e => METHOD[e.contact_method] || e.contact_method),
    forms: forms.length, foundUs: countBy(forms, f => (f.hear_about || '').trim()),
    newMembers: newMembers.length, returned: returned.length, stopped: stopped.length,
    camp, spend, referrals: refs.length,
    winbackSent: wb.length, winbackPeople: messagedMembers.length + new Set(wb.filter(w => w.enquiry_id).map(w => w.enquiry_id)).size, cameBack,
    posts: postedPosts.length, planned: posts.length, channels: Object.entries(channels).sort((a, b) => b[1] - a[1]), moments: moments.length,
  }
}

function Delta({ now, before, good = 'up' }) {
  if (before == null || now === before) return null
  const up = now > before
  const col = (up && good === 'up') || (!up && good === 'down') ? '#1D9E75' : '#E24B4A'
  return <span style={{ fontSize: 12, color: col, fontWeight: 600 }}> {up ? '▲' : '▼'}{Math.abs(now - before)}</span>
}
function Bars({ rows }) {
  const max = Math.max(1, ...rows.map(r => r[1]))
  return rows.map(([k, v]) => (
    <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, margin: '4px 0' }}>
      <div style={{ width: 150, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{k}</div>
      <div style={{ flex: 1, background: 'var(--bg-secondary)', borderRadius: 4, height: 16 }}>
        <div style={{ width: `${(v / max) * 100}%`, background: '#378ADD', height: '100%', borderRadius: 4 }} />
      </div>
      <div style={{ width: 28, textAlign: 'right', fontWeight: 600 }}>{v}</div>
    </div>
  ))
}

export default function MarketingReport() {
  const [month, setMonth] = useState(ym(new Date()))
  const [data, setData] = useState(null)
  const [prev, setPrev] = useState(null)
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    let stop = false
    setData(null); setPrev(null)
    Promise.all([loadMonth(month), loadMonth(addMonths(month, -1))]).then(([a, b]) => { if (!stop) { setData(a); setPrev(b) } })
    return () => { stop = true }
  }, [month])
  const isCurrent = month === ym(new Date())

  function summary() {
    const d = data
    return [
      `KR Centre marketing — ${monthLabel(month)}${isCurrent ? ' (so far)' : ''}`,
      `Enquiries: ${d.enquiries} (trials ${d.trials}, joined ${d.enqJoined})`,
      `Join forms: ${d.forms} · New members: ${d.newMembers} · Returned: ${d.returned} · Stopped: ${d.stopped}`,
      `Ad spend: ${money(d.spend)}${d.newMembers && d.spend ? ` · Cost per new member: ${money(d.spend / d.newMembers)}` : ''}`,
      `Top sources: ${d.foundUs.slice(0, 3).map(([k, v]) => `${k} ${v}`).join(', ') || '—'}`,
      `Referrals: ${d.referrals} · Win back messages: ${d.winbackSent} (${d.cameBack} back training)`,
      `Posts: ${d.posts} posted · Moments sent in: ${d.moments}`,
    ].join('\n')
  }

  const box = (label, v, p, good) => (
    <div style={{ background: 'var(--bg-secondary)', borderRadius: 10, padding: '10px 6px', textAlign: 'center' }}>
      <div style={{ fontSize: 22, fontWeight: 800 }}>{v}{p !== undefined && <Delta now={v} before={p} good={good} />}</div>
      <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{label}</div>
    </div>
  )
  const grid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8 }
  const h = { fontSize: 15, fontWeight: 700, marginBottom: 8 }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <div style={{ fontSize: 18, fontWeight: 800, fontStyle: 'italic', flex: 1 }}>📊 Marketing report</div>
        <button className="btn btn-sm" onClick={() => setMonth(addMonths(month, -1))}>◀</button>
        <div style={{ fontWeight: 700, minWidth: 130, textAlign: 'center' }}>{monthLabel(month)}</div>
        <button className="btn btn-sm" disabled={isCurrent} onClick={() => setMonth(addMonths(month, 1))}>▶</button>
        {data && <button className="btn btn-sm" onClick={() => { const t = summary(); (navigator.clipboard?.writeText(t) || Promise.reject()).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) }, () => prompt('Copy:', t)) }}>{copied ? '✓ Copied' : '📋 Copy summary'}</button>}
      </div>
      {isCurrent && <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 8 }}>This month so far. Arrows compare with {monthLabel(addMonths(month, -1))}.</div>}
      {!data ? <div className="card" style={{ padding: 16, color: 'var(--text-secondary)' }}>Adding it up…</div> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="card" style={{ padding: 14 }}>
            <div style={h}>Members</div>
            <div style={grid}>
              {box('New members', data.newMembers, prev?.newMembers)}
              {box('Came back', data.returned, prev?.returned)}
              {box('Stopped', data.stopped, prev?.stopped, 'down')}
              {box('Join forms', data.forms, prev?.forms)}
            </div>
          </div>

          <div className="card" style={{ padding: 14 }}>
            <div style={h}>Enquiries</div>
            <div style={grid}>
              {box('Enquiries', data.enquiries, prev?.enquiries)}
              {box('Got to a trial', data.trials, prev?.trials)}
              {box('Joined', data.enqJoined, prev?.enqJoined)}
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 8 }}>
              Enquiry → trial {pct(data.trials, data.enquiries)} · trial → joined {pct(data.enqJoined, data.trials)}
            </div>
            {data.bySource.length > 0 && <div style={{ marginTop: 10 }}><div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>How they got in touch</div><Bars rows={data.bySource} /></div>}
          </div>

          <div className="card" style={{ padding: 14 }}>
            <div style={h}>Where they found us <span style={{ fontWeight: 400, fontSize: 12, color: 'var(--text-tertiary)' }}>(join forms)</span></div>
            {data.foundUs.length ? <Bars rows={data.foundUs} /> : <div style={{ fontSize: 14, color: 'var(--text-secondary)' }}>No join forms this month.</div>}
          </div>

          <div className="card" style={{ padding: 14 }}>
            <div style={h}>Campaigns</div>
            <div style={grid}>
              {box('Spent', money(data.spend))}
              {box('Per new member', data.newMembers && data.spend ? money(data.spend / data.newMembers) : '—')}
            </div>
            {data.camp.length > 0 && (
              <div style={{ overflowX: 'auto', marginTop: 10 }}>
                <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
                  <thead><tr style={{ color: 'var(--text-secondary)', textAlign: 'left' }}><th style={{ padding: 4 }}>Campaign</th><th>Spend</th><th>Enquiries</th><th>Forms</th><th>Joined</th><th>Per joiner</th></tr></thead>
                  <tbody>{data.camp.map(c => (
                    <tr key={c.name} style={{ borderTop: '1px solid var(--border)' }}>
                      <td style={{ padding: 4, fontWeight: 600 }}>{c.name}</td><td>{money(c.spend)}</td><td>{c.enquiries}</td><td>{c.forms}</td><td>{c.joined}</td><td>{c.joined && c.spend ? money(c.spend / c.joined) : '—'}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
            <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 6 }}>Spend is shared out by the days each campaign ran this month.</div>
          </div>

          <div className="card" style={{ padding: 14 }}>
            <div style={h}>Win back and referrals</div>
            <div style={grid}>
              {box('Messages sent', data.winbackSent, prev?.winbackSent)}
              {box('People messaged', data.winbackPeople)}
              {box('Now training again', data.cameBack)}
              {box('Referrals', data.referrals, prev?.referrals)}
            </div>
          </div>

          <div className="card" style={{ padding: 14 }}>
            <div style={h}>Social media</div>
            <div style={grid}>
              {box('Posted', data.posts, prev?.posts)}
              {box('Planned', data.planned)}
              {box('Moments sent in', data.moments, prev?.moments)}
            </div>
            {data.channels.length > 0 && <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 8 }}>{data.channels.map(([c, n]) => `${c[0].toUpperCase() + c.slice(1)} ${n}`).join(' · ')}</div>}
          </div>
        </div>
      )}
    </div>
  )
}
