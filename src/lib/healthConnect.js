import { INGEST_URL, getOrCreateLinkCode } from './wearables.js'

// Android Health Connect (Samsung Health, Google Fit / Fitbit, Garmin, Oura...)
// Only works inside the Klass Champ Android app, where the native
// HealthConnect plugin (android/.../HealthConnectPlugin.kt) is available.
// The plugin reads the data; this module sends it to wearable-ingest.

export const PROVIDER_KEY = 'samsung_health'
const CODE_KEY = 'kc_health_connect_link_code'
const LAST_SYNC_KEY = 'kc_health_connect_last_sync'

const cap = () => (typeof window !== 'undefined' ? window.Capacitor : undefined)
export const isAndroidApp = () => !!cap()?.isNativePlatform?.() && cap()?.getPlatform?.() === 'android'
const plugin = () => cap()?.Plugins?.HealthConnect

export async function isAvailable() {
  if (!isAndroidApp() || !plugin()) return { available: false, status: 'not_android_app' }
  try { return await plugin().isAvailable() } catch { return { available: false, status: 'unavailable' } }
}

export const hasPermissions = async () => { try { return (await plugin().hasPermissions()).granted } catch { return false } }
export const requestPermissions = async () => (await plugin().requestPermissions()).granted

export const savedLinkCode = () => { try { return localStorage.getItem(CODE_KEY) } catch { return null } }
export const lastSync = () => { try { return localStorage.getItem(LAST_SYNC_KEY) } catch { return null } }

// Link this phone to the athlete: permission prompt + link code, then first sync
export async function connect() {
  const granted = await requestPermissions()
  if (!granted) throw new Error('Health Connect permission was not granted')
  const code = await getOrCreateLinkCode(PROVIDER_KEY)
  try { localStorage.setItem(CODE_KEY, code) } catch { /* ignore */ }
  return sync({ days: 30 })
}

// Read from Health Connect and send to the server. Returns { days, workouts }.
export async function sync({ days = 14 } = {}) {
  const code = savedLinkCode() || await getOrCreateLinkCode(PROVIDER_KEY)
  const summary = await plugin().readSummary({ days })
  const res = await fetch(INGEST_URL, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: code, days: summary.days || [], workouts: summary.workouts || [] }),
  })
  if (!res.ok) throw new Error(`Send failed: ${res.status} ${await res.text()}`)
  try { localStorage.setItem(LAST_SYNC_KEY, new Date().toISOString()) } catch { /* ignore */ }
  return res.json()
}

// Called when the app opens: quietly sync if this phone is linked and it's
// been more than an hour. Never throws.
export async function autoSyncIfLinked() {
  if (!isAndroidApp() || !savedLinkCode()) return null
  const last = lastSync()
  if (last && Date.now() - new Date(last).getTime() < 60 * 60 * 1000) return null
  try {
    if (!await hasPermissions()) return null
    return await sync({ days: 7 })
  } catch (err) { console.warn('Health Connect auto-sync:', err); return null }
}

export function forget() { try { localStorage.removeItem(CODE_KEY); localStorage.removeItem(LAST_SYNC_KEY) } catch { /* ignore */ } }
