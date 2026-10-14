import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'

// KR FIGHT -- 3D look test. Two Quaternius Universal Animation Library mannequins (CC0) recoloured in the
// fighter colours, side-on like the game, on a floating platform in space. Buttons play each animation;
// "Auto fight" runs a short exchange so the feel can be judged on a phone. Test only: nothing here
// touches the game's rules or progress.
const MODEL_URL = '/krfight/ual1.glb'          // compressed (1.9 MB, needs WebAssembly)
const MODEL_URL_FULL = '/krfight/ual1_full.glb' // fallback: uncompressed (7.6 MB), works anywhere
const FIGHTERS = {
  yellow: { name: 'YELLOW', colour: '#E6B800' }, purple: { name: 'PURPLE', colour: '#C93BFF' },
  green: { name: 'GREEN', colour: '#22B14C' }, blue: { name: 'BLUE', colour: '#2F6BFF' }, red: { name: 'RED', colour: '#FF2A2A' },
}
const MOVES = [
  ['Idle', 'Idle_Loop'], ['Walk', 'Walk_Loop'], ['Jab', 'Punch_Jab'], ['Cross', 'Punch_Cross'], ['Hit (head)', 'Hit_Head'],
  ['Hit (body)', 'Hit_Chest'], ['Jump', 'Jump_Start'], ['Roll', 'Roll'], ['Crouch', 'Crouch_Idle_Loop'],
  ['Special (cast)', 'Spell_Simple_Shoot'], ['KO', 'Death01'], ['Victory', 'Dance_Loop'],
]

