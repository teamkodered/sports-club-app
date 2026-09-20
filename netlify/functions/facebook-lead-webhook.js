// Receives a new Facebook lead pushed by a Zapier "Facebook Lead Ads ->
// New Lead" trigger, and creates an Enquiry directly -- no manual CSV
// download/upload step at all, unlike the in-app Facebook import
// button (CRM -> Enquiries), which this endpoint complements rather
// than replaces.
//
// Protected by a shared secret rather than left open, since this is a
// public URL anyone could otherwise POST fake enquiries to. Zapier
// sends the secret as a query parameter (?secret=...) since its
// webhook action doesn't make custom headers as easy to set up as a
// URL.
//
// Expected JSON body (map these field names in Zapier's action step):
//   name           - the lead's full name
//   email          - optional
//   phone          - optional (UK numbers cleaned the same way as the
//                    in-app CSV import: strips a "+44"/"44"/"0044"
//                    prefix and ensures a single leading 0)
//   lead_id        - Facebook's own lead ID, used to avoid creating a
//                    duplicate Enquiry if Zapier ever retries/resends
//                    the same lead
//   form_name      - optional, stored in notes for context
function cleanPhone(raw) {
  if (!raw) return null
  let p = String(raw).trim().replace(/[\s()-]/g, '')
  if (p.startsWith('+44')) p = p.slice(3)
  else if (p.startsWith('0044')) p = p.slice(4)
  else if (p.startsWith('44')) p = p.slice(2)
  if (p && !p.startsWith('0')) p = '0' + p
  return p || null
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' }
  }

  const expectedSecret = process.env.FACEBOOK_LEAD_WEBHOOK_SECRET
  if (!expectedSecret) {
    return { statusCode: 500, body: JSON.stringify({ error: 'FACEBOOK_LEAD_WEBHOOK_SECRET not configured in Netlify environment variables' }) }
  }
  const providedSecret = event.queryStringParameters?.secret
  if (providedSecret !== expectedSecret) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Invalid or missing secret' }) }
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Service key not configured' }) }
  }

  let payload
  try {
    payload = JSON.parse(event.body || '{}')
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) }
  }

  const { name, email, phone, lead_id, form_name } = payload
  if (!name && !email && !phone) {
    return { statusCode: 400, body: JSON.stringify({ error: 'At least one of name, email or phone is required' }) }
  }

  const headers = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
  }

  const external_id = lead_id ? `fb_zapier_${lead_id}` : null
  if (external_id) {
    const dupeRes = await fetch(`${supabaseUrl}/rest/v1/enquiries?external_id=eq.${encodeURIComponent(external_id)}&select=id`, { headers })
    const dupes = await dupeRes.json()
    if (Array.isArray(dupes) && dupes.length > 0) {
      return { statusCode: 200, body: JSON.stringify({ ok: true, duplicate: true, enquiry_id: dupes[0].id }) }
    }
  }

  const insertRes = await fetch(`${supabaseUrl}/rest/v1/enquiries`, {
    method: 'POST',
    headers: { ...headers, Prefer: 'return=representation' },
    body: JSON.stringify({
      name: name || 'Unknown',
      contact_email: email || null,
      contact_phone: cleanPhone(phone),
      contact_method: 'facebook_ad',
      enquiry_date: new Date().toISOString().split('T')[0],
      notes: form_name ? `Form: ${form_name}` : null,
      status: 'not_started',
      external_id,
    }),
  })

  if (!insertRes.ok) {
    const errText = await insertRes.text()
    return { statusCode: 500, body: JSON.stringify({ error: errText }) }
  }
  const [inserted] = await insertRes.json()
  return { statusCode: 200, body: JSON.stringify({ ok: true, enquiry_id: inserted?.id }) }
}
