// supabase/functions/wearable-ingest/index.ts
//
// Generic "send data in" endpoint for wearables that have NO web API and
// must push from the phone: Apple Health (via an iPhone Shortcut), Samsung
// Health / Health Connect (via a future Android app), or anything else.
// Writes into the shared wearable tables like every other provider.
//
// Deploy: supabase functions deploy wearable-ingest --no-verify-jwt
//
// POST JSON (Content-Type: application/json):
// {
//   "token": "<athlete's link code from the app>",
//   "days": [ { "day": "2026-09-26", "steps": 8432, "sleep_seconds": 27000,
//               "resting_heart_rate": 52, "hrv": 61, "active_calories": 540 } ],
//   "workouts": [ { "id": "abc", "sport_name": "Running", "start_time": "...",
//                   "end_time": "...", "avg_heart_rate": 140, "max_heart_rate": 172,
//                   "calories": 320, "distance_m": 5100 } ]
// }
// Shortcuts sends numbers as text, so everything is parsed leniently.
// Also accepts a flat shape: { token, day, steps, sleep_hours, ... }.

import { serviceClient, upsertDaily, upsertWorkouts, markSynced, type DailyRow, type WorkoutRow } from '../_shared/wearables.ts'

const num = (v: unknown): number | null => {
  if (v == null || v === '') return null
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/[^0-9.\-]/g, ''))
  return Number.isFinite(n) ? n : null
}
const int = (v: unknown) => { const n = num(v); return n == null ? null : Math.round(n) }
const dayOf = (v: unknown): string | null => {
  if (!v) return null
  const d = new Date(String(v)); if (isNaN(d.getTime())) return String(v).slice(0, 10)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

Deno.serve(async (req) => {
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return new Response('POST only', { status: 405, headers: cors })

  let body: any
  try { body = await req.json() } catch { return new Response('Invalid JSON', { status: 400, headers: cors }) }
  const token = String(body.token || '').trim()
  if (!token) return new Response('Missing token', { status: 400, headers: cors })

  const sb = serviceClient()
  const { data: conn } = await sb.from('wearable_connections').select('id, student_id, provider, status').eq('ingest_token', token).maybeSingle()
  if (!conn) return new Response('Unknown token', { status: 401, headers: cors })

  // Daily rows: array, or one flat day at the top level
  const dayInputs: any[] = Array.isArray(body.days) ? body.days : (body.day || body.steps != null || body.sleep_seconds != null || body.sleep_hours != null) ? [body] : []
  const daily: DailyRow[] = []
  for (const d of dayInputs) {
    const day = dayOf(d.day || d.date) || dayOf(new Date())
    if (!day) continue
    const sleepSeconds = num(d.sleep_seconds) ?? (num(d.sleep_hours) != null ? Math.round(num(d.sleep_hours)! * 3600) : null) ?? (num(d.sleep_minutes) != null ? Math.round(num(d.sleep_minutes)! * 60) : null)
    daily.push({
      student_id: conn.student_id, provider: conn.provider, day,
      steps: int(d.steps), resting_heart_rate: int(d.resting_heart_rate ?? d.resting_hr),
      hrv: num(d.hrv), sleep_seconds: sleepSeconds, sleep_score: num(d.sleep_score),
      recovery_score: num(d.recovery_score ?? d.readiness), active_calories: num(d.active_calories ?? d.calories),
      raw_data: d,
    })
  }

  const workouts: WorkoutRow[] = (Array.isArray(body.workouts) ? body.workouts : []).map((w: any, i: number) => {
    const start = w.start_time || w.start || null, end = w.end_time || w.end || null
    return {
      student_id: conn.student_id, provider: conn.provider,
      provider_workout_id: String(w.id || w.uuid || `${start || Date.now()}-${i}`),
      sport_name: w.sport_name || w.type || w.name || null, start_time: start, end_time: end,
      duration_seconds: int(w.duration_seconds) ?? (start && end ? Math.round((new Date(end).getTime() - new Date(start).getTime()) / 1000) : null),
      avg_heart_rate: int(w.avg_heart_rate), max_heart_rate: int(w.max_heart_rate),
      calories: num(w.calories), distance_m: num(w.distance_m ?? w.distance), raw_data: w,
    }
  }).filter((w: WorkoutRow) => w.start_time)

  try {
    await upsertDaily(sb, daily)
    await upsertWorkouts(sb, workouts)
    await markSynced(sb, conn.id)
  } catch (err) {
    console.error('wearable-ingest:', err)
    return new Response('Save failed: ' + String((err as Error)?.message || err), { status: 500, headers: cors })
  }
  return new Response(JSON.stringify({ ok: true, days: daily.length, workouts: workouts.length }), { headers: { ...cors, 'Content-Type': 'application/json' } })
})
