import { useState } from 'react'

// ── Enquiry message templates ──
// Placeholders (filled per enquiry):
//   {name}   enquirer's first name             e.g. "Sarah"
//   {who}    who it's for                      "you" | "Alfie" | "Alfie and Mia"
//   {who_is} who it's for + is/are             "you are" | "Alfie is" | "Alfie and Mia are"
//   {their}  "your" (themselves) / "their"
//   {them}   "you" (themselves) / "them"
//   {class}  the class they asked about / booked, if known
export const ENQUIRY_PLACEHOLDERS = ['{name}', '{who}', '{who_is}', '{their}', '{them}', '{class}']

const SIGNATURE_SARA = `Sara (Derby PKA)💪❤️

07867 952311
www.derbykickboxing.org.uk
www.pka-kickboxing.com
www.teamkodered.com`

export const DEFAULT_ENQUIRY_TEMPLATES = [
  { id: 'follow_up_intro', label: 'Follow-up — free intro session', subject: 'Your enquiry to Derby PKA Kickboxing',
    body: `Hi {name}
I'm following up an enquiry you made to Derby PKA re kickboxing sessions.
We can offer a free intro session if this is something {who_is} interested in?

${SIGNATURE_SARA}` },
  { id: 'junior_intro_booking', label: 'Junior free intro lesson (KR Centre)', subject: 'Your free introductory lesson — Derby PKA Kickboxing',
    body: `Hi {name}

Thank you for your recent interest in our junior kickboxing classes.
We can book {who} in for a free introductory lesson at our full time training centre:

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
I'm following up an enquiry you made to Derby PKA re kickboxing sessions.
There is currently a waiting list for the tinys, would you like me to add {who} to the waiting list?

${SIGNATURE_SARA}` },
]

// wa.me needs full international digits: 07... -> 447...
const toWhatsappNumber = phone => { const d = String(phone || '').replace(/[^0-9]/g, ''); return d.startsWith('0') ? '44' + d.slice(1) : d }

const joinNames = n => n.length <= 1 ? (n[0] || '') : `${n.slice(0, -1).join(', ')} and ${n[n.length - 1]}`

// The class they asked about, from the notes the inbox writes
export function enquiryClass(enq) {
  const n = enq?.notes || ''
  const m = n.match(/Website enquiry:\s*([^—\n]+)/i) || n.match(/Booked online:\s*([^,\n]+)/i)
  return m ? m[1].trim() : ''
}

export function personaliseEnquiry(text, enq) {
  const first = String(enq?.name || '').trim().split(/\s+/)[0] || ''
  const f = enq?.enquiry_for || {}
  const names = (f.names || []).map(x => String(x).trim()).filter(Boolean)
  const self = f.self || names.length === 0
  const who = self ? 'you' : joinNames(names)
  const vals = {
    '{name}': first,
    '{who}': who,
    '{who_is}': self ? 'you are' : `${who} ${names.length > 1 ? 'are' : 'is'}`,
    '{their}': self ? 'your' : 'their',
    '{them}': self ? 'you' : 'them',
    '{class}': enquiryClass(enq),
  }
  return String(text || '').replace(/\{(name|who|who_is|their|them|class)\}/g, m => vals[m] ?? m)
    .replace(/^Hi \n/m, 'Hi\n')   // no name on file: "Hi {name}" reads "Hi"
}

