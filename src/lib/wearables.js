import { supabase } from './supabase.js'

// Shared wearable layer for the app. Every provider is described here once;
// the rest of the app reads wearable_workouts / wearable_daily / connections
// without caring which device the data came from.
//
// To add a provider later: add an entry to PROVIDERS (with enabled: true once
// its edge functions exist) and an adapter in supabase/functions/_shared.

export const PROVIDERS = {
  whoop: {
    key: 'whoop', label: 'Whoop', icon: '⌚', colour: '#1D9E75', enabled: true,
    provides: ['workouts', 'strain', 'recovery', 'sleep', 'heart rate', 'body measurements'],
    blurb: 'Workout strain, heart rate, calories, plus daily strain, recovery, sleep and body measurements.',
    connectUrl: studentId => {
      const clientId = import.meta.env.VITE_WHOOP_CLIENT_ID
      const redirectUri = import.meta.env.VITE_WHOOP_REDIRECT_URI
      const scope = 'read:workout read:recovery read:sleep read:cycles read:body_measurement read:profile offline'
      return `https://api.prod.whoop.com/oauth/oauth2/auth?response_type=code&client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scope)}&state=${studentId}`
    },
  },
  fitbit:        { key: 'fitbit',        label: 'Fitbit',         icon: '⌚', colour: '#00B0B9', enabled: false, provides: ['steps', 'heart rate', 'sleep', 'workouts'] },
  garmin:        { key: 'garmin',        label: 'Garmin',         icon: '⌚', colour: '#007CC3', enabled: false, provides: ['steps', 'heart rate', 'sleep', 'workouts'] },
  oura:          { key: 'oura',          label: 'Oura',           icon: '💍', colour: '#7B61FF', enabled: false, provides: ['sleep', 'readiness', 'heart rate'] },
  apple_health:  { key: 'apple_health',  label: 'Apple Health',   icon: '🍎', colour: '#FF2D55', enabled: false, provides: ['steps', 'heart rate', 'sleep', 'workouts'] },
  samsung_health:{ key: 'samsung_health',label: 'Samsung Health', icon: '📱', colour: '#1428A0', enabled: false, provides: ['steps', 'heart rate', 'sleep', 'workouts'] },
}

export const enabledProviders = () => Object.values(PROVIDERS).filter(p => p.enabled)
export const providerLabel = key => PROVIDERS[key]?.label || key

// Connections (non-secret columns only, via the wearable_connections_public view)
export async function loadConnections(studentId) {
  const { data, error } = await supabase.from('wearable_connections_public').select('*').eq('student_id', studentId)
  if (error) { console.error('wearable connections:', error); return [] }
  return data || []
}

export async function disconnect(studentId, provider) {
  return supabase.from('wearable_connections').delete().eq('student_id', studentId).eq('provider', provider)
}

// Workouts, newest first, any provider unless one is given
export async function loadWorkouts(studentId, { provider, limit = 20 } = {}) {
  let q = supabase.from('wearable_workouts').select('*').eq('student_id', studentId).order('start_time', { ascending: false }).limit(limit)
  if (provider) q = q.eq('provider', provider)
  const { data, error } = await q
  if (error) { console.error('wearable workouts:', error); return [] }
  return data || []
}

// Daily summaries (steps / sleep / resting HR / recovery), newest first
export async function loadDaily(studentId, { provider, days = 30 } = {}) {
  const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10)
  let q = supabase.from('wearable_daily').select('*').eq('student_id', studentId).gte('day', since).order('day', { ascending: false })
  if (provider) q = q.eq('provider', provider)
  const { data, error } = await q
  if (error) { console.error('wearable daily:', error); return [] }
  return data || []
}

export const fmtSleep = secs => secs == null ? '—' : `${Math.floor(secs / 3600)}h ${Math.round((secs % 3600) / 60)}m`
