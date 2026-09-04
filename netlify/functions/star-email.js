// Toggles the "starred" flag (IMAP's \Flagged) on one email -- same
// auth pattern and mailbox connection as list-inbox.js/delete-email.js.
const { ImapFlow } = require('imapflow')

const CLUB_EMAIL_ADDRESS = 'info@derbykickboxing.org.uk'
const IMAP_HOST = 'mail.derbykickboxing.org.uk'
const IMAP_PORT = 993

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' }
  }

  let uid, starred
  try {
    ;({ uid, starred } = JSON.parse(event.body || '{}'))
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request body' }) }
  }
  if (!uid) return { statusCode: 400, body: JSON.stringify({ error: 'uid is required' }) }

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
    if (!isStaff) return { statusCode: 403, body: JSON.stringify({ error: 'Not authorised to update mail' }) }

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
      const lock = await client.getMailboxLock('INBOX')
      try {
        if (starred) await client.messageFlagsAdd(String(uid), ['\\Flagged'], { uid: true })
        else await client.messageFlagsRemove(String(uid), ['\\Flagged'], { uid: true })
      } finally {
        lock.release()
      }
    } finally {
      await client.logout().catch(() => {})
    }

    return { statusCode: 200, body: JSON.stringify({ success: true, starred: !!starred }) }
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) }
  }
}
