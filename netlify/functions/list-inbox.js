// Lists the most recent inbox emails from the club's mailbox via IMAP
// -- read-only (fetches with peek so nothing gets marked as read on
// the server, avoiding any interference with the mailbox as staff use
// it directly in Roundcube).
//
// Requires the caller to be an authenticated staff member (same
// pattern as invite-user.js / send-email.js).
//
// Uses the SAME CLUB_EMAIL_PASSWORD env var as send-email.js -- IMAP
// and SMTP are just two different protocols against the same mailbox
// account, so no separate secret is needed.
const { ImapFlow } = require('imapflow')

const CLUB_EMAIL_ADDRESS = 'info@derbykickboxing.org.uk'
const IMAP_HOST = 'mail.derbykickboxing.org.uk'
const IMAP_PORT = 993

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: 'Method not allowed' }
  }

  const authHeader = event.headers.authorization || event.headers.Authorization
  if (!authHeader) return { statusCode: 401, body: JSON.stringify({ error: 'Missing session' }) }

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const anonKey     = process.env.VITE_SUPABASE_ANON_KEY
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY
  const emailPassword = process.env.CLUB_EMAIL_PASSWORD

  if (!emailPassword) {
    return { statusCode: 500, body: JSON.stringify({ error: 'CLUB_EMAIL_PASSWORD not configured in Netlify environment variables' }) }
  }

  try {
    const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { apikey: anonKey, Authorization: authHeader },
    })
    if (!userRes.ok) return { statusCode: 401, body: JSON.stringify({ error: 'Invalid or expired session' }) }
    const user = await userRes.json()

    const callerRes = await fetch(`${supabaseUrl}/rest/v1/members?auth_id=eq.${user.id}&select=role`, {
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
    })
    const callerRows = await callerRes.json()
    const callerRole = callerRows?.[0]?.role
    const isStaff = callerRole === 'admin' || callerRole === 'captain' || callerRole === 'coach' || callerRole === 'leader'
    if (!isStaff) return { statusCode: 403, body: JSON.stringify({ error: 'Not authorised to view the inbox' }) }

    const client = new ImapFlow({
      host: IMAP_HOST,
      port: IMAP_PORT,
      secure: true,
      auth: { user: CLUB_EMAIL_ADDRESS, pass: emailPassword },
      logger: false,
    })

    await client.connect()
    const messages = []
    try {
      const lock = await client.getMailboxLock('INBOX')
      try {
        const status = await client.status('INBOX', { messages: true, unseen: true })
        // Most recent 30 messages, newest first. Envelope-only fetch
        // (from/subject/date), never the full body -- keeps this fast
        // and avoids downloading attachments just to show a list.
        const total = status.messages
        const start = Math.max(1, total - 29)
        for await (const msg of client.fetch(`${start}:${total}`, { envelope: true, flags: true }, { uid: false })) {
          messages.push({
            uid: msg.uid,
            from: msg.envelope?.from?.[0]?.address || 'unknown',
            fromName: msg.envelope?.from?.[0]?.name || '',
            subject: msg.envelope?.subject || '(no subject)',
            date: msg.envelope?.date,
            seen: (msg.flags || new Set()).has('\\Seen'),
          })
        }
      } finally {
        lock.release()
      }
    } finally {
      await client.logout()
    }

    messages.sort((a, b) => new Date(b.date) - new Date(a.date))
    return { statusCode: 200, body: JSON.stringify({ success: true, messages }) }
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) }
  }
}
