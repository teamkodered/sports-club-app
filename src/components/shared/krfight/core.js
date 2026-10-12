// KR FIGHT 2 -- the fight simulation. A straight port of the classic game's rules (same frame data,
// blocking, combos, chain-stun, meter, CPU brain) with no drawing in it. It runs at a fixed 60 steps
// a second and reports what happened as events, which the Phaser scene turns into sparks, sound, etc.
import { W, FLOOR, GRAV, COMBO_GAP, MOVES, LEVELS, SUPER_NAME, LEVEL_SCALE } from './data.js'

let pjId = 1

export function makeFighter(def, x, facing) {
  return {
    buf: [], prevDir: {}, comboNext: null, comboText: 0, comboName: '', def, x, y: FLOOR, vx: 0, vy: 0, facing, hp: 100,
    state: 'idle', t: 0, move: null, hitDone: false, stun: 0, crouch: false, blocking: false, specialCd: 0, counterT: 0,
    flash: 0, wins: 0, meter: 0, chain: 0, lastHitAt: -999, koT: 0,
  }
}
const newStats = () => ({ hits: 0, blocked: 0, bestCombo: 0, supers: 0, specials: 0, dmg: 0 })

export class Match {
  // team1 / team2: arrays of styled fighter defs, in fight order (1-5 each). The front fighter fights;
  // a KO brings in the next one; a team loses when everyone is down. Players can tag a teammate in.
  constructor(team1, team2, level) {
    this.lvl = LEVELS[level] || LEVELS.medium
    this.t1 = team1.map(d => Object.assign(makeFighter(d, 220, 1), { side: 'p1' }))
    this.t2 = team2.map(d => Object.assign(makeFighter(d, 580, -1), { side: 'p2' }))
    this.p1 = this.t1[0]; this.p2 = this.t2[0]
    this.stats = { p1: newStats(), p2: newStats() }
    this.timer = 60 * Math.min(180, 45 + 35 * Math.max(team1.length, team2.length)); this.phase = 'intro'; this.phaseT = 0
    this.projectiles = []; this.frame = 0; this.freeze = 0
    this.tagCd = { p1: 0, p2: 0 }; this.swapT = { p1: 0, p2: 0 }
    this.ai = { think: 0, plan: 'idle' }
    this.events = []
    this.emit({ type: 'roundIntro', round: 1, team: team1.length > 1 || team2.length > 1, sizes: [team1.length, team2.length] })
  }
  emit(e) { this.events.push(e) }
  drain() { const e = this.events; this.events = []; return e }
  statsOf(f) { return f.side === 'p1' ? this.stats.p1 : this.stats.p2 }
  team(side) { return side === 'p1' ? this.t1 : this.t2 }
  alive(side) { return this.team(side).filter(m => m.hp > 0) }

  // bring a teammate in: they drop in where the old fighter was; meter carries over
  bringIn(side, m, why) {
    const old = this[side], o = side === 'p1' ? this.p2 : this.p1
    const x = why === 'ko' ? (side === 'p1' ? 90 : W - 90) : old.x
    Object.assign(m, { x, y: FLOOR - 150, vx: 0, vy: 0, state: 'jump', move: null, stun: 0, t: 0, hitDone: false, crouch: false, blocking: false, counterT: 0, flash: 0, chain: 0, buf: [], comboNext: null, meter: old.meter || 0, facing: o.x > x ? 1 : -1 })
    if (why === 'tag') old.benchCap = Math.min(100, old.hp + 25)
    this[side] = m
    this.emit({ type: 'tagIn', side, f: m, from: old, why })
  }
  // tag a teammate in (target: index in the team, or 'next' = healthiest waiting teammate)
  tryTag(side, target) {
    const f = this[side]
    if (this.phase !== 'fight' || this.tagCd[side] > 0 || this.swapT[side] > 0) return false
    if (f.move || f.stun > 0 || f.y < FLOOR || f.state === 'ko') return false
    const waiting = this.team(side).filter(m => m !== f && m.hp > 0)
    let m = typeof target === 'number' ? this.team(side)[target] : waiting.sort((a, b) => b.hp - a.hp)[0]
    if (!m || m === f || m.hp <= 0) return false
    this.bringIn(side, m, 'tag'); this.tagCd[side] = 300
    return true
  }

