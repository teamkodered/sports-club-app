// Polar AccessLink adapter for the shared wearable backend (see wearables.ts).
// Docs: https://www.polar.com/accesslink-api/  -- written from training knowledge,
// not a live check: verify paths / response shapes there if anything stops working.
//
// Polar tokens don't expire in normal use and there is no refresh token, so
// refresh() just fails (the athlete reconnects if Polar ever revokes access).
// Sessions recorded with the H10 in Polar Flow / Polar Beat come through as exercises.

import type { Connection, Tokens, WearableProvider, WorkoutRow } from './wearables.ts'

const API = 'https://www.polaraccesslink.com/v3'
const TOKEN_URL = 'https://polarremote.com/v2/oauth2/token'

function creds() {
  // trim: stray spaces / newlines / quotes from pasting into PowerShell break the login
  const clean = (v: string | undefined) => (v || '').trim().replace(/^['"]|['"]$/g, '')
  return { clientId: clean(Deno.env.get('POLAR_CLIENT_ID')), clientSecret: clean(Deno.env.get('POLAR_CLIENT_SECRET')) }
}

export async function exchangePolarCode(code: string, redirectUri: string) {
  const { clientId, clientSecret } = creds()
  if (!clientId || !clientSecret) throw new Error('POLAR_CLIENT_ID / POLAR_CLIENT_SECRET not set on the server')
  // 1st try: credentials in the Authorization header (Polar's documented way)
  let res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { Authorization: 'Basic ' + btoa(`${clientId}:${clientSecret}`), 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json;charset=UTF-8' },
    body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri }),
  })
  // 2nd try: credentials in the body (some client setups only accept this)
  if (res.status === 401) {
    res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json;charset=UTF-8' },
      body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri, client_id: clientId, client_secret: clientSecret }),
    })
  }
  if (!res.ok) throw new Error(`Polar token exchange failed (${res.status}): ${await res.text()} [id ${clientId.slice(0, 6)}…, secret ${clientSecret.length} chars]`)
  return await res.json() as { access_token: string; token_type: string; expires_in?: number; x_user_id: number | string }
}

// Each Polar user has to be registered with our client once (409 = already registered)
export async function registerPolarUser(accessToken: string, memberId: string) {
  const res = await fetch(`${API}/users`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ 'member-id': memberId }),
  })
  if (!res.ok && res.status !== 409) throw new Error(`Polar user registration failed (${res.status}): ${await res.text()}`)
}

// ISO 8601 duration (PT1H2M3.5S) -> seconds
function isoSecs(d: string | null | undefined): number | null {
  if (!d) return null
  const m = /P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:([\d.]+)S)?/.exec(d)
  if (!m) return null
  return Math.round((+(m[1] || 0)) * 86400 + (+(m[2] || 0)) * 3600 + (+(m[3] || 0)) * 60 + (+(m[4] || 0)))
}

export function mapPolarExercise(studentId: string, e: any): WorkoutRow {
  const start = e.start_time ? new Date(e.start_time + (/[zZ]|[+-]\d\d:?\d\d$/.test(e.start_time) ? '' : 'Z')).toISOString() : null
  const secs = isoSecs(e.duration)
  return {
    student_id: studentId, provider: 'polar', provider_workout_id: String(e.id),
    sport_name: (e.detailed_sport_info || e.sport || 'Training').toString().replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c: string) => c.toUpperCase()),
    start_time: start, end_time: start && secs ? new Date(new Date(start).getTime() + secs * 1000).toISOString() : null,
    duration_seconds: secs, avg_heart_rate: e.heart_rate?.average ?? null, max_heart_rate: e.heart_rate?.maximum ?? null,
    calories: e.calories ?? null, distance_m: e.distance ?? null,
    zone_durations: e.heart_rate_zones ?? null, raw_data: e,
  }
}

export const polarProvider: WearableProvider = {
  name: 'polar',
  refresh: async (): Promise<Tokens> => { throw new Error('Polar access has ended -- reconnect Polar in Wearables') },
  async sync(conn: Connection, accessToken: string, since: Date) {
    // Exercises from the last 30 days (Polar keeps them available for that long)
    const res = await fetch(`${API}/exercises?zones=true`, { headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' } })
    if (res.status === 401 || res.status === 403) throw new Error('Polar access refused -- reconnect Polar in Wearables')
    if (!res.ok && res.status !== 204) throw new Error(`Polar exercises failed (${res.status}): ${await res.text()}`)
    const list = res.status === 204 ? [] : await res.json()
    const workouts = (Array.isArray(list) ? list : (list?.exercises || []))
      .map((e: any) => mapPolarExercise(conn.student_id, e))
      .filter((w: WorkoutRow) => !w.start_time || new Date(w.start_time) >= since)
    return { workouts, daily: [] }
  },
}
