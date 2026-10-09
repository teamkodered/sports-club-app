import { useEffect, useRef, useState } from 'react'

// Measure from a phone video (Oct 2026):
//   jump   -- mark take-off + landing; height = g x flight time^2 / 8
//   sprint -- mark start + finish over a known distance; time + speed
//   punch  -- mark hand starts moving + impact; punch time in ms (lower = faster),
//             optional guard-to-target distance for speed in m/s
// Works best with the phone camera's slow-motion mode, filmed side-on.
// Two settings make it accurate for any phone:
//   frame rate  -- how far one frame step moves (30 / 60 / 120 / 240 fps)
//   slow-mo ×   -- if the saved video PLAYS BACK slowed down (many Androids
//                  bake the slow-down into the file), real time = video time ÷ ×

const G = 9.81
const fmt = (n, d = 2) => (n == null || isNaN(n) ? '—' : Number(n).toFixed(d))

export default function VideoMeasureTool({ mode: modeProp = 'jump', defaultDistance = '', saveLabel, onResult, onClose, initialUrl = null, switchable = false, zIndex = 480, onCount, onReps, onFile }) {
  // initialUrl: measure an already-uploaded video (opened from the media viewer); switchable: Jump / Sprint / Punch toggle
  const [mode, setMode] = useState(modeProp)
  const videoRef = useRef(null)
  const [url, setUrl] = useState(initialUrl)
  const [fps, setFps] = useState(240)
  const [slow, setSlow] = useState(1)
  const [t, setT] = useState(0)
  const [dur, setDur] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [a, setA] = useState(null) // take-off / start (video seconds)
  const [b, setB] = useState(null) // landing / finish
  const [distance, setDistance] = useState(String(defaultDistance || ''))
  const [saving, setSaving] = useState(false)
  const [punchType, setPunchType] = useState('Jab')
  useEffect(() => () => { if (url && url.startsWith('blob:')) URL.revokeObjectURL(url) }, [url])

  const isJump = mode === 'jump'
  const isPunch = mode === 'punch'
  const isTimer = mode === 'timer' // e.g. a Fixed Load Circuit: start -> finish time, no distance
  const real = a != null && b != null && b > a ? (b - a) / (slow || 1) : null
  const heightCm = isJump && real != null ? (G * real * real / 8) * 100 : null
  const dist = parseFloat(distance)
  // Punch distance is entered in cm (guard to target); sprint distance in m.
  const speed = !isJump && real && dist > 0 ? (isPunch ? dist / 100 : dist) / real : null
  const punchMs = isPunch && real != null ? Math.round(real * 1000) : null
  const plausible = isJump ? (real != null && real >= 0.1 && real <= 1.3)
    : isPunch ? (real != null && real >= 0.04 && real <= 0.7)
    : (real != null && real > 0.5)
  const mss = v => v == null ? '—' : `${Math.floor(v / 60)}:${(v % 60).toFixed(1).padStart(4, '0')}`
  const resultValue = isJump ? (heightCm != null ? +heightCm.toFixed(1) : null)
    : isPunch ? punchMs
    : (real != null ? +real.toFixed(2) : null)
  const meta = { speed, punchType }

  const seek = to => { const v = videoRef.current; if (!v) return; v.pause(); setPlaying(false); v.currentTime = Math.max(0, Math.min(dur || v.duration || 0, to)) }
  const step = n => seek((videoRef.current?.currentTime || 0) + n / fps)
  const togglePlay = () => { const v = videoRef.current; if (!v) return; if (v.paused) { v.play(); setPlaying(true) } else { v.pause(); setPlaying(false) } }

  const btn = { height: 44, minWidth: 44, padding: '0 12px', borderRadius: 8, border: '1px solid var(--border-strong, #444)', background: 'var(--bg-secondary, #1A1F24)', color: 'var(--text, #fff)', fontSize: 15, fontWeight: 700, cursor: 'pointer' }
  const mark = (on, colour) => ({ ...btn, flex: 1, borderColor: on ? colour : btn.border, color: on ? colour : btn.color })
  const sel = { padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border-strong, #444)', background: 'var(--bg-secondary, #111)', color: 'var(--text, #fff)', fontSize: 13 }

  return (
    <div role="dialog" aria-modal="true" style={{ position: 'fixed', inset: 0, zIndex, background: 'var(--bg, #0B0F12)', display: 'flex', flexDirection: 'column', color: 'var(--text, #fff)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderBottom: '1px solid var(--border, #2A3138)' }}>
        <button type="button" onClick={onClose} style={{ ...btn, height: 36 }}>{initialUrl ? '← Back' : '✕'}</button>
        <h2 style={{ fontSize: 16, fontWeight: 700, flex: 1 }}>{isJump ? '📹 Jump height from video' : isPunch ? '📹 Punch speed from video' : isTimer ? '📹 Time from video' : '📹 Sprint time from video'}</h2>
        {switchable && (
          <div style={{ display: 'flex', gap: 4 }}>
            {[['jump', 'Jump'], ['sprint', 'Sprint'], ['punch', 'Punch'], ['timer', 'Time']].map(([k, l]) => (
              <button key={k} type="button" onClick={() => { setMode(k); setA(null); setB(null) }} style={{ ...btn, height: 34, minWidth: 0, padding: '0 10px', fontSize: 13, borderColor: mode === k ? '#22B14C' : btn.border, color: mode === k ? '#22B14C' : btn.color }}>{l}</button>
            ))}
            {onCount && <button type="button" onClick={onCount} style={{ ...btn, height: 34, minWidth: 0, padding: '0 10px', fontSize: 13 }}>Count</button>}
            {onReps && <button type="button" onClick={onReps} style={{ ...btn, height: 34, minWidth: 0, padding: '0 10px', fontSize: 13 }}>Reps</button>}
          </div>
        )}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 14 }}>
        {!url ? (
          <div>
            <p style={{ fontSize: 14, lineHeight: 1.5, marginBottom: 12 }}>
              {isJump
                ? 'Film the jump side-on with the phone camera in slow-motion, feet clearly in view, phone kept still. Then choose the video.'
                : isTimer
                ? 'Film the whole effort with the phone kept still, so you can see the moment it starts and the moment it finishes. Normal speed is fine. Then choose the video.'
                : isPunch
                ? 'Film the punch side-on in slow-motion (240 fps if your phone has it), phone kept still, with the glove and the pad / bag in view. Then choose the video.'
                : 'Film side-on in slow-motion so the start line and finish line are both in view (or film the finish and use a clear start cue). Then choose the video.'}
            </p>
            <label style={{ ...btn, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '100%', boxSizing: 'border-box' }}>
              Choose / record video
              <input type="file" accept="video/*" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) { onFile?.(f); setUrl(URL.createObjectURL(f)); setA(null); setB(null) } }} />
            </label>
          </div>
        ) : (
          <>
            <video ref={videoRef} src={url} playsInline muted preload="auto"
              onLoadedMetadata={e => setDur(e.currentTarget.duration || 0)} onTimeUpdate={e => setT(e.currentTarget.currentTime)} onEnded={() => setPlaying(false)}
              style={{ width: '100%', maxHeight: '45vh', background: '#000', borderRadius: 8, display: 'block' }} />
            <input type="range" min={0} max={dur || 0} step={1 / fps} value={t} onChange={e => seek(parseFloat(e.target.value))} style={{ width: '100%', margin: '10px 0 4px' }} aria-label="Position" />
            <div style={{ fontSize: 12, color: 'var(--text-secondary, #9A9A9A)', marginBottom: 8, textAlign: 'center', fontFamily: 'Orbitron, monospace' }}>{fmt(t, 3)} s · frame {Math.round(t * fps)}</div>
            <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginBottom: 12 }}>
              <button type="button" style={btn} onClick={() => step(-10)} aria-label="Back 10 frames">−10</button>
              <button type="button" style={btn} onClick={() => step(-1)} aria-label="Back 1 frame">◀</button>
              <button type="button" style={{ ...btn, minWidth: 64 }} onClick={togglePlay}>{playing ? '❚❚' : '▶'}</button>
              <button type="button" style={btn} onClick={() => step(1)} aria-label="Forward 1 frame">▶</button>
              <button type="button" style={btn} onClick={() => step(10)} aria-label="Forward 10 frames">+10</button>
            </div>

            <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
              <button type="button" style={mark(a != null, '#22B14C')} onClick={() => setA(videoRef.current?.currentTime ?? t)}>{isJump ? 'Mark take-off' : isPunch ? 'Mark hand moves' : 'Mark start'}</button>
              <button type="button" style={mark(b != null, '#E24B4A')} onClick={() => setB(videoRef.current?.currentTime ?? t)}>{isJump ? 'Mark landing' : isPunch ? 'Mark impact' : 'Mark finish'}</button>
            </div>
            <div style={{ display: 'flex', gap: 8, fontSize: 12, color: 'var(--text-secondary, #9A9A9A)', marginBottom: 12 }}>
              <span style={{ flex: 1, textAlign: 'center' }}>{a != null ? <button type="button" onClick={() => seek(a)} style={{ background: 'none', border: 'none', color: '#22B14C', cursor: 'pointer' }}>{fmt(a, 3)} s ↺</button> : (isJump ? 'first frame feet off the ground' : isPunch ? 'first frame the hand leaves guard' : 'first frame of the start')}</span>
              <span style={{ flex: 1, textAlign: 'center' }}>{b != null ? <button type="button" onClick={() => seek(b)} style={{ background: 'none', border: 'none', color: '#E24B4A', cursor: 'pointer' }}>{fmt(b, 3)} s ↺</button> : (isJump ? 'first frame feet touch down' : isPunch ? 'first frame of contact' : 'frame chest crosses the line')}</span>
            </div>

            {isPunch && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                {['Jab', 'Cross', 'Lead hook', 'Rear hook'].map(pt => (
                  <button key={pt} type="button" onClick={() => setPunchType(pt)}
                    style={{ ...btn, height: 36, fontSize: 13, flex: '1 1 70px', borderColor: punchType === pt ? '#EF9F27' : btn.border, color: punchType === pt ? '#EF9F27' : btn.color }}>{pt}</button>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12, fontSize: 13 }}>
              <label>Frame rate{' '}
                <select value={fps} onChange={e => setFps(+e.target.value)} style={sel}>{[30, 60, 120, 240].map(v => <option key={v} value={v}>{v} fps</option>)}</select>
              </label>
              <label>Slow-mo playback{' '}
                <select value={slow} onChange={e => setSlow(+e.target.value)} style={sel}>
                  <option value={1}>Normal speed (×1)</option><option value={4}>Plays 4× slower</option><option value={8}>Plays 8× slower</option>
                </select>
              </label>
              {!isJump && !isTimer && <label>{isPunch ? 'Reach (optional)' : 'Distance'}{' '}<input type="number" inputMode="decimal" value={distance} onChange={e => setDistance(e.target.value)} style={{ ...sel, width: 70 }} /> {isPunch ? 'cm' : 'm'}</label>}
            </div>
            {isPunch && fps < 120 && <p style={{ fontSize: 11, color: '#EF9F27', lineHeight: 1.45, margin: '0 0 8px' }}>At {fps} fps each frame is {Math.round(1000 / fps)} ms, too coarse for punch times -- use slow-mo (120 or 240 fps) for a usable result.</p>}
            <p style={{ fontSize: 11, color: 'var(--text-tertiary, #777)', lineHeight: 1.45, margin: '0 0 12px' }}>
              If the video plays back in slow motion when you watch it normally, set "Plays 8× slower" (or 4×) so the time is converted back to real time. iPhone slow-mo usually plays at normal speed here (×1) with 240 fps.
            </p>

            <div style={{ padding: 14, borderRadius: 10, border: `1px solid ${plausible ? '#22B14C' : 'var(--border, #2A3138)'}`, background: 'var(--bg-secondary, #1A1F24)', textAlign: 'center' }}>
              {isPunch ? (
                <>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary, #9A9A9A)' }}>{punchType}</div>
                  <div style={{ fontSize: 34, fontWeight: 800, fontFamily: 'Orbitron, monospace' }}>{punchMs != null ? `${punchMs} ms` : '—'}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary, #9A9A9A)' }}>{speed ? `${fmt(speed, 1)} m/s average hand speed` : 'Add the reach (guard to target) for speed'}</div>
                </>
              ) : isTimer ? (
                <div style={{ fontSize: 34, fontWeight: 800, fontFamily: 'Orbitron, monospace' }}>{mss(real)}</div>
              ) : isJump ? (
                <>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary, #9A9A9A)' }}>Flight time {fmt(real, 3)} s</div>
                  <div style={{ fontSize: 34, fontWeight: 800, fontFamily: 'Orbitron, monospace' }}>{heightCm != null ? `${fmt(heightCm, 1)} cm` : '—'}</div>
                </>
              ) : (
                <>
                  <div style={{ fontSize: 34, fontWeight: 800, fontFamily: 'Orbitron, monospace' }}>{real != null ? `${fmt(real, 2)} s` : '—'}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary, #9A9A9A)' }}>{speed ? `${fmt(speed, 2)} m/s · ${fmt(speed * 3.6, 1)} km/h` : 'Set the distance for speed'}</div>
                </>
              )}
              {real != null && !plausible && <div style={{ fontSize: 12, color: '#EF9F27', marginTop: 6 }}>{isJump ? 'That flight time looks unusual -- check the marks and slow-mo setting.' : isPunch ? 'That looks unusual for a punch -- check the marks and the slow-mo setting.' : 'Check the marks.'}</div>}
            </div>
          </>
        )}
      </div>

      {url && (
        <div style={{ padding: 14, borderTop: '1px solid var(--border, #2A3138)', display: 'flex', gap: 8 }}>
          {!initialUrl && <button type="button" style={{ ...btn, flex: 1 }} onClick={() => { setUrl(null); setA(null); setB(null) }}>Another video</button>}
          <button type="button" disabled={resultValue == null || saving} style={{ ...btn, flex: 2, background: resultValue != null ? '#22B14C' : btn.background, color: resultValue != null ? '#0A0A0A' : btn.color, borderColor: 'transparent' }}
            onClick={async () => { setSaving(true); try { await onResult(resultValue, { ...(meta || {}), mode, distance: dist }) ; onClose() } finally { setSaving(false) } }}>
            {saving ? 'Saving…' : resultValue == null ? 'Mark both points' : (saveLabel ? saveLabel(resultValue, meta) : `Save ${resultValue}`)}
          </button>
        </div>
      )}
    </div>
  )
}
