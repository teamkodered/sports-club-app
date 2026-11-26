import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

// New athlete home (Nov 2026): a boxer figure that fills with each section's colour as the week's
// progress grows, and a column of square section buttons. A square opens that section exactly as the
// old section tiles did (the section's own tile button is pressed), so every question, graph, result,
// PDP list and focus picker is unchanged -- the open section slides out of the square, then down;
// closing plays it backwards. Tiles for closed sections are hidden while this is on (CSS: .kc-bh).
const SECS = [
  { key: 'technique', tile: 'neon-bl',     label: 'Technical',  colour: '#2F6BFF', icon: '/logos/neon/technical.png',  fields: ['techniques'],
    regions: [[25.5, 39, 49, 23], [18, 62, 64, 34]] },
  { key: 'mentality', tile: 'neon-tl',     label: 'Mentality',  colour: '#22B14C', icon: '/logos/neon/mentality.png',  fields: ['mentality_log'],
    regions: [[34, 0, 16, 17]] },
  { key: 'tactical',  tile: 'neon-tr',     label: 'Tactical',   colour: '#FF2A2A', icon: '/logos/neon/tactical.png',   fields: ['tactical'],
    regions: [[50, 0, 16, 17]] },
  { key: 'wellbeing', tile: 'neon-bottom', label: 'Foundation', colour: '#C93BFF', icon: '/logos/neon/foundation.png', fields: ['wellbeing'],
    regions: [[25.5, 17, 49, 22], [0, 96, 100, 4]] },
  { key: 'physical',  tile: 'neon-br',     label: 'Physical',   colour: '#E6B800', icon: '/logos/neon/physical.png',   fields: ['running', 'watt_bike', 'bodyweight', 'stretch_flows', 'snc', 'other_session'],
    regions: [[0, 20, 25.5, 42], [74.5, 20, 25.5, 42]] },
]
const has = v => Array.isArray(v) ? v.length > 0 : (v && typeof v === 'object' ? Object.values(v).some(x => x !== '' && x != null && x !== false && !(Array.isArray(x) && !x.length)) : !!v)
const tileEl = s => document.querySelector(`.neon-pillar.${s.tile}`)

