// KR FIGHT -- 3D fight renderer (Look 4: 3D). Draws the fight in three.js BEHIND the Phaser canvas: a space
// arena and the Quaternius mannequin (CC0) for each fighter, recoloured in their colour. The game's rules,
// HUD, sparks and trails are untouched -- Phaser keeps drawing those on top, lined up with the fighters
// because the 3D camera is framed so the fighters' plane matches the 2D world exactly (1 world px = 0.01).
//
// Animation: motion-capture clips where the pack has them (idle, walk, crouch, jump, jab, cross, cast,
// hits, KO, victory); every other strike, guard and block bends the mannequin's limbs with two-bone IK
// driven by the game's existing pose data (pose.js), so every move and combo works.
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'

const W = 800, H = 450, FLOOR = 380, U = 0.01
const X3 = x => (x - W / 2) * U
const Y3 = y => (FLOOR - y) * U
const MODEL_SCALE = 0.85
const FOV = 30

// strikes with a motion-capture clip in the pack; everything else is driven by IK from the pose system
const STRIKE_CLIP = { jab: 'Punch_Jab', clp: 'Punch_Jab', bodyjab: 'Punch_Jab', cross: 'Punch_Cross', cast: 'Spell_Simple_Shoot' }
// strikes whose legs are driven by IK (kicks / knees / stomp)
const LEG_STRIKES = new Set(['teep', 'bodykick', 'highkick', 'roundkick', 'sidekick', 'spinkick', 'lowkick', 'knee', 'clk', 'jk', 'stomp'])

// ---- model (loaded once per page) ----
let modelPromise = null
export function loadFighterModel() {
  if (modelPromise) return modelPromise
  modelPromise = new Promise((resolve, reject) => {
    const l = new GLTFLoader(); l.setMeshoptDecoder(MeshoptDecoder)
    l.load('/krfight/ual1.glb', resolve, undefined, () => new GLTFLoader().load('/krfight/ual1_full.glb', resolve, undefined, reject))
  })
  modelPromise.catch(() => { modelPromise = null })
  return modelPromise
}

// ---- space arena ----
function buildArena(scene) {
  scene.background = new THREE.Color('#05060b')
  scene.add(new THREE.HemisphereLight('#8fa8ff', '#1a1020', 0.75))
  const key = new THREE.DirectionalLight('#ffffff', 2.2); key.position.set(-3, 6, 6); scene.add(key)
  const rim = new THREE.DirectionalLight('#ffcf7a', 2.4); rim.position.set(4, 3, -5); scene.add(rim)
  const fill = new THREE.PointLight('#6f8cff', 10, 16); fill.position.set(0, 2.5, 4); scene.add(fill)
  const starGeo = new THREE.BufferGeometry(), pts = []
  for (let i = 0; i < 1800; i++) { const r = 45 + Math.random() * 40, t = Math.random() * Math.PI * 2, p = Math.acos(2 * Math.random() - 1); pts.push(r * Math.sin(p) * Math.cos(t), r * Math.sin(p) * Math.sin(t) * 0.6 + 6, -Math.abs(r * Math.cos(p)) - 8) }
  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3))
  scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: '#ffffff', size: 0.14 })))
  const bh = new THREE.Group(); bh.position.set(7, 8, -38)
  bh.add(new THREE.Mesh(new THREE.CircleGeometry(3.4, 64), new THREE.MeshBasicMaterial({ color: '#000' })))
  const ring = new THREE.Mesh(new THREE.TorusGeometry(6, 0.5, 16, 128), new THREE.MeshBasicMaterial({ color: '#ffd9a0' })); ring.rotation.x = 1.35; bh.add(ring)
  bh.add(new THREE.Mesh(new THREE.RingGeometry(3.45, 4.1, 64), new THREE.MeshBasicMaterial({ color: '#ffe7b8', transparent: true, opacity: 0.8 })))
  scene.add(bh)
  const planet = new THREE.Mesh(new THREE.SphereGeometry(48, 64, 32), new THREE.MeshStandardMaterial({ color: '#1f3d82', roughness: 0.9, emissive: '#0a1640', emissiveIntensity: 0.6 }))
  planet.position.set(-24, -54, -55); scene.add(planet)
  const rock = new THREE.Mesh(new THREE.CylinderGeometry(4.6, 3.4, 0.8, 9, 1), new THREE.MeshStandardMaterial({ color: '#3a3f52', roughness: 0.95, flatShading: true }))
  rock.position.set(0, -0.4, -0.6); scene.add(rock)
  const glow = new THREE.Mesh(new THREE.RingGeometry(3.3, 4.8, 64), new THREE.MeshBasicMaterial({ color: '#8fb6ff', transparent: true, opacity: 0.12, side: THREE.DoubleSide }))
  glow.rotation.x = -Math.PI / 2; glow.position.set(0, -0.79, -0.6); scene.add(glow)
  return dt => { ring.rotation.z += dt * 0.2 }
}

