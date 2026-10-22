import { useEffect, useRef, useState } from 'react'
import * as NHR from '../../lib/nativeHr.js'

// Live heart rate from a Bluetooth chest strap (Polar H10 or any strap using the
// standard Bluetooth heart rate signal). Chrome on Android / desktop only -- iPhone
// browsers don't allow Bluetooth. Shows live bpm + zone, records the session, and
// on Stop can save a summary (time, average, max, time in zones) to today's log.

const ZONES = [
  { n: 1, label: 'Very light', from: 0.5, colour: '#9A9A9A' },
  { n: 2, label: 'Light', from: 0.6, colour: '#378ADD' },
  { n: 3, label: 'Moderate', from: 0.7, colour: '#1D9E75' },
  { n: 4, label: 'Hard', from: 0.8, colour: '#EF9F27' },
  { n: 5, label: 'Maximum', from: 0.9, colour: '#E24B4A' },
]
const zoneOf = (bpm, max) => { const r = bpm / max; let z = null; for (const zz of ZONES) if (r >= zz.from) z = zz; return z }
const mmss = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

export default function LiveHeartRate(props) {
  if (NHR.isNativeHr()) return <NativeHeartRate {...props} />
  return <WebHeartRate {...props} />
}

// Android app: pick the strap once; recording runs in the background (phone locked),
// automatically from class check-in to check-out, or with Start / Stop here.
function NativeHeartRate({ age, onSave }) {
  const maxHr = Math.max(150, 220 - (Number(age) || 30))
  const [strap, setStrap] = useState(NHR.savedStrap())
  const [auto, setAuto] = useState(NHR.autoRecord())
  const [found, setFound] = useState(null)
  const [busy, setBusy] = useState('')
  const [st, setSt] = useState({ recording: false })
  const [bpm, setBpm] = useState(null)
  useEffect(() => {
    const off = NHR.onBpm(setBpm)
    const t = setInterval(async () => setSt(await NHR.status()), 3000)
    NHR.status().then(setSt)
    return () => { off(); clearInterval(t) }
  }, [])
  const z = bpm ? zoneOf(bpm, maxHr) : null
  async function find() { setBusy('Looking for straps…'); try { setFound(await NHR.scan(6)) } catch (e) { alert(e.message) } finally { setBusy('') } }
  async function stopSave() {
    const s = await NHR.stop(maxHr); setSt({ recording: false })
    if ((s.samples || 0) < 5) { alert('Not enough heart rate data recorded to save.'); return }
    await onSave?.({ minutes: s.minutes, avg: s.avg, max: s.max, zones: s.zones, maxHr, device: strap?.name || 'Heart rate strap' })
  }
  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <h3 style={{ fontSize: 15, fontWeight: 700 }}>❤️ Heart rate (background)</h3>
        <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Polar H10 · Whoop · any HR strap</span>
      </div>
      {!strap ? (
        <>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 4px' }}>Put the strap on, then find it -- you only do this once.</p>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 4px' }}><b>Whoop:</b> In the Whoop app: tap <b>More</b> (•••) → <b>Device settings</b> → turn on <b>Heart Rate Broadcast</b>, then connect here.</p>
          <p style={{ fontSize: 11, color: 'var(--text-tertiary)', margin: '0 0 8px' }}>✓ Once connected, it reconnects and starts recording automatically each time you check in to a session.</p>
          <button type="button" className="btn btn-primary" disabled={!!busy} onClick={find}>{busy || 'Find my strap'}</button>
          {found && (found.length === 0 ? <p style={{ fontSize: 12, marginTop: 8 }}>No straps found -- check it's on and close by, then try again.</p> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
              {found.map(d => <button key={d.address} type="button" className="btn" onClick={() => { NHR.saveStrap(d); setStrap(d); setFound(null) }}>Use {d.name}</button>)}
            </div>
          ))}
        </>
      ) : (
        <>
          <div style={{ fontSize: 13, marginBottom: 8 }}>Strap: <b>{strap.name}</b> <button type="button" className="btn btn-sm" style={{ marginLeft: 6 }} onClick={() => { NHR.saveStrap(null); setStrap(null) }}>Change</button></div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginBottom: 10 }}>
            <input type="checkbox" checked={auto} onChange={e => { setAuto(e.target.checked); NHR.setAutoRecord(e.target.checked) }} /> Record automatically from class check-in to check-out
          </label>
          {st.recording ? (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, margin: '4px 0 10px' }}>
                <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: 40, fontWeight: 800, color: z?.colour || 'var(--text)' }}>{bpm ?? st.bpm ?? '--'}</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{st.connected ? <>bpm{z && <><br /><b style={{ color: z.colour }}>Zone {z.n} · {z.label}</b></>}</> : 'Connecting to the strap…'}<br />⏺ recording {st.startedAt ? mmss(Math.round((Date.now() - st.startedAt) / 1000)) : ''}</div>
              </div>
              <button type="button" className="btn" style={{ borderColor: '#E24B4A', color: '#E24B4A' }} onClick={stopSave}>■ Stop & save</button>
            </>
          ) : (
            <button type="button" className="btn btn-primary" onClick={async () => { if (await NHR.start(120)) setSt({ recording: true }) }}>⏺ Start recording now</button>
          )}
          <p style={{ fontSize: 11, color: 'var(--text-tertiary)', margin: '8px 0 0' }}>Keeps recording with the phone locked (a "Klass Champ — class session" notification shows). Stops by itself after 2 hours.</p>
        </>
      )}
    </div>
  )
}

