// Netlify function: finish an invite in ONE step -- no email confirmation, no "open the link again".
// POST { token, email, password }
//  - checks the invite (valid, not used by someone else, not expired)
//  - creates the login already confirmed (or, if that email has a login that was never confirmed,
//    confirms it and sets this password); a login that's already confirmed has to sign in instead
//  - links the login to the invited athlete's record and marks the invite used
// The app then signs straight in and opens the athlete app.
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
  if (!token) return json(400, { error: 'This invite link isn\'t valid.' })
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json(400, { error: 'Enter a valid email address.' })
  if (password.length < 6) return json(400, { error: 'The password must be at least 6 characters.' })
  try {
    const inv = (await (await fetch(`${url}/rest/v1/app_invites?token=eq.${encodeURIComponent(token)}&select=*`, { headers: S })).json())?.[0]
    if (!inv) return json(404, { error: 'This invite link isn\'t valid. Ask your coach for a new one.' })
    if (inv.expires_at && new Date(inv.expires_at) < new Date()) return json(410, { error: 'This invite has expired. Ask your coach for a new one.' })
    const isAthlete = inv.kind === 'athlete'   // parent invites: just the confirmed login -- the app links them after sign-in
    const st = (await (await fetch(`${url}/rest/v1/students?id=eq.${inv.student_id}&select=member_id`, { headers: S })).json())?.[0]
    if (isAthlete && !st?.member_id) return json(404, { error: 'The athlete record for this invite wasn\'t found. Ask your coach.' })
    const mem = isAthlete ? (await (await fetch(`${url}/rest/v1/members?id=eq.${st.member_id}&select=id,auth_id,email`, { headers: S })).json())?.[0] : null

    // create the login confirmed, or confirm an existing never-confirmed one
    let authId = null
    const cu = await fetch(`${url}/auth/v1/admin/users`, { method: 'POST', headers: S, body: JSON.stringify({ email, password, email_confirm: true }) })
    if (cu.ok) authId = (await cu.json()).id
    else {
      const err = await cu.json().catch(() => ({}))
      if (!/already|registered|exists/i.test(err.msg || err.message || err.error_description || '')) return json(400, { error: err.msg || err.message || 'Could not create the login.' })
      const list = await (await fetch(`${url}/auth/v1/admin/users?per_page=1000`, { headers: S })).json()
      const u = (list.users || list || []).find(x => String(x.email || '').toLowerCase() === email)
      if (!u) return json(400, { error: 'That email already has a login -- use "Already have a login? Sign in".' })
      if (u.email_confirmed_at && mem?.auth_id !== u.id) return json(409, { error: 'That email already has a login -- tap "Already have a login? Sign in" and use its password; the invite links automatically.' })
      const r = await fetch(`${url}/auth/v1/admin/users/${u.id}`, { method: 'PUT', headers: S, body: JSON.stringify({ password, email_confirm: true }) })
      if (!r.ok) return json(400, { error: 'Could not set up the login: ' + await r.text() })
      authId = u.id
    }
    if (isAthlete && mem?.auth_id && mem.auth_id !== authId) return json(409, { error: 'This athlete already has a login. Ask your coach for help.' })
    if (!isAthlete) return json(200, { ok: true })

    // link + mark the invite used
    await fetch(`${url}/rest/v1/members?id=eq.${st.member_id}`, { method: 'PATCH', headers: { ...S, Prefer: 'return=minimal' }, body: JSON.stringify({ auth_id: authId, ...(mem?.email ? {} : { email }) }) })
    await fetch(`${url}/rest/v1/app_invites?id=eq.${inv.id}`, { method: 'PATCH', headers: { ...S, Prefer: 'return=minimal' }, body: JSON.stringify({ used_at: new Date().toISOString(), used_by: authId }) })
    return json(200, { ok: true })
  } catch (e) {
    return json(500, { error: 'Something went wrong: ' + (e.message || e) })
  }
}
