// KR FIGHT 2 -- Phaser scenes: Boot (makes textures), Title, Select, Fight, Results.
// The world is 800x450; cameras zoom x2 onto a 1600x900 canvas so everything stays crisp on phones.
import Phaser from 'phaser'
import { W, H, FLOOR, FIGHTERS, MOVES, SUPER_NAME, LEVELS, comboLabel, hex, getLook, setLook, LOOK_LEVELS, HOUSES, HOUSE_KEYS, getHouse, setHouse, fxColour, cpuHouse, NATURAL_HOUSE, STYLES, STYLE_KEYS, styledDef, loadSquad, saveSquad, MAX_TEAM } from './data.js'
import { Match, makeFighter } from './core.js'
import { makePose, stepPose, drawFighter, targetPose } from './pose.js'
import { loadProgress, PILLARS, AREAS, AREA_GROUPS, costOf, MAX_LV, DAILY_GEMS, available, wild, priceFor, buyUpgrade, fighterLevel, levelOf, matchGems, awardGems, applyUpgrades, cpuUpgrades } from './progress.js'

export const Z = 2
const DISPLAY = "'Saira Condensed', 'Arial Narrow', sans-serif"
const BODY = "'Rajdhani', 'Segoe UI', sans-serif"
const GOLD = '#F5C542', RED = '#E24B4A'
const STEP = 1000 / 60

function txt(scene, x, y, s, style = {}) {
  // padding stops italic overhangs and strokes being clipped
  const t = scene.add.text(x, y, s, { fontFamily: DISPLAY, fontStyle: 'italic', fontSize: '24px', color: '#F2F2F2', resolution: Z * 1.5, padding: { x: 10, y: 4 }, ...style })
  return t
}
// only touch a Text when it actually changes (each change re-renders its texture)
function setT(t, s, colour) { if (t.text !== s) t.setText(s); if (colour && t.style.color !== colour) t.setColor(colour) }
function setupCam(scene) { scene.cameras.main.setZoom(Z).centerOn(W / 2, H / 2) }
const bridge = scene => scene.game.bridge || {}
const sfx = scene => bridge(scene).sfx || {}

// button: rounded slab with a coloured rim; fires on press (quick on touch)
function button(scene, x, y, w, h, label, colour, onClick, opts = {}) {
  const c = scene.add.container(x, y)
  const g = scene.add.graphics()
  const col = hex(colour)
  const draw = (on) => {
    g.clear()
    if (opts.solid || on) { g.fillStyle(col, opts.solid ? 1 : 0.25); g.fillRoundedRect(-w / 2, -h / 2, w, h, opts.r ?? 8) }
    else { g.fillStyle(0x12161b, 0.92); g.fillRoundedRect(-w / 2, -h / 2, w, h, opts.r ?? 8) }
    g.lineStyle(2, col, on || opts.solid ? 1 : 0.55); g.strokeRoundedRect(-w / 2, -h / 2, w, h, opts.r ?? 8)
  }
  draw(!!opts.on)
  const t = txt(scene, 0, 0, label, { fontSize: (opts.size || 22) + 'px', color: opts.solid ? '#0A0A0A' : opts.textColour || '#F2F2F2' }).setOrigin(0.5)
  c.add([g, t]); c.setSize(w, h)
  c.setInteractive(new Phaser.Geom.Rectangle(0, 0, w, h), Phaser.Geom.Rectangle.Contains)
  c.on('pointerdown', () => { sfx(scene).ui?.(); scene.tweens.add({ targets: c, scale: 0.94, duration: 60, yoyo: true }); onClick() })
  c.setOn = on => draw(on)
  c.label = t
  return c
}

// ---------------- arena (KR Centre neon ring) ----------------
function buildArena(scene, opts = {}) {
  if (getLook() !== 'cartoon') return buildArenaStick(scene, { ...opts, dark: getLook() === 'house' })
  const objs = []
  const g = scene.add.graphics(); objs.push(g)
  g.fillGradientStyle(0x120a1e, 0x120a1e, 0x1a1f24, 0x1a1f24, 1); g.fillRect(-60, -60, W + 120, FLOOR + 66)
  // back-wall panels
  for (let i = 0; i < 9; i++) { g.fillStyle(0xffffff, 0.018 + (i % 2) * 0.012); g.fillRect(i * 96 - 30, 40, 90, 150) }
  // crowd silhouettes
  const crowd = scene.add.graphics(); objs.push(crowd)
  const rnd = new Phaser.Math.RandomDataGenerator(['kr'])
  for (let row = 0; row < 2; row++) for (let i = 0; i < 26; i++) {
    const x = i * 33 + (row ? 16 : 0) - 10 + rnd.between(-6, 6), y = 196 + row * 16 + rnd.between(-3, 3)
    crowd.fillStyle(row ? 0x0c0f13 : 0x151a20, 1); crowd.fillCircle(x, y - 14, 9); crowd.fillRoundedRect(x - 14, y - 6, 28, 30, 8)
  }
  scene.crowd = crowd
  // floor: canvas with perspective lines + KR logo
  const fl = scene.add.graphics(); objs.push(fl)
  fl.fillStyle(0x0d1116, 1); fl.fillRect(-60, FLOOR + 6, W + 120, H)
  fl.fillGradientStyle(0x1b2230, 0x1b2230, 0x0d1116, 0x0d1116, 1); fl.fillRect(-60, FLOOR - 40, W + 120, 46)
  for (let i = -6; i <= 6; i++) { fl.lineStyle(1, 0xffffff, 0.04); fl.lineBetween(W / 2 + i * 30, FLOOR - 40, W / 2 + i * 120, H + 20) }
  fl.lineStyle(2, hex(RED), 0.35); fl.strokeEllipse(W / 2, FLOOR - 10, 300, 40)
  const logo = txt(scene, W / 2, FLOOR - 12, 'KR', { fontSize: '34px', color: '#E24B4A' }).setOrigin(0.5).setAlpha(0.22).setScale(1, 0.4); objs.push(logo)
  // ropes + posts
  const ropes = scene.add.graphics(); objs.push(ropes)
  ;['#E24B4A', '#F2F2F2', '#378ADD'].forEach((c, i) => { ropes.lineStyle(3, hex(c), 0.55); ropes.lineBetween(0, 214 + i * 40, W, 214 + i * 40) })
  ropes.fillStyle(0x2a3138, 1); ropes.fillRect(10, 186, 16, FLOOR - 180); ropes.fillRect(W - 26, 186, 16, FLOOR - 180)
  ropes.fillStyle(hex(RED), 1); ropes.fillRect(10, 186, 16, 10); ropes.fillStyle(0x378add, 1); ropes.fillRect(W - 26, 186, 16, 10)
  const wm = txt(scene, W / 2, 112, 'KR FIGHT', { fontSize: '96px', color: '#ffffff' }).setOrigin(0.5).setAlpha(0.05); objs.push(wm)
  // spotlights
  for (const [x, c, d] of [[170, 0xffffff, 0], [630, 0xffffff, 1], [400, hex(RED), 2]]) {
    const s = scene.add.image(x, -10, 'beam').setOrigin(0.5, 0).setTint(c).setAlpha(c === 0xffffff ? 0.09 : 0.07).setBlendMode(Phaser.BlendModes.ADD); objs.push(s)
    s.setAngle(d === 0 ? 12 : d === 1 ? -12 : 0)
    scene.tweens.add({ targets: s, angle: s.angle + (d === 2 ? 14 : -18), duration: 3000 + d * 900, yoyo: true, repeat: -1, ease: 'Sine.inOut' })
  }
  if (opts.dim) { const d = scene.add.rectangle(W / 2, H / 2, W + 200, H + 200, 0x05070a, opts.dim); objs.push(d) }
  return objs
}

