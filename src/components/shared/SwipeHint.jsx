import { useState } from 'react'
// Above a swipe set of question cards: once a monthly focus is set, the other (non-focus) questions are folded away --
// '▼ Other questions' shows them again. ‹ › arrows show there's more to swipe to, and step a page.
export default function SwipeHint() {
  const [all, setAll] = useState(false)
  const box = e => e.currentTarget.closest('.kc-swipe-hint')?.nextElementSibling
  const go = (e, d) => { const b = box(e); if (b) b.scrollBy({ left: d * b.clientWidth, behavior: 'smooth' }) }
  const st = { all: 'unset', cursor: 'pointer', width: 26, height: 22, borderRadius: 6, border: '1px solid var(--border)', color: 'var(--text-secondary)', textAlign: 'center', fontSize: 14, lineHeight: '20px' }
  return (
    <div className="kc-swipe-hint" style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 6, margin: '-2px 0 4px' }} aria-label="Swipe for more">
      <button type="button" className="kc-others-btn" style={{ ...st, width: 'auto', padding: '0 8px', fontSize: 11, marginRight: 'auto' }}
        onClick={e => { const b = box(e); const next = !all; setAll(next); b?.classList.toggle('kc-show-all', next) }}>
        {all ? '▲ Focus only' : '▼ Other questions'}
      </button>
      <button type="button" style={st} aria-label="Previous" onClick={e => go(e, -1)}>‹</button>
      <button type="button" style={st} aria-label="Next" onClick={e => go(e, 1)}>›</button>
    </div>
  )
}
