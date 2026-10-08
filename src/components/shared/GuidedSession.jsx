import { useEffect, useRef, useState } from 'react'

// Guided meditation / visualisation session (Oct 2026).
// Breathing shape + count, spoken count (phone voice) and/or bell cues, optional
// background sound (all generated in the browser -- no audio files), timer with
// pause / stop, screen kept awake. When the time is up the session is logged
// through the normal save (onComplete(minutes)).

const PROMPTS = {
  bodyscan: ['Settle into a comfortable position and let your eyes close.', 'Bring your attention to your feet. Let them soften.', 'Move up to your calves and knees. Let any tension go.', 'Notice your thighs and hips. Let them feel heavy.', 'Relax your stomach and lower back.', 'Let your chest rise and fall on its own.', 'Drop your shoulders away from your ears.', 'Soften your arms, hands and fingers.', 'Relax your jaw, your face and the space between your eyes.', 'Feel your whole body, calm and heavy.'],
  focus: ['Rest your attention on the breath.', 'When your mind wanders, notice it and come back.', 'Feel the air at the tip of your nose.', 'One breath at a time. Nothing else to do.', 'Notice sounds around you, then return to the breath.', 'Stay with this moment.'],
  confidence: ['Breathe in strength, breathe out doubt.', 'Remember a time you performed at your best.', 'You have done the work. Trust your preparation.', 'Say your cue word to yourself.', 'Feel calm power in your body.', 'You belong here.'],
  emotions: ['Notice what you are feeling, without judging it.', 'Let thoughts pass like clouds.', 'Breathe into any tension and let it soften.', 'Mistakes are information, not failure. Let it go.', 'Come back to calm, steady breathing.', 'You are in control of your response.'],
  calm: ['Let your breath slow down.', 'Feel your body getting heavier and calmer.', 'Let your shoulders drop.', 'Every out-breath, let a little more tension go.', 'Calm body, clear mind.'],
  vis_technique: ['Close your eyes and see yourself in your stance.', 'See the technique clearly, in slow motion.', 'Feel your feet, hips and shoulders working together.', 'Now see it at full speed, crisp and sharp.', 'Hear the sound of a clean connection.', 'Repeat it perfectly, again and again.'],
  vis_tactics: ['See your opponent in front of you.', 'Notice their stance, their range, their habits.', 'See yourself controlling the distance.', 'Create the opening, then take it.', 'Adjust calmly when something changes.', 'Stay one step ahead.'],
  vis_confidence: ['See yourself walking out calm and confident.', 'Hear your name being announced.', 'Feel the energy, ready and in control.', 'See yourself winning the exchanges.', 'See yourself finishing strong.', 'This is you at your best.'],
  vis_pressure: ['See yourself under pressure, and stay calm.', 'Your opponent comes forward fast. You breathe and stay composed.', 'Something goes wrong. You reset and carry on.', 'You feel tired, and you keep going.', 'You stick to the plan.', 'You finish strongly.'],
  vis_performance: ['See yourself arriving at the venue.', 'Warming up, feeling sharp and ready.', 'Walking to the ring, calm and focused.', 'The opening bell. Your first exchange is clean.', 'Listening to your corner between rounds.', 'The final round. You give everything.', 'The end. Proud of your performance.'],
}

// Breathing patterns [in, hold, out, hold] (seconds) by meditation type
function patternFor(kind, type = '') {
  const t = type.toLowerCase()
  if (kind === 'visualisation') return { mode: 'prompts', breath: [4, 0, 6, 0], prompts: t.match(/opponent|southpaw|scenario|range|ring\/cage|openings|tactic|plan a/) ? 'vis_tactics' : t.match(/pressure|tired|mistake|aggressive|crowd|losing|not working|frustrat|starting quickly|finishing/) ? 'vis_pressure' : t.match(/venue|weigh|changing room|wrapping|warming|walking to|opening bell|first exchange|game plan|corner|final round|end of|post-fight|between-round recovery|tactical adjust/) ? 'vis_performance' : t.match(/confiden|winning|best|composed|announced|trusting|successful|strong final|recovering/) ? 'vis_confidence' : 'vis_technique' }
  if (t.includes('box breathing')) return { mode: 'breath', breath: [4, 4, 4, 4] }
  if (t.includes('between-round')) return { mode: 'breath', breath: [4, 0, 6, 0], minutes: 1 }
  if (t.match(/slow controlled|recovery breathing|breath-focused|breath concentration/)) return { mode: 'breath', breath: [5, 0, 5, 0] }
  if (t.match(/pre-fight calming|competition-nerves|sleep|relaxation meditation|stress-release|pressure meditation/)) return { mode: 'breath', breath: [4, 7, 8, 0] }
  if (t.match(/body scan|progressive|muscle-relaxation|grounding|switch-off/)) return { mode: 'prompts', breath: [4, 0, 6, 0], prompts: 'bodyscan' }
  if (t.match(/confiden|self-talk|strengths|achievement|gratitude|preparation|cue-word|affirmation|self-belief/)) return { mode: 'prompts', breath: [4, 0, 6, 0], prompts: 'confidence' }
  if (t.match(/thought|acceptance|emotional|reset|mistake|frustration|non-judgement|composed/)) return { mode: 'prompts', breath: [4, 0, 6, 0], prompts: 'emotions' }
  if (t.match(/mindful|present|single-point|sound|sensory|open-awareness|distraction|moving|shadowboxing/)) return { mode: 'prompts', breath: [4, 0, 6, 0], prompts: 'focus' }
  return { mode: 'prompts', breath: [4, 0, 6, 0], prompts: 'calm' }
}