// ---- IK helpers (world space) ----
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _t = new THREE.Vector3()
const _q = new THREE.Quaternion(), _qw = new THREE.Quaternion(), _qp = new THREE.Quaternion()
function aimBone(bone, childPos, desiredDir) {
  const a = bone.getWorldPosition(new THREE.Vector3())
  const cur = childPos.clone().sub(a).normalize(), want = desiredDir.clone().normalize()
  if (cur.lengthSq() < 1e-8 || want.lengthSq() < 1e-8) return
  _q.setFromUnitVectors(cur, want)
  bone.getWorldQuaternion(_qw); const nw = _q.multiply(_qw)
  bone.parent.getWorldQuaternion(_qp); bone.quaternion.copy(_qp.invert().multiply(nw))
  bone.updateMatrixWorld(true)
}
// bend upper -> lower -> end so the end reaches the target; pole says which way the middle joint bends
function twoBone(upper, lower, end, target, pole) {
  upper.getWorldPosition(_a); lower.getWorldPosition(_b); end.getWorldPosition(_c)
  const l1 = _a.distanceTo(_b), l2 = _b.distanceTo(_c)
  const toT = target.clone().sub(_a); let d = toT.length(); if (d < 1e-4) return
  const dir = toT.clone().divideScalar(d); d = Math.min(d, l1 + l2 - 1e-3)
  const p = pole.clone().sub(_a); p.sub(dir.clone().multiplyScalar(p.dot(dir))); if (p.lengthSq() < 1e-8) p.set(0, -1, 0); p.normalize()
  const x = (l1 * l1 - l2 * l2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, l1 * l1 - x * x))
  const mid = _a.clone().add(dir.clone().multiplyScalar(x)).add(p.multiplyScalar(h))
  aimBone(upper, _b.clone(), mid.clone().sub(_a))
  lower.getWorldPosition(_b); end.getWorldPosition(_c)
  aimBone(lower, _c.clone(), target.clone().sub(_b))
}