  // one 1/60 s step. getInput() is only called when the player's input is actually consumed, so
  // presses made during hit-stop / super freeze aren't lost.
  step(getInput) {
    if (this.freeze > 0) { this.freeze--; return }
    this.frame++
    if (this.phase === 'intro') {
      this.phaseT++
      if (this.phaseT === 45) this.emit({ type: 'fight' })
      if (this.phaseT > 75) this.phase = 'fight'
      getInput()
      this.update(this.p1, this.p2, {}); this.update(this.p2, this.p1, {})
      return
    }
    if (this.phase === 'over') {
      this.phaseT++
      this.update(this.p1, this.p2, {}); this.update(this.p2, this.p1, {})
      getInput()
      if (this.phaseT > 150) { this.phase = 'done'; this.emit({ type: 'matchOver', winner: this.winner }) }
      return
    }
    if (this.phase !== 'fight') return
    const c1 = getInput()
    for (const side of ['p1', 'p2']) if (this.tagCd[side] > 0) this.tagCd[side]--
    if (c1.tag != null) this.tryTag('p1', c1.tag)
    const c2 = this.aiControl(this.p2, this.p1)
    if (c2.tag) this.tryTag('p2', 'next')
    const p1 = this.p1, p2 = this.p2
    this.update(p1, p2, c1); this.update(p2, p1, c2)
    // waiting teammates get some breath back (up to 25 above where they tagged out)
    for (const side of ['p1', 'p2']) for (const m of this.team(side)) if (m !== this[side] && m.hp > 0 && m.hp < (m.benchCap || 0)) m.hp = Math.min(m.benchCap, m.hp + 0.03)
    // push apart (not against a fighter who is down)
    const gap = p2.x - p1.x
    if (p1.state !== 'ko' && p2.state !== 'ko' && Math.abs(gap) < 50 && p1.y >= FLOOR - 40 && p2.y >= FLOOR - 40) { const push = (50 - Math.abs(gap)) / 2 * Math.sign(gap || 1); p1.x -= push; p2.x += push }
    // projectiles
    for (const pj of this.projectiles) {
      if (pj.delay > 0) { pj.delay--; if (pj.delay === 0) this.emit({ type: 'projectile', pj }); continue }
      pj.x += pj.vx; pj.life--
      const tgt = pj.owner.side === 'p1' ? p2 : p1
      if (tgt.state !== 'ko' && Math.abs(pj.x - tgt.x) < 30 && (pj.low ? tgt.y >= FLOOR - 20 : tgt.y > pj.y - 40 && !(tgt.crouch && tgt.y >= FLOOR && !pj.low))) { this.applyHit(pj.owner, tgt, pj.dmg, 7, pj.h, { x: pj.x, y: pj.y }); pj.life = 0 }
    }
    for (const pj of this.projectiles) if (!(pj.life > 0 && pj.x > -40 && pj.x < W + 40)) this.emit({ type: 'projectileGone', pj })
    this.projectiles = this.projectiles.filter(p => p.life > 0 && p.x > -40 && p.x < W + 40)
    this.timer--
    // knock-outs: the next teammate comes in, or the team is beaten
    for (const side of ['p1', 'p2']) {
      const f = this[side]
      if (f.hp <= 0 && f.state !== 'ko') {
        f.state = 'ko'; f.koT = 0; f.vy = -8; f.vx = -6 * f.facing; f.move = null
        const left = this.alive(side).length
        this.emit({ type: 'ko', loser: f, winner: side === 'p1' ? this.p2 : this.p1, final: left === 0, left })
        if (left === 0) { this.endMatch(side === 'p1' ? 'p2' : 'p1', 'ko'); return }
        this.swapT[side] = 100
      }
      if (this.swapT[side] > 0 && --this.swapT[side] === 0) { const next = this.alive(side)[0]; if (next) this.bringIn(side, next, 'ko') }
    }
    if (this.timer <= 0) {
      const tot = side => this.team(side).reduce((a, m) => a + Math.max(0, m.hp), 0)
      const a = tot('p1'), b = tot('p2')
      this.endMatch(a === b ? null : a > b ? 'p1' : 'p2', 'time')
    }
  }

