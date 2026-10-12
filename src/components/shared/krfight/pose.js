// KR FIGHT 2 -- jointed fighter rendering. Each fighter has a target pose (hands, feet, hips,
// shoulders, head) worked out from what they're doing; the drawn pose eases towards it every step,
// so moves blend instead of snapping. Elbows and knees come from simple two-bone IK.
import { FLOOR, hex, LOOKS, getLook, HOUSES, fxColour } from './data.js'

const KEYS = ['hipX', 'hipY', 'shX', 'shY', 'headX', 'headY', 'lhX', 'lhY', 'rhX', 'rhY', 'lfX', 'lfY', 'rfX', 'rfY', 'lean']
const lerp = (a, b, t) => a + (b - a) * t
const ease = t => 1 - (1 - t) * (1 - t)

// Target pose in local space: x forward (towards the opponent), y up is negative, origin at the feet.
export function targetPose(f, frame) {
  const crouch = f.crouch && f.y >= FLOOR && f.state !== 'ko'
  const air = f.y < FLOOR
  const bob = (f.state === 'idle' || f.state === 'walk') && !f.move ? Math.sin(frame / 9) * 2.2 : 0
  // fighting stance: bladed, knees soft, chin tucked behind the gloves
  // stickman / house looks: shorter body, longer legs (legs 2 x 33 instead of 2 x 27)
  const long = getLook() !== 'cartoon'
  let hipY = crouch ? (long ? -38 : -30) : (long ? -60 : -47), shY = crouch ? (long ? -86 : -84) : (long ? -114 : -122)
  const P = {
    hipX: -2, hipY: hipY + bob, shX: 5, shY: shY + bob, headX: 8, headY: shY - 21 + bob,
    lhX: 32, lhY: shY - 2 + bob, rhX: 19, rhY: shY - 8 + bob,
    lfX: crouch ? 28 : (long ? 24 : 22), lfY: 0, rfX: crouch ? -26 : (long ? -22 : -20), rfY: 0, lean: 0,
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
      case 'jab': case 'clp': case 'bodyjab': {
        const y = m.k === 'clp' ? shY + 14 : m.k === 'bodyjab' ? shY + 32 : shY + 4
        if (m.k === 'bodyjab') { const d = Math.max(wind, ext); P.hipY += 6 * d; P.shY += 10 * d; P.headY += 12 * d; P.shX += 4 * d }
        P.lhX = lerp(lerp(32, 22, wind), reach, ext); P.lhY = lerp(P.lhY, y, Math.max(wind, ext))
        P.shX += 6 * ext; P.headX += 3 * ext
        break
      }
      case 'cross': {
        // Cross: rear hand straight down the middle, hips and shoulders turn in
        P.rhX = lerp(lerp(19, -12, wind), reach, ext); P.rhY = lerp(lerp(P.rhY, shY + 10, wind), shY + 2, ext)
        P.lhX = 24; P.lhY = shY - 4
        P.shX += lerp(-6 * wind, 12, ext); P.headX += lerp(-4 * wind, 8, ext); P.rfX -= 4 * ext; P.lean = lerp(-6 * wind, 8, ext)
        break
      }
      case 'hook': case 'bodyhook': {
        // Hook: rear hand loads low and wide, then sweeps round in a high arc (shorter, bent arm)
        const act = t < m.s ? 0 : Math.min(1, (t - m.s) / Math.max(1, m.a))
        const low = m.k === 'bodyhook' ? 32 : 0
        if (low) { const d = Math.max(wind, ext); P.hipY += 6 * d; P.shY += 10 * d; P.headY += 12 * d }
        const arcX = lerp(4, reach * 0.82, act), arcY = shY - 4 + low - Math.sin(act * Math.PI) * 14
        P.rhX = lerp(lerp(19, -6, wind), arcX, ext); P.rhY = lerp(lerp(P.rhY, shY + 20, wind), arcY, ext)
        P.lhX = 22; P.lhY = shY - 6
        P.shX += lerp(-10 * wind, 14, ext); P.headX += lerp(-8 * wind, 10, ext); P.headY += 4 * ext
        P.rfX -= 6 * ext; P.lean = lerp(-10 * wind, 12, ext)
        break
      }
      case 'teep': case 'clk': case 'jk': {
        // Teep (push kick): knee up, then the lead foot drives straight out at hip height
        const kickY = m.k === 'clk' ? -6 : m.k === 'jk' ? hipY + 18 : hipY + 2
        const chamberX = m.k === 'clk' ? 30 : 18, chamberY = m.k === 'clk' ? -10 : hipY + 6
        P.lfX = lerp(lerp(P.lfX, chamberX, wind), reach, ext); P.lfY = lerp(lerp(P.lfY, chamberY, wind), kickY, ext)
        P.shX -= 8 * Math.max(wind, ext) * (m.k === 'clk' ? 0.3 : 1); P.headX -= 8 * Math.max(wind, ext) * (m.k === 'clk' ? 0.3 : 1)
        P.lean = -6 * ext
        if (m.k === 'jk') { P.rfX = -12; P.rfY = -20 }
        break
      }
      case 'bodykick': case 'roundkick': {
        // Body kick: lead-leg roundhouse -- knee turns over and the shin snaps round to the ribs
        P.lfX = lerp(lerp(P.lfX, 10, wind), reach, ext); P.lfY = lerp(lerp(0, hipY + 4, wind), hipY - (m.k === 'roundkick' ? 26 : 18), ext)
        P.hipX += 4 * Math.max(wind, ext); P.shX -= 12 * ext; P.headX -= 14 * ext; P.headY += 4 * ext; P.lean = -12 * ext
        P.lhX = 14; P.lhY = shY; P.rhX = -6; P.rhY = shY + 18; P.rfX -= 4
        break
      }
      case 'highkick': {
        // rear-leg roundhouse: chamber the rear knee, swing it through high
        P.rfX = lerp(lerp(P.rfX, 6, wind), reach, ext); P.rfY = lerp(lerp(0, hipY + 6, wind), hipY - 32, ext)
        P.hipX += 8 * Math.max(wind, ext); P.shX -= 16 * ext; P.headX -= 18 * ext; P.headY += 6 * ext; P.lean = -16 * ext
        P.lhX = 12; P.lhY = shY + 2; P.rhX = -10; P.rhY = shY + 22
        break
      }
      case 'overhand': {
        // Overhand: rear hand loops up over the top and comes down onto the target
        const act = t < m.s ? 0 : Math.min(1, (t - m.s) / Math.max(1, m.a))
        P.rhX = lerp(lerp(19, -8, wind), lerp(10, reach * 0.88, act), ext); P.rhY = lerp(lerp(P.rhY, shY - 30, wind), lerp(shY - 34, shY + 2, act), ext)
        P.lhX = 20; P.lhY = shY - 4
        P.shX += lerp(-8 * wind, 16, ext); P.headX += lerp(-6 * wind, 12, ext); P.headY += 6 * ext; P.lean = lerp(-8 * wind, 16, ext); P.rfX -= 6 * ext
        break
      }
      case 'uppercut': {
        // Uppercut: dip, then the rear hand drives straight up through the middle
        const d = Math.max(wind * 0.8, 0)
        P.hipY += 8 * d * (1 - ext); P.shY += 10 * d * (1 - ext); P.headY += 10 * d * (1 - ext)
        P.rhX = lerp(lerp(19, 8, wind), reach * 0.5, ext); P.rhY = lerp(lerp(P.rhY, shY + 40, wind), shY - 40, ext)
        P.lhX = 22; P.lhY = shY - 6; P.shX += 8 * ext; P.headX += 6 * ext; P.headY -= 4 * ext; P.lean = 6 * ext
        break
      }
      case 'elbow': {
        // Elbow: short, bent rear arm whipping across with the shoulders turning in
        P.rhX = lerp(lerp(19, 2, wind), 36, ext); P.rhY = lerp(lerp(P.rhY, shY - 18, wind), shY - 8, ext)
        P.lhX = 26; P.lhY = shY - 2
        P.shX += lerp(-8 * wind, 16, ext); P.headX += lerp(-4 * wind, 12, ext); P.lean = lerp(-8 * wind, 14, ext); P.rfX -= 6 * ext
        break
      }
      case 'sidekick': {
        // Side kick: chamber, then the lead leg spears straight out while the body tips back
        P.lfX = lerp(lerp(P.lfX, 14, wind), reach, ext); P.lfY = lerp(lerp(0, hipY + 4, wind), hipY - 8, ext)
        P.hipX -= 4 * ext; P.shX -= 20 * ext; P.headX -= 22 * ext; P.headY += 10 * ext; P.lean = -18 * ext
        P.lhX = 6; P.lhY = shY + 6; P.rhX = -10; P.rhY = shY + 14
        break
      }
      case 'spinkick': {
        // Spinning back kick: turn away (head drops, shoulders swing back), then the rear leg fires straight
        P.rfX = lerp(lerp(P.rfX, -4, wind), reach, ext); P.rfY = lerp(lerp(0, hipY + 10, wind), hipY - 22, ext)
        P.hipX += 8 * Math.max(wind, ext); P.shX -= lerp(14 * wind, 24, ext); P.headX -= lerp(20 * wind, 26, ext); P.headY += lerp(8 * wind, 12, ext)
        P.lean = -lerp(10 * wind, 20, ext); P.lhX = -6; P.lhY = shY + 10; P.rhX = -14; P.rhY = shY + 18
        break
      }
      case 'lowkick': {
        // Low kick: rear shin swings round into the thigh
        P.rfX = lerp(lerp(P.rfX, -2, wind), reach, ext); P.rfY = lerp(lerp(0, -10, wind), -30, ext)
        P.hipX += 8 * Math.max(wind, ext); P.shX -= 8 * ext; P.headX -= 6 * ext; P.lean = -8 * ext
        P.lhX = 24; P.lhY = shY - 6; P.rhX = 8; P.rhY = shY + 18
        break
      }
      case 'knee': {
        // Knee: hands pull down into a clinch while the rear knee drives up and forward
        P.rfX = lerp(lerp(P.rfX, 4, wind), reach * 0.55, ext); P.rfY = lerp(lerp(0, -16, wind), hipY + 22, ext)
        P.hipX += 10 * Math.max(wind, ext); P.lean = 10 * ext; P.shX += 8 * ext; P.headX += 8 * ext
        P.lhX = lerp(32, 40, ext); P.lhY = shY + 2; P.rhX = lerp(19, 36, ext); P.rhY = shY + 6
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

export function makePose(f, frame) { const p = targetPose(f, frame); return { cur: { ...p }, prev: { ...p }, trail: [], sw: [] } }

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
  // swoosh: remember where the striking hand / foot has been during the attack
  const m = f.move, sw = pose.sw || (pose.sw = [])
  const limb = m && TIP[m.k]
  if (limb && f.t >= m.s - 2 && f.t <= m.s + m.a + 3 && f.state !== 'ko') {
    const lx = pose.cur[limb + 'X'], ly = pose.cur[limb + 'Y']
    sw.push({ x: f.x + lx * f.facing, y: f.y + ly })
    if (sw.length > 8) sw.shift()
    pose.swHeavy = HEAVY.has(m.k) || m.level === 'h' || !!m.super
  } else if (sw.length) { sw.shift(); if (sw.length) sw.shift() }
}
const TIP = { jab: 'lh', bodyjab: 'lh', clp: 'lh', cast: 'lh', cross: 'rh', hook: 'rh', bodyhook: 'rh', overhand: 'rh', uppercut: 'rh', elbow: 'rh', rush: 'rh', upper: 'rh', teep: 'lf', bodykick: 'lf', roundkick: 'lf', sidekick: 'lf', clk: 'lf', jk: 'lf', stomp: 'lf', highkick: 'rf', spinkick: 'rf', lowkick: 'rf', knee: 'rf' }
const HEAVY = new Set(['hook', 'overhand', 'uppercut', 'highkick', 'spinkick', 'sidekick', 'rush', 'upper'])

// glowing ribbon along the swoosh points, thin at the tail and wide at the newest point
function drawSwoosh(g, pose, colour) {
  const pts = pose.sw
  if (!pts || pts.length < 3) return
  const maxW = pose.swHeavy ? 20 : 12, n = pts.length
  const ribbon = (scale) => {
    const L = [], R = []
    for (let i = 0; i < n; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)]
      let dx = b.x - a.x, dy = b.y - a.y; const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d
      const w = maxW * scale * Math.pow(i / (n - 1), 1.3) / 2
      L.push({ x: pts[i].x - dy * w, y: pts[i].y + dx * w }); R.push({ x: pts[i].x + dy * w, y: pts[i].y - dx * w })
    }
    return [...L, ...R.reverse()]
  }
  g.fillStyle(colour, 0.35); g.fillPoints(ribbon(1.9), true)
  g.fillStyle(colour, 0.7); g.fillPoints(ribbon(1.15), true)
  g.fillStyle(0xffffff, 0.85); g.fillPoints(ribbon(0.45), true)
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
  if (!opts.noTrail) drawSwoosh(g, pose, hex(fxColour(f)))
}

