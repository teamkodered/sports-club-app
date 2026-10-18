// Back / Home buttons for the public league pages when they're opened from inside the
// app (?from=app) -- the TV / shared-link views stay clean (no buttons).
export default function AppBackBar() {
  if (typeof window === 'undefined') return null
  const p = new URLSearchParams(window.location.search)
  if (p.get('from') !== 'app') return null
  const home = p.get('home') || '/athlete-app'
  const btn = { padding: '8px 14px', borderRadius: 18, border: '1px solid #2A3138', background: 'rgba(20,24,28,0.92)', color: '#F2F2F2', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', boxShadow: '0 2px 10px rgba(0,0,0,0.4)' }
  return (
    <div style={{ position: 'fixed', top: 'calc(10px + env(safe-area-inset-top, 0px))', left: 10, zIndex: 1000, display: 'flex', gap: 8 }}>
      <button type="button" style={btn} onClick={() => { if (window.history.length > 1) window.history.back(); else window.location.href = home }}>← Back</button>
      <button type="button" style={btn} onClick={() => { window.location.href = home }}>🏠 Home</button>
    </div>
  )
}
