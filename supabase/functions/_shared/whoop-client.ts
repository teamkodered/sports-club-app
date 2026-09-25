// Whoop adapter for the shared wearable backend (see wearables.ts).
// Whoop API docs: https://developer.whoop.com/docs
// Uses the v2 API. Verify paths/response shapes against the current docs if
// anything stops working -- written from training knowledge, not a live check.

import type { Connection, DailyRow, Tokens, WearableProvider, WorkoutRow } from './wearables.ts'

const WHOOP_API_BASE = 'https://api.prod.whoop.com/developer'
const WHOOP_OAUTH_TOKEN_URL = 'https://api.prod.whoop.com/oauth/oauth2/token'

function creds() {
  return { clientId: Deno.env.get('WHOOP_CLIENT_ID')!, clientSecret: Deno.env.get('WHOOP_CLIENT_SECRET')! }
}

async function tokenRequest(params: Record<string, string>): Promise<Tokens> {
  const res = await fetch(WHOOP_OAUTH_TOKEN_URL, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params),
  })
  if (!res.ok) throw new Error(`Whoop token request failed: ${res.status} ${await res.text()}`)
  return res.json()
}

export function refreshWhoopToken(refreshToken: string, clientId = creds().clientId, clientSecret = creds().clientSecret) {
  return tokenRequest({ grant_type: 'refresh_token', refresh_token: refreshToken, client_id: clientId, client_secret: clientSecret, scope: 'offline' })
}

export function exchangeWhoopCode(code: string, redirectUri: string, clientId = creds().clientId, clientSecret = creds().clientSecret) {
  return tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: redirectUri, client_id: clientId, client_secret: clientSecret })
}

async function whoopGet(path: string, accessToken: string) {
  const res = await fetch(`${WHOOP_API_BASE}${path}`, { headers: { Authorization: `Bearer ${accessToken}` } })
  if (!res.ok) throw new Error(`Whoop ${path} failed: ${res.status} ${await res.text()}`)
  return res.json()
}

// Follows next_token paging on Whoop's collection endpoints
async function whoopList(path: string, accessToken: string, since: Date, maxPages = 10) {
  const records: any[] = []
  let nextToken: string | undefined
  for (let i = 0; i < maxPages; i++) {
    const q = new URLSearchParams({ start: since.toISOString(), limit: '25' })
    if (nextToken) q.set('nextToken', nextToken)
    const data = await whoopGet(`${path}?${q}`, accessToken)
    records.push(...(data.records || []))
    nextToken = data.next_token
    if (!nextToken) break
  }
  return records
}

export const fetchWhoopWorkout = (workoutId: string, accessToken: string) => whoopGet(`/v2/activity/workout/${workoutId}`, accessToken)
export const fetchWhoopUserProfile = (accessToken: string) => whoopGet('/v2/user/profile/basic', accessToken)

const kjToKcal = (kj: number | null | undefined) => kj != null ? Math.round(kj / 4.184) : null
const dayOf = (iso: string | null | undefined) => iso ? iso.slice(0, 10) : null

export function mapWhoopWorkout(studentId: string, w: any): WorkoutRow {
  const score = w.score || {}
  const start = w.start || null, end = w.end || null
  return {
    student_id: studentId, provider: 'whoop', provider_workout_id: String(w.id),
    sport_name: w.sport_name || null, start_time: start, end_time: end,
    duration_seconds: start && end ? Math.round((new Date(end).getTime() - new Date(start).getTime()) / 1000) : null,
    strain: score.strain ?? null, avg_heart_rate: score.average_heart_rate ?? null, max_heart_rate: score.max_heart_rate ?? null,
    calories: kjToKcal(score.kilojoule), distance_m: score.distance_meter ?? null,
    zone_durations: score.zone_durations ?? null, raw_data: w,
  }
}

// Kept for anything still importing the old name
export const mapWhoopWorkoutToSession = mapWhoopWorkout

export const whoopProvider: WearableProvider = {
  name: 'whoop',
  refresh: (rt) => refreshWhoopToken(rt),
  async sync(conn: Connection, accessToken: string, since: Date) {
    const [workouts, recoveries, sleeps, cycles, body] = await Promise.all([
      whoopList('/v2/activity/workout', accessToken, since),
      whoopList('/v2/recovery', accessToken, since).catch(e => { console.warn('whoop recovery:', e.message); return [] }),
      whoopList('/v2/activity/sleep', accessToken, since).catch(e => { console.warn('whoop sleep:', e.message); return [] }),
      whoopList('/v2/cycle', accessToken, since).catch(e => { console.warn('whoop cycle:', e.message); return [] }),
      whoopGet('/v2/user/measurement/body', accessToken).catch(e => { console.warn('whoop body:', e.message); return null }),
    ])
    const daily = new Map<string, DailyRow>()
    const dayRow = (day: string) => {
      if (!daily.has(day)) daily.set(day, { student_id: conn.student_id, provider: 'whoop', day, raw_data: {} })
      return daily.get(day)!
    }
    for (const r of recoveries) {
      const day = dayOf(r.created_at || r.updated_at); if (!day) continue
      const s = r.score || {}
      const row = dayRow(day)
      row.recovery_score = s.recovery_score ?? row.recovery_score ?? null
      row.resting_heart_rate = s.resting_heart_rate ?? row.resting_heart_rate ?? null
      row.hrv = s.hrv_rmssd_milli ?? row.hrv ?? null
      ;(row.raw_data as any).recovery = r
    }
    for (const s of sleeps) {
      if (s.nap) continue
      const day = dayOf(s.end || s.start); if (!day) continue
      const sc = s.score || {}
      const stages = sc.stage_summary || {}
      const asleepMs = (stages.total_light_sleep_time_milli || 0) + (stages.total_slow_wave_sleep_time_milli || 0) + (stages.total_rem_sleep_time_milli || 0)
      const row = dayRow(day)
      row.sleep_seconds = asleepMs ? Math.round(asleepMs / 1000) : (s.start && s.end ? Math.round((new Date(s.end).getTime() - new Date(s.start).getTime()) / 1000) : null)
      row.sleep_score = sc.sleep_performance_percentage ?? null
      ;(row.raw_data as any).sleep = s
    }
    // Cycles = Whoop's physiological day: whole-day strain, calories, heart rate
    for (const c of cycles) {
      const day = dayOf(c.start); if (!day) continue
      const sc = c.score || {}
      const row = dayRow(day)
      row.day_strain = sc.strain ?? null
      row.active_calories = kjToKcal(sc.kilojoule)
      row.avg_heart_rate = sc.average_heart_rate ?? null
      row.max_heart_rate = sc.max_heart_rate ?? null
      ;(row.raw_data as any).cycle = c
    }
    // Body measurements (height / weight / max HR) live on the connection
    const bodyData = body ? {
      height_cm: body.height_meter != null ? Math.round(body.height_meter * 100) : null,
      weight_kg: body.weight_kilogram ?? null,
      max_heart_rate: body.max_heart_rate ?? null,
      updated_at: new Date().toISOString(),
    } : undefined
    return { workouts: workouts.map(w => mapWhoopWorkout(conn.student_id, w)), daily: [...daily.values()], bodyData }
  },
}

export const PROVIDERS: Record<string, WearableProvider> = { whoop: whoopProvider }
