// Fight finder: read a competition's SCHEDULE (tatami + category start/end) and DRAWS (brackets),
// from sportdata PDFs or saved web pages, then work out each bout and an estimated time.
//
// Schedule PDF line:  "11:00 - 11:50   1   02 LC 085 YC M -37KG - Advanced (7)"
// Draws PDF page:     title = category; names "Surname First (Club,GBR)"; Round 1 names sit on an
//                     even grid, byes sit in the Round 2 column level with the pair they skip.
// Bracket web page:   rounds as lists of slots, in order (empty slots included), with scores.
// Schedule web page:  a grid -- one column per tatami, category blocks with "dur · start · end".
// Daily Schedule PDF (WAKO / sportdata): one row per BOUT -- "SESSION 1 T1", "2026-11-09 10:00", then
//                     "1 1101 R16 02 LC 128 S M -57 KG RED Schulte Lukas GER" / "BLUE Simondi Samuele ITA".

const NAME = /^(.+?) \((.+),([A-Z]{3})\)$/
export const normTitle = t => String(t || '').toUpperCase().replace(/[^A-Z0-9+]/g, '')
export const athleteKey = a => `${String(a.name).toUpperCase().replace(/\s+/g, ' ').trim()}|${String(a.club || '').toUpperCase().trim()}`
const toMin = t => { const [h, m] = String(t).split(':').map(Number); return h * 60 + m }
export const fromMin = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(Math.round(m % 60)).padStart(2, '0')}`

// ── PDF text lines (pdf.js, loaded only when needed) ──
export async function pdfLines(file) {
  const pdfjs = await import('pdfjs-dist/build/pdf.min.mjs')
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise
  const pages = []
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n)
    const h = page.getViewport({ scale: 1 }).height
    const tc = await page.getTextContent()
    const rows = []
    for (const it of tc.items) {
      if (!it.str || !it.str.trim()) continue
      const x = it.transform[4], y = h - it.transform[5]
      let row = rows.find(r => Math.abs(r.y - y) < 2.5)
      if (!row) { row = { y, parts: [] }; rows.push(row) }
      row.parts.push({ x, w: it.width || 0, s: it.str })
    }
    const lines = rows.sort((a, b) => a.y - b.y).map(r => {
      const parts = r.parts.sort((a, b) => a.x - b.x)
      let text = '', end = null
      for (const p of parts) { text += (end != null && p.x - end > 1 && !text.endsWith(' ') && !p.s.startsWith(' ') ? ' ' : '') + p.s; end = p.x + p.w }
      return { x: parts[0].x, y: r.y, text: text.replace(/\s+/g, ' ').trim(), parts }   // parts (with x) are needed for column layouts like team sheets
    })
    pages.push(lines)
  }
  return pages
}

// ── schedule ──
export function scheduleFromPdf(pages) {
  const out = []
  for (const lines of pages) {
    const date = (lines.map(l => l.text.match(/(\d{4}-\d{2}-\d{2})/)).find(Boolean) || [])[1] || null
    for (const l of lines) {
      const m = l.text.match(/^(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})\s+(\d+)\s+(.+?)\s*\((\d+)\)$/)
      if (m) out.push({ date, start: m[1].padStart(5, '0'), end: m[2].padStart(5, '0'), area: Number(m[3]), title: m[4].trim(), entries: Number(m[5]) })
    }
  }
  return out
}
// ── Daily Schedule (one row per bout, countries only -- no clubs) ──
const SIDE = t => {   // "Schulte Lukas GER" / "Ozgen Rabia 2 TUR" / "" -> athlete or null
  const txt = String(t || '').trim()
  if (!txt) return null
  const m = txt.match(/^(.*?)(?:\s+(\d))?\s+([A-Z]{3})$/)
  return m && m[1] ? { name: m[1].trim(), club: '', country: m[3], seed: m[2] ? Number(m[2]) : null } : { name: txt, club: '', country: '' }
}
export function boutsFromDailySchedulePdf(pages) {
  const out = []
  for (const lines of pages) {
    const texts = lines.map(l => l.text)
    if (!texts.some(t => /Daily Schedule/i.test(t))) continue
    const ses = texts.map(t => t.match(/^SESSION\s+(\d+)\s+([A-Z]{1,3})\s*(\d+)$/i)).find(Boolean)
    const dt = texts.map(t => t.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{1,2}:\d{2})$/)).find(Boolean)
    if (!ses || !dt) continue
    const area = `${ses[2].toUpperCase()}${ses[3]}`
    for (let i = 0; i < texts.length; i++) {
      const m = texts[i].match(/^(\d+)\s+(\d{3,5})\s+(\S+)\s+(.+?)\s+RED(?:\s+(.*))?$/)
      if (!m) continue
      const b = (texts[i + 1] || '').match(/^BLUE(?:\s+(.*))?$/)
      const red = SIDE(m[5]), blue = b ? SIDE(b[1]) : null
      out.push({ id: `BOUT-${m[2]}`, bout: Number(m[2]), order: Number(m[1]), phase: m[3], title: m[4].trim(),
        area, session: Number(ses[1]), date: dt[1], sessionStart: dt[2].padStart(5, '0'),
        red: red ? { athlete: red } : null, blue: blue ? { athlete: blue } : null })
      if (b) i++
    }
  }
  return out
}

export function scheduleFromHtml(text) {
  const doc = new DOMParser().parseFromString(text, 'text/html')
  const dm = (doc.body.textContent.match(/Date:\s*\w+\s+(\d{2})\.(\d{2})\.(\d{4})/) || [])
  const date = dm.length ? `${dm[3]}-${dm[2]}-${dm[1]}` : null
  const out = []
  doc.querySelectorAll('table').forEach(table => {
    const heads = [...table.querySelectorAll('tr')].find(tr => /Tatami|Area|Ring/i.test(tr.textContent))
    if (!heads) return
    const areas = [...heads.children].map(th => (th.textContent.match(/(\d+)/) || [])[1]).slice(1)
    const busy = []   // per column: rows still covered by a rowspan
    ;[...table.querySelectorAll('tr')].forEach(tr => {
      const cells = [...tr.children].filter(td => td.tagName === 'TD')
      if (!cells.length || !cells[0].classList.contains('time-cell')) return
      let col = 0
      for (const td of cells.slice(1)) {
        while (busy[col] > 0) { busy[col]--; col++ }
        const span = Number(td.getAttribute('rowspan') || 1)
        const title = td.querySelector('.match-title')?.textContent?.trim()
        const info = td.querySelector('.cell-info')?.textContent || ''
        const tm = info.match(/(\d{2}:\d{2})\s*·\s*(\d{2}:\d{2})\s*·\s*(\d{2}:\d{2})/)
        const entTxt = [...td.querySelectorAll('.badge')].map(b => b.textContent).find(t => /entries/i.test(t)) || ''
        const ent = (entTxt.match(/(\d+)\s*entries/i) || [])[1]
        if (title && tm && !/doors open|end of day/i.test(title)) out.push({ date, area: Number(areas[col] || col + 1), title, start: tm[2], end: tm[3], entries: ent ? Number(ent) : null })
        busy[col] = span - 1; col++
      }
      for (; col < busy.length; col++) if (busy[col] > 0) busy[col]--
    })
  })
  return out
}

// ── brackets: slots per round -> bouts ──
// rounds[0] = Round 1 slots (N), each slot { athlete } or null; byes are placed in rounds[1].
export function boutsFromSlots(title, r1, byesR2, results = {}) {
  const N = r1.length, bouts = []
  let slots = r1.map(a => (a ? { athlete: a } : null)), round = 1
  while (slots.length > 1) {
    const next = []
    for (let i = 0; i < slots.length; i += 2) {
      const a = slots[i], b = slots[i + 1]
      let winner = null
      if (a && b) {
        const id = `${normTitle(title)}-R${round}-${i / 2}`
        const bout = { id, title, round, pos: i / 2, red: a, blue: b, roundsTotal: Math.log2(N) }
        bouts.push(bout)
        const w = results[id]
        winner = w === 'red' ? a : w === 'blue' ? b : { winnerOf: id }
      } else winner = a || b || null
      next.push(winner)
    }
    if (round === 1 && byesR2) byesR2.forEach((bye, j) => { if (bye) next[j] = { athlete: bye } })
    slots = next; round++
  }
  return bouts
}

export function drawsFromPdf(pages) {
  const cats = []
  for (const lines of pages) {
    // the title line can have other header text on the end, e.g. '[2] 2026-10-23 The Bristol'
    const title = String(lines[0]?.text || '').replace(/\s+\[\d+\].*$/, '').replace(/\s+\d{4}-\d{2}-\d{2}.*$/, '').trim()
    const rows = lines.map(l => { const m = l.text.match(NAME); return m ? { x: Math.round(l.x), y: l.y, name: m[1], club: m[2], country: m[3] } : null }).filter(Boolean)
    if (!title || !rows.length) continue
    const g = bracketFromGrid(title, rows)
    if (g) cats.push({ title, entries: rows.length, ...g })
  }
  return cats
}
function bracketFromGrid(title, rows) {
  let N = 1; while (N < rows.length) N *= 2
  const athlete = r => ({ name: r.name, club: r.club, country: r.country })
  if (rows.length === 2) return { r1: [athlete(rows[0]), athlete(rows[1])], byes: null }
  const xs = [...new Set(rows.map(r => r.x))].sort((a, b) => a - b)
  const r1 = rows.filter(r => Math.abs(r.x - xs[0]) < 3).sort((a, b) => a.y - b.y)
  const byes = rows.filter(r => Math.abs(r.x - xs[0]) >= 3).sort((a, b) => a.y - b.y)
  if (r1.length < 2) return null
  const d = Math.min(...r1.slice(1).map((r, i) => r.y - r1[i].y))
  for (let m = 0; m < N; m++) {
    const y0 = r1[0].y - m * d, ks = {}
    let ok = true
    for (const r of r1) { const k = (r.y - y0) / d; if (Math.abs(k - Math.round(k)) > 0.2 || Math.round(k) < 0 || Math.round(k) >= N) { ok = false; break } ks[Math.round(k)] = r }
    if (!ok || Object.keys(ks).some(k => !ks[k ^ 1])) continue
    const js = {}
    for (const b of byes) {
      const j = (b.y + 5 - y0 - d / 2) / (2 * d), jr = Math.round(j)
      if (Math.abs(j - jr) > 0.25 || jr < 0 || jr >= N / 2 || ks[2 * jr] || ks[2 * jr + 1] || js[jr]) { ok = false; break }
      js[jr] = b
    }
    if (!ok || Object.keys(ks).length / 2 + Object.keys(js).length !== N / 2) continue
    const slots = Array.from({ length: N }, (_, k) => (ks[k] ? athlete(ks[k]) : null))
    const byeSlots = Array.from({ length: N / 2 }, (_, j) => (js[j] ? athlete(js[j]) : null))
    return { r1: slots, byes: byeSlots }
  }
  return null
}

export function drawFromHtml(text) {
  const doc = new DOMParser().parseFromString(text, 'text/html')
  // the category title: the first piece of text that looks like "02 LC 092 YC F -42KG - Advanced"
  const walker = doc.createTreeWalker(doc.body, 4)
  let title = ''
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const t = n.textContent.replace(/\s+/g, ' ').trim()
    if (/^\d{2,4} [A-Z]{2,3} \d{3}/.test(t) && !/Round|Pool|Tree/i.test(t)) { title = t; break }
  }
  const rounds = []
  doc.querySelectorAll('h3').forEach(h => {
    if (!/Round\s*\d+/i.test(h.textContent)) return
    const ul = h.nextElementSibling
    if (!ul) return
    rounds.push([...ul.querySelectorAll('li')].map(li => {
      const info = li.querySelector('.tournament-bracket__caption_info')
      const name = info?.childNodes[0]?.textContent?.replace(/\u00a0/g, ' ').trim()
      if (!name) return null
      const clubTxt = info.querySelector('.tournament-bracket__caption_info2')?.textContent?.trim() || ''
      const m = clubTxt.match(/^(.*),([A-Z]{3})$/)
      const score = li.querySelector('.tournament-bracket__score')?.textContent?.trim()
      return { name, club: m ? m[1] : clubTxt, country: m ? m[2] : '', score: score === '' ? null : Number(score) }
    }))
  })
  if (!rounds.length) return null
  // Round 1 slots + byes: anyone in Round 2 who didn't come from a Round 1 bout
  const r1 = rounds[0], N = r1.length
  const r2 = rounds[1] || []
  const byes = r2.map((s, j) => (s && !r1[2 * j] && !r1[2 * j + 1] ? s : null))
  // results seen on the page: whoever appears in the next round won
  const results = {}
  rounds.forEach((slots, ri) => {
    const nxt = rounds[ri + 1]; if (!nxt) return
    for (let i = 0; i < slots.length; i += 2) {
      const a = slots[i], b = slots[i + 1], w = nxt[i / 2]
      if (a && b && w) results[`${normTitle(title)}-R${ri + 1}-${i / 2}`] = athleteKey(w) === athleteKey(a) ? 'red' : athleteKey(w) === athleteKey(b) ? 'blue' : undefined
    }
  })
  return { title, entries: r1.filter(Boolean).length + byes.filter(Boolean).length, r1, byes, results }
}

// ── bout length when a category has no end time (kickboxing age groups) ──
export function fallbackBoutMinutes(title, def = 5) {
  const t = ` ${String(title).toUpperCase()} `
  if (/ (CH|CHILD|CHILDREN) /.test(t)) return 5          // 2 × 1.5 + rest + changeover
  if (/ (YC|OC) /.test(t)) return 6                      // 2 × 2
  if (/ (J|S|V) /.test(t)) return 9                      // 3 × 2
  return def
}

// ── put it together: every bout with its tatami + estimated time ──
export const nameKey = n => String(n || '').toUpperCase().replace(/[^A-Z\s-]/g, ' ').split(/[\s-]+/).filter(Boolean).sort().join(' ')
const pairKey = (a, b) => [nameKey(a?.athlete?.name), nameKey(b?.athlete?.name)].sort().join('|')
export function buildFights({ schedule = [], draws = [], bouts = [], results = {} }) {
  const byTitle = {}
  schedule.forEach(s => { byTitle[normTitle(s.title)] = s })
  const fights = []
  for (const cat of draws) {
    const nt = normTitle(cat.title)
    const sch = byTitle[nt] || schedule.find(x => { const ns = normTitle(x.title); return ns && (nt.startsWith(ns) || ns.startsWith(nt)) })
    // worked out fresh with the results so far, so "winner of" slots fill in
    const bouts = boutsFromSlots(cat.title, cat.r1 || [], cat.byes, { ...(cat.results || {}), ...results })
    const order = [...bouts].sort((a, b) => a.round - b.round || a.pos - b.pos)
    const n = order.length
    const span = sch ? toMin(sch.end) - toMin(sch.start) : null
    const per = span && n ? span / n : fallbackBoutMinutes(cat.title)
    order.forEach((b, i) => fights.push({
      ...b, area: sch?.area ?? null, date: sch?.date ?? null,
      startMin: sch ? toMin(sch.start) + i * per : null, estimated: true, boutNo: i + 1, boutsInCat: n,
      catStart: sch?.start || null, catEnd: sch?.end || null, result: results[b.id] || null,
    }))
  }
  if (bouts.length) addScheduledBouts(fights, bouts, results)
  return fights
}

// each session runs its bouts in order from the session's start time. A bout's length is a guess
// (fallbackBoutMinutes, 3 min for a solo form); if the next session on that area starts sooner than
// the guesses add up to, the session is squeezed to fit.
function addScheduledBouts(fights, bouts, results) {
  const groups = {}
  bouts.forEach(b => { (groups[`${b.date}|${b.area}|${b.session}`] ||= []).push(b) })
  const starts = Object.values(groups).map(g => ({ date: g[0].date, area: g[0].area, start: toMin(g[0].sessionStart) }))
  const fromDraws = new Map(fights.map(f => [pairKey(f.red, f.blue), f]))
  for (const g of Object.values(groups)) {
    g.sort((a, b) => a.order - b.order)
    const start = toMin(g[0].sessionStart)
    const lens = g.map(b => (b.blue?.athlete ? fallbackBoutMinutes(b.title) : 3))
    const total = lens.reduce((x, y) => x + y, 0)
    const next = starts.filter(x => x.date === g[0].date && x.area === g[0].area && x.start > start).sort((a, b) => a.start - b.start)[0]
    const k = next && next.start - start < total ? (next.start - start) / total : 1
    let t = start
    g.forEach((b, i) => {
      const timing = { area: b.area, date: b.date, startMin: t, estimated: true, boutNo: b.bout, label: `${b.phase} · bout ${b.bout}`, sessionStart: b.sessionStart }
      t += lens[i] * k
      const drawn = b.red?.athlete && b.blue?.athlete ? fromDraws.get(pairKey(b.red, b.blue)) : null
      if (drawn) { Object.assign(drawn, timing); return }   // the bracket has clubs + next rounds; take the schedule's tatami and time
      fights.push({ ...timing, id: b.id, title: b.title, round: b.phase, red: b.red, blue: b.blue, solo: !b.blue?.athlete, result: results[b.id] || null })
    })
  }
}

// does an athlete match the search (club names, or a 3-letter country code like GBR)?
// does an athlete match the search? A 3-letter code in capitals (GBR) = country; anything else matches a
// club, or an athlete's name (every word typed, any order). memberNames: our athletes' names, as word
// lists -- an athlete matches when all of a member's first + last name words are in their name.
export function matchesSearch(a, query, memberNames = null) {
  if (!a) return false
  const words = nameKey(a.name).split(' ')
  const home = !a.country || ['GBR', 'ENG', 'SCO', 'WAL', 'NIR'].includes(String(a.country).toUpperCase())
  if (home && memberNames && memberNames.some(ws => ws.length > 1 && ws.every(w => words.includes(w)))) return true
  const terms = String(query || '').split(',').map(t => t.trim()).filter(Boolean)
  const club = String(a.club || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
  return terms.some(t => {
    if (/^[A-Z]{3}$/.test(t)) return String(a.country).toUpperCase() === t
    const c = t.toUpperCase().replace(/[^A-Z0-9]/g, '')
    if (club && c && club.includes(c)) return true
    const tw = nameKey(t).split(' ').filter(w => w.length > 1)
    return tw.length > 0 && tw.every(w => words.includes(w))
  })
}

// ── style (discipline) of a category: "02 LC 128 S M -57 KG" -> LC; each gets its own colour ──
export const STYLES = {
  PF: { name: 'Point Fighting', color: '#3B82F6' },
  LC: { name: 'Light Contact', color: '#22C55E' },
  KL: { name: 'Kick Light', color: '#EAB308' },
  FC: { name: 'Full Contact', color: '#EF4444' },
  LK: { name: 'Low Kick', color: '#A855F7' },
  K1: { name: 'K1', color: '#F97316' },
  CF: { name: 'Forms', color: '#EC4899' },
}
const FORMS = ['CF', 'MF', 'AF', 'FM', 'KF']
export function styleOf(title) {
  const code = (String(title || '').toUpperCase().match(/^\s*\d{1,3}\s+([A-Z][A-Z0-9]{1,2})\b/) || [])[1] || ''
  if (FORMS.includes(code)) return { code, ...STYLES.CF }
  return STYLES[code] ? { code, ...STYLES[code] } : { code: code || '?', name: code || 'Other', color: '#94A3B8' }
}
// ring / tatami / forms -- forms first (they run on a tatami), then by the area's letter
export function kindOf(f) {
  if (f.solo || FORMS.includes(styleOf(f.title).code)) return 'forms'
  return /^R/i.test(String(f.area ?? '')) ? 'ring' : 'tatami'
}

// ── team list (squad sheet / pasted names / CSV) ──
// entry: { name, cat, style, weight } -- one per athlete per category; an athlete can have several
const STYLE_WORDS = [['LIGHT CONTACT', 'LC'], ['KICK LIGHT', 'KL'], ['FULL CONTACT', 'FC'], ['LOW KICK', 'LK'], ['POINTS', 'PF'], ['POINT FIGHTING', 'PF'], ['K1', 'K1'], ['K-1', 'K1'], ['FORMS', 'CF'], ['MUSICAL FORMS', 'CF'], ['PF', 'PF'], ['LC', 'LC'], ['KL', 'KL'], ['FC', 'FC'], ['LK', 'LK'], ['CF', 'CF']]
const STYLE_NAME = { PF: 'Points', LC: 'Light Contact', KL: 'Kick Light', FC: 'Full Contact', K1: 'K1', LK: 'Low Kick', CF: 'Forms' }
const styleIn = t => { const u = ` ${String(t).toUpperCase()} `; const s = STYLE_WORDS.find(([w]) => u.includes(` ${w} `)); return s ? s[1] : null }
const WEIGHT = /^(UNDER|OVER|U|O|-|\+)\s*([\d.,]+)\s*K?G?S?$/i
const weightTxt = m => `${/^(OVER|O|\+)$/i.test(m[1]) ? '+' : '-'}${m[2].replace(',', '.')}`
const titleCase = t => String(t).toLowerCase().replace(/(^|[\s/-])\S/g, c => c.toUpperCase()).replace(/\s*\d+$/, '')

// squad sheet PDF: header rows name the style for each column ("SENIOR MALE | POINTS ..."),
// then "UNDER 57KG | Tylee Dylan" pairs sit under those columns
export function teamFromPdf(pages) {
  const out = []
  for (const lines of pages) {
    let cols = [], prefix = {}, prefixY = -99
    for (const l of lines) {
      const parts = (l.parts || [{ x: l.x, s: l.text }]).map(p => ({ x: p.x, s: String(p.s).trim() })).filter(p => p.s)
      const styles = parts.filter(p => styleIn(p.s) && !WEIGHT.test(p.s))
      if (styles.length && !parts.some(p => WEIGHT.test(p.s))) {
        // a header row: each style word + the label to its left starts a column
        cols = styles.map(st => {
          const label = parts.filter(p => p.x < st.x && !styleIn(p.s)).filter(p => !cols.length || true).pop()
          const lx = label && styles.every(o => o === st || o.x < label.x || o.x > st.x) ? label.x : st.x
          const near = l.y - prefixY < 20 ? Object.keys(prefix).map(Number).find(px => Math.abs(px - lx) < 25) : null
          return { x: lx, style: styleIn(st.s), label: titleCase([near != null ? prefix[near] : '', label ? label.s : ''].filter(Boolean).join(' ')) }
        })
        prefix = {}
        continue
      }
      if (parts.some(p => WEIGHT.test(p.s))) prefix = {}
      if (!parts.some(p => WEIGHT.test(p.s))) { prefix = {}; prefixY = l.y; parts.forEach(p => { prefix[Math.round(p.x)] = p.s }); continue }   // only the line just above a header counts   // e.g. "MASTERS / VETS" above "MALE  POINTS"
      parts.forEach((p, i) => {
        const m = p.s.match(WEIGHT); if (!m) return
        const next = parts[i + 1]
        if (!next || WEIGHT.test(next.s)) return   // empty weight
        const col = [...cols].sort((a, b) => b.x - a.x).find(c => c.x <= p.x + 12) || cols[0]
        if (!col) return
        out.push({ name: next.s.replace(/\s+/g, ' '), style: col.style, weight: weightTxt(m), cat: `${col.label} ${STYLE_NAME[col.style] || ''} ${weightTxt(m)}kg`.replace(/\s+/g, ' ').trim() })
      })
    }
  }
  return out
}

// pasted names / CSV: one athlete per line; "name, category" works too. Bullets, numbers and emoji are ignored.
export function teamFromText(text) {
  return String(text).split(/\r?\n/).map(l => l.replace(/^[\s\-*•·\d.)]+/, '').replace(/[^\p{L}\p{N}\s,.'\-+/()]/gu, '').trim()).filter(Boolean)
    .filter(l => !/^name\b/i.test(l))
    .map(l => { const [name, ...rest] = l.split(/\s*[,;\t]\s*/); const cat = rest.join(' ').trim()
      return name && /\p{L}{2,}/u.test(name) ? { name: name.replace(/\s+/g, ' '), cat, style: styleIn(cat), weight: (cat.match(/([+-]\d+(?:[.,]\d+)?)/) || [])[1] || '' } : null })
    .filter(Boolean)
}

// does a fighter's name match a team athlete? every word of the team name must be in the fighter's name (any order)
export const teamWords = name => nameKey(name).split(' ').filter(Boolean)
export const isTeamName = (fighterName, words) => { const f = nameKey(fighterName).split(' '); return words.length > 1 && words.every(w => f.includes(w)) }
