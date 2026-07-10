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

    // Link this new auth user back to their existing members row so the app
    // can find their profile/student record on login (matched by email,
    // which is unique on members).
    if (data.id) {
      const linkRes = await fetch(`${supabaseUrl}/rest/v1/members?email=eq.${encodeURIComponent(email)}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'apikey': serviceKey,
          'Authorization': `Bearer ${serviceKey}`,
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify({ auth_id: data.id }),
      })
      if (!linkRes.ok) {
        const linkErr = await linkRes.text()
        return { statusCode: 200, body: JSON.stringify({ success: true, warning: `Invite sent, but linking the account failed: ${linkErr}` }) }
      }
    }

    return { statusCode: 200, body: JSON.stringify({ success: true }) }
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) }
  }
}
