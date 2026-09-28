// Display-only video rotation. A 90/270 rotation swaps the visible aspect
// ratio, so the outer box takes the rotated shape and the <video> inside is
// sized to the *unrotated* shape, centred, then rotated into place.
//
// Box W x H with W/H = 1/aspect  =>  H = W * aspect. The unrotated video
// must be H wide and W tall: width = aspect * 100% of the box width,
// height = (1/aspect) * 100% of the box height.
export function normaliseRotation(r) {
  return ((Math.round((r || 0) / 90) * 90) % 360 + 360) % 360
}

export function rotationLayout(rotation, aspect) {
  const r = normaliseRotation(rotation)
  if (r === 90 || r === 270) {
    return {
      boxAspect: 1 / aspect,
      videoStyle: {
        position: 'absolute', top: '50%', left: '50%',
        width: `${aspect * 100}%`, height: `${100 / aspect}%`,
        objectFit: 'contain', transform: `translate(-50%, -50%) rotate(${r}deg)`,
      },
    }
  }
  return {
    boxAspect: aspect,
    videoStyle: { width: '100%', height: '100%', objectFit: 'contain', transform: r ? `rotate(${r}deg)` : undefined },
  }
}

// Draws the current frame of `video` onto `canvas` with the rotation
// applied, so photo markers come out the same way up as the playback.
export function drawRotatedFrame(video, canvas, rotation) {
  const r = normaliseRotation(rotation)
  const vw = video.videoWidth, vh = video.videoHeight
  const sideways = r === 90 || r === 270
  canvas.width = sideways ? vh : vw
  canvas.height = sideways ? vw : vh
  const ctx = canvas.getContext('2d')
  ctx.translate(canvas.width / 2, canvas.height / 2)
  ctx.rotate((r * Math.PI) / 180)
  ctx.drawImage(video, -vw / 2, -vh / 2, vw, vh)
}
