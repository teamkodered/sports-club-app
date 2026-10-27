// LAST MAN STANDING -- the battle scene (Phaser). Draws the ring at a broadcast-style angle, ten stick fighters
// (the KR FIGHT poses and animations), name tags with damage %, sparks, rope bounces and knock-outs over the top.
import Phaser from 'phaser'
import { Battle, RING, ordinal, TRACK_LEN, TRACK_W } from './sim.js'
import { makePose, stepPose, drawFighter } from '../krfight/pose.js'
import { hex } from '../krfight/data.js'

const W = 800, H = 450
const BODY = "'Rajdhani', 'Segoe UI', sans-serif", HEAD = "'Saira Condensed', 'Arial Narrow', sans-serif"
// ring floor in perspective: z -RING (back) .. +RING (front)
const depth = z => Phaser.Math.Clamp((z + RING) / (2 * RING), -0.4, 1.4)
// the track: perspective across its width, scrolling along its length with the camera (camX)
const trackScreen = (x, z, camX) => { const t = Phaser.Math.Clamp((z + TRACK_W) / (2 * TRACK_W), -0.6, 1.6); return { x: W / 2 + (x - camX) * (0.95 + 0.25 * t), y: 214 + t * 150, s: 0.66 + 0.16 * t, t } }
export const toScreen = (x, z) => { const t = depth(z); return { x: W / 2 + x * (1.05 + 0.55 * t), y: 168 + t * 222, s: 0.5 + 0.28 * t, t } }

