// Netlify function: create a login from a coach's invite link -- already confirmed, so no
// "check your email" step (that step is where invites were getting stuck).
// POST { token, email, password } -> { ok: true }  (then the page signs in and links the invite as usual)
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method not allowed' }
  const json = (code, body) => ({ statusCode: code, body: JSON.stringify(body) })
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const svc = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!svc) return json(500, { error: 'Service key not configured' })
  const S = { apikey: svc, Authorization: `Bearer ${svc}`, 'Content-Type': 'application/json' }
  let body
  try { body = JSON.parse(event.body || '{}') } catch { return json(400, { error: 'Bad request' }) }
  const token = String(body.token || '').trim()
  const email = String(body.email || '').trim().toLowerCase()
  const password = String(body.password || '')
  if (!token) return json(400, { error: 'Missing invite.' })
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json(400, { error: 'Enter a valid email address.' })
  if (password.length < 6) return json(400, { error: 'The password must be at least 6 characters.' })
  try {
    // the invite must be real, unused and in date
    const r = await fetch(`${url}/rest/v1/app_invites?token=eq.${encodeURIComponent(token)}&select=id,used_at,expires_at`, { headers: S })
    const inv = (await r.json())[0]
    if (!inv) return json(400, { error: "This invite link isn't valid. Ask your coach for a new one." })
    if (inv.used_at) return json(400, { error: 'This invite has already been used -- sign in instead.' })
    if (inv.expires_at && new Date(inv.expires_at) < new Date()) return json(400, { error: 'This invite has expired. Ask your coach for a new one.' })
    // create the login, confirmed straight away
    const c = await fetch(`${url}/auth/v1/admin/users`, { method: 'POST', headers: S, body: JSON.stringify({ email, password, email_confirm: true }) })
    if (!c.ok) {
      const t = await c.text()
      if (/already|registered|exists/i.test(t)) {
        // a login with this email exists but was never confirmed: confirm it so they can sign in
        const l = await fetch(`${url}/auth/v1/admin/users?per_page=1000`, { headers: S })
        const users = (await l.json()).users || []
        const u = users.find(x => String(x.email || '').toLowerCase() === email)
        if (u && !u.email_confirmed_at) {
          await fetch(`${url}/auth/v1/admin/users/${u.id}`, { method: 'PUT', headers: S, body: JSON.stringify({ email_confirm: true, password }) })
          return json(200, { ok: true, existing: true })
        }
        return json(409, { error: 'There is already a login with this email -- use "Already have a login? Sign in".' })
      }
      return json(400, { error: 'Could not create the login: ' + t.slice(0, 200) })
    }
    return json(200, { ok: true })
  } catch (e) {
    return json(500, { error: String(e.message || e) })
  }
}
