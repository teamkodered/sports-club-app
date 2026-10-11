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

  const { studentId, dob } = JSON.parse(event.body || '{}')
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

    const svc = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` }

    // 1. Staff / admin logins are never moved onto an athlete's record (that's how an admin
    //    once ended up signed in as an athlete and lost their own admin access)
    const mineRes = await fetch(`${supabaseUrl}/rest/v1/members?auth_id=eq.${user.id}&select=id,role,access`, { headers: svc })
    const mine = mineRes.ok ? await mineRes.json() : []
    const STAFF = ['admin', 'captain', 'coach', 'leader', 'head_coach']
    const isStaffLogin = (mine || []).some(m => STAFF.includes(m.role) || m.access?.group || Object.values(m.access?.pages || {}).some(v => v === 'view' || v === 'edit'))
    if (isStaffLogin) {
      return { statusCode: 403, body: JSON.stringify({ error: "This is a staff login, so it can't be linked to an athlete's profile. To use an athlete's app, sign out and sign in with that athlete's own email." }) }
    }

    // Look up the target student and their currently-linked member row
    const studentRes = await fetch(
      `${supabaseUrl}/rest/v1/students?id=eq.${studentId}&select=id,member_id,members(auth_id,first_name,last_name,email,date_of_birth)`,
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

    // 2. Prove it's really them: the login's email matches the profile's email, OR they give
    //    the athlete's date of birth exactly as the club has it
    const recEmail = String(student.members?.email || '').trim().toLowerCase()
    const loginEmail = String(user.email || '').trim().toLowerCase()
    const recDob = String(student.members?.date_of_birth || '').slice(0, 10)
    const emailMatch = recEmail && loginEmail && recEmail === loginEmail
    const dobMatch = recDob && dob && String(dob).slice(0, 10) === recDob
    if (!emailMatch && !dobMatch) {
      return { statusCode: 403, body: JSON.stringify({ error: recDob ? "That date of birth doesn't match our records for this athlete. Check it and try again, or ask a coach to link your account." : "We can't confirm this profile is yours. Ask a coach to link your account for you.", needsDob: !!recDob }) }
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
