import { useRef, useState } from 'react'
import { supabase } from '../../lib/supabase.js'
import { INTEREST_GROUPS, interestOf, introOf } from '../../lib/enquiryInterest.js'

// ── Enquiry message templates ──
// Placeholders (filled per enquiry):
//   {name}   enquirer's first name             e.g. "Sarah"
//   {who}    who it's for                      "you" | "Alfie" | "Alfie and Mia"
//   {who_is} who it's for + is/are             "you are" | "Alfie is" | "Alfie and Mia are"
//   {their}  "your" (themselves) / "their"
//   {them}   "you" (themselves) / "them"
//   {class}  what they're interested in long-term       "Juniors" | "Tiny Tots" | "Adults" …
//   {intro_date} {intro_day} {intro_time} {intro_venue} {intro_address}  their free intro session
//   {intro_details}  "Monday 20 October at 6.30pm at The KR Centre"
export const ENQUIRY_PLACEHOLDERS = ['{name}', '{who}', '{who_is}', '{their}', '{them}', '{class}', '{intro_details}', '{intro_date}', '{intro_day}', '{intro_time}', '{intro_venue}', '{intro_address}']
export const usesIntro = t => /\{intro_/.test(t || '')
export const usesClass = t => /\{class\}/.test(t || '')

const SIGNATURE_SARA = `Sara (Derby PKA)💪❤️

07867 952311
www.derbykickboxing.org.uk
www.pka-kickboxing.com
www.teamkodered.com`

// Templates belong to a group: 'enquiry' (default), 'starter' (new member joined), 'stopped' (stopped training)
export const TEMPLATE_KINDS = [['enquiry', 'Enquiry'], ['starter', 'New starter'], ['stopped', 'Stopped training']]
export const kindOf = t => t?.kind || 'enquiry'
export const DEFAULT_KIND_TEMPLATES_RAW = {
  starter: [{ id: 'starter_welcome', kind: 'starter', label: 'Welcome — new starter', subject: 'Welcome to Derby PKA!', body: `Hi {name}
Welcome to Derby PKA Kickboxing — we're really pleased {who_is} joining us! 🥳

A few things to help {them} settle in:
• Arrive 5–10 minutes early and bring a drink of water
• Wear comfortable sports clothes (club kit is available at the desk)
• The KR Centre app is the place to check in, see progress and earn house points

If you've any questions at all, just reply to this message.

{SIG}` }],
  stopped: [{ id: 'stopped_goodbye', kind: 'stopped', label: 'Sorry to see you go', subject: "We'll miss you at Derby PKA", body: `Hi {name}
We noticed {who_is} no longer training with us, and just wanted to say a big thank you for being part of Derby PKA.

If there's anything we could have done better, or anything that would help {them} come back, we'd really like to hear it.
The door is always open — {who} would be very welcome back any time.

{SIG}` }],
}
export const DEFAULT_ENQUIRY_TEMPLATES = [
  { id: 'follow_up_intro', label: 'Follow-up — free intro session', subject: 'Your enquiry to Derby PKA Kickboxing',
    body: `Hi {name}
I'm following up the enquiry you made to Derby PKA about kickboxing sessions for {who}.
We can offer a free intro session if this is something {who_is} interested in?

${SIGNATURE_SARA}` },
  { id: 'junior_intro_booking', label: 'Junior free intro lesson (KR Centre)', subject: 'Your free introductory lesson — Derby PKA Kickboxing',
    body: `Hi {name}

Thank you for your recent interest in our junior kickboxing classes for {who}.
We can book {them} in for a free introductory lesson at our full time training centre:

The KR Centre
Kedleston House
Aspen Drive
Spondon
Derby
DE21 7SS

Monday at 6.30pm

We do have a few different payment options working out less than £6.00 per lesson, we will go through these and a full timetable at the end of {their} first free lesson.

Training equipment (focus pads, kick shields etc) will all be provided by your kickboxing instructor.

Don't forget to wear suitable clothing as {their} free uniform will be ordered at the end of the first session.

It is also a good idea to bring a drink and a towel.
If you have any other queries, please do not hesitate to contact us.
We look forward to meeting {them} at the first class.

Coach Reid and the team
Derby Kickboxing Head Instructor (DPKA)
5th Degree Black Belt
Team Great Britain Coach (WAKO)
Team Kode Red Head Coach` },
  { id: 'review_request', label: 'Review request (after starting)', subject: 'How are we doing? — Derby PKA Kickboxing',
    body: `Hi {name}

We hope {who_is} enjoying the start of {their} training experience at Derby PKA Kickboxing.

We are always learning and looking to improve, please take a moment to leave us a review and let us know how we are doing, use the link below ⬇️

Derby PKA Kickboxing – The KR Centre https://g.page/r/CffJNxai1goGEBM/review

This will also get {who} extra entries to our monthly prize draw and extra house points for {them} and {their} team 🤩

If you have any constructive ideas or want to give us a more detailed message for improvements please email us at:

info@derbykickboxing.org

Thanks in advance

Derby PKA Kickboxing

💪❤️` },
  { id: 'tinys_waiting_list', label: "Tiny's waiting list", subject: "Tiny's kickboxing — Derby PKA",
    body: `Hi {name}
I'm following up the enquiry you made to Derby PKA about kickboxing sessions for {who}.
There is currently a waiting list for our Tiny Tots classes — would you like me to add {who} to the waiting list?

${SIGNATURE_SARA}` },
]
export const DEFAULT_KIND_TEMPLATES = Object.fromEntries(Object.entries(DEFAULT_KIND_TEMPLATES_RAW).map(([k, list]) => [k, list.map(t => ({ ...t, body: t.body.replace('{SIG}', SIGNATURE_SARA) }))]))
// make sure a group has at least its starter template
export function withKindDefaults(all, kind) {
  if (kind === 'enquiry' || (all || []).some(t => kindOf(t) === kind)) return all || []
  return [...(all || []), ...(DEFAULT_KIND_TEMPLATES[kind] || [])]
}


// Saved templates still word-for-word the old starter text get the updated wording (edited ones are left alone)
const OLD_LINES = [
  ["I'm following up an enquiry you made to Derby PKA re kickboxing sessions.\nWe can offer a free intro session if this is something {who_is} interested in?",
   "I'm following up the enquiry you made to Derby PKA about kickboxing sessions for {who}.\nWe can offer a free intro session if this is something {who_is} interested in?"],
  ["I'm following up an enquiry you made to Derby PKA re kickboxing sessions.\nThere is currently a waiting list for the tinys, would you like me to add {who} to the waiting list?",
   "I'm following up the enquiry you made to Derby PKA about kickboxing sessions for {who}.\nThere is currently a waiting list for our Tiny Tots classes — would you like me to add {who} to the waiting list?"],
  ["Thank you for your recent interest in our junior kickboxing classes.\nWe can book {who} in for a free introductory lesson",
   "Thank you for your recent interest in our junior kickboxing classes for {who}.\nWe can book {them} in for a free introductory lesson"],
]
export function upgradeStarterTemplates(list) {
  let changed = false
  const next = (list || []).map(t => {
    let body = t.body || ''
    for (const [a, b] of OLD_LINES) if (body.includes(a)) { body = body.replace(a, b); changed = true }
    return body === t.body ? t : { ...t, body }
  })
  return { next, changed }
}

// wa.me needs full international digits: 07... -> 447...
const toWhatsappNumber = phone => { const d = String(phone || '').replace(/[^0-9]/g, ''); return d.startsWith('0') ? '44' + d.slice(1) : d }

const joinNames = n => n.length <= 1 ? (n[0] || '') : `${n.slice(0, -1).join(', ')} and ${n[n.length - 1]}`

// The class they asked about, from the notes the inbox writes
export function enquiryClass(enq) {
  const n = enq?.notes || ''
  const m = n.match(/Website enquiry:\s*([^—\n]+)/i) || n.match(/Booked online:\s*([^,\n]+)/i)
  return m ? m[1].trim() : ''
}

// Greeting name: the first name, ignoring titles (Mr, Mrs…); '' when it doesn't look like a real
// name (initials like "DR", an email address, a business, blank) -> the message just says "Hi".
const TITLES = /^(mr|mrs|miss|ms|mx|dr|master|sir|madam)\.?$/i
export function greetingName(enq) {
  const g = enq?.enquiry_for?.greeting
  if (g !== undefined && g !== null) return String(g).trim()
  const parts = String(enq?.name || '').trim().split(/\s+/).filter(w => w && !TITLES.test(w))
  const first = parts[0] || ''
  if (!first || /[@\d]/.test(first) || first.length < 2) return ''
  if (first === first.toUpperCase() && first.length <= 3) return ''          // initials, e.g. "DR"
  if (/\b(ltd|limited|club|academy|school|centre|center)\b/i.test(enq?.name || '')) return ''
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase()
}

// Who the enquiry is for: saved "Enquiring for" first; otherwise worked out from the notes
// (a Kids / Junior / Tiny Tots booking or form -> a child; Adult / Mixed / Ladies -> themselves).
export function enquiryFor(enq) {
  const f = enq?.enquiry_for || {}
  const names = (f.names || []).map(x => String(x).trim()).filter(Boolean)
  if (names.length) return { kind: 'names', names, saved: true }
  if (f.child) return { kind: 'child', saved: true }
  if (f.self) return { kind: 'self', saved: true }
  const n = `${enq?.notes || ''}`
  if (/\b(kids?|junior|juniors|jnr|tiny|tinys|tots|small soldiers|jedi|child|children)\b/i.test(n)) return { kind: 'child', saved: false }
  if (/\b(adults?|mixed|ladies|men|women|14\+|16\+|senior)\b/i.test(n)) return { kind: 'self', saved: false }
  return { kind: 'self', saved: false, guessed: true }
}

export function personaliseEnquiry(text, enq, classes = []) {
  const w = enquiryFor(enq)
  const who = w.kind === 'names' ? joinNames(w.names) : w.kind === 'child' ? 'your child' : 'you'
  const plural = w.kind === 'names' && w.names.length > 1
  const vals = {
    '{name}': greetingName(enq),
    '{who}': who,
    '{who_is}': w.kind === 'self' ? 'you are' : `${who} ${plural ? 'are' : 'is'}`,
    '{their}': w.kind === 'self' ? 'your' : 'their',
    '{them}': w.kind === 'self' ? 'you' : 'them',
    '{class}': interestOf(enq)?.group || enquiryClass(enq),
  }
  const intro = introOf(enq, classes)
  Object.assign(vals, {
    '{intro_date}': intro?.date || '', '{intro_day}': intro?.day || '', '{intro_time}': intro?.time || '',
    '{intro_venue}': intro?.venue || '', '{intro_address}': intro?.address || '',
    '{intro_details}': intro ? [intro.date, intro.time && `at ${intro.time}`, intro.venue && `at ${intro.venue}`].filter(Boolean).join(' ') : '',
  })
  return String(text || '').replace(/\{(name|who|who_is|their|them|class|intro_details|intro_date|intro_day|intro_time|intro_venue|intro_address)\}/g, m => vals[m] ?? m)
    .replace(/^Hi \n/m, 'Hi\n')   // no name on file: "Hi {name}" reads "Hi"
}

// Two ways in: (1) select enquiries, then pick a template; (2) from 'Templates', pick a template,
// then choose who to send it to (allEnquiries). Both end at the same previews + send step.
const STAGES = [['not_started', 'Enquiries'], ['contacted', 'Contacted'], ['trial_booked', 'Trial booked'], ['attended', 'Attended'], ['waiting_list', 'Waiting list'], ['joined', 'Joined'], ['not_interested', 'Not interested']]
export default function EnquirySendTemplates({ title = null, kind = 'enquiry', classes = [], enquiries = [], allEnquiries = [], templates, onSaveTemplates, sendEmail, onSent, onClose, manageOnly = false, noEmail = false }) {
  const [picked, setPicked] = useState(enquiries)        // who it's going to
  const [picking, setPicking] = useState(false)          // template-first: choosing recipients
  const [pickSel, setPickSel] = useState(new Set())
  const [pickQ, setPickQ] = useState('')
  const [pickStage, setPickStage] = useState('not_started')
  const [tplId, setTplId] = useState(templates[0]?.id || null)
  const [channel, setChannel] = useState(noEmail ? 'whatsapp' : 'email')   // 'email' | 'whatsapp' | 'text'
  const [overrides, setOverrides] = useState({})         // enquiry id -> edited text
  const [step, setStep] = useState('choose')             // 'choose' | 'preview' | 'sending' | 'done'
  const [cursor, setCursor] = useState(0)                // WhatsApp / text: who's next
  const [sentIds, setSentIds] = useState(new Set())
  const [skipped, setSkipped] = useState([])
  const [managing, setManaging] = useState(manageOnly)   // manageOnly: opened from 'Templates' just to view / edit them
  const [draft, setDraft] = useState(null)               // template being edited

  const [custom, setCustom] = useState({ subject: kind === 'starter' ? 'Welcome to Derby PKA!' : kind === 'stopped' ? 'From Derby PKA' : 'Derby PKA', body: '' })   // ✍️ write your own
  const tpl = tplId === 'custom' ? { id: 'custom', label: 'Your message', subject: custom.subject, body: custom.body } : templates.find(t => t.id === tplId)
  const textFor = enq => overrides[enq.id] ?? personaliseEnquiry(tpl?.body, enq, classes)
  const reachable = enq => channel === 'email' ? !!enq.contact_email : !!enq.contact_phone
  const list = picked.filter(reachable)
  const unreachable = picked.filter(e => !reachable(e))

  // Corrections in the preview: rewrite the message straight away and save them to the enquiry
  const saveTimers = useRef({}).current
  function fixEnquiry(enq, patch) {
    const nextFor = { ...(enq.enquiry_for || {}), ...patch }
    setPicked(prev => prev.map(e => e.id === enq.id ? { ...e, enquiry_for: nextFor } : e))
    setOverrides(o => { const n = { ...o }; delete n[enq.id]; return n })   // re-personalise from the template
    clearTimeout(saveTimers[enq.id])
    saveTimers[enq.id] = setTimeout(() => {
      const clean = { ...nextFor, names: (nextFor.names || []).map(x => String(x).trim()).filter(Boolean) }
      supabase.from('enquiries').update({ enquiry_for: clean }).eq('id', enq.id).then(({ error }) => { if (error) console.warn('enquiry_for save', error.message) })
    }, 600)
  }

  async function sendAllEmails() {
    setStep('sending')
    const sent = new Set(), failed = []
    for (const enq of list) {
      const ok = await sendEmail(enq.contact_email, personaliseEnquiry(tpl.subject || tpl.label, enq, classes), textFor(enq), true)
      if (ok) { sent.add(enq.id); await onSent(enq) } else failed.push(enq)
    }
    setSentIds(sent); setSkipped(failed); setStep('done')
  }
  async function markSentAndNext(enq) {
    setSentIds(prev => new Set(prev).add(enq.id))
    await onSent(enq)
    if (cursor + 1 >= list.length) setStep('done'); else setCursor(c => c + 1)
  }

  function saveDraft() {
    if (!draft.label.trim() || !draft.body.trim()) return alert('Give the template a name and some text.')
    const next = draft.id && templates.some(t => t.id === draft.id)
      ? templates.map(t => t.id === draft.id ? draft : t)
      : [...templates, { ...draft, id: draft.id || `tpl_${Date.now()}` }]
    onSaveTemplates(next); setDraft(null)
  }

  return (
    <div className="ets-backdrop" onClick={onClose}>
      <div className="ets-sheet" onClick={e => e.stopPropagation()} role="dialog" aria-label="Send a template">
        <div className="ets-head">
          <b>{picking ? `📨 ${tpl?.label || 'Template'} — who to send to` : managing ? (kind === 'enquiry' ? '📝 Enquiry templates' : `📝 ${(TEMPLATE_KINDS.find(k => k[0] === kind) || [])[1]} templates`) : title || `📨 Send template · ${picked.length} selected`}</b>
          <button className="btn btn-sm" onClick={onClose}>Close</button>
        </div>

        {picking ? (() => {
          const q = pickQ.trim().toLowerCase()
          const shown = allEnquiries.filter(e => (pickStage === 'all' || (e.status || 'not_started') === pickStage || (pickStage === 'sent' && String(e.status).startsWith('sent_')))
            && (!q || `${e.name || ''} ${e.contact_email || ''} ${e.contact_phone || ''}`.toLowerCase().includes(q)))
          const allOn = shown.length > 0 && shown.every(e => pickSel.has(e.id))
          const toggle = id => setPickSel(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
          return (
            <div className="ets-col">
              <div className="ets-hint">Choose who gets <b>{tpl?.label}</b>. You'll see each person's message before anything is sent.</div>
              <input value={pickQ} onChange={e => setPickQ(e.target.value)} placeholder="🔍 Search name, email or phone" />
              <div className="ets-row" style={{ flexWrap: 'wrap' }}>
                {[...STAGES, ['all', 'All']].map(([k, l]) => {
                  const n = k === 'all' ? allEnquiries.length : allEnquiries.filter(e => (e.status || 'not_started') === k).length
                  return <button key={k} type="button" className={`btn btn-sm${pickStage === k ? ' btn-primary' : ''}`} onClick={() => setPickStage(k)}>{l} {n}</button>
                })}
              </div>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, fontWeight: 600 }}>
                <input type="checkbox" checked={allOn} onChange={() => setPickSel(prev => { const n = new Set(prev); shown.forEach(e => allOn ? n.delete(e.id) : n.add(e.id)); return n })} />
                Select all shown ({shown.length})
              </label>
              <div style={{ maxHeight: '42vh', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 10 }}>
                {shown.length === 0 && <div className="ets-hint" style={{ padding: 10 }}>Nobody here.</div>}
                {shown.map(e => (
                  <label key={e.id} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '8px 10px', borderBottom: '1px solid var(--border)', cursor: 'pointer', background: pickSel.has(e.id) ? '#378ADD14' : undefined }}>
                    <input type="checkbox" checked={pickSel.has(e.id)} onChange={() => toggle(e.id)} />
                    <span style={{ minWidth: 0 }}>
                      <b style={{ fontSize: 14 }}>{e.name || 'No name'}</b>
                      <span style={{ display: 'block', fontSize: 12, color: 'var(--text-tertiary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {[e.contact_phone, e.contact_email].filter(Boolean).join(' · ') || 'no contact details'}{e.enquiry_date ? ` · ${new Date(e.enquiry_date + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : ''}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
              <div className="ets-row">
                <button className="btn btn-primary" disabled={!pickSel.size} onClick={() => {
                  setPicked(allEnquiries.filter(e => pickSel.has(e.id))); setOverrides({}); setCursor(0); setSentIds(new Set()); setSkipped([])
                  setPicking(false); setManaging(false); setStep('preview')
                }}>Next — preview {pickSel.size || ''} message{pickSel.size === 1 ? '' : 's'}</button>
                <button className="btn" onClick={() => setPicking(false)}>Back</button>
              </div>
            </div>
          )
        })() : managing ? (
          draft ? (
            <div className="ets-col">
              <label className="ets-label">NAME</label>
              <input value={draft.label} onChange={e => setDraft(d => ({ ...d, label: e.target.value }))} placeholder="e.g. Trial reminder" />
              <label className="ets-label">EMAIL SUBJECT</label>
              <input value={draft.subject || ''} onChange={e => setDraft(d => ({ ...d, subject: e.target.value }))} placeholder="Used for emails" />
              <label className="ets-label">MESSAGE</label>
              <textarea rows={12} value={draft.body} onChange={e => setDraft(d => ({ ...d, body: e.target.value }))} />
              <div className="ets-hint">Placeholders: {ENQUIRY_PLACEHOLDERS.join(' ')} — {'{who}'} reads "you", "Alfie" or "Alfie and Mia" depending on who the enquiry is for.</div>
              <div className="ets-row">
                <button className="btn btn-primary" onClick={saveDraft}>Save template</button>
                <button className="btn" onClick={() => setDraft(null)}>Cancel</button>
              </div>
            </div>
          ) : (
            <div className="ets-col">
              {templates.map(t => (
                <div key={t.id} className="ets-tplrow">
                  <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                    <b style={{ fontWeight: 600 }}>{t.label}</b>
                    <span style={{ fontSize: 12, color: 'var(--text-tertiary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 380 }}>{String(t.body || '').replace(/\s+/g, ' ').slice(0, 90)}…</span>
                  </span>
                  <span className="ets-row">
                    {allEnquiries.length > 0 && <button className="btn btn-sm btn-primary" onClick={() => { setTplId(t.id); setPickSel(new Set()); setPickQ(''); setPicking(true) }}>📨 Send</button>}
                    <button className="btn btn-sm" onClick={() => setDraft({ ...t })}>Edit</button>
                    <button className="btn btn-sm" style={{ color: '#E24B4A' }} onClick={() => { if (window.confirm(`Delete "${t.label}"?`)) onSaveTemplates(templates.filter(x => x.id !== t.id)) }}>Delete</button>
                  </span>
                </div>
              ))}
              <div className="ets-row">
                <button className="btn btn-primary" onClick={() => setDraft({ kind, id: null, label: '', subject: '', body: 'Hi {name}\n\n' })}>+ New template</button>
                <button className="btn" onClick={() => manageOnly ? onClose() : setManaging(false)}>Done</button>
              </div>
            </div>
          )
        ) : step === 'choose' ? (
          <div className="ets-col">
            <div className="ets-label" style={{ display: 'flex', justifyContent: 'space-between' }}>TEMPLATE <button className="btn btn-sm" onClick={() => setManaging(true)}>Manage templates</button></div>
            <div className="ets-tpls">
              {templates.map(t => <button key={t.id} type="button" className={t.id === tplId ? 'on' : ''} onClick={() => setTplId(t.id)}>{t.label}</button>)}
              <button type="button" className={tplId === 'custom' ? 'on' : ''} onClick={() => setTplId('custom')}>✍️ Write your own</button>
            </div>
            {tplId === 'custom' && (
              <div className="ets-col" style={{ gap: 6 }}>
                {channel === 'email' && <input value={custom.subject} onChange={e => setCustom(c => ({ ...c, subject: e.target.value }))} placeholder="Email subject" />}
                <textarea rows={7} value={custom.body} onChange={e => setCustom(c => ({ ...c, body: e.target.value }))} placeholder={'Hi {name}\n\n…'} />
                <div className="ets-hint">You can use {'{name}'} {'{who}'} {'{their}'} {'{them}'} — each person's message is personalised in the preview.</div>
              </div>
            )}
            <div className="ets-label">SEND BY</div>
            <div className="ets-seg">
              {[['email', '✉️ Email'], ['whatsapp', '🟢 WhatsApp'], ['text', '💬 Text']].filter(([k]) => !(noEmail && k === 'email')).map(([k, l]) => (
                <button key={k} type="button" className={channel === k ? 'on' : ''} onClick={() => setChannel(k)}>{l}</button>
              ))}
            </div>
            {unreachable.length > 0 && <div className="ets-hint">{unreachable.length} selected {unreachable.length === 1 ? 'has' : 'have'} no {channel === 'email' ? 'email address' : 'phone number'} and will be skipped: {unreachable.map(e => e.name).join(', ')}</div>}
            <button className="btn btn-primary ets-big" disabled={!tpl || !list.length || (tplId === 'custom' && !custom.body.trim())} onClick={() => setStep('preview')}>Preview {list.length} message{list.length === 1 ? '' : 's'}</button>
          </div>
        ) : step === 'preview' ? (
          <div className="ets-col">
            <div className="ets-hint">Check each one — tap into any message to change it just for that person. "{'{who}'}" follows each enquiry's "Enquiring for".</div>
            {list.map(enq => (
              <div key={enq.id} className="ets-preview">
                <div className="ets-preview-head"><b>{enq.name}</b>
                  {(() => {
                    const w = enquiryFor(enq)
                    const missIntro = usesIntro(tpl?.body) && !introOf(enq, classes)
                    const missClass = usesClass(tpl?.body) && !interestOf(enq)
                    const why = missIntro ? 'no intro session set' : missClass ? '"interested in" not set' : (!greetingName(enq) || w.guessed) ? 'check this one' : null
                    return why ? <span className="ets-warn">⚠ {why}</span> : null
                  })()}
                  <span>{channel === 'email' ? enq.contact_email : enq.contact_phone}</span></div>
                <div className="ets-fix">
                  <label>Hi
                    <input value={greetingName(enq)} placeholder="(no name)" onChange={e => fixEnquiry(enq, { greeting: e.target.value })} />
                  </label>
                  <label>⭐
                    <select value={enq.interest_group || ''} onChange={e => {
                      const v = e.target.value || null
                      setPicked(prev => prev.map(x => x.id === enq.id ? { ...x, interest_group: v } : x))
                      setOverrides(o => { const n = { ...o }; delete n[enq.id]; return n })
                      supabase.from('enquiries').update({ interest_group: v }).eq('id', enq.id)
                    }}>
                      <option value="">{interestOf(enq)?.guessed ? `${interestOf(enq).group}?` : 'Interested in…'}</option>
                      {INTEREST_GROUPS.map(g => <option key={g} value={g}>{g}</option>)}
                    </select>
                  </label>
                  {introOf(enq, classes) && <span style={{ alignSelf: 'center' }}>📅 {introOf(enq, classes).short}</span>}
                  <label>For
                    <select value={(() => { const w = enquiryFor(enq); return w.kind })()} onChange={e => {
                      const k = e.target.value
                      fixEnquiry(enq, k === 'self' ? { self: true, child: false, names: [] } : k === 'child' ? { self: false, child: true, names: [] } : { self: false, child: false, names: enquiryFor(enq).names || [''] })
                    }}>
                      <option value="self">Themselves</option>
                      <option value="child">Their child (name unknown)</option>
                      <option value="names">Named child / children…</option>
                    </select>
                  </label>
                  {enquiryFor(enq).kind === 'names' || (enq.enquiry_for?.names && !enq.enquiry_for?.child && !enq.enquiry_for?.self) ? (
                    <label>Names
                      <input value={(enq.enquiry_for?.names || []).join(', ')} placeholder="e.g. Alfie, Mia" onChange={e => fixEnquiry(enq, { self: false, child: false, names: e.target.value.split(',').map(x => x.trim()) })} />
                    </label>
                  ) : null}
                </div>
                <textarea rows={6} value={textFor(enq)} onChange={e => setOverrides(o => ({ ...o, [enq.id]: e.target.value }))} />
              </div>
            ))}
            <div className="ets-row">
              <button className="btn" onClick={() => setStep('choose')}>← Back</button>
              {channel === 'email'
                ? <button className="btn btn-primary ets-big" onClick={sendAllEmails}>Send {list.length} email{list.length === 1 ? '' : 's'}</button>
                : <button className="btn btn-primary ets-big" onClick={() => { setCursor(0); setStep('sending') }}>Start sending ({list.length})</button>}
            </div>
            {/* other ways to send the same messages (one by one, from your phone) */}
            {(() => {
              const withPhone = picked.filter(e => e.contact_phone).length
              const others = [['whatsapp', '🟢 Send by WhatsApp'], ['text', '💬 Send by text'], ...(noEmail ? [] : [['email', '✉️ Send by email']])].filter(([k]) => k !== channel)
              return (
                <div className="ets-alt">
                  {others.map(([k, l]) => {
                    const n = k === 'email' ? picked.filter(e => e.contact_email && !/placeholder/.test(e.contact_email)).length : withPhone
                    return <button key={k} type="button" className="btn" disabled={!n} onClick={() => { setChannel(k); if (k !== 'email') { setCursor(0); setStep('sending') } }}>{l} ({n})</button>
                  })}
                </div>
              )
            })()}
          </div>
        ) : step === 'sending' && channel === 'email' ? (
          <div className="ets-col"><div className="ets-hint">Sending emails…</div></div>
        ) : step === 'sending' ? (() => {
          const enq = list[cursor]
          const msg = encodeURIComponent(textFor(enq))
          const href = channel === 'whatsapp' ? `https://wa.me/${toWhatsappNumber(enq.contact_phone)}?text=${msg}` : `sms:${enq.contact_phone}?body=${msg}`
          return (
            <div className="ets-col">
              <div className="ets-hint">{cursor + 1} of {list.length} — open it, send it, then come back for the next one.</div>
              <div className="ets-preview">
                <div className="ets-preview-head"><b>{enq.name}</b><span>{enq.contact_phone}</span></div>
                <pre className="ets-pre">{textFor(enq)}</pre>
              </div>
              <a className="btn btn-primary ets-big" href={href} target="_blank" rel="noreferrer" onClick={() => setTimeout(() => markSentAndNext(enq), 400)}>
                {channel === 'whatsapp' ? '🟢 Open WhatsApp' : '💬 Open Messages'} — {enq.name.split(' ')[0]}
              </a>
              <div className="ets-row">
                <button className="btn" onClick={() => { if (cursor + 1 >= list.length) setStep('done'); else setCursor(c => c + 1) }}>Skip</button>
              </div>
            </div>
          )
        })() : (
          <div className="ets-col">
            <div style={{ fontSize: 15, fontWeight: 700 }}>✓ Sent {sentIds.size} of {list.length}</div>
            <div className="ets-hint">Each one sent counts as a contact (📞 +1) and moves new enquiries to Contacted.</div>
            {skipped.length > 0 && <div className="ets-hint" style={{ color: '#E24B4A' }}>Couldn't send: {skipped.map(e => e.name).join(', ')}</div>}
            <button className="btn btn-primary ets-big" onClick={onClose}>Done</button>
          </div>
        )}
      </div>
    </div>
  )
}
