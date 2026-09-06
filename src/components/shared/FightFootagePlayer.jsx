import { useState, useRef, useEffect } from 'react'
import { supabase } from '../../lib/supabase.js'

const SPEEDS = [0.25, 0.5, 1, 1.5, 2]
// Standard video frame rate assumption for "one frame" stepping --
// there's no reliable way to read the real frame rate from a plain
// HTML5 <video> element, so this is a close-enough approximation for
// scrubbing to the right moment rather than a frame-perfect step.
const FRAME_SECONDS = 1 / 30
const HOLD_THRESHOLD_MS = 220 // how long a press must last before it counts as "hold" rather than a tap
const SLOW_MO_SPEED = 0.25

export default function FightFootagePlayer({ videoUrl, title, footageId, storagePath, isCoach = false, onClose }) {
  const videoRef = useRef(null)
  const wrapperRef = useRef(null)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [isFullscreen, setIsFullscreen] = useState(false)

  // Hold-to-slow-mo + save-clip
  const holdTimerRef = useRef(null)
  const isHoldingRef = useRef(false)
  const [isHolding, setIsHolding] = useState(false) // mirrors isHoldingRef, purely so the on-screen banner can actually re-render
  const holdStartRef = useRef(0)
  const preHoldSpeedRef = useRef(1)
  const [pendingClip, setPendingClip] = useState(null) // { start, end } once released, awaiting Save/Discard
  const [savingClip, setSavingClip] = useState(false)
  const [clips, setClips] = useState([])

  // Markers (highlight/note)
  const [markers, setMarkers] = useState([])
  const [showMarkerChoice, setShowMarkerChoice] = useState(false)
  const [addingNoteText, setAddingNoteText] = useState(null) // string once "Note" chosen, null otherwise
  const [markerRangeStart, setMarkerRangeStart] = useState(null) // set once "Add marker" is first tapped, awaiting the end point
  const [viewingMarkerNote, setViewingMarkerNote] = useState(null)

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

  // If the video element itself ends up in native browser fullscreen
  // (some mobile browsers do this automatically, e.g. on rotation),
  // our custom controls -- which live outside the <video> element --
  // would be left behind and invisible. This redirects that to make
  // the whole wrapper (video + controls together) fullscreen instead,
  // so controls are never lost.
  useEffect(() => {
    function onFullscreenChange() {
      const fsEl = document.fullscreenElement
      setIsFullscreen(!!fsEl)
      if (fsEl && fsEl === videoRef.current && wrapperRef.current) {
        document.exitFullscreen?.().then(() => wrapperRef.current?.requestFullscreen?.().catch(() => {}))
      }
    }
    document.addEventListener('fullscreenchange', onFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange)
  }, [])

  function toggleFullscreen() {
    if (document.fullscreenElement) {
      document.exitFullscreen?.()
    } else {
      wrapperRef.current?.requestFullscreen?.().catch(() => {})
    }
  }

  useEffect(() => {
    if (!footageId) return
    loadClipsAndMarkers()
  }, [footageId])

  async function loadClipsAndMarkers() {
    const [{ data: c }, { data: m }] = await Promise.all([
      supabase.from('fight_footage_clips').select('*').eq('source_footage_id', footageId).order('created_at', { ascending: false }),
      supabase.from('fight_footage_markers').select('*').eq('footage_id', footageId).order('start_seconds'),
    ])
    setClips(c || [])
    setMarkers(m || [])
  }

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

  // --- Hold-to-slow-mo -------------------------------------------------
  // A quick tap still just toggles play/pause (existing behaviour). A
  // press held past HOLD_THRESHOLD_MS switches into slow motion for as
  // long as it's held, and releasing offers to save that stretch as
  // its own clip -- similar to how Samsung's camera/gallery app works.
  function handlePointerDown() {
    if (!footageId) { togglePlay(); return } // clips need a footageId to save against; without one, just behave as a normal tap
    clearTimeout(holdTimerRef.current)
    holdTimerRef.current = setTimeout(() => {
      const v = videoRef.current
      if (!v) return
      isHoldingRef.current = true
      setIsHolding(true)
      preHoldSpeedRef.current = speed
      holdStartRef.current = v.currentTime
      v.playbackRate = SLOW_MO_SPEED
      if (v.paused) v.play()
    }, HOLD_THRESHOLD_MS)
  }

  function handlePointerUp() {
    clearTimeout(holdTimerRef.current)
    const v = videoRef.current
    if (!isHoldingRef.current) {
      togglePlay() // was just a quick tap
      return
    }
    isHoldingRef.current = false
    setIsHolding(false)
    if (v) v.playbackRate = preHoldSpeedRef.current
    setSpeed(preHoldSpeedRef.current)
    const end = v?.currentTime || 0
    const start = holdStartRef.current
    if (isCoach && end - start >= 0.4) {
      setPendingClip({ start: Math.min(start, end), end: Math.max(start, end) })
      if (v) v.pause()
    }
  }

  async function saveClip() {
    if (!pendingClip) return
    setSavingClip(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { data: member } = await supabase.from('members').select('id').eq('auth_id', user.id).single()

      const { data: newClip, error: insertErr } = await supabase.from('fight_footage_clips').insert({
        source_footage_id: footageId,
        start_seconds: pendingClip.start,
        end_seconds: pendingClip.end,
        playback_speed: SLOW_MO_SPEED,
        status: 'processing',
        created_by: member?.id || null,
      }).select().single()
      if (insertErr) throw insertErr

      setClips(prev => [newClip, ...prev])
      setPendingClip(null)

      const { data: sessionData } = await supabase.auth.getSession()
      const accessToken = sessionData?.session?.access_token
      const res = await fetch('/.netlify/functions/trim-footage-clip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ clip_id: newClip.id, source_storage_path: storagePath, start_seconds: pendingClip.start, end_seconds: pendingClip.end }),
      })
      const result = await res.json()
      if (result.error) throw new Error(result.error)
      loadClipsAndMarkers() // refresh to pick up 'ready' status
    } catch (err) {
      alert('Could not save clip: ' + err.message)
      loadClipsAndMarkers()
    }
    setSavingClip(false)
  }

  async function openClip(clip) {
    if (clip.status !== 'ready') { alert(`This clip is still ${clip.status}.`); return }
    const { data: sessionData } = await supabase.auth.getSession()
    const accessToken = sessionData?.session?.access_token
    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/fight-footage-url`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ mode: 'read_clip', clip_id: clip.id }),
    })
    const data = await res.json()
    if (data.error) { alert("Couldn't open this clip: " + data.error); return }
    window.open(data.url, '_blank')
  }

  // --- Markers -----------------------------------------------------
  // Two-tap flow: first tap on "Add marker" sets the start point and
  // waits; the button then reads "End marker here" -- tapping again
  // captures the end point and opens the Highlight/Note choice for
  // that whole span.
  function handleMarkerButtonPress() {
    videoRef.current?.pause()
    if (markerRangeStart === null) {
      setMarkerRangeStart(currentTime)
    } else {
      setShowMarkerChoice(true)
    }
  }

  function cancelMarkerRange() {
    setMarkerRangeStart(null)
    setShowMarkerChoice(false)
    setAddingNoteText(null)
  }

  async function saveMarker(type, text = null) {
    const start = Math.min(markerRangeStart, currentTime)
    const end = Math.max(markerRangeStart, currentTime)
    const { data: { user } } = await supabase.auth.getUser()
    const { data: member } = await supabase.from('members').select('id').eq('auth_id', user.id).single()
    const { data: newMarker } = await supabase.from('fight_footage_markers').insert({
      footage_id: footageId,
      start_seconds: start,
      end_seconds: end,
      marker_type: type,
      note_text: text,
      created_by: member?.id || null,
    }).select().single()
    if (newMarker) setMarkers(prev => [...prev, newMarker].sort((a, b) => a.start_seconds - b.start_seconds))
    setShowMarkerChoice(false)
    setAddingNoteText(null)
    setMarkerRangeStart(null)
  }

  return (
    <div ref={wrapperRef} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)', zIndex: 200, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 12, flexShrink: 0 }}>
        <span style={{ color: '#fff', fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</span>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="btn btn-sm" onClick={toggleFullscreen}>{isFullscreen ? '⤢ Exit fullscreen' : '⛶ Fullscreen'}</button>
          <button className="btn btn-sm" onClick={onClose}>✕ Close</button>
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 0, padding: '0 8px', position: 'relative' }}>
        <video
          ref={videoRef}
          src={videoUrl}
          style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
          playsInline
          webkit-playsinline="true"
          disablePictureInPicture
          controlsList="nofullscreen noremoteplayback"
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
        />
        {isHolding && (
          <div style={{ position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)', background: '#EF9F27', color: '#111', fontSize: 12, fontWeight: 700, padding: '4px 12px', borderRadius: 20 }}>
            🐢 Slow motion — hold to keep going
          </div>
        )}
        {viewingMarkerNote && (
          <div style={{ position: 'absolute', bottom: 16, left: 16, right: 16, background: 'rgba(0,0,0,0.85)', color: '#fff', fontSize: 13, padding: '10px 14px', borderRadius: 8 }}
            onClick={() => setViewingMarkerNote(null)}>
            📝 {viewingMarkerNote}
          </div>
        )}
      </div>

      {pendingClip && (
        <div style={{ padding: '10px 16px', background: '#EF9F27', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#111' }}>Save this {(pendingClip.end - pendingClip.start).toFixed(1)}s slow-mo clip?</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-sm btn-primary" disabled={savingClip} onClick={saveClip}>{savingClip ? 'Saving…' : '✓ Save clip'}</button>
            <button className="btn btn-sm" onClick={() => setPendingClip(null)}>Discard</button>
          </div>
        </div>
      )}

      {markerRangeStart !== null && !showMarkerChoice && (
        <div style={{ padding: '10px 16px', background: '#378ADD', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>Marker starts at {fmt(markerRangeStart)} — scrub to where it ends, then confirm</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-sm btn-primary" onClick={() => setShowMarkerChoice(true)}>🏁 End marker here</button>
            <button className="btn btn-sm" onClick={cancelMarkerRange}>Cancel</button>
          </div>
        </div>
      )}

      {showMarkerChoice && (
        <div style={{ padding: '10px 16px', background: 'rgba(255,255,255,0.1)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>
            {fmt(Math.min(markerRangeStart, currentTime))} → {fmt(Math.max(markerRangeStart, currentTime))} ({Math.abs(currentTime - markerRangeStart).toFixed(1)}s)
          </span>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
            {addingNoteText === null ? (
              <>
                <button className="btn btn-sm" onClick={() => saveMarker('highlight')}>⭐ Highlight this section</button>
                <button className="btn btn-sm" onClick={() => setAddingNoteText('')}>📝 Add a note</button>
                <button className="btn btn-sm" onClick={cancelMarkerRange}>Cancel</button>
              </>
            ) : (
              <div style={{ display: 'flex', gap: 8, width: '100%', maxWidth: 480 }}>
                <input autoFocus value={addingNoteText} onChange={e => setAddingNoteText(e.target.value)} placeholder="What's happening here?" style={{ flex: 1, fontSize: 13 }} />
                <button className="btn btn-sm btn-primary" onClick={() => saveMarker('note', addingNoteText.trim())} disabled={!addingNoteText.trim()}>Save</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Controls -- flex-wrap so this reflows naturally between
          portrait (narrow, wraps to more rows) and landscape (wide,
          stays on fewer rows) without needing separate layouts. */}
      <div style={{ flexShrink: 0, padding: '10px 12px 16px', background: 'rgba(0,0,0,0.6)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11, minWidth: 36 }}>{fmt(currentTime)}</span>
          <div style={{ position: 'relative', flex: 1 }}>
            <input
              type="range"
              min={0}
              max={duration || 0}
              step={0.01}
              value={currentTime}
              onChange={e => seekTo(parseFloat(e.target.value))}
              style={{ width: '100%' }}
            />
            {duration > 0 && markers.map(m => (
              <div key={m.id} title={m.marker_type === 'note' ? m.note_text : 'Highlight'}
                onClick={() => { seekTo(m.start_seconds); if (m.marker_type === 'note') setViewingMarkerNote(m.note_text) }}
                style={{
                  position: 'absolute', top: 6, height: 4, borderRadius: 2, cursor: 'pointer',
                  left: `${(m.start_seconds / duration) * 100}%`,
                  width: `${Math.max(0.5, ((m.end_seconds - m.start_seconds) / duration) * 100)}%`,
                  background: m.marker_type === 'highlight' ? '#EF9F27' : '#378ADD',
                }} />
            ))}
          </div>
          <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11, minWidth: 36 }}>{fmt(duration)}</span>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', alignItems: 'center', marginTop: 8 }}>
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

        {isCoach && footageId && (
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: 10 }}>
            {markerRangeStart === null && !showMarkerChoice && (
              <button className="btn btn-sm" onClick={handleMarkerButtonPress}>📍 Add marker here</button>
            )}
          </div>
        )}

        {clips.length > 0 && (
          <div style={{ marginTop: 12, borderTop: '1px solid rgba(255,255,255,0.15)', paddingTop: 10 }}>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', marginBottom: 6, textAlign: 'center' }}>Saved clips</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center' }}>
              {clips.map(c => (
                <button key={c.id} className="btn btn-sm" onClick={() => openClip(c)} style={{ opacity: c.status === 'ready' ? 1 : 0.6 }}>
                  {c.status === 'ready' ? '▶️' : c.status === 'failed' ? '⚠️' : '⏳'} {(c.end_seconds - c.start_seconds).toFixed(1)}s @ {fmt(c.start_seconds)}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
