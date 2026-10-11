// KR FIGHT 2 -- jointed fighter rendering. Each fighter has a target pose (hands, feet, hips,
// shoulders, head) worked out from what they're doing; the drawn pose eases towards it every step,
// so moves blend instead of snapping. Elbows and knees come from simple two-bone IK.
import { FLOOR, hex } from './data.js'

const KEYS = ['hipX', 'hipY', 'shX', 'shY', 'headX', 'headY', 'lhX', 'lhY', 'rhX', 'rhY', 'lfX', 'lfY', 'rfX', 'rfY', 'lean']
const lerp = (a, b, t) => a + (b - a) * t
const ease = t => 1 - (1 - t) * (1 - t)

// Target pose in local space: x forward (towards the opponent), y up is negative, origin at the feet.
export function targetPose(f, frame) {
  const crouch = f.crouch && f.y >= FLOOR && f.state !== 'ko'
  const air = f.y < FLOOR
  const bob = (f.state === 'idle' || f.state === 'walk') && !f.move ? Math.sin(frame / 9) * 2.2 : 0
  // fighting stance: bladed, knees soft, chin tucked behind the gloves
  let hipY = crouch ? -30 : -47, shY = crouch ? -84 : -122
  const P = {
    hipX: -2, hipY: hipY + bob, shX: 5, shY: shY + bob, headX: 8, headY: shY - 21 + bob,
    lhX: 32, lhY: shY - 2 + bob, rhX: 19, rhY: shY - 8 + bob,
    lfX: crouch ? 26 : 22, lfY: 0, rfX: crouch ? -24 : -20, rfY: 0, lean: 0,
  }
  if (f.state === 'walk' && !f.move) {
    const w = Math.sin(frame / 4.5)
    P.lfX += w * 11; P.rfX -= w * 11
    P.lfY = Math.min(0, -Math.cos(frame / 4.5) * 5); P.rfY = Math.min(0, Math.cos(frame / 4.5) * 5)
  }
  if (air && !f.move) {
    P.lfX = 16; P.lfY = -26; P.rfX = -10; P.rfY = -14; P.hipY -= 4
    P.lhY -= 6; P.rhY -= 4
  }
  if (f.blocking) {
    P.lhX = 20; P.lhY = shY - 6; P.rhX = 16; P.rhY = shY + 8; P.shX = -2; P.headX = 0; P.lean = -4
    if (crouch) { P.lhY = shY - 2; P.rhY = shY + 10 }
  }
  if (f.stun > 0 && f.state !== 'ko') {
    const k = Math.min(1, f.stun / 10)
    P.shX -= 12 * k; P.headX -= 16 * k; P.headY += 3 * k; P.lean = -10 * k
    P.lhX = 8; P.lhY = shY + 22; P.rhX = -6; P.rhY = shY + 26
  }
  if (f.counterT > 0) { P.lhX = 22; P.lhY = shY - 12; P.rhX = 26; P.rhY = shY + 6; P.shX = 0; P.lean = -2 }

  const m = f.move
  if (m) {
    const t = f.t
    // phase 0..1 for startup, 1 during active, then back down 1..0 through recovery
    const wind = t < m.s ? ease(t / Math.max(1, m.s)) : 1
    const ext = t < m.s ? 0 : t < m.s + m.a ? 1 : Math.max(0, 1 - (t - m.s - m.a) / Math.max(1, m.r))
    const reach = m.reach || 70
    switch (m.k) {
      case 'lp': case 'clp': {
        const y = m.k === 'clp' ? shY + 14 : shY + 4
        P.lhX = lerp(lerp(32, 22, wind), reach, ext); P.lhY = lerp(P.lhY, y, Math.max(wind, ext))
        P.shX += 6 * ext; P.headX += 3 * ext
        break
      }
      case 'hp': {
        P.rhX = lerp(lerp(19, -12, wind), reach, ext); P.rhY = lerp(lerp(P.rhY, shY + 10, wind), shY + 2, ext)
        P.lhX = 24; P.lhY = shY - 4
        P.shX += lerp(-6 * wind, 12, ext); P.headX += lerp(-4 * wind, 8, ext); P.rfX -= 4 * ext; P.lean = lerp(-6 * wind, 8, ext)
        break
      }
      case 'lk': case 'clk': case 'jk': {
        const kickY = m.k === 'clk' ? -6 : m.k === 'jk' ? hipY + 18 : hipY - 4
        const chamberX = m.k === 'clk' ? 30 : 24, chamberY = m.k === 'clk' ? -10 : hipY + 14
        P.lfX = lerp(lerp(P.lfX, chamberX, wind), reach, ext); P.lfY = lerp(lerp(P.lfY, chamberY, wind), kickY, ext)
        P.shX -= 10 * Math.max(wind, ext) * (m.k === 'clk' ? 0.3 : 1); P.headX -= 10 * Math.max(wind, ext) * (m.k === 'clk' ? 0.3 : 1)
        P.lean = -8 * ext
        if (m.k === 'jk') { P.rfX = -12; P.rfY = -20 }
        break
      }
      case 'hk': {
        // rear-leg roundhouse: chamber the rear knee, swing it through high
        P.rfX = lerp(lerp(P.rfX, 6, wind), reach, ext); P.rfY = lerp(lerp(0, hipY + 6, wind), hipY - 32, ext)
        P.hipX += 8 * Math.max(wind, ext); P.shX -= 16 * ext; P.headX -= 18 * ext; P.headY += 6 * ext; P.lean = -16 * ext
        P.lhX = 12; P.lhY = shY + 2; P.rhX = -10; P.rhY = shY + 22
        break
      }
      case 'rush': {
        P.rhX = lerp(lerp(14, -10, wind), reach, ext); P.rhY = shY + 6
        P.lhX = 22; P.lhY = shY
        P.shX += 18 * ext; P.headX += 20 * ext; P.headY += 6 * ext; P.lean = 14 * ext
        P.lfX = 30; P.rfX = -30; P.hipY += 6
        break
      }
      case 'upper': {
        P.rhX = lerp(lerp(14, 4, wind), 28, ext); P.rhY = lerp(lerp(P.rhY, shY + 40, wind), shY - 46, ext)
        P.lhX = 18; P.lhY = shY + 6
        P.shX += 8 * ext; P.headX += 6 * ext; P.headY -= 4 * ext; P.lean = 6 * ext
        break
      }
      case 'cast': {
        // Focus Wave: both palms push forward
        P.lhX = lerp(18, 50, ext); P.lhY = shY + 10; P.rhX = lerp(6, 44, ext); P.rhY = shY + 22
        P.shX += 6 * ext; P.lfX = 26; P.rfX = -22
        break
      }
      case 'stomp': {
        // Shockwave: lift the lead knee then stamp
        P.lfX = lerp(20, 22, ext); P.lfY = t < m.s ? lerp(0, hipY + 16, wind) : 0
        P.hipY += 8 * ext; P.shY += 8 * ext; P.headY += 8 * ext
        P.lhX = 30; P.lhY = shY + 30; P.rhX = -6; P.rhY = shY + 30
        break
      }
    }
  }
  return P
}