const shade = (c, k) => (Math.min(255, ((c >> 16) & 255) * k) << 16) | (Math.min(255, ((c >> 8) & 255) * k) << 8) | Math.min(255, (c & 255) * k)
const OUTLINE = 0x07090c

function drawBody(g, f, P, fx, fy, dir, frame, opts) {
  if (getLook() === 'stick') return drawStick(g, f, P, fx, fy, dir, frame, opts)
  if (getLook() === 'house') return drawHouse(g, f, P, fx, fy, dir, frame, opts)
  const L = LOOKS[f.def.key] || LOOKS.mentality
  const ghost = opts.ghost
  const flash = !ghost && f.flash > 0 && f.flash % 4 < 2
  const A = ghost || 1
  const W8 = 0xffffff
  const kit = hex(f.def.colour), kitDark = hex(f.def.trim)
  const pick = c => ghost ? kit : flash ? W8 : c
  const skin = pick(hex(L.skin)), skinBack = pick(shade(hex(L.skin), 0.74))
  const shorts = pick(kit), shortsBack = pick(shade(kit, 0.72))
  const top = pick(0x1b2027), topSide = pick(0x12161b)
  const glove = pick(kit), gloveBack = pick(shade(kit, 0.72)), cuff = pick(0xf2f2f2)
  const boot = pick(0x15191e), hairC = pick(hex(L.hairCol))
  const ls = L.limb

  // K.O.: tip over backwards around the feet and lie flat
  let rot = 0, lift = 0
  if (f.state === 'ko' && !opts.noKo) {
    const p = Math.min(1, (f.koT || 0) / 18)
    rot = -dir * (Math.PI / 2) * (p * p) * 0.96
    lift = (fy - FLOOR) * (1 - p)
    fy = FLOOR
  }
  const cr = Math.cos(rot), sr = Math.sin(rot)
  // local (facing +x, y down, origin at feet) -> world
  const W = (lx, ly) => { const x = lx * dir; return { x: fx + x * cr - ly * sr, y: fy + lift + x * sr + ly * cr } }
  const V = (x, y) => ({ x, y })

  if (!ghost) {
    const airK = Math.max(0.35, 1 - (FLOOR - f.y) / 220)
    g.fillStyle(0x000000, 0.45 * airK); g.fillEllipse(fx, (opts.shadowY ?? FLOOR) + 6, 84 * airK, 14 * airK)
  }

  // ---- skeleton in local space ----
  const hipL = V(P.hipX + 6, P.hipY), hipR = V(P.hipX - 6, P.hipY)
  const shF = V(P.shX + 3, P.shY + 7), shB = V(P.shX - 9, P.shY + 9)
  const lf = V(P.lfX, P.lfY), rf = V(P.rfX, P.rfY), lh = V(P.lhX, P.lhY), rh = V(P.rhX, P.rhY)
  const J = (a, b, l, bend) => { const j = joint(a.x, a.y, b.x, b.y, l, l, bend); return V(j[0], j[1]) }
  const lk = J(hipL, lf, 27, -1), rk = J(hipR, rf, 27, -1)
  const le = J(shF, lh, 27, 1), re = J(shB, rh, 27, 1)

  // ---- drawing helpers (outline first, then fill) ----
  const poly = (pts, col, out = true) => {
    const w = pts.map(p => W(p.x, p.y))
    if (out && !ghost) { g.lineStyle(3, OUTLINE, A); g.strokePoints(w, true) }
    g.fillStyle(col, A); g.fillPoints(w, true)
  }
  // tapered segment a -> b, widths wa / wb (local units)
  const seg = (a, b, wa, wb, col, out = true) => {
    const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 0.001, nx = -dy / d, ny = dx / d
    const pa = W(a.x, a.y), pb = W(b.x, b.y)
    if (out && !ghost) {
      g.fillStyle(OUTLINE, A); g.fillCircle(pa.x, pa.y, wa / 2 + 1.5); g.fillCircle(pb.x, pb.y, wb / 2 + 1.5)
      const q = [V(a.x + nx * (wa / 2 + 1.5), a.y + ny * (wa / 2 + 1.5)), V(b.x + nx * (wb / 2 + 1.5), b.y + ny * (wb / 2 + 1.5)), V(b.x - nx * (wb / 2 + 1.5), b.y - ny * (wb / 2 + 1.5)), V(a.x - nx * (wa / 2 + 1.5), a.y - ny * (wa / 2 + 1.5))]
      g.fillPoints(q.map(p => W(p.x, p.y)), true)
    }
    g.fillStyle(col, A); g.fillCircle(pa.x, pa.y, wa / 2); g.fillCircle(pb.x, pb.y, wb / 2)
    const q = [V(a.x + nx * wa / 2, a.y + ny * wa / 2), V(b.x + nx * wb / 2, b.y + ny * wb / 2), V(b.x - nx * wb / 2, b.y - ny * wb / 2), V(a.x - nx * wa / 2, a.y - ny * wa / 2)]
    g.fillPoints(q.map(p => W(p.x, p.y)), true)
  }
  const circ = (c, r, col, out = true) => { const p = W(c.x, c.y); if (out && !ghost) { g.fillStyle(OUTLINE, A); g.fillCircle(p.x, p.y, r + 1.5) } g.fillStyle(col, A); g.fillCircle(p.x, p.y, r) }
  const line = (a, b, w, col, alpha = A) => { const p = W(a.x, a.y), q = W(b.x, b.y); g.lineStyle(w, col, alpha); g.lineBetween(p.x, p.y, q.x, q.y) }
  const mid = (a, b, t) => V(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t)

  const leg = (hip, knee, foot, back) => {
    const sk = back ? skinBack : skin
    seg(hip, knee, 17 * ls, 12 * ls, sk)                           // thigh
    const calf = mid(knee, foot, 0.35)
    seg(knee, calf, 11 * ls, 12.5 * ls, sk); seg(calf, foot, 12.5 * ls, 8 * ls, sk) // calf bulge
    // boot: toe points forward, or along the leg when it's kicking out
    const dx = foot.x - knee.x, dy = foot.y - knee.y, d = Math.hypot(dx, dy) || 1
    const k = foot.y < -14 && dx > 0 ? Math.min(1, (dx / d) * 1.2) : 0 // only a raised, forward foot points along the leg
    const tx = (1 - k) * 1 + k * (dx / d), ty = k * (dy / d) * 0.6, tl = Math.hypot(tx, ty) || 1
    const toe = V(foot.x + tx / tl * 14, foot.y + ty / tl * 14 + (1 - k) * 1), heel = V(foot.x - tx / tl * 3, foot.y - ty / tl * 3)
    seg(heel, toe, 10, 8, boot)
    line(mid(heel, toe, 0.1), mid(heel, toe, 0.9), 2, back ? shortsBack : shorts, A)
    // shorts leg over the top of the thigh
    {
      const e = mid(hip, knee, 0.48), ddx = e.x - hip.x, ddy = e.y - hip.y, dd = Math.hypot(ddx, ddy) || 1, px = -ddy / dd, py = ddx / dd
      // top edge level across the hip (joins the waistband), bottom edge square to the thigh
      const wa = 12 * ls, wb = 10.5 * ls
      const tA = V(hip.x + wa, hip.y - 7), tB = V(hip.x - wa, hip.y - 7)
      poly([tA, tB, V(e.x + px * wb, e.y + py * wb), V(e.x - px * wb, e.y - py * wb)], back ? shortsBack : shorts)
      if (!ghost) line(V(e.x + px * wb * 0.9, e.y + py * wb * 0.9), V(e.x - px * wb * 0.9, e.y - py * wb * 0.9), 2.5, cuff, 0.85) // hem stripe
    }
  }
  const arm = (sh, el, hand, back) => {
    const sk = back ? skinBack : skin
    seg(sh, el, 13 * ls, 10 * ls, sk)                              // upper arm (shoulder -> elbow)
    seg(el, mid(el, hand, 0.5), 10 * ls, 11 * ls, sk); seg(mid(el, hand, 0.5), hand, 11 * ls, 8 * ls, sk) // forearm
    // glove + cuff
    const dx = hand.x - el.x, dy = hand.y - el.y, d = Math.hypot(dx, dy) || 1
    const gc = V(hand.x + dx / d * 3, hand.y + dy / d * 3)
    circ(V(hand.x - dx / d * 3, hand.y - dy / d * 3), 6.5 * Math.max(1, ls * 0.9), cuff)
    circ(gc, 10 * Math.max(1, ls * 0.85), back ? gloveBack : glove)
    if (!ghost) { const hp = W(gc.x - 3, gc.y - 3); g.fillStyle(0xffffff, 0.35); g.fillCircle(hp.x, hp.y, 3) }
  }

  // ---- back limbs ----
  leg(hipR, rk, rf, true)
  arm(shB, re, rh, true)

  // ---- torso: tapered rash guard along the hip -> shoulder axis ----
  const hc = V(P.hipX, P.hipY), sc = V(P.shX, P.shY)
  const ax = sc.x - hc.x, ay = sc.y - hc.y, len = Math.hypot(ax, ay) || 1, ux = ax / len, uy = ay / len, nx = -uy, ny = ux
  const T = (t, w) => V(hc.x + ux * len * t + nx * w, hc.y + uy * len * t + ny * w)
  const torso = [T(0, L.hip), T(0.38, L.waist), T(0.78, L.chest), T(1.0, L.sh * 0.8), T(1.06, L.sh * 0.35), T(1.06, -L.sh * 0.35), T(1.0, -L.sh * 0.8), T(0.78, -L.chest), T(0.38, -L.waist), T(0, -L.hip)]
  // neck
  seg(T(0.95, 0), V(P.headX - 2, P.headY + 12), 11 * ls, 10 * ls, skinBack)
  poly(torso, top)
  if (!ghost) {
    // side panel + diagonal pillar stripe + neon trim
    g.fillStyle(topSide, A); g.fillPoints([T(0, -L.hip), T(0.38, -L.waist), T(0.78, -L.chest), T(1.0, -L.sh * 0.8), T(1.0, -L.sh * 0.3), T(0.4, -L.waist * 0.4), T(0, -L.hip * 0.4)].map(p => W(p.x, p.y)), true)
    g.fillStyle(kit, 1); g.fillPoints([T(0.86, L.chest * 0.9), T(0.98, L.chest * 0.5), T(0.42, -L.waist * 0.9), T(0.3, -L.waist * 0.9)].map(p => W(p.x, p.y)), true)
    line(T(0.06, L.hip), T(0.38, L.waist), 2, kit, 0.8); line(T(0.38, L.waist), T(0.78, L.chest), 2, kit, 0.8)
  }
  // shorts waistband + seat
  poly([T(-0.08, L.hip + 3), T(0.14, L.waist + 3), T(0.14, -L.waist - 3), T(-0.08, -L.hip - 3), T(-0.2, -L.hip), T(-0.2, L.hip)], shorts)
  if (!ghost) { line(T(0.1, L.waist + 3), T(0.1, -L.waist - 3), 3.5, cuff, 0.9) }

  // ---- front leg ----
  leg(hipL, lk, lf, false)

  // ---- head ----
  const H = V(P.headX, P.headY)
  const at = (x, y) => V(H.x + x, H.y + y)
  // ponytail / bun go behind the head
  if (L.hair === 'ponytail') { const sw = Math.sin(frame / 6) * 4; seg(at(-13, -8), at(-26, 4 + sw), 9, 6, hairC); seg(at(-26, 4 + sw), at(-30, 16 + sw), 6, 3, hairC) }
  if (L.hair === 'bun') circ(at(-11, -15), 7.5, hairC)
  circ(at(-1, 0), 16, skin)                                             // skull
  poly([at(4, 6), at(15, 4), at(16, 10), at(9, 16), at(0, 14)], skin, true) // jaw / chin
  if (!ghost) { g.fillStyle(skin, A); const c0 = W(H.x - 1, H.y); g.fillCircle(c0.x, c0.y, 15) }    // hide the seam
  // hair cap
  const arc = (r, a0, a1, n = 9) => { const pts = []; for (let i = 0; i <= n; i++) { const a = (a0 + (a1 - a0) * i / n) * Math.PI / 180; pts.push(at(-1 + Math.cos(a) * r, Math.sin(a) * r)) } return pts }
  if (L.hair !== 'none') {
    const capBack = L.hair === 'buzz' ? 150 : 165
    poly([...arc(17, -40, -90 - 95, 10), ...arc(L.hair === 'buzz' ? 15 : 13, -90 - 95 + (180 - capBack), -55, 6)], hairC)
  }
  if (L.hair === 'spiky') for (const [x, y, x2, y2] of [[-14, -10, -24, -18], [-8, -15, -14, -27], [0, -17, 0, -30], [7, -15, 12, -26]]) poly([at(x - 4, y + 2), at(x2, y2), at(x + 5, y + 2)], hairC)
  if (L.hair === 'mohawk') poly([at(-15, -8), at(-22, -20), at(-12, -18), at(-12, -31), at(-4, -21), at(0, -34), at(4, -21), at(10, -28), at(8, -15), at(-2, -16), at(-10, -10)], hairC)
  // headband (the signature) + tails
  if (!ghost) {
    line(at(-16, -7), at(15, -8), 5.5, kit, 1)
    const b1 = at(-15, -7)
    line(b1, at(-33, 3 + Math.sin(frame / 5) * 4), 5, kit, 1); line(b1, at(-29, -3 + Math.cos(frame / 6) * 4), 4, kit, 0.8)
  }
  // face
  if (!ghost) {
    const ko = f.state === 'ko', hurt = !ko && (f.stun > 0 || f.flash > 0)
    const attacking = !ko && !hurt && (f.move || f.blocking || f.counterT > 0)
    circ(at(-6, 1), 4, skinBack, false)                                  // ear
    line(at(14, -1), at(17, 4), 2, shade(hex(L.skin), 0.6), 0.9)          // nose
    if (ko) {
      line(at(6, -5), at(12, 1), 2.4, 0x111111); line(at(6, 1), at(12, -5), 2.4, 0x111111)
      line(at(7, 9), at(13, 9), 2, 0x111111)
    } else if (hurt) {
      line(at(5, -3), at(12, -1), 2.4, 0x111111)                         // squeezed eye
      const m = W(H.x + 10, H.y + 9); g.fillStyle(0x2a0f0f, 1); g.fillCircle(m.x, m.y, 3.2)
    } else {
      const e = W(H.x + 9, H.y - 2); g.fillStyle(0xffffff, 1); g.fillEllipse(e.x, e.y, 7, 5)
      const pu = W(H.x + 10.5, H.y - 2); g.fillStyle(0x111111, 1); g.fillCircle(pu.x, pu.y, 2)
      if (attacking) { line(at(4, -9), at(13, -5), 2.6, hairC); const a = W(H.x + 7, H.y + 8), b = W(H.x + 13, H.y + 8); g.fillStyle(0xffffff, 1); g.fillRect(Math.min(a.x, b.x), Math.min(a.y, b.y) - 1.5, Math.abs(b.x - a.x) + 1, 3); line(at(7, 8), at(13, 8), 1, 0x111111) }
      else { line(at(4, -8), at(13, -8), 2.2, hairC); line(at(8, 9), at(13, 8), 1.8, 0x3a1a14) }
    }
  }

  // ---- front arm (over everything) ----
  arm(shF, le, lh, false)

  // Counter stance aura
  if (!ghost && f.counterT > 0) {
    const r = 58 + Math.sin(frame / 2) * 4
    g.lineStyle(3, 0xffffff, 0.75); g.strokeCircle(f.x, f.y - 72, r)
    g.lineStyle(8, kit, 0.25); g.strokeCircle(f.x, f.y - 72, r + 4)
  }
}