export class LmsScene extends Phaser.Scene {
  constructor() { super('Lms') }
  create() {
    const cfg = this.game.cfg
    this.track = cfg.arena === 'track'
    this.b = new Battle(cfg.roster, this.track ? 'track' : 'ring')
    this.camX = 250
    this.sfx = cfg.sfx
    this.acc = 0
    this.cameras.main.setBackgroundColor('#04060c')
    if (this.track) this.drawTrackBack(); else this.drawArena()
    // fighters
    this.gs = this.b.fs.map(f => {
      const g = this.add.graphics()
      const pose = makePose(f, 0)
      const tag = this.add.text(0, 0, '', { fontFamily: BODY, fontStyle: '700', fontSize: '12px', color: f.r.colour, stroke: '#000', strokeThickness: 3, align: 'center' }).setOrigin(0.5, 1)
      const you = f.r.you ? this.add.text(0, 0, 'YOU ▼', { fontFamily: HEAD, fontStyle: 'italic', fontSize: '15px', color: '#5BE0FF', stroke: '#000', strokeThickness: 4 }).setOrigin(0.5, 1) : null
      return { f, g, pose, tag, you }
    })
    this.front = this.add.graphics() // front ropes, over the fighters
    if (!this.track) this.drawFrontRopes()
    if (this.track) {
      this.trackG = this.add.graphics().setDepth(5)
      this.marks = [0, 1, 2, 3].map(() => this.add.text(0, 0, '', { fontFamily: HEAD, fontStyle: 'italic', fontSize: '16px', color: '#9AA3AE' }).setOrigin(0.5, 1).setDepth(6))
      this.mapG = this.add.graphics().setDepth(1000)
    }
    this.fx = this.add.graphics().setDepth(900)
    this.sparks = []
    // HUD
    this.leftT = this.add.text(18, 12, '', { fontFamily: HEAD, fontStyle: 'italic', fontSize: '20px', color: '#F2F2F2', stroke: '#000', strokeThickness: 4 }).setDepth(1000)
    this.feed = []
    this.banner = this.add.text(W / 2, H / 2 - 40, 'READY…', { fontFamily: HEAD, fontStyle: 'italic', fontSize: '64px', color: '#F2F2F2', stroke: '#000', strokeThickness: 8 }).setOrigin(0.5).setDepth(1000)
    this.sfx?.music?.(); this.sfx?.cheer?.(0.6)
  }
  proj(x, z) { return this.track ? trackScreen(x, z, this.camX) : toScreen(x, z) }
  drawTrackBack() {
    const g = this.add.graphics().setDepth(0)
    for (let i = 0; i < 260; i++) { g.fillStyle(0xffffff, 0.2 + Math.random() * 0.6); g.fillCircle(Math.random() * W, Math.random() * 180, Math.random() * 1.3 + 0.3) }
    for (let i = 0; i < 70; i++) { const x = Math.random() * W, h = 20 + Math.random() * 60; g.fillStyle(0x0b1226, 1); g.fillRect(x, 200 - h, 18 + Math.random() * 30, h); g.fillStyle(0xf5c542, 0.35); g.fillRect(x + 4, 200 - h + 6, 3, 3) }
    g.fillStyle(0x020308, 1); g.fillRect(0, 200, W, H - 200)
  }
  drawTrack() {
    const g = this.trackG; g.clear()
    const x0 = Math.max(-140, this.camX - 620), x1 = Math.min(TRACK_LEN + 220, this.camX + 620)
    const P = (x, z) => trackScreen(x, z, this.camX)
    const bl = P(x0, -TRACK_W), br = P(x1, -TRACK_W), fr = P(x1, TRACK_W), fl = P(x0, TRACK_W)
    // the drop below the front edge, then the slab's front face, then the surface
    g.fillStyle(0x1c2133, 1); g.fillPoints([fl, fr, { x: fr.x, y: fr.y + 26 }, { x: fl.x, y: fl.y + 26 }], true)
    g.fillStyle(0x30364a, 1); g.fillPoints([bl, br, fr, fl], true)
    // lane lines
    for (const z of [-TRACK_W / 3, TRACK_W / 3]) for (let x = Math.ceil(x0 / 60) * 60; x < x1; x += 60) { const a = P(x, z), b = P(x + 30, z); g.lineStyle(2, 0xd8dde6, 0.45); g.lineBetween(a.x, a.y, b.x, b.y) }
    // red / white kerbs on both edges
    for (const z of [-TRACK_W, TRACK_W]) for (let x = Math.floor(x0 / 40) * 40; x < x1; x += 40) {
      const a = P(x, z), b = P(x + 40, z), c = P(x + 40, z - Math.sign(z) * 8), d = P(x, z - Math.sign(z) * 8)
      g.fillStyle((Math.floor(x / 40) % 2) ? 0xc8102e : 0xf2f2f2, 1); g.fillPoints([a, b, c, d], true)
    }
    // start line and the chequered finish
    if (x0 < 10 && x1 > -10) { const a = P(0, -TRACK_W), b = P(0, TRACK_W); g.lineStyle(5, 0xffffff, 0.9); g.lineBetween(a.x, a.y, b.x, b.y) }
    if (x0 < TRACK_LEN + 20 && x1 > TRACK_LEN - 20) {
      const n = 8, sz = (2 * TRACK_W) / n
      for (let i = 0; i < n; i++) for (let j = 0; j < 2; j++) {
        const z = -TRACK_W + i * sz, x = TRACK_LEN + j * 14
        g.fillStyle((i + j) % 2 ? 0x111111 : 0xffffff, 1); g.fillPoints([P(x, z), P(x + 14, z), P(x + 14, z + sz), P(x, z + sz)], true)
      }
      const top = P(TRACK_LEN, -TRACK_W); g.fillStyle(0xf5c542, 1); g.fillRect(top.x - 2, top.y - 90, 4, 90)
    }
    // distance markers every 500
    let k = 0
    for (const o of this.marks) o.setVisible(false)
    for (let x = 500; x < TRACK_LEN && k < this.marks.length; x += 500) if (x > x0 && x < x1) { const p = P(x, -TRACK_W); this.marks[k++].setVisible(true).setPosition(p.x, p.y - 4).setText(`${x}`) }
  }
  drawMap() {
    const g = this.mapG; g.clear()
    const L = 230, R = 570, Y = 22
    g.lineStyle(4, 0x2a3138, 1); g.lineBetween(L, Y, R, Y)
    g.fillStyle(0xffffff, 1); g.fillRect(L - 2, Y - 8, 3, 16)
    for (let i = 0; i < 4; i++) { g.fillStyle(i % 2 ? 0x111111 : 0xffffff, 1); g.fillRect(R + (i % 2) * 4, Y - 8 + Math.floor(i / 2) * 8, 4, 8) }
    for (const f of this.b.fs) {
      if (f.out) continue
      const x = L + Phaser.Math.Clamp(f.px / TRACK_LEN, 0, 1) * (R - L)
      g.fillStyle(hex(f.r.colour), 1); g.fillCircle(x, Y, f.r.you ? 6 : 4)
      if (f.r.you) { g.lineStyle(2, 0x5be0ff, 1); g.strokeCircle(x, Y, 9) }
    }
  }
  drawArena() {
    const g = this.add.graphics().setDepth(0)
    // crowd + lights
    for (let i = 0; i < 520; i++) { const x = Math.random() * W, y = 18 + Math.random() * 130; g.fillStyle([0x3a4766, 0x5a4a3a, 0x6b6f82, 0x2c3550][i % 4], 0.5 + Math.random() * 0.4); g.fillCircle(x, y, 1 + Math.random() * 1.6) }
    for (const x of [180, 400, 620]) { g.fillStyle(0xaac4ff, 0.05); g.fillTriangle(x, 0, x - 120, 420, x + 120, 420) }
    const c = (x, z) => toScreen(x, z)
    const R = RING, A = RING + 26
    // apron + canvas
    const ap = [c(-A, -A), c(A, -A), c(A, A), c(-A, A)]
    g.fillStyle(0x0d1a33, 1); g.fillPoints([ap[0], ap[1], { x: ap[2].x, y: ap[2].y + 30 }, { x: ap[3].x, y: ap[3].y + 30 }], true)
    const cv = [c(-R, -R), c(R, -R), c(R, R), c(-R, R)]
    g.fillStyle(0x1f5fbf, 1); g.fillPoints(cv, true)
    g.lineStyle(2, 0x3a7bd9, 0.6); g.strokePoints(cv, true)
    // centre circle
    const pts = []; for (let i = 0; i <= 40; i++) { const a = i / 40 * Math.PI * 2; pts.push(c(Math.cos(a) * 70, Math.sin(a) * 70)) }
    g.fillStyle(0x2f78db, 1); g.fillPoints(pts, true); g.lineStyle(2, 0xcfe0ff, 0.8); g.strokePoints(pts, true)
    // back + side ropes and posts (the front ropes are drawn over the fighters)
    this.ropes(g, [[-R, -R], [R, -R]]); this.ropes(g, [[-R, -R], [-R, R]]); this.ropes(g, [[R, -R], [R, R]])
    for (const [x, z, col] of [[-R, -R, 0xc8102e], [R, -R, 0x1f4fbf]]) this.post(g, x, z, col)
  }
  ropes(g, [[x1, z1], [x2, z2]]) {
    const cols = [0x1f4fbf, 0xf2f2f2, 0xc8102e]
    ;[18, 36, 54].forEach((h, i) => {
      const a = toScreen(x1, z1), b = toScreen(x2, z2)
      g.lineStyle(3, cols[i], 0.95); g.lineBetween(a.x, a.y - h * a.s * 1.6, b.x, b.y - h * b.s * 1.6)
    })
  }
  post(g, x, z, col) {
    const p = toScreen(x, z)
    g.fillStyle(0xb9c0c9, 1); g.fillRect(p.x - 3, p.y - 100 * p.s, 6, 100 * p.s)
    g.fillStyle(col, 1); g.fillRect(p.x - 6, p.y - 92 * p.s, 12, 66 * p.s)
  }
  drawFrontRopes() {
    const g = this.front.setDepth(800), R = RING
    this.ropes(g, [[-R, R], [R, R]])
    for (const [x, z] of [[-R, R], [R, R]]) this.post(g, x, z, 0xe8e8e8)
  }
  spark(x, z, col, big) {
    const p = this.proj(x, z)
    this.sparks.push({ x: p.x, y: p.y - 95 * p.s, r: 4, life: big ? 14 : 9, col })
  }
  pushFeed(text, col) {
    const t = this.add.text(W - 16, 0, text, { fontFamily: BODY, fontStyle: '700', fontSize: '13px', color: col, stroke: '#000', strokeThickness: 3, align: 'right' }).setOrigin(1, 0).setDepth(1000)
    this.feed.unshift(t)
    while (this.feed.length > 5) this.feed.pop().destroy()
    this.feed.forEach((o, i) => o.setY((this.track ? 40 : 12) + i * 18).setAlpha(1 - i * 0.15))
  }
  update(time, delta) {
    this.acc += Math.min(100, delta) * 0.85
    let n = 0
    while (this.acc >= 1000 / 60 && n < 6) { this.acc -= 1000 / 60; n++; this.b.step(); this.handle(this.b.drain()) }
    this.render()
  }
  handle(events) {
    const sx = this.sfx || {}
    for (const e of events) {
      if (e.type === 'bell') { this.banner.setText('FIGHT!'); this.tweens.add({ targets: this.banner, alpha: 0, delay: 600, duration: 400 }); sx.bell?.(); sx.cheer?.(1) }
      else if (e.type === 'hit') { this.spark(e.x, e.z, hex(e.att.r.colour), e.heavy); sx.hit?.(e.heavy, false) }
      else if (e.type === 'block') { this.spark(e.x, e.z, 0x8fd3ff, false); sx.block?.() }
      else if (e.type === 'whoosh') { if (Math.random() < 0.25) sx.whoosh?.(e.heavy) }
      else if (e.type === 'rope') { /* bounce */ }
      else if (e.type === 'ko') {
        sx.ko?.(); sx.cheer?.(1.4); this.cameras.main.shake(180, 0.006)
        const who = `${e.f.r.colourName} · ${e.f.r.name}`
        this.pushFeed(this.track ? (e.by ? `${who} knocked off by ${e.by.r.name}` : `${who} fell off!`) : (e.by ? `${who} knocked out by ${e.by.r.name}` : `${who} is out!`), e.f.r.you ? '#5BE0FF' : '#F2F2F2')
        if (e.f.r.you) { this.banner.setText(this.track ? 'YOU FELL OFF!' : `YOU'RE OUT · ${ordinal(e.left + 1)}`).setFontSize('40px').setAlpha(1); this.tweens.add({ targets: this.banner, alpha: 0, delay: 1500, duration: 500 }) }
      } else if (e.type === 'finish') {
        sx.cheer?.(1.2)
        this.pushFeed(`${e.f.r.colourName} · ${e.f.r.name} finishes ${ordinal(e.place)}!`, e.place === 1 ? '#F5C542' : e.f.r.you ? '#5BE0FF' : '#F2F2F2')
      } else if (e.type === 'raceOver') {
        this.time.delayedCall(1800, () => this.game.cfg.onDone?.(this.b.placings.map(f => ({ ...f.r, pct: Math.round(f.pct), kos: f.kos, finished: !!f.finished, fell: !!f.out }))))
      } else if (e.type === 'winner') {
        sx.bell?.(); sx.cheer?.(2)
        const w = e.f
        this.banner.setText(w ? `${w.r.colourName} · ${w.r.name} WINS!` : 'DRAW').setFontSize('44px').setColor(w ? w.r.colour : '#F2F2F2').setAlpha(1)
        if (!this.track) this.time.delayedCall(2600, () => this.game.cfg.onDone?.(this.b.placings.map(f => ({ ...f.r, pct: Math.round(f.pct), kos: f.kos }))))
      }
    }
  }
  render() {
    const b = this.b
    if (this.track) {
      // camera follows the leading pack
      const run = b.fs.filter(f => !f.out).sort((a, c) => c.px - a.px).slice(0, 4)
      const want = Phaser.Math.Clamp(run.length ? run.reduce((t, f) => t + f.px, 0) / run.length + 60 : 250, 250, TRACK_LEN - 140)
      this.camX += (want - this.camX) * 0.06
      this.drawTrack(); this.drawMap()
      this.leftT.setText(b.phase === 'intro' ? '10 fighters' : `${b.alive().length} racing · ${b.finishers.length} finished`)
    } else
    this.leftT.setText(b.phase === 'intro' ? '10 fighters' : `${b.alive().length} LEFT`)
    for (const o of this.gs) {
      const f = o.f
      stepPose(o.pose, f, b.frame)
      const p = this.proj(f.px, f.pz)
      const flyUp = f.out ? (f.flyY || 0) : 0
      o.g.clear()
      if (f.out && f.flyT <= 0) { o.g.setVisible(false); o.tag.setVisible(false); if (o.you) o.you.setVisible(false); continue }
      if (p.x < -90 || p.x > W + 90) { o.g.setVisible(false); o.tag.setVisible(false); if (o.you) o.you.setVisible(false); continue } // off camera (see the mini-map)
      o.g.setVisible(true).setScale(p.s).setPosition(p.x, p.y + flyUp).setDepth(f.out ? 850 : 10 + p.t * 700).setAlpha(f.out ? Math.max(0, f.flyT / 45) : 1)
      // shadow
      if (!f.out) { o.g.fillStyle(0x000000, 0.35); o.g.fillEllipse(0, 0, 70, 14) }
      drawFighter(o.g, f, o.pose, b.frame, 1, { noKo: true, noTrail: true, x: 0, y: 0, shadowY: 0, look: 'stick' })
      const top = p.y + flyUp - 175 * p.s
      o.tag.setVisible(!f.out).setPosition(p.x, top).setDepth(950).setText(`${f.r.name} ${Math.round(f.pct)}%`)
      if (o.you) o.you.setVisible(!f.out).setPosition(p.x, top - 14).setDepth(951)
    }
    // sparks
    const g = this.fx; g.clear()
    for (const s of this.sparks) { s.life--; s.r += 2.2; g.lineStyle(3, s.col, s.life / 12); g.strokeCircle(s.x, s.y, s.r); g.fillStyle(0xffffff, s.life / 14); g.fillCircle(s.x, s.y, 3) }
    this.sparks = this.sparks.filter(s => s.life > 0)
  }
}

export function startLms(parent, cfg) {
  const game = new Phaser.Game({ type: Phaser.AUTO, parent, width: W, height: H, backgroundColor: '#04060c', scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH }, scene: [LmsScene], render: { antialias: true }, banner: false })
  game.cfg = cfg
  if (import.meta.env && import.meta.env.DEV) window.__lms = game // local testing only
  return game
}
