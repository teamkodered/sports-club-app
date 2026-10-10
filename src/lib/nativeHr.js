// Background heart rate in the Klass Champ Android app (native HeartRate plugin,
// android/.../HeartRatePlugin.kt + HrRecorderService.kt). In the browser none of
// this exists and isNativeHr() is false -- the web Bluetooth reader is used instead.

const cap = () => (typeof window !== 'undefined' ? window.Capacitor : undefined)
const plugin = () => cap()?.Plugins?.HeartRate
export const isNativeHr = () => !!cap()?.isNativePlatform?.() && !!plugin()

const STRAP_KEY = 'kc_native_hr_strap'     // { address, name }
const AUTO_KEY = 'kc_native_hr_auto'       // '1' = record automatically at class check-in
export const savedStrap = () => { try { return JSON.parse(localStorage.getItem(STRAP_KEY) || 'null') } catch { return null } }
export const saveStrap = s => { try { s ? localStorage.setItem(STRAP_KEY, JSON.stringify(s)) : localStorage.removeItem(STRAP_KEY) } catch { /* ignore */ } }
export const autoRecord = () => { try { return localStorage.getItem(AUTO_KEY) !== '0' } catch { return true } }
export const setAutoRecord = on => { try { localStorage.setItem(AUTO_KEY, on ? '1' : '0') } catch { /* ignore */ } }

export async function requestPermissions() { return (await plugin().requestPermissions()).granted }
export async function scan(seconds = 6) {
  if (!(await requestPermissions())) throw new Error('Bluetooth permission was not given')
  return (await plugin().scan({ seconds })).devices || []
}
export async function status() { try { return await plugin().status() } catch { return { recording: false } } }
export async function start(maxMinutes = 120) {
  const strap = savedStrap(); if (!strap) return false
  if (!(await requestPermissions())) return false
  await plugin().start({ address: strap.address, maxMinutes }); return true
}
export async function stop(maxHr = 190) { return await plugin().stop({ maxHr }) }
export function onBpm(cb) { const h = plugin()?.addListener?.('hr', e => cb(e.bpm)); return () => { try { h?.then ? h.then(x => x.remove()) : h?.remove?.() } catch { /* ignore */ } } }
