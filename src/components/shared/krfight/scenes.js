// KR FIGHT 2 -- Phaser scenes: Boot (makes textures), Title, Select, Fight, Results.
// The world is 800x450; cameras zoom x2 onto a 1600x900 canvas so everything stays crisp on phones.
import Phaser from 'phaser'
import { W, H, FLOOR, FIGHTERS, MOVES, SUPER_NAME, LEVELS, comboLabel, hex, getLook, setLook, LOOK_LEVELS, HOUSES, HOUSE_KEYS, getHouse, setHouse, fxColour, cpuHouse, NATURAL_HOUSE, STYLES, STYLE_KEYS, styledDef, loadSquad, saveSquad, MAX_TEAM, COMBO_BY_ID, combosForStyle, defaultLoadout, LOADOUT_SIZE, RARITY, FLOW_MAX, BRANCHES, TIER_XP, TIER_GEMS, applyBranch, seasonOf, CARDS, CARD_BY_ID, CARD_RARITY, CARD_RARITIES, SKINS, SKIN_BY_KEY, COMBO_LIB, getPlayStyle, SF_BUTTON, isBoxerStyle } from './data.js'
import { Match, makeFighter } from './core.js'
import { makePose, stepPose, drawFighter, targetPose } from './pose.js'
import { loadProgress, PILLARS, AREAS, AREA_GROUPS, costOf, MAX_LV, DAILY_GEMS, available, wild, priceFor, buyUpgrade, fighterLevel, levelOf, matchGems, awardGems, applyUpgrades, cpuUpgrades, resetTest, UNLIMITED, loadCollection, ownsCombo, rollComboDrop, addComboCard, COMBO_MAX_LV, rollCardDrop, recordMatch, saveDefence, loadOpponents, opponentLevel, rewardChoices, pvpResult, loadLeaderboard, PILLARS_BY_INDEX, ownsCard, cardsOwnedFor, skinUnlocked, branchOf, xpOf, nextTier, unlockTier, awardXp, isLocked, tokenAvailable, lockSquad, changeStyle, cpuBranch } from './progress.js'

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
  if (getLook() !== 'cartoon') return buildArenaStick(scene, { ...opts, dark: getLook() === 'house' || getLook() === '3d' })
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
const coll = scene => scene.game.collection || (scene.game.collection = loadCollection(scene.game.progress))
const squadDef = (i, sq, scene) => { const q = sq || loadSquad(), k = FIGHTERS[i].key; const d = styledDef(FIGHTERS[i], q.styles[k], (q.loadouts || {})[k], scene ? coll(scene).combos : {}); return scene ? applyBranch({ ...d, mods: d.mods || {} }, branchOf(prog(scene), k)) : d }

