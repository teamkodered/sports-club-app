// Sends a push notification to every device a member has subscribed
// on. Called two ways:
//   1. Directly via POST from a database trigger (pg_net), e.g. when
//      a coach logs a visible note for an athlete.
//   2. From the check-ladder-changes function, when someone's league
//      rank has moved since the last check.
//
// Expects: { member_id: string, title: string, body: string, url?: string }

import webpush from 'npm:web-push@3.6.7'
import { createClient } from 'npm:@supabase/supabase-js@2'

const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY')!
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY')!
webpush.setVapidDetails('mailto:admin@kr-centre.com', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

Deno.serve(async (req) => {
  try {
    const { member_id, title, body, url } = await req.json()
    if (!member_id || !title) {
      return new Response(JSON.stringify({ error: 'member_id and title are required' }), { status: 400 })
    }

    const { data: subs, error } = await supabase
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth')
      .eq('member_id', member_id)

    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 })
    if (!subs || subs.length === 0) return new Response(JSON.stringify({ sent: 0 }), { status: 200 })

    const payload = JSON.stringify({ title, body: body || '', url: url || '/athlete-app' })

    const results = await Promise.allSettled(subs.map(sub =>
      webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload,
      ).catch(async (err) => {
        // 404/410 means the subscription is dead (uninstalled, expired) -- clean it up.
        if (err.statusCode === 404 || err.statusCode === 410) {
          await supabase.from('push_subscriptions').delete().eq('id', sub.id)
        }
        throw err
      })
    ))

    const sent = results.filter(r => r.status === 'fulfilled').length
    return new Response(JSON.stringify({ sent, total: subs.length }), { status: 200 })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 })
  }
})
