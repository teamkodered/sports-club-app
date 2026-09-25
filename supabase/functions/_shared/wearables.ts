// Shared wearable backend for Edge Functions.
// Every provider adapter (whoop, fitbit, ...) implements WearableProvider and
// writes through the helpers here, so wearable_connections / wearable_workouts
// / wearable_daily are the single place the app reads from.

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

export type Connection = {
  id: string
  student_id: string
  provider: string
  provider_user_id: string | null
  access_token: string | null
  refresh_token: string | null
  token_expires_at: string | null
  status: string
  last_sync_at: string | null
}

export type WorkoutRow = {
  student_id: string
  provider: string
  provider_workout_id: string
  sport_name?: string | null
  start_time?: string | null
  end_time?: string | null
  duration_seconds?: number | null
  strain?: number | null
  avg_heart_rate?: number | null
  max_heart_rate?: number | null
  calories?: number | null
  distance_m?: number | null
  zone_durations?: unknown
  raw_data?: unknown
}

export type DailyRow = {
  student_id: string
  provider: string
  day: string // YYYY-MM-DD
  steps?: number | null
  resting_heart_rate?: number | null
  hrv?: number | null
  sleep_seconds?: number | null
  sleep_score?: number | null
  recovery_score?: number | null
  active_calories?: number | null
  raw_data?: unknown
}

export type Tokens = { access_token: string; refresh_token: string; expires_in: number }

export interface WearableProvider {
  name: string
  // Get a fresh access token (refreshing + saving if expired)
  refresh(refreshToken: string): Promise<Tokens>
  // Pull everything since `since` for one connection
  sync(conn: Connection, accessToken: string, since: Date): Promise<{ workouts: WorkoutRow[]; daily: DailyRow[] }>
}

export function serviceClient(): SupabaseClient {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
}

export async function getConnection(sb: SupabaseClient, provider: string, providerUserId: string) {
  const { data } = await sb.from('wearable_connections').select('*')
    .eq('provider', provider).eq('provider_user_id', providerUserId).maybeSingle()
  return data as Connection | null
}

export async function saveConnection(sb: SupabaseClient, row: Partial<Connection> & { student_id: string; provider: string }) {
  return sb.from('wearable_connections')
    .upsert({ ...row, status: 'active', last_error: null, updated_at: new Date().toISOString() }, { onConflict: 'student_id,provider' })
}

// Returns a valid access token for the connection, refreshing it if needed
export async function ensureAccessToken(sb: SupabaseClient, provider: WearableProvider, conn: Connection): Promise<string> {
  const expired = !conn.token_expires_at || new Date(conn.token_expires_at) <= new Date(Date.now() + 60_000)
  if (!expired && conn.access_token) return conn.access_token
  if (!conn.refresh_token) throw new Error('No refresh token')
  const t = await provider.refresh(conn.refresh_token)
  await sb.from('wearable_connections').update({
    access_token: t.access_token, refresh_token: t.refresh_token,
    token_expires_at: new Date(Date.now() + t.expires_in * 1000).toISOString(),
    status: 'active', updated_at: new Date().toISOString(),
  }).eq('id', conn.id)
  return t.access_token
}

export async function upsertWorkouts(sb: SupabaseClient, rows: WorkoutRow[]) {
  if (!rows.length) return
  const { error } = await sb.from('wearable_workouts').upsert(rows.map(r => ({ ...r, synced_at: new Date().toISOString() })), { onConflict: 'provider,provider_workout_id' })
  if (error) throw new Error('wearable_workouts upsert: ' + error.message)
}

export async function upsertDaily(sb: SupabaseClient, rows: DailyRow[]) {
  if (!rows.length) return
  const { error } = await sb.from('wearable_daily').upsert(rows.map(r => ({ ...r, synced_at: new Date().toISOString() })), { onConflict: 'student_id,provider,day' })
  if (error) throw new Error('wearable_daily upsert: ' + error.message)
}

export async function markSynced(sb: SupabaseClient, connId: string) {
  await sb.from('wearable_connections').update({ last_sync_at: new Date().toISOString(), last_error: null, updated_at: new Date().toISOString() }).eq('id', connId)
}

export async function markError(sb: SupabaseClient, connId: string, err: unknown) {
  const msg = String((err as Error)?.message || err).slice(0, 500)
  const needsReauth = /401|invalid_grant|refresh/i.test(msg)
  await sb.from('wearable_connections').update({ last_error: msg, status: needsReauth ? 'needs_reauth' : 'active', updated_at: new Date().toISOString() }).eq('id', connId)
}