// a cut gem: diamond with facets, in a pillar colour (white = wild gem from house points)
function gemIcon(g, x, y, r, col) {
  g.fillStyle(col, 1); g.fillPoints([{ x, y: y - r }, { x: x + r * 0.8, y: y - r * 0.25 }, { x, y: y + r }, { x: x - r * 0.8, y: y - r * 0.25 }], true)
  g.fillStyle(0xffffff, 0.45); g.fillPoints([{ x, y: y - r }, { x: x + r * 0.8, y: y - r * 0.25 }, { x, y: y - r * 0.05 }], true)
  g.lineStyle(1.5, 0x000000, 0.5); g.strokePoints([{ x, y: y - r }, { x: x + r * 0.8, y: y - r * 0.25 }, { x, y: y + r }, { x: x - r * 0.8, y: y - r * 0.25 }], true)
}
const prog = scene => scene.game.progress || {}
// a fighter's equipped skin (Standard if none, or if it isn't unlocked any more)
function skinFor(scene, key, sq) {
  const k = ((sq || loadSquad()).skins || {})[key] || 'standard'
  return skinUnlocked(coll(scene), key, k) ? k : 'standard'
}
// Look 4 (3D): show the 3D fighter in a menu's preview spot instead of the stick figure
function attach3DPreview(scene, rect, colour, skin) {
  if (getLook() !== '3d') return
  if (scene.p3d) { scene.p3d.setColour(colour, skin); return }
  import('./render3d.js').then(mod => {
    if (!scene.sys || !scene.sys.isActive() || scene.p3d) return
    scene.p3d = new mod.Preview3D(scene.game, rect, colour, skin)
    scene.events.once('shutdown', () => { scene.p3d && scene.p3d.destroy(); scene.p3d = null })
  }).catch(() => {})
}

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
    const P0 = prog(this)
    if (P0.squad_styles && isLocked(P0)) { this.sq.styles = { ...this.sq.styles, ...P0.squad_styles }; saveSquad(this.sq) }
    this.changing = null // pillar whose style is being changed with a Change Token
    const cfg = this.game.cfg || (this.game.cfg = { level: 'medium' })
    if (cfg.pick == null) cfg.pick = this.sq.order[0] ?? 0
    buildArena(this, { dim: 0.72 })
    this.frame = 0
    this.fg = this.add.graphics()
    this.makePreview()
    this.name = txt(this, 338, 18, '', { fontSize: '34px', stroke: '#000', strokeThickness: 6 })
    this.styleBtn = button(this, 462, 86, 244, 34, '', '#F2F2F2', () => this.styleTap(), { size: 18 })
    this.teamBtn = button(this, 694, 86, 164, 34, '', GOLD, () => this.changing ? this.confirmChange() : this.toggleTeam(), { size: 18 })
    this.blurb = txt(this, 340, 112, '', { fontFamily: BODY, fontStyle: '600', fontSize: '15px', color: '#C9CED6' })
    this.special = txt(this, 340, 136, '', { fontFamily: BODY, fontStyle: '700', fontSize: '16px' })
    // everything about the fighter (stats, upgrades, branch + XP, combos) lives on its View screen
    this.summary = txt(this, 340, 168, '', { fontFamily: BODY, fontStyle: '700', fontSize: '15px', color: '#C9CED6', wordWrap: { width: 440 } })
    this.viewBtn = button(this, 560, 236, 440, 50, 'View fighter  ▸', '#F2F2F2', () => this.scene.start('Fighter', { pick: this.game.cfg.pick }), { size: 24, r: 10 })
    // fight order slots
    txt(this, 22, 356, 'Fighters  (gold number = fight order)', { fontFamily: BODY, fontStyle: '600', fontSize: '15px', color: '#9AA3AE' })
    this.boxes = FIGHTERS.map((f, i) => {
      const x = 50 + i * 58, y = 406
      const c = this.add.container(x, y)
      const g = this.add.graphics(), badge = this.add.graphics()
      const icon = this.add.graphics()
      icon.fillStyle(hex(f.colour), 1); icon.fillCircle(0, -6, 11); icon.fillStyle(0xf1c9a5, 1); icon.fillCircle(0, -8, 5.5)
      const lvT = txt(this, 0, 14, '', { fontFamily: BODY, fontStyle: '700', fontSize: '12px', color: '#C9CED6' }).setOrigin(0.5)
      const num = txt(this, 22, -21, '', { fontSize: '14px', color: '#0A0A0A' }).setOrigin(0.5)
      c.add([g, icon, lvT, badge, num]); c.setSize(54, 52)
      c.setInteractive(new Phaser.Geom.Rectangle(0, 0, 54, 52), Phaser.Geom.Rectangle.Contains)
      c.on('pointerdown', () => { sfx(this).ui?.(); this.choose(i) })
      c.g = g; c.badge = badge; c.num = num; c.lvT = lvT; c.def = f
      return c
    })
    txt(this, 330, 360, 'Level', { fontFamily: BODY, fontStyle: '600', fontSize: '15px', color: '#9AA3AE' })
    // CPU setting: Normal, or practice -- Still (dummy), Block (blocks everything), Jab only
    if (!cfg.cpuMode) cfg.cpuMode = 'normal'
    const CPU_MODES = [['normal', 'CPU: Normal'], ['still', 'CPU: Still (practice)'], ['block', 'CPU: Block (practice)'], ['jab', 'CPU: Jab only (practice)']]
    this.cpuBtn = button(this, 436, 336, 216, 26, '', '#5BE0FF', () => { const i = CPU_MODES.findIndex(m => m[0] === cfg.cpuMode); cfg.cpuMode = CPU_MODES[(i + 1) % CPU_MODES.length][0]; this.refresh() }, { size: 14 })
    this.cpuModes = CPU_MODES
    this.lvlBtns = ['easy', 'medium', 'hard'].map((l, i) => button(this, 364 + i * 72, 404, 66, 40, l[0].toUpperCase() + l.slice(1), GOLD, () => { cfg.level = l; this.refresh() }, { size: 18 }))
    this.fightBtn = null
    button(this, 674, 348, 192, 30, 'Challenge players  ▸', '#5BE0FF', () => this.scene.start('Arena'), { size: 16 })
    // Look levels: 1 Cartoon, 2 Stickman, 3 Houses (all open while testing; later they unlock with game level)
    const lv = LOOK_LEVELS.find(l => l.key === getLook()) || LOOK_LEVELS[1]
    button(this, 596, 34, 120, 32, 'Collection', GOLD, () => this.scene.start('Collection', { pick: this.game.cfg.pick }), { size: 16 })
    button(this, 724, 34, 120, 32, `Look ${lv.level}: ${lv.name}`, '#9AA3AE', () => { setLook(LOOK_LEVELS[(LOOK_LEVELS.indexOf(lv) + 1) % LOOK_LEVELS.length].key); this.scene.restart() }, { size: 15 })
    this.refresh()
  }
  makePreview() {
    const cfg = this.game.cfg
    this.prev = makeFighter(squadDef(cfg.pick, this.sq, this), 170, 1); this.prev.side = 'p1'; this.prev.theme = NATURAL_HOUSE[this.prev.def.key]; this.prev.skin = skinFor(this, FIGHTERS[cfg.pick].key, this.sq)
    this.prevPose = makePose(this.prev, this.frame); this.demoT = 20
    attach3DPreview(this, { x: 10, y: 40, w: 320, h: 320 }, FIGHTERS[cfg.pick].colour, this.prev.skin)
  }
  choose(i) { if (this.changing) { this.sq.styles[this.changing] = this.origStyle; saveSquad(this.sq); this.changing = null } this.game.cfg.pick = i; this.makePreview(); this.refresh() }
  // style button: free to change until the squad is locked; then only with this season's Change Token
  styleTap() {
    const P = prog(this), key = FIGHTERS[this.game.cfg.pick].key
    if (!isLocked(P) || this.changing === key) { this.cycleStyle(); return }
    if (!tokenAvailable(P)) { this.cameras.main.shake(120, 0.004); this.toast('Style locked. Your next Change Token comes next season.'); return }
    if (!window.confirm(`Use this season's Change Token on ${FIGHTERS[this.game.cfg.pick].name}? Pick a new style, then tap "Use token". This resets ${FIGHTERS[this.game.cfg.pick].name}'s branch and style XP.`)) return
    this.changing = key; this.origStyle = this.sq.styles[key]; this.cycleStyle()
  }
  async confirmChange() {
    const key = this.changing, P = prog(this)
    if (this.sq.styles[key] === this.origStyle) { this.changing = null; this.refresh(); return }
    try { this.game.progress = await changeStyle(P, key, this.sq.styles[key]); this.changing = null; this.toast('Style changed. Change Token used for this season.'); this.makePreview(); this.refresh() }
    catch (e) { this.toast('Could not change style: ' + e.message) }
  }
  toast(msg) {
    const t = txt(this, W / 2, 140, msg, { fontFamily: BODY, fontStyle: '700', fontSize: '17px', color: '#F2F2F2', backgroundColor: '#000000cc', padding: { x: 12, y: 8 }, wordWrap: { width: 600 }, align: 'center' }).setOrigin(0.5)
    this.tweens.add({ targets: t, alpha: 0, delay: 2600, duration: 400, onComplete: () => t.destroy() })
  }
  cycleStyle() {
    const key = FIGHTERS[this.game.cfg.pick].key
    this.sq.styles[key] = STYLE_KEYS[(STYLE_KEYS.indexOf(this.sq.styles[key]) + 1) % STYLE_KEYS.length]
    if (this.sq.loadouts) delete this.sq.loadouts[key]
    saveSquad(this.sq); this.makePreview(); this.refresh()
  }
  toggleTeam() {
    const i = this.game.cfg.pick, at = this.sq.order.indexOf(i)
    if (at >= 0) this.sq.order.splice(at, 1)
    else if (this.sq.order.length < MAX_TEAM) this.sq.order.push(i)
    saveSquad(this.sq); this.refresh()
  }
  refresh() {
    const cfg = this.game.cfg, f = FIGHTERS[cfg.pick], def = squadDef(cfg.pick, this.sq, this), st = STYLES[def.style]
    const order = this.sq.order
    this.boxes.forEach((t, i) => {
      const on = i === cfg.pick, col = hex(t.def.colour), place = order.indexOf(i)
      t.g.clear(); t.g.fillStyle(on ? col : 0x12161b, on ? 0.25 : 0.92); t.g.fillRoundedRect(-27, -26, 54, 52, 7)
      t.g.lineStyle(on ? 3 : 1.5, on ? col : place >= 0 ? col : 0x2a3138, place >= 0 || on ? 1 : 0.8); t.g.strokeRoundedRect(-27, -26, 54, 52, 7)
      t.lvT.setText(`Lv ${fighterLevel(prog(this), t.def.key)}`)
      t.badge.clear(); t.num.setText(place >= 0 ? String(place + 1) : '')
      if (place >= 0) { t.badge.fillStyle(0xf5c542, 1); t.badge.fillCircle(22, -21, 9) }
      this.tweens.add({ targets: t, scale: on ? 1.08 : 1, duration: 120 })
    })
    this.name.setText(f.name).setColor(f.colour)
    const P = prog(this), locked = isLocked(P), changingThis = this.changing === f.key
    this.styleBtn.label.setText(changingThis ? `New style: ${st.name}  ▸` : `${locked ? '🔒 ' : ''}Style: ${st.name}  ▸`)
    const place = order.indexOf(cfg.pick)
    this.teamBtn.label.setText(changingThis ? 'Use token ✓' : place >= 0 ? `In team #${place + 1}  ✕` : order.length >= MAX_TEAM ? 'Team full' : '+ Add to team')
    this.teamBtn.setOn(changingThis || place >= 0)
    const b = branchOf(P, f.key), brDef = (BRANCHES[def.style] || []).find(x => x.key === b.branch)
    this.blurb.setText(st.blurb)
    this.special.setText(`Special: ${f.specialName}     Super: ${SUPER_NAME[f.special]}`).setColor(f.colour)
    this.summary.setText(`Level ${fighterLevel(P, f.key)}  ·  ${brDef ? `${brDef.name} tier ${b.tier}` : `No branch yet (${xpOf(P, f.key)} style XP)`}  ·  ${def.combos.length} combos equipped`)
    this.viewBtn.label.setColor(f.colour)
    this.lvlBtns.forEach((b, i) => b.setOn(['easy', 'medium', 'hard'][i] === cfg.level))
    if (this.cpuBtn) { this.cpuBtn.label.setText(this.cpuModes.find(m => m[0] === cfg.cpuMode)[1]); this.cpuBtn.setOn(cfg.cpuMode !== 'normal') }
    if (this.fightBtn) this.fightBtn.destroy()
    const lead = order.length ? FIGHTERS[order[0]].colour : '#5c6670'
    this.fightBtn = button(this, 674, 404, 192, 52, order.length ? (order.length > 1 ? `FIGHT ${order.length}v${order.length}!` : 'FIGHT!') : 'Add a fighter', lead, () => this.start(), { solid: !!order.length, size: order.length ? 30 : 22, r: 10 })
  }
  async start() {
    const cfg = this.game.cfg, order = this.sq.order
    if (!order.length) { this.cameras.main.shake(120, 0.004); return }
    if (this.changing) { this.toast('Finish changing the style first (Use token ✓).'); return }
    // first real fight: lock the squad's styles for good
    const P = prog(this)
    if (P.mode === 'db' && !P.locked_at) {
      const list = FIGHTERS.map(f => `${f.name}: ${STYLES[this.sq.styles[f.key]].name}`).join('\n')
      if (!window.confirm(`First real fight! Your fighters' styles will be locked in for good:\n\n${list}\n\nYou get one Change Token each season to change one style. Lock them in?`)) return
      try { this.game.progress = await lockSquad(P, { ...this.sq.styles }) } catch (e) { this.toast('Could not lock the squad: ' + e.message); return }
    }
    // CPU team: same size, random pillars and styles
    const pool = Phaser.Utils.Array.Shuffle([0, 1, 2, 3, 4])
    const team1 = order.map(p => ({ p, style: this.sq.styles[FIGHTERS[p].key], loadout: (this.sq.loadouts || {})[FIGHTERS[p].key], skin: skinFor(this, FIGHTERS[p].key, this.sq) }))
    saveDefence(prog(this), this.sq) // your defence team for player-vs-player = the squad you fight with
    const team2 = pool.slice(0, order.length).map(p => ({ p, style: Phaser.Utils.Array.GetRandom(STYLE_KEYS) }))
    sfx(this).resume?.()
    this.cameras.main.flash(160, 255, 255, 255)
    this.scene.start('Fight', { team1, team2, level: cfg.level, cpuMode: cfg.cpuMode || 'normal' })
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
    if (getLook() === '3d') return // the 3D preview draws the fighter
    this.fg.setScale(1.6).setPosition(-170 * 0.6, -330 * 0.6)
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
    const opp = data.opp
    const defs = (t, mine) => (t || []).map(x => {
      const key = FIGHTERS[x.p].key
      if (!mine && opp) { // another athlete's real squad: their combos, upgrades and branches
        return applyBranch(applyUpgrades(styledDef(FIGHTERS[x.p], x.style, x.loadout, (opp.collection || {}).combos || {}), (opp.upgrades || {})[key] || {}), (opp.branches || {})[key])
      }
      return applyBranch(applyUpgrades(styledDef(FIGHTERS[x.p], x.style, mine ? x.loadout : null, mine ? coll(this).combos : {}), mine ? (P.upgrades || {})[key] : cpuUp), mine ? branchOf(P, key) : cpuBranch(x.style, data.level))
    })
    this.m = new Match(defs(data.team1, true), defs(data.team2, false), data.level, data.opp ? 'normal' : (data.cpuMode || 'normal'), (bridge(this).playStyle && bridge(this).playStyle()) || getPlayStyle())
    for (const f of [...this.m.t1, ...this.m.t2]) f.theme = NATURAL_HOUSE[f.def.key]
    this.m.t1.forEach((f, i) => { f.skin = (data.team1 || [])[i]?.skin || 'standard' }) // your fighters' skins
    this.tagReq = null
    this.poses = { p1: makePose(this.m.p1, 0), p2: makePose(this.m.p2, 0) }
    this.acc = 0; this.slow = 1; this.shakeT = null
    this.world = []
    this.arenaObjs = buildArena(this)
    this.world.push(...this.arenaObjs)
    // Look 4: the fight is drawn in 3D behind this canvas (HUD, sparks and trails stay here on top)
    this.r3d = null
    // Boxer 2 always fights in 3D, from the three-quarter TV angle in a ring
    const ps0 = (bridge(this).playStyle && bridge(this).playStyle()) || getPlayStyle()
    this.broadcast = ps0 === 'boxer2'
    if (getLook() === '3d' || this.broadcast) {
      import('./render3d.js').then(mod => {
        if (!this.sys || !this.sys.isActive()) return
        this.r3d = new mod.Renderer3D(this.game, { view: this.broadcast ? 'broadcast' : 'side' })
        this.events.once('shutdown', () => { this.r3d && this.r3d.destroy(); this.r3d = null })
      }).catch(() => { this.r3d = null })
    }
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
    // combo guide: appears over your fighter once you start one of their combos
    this.guideG = u(this.add.graphics())
    this.guideTitle = u(txt(this, 0, 0, '', { fontFamily: BODY, fontStyle: '700', fontSize: '13px', color: '#F5C542', stroke: '#000', strokeThickness: 3 }).setOrigin(0.5, 1))
    this.guideToks = Array.from({ length: 6 }, () => u(txt(this, 0, 0, '', { fontFamily: BODY, fontStyle: '700', fontSize: '14px', stroke: '#000', strokeThickness: 3 }).setOrigin(0, 0.5)))
    this.guideA = 0
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
  // Boxer 2 (TV angle): where a point on the fighters' line appears on screen -- for the world layer (P) and
  // the HUD layer (PU). Side-on views use the point as it is.
  P(x, y) {
    if (!this.broadcast || !this.r3d || !this.r3d.ready) return { x, y }
    const n = this.r3d.ndc(x, y), wv = this.cameras.main.worldView
    return { x: wv.x + (n.x + 1) / 2 * wv.width, y: wv.y + (1 - n.y) / 2 * wv.height }
  }
  PU(x, y) {
    if (!this.broadcast || !this.r3d || !this.r3d.ready) return { x, y }
    const n = this.r3d.ndc(x, y)
    return { x: (n.x + 1) / 2 * W, y: (1 - n.y) / 2 * H }
  }
  dustAt(n, x, y) { const p = this.P(x, y); this.dustE().explode(n, p.x, p.y) }
  sparkAt(x, y, colour, size = 1, block = false) {
    ;({ x, y } = this.P(x, y))
    const e = this.emitter(block ? 0x8fd3ff : colour)
    e.sparks.explode(Math.round((block ? 6 : 12) * size), x, y)
    if (!block) e.shards.explode(Math.round(6 * size), x, y)
    const b = this.W(this.add.image(x, y, 'burst').setTint(block ? 0x8fd3ff : 0xffffff).setBlendMode('ADD').setScale(0.15 * size).setAngle(Math.random() * 360))
    this.tweens.add({ targets: b, scale: (block ? 0.45 : 0.75) * size, alpha: 0, duration: block ? 120 : 170, onComplete: () => b.destroy() })
    if (!block) {
      const b2 = this.W(this.add.image(x, y, 'burst').setTint(colour).setBlendMode('ADD').setScale(0.1 * size).setAngle(Math.random() * 360))
      this.tweens.add({ targets: b2, scale: 1.0 * size, alpha: 0, duration: 230, onComplete: () => b2.destroy() })
    }
    if (size >= 1.4) this.ringAt(x, y, colour, size, true)
  }
  ringAt(x, y, colour, size = 1, mapped = false) {
    if (!mapped) ({ x, y } = this.P(x, y))
    const r = this.W(this.add.image(x, y, 'ring').setTint(colour).setBlendMode('ADD').setScale(0.1).setAlpha(0.9))
    this.tweens.add({ targets: r, scale: 1.2 * size, alpha: 0, duration: 320, ease: 'Cubic.out', onComplete: () => r.destroy() })
  }
  popText(x, y, s, colour = GOLD, size = 30) {
    ;({ x, y } = this.PU(x, y))
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
      if (this.r3d) this.r3d.event(e)
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
          if (e.kind === 'quake') { this.shake(200, 5); this.dustAt(16, e.f.x + 20 * e.f.facing, FLOOR) }
          break
        }
        case 'super': this.superCutIn(e.f, e.name); break
        case 'refill': this.popText(e.f.x, e.f.y - 210, 'HEALTH REFILLED', '#5BE0FF', 20); break
        case 'guardBreak': this.popText(e.f.x, e.f.y - 210, 'GUARD BREAK!', '#FF8A1F', 28); this.ringAt(e.f.x, e.f.y - 90, 0xff8a1f, 1.3); this.shake(160, 6); sx.hit?.(true, false); break
        case 'flow': this.popText(e.f.x, e.f.y - 230, e.level >= FLOW_MAX ? 'FULL FLOW!' : `FLOW ×${e.level}`, '#5BE0FF', e.level >= FLOW_MAX ? 32 : 24); if (e.level >= FLOW_MAX) { this.ringAt(e.f.x, e.f.y - 80, 0x5be0ff, 1.4); sx.special?.() } break
        case 'secondWind': this.popText(e.f.x, e.f.y - 210, 'SECOND WIND!', '#5BE04A', 28); this.ringAt(e.f.x, e.f.y - 80, 0x5be04a, 1.2); sx.special?.(); break
        case 'projectile': this.spawnProjectile(e.pj); break
        case 'projectileGone': this.killProjectile(e.pj); break
        case 'jump': this.dustAt(6, e.f.x, FLOOR); break
        case 'land': this.dustAt(e.hard ? 22 : 8, e.f.x, FLOOR); sx.land?.(e.hard); if (e.hard) this.shake(200, 6); break
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
    this.sparkAt(pj.x, pj.y, hex(fxColour(pj.owner)), pj.big ? 1.4 : 0.8) // game position (sparkAt maps it for the TV angle)
    o.s.destroy(); o.core.destroy(); o.trail.stop(); this.time.delayedCall(400, () => o.trail.destroy())
    this.pjSprites.delete(pj.id)
  }

  // Boxer play style: which of this fighter's buttons a gesture means (so it follows their fighting style)
  gestureToken(g) {
    const mv = (this.m.p1.def.moves) || {}, find = ids => Object.keys(mv).find(k => ids.includes(mv[k]))
    if (g.low) return g.kind === 'up' || g.kind === 'across' ? 'hk' : g.side === 'L' ? 'lk' : 'mk' // lower part of the screen: kicks
    if (g.kind === 'tap') return g.side === 'L' ? 'lp' : 'mp'
    if (g.kind === 'across') return find(['hook', 'overhand', 'elbow']) || 'hp'
    if (g.kind === 'up') return find(['uppercut']) || 'hp'
    if (g.kind === 'down') return (g.side === 'L' ? find(['bodyjab']) : find(['bodyhook'])) || (g.side === 'L' ? 'lk' : 'mk')
    return null
  }
  getInput() {
    const b = bridge(this), inp = b.input || {}, pr = b.pressed || {}
    const c = { left: inp.left, right: inp.right, down: inp.down, upPressed: pr.up || !!inp.up, tag: pr.tag ? 'next' : this.tagReq, superPressed: pr.super, lpPressed: pr.lp, mpPressed: pr.mp, hpPressed: pr.hp, lkPressed: pr.lk, mkPressed: pr.mk, hkPressed: pr.hk, spPressed: pr.sp, block: !!inp.block }
    const m = this.m, f = m.p1
    // Boxer defence stick: held = guard; down = low guard; pull back = sway back out of range; push forward = lean in
    if (inp.defHeld) {
      const fwd = f.facing > 0 ? 'right' : 'left', back = fwd === 'right' ? 'left' : 'right'
      const sx = (inp.defX || 0) * (f.facing > 0 ? 1 : -1), dy = inp.defY || 0
      if (sx < -0.5) { c[back] = true; c.block = false }
      else if (sx > 0.5) { c[fwd] = true; c.block = false }
      else { c.block = true; if (dy > 0.5) c.down = true }
    }
    // COMBO button: the next technique starts an equipped combo that leads with it
    if (pr.comboArm) this.comboArmUntil = m.frame + 100
    // gestures (Boxer play style)
    const gq = b.gestures || []
    while (gq.length) {
      const tok = this.gestureToken(gq.shift())
      if (!tok) continue
      c[tok + 'Pressed'] = true
      if (this.comboArmUntil && m.frame <= this.comboArmUntil) {
        const combo = [...(f.def.combos || [])].filter(cb => cb.seq[0] === tok).sort((a, z) => z.seq.length - a.seq.length)[0]
        if (combo) { this.autoSeq = combo.seq.slice(1); this.autoAt = m.frame; this.popText(f.x, f.y - 236, combo.name.toUpperCase(), '#F5C542', 20) }
        this.comboArmUntil = 0
      }
      break // one gesture per step
    }
    // ...also works with the KR / SF buttons: arm COMBO, then press a technique
    if (this.comboArmUntil && m.frame <= this.comboArmUntil && !this.autoSeq) {
      const tok = ['lp', 'mp', 'hp', 'lk', 'mk', 'hk'].find(k => c[k + 'Pressed'])
      if (tok) { const combo = [...(f.def.combos || [])].filter(cb => cb.seq[0] === tok).sort((a, z) => z.seq.length - a.seq.length)[0]; if (combo) { this.autoSeq = combo.seq.slice(1); this.autoAt = m.frame; this.popText(f.x, f.y - 236, combo.name.toUpperCase(), '#F5C542', 20) } this.comboArmUntil = 0 }
    }
    // run the rest of an auto combo: next step as soon as the fighter can chain (or after a short beat)
    if (this.autoSeq && this.autoSeq.length && m.phase === 'fight') {
      const ready = (!f.move || f.t >= f.move.s + f.move.a) && m.frame - this.autoAt >= 6
      if (ready && f.state !== 'ko' && f.stun === 0) {
        const t = this.autoSeq.shift(); this.autoAt = m.frame
        if (t === 'd') c.down = true
        else if (t === 'f' || t === 'b') { const fwd = f.facing > 0 ? 'right' : 'left', back = fwd === 'right' ? 'left' : 'right'; c[t === 'f' ? fwd : back] = true }
        else c[t + 'Pressed'] = true
      }
      if (!this.autoSeq.length) this.autoSeq = null
    }
    if (f.state === 'ko' || f.stun > 0) this.autoSeq = null
    for (const k in pr) pr[k] = false
    this.tagReq = null
    return c
  }

  update(time, delta) {
    const m = this.m
    // game speed: play runs a little slower than real time (more so in the Boxer play style)
    const speed = isBoxerStyle(this.m.playStyle) ? 0.75 : 0.85
    this.acc += Math.min(100, delta) * this.slow * speed
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
      const pp = this.P(o.pj.x, o.pj.y + wob); o.s.setPosition(pp.x, pp.y); o.core.setPosition(pp.x, pp.y)
      o.s.rotation += 0.2
    }
    // fighters: the one attacking is drawn in front
    const g = this.fg; g.clear()
    const order = m.p2.move && !m.p1.move ? ['p1', 'p2'] : ['p2', 'p1']
    const three = this.r3d && this.r3d.ready
    for (const o of this.arenaObjs) o.setVisible(!three)
    if (three) {
      // 2D: only the swoosh trails; 3D draws arena + fighters, following this camera's KO zoom and shake
      const cam = this.cameras.main, sh = cam.shakeEffect && cam.shakeEffect.isRunning ? cam.shakeEffect : null
      if (this.broadcast) this.r3d.broadcastCam(m, sh ? (sh._offsetX || 0) / cam.zoom : 0, sh ? (sh._offsetY || 0) / cam.zoom : 0) // Boxer 2: TV angle (no side-on trails)
      else {
        for (const k of order) drawFighter(g, m[k], this.poses[k], m.frame, alpha, { swooshOnly: true })
        this.r3d.setView(cam.midPoint.x, cam.midPoint.y, cam.zoom / Z, sh ? (sh._offsetX || 0) / cam.zoom : 0, sh ? (sh._offsetY || 0) / cam.zoom : 0)
      }
      this.r3d.update(m, this.poses)
      this.drawHud()
      return
    }
    for (const k of order) {
      const f = m[k]
      const jitter = m.freeze > 0 && this.hitstopDef === f ? (m.frame % 2 ? 2 : -2) * (m.freeze % 2 ? 1 : -1) : 0
      drawFighter(g, f, this.poses[k], m.frame, alpha, { x: f.x + jitter })
    }
    this.drawHud()
  }

  // which strike a combo step means for this fighter, and how to throw it
  stepLabel(def, t) {
    const DIR = { f: 'FORWARD', b: 'STEP BACK', d: 'DUCK', sp: 'SPECIAL', super: 'SUPER' }
    if (DIR[t]) return { name: DIR[t], how: '' }
    const id = (def.moves && def.moves[t]) || t, mv = MOVES[id]
    if (this.m && this.m.playStyle === 'sf') return { name: (mv && mv.name ? mv.name : id).toUpperCase(), how: SF_BUTTON[t] || '' } // SF: the button to press
    return { name: (mv && mv.name ? mv.name : id).toUpperCase(), how: t[0] === 'l' ? 'tap' : t[0] === 'm' ? 'hold' : 'long hold' }
  }
  drawGuide() {
    const m = this.m, f = m.p1, prog = m.phase === 'fight' && f.state !== 'ko' ? f.comboProg : null
    this.guideA += ((prog ? 1 : 0) - this.guideA) * 0.25
    const a = this.guideA, g = this.guideG
    g.clear()
    if (a < 0.03 || !(prog || this.lastGuide)) { this.guideTitle.setAlpha(0); this.guideToks.forEach(t => t.setAlpha(0)); return }
    const p = prog || this.lastGuide; this.lastGuide = prog || this.lastGuide
    const seq = p.combo.seq, pulse = 0.65 + 0.35 * Math.sin(this.time.now / 120)
    // lay the steps out left to right
    let x = 0; const parts = []
    seq.forEach((t, i) => {
      const L = this.stepLabel(f.def, t), done = i < p.done, next = i === p.done
      const label = (done ? '✓ ' : '') + L.name + (next && L.how ? ` (${L.how})` : '') + (i < seq.length - 1 ? '  →' : '')
      const tt = this.guideToks[i]
      setT(tt, label, done ? '#5BE07A' : next ? '#F5C542' : '#9AA3AE') // only re-renders text when it changes
      parts.push({ tt, w: tt.width + 6 }); x += tt.width + 6
    })
    for (let i = seq.length; i < this.guideToks.length; i++) this.guideToks[i].setAlpha(0)
    const gp = this.PU(f.x, f.y - 205) // above the fighter (follows the TV angle in Boxer 2)
    const total = x, cx = Phaser.Math.Clamp(gp.x, total / 2 + 12, W - total / 2 - 12), y = Math.max(150, gp.y)
    g.fillStyle(0x05070a, 0.72 * a); g.fillRoundedRect(cx - total / 2 - 10, y - 30, total + 20, 44, 8)
    g.lineStyle(1.5, 0xf5c542, 0.6 * a); g.strokeRoundedRect(cx - total / 2 - 10, y - 30, total + 20, 44, 8)
    setT(this.guideTitle, p.combo.name); this.guideTitle.setPosition(cx, y - 12).setAlpha(a)
    let px = cx - total / 2
    parts.forEach(({ tt, w }, i) => { tt.setPosition(px, y + 2).setAlpha(a * (i === p.done ? pulse : 1)); px += w })
  }

  drawHud() {
    this.drawGuide()
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
      // FLOW pips (10)
      const fl = f.flow || 0
      for (let i = 0; i < FLOW_MAX; i++) { const px = right ? mx - 12 - i * 9 : mx + mw + 6 + i * 9; g.fillStyle(i < fl ? (fl >= FLOW_MAX ? 0xffffff : 0x5be0ff) : 0x1c222a, 1); g.fillRect(px, 74, 6, 8) }
    }
    bar(20, m.p1, false, this.lag.p1); bar(W - 350, m.p2, true, this.lag.p2)
    // timer
    g.fillStyle(0x0b0e12, 0.85); g.fillRoundedRect(W / 2 - 34, 10, 68, 46, 8); g.lineStyle(2, 0xf5c542, 0.7); g.strokeRoundedRect(W / 2 - 34, 10, 68, 46, 8)
    const secs = Math.max(0, Math.ceil(m.timer / 60))
    setT(this.n1, `${m.p1.def.name} · ${m.p1.def.styleName}`); setT(this.n2, `${m.p2.def.name} · ${m.p2.def.styleName} (${this.data0 && this.data0.opp ? String(this.data0.opp.name || '').replace(/^Practice · /, '') : 'CPU'})`)
    if (m.practice) { setT(this.timerT, '∞', '#5BE0FF'); if (!this.practiceT) this.practiceT = this.U(txt(this, W / 2, 58, `PRACTICE · CPU ${({ still: 'still', block: 'blocks everything', jab: 'jab only' })[m.cpuMode]}`, { fontFamily: BODY, fontStyle: '700', fontSize: '12px', color: '#5BE0FF', stroke: '#000', strokeThickness: 3 }).setOrigin(0.5, 0)) } else
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
    const oppName = data.opp ? String(data.opp.name || 'Opponent').replace(/^Practice · /, '') : 'CPU'
    const head = txt(this, 560, 70, youWon ? 'YOU WIN!' : `${oppName.toUpperCase()} WINS`, { fontSize: oppName.length > 8 ? '58px' : '76px', color: youWon ? '#22B14C' : RED, stroke: '#000', strokeThickness: 8 }).setOrigin(0.5)
    head.setShadow(0, 0, youWon ? '#22B14C' : RED, 18, true, true)
    head.setScale(2).setAlpha(0); this.tweens.add({ targets: head, scale: 1, alpha: 1, duration: 380, ease: 'Back.out' })
    txt(this, 560, 122, team ? `Knock-outs  ${kos[0]}–${kos[1]}` : `${wDef.name} · ${wDef.styleName || ''} wins`, { fontFamily: BODY, fontStyle: '700', fontSize: '22px', color: '#C9CED6' }).setOrigin(0.5)
    // stats table
    const s1 = data.stats.p1, s2 = data.stats.p2
    const rows = [['Hits landed', s1.hits, s2.hits], ['Best combo', s1.bestCombo, s2.bestCombo], ['Damage dealt', Math.round(s1.dmg), Math.round(s2.dmg)], ['Attacks blocked', s1.blocked, s2.blocked], ['Specials', s1.specials, s2.specials], ['Supers', s1.supers, s2.supers]]
    const g = this.add.graphics()
    g.fillStyle(0x0b0e12, 0.85); g.fillRoundedRect(380, 150, 360, 196, 10); g.lineStyle(1.5, 0x2a3138, 1); g.strokeRoundedRect(380, 150, 360, 196, 10)
    txt(this, 630, 158, 'You', { fontFamily: BODY, fontStyle: '700', fontSize: '17px', color: FIGHTERS[data.team1[0].p].colour }).setOrigin(0.5, 0)
    txt(this, 705, 158, oppName.split(' ')[0].slice(0, 8), { fontFamily: BODY, fontStyle: '700', fontSize: '17px', color: FIGHTERS[data.team2[0].p].colour }).setOrigin(0.5, 0)
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
    // style XP for each fighter in the team (unlocks branch tiers)
    if (!data.xpDone) {
      data.xpDone = true
      awardXp(prog(this), (data.team1 || []).map(t => FIGHTERS[t.p].key), youWon).then(p => { this.game.progress = p })
      txt(this, 560, 132, `+${youWon ? 40 : 20} style XP for each fighter`, { fontFamily: BODY, fontStyle: '700', fontSize: '13px', color: '#5BE0FF' }).setOrigin(0.5, 0)
    }
    if (data.opp && !data.dropDone) { data.dropDone = true; this.pvpReward(data, youWon) }
    // end of match: win streak + drops (a combo card for one of your team's styles, and/or a graphic card)
    if (!data.dropDone) {
      data.dropDone = true
      const C = coll(this), streakAfter = youWon ? (C.streak || 0) + 1 : 0
      const drops = []
      const comboId = rollComboDrop((data.team1 || []).map(t => t.style), data.level, youWon); if (comboId) drops.push({ kind: 'combo', id: comboId })
      const cardId = rollCardDrop(youWon, data.level, streakAfter); if (cardId) drops.push({ kind: 'card', id: cardId })
      recordMatch(prog(this), C, youWon, drops).then(({ progress, coll: nc, results }) => {
        if (!this.sys || !this.sys.isActive()) return
        this.game.progress = progress; this.game.collection = nc
        if (youWon && streakAfter >= 2) txt(this, 190, 48, `${streakAfter} wins in a row${streakAfter % 3 === 2 ? ' · next win: guaranteed card' : ''}`, { fontFamily: BODY, fontStyle: '700', fontSize: '14px', color: '#5BE0FF', stroke: '#000', strokeThickness: 3 }).setOrigin(0.5, 0)
        results.forEach((r, i) => {
          const isCard = r.kind === 'card', item = isCard ? CARD_BY_ID[r.id] : COMBO_BY_ID[r.id]
          if (!item) return
          const col = isCard ? CARD_RARITY[item.rarity].colour : RARITY[item.rarity].colour
          const who = isCard ? FIGHTERS.find(f => f.key === item.fighter).name + ' · ' : ''
          const label = `${r.isNew ? (isCard ? 'NEW CARD' : 'NEW COMBO CARD') : (isCard ? 'CARD LEVELLED UP' : 'COMBO LEVELLED UP')}\n${who}${item.name}${r.isNew ? '' : '  ' + '★'.repeat(r.level - 1)}\n${isCard ? CARD_RARITY[item.rarity].name : RARITY[item.rarity].name + ' · ' + STYLES[item.styles[0]].name}`
          const t = txt(this, 190, 70 + i * 78, label, { fontFamily: BODY, fontStyle: '700', fontSize: '17px', color: col, align: 'center', stroke: '#000', strokeThickness: 4 }).setOrigin(0.5, 0)
          t.setScale(0.3); this.tweens.add({ targets: t, scale: 1, duration: 300, delay: i * 250, ease: 'Back.out' })
        })
        if (results.length) sfx(this).special?.()
      })
    }
    sfx(this).cheer?.(youWon ? 1.5 : 0.6)
    sfx(this).say?.(youWon ? 'You win' : 'You lose', 0.5)
  }
  rematch() { this.scene.start('Fight', { team1: this.d.team1, team2: this.d.team2, level: this.d.level, opp: this.d.opp }) }
  // player vs player: after a win, copy ONE of their cards / combo cards (they keep theirs)
  pvpReward(data, won) {
    const opp = data.opp, C = coll(this)
    const done = (msg, col = '#C9CED6') => { if (this.sys && this.sys.isActive()) this.pvpT = txt(this, 190, 62, msg, { fontFamily: BODY, fontStyle: '700', fontSize: '15px', color: col, align: 'center', stroke: '#000', strokeThickness: 3, wordWrap: { width: 330 } }).setOrigin(0.5, 0) }
    const record = pick => pvpResult(prog(this), coll(this), opp, won, pick).then(({ progress, coll: nc, reward }) => { this.game.progress = progress; this.game.collection = nc; return reward })
    if (!won) { record(null); done(`${opp.name} wins this one. Challenge again from the Arena.`); return }
    const choices = opp.rewarded_today ? [] : rewardChoices(opp, C)
    if (!choices.length) { record(null); done(opp.rewarded_today ? `You beat ${opp.name}! (Reward already taken from them today.)` : `You beat ${opp.name}! Nothing new to copy from them.`, '#5BE07A'); return }
    let recorded = false
    const ui = []
    ui.push(txt(this, 190, 56, `You beat ${opp.name}! Copy one of theirs (they keep it):`, { fontFamily: BODY, fontStyle: '700', fontSize: '14px', color: '#5BE07A', align: 'center', stroke: '#000', strokeThickness: 3, wordWrap: { width: 340 } }).setOrigin(0.5, 0))
    choices.forEach((c, i) => {
      const isCard = c.kind === 'card', item = isCard ? CARD_BY_ID[c.id] : COMBO_BY_ID[c.id]
      const label = isCard ? `${FIGHTERS.find(f => f.key === item.fighter).name} · ${item.name}` : item.name
      const col = isCard ? CARD_RARITY[item.rarity].colour : RARITY[item.rarity].colour
      const b = button(this, 190, 104 + i * 40, 330, 34, `${label}  ·  ${isCard ? 'card' : 'combo'}${c.have ? '  (★ up)' : '  (new)'}`, col, async () => {
        if (recorded) return; recorded = true
        ui.forEach(o => o.destroy())
        const reward = await record({ kind: c.kind, id: c.id })
        done(reward ? `Copied ${label}! ${opp.name} keeps theirs.` : 'Could not copy that one (daily limit?).', reward ? col : '#E24B4A')
        sfx(this).special?.()
      }, { size: 13 })
      ui.push(b)
    })
    // leaving without choosing still records the win
    this.events.once('shutdown', () => { if (!recorded) { recorded = true; record(null) } })
  }
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