// ---------------- arena for the stickman look: misty ruined city, grey ground ----------------
function buildArenaStick(scene, opts = {}) {
  const objs = []
  const rnd = new Phaser.Math.RandomDataGenerator(['krs'])
  const g = scene.add.graphics(); objs.push(g)
  // dark = house look: night version so the glowing silhouettes pop
  const D = opts.dark, C = D
    ? { skyA: 0x141821, skyB: 0x0a0c11, haze: 0x6a5a8a, far: 0x1c202a, fog: 0x2a2f3c, near: 0x10131a, fog2: 0x262a36, grA: 0x1a1d24, grB: 0x07080b, line: 0x3a3f4c, wm: '#ffffff' }
    : { skyA: 0x93a08a, skyB: 0x6a7466, haze: 0xd9dcc4, far: 0x7e8a78, fog: 0xb9c0a8, near: 0x5c6559, fog2: 0xaab29a, grA: 0x55594f, grB: 0x2f322e, line: 0x7a8072, wm: '#2a2f2a' }
  g.fillGradientStyle(C.skyA, C.skyA, C.skyB, C.skyB, 1); g.fillRect(-60, -60, W + 120, FLOOR - 20)
  // haze glow behind the fighters
  g.fillStyle(C.haze, D ? 0.12 : 0.18); g.fillEllipse(W / 2, 170, 620, 220)
  if (D) { g.lineStyle(3, 0xffffff, 0.06); g.strokeCircle(W / 2, 200, 150); g.lineStyle(10, 0xffffff, 0.025); g.strokeCircle(W / 2, 200, 160) } // emblem ring
  // far skyline
  const city = (col, alpha, baseY, minH, maxH, wMin, wMax) => {
    g.fillStyle(col, alpha)
    let x = -40
    while (x < W + 40) {
      const w = rnd.between(wMin, wMax), h = rnd.between(minH, maxH)
      g.fillRect(x, baseY - h, w, h + 80)
      if (rnd.frac() < 0.35) g.fillRect(x + w / 2 - 2, baseY - h - rnd.between(14, 40), 4, 40) // spire / mast
      if (rnd.frac() < 0.25) g.fillTriangle(x, baseY - h, x + w, baseY - h, x + w * 0.3, baseY - h - rnd.between(10, 30)) // broken roof
      x += w + rnd.between(-6, 10)
    }
  }
  city(C.far, 1, 300, 60, 170, 30, 70)
  g.fillStyle(C.fog, D ? 0.35 : 0.25); g.fillRect(-60, 200, W + 120, 120) // fog layer
  city(C.near, 1, 330, 40, 120, 24, 60)
  g.fillStyle(C.fog2, D ? 0.3 : 0.22); g.fillRect(-60, 260, W + 120, 90)
  // ground
  g.fillGradientStyle(C.grA, C.grA, C.grB, C.grB, 1); g.fillRect(-60, FLOOR - 50, W + 120, H - FLOOR + 110)
  g.fillStyle(C.line, 0.5); g.fillRect(-60, FLOOR - 52, W + 120, 3)
  for (let i = 0; i < 40; i++) { g.fillStyle(0x000000, rnd.realInRange(0.05, 0.14)); g.fillEllipse(rnd.between(0, W), rnd.between(FLOOR - 40, H), rnd.between(20, 90), rnd.between(3, 8)) }
  const wm = txt(scene, W / 2, 120, 'KR FIGHT', { fontSize: '96px', color: C.wm }).setOrigin(0.5).setAlpha(D ? 0.04 : 0.12); objs.push(wm)
  // drifting embers
  const em = scene.add.particles(0, 0, 'dot', { x: { min: 0, max: W }, y: { min: 120, max: FLOOR }, speedX: { min: -8, max: 14 }, speedY: { min: -18, max: -6 }, scale: { start: 0.18, end: 0 }, alpha: { start: 0.7, end: 0 }, lifespan: 4000, frequency: 160, tint: [0xe8d6a0, 0xffffff], blendMode: 'ADD' })
  objs.push(em)
  scene.crowd = null
  if (opts.dim) { const d = scene.add.rectangle(W / 2, H / 2, W + 200, H + 200, 0x0b0d0c, opts.dim * 0.75); objs.push(d) }
  return objs
}

// a strike for menu fighters (title / select / results), thrown the way their style throws it
function demoMove(f, k) { const id = (f.def.moves && f.def.moves[k]) || k, mv = MOVES[id]; return mv ? { k: id, ...mv, reach: mv.reach * (f.def.reach || 1) } : null }
const squadDef = (i, sq) => styledDef(FIGHTERS[i], (sq || loadSquad()).styles[FIGHTERS[i].key])

// a cut gem: diamond with facets, in a pillar colour (white = wild gem from house points)
function gemIcon(g, x, y, r, col) {
  g.fillStyle(col, 1); g.fillPoints([{ x, y: y - r }, { x: x + r * 0.8, y: y - r * 0.25 }, { x, y: y + r }, { x: x - r * 0.8, y: y - r * 0.25 }], true)
  g.fillStyle(0xffffff, 0.45); g.fillPoints([{ x, y: y - r }, { x: x + r * 0.8, y: y - r * 0.25 }, { x, y: y - r * 0.05 }], true)
  g.lineStyle(1.5, 0x000000, 0.5); g.strokePoints([{ x, y: y - r }, { x: x + r * 0.8, y: y - r * 0.25 }, { x, y: y + r }, { x: x - r * 0.8, y: y - r * 0.25 }], true)
}
const prog = scene => scene.game.progress || {}

// ---------------- Boot ----------------
export class BootScene extends Phaser.Scene {
  constructor() { super('Boot') }
  create() {
    const mk = (key, w, h, fn) => { const g = this.make.graphics({ x: 0, y: 0 }, false); fn(g); g.generateTexture(key, w, h); g.destroy() }
    mk('dot', 32, 32, g => { for (let r = 16; r > 0; r--) { g.fillStyle(0xffffff, 0.06 + (1 - r / 16) * 0.5); g.fillCircle(16, 16, r) } })
    mk('burst', 128, 128, g => {
      g.fillStyle(0xffffff, 1); const pts = []
      for (let i = 0; i < 20; i++) { const a = i / 20 * Math.PI * 2, r = i % 2 ? 22 : (i % 4 ? 60 : 50); pts.push(new Phaser.Math.Vector2(64 + Math.cos(a) * r, 64 + Math.sin(a) * r)) }
      g.fillPoints(pts, true)
    })
    mk('ring', 128, 128, g => { g.lineStyle(7, 0xffffff, 1); g.strokeCircle(64, 64, 56) })
    mk('shard', 28, 8, g => { g.fillStyle(0xffffff, 1); g.fillTriangle(0, 4, 28, 0, 28, 8) })
    mk('beam', 220, 460, g => { for (let i = 0; i < 12; i++) { g.fillStyle(0xffffff, 0.08); const w = 20 + i * 9; g.fillTriangle(110, 0, 110 - w, 460, 110 + w, 460) } })
    mk('orb', 64, 64, g => { for (let r = 32; r > 0; r--) { g.fillStyle(0xffffff, r < 12 ? 1 : 0.05 + (1 - r / 32) * 0.35); g.fillCircle(32, 32, r) } })
    const go = () => { if (this.started) return; this.started = true; this.scene.start(bridge(this).skipTitle ? 'Select' : 'Title') }
    if (this.game.progress) { go(); return }
    loadProgress().then(p => { this.game.progress = p; go() }).catch(() => go())
    this.time.delayedCall(4000, go)
  }
}

// ---------------- Title ----------------
export class TitleScene extends Phaser.Scene {
  constructor() { super('Title') }
  create() {
    setupCam(this); bridge(this).onScene?.('title')
    buildArena(this, { dim: 0.45 })
    // two fighters squaring off in the background
    this.demo = [0, 3].map((i, n) => { const f = makeFighter(squadDef(i), n ? 560 : 240, n ? -1 : 1); f.side = n ? 'p2' : 'p1'; f.theme = NATURAL_HOUSE[f.def.key]; return { f, pose: makePose(f, 0) } })
    this.fg = this.add.graphics(); this.frame = 0
    const logo = txt(this, W / 2, 150, 'KR FIGHT', { fontSize: '120px', color: GOLD, stroke: '#000', strokeThickness: 10 }).setOrigin(0.5)
    logo.setShadow(0, 0, RED, 24, true, true)
    logo.setScale(2.4).setAlpha(0)
    this.tweens.add({ targets: logo, scale: 1, alpha: 1, duration: 520, ease: 'Back.out' })
    txt(this, W / 2, 226, 'Five pillars. One champion.', { fontFamily: BODY, fontStyle: '600', fontSize: '22px', color: '#C9CED6' }).setOrigin(0.5)
    const tap = txt(this, W / 2, 330, 'Tap to start', { fontSize: '34px' }).setOrigin(0.5)
    this.tweens.add({ targets: tap, alpha: 0.25, duration: 700, yoyo: true, repeat: -1 })
    const go = () => { sfx(this).resume?.(); sfx(this).ui?.(); this.scene.start('Select') }
    this.input.once('pointerdown', go)
    this.go = go
  }
  update() {
    this.frame++
    const b = bridge(this)
    if (b.pressed && (b.pressed.super || b.pressed.lp || b.pressed.sp)) { b.pressed.super = b.pressed.lp = b.pressed.sp = false; this.go(); return }
    this.fg.clear()
    for (const d of this.demo) {
      if (!d.f.move && this.frame % 90 === (d.f.facing > 0 ? 30 : 75)) { d.f.move = demoMove(d.f, ['lp', 'mp', 'hp', 'lk', 'mk', 'hk'][Math.floor(Math.random() * 6)]); d.f.t = 0 }
      if (d.f.move) { d.f.t++; if (d.f.t > d.f.move.s + d.f.move.a + d.f.move.r) d.f.move = null }
      stepPose(d.pose, d.f, this.frame); drawFighter(this.fg, d.f, d.pose, this.frame)
    }
  }
}

