// Lets a logged-in athlete permanently link their own login to a student
// record they find via search, so they don't have to search for themselves
// every time they open "My app".
//
// Uses the service role key to bypass RLS (a normal member can't update
// someone else's members row), but verifies the caller's identity from
// their own session token first, and refuses to hijack a profile that's
// already linked to a different login.
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' }
  }

  const { studentId } = JSON.parse(event.body || '{}')
  const authHeader = event.headers.authorization || event.headers.Authorization
  if (!studentId) return { statusCode: 400, body: JSON.stringify({ error: 'studentId required' }) }
  if (!authHeader) return { statusCode: 401, body: JSON.stringify({ error: 'Missing session' }) }

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const anonKey     = process.env.VITE_SUPABASE_ANON_KEY
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!serviceKey) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Service key not configured' }) }
  }

  try {
    // Identify the caller from their own access token (never trust a
    // client-supplied user id)
    const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { apikey: anonKey, Authorization: authHeader },
    })
    if (!userRes.ok) return { statusCode: 401, body: JSON.stringify({ error: 'Invalid or expired session' }) }
    const user = await userRes.json()

    // Look up the target student and their currently-linked member row
    const studentRes = await fetch(
      `${supabaseUrl}/rest/v1/students?id=eq.${studentId}&select=id,member_id,members(auth_id,first_name,last_name)`,
      { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } }
    )
    const students = await studentRes.json()
    const student = students?.[0]
    if (!student) return { statusCode: 404, body: JSON.stringify({ error: 'Student not found' }) }
    if (!student.member_id) {
      return { statusCode: 422, body: JSON.stringify({ error: 'This student record has no linked contact profile to attach a login to. Ask an admin to check it in the Student Database.' }) }
    }

    const currentAuthId = student.members?.auth_id
    if (currentAuthId && currentAuthId !== user.id) {
      return { statusCode: 409, body: JSON.stringify({ error: 'This profile is already linked to a different login. Ask an admin for help.' }) }
    }

    // If this login is already attached to a different members row (e.g. it
    // self-registered before being matched to its real historical record),
    // release that row first so only one members row ever holds this auth_id
    // -- otherwise the profile lookup (which expects exactly one match)
    // breaks for everyone using this login.
    if (currentAuthId !== user.id) {
      const releaseRes = await fetch(`${supabaseUrl}/rest/v1/members?auth_id=eq.${user.id}&id=neq.${student.member_id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({ auth_id: null }),
      })
      if (!releaseRes.ok) {
        const errText = await releaseRes.text()
        return { statusCode: 500, body: JSON.stringify({ error: `Failed to release old profile link: ${errText}` }) }
      }
    }

    const patchRes = await fetch(`${supabaseUrl}/rest/v1/members?id=eq.${student.member_id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        Prefer: 'return=representation',
      },
      body: JSON.stringify({ auth_id: user.id }),
    })
    if (!patchRes.ok) {
      const errText = await patchRes.text()
      return { statusCode: 500, body: JSON.stringify({ error: errText }) }
    }
    const patched = await patchRes.json()
    if (!patched?.length) {
      return { statusCode: 500, body: JSON.stringify({ error: `Linking silently matched no record (member_id ${student.member_id} may not exist). Ask an admin to check this student's profile in the Student Database.` }) }
    }

    return { statusCode: 200, body: JSON.stringify({ success: true }) }
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) }
  }
}