// ---------------- Upgrade: one fighter at a time -- five groups on the left, that group's areas on the right ----------------
export class UpgradeScene extends Phaser.Scene {
  constructor() { super('Upgrade') }
  create(data) {
    setupCam(this); bridge(this).onScene?.('upgrade')
    buildArena(this, { dim: 0.88 })
    this.pick = data?.pick ?? 0; this.group = data?.group || 'Technical'; this.busy = false
    const n = FIGHTERS.length
    // header: fighter + level, prev / next, back
    this.title = txt(this, 20, 6, '', { fontSize: '34px', stroke: '#000', strokeThickness: 6 })
    this.sub = txt(this, 22, 46, '', { fontFamily: BODY, fontStyle: '700', fontSize: '14px', color: '#C9CED6' })
    button(this, 600, 30, 44, 36, '◀', '#F2F2F2', () => { this.pick = (this.pick + n - 1) % n; this.refresh() }, { size: 18 })
    button(this, 652, 30, 44, 36, '▶', '#F2F2F2', () => { this.pick = (this.pick + 1) % n; this.refresh() }, { size: 18 })
    button(this, 738, 30, 84, 36, 'Back', '#F2F2F2', () => this.scene.start('Fighter', { pick: this.pick }), { size: 20 })
    // gem wallet
    this.gemG = this.add.graphics()
    this.gemT = PILLARS.map((k, i) => txt(this, 322 + i * 52, 52, '', { fontFamily: BODY, fontStyle: '700', fontSize: '16px', color: FIGHTERS.find(f => f.key === k).colour }))
    this.wildT = txt(this, 322 + 5 * 52, 52, '', { fontFamily: BODY, fontStyle: '700', fontSize: '16px', color: '#F2F2F2' })
    // left: the five groups
    this.groups = AREA_GROUPS.map((gname, i) => {
      const y = 82 + i * 68
      const bg = this.add.graphics(), bar = this.add.graphics()
      const t = txt(this, 28, y + 6, gname, { fontSize: '19px' })
      const v = txt(this, 186, y + 9, '', { fontFamily: BODY, fontStyle: '700', fontSize: '13px', color: '#C9CED6' }).setOrigin(1, 0)
      const z = this.add.zone(16, y, 180, 60).setOrigin(0).setInteractive()
      z.on('pointerdown', () => { sfx(this).ui?.(); this.group = gname; this.refresh() })
      return { gname, y, bg, bar, t, v }
    })
    // right: area cards, 3 columns
    this.cards = Array.from({ length: 15 }, (_, i) => {
      const x = 208 + (i % 3) * 194, y = 82 + Math.floor(i / 3) * 66
      const bg = this.add.graphics(), pips = this.add.graphics(), gem = this.add.graphics()
      const name = txt(this, x + 7, y + 3, '', { fontSize: '14px' })
      const what = txt(this, x + 7, y + 22, '', { fontFamily: BODY, fontStyle: '600', fontSize: '10.5px', color: '#9AA3AE', wordWrap: { width: 128 } })
      const btn = button(this, x + 164, y + 30, 42, 52, '', GOLD, () => { const a = this.cards[i].area; if (a) this.buy(a.key) }, { size: 16 })
      return { x, y, bg, pips, gem, name, what, btn, area: null }
    })
    if (prog(this).mode === 'test') button(this, 734, 436, 92, 24, 'Reset all', RED, () => { this.game.progress = resetTest(prog(this)); sfx(this).ui?.(); this.refresh() }, { size: 14 })
    this.note = txt(this, 16, 449, '', { fontFamily: BODY, fontStyle: '600', fontSize: '11px', color: '#7d8691' }).setOrigin(0, 1)
    this.refresh()
  }
  refresh() {
    const P = prog(this), f = FIGHTERS[this.pick], col = hex(f.colour)
    if (this.game.cfg) this.game.cfg.pick = this.pick
    const maxHp = applyUpgrades({}, (P.upgrades || {})[f.key]).maxHp
    this.title.setText(`${f.name}  ·  UPGRADE`).setColor(f.colour)
    this.sub.setText(`Level ${fighterLevel(P, f.key)} / ${AREAS.length * MAX_LV}   ·   Health ${maxHp}`)
    // wallet
    const g = this.gemG; g.clear()
    const show = v => P.mode === 'test' ? '∞' : String(Math.max(0, v))
    PILLARS.forEach((k, i) => { gemIcon(g, 312 + i * 52, 62, 8, hex(FIGHTERS.find(x => x.key === k).colour)); this.gemT[i].setText(show(available(P, k))) })
    gemIcon(g, 312 + 5 * 52, 62, 8, 0xffffff); this.wildT.setText(show(wild(P)))
    // groups
    for (const gr of this.groups) {
      const areas = AREAS.filter(a => a.g === gr.gname), have = areas.reduce((t, a) => t + levelOf(P, f.key, a.key), 0), max = areas.length * MAX_LV
      const on = gr.gname === this.group, gc = hex(FIGHTERS.find(x => x.key === gr.gname.toLowerCase())?.colour || '#9AA3AE')
      gr.bg.clear(); gr.bg.fillStyle(on ? gc : 0x10141a, on ? 0.22 : 0.95); gr.bg.fillRoundedRect(16, gr.y, 180, 60, 8)
      gr.bg.lineStyle(on ? 3 : 1.5, on ? gc : 0x262d36, 1); gr.bg.strokeRoundedRect(16, gr.y, 180, 60, 8)
      gr.t.setColor(on ? '#F2F2F2' : '#C9CED6'); gr.v.setText(`${have} / ${max}`)
      gr.bar.clear(); gr.bar.fillStyle(0x2a3138, 1); gr.bar.fillRect(28, gr.y + 40, 156, 7); gr.bar.fillStyle(gc, 1); gr.bar.fillRect(28, gr.y + 40, 156 * have / max, 7)
    }
    // cards
    const areas = AREAS.filter(a => a.g === this.group)
    this.cards.forEach((c, i) => {
      const a = areas[i]; c.area = a || null
      c.bg.clear(); c.pips.clear(); c.gem.clear()
      for (const o of [c.name, c.what, c.btn]) o.setVisible(!!a)
      if (!a) return
      const lv = levelOf(P, f.key, a.key), price = priceFor(P, f.key, a.key), maxed = lv >= MAX_LV
      c.bg.fillStyle(0x10141a, 0.95); c.bg.fillRoundedRect(c.x, c.y, 188, 60, 8)
      c.bg.lineStyle(1.5, maxed ? 0xf5c542 : lv > 0 ? col : 0x262d36, 1); c.bg.strokeRoundedRect(c.x, c.y, 188, 60, 8)
      c.name.setText(a.name).setColor(lv > 0 ? f.colour : '#F2F2F2').setFontSize(a.name.length > 15 ? '12px' : '14px')
      c.what.setText(a.what)
      for (let k = 0; k < MAX_LV; k++) { c.pips.fillStyle(k < lv ? col : 0x2a3138, 1); c.pips.fillRoundedRect(c.x + 7 + k * 14, c.y + 48, 11, 6, 2) }
      if (maxed) { c.btn.label.setText('MAX').setColor('#F5C542').setY(0).setFontSize('13px'); c.btn.setOn(true) }
      else {
        c.btn.label.setText(String(costOf(lv))).setColor(price ? '#F2F2F2' : '#5c6670').setY(8).setFontSize('16px'); c.btn.setOn(!!price)
        gemIcon(c.gem, c.x + 164, c.y + 20, 7, price && price.fromWild && !price.fromColour ? 0xffffff : col)
      }
    })
    if (P.mode === 'test') this.note.setText('TEST MODE: unlimited gems, saved on this device only (open the app with ?krtest=0 to turn off).').setColor('#F5C542')
    else this.note.setText(`${P.mode === 'db' ? 'Saved to your profile.' : 'Saved on this device.'}  Gems: training in each pillar (its colour), house points (white, any fighter), wins (up to ${DAILY_GEMS} a day).`).setColor('#7d8691')
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
      if (c) { const ring = this.add.image(c.x + 94, c.y + 30, 'ring').setTint(hex(f.colour)).setBlendMode('ADD').setScale(0.1); this.tweens.add({ targets: ring, scale: 1.1, alpha: 0, duration: 320, onComplete: () => ring.destroy() }) }
    } catch (e) { this.cameras.main.shake(140, 0.005) }
    this.busy = false
    this.refresh()
  }
}

