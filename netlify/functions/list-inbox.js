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
    // Deliberately excludes 'leader' -- CRM/Email access is
    // admin/coach only, matching the app's route-level restriction.
    const isStaff = callerRole === 'admin' || callerRole === 'captain' || callerRole === 'coach'
    if (!isStaff) return { statusCode: 403, body: JSON.stringify({ error: 'Not authorised to view the inbox' }) }

    let client
    try {
      client = new ImapFlow({
        host: IMAP_HOST,
        port: IMAP_PORT,
        secure: true,
        auth: { user: CLUB_EMAIL_ADDRESS, pass: emailPassword },
        logger: false,
      })
      await client.connect()
    } catch (err) {
      return { statusCode: 500, body: JSON.stringify({ error: `IMAP connect/login failed: ${err.message}` }) }
    }

    const messages = []
    try {
      let lock
      try {
        lock = await client.getMailboxLock('INBOX')
      } catch (err) {
        throw new Error(`Opening INBOX failed: ${err.message}`)
      }
      try {
        // client.mailbox is populated by the SELECT that
        // getMailboxLock just did -- .exists is the message count,
        // avoiding a separate STATUS command (one less thing that can
        // fail, and some servers are fussy about STATUS on an already-
        // selected mailbox).
        const total = client.mailbox?.exists || 0
        if (total > 0) {
          const start = Math.max(1, total - 29)
          try {
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
          } catch (err) {
            throw new Error(`Fetching messages failed: ${err.message}`)
          }
        }
      } finally {
        lock.release()
      }
    } finally {
      await client.logout().catch(() => {})
    }

    messages.sort((a, b) => new Date(b.date) - new Date(a.date))
    return { statusCode: 200, body: JSON.stringify({ success: true, messages }) }
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) }
  }
}
