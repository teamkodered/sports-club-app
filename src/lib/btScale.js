// ⚖️ Bluetooth scales (Nov 2026): reads a weight from scales that use the standard Bluetooth
// "Weight Scale" service (0x181D) -- e.g. many smart scales that work with fitness apps.
// Chrome on Android / computers (and Bluefy on iPhone). Step on, tap Read, the weight fills in.
const remember = id => { try { localStorage.setItem('kc_bt_scale', id) } catch { /* ignore */ } }
async function known() {
  try {
    if (!navigator.bluetooth?.getDevices) return null
    const id = localStorage.getItem('kc_bt_scale')
    return (await navigator.bluetooth.getDevices()).find(d => d.id === id) || null
  } catch { return null }
}
export const scaleSupported = () => typeof navigator !== 'undefined' && !!navigator.bluetooth
// resolves with { kg } once the scale sends a settled reading (or rejects after ~40 s)
export async function readScale({ onStatus } = {}) {
  let dev = await known()
  if (!dev) dev = await navigator.bluetooth.requestDevice({ filters: [{ services: ['weight_scale'] }] })
  remember(dev.id)
  onStatus?.(`Connecting to ${dev.name || 'scales'}… step on now`)
  const server = await dev.gatt.connect()
  const ch = await (await server.getPrimaryService('weight_scale')).getCharacteristic('weight_measurement')
  return await new Promise((resolve, reject) => {
    const done = (fn, v) => { clearTimeout(t); try { ch.removeEventListener('characteristicvaluechanged', on); dev.gatt.disconnect() } catch { /* */ } fn(v) }
    const t = setTimeout(() => done(reject, new Error('No reading from the scales -- step on and try again')), 40000)
    function on(e) {
      const v = e.target.value, flags = v.getUint8(0), raw = v.getUint16(1, true)
      const kg = flags & 0x01 ? Math.round(raw * 0.01 * 0.453592 * 10) / 10 : Math.round(raw * 0.005 * 10) / 10
      if (kg > 5) done(resolve, { kg })
    }
    ch.addEventListener('characteristicvaluechanged', on)
    ch.startNotifications().then(() => onStatus?.('Waiting for a steady reading…')).catch(err => done(reject, err))
  })
}
