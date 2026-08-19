// Netlify serverless function to send Supabase invite
// Uses SUPABASE_SERVICE_ROLE_KEY env var (set in Netlify dashboard)
//
// Requires the caller to be an authenticated admin/coach/leader --
// previously this had NO auth check at all, meaning anyone who found
// the endpoint URL could trigger invite emails to arbitrary addresses
// and silently link an auth account to any member record matching
// that email, entirely bypassing the app's UI and permissions.
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' }
  }

  const { email, name } = JSON.parse(event.body || '{}')
  if (!email) return { statusCode: 400, body: JSON.stringify({ error: 'Email required' }) }

  const authHeader = event.headers.authorization || event.headers.Authorization
  if (!authHeader) return { statusCode: 401, body: JSON.stringify({ error: 'Missing session' }) }

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const anonKey     = process.env.VITE_SUPABASE_ANON_KEY
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!serviceKey) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Service key not configured' }) }
  }

  try {
    // Identify the caller from their own access token (never trust a
    // client-supplied identity), then confirm they're actually staff
    // before doing anything with the service key.
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
    if (!isStaff) return { statusCode: 403, body: JSON.stringify({ error: 'Not authorised to send invites' }) }

    const res = await fetch(`${supabaseUrl}/auth/v1/invite`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({
        email,
        data: { name },
        redirect_to: 'https://klasschamp.netlify.app',
      }),
    })

    const data = await res.json()
    if (!res.ok) {
      return { statusCode: 400, body: JSON.stringify({ error: data.msg || data.error_description || 'Invite failed' }) }
    }

    // If Supabase's response didn't include a real user id, the invite did
    // NOT actually succeed server-side -- this previously fell through to
    // a bare "success: true" with no warning, which is exactly how an
    // admin could see "Invite sent" while no account was ever created.
    if (!data.id) {
      return { statusCode: 200, body: JSON.stringify({
        success: false,
        error: `Supabase accepted the request but didn't return a user — the invite likely wasn't actually created. Raw response: ${JSON.stringify(data)}`,
      }) }
    }

    // Link this new auth user back to their existing members row so the app
    // can find their profile/student record on login (matched by email,
    // which is unique on members). return=representation lets us see
    // exactly which rows (if any) were actually updated -- previously
    // this used return=minimal, which reports success even when the
    // email doesn't match any member and zero rows are touched, leaving
    // the person unable to find their profile with no warning to admin.
    const linkRes = await fetch(`${supabaseUrl}/rest/v1/members?email=eq.${encodeURIComponent(email)}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`,
        'Prefer': 'return=representation',
      },
      body: JSON.stringify({ auth_id: data.id }),
    })
    if (!linkRes.ok) {
      const linkErr = await linkRes.text()
      return { statusCode: 200, body: JSON.stringify({ success: true, warning: `Invite sent, but linking the account failed: ${linkErr}` }) }
    }
    const linkedRows = await linkRes.json()
    if (!linkedRows.length) {
      return { statusCode: 200, body: JSON.stringify({
        success: true,
        warning: `Invite sent to ${email}, but no member record has that exact email on file, so the account couldn't be auto-linked. ` +
          `This often happens when a family shares one email address on their membership record. ` +
          `They'll see "We couldn't find your profile" when they log in -- you'll need to link their account manually (find their member record and set its auth_id).`,
      }) }
    }

    return { statusCode: 200, body: JSON.stringify({ success: true }) }
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) }
  }
}
