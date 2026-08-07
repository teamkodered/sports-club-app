import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase.js'
import * as XLSX from 'xlsx'

// Loosely finds the "name" and "amount" columns in an uploaded
// spreadsheet, since bank/standing-order exports vary a lot in
// their exact headers.
const NAME_HEADER_HINTS = ['name', 'description', 'reference', 'payer', 'payee', 'details', 'narrative']
const AMOUNT_HEADER_HINTS = ['amount', 'credit', 'value', 'paid', 'total']

function detectColumns(rows) {
  if (!rows.length) return { nameKey: null, amountKey: null }
  const headers = Object.keys(rows[0])
  const nameKey = headers.find(h => NAME_HEADER_HINTS.some(hint => h.toLowerCase().includes(hint))) || headers[0]
  const amountKey = headers.find(h => AMOUNT_HEADER_HINTS.some(hint => h.toLowerCase().includes(hint)))
    || headers.find(h => h !== nameKey && rows.some(r => !isNaN(parseFloat(r[h]))))
  return { nameKey, amountKey }
}

function normalizeName(s) {
  return (s || '').toString().trim().toLowerCase().replace(/[^a-z\s]/g, '').replace(/\s+/g, ' ')
}

export default function CRM() {
  const [tab, setTab] = useState('standing_orders')
  const [students, setStudents] = useState([])
  const [payerLinks, setPayerLinks] = useState([])
  const [payments, setPayments] = useState([]) // parsed from the uploaded file: [{ name, amount, raw }]
  const [loading, setLoading] = useState(false)
  const [draggedPayment, setDraggedPayment] = useState(null)
  const [dragOverStudentId, setDragOverStudentId] = useState(null)
  const [selectedPaymentIdx, setSelectedPaymentIdx] = useState(null) // click-to-select alternative to drag & drop
  const [venueFilter, setVenueFilter] = useState('all') // all | krcentre_pka | derbymoore | moorways | krba

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    const [{ data: s }, { data: pl }] = await Promise.all([
      supabase.from('students').select('id, student_ref, discipline, class_schedule, members(first_name, last_name, status)'),
      supabase.from('payer_links').select('*'),
    ])
    setStudents((s || []).filter(x => x.members?.status === 'active'))
    setPayerLinks(pl || [])
    setLoading(false)
  }

  // Same venue/discipline logic used on the Students page and Dashboard -
  // KR Centre PKA students are identified by having a day-pattern class_schedule
  // value (or being blank) rather than one of the two satellite venue names.
  const venueFilteredStudents = students.filter(s => {
    if (venueFilter === 'all') return true
    if (venueFilter === 'krcentre_pka') return s.discipline === 'PKA' && s.class_schedule !== 'Moorways' && s.class_schedule !== 'Derby Moore'
    if (venueFilter === 'derbymoore') return s.class_schedule === 'Derby Moore'
    if (venueFilter === 'moorways') return s.class_schedule === 'Moorways'
    if (venueFilter === 'krba') return s.discipline === 'KRBA'
    return true
  })

  function handleFile(e) {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      const wb = XLSX.read(ev.target.result, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json(ws, { raw: false, defval: '' })
      const { nameKey, amountKey } = detectColumns(rows)
      const parsed = rows
        .map(r => ({ name: (r[nameKey] || '').toString().trim(), amount: amountKey ? r[amountKey] : null, raw: r }))
        .filter(p => p.name)
      setPayments(parsed)
    }
    reader.readAsArrayBuffer(file)
    // Without this, selecting a file with the same filename as last
    // time (e.g. re-exporting/re-uploading from the same source)
    // wouldn't fire this input's change event at all -- the browser
    // only fires it when the input's value actually changes, and
    // re-picking the same filename doesn't count as a change. This
    // was very likely why re-uploads seemed to show stale results.
    e.target.value = ''
  }

  function clearPayments() {
    setPayments([])
    setSelectedPaymentIdx(null)
  }

  function studentFullName(s) {
    return `${s.members?.first_name || ''} ${s.members?.last_name || ''}`.trim()
  }

  // Matching: payer_links (remembered) first -- a payer name can now
  // link to MULTIPLE students (e.g. one payment covering two
  // children) -- then a direct/loose normalized name match against a
  // student's own name as a fallback.
  const linksByPayerName = {}
  for (const l of payerLinks) {
    const n = normalizeName(l.payer_name)
    ;(linksByPayerName[n] ||= []).push(l.student_id)
  }
  const studentByNormalizedName = Object.fromEntries(students.map(s => [normalizeName(studentFullName(s)), s.id]))

  function matchStudentIdsForPayment(payment) {
    const n = normalizeName(payment.name)
    if (linksByPayerName[n]?.length) return linksByPayerName[n]
    if (studentByNormalizedName[n]) return [studentByNormalizedName[n]]
    // Word-based fallback match, order-independent -- handles bank
    // exports that reorder names or insert middle initials, e.g.
    // "Rolling A K Leo" vs a student named "Leo Rolling": a simple
    // substring-contains check fails here since the words aren't
    // consecutive in the same order, but checking that every word of
    // the student's name appears somewhere in the payment name (and
    // vice versa) catches this correctly.
    const paymentWords = new Set(n.split(' ').filter(Boolean))
    const found = students.find(s => {
      const studentWords = normalizeName(studentFullName(s)).split(' ').filter(Boolean)
      if (studentWords.length < 2) return false
      const allStudentWordsInPayment = studentWords.every(w => paymentWords.has(w))
      // Guard against a single common word (e.g. payment name just
      // "Leo") matching any student who happens to share that one
      // word -- only match this direction if the payment name itself
      // has at least 2 words too.
      const allPaymentWordsInStudent = paymentWords.size >= 2 && [...paymentWords].every(w => studentWords.includes(w))
      return allStudentWordsInPayment || allPaymentWordsInStudent
    })
    if (found) return [found.id]

    // Single-word payment name (e.g. a bank narrative that only shows a
    // first or last name, like "Mohan" or "Hinds") -- match it if it
    // uniquely identifies exactly one active student by first name or
    // last name alone. If more than one student shares that name, leave
    // it unmatched rather than risk linking the wrong person -- that
    // case should go through the manual link flow instead.
    if (paymentWords.size === 1) {
      const word = [...paymentWords][0]
      const candidates = students.filter(s =>
        normalizeName(s.members?.first_name) === word || normalizeName(s.members?.last_name) === word
      )
      if (candidates.length === 1) return [candidates[0].id]
    }

    return []
  }

  // Map of studentId -> the payment(s) that matched them, so the
  // Paid students card can show what payment they're linked to
  const paymentsByStudentId = {}
  const unmatchedPayments = []
  for (const p of payments) {
    const sids = matchStudentIdsForPayment(p)
    if (sids.length) sids.forEach(sid => (paymentsByStudentId[sid] ||= []).push(p))
    else unmatchedPayments.push(p)
  }
  const matchedStudentIds = new Set(Object.keys(paymentsByStudentId))
  const sortByName = (a, b) => studentFullName(a).localeCompare(studentFullName(b))
  const unpaidStudents = venueFilteredStudents.filter(s => !matchedStudentIds.has(s.id)).sort(sortByName)
  const paidStudents = venueFilteredStudents.filter(s => matchedStudentIds.has(s.id)).sort(sortByName)

  async function linkPayment(payment, studentId) {
    const { error } = await supabase.from('payer_links').upsert(
      { payer_name: payment.name, student_id: studentId },
      { onConflict: 'payer_name,student_id' }
    )
    if (error) { alert('Error saving link: ' + error.message); return }
    setPayerLinks(prev => {
      const exists = prev.some(l => normalizeName(l.payer_name) === normalizeName(payment.name) && l.student_id === studentId)
      return exists ? prev : [...prev, { payer_name: payment.name, student_id: studentId }]
    })
    setSelectedPaymentIdx(null)
  }

  async function unlinkPayment(payerName, studentId) {
    const { error } = await supabase.from('payer_links').delete().eq('payer_name', payerName).eq('student_id', studentId)
    if (error) { alert('Error removing link: ' + error.message); return }
    setPayerLinks(prev => prev.filter(l => !(l.payer_name === payerName && l.student_id === studentId)))
  }

  return (
    <div>
      <div className="page-header">
        <h1>CRM</h1>
        <p>Standing orders, and more to come</p>
      </div>

      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border)', marginBottom: 20 }}>
        <button onClick={() => { setTab('standing_orders'); ensureLoaded() }} style={{
          padding: '8px 16px', fontSize: 13, border: 'none', background: 'none', cursor: 'pointer',
          borderBottom: `2px solid ${tab === 'standing_orders' ? 'var(--text)' : 'transparent'}`,
          color: tab === 'standing_orders' ? 'var(--text)' : 'var(--text-secondary)',
          fontWeight: tab === 'standing_orders' ? 500 : 400,
        }}>Standing orders</button>
      </div>

      {tab === 'standing_orders' && (
        <div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            {[
              { key: 'all', label: 'All' },
              { key: 'krcentre_pka', label: 'KR Centre PKA' },
              { key: 'derbymoore', label: 'Derby Moore' },
              { key: 'moorways', label: 'Moorways' },
              { key: 'krba', label: 'KRBA' },
            ].map(f => (
              <button key={f.key} className="btn btn-sm"
                onClick={() => setVenueFilter(f.key)}
                style={{
                  fontWeight: venueFilter === f.key ? 600 : 400,
                  background: venueFilter === f.key ? 'var(--text)' : undefined,
                  color: venueFilter === f.key ? 'var(--bg)' : undefined,
                }}>
                {f.label}
              </button>
            ))}
          </div>

          <div className="card" style={{ marginBottom: 16 }}>
            <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>Upload payment list</h2>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 }}>
              Upload an Excel export of standing order/payment names. It's cross-checked against active students —
              a match means paid. Names that don't match a student (e.g. a parent's name) show up below so you can
              link them manually once; that link is remembered for every future upload.
            </p>
            <input type="file" accept=".xlsx,.xls" onChange={handleFile} />
            {payments.length > 0 && (
              <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 8, display: 'flex', alignItems: 'center', gap: 10 }}>
                {payments.length} payments loaded · {matchedStudentIds.size} matched · {unmatchedPayments.length} unmatched
                <button className="btn btn-sm" onClick={clearPayments}>✕ Clear</button>
              </p>
            )}
          </div>

          {loading ? <p>Loading…</p> : payments.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 20 }}>
              <div className="card">
                <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>💳 Unmatched payments ({unmatchedPayments.length})</h3>
                <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 10 }}>
                  Drag onto a student, or click one here then click a student, to link them
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {unmatchedPayments.length === 0 ? (
                    <p style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Everything matched 🎉</p>
                  ) : unmatchedPayments.map((p, i) => (
                    <div key={i} draggable
                      onDragStart={() => setDraggedPayment(p)} onDragEnd={() => setDraggedPayment(null)}
                      onClick={() => setSelectedPaymentIdx(selectedPaymentIdx === i ? null : i)}
                      style={{
                        padding: '8px 10px', borderRadius: 'var(--radius)', cursor: 'pointer',
                        background: selectedPaymentIdx === i ? '#378ADD20' : 'var(--bg-secondary)',
                        border: selectedPaymentIdx === i ? '2px solid #378ADD' : '1px dashed var(--border-strong)',
                      }}>
                      <span style={{ fontSize: 13, fontWeight: 600 }}>{p.name}</span>
                      {p.amount != null && <span style={{ fontSize: 12, color: 'var(--text-tertiary)', marginLeft: 8 }}>{p.amount}</span>}
                      {selectedPaymentIdx === i && <div style={{ fontSize: 10, color: '#378ADD', marginTop: 2 }}>Selected — click a student on the right →</div>}
                    </div>
                  ))}
                </div>
              </div>

              <div className="card">
                <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>🚫 Students not paid ({unpaidStudents.length})</h3>
                <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 10 }}>
                  {selectedPaymentIdx != null ? 'Click a student to link the selected payment' : 'Drop an unmatched payment here to link'}
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {unpaidStudents.length === 0 ? (
                    <p style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Everyone's paid 🎉</p>
                  ) : unpaidStudents.map(s => (
                    <div key={s.id}
                      onDragOver={e => { e.preventDefault(); setDragOverStudentId(s.id) }}
                      onDragLeave={() => setDragOverStudentId(null)}
                      onDrop={e => { e.preventDefault(); if (draggedPayment) linkPayment(draggedPayment, s.id); setDragOverStudentId(null) }}
                      onClick={() => { if (selectedPaymentIdx != null) linkPayment(unmatchedPayments[selectedPaymentIdx], s.id) }}
                      style={{
                        padding: '8px 10px', borderRadius: 'var(--radius)', cursor: selectedPaymentIdx != null ? 'pointer' : 'default',
                        background: dragOverStudentId === s.id ? '#1D9E7520' : 'var(--bg-secondary)',
                        border: dragOverStudentId === s.id ? '2px solid #1D9E75' : '1px solid transparent',
                      }}>
                      <span style={{ fontSize: 13, fontWeight: 600 }}>{studentFullName(s)}</span>
                      <span style={{ fontSize: 11, color: 'var(--text-tertiary)', marginLeft: 8 }}>{s.student_ref}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="card">
                <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>✅ Paid students ({paidStudents.length})</h3>
                <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 10 }}>Matched against this upload</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {paidStudents.length === 0 ? (
                    <p style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>No matches yet</p>
                  ) : paidStudents.map(s => {
                    const matchedPayments = paymentsByStudentId[s.id] || []
                    // Only manually-created payer_links can be unlinked --
                    // a direct name match has nothing stored to remove,
                    // it would just re-match immediately anyway.
                    const isManualLink = payment => payerLinks.some(l => normalizeName(l.payer_name) === normalizeName(payment.name) && l.student_id === s.id)
                    return (
                      <div key={s.id} style={{ padding: '8px 10px', borderRadius: 'var(--radius)', background: '#1D9E7512' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: 13, fontWeight: 600 }}>{studentFullName(s)}</span>
                          <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{s.student_ref}</span>
                        </div>
                        {matchedPayments.map((p, i) => (
                          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4, paddingTop: 4, borderTop: i === 0 ? '1px solid #1D9E7530' : 'none' }}>
                            <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                              💳 {p.name}{p.amount != null ? ` — ${p.amount}` : ''}
                            </span>
                            {isManualLink(p) && (
                              <button className="btn btn-sm" style={{ fontSize: 10, padding: '2px 8px' }}
                                onClick={() => unlinkPayment(p.name, s.id)}>Unlink</button>
                            )}
                          </div>
                        ))}
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
