// Shared helpers for Whoop Edge Functions.
// Whoop API docs: https://developer.whoop.com/docs
// NOTE: verify these exact endpoint paths/response shapes against the
// current Whoop developer dashboard before relying on this in
// production -- API surfaces can change, and this was written from
// training knowledge (cutoff ~Jan 2026), not a live check.

const WHOOP_API_BASE = 'https://api.prod.whoop.com/developer'
const WHOOP_OAUTH_TOKEN_URL = 'https://api.prod.whoop.com/oauth/oauth2/token'

export async function refreshWhoopToken(refreshToken: string, clientId: string, clientSecret: string) {
  const res = await fetch(WHOOP_OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  })
  if (!res.ok) throw new Error(`Whoop token refresh failed: ${res.status} ${await res.text()}`)
  return res.json() // { access_token, refresh_token, expires_in, ... }
}

export async function exchangeWhoopCode(code: string, redirectUri: string, clientId: string, clientSecret: string) {
  const res = await fetch(WHOOP_OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  })
  if (!res.ok) throw new Error(`Whoop code exchange failed: ${res.status} ${await res.text()}`)
  return res.json() // { access_token, refresh_token, expires_in, ... }
}

export async function fetchWhoopWorkout(workoutId: string, accessToken: string) {
  const res = await fetch(`${WHOOP_API_BASE}/v1/activity/workout/${workoutId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) throw new Error(`Whoop workout fetch failed: ${res.status} ${await res.text()}`)
  return res.json()
}

export async function fetchWhoopUserProfile(accessToken: string) {
  const res = await fetch(`${WHOOP_API_BASE}/v1/user/profile/basic`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) throw new Error(`Whoop profile fetch failed: ${res.status} ${await res.text()}`)
  return res.json()
}

// Maps Whoop's workout response shape onto our whoop_sessions columns.
// Whoop reports zone durations in milliseconds, keyed zero_milli
// through five_milli in the score.zone_durations object -- adjust
// this mapping if the actual response shape differs.
export function mapWhoopWorkoutToSession(studentId: string, workout: any) {
  const score = workout.score || {}
  return {
    student_id: studentId,
    whoop_workout_id: String(workout.id),
    sport_name: workout.sport_name || null,
    start_time: workout.start || null,
    end_time: workout.end || null,
    strain: score.strain ?? null,
    avg_heart_rate: score.average_heart_rate ?? null,
    max_heart_rate: score.max_heart_rate ?? null,
    calories: score.kilojoule != null ? Math.round(score.kilojoule / 4.184) : null, // kJ -> kcal
    zone_durations: score.zone_durations ?? null,
    raw_data: workout,
  }
}
