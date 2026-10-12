// Netlify function: an ADMIN creates a login directly -- already confirmed, no email sent.
// Avoids Supabase's built-in email limit ("email rate limit exceeded") and email-scanner
// "expired link" problems. The admin gives the person the temporary password.
//
// POST { email, password, memberId?, firstName?, lastName?, phone?, role? }
//  - memberId given: links the new login to that existing member record
//  - otherwise: links to a member with that email if there's exactly one unlinked, else creates
//    a new member record (role defaults to 'member'; staff roles only as chosen by the admin)
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method not allowed' }
  const json = (code, body) => ({ statusCode: code, body: JSON.stringify(body) })
  const authHeader = event.headers.authorization || event.headers.Authorization
  if (!authHeader) return json(401, { error: 'Missing session' })
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const anon = process.env.VITE_SUPABASE_ANON_KEY
  const svc = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!svc) return json(500, { error: 'Service key not configured' })
  const S = { apikey: svc, Authorization: `Bearer ${svc}`, 'Content-Type': 'application/json' }

  let body
  try { body = JSON.parse(event.body || '{}') } catch { return json(400, { error: 'Bad request' }) }
  const email = String(body.email || '').trim().toLowerCase()
  const password = String(body.password || '')
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json(400, { error: 'Enter a valid email address.' })
  if (password.length < 8) return json(400, { error: 'The temporary password must be at least 8 characters.' })
  const ROLES = ['member', 'leader', 'captain', 'head_coach', 'admin']
  const role = ROLES.includes(body.role) ? body.role : 'member'

  try {
    // caller must be an admin
    const u = await fetch(`${url}/auth/v1/user`, { headers: { apikey: anon, Authorization: authHeader } })
    if (!u.ok) return json(401, { error: 'Invalid or expired session' })
    const caller = await u.json()
    const cr = await fetch(`${url}/rest/v1/members?auth_id=eq.${caller.id}&select=role`, { headers: S })
    const rows = cr.ok ? await cr.json() : []
    if (!rows.some(r => r.role === 'admin')) return json(403, { error: 'Only admins can create logins.' })

    // find the member record to link
    let memberId = body.memberId || null
    if (memberId) {
      const m = await (await fetch(`${url}/rest/v1/members?id=eq.${memberId}&select=id,auth_id`, { headers: S })).json()
      if (!m?.[0]) return json(404, { error: 'Member record not found.' })
      if (m[0].auth_id) return json(409, { error: 'That person already has a login. Use "Reset password" in Supabase instead.' })
    } else {
      const m = await (await fetch(`${url}/rest/v1/members?email=ilike.${encodeURIComponent(email)}&auth_id=is.null&select=id`, { headers: S })).json()
      if (m?.length === 1) memberId = m[0].id
    }

    // create the login, already confirmed (or reuse an existing unlinked one)
    let authId = null
    const cu = await fetch(`${url}/auth/v1/admin/users`, { method: 'POST', headers: S, body: JSON.stringify({ email, password, email_confirm: true }) })
    if (cu.ok) authId = (await cu.json()).id
    else {
      const err = await cu.json().catch(() => ({}))
      if (!/already|registered|exists/i.test(err.msg || err.message || err.error_description || '')) return json(400, { error: err.msg || err.message || 'Could not create the login.' })
      // login exists: find it, make sure it's not linked to someone else, set the new password + confirm
      const list = await (await fetch(`${url}/auth/v1/admin/users?per_page=1000`, { headers: S })).json()
      const found = (list.users || []).find(x => String(x.email).toLowerCase() === email)
      if (!found) return json(400, { error: 'A login with this email exists but could not be found.' })
      const linked = await (await fetch(`${url}/rest/v1/members?auth_id=eq.${found.id}&select=id,first_name,last_name`, { headers: S })).json()
      if (linked?.length && linked[0].id !== memberId) return json(409, { error: `This email's login is already linked to ${linked[0].first_name} ${linked[0].last_name}.` })
      await fetch(`${url}/auth/v1/admin/users/${found.id}`, { method: 'PUT', headers: S, body: JSON.stringify({ password, email_confirm: true }) })
      authId = found.id
    }

    // link (or create) the member record
    if (memberId) {
      const patch = { auth_id: authId, ...(body.role ? { role } : {}) }
      const r = await fetch(`${url}/rest/v1/members?id=eq.${memberId}`, { method: 'PATCH', headers: S, body: JSON.stringify(patch) })
      if (!r.ok) return json(500, { error: 'Login created, but linking it failed: ' + await r.text() })
    } else {
      const r = await fetch(`${url}/rest/v1/members`, { method: 'POST', headers: { ...S, Prefer: 'return=representation' },
        body: JSON.stringify({ auth_id: authId, email, first_name: body.firstName || email.split('@')[0], last_name: body.lastName || '', phone: body.phone || null, role, status: 'active',
          member_id: `${role === 'member' ? 'MEM' : 'COACH'}-${Date.now().toString().slice(-6)}`, joined_date: new Date().toISOString().slice(0, 10) }) })
      if (!r.ok) return json(500, { error: 'Login created, but the member record failed: ' + await r.text() })
      memberId = (await r.json())?.[0]?.id
    }
    return json(200, { ok: true, memberId, authId })
  } catch (e) {
    return json(500, { error: e.message })
  }
}
