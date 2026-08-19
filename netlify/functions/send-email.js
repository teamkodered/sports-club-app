// Sends a real email from the club's actual mailbox (info@derbykickboxing.org.uk)
// via its cPanel-hosted SMTP server -- not a mailto: link or share-sheet handoff,
// an email that actually goes out from the app.
//
// Requires the caller to be an authenticated staff member (same pattern as
// invite-user.js) -- this sends real email as the club, so it shouldn't be
// triggerable by just anyone who finds the endpoint.
//
// Needs CLUB_EMAIL_PASSWORD set in Netlify's environment variables (Site
// settings > Environment variables) -- the mailbox's normal email password,
// never stored in code or committed to the repo.
const nodemailer = require('nodemailer')

const CLUB_EMAIL_ADDRESS = 'info@derbykickboxing.org.uk'
const SMTP_HOST = 'mail.derbykickboxing.org.uk'
const SMTP_PORT = 465

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' }
  }

  const { to, subject, text } = JSON.parse(event.body || '{}')
  if (!to || !text) return { statusCode: 400, body: JSON.stringify({ error: 'to and text are required' }) }

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
    // Identify the caller from their own session and confirm they're
    // actually staff before sending anything as the club.
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
    if (!isStaff) return { statusCode: 403, body: JSON.stringify({ error: 'Not authorised to send emails' }) }

    const transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: true, // port 465 = SSL/TLS from the start, not upgraded via STARTTLS
      auth: { user: CLUB_EMAIL_ADDRESS, pass: emailPassword },
    })

    await transporter.sendMail({
      from: `"KR Centre" <${CLUB_EMAIL_ADDRESS}>`,
      to,
      subject: subject || 'Message from KR Centre',
      text,
    })

    return { statusCode: 200, body: JSON.stringify({ success: true }) }
  } catch (err) {
    const detail = [err.message, err.response, err.responseCode ? `(code ${err.responseCode})` : null].filter(Boolean).join(' — ')
    return { statusCode: 500, body: JSON.stringify({ error: detail || 'Unknown send error' }) }
  }
}
