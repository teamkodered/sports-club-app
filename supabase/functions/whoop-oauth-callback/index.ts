// supabase/functions/whoop-oauth-callback/index.ts
//
// Handles the redirect back from Whoop's OAuth authorize screen.
// Exchanges the auth code for access/refresh tokens (server-side
// only -- the client secret must never be exposed to the browser),
// fetches the Whoop user's profile to get their whoop_user_id, and
// stores/updates the connection for that student.
//
// Deploy: supabase functions deploy whoop-oauth-callback
// Required secrets (set via `supabase secrets set`):
//   WHOOP_CLIENT_ID, WHOOP_CLIENT_SECRET, WHOOP_REDIRECT_URI
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (usually auto-available)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { exchangeWhoopCode, fetchWhoopUserProfile } from '../_shared/whoop-client.ts'

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url)
    const code = url.searchParams.get('code')
    const state = url.searchParams.get('state') // we pass student_id as state when redirecting to Whoop
    const error = url.searchParams.get('error')

    const appBaseUrl = Deno.env.get('APP_BASE_URL') || 'https://klasschamp.netlify.app'

    if (error) {
      return Response.redirect(`${appBaseUrl}/athlete-app?whoop_error=${encodeURIComponent(error)}`, 302)
    }
    if (!code || !state) {
      return Response.redirect(`${appBaseUrl}/athlete-app?whoop_error=missing_code_or_state`, 302)
    }

    const studentId = state
    const clientId = Deno.env.get('WHOOP_CLIENT_ID')!
    const clientSecret = Deno.env.get('WHOOP_CLIENT_SECRET')!
    const redirectUri = Deno.env.get('WHOOP_REDIRECT_URI')!

    const tokenData = await exchangeWhoopCode(code, redirectUri, clientId, clientSecret)
    const profile = await fetchWhoopUserProfile(tokenData.access_token)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000).toISOString()

    const { error: dbError } = await supabase.from('whoop_connections').upsert({
      student_id: studentId,
      whoop_user_id: String(profile.user_id ?? profile.id ?? ''),
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      token_expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'student_id' })

    if (dbError) {
      console.error('Error saving whoop_connections:', dbError)
      return Response.redirect(`${appBaseUrl}/athlete-app?whoop_error=save_failed`, 302)
    }

    return Response.redirect(`${appBaseUrl}/athlete-app?whoop_connected=1`, 302)
  } catch (err) {
    console.error('whoop-oauth-callback error:', err)
    const appBaseUrl = Deno.env.get('APP_BASE_URL') || 'https://klasschamp.netlify.app'
    return Response.redirect(`${appBaseUrl}/athlete-app?whoop_error=unexpected`, 302)
  }
})
