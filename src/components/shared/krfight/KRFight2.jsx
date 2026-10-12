import { useEffect, useRef, useState } from 'react'
import Phaser from 'phaser'
import { FgIcon } from '../FightGame.jsx'
import { FIGHTERS, CHARGE_MS } from './data.js'
import { makeSfx } from './sfx.js'
import { BootScene, TitleScene, SelectScene, FightScene, ResultsScene, UpgradeScene, Z } from './scenes.js'

// KR FIGHT 2 (Phaser). Same rules and controls as the classic game, new engine: jointed fighters,
// hit sparks, hit-stop, super cut-ins, KO slow-mo, title / select / fight / results scenes.
// React keeps the top bar and the touch controls; Phaser draws everything inside the arena.
const LS_MUTE = 'krfight-muted'
const BTN = 64 // every attack button the same size

// line icons for the two new buttons (same style as the others)
function PadIcon({ name, colour, size }) {
  const p = { fill: 'none', stroke: colour, strokeWidth: 2.2, strokeLinecap: 'round', strokeLinejoin: 'round' }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" style={{ filter: `drop-shadow(0 0 4px ${colour})` }}>
      {name === 'jump' && <g {...p}><path d="M6 13l6-6 6 6" /><path d="M6 19l6-6 6 6" /></g>}
      {name === 'shield' && <g {...p}><path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z" /><path d="M12 7v10" /></g>}
    </svg>
  )
}