export function makePose(f, frame) { const p = targetPose(f, frame); return { cur: { ...p }, prev: { ...p }, trail: [] } }

// called once per simulation step
export function stepPose(pose, f, frame) {
  const tgt = targetPose(f, frame)
  Object.assign(pose.prev, pose.cur)
  const attacking = f.move && f.move.dmg > 0 && f.t >= f.move.s - 1
  const k = attacking ? 0.75 : f.move ? 0.5 : f.stun > 0 ? 0.6 : 0.32
  for (const key of KEYS) pose.cur[key] = lerp(pose.cur[key], tgt[key], k)
  // afterimages for rushes, uppercuts and supers
  const fast = f.move && (f.move.k === 'rush' || f.move.k === 'upper' || f.move.super)
  if (fast && frame % 2 === 0) pose.trail.push({ p: { ...pose.cur }, x: f.x, y: f.y, facing: f.facing, life: 10 })
  for (const tr of pose.trail) tr.life--
  pose.trail = pose.trail.filter(t => t.life > 0)
}

// two-bone IK: returns the joint (elbow / knee) between a and b. bend = +1 / -1 picks the side.
function joint(ax, ay, bx, by, l1, l2, bend) {
  let dx = bx - ax, dy = by - ay
  let d = Math.hypot(dx, dy) || 0.001
  const max = l1 + l2
  if (d >= max) { // fully extended -- stretch evenly (stylised fighters can reach a bit further)
    const r = l1 / max
    return [ax + dx * r, ay + dy * r]
  }
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d)
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a))
  const mx = ax + dx * a / d, my = ay + dy * a / d
  return [mx - bend * h * dy / d, my + bend * h * dx / d]
}

