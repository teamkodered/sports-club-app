import { useEffect, useRef, useState } from 'react'
// Above a swipe set of question cards. Shows only what's useful:
//  • '▼ Other questions' -- only when this set has folded-away (non-focus) questions
//  • ‹ › arrows -- only when the cards showing don't all fit (there's something to scroll to)
export default function SwipeHint() {
  const ref = useRef(null)
  const [all, setAll] = useState(false)
  const [state, setState] = useState({ others: false, scroll: false })
  const box = () => ref.current?.nextElementSibling
  useEffect(() => {
    const b = box(); if (!b) return
    const check = () => {
      const others = !!b.querySelector(':scope > .neon-q.is-greyed, :scope > .neon-q.is-always')
      const scroll = b.scrollWidth > b.clientWidth + 4
      setState(s => (s.others === others && s.scroll === scroll) ? s : { others, scroll })
    }
    check()
    const mo = new MutationObserver(check); mo.observe(b, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] })
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(check) : null; ro?.observe(b)
    const t = setTimeout(check, 300)
    return () => { mo.disconnect(); ro?.disconnect(); clearTimeout(t) }
  }, [all])
  const go = d => { const b = box(); if (b) b.scrollBy({ left: d * b.clientWidth, behavior: 'smooth' }) }
  const st = { all: 'unset', cursor: 'pointer', width: 26, height: 22, borderRadius: 6, border: '1px solid var(--border)', color: 'var(--text-secondary)', textAlign: 'center', fontSize: 14, lineHeight: '20px' }
  const show = state.others || state.scroll
  return (
    <div ref={ref} className="kc-swipe-hint" style={{ display: show ? 'flex' : 'none', justifyContent: 'flex-end', alignItems: 'center', gap: 6, margin: '-2px 0 4px' }} aria-label="Swipe for more">
      {state.others && (
        <button type="button" style={{ ...st, width: 'auto', padding: '0 8px', fontSize: 11, marginRight: 'auto' }}
          onClick={() => { const next = !all; setAll(next); box()?.classList.toggle('kc-show-all', next) }}>
          {all ? '▲ Focus only' : '▼ Other questions'}
        </button>
      )}
      {state.scroll && <>
        <button type="button" style={st} aria-label="Previous" onClick={() => go(-1)}>‹</button>
        <button type="button" style={st} aria-label="Next" onClick={() => go(1)}>›</button>
      </>}
    </div>
  )
}
