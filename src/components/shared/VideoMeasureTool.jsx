import { useEffect, useRef, useState } from 'react'

// Measure from a phone video (Oct 2026):
//   jump   -- mark take-off + landing; height = g x flight time^2 / 8
//   sprint -- mark start + finish over a known distance; time + speed
// Works best with the phone camera's slow-motion mode, filmed side-on.
// Two settings make it accurate for any phone:
//   frame rate  -- how far one frame step moves (30 / 60 / 120 / 240 fps)
//   slow-mo ×   -- if the saved video PLAYS BACK slowed down (many Androids
//                  bake the slow-down into the file), real time = video time ÷ ×

const G = 9.81
const fmt = (n, d = 2) => (n == null || isNaN(n) ? '—' : Number(n).toFixed(d))

export default function VideoMeasureTool({ mode = 'jump', defaultDistance = '', saveLabel, onResult, onClose }) {
  const videoRef = useRef(null)
  const [url, setUrl] = useState(null)
  const [fps, setFps] = useState(240)
  const [slow, setSlow] = useState(1)
  const [t, setT] = useState(0)
  const [dur, setDur] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [a, setA] = useState(null) // take-off / start (video seconds)
  const [b, setB] = useState(null) // landing / finish
  const [distance, setDistance] = useState(String(defaultDistance || ''))
  const [saving, setSaving] = useState(false)
  useEffect(() => () => { if (url) URL.revokeObjectURL(url) }, [url])

  const isJump = mode === 'jump'
  const real = a != null && b != null && b > a ? (b - a) / (slow || 1) : null
  const heightCm = isJump && real != null ? (G * real * real / 8) * 100 : null
  const dist = parseFloat(distance)
  const speed = !isJump && real && dist > 0 ? dist / real : null
  const plausible = isJump ? (real != null && real >= 0.1 && real <= 1.3) : (real != null && real > 0.5)
  const resultValue = isJump ? (heightCm != null ? +heightCm.toFixed(1) : null) : (real != null ? +real.toFixed(2) : null)

  const seek = to => { const v = videoRef.current; if (!v) return; v.pause(); setPlaying(false); v.currentTime = Math.max(0, Math.min(dur || v.duration || 0, to)) }
  const step = n => seek((videoRef.current?.currentTime || 0) + n / fps)
  const togglePlay = () => { const v = videoRef.current; if (!v) return; if (v.paused) { v.play(); setPlaying(true) } else { v.pause(); setPlaying(false) } }

  const btn = { height: 44, minWidth: 44, padding: '0 12px', borderRadius: 8, border: '1px solid var(--border-strong, #444)', background: 'var(--bg-secondary, #1A1F24)', color: 'var(--text, #fff)', fontSize: 15, fontWeight: 700, cursor: 'pointer' }
  const mark = (on, colour) => ({ ...btn, flex: 1, borderColor: on ? colour : btn.border, color: on ? colour : btn.color })
  const sel = { padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border-strong, #444)', background: 'var(--bg-secondary, #111)', color: 'var(--text, #fff)', fontSize: 13 }

  return (
    <div role="dialog" aria-modal="true" style={{ position: 'fixed', inset: 0, zIndex: 480, background: 'var(--bg, #0B0F12)', display: 'flex', flexDirection: 'column', color: 'var(--text, #fff)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderBottom: '1px solid var(--border, #2A3138)' }}>
        <button type="button" onClick={onClose} style={{ ...btn, height: 36 }}>✕</button>
        <h2 style={{ fontSize: 16, fontWeight: 700, flex: 1 }}>{isJump ? '📹 Jump height from video' : '📹 Sprint time from video'}</h2>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 14 }}>
        {!url ? (
          <div>
            <p style={{ fontSize: 14, lineHeight: 1.5, marginBottom: 12 }}>
              {isJump
                ? 'Film the jump side-on with the phone camera in slow-motion, feet clearly in view, phone kept still. Then choose the video.'
                : 'Film side-on in slow-motion so the start line and finish line are both in view (or film the finish and use a clear start cue). Then choose the video.'}
            </p>
            <label style={{ ...btn, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '100%', boxSizing: 'border-box' }}>
              Choose / record video
              <input type="file" accept="video/*" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) { setUrl(URL.createObjectURL(f)); setA(null); setB(null) } }} />
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
              <button type="button" style={mark(a != null, '#22B14C')} onClick={() => setA(videoRef.current?.currentTime ?? t)}>{isJump ? 'Mark take-off' : 'Mark start'}</button>
              <button type="button" style={mark(b != null, '#E24B4A')} onClick={() => setB(videoRef.current?.currentTime ?? t)}>{isJump ? 'Mark landing' : 'Mark finish'}</button>
            </div>
            <div style={{ display: 'flex', gap: 8, fontSize: 12, color: 'var(--text-secondary, #9A9A9A)', marginBottom: 12 }}>
              <span style={{ flex: 1, textAlign: 'center' }}>{a != null ? <button type="button" onClick={() => seek(a)} style={{ background: 'none', border: 'none', color: '#22B14C', cursor: 'pointer' }}>{fmt(a, 3)} s ↺</button> : (isJump ? 'first frame feet off the ground' : 'first frame of the start')}</span>
              <span style={{ flex: 1, textAlign: 'center' }}>{b != null ? <button type="button" onClick={() => seek(b)} style={{ background: 'none', border: 'none', color: '#E24B4A', cursor: 'pointer' }}>{fmt(b, 3)} s ↺</button> : (isJump ? 'first frame feet touch down' : 'frame chest crosses the line')}</span>
            </div>

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12, fontSize: 13 }}>
              <label>Frame rate{' '}
                <select value={fps} onChange={e => setFps(+e.target.value)} style={sel}>{[30, 60, 120, 240].map(v => <option key={v} value={v}>{v} fps</option>)}</select>
              </label>
              <label>Slow-mo playback{' '}
                <select value={slow} onChange={e => setSlow(+e.target.value)} style={sel}>
                  <option value={1}>Normal speed (×1)</option><option value={4}>Plays 4× slower</option><option value={8}>Plays 8× slower</option>
                </select>
              </label>
              {!isJump && <label>Distance{' '}<input type="number" inputMode="decimal" value={distance} onChange={e => setDistance(e.target.value)} style={{ ...sel, width: 70 }} /> m</label>}
            </div>
            <p style={{ fontSize: 11, color: 'var(--text-tertiary, #777)', lineHeight: 1.45, margin: '0 0 12px' }}>
              If the video plays back in slow motion when you watch it normally, set "Plays 8× slower" (or 4×) so the time is converted back to real time. iPhone slow-mo usually plays at normal speed here (×1) with 240 fps.
            </p>

            <div style={{ padding: 14, borderRadius: 10, border: `1px solid ${plausible ? '#22B14C' : 'var(--border, #2A3138)'}`, background: 'var(--bg-secondary, #1A1F24)', textAlign: 'center' }}>
              {isJump ? (
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
              {real != null && !plausible && <div style={{ fontSize: 12, color: '#EF9F27', marginTop: 6 }}>{isJump ? 'That flight time looks unusual -- check the marks and slow-mo setting.' : 'Check the marks.'}</div>}
            </div>
          </>
        )}
      </div>

      {url && (
        <div style={{ padding: 14, borderTop: '1px solid var(--border, #2A3138)', display: 'flex', gap: 8 }}>
          <button type="button" style={{ ...btn, flex: 1 }} onClick={() => { setUrl(null); setA(null); setB(null) }}>Another video</button>
          <button type="button" disabled={resultValue == null || saving} style={{ ...btn, flex: 2, background: resultValue != null ? '#22B14C' : btn.background, color: resultValue != null ? '#0A0A0A' : btn.color, borderColor: 'transparent' }}
            onClick={async () => { setSaving(true); try { await onResult(resultValue, { speed }) ; onClose() } finally { setSaving(false) } }}>
            {saving ? 'Saving…' : resultValue == null ? 'Mark both points' : (saveLabel ? saveLabel(resultValue) : `Save ${resultValue}`)}
          </button>
        </div>
      )}
    </div>
  )
}