// ---------------- Combos: choose each fighter's loadout from the combos you own ----------------
export class CombosScene extends Phaser.Scene {
  constructor() { super('Combos') }
  create(data) {
    setupCam(this); bridge(this).onScene?.('combos')
    buildArena(this, { dim: 0.86 })
    this.pick = data?.pick ?? 0
    this.sq = loadSquad()
    const f = FIGHTERS[this.pick], style = this.sq.styles[f.key]
    txt(this, 24, 10, 'COMBOS', { fontSize: '40px', color: GOLD, stroke: '#000', strokeThickness: 6 })
    txt(this, 214, 24, `${f.name} · ${STYLES[style].name}`, { fontSize: '24px', color: f.colour })
    button(this, 748, 32, 84, 36, 'Back', '#F2F2F2', () => this.scene.start('Fighter', { pick: this.pick }), { size: 20 })
    this.countT = txt(this, 24, 64, '', { fontFamily: BODY, fontStyle: '700', fontSize: '16px', color: '#C9CED6' })
    txt(this, 776, 64, 'Tap a combo you own to equip or remove it', { fontFamily: BODY, fontStyle: '600', fontSize: '14px', color: '#9AA3AE' }).setOrigin(1, 0)
    this.list = combosForStyle(style)
    this.cards = this.list.map((c, i) => {
      const x = 22 + (i % 2) * 382, y = 92 + Math.floor(i / 2) * 66
      const bg = this.add.graphics()
      const name = txt(this, x + 12, y + 6, '', { fontSize: '19px' })
      const seq = txt(this, x + 12, y + 32, comboLabel(c.seq), { fontFamily: BODY, fontStyle: '700', fontSize: '15px', color: '#C9CED6' })
      const tag = txt(this, x + 364, y + 8, '', { fontFamily: BODY, fontStyle: '700', fontSize: '13px' }).setOrigin(1, 0)
      const eq = txt(this, x + 364, y + 32, '', { fontFamily: BODY, fontStyle: '700', fontSize: '14px', color: '#0A0A0A' }).setOrigin(1, 0)
      const zone = this.add.zone(x, y, 372, 58).setOrigin(0).setInteractive()
      zone.on('pointerdown', () => this.toggle(c.id))
      return { c, x, y, bg, name, seq, tag, eq }
    })
    txt(this, 22, 362, 'FLOW: land strikes in a natural order (jab → cross → hook, low kick → hook…) to build the flow meter for more damage and super. A clumsy order or a pause resets it; block then counter keeps it going.', { fontFamily: BODY, fontStyle: '600', fontSize: '13px', color: '#5BE0FF', wordWrap: { width: 756 } })
    txt(this, 22, 404, 'Commons are yours from the start. Rare and Epic combo cards drop from wins; a duplicate card levels a combo up (★ = +5% bonus).', { fontFamily: BODY, fontStyle: '600', fontSize: '13px', color: '#9AA3AE', wordWrap: { width: 756 } })
    this.refresh()
  }
  loadout() {
    const f = FIGHTERS[this.pick], style = this.sq.styles[f.key]
    const cur = (this.sq.loadouts || {})[f.key]
    return (cur && cur.length ? cur : defaultLoadout(style)).filter(id => COMBO_BY_ID[id] && COMBO_BY_ID[id].styles.includes(style))
  }
  toggle(id) {
    const C = coll(this)
    if (!ownsCombo(C, id)) { this.cameras.main.shake(100, 0.003); return }
    const f = FIGHTERS[this.pick]
    let lo = [...this.loadout()]
    if (lo.includes(id)) lo = lo.filter(x => x !== id)
    else if (lo.length < LOADOUT_SIZE) lo.push(id)
    else { this.cameras.main.shake(100, 0.003); return }
    this.sq.loadouts = { ...(this.sq.loadouts || {}), [f.key]: lo }
    saveSquad(this.sq); sfx(this).ui?.(); this.refresh()
  }
  refresh() {
    const C = coll(this), lo = this.loadout(), f = FIGHTERS[this.pick]
    this.countT.setText(`Equipped ${lo.length} / ${LOADOUT_SIZE}   ·   Owned ${this.list.filter(c => ownsCombo(C, c.id)).length} / ${this.list.length}`)
    for (const k of this.cards) {
      const own = ownsCombo(C, k.c.id), lv = C.combos[k.c.id] || 0, slot = lo.indexOf(k.c.id), rc = RARITY[k.c.rarity]
      k.bg.clear()
      k.bg.fillStyle(slot >= 0 ? hex(f.colour) : 0x10141a, slot >= 0 ? 0.22 : 0.95); k.bg.fillRoundedRect(k.x, k.y, 372, 58, 8)
      k.bg.lineStyle(slot >= 0 ? 3 : 1.5, own ? hex(rc.colour) : 0x262d36, own ? 1 : 0.7); k.bg.strokeRoundedRect(k.x, k.y, 372, 58, 8)
      k.name.setText(own ? k.c.name + (lv > 1 ? '  ' + '★'.repeat(lv - 1) : '') : '???  ' + k.c.name).setColor(own ? '#F2F2F2' : '#5c6670')
      k.seq.setAlpha(own ? 1 : 0.4)
      k.tag.setText(rc.name.toUpperCase()).setColor(rc.colour)
      if (slot >= 0) { k.eq.setText(`EQUIPPED ${slot + 1}`); k.bg.fillStyle(0xf5c542, 1); k.bg.fillRoundedRect(k.x + 268, k.y + 31, 100, 20, 4) }
      else k.eq.setText(own ? '' : 'LOCKED').setColor(own ? '#0A0A0A' : '#5c6670')
      if (slot < 0 && !own) k.eq.setColor('#5c6670')
      else k.eq.setColor('#0A0A0A')
    }
  }
}

