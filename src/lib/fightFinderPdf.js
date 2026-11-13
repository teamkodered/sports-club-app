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