// ---- one fighter's 3D body ----
class Rig {
  constructor(gltf, clips, f, colour, cpu) {
    this.obj = cloneSkinned(gltf.scene); this.obj.scale.setScalar(MODEL_SCALE)
    this.clips = clips; this.mixer = new THREE.AnimationMixer(this.obj)
    // the CPU is dark smoked chrome tinted with its colour (like the black CPU in the 2D looks), so even a
    // same-colour match is easy to read
    const c = cpu ? new THREE.Color(colour).multiplyScalar(0.28) : new THREE.Color(colour)
    this.obj.traverse(o => {
      if (!o.isMesh) return
      o.frustumCulled = false
      o.material = (Array.isArray(o.material) ? o.material : [o.material]).map(m0 => {
        const m = m0.clone(), joints = /Joint/i.test(m.name || '')
        m.color = joints ? c.clone().multiplyScalar(0.35) : c.clone(); m.metalness = joints ? 0.6 : 0.92; m.roughness = joints ? 0.4 : 0.2
        m.emissive = cpu ? new THREE.Color(colour) : c.clone(); m.emissiveIntensity = cpu ? 0.06 : 0.08; return m
      })
      if (o.material.length === 1) o.material = o.material[0]
    })
    const B = n => this.obj.getObjectByName(n)
    this.b = { spine: B('spine_01'), spine2: B('spine_02'), ual: B('upperarm_l'), lal: B('lowerarm_l'), hl: B('hand_l'), uar: B('upperarm_r'), lar: B('lowerarm_r'), hr: B('hand_r'),
      tl: B('thigh_l'), cl: B('calf_l'), fl: B('foot_l'), tr: B('thigh_r'), cr: B('calf_r'), fr: B('foot_r') }
    // rest pose of every bone: restored each frame before the animation runs, so bones a clip doesn't move
    // (and the IK / lean layered on top) never build up frame after frame
    this.rest = []; this.obj.traverse(o => { if (o.isBone) this.rest.push([o, o.quaternion.clone(), o.position.clone()]) })
    this.loop = null; this.shot = null; this.shotEnds = 0; this.lastMove = null; this.f = f
    this.playLoop('Idle_Loop')
  }
  action(name) { const clip = this.clips[name]; return clip ? this.mixer.clipAction(clip) : null }
  playLoop(name, speed = 1) {
    if (this.loop && this.loop.getClip().name === name) { this.loop.timeScale = speed; return }
    const act = this.action(name); if (!act) return
    act.reset(); act.setLoop(THREE.LoopRepeat, Infinity); act.timeScale = speed; act.enabled = true
    if (this.loop) act.crossFadeFrom(this.loop, 0.18, false)
    act.play(); this.loop = act
  }
  // a one-shot clip on top (strike, hit, KO, victory); seconds = how long it should take
  playShot(name, seconds, { clamp = false, startAt = 0 } = {}) {
    const act = this.action(name); if (!act) return false
    const d = act.getClip().duration
    act.reset(); act.setLoop(THREE.LoopOnce, 1); act.clampWhenFinished = clamp
    act.timeScale = seconds ? Math.max(0.5, Math.min(4, (d * (1 - startAt)) / seconds)) : 1
    act.time = d * startAt; act.enabled = true; act.setEffectiveWeight(1)
    if (this.shot && this.shot !== act) act.crossFadeFrom(this.shot, 0.08, false)
    else if (this.loop) act.crossFadeFrom(this.loop, 0.08, false)
    act.play(); this.shot = act; this.shotName = name
    this.shotEnds = clamp ? Infinity : performance.now() + (d * (1 - startAt) / act.timeScale) * 1000
    return true
  }
  endShot() {
    if (!this.shot) return
    if (this.loop) { this.loop.reset(); this.loop.play(); this.loop.crossFadeFrom(this.shot, 0.15, false) }
    this.shot = null; this.shotName = null
  }
}