// Web app: uses the shared connection from the athlete app (live = useLiveHeartRate),
// so check-in can start it and it keeps going when you switch tabs.
function WebHeartRate({ live, onSave }) {
  const [, tick] = useState(0)
  const recording = !!live?.recording
  useEffect(() => { if (!recording) return; const t = setInterval(() => tick(x => x + 1), 1000); return () => clearInterval(t) }, [recording])
  if (!live) return null
  const { supported, connected, bpm, status, startedAt, maxHr } = live
  const z = bpm ? zoneOf(bpm, maxHr) : null
  const elapsed = recording && startedAt ? Math.round((Date.now() - startedAt) / 1000) : 0
  async function stopSave() {
    const s = await live.stop()
    if (!s) { alert('Not enough heart rate data recorded to save.'); return }
    if (confirm(`Save this heart rate session?\n${s.minutes} min · average ${s.avg} bpm · max ${s.max} bpm`)) await onSave?.(s)
  }
  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <h3 style={{ fontSize: 15, fontWeight: 700 }}>❤️ Live heart rate</h3>
        <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Polar H10 · Whoop · any Bluetooth HR strap</span>
      </div>
      {!supported ? (
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>Live heart rate needs <b>Chrome on Android</b> (or a computer). iPhone browsers don't allow Bluetooth -- use the Polar / Whoop account sync instead.</p>
      ) : !connected ? (
        <>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 6px' }}><b>Polar H10:</b> put the strap on (wet the sensors), then connect.</p>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 4px' }}><b>Whoop:</b> In the Whoop app: tap <b>More</b> (•••) → <b>Device settings</b> → turn on <b>Heart Rate Broadcast</b>, then connect here.</p>
          <p style={{ fontSize: 11, color: 'var(--text-tertiary)', margin: '0 0 8px' }}>✓ Once connected, it reconnects and starts recording automatically each time you check in to a session.</p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-primary" onClick={() => live.connect()}>Connect strap</button>
            <button type="button" className="btn" onClick={() => live.connect(true)} title="Lists every nearby Bluetooth device">Can't see it? Show all devices</button>
          </div>
        </>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, margin: '6px 0 10px' }}>
            <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: 44, fontWeight: 800, color: z?.colour || 'var(--text)' }}>{bpm ?? '--'}</div>
            <div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>bpm</div>
              {z && <div style={{ fontSize: 13, fontWeight: 700, color: z.colour }}>Zone {z.n} · {z.label}</div>}
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{bpm ? `${Math.round(bpm / maxHr * 100)}% of max (${maxHr})` : ''}</div>
            </div>
            {recording && <div style={{ marginLeft: 'auto', fontFamily: 'Orbitron, sans-serif', fontSize: 18 }}>⏺ {mmss(elapsed)}</div>}
          </div>
          <div style={{ display: 'flex', gap: 4, height: 8, marginBottom: 10 }}>
            {ZONES.map(zz => <div key={zz.n} style={{ flex: 1, borderRadius: 4, background: zz.colour, opacity: z?.n === zz.n ? 1 : 0.25 }} />)}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {!recording ? <button type="button" className="btn btn-primary" onClick={() => live.start()}>⏺ Start session</button>
              : <button type="button" className="btn" style={{ borderColor: '#E24B4A', color: '#E24B4A' }} onClick={stopSave}>■ Stop & save</button>}
            <button type="button" className="btn" onClick={() => live.disconnect()}>Disconnect</button>
          </div>
          {recording && <p style={{ fontSize: 11, color: 'var(--text-tertiary)', margin: '8px 0 0' }}>Shown live to coaches and on the League board while recording. Checking out stops and saves it.</p>}
        </>
      )}
      {status && <p style={{ fontSize: 11, color: 'var(--text-tertiary)', margin: '8px 0 0' }}>{status}</p>}
    </div>
  )
}
