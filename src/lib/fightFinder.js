// Fight finder: read a competition's SCHEDULE (tatami + category start/end) and DRAWS (brackets),
// from sportdata PDFs or saved web pages, then work out each bout and an estimated time.
//
// Schedule PDF line:  "11:00 - 11:50   1   02 LC 085 YC M -37KG - Advanced (7)"
// Draws PDF page:     title = category; names "Surname First (Club,GBR)"; Round 1 names sit on an
//                     even grid, byes sit in the Round 2 column level with the pair they skip.
// Bracket web page:   rounds as lists of slots, in order (empty slots included), with scores.
// Schedule web page:  a grid -- one column per tatami, category blocks with "dur · start · end".

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
      return { x: parts[0].x, y: r.y, text: text.replace(/\s+/g, ' ').trim() }
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
export function buildFights({ schedule = [], draws = [], results = {} }) {
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
  return fights
}

// does an athlete match the search (club names, or a 3-letter country code like GBR)?
export function matchesSearch(a, query) {
  const terms = String(query || '').split(',').map(t => t.trim()).filter(Boolean)
  if (!terms.length || !a) return false
  const club = String(a.club || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
  return terms.some(t => /^[A-Za-z]{3}$/.test(t) && t === t.toUpperCase() ? String(a.country).toUpperCase() === t
    : club.includes(t.toUpperCase().replace(/[^A-Z0-9]/g, '')))
}