  endMatch(winner, how) {
    this.phase = 'over'; this.phaseT = 0; this.winner = winner
    const w = winner ? this[winner] : null
    this.emit({ type: 'roundOver', winner, how, matchOver: true, perfect: !!w && w.hp >= 100 && this.alive(winner).length === this.team(winner).length })
  }

  startMove(f, k) {
    if (f.stun > 0 || f.state === 'ko') return
    if (f.move && !(f.hitDone && f.t >= f.move.s + f.move.a && k !== 'sp' || f.comboNext)) return // chain only after a landed hit (or a combo input)
    const st = this.statsOf(f)
    if (k === 'super') {
      if ((f.meter || 0) < 100) return
      f.meter = 0; st.supers++
      f.comboName = SUPER_NAME[f.def.special] || 'SUPER'; f.comboText = 90
      f.move = { k: 'rush', s: 6, a: 18, r: 20, dmg: 26 * f.def.power, reach: 96, h: 'mid', push: 18, super: true }
      f.vx = 10.5 * f.facing
      if (f.def.special === 'wave' || f.def.special === 'quake') this.projectiles.push({ id: pjId++, owner: f, x: f.x + 50 * f.facing, y: f.y - 80, vx: 9 * f.facing, dmg: 16, h: 'mid', colour: f.def.colour, life: 120, big: true, delay: 1 })
      f.t = 0; f.hitDone = false; f.comboNext = null
      this.freeze = 34 // super freeze: the world stops for the cut-in
      this.emit({ type: 'super', f, name: f.comboName })
      return
    }
    if (k === 'sp') {
      if (f.specialCd > 0 && !f.comboNext) return
      if (f.comboNext) { f.comboName = f.comboNext.name; f.comboText = 70 }
      f.specialCd = 150; st.specials++
      const sp = f.def.special
      if (sp === 'wave') { f.move = { k: 'cast', s: 8, a: 2, r: 16, dmg: 0, reach: 30, h: 'high', push: 0 }; this.projectiles.push({ id: pjId++, owner: f, x: f.x + 50 * f.facing, y: f.y - 110, vx: 7 * f.facing, dmg: 11, h: 'high', colour: f.def.colour, low: false, life: 140, delay: 8 }) }
      else if (sp === 'quake') { f.move = { k: 'stomp', s: 10, a: 2, r: 18, dmg: 0, reach: 30, h: 'low', push: 0 }; this.projectiles.push({ id: pjId++, owner: f, x: f.x + 40 * f.facing, y: FLOOR - 14, vx: 6 * f.facing, dmg: 10, h: 'low', colour: f.def.colour, low: true, life: 120, delay: 10 }) }
      else if (sp === 'rush') { f.move = { k: 'rush', s: 4, a: 14, r: 14, dmg: 13, reach: 75, h: 'high', push: 9 }; f.vx = 8.5 * f.facing }
      else if (sp === 'upper') { f.move = { k: 'upper', s: 3, a: 8, r: 20, dmg: 15, reach: 66, h: 'high', push: 12 }; f.vy = -15 }
      else if (sp === 'counter') { f.counterT = 40; f.move = { k: 'counter', s: 40, a: 0, r: 6, dmg: 0, reach: 0, h: 'high', push: 0 } }
      f.t = 0; f.hitDone = false; f.comboNext = null
      this.emit({ type: 'special', f, kind: sp })
      return
    }
    // the fighter's style decides which strike this button throws
    const lvl = LEVEL_SCALE[k[0]] || LEVEL_SCALE.l, isPunch = k[1] === 'p'
    let key = (f.def.moves && f.def.moves[k]) || k
    if (!MOVES[key]) return
    if (f.y < FLOOR) key = 'jk'
    else if (f.crouch) key = isPunch ? 'clp' : 'clk'
    const m = MOVES[key], scaled = key === 'jk' || key === 'clp' || key === 'clk'
    const handPower = isPunch ? (f.def.punchPower || 1) : 1
    f.move = { k: key, ...m, s: Math.max(2, m.s + (scaled ? lvl.s : 0) + (f.def.startup || 0)), reach: m.reach * f.def.reach, dmg: m.dmg * f.def.power * handPower * (scaled ? lvl.dmg : 1), level: k[0] }
    if (f.comboNext) { f.move.combo = f.comboNext; f.move.dmg *= f.comboNext.bonus; f.move.push *= 1.4; f.comboNext = null }
    f.t = 0; f.hitDone = false
    this.emit({ type: 'whoosh', heavy: k[0] === 'h' || key === 'mk' })
  }

