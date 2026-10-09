import { useEffect, useMemo, useRef, useState } from 'react'

// 📹 Count punches (mode 'punches') or reps (mode 'reps') from a video (Oct 2026).
// Reps work differently from punches: a rep is a smooth down-and-up, not a
// spike, so each frame's box is compared with the FIRST frame (the start
// position) -- the difference rises as the athlete moves away and falls as
// they come back. One full rise-and-return (hysteresis between a low and a
// high level, at least MIN_REP_S apart) = one rep.
//   1. Choose a video of a round (phone kept still), 2. drag a box over the
//   bag / pads, 3. optionally mark the round's start + end, 4. Count.
// While the video plays (muted, sped up) every frame's box area is shrunk to
// 48x48 grey pixels and compared with the previous frame -- each hit makes a
// sudden spike in change. Spikes well above the background movement (rolling
// median + MAD) and at least MIN_GAP_S apart are counted. The coach then
// reviews: tap a mark to jump the video to it and remove it, or add a missed
// hit at the playhead. The sensitivity slider re-counts instantly (no re-play).
// No AI, nothing uploaded -- it all runs on the phone.

const GRID = 48            // box is sampled at 48x48 pixels
const MIN_GAP_S = 0.15     // two hits closer than this (real time) count as one
const BASE_WIN_S = 0.75    // rolling-median window either side (real time)
const TOL = 0.03           // seconds -- matching a removed/added mark
const MIN_REP_S = 0.5      // two reps can't be closer than this (real time)

// Distance-from-start-position series -> rep times (video seconds).
function detectReps(series, sensitivity, slow) {
  const n = series.length
  if (n < 5) return { hits: [], resid: [], thresh: 0 }
  const raw = series.map(p => p.r)
  const sm = raw.map((v, i) => { let a = 0, c = 0; for (let j = Math.max(0, i - 2); j <= Math.min(n - 1, i + 2); j++) { a += raw[j]; c++ } return a / c })
  const sorted = [...sm].sort((a, b) => a - b)
  const lo = sorted[Math.floor(n * 0.05)], hiP = sorted[Math.floor(n * 0.95)]
  const range = Math.max(0.5, hiP - lo)
  const high = lo + range * (0.65 - (sensitivity - 1) * 0.04) // sensitivity 1..10 -> 65% .. 29% of the way out
  const low = lo + range * 0.2
  const hits = []
  let armed = true
  for (let i = 0; i < n; i++) {
    if (armed && sm[i] >= high) {
      const t = series[i].t
      if (!hits.length || t - hits[hits.length - 1] >= MIN_REP_S * slow) hits.push(t)
      armed = false
    } else if (!armed && sm[i] <= low) armed = true
  }
  return { hits, resid: sm.map(v => v - lo), thresh: high - lo }
}

const fmt = (n, d = 1) => (n == null || isNaN(n) ? '—' : Number(n).toFixed(d))
const median = arr => { if (!arr.length) return 0; const a = [...arr].sort((x, y) => x - y); const m = a.length >> 1; return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2 }

// Spikes in the change series -> hit times (video seconds).
function detectHits(series, sensitivity, slow) {
  const n = series.length
  if (n < 5) return { hits: [], resid: [], thresh: 0 }
  const raw = series.map(p => p.s)
  const sm = raw.map((v, i) => (raw[Math.max(0, i - 1)] + v + raw[Math.min(n - 1, i + 1)]) / 3)
  const win = BASE_WIN_S * slow
  const resid = new Array(n)
  let lo = 0, hi = 0
  for (let i = 0; i < n; i++) {
    const t = series[i].t
    while (series[lo].t < t - win) lo++
    while (hi < n - 1 && series[hi + 1].t <= t + win) hi++
    resid[i] = sm[i] - median(sm.slice(lo, hi + 1))
  }
  const noise = median(resid.map(Math.abs)) * 1.4826 + 0.05
  const k = 8 - (sensitivity - 1) * (6.5 / 9) // sensitivity 1..10 -> 8x .. 1.5x the background
  const thresh = k * noise
  const cands = []
  for (let i = 1; i < n - 1; i++) if (resid[i] > thresh && resid[i] >= resid[i - 1] && resid[i] >= resid[i + 1]) cands.push(i)
  cands.sort((a, b) => resid[b] - resid[a])
  const gap = MIN_GAP_S * slow
  const accepted = []
  for (const i of cands) if (!accepted.some(j => Math.abs(series[j].t - series[i].t) < gap)) accepted.push(i)
  return { hits: accepted.map(i => series[i].t).sort((a, b) => a - b), resid, thresh }
}

