// Sends one email as the club, same as send-email.js, but for use by
// the scheduled-sends cron job rather than a logged-in staff member --
// there's no browser session to check at 3am when a scheduled notice
// is due to go out, so this checks a shared secret instead. Never
// exposed to the frontend; only the send-scheduled-notices Supabase
// edge function calls this.
const nodemailer = require('nodemailer')

const CLUB_EMAIL_ADDRESS = 'info@derbykickboxing.org.uk'
const SMTP_HOST = 'mail.derbykickboxing.org.uk'
const SMTP_PORT = 465

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' }
  }

  const providedSecret = event.headers['x-cron-secret'] || event.headers['X-Cron-Secret']
  const expectedSecret = process.env.CRON_SECRET
  if (!expectedSecret) {
    return { statusCode: 500, body: JSON.stringify({ error: 'CRON_SECRET not configured in Netlify environment variables' }) }
  }
  if (providedSecret !== expectedSecret) {
    return { statusCode: 403, body: JSON.stringify({ error: 'Invalid or missing secret' }) }
  }

  const { to, subject, text } = JSON.parse(event.body || '{}')
  if (!to || !text) return { statusCode: 400, body: JSON.stringify({ error: 'to and text are required' }) }

  const emailPassword = process.env.CLUB_EMAIL_PASSWORD
  if (!emailPassword) {
    return { statusCode: 500, body: JSON.stringify({ error: 'CLUB_EMAIL_PASSWORD not configured in Netlify environment variables' }) }
  }

  try {
    const transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: true,
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