// ---- sound (Web Audio, generated) ----
function makeAudio() {
  const Ctx = window.AudioContext || window.webkitAudioContext
  if (!Ctx) return null
  const ctx = new Ctx()
  const master = ctx.createGain(); master.gain.value = 0.9; master.connect(ctx.destination)
  let bg = null
  const bell = (freq = 528, len = 2.4, vol = 0.25) => {
    const o = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain()
    o.type = 'sine'; o.frequency.value = freq; o2.type = 'sine'; o2.frequency.value = freq * 2.76
    const g2 = ctx.createGain(); g2.gain.value = 0.18
    o.connect(g); o2.connect(g2); g2.connect(g); g.connect(master)
    const n = ctx.currentTime
    g.gain.setValueAtTime(0.0001, n); g.gain.exponentialRampToValueAtTime(vol, n + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, n + len)
    o.start(n); o2.start(n); o.stop(n + len); o2.stop(n + len)
  }
  const noiseBuffer = () => {
    const b = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), d = b.getChannelData(0)
    let last = 0
    for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5 } // brown-ish
    return b
  }
  const startBg = kind => {
    stopBg()
    if (kind === 'none') return
    const g = ctx.createGain(); g.gain.value = 0; g.connect(master)
    const nodes = []
    if (kind === 'rain' || kind === 'noise') {
      const src = ctx.createBufferSource(); src.buffer = noiseBuffer(); src.loop = true
      const f = ctx.createBiquadFilter(); f.type = kind === 'rain' ? 'highpass' : 'lowpass'; f.frequency.value = kind === 'rain' ? 900 : 500
      src.connect(f); f.connect(g); src.start(); nodes.push(src)
      if (kind === 'rain') { // patter: slowly varying volume
        const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 0.17; lg.gain.value = 0.05; lfo.connect(lg); lg.connect(g.gain); lfo.start(); nodes.push(lfo)
      }
      g.gain.linearRampToValueAtTime(kind === 'rain' ? 0.16 : 0.22, ctx.currentTime + 2)
    } else if (kind === 'drone') {
      for (const fq of [110, 110.6, 165]) { const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = fq; o.connect(g); o.start(); nodes.push(o) }
      g.gain.linearRampToValueAtTime(0.06, ctx.currentTime + 3)
    }
    bg = { g, nodes }
  }
  function stopBg() { if (!bg) return; try { bg.g.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.5); const nodes = bg.nodes; setTimeout(() => nodes.forEach(n => { try { n.stop() } catch { /* stopped */ } }), 600) } catch { /* ignore */ } bg = null }
  return { ctx, bell, startBg, stopBg, close: () => { stopBg(); setTimeout(() => ctx.close().catch(() => {}), 700) } }
}

const say = text => { try { const u = new SpeechSynthesisUtterance(text); u.rate = 0.9; u.pitch = 1; window.speechSynthesis.cancel(); window.speechSynthesis.speak(u) } catch { /* no voice */ } }
const WORDS = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight']

