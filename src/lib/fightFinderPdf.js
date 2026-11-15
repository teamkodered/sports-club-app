// Fight Finder "Share" list: one line per bout, as a PDF (share / download) or a print page.
// rows: [{ time, area, name, country, style: { code, color }, weight, opp, bout, coach, flag: 'clash' | 'time' | null, possible }]

const COLS = [   // landscape A4, mm
  ['~Time', 14], ['Area', 12], ['Style', 22], ['Our athlete', 50], ['Opponent', 62], ['Round · bout', 34], ['Coach', 42], ['', 41],
]
const flagTxt = r => [r.flag === 'clash' ? '! Clash' : r.flag === 'time' ? 'Same time' : '', r.possible ? '(if they win)' : ''].filter(Boolean).join(' ')
const hex = c => { const m = String(c || '#94A3B8').replace('#', ''); return [0, 2, 4].map(i => parseInt(m.slice(i, i + 2), 16) || 148) }

export async function listPdf({ title, subtitle, rows, groups }) {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 10
  const fit = (t, w) => { t = String(t ?? ''); if (doc.getTextWidth(t) <= w) return t; while (t && doc.getTextWidth(t + '…') > w) t = t.slice(0, -1); return t + '…' }
  let y = M + 4
  const head = () => {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(90)
    let x = M; COLS.forEach(([h, w]) => { doc.text(h, x, y); x += w })
    y += 2; doc.setDrawColor(180); doc.line(M, y, W - M, y); y += 5
  }
  doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.setTextColor(20); doc.text(fit(title, W - 2 * M), M, y); y += 6
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(90); doc.text(fit(subtitle, W - 2 * M), M, y); y += 7
  // groups (e.g. one per coach): a heading, then that group's bouts
  const sets = groups?.length ? groups : [{ title: '', rows }]
  sets.forEach((g, gi) => {
  if (g.title) {
    if (y > H - M - 20) { doc.addPage(); y = M + 4 }
    else if (gi) y += 3
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11.5); doc.setTextColor(20); doc.text(fit(g.title, W - 2 * M - 60), M, y)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(90); doc.text(g.note || '', W - M, y, { align: 'right' }); y += 5
  }
  head()
  if (!g.rows.length) { doc.setFontSize(9); doc.setTextColor(120); doc.text('No athletes assigned.', M, y); y += 5.2 }
  g.rows.forEach((r, i) => {
    if (y > H - M - 4) { doc.addPage(); y = M + 4; head() }
    if (r.flag) { doc.setFillColor(...(r.flag === 'clash' ? [253, 226, 226] : [254, 243, 199])); doc.rect(M, y - 3.6, W - 2 * M, 5.2, 'F') }
    else if (i % 2) { doc.setFillColor(246, 246, 246); doc.rect(M, y - 3.6, W - 2 * M, 5.2, 'F') }
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(r.possible ? 120 : 20)
    const cells = [r.time, r.area, `${r.style?.code || ''} ${r.weight || ''}`, r.name + (r.country ? ` (${r.country})` : ''), r.opp, r.bout, r.coach, flagTxt(r)]
    let x = M
    cells.forEach((c, j) => {
      const w = COLS[j][1]
      if (j === 2) { doc.setFillColor(...hex(r.style?.color)); doc.circle(x + 1.3, y - 1.1, 1.3, 'F'); doc.text(fit(c, w - 5), x + 4, y) }
      else { if (j === 3) doc.setFont('helvetica', 'bold'); if (j === 7 && r.flag === 'clash') doc.setTextColor(200, 40, 40); doc.text(fit(c, w - 2), x, y); doc.setFont('helvetica', 'normal'); doc.setTextColor(r.possible ? 120 : 20) }
      x += w
    })
    y += 5.2
  })
  })
  doc.setFontSize(8); doc.setTextColor(130); doc.text('~ times are estimates · Klass Champ fight finder', M, H - 5)
  return doc.output('blob')
}