// ---------------- Select: squad set-up ----------------
// Pick a style for each pillar fighter, add 1-5 of them to the team in fight order, choose a level.
export class SelectScene extends Phaser.Scene {
  constructor() { super('Select') }
  create() {
    setupCam(this); bridge(this).onScene?.('select')
    this.sq = loadSquad()
    const cfg = this.game.cfg || (this.game.cfg = { level: 'medium' })
    if (cfg.pick == null) cfg.pick = this.sq.order[0] ?? 0
    buildArena(this, { dim: 0.72 })
    this.frame = 0
    // fighter tiles (badge = place in the fight order)
    this.tiles = FIGHTERS.map((f, i) => {
      const x = 26 + i * 152 + 70, y = 52
      const c = this.add.container(x, y)
      const g = this.add.graphics(), badge = this.add.graphics()
      const t = txt(this, 0, 22, f.name, { fontSize: '21px', color: f.colour }).setOrigin(0.5)
      const icon = this.add.graphics()
      icon.fillStyle(hex(f.colour), 1); icon.fillCircle(0, -10, 14); icon.fillStyle(0xf1c9a5, 1); icon.fillCircle(0, -12, 7)
      const num = txt(this, 54, -24, '', { fontSize: '17px', color: '#0A0A0A' }).setOrigin(0.5)
      const lvT = txt(this, -62, -36, `Lv ${fighterLevel(prog(this), f.key)}`, { fontFamily: BODY, fontStyle: '700', fontSize: '13px', color: '#C9CED6' })
      c.add([g, icon, t, badge, num, lvT]); c.setSize(140, 76)
      c.setInteractive(new Phaser.Geom.Rectangle(0, 0, 140, 76), Phaser.Geom.Rectangle.Contains)
      c.on('pointerdown', () => { sfx(this).ui?.(); this.choose(i) })
      c.g = g; c.badge = badge; c.num = num; c.def = f
      return c
    })
    this.fg = this.add.graphics()
    this.makePreview()
    this.name = txt(this, 338, 96, '', { fontSize: '38px', stroke: '#000', strokeThickness: 6 })
    this.styleBtn = button(this, 462, 164, 244, 32, '', '#F2F2F2', () => this.cycleStyle(), { size: 18 })
    this.teamBtn = button(this, 694, 164, 164, 32, '', GOLD, () => this.toggleTeam(), { size: 18 })
    this.blurb = txt(this, 340, 186, '', { fontFamily: BODY, fontStyle: '600', fontSize: '15px', color: '#C9CED6' })
    this.special = txt(this, 340, 206, '', { fontFamily: BODY, fontStyle: '700', fontSize: '16px' })
    this.statG = this.add.graphics()
    this.statLabels = ['Speed', 'Power', 'Reach'].map((s, i) => txt(this, 340, 230 + i * 18, s, { fontFamily: BODY, fontStyle: '600', fontSize: '15px', color: '#9AA3AE' }))
    this.comboT = [0, 1, 2].map(i => [
      txt(this, 340, 286 + i * 19, '', { fontFamily: BODY, fontStyle: '700', fontSize: '16px' }),
      txt(this, 776, 286 + i * 19, '', { fontFamily: BODY, fontStyle: '700', fontSize: '16px', color: '#F2F2F2' }).setOrigin(1, 0),
    ])
    txt(this, 776, 343, 'L = tap   M = hold   H = long hold', { fontFamily: BODY, fontStyle: '600', fontSize: '13px', color: '#9AA3AE' }).setOrigin(1, 0)
    // fight order slots
    txt(this, 22, 360, 'Fight order (tap to remove)', { fontFamily: BODY, fontStyle: '600', fontSize: '15px', color: '#9AA3AE' })
    this.slots = Array.from({ length: MAX_TEAM }, (_, i) => {
      const x = 49 + i * 56, y = 404
      const g = this.add.graphics()
      const t = txt(this, x, y, '', { fontSize: '15px' }).setOrigin(0.5)
      g.setInteractive(new Phaser.Geom.Rectangle(x - 25, y - 20, 50, 40), Phaser.Geom.Rectangle.Contains)
      g.on('pointerdown', () => { if (this.sq.order[i] != null) { sfx(this).ui?.(); this.sq.order.splice(i, 1); saveSquad(this.sq); this.refresh() } })
      return { g, t, x, y }
    })
    txt(this, 330, 360, 'Level', { fontFamily: BODY, fontStyle: '600', fontSize: '15px', color: '#9AA3AE' })
    this.lvlBtns = ['easy', 'medium', 'hard'].map((l, i) => button(this, 364 + i * 72, 404, 66, 40, l[0].toUpperCase() + l.slice(1), GOLD, () => { cfg.level = l; this.refresh() }, { size: 18 }))
    this.fightBtn = null
    // Look levels: 1 Cartoon, 2 Stickman, 3 Houses (all open while testing; later they unlock with game level)
    const lv = LOOK_LEVELS.find(l => l.key === getLook()) || LOOK_LEVELS[1]
    button(this, 724, 120, 120, 32, `Look ${lv.level}: ${lv.name}`, '#9AA3AE', () => { setLook(LOOK_LEVELS[(LOOK_LEVELS.indexOf(lv) + 1) % LOOK_LEVELS.length].key); this.scene.restart() }, { size: 15 })
    button(this, 606, 120, 104, 32, 'Upgrade', GOLD, () => this.scene.start('Upgrade', { pick: this.game.cfg.pick }), { size: 17 })
    this.refresh()
  }
  makePreview() {
    const cfg = this.game.cfg
    this.prev = makeFighter(squadDef(cfg.pick, this.sq), 170, 1); this.prev.side = 'p1'; this.prev.theme = NATURAL_HOUSE[this.prev.def.key]
    this.prevPose = makePose(this.prev, this.frame); this.demoT = 20
  }
  choose(i) { this.game.cfg.pick = i; this.makePreview(); this.refresh() }
  cycleStyle() {
    const key = FIGHTERS[this.game.cfg.pick].key
    this.sq.styles[key] = STYLE_KEYS[(STYLE_KEYS.indexOf(this.sq.styles[key]) + 1) % STYLE_KEYS.length]
    saveSquad(this.sq); this.makePreview(); this.refresh()
  }
  toggleTeam() {
    const i = this.game.cfg.pick, at = this.sq.order.indexOf(i)
    if (at >= 0) this.sq.order.splice(at, 1)
    else if (this.sq.order.length < MAX_TEAM) this.sq.order.push(i)
    saveSquad(this.sq); this.refresh()
  }
  refresh() {
    const cfg = this.game.cfg, f = FIGHTERS[cfg.pick], def = squadDef(cfg.pick, this.sq), st = STYLES[def.style]
    const order = this.sq.order
    this.tiles.forEach((t, i) => {
      const on = i === cfg.pick, col = hex(t.def.colour), place = order.indexOf(i)
      t.g.clear(); t.g.fillStyle(on ? col : 0x12161b, on ? 0.22 : 0.92); t.g.fillRoundedRect(-70, -38, 140, 76, 8)
      t.g.lineStyle(on ? 3 : 1.5, on ? col : 0x2a3138, 1); t.g.strokeRoundedRect(-70, -38, 140, 76, 8)
      t.badge.clear(); t.num.setText(place >= 0 ? String(place + 1) : '')
      if (place >= 0) { t.badge.fillStyle(0xf5c542, 1); t.badge.fillCircle(54, -24, 12) }
      this.tweens.add({ targets: t, scale: on ? 1.06 : 1, duration: 120 })
    })
    this.name.setText(f.name).setColor(f.colour)
    this.styleBtn.label.setText(`Style: ${st.name}  ▸`)
    const place = order.indexOf(cfg.pick)
    this.teamBtn.label.setText(place >= 0 ? `In team #${place + 1}  ✕` : order.length >= MAX_TEAM ? 'Team full' : '+ Add to team')
    this.teamBtn.setOn(place >= 0)
    this.blurb.setText(st.blurb)
    this.special.setText(`Special: ${f.specialName}     Super: ${SUPER_NAME[f.special]}`).setColor(f.colour)
    const g = this.statG; g.clear()
    ;[[def.speed, 3.4, 5.2], [def.power, 0.8, 1.45], [def.reach, 0.85, 1.2]].forEach(([v, lo, hi], i) => {
      const y = 236 + i * 18, w = 300 * Math.max(0.1, Math.min(1, (v - lo) / (hi - lo)))
      g.fillStyle(0x2a3138, 1); g.fillRect(420, y, 300, 8); g.fillStyle(hex(f.colour), 1); g.fillRect(420, y, w, 8)
    })
    def.combos.forEach((c, i) => { this.comboT[i][0].setText(c.name).setColor(f.colour); this.comboT[i][1].setText(comboLabel(c.seq)) })
    // fight order slots
    this.slots.forEach((sl, i) => {
      const pi = order[i], g2 = sl.g
      g2.clear()
      if (pi == null) { g2.lineStyle(1.5, 0x3a424d, 1); g2.strokeRoundedRect(sl.x - 25, sl.y - 20, 50, 40, 6); sl.t.setText(String(i + 1)).setColor('#3a424d'); return }
      const pf = FIGHTERS[pi], col = hex(pf.colour)
      g2.fillStyle(col, 0.25); g2.fillRoundedRect(sl.x - 25, sl.y - 20, 50, 40, 6); g2.lineStyle(2, col, 1); g2.strokeRoundedRect(sl.x - 25, sl.y - 20, 50, 40, 6)
      sl.t.setText(pf.name.slice(0, 3)).setColor(pf.colour)
    })
    this.lvlBtns.forEach((b, i) => b.setOn(['easy', 'medium', 'hard'][i] === cfg.level))
    if (this.fightBtn) this.fightBtn.destroy()
    const lead = order.length ? FIGHTERS[order[0]].colour : '#5c6670'
    this.fightBtn = button(this, 674, 404, 192, 52, order.length ? (order.length > 1 ? `FIGHT ${order.length}v${order.length}!` : 'FIGHT!') : 'Add a fighter', lead, () => this.start(), { solid: !!order.length, size: order.length ? 30 : 22, r: 10 })
  }
  start() {
    const cfg = this.game.cfg, order = this.sq.order
    if (!order.length) { this.cameras.main.shake(120, 0.004); return }
    // CPU team: same size, random pillars and styles
    const pool = Phaser.Utils.Array.Shuffle([0, 1, 2, 3, 4])
    const team1 = order.map(p => ({ p, style: this.sq.styles[FIGHTERS[p].key] }))
    const team2 = pool.slice(0, order.length).map(p => ({ p, style: Phaser.Utils.Array.GetRandom(STYLE_KEYS) }))
    sfx(this).resume?.()
    this.cameras.main.flash(160, 255, 255, 255)
    this.scene.start('Fight', { team1, team2, level: cfg.level })
  }
  update() {
    this.frame++
    const b = bridge(this), pr = b.pressed || {}
    if (pr.left || pr.right) { const n = FIGHTERS.length; this.choose((this.game.cfg.pick + (pr.right ? 1 : n - 1)) % n); pr.left = pr.right = false; sfx(this).ui?.() }
    if (pr.super) { pr.super = false; this.start(); return }
    // preview fighter shows off its style's strikes and its special
    const f = this.prev
    if (!f.move) {
      this.demoT = (this.demoT ?? 40) - 1
      if (this.demoT <= 0) {
        const seq = ['lp', 'mp', 'hp', 'lk', 'mk', 'hk', 'sp']
        const k = seq[(this.demoN = ((this.demoN || 0) + 1) % seq.length)]
        if (k === 'sp') { const sp = f.def.special; f.move = sp === 'wave' ? { k: 'cast', s: 8, a: 6, r: 16, reach: 30 } : sp === 'quake' ? { k: 'stomp', s: 10, a: 4, r: 18 } : sp === 'upper' ? { k: 'upper', s: 3, a: 8, r: 20, reach: 66 } : sp === 'rush' ? { k: 'rush', s: 4, a: 14, r: 14, reach: 75 } : { k: 'counter', s: 40, a: 0, r: 6 }; if (sp === 'counter') f.counterT = 40 }
        else f.move = demoMove(f, k)
        f.t = 0; this.demoT = 26
      }
    } else { f.t++; if (f.t > f.move.s + f.move.a + f.move.r) f.move = null }
    if (f.counterT > 0) f.counterT--
    this.fg.clear()
    this.fg.setScale(1.3).setPosition(-170 * 0.3, -330 * 0.3)
    this.fg.lineStyle(2, hex(fxColour(f)), 0.4); this.fg.strokeEllipse(170, 336, 170, 22)
    stepPose(this.prevPose, f, this.frame)
    drawFighter(this.fg, f, this.prevPose, this.frame, 1, { noKo: true, y: 330, shadowY: 330 })
  }
}

