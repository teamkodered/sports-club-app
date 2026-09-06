// Moves one email to a different folder on the club mailbox via IMAP
// (e.g. "Contacted" or "Notes") -- same auth pattern and mailbox
// connection as delete-email.js/list-inbox.js. Creates the target
// folder first if it doesn't already exist on the mail server.
const { ImapFlow } = require('imapflow')

const CLUB_EMAIL_ADDRESS = 'info@derbykickboxing.org.uk'
const IMAP_HOST = 'mail.derbykickboxing.org.uk'
const IMAP_PORT = 993

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' }
  }

  let uid, targetFolder
  try {
    ;({ uid, targetFolder } = JSON.parse(event.body || '{}'))
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request body' }) }
  }
  if (!uid || !targetFolder) return { statusCode: 400, body: JSON.stringify({ error: 'uid and targetFolder are required' }) }

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
    const isStaff = callerRole === 'admin' || callerRole === 'captain' || callerRole === 'coach'
    if (!isStaff) return { statusCode: 403, body: JSON.stringify({ error: 'Not authorised to move mail' }) }

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
      const detail = err.responseText || err.response?.attributes?.map(a => a.value).join(' ') || null
      return { statusCode: 500, body: JSON.stringify({ error: `IMAP connect/login failed: ${detail || err.message}` }) }
    }

    try {
      // Create the target folder first if it doesn't exist yet --
      // mailboxCreate is a no-op error if it's already there, which is
      // fine to just ignore.
      const mailboxes = await client.list()
      const exists = mailboxes.some(m => m.path === targetFolder)
      if (!exists) {
        try { await client.mailboxCreate(targetFolder) } catch { /* someone else created it in the meantime, or it already exists under a different case -- fine either way */ }
      }

      const lock = await client.getMailboxLock('INBOX')
      try {
        const ok = await client.messageMove(String(uid), targetFolder, { uid: true })
        if (!ok) throw new Error('Message not found (it may have already been moved or deleted).')
      } finally {
        lock.release()
      }
    } finally {
      await client.logout().catch(() => {})
    }

    return { statusCode: 200, body: JSON.stringify({ success: true }) }
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) }
  }
}
