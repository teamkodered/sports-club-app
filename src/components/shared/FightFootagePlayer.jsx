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
const CONTROLS_AUTOHIDE_MS = 3000
const HIGHLIGHT_COLOURS = ['#E24B4A', '#EF9F27', '#1D9E75', '#378ADD', '#8B5CF6']

export default function FightFootagePlayer({ videoUrl, title, footageId, storagePath, isCoach = false, onClose }) {
  const videoRef = useRef(null)
  const wrapperRef = useRef(null)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [isFullscreen, setIsFullscreen] = useState(false)

  // Controls visibility -- tap the video to show, auto-hides after a
  // few seconds of no interaction. Never hides while actively
  // scrubbing, so dragging the timeline always stays responsive.
  const [controlsVisible, setControlsVisible] = useState(true)
  const autoHideTimerRef = useRef(null)
  const scrubbingRef = useRef(false)

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

  // Long-press a marker to edit/delete it
  const markerHoldTimerRef = useRef(null)
  const markerHeldRef = useRef(false)
  const [editingMarker, setEditingMarker] = useState(null)
  const [editingMarkerNoteText, setEditingMarkerNoteText] = useState('')

  // Photo/freeze-frame markers
  const [frozenPhoto, setFrozenPhoto] = useState(null)
  const frozenPhotoRef = useRef(null)
  const lastTriggeredPhotoIdRef = useRef(null)
  const markersRef = useRef([])
  const canvasRef = useRef(null)

  // Double-tap left/right half to skip back/forward
  const lastTapAtRef = useRef(0)
  const singleTapTimerRef = useRef(null)
  const [skipFlash, setSkipFlash] = useState(null) // 'back' | 'forward' | null, brief visual confirmation

  useEffect(() => { markersRef.current = markers }, [markers])
  useEffect(() => { frozenPhotoRef.current = frozenPhoto }, [frozenPhoto])

  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    // timeupdate only fires a few times a second in most browsers --
    // fine for the photo-freeze check below, but felt laggy for the
    // scrubber. currentTime itself is now driven by the
    // requestAnimationFrame loop further down instead, which updates
    // every frame and stays properly in sync with playback.
    const onTime = () => {
      // Freeze-frame ("photo") markers: pause on reaching one during
      // normal playback, hold for its freeze_seconds, then resume --
      // using refs here since this listener is only ever set up once.
      if (frozenPhotoRef.current || v.paused) return
      const hit = markersRef.current.find(m =>
        m.marker_type === 'photo' &&
        Math.abs(v.currentTime - m.start_seconds) < 0.15 &&
        lastTriggeredPhotoIdRef.current !== m.id
      )
      if (hit) {
        lastTriggeredPhotoIdRef.current = hit.id
        v.pause()
        setFrozenPhoto(hit)
        setTimeout(() => {
          setFrozenPhoto(null)
          lastTriggeredPhotoIdRef.current = null // allow re-triggering if this point is reached again later (e.g. after seeking back)
          v.play()
        }, (hit.freeze_seconds || 5) * 1000)
      }
    }
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

  // Drives currentTime for the scrubber every frame (~60fps) rather
  // than relying on timeupdate's much coarser firing rate -- this is
  // what actually keeps the scrub bar visually in sync with playback.
  useEffect(() => {
    let rafId
    function tick() {
      const v = videoRef.current
      if (v) setCurrentTime(v.currentTime)
      rafId = requestAnimationFrame(tick)
    }
    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
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

  useEffect(() => {
    scheduleAutoHide() // controls start visible, but should still fade out on their own if left alone
    return () => clearTimeout(autoHideTimerRef.current)
  }, [])

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

  // Double-tap skip -- unlike step(), this deliberately doesn't pause,
  // matching how skip-forward/back gestures work in most video apps
  // (skipping while playing just keeps playing from the new point).
  function skipSeconds(deltaSeconds) {
    const v = videoRef.current
    if (!v) return
    v.currentTime = Math.min(Math.max(0, v.currentTime + deltaSeconds), v.duration || 0)
    setSkipFlash(deltaSeconds < 0 ? 'back' : 'forward')
    setTimeout(() => setSkipFlash(null), 500)
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

  // --- Controls visibility (tap to show, auto-hide) -------------------
  function scheduleAutoHide() {
    clearTimeout(autoHideTimerRef.current)
    autoHideTimerRef.current = setTimeout(() => {
      if (!scrubbingRef.current) setControlsVisible(false)
    }, CONTROLS_AUTOHIDE_MS)
  }

  function showControls() {
    setControlsVisible(true)
    scheduleAutoHide()
  }

  function handleScrubStart() {
    scrubbingRef.current = true
    clearTimeout(autoHideTimerRef.current) // never hide mid-drag
  }

  function handleScrubEnd() {
    scrubbingRef.current = false
    scheduleAutoHide()
  }

  // --- Hold-to-slow-mo -------------------------------------------------
  // A quick tap toggles the controls overlay (rather than play/pause
  // directly -- play/pause now lives inside that overlay, matching how
  // most video apps handle tap-to-reveal). A press held past
  // HOLD_THRESHOLD_MS switches into slow motion for as long as it's
  // held, and releasing offers to save that stretch as its own clip --
  // similar to how Samsung's camera/gallery app works.
  function handlePointerDown() {
    if (!footageId) return
    clearTimeout(holdTimerRef.current)
    holdTimerRef.current = setTimeout(() => {
      const v = videoRef.current
      if (!v) return
      isHoldingRef.current = true
      setIsHolding(true)
      clearTimeout(autoHideTimerRef.current) // don't let a stale timer pop controls back up mid-hold
      setControlsVisible(false) // hide the middle overlay so it doesn't block the view during slow-mo
      preHoldSpeedRef.current = speed
      holdStartRef.current = v.currentTime
      v.playbackRate = SLOW_MO_SPEED
      if (v.paused) v.play()
    }, HOLD_THRESHOLD_MS)
  }

  function handlePointerUp(e) {
    clearTimeout(holdTimerRef.current)
    const v = videoRef.current
    if (!isHoldingRef.current) {
      // Was just a quick release -- could be a single tap (toggle
      // controls) or the second half of a double-tap (skip). Wait a
      // beat before committing to the single-tap action, in case a
      // second tap arrives within the double-tap window.
      const now = Date.now()
      const isDoubleTap = now - lastTapAtRef.current < 300
      if (isDoubleTap) {
        clearTimeout(singleTapTimerRef.current)
        lastTapAtRef.current = 0
        const rect = wrapperRef.current?.getBoundingClientRect()
        const isLeftSide = rect && (e.clientX - rect.left) < rect.width / 2
        skipSeconds(isLeftSide ? -5 : 5)
      } else {
        lastTapAtRef.current = now
        clearTimeout(singleTapTimerRef.current)
        singleTapTimerRef.current = setTimeout(() => {
          // Tapping the screen only ever reveals/hides the controls --
          // play/pause happens exclusively via pressing the actual
          // button, never from a generic tap anywhere on the video.
          if (controlsVisible) { clearTimeout(autoHideTimerRef.current); setControlsVisible(false) }
          else showControls()
        }, 300)
      }
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
      showControls()
    } else {
      scheduleAutoHide() // resume the normal countdown now that the hold has ended
    }
  }

  // If a save-clip prompt just sits there ignored (coach moved on to
  // do something else instead of pressing Save or Discard), it
  // auto-discards on its own after a while rather than lingering
  // indefinitely -- nothing gets saved unless Save was actually pressed.
  useEffect(() => {
    if (!pendingClip) return
    const t = setTimeout(() => setPendingClip(null), 15000)
    return () => clearTimeout(t)
  }, [pendingClip])

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

  // Captures the exact current video frame as a still image (via a
  // hidden canvas) and saves it as a "photo" marker -- during normal
  // playback later, reaching this point pauses on that frame for
  // freeze_seconds (defaulting to 5) before continuing automatically.
  async function capturePhotoMarker() {
    const v = videoRef.current
    if (!v) return
    v.pause()
    const canvas = canvasRef.current
    canvas.width = v.videoWidth
    canvas.height = v.videoHeight
    canvas.getContext('2d').drawImage(v, 0, 0, canvas.width, canvas.height)
    const photoDataUrl = canvas.toDataURL('image/jpeg', 0.7)

    const { data: { user } } = await supabase.auth.getUser()
    const { data: member } = await supabase.from('members').select('id').eq('auth_id', user.id).single()
    const { data: newMarker } = await supabase.from('fight_footage_markers').insert({
      footage_id: footageId,
      start_seconds: currentTime,
      end_seconds: currentTime,
      marker_type: 'photo',
      photo_data_url: photoDataUrl,
      freeze_seconds: 5,
      created_by: member?.id || null,
    }).select().single()
    if (newMarker) setMarkers(prev => [...prev, newMarker].sort((a, b) => a.start_seconds - b.start_seconds))
  }

  async function saveMarker(type, text = null, colour = null) {
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
      highlight_color: colour,
      created_by: member?.id || null,
    }).select().single()
    if (newMarker) setMarkers(prev => [...prev, newMarker].sort((a, b) => a.start_seconds - b.start_seconds))
    setShowMarkerChoice(false)
    setAddingNoteText(null)
    setMarkerRangeStart(null)
  }

  // Long-press a marker bar to edit/delete it; a quick tap keeps the
  // existing behaviour (seek there, show its note if it has one).
  function handleMarkerPointerDown(m) {
    markerHeldRef.current = false
    clearTimeout(markerHoldTimerRef.current)
    markerHoldTimerRef.current = setTimeout(() => {
      markerHeldRef.current = true
      setEditingMarker(m)
      setEditingMarkerNoteText(m.note_text || '')
    }, HOLD_THRESHOLD_MS)
  }

  function handleMarkerPointerUp(m) {
    clearTimeout(markerHoldTimerRef.current)
    if (markerHeldRef.current) return // long-press already handled it
    seekTo(m.start_seconds)
    if (m.marker_type === 'note') setViewingMarkerNote(m.note_text)
  }

  async function deleteMarker(m) {
    await supabase.from('fight_footage_markers').delete().eq('id', m.id)
    setMarkers(prev => prev.filter(x => x.id !== m.id))
    setEditingMarker(null)
  }

  async function updateMarkerNote(m) {
    await supabase.from('fight_footage_markers').update({ note_text: editingMarkerNoteText.trim() }).eq('id', m.id)
    setMarkers(prev => prev.map(x => x.id === m.id ? { ...x, note_text: editingMarkerNoteText.trim() } : x))
    setEditingMarker(null)
  }

  async function updateMarkerColour(m, colour) {
    await supabase.from('fight_footage_markers').update({ highlight_color: colour }).eq('id', m.id)
    setMarkers(prev => prev.map(x => x.id === m.id ? { ...x, highlight_color: colour } : x))
    setEditingMarker(null)
  }

  return (
    <div ref={wrapperRef} style={{ position: 'fixed', inset: 0, background: '#000', zIndex: 200, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 12, flexShrink: 0, background: 'rgba(0,0,0,0.6)', zIndex: 2 }}>
        <span style={{ color: '#fff', fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</span>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="btn btn-sm" onClick={toggleFullscreen}>{isFullscreen ? '⤢ Exit fullscreen' : '⛶ Fullscreen'}</button>
          <button className="btn btn-sm" onClick={onClose}>✕ Close</button>
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 0, position: 'relative' }}>
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
          onPointerLeave={() => { if (isHoldingRef.current) handlePointerUp({ clientX: 0 }) }}
        />
        <canvas ref={canvasRef} style={{ display: 'none' }} />
        {frozenPhoto && (
          <div style={{ position: 'absolute', inset: 0, background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <img src={frozenPhoto.photo_data_url} alt="" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
            <div style={{ position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)', background: '#378ADD', color: '#fff', fontSize: 12, fontWeight: 700, padding: '4px 12px', borderRadius: 20 }}>
              📷 Photo — resuming shortly
            </div>
          </div>
        )}
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

        {/* Middle overlay -- just play/pause and speed, tap the video
            to show/hide. Everything else (scrubber, stepping, markers)
            lives in the always-visible bottom bar instead. */}
        {controlsVisible && (
          <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, transform: 'translateY(-50%)', padding: '16px 12px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}
            onClick={e => e.stopPropagation()}>
            <button className="btn btn-primary" style={{ minWidth: 72, height: 72, borderRadius: '50%', justifyContent: 'center', fontSize: 26 }} onClick={togglePlay}>{playing ? '⏸' : '▶️'}</button>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center' }}>
              {SPEEDS.map(s => (
                <button key={s} onClick={() => setPlaybackSpeed(s)}
                  style={{ padding: '4px 12px', borderRadius: 20, fontSize: 12, cursor: 'pointer', fontFamily: 'var(--font-sans)',
                    border: `1px solid ${speed === s ? '#378ADD' : 'rgba(255,255,255,0.3)'}`,
                    background: speed === s ? '#378ADD30' : 'rgba(0,0,0,0.4)',
                    color: speed === s ? '#5FA8EA' : 'rgba(255,255,255,0.7)', fontWeight: speed === s ? 600 : 400 }}>
                  {s === 1 ? '1x' : `${s}x`}
                </button>
              ))}
            </div>
          </div>
        )}

        {skipFlash && (
          <div style={{
            position: 'absolute', top: 0, bottom: 0, [skipFlash === 'back' ? 'left' : 'right']: 0, width: '35%',
            display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.08)', pointerEvents: 'none',
          }}>
            <span style={{ color: '#fff', fontSize: 28 }}>{skipFlash === 'back' ? '⏪ 5s' : '5s ⏩'}</span>
          </div>
        )}
      </div>

      {/* Bottom bar -- always visible (not tied to tap-to-show), same
          as the original layout: scrubber with marker overlay,
          frame/5s stepping, add marker/photo, saved clips. */}
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
              onPointerDown={handleScrubStart}
              onPointerUp={handleScrubEnd}
              style={{ width: '100%' }}
            />
            {duration > 0 && markers.map(m => (
              m.marker_type === 'photo' ? (
                <div key={m.id} title="Photo marker — hold to edit"
                  onPointerDown={e => { e.stopPropagation(); handleMarkerPointerDown(m) }}
                  onPointerUp={e => { e.stopPropagation(); handleMarkerPointerUp(m) }}
                  onPointerLeave={() => clearTimeout(markerHoldTimerRef.current)}
                  style={{
                    position: 'absolute', top: -6, left: `${(m.start_seconds / duration) * 100}%`, transform: 'translateX(-50%)',
                    width: 16, height: 16, borderRadius: 3, cursor: 'pointer', border: '1px solid #fff',
                    backgroundImage: `url(${m.photo_data_url})`, backgroundSize: 'cover', backgroundPosition: 'center',
                  }} />
              ) : (
                // Outer div is a much bigger touch target than the thin
                // visible bar (which is just the inner child) -- a
                // finger press on a 4px-tall bar was unreliable and
                // often fell through to the scrubber underneath instead,
                // triggering a seek rather than the intended hold.
                // stopPropagation on top of that stops the press from
                // also reaching the range input at all.
                <div key={m.id}
                  title={m.marker_type === 'note' ? m.note_text : 'Highlight — hold to edit'}
                  onPointerDown={e => { e.stopPropagation(); handleMarkerPointerDown(m) }}
                  onPointerUp={e => { e.stopPropagation(); handleMarkerPointerUp(m) }}
                  onPointerLeave={() => clearTimeout(markerHoldTimerRef.current)}
                  style={{
                    position: 'absolute', top: -6, height: 16, cursor: 'pointer',
                    left: `${(m.start_seconds / duration) * 100}%`,
                    width: `${Math.max(2, ((m.end_seconds - m.start_seconds) / duration) * 100)}%`,
                    display: 'flex', alignItems: 'center',
                  }}>
                  <div style={{ width: '100%', height: 4, borderRadius: 2, background: m.marker_type === 'highlight' ? (m.highlight_color || '#EF9F27') : '#378ADD' }} />
                </div>
              )
            ))}
          </div>
          <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11, minWidth: 36 }}>{fmt(duration)}</span>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', alignItems: 'center', marginTop: 8 }}>
          <button className="btn btn-sm" onClick={() => step(-5)}>⏪ 5s</button>
          <button className="btn btn-sm" onClick={() => step(-FRAME_SECONDS)}>⏮ Frame</button>
          <button className="btn btn-primary" style={{ minWidth: 56, justifyContent: 'center' }} onClick={togglePlay}>{playing ? '⏸' : '▶️'}</button>
          <button className="btn btn-sm" onClick={() => step(FRAME_SECONDS)}>Frame ⏭</button>
          <button className="btn btn-sm" onClick={() => step(5)}>5s ⏩</button>
        </div>

        {isCoach && footageId && markerRangeStart === null && !showMarkerChoice && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 10 }}>
            <button className="btn btn-sm" onClick={handleMarkerButtonPress}>📍 Add marker here</button>
            <button className="btn btn-sm" onClick={capturePhotoMarker}>📷 Add photo</button>
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
          {addingNoteText === null ? (
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center' }}>
              <button className="btn btn-sm" onClick={() => setAddingNoteText('')}>📝 Add a note</button>
              <button className="btn btn-sm" onClick={cancelMarkerRange}>Cancel</button>
              <div style={{ display: 'flex', gap: 6 }}>
                {HIGHLIGHT_COLOURS.map(c => (
                  <button key={c} title="Highlight in this colour" onClick={() => saveMarker('highlight', null, c)}
                    style={{ width: 26, height: 26, borderRadius: '50%', background: c, border: '2px solid rgba(255,255,255,0.6)', cursor: 'pointer', padding: 0 }} />
                ))}
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 8, width: '100%', maxWidth: 480 }}>
              <input autoFocus value={addingNoteText} onChange={e => setAddingNoteText(e.target.value)} placeholder="What's happening here?" style={{ flex: 1, fontSize: 13 }} />
              <button className="btn btn-sm btn-primary" onClick={() => saveMarker('note', addingNoteText.trim())} disabled={!addingNoteText.trim()}>Save</button>
            </div>
          )}
        </div>
      )}

      {editingMarker && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 210, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
          onClick={() => setEditingMarker(null)}>
          <div className="card" style={{ width: '100%', maxWidth: 380 }} onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>
              {editingMarker.marker_type === 'note' ? 'Edit note' : editingMarker.marker_type === 'photo' ? 'Photo marker' : 'Edit highlight'} — {fmt(editingMarker.start_seconds)}{editingMarker.marker_type !== 'photo' ? ` → ${fmt(editingMarker.end_seconds)}` : ''}
            </h3>

            {editingMarker.marker_type === 'note' ? (
              <>
                <textarea value={editingMarkerNoteText} onChange={e => setEditingMarkerNoteText(e.target.value)} style={{ width: '100%', fontSize: 13, minHeight: 60, marginBottom: 10 }} />
                <button className="btn btn-sm btn-primary" style={{ width: '100%', justifyContent: 'center', marginBottom: 8 }} onClick={() => updateMarkerNote(editingMarker)}>Save note</button>
              </>
            ) : editingMarker.marker_type === 'photo' ? (
              <div style={{ marginBottom: 12 }}>
                <img src={editingMarker.photo_data_url} alt="" style={{ width: '100%', borderRadius: 8, marginBottom: 8 }} />
                <p style={{ fontSize: 12, color: 'var(--text-secondary)', textAlign: 'center' }}>Freezes for {editingMarker.freeze_seconds || 5}s during playback</p>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 12 }}>
                {HIGHLIGHT_COLOURS.map(c => (
                  <button key={c} onClick={() => updateMarkerColour(editingMarker, c)}
                    style={{ width: 30, height: 30, borderRadius: '50%', background: c, cursor: 'pointer', padding: 0,
                      border: editingMarker.highlight_color === c ? '3px solid #fff' : '2px solid rgba(255,255,255,0.4)' }} />
                ))}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-sm" style={{ color: '#E24B4A', flex: 1, justifyContent: 'center' }} onClick={() => deleteMarker(editingMarker)}>🗑️ Delete</button>
              <button className="btn btn-sm" style={{ flex: 1, justifyContent: 'center' }} onClick={() => setEditingMarker(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