// ---------------- Fight ----------------
export class FightScene extends Phaser.Scene {
  constructor() { super('Fight') }
  create(data) {
    this.data0 = data
    setupCam(this)
    const b = bridge(this); b.onScene?.('fight')
    const P = prog(this), cpuUp = cpuUpgrades(P, data.level)
    const defs = (t, mine) => (t || []).map(x => applyUpgrades(styledDef(FIGHTERS[x.p], x.style), mine ? (P.upgrades || {})[FIGHTERS[x.p].key] : cpuUp))
    this.m = new Match(defs(data.team1, true), defs(data.team2, false), data.level)
    for (const f of [...this.m.t1, ...this.m.t2]) f.theme = NATURAL_HOUSE[f.def.key]
    this.tagReq = null
    this.poses = { p1: makePose(this.m.p1, 0), p2: makePose(this.m.p2, 0) }
    this.acc = 0; this.slow = 1; this.shakeT = null
    this.world = []
    this.world.push(...buildArena(this))
    this.fg = this.add.graphics(); this.world.push(this.fg)
    this.pjSprites = new Map()
    this.emitters = {}
    // HUD on its own camera so it doesn't shake or zoom
    this.ui = this.cameras.add(0, 0, W * Z, H * Z).setZoom(Z).centerOn(W / 2, H / 2)
    this.hud = []
    this.buildHud()
    this.cameras.main.ignore(this.hud)
    this.ui.ignore(this.world)
    this.lag = { p1: 100, p2: 100 }
    this.sx = sfx(this); this.sx.music?.()
    this.handle(this.m.drain())
    this.events.once('shutdown', () => this.sx.stopMusic?.())
  }
  W(o) { this.world.push(o); this.ui?.ignore(o); return o }
  U(o) { this.hud.push(o); this.cameras.main.ignore(o); return o }

  buildHud() {
    const u = o => { this.hud.push(o); return o }
    this.hudG = u(this.add.graphics())
    const m = this.m
    this.n1 = u(txt(this, 22, 50, m.p1.def.name, { fontSize: '20px', stroke: '#000', strokeThickness: 4 }))
    this.n2 = u(txt(this, W - 22, 50, m.p2.def.name + ' (CPU)', { fontSize: '20px', stroke: '#000', strokeThickness: 4 }).setOrigin(1, 0))
    this.timerT = u(txt(this, W / 2, 33, '60', { fontSize: '38px', color: '#fff', stroke: '#000', strokeThickness: 5 }).setOrigin(0.5))
    this.sp1 = u(txt(this, 22, 84, '', { fontFamily: BODY, fontStyle: '700', fontSize: '14px' }))
    this.sp2 = u(txt(this, W - 22, 84, '', { fontFamily: BODY, fontStyle: '700', fontSize: '14px' }).setOrigin(1, 0))
    this.banner = u(txt(this, W / 2, H / 2 - 30, '', { fontSize: '92px', color: GOLD, stroke: '#000', strokeThickness: 10 }).setOrigin(0.5).setAlpha(0))
    this.banner.setShadow(0, 0, RED, 22, true, true)
    this.sub = u(txt(this, W / 2, H / 2 + 34, '', { fontFamily: BODY, fontStyle: '700', fontSize: '26px', stroke: '#000', strokeThickness: 5 }).setOrigin(0.5).setAlpha(0))
    // tap zones over the player's team chips (tag in that teammate); chip labels
    this.chipT = []
    for (const [side, team] of [['p1', m.t1], ['p2', m.t2]]) if (team.length > 1) team.forEach((mb, i) => {
      const cx = side === 'p1' ? 20 + i * 56 : W - 20 - 50 - i * 56
      this.chipT.push(u(txt(this, cx + 30, 104, mb.def.name.slice(0, 3), { fontFamily: BODY, fontStyle: '700', fontSize: '12px', color: mb.def.colour }).setOrigin(0.5, 0)))
      if (side === 'p1') { const z = u(this.add.zone(cx + 25, 116, 54, 30).setInteractive()); z.on('pointerdown', () => { this.tagReq = i }) }
    })
    this.hitsT = { p1: u(txt(this, 26, 150, '', { fontSize: '44px', color: GOLD, stroke: '#000', strokeThickness: 6 }).setAlpha(0)),
      p2: u(txt(this, W - 26, 150, '', { fontSize: '44px', color: GOLD, stroke: '#000', strokeThickness: 6 }).setOrigin(1, 0).setAlpha(0)) }
    this.dark = u(this.add.rectangle(W / 2, H / 2, W + 40, H + 40, 0x000000, 0).setDepth(-1))
    this.flashR = u(this.add.rectangle(W / 2, H / 2, W + 40, H + 40, 0xfff0b4, 0))
  }

