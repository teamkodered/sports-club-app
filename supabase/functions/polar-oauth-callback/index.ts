// supabase/functions/polar-oauth-callback/index.ts
//
// The athlete approves Klass Champ on Polar Flow; Polar sends them back to
// https://klasschamp.netlify.app/wearables/polar-callback?code=...&state=<student id>
// and that page forwards here. We swap the code for a token (server-side -- the
// client secret never reaches the browser), register the Polar user with our
// client, save the connection, and send the athlete back to Wearables.
//
// Deploy: supabase functions deploy polar-oauth-callback --project-ref zhlefvardwawjstulifb --no-verify-jwt --use-api
// Secrets: POLAR_CLIENT_ID, POLAR_CLIENT_SECRET (supabase secrets set ...)

import { serviceClient, saveConnection } from '../_shared/wearables.ts'
import { exchangePolarCode, registerPolarUser } from '../_shared/polar-client.ts'

const REDIRECT_URI = 'https://klasschamp.netlify.app/wearables/polar-callback'

Deno.serve(async (req) => {
  const appBaseUrl = Deno.env.get('APP_BASE_URL') || 'https://klasschamp.netlify.app'
  try {
    const url = new URL(req.url)
    const code = url.searchParams.get('code'), studentId = url.searchParams.get('state'), err = url.searchParams.get('error')
    if (err) return Response.redirect(`${appBaseUrl}/athlete-app?wearable_error=${encodeURIComponent(err)}`, 302)
    if (!code || !studentId) return Response.redirect(`${appBaseUrl}/athlete-app?wearable_error=missing_code_or_state`, 302)

    const t = await exchangePolarCode(code, REDIRECT_URI)
    await registerPolarUser(t.access_token, studentId)
    const sb = serviceClient()
    const { error } = await saveConnection(sb, {
      student_id: studentId, provider: 'polar', provider_user_id: String(t.x_user_id ?? ''),
      access_token: t.access_token, refresh_token: null,
      // Polar tokens are long-lived; if no expiry is given, treat it as ~10 years
      token_expires_at: new Date(Date.now() + (t.expires_in ? t.expires_in * 1000 : 10 * 365 * 86_400_000)).toISOString(),
      scopes: 'accesslink.read_all',
    })
    if (error) { console.error('polar save connection:', error); return Response.redirect(`${appBaseUrl}/athlete-app?wearable_error=save_failed`, 302) }
    return Response.redirect(`${appBaseUrl}/athlete-app?wearable_connected=polar`, 302)
  } catch (e) {
    console.error('polar-oauth-callback error:', e)
    return Response.redirect(`${appBaseUrl}/athlete-app?wearable_error=${encodeURIComponent(String((e as Error)?.message || 'unexpected').slice(0, 120))}`, 302)
  }
})
