import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase.js'
import { cleanCampaignCode } from '../../lib/campaignCode.js'
import { VENUES } from '../../lib/joinVenue.jsx'

// 📣 Admin: each ad / flyer / open day as a campaign -- its dates, spend and code --
// and what it brought in: enquiries -> trials -> joined, and the cost of each.
// Enquiries are tagged by Facebook form / ad name (automatic) or by hand on the enquiry;
// join forms are credited by the ?c=code in the link they used, or the code typed as a promo code.

const CHANNELS = [
  ['facebook', 'Facebook ad', '#378ADD'], ['instagram', 'Instagram ad', '#EC4899'], ['google', 'Google ad', '#1D9E75'],
  ['flyer', 'Flyer / leaflet', '#EF9F27'], ['event', 'Open day / event', '#8B5CF6'], ['school', 'School visit', '#06B6D4'], ['other', 'Other', '#9CA3AF'],
]
const chan = k => CHANNELS.find(c => c[0] === k) || CHANNELS[CHANNELS.length - 1]
const GROUPS = ['All', 'PKA kids', 'PKA adults', 'KRBA', 'KR squad']
const ALL_VENUES = [...VENUES, { key: 'alvaston', label: 'Alvaston Project' }]
const TRIAL_STAGES = ['trial_booked', 'attended', 'joined']
const JOINED_MEMBER = ['active', 'stopped', 'inactive']     // approved at some point (stopped later still counts)
const JOIN_FORMS = [['join', 'Any class (pick on the page)'], ['join-pka-child', 'PKA kids'], ['join-pka-adult', 'PKA adults'], ['join-krba', 'KRBA']]

const money = n => '£' + Number(n || 0).toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
const per = (spend, n) => (Number(spend) > 0 && n > 0 ? money(Math.round((spend / n) * 100) / 100) : '—')
const fmtDate = d => (d ? new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' }) : '')
const blank = () => ({ name: '', channel: 'facebook', code: '', match_text: '', starts_on: new Date().toISOString().slice(0, 10), ends_on: '', spend: '', grp: 'All', venue: '', notes: '' })

async function fetchAllRows(build) {
  const out = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build().range(from, from + 999)
    if (error) return { data: out, error }
    out.push(...(data || []))
    if (!data || data.length < 1000) return { data: out, error: null }
  }
}