  // ---- effects ----
  emitter(colour) {
    if (this.emitters[colour]) return this.emitters[colour]
    const sparks = this.add.particles(0, 0, 'dot', { speed: { min: 120, max: 420 }, angle: { min: 0, max: 360 }, scale: { start: 0.55, end: 0 }, alpha: { start: 1, end: 0 }, lifespan: { min: 180, max: 380 }, blendMode: 'ADD', tint: colour, emitting: false, gravityY: 300 })
    const shards = this.add.particles(0, 0, 'shard', { speed: { min: 200, max: 520 }, angle: { min: 0, max: 360 }, rotate: { min: 0, max: 360 }, scale: { start: 0.9, end: 0.1 }, alpha: { start: 1, end: 0 }, lifespan: 220, blendMode: 'ADD', tint: [0xffffff, colour], emitting: false })
    const e = { sparks: this.W(sparks), shards: this.W(shards) }
    this.emitters[colour] = e
    return e
  }
  dustE() {
    if (!this.dust) this.dust = this.W(this.add.particles(0, 0, 'dot', { speed: { min: 30, max: 120 }, angle: { min: 190, max: 350 }, scale: { start: 0.6, end: 1.4 }, alpha: { start: 0.35, end: 0 }, lifespan: 420, tint: 0x9aa3ae, emitting: false, gravityY: -40 }))
    return this.dust
  }
  sparkAt(x, y, colour, size = 1, block = false) {
    const e = this.emitter(block ? 0x8fd3ff : colour)
    e.sparks.explode(Math.round((block ? 6 : 12) * size), x, y)
    if (!block) e.shards.explode(Math.round(6 * size), x, y)
    const b = this.W(this.add.image(x, y, 'burst').setTint(block ? 0x8fd3ff : 0xffffff).setBlendMode('ADD').setScale(0.15 * size).setAngle(Math.random() * 360))
    this.tweens.add({ targets: b, scale: (block ? 0.45 : 0.75) * size, alpha: 0, duration: block ? 120 : 170, onComplete: () => b.destroy() })
    if (!block) {
      const b2 = this.W(this.add.image(x, y, 'burst').setTint(colour).setBlendMode('ADD').setScale(0.1 * size).setAngle(Math.random() * 360))
      this.tweens.add({ targets: b2, scale: 1.0 * size, alpha: 0, duration: 230, onComplete: () => b2.destroy() })
    }
    if (size >= 1.4) this.ringAt(x, y, colour, size)
  }
  ringAt(x, y, colour, size = 1) {
    const r = this.W(this.add.image(x, y, 'ring').setTint(colour).setBlendMode('ADD').setScale(0.1).setAlpha(0.9))
    this.tweens.add({ targets: r, scale: 1.2 * size, alpha: 0, duration: 320, ease: 'Cubic.out', onComplete: () => r.destroy() })
  }
  popText(x, y, s, colour = GOLD, size = 30) {
    const t = this.U(txt(this, x, y, s, { fontSize: size + 'px', color: colour, stroke: '#000', strokeThickness: 6 }).setOrigin(0.5).setScale(0.4))
    this.tweens.add({ targets: t, scale: 1, duration: 140, ease: 'Back.out' })
    this.tweens.add({ targets: t, y: y - 34, alpha: 0, delay: 650, duration: 400, onComplete: () => t.destroy() })
  }
  showBanner(big, small, hold = 900, colour = GOLD) {
    this.tweens.killTweensOf([this.banner, this.sub])
    this.banner.setText(big).setColor(colour).setScale(2.2).setAlpha(0)
    this.tweens.add({ targets: this.banner, scale: 1, alpha: 1, duration: 260, ease: 'Back.out' })
    this.sub.setText(small || '').setAlpha(0).setY(H / 2 + 44)
    if (small) this.tweens.add({ targets: this.sub, alpha: 1, y: H / 2 + 34, delay: 150, duration: 220 })
    if (hold > 0) this.tweens.add({ targets: [this.banner, this.sub], alpha: 0, delay: hold, duration: 260 })
  }
  shake(ms, amt) { this.cameras.main.shake(ms, amt / 1000 * 0.8) }
  crowdJump(big) { if (!this.crowd) return; this.tweens.add({ targets: this.crowd, y: big ? -7 : -3, duration: 90, yoyo: true, repeat: big ? 3 : 0 }) }
  vibe(ms) { try { navigator.vibrate?.(ms) } catch (e) { /* ignore */ } }

