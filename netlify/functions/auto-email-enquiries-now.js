// "⚡ Check website emails now" button in the CRM Email tab (admins only).
// Runs the same job as the 15-minute schedule (auto-email-enquiries.js) straight away.
const { handler: runJob } = require('./auto-email-enquiries.js')

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method not allowed' }
  const authHeader = event.headers.authorization || event.headers.Authorization
  if (!authHeader) return { statusCode: 401, body: JSON.stringify({ error: 'Missing session' }) }
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, { headers: { apikey: anonKey, Authorization: authHeader } })
  if (!userRes.ok) return { statusCode: 401, body: JSON.stringify({ error: 'Invalid or expired session' }) }
  const user = await userRes.json()
  const r = await fetch(`${supabaseUrl}/rest/v1/members?auth_id=eq.${user.id}&select=role`, { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } })
  const rows = await r.json()
  if (rows?.[0]?.role !== 'admin') return { statusCode: 403, body: JSON.stringify({ error: 'Admins only' }) }
  return runJob()
}