// ---------------- silhouette stickman ----------------
// Player = white, CPU = black (like the classic stickman brawlers). The pillar colour shows on a
// flowing scarf and belt sash. Thin round-capped limbs, solid round head, no face.
function drawStick(g, f, P, fx, fy, dir, frame, opts) {
  const L = LOOKS[f.def.key] || LOOKS.mentality
  const ghost = opts.ghost
  const kit = hex(f.def.colour)
  const light = (opts.side || f.side || 'p1') === 'p1'
  const flash = !ghost && f.flash > 0 && f.flash % 4 < 2
  const A = ghost || 1
  let front = light ? 0xf4f4f2 : 0x0c0d0f, back = light ? 0xbfc4c8 : 0x34383e
  if (flash) { front = light ? kit : 0xffffff; back = front }
  if (ghost) { front = kit; back = kit }

  let rot = 0, lift = 0
  if (f.state === 'ko' && !opts.noKo) {
    const p = Math.min(1, (f.koT || 0) / 18)
    rot = -dir * (Math.PI / 2) * (p * p) * 0.96
    lift = (fy - FLOOR) * (1 - p)
    fy = FLOOR
  }
  const cr = Math.cos(rot), sr = Math.sin(rot)
  const W = (lx, ly) => { const x = lx * dir; return { x: fx + x * cr - ly * sr, y: fy + lift + x * sr + ly * cr } }
  const V = (x, y) => ({ x, y })
  if (!ghost) {
    const airK = Math.max(0.35, 1 - (FLOOR - f.y) / 220)
    g.fillStyle(0x000000, 0.3 * airK); g.fillEllipse(fx, (opts.shadowY ?? FLOOR) + 6, 76 * airK, 12 * airK)
  }
  const ls = 0.85 + (L.limb - 1) * 0.9
  const cap = (a, b, w, col) => {
    const p = W(a.x, a.y), q = W(b.x, b.y)
    g.lineStyle(w, col, A); g.lineBetween(p.x, p.y, q.x, q.y)
    g.fillStyle(col, A); g.fillCircle(p.x, p.y, w / 2); g.fillCircle(q.x, q.y, w / 2)
  }
  const hipL = V(P.hipX + 4, P.hipY), hipR = V(P.hipX - 4, P.hipY)
  const shF = V(P.shX + 2, P.shY + 6), shB = V(P.shX - 4, P.shY + 7)
  const lf = V(P.lfX, P.lfY), rf = V(P.rfX, P.rfY), lh = V(P.lhX, P.lhY), rh = V(P.rhX, P.rhY)
  const J = (a, b, l, bend) => { const j = joint(a.x, a.y, b.x, b.y, l, l, bend); return V(j[0], j[1]) }
  const lk = J(hipL, lf, 33, -1), rk = J(hipR, rf, 33, -1)
  const le = J(shF, lh, 27, 1), re = J(shB, rh, 27, 1)
  const legW = 10 * ls, armW = 8.5 * ls, torsoW = 14 * (0.85 + (L.sh - 18) / 30)
  const foot = (ft, knee, col) => { const k = ft.y < -14 && ft.x > knee.x ? 1 : 0; const dx = ft.x - knee.x, dy = ft.y - knee.y, d = Math.hypot(dx, dy) || 1; cap(ft, V(ft.x + (k ? dx / d : 1) * 10, ft.y + (k ? dy / d * 10 : 0)), legW * 0.8, col) }

  // scarf (behind everything) flowing from the neck
  const H = V(P.headX, P.headY)
  if (!ghost) {
    const sway = Math.sin(frame / 6) * 4, sway2 = Math.cos(frame / 7) * 5
    const n0 = V(P.shX - 2, P.shY - 2)
    const s1 = V(n0.x - 16, n0.y + 2 + sway), s2 = V(n0.x - 30, n0.y + 8 + sway2), s3 = V(n0.x - 40, n0.y + 16 + sway)
    cap(n0, s1, 6, kit); cap(s1, s2, 5, kit); cap(s2, s3, 3.5, kit)
  }
  // back limbs
  cap(hipR, rk, legW, back); cap(rk, rf, legW * 0.92, back); foot(rf, rk, back)
  cap(shB, re, armW, back); cap(re, rh, armW * 0.9, back)
  { const p = W(rh.x, rh.y); g.fillStyle(back, A); g.fillCircle(p.x, p.y, armW * 0.85) }
  // torso: slightly tapered (chest wider than hips)
  const hc = V(P.hipX, P.hipY), sc = V(P.shX, P.shY + 4)
  cap(hc, V((hc.x + sc.x) / 2, (hc.y + sc.y) / 2), torsoW * 0.9, front); cap(V((hc.x + sc.x) / 2, (hc.y + sc.y) / 2), sc, torsoW, front)
  // belt sash in pillar colour
  if (!ghost) {
    const b1 = V(P.hipX - torsoW * 0.5, P.hipY - 4), b2 = V(P.hipX + torsoW * 0.5, P.hipY - 5)
    cap(b1, b2, 4, kit)
    const t0 = V(P.hipX - torsoW * 0.45, P.hipY - 4), sw = Math.sin(frame / 5) * 3
    cap(t0, V(t0.x - 9, t0.y + 9 + sw), 3, kit); cap(t0, V(t0.x - 4, t0.y + 12 - sw), 3, kit)
  }
  // neck + head
  cap(V(P.shX + 1, P.shY), V(H.x - 1, H.y + 8), 7, front)
  { const p = W(H.x, H.y); g.fillStyle(front, A); g.fillCircle(p.x, p.y, 13.5)
    // hair silhouette bump so builds still read (bun / ponytail / spikes / mohawk)
    const hp = (x, y, r) => { const q = W(H.x + x, H.y + y); g.fillCircle(q.x, q.y, r) }
    if (L.hair === 'bun') hp(-10, -12, 6.5)
    if (L.hair === 'ponytail') { const sw = Math.sin(frame / 6) * 3; cap(V(H.x - 11, H.y - 6), V(H.x - 24, H.y + 6 + sw), 6, front) }
    if (L.hair === 'spiky') for (const [x, y] of [[-11, -9], [-5, -14], [2, -15]]) { const a = W(H.x + x - 4, H.y + y + 3), b = W(H.x + x - 4, H.y + y - 9), c = W(H.x + x + 4, H.y + y + 3); g.fillTriangle(a.x, a.y, b.x, b.y, c.x, c.y) }
    if (L.hair === 'mohawk') { const a = W(H.x - 12, H.y - 6), b = W(H.x - 2, H.y - 24), c = W(H.x + 6, H.y - 10); g.fillTriangle(a.x, a.y, b.x, b.y, c.x, c.y) }
    // headband in pillar colour
    if (!ghost) { const a = W(H.x - 13, H.y - 5), b = W(H.x + 13, H.y - 6); g.lineStyle(4, kit, 1); g.lineBetween(a.x, a.y, b.x, b.y) }
  }
  // front leg + arm
  cap(hipL, lk, legW, front); cap(lk, lf, legW * 0.92, front); foot(lf, lk, front)
  cap(shF, le, armW, front); cap(le, lh, armW * 0.9, front)
  { const p = W(lh.x, lh.y); g.fillStyle(front, A); g.fillCircle(p.x, p.y, armW * 0.9) }
  // white figure gets a soft dark edge so it reads on light backgrounds
  if (light && !ghost && !flash) { const p = W(H.x, H.y); g.lineStyle(1.5, 0x000000, 0.25); g.strokeCircle(p.x, p.y, 13.5) }

  if (!ghost && f.counterT > 0) {
    const r = 58 + Math.sin(frame / 2) * 4
    g.lineStyle(3, 0xffffff, 0.75); g.strokeCircle(f.x, f.y - 72, r)
    g.lineStyle(8, kit, 0.3); g.strokeCircle(f.x, f.y - 72, r + 4)
  }
}