  // standing block stops high + mid; low attacks must be blocked crouching (down-back)
  blocks(def, h) { if (!def.blocking) return false; return h === 'low' ? def.crouch : true }

  applyHit(att, def, dmg, push, h, at) {
    if (def.state === 'ko') return
    const hy = h === 'low' ? def.y - 18 : h === 'mid' ? def.y - 92 : def.y - (def.crouch ? 100 : 132)
    const pos = at || { x: def.x - def.facing * 18, y: hy }
    if (def.counterT > 0) {
      def.counterT = 0; att.hp = Math.max(0, att.hp - 14); att.stun = 24; att.vx = -10 * att.facing; att.flash = 12; def.move = null
      this.statsOf(def).hits++; this.statsOf(def).dmg += 14
      this.freeze = 10
      this.emit({ type: 'counter', att: def, def: att, x: att.x - att.facing * 18, y: att.y - 110 })
      return
    }
    if (h === 'high' && def.crouch && def.y >= FLOOR) return // ducked under
    if (this.blocks(def, h)) {
      def.hp = Math.max(0, def.hp - dmg * 0.15); def.vx = push * 0.6 * att.facing; def.stun = 8
      att.meter = Math.min(100, (att.meter || 0) + 2); def.meter = Math.min(100, (def.meter || 0) + 3)
      this.statsOf(def).blocked++
      this.freeze = 2
      this.emit({ type: 'block', att, def, x: pos.x, y: pos.y })
      return
    }
    att.meter = Math.min(100, (att.meter || 0) + dmg * 2.2); def.meter = Math.min(100, (def.meter || 0) + dmg * 1.2)
    // Each hit in a row stuns for less, and the 3rd+ pushes them out of range -- no endless jab lock
    def.chain = (this.frame - (def.lastHitAt || -999) < 40) ? (def.chain || 0) + 1 : 0
    def.lastHitAt = this.frame
    def.hp = Math.max(0, def.hp - dmg)
    def.stun = Math.max(5, Math.round((10 + dmg * 0.8) - def.chain * 4))
    def.vx = push * att.facing * (def.chain >= 2 ? 2.4 : 1); def.flash = 10; def.move = null
    const st = this.statsOf(att); st.hits++; st.dmg += dmg; st.bestCombo = Math.max(st.bestCombo, def.chain + 1)
    const heavy = dmg >= 10
    this.freeze = dmg >= 20 ? 9 : heavy ? 6 : 3 // hit-stop
    this.emit({ type: 'hit', att, def, x: pos.x, y: pos.y, dmg, heavy, chain: def.chain + 1, h })
  }

