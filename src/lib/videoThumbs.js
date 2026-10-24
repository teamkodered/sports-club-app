// Frames grabbed from a video file on the device (Oct 2026) -- nothing is uploaded
// to do this. Used at upload to see who's in each clip:
//   frames: 4 stills from across the video (10/35/60/85%) -- the first second is
//           often an empty ring or someone walking to the camera, so one frame
//           alone can miss.
//   thumb:  one small JPEG (~5 KB data URL) saved with the video, so Awaiting
//           publish, View iT and the athletes' lists can show a picture too.
// If the browser can't decode the file (e.g. some HEVC .mov on Windows), it
// resolves with no frames -- the upload itself still works.

const FRACTIONS = [0.1, 0.35, 0.6, 0.85]

function once(el, ev, ms) {
  return new Promise((res, rej) => {
    const t = setTimeout(() => { el.removeEventListener(ev, ok); rej(new Error(`${ev} timed out`)) }, ms)
    const ok = () => { clearTimeout(t); res() }
    el.addEventListener(ev, ok, { once: true })
  })
}

function draw(video, width, quality) {
  const w = width, h = Math.max(1, Math.round(width * (video.videoHeight / video.videoWidth || 9 / 16)))
  const c = document.createElement('canvas'); c.width = w; c.height = h
  c.getContext('2d').drawImage(video, 0, 0, w, h)
  return c.toDataURL('image/jpeg', quality)
}

export async function captureFrames(file, { width = 200, thumbWidth = 128 } = {}) {
  const url = URL.createObjectURL(file)
  const video = document.createElement('video')
  video.muted = true; video.playsInline = true; video.preload = 'auto'; video.src = url
  try {
    await once(video, 'loadedmetadata', 15000)
    const d = video.duration
    if (!isFinite(d) || d <= 0 || !video.videoWidth) return { frames: [], thumb: null }
    const frames = []
    let thumb = null
    for (const f of FRACTIONS) {
      video.currentTime = Math.min(d - 0.05, f * d)
      await once(video, 'seeked', 10000)
      frames.push(draw(video, width, 0.65))
      if (f === 0.35) thumb = draw(video, thumbWidth, 0.55)
    }
    return { frames, thumb }
  } catch {
    return { frames: [], thumb: null }
  } finally {
    video.removeAttribute('src'); video.load()
    URL.revokeObjectURL(url)
  }
}
