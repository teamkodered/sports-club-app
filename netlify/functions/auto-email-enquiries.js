// Runs on its own every 15 minutes (schedule in netlify.toml).
// Does what pressing "➕ Enquiries" in the CRM Email tab does, but ONLY for the two kinds of
// email that are certainly genuine, because they come from the website in a fixed layout:
//   • Website enquiry form  ("ENQUIRY BY: name, <email>, phone")
//   • Website class booking ("Booking details … User: … Event: … Day: … Time: …")
// For each one: adds the enquiry (or updates the one already in the CRM for that person),
// then moves the email to the "Contacted" folder -- exactly like the button.
// Every other email is left in the Inbox for staff to deal with by hand.
// Looks at Inbox emails from the last 60 days (anything still in the Inbox hasn't been dealt with).
const { ImapFlow } = require('imapflow')

const CLUB_EMAIL_ADDRESS = 'info@derbykickboxing.org.uk'
const IMAP_HOST = 'mail.derbykickboxing.org.uk'
const DONE_FOLDER = 'Contacted'
const LOOK_BACK_DAYS = 60   // anything still in the Inbox hasn't been processed; existing enquiries are updated, never duplicated

// ── the same parsing the Email tab uses (CRM.jsx) ──────────────────────────
function parseWebsiteEnquiry(body) {
  if (!body) return null
  const m = body.match(/ENQUIRY BY:\s*([^,<\n]*?)\s*,\s*<?\s*([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})\s*>?\s*(?:,\s*([+0-9][0-9 ()-]{7,}))?/i)
  if (!m) return null
  const subj = body.match(/SUBJECT:\s*(.+)/i)
  const msgBody = body.match(/Message Body:([\s\S]*)/i)
  const msgText = msgBody ? msgBody[1].replace(/(^|\n)\s*--[\s\S]*$/, '').replace(/This e-mail was sent from[\s\S]*$/i, '').trim() : ''
  return { name: m[1].trim() || null, email: m[2].trim().toLowerCase(), phone: m[3] ? m[3].replace(/[\s()-]/g, '') : null, subject: subj ? subj[1].trim() : null, message: msgText || null }
}
function parseBookingEmail(body) {
  if (!body || !/Booking details/i.test(body)) return null
  const field = k => { const m = body.match(new RegExp(k + '\\s*:\\s*([^\\n]+)', 'i')); return m ? m[1].trim() : null }
  const email = (body.match(/Mail\s*:\s*([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/i) || [])[1] || null
  const phone = (body.match(/Mail\s*:\s*([+0-9][0-9 ()-]{7,})/i) || [])[1] || null
  if (!email && !phone) return null
  const event = field('Event'), day = field('Day'), time = field('Time'), where = field('Description 1')
  const label = [event, day && time ? `${day} ${time}` : day || time, where].filter(Boolean).join(', ')
  return { name: field('User'), email: email ? email.toLowerCase() : null, phone: phone ? phone.replace(/[\s()-]/g, '') : null, notes: `Booked online: ${label}`, day, label }
}
function extractPhoneNumber(text) {
  const match = (text || '').match(/(?:\+44\s?|0)(?:\d[\s-]?){9,10}/)
  return match ? match[0].replace(/[\s-]/g, '') : null
}
function nextDateForDay(dayName, from) {
  const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
  const want = DAYS.findIndex(d => d.startsWith(String(dayName || '').trim().toLowerCase().slice(0, 3)))
  if (want < 0) return null
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate())
  d.setDate(d.getDate() + ((want - d.getDay() + 7) % 7))
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function samePerson(existing, name) {
  if (!existing) return false
  const clean = n => String(n || '').toLowerCase().replace(/\b(mr|mrs|miss|ms|dr|mx)\.?\s+/g, '').replace(/[^a-z\s'-]/g, ' ').trim()
  const a = clean(existing.name), b = clean(name)
  if (!a || !b || /^\|/.test(existing.name || '') || existing.name === 'Unknown') return true
  return a === b || a.split(/\s+/)[0] === b.split(/\s+/)[0] || a.includes(b) || b.includes(a)
}
function nextStatus(current, target = 'not_started') {
  const ORDER = ['not_started', 'contacted', 'trial_booked', 'attended', 'joined']
  if (!current || current === 'waiting_list' || current === 'not_interested' || String(current).startsWith('sent_')) return current || target
  return ORDER.indexOf(current) >= ORDER.indexOf(target) ? current : target
}
const htmlToText = h => h
  .replace(/<!--[\s\S]*?-->/g, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<head[\s\S]*?<\/head>/gi, '')
  .replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|tr|li|h[1-6])>/gi, '\n\n').replace(/<[^>]+>/g, '')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"')
  .replace(/&#(\d+);/g, (_, c) => String.fromCharCode(c)).replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim()

function findPart(node, type) {
  if (!node) return null
  if (node.type === type) return node
  for (const c of node.childNodes || []) { const f = findPart(c, type); if (f) return f }
  return null
}

exports.handler = async () => {
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const pass = process.env.CLUB_EMAIL_PASSWORD
  if (!supabaseUrl || !serviceKey || !pass) return { statusCode: 500, body: 'Missing environment variables' }
  const H = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' }
  const db = (path, opts = {}) => fetch(`${supabaseUrl}/rest/v1/${path}`, { ...opts, headers: { ...H, ...(opts.headers || {}) } })

  async function findEnquiry(email, oldEmail) {
    const cols = 'id,contact_phone,name,status,contact_email'
    const one = async filter => {
      const r = await db(`enquiries?select=${cols}&${filter}&order=updated_at.desc&limit=1`)
      const rows = r.ok ? await r.json() : []
      return rows[0] || null
    }
    const enc = v => encodeURIComponent(v)
    return (email && await one(`contact_email=ilike.${enc(email)}`))
      || (email && await one(`contact_email=ilike.${enc('*' + email)}`))
      || (oldEmail && await one(`contact_email=ilike.${enc(oldEmail)}`))
      || null
  }

  const client = new ImapFlow({ host: IMAP_HOST, port: 993, secure: true, auth: { user: CLUB_EMAIL_ADDRESS, pass }, logger: false })
  const report = { checked: 0, added: 0, updated: 0, failed: 0 }
  try {
    await client.connect()
    const boxes = await client.list()
    if (!boxes.some(m => m.path === DONE_FOLDER)) { try { await client.mailboxCreate(DONE_FOLDER) } catch { /* already there */ } }

    const lock = await client.getMailboxLock('INBOX')
    try {
      const since = new Date(Date.now() - LOOK_BACK_DAYS * 864e5)
      // ask the mail server for likely ones only (quick), then check each properly below
      const uids = (await client.search({ since, or: [{ subject: 'enquiry' }, { subject: 'booking' }] }, { uid: true })) || []
      const candidates = []
      if (uids.length) {
        for await (const msg of client.fetch(uids, { envelope: true, bodyStructure: true }, { uid: true })) {
          // quick check on the subject first, so ordinary emails are never even opened
          const subj = msg.envelope?.subject || ''
          if (/website enquiry|enquiry|new booking|booking/i.test(subj)) candidates.push(msg)
        }
      }
      for (const msg of candidates) {
        report.checked++
        try {
          const part = findPart(msg.bodyStructure, 'text/plain') || findPart(msg.bodyStructure, 'text/html')
          if (!part) continue
          const { content } = await client.download(msg.uid, part.part, { uid: true })
          const chunks = []
          for await (const c of content) chunks.push(c)
          let body = Buffer.concat(chunks).toString('utf8')
          if (part.type === 'text/html') body = htmlToText(body)

          const web = parseWebsiteEnquiry(body)
          const booking = !web ? parseBookingEmail(body) : null
          if (!web && !booking) continue            // not one of the fixed website layouts -> leave it for staff

          const sentAt = msg.envelope?.date ? new Date(msg.envelope.date) : new Date()
          const sender = (msg.envelope?.replyTo?.[0]?.address || msg.envelope?.from?.[0]?.address || '').toLowerCase()
          const d = web ? {
            name: web.name || web.email.split('@')[0], email: web.email, phone: web.phone || extractPhoneNumber(body),
            notes: web.subject ? `Website enquiry: ${web.subject}${web.message ? ` — ${web.message}` : ''}` : 'Website enquiry',
          } : {
            name: booking.name || booking.email?.split('@')[0] || 'Website booking', email: booking.email, phone: booking.phone,
            notes: booking.notes, intro: booking.label ? { intro_label: booking.label, intro_date: nextDateForDay(booking.day, sentAt) } : null,
          }
          const oldEmail = sender && d.email && sender !== d.email && sender !== CLUB_EMAIL_ADDRESS ? sender : null

          const found = await findEnquiry(d.email, oldEmail)
          const existing = samePerson(found, d.name) ? found : null
          let res
          if (existing) {
            const badName = !existing.name || /^\|/.test(existing.name) || existing.name === 'Unknown'
            res = await db(`enquiries?id=eq.${existing.id}`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({
              status: nextStatus(existing.status), updated_at: new Date().toISOString(), ...(d.email ? { contact_email: d.email } : {}),
              contact_phone: existing.contact_phone || d.phone || null, ...(badName && d.name ? { name: d.name } : {}), ...(d.intro || {}),
            }) })
          } else {
            const notes = `${d.notes}${found ? `\nSame email as the enquiry for ${found.name}.` : ''}\n(Added automatically from the club email)`
            res = await db('enquiries', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({
              name: d.name, contact_email: d.email || null, contact_phone: d.phone || null, contact_method: 'email',
              enquiry_date: sentAt.toISOString().split('T')[0], notes, status: 'not_started', ...(d.intro || {}),
            }) })
          }
          const saved = res.ok ? await res.json() : []
          if (!saved.length) { report.failed++; console.error('Enquiry not saved', msg.uid, res.status, !res.ok ? await res.text() : 'no rows'); continue }
          existing ? report.updated++ : report.added++
          // saved -> file the email away, just like the button (never deleted)
          await client.messageMove(String(msg.uid), DONE_FOLDER, { uid: true })
        } catch (err) {
          report.failed++
          console.error('Email', msg.uid, err.message)   // left in the Inbox for staff
        }
      }
    } finally { lock.release() }
  } catch (err) {
    console.error('auto-email-enquiries:', err.message)
    return { statusCode: 500, body: err.message }
  } finally {
    try { await client.logout() } catch { /* ignore */ }
  }
  console.log('auto-email-enquiries', JSON.stringify(report))
  return { statusCode: 200, body: JSON.stringify(report) }
}
