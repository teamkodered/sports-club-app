import { useState, useRef, useEffect } from 'react'
import { supabase } from '../../lib/supabase.js'

const SPEEDS = [0.25, 0.5, 1, 1.5, 2]
// Standard video frame rate assumption for "one frame" stepping --
// there's no reliable way to read the real frame rate from a plain
// HTML5 <video> element, so this is a close-enough approximation for
// scrubbing to the right moment rather than a frame-perfect step.
const FRAME_SECONDS = 1 / 30
const HOLD_THRESHOLD_MS = 220 // how long a press must last before it counts as "hold" rather than a tap
const MOVE_CANCEL_THRESHOLD = 12 // px of movement that cancels a pending hold -- this is a swipe, not a hold
const SLOW_MO_SPEED = 0.25
const CONTROLS_AUTOHIDE_MS = 3000
const HIGHLIGHT_COLOURS = ['#E24B4A', '#EF9F27', '#1D9E75', '#378ADD', '#8B5CF6']
const ZOOM_LEVELS = [1, 2, 4, 8]
// Shared "glass" look for popups/buttons in this player -- light grey,
// translucent, with a soft blur so it reads clearly over any part of
// the video without needing a solid, attention-grabbing colour block.
const GLASS_BG = 'rgba(210,210,210,0.28)'
const GLASS_BORDER = '1px solid rgba(255,255,255,0.35)'
const GLASS_STYLE = { background: GLASS_BG, border: GLASS_BORDER, backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)' }