export default function KR3DTest({ onClose }) {
  const hostRef = useRef(null)
  const api = useRef(null)
  const [status, setStatus] = useState('Loading 3D model…')
  const [cols, setCols] = useState({ left: 'yellow', right: 'purple' })
  const [finish, setFinish] = useState('chrome') // chrome | matte

  useEffect(() => {
    const host = hostRef.current
    let dead = false, raf = 0
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.shadowMap.enabled = true
    host.appendChild(renderer.domElement)
    const scene = new THREE.Scene()
    scene.background = new THREE.Color('#05060b')
    const camera = new THREE.PerspectiveCamera(32, 16 / 9, 0.1, 200)
    camera.position.set(0, 1.3, 5.6); camera.lookAt(0, 0.95, 0)

    // lights: cool key, warm rim from the black hole, soft fill
    scene.add(new THREE.HemisphereLight('#8fa8ff', '#1a1020', 0.7))
    const key = new THREE.DirectionalLight('#ffffff', 2.2); key.position.set(-3, 5, 4); key.castShadow = true; key.shadow.mapSize.set(1024, 1024); scene.add(key)
    const rim = new THREE.DirectionalLight('#ffcf7a', 2.5); rim.position.set(4, 3, -5); scene.add(rim)
    const fill = new THREE.PointLight('#6f8cff', 8, 12); fill.position.set(0, 2, 3); scene.add(fill)

    // stars
    const starGeo = new THREE.BufferGeometry(), pts = []
    for (let i = 0; i < 1500; i++) { const r = 40 + Math.random() * 40, t = Math.random() * Math.PI * 2, p = Math.acos(2 * Math.random() - 1); pts.push(r * Math.sin(p) * Math.cos(t), r * Math.sin(p) * Math.sin(t) * 0.6 + 5, -Math.abs(r * Math.cos(p)) - 5) }
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3))
    scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: '#ffffff', size: 0.12, sizeAttenuation: true })))
    // black hole with a glowing accretion ring
    const bh = new THREE.Group(); bh.position.set(5, 5.5, -30)
    bh.add(new THREE.Mesh(new THREE.CircleGeometry(3, 64), new THREE.MeshBasicMaterial({ color: '#000' })))
    const ring = new THREE.Mesh(new THREE.TorusGeometry(5.2, 0.45, 16, 128), new THREE.MeshBasicMaterial({ color: '#ffd9a0' })); ring.rotation.x = 1.35; bh.add(ring)
    const halo = new THREE.Mesh(new THREE.RingGeometry(3.05, 3.6, 64), new THREE.MeshBasicMaterial({ color: '#ffe7b8', transparent: true, opacity: 0.8 })); bh.add(halo)
    scene.add(bh)
    // planet curve
    const planet = new THREE.Mesh(new THREE.SphereGeometry(40, 64, 32), new THREE.MeshStandardMaterial({ color: '#1f3d82', roughness: 0.9, emissive: '#0a1640', emissiveIntensity: 0.6 }))
    planet.position.set(-20, -44, -45); scene.add(planet)
    // floating rock platform
    const rock = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 3.2, 0.7, 9, 1), new THREE.MeshStandardMaterial({ color: '#3a3f52', roughness: 0.95, flatShading: true }))
    rock.position.y = -0.35; rock.receiveShadow = true; scene.add(rock)
    const glow = new THREE.Mesh(new THREE.RingGeometry(3.1, 4.4, 64), new THREE.MeshBasicMaterial({ color: '#8fb6ff', transparent: true, opacity: 0.12, side: THREE.DoubleSide }))
    glow.rotation.x = -Math.PI / 2; glow.position.y = -0.69; scene.add(glow)

    // keep both fighters in shot on any screen: pull the camera back on narrow (portrait) screens
    const fitSize = () => {
      const w = host.clientWidth || 1, h = host.clientHeight || 1
      renderer.setSize(w, h, false); renderer.domElement.style.width = '100%'; renderer.domElement.style.height = '100%'
      camera.aspect = w / h
      const halfWidthNeeded = 2.0 // fighters stand at x = ±1.1, plus room for a punch / roll
      const dist = Math.max(5.6, halfWidthNeeded / (Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect))
      camera.position.set(0, 1.3 + (dist - 5.6) * 0.12, dist); camera.lookAt(0, 0.95, 0)
      camera.updateProjectionMatrix()
    }
    fitSize(); const ro = new ResizeObserver(fitSize); ro.observe(host)

    const clock = new THREE.Clock()
    const fighters = {}
    const loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder)
    const onLoaded = gltf => {
      if (dead) return
      const clips = Object.fromEntries(gltf.animations.map(c => [c.name, c]))
      const make = (side, colourKey) => {
        const obj = cloneSkinned(gltf.scene)
        obj.position.set(side === 'left' ? -1.1 : 1.1, 0, 0)
        obj.rotation.y = side === 'left' ? Math.PI / 2 : -Math.PI / 2 // face each other, side-on
        obj.traverse(o => { if (o.isMesh) { o.castShadow = true; o.material = Array.isArray(o.material) ? o.material.map(m => m.clone()) : o.material.clone() } })
        scene.add(obj)
        const mixer = new THREE.AnimationMixer(obj)
        const f = { obj, mixer, current: null, side }
        f.play = (name, { loop, after } = {}) => {
          const clip = clips[name]; if (!clip) return
          const act = mixer.clipAction(clip)
          const isLoop = loop ?? /_Loop$|^Idle|Sword_Idle/.test(name)
          act.reset(); act.setLoop(isLoop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity); act.clampWhenFinished = !isLoop
          if (f.current && f.current !== act) act.crossFadeFrom(f.current, 0.15, false)
          act.play(); f.current = act
          if (!isLoop) { const back = after === undefined ? 'Idle_Loop' : after; if (back) { clearTimeout(f.t); f.t = setTimeout(() => f.play(back), clip.duration * 1000 - 120) } }
        }
        f.recolour = (key, look) => {
          const c = new THREE.Color(FIGHTERS[key].colour)
          obj.traverse(o => {
            if (!o.isMesh) return
            for (const m of (Array.isArray(o.material) ? o.material : [o.material])) {
              const joints = /Joint/i.test(m.name || '')
              m.color = joints ? c.clone().multiplyScalar(0.35) : c.clone()
              m.metalness = look === 'chrome' ? (joints ? 0.6 : 0.95) : 0.05
              m.roughness = look === 'chrome' ? (joints ? 0.4 : 0.18) : 0.6
              m.emissive = c.clone(); m.emissiveIntensity = look === 'chrome' ? 0.08 : 0.02
              m.needsUpdate = true
            }
          })
        }
        f.play('Idle_Loop')
        return f
      }
      fighters.left = make('left', 'yellow'); fighters.right = make('right', 'purple')
      // chrome needs something to reflect: a simple environment from the scene lights
      const pm = new THREE.PMREMGenerator(renderer); const envScene = new THREE.Scene()
      envScene.add(new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), new THREE.MeshBasicMaterial({ color: '#223', side: THREE.BackSide })))
      const lamp = (c, x, y, z) => { const m = new THREE.Mesh(new THREE.SphereGeometry(1.5, 16, 8), new THREE.MeshBasicMaterial({ color: c })); m.position.set(x, y, z); envScene.add(m) }
      lamp('#ffffff', -5, 6, 4); lamp('#ffd9a0', 6, 3, -6); lamp('#6f8cff', 0, -4, 6)
      scene.environment = pm.fromScene(envScene, 0.04).texture
      api.current = { fighters, clips }
      setStatus('')
    }
    // try the small compressed model first; if this phone can't decompress it, load the full-size copy
    loader.load(MODEL_URL, onLoaded, undefined, () => {
      if (dead) return
      setStatus('Loading the full-size 3D model…')
      new GLTFLoader().load(MODEL_URL_FULL, onLoaded, undefined, () => setStatus('Could not load the 3D model.'))
    })

    const tick = () => {
      const dt = Math.min(0.05, clock.getDelta())
      for (const f of Object.values(fighters)) f.mixer.update(dt)
      ring.rotation.z += dt * 0.2
      renderer.render(scene, camera)
      raf = requestAnimationFrame(tick)
    }
    tick()
    return () => { dead = true; cancelAnimationFrame(raf); ro.disconnect(); for (const f of Object.values(fighters)) clearTimeout(f.t); renderer.dispose(); try { renderer.forceContextLoss() } catch (e) { /* ignore */ } host.removeChild(renderer.domElement) }
  }, [])

  // apply colours / finish
  useEffect(() => { const a = api.current; if (!a) return; a.fighters.left.recolour(cols.left, finish); a.fighters.right.recolour(cols.right, finish) }, [cols, finish, status])

  const play = (side, name) => api.current?.fighters[side]?.play(name)
  const autoFight = () => {
    const a = api.current; if (!a) return
    const L = a.fighters.left, R = a.fighters.right
    const seq = [
      [0, () => L.play('Punch_Jab')], [250, () => R.play('Hit_Head')],
      [700, () => L.play('Punch_Cross')], [950, () => R.play('Hit_Chest')],
      [1600, () => R.play('Punch_Jab')], [1850, () => L.play('Hit_Head')],
      [2400, () => L.play('Spell_Simple_Shoot')], [2900, () => R.play('Death01', { after: null })],
      [4200, () => L.play('Dance_Loop')],
      [7200, () => { L.play('Idle_Loop'); R.play('Idle_Loop') }],
    ]
    seq.forEach(([t, fn]) => setTimeout(fn, t))
  }

  const btn = { padding: '6px 10px', borderRadius: 10, border: '1px solid #2A3138', background: 'rgba(26,31,36,0.9)', color: '#F2F2F2', fontSize: 13, fontWeight: 700, cursor: 'pointer' }
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 520, background: '#05060b', color: '#F2F2F2', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 'calc(6px + env(safe-area-inset-top, 0px)) 12px 6px' }}>
        <button style={btn} onClick={onClose}>Close</button>
        <b style={{ fontFamily: "'Saira Condensed', sans-serif", fontStyle: 'italic', fontSize: 20, flex: 1 }}>KR FIGHT · 3D test</b>
        <button style={{ ...btn, borderColor: '#F5C542', color: '#F5C542' }} onClick={autoFight}>▶ Auto fight</button>
        <button style={btn} onClick={() => setFinish(f => f === 'chrome' ? 'matte' : 'chrome')}>{finish === 'chrome' ? 'Chrome' : 'Matte'}</button>
      </div>
      <div ref={hostRef} style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        {status ? <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9AA3AE' }}>{status}</div> : null}
      </div>
      <div style={{ padding: '8px 10px calc(8px + env(safe-area-inset-bottom, 0px))', display: 'flex', flexDirection: 'column', gap: 6, maxHeight: '40%', overflowY: 'auto' }}>
        {['left', 'right'].map(side => (
          <div key={side} style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <select value={cols[side]} onChange={e => setCols(c => ({ ...c, [side]: e.target.value }))} style={{ ...btn, color: FIGHTERS[cols[side]].colour }}>
              {Object.entries(FIGHTERS).map(([k, v]) => <option key={k} value={k}>{v.name}</option>)}
            </select>
            {MOVES.map(([label, name]) => <button key={name} style={btn} onClick={() => play(side, name)}>{label}</button>)}
          </div>
        ))}
        <div style={{ fontSize: 11, color: '#7d8691' }}>Animations: Universal Animation Library by Quaternius (CC0). No kicks, block or hooks in this pack yet.</div>
      </div>
    </div>
  )
}
