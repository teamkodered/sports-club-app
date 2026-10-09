import { useEffect, useRef, useState } from 'react'

// "KR Fight" -- a small SF2-style 2D fighter for the Gaming (combat) question.
// Five original fighters, one per pillar, each with its own special. vs the
// computer (Easy / Medium / Hard), best of 3 rounds. Every finished round is
// reported via onRound() so it can be logged. Canvas + Web Audio only.

const W = 800, H = 450, FLOOR = 380, GRAV = 0.9
const FIGHTERS = [
  { key: 'mentality', name: 'MENTALITY', colour: '#22B14C', trim: '#0E5F27', speed: 4.2, power: 1.0, reach: 1.0, special: 'wave', specialName: 'Focus Wave' },
  { key: 'technical', name: 'TECHNICAL', colour: '#2F6BFF', trim: '#13306F', speed: 4.6, power: 0.95, reach: 1.05, special: 'rush', specialName: 'Combo Rush' },
  { key: 'tactical', name: 'TACTICAL', colour: '#FF2A2A', trim: '#6F1010', speed: 4.3, power: 1.0, reach: 1.0, special: 'counter', specialName: 'Counter' },
  { key: 'physical', name: 'PHYSICAL', colour: '#E6B800', trim: '#6A5400', speed: 3.8, power: 1.2, reach: 0.95, special: 'upper', specialName: 'Power Uppercut' },
  { key: 'foundation', name: 'FOUNDATION', colour: '#C93BFF', trim: '#55157A', speed: 3.9, power: 1.05, reach: 1.0, special: 'quake', specialName: 'Shockwave' },
]
// startup / active / recovery frames, damage, reach (px), hitbox height: 'high' | 'mid' | 'low'
const MOVES = {
  lp: { s: 3, a: 3, r: 7, dmg: 5, reach: 62, h: 'high', push: 4 },
  hp: { s: 7, a: 3, r: 14, dmg: 10, reach: 70, h: 'high', push: 8 },
  lk: { s: 5, a: 3, r: 9, dmg: 6, reach: 78, h: 'mid', push: 5 },
  hk: { s: 9, a: 4, r: 18, dmg: 12, reach: 92, h: 'mid', push: 10 },
  clp: { s: 3, a: 3, r: 8, dmg: 4, reach: 60, h: 'mid', push: 3 },
  clk: { s: 5, a: 3, r: 12, dmg: 7, reach: 90, h: 'low', push: 6 },
  jk: { s: 3, a: 8, r: 4, dmg: 9, reach: 70, h: 'high', push: 6 },
}

function makeFighter(def, x, facing) {
  return { def, x, y: FLOOR, vx: 0, vy: 0, facing, hp: 100, state: 'idle', t: 0, move: null, hitDone: false, stun: 0, crouch: false, blocking: false, specialCd: 0, counterT: 0, flash: 0, wins: 0 }
}

// ---------------- sound ----------------
function makeSfx() {
  const Ctx = window.AudioContext || window.webkitAudioContext
  if (!Ctx) return { hit() {}, block() {}, whoosh() {}, ko() {}, bell() {}, special() {}, resume() {}, close() {} }
  const ctx = new Ctx()
  const noise = (dur, freq, vol) => {
    const len = Math.floor(ctx.sampleRate * dur), b = ctx.createBuffer(1, len, ctx.sampleRate), d = b.getChannelData(0)
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len)
    const src = ctx.createBufferSource(); src.buffer = b
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq
    const g = ctx.createGain(); g.gain.value = vol
    src.connect(f); f.connect(g); g.connect(ctx.destination); src.start()
  }
  const tone = (fr, dur, vol, type = 'sine', to) => {
    const o = ctx.createOscillator(), g = ctx.createGain(); o.type = type; o.frequency.value = fr
    if (to) o.frequency.exponentialRampToValueAtTime(to, ctx.currentTime + dur)
    g.gain.setValueAtTime(vol, ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur)
    o.connect(g); g.connect(ctx.destination); o.start(); o.stop(ctx.currentTime + dur)
  }
  return {
    hit: heavy => { noise(heavy ? 0.18 : 0.1, heavy ? 900 : 1600, heavy ? 0.6 : 0.4); tone(heavy ? 90 : 140, 0.12, 0.4, 'square', 50) },
    block: () => tone(700, 0.08, 0.15, 'triangle'),
    whoosh: () => noise(0.08, 3000, 0.08),
    special: () => tone(300, 0.35, 0.25, 'sawtooth', 900),
    ko: () => { tone(220, 0.8, 0.4, 'sawtooth', 55); noise(0.5, 400, 0.5) },
    bell: () => { tone(880, 1.2, 0.25); tone(1320, 1.0, 0.1) },
    resume: () => ctx.resume().catch(() => {}),
    close: () => ctx.close().catch(() => {}),
  }
}