  handle(events) {
    const m = this.m, sx = this.sx
    for (const e of events) {
      switch (e.type) {
        case 'roundIntro': this.showBanner(e.team ? 'TEAM BATTLE' : 'ROUND 1', e.team ? `${e.sizes[0]} vs ${e.sizes[1]}` : `${m.p1.def.name} vs ${m.p2.def.name}`, 650); sx.say?.(e.team ? 'Team battle' : 'Round one'); this.lag = { p1: 100, p2: 100 }; this.cameras.main.zoomTo(Z, 300); break
        case 'tagIn': {
          this.poses[e.side] = makePose(e.f, m.frame); this.lag[e.side] = e.f.hp
          const col = hex(fxColour(e.f))
          this.ringAt(e.f.x, FLOOR - 70, col, 1.3); this.emitter(col).sparks.explode(18, e.f.x, FLOOR - 120)
          this.popText(e.f.x, FLOOR - 240, e.why === 'tag' ? 'TAG IN!' : e.f.def.name, fxColour(e.f), 30)
          sx.special?.(); if (e.side === 'p1') this.vibe(20)
          break
        }
        case 'fight': this.showBanner('FIGHT!', '', 500, '#FFFFFF'); sx.bell?.(); sx.say?.('Fight!', 0.7); this.crowdJump(true); break
        case 'whoosh': sx.whoosh?.(e.heavy); break
        case 'hit': {
          const big = e.dmg >= 20, col = hex(fxColour(e.att))
          this.sparkAt(e.x, e.y, col, big ? 2 : e.heavy ? 1.4 : 0.9)
          sx.hit?.(e.heavy, big)
          this.shake(big ? 260 : e.heavy ? 150 : 80, big ? 10 : e.heavy ? 6 : 3)
          if (e.heavy) this.crowdJump(big)
          if (e.def.side === 'p1' || e.att.side === 'p1') this.vibe(e.heavy ? 28 : 10)
          if (e.chain >= 2) this.hitCount(e.att.side, e.chain)
          this.hitstopDef = e.def
          break
        }
        case 'block': this.sparkAt(e.x, e.y, 0x8fd3ff, 0.8, true); sx.block?.(); break
        case 'counter': this.sparkAt(e.x, e.y, 0xffffff, 1.8); this.ringAt(e.att.x, e.att.y - 72, hex(fxColour(e.att)), 1.6); sx.hit?.(true, true); this.popText(e.att.x, e.att.y - 200, 'COUNTER!', '#FFFFFF', 34); this.shake(220, 8); this.crowdJump(true); break
        case 'combo': this.popText(e.f.x, e.f.y - 205, e.name.toUpperCase() + '!', GOLD, 30); sx.special?.(); break
        case 'special': {
          sx.special?.()
          const col = hex(fxColour(e.f))
          this.ringAt(e.f.x, e.f.y - 80, col, 0.9)
          this.popText(e.f.x, e.f.y - 205, e.f.def.specialName.toUpperCase(), fxColour(e.f), 24)
          if (e.kind === 'quake') { this.shake(200, 5); this.dustE().explode(16, e.f.x + 20 * e.f.facing, FLOOR) }
          break
        }
        case 'super': this.superCutIn(e.f, e.name); break
        case 'projectile': this.spawnProjectile(e.pj); break
        case 'projectileGone': this.killProjectile(e.pj); break
        case 'jump': this.dustE().explode(6, e.f.x, FLOOR); break
        case 'land': this.dustE().explode(e.hard ? 22 : 8, e.f.x, FLOOR); sx.land?.(e.hard); if (e.hard) this.shake(200, 6); break
        case 'ko': {
          sx.ko?.(); sx.say?.('K.O.', 0.4); this.vibe(80)
          if (!e.final) {
            this.slow = 0.5; this.cameras.main.flash(120, 255, 255, 255); this.crowdJump(true)
            this.showBanner('K.O.', `${e.left} left`, 900, GOLD)
            this.time.delayedCall(600, () => { this.slow = 1 })
            break
          }
          this.slow = 0.22; this.cameras.main.flash(220, 255, 255, 255)
          const midX = (m.p1.x + m.p2.x) / 2
          this.cameras.main.pan(midX, H / 2 + 40, 500, 'Cubic.easeOut'); this.cameras.main.zoomTo(Z * 1.25, 500, 'Cubic.easeOut')
          this.time.delayedCall(1500, () => { this.slow = 1; this.cameras.main.pan(W / 2, H / 2, 600, 'Cubic.easeInOut'); this.cameras.main.zoomTo(Z, 600, 'Cubic.easeInOut') })
          this.crowdJump(true); sx.cheer?.(1.4)
          break
        }
        case 'roundOver': {
          bridge(this).onRound?.()
          const you = e.winner === 'p1'
          const big = e.how === 'ko' ? 'K.O.' : e.winner ? 'TIME' : 'DRAW'
          const team = m.t1.length > 1
          const small = e.winner ? (e.perfect ? 'PERFECT! ' : '') + (you ? (team ? 'Your team wins!' : 'You win!') : (team ? 'CPU team wins' : 'CPU wins')) : 'Draw'
          this.time.delayedCall(e.how === 'ko' ? 350 : 0, () => this.showBanner(big, small, e.matchOver ? 1600 : 1500, e.how === 'ko' ? GOLD : '#FFFFFF'))
          if (e.how !== 'ko') { sx.bell?.(); sx.cheer?.(1) }
          break
        }
        case 'matchOver': {
          this.time.delayedCall(700, () => {
            this.cameras.main.fadeOut(350, 5, 7, 10)
            this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('Results', { ...this.data0, winner: e.winner, stats: m.stats, winDef: e.winner ? m[e.winner].def : m.p1.def, gems: matchGems(m.t1.map(f => f.def.key), e.winner === 'p1', data0Level(this)), kos: [m.t2.filter(x => x.hp <= 0).length, m.t1.filter(x => x.hp <= 0).length], sizes: [m.t1.length, m.t2.length] }))
          })
          break
        }
      }
    }
  }
  hitCount(side, n) {
    const t = this.hitsT[side]
    this.tweens.killTweensOf(t)
    t.setText(`${n} HITS`).setAlpha(1).setScale(1.5)
    this.tweens.add({ targets: t, scale: 1, duration: 140, ease: 'Back.out' })
    this.tweens.add({ targets: t, alpha: 0, delay: 900, duration: 300 })
  }
  superCutIn(f, name) {
    const sx = this.sx, col = hex(fxColour(f))
    sx.superStart?.(); sx.say?.(name, 0.6)
    this.vibe(40)
    this.tweens.add({ targets: this.dark, fillAlpha: 0.65, duration: 120, yoyo: true, hold: 380 })
    // diagonal stripe with the super's name
    const stripe = this.U(this.add.graphics())
    stripe.fillStyle(col, 0.95); stripe.fillPoints([{ x: -40, y: 170 }, { x: W + 40, y: 150 }, { x: W + 40, y: 250 }, { x: -40, y: 270 }], true)
    stripe.fillStyle(0x000000, 0.35); stripe.fillPoints([{ x: -40, y: 250 }, { x: W + 40, y: 230 }, { x: W + 40, y: 250 }, { x: -40, y: 270 }], true)
    const t = this.U(txt(this, f.side === 'p1' ? -300 : W + 300, 210, name.toUpperCase(), { fontSize: '76px', color: '#0A0A0A' }).setOrigin(0.5))
    stripe.setX(f.side === 'p1' ? -W : W)
    this.tweens.add({ targets: stripe, x: 0, duration: 140, ease: 'Cubic.out' })
    this.tweens.add({ targets: t, x: W / 2, duration: 180, ease: 'Back.out' })
    this.tweens.add({ targets: [stripe, t], alpha: 0, delay: 460, duration: 120, onComplete: () => { stripe.destroy(); t.destroy() } })
    this.ringAt(f.x, f.y - 80, col, 2.2)
    this.emitter(col).sparks.explode(30, f.x, f.y - 80)
  }
  spawnProjectile(pj) {
    const col = hex(fxColour(pj.owner))
    const s = this.W(this.add.image(pj.x, pj.y, 'orb').setTint(col).setBlendMode('ADD').setScale(pj.big ? 1.3 : pj.low ? 0.8 : 0.7))
    if (pj.low) s.setScale(1.1, 0.45)
    const core = this.W(this.add.image(pj.x, pj.y, 'dot').setBlendMode('ADD').setScale(pj.big ? 1.1 : 0.6))
    const trail = this.W(this.add.particles(0, 0, 'dot', { speed: { min: 10, max: 50 }, scale: { start: pj.big ? 1.2 : 0.8, end: 0 }, alpha: { start: 0.7, end: 0 }, lifespan: 320, frequency: 16, blendMode: 'ADD', tint: col }))
    trail.startFollow(s)
    this.pjSprites.set(pj.id, { s, core, trail, pj })
  }
  killProjectile(pj) {
    const o = this.pjSprites.get(pj.id); if (!o) return
    this.sparkAt(o.s.x, o.s.y, hex(fxColour(pj.owner)), pj.big ? 1.4 : 0.8)
    o.s.destroy(); o.core.destroy(); o.trail.stop(); this.time.delayedCall(400, () => o.trail.destroy())
    this.pjSprites.delete(pj.id)
  }

  getInput() {
    const b = bridge(this), inp = b.input || {}, pr = b.pressed || {}
    const c = { left: inp.left, right: inp.right, down: inp.down, upPressed: pr.up || !!inp.up, tag: pr.tag ? 'next' : this.tagReq, superPressed: pr.super, lpPressed: pr.lp, mpPressed: pr.mp, hpPressed: pr.hp, lkPressed: pr.lk, mkPressed: pr.mk, hkPressed: pr.hk, spPressed: pr.sp, block: !!inp.block }
    for (const k in pr) pr[k] = false
    this.tagReq = null
    return c
  }

  update(time, delta) {
    const m = this.m
    this.acc += Math.min(100, delta) * this.slow
    let n = 0
    while (this.acc >= STEP && n < 6) {
      const f0 = m.frame
      m.step(() => this.getInput())
      if (m.frame !== f0) { stepPose(this.poses.p1, m.p1, m.frame); stepPose(this.poses.p2, m.p2, m.frame) }
      this.handle(m.drain())
      this.acc -= STEP; n++
    }
    if (n >= 6) this.acc = 0
    const alpha = m.freeze > 0 ? 1 : Math.min(1, this.acc / STEP)
    // projectiles follow the simulation
    for (const o of this.pjSprites.values()) {
      if (o.pj.life <= 0) continue
      const wob = Math.sin(m.frame / 3) * (o.pj.low ? 0 : 3)
      o.s.setPosition(o.pj.x, o.pj.y + wob); o.core.setPosition(o.pj.x, o.pj.y + wob)
      o.s.rotation += 0.2
    }
    // fighters: the one attacking is drawn in front
    const g = this.fg; g.clear()
    const order = m.p2.move && !m.p1.move ? ['p1', 'p2'] : ['p2', 'p1']
    for (const k of order) {
      const f = m[k]
      const jitter = m.freeze > 0 && this.hitstopDef === f ? (m.frame % 2 ? 2 : -2) * (m.freeze % 2 ? 1 : -1) : 0
      drawFighter(g, f, this.poses[k], m.frame, alpha, { x: f.x + jitter })
    }
    this.drawHud()
  }

  drawHud() {
    const m = this.m, g = this.hudG; g.clear()
    for (const k of ['p1', 'p2']) {
      const f = m[k]
      if (this.lag[k] == null) this.lag[k] = f.hp
      this.lag[k] = f.hp > this.lag[k] ? f.hp : (m.frame - (f.lastHitAt || 0) > 30 ? Math.max(f.hp, this.lag[k] - 0.6) : this.lag[k])
    }
    const bar = (x0, f, right, lag) => {
      const w = 330, h = 22, y = 18, sk = 10
      const shape = (x, ww) => right
        ? [{ x: x + w - ww, y }, { x: x + w, y }, { x: x + w - sk, y: y + h }, { x: x + w - ww - sk, y: y + h }]
        : [{ x: x + sk, y }, { x: x + ww + sk, y }, { x: x + ww, y: y + h }, { x, y: y + h }]
      g.fillStyle(0x000000, 0.6); g.fillPoints(shape(x0 - 3, w + 6), true)
      g.fillStyle(0x2a3138, 1); g.fillPoints(shape(x0, w), true)
      if (lag > f.hp) { g.fillStyle(0xffffff, 0.85); g.fillPoints(shape(x0, w * lag / f.maxHp), true) }
      const low = f.hp <= f.maxHp * 0.3
      g.fillStyle(low ? (m.frame % 20 < 10 ? 0xe24b4a : 0xff7a6e) : hex(fxColour(f)), 1); g.fillPoints(shape(x0, Math.max(0, w * f.hp / f.maxHp)), true)
      g.fillStyle(0xffffff, 0.18); g.fillRect(right ? x0 + 4 : x0 + 12, y + 3, w - 18, 5)
      g.lineStyle(2, 0xf2f2f2, 0.9); g.strokePoints(shape(x0, w), true)
      // team: one chip per fighter in order, mini health bar; tap a waiting teammate to tag them in
      const team = right ? m.t2 : m.t1, side = right ? 'p2' : 'p1'
      if (team.length > 1) team.forEach((mb, i) => {
        const cw = 50, chx = right ? x0 + w - cw - i * 56 : x0 + i * 56, chy = 104
        const col = hex(mb.def.colour), active = mb === m[side], down = mb.hp <= 0
        g.fillStyle(0x0b0e12, 0.9); g.fillRoundedRect(chx, chy, cw, 24, 5)
        if (!down) { g.fillStyle(col, active ? 1 : 0.75); g.fillRect(chx + 3, chy + 17, (cw - 6) * Math.max(0, mb.hp) / mb.maxHp, 4) }
        g.lineStyle(active ? 2.5 : 1.5, down ? 0x3a424d : active ? 0xffffff : col, 1); g.strokeRoundedRect(chx, chy, cw, 24, 5)
        if (down) { g.lineStyle(2, 0x5c6670, 1); g.lineBetween(chx + 6, chy + 4, chx + cw - 6, chy + 20); g.lineBetween(chx + cw - 6, chy + 4, chx + 6, chy + 20) }
        else { g.fillStyle(col, 1); g.fillCircle(chx + 10, chy + 9, 5) }
        // player's tag cool-down shades the waiting chips
        if (side === 'p1' && !active && !down && m.tagCd.p1 > 0) { g.fillStyle(0x000000, 0.55); g.fillRect(chx, chy, cw * m.tagCd.p1 / 300, 24) }
      })
      // super meter
      const mt = f.meter || 0, full = mt >= 100, mw = 220
      const mx = right ? x0 + w - mw : x0
      g.fillStyle(0x0b0e12, 0.9); g.fillRect(mx, 74, mw, 8)
      g.fillStyle(full ? (m.frame % 10 < 5 ? 0xf5c542 : 0xfff6c9) : 0xf5c542, 1)
      g.fillRect(right ? mx + mw - mw * mt / 100 : mx, 74, mw * mt / 100, 8)
      g.lineStyle(1, 0xf5c542, 0.5); g.strokeRect(mx, 74, mw, 8)
    }
    bar(20, m.p1, false, this.lag.p1); bar(W - 350, m.p2, true, this.lag.p2)
    // timer
    g.fillStyle(0x0b0e12, 0.85); g.fillRoundedRect(W / 2 - 34, 10, 68, 46, 8); g.lineStyle(2, 0xf5c542, 0.7); g.strokeRoundedRect(W / 2 - 34, 10, 68, 46, 8)
    const secs = Math.max(0, Math.ceil(m.timer / 60))
    setT(this.n1, `${m.p1.def.name} · ${m.p1.def.styleName}`); setT(this.n2, `${m.p2.def.name} · ${m.p2.def.styleName} (CPU)`)
    setT(this.timerT, String(secs), secs <= 10 && m.phase === 'fight' ? RED : '#FFFFFF')
    const spTxt = (f) => (f.meter || 0) >= 100 ? `SUPER READY: ${SUPER_NAME[f.def.special]}` : f.specialCd === 0 ? `${f.def.specialName} ready` : f.def.specialName
    setT(this.sp1, spTxt(m.p1), (m.p1.meter || 0) >= 100 ? GOLD : m.p1.specialCd === 0 ? fxColour(m.p1) : '#5c6670')
    setT(this.sp2, spTxt(m.p2), (m.p2.meter || 0) >= 100 ? GOLD : m.p2.specialCd === 0 ? fxColour(m.p2) : '#5c6670')
    // live readings for the React buttons' charge rings
    if (m.frame % 6 === 0) bridge(this).onHud?.({ sp: 1 - Math.min(1, (m.p1.specialCd || 0) / (m.p1.specialCdMax || 150)), sup: Math.min(1, (m.p1.meter || 0) / 100), special: m.p1.def.special, colour: m.p1.def.colour })
  }
}