function capsule(g, x1, y1, x2, y2, w, col, alpha = 1) {
  g.lineStyle(w, col, alpha); g.lineBetween(x1, y1, x2, y2)
  g.fillStyle(col, alpha); g.fillCircle(x1, y1, w / 2); g.fillCircle(x2, y2, w / 2)
}

// Draw a fighter. alpha interpolates between the last two steps for smooth high-refresh screens.
export function drawFighter(g, f, pose, frame, alpha = 1, opts = {}) {
  const P = {}
  for (const key of KEYS) P[key] = lerp(pose.prev[key], pose.cur[key], alpha)
  // afterimages first
  if (!opts.noTrail) for (const tr of pose.trail) drawBody(g, f, tr.p, tr.x, tr.y, tr.facing, frame, { ghost: tr.life / 10 * 0.35 })
  drawBody(g, f, P, opts.x ?? f.x, opts.y ?? f.y, f.facing, frame, opts)
}

function drawBody(g, f, P, fx, fy, dir, frame, opts) {
  const c = hex(f.def.colour), trim = hex(f.def.trim)
  const ghost = opts.ghost
  const flash = !ghost && f.flash > 0 && f.flash % 4 < 2
  const A = ghost || 1
  const col = ghost ? c : flash ? 0xffffff : c
  const dark = ghost ? c : flash ? 0xffffff : trim
  const skin = ghost ? c : flash ? 0xffffff : 0xf1c9a5
  const glove = ghost ? c : flash ? 0xffffff : 0xe24b4a
  const torsoCol = ghost ? c : flash ? 0xffffff : 0x1a1f24

  // K.O.: tip over backwards around the feet and lie flat
  let rot = 0, lift = 0
  if (f.state === 'ko' && !opts.noKo) {
    const p = Math.min(1, (f.koT || 0) / 18)
    rot = -dir * (Math.PI / 2) * (p * p) * 0.96
    lift = (fy - FLOOR) * (1 - p)
    fy = FLOOR
  }
  const cr = Math.cos(rot), sr = Math.sin(rot)
  const X = (lx, ly) => { const x = lx * dir, y = ly; return fx + x * cr - y * sr }
  const Y = (lx, ly) => { const x = lx * dir, y = ly; return fy + lift + x * sr + y * cr }
  const pt = (lx, ly) => [X(lx, ly), Y(lx, ly)]

  // shadow (stays on the floor)
  if (!ghost) {
    const airK = Math.max(0.35, 1 - (FLOOR - f.y) / 220)
    g.fillStyle(0x000000, 0.45 * airK); g.fillEllipse(fx, (opts.shadowY ?? FLOOR) + 6, 80 * airK, 14 * airK)
  }

  const hipL = pt(P.hipX + 7, P.hipY), hipR = pt(P.hipX - 7, P.hipY)
  const sh = pt(P.shX, P.shY + 8)
  const shR = pt(P.shX - 8, P.shY + 10)
  const lf = pt(P.lfX, P.lfY), rf = pt(P.rfX, P.rfY)
  const lh = pt(P.lhX, P.lhY), rh = pt(P.rhX, P.rhY)
  // knees bend forward, elbows bend down
  const kneeBend = dir * (Math.cos(rot) >= 0 ? -1 : 1)
  const lk = joint(hipL[0], hipL[1], lf[0], lf[1], 27, 27, kneeBend)
  const rk = joint(hipR[0], hipR[1], rf[0], rf[1], 27, 27, kneeBend)
  const le = joint(sh[0], sh[1], lh[0], lh[1], 27, 27, dir)
  const re = joint(shR[0], shR[1], rh[0], rh[1], 27, 27, dir)

  const rearAttack = f.move && f.t >= f.move.s && ['hp', 'rush', 'upper'].includes(f.move.k)
  const rearKick = f.move && f.t >= f.move.s && f.move.k === 'hk'

  // rear leg + rear arm (behind the body)
  capsule(g, hipR[0], hipR[1], rk[0], rk[1], 15, rearKick ? col : dark, A); capsule(g, rk[0], rk[1], rf[0], rf[1], 13, rearKick ? col : dark, A)
  capsule(g, shR[0], shR[1], re[0], re[1], 11, rearAttack ? col : dark, A); capsule(g, re[0], re[1], rh[0], rh[1], 10, rearAttack ? col : dark, A)
  g.fillStyle(glove, A); g.fillCircle(rh[0], rh[1], 9)

  // torso: neon rim + dark core
  const hipC = pt(P.hipX, P.hipY), shC = pt(P.shX, P.shY)
  capsule(g, hipC[0], hipC[1], shC[0], shC[1], 34, col, A)
  if (!ghost) capsule(g, hipC[0], hipC[1], shC[0], shC[1], 28, torsoCol, A)
  // belt
  if (!ghost) { const b1 = pt(P.hipX - 15, P.hipY - 4), b2 = pt(P.hipX + 15, P.hipY - 4); g.lineStyle(6, col, 1); g.lineBetween(b1[0], b1[1], b2[0], b2[1]) }

  // lead leg (in front)
  capsule(g, hipL[0], hipL[1], lk[0], lk[1], 16, col, A); capsule(g, lk[0], lk[1], lf[0], lf[1], 14, col, A)

  // head + headband
  const hd = pt(P.headX, P.headY)
  g.fillStyle(skin, A); g.fillCircle(hd[0], hd[1], 17)
  if (!ghost) {
    const b1 = pt(P.headX - 17, P.headY - 6), b2 = pt(P.headX + 17, P.headY - 6)
    g.lineStyle(6, col, 1); g.lineBetween(b1[0], b1[1], b2[0], b2[1])
    const tail = pt(P.headX - 34, P.headY + 4 + Math.sin(frame / 5) * 4), tail2 = pt(P.headX - 30, P.headY - 2 + Math.cos(frame / 6) * 4)
    g.lineStyle(5, col, 1); g.lineBetween(b1[0], b1[1], tail[0], tail[1]); g.lineStyle(4, col, 0.8); g.lineBetween(b1[0], b1[1], tail2[0], tail2[1])
    const eye = pt(P.headX + 8, P.headY - 1)
    if (f.state === 'ko') { g.lineStyle(2.5, 0x111111, 1); g.lineBetween(eye[0] - 3, eye[1] - 3, eye[0] + 3, eye[1] + 3); g.lineBetween(eye[0] - 3, eye[1] + 3, eye[0] + 3, eye[1] - 3) }
    else { g.fillStyle(0x111111, 1); g.fillCircle(eye[0], eye[1], 2.6) }
  }

  // lead arm (in front)
  capsule(g, sh[0], sh[1], le[0], le[1], 12, col, A); capsule(g, le[0], le[1], lh[0], lh[1], 11, col, A)
  g.fillStyle(glove, A); g.fillCircle(lh[0], lh[1], 10)
  if (!ghost) { g.lineStyle(2, 0xffffff, 0.35); g.strokeCircle(lh[0] - 2, lh[1] - 2, 5) }

  // Counter stance aura
  if (!ghost && f.counterT > 0) {
    const r = 58 + Math.sin(frame / 2) * 4
    g.lineStyle(3, 0xffffff, 0.75); g.strokeCircle(f.x, f.y - 72, r)
    g.lineStyle(8, c, 0.25); g.strokeCircle(f.x, f.y - 72, r + 4)
  }
}
