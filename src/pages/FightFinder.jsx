import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../hooks/useAuth.jsx'
import { listPdf, printList } from '../lib/fightFinderPdf.js'
import { pdfLines, scheduleFromPdf, scheduleFromHtml, drawsFromPdf, drawFromHtml, boutsFromDailySchedulePdf, buildFights, matchesSearch, styleOf, kindOf, STYLES, athleteKey, fromMin, normTitle, nameKey } from '../lib/fightFinder.js'

// 🥊 Fight finder -- from the Calendar (ad-hoc) or an event. Load the competition's schedule + draws
// (sportdata PDFs or saved pages), search a club / country, then see our athletes' bouts in tatami
// and time order, assign coaches, spot clashes, record results, print or share per coach.
const STAFF = ['admin', 'captain', 'coach', 'leader', 'head_coach']

export default function FightFinder() {
  const { isAdmin, profile } = useAuth()
  const loc = useLocation(), nav = useNavigate()
  const params = new URLSearchParams(loc.search)
  const [list, setList] = useState(null)
  const [ff, setFf] = useState(null)               // the open fight finder
  const [staff, setStaff] = useState([])
  const [busy, setBusy] = useState('')
  const [view, setView] = useState('ring')         // ring | time | coach:<id>
  const [msg, setMsg] = useState('')
  const [guests, setGuests] = useState([])            // coaches typed in (not app staff), from every finder
  const [menu, setMenu] = useState(null)              // saved finder held down -> its options
  const hold = useRef({ t: null, fired: false })
  const holdStart = x => { if (!isAdmin) return; hold.current.fired = false; clearTimeout(hold.current.t)
    hold.current.t = setTimeout(() => { hold.current.fired = true; navigator.vibrate?.(30); window.getSelection?.()?.removeAllRanges(); setMenu(x) }, 550) }
  const holdEnd = () => clearTimeout(hold.current.t)

  // long-press anywhere in the fight finder (incl. the hold menu): no browser page menu (Samsung Internet / Chrome)
  useEffect(() => {
    const block = e => { if (e.target?.closest?.('.ffd, .ffd-sheet-bg') && !e.target.closest('input, textarea, select')) e.preventDefault() }
    document.addEventListener('contextmenu', block, { capture: true })
    return () => document.removeEventListener('contextmenu', block, { capture: true })
  }, [])
  useEffect(() => {
    supabase.from('fight_finders').select('id, title, fixture_id, updated_at').order('updated_at', { ascending: false }).limit(30)
      .then(({ data, error }) => setList(error ? (setMsg(/fight_finders/.test(error.message) ? 'Run supabase_fight_finder.sql to switch this on.' : error.message), []) : data || []))
    supabase.from('members').select('id, first_name, last_name, role').in('role', STAFF).order('first_name').then(({ data }) => setStaff(data || []))
    supabase.from('fight_finders').select('settings').limit(300).then(({ data }) => setGuests(mergeGuests([], (data || []).flatMap(x => x.settings?.guests || []))))
  }, [])
  useEffect(() => {
    const id = params.get('id'), ev = params.get('event')
    if (id) openFinder(id)
    else if (ev) supabase.from('fight_finders').select('*').eq('fixture_id', ev).maybeSingle().then(async ({ data }) => {
      if (data) setFf(data)
      else if (isAdmin) { const { data: fx } = await supabase.from('fixtures').select('title, date').eq('id', ev).maybeSingle(); createFinder(fx?.title || 'Event', ev) }
    })
  }, [loc.search])

  async function openFinder(id) { const { data } = await supabase.from('fight_finders').select('*').eq('id', id).maybeSingle(); if (data) setFf(data) }
  async function createFinder(title, fixtureId = null) {
    const { data, error } = await supabase.from('fight_finders').insert({ title, fixture_id: fixtureId, created_by: profile?.id || null,
      settings: { query: 'Kode Red', window: 10, coaches: [], assign: {}, results: {} } }).select().single()
    if (error) return alert('Could not create: ' + error.message)
    setFf(data); nav(`/fight-finder?id=${data.id}`, { replace: true })
  }
  async function save(patch) {
    const next = { ...ff, ...patch, settings: { ...ff.settings, ...(patch.settings || {}) }, data: patch.data || ff.data }
    setFf(next)
    if (!isAdmin) return
    const { error } = await supabase.from('fight_finders').update({ title: next.title, data: next.data, settings: next.settings, updated_at: new Date().toISOString() }).eq('id', ff.id)
    if (error) setMsg('Could not save: ' + error.message)
  }
  const setS = patch => save({ settings: patch })
  async function removeFinder(x) {
    if (!confirm(`Delete "${x.title}"? Its loaded files, coach assignments and results go too.`)) return
    const { error } = await supabase.from('fight_finders').delete().eq('id', x.id)
    if (error) return alert('Could not delete: ' + error.message)
    setList(l => l.filter(y => y.id !== x.id)); setMenu(null)
  }
  async function renameFinder(x) {
    const title = prompt('Name', x.title)?.trim()
    if (!title || title === x.title) return setMenu(null)
    const { error } = await supabase.from('fight_finders').update({ title }).eq('id', x.id)
    if (error) return alert('Could not rename: ' + error.message)
    setList(l => l.map(y => (y.id === x.id ? { ...y, title } : y))); setMenu(null)
  }

  // ── load files: schedule / draws (PDF or saved web page) ──
  async function loadFiles(files) {
    setBusy('Reading…'); setMsg('')
    let schedule = [...(ff.data?.schedule || [])], draws = [...(ff.data?.draws || [])], bouts = [...(ff.data?.bouts || [])]
    const notes = []
    for (const f of files) {
      try {
        if (/\.pdf$/i.test(f.name)) {
          const pages = await pdfLines(f)
          const sch = scheduleFromPdf(pages), drw = drawsFromPdf(pages), bts = boutsFromDailySchedulePdf(pages)
          if (sch.length) { schedule = mergeBy(schedule, sch, s => `${s.date}|${normTitle(s.title)}`); notes.push(`${f.name}: ${sch.length} schedule rows`) }
          if (drw.length) { draws = mergeBy(draws, drw, d => normTitle(d.title)); notes.push(`${f.name}: ${drw.length} brackets`) }
          if (bts.length) { bouts = mergeBy(bouts, bts, b => b.id); notes.push(`${f.name}: ${bts.length} bouts`) }
          if (!sch.length && !drw.length && !bts.length) {
            const words = pages.flat().map(l => l.text).join(' ').trim().length
            notes.push(words < 20 ? `${f.name}: no text in this PDF (a photo or scan?) -- use the PDF downloaded from the competition site`
              : `${f.name}: layout not recognised -- send it to Claude to add`)
          }
        } else {
          const text = await f.text()
          const sch = scheduleFromHtml(text)
          if (sch.length) { schedule = mergeBy(schedule, sch, s => `${s.date}|${normTitle(s.title)}`); notes.push(`${f.name}: ${sch.length} schedule rows`) }
          const d = drawFromHtml(text)
          if (d?.title) { draws = mergeBy(draws, [d], x => normTitle(x.title)); notes.push(`${f.name}: bracket ${d.title}`) }
          if (!sch.length && !d?.title) notes.push(`${f.name}: nothing recognised`)
        }
      } catch (e) { notes.push(`${f.name}: couldn't read (${e.message})`) }
    }
    await save({ data: { schedule, draws, bouts } })
    setBusy(''); setMsg(notes.join(' · ') + (notes.some(n => /bouts|rows|brackets/.test(n)) ? ' -- press 🔍 Find fights' : ''))
  }

  if (!ff) return (
    <div className="ffd">
      <div className="ffd-head"><h1>🥊 Fight finder</h1></div>
      {msg && <div className="card" style={{ color: '#E24B4A' }}>{msg}</div>}
      {isAdmin && <button className="btn btn-primary" onClick={() => createFinder(`Competition ${new Date().toLocaleDateString('en-GB')}`)}>+ New fight finder</button>}
      <div className="card" style={{ marginTop: 12 }}>
        <b>Saved</b>
        {list === null ? <p>Loading…</p> : !list.length ? <p className="ffd-muted">None yet.</p> : list.map(x => (
          <button key={x.id} className="ffd-saved" onClick={() => { if (!hold.current.fired) nav(`/fight-finder?id=${x.id}`) }}
            onPointerDown={() => holdStart(x)} onPointerUp={holdEnd} onPointerLeave={holdEnd} onPointerCancel={holdEnd}
            onContextMenu={e => { e.preventDefault(); window.getSelection?.()?.removeAllRanges(); if (isAdmin) { hold.current.fired = true; setMenu(x) } }}>
            {x.title}<span>{new Date(x.updated_at).toLocaleDateString('en-GB')}</span></button>
        ))}
        {isAdmin && list?.length > 0 && <p className="ffd-muted" style={{ marginTop: 6 }}>Hold one to rename or delete it.</p>}
      </div>
      {menu && (
        <div className="ffd-sheet-bg" onClick={() => setMenu(null)}>
          <div className="ffd-sheet" onClick={e => e.stopPropagation()}>
            <b>{menu.title}</b>
            <button className="btn" onClick={() => { window.getSelection?.()?.removeAllRanges(); setMenu(null); nav(`/fight-finder?id=${menu.id}`) }}>Open</button>
            <button className="btn" onClick={() => renameFinder(menu)}>✏️ Rename</button>
            <button className="btn ffd-del" onClick={() => removeFinder(menu)}>🗑 Delete</button>
            <button className="btn" onClick={() => setMenu(null)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  )

  const allStaff = [...staff, ...mergeGuests(guests, ff.settings?.guests || [])].sort((a, b) => `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`))
  return <FinderView ff={ff} staff={allStaff} setGuests={setGuests} isAdmin={isAdmin} busy={busy} msg={msg} view={view} setView={setView}
    onFiles={loadFiles} setS={setS} save={save} clearMsg={() => setMsg('')} onBack={() => { setFf(null); setMsg(''); nav('/fight-finder', { replace: true }) }} />
}

function mergeBy(oldList, newList, key) {
  const m = new Map(oldList.map(x => [key(x), x]))
  newList.forEach(x => m.set(key(x), x))
  return [...m.values()]
}

// a typed-in coach: id from the name, so the same person matches across finders
export const guestId = name => 'g:' + String(name).trim().toLowerCase().replace(/\s+/g, ' ')
function mergeGuests(a, b) {
  const m = new Map(a.map(g => [g.id, g]))
  b.forEach(g => { if (g?.id && !m.has(g.id)) { const [first, ...rest] = String(g.name || '').trim().split(/\s+/); m.set(g.id, { id: g.id, name: g.name, first_name: first || g.name, last_name: rest.join(' '), guest: true }) } })
  return [...m.values()]
}

function FinderView({ ff, staff, setGuests, isAdmin, busy, msg, view, setView, onFiles, setS, save, onBack, clearMsg }) {
  const s = ff.settings || {}
  // coaches on an athlete: up to 3 (older finders stored one id as a string)
  const coachIds = k => { const v = s.assign?.[k]; return Array.isArray(v) ? v.filter(Boolean) : v ? [v] : [] }
  const withoutCoach = id => Object.fromEntries(Object.keys(s.assign || {}).map(k => [k, coachIds(k).filter(x => x !== id)]).filter(([, v]) => v.length))
  const [newCoach, setNewCoach] = useState('')
  function addGuest() {
    const name = newCoach.trim().replace(/\s+/g, ' ')
    if (!name) return
    const id = guestId(name), known = staff.find(m => m.id === id || `${m.first_name} ${m.last_name || ''}`.trim().toLowerCase() === name.toLowerCase())
    const cid = known ? known.id : id
    const patch = { coaches: [...new Set([...(s.coaches || []), cid])] }
    if (!known) { patch.guests = [...(s.guests || []), { id, name }]; setGuests(g => mergeGuests(g, [{ id, name }])) }
    setS(patch); setNewCoach('')
  }
  // coach search: staff + typed-in coaches not already at this event, matching every word typed
  const typed = newCoach.trim().toLowerCase()
  const matches = !typed ? [] : staff.filter(m => !(s.coaches || []).includes(m.id))
    .filter(m => typed.split(/\s+/).every(w => `${m.first_name} ${m.last_name || ''}`.toLowerCase().includes(w))).slice(0, 8)
  const exact = staff.some(m => `${m.first_name} ${m.last_name || ''}`.trim().toLowerCase() === typed.replace(/\s+/g, ' '))
  function pickCoach(m) { setS({ coaches: [...new Set([...(s.coaches || []), m.id])] }); setNewCoach('') }
  function dropCoach(m) {
    const n = Object.keys(s.assign || {}).filter(k => coachIds(k).includes(m.id)).length
    if (n && !confirm(`Remove ${m.first_name} from this event? Their ${n} assigned athlete${n === 1 ? '' : 's'} will be unassigned.`)) return
    setS({ coaches: (s.coaches || []).filter(x => x !== m.id), assign: withoutCoach(m.id) })
  }
  function removeGuest(m) {
    if (!confirm(`Remove ${m.name || m.first_name} from the coach list?`)) return
    const assign = withoutCoach(m.id)
    setS({ guests: (s.guests || []).filter(g => g.id !== m.id), coaches: (s.coaches || []).filter(x => x !== m.id), assign })
    setGuests(g => g.filter(x => x.id !== m.id))
  }
  const query = s.query ?? 'Kode Red', windowMin = Number(s.window ?? 10)
  const [draft, setDraft] = useState(query)
  const loadedAt = JSON.stringify([(ff.data?.schedule || []).length, (ff.data?.draws || []).length, (ff.data?.bouts || []).length])
  const [run, setRun] = useState(s.searched ? { query, loadedAt } : null)   // the search shown; null = not run yet
  const stale = run && (run.query !== draft || run.loadedAt !== loadedAt)
  const find = () => { setRun({ query: draft, loadedAt }); setS({ query: draft, searched: true }); clearMsg?.() }
  const coaches = staff.filter(m => (s.coaches || []).includes(m.id))
  const coachName = id => { const m = staff.find(x => x.id === id); return m ? `${m.first_name} ${m.last_name || ''}`.trim() : '' }
  const fights = useMemo(() => buildFights({ schedule: ff.data?.schedule || [], draws: ff.data?.draws || [], bouts: ff.data?.bouts || [], results: s.results || {} }), [ff.data, s.results])
  const byId = useMemo(() => Object.fromEntries(fights.map(f => [f.id, f])), [fights])
  const ours = sl => !!run && !!sl?.athlete && matchesSearch(sl.athlete, run.query)
  const noClubs = fights.length > 0 && !fights.some(f => f.red?.athlete?.club || f.blue?.athlete?.club)
  const sideTxt = sl => sl?.athlete ? `${sl.athlete.name} (${[sl.athlete.club, sl.athlete.country].filter(Boolean).join(', ')})` : sl?.winnerOf ? `⏳ winner of bout ${byId[sl.winnerOf]?.boutNo ?? '?'} (${['red', 'blue'].map(c => byId[sl.winnerOf]?.[c]).map(x => x?.athlete?.name?.split(' ')[0] || (x?.winnerOf ? 'TBC' : '—')).join(' v ')})` : '— empty —'

  // rows: one per (our athlete, bout) -- confirmed bouts, plus "if they win" bouts further on
  const rows = useMemo(() => {
    const out = []
    for (const f of fights) {
      for (const colour of ['red', 'blue']) {
        const me = f[colour], opp = f[colour === 'red' ? 'blue' : 'red']
        if (ours(me)) out.push({ f, a: me.athlete, opp, possible: false, colour })
      }
    }
    // possible next bouts: follow winnerOf chains from each of our bouts
    for (const r of [...out]) {
      let cur = r.f, depth = 0
      while (depth++ < 6) {
        if (s.results?.[cur.id] && s.results[cur.id] !== r.colour && cur === r.f) break   // lost
        const next = fights.find(n => ['red', 'blue'].some(c => n[c]?.winnerOf === cur.id))
        if (!next) break
        const mySide = next.red?.winnerOf === cur.id ? 'red' : 'blue'
        if (!out.some(o => o.f.id === next.id && athleteKey(o.a) === athleteKey(r.a))) out.push({ f: next, a: r.a, opp: next[mySide === 'red' ? 'blue' : 'red'], possible: true, colour: mySide, via: cur.id })
        cur = next
      }
    }
    return out
  }, [fights, run, s.results])

  // clashes: same coach (different athletes) or same athlete (different categories) within the window
  const clashes = useMemo(() => {
    const list = []
    const timed = rows.filter(r => r.f.startMin != null)
    for (let i = 0; i < timed.length; i++) for (let j = i + 1; j < timed.length; j++) {
      const A = timed[i], B = timed[j]
      if (A.f.date && B.f.date && A.f.date !== B.f.date) continue
      if (Math.abs(A.f.startMin - B.f.startMin) > windowMin || A.f.id === B.f.id) continue
      const ka = athleteKey(A.a), kb = athleteKey(B.a)
      const ca = coachIds(ka), cb = coachIds(kb), both = [...new Set([...ca, ...cb])]
      if (ka === kb && normTitle(A.f.title) !== normTitle(B.f.title)) list.push({ type: 'athlete', A, B, possible: A.possible || B.possible })
      else if (kindOf(A.f) !== kindOf(B.f)) continue   // ring only with ring, tatami with tatami, forms with forms (own-bout clashes above still count)
      else if (ka !== kb && ca.length && cb.length && both.length === 1) list.push({ type: 'coach', coach: both[0], A, B, possible: A.possible || B.possible })   // nobody else to cover one of them
      else if (ka !== kb && String(A.f.area ?? '') !== String(B.f.area ?? '')) list.push({ type: 'time', A, B, possible: A.possible || B.possible })   // on at the same time on different areas
    }
    return list
  }, [rows, windowMin, s.assign])
  // a coach is busy for a bout when they're on another athlete fighting within the clash window
  const busyAt = (r, cid) => {
    if (r.f.startMin == null) return null
    const k = athleteKey(r.a)
    const o = rows.find(x => x.f.startMin != null && x.f.id !== r.f.id && athleteKey(x.a) !== k && coachIds(athleteKey(x.a)).includes(cid)
      && kindOf(x.f) === kindOf(r.f) && !(x.f.date && r.f.date && x.f.date !== r.f.date) && Math.abs(x.f.startMin - r.f.startMin) <= windowMin)
    return o ? `${areaTxt(o.f.area)} ~${fromMin(o.f.startMin)}` : null
  }
  const realClashes = clashes.filter(c => c.type !== 'time'), sameTime = clashes.filter(c => c.type === 'time')
  const overlapKeys = new Set(sameTime.flatMap(c => [`${c.A.f.id}|${athleteKey(c.A.a)}`, `${c.B.f.id}|${athleteKey(c.B.a)}`]))
  // tap a clash -> scroll to that bout's row and flash it
  const rowId = r => 'ffr-' + `${r.f.id}|${athleteKey(r.a)}`.replace(/[^A-Za-z0-9_-]/g, '_')
  const goTo = r => {
    const el = document.getElementById(rowId(r))
    if (!el) return alert(`${r.a.name}'s bout isn't showing here — check 👁 Show or the coach tab.`)
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    el.classList.remove('ffd-flash'); void el.offsetWidth; el.classList.add('ffd-flash')
  }
  const clashKeys = new Set(realClashes.flatMap(c => [`${c.A.f.id}|${athleteKey(c.A.a)}`, `${c.B.f.id}|${athleteKey(c.B.a)}`]))
  // for each row: the other bouts it clashes with
  const clashWith = useMemo(() => {
    const m = {}
    const add = (me, other, c) => { (m[`${me.f.id}|${athleteKey(me.a)}`] ||= []).push({ other, type: c.type, coach: c.coach }) }
    clashes.forEach(c => { add(c.A, c.B, c); add(c.B, c.A, c) })
    return m
  }, [clashes])

  const areaKey = a => a == null ? '~' : typeof a === 'number' ? `T${String(a).padStart(3, '0')}` : String(a).replace(/(\d+)/, d => d.padStart(3, '0'))
  const areaTxt = a => a == null ? '?' : typeof a === 'number' ? `T${a}` : a
  const isCoachView = view.startsWith('coach:'), viewCoach = isCoachView ? view.slice(6) : null
  const show = { ring: true, tatami: true, forms: true, ...(s.show || {}) }
  const [showOpen, setShowOpen] = useState(false)
  // keep the Show menu on screen: open it to the right of the pill, or to the left if there isn't room
  const showRef = useRef(null)
  const [showPos, setShowPos] = useState({ left: 0 })
  const toggleShow = () => {
    if (!showOpen && showRef.current) {
      const b = showRef.current.getBoundingClientRect(), vw = document.documentElement.clientWidth, w = Math.min(260, vw - 24)
      const left = Math.max(12, Math.min(b.left, vw - 12 - w)) - b.left   // relative to the pill
      setShowPos({ left, width: w })
    }
    setShowOpen(o => !o)
  }
  const [vid, setVid] = useState(null)   // tapped athlete -> video search links
  const hidden = ['ring', 'tatami', 'forms'].filter(k => !show[k]).length
  const stylesHere = [...new Map(rows.map(r => { const st = styleOf(r.f.title); return [st.name, st] })).values()]
  const shown = rows.filter(r => show[kindOf(r.f)]).filter(r => !viewCoach || coachIds(athleteKey(r.a)).includes(viewCoach))
    .sort((a, b) => { const ar = areaKey(a.f.area).localeCompare(areaKey(b.f.area)), tm = (a.f.startMin ?? 9e9) - (b.f.startMin ?? 9e9); return view === 'ring' ? ar || tm : tm || ar })
  // athletes per ring / tatami / forms (in this tab), and in what's showing
  const inTab = rows.filter(r => !viewCoach || coachIds(athleteKey(r.a)).includes(viewCoach))
  const countAthletes = list => new Set(list.map(r => athleteKey(r.a))).size
  const kindCount = k => countAthletes(inTab.filter(r => kindOf(r.f) === k))
  const shownAthletes = countAthletes(shown), shownBouts = shown.filter(r => !r.possible).length
  const athletes = [...new Map(rows.map(r => [athleteKey(r.a), r.a])).values()]

  const setResult = (f, colour) => setS({ results: { ...(s.results || {}), [f.id]: s.results?.[f.id] === colour ? undefined : colour } })
  const shareText = cid => {
    const mine = rows.filter(r => coachIds(athleteKey(r.a)).includes(cid) && !r.possible).sort((a, b) => (a.f.startMin ?? 9e9) - (b.f.startMin ?? 9e9))
    return `🥊 ${ff.title} — ${coachName(cid)}'s fights\n` + mine.map(r => `${r.f.area != null ? areaTxt(r.f.area) : ''} ~${r.f.startMin != null ? fromMin(r.f.startMin) : '?'} · ${r.a.name} · ${r.f.title} · v ${sideTxt(r.opp)}`).join('\n')
  }

  // cells shared by the table and the grid's pop-up
  const coachCell = (r, k) => (isAdmin ? (() => {
                        const ids = coachIds(k)
                        const setSlot = (i, id) => { const next = [...ids]; if (id) next[i] = id; else next.splice(i, 1); setS({ assign: { ...(s.assign || {}), [k]: next.filter(Boolean) } }) }
                        return (
                          <div className="ffd-coachslots">
                            {[0, 1, 2].filter(i => i <= ids.length).map(i => (
                              <select key={i} className={`ffd-coach ${ids[i] && busyAt(r, ids[i]) ? 'busy' : ''}`} value={ids[i] || ''} onChange={e => setSlot(i, e.target.value)}>
                                <option value="">{i === 0 ? '—' : '+ coach'}</option>
                                {coaches.filter(c => c.id === ids[i] || !ids.includes(c.id)).map(c => { const b = busyAt(r, c.id)
                                  return <option key={c.id} value={c.id} style={b ? { color: '#E24B4A' } : undefined}>{b ? '🔴 ' : ''}{c.first_name} {c.last_name || ''}{b ? ` (busy ${b})` : ''}</option> })}
                                {!coaches.length && <option value="" disabled>Add coaches to the event first</option>}
                              </select>
                            ))}
                          </div>
                        )
                      })() : coachIds(k).map(coachName).filter(Boolean).join(', ') || '—')
  const clashCell = (r, k, onJump) => (clashWith[`${r.f.id}|${k}`] || []).map((c, j) => (
    <button key={j} type="button" className={`ffd-jump ${c.type === 'time' ? 'ffd-sametime-txt' : ''}`} onClick={() => onJump(c.other)}>{c.type === 'time' ? `⏱ Same time: ${c.other.a.name}` : `⚠ ${c.type === 'athlete' ? 'Own bout' : `${(coachName(c.coach) || 'Coach').split(' ')[0]}: ${c.other.a.name}`}`}
      <span className="ffd-muted"> · {areaTxt(c.other.f.area)} ~{c.other.f.startMin != null ? fromMin(c.other.f.startMin) : '?'} · {c.other.f.label || c.other.f.title} ↓</span></button>
  ))
  const resultCell = r => { const res = s.results?.[r.f.id]
    return !r.possible && r.opp?.athlete && isAdmin ? (
      <span className="ffd-res">
        <button className={res === r.colour ? 'won' : ''} onClick={() => setResult(r.f, r.colour)}>Won</button>
        <button className={res && res !== r.colour ? 'lost' : ''} onClick={() => setResult(r.f, r.colour === 'red' ? 'blue' : 'red')}>Lost</button>
      </span>
    ) : res ? (res === r.colour ? '✓ Won' : '✗ Lost') : '' }
  // 📤 Share: the list on screen (search, Show ticks, coach tab, view order) as a PDF or a print page
  const [shareOpen, setShareOpen] = useState(false), [sharing, setSharing] = useState('')
  const shareData = () => {
    const tab = viewCoach ? ` · ${coachName(viewCoach)}'s bouts` : ''
    const n = new Set(shown.map(r => athleteKey(r.a))).size
    return {
      title: ff.title || 'Fight finder',
      subtitle: `${run?.query ? `Search: ${run.query}` : 'All'}${tab} · ${n} athlete${n === 1 ? '' : 's'} · ${shown.filter(r => !r.possible).length} bouts · ${view === 'time' ? 'time order' : view === 'grid' ? 'grid (time order)' : 'tatami order'}`,
      rows: shown.map(r => { const k = athleteKey(r.a), key = `${r.f.id}|${k}`
        return { time: r.f.startMin != null ? `~${fromMin(r.f.startMin)}` : '?', area: areaTxt(r.f.area), name: r.a.name, country: r.a.country || '',
          style: styleOf(r.f.title), weight: weightOf(r.f.title), opp: r.f.solo ? 'solo (forms)' : sideTxt(r.opp),
          bout: r.f.label || `R${r.f.round} · bout ${r.f.boutNo}`, coach: coachIds(k).map(coachName).filter(Boolean).join(', '),
          flag: clashKeys.has(key) ? 'clash' : overlapKeys.has(key) ? 'time' : null, possible: !!r.possible } }),
    }
  }
  const fileName = () => `${String(ff.title || 'fight-finder').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-')}${viewCoach ? '-' + (coachName(viewCoach) || 'coach').split(' ')[0] : ''}.pdf`
  async function doShare(how) {
    const d = shareData()
    if (how === 'print') { printList(d); return setShareOpen(false) }
    setSharing(how === 'share' ? 'Making the PDF…' : 'Saving…')
    try {
      const file = new File([await listPdf(d)], fileName(), { type: 'application/pdf' })
      if (how === 'share' && navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: d.title, text: d.subtitle })
      else { const url = URL.createObjectURL(file), a = document.createElement('a'); a.href = url; a.download = file.name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 5000)
        if (how === 'share') alert('Sharing files isn\'t supported here, so the PDF has been downloaded instead.') }
      setShareOpen(false)
    } catch (e) { if (e?.name !== 'AbortError') alert('Could not make the PDF: ' + (e?.message || e)) }
    setSharing('')
  }
  // grid view: one column per area, one row per exact estimated time
  const [cell, setCell] = useState(null)
  const weightOf = t => (String(t || '').match(/([+-]\s?\d+(?:[.,]\d+)?)\s*KG/i) || [])[1]?.replace(/\s/g, '').replace(',', '.') || ''
  const gridAreas = [...new Set(shown.map(r => r.f.area ?? null))].sort((a, b) => areaKey(a).localeCompare(areaKey(b)))
  const gridTimes = [...new Set(shown.map(r => r.f.startMin != null ? Math.round(r.f.startMin) : null))].sort((a, b) => (a ?? 9e9) - (b ?? 9e9))
  return (
    <div className="ffd">
      <div className="ffd-head">
        <button className="btn btn-sm" onClick={onBack}>← All</button>
        {isAdmin ? <input className="ffd-title" value={ff.title} onChange={e => save({ title: e.target.value })} /> : <h1>{ff.title}</h1>}
      </div>

      {isAdmin && (
        <div className="card ffd-load">
          <b>1 · Load the competition</b>
          <input type="file" multiple accept=".pdf,.html,.htm" onChange={e => e.target.files?.length && onFiles([...e.target.files])} />
          <div className="ffd-muted">{busy || [`${(ff.data?.schedule || []).length} schedule rows`, `${(ff.data?.draws || []).length} brackets`, (ff.data?.bouts || []).length ? `${ff.data.bouts.length} bouts` : null].filter(Boolean).join(' · ') + ' loaded'}</div>
          {msg && <div className="ffd-muted">{msg}</div>}
        </div>
      )}

      <div className="card ffd-opts">
        <div className="ffd-search">
          <label>Club / country / name <input value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={e => e.key === 'Enter' && find()} placeholder="Kode Red, GBR, Tylee" /></label>
          <button className="btn btn-primary ffd-find" onClick={find} disabled={!fights.length}>🔍 Find fights</button>
        </div>
        {stale && <div className="ffd-muted">Changed — press 🔍 Find fights to update.</div>}
        <label>Clash window ±<input type="number" min="0" max="60" value={windowMin} onChange={e => setS({ window: Number(e.target.value) || 0 })} style={{ width: 60 }} /> min</label>
        {isAdmin && (
          <details>
            <summary>Coaches at this event ({coaches.length})</summary>
            <div className="ffd-coaches">{coaches.map(m => (
              <div key={m.id} className="ffd-coachrow"><span>{m.first_name} {m.last_name}</span>
                <button type="button" className="ffd-x" title="Remove from this event" onClick={() => dropCoach(m)}>✕</button></div>
            ))}</div>
            {!coaches.length && <div className="ffd-muted">No coaches yet — type a name to add one.</div>}
            <div className="ffd-addcoach">
              <input value={newCoach} onChange={e => setNewCoach(e.target.value)} placeholder="Type a coach's name…"
                onKeyDown={e => { if (e.key === 'Enter') { if (matches.length === 1) pickCoach(matches[0]); else addGuest() } }} />
            </div>
            {newCoach.trim() && (
              <div className="ffd-suggest">
                {matches.map(m => (
                  <div key={m.id} className="ffd-suggestrow">
                    <button type="button" onClick={() => pickCoach(m)}>+ {m.first_name} {m.last_name}{m.guest ? <span className="ffd-muted"> (added before)</span> : null}</button>
                    {m.guest && <button type="button" className="ffd-x" title="Forget this name" onClick={() => removeGuest(m)}>🗑</button>}
                  </div>
                ))}
                {!exact && <div className="ffd-suggestrow"><button type="button" onClick={addGuest}>+ Add “{newCoach.trim()}” as a new coach</button></div>}
              </div>
            )}
          </details>
        )}
      </div>

      {realClashes.length > 0 && (
        <div className="card ffd-clash">
          <b>⚠ {realClashes.length} possible clash{realClashes.length === 1 ? '' : 'es'}</b> — {realClashes.filter(c => c.type === 'coach').length} coach, {realClashes.filter(c => c.type === 'athlete').length} athlete
          {realClashes.map((c, i) => (
            <div key={i} className="ffd-clash-row">
              {c.type === 'coach' ? `👤 ${coachName(c.coach)}: ` : `🥊 ${c.A.a.name}: `}
              {[c.A, c.B].map((r, n) => <span key={n}>{n ? ' & ' : ''}<button type="button" className="ffd-jump inline" onClick={() => goTo(r)}>{r.a.name.split(' ')[0]} {areaTxt(r.f.area)} ~{r.f.startMin != null ? fromMin(r.f.startMin) : '?'}</button></span>)}
              {c.possible && <em> (if they win)</em>}
            </div>
          ))}
        </div>
      )}
      {sameTime.length > 0 && (
        <details className="card ffd-sametime">
          <summary><b>⏱ {sameTime.length} pair{sameTime.length === 1 ? '' : 's'} of bouts on at the same time</b> <span className="ffd-muted">— different areas, need separate coaches</span></summary>
          {sameTime.map((c, i) => (
            <div key={i} className="ffd-clash-row">
              {[c.A, c.B].map((r, n) => <span key={n}>{n ? '  &  ' : ''}<button type="button" className="ffd-jump inline" onClick={() => goTo(r)}>{r.a.name} {areaTxt(r.f.area)} ~{r.f.startMin != null ? fromMin(r.f.startMin) : '?'}</button></span>)}
              {c.possible && <em> (if they win)</em>}
            </div>
          ))}
        </details>
      )}

      <div className="ffd-tabs">
        <button className={view === 'ring' ? 'on' : ''} onClick={() => setView('ring')}>Tatami order</button>
        <button className={view === 'time' ? 'on' : ''} onClick={() => setView('time')}>Time order</button>
        <button className={view === 'grid' ? 'on' : ''} onClick={() => setView('grid')}>Grid</button>
        {coaches.map(c => <button key={c.id} className={view === `coach:${c.id}` ? 'on' : ''} onClick={() => setView(`coach:${c.id}`)}>👤 {c.first_name}</button>)}
        <span className="ffd-show" ref={showRef}>
          <button className={`ffd-showbtn ${hidden ? 'on' : ''}`} onClick={toggleShow}><span>👁 Show{hidden ? ` (${3 - hidden}/3)` : ''} ▾</span>{rows.length > 0 && <small>{shownAthletes} athlete{shownAthletes === 1 ? '' : 's'}</small>}</button>
          {showOpen && (
            <div className="ffd-show-menu" style={{ left: showPos.left, right: 'auto', width: showPos.width }}>
              {[['ring', '🥊 Rings'], ['tatami', '🟦 Tatamis'], ['forms', '🎵 Forms']].map(([k, label]) => (
                <label key={k}><input type="checkbox" checked={show[k]} onChange={e => setS({ show: { ...show, [k]: e.target.checked } })} /> {label} <span className="ffd-muted">({kindCount(k)})</span></label>
              ))}
              {stylesHere.length > 0 && <div className="ffd-legend">{stylesHere.map(st => <span key={st.name}><i style={{ background: st.color }} />{st.name}</span>)}</div>}
            </div>
          )}
        </span>
        <button onClick={() => setShareOpen(true)} disabled={!shown.length}>📤 Share</button>
        {viewCoach && <a className="ffd-wa" href={`https://wa.me/?text=${encodeURIComponent(shareText(viewCoach))}`} target="_blank" rel="noreferrer">💬 Share</a>}
      </div>

      {rows.length > 0 && <div className="ffd-muted ffd-count">Showing <b>{shownAthletes}</b> athlete{shownAthletes === 1 ? '' : 's'} · {shownBouts} bout{shownBouts === 1 ? '' : 's'}{hidden ? ` (of ${countAthletes(inTab)} athletes)` : ''}</div>}
      {rows.length > 0 && !shown.length ? (
        <div className="card ffd-muted">Nothing to show — tick more in 👁 Show.</div>
      ) : !rows.length ? (
        <div className="card ffd-muted">{!fights.length ? 'Load the schedule and draws to find the fights.' : !run ? `${fights.length} bouts loaded — press 🔍 Find fights.` : `No bouts found for "${run.query}".`}</div>
      ) : (
        view === 'grid' ? (
          <div className="ffd-gridwrap">
            <div className="ffd-grid" style={{ gridTemplateColumns: `46px repeat(${gridAreas.length}, minmax(70px, 1fr))` }}>
              <div className="ffd-gh ffd-gt" />
              {gridAreas.map(a => <div key={String(a)} className="ffd-gh">{areaTxt(a)}</div>)}
              {gridTimes.map(t => [
                <div key={`t${t}`} className="ffd-gt">{t != null ? fromMin(t) : '?'}</div>,
                ...gridAreas.map(a => (
                  <div key={`${t}|${a}`} className="ffd-gc">
                    {shown.filter(r => (r.f.area ?? null) === a && (r.f.startMin != null ? Math.round(r.f.startMin) : null) === t).map((r, n) => {
                      const k = athleteKey(r.a), clash = clashKeys.has(`${r.f.id}|${k}`), overlap = !clash && overlapKeys.has(`${r.f.id}|${k}`), st = styleOf(r.f.title)
                      return (
                        <button key={n} type="button" className={`ffd-gb ${clash ? 'clash' : ''} ${overlap ? 'overlap' : ''} ${r.possible ? 'possible' : ''}`} style={{ '--sty': st.color }} onClick={() => setCell(r)}>
                          <b>{String(r.a.name).split(/\s+/)[0]}</b><i>{st.code} {weightOf(r.f.title)}</i>
                        </button>
                      )
                    })}
                  </div>
                )),
              ])}
            </div>
          </div>
        ) : (
        <div className="ffd-table-wrap">
          <table className="ffd-table">
            <thead><tr><th>Tatami</th><th>~Time</th><th>Category · bout</th><th>Our athlete</th><th>Opponent</th><th>Coach</th><th>Clashes with</th><th>Result</th></tr></thead>
            <tbody>
              {shown.map((r, i) => {
                const k = athleteKey(r.a)
                const clash = clashKeys.has(`${r.f.id}|${k}`), overlap = !clash && overlapKeys.has(`${r.f.id}|${k}`)
                return (
                  <tr key={i} id={rowId(r)} className={`${r.possible ? 'possible' : ''} ${clash ? 'clash' : ''} ${overlap ? 'overlap' : ''}`} style={{ '--sty': styleOf(r.f.title).color }}>
                    <td><b>{areaTxt(r.f.area)}</b></td>
                    <td>{r.f.startMin != null ? `~${fromMin(r.f.startMin)}` : '?'}{clash && ' ⚠'}</td>
                    <td><span className="ffd-sty" title={styleOf(r.f.title).name}>{styleOf(r.f.title).code}</span> {r.f.title}<div className="ffd-muted">{r.f.label || `R${r.f.round} · bout ${r.f.boutNo}/${r.f.boutsInCat}`}{r.possible ? ' · if they win' : ''}</div></td>
                    <td><button className="ffd-namebtn" onClick={() => setVid({ a: r.a, f: r.f })}><b>{r.a.name}</b> <span>🎥</span></button><div className="ffd-muted">{[r.a.club, r.a.country].filter(Boolean).join(', ')}</div></td>
                    <td className={!r.opp?.athlete ? 'tbc' : ''}>{r.f.solo ? 'solo (forms)' : r.opp?.athlete
                      ? <button className="ffd-namebtn" onClick={() => setVid({ a: r.opp.athlete, f: r.f })}>{sideTxt(r.opp)} <span>🎥</span></button> : sideTxt(r.opp)}</td>
                    <td>{coachCell(r, k)}</td>
                    <td className="ffd-clashcell">{clashCell(r, k, goTo)}</td>
                    <td>{resultCell(r)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        )
      )}
      {cell && (() => { const r = cell, k = athleteKey(r.a), st = styleOf(r.f.title)
        return (
          <div className="ffd-sheet-bg" onClick={() => setCell(null)}>
            <div className="ffd-sheet ffd-cellsheet" onClick={e => e.stopPropagation()} style={{ '--sty': st.color }}>
              <div className="ffd-cellhead"><b>{r.a.name}</b><span className="ffd-muted">{areaTxt(r.f.area)} · ~{r.f.startMin != null ? fromMin(r.f.startMin) : '?'}</span></div>
              <div><span className="ffd-sty">{st.code}</span> {r.f.title}</div>
              <div className="ffd-muted">{r.f.label || `R${r.f.round} · bout ${r.f.boutNo}/${r.f.boutsInCat}`}{r.possible ? ' · if they win' : ''} · {[r.a.club, r.a.country].filter(Boolean).join(', ')}</div>
              <div>v {r.f.solo ? 'solo (forms)' : sideTxt(r.opp)}</div>
              {(clashWith[`${r.f.id}|${k}`] || []).length > 0 && <div className="ffd-clashcell">{clashCell(r, k, o => setCell(o))}</div>}
              <div className="ffd-cellrow"><span className="ffd-muted">Coach</span>{coachCell(r, k)}</div>
              <div className="ffd-cellrow">{resultCell(r)}
                <button className="btn" onClick={() => setVid({ a: r.a, f: r.f })}>🎥 {String(r.a.name).split(/\s+/)[0]}</button>
                {r.opp?.athlete && <button className="btn" onClick={() => setVid({ a: r.opp.athlete, f: r.f })}>🎥 {String(r.opp.athlete.name).split(/\s+/)[0]}</button>}</div>
              <button className="btn" onClick={() => setCell(null)}>Close</button>
            </div>
          </div>
        ) })()}
      {shareOpen && (
        <div className="ffd-sheet-bg" onClick={() => !sharing && setShareOpen(false)}>
          <div className="ffd-sheet" onClick={e => e.stopPropagation()}>
            <b>📤 Share this list</b>
            <div className="ffd-muted">{shareData().subtitle}</div>
            <button className="btn btn-primary" disabled={!!sharing} onClick={() => doShare('share')}>{sharing || '📤 Share PDF (WhatsApp, email…)'}</button>
            <button className="btn" disabled={!!sharing} onClick={() => doShare('download')}>⬇ Download PDF</button>
            <button className="btn" disabled={!!sharing} onClick={() => doShare('print')}>🖨 Print</button>
            <button className="btn" disabled={!!sharing} onClick={() => setShareOpen(false)}>Cancel</button>
          </div>
        </div>
      )}
      {vid && <VideoSheet a={vid.a} f={vid.f} onClose={() => setVid(null)} />}
      <p className="ffd-muted" style={{ marginTop: 8 }}>~ Times are estimates: each category's (or session's) time spread over its bouts, in order. {athletes.length} athlete{athletes.length === 1 ? '' : 's'} found.</p>
    </div>
  )
}

// tap a fighter -> YouTube / Google video searches for their fights. Draw sheets write "Surname First",
// so the search uses "First Surname" (last word moved to the front) and the name as written.
function VideoSheet({ a, f, onClose }) {
  const words = String(a.name || '').trim().split(/\s+/)
  const flipped = words.length > 1 ? [words[words.length - 1], ...words.slice(0, -1)].join(' ') : a.name
  const nice = flipped.toLowerCase().replace(/(^|[\s-])\S/g, c => c.toUpperCase())
  const style = styleOf(f?.title)
  const yt = q => `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`
  const listed = String(a.name || '').trim().toLowerCase().replace(/(^|[\s-])\S/g, c => c.toUpperCase())
  return (
    <div className="ffd-sheet-bg" onClick={onClose}>
      <div className="ffd-sheet" onClick={e => e.stopPropagation()}>
        <b>🎥 {nice}</b>
        <div className="ffd-muted">{[a.club, a.country, style.name !== 'Other' ? style.name : null].filter(Boolean).join(' · ')}</div>
        <a className="btn btn-primary ffd-vidlink ffd-vidmain" href={yt(`"${nice}" kickboxing`)} target="_blank" rel="noreferrer">▶ Find {nice}'s fights on YouTube</a>
        <div className="ffd-vidmore">
          {listed !== nice && <a href={yt(`"${listed}" kickboxing`)} target="_blank" rel="noreferrer">Not finding it? Try “{listed}”</a>}
          <a href={`https://www.google.com/search?tbm=vid&q=${encodeURIComponent(`"${nice}" kickboxing`)}`} target="_blank" rel="noreferrer">Google videos (Facebook, Instagram…)</a>
        </div>
        <button className="btn" onClick={onClose}>Close</button>
      </div>
    </div>
  )
}
