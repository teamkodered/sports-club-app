// Printing that works on phones and PCs: opens a clean page with just the form
// (white background, logo, form layout), waits for the logo to load, then prints.
// The old way (window.print() on the app page, or printing a form tab after a fixed
// 1 second) printed blank pages or the whole dark app.
import { renderToStaticMarkup } from 'react-dom/server'
import MembershipFormView from '../components/shared/MembershipFormView.jsx'
import { supabase } from './supabase.js'

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))

const PAGE_CSS = `
  * { box-sizing: border-box; }
  html, body { background: #fff !important; color: #111 !important; }
  body { font-family: Arial, Helvetica, sans-serif; max-width: 720px; margin: 24px auto; padding: 0 16px; }
  img { max-width: 100%; }
  .no-print { display: none !important; }
  .sig { margin-top: 32px; font-size: 13px; display: flex; gap: 24px; flex-wrap: wrap; }
  .tip { font-size: 12px; color: #666; text-align: center; margin: 0 0 16px; }
  @media print { body { margin: 0 auto; } .tip { display: none; } @page { margin: 14mm; } }
`

// open the tab straight away (phones block tabs opened after a wait), fill it in later
function openTab() {
  const w = window.open('', '_blank')
  if (w) w.document.write('<p style="font-family:Arial;padding:20px">Preparing the form…</p>')
  return w
}

function writeAndPrint(w, title, bodyHtml) {
  if (!w) { alert('Please allow pop-ups for this site to print.'); return }
  w.document.open()
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><base href="${window.location.origin}/">
    <meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)}</title>
    <style>${PAGE_CSS}</style></head><body>
    <p class="tip">If the print window doesn't open, use your browser's Print or Share → Print.</p>
    ${bodyHtml}</body></html>`)
  w.document.close()
  const go = () => { try { w.focus(); w.print() } catch { /* ignore */ } }
  const imgs = [...w.document.images]
  if (!imgs.length) { setTimeout(go, 300); return }
  let left = imgs.length, done = false
  const one = () => { if (--left <= 0 && !done) { done = true; setTimeout(go, 200) } }
  imgs.forEach(img => { if (img.complete) one(); else { img.onload = one; img.onerror = one } })
  setTimeout(() => { if (!done) { done = true; go() } }, 4000)  // never wait forever on a slow logo
}

// A submitted membership form (PKA child / PKA adult / KRBA), laid out like the form
export async function printMembershipForm(f, { blank = false } = {}) {
  const w = openTab()
  let logoSrc = null
  try {
    const key = f.form_type === 'krba' ? 'krba' : f.form_type
    const { data } = await supabase.from('settings').select('value').eq('key', `form_logo_${key}`).maybeSingle()
    if (data?.value) logoSrc = data.value
  } catch { /* use the standard logo */ }
  const html = renderToStaticMarkup(<MembershipFormView f={f} logoSrc={logoSrc} blank={blank} />)
  writeAndPrint(w, blank ? 'Membership Form' : `${f.first_name || ''} ${f.last_name || ''} — Membership Form`.trim(),
    html + '<div class="sig"><span>Signature: ______________________________</span><span>Date: ________________</span></div>')
}

// Any other response (grading, Fit 2 Fight, TPT…): a tidy list of the answers under the form's title
export function printGenericResponse(r, formLabel) {
  const w = openTab()
  const skip = ['id', 'form_type', 'waiver_agreed', 'student_id', 'member_id', 'auth_id']
  const rows = Object.entries(r).filter(([k, v]) => v !== null && v !== '' && !skip.includes(k) && typeof v !== 'object')
    .map(([k, v]) => `<div style="display:flex;gap:12px;padding:6px 0;border-bottom:1px solid #eee;font-size:13px"><div style="width:200px;flex-shrink:0;color:#555;text-transform:capitalize">${esc(k.replace(/_/g, ' '))}</div><div style="font-weight:500">${esc(v)}</div></div>`).join('')
  writeAndPrint(w, `${r.first_name || ''} ${r.last_name || ''} — ${formLabel || 'Form'}`.trim(),
    `<div style="text-align:center;margin-bottom:18px"><img src="/kr-logo.png" alt="" style="height:56px"><div style="font-size:18px;font-weight:800;margin-top:6px">${esc(formLabel || 'Form')}</div></div>${rows}`)
}

// A blank form to fill in by hand: opens the form page and prints once it has actually loaded
export function printBlankForm(path) {
  const w = window.open(path, '_blank')
  if (!w) { alert('Please allow pop-ups for this site to print.'); return }
  const started = Date.now()
  const tick = () => {
    let ready = false
    try {
      const d = w.document
      const imgsDone = [...d.images].every(i => i.complete)
      ready = d.readyState === 'complete' && d.querySelectorAll('input, textarea, select').length > 3 && imgsDone
    } catch { /* not ready */ }
    if (ready) { setTimeout(() => { try { w.focus(); w.print() } catch { /* ignore */ } }, 400); return }
    if (Date.now() - started < 15000) setTimeout(tick, 300)
  }
  setTimeout(tick, 500)
}
