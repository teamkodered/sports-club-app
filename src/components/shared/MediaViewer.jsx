import { useEffect, useRef, useState } from 'react'

// In-app viewer for uploaded photos / videos: full screen, swipe left/right
// between items, pinch-zoom on photos (browser native), video plays inline.
export default function MediaViewer({ items = [], start = 0, onClose, onMeasure }) {
  const [i, setI] = useState(start)
  const swipe = useRef(null)
  const item = items[i]
  const isVideo = item && (item.type?.includes('video') || /\.(mp4|mov|webm|m4v)(\?|$)/i.test(item.url || ''))
  const isImage = item && (item.type?.startsWith('image') || /\.(jpe?g|png|gif|webp|heic)(\?|$)/i.test(item.url || ''))
  const go = d => setI(x => Math.max(0, Math.min(items.length - 1, x + d)))
  useEffect(() => {
    const k = e => { if (e.key === 'Escape') onClose(); if (e.key === 'ArrowRight') go(1); if (e.key === 'ArrowLeft') go(-1) }
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  if (!item) return null
  const btn = { width: 44, height: 44, borderRadius: 22, border: 'none', background: 'rgba(255,255,255,0.12)', color: '#fff', fontSize: 20, cursor: 'pointer' }
  return (
    <div role="dialog" aria-modal="true" style={{ position: 'fixed', inset: 0, zIndex: 520, background: '#000', display: 'flex', flexDirection: 'column' }}
      onTouchStart={e => { if (e.touches.length === 1) swipe.current = { x: e.touches[0].clientX, y: e.touches[0].clientY } }}
      onTouchEnd={e => { const c = swipe.current; swipe.current = null; if (!c || isVideo) return; const dx = e.changedTouches[0].clientX - c.x, dy = e.changedTouches[0].clientY - c.y; if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.5) go(dx < 0 ? 1 : -1); else if (dy > 110 && Math.abs(dy) > Math.abs(dx) * 1.5) onClose() }}>
      <style>{'.mv-top { display: flex; flex-direction: column; gap: 8px; align-items: flex-start } @media (orientation: landscape) { .mv-top { flex-direction: row; align-items: center } }'}</style>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: 'calc(10px + env(safe-area-inset-top, 0px)) 12px 10px', color: '#fff' }}>
        {/* top-left buttons: Measure sits under ✕ in portrait, beside it in landscape */}
        <div className="mv-top">
          <button type="button" onClick={onClose} style={btn} aria-label="Close">✕</button>
          {onMeasure && isVideo && <button type="button" onClick={() => onMeasure(item)} style={{ ...btn, width: 'auto', padding: '0 14px', fontSize: 13, fontWeight: 700 }}>📐 Measure</button>}
        </div>
        <div style={{ flex: 1, minWidth: 0, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', opacity: 0.8 }}>{item.name || ''}</div>
        {items.length > 1 && <span style={{ fontSize: 13, opacity: 0.8 }}>{i + 1} / {items.length}</span>}
      </div>
      <div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', touchAction: isImage ? 'pinch-zoom' : 'auto' }}>
        {isVideo ? (
          <video key={item.url} src={item.url} controls playsInline autoPlay style={{ maxWidth: '100%', maxHeight: '100%' }} />
        ) : isImage ? (
          <img key={item.url} src={item.url} alt={item.name || ''} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
        ) : (
          <div style={{ color: '#fff', textAlign: 'center', padding: 20 }}>
            <div style={{ fontSize: 44, marginBottom: 10 }}>📄</div>
            <a href={item.url} target="_blank" rel="noreferrer" style={{ color: '#7FB2FF' }}>Open {item.name || 'file'}</a>
          </div>
        )}
        {items.length > 1 && i > 0 && <button type="button" onClick={() => go(-1)} style={{ ...btn, position: 'absolute', left: 8 }} aria-label="Previous">‹</button>}
        {items.length > 1 && i < items.length - 1 && <button type="button" onClick={() => go(1)} style={{ ...btn, position: 'absolute', right: 8 }} aria-label="Next">›</button>}
      </div>
      <div style={{ padding: '8px 12px calc(10px + env(safe-area-inset-bottom, 0px))', textAlign: 'center', color: 'rgba(255,255,255,0.5)', fontSize: 11 }}>
        {isImage ? 'Pinch to zoom · swipe for next · swipe down to close' : 'Swipe down or ✕ to close'}
      </div>
    </div>
  )
}