  update(f, o, ctl) {
    if (f.specialCd > 0) f.specialCd--
    if (f.comboText > 0) f.comboText--
    if (f.counterT > 0) f.counterT--
    if (f.flash > 0) f.flash--
    if (f.state === 'ko') f.koT++
    f.facing = o.x > f.x ? 1 : -1
    const grounded = f.y >= FLOOR
    if (f.state === 'ko') { f.vx *= 0.9 }
    else if (f.stun > 0) { f.stun--; f.vx *= 0.85; f.blocking = false }
    else {
      const back = f.facing === 1 ? ctl.left : ctl.right, fwd = f.facing === 1 ? ctl.right : ctl.left
      f.crouch = grounded && !!ctl.down
      const oAttacking = !!o.move && o.move.dmg > 0
      // Block button: guard whenever held (stands still; with down = low guard). Holding back still blocks attacks.
      f.blocking = grounded && !f.move && (!!ctl.block || (!!back && (oAttacking || this.projectiles.some(p => p.owner === o))))
      if (!f.move) {
        if (grounded) {
          f.vx = f.crouch || ctl.block ? 0 : fwd ? f.def.speed * f.facing : back ? -f.def.speed * 0.75 * f.facing : 0
          if (ctl.upPressed && !f.crouch) { f.vy = -16; f.vx = fwd ? 4.5 * f.facing : back ? -4.5 * f.facing : 0; this.emit({ type: 'jump', f }) }
        }
        f.state = !grounded ? 'jump' : f.vx !== 0 ? 'walk' : 'idle'
      }
      // record inputs for combos: direction taps (relative) and buttons
      const dirNow = { f: !!fwd, b: !!back, d: !!ctl.down }
      for (const t of ['f', 'b', 'd']) if (dirNow[t] && !f.prevDir[t]) f.buf.push({ t, at: this.frame })
      f.prevDir = dirNow
      for (const k of ['lp', 'mp', 'hp', 'lk', 'mk', 'hk', 'sp', 'super']) if (ctl[k + 'Pressed']) {
        f.buf.push({ t: k, at: this.frame })
        f.buf = f.buf.filter(x => this.frame - x.at < COMBO_GAP * 5).slice(-8)
        for (const c of (f.def.combos || [])) {
          const tail = f.buf.slice(-c.seq.length)
          if (tail.length === c.seq.length && tail.every((x, i) => x.t === c.seq[i] && (i === 0 || x.at - tail[i - 1].at <= COMBO_GAP))) { f.comboNext = c; f.buf = []; break }
        }
        this.startMove(f, k); break
      }
    }
    // move timeline
    if (f.move) {
      f.t++
      const m = f.move
      if (!f.hitDone && m.dmg > 0 && f.t >= m.s && f.t < m.s + m.a) {
        const dist = Math.abs(o.x - f.x), heightOK = m.h === 'high' ? o.y > f.y - 120 : true
        if (dist <= m.reach + 20 && heightOK) {
          f.hitDone = true
          if (m.combo) { f.comboName = m.combo.name; f.comboText = 70; this.emit({ type: 'combo', f, name: m.combo.name }) }
          this.applyHit(f, o, m.dmg, m.push, m.h)
        }
      }
      if (f.move && f.t >= m.s + m.a + m.r) { f.move = null; if (grounded) f.vx = 0 }
      if (f.move && f.move.k === 'rush' && f.t > m.s + m.a) f.vx *= 0.8
    }
    // physics
    const wasAir = f.y < FLOOR
    f.vy += GRAV; f.y += f.vy; f.x += f.vx
    if (f.y >= FLOOR) { f.y = FLOOR; if (wasAir && f.vy > 4) this.emit({ type: 'land', f, hard: f.state === 'ko' }); f.vy = 0; if (!f.move && f.state === 'jump') f.state = 'idle' }
    f.x = Math.max(40, Math.min(W - 40, f.x))
  }