export default function PunchCountTool({ mode = 'punches', title, onSave, onClose, initialUrl = null, zIndex = 480, onSwitchMode, onFile }) {
  const isReps = mode === 'reps'
  // initialUrl: count an already-uploaded video (from the media viewer)
  const videoRef = useRef(null)
  const stageRef = useRef(null)
  const cancelRef = useRef(false)
  const [url, setUrl] = useState(initialUrl)
  const [aspect, setAspect] = useState(16 / 9)
  const [dur, setDur] = useState(0)
  const [t, setT] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [slow, setSlow] = useState(1)
  const [box, setBox] = useState(null)          // { x, y, w, h } as 0..1 of the frame
  const [drawing, setDrawing] = useState(null)  // { x0, y0, x1, y1 } while dragging
  const [drawMode, setDrawMode] = useState(true)
  const [roundStart, setRoundStart] = useState(null)
  const [roundEnd, setRoundEnd] = useState(null)
  const [status, setStatus] = useState('idle')  // idle | running | done
  const [progress, setProgress] = useState(0)
  const [series, setSeries] = useState([])
  const [sensitivity, setSensitivity] = useState(5)
  const [removed, setRemoved] = useState([])    // video times removed by the coach
  const [added, setAdded] = useState([])        // video times added by the coach
  const [selected, setSelected] = useState(null)
  const [saving, setSaving] = useState(false)
  useEffect(() => () => { if (url && url.startsWith('blob:')) URL.revokeObjectURL(url) }, [url])

  const rs = roundStart ?? 0
  const re = roundEnd ?? dur
  const detection = useMemo(() => (isReps ? detectReps : detectHits)(series, sensitivity, slow || 1), [series, sensitivity, slow, isReps])
  const hits = useMemo(() => {
    const kept = detection.hits.filter(h => !removed.some(r => Math.abs(r - h) < TOL))
    return [...kept, ...added].filter(h => h >= rs && h <= re).sort((a, b) => a - b)
  }, [detection, removed, added, rs, re])
  const realDur = Math.max(0, (re - rs) / (slow || 1))
  const perMinute = realDur > 0 ? hits.length / (realDur / 60) : null
  const splits = useMemo(() => {
    if (realDur <= 0) return []
    const out = Array.from({ length: Math.ceil(realDur / 30) }, () => 0)
    for (const h of hits) out[Math.min(out.length - 1, Math.floor((h - rs) / (slow || 1) / 30))]++
    return out
  }, [hits, realDur, rs, slow])

  function reset() { setSeries([]); setRemoved([]); setAdded([]); setSelected(null); setStatus('idle') }
  function pickFile(f) {
    onFile?.(f)
    if (!f) return
    setUrl(URL.createObjectURL(f)); setBox(null); setDrawMode(true); setRoundStart(null); setRoundEnd(null); reset()
  }
  const seek = to => { const v = videoRef.current; if (!v) return; v.pause(); setPlaying(false); v.currentTime = Math.max(0, Math.min(dur || v.duration || 0, to)) }
  const togglePlay = () => { const v = videoRef.current; if (!v) return; if (v.paused) { v.play(); setPlaying(true) } else { v.pause(); setPlaying(false) } }

  // --- drawing the box (pointer drag over the video, stored as 0..1) ---
  function relPos(e) {
    const r = stageRef.current.getBoundingClientRect()
    return { x: Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), y: Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)) }
  }
  function onDown(e) { if (!drawMode || status === 'running') return; e.currentTarget.setPointerCapture?.(e.pointerId); const p = relPos(e); setDrawing({ x0: p.x, y0: p.y, x1: p.x, y1: p.y }) }
  function onMove(e) { if (!drawing) return; const p = relPos(e); setDrawing(d => ({ ...d, x1: p.x, y1: p.y })) }
  function onUp() {
    if (!drawing) return
    const b = { x: Math.min(drawing.x0, drawing.x1), y: Math.min(drawing.y0, drawing.y1), w: Math.abs(drawing.x1 - drawing.x0), h: Math.abs(drawing.y1 - drawing.y0) }
    setDrawing(null)
    if (b.w > 0.03 && b.h > 0.03) { setBox(b); setDrawMode(false); reset() }
  }
  const shown = drawing ? { x: Math.min(drawing.x0, drawing.x1), y: Math.min(drawing.y0, drawing.y1), w: Math.abs(drawing.x1 - drawing.x0), h: Math.abs(drawing.y1 - drawing.y0) } : box

  // --- analysis ---
  async function analyse() {
    const v = videoRef.current
    if (!v || !box) return
    cancelRef.current = false
    reset(); setStatus('running'); setProgress(0)
    const W = v.videoWidth, H = v.videoHeight
    const sx = box.x * W, sy = box.y * H, sw = Math.max(1, box.w * W), sh = Math.max(1, box.h * H)
    const canvas = document.createElement('canvas'); canvas.width = GRID; canvas.height = GRID
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    let prev = null, first = null
    const out = []
    const grab = mediaTime => {
      ctx.drawImage(v, sx, sy, sw, sh, 0, 0, GRID, GRID)
      const d = ctx.getImageData(0, 0, GRID, GRID).data
      const g = new Float32Array(GRID * GRID)
      for (let i = 0, j = 0; i < d.length; i += 4, j++) g[j] = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]
      if (!first) first = g
      if (prev) {
        let sum = 0, sumR = 0
        for (let j = 0; j < g.length; j++) { sum += Math.abs(g[j] - prev[j]); sumR += Math.abs(g[j] - first[j]) }
        out.push({ t: mediaTime, s: sum / g.length, r: sumR / g.length })
      }
      prev = g
      setProgress(Math.min(1, (mediaTime - rs) / Math.max(0.001, re - rs)))
    }
    try {
      v.pause(); v.muted = true
      await new Promise(res => { v.addEventListener('seeked', res, { once: true }); v.currentTime = rs })
      if ('requestVideoFrameCallback' in HTMLVideoElement.prototype) {
        // Play through, grabbing every frame the browser shows. Faster than
        // real time for normal videos; slow-mo files already contain extra frames.
        v.playbackRate = slow > 1 ? 1 : 2
        await new Promise((res, rej) => {
          const onFrame = (_now, meta) => {
            if (cancelRef.current) { v.pause(); return rej(new Error('cancelled')) }
            if (meta.mediaTime > re || v.ended) { v.pause(); return res() }
            grab(meta.mediaTime)
            v.requestVideoFrameCallback(onFrame)
          }
          v.requestVideoFrameCallback(onFrame)
          v.addEventListener('ended', () => res(), { once: true })
          v.play().catch(rej)
        })
      } else {
        // Older browsers: step through by seeking (slower, ~30 samples per real second).
        const step = (slow || 1) / 30
        for (let tt = rs; tt <= re; tt += step) {
          if (cancelRef.current) throw new Error('cancelled')
          await new Promise(res => { v.addEventListener('seeked', res, { once: true }); v.currentTime = tt })
          grab(tt)
        }
      }
      v.playbackRate = 1
      setSeries(out)
      setStatus('done')
    } catch (err) {
      v.playbackRate = 1
      setStatus('idle')
      if (err.message !== 'cancelled') alert('Could not analyse this video: ' + err.message)
    }
  }

  function removeSelected() {
    if (selected == null) return
    const wasAdded = added.some(a => Math.abs(a - selected) < TOL)
    if (wasAdded) setAdded(a => a.filter(x => Math.abs(x - selected) >= TOL))
    else setRemoved(r => [...r, selected])
    setSelected(null)
  }
  function addAtPlayhead() {
    const at = videoRef.current?.currentTime ?? t
    if (hits.some(h => Math.abs(h - at) < TOL)) return
    setRemoved(r => r.filter(x => Math.abs(x - at) >= TOL))
    setAdded(a => [...a, at])
    setSelected(at)
  }

  const btn = { height: 44, minWidth: 44, padding: '0 12px', borderRadius: 8, border: '1px solid var(--border-strong, #444)', background: 'var(--bg-secondary, #1A1F24)', color: 'var(--text, #fff)', fontSize: 15, fontWeight: 700, cursor: 'pointer' }
  const sel = { padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border-strong, #444)', background: 'var(--bg-secondary, #111)', color: 'var(--text, #fff)', fontSize: 13 }
  const x = tt => `${((tt - rs) / Math.max(0.001, re - rs)) * 100}%`
  const maxResid = Math.max(detection.thresh * 1.5, ...detection.resid.filter(r => isFinite(r)), 1)

  return (
    <div role="dialog" aria-modal="true" style={{ position: 'fixed', inset: 0, zIndex, background: 'var(--bg, #0B0F12)', display: 'flex', flexDirection: 'column', color: 'var(--text, #fff)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderBottom: '1px solid var(--border, #2A3138)' }}>
        <button type="button" onClick={() => { cancelRef.current = true; onClose() }} style={{ ...btn, height: 36 }}>{initialUrl ? '← Back' : '✕'}</button>
        <h2 style={{ fontSize: 16, fontWeight: 700, flex: 1 }}>{title || (isReps ? '📹 Count reps from video' : '📹 Count punches from video')}</h2>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 14 }}>
        {!url ? (
          <div>
            <p style={{ fontSize: 14, lineHeight: 1.5, marginBottom: 12 }}>
              {isReps
                ? 'Film side-on with the phone kept still (on a stand or ledge), one athlete in view, starting in the start position (e.g. top of the push-up). Normal speed is fine. Then choose the video.'
                : 'Film the round with the phone kept still (on a stand or ledge), with the bag or pads clearly in view. Normal speed is fine. Then choose the video.'}
            </p>
            <label style={{ ...btn, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '100%', boxSizing: 'border-box' }}>
              Choose / record video
              <input type="file" accept="video/*" style={{ display: 'none' }} onChange={e => pickFile(e.target.files?.[0])} />
            </label>
          </div>
        ) : (
          <>
            <div ref={stageRef} style={{ position: 'relative', width: `min(100%, calc(45vh * ${aspect}))`, aspectRatio: aspect, margin: '0 auto', background: '#000', borderRadius: 8, overflow: 'hidden', touchAction: drawMode ? 'none' : 'auto' }}
              onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
              <video ref={videoRef} src={url} crossOrigin={url && !url.startsWith('blob:') ? 'anonymous' : undefined} playsInline muted preload="auto"
                onLoadedMetadata={e => { const v = e.currentTarget; setDur(v.duration || 0); if (v.videoWidth && v.videoHeight) setAspect(v.videoWidth / v.videoHeight) }}
                onTimeUpdate={e => setT(e.currentTarget.currentTime)} onEnded={() => setPlaying(false)}
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }} />
              {shown && <div style={{ position: 'absolute', left: `${shown.x * 100}%`, top: `${shown.y * 100}%`, width: `${shown.w * 100}%`, height: `${shown.h * 100}%`, border: '2px solid #EF9F27', boxShadow: '0 0 0 9999px rgba(0,0,0,0.35)', pointerEvents: 'none' }} />}
              {drawMode && !drawing && <div style={{ position: 'absolute', left: 0, right: 0, bottom: 8, textAlign: 'center', fontSize: 13, fontWeight: 700, textShadow: '0 1px 3px #000', pointerEvents: 'none' }}>{isReps ? 'Drag a box over the part that moves (e.g. head and shoulders)' : 'Drag a box over the bag / pads'}</div>}
            </div>

            <input type="range" min={0} max={dur || 0} step={0.01} value={t} onChange={e => seek(parseFloat(e.target.value))} disabled={status === 'running'} style={{ width: '100%', margin: '10px 0 4px' }} aria-label="Position" />
            <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
              <button type="button" style={btn} disabled={status === 'running'} onClick={() => seek((videoRef.current?.currentTime || 0) - 1)}>−1s</button>
              <button type="button" style={btn} disabled={status === 'running'} onClick={() => seek((videoRef.current?.currentTime || 0) - 1 / 30)}>◀</button>
              <button type="button" style={{ ...btn, minWidth: 64 }} disabled={status === 'running'} onClick={togglePlay}>{playing ? '❚❚' : '▶'}</button>
              <button type="button" style={btn} disabled={status === 'running'} onClick={() => seek((videoRef.current?.currentTime || 0) + 1 / 30)}>▶</button>
              <button type="button" style={btn} disabled={status === 'running'} onClick={() => seek((videoRef.current?.currentTime || 0) + 1)}>+1s</button>
            </div>

            {status !== 'running' && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                <button type="button" style={{ ...btn, flex: '1 1 120px', fontSize: 13, borderColor: drawMode ? '#EF9F27' : btn.border }} onClick={() => { setDrawMode(true); setBox(null); reset() }}>{box ? '↺ Redraw box' : 'Draw box'}</button>
                <button type="button" style={{ ...btn, flex: '1 1 120px', fontSize: 13, borderColor: roundStart != null ? '#22B14C' : btn.border }} onClick={() => { setRoundStart(videoRef.current?.currentTime ?? t); reset() }}>{roundStart != null ? `Start ${fmt(roundStart, 1)}s` : 'Mark round start'}</button>
                <button type="button" style={{ ...btn, flex: '1 1 120px', fontSize: 13, borderColor: roundEnd != null ? '#E24B4A' : btn.border }} onClick={() => { setRoundEnd(videoRef.current?.currentTime ?? t); reset() }}>{roundEnd != null ? `End ${fmt(roundEnd, 1)}s` : 'Mark round end'}</button>
              </div>
            )}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 6, fontSize: 13 }}>
              <label>Slow-mo playback{' '}
                <select value={slow} disabled={status === 'running'} onChange={e => { setSlow(+e.target.value); reset() }} style={sel}>
                  <option value={1}>Normal speed (×1)</option><option value={4}>Plays 4× slower</option><option value={8}>Plays 8× slower</option>
                </select>
              </label>
              <span style={{ color: 'var(--text-secondary, #9A9A9A)' }}>Counting {fmt(realDur, 0)} s{roundStart == null && roundEnd == null ? ' (whole video)' : ''}</span>
            </div>
            <p style={{ fontSize: 11, color: 'var(--text-tertiary, #777)', lineHeight: 1.45, margin: '0 0 12px' }}>
              {isReps
                ? 'Draw the box over the part that moves most (head and shoulders for push-ups, hips for squats), and mark the round start on a frame in the start position. Half reps may not count -- check and correct below.'
                : "Draw the box tight around where the punches land, so the athlete's body and other people stay outside it. Very fast combinations can merge into one -- check and correct below."}
            </p>

            {status === 'idle' && (
              <button type="button" disabled={!box || realDur <= 0} onClick={analyse}
                style={{ ...btn, width: '100%', background: box ? '#EF9F27' : btn.background, color: box ? '#0A0A0A' : btn.color, borderColor: 'transparent' }}>
                {box ? (isReps ? 'Count reps' : 'Count punches') : 'Draw a box first'}
              </button>
            )}
            {status === 'running' && (
              <div>
                <div style={{ height: 10, borderRadius: 5, background: 'var(--bg-secondary, #1A1F24)', overflow: 'hidden', marginBottom: 6 }}>
                  <div style={{ width: `${Math.round(progress * 100)}%`, height: '100%', background: '#EF9F27' }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-secondary, #9A9A9A)' }}>
                  <span>Watching the round… {Math.round(progress * 100)}%</span>
                  <button type="button" onClick={() => { cancelRef.current = true }} style={{ background: 'none', border: 'none', color: '#E24B4A', cursor: 'pointer' }}>Cancel</button>
                </div>
              </div>
            )}

            {status === 'done' && (
              <>
                <div style={{ padding: 14, borderRadius: 10, border: '1px solid #22B14C', background: 'var(--bg-secondary, #1A1F24)', textAlign: 'center', marginBottom: 10 }}>
                  <div style={{ fontSize: 34, fontWeight: 800, fontFamily: 'Orbitron, monospace' }}>{hits.length}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary, #9A9A9A)' }}>{isReps ? 'reps' : 'punches'} · {perMinute != null ? `${fmt(perMinute, 1)} per minute` : ''} · {fmt(realDur, 0)} s</div>
                  {splits.length > 1 && (
                    <div style={{ display: 'flex', gap: 4, justifyContent: 'center', marginTop: 8, flexWrap: 'wrap' }}>
                      {splits.map((c, i) => <span key={i} style={{ fontSize: 11, padding: '2px 6px', borderRadius: 6, border: '1px solid var(--border, #2A3138)' }}>{i * 30}–{Math.min((i + 1) * 30, Math.round(realDur))}s: <b>{c}</b></span>)}
                    </div>
                  )}
                </div>

                {/* Timeline: change inside the box, the threshold, and every counted hit. Tap a mark to check it. */}
                <div style={{ position: 'relative', height: 90, borderRadius: 8, background: 'var(--bg-secondary, #1A1F24)', overflow: 'hidden', marginBottom: 6 }}>
                  <svg viewBox="0 0 1000 90" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
                    <polyline fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="1.5" vectorEffect="non-scaling-stroke"
                      points={series.map((p, i) => `${((p.t - rs) / Math.max(0.001, re - rs)) * 1000},${88 - Math.max(0, detection.resid[i] || 0) / maxResid * 80}`).join(' ')} />
                    <line x1="0" x2="1000" y1={88 - detection.thresh / maxResid * 80} y2={88 - detection.thresh / maxResid * 80} stroke="#EF9F27" strokeDasharray="6 6" strokeWidth="1" vectorEffect="non-scaling-stroke" />
                  </svg>
                  {hits.map(h => (
                    <button key={h} type="button" onClick={() => { setSelected(h); seek(h) }} aria-label={`Hit at ${fmt(h, 2)} s`}
                      style={{ position: 'absolute', left: x(h), top: 0, bottom: 0, width: 14, marginLeft: -7, background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}>
                      <span style={{ position: 'absolute', left: 6, top: 4, bottom: 0, width: 2, background: selected != null && Math.abs(selected - h) < TOL ? '#fff' : added.some(a => Math.abs(a - h) < TOL) ? '#22B14C' : '#EF9F27' }} />
                    </button>
                  ))}
                  <span style={{ position: 'absolute', left: x(t), top: 0, bottom: 0, width: 1, background: '#E24B4A', pointerEvents: 'none' }} />
                </div>
                <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                  <button type="button" style={{ ...btn, flex: 1, fontSize: 13 }} disabled={selected == null} onClick={removeSelected}>✕ Remove selected</button>
                  <button type="button" style={{ ...btn, flex: 1, fontSize: 13 }} onClick={addAtPlayhead}>＋ Add hit at playhead</button>
                </div>
                <label style={{ display: 'block', fontSize: 13, marginBottom: 4 }}>Sensitivity: {sensitivity} {sensitivity <= 3 ? '(only clear hits)' : sensitivity >= 8 ? '(picks up lighter touches)' : ''}</label>
                <input type="range" min={1} max={10} step={1} value={sensitivity} onChange={e => setSensitivity(+e.target.value)} style={{ width: '100%' }} />
                <p style={{ fontSize: 11, color: 'var(--text-tertiary, #777)', lineHeight: 1.45, marginTop: 6 }}>
                  Orange marks = counted {isReps ? 'reps' : 'hits'} (green = added by you). Tap a mark to jump the video there and check it. Too many counts? Lower the sensitivity. Missing hits? Raise it, or add them at the playhead.
                </p>
              </>
            )}
          </>
        )}
      </div>

      {url && status === 'done' && (
        <div style={{ padding: 14, borderTop: '1px solid var(--border, #2A3138)', display: 'flex', gap: 8 }}>
          {!initialUrl && <button type="button" style={{ ...btn, flex: 1 }} onClick={() => { setUrl(null); setBox(null); setDrawMode(true); setRoundStart(null); setRoundEnd(null); reset() }}>Another video</button>}
          <button type="button" disabled={saving || perMinute == null} style={{ ...btn, flex: 2, background: '#22B14C', color: '#0A0A0A', borderColor: 'transparent' }}
            onClick={async () => { setSaving(true); try { await onSave({ perRound: hits.length, perMinute: +perMinute.toFixed(1) }); onClose() } finally { setSaving(false) } }}>
            {saving ? 'Saving…' : (isReps ? `Use ${hits.length} reps` : `Save ${hits.length} punches · ${fmt(perMinute, 1)}/min`)}
          </button>
        </div>
      )}
    </div>
  )
}