// ---------------- drawing ----------------
function drawFighter(g, f, frame) {
  const c = f.def.colour, trim = f.def.trim
  const dir = f.facing
  const crouch = f.crouch && f.y >= FLOOR
  const bodyH = crouch ? 55 : 85, legH = crouch ? 25 : 45
  const hipY = f.y - legH, shY = hipY - bodyH, headY = shY - 22
  const bob = f.state === 'idle' ? Math.sin(frame / 8) * 2 : 0
  const flash = f.flash > 0 && f.flash % 4 < 2
  g.save()
  g.lineCap = 'round'; g.lineJoin = 'round'
  // shadow
  g.fillStyle = 'rgba(0,0,0,0.4)'; g.beginPath(); g.ellipse(f.x, FLOOR + 6, 38, 7, 0, 0, Math.PI * 2); g.fill()
  const limb = flash ? '#FFFFFF' : c
  // legs
  const walk = f.state === 'walk' ? Math.sin(frame / 4) * 12 : 0
  let kick = null
  if (f.move && (f.move.k === 'lk' || f.move.k === 'hk' || f.move.k === 'clk' || f.move.k === 'jk') && f.t >= f.move.s) kick = f.move
  g.strokeStyle = trim; g.lineWidth = 16
  g.beginPath(); g.moveTo(f.x - 8 * dir, hipY + bob); g.lineTo(f.x - (14 + walk) * dir, f.y); g.stroke()
  g.strokeStyle = limb
  if (kick) {
    const ext = Math.min(1, (f.t - kick.s + 1) / 2)
    const ky = kick.k === 'clk' ? f.y - 6 : kick.k === 'hk' ? hipY - 30 : hipY - 6
    g.beginPath(); g.moveTo(f.x + 6 * dir, hipY + bob); g.lineTo(f.x + (12 + (kick.reach - 12) * ext) * dir, ky); g.stroke()
  } else {
    g.beginPath(); g.moveTo(f.x + 8 * dir, hipY + bob); g.lineTo(f.x + (16 + walk) * dir, f.y); g.stroke()
  }
  // torso
  g.strokeStyle = flash ? '#fff' : '#1A1F24'; g.lineWidth = 30
  g.beginPath(); g.moveTo(f.x, hipY + bob); g.lineTo(f.x + 4 * dir, shY + bob); g.stroke()
  g.strokeStyle = c; g.lineWidth = 6
  g.beginPath(); g.moveTo(f.x - 13, hipY + bob - 4); g.lineTo(f.x + 13, hipY + bob - 4); g.stroke() // belt
  // arms
  let punch = null
  if (f.move && (f.move.k === 'lp' || f.move.k === 'hp' || f.move.k === 'clp' || f.move.k === 'rush' || f.move.k === 'upper') && f.t >= f.move.s) punch = f.move
  const handY = shY + 18 + bob
  g.strokeStyle = limb; g.lineWidth = 11
  const guard = (ox, oy) => { g.beginPath(); g.moveTo(f.x + 4 * dir, shY + 8 + bob); g.lineTo(f.x + ox * dir, oy); g.stroke(); g.fillStyle = flash ? '#fff' : '#E24B4A'; g.beginPath(); g.arc(f.x + ox * dir, oy, 9, 0, Math.PI * 2); g.fill() }
  if (f.blocking) { guard(22, shY - 2 + bob); guard(18, shY + 14 + bob) }
  else if (punch) {
    const ext = Math.min(1, (f.t - punch.s + 1) / 2)
    if (punch.k === 'upper') guard(26, shY - 40 * ext + bob)
    else guard(16 + ((punch.reach || 70) - 16) * ext, punch.k === 'clp' ? handY + 10 : shY + 6 + bob)
    guard(14, handY)
  } else { guard(24, shY + 6 + bob); guard(14, handY) }
  // head + headband
  g.fillStyle = flash ? '#fff' : '#F1C9A5'; g.beginPath(); g.arc(f.x + 6 * dir, headY + bob, 17, 0, Math.PI * 2); g.fill()
  g.strokeStyle = c; g.lineWidth = 6; g.beginPath(); g.moveTo(f.x + 6 * dir - 17, headY + bob - 6); g.lineTo(f.x + 6 * dir + 17, headY + bob - 6); g.stroke()
  g.beginPath(); g.moveTo(f.x + 6 * dir - 17 * dir, headY + bob - 6); g.lineTo(f.x - 26 * dir, headY + bob + 4 + Math.sin(frame / 5) * 3); g.stroke()
  g.fillStyle = '#111'; g.beginPath(); g.arc(f.x + 13 * dir, headY + bob - 1, 2.4, 0, Math.PI * 2); g.fill()
  if (f.state === 'ko') { g.fillStyle = '#fff'; g.font = 'bold 16px sans-serif'; g.fillText('✕', f.x + 8 * dir - 5, headY + bob + 5) }
  if (f.counterT > 0) { g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = 3; g.beginPath(); g.arc(f.x, f.y - 70, 60, 0, Math.PI * 2); g.stroke() }
  g.restore()
}

