// When a question / sub-page opens, bring its header to the top of the screen.
// - question cards (.neon-q) that become active, and question panels that appear: scroll them up
// - Physical cards (Running, Watt bike, Stretch flows…, marked data-zoom-head): when tapping one makes
//   new content appear, scroll that card to the top so its panel shows underneath
const SEL = '.neon-q.is-active, .neon-qpanel, [data-zoom-open]'
export function installZoomToOpened() {
  if (typeof document === 'undefined' || window.__kcZoom) return
  window.__kcZoom = true
  document.addEventListener('click', e => {
    if (!e.target.closest?.('button, [role="button"]')) return
    if (e.target.closest('[role="dialog"]')) return   // pop-ups handle themselves
    const head = e.target.closest('[data-zoom-head]')
    const before = new Set(document.querySelectorAll(SEL))
    const heightBefore = document.documentElement.scrollHeight
    const target = () => {
      if (head && head.isConnected) {
        // a Physical card: only when its panel actually opened (page got taller / new panel)
        const grew = document.documentElement.scrollHeight > heightBefore + 40
        const freshPanel = [...document.querySelectorAll(SEL)].some(el => !before.has(el))
        return grew || freshPanel ? head : null
      }
      const fresh = [...document.querySelectorAll(SEL)].filter(el => !before.has(el) && el.offsetParent !== null)
      if (!fresh.length) return null
      return fresh.find(f => !fresh.some(o => o !== f && o.contains(f))) || fresh[0]
    }
    let el = null
    setTimeout(() => { el = target(); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }) }, 120)
    setTimeout(() => { if (!el || !el.isConnected) return; const t = el.getBoundingClientRect().top; if (Math.abs(t - 76) > 30) el.scrollIntoView({ behavior: 'auto', block: 'start' }) }, 650)
  }, true)
}
