// "📁 Files / Dropbox" pickers (Oct 2026). A file picker limited to video/* (or
// image/*) opens the phone's gallery / camera chooser, which doesn't offer the
// Files app or Dropbox. A picker with NO type filter opens the full file browser
// instead -- Android: the Files browser, with Dropbox in its side menu (if the
// Dropbox app is installed); iPhone: "Choose Files" -> the Files app, where Dropbox
// shows as a location once enabled. Because anything can be picked there, the
// files are checked here and only videos (and photos where allowed) are kept.
const VIDEO_EXT = /\.(mp4|mov|m4v|webm|mkv|avi|3gp|wmv|mts|m2ts|mpg|mpeg)$/i
const IMAGE_EXT = /\.(jpe?g|png|heic|heif|webp|gif)$/i

export const isVideoFile = f => (f.type || '').startsWith('video/') || VIDEO_EXT.test(f.name || '')
export const isImageFile = f => (f.type || '').startsWith('image/') || IMAGE_EXT.test(f.name || '')

// Keeps the usable files and says (once) if anything was skipped.
export function keepMedia(fileList, { images = false } = {}) {
  const all = [...(fileList || [])]
  const kept = all.filter(f => isVideoFile(f) || (images && isImageFile(f)))
  const skipped = all.length - kept.length
  if (skipped > 0) alert(`${skipped} file${skipped === 1 ? ' was' : 's were'} skipped -- only ${images ? 'videos and photos' : 'videos'} can be added here.`)
  return kept
}