// ---------------- Branch: develop a fighter's style down one of three branches ----------------
export class BranchScene extends Phaser.Scene {
  constructor() { super('Branch') }
  create(data) {
    setupCam(this); bridge(this).onScene?.('branch')
    buildArena(this, { dim: 0.86 })
    this.pick = data?.pick ?? 0; this.busy = false
    const f = FIGHTERS[this.pick], sq = loadSquad(), style = sq.styles[f.key]
    this.f = f; this.style = style
    txt(this, 24, 10, 'BRANCH', { fontSize: '40px', color: GOLD, stroke: '#000', strokeThickness: 6 })
    txt(this, 222, 22, `${f.name} · ${STYLES[style].name}`, { fontSize: '24px', color: f.colour })
    button(this, 748, 32, 84, 36, 'Back', '#F2F2F2', () => this.scene.start('Fighter', { pick: this.pick }), { size: 20 })
    this.xpG = this.add.graphics()
    this.xpT = txt(this, 24, 60, '', { fontFamily: BODY, fontStyle: '700', fontSize: '15px', color: '#5BE0FF' })
    this.gemT = txt(this, 776, 60, '', { fontFamily: BODY, fontStyle: '700', fontSize: '15px', color: f.colour }).setOrigin(1, 0)
    this.cols = (BRANCHES[style] || []).map((br, ci) => {
      const x = 20 + ci * 256
      const head = txt(this, x + 8, 98, br.name, { fontSize: '20px' })
      const blurb = txt(this, x + 8, 122, br.blurb, { fontFamily: BODY, fontStyle: '600', fontSize: '11.5px', color: '#9AA3AE', fixedWidth: 236 })
      const cards = br.tiers.map((t, ti) => {
        const y = 146 + ti * 78
        const bg = this.add.graphics()
        const name = txt(this, x + 8, y + 5, `${ti + 1}. ${t.name}`, { fontSize: '15px' })
        const what = txt(this, x + 8, y + 26, t.what, { fontFamily: BODY, fontStyle: '600', fontSize: '11.5px', color: '#C9CED6', wordWrap: { width: 232 } })
        const xpBtn = button(this, x + 64, y + 58, 112, 22, '', '#5BE0FF', () => this.unlock(br.key, false), { size: 13 })
        const gemBtn = button(this, x + 188, y + 58, 100, 22, '', f.colour, () => this.unlock(br.key, true), { size: 13 })
        return { t, ti, y, bg, name, what, xpBtn, gemBtn }
      })
      return { br, x, head, blurb, cards }
    })
    txt(this, 20, 384, `Unlock tiers with style XP from fighting (${TIER_XP.join(' / ')} XP: +40 a win, +20 a loss) or buy them with ${f.name.toLowerCase()} gems (${TIER_GEMS.join(' / ')}; wild gems top up). Your branch is chosen at tier 1 and stays until this fighter's style changes (Change Token, one per season). Tier 3 adds a signature combo as a 5th combo.`,
      { fontFamily: BODY, fontStyle: '600', fontSize: '12px', color: '#9AA3AE', wordWrap: { width: 760 } })
    this.refresh()
  }
  refresh() {
    const P = prog(this), f = this.f, b = branchOf(P, f.key), xp = xpOf(P, f.key), nt = nextTier(P, f.key), col = hex(f.colour)
    // XP bar with the three tier marks
    const g = this.xpG; g.clear()
    const bx = 24, bw = 470, by = 82, max = TIER_XP[2]
    g.fillStyle(0x1c222a, 1); g.fillRect(bx, by, bw, 6); g.fillStyle(0x5be0ff, 1); g.fillRect(bx, by, bw * Math.min(1, xp / max), 6)
    TIER_XP.forEach(v => { g.fillStyle(0xffffff, 0.8); g.fillRect(bx + bw * v / max - 1, by - 3, 2, 12) })
    this.xpT.setText(P.mode === 'test' ? 'Style XP: test mode (all tiers open)' : `Style XP ${xp}${nt ? `  ·  tier ${nt.tier} at ${TIER_XP[nt.tier - 1]}` : '  ·  all tiers unlocked'}`)
    this.gemT.setText(P.mode === 'test' ? 'Gems: ∞' : `${f.name.toLowerCase()} gems ${Math.max(0, available(P, f.key))} · wild ${Math.max(0, wild(P))}`)
    for (const c of this.cols) {
      const chosen = b.branch === c.br.key, other = !!b.branch && !chosen
      c.head.setColor(chosen ? f.colour : other ? '#5c6670' : '#F2F2F2')
      for (const k of c.cards) {
        const tierNo = k.ti + 1, owned = chosen && b.tier >= tierNo, isNext = nt && nt.tier === tierNo && (chosen || (!b.branch && tierNo === 1))
        k.bg.clear()
        k.bg.fillStyle(owned ? col : 0x10141a, owned ? 0.22 : 0.95); k.bg.fillRoundedRect(c.x, k.y, 244, 72, 8)
        k.bg.lineStyle(owned ? 2.5 : 1.5, owned ? col : isNext ? 0xf5c542 : 0x262d36, other ? 0.4 : 1); k.bg.strokeRoundedRect(c.x, k.y, 244, 72, 8)
        k.name.setColor(owned ? f.colour : other ? '#5c6670' : '#F2F2F2'); k.what.setAlpha(other ? 0.45 : 1)
        const showBtns = isNext && !other
        k.xpBtn.setVisible(showBtns); k.gemBtn.setVisible(showBtns)
        if (showBtns) {
          k.xpBtn.label.setText(nt.byXp ? 'Unlock (XP)' : `Need ${TIER_XP[tierNo - 1]} XP`).setColor(nt.byXp ? '#5BE0FF' : '#5c6670'); k.xpBtn.setOn(nt.byXp)
          k.gemBtn.label.setText(P.mode === 'test' ? 'Buy ◆ free' : `Buy ◆ ${TIER_GEMS[tierNo - 1]}`).setColor(nt.gemPrice ? '#F2F2F2' : '#5c6670'); k.gemBtn.setOn(!!nt.gemPrice)
        }
        if (owned) k.name.setText(`${tierNo}. ${k.t.name}  ✓`)
        else k.name.setText(`${tierNo}. ${k.t.name}`)
      }
    }
  }
  async unlock(branchKey, useGems) {
    if (this.busy) return
    const P = prog(this), b = branchOf(P, this.f.key)
    if (!b.branch && !window.confirm(`Choose the ${(BRANCHES[this.style] || []).find(x => x.key === branchKey).name} branch for ${this.f.name}? It stays until this fighter's style changes.`)) return
    this.busy = true
    try {
      this.game.progress = await unlockTier(P, this.f.key, branchKey, useGems)
      sfx(this).special?.()
    } catch (e) { this.cameras.main.shake(120, 0.004) }
    this.busy = false
    this.refresh()
  }
}


