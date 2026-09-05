// Verifies the coach-signup access code server-side. The old approach
// checked this in the browser against a hardcoded string in the JS
// bundle -- trivially readable by anyone via "View Page Source", which
// made the gate meaningless. The real code now lives only here, as a
// Netlify environment variable never sent to the client.
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' }
  }
  const { code } = JSON.parse(event.body || '{}')
  const expected = process.env.COACH_ACCESS_CODE
  if (!expected) {
    return { statusCode: 500, body: JSON.stringify({ error: 'COACH_ACCESS_CODE not configured in Netlify environment variables' }) }
  }
  const valid = !!code && code.trim().toUpperCase() === expected.trim().toUpperCase()
  return { statusCode: 200, body: JSON.stringify({ valid }) }
}