  aiControl(cpu, me) {
    const a = this.ai, lvl = this.lvl, ctl = { left: false, right: false, down: false }
    const dist = Math.abs(me.x - cpu.x), toward = me.x > cpu.x ? 'right' : 'left', away = toward === 'right' ? 'left' : 'right'
    a.think--
    // tag out when hurt and a healthier teammate is waiting
    if (cpu.hp < 35 && this.tagCd.p2 === 0 && !cpu.move && cpu.stun === 0 && this.alive('p2').some(m => m !== cpu && m.hp > cpu.hp + 25) && Math.random() < 0.02 + 0.03 * lvl.smart) { ctl.tag = true; return ctl }
    if (me.move && me.t === 1) (a.presses ||= []).push(this.frame)
    a.presses = (a.presses || []).filter(t => this.frame - t < 90)
    const mashing = a.presses.length >= 3
    const meStartup = me.move && me.move.dmg > 0 && me.t < me.move.s + me.move.a
    const meRecovering = me.move && me.move.dmg > 0 && me.t >= me.move.s + me.move.a
    const meProjectile = this.projectiles.some(p => p.owner === me && Math.abs(p.x - cpu.x) < 170)
    const meApproaching = me.state === 'walk' && Math.sign(me.vx) === Math.sign(cpu.x - me.x)
    const smart = lvl.smart
    // a) block what's coming -- decided once per attack, more likely when mashed
    if ((meStartup || meProjectile) && dist < 150) {
      const key = me.move ? `m${this.frame - me.t}` : 'p'
      if (a.blockKey !== key) { a.blockKey = key; a.blockIt = Math.random() < Math.min(0.95, lvl.block + (mashing ? 0.25 : 0)) }
      if (a.blockIt && !cpu.move) { ctl[away] = true; if (me.move?.h === 'low') ctl.down = true; return ctl }
    }
    // b) punish recovery
    if (meRecovering && dist < 85 && !cpu.move && Math.random() < smart) { ctl[me.move.r >= 14 ? 'hpPressed' : me.move.r >= 10 ? 'mpPressed' : 'lpPressed'] = true; a.plan = 'wait'; a.think = 4; return ctl }
    // c) wake-up
    if (a.wasStunned && cpu.stun === 0 && dist < 90) {
      a.wasStunned = false
      const r = Math.random()
      if (r < smart * 0.5) { ctl.lpPressed = true; return ctl }
      if (r < smart * 0.8) { ctl[away] = true; ctl.upPressed = true; return ctl }
      ctl[away] = true; return ctl
    }
    a.wasStunned = cpu.stun > 0
    // d) poke as the player walks in
    if (meApproaching && dist > 62 && dist < 95 && !cpu.move && Math.random() < smart * 0.35) { ctl[dist > 86 ? 'hkPressed' : dist > 78 ? 'mkPressed' : 'lkPressed'] = true; a.plan = 'wait'; a.think = 6; return ctl }
    // e) step out of jab range when mashed
    if (mashing && dist < 75 && Math.random() < smart * 0.5) { ctl[away] = true; return ctl }
    if ((cpu.meter || 0) >= 100 && dist < 160 && !cpu.move && Math.random() < 0.04 + 0.05 * smart) { ctl.superPressed = true; return ctl }
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
    else if (a.plan === 'attack') {
      const combos = cpu.def.combos || []
      if (combos.length && Math.random() < lvl.aggro * 0.6) { const c = combos[Math.floor(Math.random() * combos.length)]; a.queue = [...c.seq]; a.qWait = 0; a.plan = 'combo' }
      else { const opts = dist < 70 ? ['lp', 'lp', 'mp', 'hp', 'lk'] : ['lk', 'mk', 'hk', 'mk', 'lp']; ctl[opts[Math.floor(Math.random() * opts.length)] + 'Pressed'] = true; a.plan = 'wait' }
    }
    else if (a.plan === 'combo') {
      if (a.qWait > 0) a.qWait--
      else if (a.queue?.length) {
        const t = a.queue.shift()
        if (t === 'f') ctl[toward] = true; else if (t === 'b') ctl[away] = true; else if (t === 'd') ctl.down = true; else ctl[t + 'Pressed'] = true
        a.qWait = 8 + Math.floor(Math.random() * 6)
      } else a.plan = 'wait'
    }
    else if (a.plan === 'crouchkick') { ctl.down = true; ctl.lkPressed = true; a.plan = 'wait' }
    else if (a.plan === 'special') { if (['wave', 'quake'].includes(cpu.def.special) || dist < 150) ctl.spPressed = true; else ctl[toward] = true; if (ctl.spPressed) a.plan = 'wait' }
    return ctl
  }
}
