// LAST MAN STANDING -- the battle simulation (no drawing). Ten fighters in one boxing ring, all with the
// KR FIGHT move sets (each fighter's style decides what it throws). Everyone moves freely in the ring (x left /
// right, z back / front), picks a target and fights. Every hit raises the target's damage %, and the higher it
// is the further the next hit sends them. Hit hard enough into the ropes and they go over the top -- out.
// Last fighter in the ring wins. Runs at 60 steps a second and reports what happened as events.
import { MOVES, LEVEL_SCALE, styledDef, FIGHTERS, STYLE_KEYS } from '../krfight/data.js'
import { makeFighter } from '../krfight/core.js'

export const ordinal = n => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th')
export const RING = 200 // half the ring's size (x and z both run -RING..RING)
const BUTTONS = [['lp', 30], ['mp', 24], ['hp', 15], ['lk', 12], ['mk', 11], ['hk', 8]]
const pickButton = () => { let r = Math.random() * 100; for (const [k, w] of BUTTONS) { r -= w; if (r <= 0) return k } return 'lp' }
const NAMES = ['Viper', 'Tank', 'Flash', 'Rocket', 'Shadow', 'Blaze', 'Storm', 'Ace', 'Bolt', 'Titan', 'Nova', 'Jet', 'Razor', 'Hammer', 'Ghost', 'Cobra']

// player = { name, colour (fighter key), style } -- that fighter is "you"; the other nine are made up
export function makeRoster(player) {
  const names = [...NAMES].sort(() => Math.random() - 0.5)
  const roster = []
  for (let i = 0; i < 10; i++) {
    const you = i === 0 && player
    const base = you ? FIGHTERS.find(f => f.key === player.colour) || FIGHTERS[0] : FIGHTERS[i % 5]
    const style = you ? player.style : STYLE_KEYS[Math.floor(Math.random() * STYLE_KEYS.length)]
    roster.push({ id: i, you: !!you, name: you ? (player.name || 'You') : names[i], key: base.key, colour: base.colour, colourName: base.name, style,
      skin: you ? 'neon' : ['neon', 'standard', 'obsidian'][i % 3] })
  }
  return roster
}

export class Battle {
  constructor(roster) {
    this.frame = 0; this.events = []; this.phase = 'intro'; this.introT = 150; this.placings = []
    // start spread around the ring
    this.fs = roster.map((r, i) => {
      const def = styledDef(FIGHTERS.find(f => f.key === r.key), r.style)
      const f = makeFighter(def, 0, 1)
      const a = (i / roster.length) * Math.PI * 2 + Math.random() * 0.3, rad = RING * (0.45 + Math.random() * 0.35)
      Object.assign(f, { r, id: r.id, side: 'p1', skin: r.skin, px: Math.cos(a) * rad, pz: Math.sin(a) * rad * 0.85, kx: 0, kz: 0, pct: 0,
        out: false, flyT: 0, target: null, retarget: 0, cd: 30 + Math.random() * 40, blockT: 0, strafe: Math.random() < 0.5 ? 1 : -1, kos: 0, lastHitBy: null })
      f.x = f.px
      return f
    })
  }
  emit(e) { this.events.push(e) }
  drain() { const e = this.events; this.events = []; return e }
  alive() { return this.fs.filter(f => !f.out) }
  // knock-back grows the longer the fight goes, so it always ends
  rage() { return 1 + Math.max(0, this.frame - 60 * 45) / (60 * 40) }

