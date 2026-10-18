import { useEffect, useRef, useState } from 'react'
import Phaser from 'phaser'
import { FgIcon } from '../FightGame.jsx'
import { FIGHTERS, CHARGE_MS, PLAY_STYLES, getPlayStyle, setPlayStyle, isBoxerStyle } from './data.js'
import { makeSfx } from './sfx.js'
import { BootScene, TitleScene, SelectScene, FightScene, ResultsScene, UpgradeScene, CombosScene, BranchScene, FighterScene, CollectionScene, ArenaScene, Z } from './scenes.js'

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
      {name === 'combo' && <g {...p}><path d="M4 7l4 5-4 5" /><path d="M10 7l4 5-4 5" /><path d="M16 7l4 5-4 5" /></g>}
    </svg>
  )
}

// small joystick (Boxer play style), the same size as the round buttons. onChange(dx, dy, held): dx / dy in
// -1..1 (screen directions), held = a finger is on it.
function MiniStick({ size = 64, colour = '#E6E6E6', label, onChange }) {
  const [knob, setKnob] = useState({ x: 0, y: 0 })
  const id = useRef(null)
  const R = size / 2, max = R - 12
  const move = e => {
    const r = e.currentTarget.getBoundingClientRect()
    let dx = e.clientX - (r.left + R), dy = e.clientY - (r.top + R)
    const len = Math.hypot(dx, dy); if (len > max) { dx = dx / len * max; dy = dy / len * max }
    setKnob({ x: dx, y: dy }); onChange(dx / max, dy / max, true)
  }
  const end = () => { id.current = null; setKnob({ x: 0, y: 0 }); onChange(0, 0, false) }
  return (
    <div role="group" aria-label={label}
      onPointerDown={e => { e.preventDefault(); e.stopPropagation(); e.currentTarget.setPointerCapture?.(e.pointerId); id.current = e.pointerId; move(e) }}
      onPointerMove={e => { if (id.current === e.pointerId) move(e) }}
      onPointerUp={e => { if (id.current === e.pointerId) end() }} onPointerCancel={end}
      style={{ width: size, height: size, borderRadius: '50%', position: 'relative', touchAction: 'none', pointerEvents: 'auto', boxSizing: 'border-box',
        border: `2px solid ${colour}88`, background: 'rgba(10,12,16,0.35)', boxShadow: 'inset 0 0 0 5px rgba(255,255,255,0.04)' }}>
      <div style={{ position: 'absolute', left: '50%', top: '50%', width: 28, height: 28, borderRadius: '50%', pointerEvents: 'none', boxSizing: 'border-box',
        transform: `translate(calc(-50% + ${knob.x}px), calc(-50% + ${knob.y}px))`, transition: id.current == null ? 'transform 0.12s' : 'none',
        border: `4px solid ${colour}`, background: 'rgba(255,255,255,0.08)', boxShadow: '0 2px 6px rgba(0,0,0,0.6)' }} />
    </div>
  )
}