export default function KRFight2({ onRound, onClose, onClassic }) {
  const hostRef = useRef(null)
  const gameRef = useRef(null)
  const [scene, setScene] = useState('boot')
  const [hud, setHud] = useState({ sp: 1, sup: 0 })
  const [muted, setMuted] = useState(() => { try { return localStorage.getItem(LS_MUTE) === '1' } catch (e) { return false } })
  const [failed, setFailed] = useState(null)
  const [landscape, setLandscape] = useState(() => typeof window !== 'undefined' && window.matchMedia('(orientation: landscape) and (max-height: 600px)').matches)
  useEffect(() => {
    const mq = window.matchMedia('(orientation: landscape) and (max-height: 600px)')
    const on = () => setLandscape(mq.matches)
    mq.addEventListener ? mq.addEventListener('change', on) : mq.addListener(on)
    return () => { mq.removeEventListener ? mq.removeEventListener('change', on) : mq.removeListener(on) }
  }, [])
  const input = useRef({ left: false, right: false, up: false, down: false, lp: false, hp: false, lk: false, hk: false, sp: false, super: false })
  const pressed = useRef({})
  const onRoundRef = useRef(onRound); onRoundRef.current = onRound
  const sfxRef = useRef(null)

  // ---- charging Punch / Kick: tap = Light, hold = Medium, long hold = Heavy; fires on release ----
  const charge = useRef({ punch: null, kick: null })
  const [chargeLv, setChargeLv] = useState({ punch: 0, kick: 0 })
  const chargeTimer = useRef(null)
  const levelOf = ms => ms >= CHARGE_MS.h ? 'h' : ms >= CHARGE_MS.m ? 'm' : 'l'
  function tickCharge() {
    const now = performance.now(), c = charge.current
    const lv = k => c[k] == null ? 0 : Math.min(1, (now - c[k]) / CHARGE_MS.h)
    setChargeLv({ punch: lv('punch'), kick: lv('kick') })
    if (c.punch != null || c.kick != null) chargeTimer.current = requestAnimationFrame(tickCharge)
    else chargeTimer.current = null
  }
  // times come from the input events themselves (when the finger/key actually went down/up), so a busy
  // phone that handles the event late can't turn a tap into a heavy
  function startCharge(kind, at) {
    if (charge.current[kind] != null) return
    charge.current[kind] = at ?? performance.now()
    if (!chargeTimer.current) chargeTimer.current = requestAnimationFrame(tickCharge)
  }
  function releaseCharge(kind, at) {
    const t0 = charge.current[kind]
    if (t0 == null) return
    charge.current[kind] = null
    const lv = levelOf((at ?? performance.now()) - t0)
    pressed.current[lv + (kind === 'punch' ? 'p' : 'k')] = true
    if (navigator.vibrate) navigator.vibrate(lv === 'h' ? 22 : lv === 'm' ? 14 : 8)
  }
  useEffect(() => () => cancelAnimationFrame(chargeTimer.current), [])

  // keyboard: arrows/WASD move, J punch and K kick (hold for power), I/up jump, B or Shift block, T tag, L/Space special, O/Enter super
  useEffect(() => {
    const map = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ArrowUp: 'up', KeyW: 'up', KeyI: 'up', ArrowDown: 'down', KeyS: 'down', KeyL: 'sp', Space: 'sp', KeyO: 'super', Enter: 'super', KeyB: 'block', ShiftLeft: 'block', ShiftRight: 'block', KeyT: 'tag' }
    const dn = e => {
      if (e.code === 'KeyJ' || e.code === 'KeyK') { e.preventDefault(); if (!e.repeat) startCharge(e.code === 'KeyJ' ? 'punch' : 'kick', e.timeStamp); return }
      const k = map[e.code]; if (!k) return; e.preventDefault(); if (!input.current[k]) pressed.current[k] = true; input.current[k] = true
    }
    const up = e => {
      if (e.code === 'KeyJ' || e.code === 'KeyK') { releaseCharge(e.code === 'KeyJ' ? 'punch' : 'kick', e.timeStamp); return }
      const k = map[e.code]; if (!k) return; input.current[k] = false
    }
    window.addEventListener('keydown', dn); window.addEventListener('keyup', up)
    return () => { window.removeEventListener('keydown', dn); window.removeEventListener('keyup', up) }
  }, [])

  // boot Phaser -- and rebuild it if it ever freezes (lost graphics after rotating / leaving the app)
  useEffect(() => {
    let dead = false, lastFrame = -1, stuckSince = 0, rebuilding = false
    const sfx = makeSfx(); sfxRef.current = sfx; sfx.setMuted(muted); sfx.resume()
    const fonts = document.fonts ? Promise.race([
      Promise.all(["italic 800 40px 'Saira Condensed'", "700 20px 'Rajdhani'", "600 20px 'Rajdhani'"].map(f => document.fonts.load(f).catch(() => {}))),
      new Promise(r => setTimeout(r, 1500)),
    ]) : Promise.resolve()

    function create(keep) {
      if (dead || !hostRef.current) return
      try {
        const game = new Phaser.Game({
          type: Phaser.AUTO, parent: hostRef.current, width: 800 * Z, height: 450 * Z, backgroundColor: '#05070A',
          // min size: while the phone is mid-rotation the arena can measure 0 x 0, which breaks the renderer
          scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH, min: { width: 160, height: 90 } },
          scene: [BootScene, TitleScene, SelectScene, FightScene, ResultsScene, UpgradeScene],
          input: { activePointers: 3, keyboard: false }, audio: { noAudio: true }, banner: false,
          render: { antialias: true, powerPreference: 'high-performance' },
        })
        game.bridge = { input: input.current, pressed: pressed.current, sfx, skipTitle: !!keep, onScene: s => !dead && setScene(s), onHud: h => !dead && setHud(h), onRound: () => onRoundRef.current?.() }
        if (keep?.cfg) game.cfg = keep.cfg
        game.canvas?.addEventListener('webglcontextlost', e => { e.preventDefault(); setTimeout(rebuild, 300) })
        gameRef.current = game
        lastFrame = -1; stuckSince = 0
        if (import.meta.env.DEV) window.__krgame = game
      } catch (e) { setFailed(String(e?.message || e)) }
    }
    // throw the old game away and start a fresh one on the select screen (same fighter / level)
    function rebuild() {
      if (dead || rebuilding) return
      rebuilding = true
      const old = gameRef.current
      const keep = { cfg: old?.cfg }
      sfx.stopMusic(); gameRef.current = null
      try { old?.destroy(true) } catch (e) { /* ignore */ }
      // a frozen loop never runs Phaser's own clean-up, so make sure the old canvas really goes
      setTimeout(() => { try { old?.loop?.stop(); if (old?.canvas?.parentNode) old.canvas.remove() } catch (e) { /* ignore */ } }, 120)
      setScene('boot')
      setTimeout(() => { rebuilding = false; create(keep) }, 150)
    }
    fonts.then(() => create(null))

    // watchdog: page visible but the game hasn't drawn a frame for 2.5 s -> rebuild it
    const watch = setInterval(() => {
      const g = gameRef.current
      if (!g || document.hidden || !g.isBooted) { stuckSince = 0; return }
      if (g.renderer?.contextLost) { rebuild(); return }
      const f = g.loop.frame
      if (f !== lastFrame) { lastFrame = f; stuckSince = 0; return }
      if (!stuckSince) stuckSince = Date.now()
      else if (Date.now() - stuckSince > 2500) rebuild()
    }, 500)

    // rotating: Android reports the new size late, so re-measure a few times
    const remeasure = () => { for (const ms of [100, 350, 800]) setTimeout(() => { try { gameRef.current?.scale.refresh() } catch (e) { /* ignore */ } }, ms) }
    // leaving / returning: silence everything while away, wake the sound and re-measure on return
    const vis = () => {
      if (document.hidden) { sfx.stopMusic(); sfx.suspend(); return }
      sfx.resume(); remeasure(); stuckSince = 0; lastFrame = -1
      const g = gameRef.current
      if (g?.scene.isActive('Fight')) sfx.music()
    }
    window.addEventListener('resize', remeasure)
    window.addEventListener('orientationchange', remeasure)
    document.addEventListener('visibilitychange', vis)
    return () => {
      dead = true; clearInterval(watch)
      window.removeEventListener('resize', remeasure); window.removeEventListener('orientationchange', remeasure)
      document.removeEventListener('visibilitychange', vis)
      try { gameRef.current?.destroy(true) } catch (e) { /* ignore */ }
      gameRef.current = null; sfx.close()
    }
  }, [])

  function toggleMute() {
    const m = !muted; setMuted(m); sfxRef.current?.setMuted(m)
    try { localStorage.setItem(LS_MUTE, m ? '1' : '0') } catch (e) { /* ignore */ }
  }
  function toSelect() {
    const g = gameRef.current; if (!g) return
    const active = g.scene.getScenes(true)[0]
    active?.scene.start('Select')
  }

  // ---- touch controls (same as the classic game) ----
  const stick = useRef({ id: null })
  const [knob, setKnob] = useState({ x: 0, y: 0 })
  const STICK_R = 78, DEAD = 14
  function setStickDirs(dx, dy) {
    const len = Math.hypot(dx, dy)
    const dirs = { left: false, right: false, up: false, down: false }
    if (len > DEAD) {
      const ang = Math.atan2(dy, dx) * 180 / Math.PI
      if (ang > -67.5 && ang < 67.5) dirs.right = true
      if (ang > 112.5 || ang < -112.5) dirs.left = true
      if (ang < -22.5 && ang > -157.5) dirs.up = true
      if (ang > 22.5 && ang < 157.5) dirs.down = true
    }
    for (const k of ['left', 'right', 'up', 'down']) { if (dirs[k] && !input.current[k]) pressed.current[k] = true; input.current[k] = dirs[k] }
  }
  function stickMove(e) {
    const r = e.currentTarget.getBoundingClientRect()
    let dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2)
    const len = Math.hypot(dx, dy), max = STICK_R - 22
    if (len > max) { dx = dx / len * max; dy = dy / len * max }
    setKnob({ x: dx, y: dy }); setStickDirs(dx, dy)
  }
  function stickEnd() { stick.current.id = null; setKnob({ x: 0, y: 0 }); setStickDirs(0, 0) }
  const stickHandlers = {
    onPointerDown: e => { e.preventDefault(); sfxRef.current?.resume(); e.currentTarget.setPointerCapture?.(e.pointerId); stick.current.id = e.pointerId; stickMove(e) },
    onPointerMove: e => { if (stick.current.id === e.pointerId) stickMove(e) },
    onPointerUp: e => { if (stick.current.id === e.pointerId) stickEnd() },
    onPointerCancel: () => stickEnd(),
  }
  const atkTouch = useRef({}), atkBtns = useRef({})
  function atkKeyAt(x, y) {
    let best = null, bestD = Infinity
    for (const [k, el] of Object.entries(atkBtns.current)) {
      if (!el) continue
      const r = el.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2
      const d = Math.hypot(x - cx, y - cy)
      if (x >= r.left - 4 && x <= r.right + 4 && y >= r.top - 4 && y <= r.bottom + 4 && d < bestD) { best = k; bestD = d }
    }
    return best
  }
  function atkSet(id, k, at) {
    const prev = atkTouch.current[id]
    if (prev === k) return
    const stillHeld = key => Object.entries(atkTouch.current).some(([pid, v]) => pid !== String(id) && v === key)
    // leaving a button
    if (prev === 'punch' || prev === 'kick') { if (!stillHeld(prev)) releaseCharge(prev, at) }
    else if (prev === 'block') { if (!stillHeld('block')) input.current.block = false }
    // entering a button
    if (k === 'punch' || k === 'kick') startCharge(k, at)
    else if (k === 'block') input.current.block = true
    else if (k === 'jump') pressed.current.up = true
    else if (k) pressed.current[k] = true // special / super fire straight away
    if (k && navigator.vibrate) navigator.vibrate(6)
    if (k) atkTouch.current[id] = k; else delete atkTouch.current[id]
  }
  const atkPadHandlers = {
    onPointerDown: e => { e.preventDefault(); sfxRef.current?.resume(); e.currentTarget.setPointerCapture?.(e.pointerId); atkSet(e.pointerId, atkKeyAt(e.clientX, e.clientY), e.timeStamp) },
    onPointerMove: e => { if (e.pointerId in atkTouch.current || e.buttons) atkSet(e.pointerId, atkKeyAt(e.clientX, e.clientY), e.timeStamp) },
    onPointerUp: e => atkSet(e.pointerId, null, e.timeStamp),
    onPointerCancel: e => atkSet(e.pointerId, null, e.timeStamp),
  }

  const pick = gameRef.current?.cfg?.pick ?? 0
  const pad = { height: 36, padding: '0 12px', borderRadius: 12, border: '1px solid #2A3138', background: 'rgba(26,31,36,0.85)', color: '#F2F2F2', fontSize: 14, fontWeight: 800, touchAction: 'none', userSelect: 'none', cursor: 'pointer' }
  const fight = scene === 'fight'

  return (
    <div role="dialog" aria-modal="true" aria-label="KR Fight" style={{ position: 'fixed', inset: 0, zIndex: 495, background: '#05070A', color: '#F2F2F2', display: 'flex', flexDirection: 'column', userSelect: 'none', WebkitUserSelect: 'none', touchAction: 'none' }}
      onContextMenu={e => e.preventDefault()}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: landscape ? '4px calc(10px + env(safe-area-inset-right, 0px)) 4px calc(10px + env(safe-area-inset-left, 0px))' : 'calc(8px + env(safe-area-inset-top, 0px)) 12px 8px' }}>
        <button type="button" onClick={onClose} style={pad}>Close</button>
        <div style={{ fontFamily: "'Saira Condensed', sans-serif", fontStyle: 'italic', fontWeight: 800, fontSize: 22, letterSpacing: 1, flex: 1 }}>KR FIGHT</div>
        <button type="button" onClick={toggleMute} style={pad} aria-label={muted ? 'Sound on' : 'Sound off'}>{muted ? 'Sound off' : 'Sound on'}</button>
        {fight && <button type="button" onClick={toSelect} style={pad}>Fighters</button>}
        {!fight && onClassic && <button type="button" onClick={onClassic} style={{ ...pad, color: '#9AA3AE' }}>Classic</button>}
      </div>

      <div style={landscape
        ? { flex: 1, minHeight: 0, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }
        : { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: fight ? 'space-between' : 'center', paddingBottom: 'calc(10px + env(safe-area-inset-bottom, 0px))' }}>
        <div ref={hostRef} style={landscape
          ? { position: 'relative', height: '100%', maxWidth: '100%', aspectRatio: '16 / 9' }
          : { position: 'relative', width: '100%', maxWidth: 900, aspectRatio: '16 / 9' }}>
          {scene === 'boot' && !failed && <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9AA3AE', fontSize: 14 }}>Loading…</div>}
          {failed && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 16, fontSize: 14 }}>
              <div>KR FIGHT 2 couldn't start on this device.</div>
              {onClassic && <button type="button" onClick={onClassic} style={pad}>Play the classic version</button>}
            </div>
          )}
        </div>

        {!landscape && !fight && scene !== 'boot' && typeof window !== 'undefined' && window.innerHeight > window.innerWidth && (
          <div style={{ marginTop: 14, fontSize: 13, color: '#9AA3AE', textAlign: 'center', padding: '0 20px' }}>Turn your phone sideways for a bigger arena.</div>
        )}
        {fight && (
          <div style={landscape
            ? { position: 'absolute', left: 0, right: 0, bottom: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', pointerEvents: 'none', boxSizing: 'border-box',
                padding: '0 calc(14px + env(safe-area-inset-right, 0px)) calc(10px + env(safe-area-inset-bottom, 0px)) calc(14px + env(safe-area-inset-left, 0px))' }
            : { width: '100%', maxWidth: 900, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', padding: '10px 14px', boxSizing: 'border-box' }}
            className={landscape ? 'fg-ls-controls' : undefined}>
            <div className="fg-stick" {...stickHandlers} role="group" aria-label="Joystick: drag to move, push up to jump, down to crouch"
              style={{ width: STICK_R * 2, height: STICK_R * 2, borderRadius: '50%', position: 'relative', touchAction: 'none', flexShrink: 0,
                border: '3px solid rgba(220,220,220,0.55)', boxShadow: 'inset 0 0 0 10px rgba(255,255,255,0.04), 0 0 0 1px rgba(0,0,0,0.4)', background: 'rgba(10,12,16,0.25)' }}>
              <div style={{ position: 'absolute', inset: 22, borderRadius: '50%', border: '1.5px solid rgba(220,220,220,0.25)', pointerEvents: 'none' }} />
              {[0, 90, 180, 270].map(r => (
                <span key={r} style={{ position: 'absolute', left: '50%', top: '50%', width: 0, height: 0, pointerEvents: 'none',
                  transform: `translate(-50%, -50%) rotate(${r}deg) translateY(-44px)`,
                  borderLeft: '7px solid transparent', borderRight: '7px solid transparent', borderBottom: '9px solid rgba(230,230,230,0.8)' }} />
              ))}
              <div style={{ position: 'absolute', left: '50%', top: '50%', width: 58, height: 58, borderRadius: '50%', pointerEvents: 'none', boxSizing: 'border-box',
                transform: `translate(calc(-50% + ${knob.x}px), calc(-50% + ${knob.y}px))`, transition: stick.current.id == null ? 'transform 0.12s' : 'none',
                border: '7px solid rgba(240,240,240,0.92)', background: 'rgba(255,255,255,0.06)', boxShadow: '0 2px 8px rgba(0,0,0,0.6)' }} />
            </div>
            <div {...atkPadHandlers} className="fg-atkpad" role="group" aria-label="Attack buttons"
              style={{ display: 'grid', gridTemplateColumns: `repeat(3, ${BTN}px)`, gridAutoRows: `${BTN}px`, gap: 10, touchAction: 'none', flexShrink: 0 }}>
              {[
                { k: 'sp', icon: hud.special || FIGHTERS[pick]?.special || 'bolt', label: 'Special', bg: hud.colour || FIGHTERS[pick]?.colour || '#F5C542', ring: hud.sp },
                { k: 'punch', icon: 'glove', label: 'Punch: tap light, hold medium, long hold heavy', bg: '#F2F2F2', charge: chargeLv.punch },
                { k: 'jump', icon: 'jump', label: 'Jump', bg: '#9AA3AE' },
                { k: 'super', icon: 'bolt', label: 'Super', bg: '#F5C542', ring: hud.sup },
                { k: 'kick', icon: 'kick', label: 'Kick: tap light, hold medium, long hold heavy', bg: '#378ADD', charge: chargeLv.kick },
                { k: 'block', icon: 'shield', label: 'Block (hold)', bg: '#8FD3FF' },
              ].map(b => {
                const ready = b.ring == null || b.ring >= 1
                // charge ring: white (light) -> gold (medium) -> red (heavy)
                const cl = b.charge || 0, lvCol = cl >= 1 ? '#FF4D3D' : cl >= CHARGE_MS.m / CHARGE_MS.h ? '#F5C542' : '#F2F2F2'
                const ringBg = b.charge != null && cl > 0 ? `conic-gradient(${lvCol} ${Math.round(cl * 360)}deg, rgba(42,49,56,0.9) 0)`
                  : b.ring != null ? `conic-gradient(${b.bg} ${Math.round(b.ring * 360)}deg, rgba(42,49,56,0.9) 0)` : 'rgba(42,49,56,0.6)'
                const glow = (b.ring != null && ready) ? `0 0 14px ${b.bg}` : cl >= 1 ? '0 0 16px #FF4D3D' : 'none'
                return (
                  <div key={b.k} ref={el => { atkBtns.current[b.k] = el }} className={b.ring != null && ready ? 'fg-ready' : undefined}
                    style={{ width: BTN, height: BTN, borderRadius: 16, padding: 4, boxSizing: 'border-box', background: ringBg, boxShadow: glow }}>
                    <button type="button" data-atk={b.k} aria-label={b.label}
                      style={{ width: '100%', height: '100%', borderRadius: 12, border: `2px solid ${b.bg}`, touchAction: 'none', userSelect: 'none', cursor: 'pointer',
                        background: 'radial-gradient(circle at 35% 30%, #2A3138, #0B0E12 80%)', boxShadow: `inset 0 0 10px ${b.bg}44`,
                        opacity: ready ? 1 : 0.5, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
                        transform: cl > 0 ? `scale(${1 - cl * 0.06})` : 'none' }}>
                      {b.icon === 'jump' || b.icon === 'shield' ? <PadIcon name={b.icon} colour={b.bg} size={Math.round(BTN * 0.46)} /> : <FgIcon name={b.icon} colour={b.bg} size={Math.round(BTN * 0.5)} />}
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
