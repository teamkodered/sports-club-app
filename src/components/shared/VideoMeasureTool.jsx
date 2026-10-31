import { useEffect, useRef, useState } from 'react'
import { keepMedia } from '../../lib/filePick.js'

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
  // Long jump (Oct 2026): measured on the frames, not timed -- set a scale from something of
  // known length on the floor, tap the take-off toe and the landing heel (points in video pixels)
  const [vdim, setVdim] = useState({ w: 16, h: 9 })
  const [ljStep, setLjStep] = useState('scale') // scale | toe | heel
  const [ljPts, setLjPts] = useState({ scale: [], toe: null, heel: null })
  const [ljRef, setLjRef] = useState('100')
  useEffect(() => () => { if (url && url.startsWith('blob:')) URL.revokeObjectURL(url) }, [url])

  const isJump = mode === 'jump'
  const isPunch = mode === 'punch'
  const isTimer = mode === 'timer' // e.g. a Fixed Load Circuit: start -> finish time, no distance
  const isLong = mode === 'longjump'
  const pxDist = (p, q) => Math.hypot(p.x - q.x, p.y - q.y)
  const cmPerPx = ljPts.scale.length === 2 && parseFloat(ljRef) > 0 ? parseFloat(ljRef) / pxDist(ljPts.scale[0], ljPts.scale[1]) : null
  const longCm = isLong && cmPerPx && ljPts.toe && ljPts.heel ? pxDist(ljPts.toe, ljPts.heel) * cmPerPx : null
  const real = a != null && b != null && b > a ? (b - a) / (slow || 1) : null
  const heightCm = isJump && real != null ? (G * real * real / 8) * 100 : null
  const dist = parseFloat(distance)
  // Punch distance is entered in cm (guard to target); sprint distance in m.
  const speed = !isJump && real && dist > 0 ? (isPunch ? dist / 100 : dist) / real : null
  const punchMs = isPunch && real != null ? Math.round(real * 1000) : null
  const plausible = isLong ? (longCm != null && longCm >= 20 && longCm <= 400)
    : isJump ? (real != null && real >= 0.1 && real <= 1.3)
    : isPunch ? (real != null && real >= 0.04 && real <= 0.7)
    : (real != null && real > 0.5)
  const mss = v => v == null ? '—' : `${Math.floor(v / 60)}:${(v % 60).toFixed(1).padStart(4, '0')}`
  // Wrong slow-mo setting check (vertical jump): a flight that's only sensible at another
  // setting -- e.g. a normal-speed video with "Plays 8× slower" picked reads ~64× too low
  const videoFlight = a != null && b != null && b > a ? b - a : null
  const slowFix = !isJump || videoFlight == null ? null
    : slow > 1 && videoFlight / slow < 0.15 && videoFlight >= 0.2 && videoFlight <= 1.3 ? { to: 1, text: 'This looks like a normal-speed video' }
    : slow === 1 && videoFlight > 1.3 ? (videoFlight / 4 <= 1.3 ? { to: 4, text: 'This looks like a slowed-down video' } : { to: 8, text: 'This looks like a slowed-down video' })
    : null
  const resultValue = isLong ? (longCm != null ? +longCm.toFixed(1) : null)
    : isJump ? (heightCm != null ? +heightCm.toFixed(1) : null)
    : isPunch ? punchMs
    : (real != null ? +real.toFixed(2) : null)
  const meta = { speed, punchType, mode }

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
            {[['jump', 'Jump'], ['longjump', 'Long jump'], ['sprint', 'Sprint'], ['punch', 'Punch'], ['timer', 'Time']].map(([k, l]) => (
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
            <label style={{ ...btn, marginTop: 8, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '100%', boxSizing: 'border-box' }}>
              📁 Files / Dropbox
              <input type="file" style={{ display: 'none' }} onChange={e => { const f = keepMedia(e.target.files)[0]; e.target.value = ''; if (f) { onFile?.(f); setUrl(URL.createObjectURL(f)); setA(null); setB(null) } }} />
            </label>
          </div>
        ) : (
          <>
            <div style={{ position: 'relative', width: `min(100%, calc(45vh * ${vdim.w / vdim.h}))`, aspectRatio: `${vdim.w} / ${vdim.h}`, margin: '0 auto', background: '#000', borderRadius: 8, overflow: 'hidden' }}>
              <video ref={videoRef} src={url} playsInline muted preload="auto"
                onLoadedMetadata={e => { const v = e.currentTarget; setDur(v.duration || 0); if (v.videoWidth && v.videoHeight) setVdim({ w: v.videoWidth, h: v.videoHeight }) }}
                onTimeUpdate={e => setT(e.currentTarget.currentTime)} onEnded={() => setPlaying(false)}
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }} />
              {isLong && (
                <svg viewBox={`0 0 ${vdim.w} ${vdim.h}`} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', touchAction: 'none', cursor: 'crosshair' }}
                  onPointerDown={e => {
                    const r = e.currentTarget.getBoundingClientRect()
                    const p = { x: (e.clientX - r.left) / r.width * vdim.w, y: (e.clientY - r.top) / r.height * vdim.h }
                    setLjPts(s => ljStep === 'scale' ? { ...s, scale: s.scale.length >= 2 ? [p] : [...s.scale, p] } : { ...s, [ljStep]: p })
                    if (ljStep === 'scale' && ljPts.scale.length === 1) setLjStep('toe')
                  }}>
                  {(() => { const r = Math.max(vdim.w, vdim.h) / 110; return (
                    <>
                      {ljPts.scale.length === 2 && <line x1={ljPts.scale[0].x} y1={ljPts.scale[0].y} x2={ljPts.scale[1].x} y2={ljPts.scale[1].y} stroke="#EF9F27" strokeWidth={r / 2.5} />}
                      {ljPts.scale.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={r} fill="#EF9F27" fillOpacity="0.5" stroke="#EF9F27" strokeWidth={r / 4} />)}
                      {ljPts.toe && ljPts.heel && <line x1={ljPts.toe.x} y1={ljPts.toe.y} x2={ljPts.heel.x} y2={ljPts.heel.y} stroke="#22B14C" strokeWidth={r / 2.5} strokeDasharray={`${r} ${r / 2}`} />}
                      {ljPts.toe && <circle cx={ljPts.toe.x} cy={ljPts.toe.y} r={r} fill="#378ADD" fillOpacity="0.5" stroke="#378ADD" strokeWidth={r / 4} />}
                      {ljPts.heel && <circle cx={ljPts.heel.x} cy={ljPts.heel.y} r={r} fill="#22B14C" fillOpacity="0.5" stroke="#22B14C" strokeWidth={r / 4} />}
                    </>
                  ) })()}
                </svg>
              )}
            </div>
            <input type="range" min={0} max={dur || 0} step={1 / fps} value={t} onChange={e => seek(parseFloat(e.target.value))} style={{ width: '100%', margin: '10px 0 4px' }} aria-label="Position" />
            <div style={{ fontSize: 12, color: 'var(--text-secondary, #9A9A9A)', marginBottom: 8, textAlign: 'center', fontFamily: 'Orbitron, monospace' }}>{fmt(t, 3)} s · frame {Math.round(t * fps)}</div>
            <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginBottom: 12 }}>
              <button type="button" style={btn} onClick={() => step(-10)} aria-label="Back 10 frames">−10</button>
              <button type="button" style={btn} onClick={() => step(-1)} aria-label="Back 1 frame">◀</button>
              <button type="button" style={{ ...btn, minWidth: 64 }} onClick={togglePlay}>{playing ? '❚❚' : '▶'}</button>
              <button type="button" style={btn} onClick={() => step(1)} aria-label="Forward 1 frame">▶</button>
              <button type="button" style={btn} onClick={() => step(10)} aria-label="Forward 10 frames">+10</button>
            </div>

            {isLong ? (
              <div style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                  {[['scale', '1 · Scale', '#EF9F27', ljPts.scale.length === 2], ['toe', '2 · Take-off toe', '#378ADD', !!ljPts.toe], ['heel', '3 · Landing heel', '#22B14C', !!ljPts.heel]].map(([k, l, c, done]) => (
                    <button key={k} type="button" onClick={() => setLjStep(k)} style={{ ...mark(ljStep === k || done, c), fontSize: 13, opacity: ljStep === k ? 1 : 0.75 }}>{done ? '✓ ' : ''}{l}</button>
                  ))}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary, #9A9A9A)', textAlign: 'center', lineHeight: 1.45 }}>
                  {ljStep === 'scale' ? 'Tap both ends of something of known length on the floor, in line with the jump (tape measure, mat edge). Any frame.'
                    : ljStep === 'toe' ? 'Go to the take-off frame (last frame the foot is on the floor), then tap the toe of the take-off foot -- or the take-off line.'
                    : 'Go to the landing frame (first frame the feet touch down), then tap the back of the heel nearest the take-off.'}
                </div>
                <label style={{ display: 'block', textAlign: 'center', fontSize: 13, marginTop: 8 }}>Known length <input type="number" inputMode="decimal" value={ljRef} onChange={e => setLjRef(e.target.value)} style={{ ...sel, width: 70 }} /> cm</label>
              </div>
            ) : (
              <>
            <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
              <button type="button" style={mark(a != null, '#22B14C')} onClick={() => setA(videoRef.current?.currentTime ?? t)}>{isJump ? 'Mark take-off' : isPunch ? 'Mark hand moves' : 'Mark start'}</button>
              <button type="button" style={mark(b != null, '#E24B4A')} onClick={() => setB(videoRef.current?.currentTime ?? t)}>{isJump ? 'Mark landing' : isPunch ? 'Mark impact' : 'Mark finish'}</button>
            </div>
            <div style={{ display: 'flex', gap: 8, fontSize: 12, color: 'var(--text-secondary, #9A9A9A)', marginBottom: 12 }}>
              <span style={{ flex: 1, textAlign: 'center' }}>{a != null ? <button type="button" onClick={() => seek(a)} style={{ background: 'none', border: 'none', color: '#22B14C', cursor: 'pointer' }}>{fmt(a, 3)} s ↺</button> : (isJump ? 'first frame feet off the ground' : isPunch ? 'first frame the hand leaves guard' : 'first frame of the start')}</span>
              <span style={{ flex: 1, textAlign: 'center' }}>{b != null ? <button type="button" onClick={() => seek(b)} style={{ background: 'none', border: 'none', color: '#E24B4A', cursor: 'pointer' }}>{fmt(b, 3)} s ↺</button> : (isJump ? 'first frame feet touch down' : isPunch ? 'first frame of contact' : 'frame chest crosses the line')}</span>
            </div>
              </>
            )}

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
              {!isLong && <label>Slow-mo playback{' '}
                <select value={slow} onChange={e => setSlow(+e.target.value)} style={sel}>
                  <option value={1}>Normal speed (×1)</option><option value={4}>Plays 4× slower</option><option value={8}>Plays 8× slower</option>
                </select>
              </label>}
              {!isJump && !isTimer && !isLong && <label>{isPunch ? 'Reach (optional)' : 'Distance'}{' '}<input type="number" inputMode="decimal" value={distance} onChange={e => setDistance(e.target.value)} style={{ ...sel, width: 70 }} /> {isPunch ? 'cm' : 'm'}</label>}
            </div>
            {isPunch && fps < 120 && <p style={{ fontSize: 11, color: '#EF9F27', lineHeight: 1.45, margin: '0 0 8px' }}>At {fps} fps each frame is {Math.round(1000 / fps)} ms, too coarse for punch times -- use slow-mo (120 or 240 fps) for a usable result.</p>}
            <p style={{ fontSize: 11, color: 'var(--text-tertiary, #777)', lineHeight: 1.45, margin: '0 0 12px' }}>
              If the video plays back in slow motion when you watch it normally, set "Plays 8× slower" (or 4×) so the time is converted back to real time. iPhone slow-mo usually plays at normal speed here (×1) with 240 fps.
            </p>

            {slowFix && (
              <div style={{ padding: 12, borderRadius: 10, border: '1px solid #EF9F27', background: 'rgba(239,159,39,0.12)', marginBottom: 10, fontSize: 13, lineHeight: 1.45 }}>
                ⚠️ {slowFix.text} -- with "{slow === 1 ? 'Normal speed' : `Plays ${slow}× slower`}" picked the height comes out {slow > 1 ? 'far too low' : 'far too high'}.
                <button type="button" onClick={() => setSlow(slowFix.to)} style={{ ...btn, height: 38, width: '100%', marginTop: 8, borderColor: '#EF9F27', color: '#EF9F27' }}>
                  Switch to {slowFix.to === 1 ? 'Normal speed (×1)' : `Plays ${slowFix.to}× slower`}
                </button>
              </div>
            )}
            <div style={{ padding: 14, borderRadius: 10, border: `1px solid ${plausible ? '#22B14C' : 'var(--border, #2A3138)'}`, background: 'var(--bg-secondary, #1A1F24)', textAlign: 'center' }}>
              {isLong ? (
                <>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary, #9A9A9A)' }}>Long jump</div>
                  <div style={{ fontSize: 34, fontWeight: 800, fontFamily: 'Orbitron, monospace' }}>{longCm != null ? `${fmt(longCm, 1)} cm` : '—'}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary, #9A9A9A)' }}>{!cmPerPx ? 'Set the scale first (step 1)' : !ljPts.toe ? 'Tap the take-off toe (step 2)' : !ljPts.heel ? 'Tap the landing heel (step 3)' : 'Toe to heel'}</div>
                </>
              ) : isPunch ? (
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
              {isLong && longCm != null && !plausible && <div style={{ fontSize: 12, color: '#EF9F27', marginTop: 6 }}>That looks unusual -- check the scale (step 1) and the two points.</div>}
              {!isLong && real != null && !plausible && <div style={{ fontSize: 12, color: '#EF9F27', marginTop: 6 }}>{isJump ? 'That flight time looks unusual -- check the marks and slow-mo setting.' : isPunch ? 'That looks unusual for a punch -- check the marks and the slow-mo setting.' : 'Check the marks.'}</div>}
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
