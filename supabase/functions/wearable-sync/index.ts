// supabase/functions/wearable-sync/index.ts
//
// Scheduled sync for EVERY connected wearable, whatever the provider.
// Polls each provider's API for anything new since the last sync and writes
// it into wearable_workouts / wearable_daily. This does not depend on
// provider webhooks, so data still arrives even when (as with Whoop) the
// webhooks never fire.
//
// Deploy: supabase functions deploy wearable-sync --no-verify-jwt
// Call:   POST with header  x-sync-secret: <WEARABLE_SYNC_SECRET>
//         optional JSON body { "student_id": "...", "provider": "whoop", "days": 30 }
// Schedule it (e.g. hourly) with pg_cron -- see wearables_backend_cron.sql.
// Required secrets: WEARABLE_SYNC_SECRET, WHOOP_CLIENT_ID, WHOOP_CLIENT_SECRET,
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { serviceClient, ensureAccessToken, upsertWorkouts, upsertDaily, markSynced, markError, type Connection } from '../_shared/wearables.ts'
import { PROVIDERS } from '../_shared/whoop-client.ts'

Deno.serve(async (req) => {
  const secret = Deno.env.get('WEARABLE_SYNC_SECRET')
  if (!secret || req.headers.get('x-sync-secret') !== secret) return new Response('Unauthorized', { status: 401 })

  let opts: { student_id?: string; provider?: string; days?: number } = {}
  try { opts = await req.json() } catch { /* no body */ }

  const sb = serviceClient()
  let q = sb.from('wearable_connections').select('*').neq('status', 'disconnected')
  if (opts.student_id) q = q.eq('student_id', opts.student_id)
  if (opts.provider) q = q.eq('provider', opts.provider)
  const { data: conns, error } = await q
  if (error) return new Response('DB error: ' + error.message, { status: 500 })

  const results: Record<string, unknown>[] = []
  for (const conn of (conns || []) as Connection[]) {
    const provider = PROVIDERS[conn.provider]
    if (!provider) { results.push({ id: conn.id, provider: conn.provider, skipped: 'no adapter' }); continue }
    try {
      const token = await ensureAccessToken(sb, provider, conn)
      // Overlap the window a little so late-processed records aren't missed
      const since = opts.days ? new Date(Date.now() - opts.days * 86_400_000)
        : conn.last_sync_at ? new Date(new Date(conn.last_sync_at).getTime() - 2 * 86_400_000)
        : new Date(Date.now() - 30 * 86_400_000)
      const { workouts, daily } = await provider.sync(conn, token, since)
      await upsertWorkouts(sb, workouts)
      await upsertDaily(sb, daily)
      await markSynced(sb, conn.id)
      results.push({ id: conn.id, provider: conn.provider, workouts: workouts.length, daily: daily.length })
    } catch (err) {
      console.error(`wearable-sync ${conn.provider} ${conn.id}:`, err)
      await markError(sb, conn.id, err)
      results.push({ id: conn.id, provider: conn.provider, error: String((err as Error)?.message || err) })
    }
  }
  return new Response(JSON.stringify({ synced: results.length, results }), { headers: { 'Content-Type': 'application/json' } })
})
