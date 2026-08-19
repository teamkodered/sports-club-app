// Lets someone who already has a member record at the club, but is
// signing in for the first time via a NEW login method (e.g. Google,
// which creates a brand new auth identity rather than reusing an
// existing email/password login), get automatically linked to their
// existing members row -- matched by email -- instead of getting
// stuck with a valid session but no profile.
//
// Uses the service role key to bypass RLS (a normal member can't
// update someone else's members row), but verifies the caller's
// identity and email from their own session token first, and refuses
// to hijack a profile that's already linked to a different login.
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' }
  }

  const authHeader = event.headers.authorization || event.headers.Authorization
  if (!authHeader) return { statusCode: 401, body: JSON.stringify({ error: 'Missing session' }) }

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const anonKey     = process.env.VITE_SUPABASE_ANON_KEY
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!serviceKey) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Service key not configured' }) }
  }

  try {
    // Identify the caller (and their email) from their own access
    // token -- never trust a client-supplied email/id.
    const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { apikey: anonKey, Authorization: authHeader },
    })
    if (!userRes.ok) return { statusCode: 401, body: JSON.stringify({ error: 'Invalid or expired session' }) }
    const user = await userRes.json()
    const email = user.email
    if (!email) return { statusCode: 422, body: JSON.stringify({ error: 'This login has no email address to match against.' }) }

    const memberRes = await fetch(
      `${supabaseUrl}/rest/v1/members?email=ilike.${encodeURIComponent(email)}&select=id,auth_id,first_name,last_name&limit=1`,
      { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } }
    )
    const members = await memberRes.json()
    const member = members?.[0]

    if (!member) {
      return { statusCode: 404, body: JSON.stringify({ error: 'not_found', message: `No existing member record found for ${email}. If you're a new member, use one of the sign-up forms instead.` }) }
    }

    if (member.auth_id && member.auth_id === user.id) {
      return { statusCode: 200, body: JSON.stringify({ success: true, already_linked: true }) }
    }

    if (member.auth_id && member.auth_id !== user.id) {
      return { statusCode: 409, body: JSON.stringify({ error: `This email is already linked to a different login. Ask an admin for help, or sign in with whichever login you originally set up.` }) }
    }

    // Release any OTHER members row this new auth id might already be
    // attached to (e.g. a stray self-registration), so only one
    // members row ever holds a given auth_id.
    await fetch(`${supabaseUrl}/rest/v1/members?auth_id=eq.${user.id}&id=neq.${member.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, Prefer: 'return=minimal' },
      body: JSON.stringify({ auth_id: null }),
    })

    const patchRes = await fetch(`${supabaseUrl}/rest/v1/members?id=eq.${member.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, Prefer: 'return=representation' },
      body: JSON.stringify({ auth_id: user.id }),
    })
    if (!patchRes.ok) {
      const errText = await patchRes.text()
      return { statusCode: 500, body: JSON.stringify({ error: errText }) }
    }
    const patched = await patchRes.json()
    if (!patched?.length) {
      return { statusCode: 500, body: JSON.stringify({ error: 'Linking silently matched no record.' }) }
    }

    return { statusCode: 200, body: JSON.stringify({ success: true }) }
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) }
  }
}
