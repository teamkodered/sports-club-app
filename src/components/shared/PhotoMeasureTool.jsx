import { useEffect, useRef, useState } from 'react'

// 📷 Measure a stretch from a photo (Oct 2026).
//   1. Photo taken square-on, with something of known length in the shot at
//      the same distance from the camera as the stretch (a 30 cm ruler, a
//      taped line on the floor, a mat edge you've measured).
//   2. Scale: tap both ends of that object and type its length.
//   3. Measure: tap the two points to measure (e.g. heel to floor) -> cm,
//      saved into the chosen Stretches test.
//   Angle mode: tap three points (e.g. hip, knee, ankle) -> joint angle in
//   degrees (shown for coaching; not saved -- the Stretches tests are in cm).
// Points can be dragged to fine-tune; zoom in for precise placement.

const COLOURS = { scale: '#EF9F27', measure: '#22B14C', angle: '#378ADD' }
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y)

export default function PhotoMeasureTool({ tests = [], onSave, onClose, zIndex = 480 }) {
  const imgRef = useRef(null)
  const dragRef = useRef(null)
  const [url, setUrl] = useState(null)
  const [nat, setNat] = useState({ w: 1, h: 1 })
  const [zoom, setZoom] = useState(1)
  const [mode, setMode] = useState('scale')      // scale | measure | angle
  const [pts, setPts] = useState({ scale: [], measure: [], angle: [] })
  const [refCm, setRefCm] = useState('30')
  const [test, setTest] = useState(tests[0] || '')
  const [saving, setSaving] = useState(false)
  useEffect(() => () => { if (url) URL.revokeObjectURL(url) }, [url])

  const need = { scale: 2, measure: 2, angle: 3 }
  const toNat = e => {
    const r = imgRef.current.getBoundingClientRect()
    return { x: (e.clientX - r.left) / r.width * nat.w, y: (e.clientY - r.top) / r.height * nat.h }
  }
  function onImgDown(e) {
    if (dragRef.current) return
    if (pts[mode].length >= need[mode]) return
    const p = toNat(e)
    setPts(s => ({ ...s, [mode]: [...s[mode], p] }))
  }
  function onHandleDown(e, m, i) { e.stopPropagation(); e.currentTarget.setPointerCapture?.(e.pointerId); dragRef.current = { m, i } }
  function onMove(e) {
    if (!dragRef.current) return
    const { m, i } = dragRef.current
    const p = toNat(e)
    setPts(s => ({ ...s, [m]: s[m].map((q, j) => j === i ? p : q) }))
  }
  function onUp() { setTimeout(() => { dragRef.current = null }, 0) }

  const scalePx = pts.scale.length === 2 ? dist(pts.scale[0], pts.scale[1]) : null
  const cmPerPx = scalePx && parseFloat(refCm) > 0 ? parseFloat(refCm) / scalePx : null
  const measureCm = cmPerPx && pts.measure.length === 2 ? dist(pts.measure[0], pts.measure[1]) * cmPerPx : null
  const angleDeg = pts.angle.length === 3 ? (() => {
    const [a, b, c] = pts.angle
    const v1 = { x: a.x - b.x, y: a.y - b.y }, v2 = { x: c.x - b.x, y: c.y - b.y }
    const cos = (v1.x * v2.x + v1.y * v2.y) / (Math.hypot(v1.x, v1.y) * Math.hypot(v2.x, v2.y) || 1)
    return Math.acos(Math.max(-1, Math.min(1, cos))) * 180 / Math.PI
  })() : null

  const btn = { height: 44, minWidth: 44, padding: '0 12px', borderRadius: 8, border: '1px solid var(--border-strong, #444)', background: 'var(--bg-secondary, #1A1F24)', color: 'var(--text, #fff)', fontSize: 14, fontWeight: 700, cursor: 'pointer' }
  const sel = { padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border-strong, #444)', background: 'var(--bg-secondary, #111)', color: 'var(--text, #fff)', fontSize: 13 }
  const hint = mode === 'scale' ? (pts.scale.length < 2 ? `Tap both ends of the ruler / known length (${2 - pts.scale.length} left)` : 'Scale set -- drag the dots to fine-tune')
    : mode === 'measure' ? (!cmPerPx ? 'Set the scale first' : pts.measure.length < 2 ? `Tap the two points to measure (${2 - pts.measure.length} left)` : 'Drag the dots to fine-tune')
    : (pts.angle.length < 3 ? `Tap 3 points, the joint in the middle (${3 - pts.angle.length} left)` : 'Drag the dots to fine-tune')
  const r = Math.max(nat.w, nat.h) / 120  // dot size in image pixels

  return (
    <div role="dialog" aria-modal="true" style={{ position: 'fixed', inset: 0, zIndex, background: 'var(--bg, #0B0F12)', display: 'flex', flexDirection: 'column', color: 'var(--text, #fff)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderBottom: '1px solid var(--border, #2A3138)' }}>
        <button type="button" onClick={onClose} style={{ ...btn, height: 36 }}>✕</button>
        <h2 style={{ fontSize: 16, fontWeight: 700, flex: 1 }}>📷 Measure from a photo</h2>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: 14 }}>
        {!url ? (
          <div>
            <p style={{ fontSize: 14, lineHeight: 1.5, marginBottom: 12 }}>
              Take the photo square-on to the stretch, with a ruler or a measured line in the shot at the same distance from the camera as the athlete (e.g. on the floor beside them). Then choose the photo.
            </p>
            <label style={{ ...btn, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '100%', boxSizing: 'border-box' }}>
              Choose / take photo
              <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) { setUrl(URL.createObjectURL(f)); setPts({ scale: [], measure: [], angle: [] }); setMode('scale') } }} />
            </label>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
              {[['scale', '1 · Scale'], ['measure', '2 · Measure cm'], ['angle', 'Angle']].map(([k, l]) => (
                <button key={k} type="button" onClick={() => setMode(k)} style={{ ...btn, flex: 1, height: 38, fontSize: 13, borderColor: mode === k ? COLOURS[k] : btn.border, color: mode === k ? COLOURS[k] : btn.color }}>{l}</button>
              ))}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginBottom: 8, flexWrap: 'wrap' }}>
              <span style={{ flex: 1, color: COLOURS[mode] }}>{hint}</span>
              <button type="button" style={{ ...btn, height: 32, fontSize: 12 }} onClick={() => setPts(s => ({ ...s, [mode]: [] }))}>Clear</button>
              <select value={zoom} onChange={e => setZoom(+e.target.value)} style={sel} aria-label="Zoom">{[1, 2, 3].map(z => <option key={z} value={z}>{z}× zoom</option>)}</select>
            </div>
            <div style={{ overflow: 'auto', maxHeight: '55vh', borderRadius: 8, background: '#000' }}>
              <div style={{ position: 'relative', width: `${zoom * 100}%`, touchAction: 'none' }} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
                <img ref={imgRef} src={url} alt="Stretch to measure" onLoad={e => setNat({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
                  onPointerDown={onImgDown} draggable={false} style={{ width: '100%', display: 'block', userSelect: 'none' }} />
                <svg viewBox={`0 0 ${nat.w} ${nat.h}`} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
                  {Object.entries(pts).map(([m, list]) => (
                    <g key={m} stroke={COLOURS[m]} fill={COLOURS[m]} opacity={m === mode ? 1 : 0.5}>
                      {list.length > 1 && <polyline points={list.map(p => `${p.x},${p.y}`).join(' ')} fill="none" strokeWidth={r / 2.5} />}
                      {list.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={r} fillOpacity="0.35" strokeWidth={r / 4}
                        style={{ pointerEvents: 'all', cursor: 'grab' }} onPointerDown={e => onHandleDown(e, m, i)} />)}
                    </g>
                  ))}
                </svg>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', margin: '10px 0', fontSize: 13 }}>
              <label>Known length <input type="number" inputMode="decimal" value={refCm} onChange={e => setRefCm(e.target.value)} style={{ ...sel, width: 70 }} /> cm</label>
              {tests.length > 0 && <label>Save to <select value={test} onChange={e => setTest(e.target.value)} style={sel}>{tests.map(t => <option key={t} value={t}>{t}</option>)}</select></label>}
            </div>

            <div style={{ padding: 14, borderRadius: 10, border: '1px solid var(--border, #2A3138)', background: 'var(--bg-secondary, #1A1F24)', textAlign: 'center' }}>
              {mode === 'angle' ? (
                <div style={{ fontSize: 34, fontWeight: 800, fontFamily: 'Orbitron, monospace' }}>{angleDeg != null ? `${angleDeg.toFixed(0)}°` : '—'}</div>
              ) : (
                <>
                  <div style={{ fontSize: 34, fontWeight: 800, fontFamily: 'Orbitron, monospace' }}>{measureCm != null ? `${measureCm.toFixed(1)} cm` : '—'}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary, #9A9A9A)' }}>{cmPerPx ? 'Scale set' : 'Set the scale first (step 1)'}</div>
                </>
              )}
            </div>
          </>
        )}
      </div>
      {url && (
        <div style={{ padding: 14, borderTop: '1px solid var(--border, #2A3138)', display: 'flex', gap: 8 }}>
          <button type="button" style={{ ...btn, flex: 1 }} onClick={() => { setUrl(null); setPts({ scale: [], measure: [], angle: [] }) }}>Another photo</button>
          <button type="button" disabled={measureCm == null || !test || saving}
            style={{ ...btn, flex: 2, background: measureCm != null ? '#22B14C' : btn.background, color: measureCm != null ? '#0A0A0A' : btn.color, borderColor: 'transparent' }}
            onClick={async () => { setSaving(true); try { await onSave(test, +measureCm.toFixed(1)); onClose() } finally { setSaving(false) } }}>
            {saving ? 'Saving…' : measureCm == null ? 'Measure to save' : `Save ${measureCm.toFixed(1)} cm`}
          </button>
        </div>
      )}
    </div>
  )
}
