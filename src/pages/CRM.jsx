import { useState } from 'react'
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
  const [loaded, setLoaded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [draggedPayment, setDraggedPayment] = useState(null)
  const [dragOverStudentId, setDragOverStudentId] = useState(null)

  async function ensureLoaded() {
    if (loaded) return
    setLoading(true)
    const [{ data: s }, { data: pl }] = await Promise.all([
      supabase.from('students').select('id, student_ref, members(first_name, last_name, status)'),
      supabase.from('payer_links').select('*'),
    ])
    setStudents((s || []).filter(x => x.members?.status === 'active'))
    setPayerLinks(pl || [])
    setLoaded(true)
    setLoading(false)
  }

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
  }

  function studentFullName(s) {
    return `${s.members?.first_name || ''} ${s.members?.last_name || ''}`.trim()
  }

  // Matching: payer_links (remembered) first, then a direct
  // normalized name match against a student's own name.
  const linkedByPayerName = Object.fromEntries(payerLinks.map(l => [normalizeName(l.payer_name), l.student_id]))
  const studentByNormalizedName = Object.fromEntries(students.map(s => [normalizeName(studentFullName(s)), s.id]))

  function matchStudentIdForPayment(payment) {
    const n = normalizeName(payment.name)
    if (linkedByPayerName[n]) return linkedByPayerName[n]
    if (studentByNormalizedName[n]) return studentByNormalizedName[n]
    // loose contains-match as a fallback (e.g. "J Smith" vs "John Smith")
    const found = students.find(s => {
      const sn = normalizeName(studentFullName(s))
      return sn && (n.includes(sn) || sn.includes(n))
    })
    return found?.id || null
  }

  const matchedStudentIds = new Set()
  const unmatchedPayments = []
  for (const p of payments) {
    const sid = matchStudentIdForPayment(p)
    if (sid) matchedStudentIds.add(sid)
    else unmatchedPayments.push(p)
  }
  const unpaidStudents = students.filter(s => !matchedStudentIds.has(s.id))

  async function linkPayment(payment, studentId) {
    const { error } = await supabase.from('payer_links').upsert(
      { payer_name: payment.name, student_id: studentId },
      { onConflict: 'payer_name' }
    )
    if (error) { alert('Error saving link: ' + error.message); return }
    setPayerLinks(prev => [...prev.filter(l => normalizeName(l.payer_name) !== normalizeName(payment.name)), { payer_name: payment.name, student_id: studentId }])
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
          <div className="card" style={{ marginBottom: 16 }}>
            <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>Upload payment list</h2>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 }}>
              Upload an Excel export of standing order/payment names. It's cross-checked against active students —
              a match means paid. Names that don't match a student (e.g. a parent's name) show up below so you can
              link them manually once; that link is remembered for every future upload.
            </p>
            <input type="file" accept=".xlsx,.xls" onChange={handleFile} />
            {payments.length > 0 && <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 8 }}>{payments.length} payments loaded · {matchedStudentIds.size} matched · {unmatchedPayments.length} unmatched</p>}
          </div>

          {loading ? <p>Loading…</p> : payments.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
              <div className="card">
                <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>💳 Unmatched payments ({unmatchedPayments.length})</h3>
                <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 10 }}>Drag onto a student on the right to link them</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {unmatchedPayments.length === 0 ? (
                    <p style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Everything matched 🎉</p>
                  ) : unmatchedPayments.map((p, i) => (
                    <div key={i} draggable onDragStart={() => setDraggedPayment(p)} onDragEnd={() => setDraggedPayment(null)}
                      style={{ padding: '8px 10px', background: 'var(--bg-secondary)', borderRadius: 'var(--radius)', cursor: 'grab', border: '1px dashed var(--border-strong)' }}>
                      <span style={{ fontSize: 13, fontWeight: 600 }}>{p.name}</span>
                      {p.amount != null && <span style={{ fontSize: 12, color: 'var(--text-tertiary)', marginLeft: 8 }}>{p.amount}</span>}
                    </div>
                  ))}
                </div>
              </div>

              <div className="card">
                <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>🚫 Students not paid ({unpaidStudents.length})</h3>
                <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 10 }}>Drop an unmatched payment here to link</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {unpaidStudents.length === 0 ? (
                    <p style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Everyone's paid 🎉</p>
                  ) : unpaidStudents.map(s => (
                    <div key={s.id}
                      onDragOver={e => { e.preventDefault(); setDragOverStudentId(s.id) }}
                      onDragLeave={() => setDragOverStudentId(null)}
                      onDrop={e => { e.preventDefault(); if (draggedPayment) linkPayment(draggedPayment, s.id); setDragOverStudentId(null) }}
                      style={{
                        padding: '8px 10px', borderRadius: 'var(--radius)',
                        background: dragOverStudentId === s.id ? '#1D9E7520' : 'var(--bg-secondary)',
                        border: dragOverStudentId === s.id ? '2px solid #1D9E75' : '1px solid transparent',
                      }}>
                      <span style={{ fontSize: 13, fontWeight: 600 }}>{studentFullName(s)}</span>
                      <span style={{ fontSize: 11, color: 'var(--text-tertiary)', marginLeft: 8 }}>{s.student_ref}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