// ---------------- Fighter: everything about one fighter -- stats, upgrades, branch + XP, combos ----------------
export class FighterScene extends Phaser.Scene {
  constructor() { super('Fighter') }
  create(data) {
    setupCam(this); bridge(this).onScene?.('fighter')
    buildArena(this, { dim: 0.86 })
    this.pick = data?.pick ?? this.game.cfg?.pick ?? 0; this.frame = 0
    if (this.game.cfg) this.game.cfg.pick = this.pick
    const P = prog(this), sq = loadSquad(), f = FIGHTERS[this.pick], key = f.key
    const def = squadDef(this.pick, sq, this), withUp = applyUpgrades({ ...def }, (P.upgrades || {})[key])
    const st = STYLES[def.style], col = hex(f.colour)
    const H = (x, y, t) => txt(this, x, y, t, { fontFamily: BODY, fontStyle: '700', fontSize: '13px', color: '#9AA3AE' })

    // header: name, style, prev / next, back
    txt(this, 24, 10, f.name, { fontSize: '36px', color: f.colour, stroke: '#000', strokeThickness: 6 })
    txt(this, 26, 54, `${st.name}  ·  Special: ${f.specialName}  ·  Super: ${SUPER_NAME[f.special]}`, { fontFamily: BODY, fontStyle: '700', fontSize: '14px', color: '#C9CED6' })
    const n = FIGHTERS.length
    button(this, 600, 32, 44, 36, '◀', '#F2F2F2', () => this.scene.restart({ pick: (this.pick + n - 1) % n }), { size: 18 })
    button(this, 652, 32, 44, 36, '▶', '#F2F2F2', () => this.scene.restart({ pick: (this.pick + 1) % n }), { size: 18 })
    button(this, 738, 32, 84, 36, 'Back', '#F2F2F2', () => this.scene.start('Select'), { size: 20 })

    // fighter preview (left)
    this.f = makeFighter(def, 150, 1); this.f.side = 'p1'; this.f.theme = NATURAL_HOUSE[key]; this.f.skin = skinFor(this, key, sq)
    this.pose = makePose(this.f, 0); this.fg = this.add.graphics(); this.demoT = 20
    attach3DPreview(this, { x: 0, y: 96, w: 290, h: 330 }, f.colour, this.f.skin)

    const g = this.add.graphics(), X = 300
    // STATS
    H(X, 80, 'STATS')
    ;[['Speed', def.speed, 3.4, 5.2], ['Power', def.power, 0.8, 1.45], ['Reach', def.reach, 0.85, 1.2]].forEach(([lab, v, lo, hi], i) => {
      const y = 106 + i * 14
      txt(this, X, y - 7, lab, { fontFamily: BODY, fontStyle: '600', fontSize: '13px', color: '#C9CED6' })
      g.fillStyle(0x2a3138, 1); g.fillRect(X + 56, y, 170, 6); g.fillStyle(col, 1); g.fillRect(X + 56, y, 170 * Math.max(0.1, Math.min(1, (v - lo) / (hi - lo))), 6)
    })
    txt(this, X + 240, 96, `Health ${withUp.maxHp || 100}`, { fontFamily: BODY, fontStyle: '700', fontSize: '15px', color: '#F2F2F2' })
    txt(this, X + 240, 116, st.blurb, { fontFamily: BODY, fontStyle: '600', fontSize: '11.5px', color: '#9AA3AE', wordWrap: { width: 240 } })

    // UPGRADES
    H(X, 150, `UPGRADES  ·  level ${fighterLevel(P, key)} / ${AREAS.length * MAX_LV}`)
    AREA_GROUPS.forEach((gname, i) => {
      const areas = AREAS.filter(a => a.g === gname), have = areas.reduce((t, a) => t + levelOf(P, key, a.key), 0), max = areas.length * MAX_LV
      const x = X + i * 76, y = 172, gc = hex(FIGHTERS.find(ff => ff.key === gname.toLowerCase())?.colour || '#9AA3AE')
      txt(this, x, y, gname, { fontFamily: BODY, fontStyle: '700', fontSize: '11px', color: '#C9CED6' })
      g.fillStyle(0x2a3138, 1); g.fillRect(x, y + 16, 68, 5); g.fillStyle(gc, 1); g.fillRect(x, y + 16, 68 * have / max, 5)
      txt(this, x, y + 23, `${have}/${max}`, { fontFamily: BODY, fontStyle: '600', fontSize: '10.5px', color: '#7d8691' })
    })
    button(this, 728, 186, 96, 30, 'Upgrade  ▸', GOLD, () => this.scene.start('Upgrade', { pick: this.pick }), { size: 15 })

    // BRANCH + STYLE XP
    const b = branchOf(P, key), brDef = (BRANCHES[def.style] || []).find(x => x.key === b.branch), xp = xpOf(P, key)
    H(X, 222, 'BRANCH  ·  STYLE XP')
    txt(this, X, 238, brDef ? `${brDef.name}  ·  tier ${b.tier} of 3` : 'No branch chosen yet', { fontFamily: BODY, fontStyle: '700', fontSize: '15px', color: brDef ? f.colour : '#C9CED6' })
    const bx = X, bw = 300, max = TIER_XP[2]
    g.fillStyle(0x1c222a, 1); g.fillRect(bx, 262, bw, 6); g.fillStyle(0x5be0ff, 1); g.fillRect(bx, 262, bw * Math.min(1, xp / max), 6)
    TIER_XP.forEach(v => { g.fillStyle(0xffffff, 0.8); g.fillRect(bx + bw * v / max - 1, 259, 2, 12) })
    txt(this, bx + bw + 8, 256, P.mode === 'test' ? 'test mode' : `${xp} XP`, { fontFamily: BODY, fontStyle: '700', fontSize: '13px', color: '#5BE0FF' })
    button(this, 728, 252, 96, 30, 'Branch  ▸', GOLD, () => this.scene.start('Branch', { pick: this.pick }), { size: 15 })

    // COMBOS
    H(X, 284, 'COMBOS')
    def.combos.slice(0, 5).forEach((c, i) => {
      const y = 300 + i * 20
      txt(this, X, y, (c.rarity === 'signature' ? '★ ' : '') + c.name + (c.level > 1 ? '  ' + '★'.repeat(c.level - 1) : ''), { fontFamily: BODY, fontStyle: '700', fontSize: '15px', color: c.rarity === 'common' ? f.colour : RARITY[c.rarity].colour })
      txt(this, 660, y, comboLabel(c.seq), { fontFamily: BODY, fontStyle: '700', fontSize: '15px', color: '#F2F2F2' }).setOrigin(1, 0)
    })
    if (!def.combos.length) txt(this, X, 300, 'No combos equipped', { fontFamily: BODY, fontStyle: '600', fontSize: '14px', color: '#5c6670' })
    txt(this, X, 404, getPlayStyle() === 'sf' ? 'SF controls: LP MP HP / LK MK HK  ·  special ↓↘→ + punch  ·  super ↓↘→↓↘→ + punch' : 'L = tap   M = hold   H = long hold', { fontFamily: BODY, fontStyle: '600', fontSize: '12px', color: '#9AA3AE' })
    button(this, 728, 318, 96, 30, 'Combos  ▸', '#F2F2F2', () => this.scene.start('Combos', { pick: this.pick }), { size: 15 })
  }
  update() {
    this.frame++
    const f = this.f
    if (!f.move) { if (--this.demoT <= 0) { f.move = demoMove(f, ['lp', 'mp', 'hp', 'lk', 'mk', 'hk'][Math.floor(Math.random() * 6)]); f.t = 0; this.demoT = 34 } }
    else { f.t++; if (f.t > f.move.s + f.move.a + f.move.r) f.move = null }
    this.fg.clear()
    if (getLook() === '3d') return // the 3D preview draws the fighter
    this.fg.setScale(1.25).setPosition(-150 * 0.25, -400 * 0.25)
    this.fg.lineStyle(2, hex(fxColour(f)), 0.4); this.fg.strokeEllipse(150, 406, 170, 22)
    stepPose(this.pose, f, this.frame)
    drawFighter(this.fg, f, this.pose, this.frame, 1, { noKo: true, y: 400, shadowY: 400 })
  }
}

