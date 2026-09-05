import { useState, useRef, useEffect } from 'react'

const SPEEDS = [0.25, 0.5, 1, 1.5, 2]
// Standard video frame rate assumption for "one frame" stepping --
// there's no reliable way to read the real frame rate from a plain
// HTML5 <video> element, so this is a close-enough approximation for
// scrubbing to the right moment rather than a frame-perfect step.
const FRAME_SECONDS = 1 / 30

export default function FightFootagePlayer({ videoUrl, title, onClose }) {
  const videoRef = useRef(null)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)

  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    const onTime = () => setCurrentTime(v.currentTime)
    const onMeta = () => setDuration(v.duration || 0)
    const onPlay = () => setPlaying(true)
    const onPause = () => setPlaying(false)
    v.addEventListener('timeupdate', onTime)
    v.addEventListener('loadedmetadata', onMeta)
    v.addEventListener('play', onPlay)
    v.addEventListener('pause', onPause)
    return () => {
      v.removeEventListener('timeupdate', onTime)
      v.removeEventListener('loadedmetadata', onMeta)
      v.removeEventListener('play', onPlay)
      v.removeEventListener('pause', onPause)
    }
  }, [])

  function togglePlay() {
    const v = videoRef.current
    if (!v) return
    if (v.paused) v.play(); else v.pause()
  }

  function setPlaybackSpeed(s) {
    setSpeed(s)
    if (videoRef.current) videoRef.current.playbackRate = s
  }

  function step(deltaSeconds) {
    const v = videoRef.current
    if (!v) return
    v.pause()
    v.currentTime = Math.min(Math.max(0, v.currentTime + deltaSeconds), v.duration || 0)
  }

  function seekTo(t) {
    const v = videoRef.current
    if (!v) return
    v.currentTime = t
  }

  function fmt(t) {
    if (!isFinite(t)) return '0:00'
    const m = Math.floor(t / 60)
    const s = Math.floor(t % 60).toString().padStart(2, '0')
    return `${m}:${s}`
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)', zIndex: 200, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 12, flexShrink: 0 }}>
        <span style={{ color: '#fff', fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</span>
        <button className="btn btn-sm" onClick={onClose}>✕ Close</button>
      </div>

      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 0, padding: '0 8px' }}>
        <video
          ref={videoRef}
          src={videoUrl}
          style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
          playsInline
          onClick={togglePlay}
        />
      </div>

      {/* Controls -- flex-wrap so this reflows naturally between
          portrait (narrow, wraps to more rows) and landscape (wide,
          stays on fewer rows) without needing separate layouts. */}
      <div style={{ flexShrink: 0, padding: '10px 12px 16px', background: 'rgba(0,0,0,0.6)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11, minWidth: 36 }}>{fmt(currentTime)}</span>
          <input
            type="range"
            min={0}
            max={duration || 0}
            step={0.01}
            value={currentTime}
            onChange={e => seekTo(parseFloat(e.target.value))}
            style={{ flex: 1 }}
          />
          <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11, minWidth: 36 }}>{fmt(duration)}</span>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', alignItems: 'center' }}>
          <button className="btn btn-sm" onClick={() => step(-5)}>⏪ 5s</button>
          <button className="btn btn-sm" onClick={() => step(-FRAME_SECONDS)}>⏮ Frame</button>
          <button className="btn btn-primary" style={{ minWidth: 64, justifyContent: 'center' }} onClick={togglePlay}>{playing ? '⏸' : '▶️'}</button>
          <button className="btn btn-sm" onClick={() => step(FRAME_SECONDS)}>Frame ⏭</button>
          <button className="btn btn-sm" onClick={() => step(5)}>5s ⏩</button>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center', marginTop: 10 }}>
          {SPEEDS.map(s => (
            <button key={s} onClick={() => setPlaybackSpeed(s)}
              style={{ padding: '4px 12px', borderRadius: 20, fontSize: 12, cursor: 'pointer', fontFamily: 'var(--font-sans)',
                border: `1px solid ${speed === s ? '#378ADD' : 'rgba(255,255,255,0.3)'}`,
                background: speed === s ? '#378ADD30' : 'transparent',
                color: speed === s ? '#5FA8EA' : 'rgba(255,255,255,0.7)', fontWeight: speed === s ? 600 : 400 }}>
              {s === 1 ? '1x' : `${s}x`}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
