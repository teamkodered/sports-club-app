// Dropbox sends the admin back here after they press "Allow" on the Connect Dropbox screen.
// Swaps the one-time code for a long-lasting READ-ONLY refresh token and saves it where only
// the server can read it, then returns to the CRM.
const { saveAuth, getAuth, redirectUri, env } = require('./dropbox-api.js')

const back = msg => ({ statusCode: 302, headers: { Location: `/crm?dropbox=${encodeURIComponent(msg)}` }, body: '' })

exports.handler = async (event) => {
  const { code, state, error } = event.queryStringParameters || {}
  if (error) return back('cancelled')
  try {
    const auth = await getAuth()
    if (!code || !state || !auth?.pending_state || state !== auth.pending_state) return back('expired')
    const e = env()
    const t = await fetch('https://api.dropboxapi.com/oauth2/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri(), client_id: e.key, client_secret: e.secret }),
    })
    const tj = await t.json()
    if (!t.ok || !tj.refresh_token) { console.error('dropbox token', tj); return back('failed') }
    const acc = await fetch('https://api.dropboxapi.com/2/users/get_current_account', { method: 'POST', headers: { Authorization: `Bearer ${tj.access_token}` } }).then(r => r.json())
    await saveAuth({
      refresh_token: tj.refresh_token, pending_state: null, connected_at: new Date().toISOString(),
      account_name: acc?.name?.display_name || acc?.email || 'Dropbox',
      root_namespace_id: acc?.root_info?.root_namespace_id || null,   // lets the app see the team space / team folders
    })
    return back('connected')
  } catch (err) {
    console.error('dropbox-callback:', err.message)
    return back('failed')
  }
}
