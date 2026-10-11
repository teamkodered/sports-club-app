// KR FIGHT 2 -- jointed fighter rendering. Each fighter has a target pose (hands, feet, hips,
// shoulders, head) worked out from what they're doing; the drawn pose eases towards it every step,
// so moves blend instead of snapping. Elbows and knees come from simple two-bone IK.
import { FLOOR, hex, LOOKS } from './data.js'

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

const shade = (c, k) => (Math.min(255, ((c >> 16) & 255) * k) << 16) | (Math.min(255, ((c >> 8) & 255) * k) << 8) | Math.min(255, (c & 255) * k)
const OUTLINE = 0x07090c

function drawBody(g, f, P, fx, fy, dir, frame, opts) {
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
