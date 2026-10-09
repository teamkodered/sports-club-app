import { useEffect, useMemo, useRef, useState } from 'react'

// Bleep test player (Oct 2026). Plays the multistage shuttle-run beeps and
// lets the coach tap each athlete out; their score is the last shuttle they
// completed, saved as "level.shuttle" (e.g. 9.4) like typed bleep results.
//   20 m: the standard UK multistage test -- level 1 at 8.5 km/h, +0.5 km/h
//         per level, 7-16 shuttles per level (each level ~1 minute).
//   10 m: same speeds over 10 m shuttles, twice as many per level -- for
//         smaller halls. Not an official protocol, so it's saved as its own
//         test and never mixed with 20 m results.
// Beeps are scheduled on the Web Audio clock (accurate even if the screen
// stutters) and the screen is kept awake while it runs.

const SHUTTLES_20 = [7, 8, 8, 9, 9, 10, 10, 11, 11, 11, 12, 12, 13, 13, 13, 14, 14, 15, 15, 16, 16]
const COUNTDOWN_S = 5

function buildSchedule(course) {
  const out = []  // { level, shuttle, of, end } -- end = seconds after start
  let t = 0
  SHUTTLES_20.forEach((n20, i) => {
    const level = i + 1
    const speed = (8.5 + 0.5 * i) / 3.6
    const n = course === 10 ? n20 * 2 : n20
    const dt = course / speed
    for (let s = 1; s <= n; s++) { t += dt; out.push({ level, shuttle: s, of: n, end: t }) }
  })
  return out
}

const vo2 = (level, shuttle, of) => 3.46 * (level + shuttle / of) + 12.2 // common 20 m estimate

