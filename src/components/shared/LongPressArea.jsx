import { useRef } from 'react'

// Tap -> onTap, press and hold (default 500ms) -> onHold. Moving more than a
// few pixels cancels the hold, so scrolling a list doesn't trigger it. After
// a hold fires, the click that follows on release is swallowed so the card
// doesn't also toggle open/closed.
export default function LongPressArea({ onTap, onHold, holdMs = 500, style, children }) {
  const timerRef = useRef(null)
  const startRef = useRef(null)
  const heldRef = useRef(false)

  function clear() {
    clearTimeout(timerRef.current)
    timerRef.current = null
  }

  function onPointerDown(e) {
    heldRef.current = false
    startRef.current = { x: e.clientX, y: e.clientY }
    if (e.pointerType === 'mouse') return // PC uses the Edit button instead
    timerRef.current = setTimeout(() => {
      heldRef.current = true
      navigator.vibrate?.(15)
      onHold?.()
    }, holdMs)
  }

  function onPointerMove(e) {
    if (!timerRef.current || !startRef.current) return
    if (Math.abs(e.clientX - startRef.current.x) > 8 || Math.abs(e.clientY - startRef.current.y) > 8) clear()
  }

  function onClick(e) {
    if (heldRef.current) { heldRef.current = false; e.preventDefault(); return }
    onTap?.(e)
  }

  return (
    <div style={{ WebkitTouchCallout: 'none', userSelect: 'none', WebkitUserSelect: 'none', cursor: 'pointer', ...style }}
      onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={clear} onPointerCancel={clear} onPointerLeave={clear}
      onContextMenu={e => e.preventDefault()} onClick={onClick}>
      {children}
    </div>
  )
}
