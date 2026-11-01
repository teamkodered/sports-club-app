import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase.js'
import { useLiveHeartRate } from '../../lib/liveHr.js'

// ❤️ Heart Rate Recovery test (Watt bike): 60 s all-out -> 60 s seated recovery.
// HRR = peak heart rate at the end of the effort - heart rate after 60 s of recovery.
//   mode 'self'  : the athlete's own phone -- connects to their strap here
//   mode 'coach' : reads the athlete's live heart rate from the gym live feed (their app must be recording)
// One athlete at a time (one Watt bike): when the effort ends they take a seat and the next person can start.
//
// variant 'recovery' (Nov 2026): recovery only, straight after any hard test (bleep, circuit, reps, run...):
// press Start the moment the exercise ends -> 60 s standing still -> stops by itself. Heart rate comes
// from the strap / live feed, or is typed in (start + after 60 s) from any other device.
// HRR % = (start - after 60 s) / start x 100 -- the number used for comparisons.
const EFFORT = 60, RECOVER = 60
let audioCtx = null
function beep(freq = 880, ms = 180) {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)()
    const o = audioCtx.createOscillator(), g = audioCtx.createGain()
    o.frequency.value = freq; o.connect(g); g.connect(audioCtx.destination); g.gain.value = 0.25
    o.start(); o.stop(audioCtx.currentTime + ms / 1000)
  } catch { /* no sound available */ }
}
export function hrrPct(start, end) { return start && end != null ? Math.round(((start - end) / start) * 1000) / 10 : null }
export default function HrrTestTool({ mode = 'coach', studentId, studentName, maxHr: maxHrProp = null, zIndex = 700, onClose, onResult, variant = 'wattbike', afterTest = null }) {
  const recoveryOnly = variant === 'recovery'
  // their max heart rate: 220 - age when we know their date of birth (used for "was it a real all-out effort?")
  const [maxHr, setMaxHr] = useState(maxHrProp || 190)
  useEffect(() => {
    if (maxHrProp || !studentId) return
    supabase.from('students').select('members(date_of_birth)').eq('id', studentId).maybeSingle().then(({ data }) => {
      const dob = data?.members?.date_of_birth
      if (dob) { const age = Math.floor((Date.now() - new Date(dob)) / 31557600000); if (age > 5 && age < 90) setMaxHr(220 - age) }
    })
  }, [studentId, maxHrProp])
  const live = useLiveHeartRate({ studentId: mode === 'self' ? studentId : null, maxHr })
  const [manualStart, setManualStart] = useState(''), [manualEnd, setManualEnd] = useState('')
  const [feedBpm, setFeedBpm] = useState(null)       // coach: the athlete's live bpm
  const [feedAge, setFeedAge] = useState(null)
  const [phase, setPhase] = useState('ready')        // ready | effort | recover | done
  const [left, setLeft] = useState(EFFORT)
  const samples = useRef([])                          // [{ t, bpm }]
  const [result, setResult] = useState(null)
  const [watts, setWatts] = useState(''), [dist, setDist] = useState('')
  const bpm = mode === 'self' ? live.bpm : feedBpm

  // coach: poll the athlete's live heart rate every second
  useEffect(() => {
    if (mode !== 'coach' || !studentId) return
    let stop = false
    const tick = async () => {
      const { data } = await supabase.from('live_hr').select('bpm, updated_at').eq('student_id', studentId).maybeSingle()
      if (stop) return
      setFeedBpm(data?.bpm ?? null); setFeedAge(data?.updated_at ? (Date.now() - new Date(data.updated_at)) / 1000 : null)
    }
    tick(); const t = setInterval(tick, 1000)
    return () => { stop = true; clearInterval(t) }
  }, [mode, studentId])

  // record every reading during the test
  useEffect(() => { if ((phase === 'effort' || phase === 'recover') && bpm) samples.current.push({ t: Date.now(), bpm, phase }) }, [bpm, phase])

  // countdown
  useEffect(() => {
    if (phase !== 'effort' && phase !== 'recover') return
    const t = setInterval(() => setLeft(l => {
      if (l === 11) { beep(660, 150); navigator.vibrate?.(100) }   // 10 seconds to go
      if (l > 1) return l - 1
      if (phase === 'effort') { navigator.vibrate?.([200, 100, 200]); beep(); setPhase('recover'); return RECOVER }
      finish(); return 0
    }), 1000)
    return () => clearInterval(t)
  }, [phase]) // eslint-disable-line react-hooks/exhaustive-deps

  const startBpmRef = useRef(null)
  function start() {
    samples.current = []; setResult(null); navigator.vibrate?.(150); beep()
    if (recoveryOnly) { startBpmRef.current = bpm || null; setLeft(RECOVER); setPhase('recover') }
    else { setLeft(EFFORT); setPhase('effort') }
  }
  function finish() {
    navigator.vibrate?.([200, 100, 200, 100, 200]); beep(988, 400)
    const s = samples.current
    const eff = s.filter(x => x.phase === 'effort'), rec = s.filter(x => x.phase === 'recover')
    // recovery-only: the start is the heart rate when Start was pressed (or the first seconds of recovery)
    const peak = recoveryOnly
      ? (Math.max(startBpmRef.current || 0, ...rec.slice(0, 3).map(x => x.bpm)) || null)
      : (eff.length ? Math.max(...eff.map(x => x.bpm)) : null)
    const last3 = rec.slice(-3)   // smooth the end reading (broadcast lag)
    const end = last3.length ? Math.round(last3.reduce((a, b) => a + b.bpm, 0) / last3.length) : null
    // a gap of more than 8 s in the readings = the connection dropped
    let gap = 0; for (let i = 1; i < s.length; i++) gap = Math.max(gap, (s[i].t - s[i - 1].t) / 1000)
    const p = peak ?? (manualStart ? Number(manualStart) : null)
    setResult(withPct({ peak: p, end, dropped: (gap > 8 || !s.length) && !!bpm }))
    setPhase('done')
  }
  function withPct(r) {
    const hrr = r.peak != null && r.end != null ? r.peak - r.end : null
    const startPctMax = r.peak ? Math.round((r.peak / maxHr) * 100) : null
    return { ...r, hrr, pct: hrrPct(r.peak, r.end), startPctMax, lowEffort: startPctMax != null && startPctMax < 85 }
  }
  // typed in (no strap): recompute as they type
  useEffect(() => {
    if (phase !== 'done' || !result || bpm) return
    const ps = manualStart ? Number(manualStart) : result.peak, pe = manualEnd ? Number(manualEnd) : result.end
    setResult(r => withPct({ ...r, peak: ps ?? null, end: pe ?? null }))
  }, [manualStart, manualEnd]) // eslint-disable-line react-hooks/exhaustive-deps

  const stale = mode === 'coach' && (feedAge == null || feedAge > 10)
  const big = { fontFamily: 'Orbitron, sans-serif', fontWeight: 800 }
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ width: '100%', maxWidth: 420, background: '#14181C', border: '1px solid #E24B4A', borderRadius: 16, padding: 18, color: '#F2F2F2', boxShadow: '0 0 20px rgba(226,75,74,0.3)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div><div style={{ fontFamily: "'Saira Condensed', sans-serif", fontStyle: 'italic', fontWeight: 800, fontSize: 22, textTransform: 'uppercase', color: '#E24B4A' }}>❤️ HR Recovery test</div>
            <div style={{ fontSize: 12, color: '#9A9A9A' }}>{studentName} · {recoveryOnly ? `After ${afterTest || 'the test'}: press Start the moment it ends, then 1 min standing still` : 'Watt bike: 1 min all-out, 1 min seated'}</div></div>
          <button type="button" className="btn btn-sm" onClick={onClose}>Close</button>
        </div>

        {/* live heart rate */}
        <div style={{ textAlign: 'center', margin: '6px 0 12px' }}>
          <div style={{ ...big, fontSize: 54, color: bpm ? '#E24B4A' : '#555', lineHeight: 1 }}>{bpm || '--'}</div>
          <div style={{ fontSize: 11, color: '#9A9A9A' }}>bpm {mode === 'coach' ? (stale ? '· no live heart rate from them yet' : '· live') : (live.connected ? '· live' : '')}</div>
        </div>
        {mode === 'self' && !live.connected && phase === 'ready' && (
          <button type="button" className="btn" style={{ width: '100%', marginBottom: 10 }} onClick={() => live.connect()}>Connect strap</button>
        )}
        {mode === 'coach' && stale && phase === 'ready' && (
          <p style={{ fontSize: 12, color: '#F5C542', margin: '0 0 10px' }}>Their strap needs to be connected and recording in their app (checked in to the class, or ⏺ Start on Wearables).</p>
        )}

        {phase === 'ready' && !bpm && recoveryOnly && (
          <label style={{ display: 'block', fontSize: 12, color: '#9A9A9A', marginBottom: 8 }}>No strap? Type your heart rate <b>now</b> (from your watch / device), then press Start:
            <input className="ts-input" type="number" inputMode="numeric" value={manualStart} onChange={e => setManualStart(e.target.value)} placeholder="Heart rate at the end of the test" /></label>
        )}
        {phase === 'ready' && <button type="button" className="ts-measure-btn" style={{ width: '100%' }} disabled={!bpm && !(recoveryOnly && manualStart)} onClick={start}>{recoveryOnly ? '▶ Start -- 1 min recovery (stand still)' : '▶ Start -- 60 s all-out'}</button>}
        {(phase === 'effort' || phase === 'recover') && (
          <div style={{ textAlign: 'center', padding: '10px 0', borderRadius: 12, background: phase === 'effort' ? 'rgba(226,75,74,0.15)' : 'rgba(29,158,117,0.15)', border: `1px solid ${phase === 'effort' ? '#E24B4A' : '#1D9E75'}` }}>
            <div style={{ fontFamily: "'Saira Condensed', sans-serif", fontStyle: 'italic', fontWeight: 800, fontSize: 26, textTransform: 'uppercase', color: phase === 'effort' ? '#E24B4A' : '#1D9E75' }}>
              {phase === 'effort' ? 'GO -- all-out!' : recoveryOnly ? 'Stand still -- breathe' : 'Take a seat -- stay still'}
            </div>
            <div style={{ ...big, fontSize: 44 }}>{left}s</div>
            {phase === 'recover' && !recoveryOnly && <div style={{ fontSize: 12, color: '#9A9A9A' }}>The next person can get on the bike</div>}
          </div>
        )}
        {phase === 'done' && result && (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, textAlign: 'center', marginBottom: 10 }}>
              {[['Start', result.peak, '#E24B4A'], ['After 60 s', result.end, '#378ADD'], ['HRR', result.pct != null ? `${result.pct}%` : null, '#1D9E75']].map(([l, v, c]) => (
                <div key={l} style={{ background: '#1A1F24', borderRadius: 10, padding: '8px 4px' }}><div style={{ ...big, fontSize: 22, color: c }}>{v ?? '--'}</div><div style={{ fontSize: 11, color: '#9A9A9A' }}>{l === 'HRR' ? `HRR (${result.hrr ?? '--'} bpm drop)` : l}</div></div>
              ))}
            </div>
            {!bpm && (
              <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <label style={{ flex: 1, fontSize: 11, color: '#9A9A9A' }}>Start bpm<input className="ts-input" type="number" inputMode="numeric" value={manualStart} onChange={e => setManualStart(e.target.value)} /></label>
                <label style={{ flex: 1, fontSize: 11, color: '#9A9A9A' }}>Heart rate now (after 1 min)<input className="ts-input" type="number" inputMode="numeric" value={manualEnd} onChange={e => setManualEnd(e.target.value)} autoFocus /></label>
              </div>
            )}
            {result.startPctMax != null && (
              <p style={{ fontSize: 12, margin: '0 0 8px', color: result.lowEffort ? '#F5C542' : '#9A9A9A' }}>
                Start was {result.startPctMax}% of max heart rate ({maxHr}).{result.lowEffort ? ' ⚠ Under 85% -- probably not a full all-out effort, so this HRR won\'t compare fairly.' : ''}
              </p>
            )}
            {result.dropped && <p style={{ fontSize: 12, color: '#F5C542', margin: '0 0 8px' }}>⚠ The heart rate signal dropped out during the test -- check the numbers, or run it again.</p>}
            {!recoveryOnly && <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
              <label style={{ flex: 1, fontSize: 11, color: '#9A9A9A' }}>Watt bike avg watts<input className="ts-input" type="number" inputMode="numeric" value={watts} onChange={e => setWatts(e.target.value)} /></label>
              <label style={{ flex: 1, fontSize: 11, color: '#9A9A9A' }}>Distance (m)<input className="ts-input" type="number" inputMode="numeric" value={dist} onChange={e => setDist(e.target.value)} /></label>
            </div>}
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="btn btn-primary" style={{ flex: 1 }} disabled={result.pct == null} onClick={() => { onResult?.({ ...result, watts, dist, afterTest }); onClose?.() }}>Use these results</button>
              <button type="button" className="btn" onClick={() => setPhase('ready')}>Run again</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