export class Renderer3D {
  constructor(game) {
    this.game = game; this.ready = false; this.rigs = new Map()
    const r = this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
    r.setPixelRatio(Math.min(2, window.devicePixelRatio || 1)); r.outputColorSpace = THREE.SRGBColorSpace; r.toneMapping = THREE.ACESFilmicToneMapping
    const cv = r.domElement
    Object.assign(cv.style, { position: 'absolute', left: '0px', top: '0px', pointerEvents: 'none', zIndex: '0' })
    const gc = game.canvas, parent = gc.parentNode
    parent.insertBefore(cv, gc)
    gc.style.position = 'relative'; gc.style.zIndex = '1'
    this.scene = new THREE.Scene()
    this.camera = new THREE.PerspectiveCamera(FOV, 16 / 9, 0.1, 300)
    this.spin = buildArena(this.scene)
    this.clock = new THREE.Clock()
    this.size = ''
    loadFighterModel().then(gltf => {
      if (this.dead) return
      this.gltf = gltf; this.clips = Object.fromEntries(gltf.animations.map(c => [c.name, c]))
      // chrome needs something to reflect
      const pm = new THREE.PMREMGenerator(r), env = new THREE.Scene()
      env.add(new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), new THREE.MeshBasicMaterial({ color: '#223', side: THREE.BackSide })))
      const lamp = (c, x, y, z) => { const m = new THREE.Mesh(new THREE.SphereGeometry(1.5, 16, 8), new THREE.MeshBasicMaterial({ color: c })); m.position.set(x, y, z); env.add(m) }
      lamp('#ffffff', -5, 6, 4); lamp('#ffd9a0', 6, 3, -6); lamp('#6f8cff', 0, -4, 6)
      this.scene.environment = pm.fromScene(env, 0.04).texture
      this.ready = true
    }).catch(() => { this.failed = true })
  }
  // keep the 3D canvas exactly under the Phaser canvas
  sync() {
    const gc = this.game.canvas
    const key = `${gc.offsetLeft},${gc.offsetTop},${gc.offsetWidth},${gc.offsetHeight}`
    if (key === this.size) return
    this.size = key
    const cv = this.renderer.domElement
    Object.assign(cv.style, { left: gc.offsetLeft + 'px', top: gc.offsetTop + 'px', width: gc.offsetWidth + 'px', height: gc.offsetHeight + 'px' })
    this.renderer.setSize(gc.offsetWidth || 1, gc.offsetHeight || 1, false)
    this.camera.aspect = (gc.offsetWidth || 16) / (gc.offsetHeight || 9); this.camera.updateProjectionMatrix()
  }
  rigFor(f) {
    let rig = this.rigs.get(f)
    if (!rig && this.ready) { rig = new Rig(this.gltf, this.clips, f, f.def.colour, f.side === 'p2'); this.scene.add(rig.obj); this.rigs.set(f, rig) }
    return rig
  }
  // game events -> one-shot clips
  event(e) {
    if (!this.ready) return
    if (e.type === 'hit' && e.def.state !== 'ko') { const rig = this.rigFor(e.def); rig && rig.playShot(e.h === 'high' ? 'Hit_Head' : 'Hit_Chest', Math.max(0.25, (e.def.stun || 12) / 60)) }
    if (e.type === 'ko') { const rig = this.rigFor(e.loser); rig && rig.playShot('Death01', 1.4, { clamp: true }) }
    if (e.type === 'jump') { const rig = this.rigFor(e.f); rig && rig.playShot('Jump_Start', 0.25) }
    if (e.type === 'land' && e.f.state !== 'ko') { const rig = this.rigFor(e.f); rig && rig.playShot('Jump_Land', 0.3) }
    if (e.type === 'roundOver' && e.winner) { this.winner = e.winner; this.winAt = performance.now() + 1800 }
  }
  // view: centre (world px) + zoom relative to normal + shake (world px)
  setView(cx, cy, zoomRel, sx = 0, sy = 0) {
    const hv = (H * U) / Math.max(0.5, zoomRel), dist = (hv / 2) / Math.tan(THREE.MathUtils.degToRad(FOV / 2))
    this.camera.position.set(X3(cx) + sx * U, Y3(cy) - sy * U, dist); this.camera.lookAt(X3(cx) + sx * U, Y3(cy) - sy * U, 0)
  }
  update(m, poses) {
    this.sync()
    const dt = this.dt = Math.min(0.05, this.clock.getDelta()); this.spin(dt)
    if (this.ready) {
      const active = new Set([m.p1, m.p2])
      for (const [f, rig] of this.rigs) rig.obj.visible = active.has(f)
      for (const side of ['p1', 'p2']) this.drive(m[side], poses[side], side, m)
    }
    this.renderer.render(this.scene, this.camera)
  }
  // choose the animation for this fighter, then bend limbs where the pose system leads
  drive(f, pose, side, m) {
    const rig = this.rigFor(f); if (!rig) return
    const dir = f.facing || 1
    rig.obj.position.set(X3(f.x), Math.max(0, Y3(f.y)), 0)
    rig.obj.rotation.y = dir > 0 ? Math.PI / 2 - 0.3 : -(Math.PI / 2 - 0.3) // side-on, turned a little to camera
    const now = performance.now()
    // victory
    if (this.winner === side && now > this.winAt && f.state !== 'ko' && rig.shotName !== 'Dance_Loop') { rig.playShot('Dance_Loop', 0, { clamp: true }); rig.shot.setLoop(THREE.LoopRepeat, Infinity) }
    // new strike?
    const mv = f.move
    if (mv && mv !== rig.lastMove) {
      rig.lastMove = mv
      const clip = STRIKE_CLIP[mv.k]
      if (clip) rig.playShot(clip, (mv.s + mv.a + mv.r) / 60, { startAt: 0.12 })
      else if (rig.shot && rig.shotName !== 'Death01' && rig.shotName !== 'Dance_Loop') rig.endShot()
    }
    if (!mv) rig.lastMove = null
    if (rig.shot && now > rig.shotEnds) rig.endShot()
    // base loop
    const air = f.y < FLOOR - 2, moving = Math.abs(f.vx) > 0.3
    if (f.state === 'ko') { /* Death01 holds */ }
    else if (air) rig.playLoop('Jump_Loop')
    else if (f.crouch) rig.playLoop('Crouch_Idle_Loop')
    else if (moving && !mv) rig.playLoop('Walk_Loop', Math.sign(f.vx) === dir ? 1.3 : -1.1)
    else rig.playLoop('Idle_Loop')
    for (const [bone, q, p] of rig.rest) { bone.quaternion.copy(q); bone.position.copy(p) }
    rig.mixer.update(this.dt || 1 / 60)
    rig.obj.updateMatrixWorld(true)
    // IK layer from the pose system: arms whenever no clip owns them; legs for kicks / knees
    if (f.state === 'ko' || !pose) return
    const P = pose.cur
    const clipOwnsArms = !!rig.shot && rig.shotName !== 'Jump_Start' && rig.shotName !== 'Jump_Land'
    const legStrike = mv && LEG_STRIKES.has(mv.k) && !STRIKE_CLIP[mv.k]
    const armStrike = mv && !STRIKE_CLIP[mv.k] && !legStrike
    const b = rig.b
    // lean the spine with the pose (punch weight forward, kicks lean back)
    if (b.spine && (armStrike || legStrike || f.blocking || f.stun > 0)) {
      const ang = THREE.MathUtils.degToRad(-(P.lean || 0) * 1.4)
      const axis = new THREE.Vector3(0, 0, 1).applyQuaternion(b.spine.getWorldQuaternion(new THREE.Quaternion()).invert())
      b.spine.rotateOnAxis(axis, ang * dir); b.spine.updateMatrixWorld(true)
    }
    const fwd = new THREE.Vector3(dir, 0, 0)
    if (!clipOwnsArms || armStrike) {
      // hands: relative to each shoulder, scaled from the 2D skeleton (arm ~0.54 -> ~0.47 units)
      for (const [ua, la, hd, hx, hy] of [[b.ual, b.lal, b.hl, P.lhX, P.lhY], [b.uar, b.lar, b.hr, P.rhX, P.rhY]]) {
        if (!ua) continue
        const sh = ua.getWorldPosition(new THREE.Vector3())
        const t = new THREE.Vector3(sh.x + dir * (hx - P.shX) * U * 0.9, sh.y + (P.shY - hy) * U * 0.9 - 0.05, sh.z)
        const pole = sh.clone().add(new THREE.Vector3(-dir * 0.3, -1, 0))
        twoBone(ua, la, hd, t, pole)
      }
    }
    if (legStrike) {
      // feet: kick height scaled by hip height so a high kick reaches head height on the mannequin
      for (const [th, ca, ft, fx, fy] of [[b.tl, b.cl, b.fl, P.lfX, P.lfY], [b.tr, b.cr, b.fr, P.rfX, P.rfY]]) {
        if (!th) continue
        const hip = th.getWorldPosition(new THREE.Vector3())
        const footY = Math.max(0.06, (-fy) * U * 1.65 + 0.06)
        const t = new THREE.Vector3(rig.obj.position.x + dir * fx * U * 1.3, rig.obj.position.y + footY, hip.z)
        const pole = hip.clone().add(fwd.clone().multiplyScalar(1)).add(new THREE.Vector3(0, -0.3, 0))
        twoBone(th, ca, ft, t, pole)
      }
    }
  }
  destroy() {
    this.dead = true
    try { this.renderer.domElement.remove(); this.renderer.dispose() } catch (e) { /* ignore */ }
    const gc = this.game.canvas; if (gc) { gc.style.zIndex = '' }
  }
}