const esc = t => String(t ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
export function printList({ title, subtitle, rows, groups }) {
  const w = window.open('', '_blank')
  if (!w) return alert('Allow pop-ups for Klass Champ to print.')
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>
    @page { size: A4 landscape; margin: 10mm } body { font: 12px Arial, sans-serif; color: #111; margin: 0 }
    h1 { font-size: 17px; margin: 0 0 2px } p { color: #555; margin: 0 0 8px } table { width: 100%; border-collapse: collapse }
    th { text-align: left; font-size: 11px; color: #555; border-bottom: 1px solid #999; padding: 3px 4px } td { padding: 3px 4px; white-space: nowrap }
    tr:nth-child(even) td { background: #f5f5f5 } tr.clash td { background: #fde2e2 } tr.time td { background: #fef3c7 } tr.possible td { color: #777 }
    h2 { font-size: 14px; margin: 14px 0 4px; display: flex; justify-content: space-between } h2 span { font-weight: normal; color: #555; font-size: 12px }
    i { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 4px } * { -webkit-print-color-adjust: exact; print-color-adjust: exact }
  </style></head><body><h1>${esc(title)}</h1><p>${esc(subtitle)}</p>${(groups?.length ? groups : [{ title: '', rows }]).map(g => `${g.title ? `<h2>${esc(g.title)}<span>${esc(g.note || '')}</span></h2>` : ''}<table><thead><tr>${COLS.map(([h]) => `<th>${h}</th>`).join('')}</tr></thead><tbody>
  ${g.rows.map(r => `<tr class="${r.flag || ''} ${r.possible ? 'possible' : ''}"><td>${esc(r.time)}</td><td>${esc(r.area)}</td><td><i style="background:${r.style?.color}"></i>${esc(r.style?.code)} ${esc(r.weight)}</td><td><b>${esc(r.name)}</b>${r.country ? ` (${esc(r.country)})` : ''}</td><td>${esc(r.opp)}</td><td>${esc(r.bout)}</td><td>${esc(r.coach)}</td><td>${esc(flagTxt(r))}</td></tr>`).join('')}${g.rows.length ? '' : '<tr><td colspan="8" style="color:#777">No athletes assigned.</td></tr>'}
  </tbody></table>`).join('')}<p style="margin-top:8px;font-size:10px">~ times are estimates · Klass Champ fight finder</p></body></html>`)
  w.document.close(); w.focus(); setTimeout(() => w.print(), 300)
}

// results sheet: sections (this day, competition overall), each with totals and a per-athlete table
export async function resultsPdf({ title, sections }) {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 14
  const cols = [['', 86], ['Fights', 22], ['Won', 22], ['Lost', 22], ['Win %', 30]]
  let y = M + 4
  doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.setTextColor(20); doc.text(String(title), M, y); y += 9
  for (const sec of sections) {
    if (y > H - 40) { doc.addPage(); y = M + 4 }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(20); doc.text(sec.title, M, y); y += 6
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(60); doc.text(sec.summary, M, y); y += 7
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(90)
    let x = M; cols.forEach(([h, w]) => { doc.text(h, x, y); x += w }); y += 2; doc.setDrawColor(180); doc.line(M, y, W - M, y); y += 5
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(20)
    sec.rows.forEach((r, i) => {
      if (y > H - M) { doc.addPage(); y = M + 4 }
      if (i % 2) { doc.setFillColor(246, 246, 246); doc.rect(M, y - 3.8, W - 2 * M, 5.4, 'F') }
      doc.setFont('helvetica', r.name === 'Total' || r.name === 'Team' ? 'bold' : 'normal')
      let x2 = M; [r.name, r.fights, r.won, r.lost, r.pct].forEach((c, j) => { doc.text(String(c), x2, y); x2 += cols[j][1] }); y += 5.4
    })
    y += 6
  }
  doc.setFontSize(8); doc.setTextColor(130); doc.text('Won / lost from the results entered in Klass Champ fight finder · win % = won ÷ (won + lost)', M, H - 6)
  return doc.output('blob')
}

// grid sheet: one column per ring / tatami, one row per time; each box = athlete, style + weight, opponent
// grid: { areas: ['R1', ...], rows: [{ time: '10:09', cells: { R1: [{ name, sub, opp, color, flag, possible }] } }] }
export async function gridPdf({ title, subtitle, grid }) {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 10, TW = 16
  const cw = (W - 2 * M - TW) / Math.max(1, grid.areas.length), boxH = 11.5
  const fit = (t, w) => { t = String(t ?? ''); if (doc.getTextWidth(t) <= w) return t; while (t && doc.getTextWidth(t + '…') > w) t = t.slice(0, -1); return t + '…' }
  let y = M + 4
  doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.setTextColor(20); doc.text(fit(title, W - 2 * M), M, y); y += 6
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(90); doc.text(fit(subtitle, W - 2 * M), M, y); y += 6
  const head = () => {
    doc.setFillColor(235, 235, 235); doc.rect(M, y, W - 2 * M, 6, 'F')
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(60)
    grid.areas.forEach((a, i) => doc.text(a, M + TW + i * cw + cw / 2, y + 4.2, { align: 'center' })); y += 7
  }
  head()
  for (const row of grid.rows) {
    const n = Math.max(1, ...grid.areas.map(a => (row.cells[a] || []).length)), rh = n * (boxH + 1) + 1
    if (y + rh > H - M) { doc.addPage(); y = M + 4; head() }
    doc.setDrawColor(210); doc.line(M, y, W - M, y)
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(80); doc.text(row.time, M + 1, y + 5)
    grid.areas.forEach((a, i) => (row.cells[a] || []).forEach((c, k) => {
      const x = M + TW + i * cw + 1, by = y + 1 + k * (boxH + 1), w = cw - 2
      const bg = c.flag === 'clash' ? [253, 226, 226] : c.flag === 'time' ? [254, 243, 199] : [246, 246, 246]
      doc.setFillColor(...bg); doc.rect(x, by, w, boxH, 'F')
      const col = String(c.color || '#94A3B8').replace('#', ''); doc.setFillColor(...[0, 2, 4].map(j => parseInt(col.slice(j, j + 2), 16) || 148)); doc.rect(x, by, 1.4, boxH, 'F')
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(c.possible ? 120 : 20); doc.text(fit(c.name, w - 4), x + 2.6, by + 3.8)
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(90); doc.text(fit(c.sub, w - 4), x + 2.6, by + 7)
      doc.text(fit(c.opp ? `v ${c.opp}` : '', w - 4), x + 2.6, by + 10)
    }))
    y += rh
  }
  doc.setFontSize(8); doc.setTextColor(130); doc.text('~ times are estimates · red = clash · amber = same time · grey = if they win · Klass Champ fight finder', M, H - 5)
  return doc.output('blob')
}
export function printGrid({ title, subtitle, grid }) {
  const w = window.open('', '_blank')
  if (!w) return alert('Allow pop-ups for Klass Champ to print.')
  const e = t => String(t ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${e(title)}</title><style>
    @page { size: A4 landscape; margin: 10mm } body { font: 11px Arial, sans-serif; color: #111; margin: 0 } h1 { font-size: 17px; margin: 0 0 2px } p { color: #555; margin: 0 0 8px }
    table { width: 100%; border-collapse: collapse; table-layout: fixed } th { background: #eee; font-size: 11px; padding: 4px } td { border-top: 1px solid #ccc; vertical-align: top; padding: 2px }
    td.t { width: 48px; font-weight: bold; color: #555 } .b { background: #f5f5f5; border-left: 4px solid #999; padding: 3px 4px; margin: 2px 0 } .b b { display: block } .b i { font-style: normal; color: #555; display: block }
    .clash { background: #fde2e2 } .time { background: #fef3c7 } .possible { color: #888 } * { -webkit-print-color-adjust: exact; print-color-adjust: exact }
  </style></head><body><h1>${e(title)}</h1><p>${e(subtitle)}</p><table><thead><tr><th style="width:48px"></th>${grid.areas.map(a => `<th>${e(a)}</th>`).join('')}</tr></thead><tbody>
  ${grid.rows.map(r => `<tr><td class="t">${e(r.time)}</td>${grid.areas.map(a => `<td>${(r.cells[a] || []).map(c => `<div class="b ${c.flag || ''} ${c.possible ? 'possible' : ''}" style="border-left-color:${c.color}"><b>${e(c.name)}</b><i>${e(c.sub)}</i><i>${c.opp ? 'v ' + e(c.opp) : ''}</i></div>`).join('')}</td>`).join('')}</tr>`).join('')}
  </tbody></table><p style="margin-top:8px;font-size:10px">~ times are estimates · red = clash · amber = same time · grey = if they win</p></body></html>`)
  w.document.close(); w.focus(); setTimeout(() => w.print(), 300)
}