// ---------------- house themes (level 3) ----------------
// Black silhouette with a glowing house-colour rim and glowing eyes, plus the house's signature effect:
// Dragon = a red serpent coiling up around them, Super = flame aura + orbiting energy ring,
// Jet = speed streaks, Ice = orbiting ice shards + frost, Storm = crackling purple lightning.
function noise(n) { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x) }
function drawHouse(g, f, P, fx, fy, dir, frame, opts) {
  const T = HOUSES[f.theme] || HOUSES.dragon
  const L = LOOKS[f.def.key] || LOOKS.mentality
  const ghost = opts.ghost
  const col = hex(T.colour), glow = hex(T.glow)
  const flash = !ghost && f.flash > 0 && f.flash % 4 < 2
  const A = ghost || 1
  const body = ghost ? col : flash ? 0xffffff : 0x07080a, bodyBack = ghost ? col : flash ? 0xffffff : 0x1a1c21
  const hot = (f.move && f.move.dmg > 0) || f.counterT > 0 || (f.meter || 0) >= 100 ? 1 : 0

  let rot = 0, lift = 0
  if (f.state === 'ko' && !opts.noKo) {
    const p = Math.min(1, (f.koT || 0) / 18)
    rot = -dir * (Math.PI / 2) * (p * p) * 0.96
    lift = (fy - FLOOR) * (1 - p)
    fy = FLOOR
  }
  const ko = f.state === 'ko'
  const cr = Math.cos(rot), sr = Math.sin(rot)
  const W = (lx, ly) => { const x = lx * dir; return { x: fx + x * cr - ly * sr, y: fy + lift + x * sr + ly * cr } }
  const V = (x, y) => ({ x, y })
  const cx = fx, cy = fy - 75

  // ---- signature effect behind the fighter ----
  if (!ghost && !ko) {
    const a0 = 0.45 + hot * 0.35
    if (T.aura === 'dragon') {
      // serpent coiling upward around the body, head at the top
      const n = 26, pts = []
      for (let i = 0; i <= n; i++) {
        const t = i / n, ang = t * Math.PI * 2.6 + frame * 0.05
        pts.push({ x: cx + Math.cos(ang) * (44 - t * 14) * dir, y: fy - 6 - t * 150 + Math.sin(ang) * 10, w: 3 + Math.sin(t * Math.PI) * 9, front: Math.sin(ang) > 0 })
      }
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i]
        if (b.front) continue // front half drawn after the body
        g.lineStyle(b.w + 4, col, a0 * 0.35); g.lineBetween(a.x, a.y, b.x, b.y)
        g.lineStyle(b.w, col, a0); g.lineBetween(a.x, a.y, b.x, b.y)
      }
      f._dragon = pts
    } else if (T.aura === 'flame') {
      const pts = [], n = 22
      for (let i = 0; i <= n; i++) {
        const t = i / n, ang = Math.PI * (1.05 + t * 0.9) // upper arc
        const spike = i % 2 ? 1 : 0.62
        const r = (78 + hot * 18) * spike * (0.85 + noise(i + Math.floor(frame / 3) * 7) * 0.3)
        pts.push({ x: cx + Math.cos(ang) * r * 0.8, y: cy + 20 + Math.sin(ang) * r * 1.25 })
      }
      pts.push({ x: cx + 40, y: fy - 4 }, { x: cx - 40, y: fy - 4 })
      g.fillStyle(col, a0 * 0.55); g.fillPoints(pts, true)
      g.fillStyle(glow, a0 * 0.35); g.fillPoints(pts.map(p => ({ x: cx + (p.x - cx) * 0.62, y: cy + 20 + (p.y - cy - 20) * 0.7 })), true)
    } else if (T.aura === 'speed') {
      const moving = Math.abs(f.vx) > 0.5 || f.move
      const k = moving ? 1 : 0.45
      for (let i = 0; i < 9; i++) {
        const y = fy - 18 - noise(i * 3.1) * 150, len = 30 + noise(i * 7.7) * 70
        const off = ((frame * (6 + i % 3 * 3) + noise(i) * 200) % 120)
        const x0 = cx - dir * (20 + off), x1 = x0 - dir * len * k
        g.lineStyle(i % 3 ? 2 : 4, i % 2 ? col : glow, a0 * 0.7 * k * (1 - off / 140)); g.lineBetween(x0, y, x1, y)
      }
    } else if (T.aura === 'frost') {
      for (let i = 0; i < 9; i++) {
        const ang = i / 9 * Math.PI * 2 + frame * 0.02, r = 62 + Math.sin(frame / 20 + i) * 6
        const x = cx + Math.cos(ang) * r, y = cy + Math.sin(ang) * r * 1.1
        const s2 = 9 + noise(i) * 7, rot2 = ang + Math.PI / 2
        const p = (dx, dy) => ({ x: x + dx * Math.cos(rot2) - dy * Math.sin(rot2), y: y + dx * Math.sin(rot2) + dy * Math.cos(rot2) })
        g.fillStyle(col, a0 * 0.75); g.fillPoints([p(0, -s2), p(s2 * 0.35, 0), p(0, s2), p(-s2 * 0.35, 0)], true)
        g.fillStyle(glow, a0 * 0.7); g.fillPoints([p(0, -s2 * 0.6), p(s2 * 0.15, 0), p(0, s2 * 0.6), p(-s2 * 0.15, 0)], true)
      }
      g.lineStyle(2, col, a0 * 0.35); g.strokeEllipse(cx, cy, 128, 148)
    } else if (T.aura === 'storm') {
      const seed = Math.floor(frame / 4)
      g.lineStyle(2, col, a0 * 0.3); g.strokeEllipse(cx, cy, 136, 156)
      for (let b = 0; b < 2 + hot * 2; b++) {
        const ang = noise(seed * 5 + b) * Math.PI * 2, r = 70
        let x = cx + Math.cos(ang) * r, y = cy + Math.sin(ang) * r * 1.1
        const pts = [{ x, y }]
        for (let k = 0; k < 5; k++) { x += (cx - x) * 0.22 + (noise(seed * 11 + b * 7 + k) - 0.5) * 26; y += (cy - y) * 0.22 + (noise(seed * 13 + b * 5 + k) - 0.5) * 26; pts.push({ x, y }) }
        g.lineStyle(5, col, a0 * 0.5); g.strokePoints(pts, false)
        g.lineStyle(1.8, glow, a0); g.strokePoints(pts, false)
      }
    }
  }

  // ---- skeleton (long legs) ----
  const hipL = V(P.hipX + 4, P.hipY), hipR = V(P.hipX - 4, P.hipY)
  const shF = V(P.shX + 2, P.shY + 6), shB = V(P.shX - 4, P.shY + 7)
  const lf = V(P.lfX, P.lfY), rf = V(P.rfX, P.rfY), lh = V(P.lhX, P.lhY), rh = V(P.rhX, P.rhY)
  const J = (a, b, l, bend) => { const j = joint(a.x, a.y, b.x, b.y, l, l, bend); return V(j[0], j[1]) }
  const lk = J(hipL, lf, 33, -1), rk = J(hipR, rf, 33, -1)
  const le = J(shF, lh, 27, 1), re = J(shB, rh, 27, 1)
  const ls = 0.85 + (L.limb - 1) * 0.9
  const legW = 10 * ls, armW = 8.5 * ls, torsoW = 14 * (0.85 + (L.sh - 18) / 30)
  const H = V(P.headX, P.headY)
  const hc = V(P.hipX, P.hipY), sc = V(P.shX, P.shY + 4), mc = V((hc.x + sc.x) / 2, (hc.y + sc.y) / 2)
  const toe = (ft, knee) => { const k = ft.y < -14 && ft.x > knee.x ? 1 : 0; const dx = ft.x - knee.x, dy = ft.y - knee.y, d = Math.hypot(dx, dy) || 1; return V(ft.x + (k ? dx / d : 1) * 10, ft.y + (k ? dy / d * 10 : 0)) }
  const segs = [
    [hipR, rk, legW, 1], [rk, rf, legW * 0.92, 1], [rf, toe(rf, rk), legW * 0.8, 1],
    [shB, re, armW, 1], [re, rh, armW * 0.9, 1],
    [hc, mc, torsoW * 0.9, 0], [mc, sc, torsoW, 0], [V(P.shX + 1, P.shY), V(H.x - 1, H.y + 8), 7, 0],
    [hipL, lk, legW, 0], [lk, lf, legW * 0.92, 0], [lf, toe(lf, lk), legW * 0.8, 0],
    [shF, le, armW, 0], [le, lh, armW * 0.9, 0],
  ]
  const cap = (a, b, w, c, al) => { const p = W(a.x, a.y), q = W(b.x, b.y); g.lineStyle(w, c, al); g.lineBetween(p.x, p.y, q.x, q.y); g.fillStyle(c, al); g.fillCircle(p.x, p.y, w / 2); g.fillCircle(q.x, q.y, w / 2) }
  const headShape = (c, al, grow) => {
    const p = W(H.x, H.y); g.fillStyle(c, al); g.fillCircle(p.x, p.y, 13.5 + grow)
    const tri = (pts) => g.fillTriangle(...pts.flatMap(([x, y]) => { const q = W(H.x + x, H.y + y); return [q.x, q.y] }))
    if (T.head === 'spiky') { for (const [x, y] of [[-12, -6], [-7, -12], [0, -14], [6, -11]]) tri([[x - 5 - grow, y + 4], [x - 6, y - 14 - grow * 1.5], [x + 5 + grow, y + 4]]) }
    if (T.head === 'mask' || T.head === 'hood') tri([[-14 - grow, -4], [-22 - grow, 10 + grow], [-6, 12]]) // hood falls behind
    if (T.head === 'hood') tri([[-10 - grow, -10], [-4, -22 - grow * 1.5], [6 + grow, -11]])
    const hd = W(H.x, H.y)
    for (const [ax, ay] of [[-11, 4], [-10, 9]]) { const q = W(H.x + ax, H.y + ay); g.fillCircle((q.x + hd.x) / 2, (q.y + hd.y) / 2, 9 + grow) }
  }
  // pass 1: glowing rim
  if (!ghost) {
    const rim = 5 + hot * 2
    for (const [a, b, w] of segs) cap(a, b, w + rim, col, 0.55)
    headShape(col, 0.55, rim / 2)
  }
  // pass 2: black body (back limbs a touch lighter)
  for (const [a, b, w, back] of segs.slice(0, 5)) cap(a, b, w, back ? bodyBack : body, A)
  for (const [a, b, w] of segs.slice(5, 8)) cap(a, b, w, body, A)
  headShape(body, A, 0)
  for (const [a, b, w] of segs.slice(8)) cap(a, b, w, body, A)
  { const p = W(rh.x, rh.y); g.fillStyle(bodyBack, A); g.fillCircle(p.x, p.y, armW * 0.85); const q = W(lh.x, lh.y); g.fillStyle(body, A); g.fillCircle(q.x, q.y, armW * 0.9) }

  if (ghost) return
  // headband tails (Dragon / Jet), belt in house colour
  if (T.head === 'band') {
    const a = W(H.x - 13, H.y - 5), b = W(H.x + 12, H.y - 6); g.lineStyle(3.5, col, 1); g.lineBetween(a.x, a.y, b.x, b.y)
    const long2 = T.aura === 'speed' ? 1.6 : 1
    const t1 = W(H.x - 13 - 22 * long2, H.y + 2 + Math.sin(frame / 4) * 4), t2 = W(H.x - 13 - 18 * long2, H.y - 4 + Math.cos(frame / 5) * 4)
    g.lineStyle(3.5, col, 1); g.lineBetween(a.x, a.y, t1.x, t1.y); g.lineStyle(2.5, col, 0.8); g.lineBetween(a.x, a.y, t2.x, t2.y)
  }
  { const b1 = W(P.hipX - torsoW * 0.5, P.hipY - 4), b2 = W(P.hipX + torsoW * 0.5, P.hipY - 5); g.lineStyle(3.5, col, 1); g.lineBetween(b1.x, b1.y, b2.x, b2.y) }
  // glowing eyes (ice mask gets a visor slit)
  if (!ko) {
    const e = W(H.x + 8, H.y - 1), e2 = W(H.x + 2, H.y - 1)
    g.fillStyle(col, 0.6); g.fillEllipse(e.x, e.y, 9, 6); g.fillEllipse(e2.x, e2.y, 7, 5)
    g.fillStyle(0xffffff, 1); g.fillEllipse(e.x, e.y, 4.5, 2.6); g.fillEllipse(e2.x, e2.y, 3.4, 2.2)
    if (T.head === 'mask') { const m1 = W(H.x - 2, H.y + 5), m2 = W(H.x + 13, H.y + 4); g.lineStyle(2, col, 0.7); g.lineBetween(m1.x, m1.y, m2.x, m2.y) }
  } else { const e = W(H.x + 7, H.y - 1); g.lineStyle(2, col, 0.8); g.lineBetween(e.x - 3, e.y - 3, e.x + 3, e.y + 3); g.lineBetween(e.x - 3, e.y + 3, e.x + 3, e.y - 3) }

  // ---- in front of the body ----
  if (!ko && T.aura === 'dragon' && f._dragon) {
    const pts = f._dragon, a0 = 0.45 + hot * 0.35
    for (let i = 1; i < pts.length; i++) { const a = pts[i - 1], b = pts[i]; if (!b.front) continue; g.lineStyle(b.w + 4, col, a0 * 0.35); g.lineBetween(a.x, a.y, b.x, b.y); g.lineStyle(b.w, col, a0); g.lineBetween(a.x, a.y, b.x, b.y) }
    // dragon head at the top of the coil
    const hd = pts[pts.length - 1], pr = pts[pts.length - 3], ang = Math.atan2(hd.y - pr.y, hd.x - pr.x)
    const P2 = (d, s) => ({ x: hd.x + Math.cos(ang) * d - Math.sin(ang) * s, y: hd.y + Math.sin(ang) * d + Math.cos(ang) * s })
    g.fillStyle(col, Math.min(1, a0 + 0.2)); g.fillPoints([P2(-6, -7), P2(14, -4), P2(18, 0), P2(12, 3), P2(16, 7), P2(-4, 6)], true)
    g.fillStyle(0xffffff, 0.9); const ey = P2(4, -3); g.fillCircle(ey.x, ey.y, 1.8)
  }
  if (!ko && T.aura === 'flame') {
    // orbiting energy ring (tilted ellipse), front half over the body
    const pts = []
    for (let i = 0; i <= 24; i++) { const a = i / 24 * Math.PI * 2 + frame * 0.08, x = Math.cos(a) * 62, y = Math.sin(a) * 16; const tilt = -0.35; pts.push({ x: cx + x * Math.cos(tilt) - y * Math.sin(tilt), y: cy + 10 + x * Math.sin(tilt) + y * Math.cos(tilt), front: Math.sin(a) > 0 }) }
    for (let i = 1; i < pts.length; i++) if (pts[i].front) { g.lineStyle(4, glow, 0.85); g.lineBetween(pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y) }
  }
  if (f.counterT > 0) {
    const r = 58 + Math.sin(frame / 2) * 4
    g.lineStyle(3, 0xffffff, 0.75); g.strokeCircle(f.x, f.y - 72, r)
    g.lineStyle(8, col, 0.3); g.strokeCircle(f.x, f.y - 72, r + 4)
  }
}