export default function GuidedSession({ kind = 'meditation', type = '', colour = '#22B14C', onComplete, onClose }) {
  const plan = patternFor(kind, type)
  const [minutes, setMinutes] = useState(plan.minutes || 5)
  const [voiceOn, setVoiceOn] = useState(true)
  const [bellOn, setBellOn] = useState(true)
  const [bgKind, setBgKind] = useState('rain')
  const [running, setRunning] = useState(false)
  const [paused, setPaused] = useState(false)
  const [elapsed, setElapsed] = useState(0) // seconds
  const [done, setDone] = useState(false)
  const audio = useRef(null)
  const wake = useRef(null)
  const lastTick = useRef(null)
  const promptIdx = useRef(0)
  const total = Math.max(30, Math.round(minutes * 60))

  // phase from elapsed time
  const [inS, h1, outS, h2] = plan.breath
  const cycle = inS + h1 + outS + h2
  const tc = elapsed % cycle
  const phase = tc < inS ? 'in' : tc < inS + h1 ? 'hold' : tc < inS + h1 + outS ? 'out' : 'hold2'
  const phaseStart = phase === 'in' ? 0 : phase === 'hold' ? inS : phase === 'out' ? inS + h1 : inS + h1 + outS
  const phaseLen = phase === 'in' ? inS : phase === 'hold' ? h1 : phase === 'out' ? outS : h2
  const count = Math.floor(tc - phaseStart) + 1
  const scale = phase === 'in' ? 0.55 + 0.45 * ((tc - phaseStart) / Math.max(1, inS)) : phase === 'hold' ? 1 : phase === 'out' ? 1 - 0.45 * ((tc - phaseStart) / Math.max(1, outS)) : 0.55
  const label = phase === 'in' ? 'Breathe in' : phase === 'out' ? 'Breathe out' : 'Hold'
  const prompts = plan.mode === 'prompts' ? PROMPTS[plan.prompts] : null
  const [promptText, setPromptText] = useState(prompts ? prompts[0] : '')

  useEffect(() => () => { audio.current?.close(); try { window.speechSynthesis.cancel() } catch { /* */ } wake.current?.release?.().catch?.(() => {}) }, [])

  // 1-second clock
  useEffect(() => {
    if (!running || paused || done) return
    const t = setInterval(() => setElapsed(e => e + 1), 1000)
    return () => clearInterval(t)
  }, [running, paused, done])

  // cues on each second
  useEffect(() => {
    if (!running || paused || done) return
    if (elapsed >= total) {
      setDone(true); audio.current?.stopBg()
      if (bellOn) { audio.current?.bell(432, 4, 0.3); setTimeout(() => audio.current?.bell(432, 4, 0.25), 1600) }
      if (voiceOn) setTimeout(() => say('Session complete. Well done.'), 300)
      onComplete(Math.max(1, Math.round(total / 60)))
      return
    }
    if (lastTick.current === elapsed) return
    lastTick.current = elapsed
    const atPhaseStart = tc === phaseStart
    if (prompts) {
      // breathing in the background, a spoken prompt about every 40 s
      if (elapsed % 40 === 0) { const p = prompts[promptIdx.current % prompts.length]; promptIdx.current += 1; setPromptText(p); if (voiceOn) say(p); else if (bellOn) audio.current?.bell(528, 2, 0.15) }
      return
    }
    if (atPhaseStart && phaseLen > 0) {
      if (bellOn) audio.current?.bell(phase === 'in' ? 528 : phase === 'out' ? 396 : 462, 1.6, 0.18)
      if (voiceOn) say(phase === 'in' ? 'Breathe in' : phase === 'out' ? 'Breathe out' : 'Hold')
    } else if (voiceOn && count > 1 && count <= 8 && phaseLen > 0) say(WORDS[count])
  }, [elapsed, running, paused, done]) // eslint-disable-line react-hooks/exhaustive-deps

  async function start() {
    audio.current = makeAudio()
    try { await audio.current?.ctx.resume() } catch { /* */ }
    audio.current?.startBg(bgKind)
    if (bellOn) audio.current?.bell(528, 3, 0.25)
    try { wake.current = await navigator.wakeLock?.request('screen') } catch { /* not supported */ }
    if (prompts && voiceOn) say(prompts[0])
    promptIdx.current = 1
    setElapsed(0); setRunning(true); setPaused(false); setDone(false)
  }
  function togglePause() {
    if (paused) { audio.current?.startBg(bgKind); setPaused(false) } else { audio.current?.stopBg(); try { window.speechSynthesis.cancel() } catch { /* */ } setPaused(true) }
  }
  function stopEarly() {
    const mins = Math.floor(elapsed / 60)
    audio.current?.stopBg(); try { window.speechSynthesis.cancel() } catch { /* */ }
    if (mins >= 1 && confirm(`Stop now and save ${mins} min?`)) { setDone(true); onComplete(mins); return }
    onClose()
  }

  const left = Math.max(0, total - elapsed)
  const mmss = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
  const chip = (on, text, onClick) => <button type="button" onClick={onClick} aria-pressed={on} style={{ height: 34, padding: '0 12px', borderRadius: 17, border: `1px solid ${on ? colour : '#2A3138'}`, background: on ? colour + '26' : '#1A1F24', color: '#F2F2F2', fontSize: 13, cursor: 'pointer' }}>{text}</button>

  return (
    <div role="dialog" aria-modal="true" style={{ position: 'fixed', inset: 0, zIndex: 490, background: '#05070A', color: '#F2F2F2', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '18px 16px calc(18px + env(safe-area-inset-bottom, 0px))', boxSizing: 'border-box', overflowY: 'auto' }}>
      <div style={{ width: '100%', maxWidth: 480, display: 'flex', alignItems: 'center', gap: 10 }}>
        <button type="button" onClick={() => (running && !done ? stopEarly() : onClose())} style={{ background: 'none', border: '1px solid #2A3138', color: '#F2F2F2', borderRadius: 8, height: 36, padding: '0 12px', cursor: 'pointer' }}>{running && !done ? 'Stop' : 'Close'}</button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: 9, letterSpacing: 2, color: '#9A9A9A' }}>{kind === 'visualisation' ? 'GUIDED VISUALISATION' : 'GUIDED MEDITATION'}</div>
          <div style={{ fontWeight: 700, fontSize: 15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{type}</div>
        </div>
      </div>

      {!running ? (
        <div style={{ width: '100%', maxWidth: 480, marginTop: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <p style={{ fontSize: 13, color: '#CFCFCF', margin: 0 }}>
            {plan.mode === 'breath' ? `Breathing pattern: in ${inS}${h1 ? ` · hold ${h1}` : ''} · out ${outS}${h2 ? ` · hold ${h2}` : ''} seconds.` : 'Calm breathing with spoken prompts about every 40 seconds.'}
          </p>
          <div><div style={{ fontSize: 12, color: '#9A9A9A', marginBottom: 6 }}>Length</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{[1, 3, 5, 10, 15, 20].map(m => chip(minutes === m, `${m} min`, () => setMinutes(m)))}</div></div>
          <div><div style={{ fontSize: 12, color: '#9A9A9A', marginBottom: 6 }}>Cues</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{chip(voiceOn, '🗣 Spoken count', () => setVoiceOn(v => !v))}{chip(bellOn, '🔔 Bell / tone', () => setBellOn(v => !v))}</div></div>
          <div><div style={{ fontSize: 12, color: '#9A9A9A', marginBottom: 6 }}>Background sound</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{[['rain', '🌧 Rain'], ['noise', '🌫 Soft noise'], ['drone', '〰 Drone'], ['none', 'None']].map(([k, l]) => chip(bgKind === k, l, () => setBgKind(k)))}</div></div>
          <button type="button" onClick={start} style={{ marginTop: 6, height: 52, border: 'none', cursor: 'pointer', clipPath: 'polygon(14px 0, calc(100% - 14px) 0, 100% 50%, calc(100% - 14px) 100%, 14px 100%, 0 50%)', background: colour, color: '#0A0A0A', fontFamily: "'Saira Condensed', sans-serif", fontStyle: 'italic', fontWeight: 800, fontSize: 22, letterSpacing: 2 }}>▶ START SESSION</button>
          <p style={{ fontSize: 11, color: '#777', margin: 0 }}>Keep the app open on screen -- some phones pause sound when the screen locks. Logged automatically when the time is up.</p>
        </div>
      ) : (
        <div style={{ flex: 1, width: '100%', maxWidth: 480, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 22 }}>
          <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: 22, color: '#9A9A9A' }}>{done ? 'Complete' : mmss(left)}</div>
          <div style={{ width: 240, height: 240, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ width: 240, height: 240, borderRadius: '50%', background: `radial-gradient(circle, ${colour}55, ${colour}11 70%)`, border: `2px solid ${colour}`, boxShadow: `0 0 40px ${colour}66`,
              transform: `scale(${done ? 0.7 : scale})`, transition: 'transform 1s linear', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
              {!done && plan.mode === 'breath' && <><div style={{ fontSize: 20, fontWeight: 700 }}>{label}</div><div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: 34 }}>{phaseLen ? count : ''}</div></>}
              {!done && plan.mode === 'prompts' && <div style={{ fontSize: 14, color: '#CFCFCF' }}>{label}</div>}
              {done && <div style={{ fontSize: 22, fontWeight: 700 }}>✓ Logged</div>}
            </div>
          </div>
          {prompts && !done && <p style={{ fontSize: 17, lineHeight: 1.45, textAlign: 'center', minHeight: 52, margin: 0 }}>{promptText}</p>}
          {!done ? (
            <div style={{ display: 'flex', gap: 10 }}>
              <button type="button" onClick={togglePause} style={{ height: 44, minWidth: 120, borderRadius: 22, border: '1px solid #2A3138', background: '#1A1F24', color: '#F2F2F2', fontSize: 15, cursor: 'pointer' }}>{paused ? '▶ Resume' : '❚❚ Pause'}</button>
              <button type="button" onClick={stopEarly} style={{ height: 44, minWidth: 100, borderRadius: 22, border: '1px solid #E24B4A', background: 'transparent', color: '#E24B4A', fontSize: 15, cursor: 'pointer' }}>■ Stop</button>
            </div>
          ) : (
            <button type="button" onClick={onClose} style={{ height: 46, minWidth: 160, borderRadius: 23, border: 'none', background: colour, color: '#0A0A0A', fontWeight: 700, fontSize: 16, cursor: 'pointer' }}>Done</button>
          )}
        </div>
      )}
    </div>
  )
}
