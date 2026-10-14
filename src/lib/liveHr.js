import { useEffect, useRef, useState } from 'react'
import { supabase } from './supabase.js'

// Live heart rate from a Bluetooth strap in the web app (Whoop with Heart Rate
// Broadcast on, Polar H10, any standard HR strap) -- one connection for the whole
// athlete app so it can be started from check-in and keeps going across tabs.
// While recording, the bpm is shared to live_hr every few seconds (live table for
// coaches / the League board); stopping saves an hr_sessions summary.

export const HR_ZONES = [
  { n: 1, label: 'Very light', from: 0.5, colour: '#9A9A9A' },
  { n: 2, label: 'Light', from: 0.6, colour: '#378ADD' },
  { n: 3, label: 'Moderate', from: 0.7, colour: '#1D9E75' },
  { n: 4, label: 'Hard', from: 0.8, colour: '#EF9F27' },
  { n: 5, label: 'Maximum', from: 0.9, colour: '#E24B4A' },
]
export const zoneOf = (bpm, max) => { const r = bpm / max; let z = null; for (const zz of HR_ZONES) if (r >= zz.from) z = zz; return z }
export const bluetoothSupported = () => typeof navigator !== 'undefined' && !!navigator.bluetooth

export function useLiveHeartRate({ studentId, maxHr = 190 }) {
  const [device, setDevice] = useState(null)
  const [bpm, setBpm] = useState(null)
  const [status, setStatus] = useState('')
  const [recording, setRecording] = useState(false)
  const [startedAt, setStartedAt] = useState(null)
  const samples = useRef([])
  const recRef = useRef(false)
  const meta = useRef({ classId: null, attendanceId: null })
  const lastPush = useRef(0)

  function onValue(e) {
    const v = e.target.value
    const flags = v.getUint8(0)
    const hr = (flags & 0x01) ? v.getUint16(1, true) : v.getUint8(1)
    if (!hr) return
    setBpm(hr)
    if (recRef.current) {
      samples.current.push({ t: Date.now(), bpm: hr })
      if (studentId && Date.now() - lastPush.current > 4000) {
        lastPush.current = Date.now()
        supabase.from('live_hr').upsert({ student_id: studentId, bpm: hr, max_hr: maxHr, class_id: meta.current.classId, device: device?.name || null, session_started_at: new Date(samples.current[0]?.t || Date.now()).toISOString(), updated_at: new Date().toISOString() }, { onConflict: 'student_id' }).then(() => {}, () => {})
      }
    }
  }
  async function attach(dev, quiet = false) {
    try {
      setStatus(quiet ? `Reconnecting to ${dev.name || 'your strap'}…` : 'Connecting…')
      dev.addEventListener('gattserverdisconnected', () => { setStatus('Disconnected -- tap Connect to reconnect'); setBpm(null) })
      const server = await dev.gatt.connect()
      const ch = await (await server.getPrimaryService('heart_rate')).getCharacteristic('heart_rate_measurement')
      await ch.startNotifications()
      ch.addEventListener('characteristicvaluechanged', onValue)
      setDevice(dev); setStatus(`Connected to ${dev.name || 'heart rate strap'}`)
      try { localStorage.setItem('kc_hr_strap', dev.id) } catch { /* ignore */ }
      return true
    } catch (e) {
      setStatus(quiet ? `Tap Connect to use ${dev.name || 'your strap'}` : 'Could not connect: ' + (e?.message || e))
      return false
    }
  }
  async function remembered() {
    try {
      if (!navigator.bluetooth?.getDevices) return null
      const list = await navigator.bluetooth.getDevices()
      const id = localStorage.getItem('kc_hr_strap')
      return list.find(d => d.id === id) || list[0] || null
    } catch { return null }
  }
  // Connect: known strap straight away, otherwise the phone's picker (needs a tap)
  async function connect() {
    if (!bluetoothSupported()) { setStatus('Live heart rate needs Chrome on Android (or a computer)'); return false }
    if (device?.gatt?.connected) return true
    const known = await remembered()
    if (known && await attach(known)) return true
    try {
      setStatus('Choose your strap…')
      const dev = await navigator.bluetooth.requestDevice({ filters: [{ services: ['heart_rate'] }] })
      return await attach(dev)
    } catch (e) { setStatus(e?.name === 'NotFoundError' ? '' : 'Could not connect: ' + (e?.message || e)); return false }
  }
  // quietly reconnect to the strap used last time
  useEffect(() => {
    if (!bluetoothSupported()) return
    let stop = false
    ;(async () => { const k = await remembered(); if (k && !stop) await attach(k, true) })()
    return () => { stop = true }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function start({ classId = null, attendanceId = null } = {}) {
    meta.current = { classId, attendanceId }
    samples.current = []; recRef.current = true; setRecording(true); setStartedAt(Date.now())
  }
  // Stop: summary (minutes, avg, max, zones) + hr_sessions row; live row removed
  async function stop() {
    recRef.current = false; setRecording(false)
    if (studentId) supabase.from('live_hr').delete().eq('student_id', studentId).then(() => {}, () => {})
    const list = samples.current
    if (list.length < 5) return null
    const minutes = Math.max(1, Math.round((list[list.length - 1].t - list[0].t) / 60000))
    const avg = Math.round(list.reduce((n, s) => n + s.bpm, 0) / list.length)
    const max = Math.max(...list.map(s => s.bpm))
    const zones = {}
    for (let i = 1; i < list.length; i++) { const z = zoneOf(list[i - 1].bpm, maxHr); if (z) zones[`z${z.n}`] = (zones[`z${z.n}`] || 0) + (list[i].t - list[i - 1].t) / 1000 }
    const zoneMins = Object.fromEntries(Object.entries(zones).map(([k, sec]) => [k, Math.round(sec / 60)]))
    const summary = { minutes, avg, max, zones: zoneMins, maxHr, device: device?.name || 'Heart rate strap' }
    if (studentId) await supabase.from('hr_sessions').insert({
      student_id: studentId, session_date: new Date(list[0].t).toISOString().split('T')[0], class_id: meta.current.classId, attendance_id: meta.current.attendanceId,
      minutes, avg_hr: avg, max_hr: max, avg_pct: Math.round(avg * 100 / maxHr), max_pct: Math.round(max * 100 / maxHr), zones: zoneMins, device: summary.device,
    }).then(() => {}, () => {})
    return summary
  }
  function disconnect() { try { device?.gatt?.disconnect() } catch { /* */ } setDevice(null); setBpm(null) }
  return { supported: bluetoothSupported(), device, connected: !!device, bpm, status, recording, startedAt, maxHr, connect, start, stop, disconnect }
}
