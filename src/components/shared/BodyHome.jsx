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
    setTimeout(() => { window.scrollTo = st; Element.prototype.scrollIntoView = siv; window.__kcHold = false }, 700)
  }
  // which section was open when the finger went down (the page's tap-outside handler can shut it
  // before the click arrives -- so the click must not read that as "nothing open" and reopen it)
  const downOpen = useRef(null)
  const press = () => { downOpen.current = openKey; holdScroll() }
  const open = s => {
    if (busy) return
    const was = downOpen.current ?? openKey
    downOpen.current = null
    const cur = SECS.find(x => x.key === was)
    if (!cur) { if (!tileEl(s)?.classList.contains('is-open')) tileEl(s)?.click(); return }
    const wrap = tileEl(cur)?.parentElement
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
      if (!wrap || wrap.contains(t) || t.closest?.('.kc-bh-rail, .kc-bh-figw, [role="dialog"], [aria-modal="true"]')) return
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
      const top = rail.getBoundingClientRect().top - host.getBoundingClientRect().top + i * 62
      wrap.classList.add('kc-bh-float'); wrap.style.top = `${Math.max(0, top)}px`
    }
    return () => { head.remove(); foot.remove(); wrap.classList.remove('kc-bh-float'); wrap.style.top = '' }
  }, [openKey])
  const cur = SECS.find(x => x.key === openKey)
  const portals = cur && slots ? (
    <>
      {createPortal(
        <div className="kc-bh-hd" style={{ '--c': cur.colour, cursor: 'pointer' }} role="button" aria-label={`Close ${cur.label}`}
          onPointerDown={press} onClick={() => { const q = tileEl(cur)?.parentElement?.querySelector('.neon-q.is-active'); if (q) q.click(); else open(cur) }} title="Tap to go back">
          <div className="kc-bh-hrow"><img src={cur.icon} alt="" /><b>{cur.label}</b><span>{slots.pts}</span></div>
          <div className="kc-bh-hrow2">
            {slots.viewEl && <button type="button" className="kc-bh-chip" onPointerDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); slots.viewEl.click() }}>📈 VIEW</button>}
            <span>THIS WEEK · {(prog.__days?.[cur.key] || []).filter(Boolean).length} done</span>
          </div>
          <div className="kc-bh-week">{(prog.__days?.[cur.key] || []).map((d, i) => <i key={i} className={d ? 'd' : ''} />)}</div>
          {slots.quote && <div className="kc-bh-quote">{slots.quote}</div>}
        </div>, slots.head)}
    </>
  ) : null
  const fig = gender === 'F' ? '/figures/boxer-female.png' : '/figures/boxer-male.png'
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
