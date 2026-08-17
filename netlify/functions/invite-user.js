// Netlify serverless function to send Supabase invite
// Uses SUPABASE_SERVICE_ROLE_KEY env var (set in Netlify dashboard)
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' }
  }

  const { email, name } = JSON.parse(event.body || '{}')
  if (!email) return { statusCode: 400, body: JSON.stringify({ error: 'Email required' }) }

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!serviceKey) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Service key not configured' }) }
  }

  try {
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
