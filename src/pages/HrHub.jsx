import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { zoneOf } from '../lib/liveHr.js'

// ❤️ Gym heart rate hub (coach, Chrome on Android / a computer): one device connects to several
// athletes' straps at once -- Whoop (Heart Rate Broadcast on) or Polar H10 -- and sends each
// to the live board, so athletes with iPhones still show up live. Stopping saves each session.
const ageMax = dob => { if (!dob) return 190; const b = new Date(dob), n = new Date(); let a = n.getFullYear() - b.getFullYear(); if (n < new Date(n.getFullYear(), b.getMonth(), b.getDate())) a--; return Math.max(150, 220 - a) }

export default function HrHub() {
  const [athletes, setAthletes] = useState([])
  const [straps, setStraps] = useState([])          // [{ key, name, studentId, bpm, status }]
  const [pickFor, setPickFor] = useState(null)      // strap key waiting for an athlete
  const [q, setQ] = useState('')
  const refs = useRef({})                            // key -> { device, samples: [{t,bpm}], studentId, maxHr, last }
  const supported = typeof navigator !== 'undefined' && !!navigator.bluetooth

  useEffect(() => {
    supabase.from('students').select('id, is_kr, discipline, members!inner(first_name, last_name, date_of_birth, status)')
      .or('is_kr.eq.true,discipline.eq.KRBA,is_pts.eq.true')
      .then(({ data }) => setAthletes((data || []).filter(s => !['stopped', 'not_started'].includes(s.members?.status))
        .sort((a, b) => `${a.members.first_name} ${a.members.last_name}`.localeCompare(`${b.members.first_name} ${b.members.last_name}`))), () => {})
  }, [])
  const nameOf = id => { const s = athletes.find(a => a.id === id); return s ? `${s.members.first_name} ${s.members.last_name}` : '' }
  const set = (key, patch) => setStraps(list => list.map(x => x.key === key ? { ...x, ...patch } : x))

  async function addStrap() {
    try {
      const device = await navigator.bluetooth.requestDevice({ filters: [{ services: ['heart_rate'] }] })
      const key = `${device.id || device.name}_${Date.now()}`
      refs.current[key] = { device, samples: [], studentId: null, maxHr: 190, last: 0 }
      setStraps(list => [...list, { key, name: device.name || 'Heart rate strap', studentId: null, bpm: null, status: 'connecting' }])
      const connect = async () => {
        const server = await device.gatt.connect()
        const ch = await (await server.getPrimaryService('heart_rate')).getCharacteristic('heart_rate_measurement')
        ch.addEventListener('characteristicvaluechanged', e => {
          const v = e.target.value, hr = (v.getUint8(0) & 0x01) ? v.getUint16(1, true) : v.getUint8(1)
          if (!hr) return
          const r = refs.current[key]; if (!r) return
          set(key, { bpm: hr, status: 'live' })
          if (!r.studentId) return
          r.samples.push({ t: Date.now(), bpm: hr })
          if (Date.now() - r.last > 3000) {   // share to the live board every few seconds
            r.last = Date.now()
            supabase.from('live_hr').upsert({ student_id: r.studentId, bpm: hr, max_hr: r.maxHr, device: `${device.name || 'Strap'} (gym hub)`, session_started_at: new Date(r.samples[0]?.t || Date.now()).toISOString(), updated_at: new Date().toISOString() }, { onConflict: 'student_id' }).then(() => {}, () => {})
          }
        })
        await ch.startNotifications()
      }
      device.addEventListener('gattserverdisconnected', () => { set(key, { status: 'reconnecting' }); setTimeout(() => connect().catch(() => set(key, { status: 'lost' })), 1500) })
      await connect()
      setPickFor(key)
    } catch (e) { if (!/cancel/i.test(e?.message || '')) alert('Could not connect: ' + (e?.message || e)) }
  }
  function assign(key, s) {
    const r = refs.current[key]; if (!r) return
    r.studentId = s.id; r.maxHr = ageMax(s.members?.date_of_birth); r.samples = []
    set(key, { studentId: s.id }); setPickFor(null); setQ('')
  }
  async function stopStrap(key) {
    const r = refs.current[key]; if (!r) return
    try { r.device.gatt.disconnect() } catch { /* */ }
    delete refs.current[key]
    setStraps(list => list.filter(x => x.key !== key))
    if (!r.studentId) return
    supabase.from('live_hr').delete().eq('student_id', r.studentId).then(() => {}, () => {})
    const list = r.samples
    if (list.length < 5) return
    const minutes = Math.max(1, Math.round((list[list.length - 1].t - list[0].t) / 60000))
    const avg = Math.round(list.reduce((n, x) => n + x.bpm, 0) / list.length), max = Math.max(...list.map(x => x.bpm))
    const zones = {}
    for (let i = 1; i < list.length; i++) { const z = zoneOf(list[i - 1].bpm, r.maxHr); if (z) zones[`z${z.n}`] = (zones[`z${z.n}`] || 0) + (list[i].t - list[i - 1].t) / 1000 }
    const zoneMins = Object.fromEntries(Object.entries(zones).map(([k, sec]) => [k, Math.round(sec / 60)]))
    await supabase.from('hr_sessions').insert({ student_id: r.studentId, session_date: new Date(list[0].t).toISOString().split('T')[0], minutes, avg_hr: avg, max_hr: max,
      avg_pct: Math.round(avg * 100 / r.maxHr), max_pct: Math.round(max * 100 / r.maxHr), zones: zoneMins, device: `${r.device.name || 'Strap'} (gym hub)` }).then(() => {}, () => {})
  }
  useEffect(() => () => { Object.keys(refs.current).forEach(k => { try { refs.current[k].device.gatt.disconnect() } catch { /* */ } }) }, [])

  const shown = athletes.filter(a => !q || `${a.members.first_name} ${a.members.last_name}`.toLowerCase().includes(q.toLowerCase()))
  return (
    <div style={{ maxWidth: 640, margin: '0 auto' }}>
      <div className="page-header"><h1>❤️ Gym heart rate hub</h1><p>This device connects to several athletes' straps and puts them on the live board -- for athletes on iPhones too.</p></div>
      {!supported ? (
        <div className="card"><p style={{ margin: 0 }}>Open this page in <b>Chrome on an Android phone / tablet</b> (or a computer) -- Bluetooth isn't available in this browser.</p></div>
      ) : (
        <>
          <div className="card" style={{ marginBottom: 12, fontSize: 13, color: 'var(--text-secondary)' }}>
            <b>Each athlete:</b> Whoop -- in the Whoop app tap <b>More (•••) → Device settings → Heart Rate Broadcast</b> on. Polar H10 -- wet the sensors and put it on. Their own phone must <b>not</b> be connected to the strap.
          </div>
          <button type="button" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', marginBottom: 12 }} onClick={addStrap}>＋ Add a strap</button>
          {straps.length === 0 && <p style={{ textAlign: 'center', color: 'var(--text-tertiary)' }}>No straps connected yet.</p>}
          {straps.map(x => {
            const z = x.bpm && x.studentId ? zoneOf(x.bpm, refs.current[x.key]?.maxHr || 190) : null
            return (
              <div key={x.key} className="card" style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, borderLeft: `4px solid ${z?.colour || '#666'}` }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700 }}>{x.studentId ? nameOf(x.studentId) : <span style={{ color: '#EF9F27' }}>Whose strap?</span>}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{x.name} · {x.status}</div>
                </div>
                <span style={{ fontFamily: 'Orbitron, sans-serif', fontSize: 22, fontWeight: 800, color: z?.colour || 'var(--text)' }}>{x.bpm || '--'}</span>
                <button type="button" className="btn btn-sm" onClick={() => setPickFor(x.key)}>{x.studentId ? 'Change' : 'Pick'}</button>
                <button type="button" className="btn btn-sm" onClick={() => stopStrap(x.key)}>⏹ Stop</button>
              </div>
            )
          })}
          {pickFor && (
            <div className="card" style={{ marginTop: 8 }}>
              <b style={{ fontSize: 14 }}>Whose strap is this?</b>
              <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search…" style={{ width: '100%', margin: '8px 0' }} />
              <div style={{ maxHeight: 280, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
                {shown.map(s => <button key={s.id} type="button" className="btn btn-sm" style={{ justifyContent: 'flex-start' }} disabled={straps.some(x => x.studentId === s.id)} onClick={() => assign(pickFor, s)}>{s.members.first_name} {s.members.last_name}</button>)}
              </div>
              <button type="button" className="btn btn-sm" style={{ marginTop: 8 }} onClick={() => setPickFor(null)}>Cancel</button>
            </div>
          )}
          <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 12 }}>Keep this page open and the screen on during the session. ⏹ Stop saves each athlete's heart rate session to their Wearables.</p>
        </>
      )}
    </div>
  )
}
