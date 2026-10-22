import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase.js'
import EnquirySendTemplates, { kindOf, withKindDefaults, DEFAULT_ENQUIRY_TEMPLATES } from './EnquiryTemplates.jsx'

// "Send a new starter message?" / "Send a stopped training message?" -- asked after an enquiry
// joins or a student is marked stopped. Pick a template from that group, or write your own,
// then the usual previews + Email / WhatsApp / Text. Skip closes it.
const KEY = 'crm_enquiry_message_templates'

async function sendEmail(to, subject, text, silent = false) {
  if (!to) { if (!silent) alert('No email address on file for this person.'); return false }
  if (!text?.trim()) { if (!silent) alert('This message is empty.'); return false }
  try {
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch('/.netlify/functions/send-email', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` }, body: JSON.stringify({ to, subject, text }) })
    const r = await res.json()
    if (!res.ok || r.error) { if (!silent) alert('Could not send email: ' + (r.error || res.statusText)); return false }
    return true
  } catch (e) { if (!silent) alert('Could not send email: ' + e.message); return false }
}

// a stopped student -> who the message goes to (the parent for a child, the student for an adult)
export function recipientFromStudent(st) {
  const m = st?.members || {}
  const age = m.date_of_birth ? Math.floor((Date.now() - new Date(m.date_of_birth)) / 31557600000) : null
  const child = age != null && age < 16
  const parentFirst = String(st?.guardian_name || '').trim().split(/\s+/)[0] || ''
  const email = m.email && !/placeholder/i.test(m.email) ? m.email : null
  return {
    id: st.id, name: `${m.first_name || ''} ${m.last_name || ''}`.trim(),
    contact_email: email, contact_phone: st?.guardian_phone || m.phone || null,
    enquiry_for: child ? { names: [m.first_name].filter(Boolean), greeting: parentFirst } : { self: true, greeting: m.first_name || '' },
  }
}

export default function MessagePrompt({ kind, recipients = [], onClose, onSent }) {
  const [all, setAll] = useState(null)
  const [open, setOpen] = useState(false)
  useEffect(() => {
    supabase.from('settings').select('value').eq('key', KEY).maybeSingle()
      .then(({ data }) => setAll(Array.isArray(data?.value) && data.value.length ? data.value : DEFAULT_ENQUIRY_TEMPLATES))
  }, [])
  if (!recipients.length) return null
  const names = recipients.map(r => r.name).filter(Boolean).join(', ')
  const label = kind === 'starter' ? 'new starter' : 'stopped training'
  const list = all ? withKindDefaults(all, kind) : []
  async function save(nextForKind) {   // merge this group's templates back into the full list
    const merged = [...list.filter(t => kindOf(t) !== kind), ...nextForKind.map(t => ({ ...t, kind }))]
    setAll(merged)
    const { error } = await supabase.from('settings').upsert({ key: KEY, value: merged }, { onConflict: 'key' })
    if (error) alert('Could not save templates: ' + error.message)
  }
  if (open && all) return (
    <EnquirySendTemplates kind={kind} title={kind === 'starter' ? `🎉 New starter message — ${names}` : `👋 Stopped training message — ${names}`}
      enquiries={recipients} templates={list.filter(t => kindOf(t) === kind)} onSaveTemplates={save}
      sendEmail={sendEmail} onSent={async r => { onSent && onSent(r) }} onClose={onClose} />
  )
  return (
    <div className="ets-backdrop" onClick={onClose}>
      <div className="ets-sheet" style={{ maxWidth: 420 }} onClick={e => e.stopPropagation()} role="dialog" aria-label={`Send a ${label} message`}>
        <b style={{ fontSize: 16 }}>{kind === 'starter' ? '🎉' : '👋'} Send a {label} message?</b>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '8px 0 14px' }}>
          {kind === 'starter' ? `${names} has joined.` : `${names} ${recipients.length === 1 ? 'has' : 'have'} been marked as stopped training.`} Choose a template or write your own — you'll see the message before it's sent.
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} disabled={!all} onClick={() => setOpen(true)}>Choose message</button>
          <button className="btn" onClick={onClose}>Skip</button>
        </div>
      </div>
    </div>
  )
}