const data0Level = sc => (sc.data0 && sc.data0.level) || 'medium'

// ---------------- Results ----------------
export class ResultsScene extends Phaser.Scene {
  constructor() { super('Results') }
  create(data) {
    this.d = data
    setupCam(this); bridge(this).onScene?.('results')
    this.cameras.main.fadeIn(300, 5, 7, 10)
    buildArena(this, { dim: 0.7 })
    const youWon = data.winner === 'p1'
    const wDef = data.winDef || FIGHTERS[0]
    this.win = makeFighter(wDef, 190, 1); this.win.side = youWon ? 'p1' : 'p2'; this.win.theme = NATURAL_HOUSE[wDef.key]
    const team = (data.sizes || [1])[0] > 1, kos = data.kos || [0, 0]
    this.pose = makePose(this.win, 0); this.frame = 0
    this.fg = this.add.graphics()
    this.conf = this.add.particles(0, 0, 'shard', { x: { min: 40, max: 340 }, y: -10, speedY: { min: 80, max: 180 }, speedX: { min: -40, max: 40 }, rotate: { min: 0, max: 360 }, scale: { start: 0.6, end: 0.6 }, lifespan: 3200, frequency: 60, tint: [hex(wDef.colour), 0xf5c542, 0xffffff] })
    const head = txt(this, 560, 70, youWon ? 'YOU WIN!' : 'CPU WINS', { fontSize: '76px', color: youWon ? '#22B14C' : RED, stroke: '#000', strokeThickness: 8 }).setOrigin(0.5)
    head.setShadow(0, 0, youWon ? '#22B14C' : RED, 18, true, true)
    head.setScale(2).setAlpha(0); this.tweens.add({ targets: head, scale: 1, alpha: 1, duration: 380, ease: 'Back.out' })
    txt(this, 560, 122, team ? `Knock-outs  ${kos[0]}–${kos[1]}` : `${wDef.name} · ${wDef.styleName || ''} wins`, { fontFamily: BODY, fontStyle: '700', fontSize: '22px', color: '#C9CED6' }).setOrigin(0.5)
    // stats table
    const s1 = data.stats.p1, s2 = data.stats.p2
    const rows = [['Hits landed', s1.hits, s2.hits], ['Best combo', s1.bestCombo, s2.bestCombo], ['Damage dealt', Math.round(s1.dmg), Math.round(s2.dmg)], ['Attacks blocked', s1.blocked, s2.blocked], ['Specials', s1.specials, s2.specials], ['Supers', s1.supers, s2.supers]]
    const g = this.add.graphics()
    g.fillStyle(0x0b0e12, 0.85); g.fillRoundedRect(380, 150, 360, 196, 10); g.lineStyle(1.5, 0x2a3138, 1); g.strokeRoundedRect(380, 150, 360, 196, 10)
    txt(this, 630, 158, 'You', { fontFamily: BODY, fontStyle: '700', fontSize: '17px', color: FIGHTERS[data.team1[0].p].colour }).setOrigin(0.5, 0)
    txt(this, 705, 158, 'CPU', { fontFamily: BODY, fontStyle: '700', fontSize: '17px', color: FIGHTERS[data.team2[0].p].colour }).setOrigin(0.5, 0)
    rows.forEach(([l, a, b], i) => {
      const y = 184 + i * 26
      txt(this, 396, y, l, { fontFamily: BODY, fontStyle: '600', fontSize: '19px', color: '#C9CED6' })
      txt(this, 630, y, String(a), { fontFamily: BODY, fontStyle: '700', fontSize: '20px', color: a > b ? GOLD : '#F2F2F2' }).setOrigin(0.5, 0)
      txt(this, 705, y, String(b), { fontFamily: BODY, fontStyle: '700', fontSize: '20px', color: b > a ? GOLD : '#F2F2F2' }).setOrigin(0.5, 0)
    })
    button(this, 470, 410, 180, 46, 'Rematch', FIGHTERS[data.team1[0].p].colour, () => this.rematch(), { solid: true, size: 28, r: 10 })
    button(this, 660, 410, 180, 46, 'Change team', '#F2F2F2', () => this.scene.start('Select'), { size: 24, r: 10 })
    // gems earned this match (60 a day limit)
    const gemG = this.add.graphics(), gemT = txt(this, 560, 350, 'Adding gems…', { fontFamily: BODY, fontStyle: '700', fontSize: '17px', color: '#C9CED6' }).setOrigin(0.5, 0)
    if (data.gems && !data.gemsDone) {
      data.gemsDone = true
      awardGems(prog(this), data.gems).then(({ progress, given }) => {
        this.game.progress = progress
        const ks = Object.keys(given)
        if (!ks.length) { gemT.setText(`Daily gem limit reached (${DAILY_GEMS})`); return }
        gemT.setText('')
        const total = ks.length, x0 = 560 - (total * 92) / 2 + 46
        ks.forEach((k, i) => {
          const f = FIGHTERS.find(x => x.key === k), x = x0 + i * 92
          gemIcon(gemG, x - 22, 362, 9, hex(f.colour))
          txt(this, x - 8, 350, `+${given[k]}`, { fontFamily: BODY, fontStyle: '700', fontSize: '19px', color: f.colour })
        })
      })
    } else gemT.setText('')
    sfx(this).cheer?.(youWon ? 1.5 : 0.6)
    sfx(this).say?.(youWon ? 'You win' : 'You lose', 0.5)
  }
  rematch() { this.scene.start('Fight', { team1: this.d.team1, team2: this.d.team2, level: this.d.level }) }
  // (gems are only added once per match: the Results data is marked when done)
  update() {
    this.frame++
    const pr = bridge(this).pressed || {}
    if (pr.super) { pr.super = false; this.rematch(); return }
    const f = this.win
    // victory pose: bounce with both fists raised
    const P = targetPose(f, this.frame)
    const up = Math.abs(Math.sin(this.frame / 14))
    P.lhX = 18; P.lhY = P.shY - 44 - up * 8; P.rhX = -2; P.rhY = P.shY - 40 - (1 - up) * 8; P.headY -= 2
    this.pose.prev = { ...this.pose.cur }; this.pose.cur = P
    this.fg.clear()
    this.fg.lineStyle(2, hex(fxColour(f)), 0.5); this.fg.strokeEllipse(190, 368, 200, 26)
    this.fg.setScale(1.25); this.fg.setPosition(-190 * 0.25, -366 * 0.25)
    drawFighter(this.fg, f, this.pose, this.frame, 1, { noKo: true, noTrail: true, y: 360, shadowY: 360 })
  }
}


