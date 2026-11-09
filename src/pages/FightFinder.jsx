import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../hooks/useAuth.jsx'
import { pdfLines, scheduleFromPdf, scheduleFromHtml, drawsFromPdf, drawFromHtml, boutsFromDailySchedulePdf, buildFights, matchesSearch, athleteKey, fromMin, normTitle, nameKey } from '../lib/fightFinder.js'
import { fetchAll } from '../lib/fetchAll.js'

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
  const [memberNames, setMemberNames] = useState([])   // our athletes, as name-word lists
  const [menu, setMenu] = useState(null)              // saved finder held down -> its options
  const hold = useRef({ t: null, fired: false })
  const holdStart = x => { if (!isAdmin) return; hold.current.fired = false; clearTimeout(hold.current.t)
    hold.current.t = setTimeout(() => { hold.current.fired = true; navigator.vibrate?.(30); window.getSelection?.()?.removeAllRanges(); setMenu(x) }, 550) }
  const holdEnd = () => clearTimeout(hold.current.t)

  useEffect(() => {
    supabase.from('fight_finders').select('id, title, fixture_id, updated_at').order('updated_at', { ascending: false }).limit(30)
      .then(({ data, error }) => setList(error ? (setMsg(/fight_finders/.test(error.message) ? 'Run supabase_fight_finder.sql to switch this on.' : error.message), []) : data || []))
    supabase.from('members').select('id, first_name, last_name, role').in('role', STAFF).order('first_name').then(({ data }) => setStaff(data || []))
    fetchAll(() => supabase.from('students').select('id, members!inner(first_name, last_name, status)').order('id'))
      .then(({ data }) => setMemberNames((data || []).filter(x => x.members?.status !== 'inactive')
        .map(x => nameKey(`${x.members?.first_name || ''} ${x.members?.last_name || ''}`).split(' ').filter(Boolean)).filter(ws => ws.length > 1)))
      .catch(() => {})
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

  return <FinderView ff={ff} staff={staff} memberNames={memberNames} isAdmin={isAdmin} busy={busy} msg={msg} view={view} setView={setView}
    onFiles={loadFiles} setS={setS} save={save} onBack={() => { setFf(null); nav('/fight-finder', { replace: true }) }} />
}

function mergeBy(oldList, newList, key) {
  const m = new Map(oldList.map(x => [key(x), x]))
  newList.forEach(x => m.set(key(x), x))
  return [...m.values()]
}

function FinderView({ ff, staff, memberNames, isAdmin, busy, msg, view, setView, onFiles, setS, save, onBack }) {
  const s = ff.settings || {}
  const query = s.query ?? 'Kode Red', windowMin = Number(s.window ?? 10)
  const useMembers = s.members !== false
  const [draft, setDraft] = useState(query)
  const loadedAt = JSON.stringify([(ff.data?.schedule || []).length, (ff.data?.draws || []).length, (ff.data?.bouts || []).length])
  const [run, setRun] = useState(s.searched ? { query, loadedAt, members: useMembers } : null)   // the search shown; null = not run yet
  const stale = run && (run.query !== draft || run.loadedAt !== loadedAt || run.members !== useMembers)
  const find = () => { setRun({ query: draft, loadedAt, members: useMembers }); setS({ query: draft, searched: true }) }
  const coaches = staff.filter(m => (s.coaches || []).includes(m.id))
  const coachName = id => { const m = staff.find(x => x.id === id); return m ? `${m.first_name} ${m.last_name || ''}`.trim() : '' }
  const fights = useMemo(() => buildFights({ schedule: ff.data?.schedule || [], draws: ff.data?.draws || [], bouts: ff.data?.bouts || [], results: s.results || {} }), [ff.data, s.results])
  const byId = useMemo(() => Object.fromEntries(fights.map(f => [f.id, f])), [fights])
  const ours = sl => !!run && !!sl?.athlete && matchesSearch(sl.athlete, run.query, run.members ? memberNames : null)
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
  }, [fights, run, memberNames, s.results])

  // clashes: same coach (different athletes) or same athlete (different categories) within the window
  const clashes = useMemo(() => {
    const list = []
    const timed = rows.filter(r => r.f.startMin != null)
    for (let i = 0; i < timed.length; i++) for (let j = i + 1; j < timed.length; j++) {
      const A = timed[i], B = timed[j]
      if (A.f.date && B.f.date && A.f.date !== B.f.date) continue
      if (Math.abs(A.f.startMin - B.f.startMin) > windowMin || A.f.id === B.f.id) continue
      const ka = athleteKey(A.a), kb = athleteKey(B.a)
      const ca = s.assign?.[ka], cb = s.assign?.[kb]
      if (ka === kb && normTitle(A.f.title) !== normTitle(B.f.title)) list.push({ type: 'athlete', A, B, possible: A.possible || B.possible })
      else if (ka !== kb && ca && ca === cb) list.push({ type: 'coach', coach: ca, A, B, possible: A.possible || B.possible })
    }
    return list
  }, [rows, windowMin, s.assign])
  const clashKeys = new Set(clashes.flatMap(c => [`${c.A.f.id}|${athleteKey(c.A.a)}`, `${c.B.f.id}|${athleteKey(c.B.a)}`]))

  const areaKey = a => a == null ? '~' : typeof a === 'number' ? `T${String(a).padStart(3, '0')}` : String(a).replace(/(\d+)/, d => d.padStart(3, '0'))
  const areaTxt = a => a == null ? '?' : typeof a === 'number' ? `T${a}` : a
  const isCoachView = view.startsWith('coach:'), viewCoach = isCoachView ? view.slice(6) : null
  const shown = rows.filter(r => !viewCoach || s.assign?.[athleteKey(r.a)] === viewCoach)
    .sort((a, b) => { const ar = areaKey(a.f.area).localeCompare(areaKey(b.f.area)), tm = (a.f.startMin ?? 9e9) - (b.f.startMin ?? 9e9); return view === 'ring' ? ar || tm : tm || ar })
  const athletes = [...new Map(rows.map(r => [athleteKey(r.a), r.a])).values()]

  const setResult = (f, colour) => setS({ results: { ...(s.results || {}), [f.id]: s.results?.[f.id] === colour ? undefined : colour } })
  const shareText = cid => {
    const mine = rows.filter(r => s.assign?.[athleteKey(r.a)] === cid && !r.possible).sort((a, b) => (a.f.startMin ?? 9e9) - (b.f.startMin ?? 9e9))
    return `🥊 ${ff.title} — ${coachName(cid)}'s fights\n` + mine.map(r => `${r.f.area != null ? areaTxt(r.f.area) : ''} ~${r.f.startMin != null ? fromMin(r.f.startMin) : '?'} · ${r.a.name} · ${r.f.title} · v ${sideTxt(r.opp)}`).join('\n')
  }

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
        <label className="ffd-check"><input type="checkbox" checked={useMembers} onChange={e => setS({ members: e.target.checked })} /> Also find our athletes by name ({memberNames.length})</label>
        {noClubs && <div className="ffd-muted">This schedule only lists countries, not clubs — our athletes are found by name, or search a country (GBR).</div>}
        {stale && <div className="ffd-muted">Changed — press 🔍 Find fights to update.</div>}
        <label>Clash window ±<input type="number" min="0" max="60" value={windowMin} onChange={e => setS({ window: Number(e.target.value) || 0 })} style={{ width: 60 }} /> min</label>
        {isAdmin && (
          <details>
            <summary>Coaches at this event ({coaches.length})</summary>
            <div className="ffd-coaches">{staff.map(m => (
              <label key={m.id}><input type="checkbox" checked={(s.coaches || []).includes(m.id)} onChange={e => setS({ coaches: e.target.checked ? [...(s.coaches || []), m.id] : (s.coaches || []).filter(x => x !== m.id) })} /> {m.first_name} {m.last_name}</label>
            ))}</div>
          </details>
        )}
      </div>

      {clashes.length > 0 && (
        <div className="card ffd-clash">
          <b>⚠ {clashes.length} possible clash{clashes.length === 1 ? '' : 'es'}</b> — {clashes.filter(c => c.type === 'coach').length} coach, {clashes.filter(c => c.type === 'athlete').length} athlete
          {clashes.map((c, i) => (
            <div key={i} className="ffd-clash-row">
              {c.type === 'coach' ? `👤 ${coachName(c.coach)}: ` : `🥊 ${c.A.a.name}: `}
              {[c.A, c.B].map(r => `${r.a.name.split(' ')[0]} ${areaTxt(r.f.area)} ~${r.f.startMin != null ? fromMin(r.f.startMin) : '?'}`).join(' & ')}
              {c.possible && <em> (if they win)</em>}
            </div>
          ))}
        </div>
      )}

      <div className="ffd-tabs">
        <button className={view === 'ring' ? 'on' : ''} onClick={() => setView('ring')}>Tatami order</button>
        <button className={view === 'time' ? 'on' : ''} onClick={() => setView('time')}>Time order</button>
        {coaches.map(c => <button key={c.id} className={view === `coach:${c.id}` ? 'on' : ''} onClick={() => setView(`coach:${c.id}`)}>👤 {c.first_name}</button>)}
        <button onClick={() => window.print()}>🖨 Print</button>
        {viewCoach && <a className="ffd-wa" href={`https://wa.me/?text=${encodeURIComponent(shareText(viewCoach))}`} target="_blank" rel="noreferrer">💬 Share</a>}
      </div>

      {!rows.length ? (
        <div className="card ffd-muted">{!fights.length ? 'Load the schedule and draws to find the fights.' : !run ? `${fights.length} bouts loaded — press 🔍 Find fights.` : `No bouts found for "${run.query}"${run.members ? ' or our athletes\' names' : ''}.`}</div>
      ) : (
        <div className="ffd-table-wrap">
          <table className="ffd-table">
            <thead><tr><th>Tatami</th><th>~Time</th><th>Category · bout</th><th>Our athlete</th><th>Opponent</th><th>Coach</th><th>Result</th></tr></thead>
            <tbody>
              {shown.map((r, i) => {
                const k = athleteKey(r.a), res = s.results?.[r.f.id]
                const clash = clashKeys.has(`${r.f.id}|${k}`)
                return (
                  <tr key={i} className={`${r.possible ? 'possible' : ''} ${clash ? 'clash' : ''}`}>
                    <td><b>{areaTxt(r.f.area)}</b></td>
                    <td>{r.f.startMin != null ? `~${fromMin(r.f.startMin)}` : '?'}{clash && ' ⚠'}</td>
                    <td>{r.f.title}<div className="ffd-muted">{r.f.label || `R${r.f.round} · bout ${r.f.boutNo}/${r.f.boutsInCat}`}{r.possible ? ' · if they win' : ''}</div></td>
                    <td><b>{r.a.name}</b><div className="ffd-muted">{[r.a.club, r.a.country].filter(Boolean).join(', ')}</div></td>
                    <td className={!r.opp?.athlete ? 'tbc' : ''}>{r.f.solo ? 'solo (forms)' : sideTxt(r.opp)}</td>
                    <td>
                      {isAdmin && coaches.length ? (
                        <select value={s.assign?.[k] || ''} onChange={e => setS({ assign: { ...(s.assign || {}), [k]: e.target.value || undefined } })}>
                          <option value="">—</option>{coaches.map(c => <option key={c.id} value={c.id}>{c.first_name}</option>)}
                        </select>
                      ) : coachName(s.assign?.[k]) || '—'}
                    </td>
                    <td>{!r.possible && r.opp?.athlete && isAdmin ? (
                      <span className="ffd-res">
                        <button className={res === r.colour ? 'won' : ''} onClick={() => setResult(r.f, r.colour)}>Won</button>
                        <button className={res && res !== r.colour ? 'lost' : ''} onClick={() => setResult(r.f, r.colour === 'red' ? 'blue' : 'red')}>Lost</button>
                      </span>
                    ) : res ? (res === r.colour ? '✓ Won' : '✗ Lost') : ''}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="ffd-muted" style={{ marginTop: 8 }}>~ Times are estimates: each category's (or session's) time spread over its bouts, in order. {athletes.length} athlete{athletes.length === 1 ? '' : 's'} found.</p>
    </div>
  )
}