export default function BodyHome({ sessions = [], gender, openKey }) {
  // Typing in a box inside a section: once the keyboard is up, bring the box into the visible part of the screen
  // (iPhones / Android don't always do it for boxes in the floating section)
  useEffect(() => {
    const onFocus = e => {
      const el = e.target
      if (!el?.matches?.('input, textarea') || !el.closest('.neon-home')) return
      setTimeout(() => {
        const vv = window.visualViewport, r = el.getBoundingClientRect()
        const visBottom = vv ? vv.offsetTop + vv.height : window.innerHeight
        if (r.bottom > visBottom - 16 || r.top < (vv ? vv.offsetTop : 0) + 16) window.scrollTo({ top: window.scrollY + r.top - (vv ? vv.offsetTop : 0) - (vv ? vv.height : window.innerHeight) * 0.35, behavior: 'smooth' })
      }, 380)
    }
    document.addEventListener('focusin', onFocus)
    return () => document.removeEventListener('focusin', onFocus)
  }, [])
  // Physical cards (SNC, Stretch flows, Tests…) and other buttons that open something new inside a section:
  // whatever opens is brought into view (its top near the top of the screen) if it would be off screen
  useEffect(() => {
    const onClick = e => {
      const b = e.target.closest?.('.neon-home button, .neon-home [role="button"], .neon-home .neon-module')
      if (!b || !e.isTrusted || e.target.closest('.kc-bh-rail, .neon-q, .kc-bh-hd, input, textarea, select')) return
      const wrap = b.closest('.kc-bh-openwrap') || b.closest('.neon-pillar')?.parentElement
      if (!wrap) return
      const added = []
      const mo = new MutationObserver(list => { for (const r of list) for (const n of r.addedNodes) if (n.nodeType === 1) added.push(n) })
      mo.observe(wrap, { childList: true, subtree: true })
      setTimeout(() => {
        mo.disconnect()
        const vis = added.filter(n => n.isConnected && n.offsetHeight > 80)
        if (!vis.length) return
        vis.sort((a, c) => a.getBoundingClientRect().top - c.getBoundingClientRect().top)
        const r = vis[0].getBoundingClientRect(), vh = window.innerHeight
        if (r.top < 60 || r.top > vh * 0.55) window.scrollTo({ top: window.scrollY + r.top - 80, behavior: 'smooth' })
      }, 380)
    }
    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [])
  // A question open: swipe left / right on the section header or the question's card to go to the next / previous
  // question in that set (the folded-away ones are skipped unless '▼ Other questions' is showing them)
  useEffect(() => {
    let x0 = null, y0 = null, from = null
    const down = e => {
      const t = e.touches?.[0]; if (!t) return
      // anywhere in the open section (header, question card, the panel's empty space) -- but not where sideways
      // swiping already does something (option / card swipe rows, inputs, sliders)
      const el = e.target.closest?.('.kc-bh-hd, .kc-bh-openwrap, .neon-q.is-active, .neon-qpanel')
      // the open question's card + panel sit INSIDE the cards' swipe row, so only skip the parts that scroll sideways themselves
      const own = e.target.closest('.kc-bh-hd, .neon-q.is-active, .neon-qpanel')
      if (!el || e.target.closest('.opt-swipe, input, textarea, select, [data-noswipe], .neon-run-carousel') || (!own && e.target.closest('.q-swipe'))) { x0 = null; return }
      if (!document.querySelector('.neon-q.is-active')) { x0 = null; return }
      x0 = t.clientX; y0 = t.clientY; lx = x0; ly = y0; from = el
    }
    let lx = 0, ly = 0
    const move = e => { const t = e.touches?.[0]; if (t) { lx = t.clientX; ly = t.clientY } }
    const up = e => {
      if (x0 == null) return
      const t = e.changedTouches?.[0] || { clientX: lx, clientY: ly }
      const dx = t.clientX - x0, dy = t.clientY - y0; x0 = null
      if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.5) return
      const active = (from.classList.contains('neon-q') && from.classList.contains('is-active')) ? from : (from.closest('.kc-bh-openwrap')?.querySelector('.neon-q.is-active') || document.querySelector('.neon-q.is-active')); if (!active) return
      const box = active.parentElement, showAll = box.classList.contains('kc-show-all')
      let list = [...box.querySelectorAll(':scope > .neon-q')]
      if (list.length < 2) list = [...(active.closest('.kc-bh-openwrap, .neon-pillar-quad > div, .neon-foundation-wrap') || box).querySelectorAll('.neon-q')]   // open card shown outside its grid
      list = list.filter(q => q === active || showAll || !(q.classList.contains('is-greyed') || q.classList.contains('is-always')))
      const i = list.indexOf(active), next = list[i + (dx < 0 ? 1 : -1)]
      if (next) { e.preventDefault?.(); next.click() }
    }
    document.addEventListener('touchstart', down, { passive: true, capture: true })
    document.addEventListener('touchmove', move, { passive: true, capture: true })
    document.addEventListener('touchend', up, { capture: true })
    document.addEventListener('touchcancel', up, { capture: true })
    return () => { for (const [ev, fn] of [['touchstart', down], ['touchmove', move], ['touchend', up], ['touchcancel', up]]) document.removeEventListener(ev, fn, { capture: true }) }
  }, [])
  // A question opened inside a section: if it (and what opens under it) is off screen, scroll just enough to show it
  useEffect(() => {
    const onClick = e => {
      const q = e.target.closest?.('.neon-home .neon-q, .neon-home .neon-run-btn')
      if (!q || e.target.closest('.kc-bh-rail')) return
      setTimeout(() => {
        const el = q.isConnected ? q : document.querySelector('.neon-home .neon-q.is-active')
        if (!el || !(el.classList.contains('is-active') || el.classList.contains('on') || el.classList.contains('is-on') || el.getAttribute('aria-expanded') === 'true')) return   // only when it OPENED
        const r = el.getBoundingClientRect(), vh = window.innerHeight
        if (r.top < 60 || r.top > vh * 0.45) window.scrollTo({ top: window.scrollY + r.top - 80, behavior: 'smooth' })
      }, 320)
    }
    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [])
  const [busy, setBusy] = useState(false)
  useEffect(() => { document.body.classList.add('kc-bh'); return () => document.body.classList.remove('kc-bh', 'kc-bh-open') }, [])
  useEffect(() => {
    for (const s of SECS) {
      const w = tileEl(s)?.parentElement; if (!w) continue
      w.classList.toggle('kc-bh-hide', s.key !== openKey)
      w.classList.toggle('kc-bh-openwrap', s.key === openKey)
    }
  })
  useEffect(() => {
    document.body.classList.toggle('kc-bh-open', !!openKey)
    const i = SECS.findIndex(x => x.key === openKey)
    if (i >= 0) { document.body.style.setProperty('--kc-bh-top', `${i * 62}px`); document.body.style.setProperty('--kc-bh-c', SECS[i].colour) }
  }, [openKey])

  // this week's progress per section: days (Mon -> today) with something logged, out of 5
  const prog = useMemo(() => {
    const now = new Date(), mon = new Date(now); mon.setDate(now.getDate() - ((now.getDay() + 6) % 7)); mon.setHours(0, 0, 0, 0)
    const from = mon.toISOString().split('T')[0]
    const week = (sessions || []).filter(s => s.session_date >= from)
    const out = {}, days = {}
    for (const s of SECS) {
      const hit = week.filter(w => s.fields.some(f => has(w[f])))
      out[s.key] = Math.min(1, hit.length / 5)
      days[s.key] = [0, 1, 2, 3, 4, 5, 6].map(i => { const d = new Date(mon); d.setDate(mon.getDate() + i); const k = d.toISOString().split('T')[0]; return hit.some(w => w.session_date === k) })
    }
    out.__days = days
    return out
  }, [sessions])
  const overall = Math.round(SECS.reduce((a, s) => a + prog[s.key], 0) / SECS.length * 100)

  // like the mockup: the section comes out of its square (slides out, then down); closing plays it
  // backwards (slides up, then in) before the section's own tile is pressed to shut it
  // the page must not move when a square is pressed: the old section code scrolls to the section it
  // opens / closes, so scrolling is held still for a moment around each press
  const holdScroll = () => {
    if (window.__kcHold) return
    const st = window.scrollTo, siv = Element.prototype.scrollIntoView
    window.__kcHold = true; window.scrollTo = () => {}; Element.prototype.scrollIntoView = function () {}
    setTimeout(() => { window.scrollTo = st; Element.prototype.scrollIntoView = siv; window.__kcHold = false }, 1300)
  }
  // which section was open when the finger went down (the page's tap-outside handler can shut it
  // before the click arrives -- so the click must not read that as "nothing open" and reopen it)
  const downOpen = useRef(null)
  const press = () => { downOpen.current = openKey; holdScroll() }
  // Opening a section: go STRAIGHT to the same place every time -- the Sessions / Results / PDP tiles at the top of the
  // screen, squares + figure + the section below them. Runs at the press (not after the slide), with the browser's own
  // scroll (the page's scroll guard is on during a press), so there's no open-then-scroll or down-then-up.
  useEffect(() => { try { const old = window.history.scrollRestoration; window.history.scrollRestoration = 'manual'; return () => { window.history.scrollRestoration = old } } catch { return undefined } }, [])
  const nativeScroll = useRef(typeof window !== 'undefined' ? window.scrollTo.bind(window) : null)
  const showSection = () => {
    const tiles = document.querySelector('.neon-stat')
    const anchor = tiles ? tiles.getBoundingClientRect().top : null
    if (anchor == null) return
    const top = Math.max(0, window.scrollY + anchor - 12)
    if (Math.abs(top - window.scrollY) > 4) nativeScroll.current?.({ top, behavior: 'smooth' })
  }
  const open = s => {
    if (busy) return
    const was = downOpen.current ?? openKey
    downOpen.current = null
    const cur = SECS.find(x => x.key === was)
    if (!cur) { if (!tileEl(s)?.classList.contains('is-open')) { showSection(); tileEl(s)?.click() } return }
    const wrap = tileEl(cur)?.parentElement
    if (cur.key !== s.key) showSection()
    setBusy(true); wrap?.classList.add('kc-closing')
    setTimeout(() => {
      wrap?.classList.remove('kc-closing')
      if (tileEl(cur)?.classList.contains('is-open')) tileEl(cur).click()
      if (cur.key !== s.key) setTimeout(() => { if (!tileEl(s)?.classList.contains('is-open')) tileEl(s)?.click() }, 30)
      setBusy(false)
    }, 520)
  }
  // tapping off the open section (anywhere else on the page) also plays the closing slide:
  // catch the tap before the page's own tap-outside handler snaps it shut
  useEffect(() => {
    const cur = SECS.find(x => x.key === openKey)
    if (!cur) return
    const onDown = e => {
      const wrap = tileEl(cur)?.parentElement, t = e.target
      if (!wrap || wrap.contains(t) || t.closest?.('.kc-bh-rail, .kc-bh-figw, [role="dialog"], [aria-modal="true"], [role="status"], .kc-keep-open')) return
      e.stopPropagation()
      // the tap only closes the open section -- swallow the click that follows so nothing behind it gets pressed
      const swallow = ev => { ev.preventDefault(); ev.stopPropagation(); window.removeEventListener('click', swallow, true) }
      window.addEventListener('click', swallow, true)
      setTimeout(() => window.removeEventListener('click', swallow, true), 700)
      downOpen.current = cur.key; holdScroll(); open(cur)
    }
    window.addEventListener('mousedown', onDown, true)
    return () => window.removeEventListener('mousedown', onDown, true)
  }, [openKey, busy])
  const [slots, setSlots] = useState(null)
  useEffect(() => {
    const s = SECS.find(x => x.key === openKey)
    if (!s) { setSlots(null); return }
    const tile = tileEl(s), wrap = tile?.parentElement
    if (!wrap) return
    const head = document.createElement('div'); head.className = 'kc-bh-head'
    const foot = document.createElement('div'); foot.className = 'kc-bh-foot'
    wrap.insertBefore(head, wrap.firstChild); wrap.appendChild(foot)
    // read what the old header showed (points, quote, its VIEW button) so nothing is lost
    const pts = tile.querySelector('.neon-sec-pts')?.textContent || ''
    const quoteEl = [...tile.querySelectorAll('*')].filter(e => /^[“"]/.test((e.textContent || '').trim()) && e.children.length <= 2).pop()
    const viewEl = [...tile.querySelectorAll('*')].find(e => /VIEW$/i.test((e.textContent || '').trim()) && (e.textContent || '').trim().length < 14)
    setSlots({ head, foot, pts, quote: quoteEl?.textContent?.trim() || '', viewEl })
    const rail = document.querySelector('.kc-bh-rail'), host = rail?.parentElement
    if (rail && host) {
      if (getComputedStyle(host).position === 'static') host.style.position = 'relative'
      const i = SECS.findIndex(x => x.key === openKey)
      const top = rail.getBoundingClientRect().top - host.getBoundingClientRect().top + i * 62   // level with its own square (slides out of it)
      wrap.classList.add('kc-bh-float'); wrap.style.top = `${Math.max(0, top)}px`
    }
    return () => { head.remove(); foot.remove(); wrap.classList.remove('kc-bh-float'); wrap.style.top = '' }
  }, [openKey])
  const cur = SECS.find(x => x.key === openKey)
  const portals = cur && slots ? (
    <>
      {createPortal(
        <div className="kc-bh-hd" style={{ '--c': cur.colour, cursor: 'pointer' }} role="button" aria-label={`Close ${cur.label}`}
          onPointerDown={press} onClick={() => { const q = tileEl(cur)?.parentElement?.querySelector('.neon-q.is-active'); if (q) { q.click(); return } const ev = new CustomEvent('kc-section-back', { detail: { sec: cur.key, handled: false } }); window.dispatchEvent(ev); if (!ev.detail.handled) open(cur) }} title="Tap to go back">
          <div className="kc-bh-hrow"><img src={cur.icon} alt="" /><b>{cur.label}</b><span>{slots.pts}</span></div>
          <div className="kc-bh-hrow2">
            {slots.viewEl && <button type="button" className="kc-bh-chip" onPointerDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); slots.viewEl.click() }}>📈 VIEW</button>}
            <span>THIS WEEK · {(prog.__days?.[cur.key] || []).filter(Boolean).length} done</span>
          </div>
          {/* charges left to right: one bar lit for each day logged this week (not tied to which weekday) */}
          <div className="kc-bh-week">{(() => { const days = prog.__days?.[cur.key] || []; const n = days.filter(Boolean).length; return days.map((_, i) => <i key={i} className={i < n ? 'd' : ''} />) })()}</div>
          {slots.quote && <div className="kc-bh-quote">{slots.quote}</div>}
        </div>, slots.head)}
    </>
  ) : null
  const fig = /^f/i.test(String(gender || '').trim()) ? '/figures/boxer-female.png' : '/figures/boxer-male.png'   // F / f / Female
  const glow = SECS.find(x => x.key === openKey)?.colour || '#F5C542'

  return (
    <>
      {portals}
      <div className="kc-bh-rail" role="navigation" aria-label="Sections" onMouseDown={e => e.stopPropagation()}>
        {SECS.map(s => (
          <button key={s.key} type="button" className={`kc-bh-sq${openKey === s.key ? ' on' : ''}`} onPointerDown={press} onClick={() => open(s)} title={s.label} aria-label={s.label}
            style={{ '--c': s.colour, '--p': prog[s.key] }}>
            <img src={s.icon} alt="" />
            <small>{Math.round(prog[s.key] * 100)}</small>
          </button>
        ))}
      </div>
      {(
        <div className="kc-bh-figw" onMouseDown={e => e.stopPropagation()}>
          <div className="kc-bh-fig" style={{ filter: openKey ? 'none' : `drop-shadow(0 0 6px ${glow}88) drop-shadow(0 0 14px ${glow}44)` }}>
            <div className="kc-bh-mask" style={{ WebkitMaskImage: `url(${fig})`, maskImage: `url(${fig})` }}>
              {SECS.map(s => s.regions.map(([x, y, w, h], i) => (
                <div key={s.key + i} style={{ position: 'absolute', left: `${x}%`, top: `${y}%`, width: `${w}%`, height: `${h}%`,
                  background: `linear-gradient(to top, ${s.colour} ${prog[s.key] * 100}%, #4a4a4a ${prog[s.key] * 100}%)` }} />
              )))}
            </div>
            {SECS.map(s => s.regions.map(([x, y, w, h], i) => (
              <button key={'h' + s.key + i} type="button" aria-label={s.label} onPointerDown={press} onClick={() => open(s)}
                style={{ all: 'unset', cursor: 'pointer', position: 'absolute', left: `${x}%`, top: `${y}%`, width: `${w}%`, height: `${h}%` }} />
            )))}
          </div>
          <div className="kc-bh-tot">Week · {overall}% overall</div>
        </div>
      )}
    </>
  )
}
