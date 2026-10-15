import { useEffect, useMemo, useRef, useState } from 'react'

// Reads a "page" (e.g. the Instructor's Handbook) inside the app: contents list to jump to a
// section, and a search box that shows only the sections containing the words and highlights them.
// Content is HTML made from the club's own Word file (admin-added), split into sections at <h2>.

// Word file -> page HTML (bold one-line paragraphs become headings: "1. ..." = section, others = sub-heading)
export async function wordToPageHtml(file) {
  const mammoth = (await import('mammoth')).default
  const { value } = await mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() })
  let first = true
  return value.replace(/<p><strong>((?:(?!<\/?p>|<\/strong>).)*?)<\/strong><\/p>/gs, (m, t) => {
    const txt = t.replace(/<[^>]+>/g, '').trim()
    if (first) { first = false; return `<h1>${t}</h1>` }
    if (/^\d+\.\s/.test(txt)) return `<h2>${t}</h2>`
    if (txt.length > 90) return m
    return `<h3>${t}</h3>`
  })
}

function splitSections(html) {
  const doc = new DOMParser().parseFromString(`<div>${html || ''}</div>`, 'text/html')
  const root = doc.body.firstChild
  const sections = []
  let cur = { title: null, nodes: [] }
  let title = ''
  for (const n of Array.from(root.childNodes)) {
    if (n.nodeName === 'H1') { title = n.textContent.trim(); continue }
    if (n.nodeName === 'H2') { if (cur.nodes.length || cur.title) sections.push(cur); cur = { title: n.textContent.trim(), nodes: [] }; continue }
    cur.nodes.push(n.outerHTML || n.textContent)
  }
  if (cur.nodes.length || cur.title) sections.push(cur)
  return { title, sections: sections.map((s, i) => ({ id: `s${i}`, title: s.title || 'Introduction', html: s.nodes.join(''), text: (s.title || '') + ' ' + s.nodes.join(' ').replace(/<[^>]+>/g, ' ') })) }
}

const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
// highlight matches in text only (never inside tags)
function highlight(html, q) {
  if (!q) return html
  const re = new RegExp(`(${esc(q)})`, 'gi')
  return html.split(/(<[^>]+>)/g).map(part => part.startsWith('<') ? part : part.replace(re, '<mark>$1</mark>')).join('')
}

export default function HandbookReader({ item, onClose }) {
  const { title, sections } = useMemo(() => splitSections(item.body), [item.body])
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(() => new Set())   // sections opened by tapping
  const refs = useRef({})
  const query = q.trim()
  const shown = query ? sections.filter(s => s.text.toLowerCase().includes(query.toLowerCase())) : sections
  const count = s => query ? (s.text.toLowerCase().split(query.toLowerCase()).length - 1) : 0
  useEffect(() => { const k = e => e.key === 'Escape' && onClose(); window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k) }, [onClose])

  const isOpen = s => !!query || open.has(s.id)
  const toggle = id => setOpen(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  const jump = s => { setQ(''); setOpen(prev => new Set(prev).add(s.id)); setTimeout(() => refs.current[s.id]?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50) }

  return (
    <div className="hb-overlay" role="dialog" aria-label={item.title}>
      <div className="hb-top">
        <button className="btn btn-sm" onClick={onClose}>← Back</button>
        <b className="hb-title">{title || item.title}</b>
      </div>
      <div className="hb-search">
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="🔍 Search the handbook, e.g. warm-up, behaviour, round kick…" aria-label="Search the handbook" />
        {query && <span className="hb-found">{shown.length ? `${shown.reduce((n, s) => n + count(s), 0)} matches in ${shown.length} section${shown.length === 1 ? '' : 's'}` : 'No matches'}</span>}
      </div>
      {!query && (
        <div className="hb-toc">
          {sections.map(s => <button key={s.id} type="button" onClick={() => jump(s)}>{s.title}</button>)}
        </div>
      )}
      <div className="hb-body">
        {shown.map(s => (
          <section key={s.id} ref={el => { refs.current[s.id] = el }} className="hb-sec">
            <button type="button" className="hb-sec-head" onClick={() => !query && toggle(s.id)} aria-expanded={isOpen(s)}>
              <span>{isOpen(s) ? '▾' : '▸'}</span> {s.title}{query && <em>{count(s)}</em>}
            </button>
            {isOpen(s) && <div className="hb-content" dangerouslySetInnerHTML={{ __html: highlight(s.html, query) }} />}
          </section>
        ))}
        {!query && <button type="button" className="btn btn-sm" style={{ margin: '12px 0' }} onClick={() => setOpen(prev => prev.size === sections.length ? new Set() : new Set(sections.map(s => s.id)))}>{open.size === sections.length ? 'Close all sections' : 'Open all sections'}</button>}
      </div>
    </div>
  )
}