export default function CampaignsPanel() {
  const [list, setList] = useState(null)
  const [missingSql, setMissingSql] = useState(false)
  const [enqs, setEnqs] = useState([])
  const [forms, setForms] = useState([])
  const [edit, setEdit] = useState(null)          // draft being added / edited
  const [busy, setBusy] = useState(false)
  const [showArchived, setShowArchived] = useState(false)
  const [openId, setOpenId] = useState(null)
  const [copied, setCopied] = useState('')

  async function load() {
    const { data, error } = await supabase.from('campaigns').select('*').order('starts_on', { ascending: false, nullsFirst: false })
    if (error) { setMissingSql(true); setList([]); return }
    setList(data || [])
    const [{ data: e }, { data: f }] = await Promise.all([
      fetchAllRows(() => supabase.from('enquiries').select('id, campaign_id, status, enquiry_date, linked_member_id').not('campaign_id', 'is', null).order('id')),
      fetchAllRows(() => supabase.from('membership_forms').select('id, member_id, form_type, campaign_code, promo_code, submitted_at, members(status)')
        .or('campaign_code.not.is.null,promo_code.not.is.null').order('id')),
    ])
    setEnqs(e || []); setForms(f || [])
  }
  useEffect(() => { load() }, [])

  // results per campaign
  const stats = useMemo(() => {
    const out = {}
    for (const c of list || []) {
      const ce = enqs.filter(e => e.campaign_id === c.id)
      const cf = c.code ? forms.filter(f => cleanCampaignCode(f.campaign_code) === c.code || cleanCampaignCode(f.promo_code) === c.code) : []
      const joined = new Set()
      ce.filter(e => e.status === 'joined').forEach(e => joined.add(e.linked_member_id || 'enq:' + e.id))
      cf.filter(f => JOINED_MEMBER.includes(f.members?.status)).forEach(f => joined.add(f.member_id))
      out[c.id] = { enquiries: ce.length, trials: ce.filter(e => TRIAL_STAGES.includes(e.status)).length, forms: cf.length, joined: joined.size }
    }
    return out
  }, [list, enqs, forms])

  const shown = (list || []).filter(c => showArchived || !c.archived)
  const totals = shown.reduce((t, c) => {
    const s = stats[c.id] || {}
    return { spend: t.spend + Number(c.spend || 0), enquiries: t.enquiries + (s.enquiries || 0), trials: t.trials + (s.trials || 0), joined: t.joined + (s.joined || 0) }
  }, { spend: 0, enquiries: 0, trials: 0, joined: 0 })

  async function save() {
    const d = edit
    if (!d.name.trim()) return alert('Give the campaign a name.')
    const code = cleanCampaignCode(d.code || d.name.replace(/\s+/g, '-'))
    if (!code) return alert('The code needs letters or numbers.')
    if (d.ends_on && d.starts_on && d.ends_on < d.starts_on) return alert('The end date is before the start date.')
    const row = {
      name: d.name.trim(), channel: d.channel, code, match_text: d.match_text.trim() || null,
      starts_on: d.starts_on || null, ends_on: d.ends_on || null, spend: Number(d.spend) || 0,
      grp: d.grp === 'All' ? null : d.grp, venue: d.venue || null, notes: d.notes.trim() || null,
    }
    setBusy(true)
    const q = d.id ? supabase.from('campaigns').update(row).eq('id', d.id) : supabase.from('campaigns').insert(row)
    const { data, error } = await q.select()
    setBusy(false)
    if (error) return alert(/duplicate|unique/i.test(error.message) ? `The code "${code}" is already used by another campaign -- pick a different one.` : 'Could not save: ' + error.message)
    if (!data?.length) return alert('Not saved -- only admins can change campaigns.')
    const saved = data[0]
    setList(prev => d.id ? prev.map(c => c.id === saved.id ? saved : c) : [saved, ...prev])
    setEdit(null); setOpenId(saved.id)
    if (saved.match_text) {
      const { data: n, error: tagErr } = await supabase.rpc('kc_campaign_tag_existing')
      if (!tagErr && n > 0) alert(`📣 ${n} earlier ${n === 1 ? 'enquiry was' : 'enquiries were'} tagged to a campaign from their Facebook form / ad name.`)
      load()
    }
  }

  async function setArchived(c, archived) {
    setList(prev => prev.map(x => x.id === c.id ? { ...x, archived } : x))
    const { data, error } = await supabase.from('campaigns').update({ archived }).eq('id', c.id).select()
    if (error || !data?.length) { alert('Could not update: ' + (error?.message || 'no permission')); load() }
  }

  function copy(text, key) {
    const done = () => { setCopied(key); setTimeout(() => setCopied(''), 1500) }
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(done, () => prompt('Copy this link:', text))
    else prompt('Copy this link:', text)
  }
  const linkFor = (c, path) => `${window.location.origin}/${path}?c=${c.code}${VENUES.some(v => v.key === c.venue) ? `&venue=${c.venue}` : ''}`

  if (list === null) return <div className="card" style={{ padding: 16, color: 'var(--text-secondary)' }}>Loading campaigns…</div>
  if (missingSql) return (
    <div className="card" style={{ padding: 16 }}>
      <div style={{ fontWeight: 700, marginBottom: 6 }}>📣 Campaigns</div>
      <div style={{ fontSize: 14, color: 'var(--text-secondary)' }}>Run <b>supabase_marketing_campaigns.sql</b> in the Supabase SQL editor, then open this tab again.</div>
    </div>
  )

  const lab = { fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }
  const inp = { fontSize: 15, width: '100%', padding: '9px 10px' }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <div style={{ fontSize: 18, fontWeight: 800, fontStyle: 'italic', flex: 1 }}>📣 Campaigns</div>
        <label style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
          <input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)} /> Show finished
        </label>
        {!edit && <button className="btn btn-primary" onClick={() => setEdit(blank())}>+ New campaign</button>}
      </div>

      {edit && (
        <div className="card" style={{ padding: 16, marginBottom: 14, borderColor: '#EC4899' }}>
          <div style={{ fontWeight: 700, marginBottom: 10 }}>{edit.id ? 'Edit campaign' : 'New campaign'}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div><label style={lab}>Name</label>
              <input style={inp} value={edit.name} placeholder="e.g. January kids Facebook ad" onChange={e => setEdit(d => ({ ...d, name: e.target.value }))} /></div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 150 }}><label style={lab}>Type</label>
                <select style={inp} value={edit.channel} onChange={e => setEdit(d => ({ ...d, channel: e.target.value }))}>
                  {CHANNELS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select></div>
              <div style={{ flex: 1, minWidth: 120 }}><label style={lab}>Spend (£)</label>
                <input style={inp} type="number" inputMode="decimal" min="0" step="0.01" value={edit.spend} placeholder="0" onChange={e => setEdit(d => ({ ...d, spend: e.target.value }))} /></div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 140 }}><label style={lab}>Starts</label>
                <input style={inp} type="date" value={edit.starts_on || ''} onChange={e => setEdit(d => ({ ...d, starts_on: e.target.value }))} /></div>
              <div style={{ flex: 1, minWidth: 140 }}><label style={lab}>Ends (blank = still running)</label>
                <input style={inp} type="date" value={edit.ends_on || ''} onChange={e => setEdit(d => ({ ...d, ends_on: e.target.value }))} /></div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 140 }}><label style={lab}>For</label>
                <select style={inp} value={edit.grp} onChange={e => setEdit(d => ({ ...d, grp: e.target.value }))}>
                  {GROUPS.map(g => <option key={g}>{g}</option>)}
                </select></div>
              <div style={{ flex: 1, minWidth: 140 }}><label style={lab}>Venue</label>
                <select style={inp} value={edit.venue} onChange={e => setEdit(d => ({ ...d, venue: e.target.value }))}>
                  <option value="">All venues</option>
                  {ALL_VENUES.map(v => <option key={v.key} value={v.key}>{v.label}</option>)}
                </select></div>
            </div>
            <div><label style={lab}>Code for links and promo code (short, no spaces)</label>
              <input style={inp} value={edit.code} placeholder={cleanCampaignCode(edit.name.replace(/\s+/g, '-')) || 'e.g. jan-kids'}
                onChange={e => setEdit(d => ({ ...d, code: cleanCampaignCode(e.target.value) }))} /></div>
            {['facebook', 'instagram'].includes(edit.channel) && (
              <div><label style={lab}>Facebook form or ad name contains…</label>
                <input style={inp} value={edit.match_text} placeholder="e.g. Junior Advert" onChange={e => setEdit(d => ({ ...d, match_text: e.target.value }))} />
                <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 4 }}>Facebook leads whose form or ad name has this in it, dated inside the campaign dates, are tagged automatically -- new ones and ones already in Enquiries.</div>
              </div>
            )}
            <div><label style={lab}>Notes</label>
              <textarea rows={2} style={{ ...inp, resize: 'vertical' }} value={edit.notes} onChange={e => setEdit(d => ({ ...d, notes: e.target.value }))} /></div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-primary" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save'}</button>
              <button className="btn" onClick={() => setEdit(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {shown.length > 0 && (
        <div className="card" style={{ padding: 12, marginBottom: 12, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, textAlign: 'center' }}>
          {[['Spent', money(totals.spend)], ['Enquiries', totals.enquiries], ['Trials', totals.trials], ['Joined', totals.joined]].map(([l, v]) => (
            <div key={l}><div style={{ fontSize: 20, fontWeight: 800 }}>{v}</div><div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{l}</div></div>
          ))}
          <div style={{ gridColumn: '1 / -1', fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>
            Cost per enquiry {per(totals.spend, totals.enquiries)} · per trial {per(totals.spend, totals.trials)} · <b style={{ color: 'var(--text)' }}>per joiner {per(totals.spend, totals.joined)}</b>
          </div>
        </div>
      )}

      {shown.length === 0 && !edit && (
        <div className="card" style={{ padding: 16, fontSize: 14, color: 'var(--text-secondary)' }}>
          No campaigns yet. Add one for each ad, flyer drop or open day -- then share its join links, and see what it brought in here.
        </div>
      )}

      {shown.map(c => {
        const s = stats[c.id] || {}
        const [, chLabel, chCol] = chan(c.channel)
        const open = openId === c.id
        const running = !c.ends_on || c.ends_on >= new Date().toISOString().slice(0, 10)
        return (
          <div key={c.id} className="card" style={{ padding: 14, marginBottom: 10, opacity: c.archived ? 0.6 : 1, borderLeft: `4px solid ${chCol}` }}>
            <div onClick={() => setOpenId(open ? null : c.id)} style={{ cursor: 'pointer' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                <div style={{ fontSize: 16, fontWeight: 700, flex: 1 }}>{c.name}</div>
                <span className="badge" style={{ background: chCol + '22', color: chCol, fontSize: 11 }}>{chLabel}</span>
                {c.archived ? <span className="badge badge-gray" style={{ fontSize: 11 }}>Finished</span> : running ? <span className="badge badge-green" style={{ fontSize: 11 }}>Running</span> : null}
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 3 }}>
                {fmtDate(c.starts_on)}{c.ends_on ? ` – ${fmtDate(c.ends_on)}` : c.starts_on ? ' onwards' : ''}
                {c.grp ? ` · ${c.grp}` : ''}{c.venue ? ` · ${ALL_VENUES.find(v => v.key === c.venue)?.label || c.venue}` : ''} · {money(c.spend)}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4, marginTop: 10, textAlign: 'center' }}>
                {[['Enquiries', s.enquiries, per(c.spend, s.enquiries)], ['Trials', s.trials, per(c.spend, s.trials)], ['Join forms', s.forms, null], ['Joined', s.joined, per(c.spend, s.joined)]].map(([l, v, cost]) => (
                  <div key={l} style={{ background: 'var(--bg-secondary)', borderRadius: 8, padding: '6px 2px' }}>
                    <div style={{ fontSize: 18, fontWeight: 800 }}>{v || 0}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{l}</div>
                    {cost && cost !== '—' && <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{cost} each</div>}
                  </div>
                ))}
              </div>
            </div>

            {open && (
              <div style={{ marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 10 }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Join links for this campaign</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                  {JOIN_FORMS.map(([path, label]) => (
                    <button key={path} className="btn btn-sm" onClick={() => copy(linkFor(c, path), c.id + path)}>
                      {copied === c.id + path ? '✓ Copied' : `🔗 ${label} link`}
                    </button>
                  ))}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 8 }}>
                  Promo code: <b style={{ color: 'var(--text)' }}>{c.code}</b> -- anyone typing it on a join form is credited here too.
                  {c.match_text ? <> Facebook leads matched on “{c.match_text}”.</> : null}
                </div>
                {c.notes && <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8, whiteSpace: 'pre-wrap' }}>{c.notes}</div>}
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn btn-sm" onClick={() => setEdit({ ...blank(), ...c, spend: c.spend ?? '', grp: c.grp || 'All', venue: c.venue || '', match_text: c.match_text || '', notes: c.notes || '', ends_on: c.ends_on || '' })}>Edit</button>
                  <button className="btn btn-sm" onClick={() => setArchived(c, !c.archived)}>{c.archived ? 'Bring back' : 'Mark finished'}</button>
                </div>
              </div>
            )}
          </div>
        )
      })}

      <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 8 }}>
        Trials = enquiries now at Trial booked, Attended or Joined. Joined = approved members, from tagged enquiries or join forms with this campaign's code (each person counted once).
      </div>
    </div>
  )
}