function hexToRgba(hex, alpha) {
  const n = parseInt(hex.replace('#', ''), 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`
}

export default function FightFootagePlayer({ videoUrl, title, footageId, storagePath, isCoach = false, onClose }) {
  const videoRef = useRef(null)
  const wrapperRef = useRef(null)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [videoAspect, setVideoAspect] = useState(16 / 9) // updated once real metadata loads; used to keep overlays aligned to the actual visible video, not the full (possibly letterboxed) screen
  const [isFullscreen, setIsFullscreen] = useState(false)

  // Controls visibility -- tap the video to show, auto-hides after a
  // few seconds of no interaction. Never hides while actively
  // scrubbing, so dragging the timeline always stays responsive.
  const [controlsVisible, setControlsVisible] = useState(true)
  const autoHideTimerRef = useRef(null)
  const scrubbingRef = useRef(false)
  const markerRowRef = useRef(null)

  // Timeline zoom -- lets scrubbing be more precise on longer videos.
  // The visible window re-centres on the current playback position as
  // it plays, but freezes while actively dragging the scrubber so the
  // timeline doesn't shift under your finger mid-drag.
  const [zoomLevel, setZoomLevel] = useState(1)
  const [zoomWindowStart, setZoomWindowStart] = useState(0)

  // Hold-to-slow-mo + save-clip
  const holdTimerRef = useRef(null)
  const isHoldingRef = useRef(false)
  const [isHolding, setIsHolding] = useState(false) // mirrors isHoldingRef, purely so the on-screen banner can actually re-render
  const holdStartRef = useRef(0)
  const holdStartPosRef = useRef({ x: 0, y: 0 })
  const preHoldSpeedRef = useRef(1)
  const [pendingClip, setPendingClip] = useState(null) // { start, end } once released, awaiting Save/Discard
  const [savingClip, setSavingClip] = useState(false)
  const [clips, setClips] = useState([])

  // Markers (highlight/note)
  const [markers, setMarkers] = useState([])
  const [showMarkerChoice, setShowMarkerChoice] = useState(false)
  const [addingNoteText, setAddingNoteText] = useState('') // optional note text, combined with a colour in the same form now
  const [selectedColour, setSelectedColour] = useState(HIGHLIGHT_COLOURS[0])
  const [markerRangeStart, setMarkerRangeStart] = useState(null) // set once "Add marker" is first tapped, awaiting the end point
  const [viewingMarkerNote, setViewingMarkerNote] = useState(null)

  // Long-press a marker to edit/delete it
  const markerHoldTimerRef = useRef(null)
  const markerHeldRef = useRef(false)
  const [editingMarker, setEditingMarker] = useState(null)
  const [editingMarkerNoteText, setEditingMarkerNoteText] = useState('')
  const [editingMarkerColour, setEditingMarkerColour] = useState(HIGHLIGHT_COLOURS[0])

  // Photo/freeze-frame markers
  const [frozenPhoto, setFrozenPhoto] = useState(null)
  const frozenPhotoRef = useRef(null)
  const lastTriggeredPhotoIdRef = useRef(null)
  const markersRef = useRef([])
  const canvasRef = useRef(null)

  // Filmstrip preview (simple version) -- a row of thumbnail frames
  // generated once via a hidden, separate video element (so generating
  // them never disrupts the actual visible player), used as the scrub
  // track's background. Holding the scrub bar zooms in for more detail,
  // Samsung Gallery style.
  const [filmstrip, setFilmstrip] = useState([]) // [{ t, url }]
  const filmstripVideoRef = useRef(null)
  const filmstripCanvasRef = useRef(null)
  const scrubHoldTimerRef = useRef(null)

  // Double-tap left/right half to skip back/forward
  const lastTapAtRef = useRef(0)
  const singleTapTimerRef = useRef(null)
  const [skipFlash, setSkipFlash] = useState(null) // 'back' | 'forward' | null, brief visual confirmation

  useEffect(() => { markersRef.current = markers }, [markers])
  useEffect(() => { frozenPhotoRef.current = frozenPhoto }, [frozenPhoto])

  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    const onMeta = () => { setDuration(v.duration || 0); if (v.videoWidth && v.videoHeight) setVideoAspect(v.videoWidth / v.videoHeight) }
    const onPlay = () => setPlaying(true)
    const onPause = () => setPlaying(false)
    v.addEventListener('loadedmetadata', onMeta)
    v.addEventListener('play', onPlay)
    v.addEventListener('pause', onPause)
    return () => {
      v.removeEventListener('loadedmetadata', onMeta)
      v.removeEventListener('play', onPlay)
      v.removeEventListener('pause', onPause)
    }
  }, [])

  // Drives currentTime for the scrubber every frame (~60fps) rather
  // than relying on timeupdate's much coarser (only a few times a
  // second) firing rate -- also runs the photo-marker freeze check
  // here for the same reason: timeupdate's gaps let playback skip
  // right past a marker's timestamp without ever landing inside the
  // narrow detection window, so it often just never triggered at all.
  useEffect(() => {
    let rafId
    function tick() {
      const v = videoRef.current
      if (v) {
        setCurrentTime(v.currentTime)
        if (!frozenPhotoRef.current && !v.paused) {
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
      }
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

  // Swiping the marker row directly seeks too, exactly like dragging
  // the scrub bar -- both just set currentTime, so they can never
  // drift out of sync with each other.
  function seekFromRowEvent(e) {
    const rect = markerRowRef.current?.getBoundingClientRect()
    if (!rect || !duration) return
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    const windowDuration = zoomLevel === 1 ? duration : duration / zoomLevel
    seekTo(zoomWindowStart + pct * windowDuration)
  }

  function handleMarkerRowPointerDown(e) {
    handleScrubStart()
    seekFromRowEvent(e)
  }

  function handleMarkerRowPointerMove(e) {
    if (!scrubbingRef.current) return
    seekFromRowEvent(e)
  }

  function handleMarkerRowPointerUp() {
    handleScrubEnd()
  }

  // Generates a simple filmstrip once duration is known -- seeks a
  // separate hidden video element through evenly-spaced points and
  // captures each as a small JPEG. Uses a hidden element rather than
  // the visible one so generating thumbnails never disrupts what's
  // actually playing. Deliberately rough/simple: a handful of frames,
  // not frame-accurate, good enough for "roughly where am I".
  useEffect(() => {
    if (!duration || filmstrip.length > 0) return
    const v = filmstripVideoRef.current
    const canvas = filmstripCanvasRef.current
    if (!v || !canvas) return
    const COUNT = 12
    const points = Array.from({ length: COUNT }, (_, i) => (duration / COUNT) * i)
    let cancelled = false

    async function generate() {
      const results = []
      for (const t of points) {
        if (cancelled) return
        await new Promise(resolve => {
          function onSeeked() {
            v.removeEventListener('seeked', onSeeked)
            try {
              canvas.width = 80
              canvas.height = 45
              canvas.getContext('2d').drawImage(v, 0, 0, canvas.width, canvas.height)
              results.push({ t, url: canvas.toDataURL('image/jpeg', 0.5) })
            } catch { /* ignore a single failed frame, keep going */ }
            resolve()
          }
          v.addEventListener('seeked', onSeeked)
          v.currentTime = t
        })
      }
      if (!cancelled) setFilmstrip(results)
    }
    generate()
    return () => { cancelled = true }
  }, [duration])

  // Holding the scrub track (rather than just tapping/dragging it)
  // zooms in one level for more detail, Samsung Gallery style. The
  // native range input still handles normal dragging itself as usual;
  // this just adds a hold-timer alongside without interfering.
  function handleScrubTrackPointerDown() {
    clearTimeout(scrubHoldTimerRef.current)
    scrubHoldTimerRef.current = setTimeout(() => {
      setZoomLevel(z => ZOOM_LEVELS[Math.min(ZOOM_LEVELS.length - 1, ZOOM_LEVELS.indexOf(z) + 1)])
    }, HOLD_THRESHOLD_MS)
  }

  function handleScrubTrackPointerUp() {
    clearTimeout(scrubHoldTimerRef.current)
  }

  // Keeps the zoomed timeline window centred on the current playback
  // position -- including while actively scrubbing, so the marker row
  // and playhead visibly move together with the scrub bar in real
  // time rather than staying frozen until you release.
  useEffect(() => {
    if (zoomLevel === 1 || duration === 0) { setZoomWindowStart(0); return }
    const windowDuration = duration / zoomLevel
    setZoomWindowStart(Math.max(0, Math.min(currentTime - windowDuration / 2, duration - windowDuration)))
  }, [currentTime, zoomLevel, duration])


  // --- Hold-to-slow-mo -------------------------------------------------
  // Shared by both the video itself and the play/pause buttons -- a
  // press held past HOLD_THRESHOLD_MS switches into slow motion for as
  // long as it's held, and releasing offers to save that stretch as
  // its own clip, similar to how Samsung's camera/gallery app works.
  function engageHoldSlowMo() {
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
  }

  function releaseHoldSlowMo() {
    const v = videoRef.current
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

  // Video gestures: tap toggles controls / double-tap skips / hold
  // slows down (see engage/releaseHoldSlowMo above).
  function handlePointerDown(e) {
    if (!footageId) return
    holdStartPosRef.current = { x: e.clientX, y: e.clientY }
    clearTimeout(holdTimerRef.current)
    holdTimerRef.current = setTimeout(engageHoldSlowMo, HOLD_THRESHOLD_MS)
  }

  // A swipe (finger genuinely moving, not just resting) shouldn't
  // trigger slow-mo just because it happened to last longer than the
  // hold threshold -- cancels the pending hold the moment the pointer
  // moves more than a few pixels from where it first went down.
  function handleVideoPointerMove(e) {
    const dx = e.clientX - holdStartPosRef.current.x
    const dy = e.clientY - holdStartPosRef.current.y
    if (Math.sqrt(dx * dx + dy * dy) > MOVE_CANCEL_THRESHOLD) clearTimeout(holdTimerRef.current)
  }

  function handlePointerUp(e) {
    clearTimeout(holdTimerRef.current)
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
    releaseHoldSlowMo()
  }

  // Play/pause button gestures: a quick press toggles play/pause as
  // normal; holding it does the same slow-mo effect as holding the
  // video itself.
  function handlePlayButtonPointerDown() {
    if (!footageId) return
    clearTimeout(holdTimerRef.current)
    holdTimerRef.current = setTimeout(engageHoldSlowMo, HOLD_THRESHOLD_MS)
  }

  function handlePlayButtonPointerUp() {
    clearTimeout(holdTimerRef.current)
    if (!isHoldingRef.current) {
      togglePlay()
      return
    }
    releaseHoldSlowMo()
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
    setAddingNoteText('')
    setSelectedColour(HIGHLIGHT_COLOURS[0])
  }

  // Captures the exact current video frame as a still image (via a
  // hidden canvas) and saves it as a "photo" marker -- during normal
  // playback later, reaching this point pauses on that frame for
  // freeze_seconds (defaulting to 5) before continuing automatically.
  async function capturePhotoMarker() {
    const v = videoRef.current
    if (!v) return
    v.pause()
    try {
      const canvas = canvasRef.current
      canvas.width = v.videoWidth
      canvas.height = v.videoHeight
      canvas.getContext('2d').drawImage(v, 0, 0, canvas.width, canvas.height)
      const photoDataUrl = canvas.toDataURL('image/jpeg', 0.7)

      const { data: { user } } = await supabase.auth.getUser()
      const { data: member } = await supabase.from('members').select('id').eq('auth_id', user.id).single()
      const { data: newMarker, error } = await supabase.from('fight_footage_markers').insert({
        footage_id: footageId,
        start_seconds: currentTime,
        end_seconds: currentTime,
        marker_type: 'photo',
        photo_data_url: photoDataUrl,
        freeze_seconds: 5,
        created_by: member?.id || null,
      }).select().single()
      if (error) throw error
      if (newMarker) setMarkers(prev => [...prev, newMarker].sort((a, b) => a.start_seconds - b.start_seconds))
    } catch (err) {
      alert('Could not capture photo: ' + err.message)
    }
  }

  async function saveMarker() {
    const start = Math.min(markerRangeStart, currentTime)
    const end = Math.max(markerRangeStart, currentTime)
    const { data: { user } } = await supabase.auth.getUser()
    const { data: member } = await supabase.from('members').select('id').eq('auth_id', user.id).single()
    const { data: newMarker } = await supabase.from('fight_footage_markers').insert({
      footage_id: footageId,
      start_seconds: start,
      end_seconds: end,
      marker_type: 'highlight',
      note_text: addingNoteText?.trim() || null,
      highlight_color: selectedColour,
      created_by: member?.id || null,
    }).select().single()
    if (newMarker) setMarkers(prev => [...prev, newMarker].sort((a, b) => a.start_seconds - b.start_seconds))
    setShowMarkerChoice(false)
    setAddingNoteText('')
    setSelectedColour(HIGHLIGHT_COLOURS[0])
    setMarkerRangeStart(null)
  }

  // Long-press a marker bar to edit/delete it; a quick tap keeps the
  // existing behaviour (seek there, show its note if it has one).
  // (Swipe-up used to also open the editor here, but removed -- it was
  // triggering slow-mo unintentionally. Long-press alone covers this.)

  function openMarkerEditor(m) {
    markerHeldRef.current = true
    clearTimeout(markerHoldTimerRef.current)
    setEditingMarker(m)
    setEditingMarkerNoteText(m.note_text || '')
    setEditingMarkerColour(m.highlight_color || HIGHLIGHT_COLOURS[0])
  }

  function handleMarkerPointerDown(m) {
    markerHeldRef.current = false
    clearTimeout(markerHoldTimerRef.current)
    markerHoldTimerRef.current = setTimeout(() => openMarkerEditor(m), HOLD_THRESHOLD_MS)
  }

  function handleMarkerPointerUp(m) {
    clearTimeout(markerHoldTimerRef.current)
    if (markerHeldRef.current) return // long-press already handled it
    seekTo(m.start_seconds)
    if (m.note_text) setViewingMarkerNote(m)
  }

  async function deleteMarker(m) {
    await supabase.from('fight_footage_markers').delete().eq('id', m.id)
    setMarkers(prev => prev.filter(x => x.id !== m.id))
    setEditingMarker(null)
  }

  // Note text and highlight colour save together now, rather than as
  // two separate edit paths -- a marker can freely have either, both,
  // or (after clearing the note) just a colour again.
  async function saveMarkerEdits(m, colour) {
    const updates = { note_text: editingMarkerNoteText.trim() || null, highlight_color: colour }
    await supabase.from('fight_footage_markers').update(updates).eq('id', m.id)
    setMarkers(prev => prev.map(x => x.id === m.id ? { ...x, ...updates } : x))
    setEditingMarker(null)
  }

  return (
    <div ref={wrapperRef} style={{
      position: 'fixed', inset: 0, background: '#000', zIndex: 200,
      userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none', touchAction: 'manipulation',
    }}
      onContextMenu={e => e.preventDefault()}>
      {/* Video always fills the entire player, full stop -- every
          control (top bar, middle overlay, bottom bar) floats on top
          of it as an absolute overlay instead of taking its own layout
          space, so nothing about the video's own size ever changes
          depending on whether controls happen to be showing. */}
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {/* This inner box exactly matches the video's own rendered
            bounds (same aspect ratio, fit within the available space)
            -- in portrait, a landscape video is letterboxed with black
            bars above/below, and without this, overlays like the note
            below would end up positioned against the full screen and
            appear to float in that black bar rather than sitting
            against the actual visible video image. */}
        <div style={{ position: 'relative', maxWidth: '100%', maxHeight: '100%', aspectRatio: videoAspect }}>
          <video
            ref={videoRef}
            src={videoUrl}
            crossOrigin="anonymous"
            style={{ width: '100%', height: '100%', objectFit: 'contain' }}
            playsInline
            webkit-playsinline="true"
            disablePictureInPicture
            controlsList="nofullscreen noremoteplayback"
            onPointerDown={handlePointerDown}
            onPointerMove={handleVideoPointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={() => { if (isHoldingRef.current) handlePointerUp({ clientX: 0 }) }}
          />
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
            <div style={{
              position: 'absolute', bottom: 16, left: 16, right: 16, color: '#fff', fontSize: 13, padding: '10px 14px', borderRadius: 8,
              background: hexToRgba(viewingMarkerNote.highlight_color || '#000000', 0.55), backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
            }}
              onClick={() => setViewingMarkerNote(null)}>
              📝 {viewingMarkerNote.note_text}
            </div>
          )}
        </div>

        <canvas ref={canvasRef} style={{ display: 'none' }} />
        <video ref={filmstripVideoRef} src={videoUrl} crossOrigin="anonymous" muted playsInline style={{ display: 'none' }} />
        <canvas ref={filmstripCanvasRef} style={{ display: 'none' }} />

        {/* Middle overlay -- just play/pause and speed, tap the video
            to show/hide (same tap-to-show as the bottom bar now). */}
        {controlsVisible && (
          <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, transform: 'translateY(-50%)', padding: '16px 12px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}
            onClick={e => e.stopPropagation()}>
            <button style={{ minWidth: 72, height: 72, borderRadius: '50%', justifyContent: 'center', fontSize: 26, cursor: 'pointer', color: '#fff', ...GLASS_STYLE }}
              onPointerDown={handlePlayButtonPointerDown} onPointerUp={handlePlayButtonPointerUp}
              onPointerLeave={() => { if (isHoldingRef.current) handlePlayButtonPointerUp() }}>{playing ? '⏸' : '▶️'}</button>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center' }}>
              {SPEEDS.map(s => (
                <button key={s} onClick={() => setPlaybackSpeed(s)}
                  style={{ padding: '4px 12px', borderRadius: 20, fontSize: 12, cursor: 'pointer', fontFamily: 'var(--font-sans)',
                    ...GLASS_STYLE,
                    border: speed === s ? '1px solid #fff' : GLASS_BORDER,
                    color: speed === s ? '#fff' : 'rgba(255,255,255,0.7)', fontWeight: speed === s ? 600 : 400 }}>
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

      {/* Top bar -- floats over the video too now, doesn't take its
          own layout space. */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 12, zIndex: 2 }}>
        <span style={{ color: '#fff', fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</span>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="btn btn-sm" style={GLASS_STYLE} onClick={toggleFullscreen}>{isFullscreen ? '⤢ Exit fullscreen' : '⛶ Fullscreen'}</button>
          <button className="btn btn-sm" style={GLASS_STYLE} onClick={onClose}>✕ Close</button>
        </div>
      </div>

      {/* Bottom bar -- also floats over the video (absolute, not a
          flex sibling), so it never resizes the video when it shows
          or hides -- same tap-to-show/hide as the middle overlay. */}
      {controlsVisible && (
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '10px 12px 16px', ...GLASS_STYLE }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
          <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11, minWidth: 36 }}>{fmt(currentTime)}</span>
          <div style={{ flex: 1 }}>
            {/* Marker row -- its own space above the scrubber, thicker
                bars, with a visible gap between this and the track.
                The playhead line lives here too now, so it's clearly
                associated with where you are among the markers. Also
                swipeable directly (drives the same currentTime as the
                scrub bar below, so the two always stay in sync). */}
            <div ref={markerRowRef} style={{ position: 'relative', height: 18, marginBottom: 6, touchAction: 'none' }}
              onPointerDown={handleMarkerRowPointerDown}
              onPointerMove={handleMarkerRowPointerMove}
              onPointerUp={handleMarkerRowPointerUp}
              onPointerLeave={handleMarkerRowPointerUp}>
              {(() => {
                const windowDuration = zoomLevel === 1 ? duration : duration / zoomLevel
                const windowEnd = zoomWindowStart + windowDuration
                return duration > 0 && markers.map(m => {
                  if (m.end_seconds < zoomWindowStart || m.start_seconds > windowEnd) return null // outside the zoomed-in view
                  const leftPct = ((m.start_seconds - zoomWindowStart) / windowDuration) * 100
                  return m.marker_type === 'photo' ? (
                    <div key={m.id} title="Photo marker — hold to edit"
                      onPointerDown={e => { e.stopPropagation(); handleMarkerPointerDown(m) }}
                      onPointerUp={e => { e.stopPropagation(); handleMarkerPointerUp(m) }}
                      onPointerLeave={() => clearTimeout(markerHoldTimerRef.current)}
                      style={{
                        position: 'absolute', top: 0, left: `${leftPct}%`, transform: 'translateX(-50%)',
                        width: 18, height: 18, borderRadius: 3, cursor: 'pointer', border: '1px solid #fff',
                        backgroundImage: `url(${m.photo_data_url})`, backgroundSize: 'cover', backgroundPosition: 'center',
                      }} />
                  ) : (
                    // Outer div is a much bigger touch target than the
                    // visible bar itself -- a finger press on a thin bar
                    // was unreliable and often fell through to the
                    // scrubber underneath, triggering a seek instead of
                    // the intended hold. stopPropagation on top of that
                    // stops the press from also reaching the range input.
                    <div key={m.id}
                      title={m.note_text || 'Highlight — hold to edit'}
                      onPointerDown={e => { e.stopPropagation(); handleMarkerPointerDown(m) }}
                      onPointerUp={e => { e.stopPropagation(); handleMarkerPointerUp(m) }}
                      onPointerLeave={() => clearTimeout(markerHoldTimerRef.current)}
                      style={{
                        position: 'absolute', top: 0, height: 18, cursor: 'pointer',
                        left: `${leftPct}%`,
                        width: `${Math.max(2, ((m.end_seconds - m.start_seconds) / windowDuration) * 100)}%`,
                        display: 'flex', alignItems: 'center',
                      }}>
                      <div style={{ width: '100%', height: 9, borderRadius: 4, background: m.marker_type === 'highlight' ? (m.highlight_color || '#EF9F27') : '#378ADD' }} />
                    </div>
                  )
                })
              })()}
              {duration > 0 && (() => {
                const windowDuration = zoomLevel === 1 ? duration : duration / zoomLevel
                const pct = ((currentTime - zoomWindowStart) / windowDuration) * 100
                if (pct < 0 || pct > 100) return null
                return <div style={{ position: 'absolute', top: 0, bottom: 0, left: `${pct}%`, width: 2, background: '#fff', pointerEvents: 'none', transform: 'translateX(-1px)' }} />
              })()}
            </div>

            {/* Scrub track -- filmstrip thumbnails as a backdrop, hold
                to zoom in for more detail. */}
            <div style={{ position: 'relative' }}
              onPointerDown={handleScrubTrackPointerDown}
              onPointerUp={handleScrubTrackPointerUp}
              onPointerLeave={handleScrubTrackPointerUp}>
              {filmstrip.length > 0 && duration > 0 && (() => {
                const windowDuration = zoomLevel === 1 ? duration : duration / zoomLevel
                const visible = filmstrip.filter(f => f.t >= zoomWindowStart - windowDuration * 0.1 && f.t <= zoomWindowStart + windowDuration * 1.1)
                return (
                  <div style={{ position: 'absolute', inset: 0, borderRadius: 4, overflow: 'hidden', pointerEvents: 'none' }}>
                    {visible.map(f => (
                      <img key={f.t} src={f.url} alt=""
                        style={{
                          position: 'absolute', top: 0, height: '100%', width: `${100 / (12 / zoomLevel)}%`,
                          left: `${((f.t - zoomWindowStart) / windowDuration) * 100}%`,
                          objectFit: 'cover', opacity: 0.55,
                        }} />
                    ))}
                  </div>
                )
              })()}
              <input
                type="range"
                min={zoomWindowStart}
                max={zoomLevel === 1 ? (duration || 0) : zoomWindowStart + duration / zoomLevel}
                step={0.01}
                value={currentTime}
                onChange={e => seekTo(parseFloat(e.target.value))}
                onPointerDown={handleScrubStart}
                onPointerUp={handleScrubEnd}
                style={{ width: '100%', position: 'relative' }}
              />
            </div>
          </div>
          <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11, minWidth: 36 }}>{fmt(duration)}</span>
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginBottom: 6 }}>
          <button className="btn btn-sm" style={GLASS_STYLE} disabled={zoomLevel === ZOOM_LEVELS[0]} onClick={() => setZoomLevel(z => ZOOM_LEVELS[Math.max(0, ZOOM_LEVELS.indexOf(z) - 1)])}>🔍− Zoom out</button>
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', alignSelf: 'center' }}>{zoomLevel}x</span>
          <button className="btn btn-sm" style={GLASS_STYLE} disabled={zoomLevel === ZOOM_LEVELS[ZOOM_LEVELS.length - 1]} onClick={() => setZoomLevel(z => ZOOM_LEVELS[Math.min(ZOOM_LEVELS.length - 1, ZOOM_LEVELS.indexOf(z) + 1)])}>🔍+ Zoom in</button>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', alignItems: 'center', marginTop: 8 }}>
          <button className="btn btn-sm" style={GLASS_STYLE} onClick={() => step(-5)}>⏪ 5s</button>
          <button className="btn btn-sm" style={GLASS_STYLE} onClick={() => step(-FRAME_SECONDS)}>⏮ Frame</button>
          <button className="btn btn-primary" style={{ minWidth: 56, justifyContent: 'center' }}
            onPointerDown={handlePlayButtonPointerDown} onPointerUp={handlePlayButtonPointerUp}
            onPointerLeave={() => { if (isHoldingRef.current) handlePlayButtonPointerUp() }}>{playing ? '⏸' : '▶️'}</button>
          <button className="btn btn-sm" style={GLASS_STYLE} onClick={() => step(FRAME_SECONDS)}>Frame ⏭</button>
          <button className="btn btn-sm" style={GLASS_STYLE} onClick={() => step(5)}>5s ⏩</button>
        </div>

        {isCoach && footageId && !showMarkerChoice && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 10 }}>
            {markerRangeStart === null ? (
              <>
                <button className="btn btn-sm" style={GLASS_STYLE} onClick={handleMarkerButtonPress}>📍 Add marker here</button>
                <button className="btn btn-sm" style={GLASS_STYLE} onClick={capturePhotoMarker}>📷 Add photo</button>
              </>
            ) : (
              <>
                <button className="btn btn-sm" style={GLASS_STYLE} onClick={handleMarkerButtonPress}>🏁 End marker here</button>
                <button className="btn btn-sm" style={GLASS_STYLE} onClick={cancelMarkerRange}>✕ Cancel</button>
              </>
            )}
          </div>
        )}

        {clips.length > 0 && (
          <div style={{ marginTop: 12, borderTop: '1px solid rgba(255,255,255,0.15)', paddingTop: 10 }}>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', marginBottom: 6, textAlign: 'center' }}>Saved clips</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center' }}>
              {clips.map(c => (
                <button key={c.id} className="btn btn-sm" style={GLASS_STYLE} onClick={() => openClip(c)} style={{ opacity: c.status === 'ready' ? 1 : 0.6 }}>
                  {c.status === 'ready' ? '▶️' : c.status === 'failed' ? '⚠️' : '⏳'} {(c.end_seconds - c.start_seconds).toFixed(1)}s @ {fmt(c.start_seconds)}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      )}

      {pendingClip && (
        <div style={{ position: 'fixed', top: 60, left: 12, zIndex: 205, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: 10, borderRadius: 12, ...GLASS_STYLE }}>
          <span style={{ fontSize: 10, color: '#fff', fontWeight: 600 }}>{(pendingClip.end - pendingClip.start).toFixed(1)}s clip</span>
          <button title="Save clip" disabled={savingClip} onClick={saveClip}
            style={{ width: 40, height: 40, borderRadius: '50%', border: 'none', cursor: 'pointer', fontSize: 18, background: 'rgba(29,158,117,0.5)' }}>
            {savingClip ? '⏳' : '✓'}
          </button>
          <button title="Discard" onClick={() => setPendingClip(null)}
            style={{ width: 40, height: 40, borderRadius: '50%', border: 'none', cursor: 'pointer', fontSize: 18, background: 'rgba(226,75,74,0.5)' }}>
            ✕
          </button>
        </div>
      )}

      {showMarkerChoice && (
        <div style={{ padding: '10px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, ...GLASS_STYLE }}>
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>
            {fmt(Math.min(markerRangeStart, currentTime))} → {fmt(Math.max(markerRangeStart, currentTime))} ({Math.abs(currentTime - markerRangeStart).toFixed(1)}s)
          </span>
          <div style={{ display: 'flex', gap: 6 }}>
            {HIGHLIGHT_COLOURS.map(c => (
              <button key={c} title="Highlight colour" onClick={() => setSelectedColour(c)}
                style={{ width: 26, height: 26, borderRadius: '50%', background: c, cursor: 'pointer', padding: 0,
                  border: selectedColour === c ? '3px solid #fff' : '2px solid rgba(255,255,255,0.4)' }} />
            ))}
          </div>
          <input value={addingNoteText} onChange={e => setAddingNoteText(e.target.value)} placeholder="Add a note (optional)" style={{ width: '100%', maxWidth: 480, fontSize: 13 }} />
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-sm btn-primary" onClick={saveMarker}>Save</button>
            <button className="btn btn-sm" style={GLASS_STYLE} onClick={cancelMarkerRange}>Cancel</button>
          </div>
        </div>
      )}

      {editingMarker && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 210, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
          onClick={() => setEditingMarker(null)}>
          <div style={{ width: '100%', maxWidth: 380, padding: 16, borderRadius: 12, ...GLASS_STYLE }} onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>
              {editingMarker.marker_type === 'photo' ? 'Photo marker' : 'Edit marker'} — {fmt(editingMarker.start_seconds)}{editingMarker.marker_type !== 'photo' ? ` → ${fmt(editingMarker.end_seconds)}` : ''}
            </h3>

            {editingMarker.marker_type === 'photo' ? (
              <div style={{ marginBottom: 12 }}>
                <img src={editingMarker.photo_data_url} alt="" style={{ width: '100%', borderRadius: 8, marginBottom: 8 }} />
                <p style={{ fontSize: 12, color: 'var(--text-secondary)', textAlign: 'center' }}>Freezes for {editingMarker.freeze_seconds || 5}s during playback</p>
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 12 }}>
                  {HIGHLIGHT_COLOURS.map(c => (
                    <button key={c} onClick={() => setEditingMarkerColour(c)}
                      style={{ width: 30, height: 30, borderRadius: '50%', background: c, cursor: 'pointer', padding: 0,
                        border: editingMarkerColour === c ? '3px solid #fff' : '2px solid rgba(255,255,255,0.4)' }} />
                  ))}
                </div>
                <textarea value={editingMarkerNoteText} onChange={e => setEditingMarkerNoteText(e.target.value)} placeholder="Note (optional)" style={{ width: '100%', fontSize: 13, minHeight: 60, marginBottom: 10 }} />
                <button className="btn btn-sm btn-primary" style={{ width: '100%', justifyContent: 'center', marginBottom: 8 }} onClick={() => saveMarkerEdits(editingMarker, editingMarkerColour)}>Save</button>
              </>
            )}

            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-sm" style={{ ...GLASS_STYLE, color: '#E24B4A', flex: 1, justifyContent: 'center' }} onClick={() => deleteMarker(editingMarker)}>🗑️ Delete</button>
              <button className="btn btn-sm" style={{ ...GLASS_STYLE, flex: 1, justifyContent: 'center' }} onClick={() => setEditingMarker(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
