// supabase/functions/whoop-webhook/index.ts
//
// Receives Whoop's webhook notifications (fired shortly after a workout is
// processed -- NOT live). Verifies the signature, finds the student for the
// Whoop user, fetches the workout and writes it to the shared wearable
// backend (wearable_workouts). The scheduled wearable-sync function covers
// the same ground by polling, so this is a faster path, not the only path.
//
// Deploy: supabase functions deploy whoop-webhook --no-verify-jwt
// Required secrets: WHOOP_CLIENT_ID, WHOOP_CLIENT_SECRET, SUPABASE_URL,
//   SUPABASE_SERVICE_ROLE_KEY (Whoop signs webhooks with the Client Secret.)

import { serviceClient, getConnection, ensureAccessToken, upsertWorkouts, markSynced, markError } from '../_shared/wearables.ts'
import { whoopProvider, fetchWhoopWorkout, mapWhoopWorkout } from '../_shared/whoop-client.ts'

async function verifySignature(rawBody: string, signatureHeader: string | null, secret: string) {
  if (!signatureHeader) return false
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sigBuf = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody))
  return btoa(String.fromCharCode(...new Uint8Array(sigBuf))) === signatureHeader
}

Deno.serve(async (req) => {
  try {
    const rawBody = await req.text()
    const signature = req.headers.get('X-WHOOP-Signature') || req.headers.get('x-whoop-signature')
    console.log('whoop-webhook received; signature present =', !!signature)
    if (!await verifySignature(rawBody, signature, Deno.env.get('WHOOP_CLIENT_SECRET')!)) {
      console.error('Invalid Whoop webhook signature')
      return new Response('Invalid signature', { status: 401 })
    }

    const { user_id, id: workoutId, type } = JSON.parse(rawBody)
    if (!type || !String(type).startsWith('workout.') || type === 'workout.deleted') {
      return new Response('OK (ignored event type)', { status: 200 })
    }

    const sb = serviceClient()
    const conn = await getConnection(sb, 'whoop', String(user_id))
    if (!conn) {
      console.error(`No whoop connection for whoop_user_id ${user_id}`)
      return new Response('OK (unknown user)', { status: 200 })
    }

    try {
      const token = await ensureAccessToken(sb, whoopProvider, conn)
      const workout = await fetchWhoopWorkout(String(workoutId), token)
      await upsertWorkouts(sb, [mapWhoopWorkout(conn.student_id, workout)])
      await markSynced(sb, conn.id)
    } catch (err) {
      await markError(sb, conn.id, err)
      throw err
    }
    return new Response('OK', { status: 200 })
  } catch (err) {
    console.error('whoop-webhook error:', err)
    return new Response('Internal error', { status: 500 })
  }
})