export default function EnquirySendTemplates({ enquiries, templates, onSaveTemplates, sendEmail, onSent, onClose }) {
  const [tplId, setTplId] = useState(templates[0]?.id || null)
  const [channel, setChannel] = useState('email')        // 'email' | 'whatsapp' | 'text'
  const [overrides, setOverrides] = useState({})         // enquiry id -> edited text
  const [step, setStep] = useState('choose')             // 'choose' | 'preview' | 'sending' | 'done'
  const [cursor, setCursor] = useState(0)                // WhatsApp / text: who's next
  const [sentIds, setSentIds] = useState(new Set())
  const [skipped, setSkipped] = useState([])
  const [managing, setManaging] = useState(false)
  const [draft, setDraft] = useState(null)               // template being edited

  const tpl = templates.find(t => t.id === tplId)
  const textFor = enq => overrides[enq.id] ?? personaliseEnquiry(tpl?.body, enq)
  const reachable = enq => channel === 'email' ? !!enq.contact_email : !!enq.contact_phone
  const list = enquiries.filter(reachable)
  const unreachable = enquiries.filter(e => !reachable(e))

  async function sendAllEmails() {
    setStep('sending')
    const sent = new Set(), failed = []
    for (const enq of list) {
      const ok = await sendEmail(enq.contact_email, personaliseEnquiry(tpl.subject || tpl.label, enq), textFor(enq), true)
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
          <b>📨 Send template · {enquiries.length} selected</b>
          <button className="btn btn-sm" onClick={onClose}>Close</button>
        </div>

        {managing ? (
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
                  <span>{t.label}</span>
                  <span className="ets-row">
                    <button className="btn btn-sm" onClick={() => setDraft({ ...t })}>Edit</button>
                    <button className="btn btn-sm" style={{ color: '#E24B4A' }} onClick={() => { if (window.confirm(`Delete "${t.label}"?`)) onSaveTemplates(templates.filter(x => x.id !== t.id)) }}>Delete</button>
                  </span>
                </div>
              ))}
              <div className="ets-row">
                <button className="btn btn-primary" onClick={() => setDraft({ id: null, label: '', subject: '', body: 'Hi {name}\n\n' })}>+ New template</button>
                <button className="btn" onClick={() => setManaging(false)}>Done</button>
              </div>
            </div>
          )
        ) : step === 'choose' ? (
          <div className="ets-col">
            <div className="ets-label" style={{ display: 'flex', justifyContent: 'space-between' }}>TEMPLATE <button className="btn btn-sm" onClick={() => setManaging(true)}>Manage templates</button></div>
            <div className="ets-tpls">
              {templates.map(t => <button key={t.id} type="button" className={t.id === tplId ? 'on' : ''} onClick={() => setTplId(t.id)}>{t.label}</button>)}
            </div>
            <div className="ets-label">SEND BY</div>
            <div className="ets-seg">
              {[['email', '✉️ Email'], ['whatsapp', '🟢 WhatsApp'], ['text', '💬 Text']].map(([k, l]) => (
                <button key={k} type="button" className={channel === k ? 'on' : ''} onClick={() => setChannel(k)}>{l}</button>
              ))}
            </div>
            {unreachable.length > 0 && <div className="ets-hint">{unreachable.length} selected {unreachable.length === 1 ? 'has' : 'have'} no {channel === 'email' ? 'email address' : 'phone number'} and will be skipped: {unreachable.map(e => e.name).join(', ')}</div>}
            <button className="btn btn-primary ets-big" disabled={!tpl || !list.length} onClick={() => setStep('preview')}>Preview {list.length} message{list.length === 1 ? '' : 's'}</button>
          </div>
        ) : step === 'preview' ? (
          <div className="ets-col">
            <div className="ets-hint">Check each one — tap into any message to change it just for that person. "{'{who}'}" follows each enquiry's "Enquiring for".</div>
            {list.map(enq => (
              <div key={enq.id} className="ets-preview">
                <div className="ets-preview-head"><b>{enq.name}</b><span>{channel === 'email' ? enq.contact_email : enq.contact_phone}{enq.enquiry_for?.names?.length ? ` · for ${joinNames(enq.enquiry_for.names)}` : enq.enquiry_for?.self ? ' · for themselves' : ''}</span></div>
                <textarea rows={6} value={textFor(enq)} onChange={e => setOverrides(o => ({ ...o, [enq.id]: e.target.value }))} />
              </div>
            ))}
            <div className="ets-row">
              <button className="btn" onClick={() => setStep('choose')}>← Back</button>
              {channel === 'email'
                ? <button className="btn btn-primary ets-big" onClick={sendAllEmails}>Send {list.length} email{list.length === 1 ? '' : 's'}</button>
                : <button className="btn btn-primary ets-big" onClick={() => { setCursor(0); setStep('sending') }}>Start sending ({list.length})</button>}
            </div>
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
