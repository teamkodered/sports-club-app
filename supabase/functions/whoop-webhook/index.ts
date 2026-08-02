// supabase/functions/whoop-webhook/index.ts
//
// Receives Whoop's webhook notifications (fired when a workout is
// created/updated -- typically a few minutes after the workout ends,
// once Whoop finishes processing it. NOT a live/mid-session feed).
// Verifies the webhook signature, looks up which student this Whoop
// user maps to, fetches the full workout via the Whoop API (using
// that student's stored access token, refreshing it first if
// expired), and upserts the summary into whoop_sessions.
//
// Deploy: supabase functions deploy whoop-webhook --no-verify-jwt
//   (--no-verify-jwt because Whoop calls this directly, not through
//   your app's authenticated session)
// Register this function's URL in the Whoop developer dashboard as
// your webhook endpoint.
//
// Required secrets: WHOOP_CLIENT_ID, WHOOP_CLIENT_SECRET,
//   WHOOP_WEBHOOK_SECRET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { refreshWhoopToken, fetchWhoopWorkout, mapWhoopWorkoutToSession } from '../_shared/whoop-client.ts'

async function verifySignature(rawBody: string, signatureHeader: string | null, secret: string) {
  if (!signatureHeader) return false
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  )
  const sigBuf = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody))
  const expected = btoa(String.fromCharCode(...new Uint8Array(sigBuf)))
  return expected === signatureHeader
}

Deno.serve(async (req) => {
  try {
    const rawBody = await req.text()
    const signature = req.headers.get('X-WHOOP-Signature') || req.headers.get('x-whoop-signature')
    const webhookSecret = Deno.env.get('WHOOP_WEBHOOK_SECRET')!

    const isValid = await verifySignature(rawBody, signature, webhookSecret)
    if (!isValid) {
      console.error('Invalid Whoop webhook signature')
      return new Response('Invalid signature', { status: 401 })
    }

    const payload = JSON.parse(rawBody)
    // Expected shape (verify against current Whoop docs):
    // { user_id, id, type: "workout.updated" | "workout.deleted" | ..., trace_id }
    const { user_id, id: workoutId, type } = payload

    if (!type || !String(type).startsWith('workout.') || type === 'workout.deleted') {
      return new Response('OK (ignored event type)', { status: 200 })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { data: connection } = await supabase
      .from('whoop_connections')
      .select('*')
      .eq('whoop_user_id', String(user_id))
      .maybeSingle()

    if (!connection) {
      console.error(`No whoop_connections row for whoop_user_id ${user_id}`)
      return new Response('OK (unknown user)', { status: 200 })
    }

    let accessToken = connection.access_token
    if (new Date(connection.token_expires_at) <= new Date()) {
      const clientId = Deno.env.get('WHOOP_CLIENT_ID')!
      const clientSecret = Deno.env.get('WHOOP_CLIENT_SECRET')!
      const refreshed = await refreshWhoopToken(connection.refresh_token, clientId, clientSecret)
      accessToken = refreshed.access_token
      await supabase.from('whoop_connections').update({
        access_token: refreshed.access_token,
        refresh_token: refreshed.refresh_token,
        token_expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('student_id', connection.student_id)
    }

    const workout = await fetchWhoopWorkout(workoutId, accessToken)
    const sessionRow = mapWhoopWorkoutToSession(connection.student_id, workout)

    const { error: upsertError } = await supabase
      .from('whoop_sessions')
      .upsert(sessionRow, { onConflict: 'whoop_workout_id' })

    if (upsertError) {
      console.error('Error upserting whoop_sessions:', upsertError)
      return new Response('Error saving session', { status: 500 })
    }

    return new Response('OK', { status: 200 })
  } catch (err) {
    console.error('whoop-webhook error:', err)
    return new Response('Internal error', { status: 500 })
  }
})
