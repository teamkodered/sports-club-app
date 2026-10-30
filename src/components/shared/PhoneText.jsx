import { useRef, useState } from 'react'

// A phone number that's easy to read (big, bold, high-contrast) and copies itself when you
// press and hold it (about half a second) -- shows "Copied ✓". A normal tap still does
// whatever the card does.
export default function PhoneText({ phone, style }) {
  const [copied, setCopied] = useState(false)
  const timer = useRef(null)
  const held = useRef(false)
  if (!phone) return null

  const copy = async () => {
    held.current = true
    try { await navigator.clipboard.writeText(phone) }
    catch {
      const t = document.createElement('textarea'); t.value = phone; document.body.appendChild(t); t.select()
      try { document.execCommand('copy') } catch { /* ignore */ } t.remove()
    }
    try { navigator.vibrate?.(30) } catch { /* ignore */ }
    setCopied(true); setTimeout(() => setCopied(false), 1500)
  }
  const start = () => { held.current = false; clearTimeout(timer.current); timer.current = setTimeout(copy, 500) }
  const stop = () => clearTimeout(timer.current)

  return (
    <span className="phone-text" style={style}
      onPointerDown={start} onPointerUp={stop} onPointerLeave={stop} onPointerCancel={stop}
      onContextMenu={e => { e.preventDefault(); if (!held.current) copy() }}
      onClick={e => { if (held.current) { e.stopPropagation(); e.preventDefault(); held.current = false } }}
      title="Press and hold to copy">
      📞 {phone}{copied && <span className="phone-text-copied">Copied ✓</span>}
    </span>
  )
}
