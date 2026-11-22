// Small ‹ › arrows above a swipe set of question cards: shows there's more to swipe to, and steps one page
export default function SwipeHint() {
  const go = (e, d) => { const box = e.currentTarget.parentElement?.nextElementSibling; if (box) box.scrollBy({ left: d * box.clientWidth, behavior: 'smooth' }) }
  const st = { all: 'unset', cursor: 'pointer', width: 26, height: 22, borderRadius: 6, border: '1px solid var(--border)', color: 'var(--text-secondary)', textAlign: 'center', fontSize: 14, lineHeight: '20px' }
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, margin: '-2px 0 4px' }} aria-label="Swipe for more">
      <button type="button" style={st} aria-label="Previous" onClick={e => go(e, -1)}>‹</button>
      <button type="button" style={st} aria-label="Next" onClick={e => go(e, 1)}>›</button>
    </div>
  )
}