  step() {
    this.frame++
    if (this.phase === 'intro') { if (--this.introT <= 0) { this.phase = 'fight'; this.emit({ type: 'bell' }) } else return }
    if (this.phase === 'done') return
    const alive = this.alive()
    for (const f of this.fs) {
      if (f.out) { if (f.flyT > 0) { f.flyT--; f.px += f.kx; f.pz += f.kz; f.flyY += f.flyVy; f.flyVy += 0.9 } continue }
      if (f.stun > 0) f.stun--
      if (f.cd > 0) f.cd--
      if (f.blockT > 0) f.blockT--
      if (f.flash > 0) f.flash--
      f.blocking = f.blockT > 0 && !f.move
      // target: someone close, re-thought now and then (and straight away if they're gone)
      if (!f.target || f.target.out || --f.retarget <= 0) {
        const others = alive.filter(o => o !== f)
        if (others.length) {
          others.sort((a, b) => Math.hypot(a.px - f.px, a.pz - f.pz) - Math.hypot(b.px - f.px, b.pz - f.pz))
          f.target = others[Math.random() < 0.7 ? 0 : Math.min(others.length - 1, 1 + Math.floor(Math.random() * 2))]
        }
        f.retarget = 90 + Math.random() * 120
      }
      const t = f.target
      let wx = 0, wz = 0
      if (f.move) {
        // strike timeline: the first fighter in front of you, close enough, takes the hit
        f.t++
        const m = f.move
        if (!f.hitDone && f.t >= m.s && f.t < m.s + m.a) {
          let best = null, bd = 1e9
          for (const o of alive) {
            if (o === f || o.out) continue
            const dx = (o.px - f.px) * f.facing, dz = Math.abs(o.pz - f.pz)
            if (dx > 0 && dx <= m.reach + 10 && dz < 24 && dx < bd) { best = o; bd = dx }
          }
          if (best) { f.hitDone = true; this.hit(f, best, m) }
        }
        if (f.t >= m.s + m.a + m.r) f.move = null
      } else if (t && f.stun === 0) {
        if (t.px !== f.px) f.facing = t.px > f.px ? 1 : -1
        const dx = t.px - f.px, dz = t.pz - f.pz, ax = Math.abs(dx)
        const reach = 58 * (f.def.reach || 1)
        const speed = (f.def.speed || 4.2) * 0.42
        // line up on the same depth, then get to punching range; circle a little so it isn't a conga line
        if (Math.abs(dz) > 10) wz = Math.sign(dz) * speed * 0.8
        else wz = f.strafe * speed * 0.15
        if (ax > reach * 0.95) wx = Math.sign(dx) * speed
        else if (ax < reach * 0.45) wx = -Math.sign(dx) * speed * 0.6
        // attack when in range
        if (ax <= reach * 1.05 && Math.abs(dz) < 18 && f.cd <= 0) {
          const k = pickButton(), id = (f.def.moves && f.def.moves[k]) || k, mv = MOVES[id]
          if (mv) {
            const lvl = LEVEL_SCALE[k[0]] || LEVEL_SCALE.l
            f.move = { k: id, ...mv, dmg: mv.dmg * lvl.dmg * (f.def.power || 1), s: mv.s + lvl.s, reach: mv.reach * (f.def.reach || 1) }
            f.t = 0; f.hitDone = false; f.cd = 8 + Math.random() * 20
            this.emit({ type: 'whoosh', f, heavy: lvl.dmg > 1.3 })
          }
        }
        // see it coming? sometimes cover up
        if (t.move && t.target === f && t.t === 1 && Math.random() < 0.22) f.blockT = 22
        if (Math.random() < 0.004) f.strafe *= -1
      }
      f.state = f.move ? 'attack' : f.stun > 0 ? 'hit' : (wx || wz) ? 'walk' : 'idle'
      f.vx = wx
      // move: walking + knock-back (which fades)
      f.px += wx + f.kx; f.pz += wz + f.kz
      f.kx *= 0.86; f.kz *= 0.86
      if (Math.abs(f.kx) < 0.05) f.kx = 0
      if (Math.abs(f.kz) < 0.05) f.kz = 0
      // the ropes: hit them hard and you go over the top; otherwise bounce off
      const sp = Math.hypot(f.kx, f.kz)
      for (const [ax, kk] of [['px', 'kx'], ['pz', 'kz']]) {
        if (Math.abs(f[ax]) > RING) {
          if (sp > 6.5) { this.knockOut(f); break }
          f[ax] = Math.sign(f[ax]) * RING; f[kk] *= -0.45
          if (sp > 2.5) this.emit({ type: 'rope', f })
        }
      }
      f.x = f.px
    }
    // fighters don't stand inside each other
    const live = this.alive()
    for (let i = 0; i < live.length; i++) for (let j = i + 1; j < live.length; j++) {
      const a = live[i], b = live[j], dx = b.px - a.px, dz = (b.pz - a.pz) * 1.6, d = Math.hypot(dx, dz)
      if (d > 0 && d < 30) { const push = (30 - d) / 2 / d; a.px -= dx * push; b.px += dx * push; a.pz -= dz / 1.6 * push; b.pz += dz / 1.6 * push }
    }
    if (live.length <= 1 && this.phase === 'fight') {
      this.phase = 'done'
      if (live[0]) this.placings.unshift(live[0])
      this.emit({ type: 'winner', f: live[0] })
    }
  }

  hit(att, def, m) {
    const facingAttacker = (att.px - def.px) * def.facing > 0
    const blocked = def.blocking && facingAttacker && m.h !== 'low'
    def.pct += blocked ? m.dmg * 0.2 : m.dmg * 0.9
    const dx = def.px - att.px, dz = def.pz - att.pz, d = Math.hypot(dx, dz) || 1
    const kb = (m.push * 0.55 + def.pct * 0.055) * this.rage() * (blocked ? 0.35 : 1)
    def.kx += (dx / d) * kb; def.kz += (dz / d) * kb * 0.7
    def.lastHitBy = att
    if (!blocked) { def.stun = 8 + Math.round(m.dmg); def.flash = 8; def.move = null }
    this.emit({ type: blocked ? 'block' : 'hit', att, def, heavy: m.dmg > 10, x: (att.px + def.px) / 2, z: def.pz })
  }

  knockOut(f) {
    f.out = true; f.flyT = 45; f.flyY = 0; f.flyVy = -9; f.kx *= 1.2; f.kz *= 1.2
    const by = f.lastHitBy && !f.lastHitBy.out ? f.lastHitBy : null
    if (by) by.kos++
    this.placings.unshift(f)
    this.emit({ type: 'ko', f, by, left: this.alive().length })
  }
}