// ---------------- Upgrade: spend gems on a fighter's MTP areas ----------------
// The club's MTP analysis areas (Technical 12 / Physical 16 / Mental 8), 5 levels each, every one with its
// own effect in a fight.
export class UpgradeScene extends Phaser.Scene {
  constructor() { super('Upgrade') }
  create(data) {
    setupCam(this); bridge(this).onScene?.('upgrade')
    buildArena(this, { dim: 0.86 })
    this.pick = data?.pick ?? 0; this.group = data?.group || 'Technical'; this.busy = false
    txt(this, 24, 10, 'UPGRADE', { fontSize: '40px', color: GOLD, stroke: '#000', strokeThickness: 6 })
    button(this, 748, 32, 84, 36, 'Back', '#F2F2F2', () => this.scene.start('Select'), { size: 20 })
    // gem wallet
    this.gemG = this.add.graphics()
    this.gemT = PILLARS.map((k, i) => txt(this, 322 + i * 66, 20, '', { fontFamily: BODY, fontStyle: '700', fontSize: '20px', color: FIGHTERS.find(f => f.key === k).colour }))
    this.wildT = txt(this, 322 + 5 * 66, 20, '', { fontFamily: BODY, fontStyle: '700', fontSize: '20px', color: '#F2F2F2' })
    // fighter tabs
    this.tabs = FIGHTERS.map((f, i) => {
      const x = 26 + i * 152 + 70, y = 88
      const c = this.add.container(x, y), g = this.add.graphics()
      const t = txt(this, 0, -8, f.name, { fontSize: '18px', color: f.colour }).setOrigin(0.5)
      const lv = txt(this, 0, 12, '', { fontFamily: BODY, fontStyle: '700', fontSize: '13px', color: '#C9CED6' }).setOrigin(0.5)
      c.add([g, t, lv]); c.setSize(140, 48)
      c.setInteractive(new Phaser.Geom.Rectangle(0, 0, 140, 48), Phaser.Geom.Rectangle.Contains)
      c.on('pointerdown', () => { sfx(this).ui?.(); this.pick = i; this.refresh() })
      c.g = g; c.lv = lv; c.def = f
      return c
    })
    // MTP group tabs
    this.groupBtns = AREA_GROUPS.map((gname, i) => button(this, 92 + i * 150, 136, 140, 30, `${gname} ${AREAS.filter(a => a.g === gname).length}`, '#F2F2F2', () => { this.group = gname; this.refresh() }, { size: 17 }))
    this.summary = txt(this, 776, 126, '', { fontFamily: BODY, fontStyle: '700', fontSize: '15px', color: '#C9CED6' }).setOrigin(1, 0)
    // up to 16 area cards (4 x 4)
    this.cards = Array.from({ length: 16 }, (_, i) => {
      const x = 20 + (i % 4) * 191, y = 156 + Math.floor(i / 4) * 68
      const bg = this.add.graphics(), pips = this.add.graphics(), gem = this.add.graphics()
      const name = txt(this, x + 6, y + 3, '', { fontSize: '14px' })
      const what = txt(this, x + 6, y + 22, '', { fontFamily: BODY, fontStyle: '600', fontSize: '10.5px', color: '#9AA3AE', wordWrap: { width: 118 } })
      const btn = button(this, x + 160, y + 31, 42, 50, '', GOLD, () => { const a = this.cards[i].area; if (a) this.buy(a.key) }, { size: 16 })
      return { x, y, bg, pips, gem, name, what, btn, area: null }
    })
    this.note = txt(this, 20, 449, '', { fontFamily: BODY, fontStyle: '600', fontSize: '11px', color: '#7d8691' }).setOrigin(0, 1)
    this.refresh()
  }
  refresh() {
    const P = prog(this), f = FIGHTERS[this.pick], col = hex(f.colour)
    const g = this.gemG; g.clear()
    PILLARS.forEach((k, i) => { gemIcon(g, 310 + i * 66, 32, 9, hex(FIGHTERS.find(x => x.key === k).colour)); this.gemT[i].setText(String(Math.max(0, available(P, k)))) })
    gemIcon(g, 310 + 5 * 66, 32, 9, 0xffffff); this.wildT.setText(String(Math.max(0, wild(P))))
    this.tabs.forEach((t, i) => {
      const on = i === this.pick, c = hex(t.def.colour)
      t.g.clear(); t.g.fillStyle(on ? c : 0x12161b, on ? 0.22 : 0.92); t.g.fillRoundedRect(-70, -24, 140, 48, 8)
      t.g.lineStyle(on ? 3 : 1.5, on ? c : 0x2a3138, 1); t.g.strokeRoundedRect(-70, -24, 140, 48, 8)
      t.lv.setText(`Level ${fighterLevel(P, t.def.key)}`)
    })
    this.groupBtns.forEach((b, i) => b.setOn(AREA_GROUPS[i] === this.group))
    this.summary.setText(`${f.name}: level ${fighterLevel(P, f.key)} of ${AREAS.length * MAX_LV}`).setColor(f.colour)
    const areas = AREAS.filter(a => a.g === this.group)
    this.cards.forEach((c, i) => {
      const a = areas[i]; c.area = a || null
      c.bg.clear(); c.pips.clear(); c.gem.clear()
      const show = !!a
      for (const o of [c.name, c.what, c.btn]) o.setVisible(show)
      if (!a) return
      const lv = levelOf(P, f.key, a.key), price = priceFor(P, f.key, a.key), maxed = lv >= MAX_LV
      c.bg.fillStyle(0x10141a, 0.95); c.bg.fillRoundedRect(c.x, c.y, 184, 62, 8)
      c.bg.lineStyle(1.5, maxed ? 0xf5c542 : lv > 0 ? col : 0x262d36, 1); c.bg.strokeRoundedRect(c.x, c.y, 184, 62, 8)
      c.name.setText(a.name).setColor(lv > 0 ? f.colour : '#F2F2F2').setFontSize(a.name.length > 15 ? '12px' : '14px')
      c.what.setText(a.what)
      for (let k = 0; k < MAX_LV; k++) { c.pips.fillStyle(k < lv ? col : 0x2a3138, 1); c.pips.fillRoundedRect(c.x + 6 + k * 14, c.y + 50, 11, 7, 2) }
      if (maxed) { c.btn.label.setText('MAX').setColor('#F5C542'); c.btn.setOn(true) }
      else {
        c.btn.label.setText(String(costOf(lv))).setColor(price ? '#F2F2F2' : '#5c6670').setY(8); c.btn.setOn(!!price)
        gemIcon(c.gem, c.x + 160, c.y + 22, 7, price && price.fromWild && !price.fromColour ? 0xffffff : col)
      }
    })
    const src = P.mode === 'db' ? 'Saved to your profile.' : 'Saved on this device.'
    this.note.setText(`${src}  Gems: training in each pillar (its colour), house points (white, any fighter), wins (up to ${DAILY_GEMS} a day).`)
  }
  async buy(area) {
    if (this.busy) return
    const P = prog(this), f = FIGHTERS[this.pick]
    if (!priceFor(P, f.key, area)) { this.cameras.main.shake(120, 0.004); return }
    this.busy = true
    try {
      this.game.progress = await buyUpgrade(P, f.key, area)
      sfx(this).special?.()
      const c = this.cards.find(x => x.area && x.area.key === area)
      if (c) { const ring = this.add.image(c.x + 92, c.y + 32, 'ring').setTint(hex(f.colour)).setBlendMode('ADD').setScale(0.1); this.tweens.add({ targets: ring, scale: 1.1, alpha: 0, duration: 320, onComplete: () => ring.destroy() }) }
    } catch (e) { this.cameras.main.shake(140, 0.005) }
    this.busy = false
    this.refresh()
  }
}