// ---------------- Collection: graphic cards, combo cards, skins ----------------
const SKIN_SWATCH = { standard: null, matte: null, neon: null, obsidian: 0x0b0b10, gold: 0xe8b54a }
export class CollectionScene extends Phaser.Scene {
  constructor() { super('Collection') }
  create(data) {
    setupCam(this); bridge(this).onScene?.('collection')
    buildArena(this, { dim: 0.88 })
    this.tab = data?.tab || 'Cards'; this.pick = data?.pick ?? 0; this.frame = 0
    txt(this, 20, 6, 'COLLECTION', { fontSize: '36px', color: GOLD, stroke: '#000', strokeThickness: 6 })
    this.countT = txt(this, 22, 48, '', { fontFamily: BODY, fontStyle: '700', fontSize: '14px', color: '#C9CED6' })
    button(this, 738, 30, 84, 36, 'Back', '#F2F2F2', () => this.scene.start('Select'), { size: 20 })
    this.tabBtns = ['Cards', 'Combos', 'Skins'].map((t, i) => button(this, 380 + i * 112, 30, 104, 34, t, '#F2F2F2', () => { this.tab = t; this.build() }, { size: 17 }))
    this.layer = []
    this.build()
  }
  clear() { for (const o of this.layer) o.destroy(); this.layer = [] }
  L(o) { this.layer.push(o); return o }
  build() {
    this.clear()
    const C = coll(this)
    this.tabBtns.forEach((b, i) => b.setOn(['Cards', 'Combos', 'Skins'][i] === this.tab))
    const ownedCards = CARDS.filter(c => ownsCard(C, c.id)).length, ownedCombos = COMBO_LIB.filter(c => ownsCombo(C, c.id)).length
    this.countT.setText(`Cards ${ownedCards} / ${CARDS.length}   ·   Combos ${ownedCombos} / ${COMBO_LIB.length}   ·   Win streak ${C.streak || 0}`)
    if (this.tab === 'Cards') this.buildCards(C)
    else if (this.tab === 'Combos') this.buildCombos(C)
    else this.buildSkins(C)
    const note = this.tab === 'Cards' ? 'Cards drop from wins (more on harder levels); every 3rd win in a row guarantees Rare or better. A duplicate levels a card up (★).'
      : this.tab === 'Combos' ? 'Commons are yours from the start; Rare and Epic combo cards drop from wins. Equip them from each fighter\'s Combos screen.'
      : 'Collect a fighter\'s cards to unlock their skins. Tap an unlocked skin to equip it (shows in 3D and the Stickman look).'
    this.L(txt(this, 20, 449, note, { fontFamily: BODY, fontStyle: '600', fontSize: '11px', color: '#7d8691' }).setOrigin(0, 1))
  }
  // a fighter drawn in a card's pose
  cardArt(g, card, cx, floorY, sc) {
    const base = FIGHTERS.find(f => f.key === card.fighter)
    const f = makeFighter(styledDef(base, loadSquad().styles[base.key]), cx / sc, 1); f.side = 'p1'; f.theme = NATURAL_HOUSE[base.key]
    if (card.pose === 'special') { const sp = base.special; f.move = sp === 'wave' ? { k: 'cast', s: 8, a: 6, r: 16, reach: 30 } : sp === 'quake' ? { k: 'stomp', s: 10, a: 4, r: 18 } : sp === 'upper' ? { k: 'upper', s: 3, a: 8, r: 20, reach: 66 } : sp === 'rush' ? { k: 'rush', s: 4, a: 14, r: 14, reach: 75 } : { k: 'counter', s: 40, a: 0, r: 6 }; f.t = f.move.s + 1; if (sp === 'counter') f.counterT = 30 }
    if (card.pose === 'kick') { f.move = demoMove(f, 'hk'); f.t = f.move.s + 1 }
    const P = targetPose(f, 10)
    if (card.pose === 'victory') { P.lhX = 18; P.lhY = P.shY - 48; P.rhX = -2; P.rhY = P.shY - 44 }
    g.setScale(sc)
    drawFighter(g, f, { cur: P, prev: P, trail: [], sw: [] }, 10, 1, { noKo: true, noTrail: true, x: cx / sc, y: floorY / sc, shadowY: floorY / sc })
  }
  buildCards(C) {
    FIGHTERS.forEach((fi, col) => {
      this.L(txt(this, 20 + col * 154 + 74, 74, fi.name, { fontSize: '17px', color: fi.colour }).setOrigin(0.5, 0))
      CARD_RARITIES.forEach((r, row) => {
        const card = CARDS.find(c => c.fighter === fi.key && c.rarity === r), own = ownsCard(C, card.id), lv = (C.cards || {})[card.id] || 0
        const x = 20 + col * 154, y = 98 + row * 84, w = 148, h = 78, rc = hex(CARD_RARITY[r].colour)
        const g = this.L(this.add.graphics())
        g.fillStyle(own ? 0x141922 : 0x0c0f14, 0.96); g.fillRoundedRect(x, y, w, h, 8)
        g.lineStyle(own ? (r === 'legendary' ? 3 : 2) : 1.5, own ? rc : 0x262d36, 1); g.strokeRoundedRect(x, y, w, h, 8)
        if (own && r === 'legendary') { g.lineStyle(1, 0xfff2c4, 0.6); g.strokeRoundedRect(x + 3, y + 3, w - 6, h - 6, 6) }
        if (own) { const art = this.L(this.add.graphics()); this.cardArt(art, card, x + 34, y + h - 8, 0.36) }
        else this.L(txt(this, x + 34, y + h / 2, '?', { fontSize: '30px', color: '#3a424d' }).setOrigin(0.5))
        this.L(txt(this, x + 66, y + 10, own ? card.name : '???', { fontFamily: BODY, fontStyle: '700', fontSize: '12.5px', color: own ? '#F2F2F2' : '#5c6670', wordWrap: { width: 78 } }))
        this.L(txt(this, x + 66, y + h - 22, CARD_RARITY[r].name + (lv > 1 ? '  ' + '★'.repeat(lv - 1) : ''), { fontFamily: BODY, fontStyle: '700', fontSize: '11px', color: own ? CARD_RARITY[r].colour : '#3a424d' }))
        if (own) { const z = this.L(this.add.zone(x, y, w, h).setOrigin(0).setInteractive()); z.on('pointerdown', () => this.showCard(card, lv)) }
      })
    })
  }
  showCard(card, lv) {
    sfx(this).ui?.()
    const fi = FIGHTERS.find(f => f.key === card.fighter), rc = CARD_RARITY[card.rarity]
    const objs = []
    const dim = this.add.rectangle(W / 2, H / 2, W + 40, H + 40, 0x000000, 0.75).setInteractive(); objs.push(dim)
    const g = this.add.graphics(); objs.push(g)
    const x = W / 2 - 130, y = 40, w = 260, h = 370
    g.fillStyle(0x10141a, 1); g.fillRoundedRect(x, y, w, h, 14)
    g.lineStyle(card.rarity === 'legendary' ? 5 : 3, hex(rc.colour), 1); g.strokeRoundedRect(x, y, w, h, 14)
    g.fillStyle(hex(fi.colour), 0.12); g.fillRoundedRect(x + 10, y + 46, w - 20, 230, 10)
    const art = this.add.graphics(); objs.push(art); this.cardArt(art, card, W / 2, y + 262, 1.15)
    objs.push(txt(this, W / 2, y + 12, `${fi.name}`, { fontSize: '22px', color: fi.colour }).setOrigin(0.5, 0))
    objs.push(txt(this, W / 2, y + 286, card.name, { fontSize: '26px', color: '#F2F2F2' }).setOrigin(0.5, 0))
    objs.push(txt(this, W / 2, y + 322, `${rc.name}${lv > 1 ? '  ' + '★'.repeat(lv - 1) : ''}   ·   tap to close`, { fontFamily: BODY, fontStyle: '700', fontSize: '14px', color: rc.colour }).setOrigin(0.5, 0))
    dim.on('pointerdown', () => objs.forEach(o => o.destroy()))
  }
  buildCombos(C) {
    const groups = [['Boxing', ['pro', 'am']], ['Freestyle', ['kickboxer']], ['Taekwondo', ['tkd']], ['K1', ['thai']]]
    groups.forEach(([label, styles], col) => {
      const x = 20 + col * 192
      this.L(txt(this, x, 74, label, { fontSize: '18px', color: '#F2F2F2' }))
      COMBO_LIB.filter(c => c.styles.some(s => styles.includes(s)) && (styles.length > 1 ? c.styles.length > 1 || c.styles[0] === styles[0] : true)).forEach((c, row) => {
        const own = ownsCombo(C, c.id), lv = C.combos[c.id] || 0, y = 100 + row * 40, rcol = RARITY[c.rarity].colour
        const g = this.L(this.add.graphics())
        g.fillStyle(0x10141a, own ? 0.96 : 0.7); g.fillRoundedRect(x, y, 184, 36, 6)
        g.lineStyle(1.5, own ? hex(rcol) : 0x262d36, 1); g.strokeRoundedRect(x, y, 184, 36, 6)
        this.L(txt(this, x + 7, y + 3, c.name + (lv > 1 ? '  ' + '★'.repeat(lv - 1) : ''), { fontFamily: BODY, fontStyle: '700', fontSize: '12.5px', color: own ? '#F2F2F2' : '#5c6670' }))
        this.L(txt(this, x + 7, y + 19, `${RARITY[c.rarity].name}  ·  ${comboLabel(c.seq)}`, { fontFamily: BODY, fontStyle: '600', fontSize: '10.5px', color: own ? rcol : '#3a424d' }))
      })
    })
  }
  buildSkins(C) {
    const sq = loadSquad()
    SKINS.forEach((sk, col) => this.L(txt(this, 132 + col * 132 + 62, 74, sk.name, { fontSize: '16px', color: sk.key === 'gold' ? GOLD : '#F2F2F2' }).setOrigin(0.5, 0)))
    FIGHTERS.forEach((fi, row) => {
      const y = 98 + row * 68
      this.L(txt(this, 20, y + 12, fi.name, { fontSize: '17px', color: fi.colour }))
      this.L(txt(this, 20, y + 34, `${cardsOwnedFor(C, fi.key)} / 4 cards`, { fontFamily: BODY, fontStyle: '600', fontSize: '11px', color: '#9AA3AE' }))
      const equipped = skinFor(this, fi.key, sq)
      SKINS.forEach((sk, col) => {
        const x = 132 + col * 132, unlocked = skinUnlocked(C, fi.key, sk.key), on = equipped === sk.key
        const g = this.L(this.add.graphics())
        g.fillStyle(on ? hex(fi.colour) : 0x10141a, on ? 0.2 : 0.95); g.fillRoundedRect(x, y, 124, 60, 8)
        g.lineStyle(on ? 2.5 : 1.5, on ? hex(fi.colour) : unlocked ? 0x3a424d : 0x1e242c, 1); g.strokeRoundedRect(x, y, 124, 60, 8)
        // swatch
        const c = hex(fi.colour), sw = SKIN_SWATCH[sk.key] ?? c
        if (sk.key === 'neon') { g.fillStyle(c, 0.3); g.fillCircle(x + 22, y + 30, 15) }
        g.fillStyle(sk.key === 'matte' ? shadeHex(c, 0.75) : sw, unlocked ? 1 : 0.35); g.fillCircle(x + 22, y + 30, 11)
        if (sk.key === 'obsidian') { g.lineStyle(2, c, unlocked ? 1 : 0.35); g.strokeCircle(x + 22, y + 30, 11) }
        if (sk.key === 'standard' || sk.key === 'gold') { g.fillStyle(0xffffff, unlocked ? 0.55 : 0.2); g.fillCircle(x + 18, y + 26, 3.5) }
        const need = sk.need === 'legendary' ? 'Need Legendary card' : `Need ${sk.need} cards`
        this.L(txt(this, x + 40, y + 12, on ? 'Equipped' : unlocked ? 'Tap to equip' : need, { fontFamily: BODY, fontStyle: '700', fontSize: '11.5px', color: on ? fi.colour : unlocked ? '#C9CED6' : '#5c6670', wordWrap: { width: 80 } }))
        if (unlocked && !on) {
          const z = this.L(this.add.zone(x, y, 124, 60).setOrigin(0).setInteractive())
          z.on('pointerdown', () => { const q = loadSquad(); q.skins = { ...(q.skins || {}), [fi.key]: sk.key }; saveSquad(q); sfx(this).ui?.(); this.build() })
        }
      })
    })
  }
}
const shadeHex = (c, k) => ((Math.min(255, ((c >> 16) & 255) * k) << 16) | (Math.min(255, ((c >> 8) & 255) * k) << 8) | Math.min(255, (c & 255) * k))