export default function FightGame({ onRound, onClose }) {
  const canvasRef = useRef(null)
  const [screen, setScreen] = useState('select') // select | fight
  const [pick, setPick] = useState(0)
  const [cpuPick, setCpuPick] = useState(null) // null = random
  const [level, setLevel] = useState('medium')
  const [overlay, setOverlay] = useState(null)
  const [matchId, setMatchId] = useState(0)
  const input = useRef({ left: false, right: false, up: false, down: false, lp: false, hp: false, lk: false, hk: false, sp: false })
  const pressed = useRef({})
  const sim = useRef(null)
  const onRoundRef = useRef(onRound); onRoundRef.current = onRound

  // keyboard
  useEffect(() => {
    const map = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', KeyJ: 'lp', KeyU: 'hp', KeyK: 'lk', KeyI: 'hk', KeyL: 'sp', Space: 'sp' }
    const dn = e => { const k = map[e.code]; if (!k) return; e.preventDefault(); if (!input.current[k]) pressed.current[k] = true; input.current[k] = true }
    const up = e => { const k = map[e.code]; if (!k) return; input.current[k] = false }
    window.addEventListener('keydown', dn); window.addEventListener('keyup', up)
    return () => { window.removeEventListener('keydown', dn); window.removeEventListener('keyup', up) }
  }, [])

  function startMatch() {
    const p = FIGHTERS[pick]
    let ci = cpuPick
    if (ci == null) { const others = FIGHTERS.map((_, i) => i).filter(i => i !== pick); ci = others[Math.floor(Math.random() * others.length)] }
    sim.current = { p1: makeFighter(p, 220, 1), p2: makeFighter(FIGHTERS[ci], 580, -1), round: 1, timer: 60 * 60, phase: 'intro', phaseT: 0, projectiles: [], frame: 0, sfx: makeSfx(), shake: 0, ai: { think: 0, plan: 'idle' } }
    sim.current.sfx.resume()
    setScreen('fight'); setMatchId(m => m + 1); setOverlay({ big: 'ROUND 1', small: `${p.name} vs ${FIGHTERS[ci].name}` })
  }

  // main loop
  useEffect(() => {
    if (screen !== 'fight') return
    const cv = canvasRef.current, g = cv.getContext('2d')
    let raf, last = performance.now(), acc = 0
    const lvl = { easy: { react: 26, aggro: 0.25, block: 0.15, special: 0.002 }, medium: { react: 14, aggro: 0.45, block: 0.45, special: 0.006 }, hard: { react: 7, aggro: 0.65, block: 0.75, special: 0.012 } }[level]

    function startMove(f, k) {
      if (f.move || f.stun > 0 || f.state === 'ko') return
      if (k === 'sp') {
        if (f.specialCd > 0) return
        f.specialCd = 150; S.sfx.special()
        const sp = f.def.special
        if (sp === 'wave') { f.move = { k: 'lp', s: 8, a: 2, r: 16, dmg: 0, reach: 30, h: 'high', push: 0 }; S.projectiles.push({ owner: f, x: f.x + 50 * f.facing, y: f.y - 110, vx: 7 * f.facing, dmg: 11, h: 'high', colour: f.def.colour, low: false, life: 140, delay: 8 }) }
        else if (sp === 'quake') { f.move = { k: 'clk', s: 10, a: 2, r: 18, dmg: 0, reach: 30, h: 'low', push: 0 }; S.projectiles.push({ owner: f, x: f.x + 40 * f.facing, y: FLOOR - 14, vx: 6 * f.facing, dmg: 10, h: 'low', colour: f.def.colour, low: true, life: 120, delay: 10 }) }
        else if (sp === 'rush') { f.move = { k: 'rush', s: 4, a: 14, r: 14, dmg: 13, reach: 75, h: 'high', push: 9 }; f.vx = 8.5 * f.facing }
        else if (sp === 'upper') { f.move = { k: 'upper', s: 3, a: 8, r: 20, dmg: 15, reach: 66, h: 'high', push: 12 }; f.vy = -15 }
        else if (sp === 'counter') { f.counterT = 40; f.move = { k: 'lp', s: 40, a: 0, r: 6, dmg: 0, reach: 0, h: 'high', push: 0 } }
        f.t = 0; f.hitDone = false; return
      }
      let key = k
      if (f.y < FLOOR) { if (k === 'lk' || k === 'hk' || k === 'lp' || k === 'hp') key = 'jk'; else return }
      else if (f.crouch) key = (k === 'lp' || k === 'hp') ? 'clp' : 'clk'
      const m = MOVES[key]
      f.move = { k: key, ...m, reach: m.reach * f.def.reach, dmg: m.dmg * f.def.power }
      f.t = 0; f.hitDone = false; S.sfx.whoosh()
    }
    // standing block stops high + mid; low attacks must be blocked crouching (down-back)
    function blocks(def, h) { if (!def.blocking) return false; return h === 'low' ? def.crouch : true }
    function applyHit(att, def, dmg, push, h) {
      if (def.state === 'ko') return
      if (def.counterT > 0) { def.counterT = 0; S.sfx.hit(true); att.hp = Math.max(0, att.hp - 14); att.stun = 24; att.vx = -10 * att.facing; att.flash = 12; S.shake = 8; def.move = null; return }
      if (h === 'high' && def.crouch && def.y >= FLOOR) return // ducked under
      if (blocks(def, h)) { def.hp = Math.max(0, def.hp - dmg * 0.15); def.vx = push * 0.6 * att.facing; def.stun = 8; S.sfx.block(); return }
      def.hp = Math.max(0, def.hp - dmg); def.stun = 14 + dmg; def.vx = push * att.facing; def.flash = 10; def.move = null
      S.sfx.hit(dmg >= 10); S.shake = dmg >= 10 ? 6 : 3
    }
    function update(f, o, ctl) {
      if (f.specialCd > 0) f.specialCd--
      if (f.counterT > 0) f.counterT--
      if (f.flash > 0) f.flash--
      f.facing = o.x > f.x ? 1 : -1
      const grounded = f.y >= FLOOR
      if (f.state === 'ko') { f.vx *= 0.9 }
      else if (f.stun > 0) { f.stun--; f.vx *= 0.85; f.blocking = false }
      else {
        const back = f.facing === 1 ? ctl.left : ctl.right, fwd = f.facing === 1 ? ctl.right : ctl.left
        f.crouch = grounded && ctl.down
        const oAttacking = !!o.move && o.move.dmg > 0
        f.blocking = grounded && back && !f.move && (oAttacking || S.projectiles.some(p => p.owner === o))
        if (!f.move) {
          if (grounded) {
            f.vx = f.crouch ? 0 : fwd ? f.def.speed * f.facing : back ? -f.def.speed * 0.75 * f.facing : 0
            if (ctl.upPressed && !f.crouch) { f.vy = -16; f.vx = fwd ? 4.5 * f.facing : back ? -4.5 * f.facing : 0 }
          }
          f.state = !grounded ? 'jump' : f.vx !== 0 ? 'walk' : 'idle'
        }
        for (const k of ['lp', 'hp', 'lk', 'hk', 'sp']) if (ctl[k + 'Pressed']) { startMove(f, k); break }
      }
      // move timeline
      if (f.move) {
        f.t++
        const m = f.move
        if (!f.hitDone && m.dmg > 0 && f.t >= m.s && f.t < m.s + m.a) {
          const dist = Math.abs(o.x - f.x), heightOK = m.h === 'high' ? o.y > f.y - 120 : true
          if (dist <= m.reach + 20 && heightOK) { f.hitDone = true; applyHit(f, o, m.dmg, m.push, m.h) }
        }
        if (f.move && f.t >= m.s + m.a + m.r) { f.move = null; if (grounded) f.vx = 0 }
        if (f.move && f.move.k === 'rush' && f.t > m.s + m.a) f.vx *= 0.8
      }
      // physics
      f.vy += GRAV; f.y += f.vy; f.x += f.vx
      if (f.y >= FLOOR) { f.y = FLOOR; f.vy = 0; if (!f.move && f.state === 'jump') f.state = 'idle' }
      f.x = Math.max(40, Math.min(W - 40, f.x))
    }
    function aiControl(cpu, me) {
      const a = S.ai, ctl = { left: false, right: false, down: false }
      const dist = Math.abs(me.x - cpu.x), toward = me.x > cpu.x ? 'right' : 'left', away = toward === 'right' ? 'left' : 'right'
      a.think--
      const meAttacking = (me.move && me.move.dmg > 0 && me.t < me.move.s + 2) || S.projectiles.some(p => p.owner === me && Math.abs(p.x - cpu.x) < 160)
      if (meAttacking && dist < 140 && Math.random() < lvl.block) { ctl[away] = true; if (me.move && (me.move.h === 'low')) ctl.down = true; return ctl }
      if (a.think <= 0) {
        a.think = lvl.react + Math.floor(Math.random() * lvl.react)
        const r = Math.random()
        if (cpu.specialCd === 0 && Math.random() < lvl.special * 60) a.plan = 'special'
        else if (dist > 110) a.plan = r < 0.15 ? 'jumpin' : r < 0.3 ? 'wait' : 'approach'
        else a.plan = r < lvl.aggro ? 'attack' : r < lvl.aggro + 0.2 ? 'backoff' : r < lvl.aggro + 0.3 ? 'crouchkick' : 'wait'
      }
      if (a.plan === 'approach') ctl[toward] = true
      else if (a.plan === 'backoff') ctl[away] = true
      else if (a.plan === 'jumpin') { ctl[toward] = true; ctl.upPressed = cpu.y >= FLOOR; a.plan = 'airkick' }
      else if (a.plan === 'airkick') { ctl[toward] = true; if (cpu.y < FLOOR - 60 && dist < 110) { ctl.hkPressed = true; a.plan = 'wait' } }
      else if (a.plan === 'attack') { const opts = ['lp', 'lp', 'hp', 'lk', 'hk']; ctl[opts[Math.floor(Math.random() * opts.length)] + 'Pressed'] = true; a.plan = 'wait' }
      else if (a.plan === 'crouchkick') { ctl.down = true; ctl.lkPressed = true; a.plan = 'wait' }
      else if (a.plan === 'special') { if (['wave', 'quake'].includes(cpu.def.special) || dist < 150) ctl.spPressed = true; else ctl[toward] = true; if (ctl.spPressed) a.plan = 'wait' }
      return ctl
    }
    const S = sim.current
    function endRound(winner) {
      S.phase = 'over'; S.phaseT = 0
      if (winner) winner.wins++
      onRoundRef.current?.()
      const p1 = S.p1, p2 = S.p2
      const matchOver = p1.wins >= 2 || p2.wins >= 2
      setOverlay({ big: winner ? (S.p1.hp <= 0 || S.p2.hp <= 0 ? 'K.O.' : 'TIME') : 'DRAW', small: winner ? `${winner === p1 ? 'You win' : 'CPU wins'} the round` : 'No winner this round', match: matchOver ? (p1.wins >= 2 ? 'YOU WIN THE MATCH! 🏆' : 'CPU WINS THE MATCH') : null })
    }
    function step() {
      const p1 = S.p1, p2 = S.p2
      S.frame++
      if (S.shake > 0) S.shake--
      if (S.phase === 'intro') { S.phaseT++; if (S.phaseT === 45) { setOverlay({ big: 'FIGHT!' }); S.sfx.bell() } if (S.phaseT > 75) { S.phase = 'fight'; setOverlay(null) } pressed.current = {}; return }
      if (S.phase === 'over') {
        S.phaseT++
        update(p1, p2, {}); update(p2, p1, {})
        if (S.phaseT > 130) {
          if (p1.wins >= 2 || p2.wins >= 2) { S.phase = 'done'; return }
          S.round++
          Object.assign(p1, makeFighter(p1.def, 220, 1), { wins: p1.wins }); Object.assign(p2, makeFighter(p2.def, 580, -1), { wins: p2.wins })
          S.projectiles = []; S.timer = 60 * 60; S.phase = 'intro'; S.phaseT = 0
          setOverlay({ big: S.round === 3 ? 'FINAL ROUND' : `ROUND ${S.round}` })
        }
        return
      }
      if (S.phase !== 'fight') return
      const inp = input.current, pr = pressed.current
      const c1 = { left: inp.left, right: inp.right, down: inp.down, upPressed: pr.up || false, lpPressed: pr.lp, hpPressed: pr.hp, lkPressed: pr.lk, hkPressed: pr.hk, spPressed: pr.sp }
      pressed.current = {}
      update(p1, p2, c1); update(p2, p1, aiControl(p2, p1))
      // push apart
      const gap = p2.x - p1.x
      if (Math.abs(gap) < 50 && p1.y >= FLOOR - 40 && p2.y >= FLOOR - 40) { const push = (50 - Math.abs(gap)) / 2 * Math.sign(gap || 1); p1.x -= push; p2.x += push }
      // projectiles
      for (const pj of S.projectiles) {
        if (pj.delay > 0) { pj.delay--; continue }
        pj.x += pj.vx; pj.life--
        const tgt = pj.owner === p1 ? p2 : p1
        if (Math.abs(pj.x - tgt.x) < 30 && (pj.low ? tgt.y >= FLOOR - 20 : tgt.y > pj.y - 40 && !(tgt.crouch && tgt.y >= FLOOR && !pj.low))) { applyHit(pj.owner, tgt, pj.dmg, 7, pj.h); pj.life = 0 }
      }
      S.projectiles = S.projectiles.filter(p => p.life > 0 && p.x > -40 && p.x < W + 40)
      S.timer--
      if (p1.hp <= 0 || p2.hp <= 0) {
        const loser = p1.hp <= 0 ? p1 : p2; loser.state = 'ko'; loser.vy = -8; loser.vx = -6 * loser.facing; S.sfx.ko(); S.shake = 14
        endRound(p1.hp <= 0 && p2.hp <= 0 ? null : (p1.hp <= 0 ? p2 : p1))
      } else if (S.timer <= 0) endRound(p1.hp === p2.hp ? null : p1.hp > p2.hp ? p1 : p2)
    }
    function draw() {
      const p1 = S.p1, p2 = S.p2
      g.save()
      if (S.shake) g.translate((Math.random() - 0.5) * S.shake, (Math.random() - 0.5) * S.shake)
      // stage
      const sky = g.createLinearGradient(0, 0, 0, H); sky.addColorStop(0, '#120A1E'); sky.addColorStop(0.7, '#1A1F24'); sky.addColorStop(1, '#0B0F12')
      g.fillStyle = sky; g.fillRect(-20, -20, W + 40, H + 40)
      g.fillStyle = '#0D1116'; g.fillRect(-20, FLOOR + 6, W + 40, H)
      // ring ropes
      for (let i = 0; i < 3; i++) { g.strokeStyle = ['#E24B4A', '#F2F2F2', '#378ADD'][i]; g.globalAlpha = 0.5; g.lineWidth = 3; g.beginPath(); g.moveTo(0, 200 + i * 40); g.lineTo(W, 200 + i * 40); g.stroke() }
      g.globalAlpha = 1
      g.fillStyle = '#2A3138'; g.fillRect(14, 170, 14, FLOOR - 164); g.fillRect(W - 28, 170, 14, FLOOR - 164)
      g.fillStyle = 'rgba(255,255,255,0.05)'; g.font = 'italic 900 90px sans-serif'; g.textAlign = 'center'; g.fillText('KR FIGHT', W / 2, 150)
      // projectiles
      for (const pj of S.projectiles) { if (pj.delay > 0) continue; g.fillStyle = pj.colour; g.shadowColor = pj.colour; g.shadowBlur = 20; g.beginPath(); if (pj.low) g.ellipse(pj.x, pj.y, 26, 10, 0, 0, Math.PI * 2); else g.arc(pj.x, pj.y, 16, 0, Math.PI * 2); g.fill(); g.shadowBlur = 0 }
      drawFighter(g, p1, S.frame); drawFighter(g, p2, S.frame)
      g.restore()
      // HUD
      const bar = (x, f, right) => {
        g.fillStyle = '#2A3138'; g.fillRect(x, 22, 320, 22)
        const w = 320 * (f.hp / 100); g.fillStyle = f.hp > 30 ? f.def.colour : '#E24B4A'
        g.fillRect(right ? x + 320 - w : x, 22, w, 22)
        g.strokeStyle = '#F2F2F2'; g.lineWidth = 2; g.strokeRect(x, 22, 320, 22)
        g.fillStyle = '#fff'; g.font = 'italic 800 16px sans-serif'; g.textAlign = right ? 'right' : 'left'
        g.fillText(f.def.name + (right ? ' (CPU)' : ''), right ? x + 320 : x, 64)
        for (let i = 0; i < 2; i++) { g.fillStyle = i < f.wins ? '#F5C542' : '#2A3138'; g.beginPath(); g.arc(right ? x + 300 - i * 18 : x + 20 + i * 18, 80, 6, 0, Math.PI * 2); g.fill() }
        const cd = f.specialCd; g.fillStyle = cd === 0 ? f.def.colour : '#2A3138'; g.font = '700 11px sans-serif'; g.fillText(cd === 0 ? `★ ${f.def.specialName} ready` : f.def.specialName, right ? x + 320 : x, 100)
      }
      bar(20, p1, false); bar(W - 340, p2, true)
      g.fillStyle = '#fff'; g.font = '900 30px sans-serif'; g.textAlign = 'center'; g.fillText(String(Math.max(0, Math.ceil(S.timer / 60))), W / 2, 46)
    }
    function loop(now) {
      acc += Math.min(100, now - last); last = now
      while (acc >= 1000 / 60) { step(); acc -= 1000 / 60 }
      draw()
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [screen, level, matchId])

  useEffect(() => () => sim.current?.sfx?.close(), [])

  // touch controls
  const hold = k => ({
    onPointerDown: e => { e.preventDefault(); e.currentTarget.setPointerCapture?.(e.pointerId); if (!input.current[k]) pressed.current[k] = true; input.current[k] = true },
    onPointerUp: () => { input.current[k] = false }, onPointerCancel: () => { input.current[k] = false }, onPointerLeave: () => { input.current[k] = false },
  })
  // diagonals hold two directions at once (e.g. ↙ = down + back: crouch-block / crouch-walk; ↗ = jump forward)
  const hold2 = (a, b) => ({
    onPointerDown: e => { e.preventDefault(); e.currentTarget.setPointerCapture?.(e.pointerId); for (const k of [a, b]) { if (!input.current[k]) pressed.current[k] = true; input.current[k] = true } },
    onPointerUp: () => { input.current[a] = false; input.current[b] = false }, onPointerCancel: () => { input.current[a] = false; input.current[b] = false }, onPointerLeave: () => { input.current[a] = false; input.current[b] = false },
  })
  const pad = { width: 54, height: 54, borderRadius: 12, border: '1px solid #2A3138', background: 'rgba(26,31,36,0.85)', color: '#F2F2F2', fontSize: 20, fontWeight: 800, touchAction: 'none', userSelect: 'none' }
  const atk = (bg) => ({ width: 58, height: 58, borderRadius: '50%', border: 'none', background: bg, color: '#0A0A0A', fontSize: 13, fontWeight: 900, touchAction: 'none', userSelect: 'none' })
  const done = screen === 'fight' && sim.current?.phase === 'done'

  return (
    <div role="dialog" aria-modal="true" style={{ position: 'fixed', inset: 0, zIndex: 495, background: '#05070A', color: '#F2F2F2', display: 'flex', flexDirection: 'column', userSelect: 'none', WebkitUserSelect: 'none', touchAction: 'none' }}
      onContextMenu={e => e.preventDefault()}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px' }}>
        <button type="button" onClick={onClose} style={{ ...pad, width: 'auto', height: 36, padding: '0 12px', fontSize: 14 }}>Close</button>
        <div style={{ fontFamily: "'Saira Condensed', sans-serif", fontStyle: 'italic', fontWeight: 800, fontSize: 22, letterSpacing: 1, flex: 1 }}>KR FIGHT</div>
        {screen === 'fight' && <button type="button" onClick={() => setScreen('select')} style={{ ...pad, width: 'auto', height: 36, padding: '0 12px', fontSize: 14 }}>Fighters</button>}
      </div>

      {screen === 'select' ? (
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 14px 20px', maxWidth: 560, width: '100%', margin: '0 auto', boxSizing: 'border-box' }}>
          <p style={{ fontSize: 12, color: '#9A9A9A', margin: '0 0 6px' }}>Choose your fighter</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6, marginBottom: 10 }}>
            {FIGHTERS.map((f, i) => (
              <button key={f.key} type="button" onClick={() => setPick(i)} style={{ padding: '10px 2px', borderRadius: 8, border: `2px solid ${pick === i ? f.colour : '#2A3138'}`, background: pick === i ? f.colour + '33' : '#1A1F24', color: f.colour, fontWeight: 800, fontSize: 10, letterSpacing: 0.5, cursor: 'pointer', boxShadow: pick === i ? `0 0 12px ${f.colour}88` : 'none' }}>
                <div style={{ width: 22, height: 22, borderRadius: '50%', background: f.colour, margin: '0 auto 6px' }} />{f.name}
              </button>
            ))}
          </div>
          <p style={{ fontSize: 13, margin: '0 0 14px' }}>Special: <b style={{ color: FIGHTERS[pick].colour }}>{FIGHTERS[pick].specialName}</b></p>
          <p style={{ fontSize: 12, color: '#9A9A9A', margin: '0 0 6px' }}>Opponent</p>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
            <button type="button" onClick={() => setCpuPick(null)} style={{ ...pad, width: 'auto', height: 34, padding: '0 10px', fontSize: 12, borderColor: cpuPick == null ? '#F5C542' : '#2A3138' }}>Random</button>
            {FIGHTERS.map((f, i) => i !== pick && <button key={f.key} type="button" onClick={() => setCpuPick(i)} style={{ ...pad, width: 'auto', height: 34, padding: '0 10px', fontSize: 12, color: f.colour, borderColor: cpuPick === i ? f.colour : '#2A3138' }}>{f.name}</button>)}
          </div>
          <p style={{ fontSize: 12, color: '#9A9A9A', margin: '0 0 6px' }}>Level</p>
          <div style={{ display: 'flex', gap: 6, marginBottom: 18 }}>
            {['easy', 'medium', 'hard'].map(l => <button key={l} type="button" onClick={() => setLevel(l)} style={{ ...pad, width: 'auto', height: 34, padding: '0 14px', fontSize: 13, textTransform: 'capitalize', borderColor: level === l ? '#F5C542' : '#2A3138' }}>{l}</button>)}
          </div>
          <button type="button" onClick={startMatch} style={{ width: '100%', height: 54, border: 'none', cursor: 'pointer', clipPath: 'polygon(14px 0, calc(100% - 14px) 0, 100% 50%, calc(100% - 14px) 100%, 14px 100%, 0 50%)', background: FIGHTERS[pick].colour, color: '#0A0A0A', fontFamily: "'Saira Condensed', sans-serif", fontStyle: 'italic', fontWeight: 800, fontSize: 24, letterSpacing: 2 }}>FIGHT!</button>
          <p style={{ fontSize: 11, color: '#777', marginTop: 12, lineHeight: 1.5 }}>
            Best of 3 rounds. Hold back to block (down-back blocks low). Down + punch/kick = crouching attack; attack in the air for a jumping kick.
            Keyboard: arrows / WASD, J light punch, U heavy punch, K light kick, I heavy kick, L or Space special. Every finished round counts as 1 on today's Gaming (combat).
          </p>
        </div>
      ) : (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 'calc(10px + env(safe-area-inset-bottom, 0px))' }}>
          <div style={{ position: 'relative', width: '100%', maxWidth: 900 }}>
            <canvas ref={canvasRef} width={W} height={H} style={{ width: '100%', height: 'auto', display: 'block', background: '#000' }} />
            {overlay && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', textAlign: 'center' }}>
                <div style={{ fontFamily: "'Saira Condensed', sans-serif", fontStyle: 'italic', fontWeight: 800, fontSize: 'min(12vw, 72px)', color: '#F5C542', textShadow: '0 0 18px #E24B4A, 3px 3px 0 #000' }}>{overlay.big}</div>
                {overlay.small && <div style={{ fontWeight: 700, fontSize: 'min(4vw, 20px)', textShadow: '2px 2px 0 #000' }}>{overlay.small}</div>}
                {overlay.match && <div style={{ marginTop: 8, fontWeight: 900, fontSize: 'min(5vw, 26px)', color: '#22B14C', textShadow: '2px 2px 0 #000' }}>{overlay.match}</div>}
              </div>
            )}
          </div>
          {done || overlay?.match ? (
            <div style={{ display: 'flex', gap: 10, margin: '14px 0' }}>
              <button type="button" onClick={startMatch} style={{ ...pad, width: 'auto', padding: '0 18px', fontSize: 16 }}>Rematch</button>
              <button type="button" onClick={() => setScreen('select')} style={{ ...pad, width: 'auto', padding: '0 18px', fontSize: 16 }}>Change fighter</button>
            </div>
          ) : (
            <div style={{ width: '100%', maxWidth: 900, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', padding: '10px 14px', boxSizing: 'border-box' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 54px)', gridTemplateRows: 'repeat(3, 54px)', gap: 4 }}>
                <button type="button" style={{ ...pad, fontSize: 17, opacity: 0.85 }} {...hold2('up', 'left')}>◤</button><button type="button" style={pad} {...hold('up')}>▲</button><button type="button" style={{ ...pad, fontSize: 17, opacity: 0.85 }} {...hold2('up', 'right')}>◥</button>
                <button type="button" style={pad} {...hold('left')}>◀</button><span /><button type="button" style={pad} {...hold('right')}>▶</button>
                <button type="button" style={{ ...pad, fontSize: 17, opacity: 0.85 }} {...hold2('down', 'left')}>◣</button><button type="button" style={pad} {...hold('down')}>▼</button><button type="button" style={{ ...pad, fontSize: 17, opacity: 0.85 }} {...hold2('down', 'right')}>◢</button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 58px)', gap: 6, alignItems: 'center' }}>
                <button type="button" style={atk('#F2F2F2')} {...hold('lp')}>LP</button>
                <button type="button" style={atk('#E24B4A')} {...hold('hp')}>HP</button>
                <button type="button" style={{ ...atk(FIGHTERS[pick]?.colour || '#F5C542'), gridRow: 'span 2', height: 64, width: 64 }} {...hold('sp')}>SP</button>
                <button type="button" style={atk('#C0C4CC')} {...hold('lk')}>LK</button>
                <button type="button" style={atk('#378ADD')} {...hold('hk')}>HK</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