export default function KRFight2({ onRound, onClose, onClassic }) {
  const hostRef = useRef(null)
  const gameRef = useRef(null)
  const [scene, setScene] = useState('boot')
  const [hud, setHud] = useState({ sp: 1, sup: 0 })
  const [muted, setMuted] = useState(() => { try { return localStorage.getItem(LS_MUTE) === '1' } catch (e) { return false } })
  const [failed, setFailed] = useState(null)
  // play style (control scheme): KR (punch / kick with hold for power) or SF (six buttons, motion specials)
  const [playStyle, setPlayStyleState] = useState(getPlayStyle)
  const playStyleRef = useRef(playStyle); playStyleRef.current = playStyle
  const paused = useRef(false)
  const [landscape, setLandscape] = useState(() => typeof window !== 'undefined' && window.matchMedia('(orientation: landscape) and (max-height: 600px)').matches)
  useEffect(() => {
    const mq = window.matchMedia('(orientation: landscape) and (max-height: 600px)')
    const on = () => setLandscape(mq.matches)
    mq.addEventListener ? mq.addEventListener('change', on) : mq.addListener(on)
    return () => { mq.removeEventListener ? mq.removeEventListener('change', on) : mq.removeListener(on) }
  }, [])
  const input = useRef({ left: false, right: false, up: false, down: false, lp: false, hp: false, lk: false, hk: false, sp: false, super: false })
  const pressed = useRef({})
  const gestures = useRef([]) // Boxer play style: queued touch gestures
  const onRoundRef = useRef(onRound); onRoundRef.current = onRound
  const onCloseRef = useRef(onClose); onCloseRef.current = onClose
  const sfxRef = useRef(null)

  // ---- landscape only ----
  const [portrait, setPortrait] = useState(() => typeof window !== 'undefined' && window.innerHeight > window.innerWidth)
  useEffect(() => {
    const on = () => setPortrait(window.innerHeight > window.innerWidth)
    window.addEventListener('resize', on); window.addEventListener('orientationchange', on)
    // where the phone allows it (installed app / full screen), lock the game to landscape
    try { window.screen?.orientation?.lock?.('landscape').catch(() => {}) } catch (e) { /* not supported */ }
    return () => { window.removeEventListener('resize', on); window.removeEventListener('orientationchange', on); try { window.screen?.orientation?.unlock?.() } catch (e) { /* ignore */ } }
  }, [])
  // pause the game while it's upright
  useEffect(() => { const g = gameRef.current; if (!g) return; try { portrait ? g.loop.sleep() : g.loop.wake() } catch (e) { /* ignore */ } }, [portrait])
  const portraitRef = useRef(portrait); portraitRef.current = portrait

  // ---- charging Punch / Kick: tap = Light, hold = Medium, long hold = Heavy; fires on release ----
  const charge = useRef({ punch: null, kick: null })
  const [chargeLv, setChargeLv] = useState({ punch: 0, kick: 0 })
  const chargeShown = useRef({ punch: 0, kick: 0 })
  const chargeTimer = useRef(null)
  const levelOf = ms => ms >= CHARGE_MS.h ? 'h' : ms >= CHARGE_MS.m ? 'm' : 'l'
  function tickCharge() {
    const now = performance.now(), c = charge.current
    const lv = k => c[k] == null ? 0 : Math.min(1, (now - c[k]) / CHARGE_MS.h)
    // only re-render when the ring visibly changes (holding a button used to re-render every frame)
    const np = lv('punch'), nk = lv('kick'), last = chargeShown.current
    if (Math.abs(np - last.punch) > 0.05 || Math.abs(nk - last.kick) > 0.05 || (np === 0) !== (last.punch === 0) || (nk === 0) !== (last.kick === 0) || (np >= 1) !== (last.punch >= 1) || (nk >= 1) !== (last.kick >= 1)) {
      chargeShown.current = { punch: np, kick: nk }; setChargeLv({ punch: np, kick: nk })
    }
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
    const SF_KEYS = { KeyU: 'lp', KeyI: 'mp', KeyO: 'hp', KeyJ: 'lk', KeyK: 'mk', KeyL: 'hk' }
    const dn = e => {
      if (playStyleRef.current === 'sf' && SF_KEYS[e.code]) { e.preventDefault(); if (!e.repeat) pressed.current[SF_KEYS[e.code]] = true; return }
      if (e.code === 'KeyJ' || e.code === 'KeyK') { e.preventDefault(); if (!e.repeat) startCharge(e.code === 'KeyJ' ? 'punch' : 'kick', e.timeStamp); return }
      const k = map[e.code]; if (!k) return; e.preventDefault(); if (!input.current[k]) pressed.current[k] = true; input.current[k] = true
    }
    const up = e => {
      if (playStyleRef.current === 'sf' && SF_KEYS[e.code]) return
      if (e.code === 'KeyJ' || e.code === 'KeyK') { releaseCharge(e.code === 'KeyJ' ? 'punch' : 'kick', e.timeStamp); return }
      const k = map[e.code]; if (!k) return; input.current[k] = false
    }
    window.addEventListener('keydown', dn); window.addEventListener('keyup', up)
    return () => { window.removeEventListener('keydown', dn); window.removeEventListener('keyup', up) }
  }, [])

  // phone / browser Back: step back through the game's screens instead of leaving the game
  const BACK_TO = { Arena: 'Select', Collection: 'Select', Upgrade: 'Fighter', Branch: 'Fighter', Combos: 'Fighter', Fighter: 'Select', Fight: 'Select', Results: 'Select', Select: 'Title' }
  useEffect(() => {
    try { window.history.pushState({ krfight: 1 }, '') } catch (e) { /* ignore */ }
    const onPop = () => {
      const g = gameRef.current
      const cur = g && g.scene.getScenes(true)[0], key = cur && cur.scene.key
      const to = key && BACK_TO[key]
      if (to && cur) {
        try { window.history.pushState({ krfight: 1 }, '') } catch (e) { /* ignore */ }
        cur.scene.start(to, { pick: g.cfg ? g.cfg.pick : 0 })
      } else onCloseRef.current?.()   // on the title screen, Back leaves the game
    }
    window.addEventListener('popstate', onPop)
    return () => {
      window.removeEventListener('popstate', onPop)
      // closed with the Close button: take our extra history step back off so the next Back works normally
      try { if (window.history.state && window.history.state.krfight) window.history.back() } catch (e) { /* ignore */ }
    }
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
          type: Phaser.AUTO, parent: hostRef.current, width: 800 * Z, height: 450 * Z, transparent: true, // see-through so the 3D fight can show behind
          // min size: while the phone is mid-rotation the arena can measure 0 x 0, which breaks the renderer
          scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH, min: { width: 160, height: 90 } },
          scene: [BootScene, TitleScene, SelectScene, FightScene, ResultsScene, UpgradeScene, CombosScene, BranchScene, FighterScene, CollectionScene, ArenaScene],
          input: { activePointers: 3, keyboard: false }, audio: { noAudio: true }, banner: false,
          render: { antialias: true, powerPreference: 'high-performance' },
        })
        game.bridge = { input: input.current, pressed: pressed.current, gestures: gestures.current, sfx, skipTitle: !!keep, onScene: s => !dead && setScene(s), onHud: h => !dead && setHud(h), onRound: () => onRoundRef.current?.(), playStyle: () => playStyleRef.current }
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
      if (!g || document.hidden || !g.isBooted || portraitRef.current) { stuckSince = 0; return }
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

  // ---- Boxer play style: gestures on the fight area ----
  // left half = lead hand, right half = rear hand; tap = straight, swipe across = hook, up = uppercut,
  // down = body shot; lower part = kicks; two fingers held = block
  const touches = useRef({})
  const topBarRef = useRef(null)
  const [topH, setTopH] = useState(52)
  useEffect(() => { const el = topBarRef.current; if (!el) return; const ro = new ResizeObserver(() => setTopH(el.offsetHeight)); ro.observe(el); setTopH(el.offsetHeight); return () => ro.disconnect() }, [])
  // stop the phone's own long-press / multi-finger gestures (menus, text select, etc.) during play
  const noTouchDefaults = el => {
    if (!el || el.__kr) return
    el.__kr = true
    el.addEventListener('touchstart', ev => { if (ev.cancelable) ev.preventDefault() }, { passive: false })
    el.addEventListener('touchmove', ev => { if (ev.cancelable) ev.preventDefault() }, { passive: false })
  }
  const [gestureHint, setGestureHint] = useState(true)
  // responsive: a swipe fires as soon as the finger has travelled far enough (not on release); a tap fires on
  // release or after a tenth of a second held; two fingers = block (no strike)
  const fireGesture = (t, kind) => {
    if (t.fired || t.multi) return
    t.fired = true; clearTimeout(t.timer)
    gestures.current.push({ kind, side: t.side, low: t.low })
    if (navigator.vibrate) navigator.vibrate(8)
    if (gestureHint) setGestureHint(false)
  }
  const gestureHandlers = {
    onPointerDown: e => {
      e.preventDefault(); sfxRef.current?.resume(); e.currentTarget.setPointerCapture?.(e.pointerId)
      const r = e.currentTarget.getBoundingClientRect()
      const t = touches.current[e.pointerId] = { x: e.clientX, y: e.clientY, side: e.clientX < r.left + r.width / 2 ? 'L' : 'R', low: e.clientY > r.top + r.height * 0.68 }
      if (Object.keys(touches.current).length >= 2) { input.current.block = true; for (const k in touches.current) { touches.current[k].multi = true; clearTimeout(touches.current[k].timer) } return }
      t.timer = setTimeout(() => { if (touches.current[e.pointerId] === t) fireGesture(t, 'tap') }, 100)
    },
    onPointerMove: e => {
      const t = touches.current[e.pointerId]; if (!t || t.fired || t.multi) return
      const dx = e.clientX - t.x, dy = e.clientY - t.y
      if (Math.hypot(dx, dy) >= 24) fireGesture(t, Math.abs(dx) > Math.abs(dy) ? 'across' : dy < 0 ? 'up' : 'down')
    },
    onPointerUp: e => {
      const t = touches.current[e.pointerId]; delete touches.current[e.pointerId]
      if (!Object.keys(touches.current).length) input.current.block = false
      if (!t) return
      clearTimeout(t.timer)
      if (!t.multi && !t.fired) {
        const dx = e.clientX - t.x, dy = e.clientY - t.y
        fireGesture(t, Math.hypot(dx, dy) < 24 ? 'tap' : Math.abs(dx) > Math.abs(dy) ? 'across' : dy < 0 ? 'up' : 'down')
      }
    },
    onPointerCancel: e => { const t = touches.current[e.pointerId]; if (t) clearTimeout(t.timer); delete touches.current[e.pointerId]; if (!Object.keys(touches.current).length) input.current.block = false },
  }
  const edgeBtn = (key, icon, label, colour, onPress, ring) => (
    <div key={key} style={{ width: 64, height: 64, borderRadius: '50%', padding: 4, boxSizing: 'border-box', background: ring != null ? `conic-gradient(${colour} ${Math.round(ring * 360)}deg, rgba(42,49,56,0.9) 0)` : 'rgba(42,49,56,0.6)', boxShadow: ring != null && ring >= 1 ? `0 0 14px ${colour}` : 'none', pointerEvents: 'auto' }}
      className={ring != null && ring >= 1 ? 'fg-ready' : undefined}>
      <button type="button" aria-label={label} onPointerDown={e => { e.preventDefault(); e.stopPropagation(); sfxRef.current?.resume(); onPress(); if (navigator.vibrate) navigator.vibrate(10) }}
        style={{ width: '100%', height: '100%', borderRadius: '50%', border: `2px solid ${colour}`, background: 'radial-gradient(circle at 35% 30%, #2A3138, #0B0E12 80%)', boxShadow: `inset 0 0 10px ${colour}44`, touchAction: 'none', cursor: 'pointer', opacity: ring != null && ring < 1 ? 0.6 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>
        {icon === 'combo' ? <PadIcon name="combo" colour={colour} size={30} /> : <FgIcon name={icon} colour={colour} size={30} />}
      </button>
    </div>
  )

  const pick = gameRef.current?.cfg?.pick ?? 0
  const pad = { height: 36, padding: '0 12px', borderRadius: 12, border: '1px solid #2A3138', background: 'rgba(26,31,36,0.85)', color: '#F2F2F2', fontSize: 14, fontWeight: 800, touchAction: 'none', userSelect: 'none', cursor: 'pointer' }
  const fight = scene === 'fight'

  return (
    <div role="dialog" aria-modal="true" aria-label="KR Fight" style={{ position: 'fixed', inset: 0, zIndex: 495, background: '#05070A', color: '#F2F2F2', display: 'flex', flexDirection: 'column', userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none', touchAction: 'none' }}
      onContextMenu={e => e.preventDefault()}>
      {portrait && (
        <div role="alert" style={{ position: 'absolute', inset: 0, zIndex: 50, background: '#05070A', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, textAlign: 'center', padding: 24 }}>
          <svg width="84" height="84" viewBox="0 0 24 24" fill="none" stroke="#5BE0FF" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ filter: 'drop-shadow(0 0 6px #5BE0FF)' }}>
            <rect x="7" y="2.5" width="10" height="19" rx="2" transform="rotate(-90 12 12)" />
            <path d="M4 7a8 8 0 0 1 6-4" /><path d="M10 3l-1.5-1.5M10 3l-1.6 1.4" />
          </svg>
          <div style={{ fontFamily: "'Saira Condensed', sans-serif", fontStyle: 'italic', fontWeight: 800, fontSize: 26, color: '#F2F2F2' }}>Turn your phone sideways</div>
          <div style={{ fontSize: 14, color: '#9AA3AE', maxWidth: 280 }}>KR FIGHT plays in landscape.</div>
          <button type="button" onClick={onClose} style={{ marginTop: 8, height: 38, padding: '0 16px', borderRadius: 12, border: '1px solid #2A3138', background: 'rgba(26,31,36,0.85)', color: '#F2F2F2', fontSize: 14, fontWeight: 800 }}>Close</button>
        </div>
      )}
      <div ref={topBarRef} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: landscape ? '4px calc(10px + env(safe-area-inset-right, 0px)) 4px calc(10px + env(safe-area-inset-left, 0px))' : 'calc(8px + env(safe-area-inset-top, 0px)) 12px 8px' }}>
        <button type="button" onClick={onClose} style={pad}>Close</button>
        <div style={{ fontFamily: "'Saira Condensed', sans-serif", fontStyle: 'italic', fontWeight: 800, fontSize: 22, letterSpacing: 1, flex: 1 }}>KR FIGHT</div>
        <button type="button" onClick={toggleMute} style={pad} aria-label={muted ? 'Sound on' : 'Sound off'}>{muted ? 'Sound off' : 'Sound on'}</button>
        {fight && <button type="button" onClick={toSelect} style={pad}>Fighters</button>}
        {!fight && <button type="button" onClick={() => { const i = PLAY_STYLES.findIndex(p => p.key === playStyle); const next = PLAY_STYLES[(i + 1) % PLAY_STYLES.length].key; setPlayStyle(next); setPlayStyleState(next) }}
          style={{ ...pad, color: '#5BE0FF' }} aria-label="Play style (controls)">Play: {PLAY_STYLES.find(p => p.key === playStyle)?.name || 'KR'}</button>}
        {!fight && onClassic && <button type="button" onClick={onClassic} style={{ ...pad, color: '#9AA3AE' }}>Classic</button>}
      </div>

      {fight && isBoxerStyle(playStyle) && (
        <div ref={noTouchDefaults} style={{ position: 'absolute', left: 0, right: 0, bottom: 0, top: topH, zIndex: 6, pointerEvents: 'none' }}>
          {/* gesture pad: the whole screen below the top bar, edge to edge */}
          <div {...gestureHandlers} role="group" aria-label="Punch by tapping or swiping: left half lead hand, right half rear hand; lower part kicks; two fingers to block"
            style={{ position: 'absolute', inset: 0, touchAction: 'none', pointerEvents: 'auto' }}>
            {gestureHint ? (
              <div style={{ position: 'absolute', left: '50%', top: '22%', transform: 'translateX(-50%)', background: 'rgba(0,0,0,0.6)', color: '#C9CED6', fontSize: 12, fontWeight: 600, padding: '8px 12px', borderRadius: 10, textAlign: 'center', pointerEvents: 'none', maxWidth: 360 }}>
                {playStyle === 'boxer2' ? <>Numbers: left hand tap 1 · across 3 · up 5 · down 7<br />Right hand tap 2 · across 4 · up 6 · down 8 · lower part = low (body)<br />Right stick: hold = shield · up = slip · down-back = roll · back twice = double step back<br />Left stick = footwork · » then a punch = combo</> : <>Left half = lead hand · right half = rear hand<br />Tap = straight · swipe across = hook · up = uppercut · down = body<br />Lower part = kicks · two fingers = block · » then a technique = combo<br />Left stick = footwork · right stick = guard (back = sway, down = low guard)</>}
              </div>
            ) : null}
          </div>
          {/* joysticks above each pair: left = footwork (overrides auto footwork while held), right = defence */}
          <div style={{ position: 'absolute', left: 'calc(45px + env(safe-area-inset-left, 0px))', bottom: 'calc(86px + env(safe-area-inset-bottom, 0px))' }}>
            <MiniStick label="Footwork: push to step in or out, up to jump, down to duck" onChange={(dx, dy) => setStickDirs(dx * 60, dy * 60)} />
          </div>
          <div style={{ position: 'absolute', right: 'calc(45px + env(safe-area-inset-right, 0px))', bottom: 'calc(86px + env(safe-area-inset-bottom, 0px))' }}>
            <MiniStick colour="#8FD3FF" label="Defence: hold to guard, down = low guard, back = sway back, forward = lean in"
              onChange={(dx, dy, held) => { input.current.defHeld = held; input.current.defX = dx; input.current.defY = dy }} />
          </div>
          {/* bottom-left: COMBO then SUPER to its right; bottom-right: SPECIAL then COMBO to its right */}
          <div style={{ position: 'absolute', left: 'calc(8px + env(safe-area-inset-left, 0px))', bottom: 'calc(10px + env(safe-area-inset-bottom, 0px))', display: 'flex', flexDirection: 'row', gap: 10 }}>
            {edgeBtn('comboL', 'combo', 'Combo: then a technique', '#5BE0FF', () => { pressed.current.comboArm = true })}
            {edgeBtn('super', 'bolt', 'Super', '#F5C542', () => { pressed.current.super = true }, hud.sup)}
          </div>
          <div style={{ position: 'absolute', right: 'calc(8px + env(safe-area-inset-right, 0px))', bottom: 'calc(10px + env(safe-area-inset-bottom, 0px))', display: 'flex', flexDirection: 'row', gap: 10 }}>
            {edgeBtn('sp', hud.special || FIGHTERS[pick]?.special || 'bolt', 'Special', hud.colour || '#5BE0FF', () => { pressed.current.sp = true }, hud.sp)}
            {edgeBtn('comboR', 'combo', 'Combo: then a technique', '#5BE0FF', () => { pressed.current.comboArm = true })}
          </div>
        </div>
      )}
      <div style={landscape
        ? { flex: 1, minHeight: 0, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }
        : { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: fight ? 'space-between' : 'center', paddingBottom: 'calc(10px + env(safe-area-inset-bottom, 0px))' }}>
        <div ref={hostRef} style={landscape
          ? { position: 'relative', height: '100%', maxWidth: '100%', aspectRatio: '16 / 9', isolation: 'isolate', zIndex: 0 }
          : { position: 'relative', width: '100%', maxWidth: 900, aspectRatio: '16 / 9', isolation: 'isolate', zIndex: 0 }}>
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
        {fight && !isBoxerStyle(playStyle) && (
          <div style={landscape
            ? { position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 5, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', pointerEvents: 'none', boxSizing: 'border-box',
                padding: '0 calc(14px + env(safe-area-inset-right, 0px)) calc(10px + env(safe-area-inset-bottom, 0px)) calc(14px + env(safe-area-inset-left, 0px))' }
            : { position: 'relative', zIndex: 5, width: '100%', maxWidth: 900, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', padding: '10px 14px', boxSizing: 'border-box' }}
            className={landscape ? 'fg-ls-controls' : undefined} ref={noTouchDefaults}>
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
              {(playStyle === 'sf' ? [
                { k: 'lp', text: 'LP', label: 'Light punch', bg: '#F2F2F2' },
                { k: 'mp', text: 'MP', label: 'Medium punch', bg: '#F5C542' },
                { k: 'hp', text: 'HP', label: 'Heavy punch (motion + punch = special)', bg: '#E24B4A' },
                { k: 'lk', text: 'LK', label: 'Light kick', bg: '#8FD3FF' },
                { k: 'mk', text: 'MK', label: 'Medium kick', bg: '#378ADD' },
                { k: 'hk', text: 'HK', label: 'Heavy kick', bg: '#C93BFF' },
              ] : [
                { k: 'sp', icon: hud.special || FIGHTERS[pick]?.special || 'bolt', label: 'Special', bg: hud.colour || FIGHTERS[pick]?.colour || '#F5C542', ring: hud.sp },
                { k: 'punch', icon: 'glove', label: 'Punch: tap light, hold medium, long hold heavy', bg: '#F2F2F2', charge: chargeLv.punch },
                { k: 'jump', icon: 'jump', label: 'Jump', bg: '#9AA3AE' },
                { k: 'super', icon: 'bolt', label: 'Super', bg: '#F5C542', ring: hud.sup },
                { k: 'kick', icon: 'kick', label: 'Kick: tap light, hold medium, long hold heavy', bg: '#378ADD', charge: chargeLv.kick },
                { k: 'block', icon: 'shield', label: 'Block (hold)', bg: '#8FD3FF' },
              ]).map(b => {
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
                      {b.text ? <span style={{ color: b.bg, fontFamily: "'Saira Condensed', sans-serif", fontStyle: 'italic', fontWeight: 800, fontSize: 22, textShadow: `0 0 6px ${b.bg}` }}>{b.text}</span>
                        : b.icon === 'jump' || b.icon === 'shield' ? <PadIcon name={b.icon} colour={b.bg} size={Math.round(BTN * 0.46)} /> : <FgIcon name={b.icon} colour={b.bg} size={Math.round(BTN * 0.5)} />}
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