// ---------------- Arena: challenge other athletes' squads + season leaderboards ----------------
export class ArenaScene extends Phaser.Scene {
  constructor() { super('Arena') }
  create(data) {
    setupCam(this); bridge(this).onScene?.('arena')
    buildArena(this, { dim: 0.88 })
    this.tab = data?.tab || 'Opponents'; this.page = 0; this.age = null
    txt(this, 20, 6, 'ARENA', { fontSize: '36px', color: '#5BE0FF', stroke: '#000', strokeThickness: 6 })
    this.subT = txt(this, 22, 48, 'Loading…', { fontFamily: BODY, fontStyle: '700', fontSize: '13px', color: '#C9CED6' })
    button(this, 738, 30, 84, 36, 'Back', '#F2F2F2', () => this.scene.start('Select'), { size: 20 })
    this.tabBtns = ['Opponents', 'Leaderboard'].map((t, i) => button(this, 420 + i * 132, 30, 124, 34, t, '#F2F2F2', () => { this.tab = t; this.build() }, { size: 16 }))
    this.layer = []
    const P = prog(this)
    Promise.all([loadOpponents(P), loadLeaderboard(P, null)]).then(([opps, board]) => {
      if (!this.sys || !this.sys.isActive()) return
      this.opps = opps; this.board = board; this.build()
    })
  }
  clear() { for (const o of this.layer) o.destroy(); this.layer = [] }
  L(o) { this.layer.push(o); return o }
  build() {
    this.clear()
    this.tabBtns.forEach((b, i) => b.setOn(['Opponents', 'Leaderboard'][i] === this.tab))
    if (!this.opps) return
    const practice = this.opps.practice
    this.subT.setText(practice ? 'Practice opponents (made-up squads) -- real athletes appear here once the player-vs-player SQL is run.' : `Season ${this.board.season}  ·  win to copy one of their cards or combos (they keep theirs)`)
    if (this.tab === 'Opponents') this.buildOpponents(); else this.buildBoard()
  }
  buildOpponents() {
    const list = this.opps.list || [], per = 6, pages = Math.max(1, Math.ceil(list.length / per))
    this.page = Math.min(this.page, pages - 1)
    if (!list.length) { this.L(txt(this, W / 2, 200, 'No other athletes have a squad yet.\nOnce others play, their teams appear here.', { fontFamily: BODY, fontStyle: '700', fontSize: '16px', color: '#9AA3AE', align: 'center' }).setOrigin(0.5)); return }
    list.slice(this.page * per, this.page * per + per).forEach((o, i) => {
      const y = 76 + i * 58
      const g = this.L(this.add.graphics())
      g.fillStyle(0x10141a, 0.95); g.fillRoundedRect(20, y, 760, 52, 8); g.lineStyle(1.5, 0x262d36, 1); g.strokeRoundedRect(20, y, 760, 52, 8)
      this.L(txt(this, 34, y + 6, o.name || 'Athlete', { fontSize: '18px', color: '#F2F2F2' }))
      this.L(txt(this, 34, y + 30, `${o.house || 'No house'}${o.age_category ? '  ·  ' + o.age_category : ''}  ·  Level ${opponentLevel(o)}  ·  ${o.pvp_wins || 0}W ${o.pvp_losses || 0}L`, { fontFamily: BODY, fontStyle: '600', fontSize: '12px', color: '#9AA3AE' }))
      // their team
      const order = (o.defence && o.defence.order) || []
      order.forEach((k, j) => {
        const fi = FIGHTERS.find(f => f.key === k); if (!fi) return
        const x = 330 + j * 70
        g.fillStyle(hex(fi.colour), 1); g.fillCircle(x, y + 18, 8)
        this.L(txt(this, x, y + 30, (STYLES[(o.styles || {})[k]] || STYLES.kickboxer).name.split(' ')[0], { fontFamily: BODY, fontStyle: '700', fontSize: '10.5px', color: fi.colour }).setOrigin(0.5, 0))
      })
      const btn = this.L(button(this, 712, y + 26, 120, 36, o.rewarded_today ? 'Fight (no reward)' : 'Fight  ▸', o.rewarded_today ? '#9AA3AE' : '#5BE0FF', () => this.challenge(o), { size: o.rewarded_today ? 12 : 17 }))
      btn.setOn(!o.rewarded_today)
    })
    if (pages > 1) {
      this.L(button(this, 330, 432, 70, 26, '◀', '#F2F2F2', () => { this.page = (this.page + pages - 1) % pages; this.build() }, { size: 15 }))
      this.L(txt(this, 400, 432, `${this.page + 1} / ${pages}`, { fontFamily: BODY, fontStyle: '700', fontSize: '13px', color: '#C9CED6' }).setOrigin(0.5))
      this.L(button(this, 470, 432, 70, 26, '▶', '#F2F2F2', () => { this.page = (this.page + 1) % pages; this.build() }, { size: 15 }))
    }
  }
  challenge(o) {
    const sq = loadSquad(), order = sq.order || []
    if (!order.length) { this.cameras.main.shake(120, 0.004); return }
    const team1 = order.map(p => ({ p, style: sq.styles[FIGHTERS[p].key], loadout: (sq.loadouts || {})[FIGHTERS[p].key], skin: skinFor(this, FIGHTERS[p].key, sq) }))
    const team2 = ((o.defence && o.defence.order) || []).map(k => ({ p: PILLARS_BY_INDEX.indexOf(k), style: (o.styles || {})[k] || 'kickboxer', loadout: ((o.defence || {}).loadouts || {})[k] })).filter(t => t.p >= 0)
    if (!team2.length) return
    saveDefence(prog(this), sq)
    sfx(this).resume?.(); this.cameras.main.flash(160, 255, 255, 255)
    this.scene.start('Fight', { team1, team2, level: 'medium', opp: o })
  }
  buildBoard() {
    const b = this.board || {}
    // houses
    this.L(txt(this, 24, 74, 'Houses', { fontSize: '19px', color: '#F2F2F2' }))
    const houses = b.houses || [], maxW = Math.max(1, ...houses.map(h => Number(h.wins) || 0))
    if (!houses.length) this.L(txt(this, 24, 104, b.practice ? 'House rankings appear once the player-vs-player SQL is run.' : 'No wins yet this season.', { fontFamily: BODY, fontStyle: '600', fontSize: '13px', color: '#9AA3AE', wordWrap: { width: 300 } }))
    const g = this.L(this.add.graphics())
    houses.slice(0, 6).forEach((h, i) => {
      const y = 104 + i * 44, hc = { dragon: 0xff3b30, super: 0xff8a1f, jet: 0x5be04a, ice: 0x5ab8ff, storm: 0xb05cff }[String(h.house || '').toLowerCase()] || 0x9aa3ae
      this.L(txt(this, 24, y, `${i + 1}. ${h.house}`, { fontFamily: BODY, fontStyle: '700', fontSize: '15px', color: '#F2F2F2' }))
      g.fillStyle(0x2a3138, 1); g.fillRect(24, y + 22, 280, 8); g.fillStyle(hc, 1); g.fillRect(24, y + 22, 280 * (Number(h.wins) || 0) / maxW, 8)
      this.L(txt(this, 310, y, `${h.wins} wins`, { fontFamily: BODY, fontStyle: '700', fontSize: '13px', color: '#C9CED6' }).setOrigin(1, 0))
    })
    // athletes
    this.L(txt(this, 360, 74, 'Top athletes', { fontSize: '19px', color: '#F2F2F2' }))
    const ages = b.ages || []
    if (ages.length) this.L(button(this, 712, 86, 136, 26, `Age: ${this.age || 'All'}  ▸`, '#F2F2F2', () => {
      const opts = [null, ...ages]; this.age = opts[(opts.indexOf(this.age) + 1) % opts.length]
      loadLeaderboard(prog(this), this.age).then(nb => { this.board = nb; this.build() })
    }, { size: 13 }))
    ;(b.athletes || []).slice(0, 8).forEach((a, i) => {
      const y = 106 + i * 36
      const gg = this.L(this.add.graphics()); gg.fillStyle(a.me ? 0x5be0ff : 0x10141a, a.me ? 0.15 : 0.9); gg.fillRoundedRect(360, y, 420, 32, 6)
      this.L(txt(this, 372, y + 7, `${i + 1}. ${a.name}`, { fontFamily: BODY, fontStyle: '700', fontSize: '14px', color: a.me ? '#5BE0FF' : '#F2F2F2' }))
      this.L(txt(this, 560, y + 8, `${a.house || ''}${a.age ? ' · ' + a.age : ''}`, { fontFamily: BODY, fontStyle: '600', fontSize: '12px', color: '#9AA3AE' }))
      this.L(txt(this, 770, y + 7, `${a.wins}W ${a.losses}L`, { fontFamily: BODY, fontStyle: '700', fontSize: '14px', color: '#F2F2F2' }).setOrigin(1, 0))
    })
    if (b.me) this.L(txt(this, 360, 412, `You: ${b.me.wins}W ${b.me.losses}L  ·  rank ${b.me.rank}`, { fontFamily: BODY, fontStyle: '700', fontSize: '14px', color: '#5BE0FF' }))
  }
}
