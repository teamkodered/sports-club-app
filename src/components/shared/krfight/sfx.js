// KR FIGHT 2 -- synthesised sound (no audio files): layered hits, blocks, whooshes, specials,
// a crowd that reacts, a ring bell, a short echo on big moments, and a light fight-music loop.
export function makeSfx() {
  const Ctx = window.AudioContext || window.webkitAudioContext
  const nop = () => {}
  if (!Ctx) return { hit: nop, block: nop, whoosh: nop, special: nop, superStart: nop, ko: nop, bell: nop, land: nop, cheer: nop, ui: nop, music: nop, stopMusic: nop, setMuted: nop, resume: nop, close: nop, say: nop }
  const ctx = new Ctx()
  const master = ctx.createGain(); master.gain.value = 0.9; master.connect(ctx.destination)
  // short echo bus for big moments
  const echoIn = ctx.createGain(); echoIn.gain.value = 0.35
  const delay = ctx.createDelay(1); delay.delayTime.value = 0.16
  const fb = ctx.createGain(); fb.gain.value = 0.35
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2200
  echoIn.connect(delay); delay.connect(lp); lp.connect(fb); fb.connect(delay); lp.connect(master)
  const musicBus = ctx.createGain(); musicBus.gain.value = 0.16; musicBus.connect(master)

  let noiseBuf = null
  const getNoise = () => {
    if (noiseBuf) return noiseBuf
    const len = ctx.sampleRate * 2; noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate)
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1
    return noiseBuf
  }
  const now = () => ctx.currentTime
  function noise({ dur, type = 'lowpass', freq = 1000, to, q = 1, vol = 0.4, at = 0, out = master, echo = false, attack = 0.002 }) {
    const t = now() + at
    const src = ctx.createBufferSource(); src.buffer = getNoise()
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q
    if (to) f.frequency.exponentialRampToValueAtTime(to, t + dur)
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    src.connect(f); f.connect(g); g.connect(out); if (echo) g.connect(echoIn)
    src.start(t, Math.random()); src.stop(t + dur + 0.05)
  }
  function tone({ freq, to, dur, vol = 0.3, type = 'sine', at = 0, out = master, echo = false, attack = 0.003 }) {
    const t = now() + at
    const o = ctx.createOscillator(), g = ctx.createGain(); o.type = type; o.frequency.setValueAtTime(freq, t)
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur)
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    o.connect(g); g.connect(out); if (echo) g.connect(echoIn)
    o.start(t); o.stop(t + dur + 0.05)
  }

  // ---- music: 4-bar loop, ~132 bpm, scheduled ahead ----
  let musicTimer = null, nextNote = 0, step16 = 0
  const BPM = 132, S16 = 60 / BPM / 4
  const bass = [0, 0, 0, 0, 3, 3, 5, 5, 0, 0, 0, 0, 7, 7, 5, 3] // semitones over A1, one per beat-pair
  function schedule() {
    while (nextNote < now() + 0.15) {
      const s = step16 % 64, at = nextNote - now()
      if (s % 4 === 0) { tone({ freq: 140, to: 42, dur: 0.22, vol: 0.9, at, out: musicBus }) } // kick
      if (s % 8 === 4) noise({ dur: 0.14, type: 'bandpass', freq: 1800, q: 0.8, vol: 0.5, at, out: musicBus }) // snare
      if (s % 2 === 1) noise({ dur: 0.04, type: 'highpass', freq: 7000, vol: 0.18, at, out: musicBus }) // hat
      if (s % 2 === 0) { const n = bass[Math.floor(s / 4)]; tone({ freq: 55 * Math.pow(2, n / 12), dur: S16 * 1.8, vol: 0.32, type: 'sawtooth', at, out: musicBus }) }
      if (s % 16 === 14) tone({ freq: 440 * Math.pow(2, bass[Math.floor(s / 4)] / 12), dur: 0.12, vol: 0.06, type: 'square', at, out: musicBus })
      nextNote += S16; step16++
    }
  }

  let muted = false
  const sayQ = []
  return {
    hit: (heavy, big) => {
      tone({ freq: big ? 110 : heavy ? 95 : 150, to: 38, dur: big ? 0.3 : heavy ? 0.2 : 0.12, vol: big ? 0.9 : heavy ? 0.75 : 0.5 })
      noise({ dur: heavy ? 0.16 : 0.08, freq: heavy ? 1400 : 2600, vol: heavy ? 0.6 : 0.45, echo: big })
      noise({ dur: 0.03, type: 'highpass', freq: 3500, vol: 0.35 }) // snap
      if (heavy) tone({ freq: 70, to: 30, dur: 0.25, vol: 0.4, type: 'square' })
    },
    block: () => { tone({ freq: 900, dur: 0.07, vol: 0.18, type: 'triangle' }); tone({ freq: 1340, dur: 0.06, vol: 0.12, type: 'triangle' }); noise({ dur: 0.05, type: 'bandpass', freq: 3000, q: 2, vol: 0.2 }) },
    whoosh: heavy => noise({ dur: heavy ? 0.16 : 0.1, type: 'bandpass', freq: heavy ? 900 : 1500, to: heavy ? 2600 : 3800, q: 1.2, vol: heavy ? 0.22 : 0.14, attack: 0.03 }),
    special: () => { tone({ freq: 260, to: 980, dur: 0.35, vol: 0.2, type: 'sawtooth' }); tone({ freq: 520, to: 1960, dur: 0.3, vol: 0.08, type: 'square', echo: true }) },
    superStart: () => {
      noise({ dur: 0.6, type: 'bandpass', freq: 300, to: 4000, q: 1, vol: 0.4, attack: 0.3 })
      tone({ freq: 110, to: 880, dur: 0.55, vol: 0.25, type: 'sawtooth', echo: true })
      tone({ freq: 55, to: 30, dur: 0.8, vol: 0.6, at: 0.5 })
    },
    ko: () => { tone({ freq: 160, to: 32, dur: 1.0, vol: 0.9, echo: true }); noise({ dur: 0.7, freq: 600, vol: 0.6, echo: true }); tone({ freq: 220, to: 55, dur: 0.8, vol: 0.25, type: 'sawtooth' }) },
    bell: () => { for (const [f, v] of [[880, 0.22], [1320, 0.1], [2210, 0.06], [3300, 0.03]]) tone({ freq: f, dur: 1.4, vol: v, echo: true }) },
    land: hard => { tone({ freq: hard ? 90 : 120, to: 40, dur: hard ? 0.3 : 0.1, vol: hard ? 0.6 : 0.2 }); noise({ dur: hard ? 0.3 : 0.08, freq: 500, vol: hard ? 0.4 : 0.12 }) },
    cheer: (big = 1) => { noise({ dur: 1.8 * big, type: 'bandpass', freq: 1100, q: 0.4, vol: 0.18 * big, attack: 0.25 }); noise({ dur: 1.4 * big, type: 'bandpass', freq: 2400, q: 0.6, vol: 0.08 * big, attack: 0.2 }) },
    ui: () => tone({ freq: 660, to: 990, dur: 0.07, vol: 0.12, type: 'triangle' }),
    music: () => { if (musicTimer) return; nextNote = now() + 0.05; step16 = 0; musicTimer = setInterval(schedule, 40) },
    stopMusic: () => { clearInterval(musicTimer); musicTimer = null },
    setMuted: m => { muted = m; master.gain.setTargetAtTime(m ? 0 : 0.9, now(), 0.02); if (m) window.speechSynthesis?.cancel() },
    // announcer voice (the device's built-in speech); skipped when muted
    say: (text, pitch = 0.5) => {
      const ss = window.speechSynthesis
      if (!ss || muted) return
      try { ss.cancel(); const u = new SpeechSynthesisUtterance(text); u.rate = 0.95; u.pitch = pitch; u.volume = 1; sayQ.push(u); ss.speak(u) } catch (e) { /* ignore */ }
    },
    resume: () => ctx.resume().catch(() => {}),
    close: () => { clearInterval(musicTimer); window.speechSynthesis?.cancel(); ctx.close().catch(() => {}) },
  }
}