export default function BleepTestPlayer({ course = 20, runners: fixedRunners, candidates, onDone, onClose, zIndex = 480 }) {
  const schedule = useMemo(() => buildSchedule(course), [course])
  const ctxRef = useRef(null)
  const t0Ref = useRef(0)
  const rafRef = useRef(0)
  const wakeRef = useRef(null)
  const [phase, setPhase] = useState(fixedRunners ? 'ready' : 'pick') // pick | ready | running | results
  const [picked, setPicked] = useState(() => new Set())
  const [search, setSearch] = useState('')
  const [elapsed, setElapsed] = useState(-COUNTDOWN_S)
  const [outAt, setOutAt] = useState({})   // runner id -> index of last completed shuttle (-1 = none)
  const [edits, setEdits] = useState({})   // runner id -> edited "L.S" on the results screen
  const runners = fixedRunners || (candidates || []).filter(c => picked.has(c.id))

  useEffect(() => () => stopAudio(), [])

  function stopAudio() {
    cancelAnimationFrame(rafRef.current)
    try { ctxRef.current?.close() } catch { /* already closed */ }
    ctxRef.current = null
    try { wakeRef.current?.release() } catch { /* ignore */ }
    wakeRef.current = null
  }

  function beep(ctx, at, freq = 1000, len = 0.18) {
    const o = ctx.createOscillator(), g = ctx.createGain()
    o.type = 'square'; o.frequency.value = freq
    g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(0.5, at + 0.01)
    g.gain.setValueAtTime(0.5, at + len - 0.02); g.gain.exponentialRampToValueAtTime(0.0001, at + len)
    o.connect(g).connect(ctx.destination); o.start(at); o.stop(at + len + 0.02)
  }

  async function start() {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    ctxRef.current = ctx
    try { wakeRef.current = await navigator.wakeLock?.request('screen') } catch { /* not supported -- fine */ }
    const t0 = ctx.currentTime + COUNTDOWN_S
    t0Ref.current = t0
    for (let i = COUNTDOWN_S - 1; i >= 1; i--) beep(ctx, t0 - i, 600, 0.12)   // 4, 3, 2, 1
    beep(ctx, t0, 1200, 0.4)                                                // GO
    schedule.forEach((ev, i) => {
      const at = t0 + ev.end
      const levelUp = schedule[i + 1] && schedule[i + 1].level !== ev.level
      if (levelUp) { beep(ctx, at, 1200, 0.14); beep(ctx, at + 0.2, 1200, 0.14); beep(ctx, at + 0.4, 1200, 0.14) } // triple = new level
      else beep(ctx, at, 1000, 0.2)
    })
    setOutAt({}); setEdits({}); setPhase('running')
    const tick = () => {
      if (!ctxRef.current) return
      const e = ctxRef.current.currentTime - t0Ref.current
      setElapsed(e)
      if (e > schedule[schedule.length - 1].end + 1) { finish(); return }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
  }

  const done = elapsed <= 0 ? -1 : (() => { let lo = -1; for (let i = 0; i < schedule.length; i++) { if (schedule[i].end <= elapsed) lo = i; else break } return lo })()
  const current = schedule[Math.min(schedule.length - 1, done + 1)]
  const prevEnd = done >= 0 ? schedule[done].end : 0
  const shuttleFrac = elapsed > 0 ? Math.min(1, (elapsed - prevEnd) / (current.end - prevEnd)) : 0
  const scoreOf = idx => idx < 0 ? null : `${schedule[idx].level}.${schedule[idx].shuttle}`

  function toggleOut(id) {
    setOutAt(o => {
      const n = { ...o }
      if (n[id] != null) delete n[id]; else n[id] = done
      return n
    })
  }
  useEffect(() => {
    if (phase === 'running' && runners.length && runners.every(r => outAt[r.id] != null)) finish()
  }, [outAt]) // eslint-disable-line react-hooks/exhaustive-deps

  function finish() {
    stopAudio()
    setOutAt(o => { const n = { ...o }; runners.forEach(r => { if (n[r.id] == null) n[r.id] = done }); return n })
    setPhase('results')
  }

  const btn = { height: 44, minWidth: 44, padding: '0 14px', borderRadius: 8, border: '1px solid var(--border-strong, #444)', background: 'var(--bg-secondary, #1A1F24)', color: 'var(--text, #fff)', fontSize: 15, fontWeight: 700, cursor: 'pointer' }
  const q = search.trim().toLowerCase()

  return (
    <div role="dialog" aria-modal="true" style={{ position: 'fixed', inset: 0, zIndex, background: 'var(--bg, #0B0F12)', display: 'flex', flexDirection: 'column', color: 'var(--text, #fff)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderBottom: '1px solid var(--border, #2A3138)' }}>
        <button type="button" onClick={() => { if (phase !== 'running' || confirm('Stop the bleep test?')) { stopAudio(); onClose() } }} style={{ ...btn, height: 36 }}>✕</button>
        <h2 style={{ fontSize: 16, fontWeight: 700, flex: 1 }}>🏃 Bleep test · {course} m</h2>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 14 }}>
        {phase === 'pick' && (
          <>
            <p style={{ fontSize: 14, marginBottom: 8 }}>Who's running? ({picked.size} picked)</p>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…" style={{ width: '100%', padding: 10, borderRadius: 8, marginBottom: 8 }} />
            <div style={{ border: '1px solid var(--border, #2A3138)', borderRadius: 8, maxHeight: '55vh', overflowY: 'auto' }}>
              {(candidates || []).filter(c => !q || c.name.toLowerCase().includes(q)).map(c => (
                <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderBottom: '1px solid var(--border, #2A3138)', fontSize: 15 }}>
                  <input type="checkbox" checked={picked.has(c.id)} onChange={() => setPicked(p => { const n = new Set(p); n.has(c.id) ? n.delete(c.id) : n.add(c.id); return n })} />
                  {c.name}
                </label>
              ))}
            </div>
          </>
        )}

        {phase === 'ready' && (
          <div style={{ fontSize: 14, lineHeight: 1.55 }}>
            <p>Mark out <b>{course} m</b> between two lines. Connect the phone to a speaker if the room is loud.</p>
            <p style={{ marginTop: 8 }}>After a 5-second countdown, run to the other line before each beep. Three beeps = next level, slightly faster. {runners.length > 1 ? 'Tap a runner\'s name when they drop out (tap again to undo).' : 'Tap "Out" when you stop.'}</p>
            {course === 10 && <p style={{ marginTop: 8, color: '#EF9F27' }}>10 m version: same speeds over 10 m shuttles. Saved as its own test, not comparable with 20 m results.</p>}
          </div>
        )}

        {phase === 'running' && (
          <>
            <div style={{ textAlign: 'center', padding: '10px 0 14px' }}>
              {elapsed < 0 ? (
                <div style={{ fontSize: 64, fontWeight: 800, fontFamily: 'Orbitron, monospace' }}>{Math.ceil(-elapsed)}</div>
              ) : (
                <>
                  <div style={{ fontSize: 13, color: 'var(--text-secondary, #9A9A9A)' }}>LEVEL</div>
                  <div style={{ fontSize: 64, fontWeight: 800, fontFamily: 'Orbitron, monospace', lineHeight: 1 }}>{current.level}</div>
                  <div style={{ fontSize: 18, marginTop: 6 }}>Shuttle {current.shuttle} of {current.of}</div>
                  <div style={{ height: 10, borderRadius: 5, background: 'var(--bg-secondary, #1A1F24)', overflow: 'hidden', margin: '12px 0 6px' }}>
                    <div style={{ width: `${shuttleFrac * 100}%`, height: '100%', background: '#1D9E75' }} />
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary, #9A9A9A)' }}>{Math.floor(elapsed / 60)}:{String(Math.floor(elapsed % 60)).padStart(2, '0')} · last completed {scoreOf(done) || '—'}</div>
                </>
              )}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: runners.length > 1 ? 'repeat(auto-fill, minmax(140px, 1fr))' : '1fr', gap: 8 }}>
              {runners.map(r => {
                const out = outAt[r.id] != null
                return (
                  <button key={r.id} type="button" onClick={() => toggleOut(r.id)}
                    style={{ ...btn, height: runners.length > 1 ? 56 : 72, fontSize: runners.length > 1 ? 14 : 20, background: out ? 'var(--bg-secondary, #1A1F24)' : '#1D9E75', color: out ? 'var(--text-secondary, #9A9A9A)' : '#0A0A0A', borderColor: 'transparent', textDecoration: out ? 'line-through' : 'none' }}>
                    {runners.length > 1 ? r.name : 'Out'}{out ? ` · ${scoreOf(outAt[r.id]) || '—'}` : ''}
                  </button>
                )
              })}
            </div>
          </>
        )}

        {phase === 'results' && (
          <>
            <p style={{ fontSize: 14, marginBottom: 10 }}>Results (last completed shuttle). Tap a score to correct it.</p>
            {runners.map(r => {
              const idx = outAt[r.id]
              const val = edits[r.id] ?? scoreOf(idx) ?? ''
              const [lv, sh] = String(val).split('.').map(Number)
              const of = schedule.find(s => s.level === lv)?.of
              return (
                <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: '1px solid var(--border, #2A3138)' }}>
                  <span style={{ flex: 1, fontSize: 15 }}>{r.name}</span>
                  {course === 20 && lv > 0 && of && <span style={{ fontSize: 11, color: 'var(--text-secondary, #9A9A9A)' }}>≈ VO2 {vo2(lv, sh || 0, of).toFixed(1)}</span>}
                  <input value={val} onChange={e => setEdits(x => ({ ...x, [r.id]: e.target.value }))} inputMode="decimal" style={{ width: 70, textAlign: 'center', padding: 8, borderRadius: 6, fontSize: 16 }} aria-label={`${r.name} score`} />
                </div>
              )
            })}
          </>
        )}
      </div>

      <div style={{ padding: 14, borderTop: '1px solid var(--border, #2A3138)', display: 'flex', gap: 8 }}>
        {phase === 'pick' && <button type="button" disabled={!picked.size} style={{ ...btn, flex: 1, background: picked.size ? '#1D9E75' : btn.background, color: picked.size ? '#0A0A0A' : btn.color }} onClick={() => setPhase('ready')}>Next · {picked.size} runner{picked.size === 1 ? '' : 's'}</button>}
        {phase === 'ready' && <button type="button" style={{ ...btn, flex: 1, background: '#1D9E75', color: '#0A0A0A', borderColor: 'transparent' }} onClick={start}>▶ Start ({COUNTDOWN_S}s countdown)</button>}
        {phase === 'running' && <button type="button" style={{ ...btn, flex: 1 }} onClick={() => { if (confirm('End the test now? Anyone still running gets their last completed shuttle.')) finish() }}>■ End test</button>}
        {phase === 'results' && (
          <>
            <button type="button" style={{ ...btn, flex: 1 }} onClick={onClose}>Discard</button>
            <button type="button" style={{ ...btn, flex: 2, background: '#1D9E75', color: '#0A0A0A', borderColor: 'transparent' }}
              onClick={async () => {
                const res = {}
                runners.forEach(r => { const v = edits[r.id] ?? scoreOf(outAt[r.id]); if (v) res[r.id] = String(v) })
                await onDone(res); onClose()
              }}>Save results</button>
          </>
        )}
      </div>
    </div>
  )
}
