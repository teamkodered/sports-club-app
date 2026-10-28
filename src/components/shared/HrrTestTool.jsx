import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase.js'
import { useLiveHeartRate } from '../../lib/liveHr.js'

// ❤️ Heart Rate Recovery test (Watt bike): 60 s all-out -> 60 s seated recovery.
// HRR = peak heart rate at the end of the effort - heart rate after 60 s of recovery.
//   mode 'self'  : the athlete's own phone -- connects to their strap here
//   mode 'coach' : reads the athlete's live heart rate from the gym live feed (their app must be recording)
// One athlete at a time (one Watt bike): when the effort ends they take a seat and the next person can start.
const EFFORT = 60, RECOVER = 60
export default function HrrTestTool({ mode = 'coach', studentId, studentName, maxHr = 190, zIndex = 700, onClose, onResult }) {
  const live = useLiveHeartRate({ studentId: mode === 'self' ? studentId : null, maxHr })
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
      if (l > 1) return l - 1
      if (phase === 'effort') { navigator.vibrate?.([200, 100, 200]); setPhase('recover'); return RECOVER }
      finish(); return 0
    }), 1000)
    return () => clearInterval(t)
  }, [phase]) // eslint-disable-line react-hooks/exhaustive-deps

  function start() { samples.current = []; setResult(null); setLeft(EFFORT); setPhase('effort'); navigator.vibrate?.(150) }
  function finish() {
    navigator.vibrate?.([200, 100, 200, 100, 200])
    const s = samples.current
    const eff = s.filter(x => x.phase === 'effort'), rec = s.filter(x => x.phase === 'recover')
    const peak = eff.length ? Math.max(...eff.map(x => x.bpm)) : null
    const last3 = rec.slice(-3)   // smooth the end reading (broadcast lag)
    const end = last3.length ? Math.round(last3.reduce((a, b) => a + b.bpm, 0) / last3.length) : null
    // a gap of more than 8 s in the readings = the connection dropped
    let gap = 0; for (let i = 1; i < s.length; i++) gap = Math.max(gap, (s[i].t - s[i - 1].t) / 1000)
    setResult({ peak, end, hrr: peak != null && end != null ? peak - end : null, dropped: gap > 8 || !s.length })
    setPhase('done')
  }

  const stale = mode === 'coach' && (feedAge == null || feedAge > 10)
  const big = { fontFamily: 'Orbitron, sans-serif', fontWeight: 800 }
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ width: '100%', maxWidth: 420, background: '#14181C', border: '1px solid #E24B4A', borderRadius: 16, padding: 18, color: '#F2F2F2', boxShadow: '0 0 20px rgba(226,75,74,0.3)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div><div style={{ fontFamily: "'Saira Condensed', sans-serif", fontStyle: 'italic', fontWeight: 800, fontSize: 22, textTransform: 'uppercase', color: '#E24B4A' }}>❤️ HR Recovery test</div>
            <div style={{ fontSize: 12, color: '#9A9A9A' }}>{studentName} · Watt bike: 1 min all-out, 1 min seated</div></div>
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

        {phase === 'ready' && <button type="button" className="ts-measure-btn" style={{ width: '100%' }} disabled={!bpm} onClick={start}>▶ Start -- 60 s all-out</button>}
        {(phase === 'effort' || phase === 'recover') && (
          <div style={{ textAlign: 'center', padding: '10px 0', borderRadius: 12, background: phase === 'effort' ? 'rgba(226,75,74,0.15)' : 'rgba(29,158,117,0.15)', border: `1px solid ${phase === 'effort' ? '#E24B4A' : '#1D9E75'}` }}>
            <div style={{ fontFamily: "'Saira Condensed', sans-serif", fontStyle: 'italic', fontWeight: 800, fontSize: 26, textTransform: 'uppercase', color: phase === 'effort' ? '#E24B4A' : '#1D9E75' }}>
              {phase === 'effort' ? 'GO -- all-out!' : 'Take a seat -- stay still'}
            </div>
            <div style={{ ...big, fontSize: 44 }}>{left}s</div>
            {phase === 'recover' && <div style={{ fontSize: 12, color: '#9A9A9A' }}>The next person can get on the bike</div>}
          </div>
        )}
        {phase === 'done' && result && (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, textAlign: 'center', marginBottom: 10 }}>
              {[['Peak', result.peak, '#E24B4A'], ['After 60 s', result.end, '#378ADD'], ['HRR', result.hrr, '#1D9E75']].map(([l, v, c]) => (
                <div key={l} style={{ background: '#1A1F24', borderRadius: 10, padding: '8px 4px' }}><div style={{ ...big, fontSize: 22, color: c }}>{v ?? '--'}</div><div style={{ fontSize: 11, color: '#9A9A9A' }}>{l}{l === 'HRR' ? ' (bpm drop)' : ''}</div></div>
              ))}
            </div>
            {result.dropped && <p style={{ fontSize: 12, color: '#F5C542', margin: '0 0 8px' }}>⚠ The heart rate signal dropped out during the test -- check the numbers, or run it again.</p>}
            <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
              <label style={{ flex: 1, fontSize: 11, color: '#9A9A9A' }}>Watt bike avg watts<input className="ts-input" type="number" inputMode="numeric" value={watts} onChange={e => setWatts(e.target.value)} /></label>
              <label style={{ flex: 1, fontSize: 11, color: '#9A9A9A' }}>Distance (m)<input className="ts-input" type="number" inputMode="numeric" value={dist} onChange={e => setDist(e.target.value)} /></label>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="btn btn-primary" style={{ flex: 1 }} disabled={result.hrr == null} onClick={() => { onResult?.({ ...result, watts, dist }); onClose?.() }}>Use these results</button>
              <button type="button" className="btn" onClick={() => setPhase('ready')}>Run again</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
