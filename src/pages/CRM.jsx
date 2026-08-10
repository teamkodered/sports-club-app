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
  // Turn anything that isn't a letter into a SPACE (not delete it) so
  // hyphenated names like "Ellis-Jay" split into separate words instead
  // of getting squashed into "ellisjay" -- a bank export writing it as
  // "Ellis Jay" would otherwise never be able to match.
  return (s || '').toString().trim().toLowerCase().replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim()
}

const TITLE_WORDS = new Set(['mr', 'mrs', 'miss', 'ms', 'mx', 'dr'])

function wordsOf(s) {
  return normalizeName(s).split(' ').filter(w => w && !TITLE_WORDS.has(w))
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
  const [missedTraining, setMissedTraining] = useState([]) // computed list, loaded on first visit to that tab
  const [missedTrainingLoaded, setMissedTrainingLoaded] = useState(false)
  const [missedTrainingLoading, setMissedTrainingLoading] = useState(false)
  const [selectedMissed, setSelectedMissed] = useState(new Set())
  const [autoSendMissedTraining, setAutoSendMissedTraining] = useState(false)
  const [birthdays, setBirthdays] = useState([]) // computed list, loaded on first visit to that tab
  const [birthdaysLoaded, setBirthdaysLoaded] = useState(false)
  const [selectedBirthdays, setSelectedBirthdays] = useState(new Set())
  const [autoSendBirthdays, setAutoSendBirthdays] = useState(false)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    const [{ data: s }, { data: pl }] = await Promise.all([
      supabase.from('students').select('id, student_ref, discipline, class_schedule, members(first_name, last_name, status, email, phone, date_of_birth)'),
      supabase.from('payer_links').select('*'),
    ])
    setStudents((s || []).filter(x => x.members?.status === 'active'))
    setPayerLinks(pl || [])
    setLoading(false)
  }

  // "Missed training" = an active student with at least one assigned
  // class, whose most recent attendance record (of any class) is 28+
  // days ago -- or who has never attended at all despite being active
  // for 28+ days. Loaded on first visit to the tab, not on every page
  // load, since it's a heavier set of queries than the standing orders
  // check.
  async function loadMissedTraining() {
    setMissedTrainingLoading(true)
    const [{ data: assignments }, { data: attendance }] = await Promise.all([
      supabase.from('student_class_assignments').select('student_id'),
      supabase.from('attendance').select('student_id, session_date').order('session_date', { ascending: false }),
    ])
    const assignedStudentIds = new Set((assignments || []).map(a => a.student_id))
    const lastAttendedByStudent = {}
    ;(attendance || []).forEach(a => {
      if (!lastAttendedByStudent[a.student_id]) lastAttendedByStudent[a.student_id] = a.session_date
    })
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - 28)
    const cutoffStr = cutoff.toISOString().split('T')[0]

    const results = students
      .filter(s => assignedStudentIds.has(s.id))
      .map(s => {
        const lastDate = lastAttendedByStudent[s.id] || null
        if (lastDate && lastDate >= cutoffStr) return null // trained recently, not missing
        const weeksMissed = lastDate
          ? Math.floor((Date.now() - new Date(lastDate).getTime()) / (7 * 24 * 60 * 60 * 1000))
          : null // never attended at all
        return { student: s, lastDate, weeksMissed }
      })
      .filter(Boolean)
      .sort((a, b) => (b.weeksMissed ?? 999) - (a.weeksMissed ?? 999))

    setMissedTraining(results)
    setMissedTrainingLoaded(true)
    setMissedTrainingLoading(false)
  }

  // Upcoming birthdays -- any active student whose next birthday
  // (this year, or next year if it's already passed) falls within the
  // next 28 days. Purely computed from date_of_birth already loaded
  // with students, so no extra queries needed.
  function loadBirthdays() {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const results = students
      .map(s => {
        const dob = s.members?.date_of_birth
        if (!dob) return null
        const birth = new Date(dob + 'T00:00:00')
        let next = new Date(today.getFullYear(), birth.getMonth(), birth.getDate())
        if (next < today) next = new Date(today.getFullYear() + 1, birth.getMonth(), birth.getDate())
        const daysUntil = Math.round((next - today) / (24 * 60 * 60 * 1000))
        if (daysUntil > 28) return null
        const turningAge = next.getFullYear() - birth.getFullYear()
        return { student: s, nextBirthday: next, daysUntil, turningAge }
      })
      .filter(Boolean)
      .sort((a, b) => a.daysUntil - b.daysUntil)
    setBirthdays(results)
    setBirthdaysLoaded(true)
  }

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

  // Removes a single transaction from the list -- for bank-export noise
  // (Netflix, Uber Eats, DVLA, Capquest, etc.) or anything else that was
  // never a student payment. Only affects this uploaded file's display;
  // it doesn't touch any stored data, so re-uploading the same export
  // later brings it back (nothing to "undo" otherwise, and no risk of
  // accidentally suppressing a real payment for good).
  function removePayment(idx) {
    setPayments(prev => prev.filter((_, i) => i !== idx))
    // Any payment after this one shifts down by one index once the
    // array is filtered, so a stale selectedPaymentIdx could end up
    // pointing at the wrong transaction -- always clear it here.
    setSelectedPaymentIdx(null)
  }

  function studentFullName(s) {
    return `${s.members?.first_name || ''} ${s.members?.last_name || ''}`.trim()
  }

  // Matching: payer_links (remembered) first -- a payer name can now
  // link to MULTIPLE students (e.g. one payment covering two
  // children) -- then a name-based match against the roster as a
  // fallback, checked in decreasing order of confidence:
  //
  //  1. Exact full-name match.
  //  2. "Name parts present" - every word of the student's first name
  //     AND every word of their last name shows up somewhere in the
  //     payment text (exact word match, or as a substring inside a
  //     longer glued-together word e.g. "Piorkowskifp" contains
  //     "piorkowski", "Jaxonbrowning" contains both "jaxon" and
  //     "browning"). This is order-independent and handles bank
  //     formats like "Surname Initial ChildFirstName Fp", reordered
  //     names, middle initials, and concatenated/truncated suffixes.
  //  3. Unique surname fallback - if a whole word in the payment
  //     matches exactly one active student's surname (no one else
  //     shares it), that's enough on its own - covers payments that
  //     give a surname and only an initial, never a spelled-out first
  //     name (e.g. "Mazur M Fp L").
  //  4. Unique first-name fallback - same idea for first names, with a
  //     slightly higher length threshold since first names repeat more
  //     often across a large roster.
  //
  // In every case, if more than one active student could plausibly
  // match, it's left unmatched rather than risk linking the wrong
  // person - those go through the manual link flow, which is
  // remembered for every future upload.
  const linksByPayerName = {}
  const excludedByPayerName = {} // payer name -> Set of student_ids explicitly rejected as wrong for that payment
  for (const l of payerLinks) {
    const n = normalizeName(l.payer_name)
    if (l.excluded) (excludedByPayerName[n] ||= new Set()).add(l.student_id)
    else (linksByPayerName[n] ||= []).push(l.student_id)
  }
  const studentByNormalizedName = Object.fromEntries(students.map(s => [normalizeName(studentFullName(s)), s.id]))
  const firstNameCounts = {}
  const lastNameCounts = {}
  for (const s of students) {
    const fn = normalizeName(s.members?.first_name)
    const ln = normalizeName(s.members?.last_name)
    if (fn) firstNameCounts[fn] = (firstNameCounts[fn] || 0) + 1
    if (ln) lastNameCounts[ln] = (lastNameCounts[ln] || 0) + 1
  }

  // A name part (a single word from a first or last name) counts as
  // "present" in a payment if it appears as a whole word, or as a
  // substring inside a longer word that's clearly a glued-together
  // concatenation (only for name parts of 4+ letters, to avoid short
  // words spuriously matching inside unrelated text).
  function namePartPresent(part, paymentWordSet) {
    if (paymentWordSet.has(part)) return true
    if (part.length >= 4) {
      for (const w of paymentWordSet) {
        if (w.length > part.length && w.includes(part)) return true
      }
    }
    return false
  }

  function matchStudentIdsForPayment(payment) {
    const n = normalizeName(payment.name)
    if (linksByPayerName[n]?.length) return linksByPayerName[n]

    const excluded = excludedByPayerName[n]
    const dropExcluded = list => excluded ? list.filter(s => !excluded.has(s.id)) : list

    if (studentByNormalizedName[n]) {
      const sid = studentByNormalizedName[n]
      return excluded?.has(sid) ? [] : [sid]
    }

    const paymentWords = wordsOf(payment.name)
    const paymentWordSet = new Set(paymentWords)

    const nameCandidates = dropExcluded(students.filter(s => {
      const fw = wordsOf(s.members?.first_name)
      const lw = wordsOf(s.members?.last_name)
      if (!fw.length || !lw.length) return false
      return fw.every(w => namePartPresent(w, paymentWordSet)) && lw.every(w => namePartPresent(w, paymentWordSet))
    }))
    if (nameCandidates.length === 1) return [nameCandidates[0].id]

    if (!nameCandidates.length) {
      const surnameCandidates = []
      for (const w of paymentWordSet) {
        if (w.length >= 3 && lastNameCounts[w] === 1) {
          surnameCandidates.push(...students.filter(s => normalizeName(s.members?.last_name) === w))
        }
      }
      const filtered = dropExcluded(surnameCandidates)
      if (filtered.length === 1) return [filtered[0].id]
    }

    if (!nameCandidates.length) {
      const firstNameCandidates = []
      for (const w of paymentWordSet) {
        if (w.length >= 4 && firstNameCounts[w] === 1) {
          firstNameCandidates.push(...students.filter(s => normalizeName(s.members?.first_name) === w))
        }
      }
      const filtered = dropExcluded(firstNameCandidates)
      if (filtered.length === 1) return [filtered[0].id]
    }

    return []
  }

  // Map of studentId -> the payment(s) that matched them, so the
  // Paid students card can show what payment they're linked to.
  // Each entry keeps the payment's index in the master `payments`
  // array (not a filtered-list index) so a payment can be selected
  // for linking whether it's showing up as unmatched OR already
  // matched to someone else -- this is what makes it possible to
  // link ONE payment to MULTIPLE students (e.g. a parent paying for
  // several siblings in one standing order).
  const paymentsByStudentId = {}
  const unmatchedPayments = []
  payments.forEach((p, idx) => {
    const sids = matchStudentIdsForPayment(p)
    if (sids.length) sids.forEach(sid => (paymentsByStudentId[sid] ||= []).push({ payment: p, idx }))
    else unmatchedPayments.push({ payment: p, idx })
  })
  const matchedStudentIds = new Set(Object.keys(paymentsByStudentId))
  const sortByName = (a, b) => studentFullName(a).localeCompare(studentFullName(b))
  const unpaidStudents = venueFilteredStudents.filter(s => !matchedStudentIds.has(s.id)).sort(sortByName)
  const paidStudents = venueFilteredStudents.filter(s => matchedStudentIds.has(s.id)).sort(sortByName)

  async function linkPayment(payment, studentId) {
    // excluded: false explicitly clears any earlier "this isn't right"
    // rejection stored against this exact payment+student pairing, so
    // re-linking after a mistaken exclusion works correctly.
    const { error } = await supabase.from('payer_links').upsert(
      { payer_name: payment.name, student_id: studentId, excluded: false },
      { onConflict: 'payer_name,student_id' }
    )
    if (error) { alert('Error saving link: ' + error.message); return }
    setPayerLinks(prev => {
      const others = prev.filter(l => !(l.payer_name === payment.name && l.student_id === studentId))
      return [...others, { payer_name: payment.name, student_id: studentId, excluded: false }]
    })
    setSelectedPaymentIdx(null)
  }

  async function unlinkPayment(payerName, studentId) {
    const { error } = await supabase.from('payer_links').delete().eq('payer_name', payerName).eq('student_id', studentId)
    if (error) { alert('Error removing link: ' + error.message); return }
    setPayerLinks(prev => prev.filter(l => !(l.payer_name === payerName && l.student_id === studentId)))
  }

  // For an AUTOMATIC match (not a manually-created link) there's nothing
  // to delete -- the pairing was never stored anywhere, it's recomputed
  // fresh from the matching rules every render. So "this is wrong" has to
  // be recorded as an explicit rejection instead, which the matcher then
  // knows to skip for that exact payment name going forward.
  async function rejectAutoMatch(payment, studentId) {
    const { error } = await supabase.from('payer_links').upsert(
      { payer_name: payment.name, student_id: studentId, excluded: true },
      { onConflict: 'payer_name,student_id' }
    )
    if (error) { alert('Error saving rejection: ' + error.message); return }
    setPayerLinks(prev => {
      const others = prev.filter(l => !(l.payer_name === payment.name && l.student_id === studentId))
      return [...others, { payer_name: payment.name, student_id: studentId, excluded: true }]
    })
  }

  return (
    <div>
      <div className="page-header">
        <h1>CRM</h1>
        <p>Standing orders, and more to come</p>
      </div>

      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border)', marginBottom: 20 }}>
        <button onClick={() => setTab('standing_orders')} style={{
          padding: '8px 16px', fontSize: 13, border: 'none', background: 'none', cursor: 'pointer',
          borderBottom: `2px solid ${tab === 'standing_orders' ? 'var(--text)' : 'transparent'}`,
          color: tab === 'standing_orders' ? 'var(--text)' : 'var(--text-secondary)',
          fontWeight: tab === 'standing_orders' ? 500 : 400,
        }}>Standing orders</button>
        <button onClick={() => { setTab('missed_training'); if (!missedTrainingLoaded) loadMissedTraining() }} style={{
          padding: '8px 16px', fontSize: 13, border: 'none', background: 'none', cursor: 'pointer',
          borderBottom: `2px solid ${tab === 'missed_training' ? 'var(--text)' : 'transparent'}`,
          color: tab === 'missed_training' ? 'var(--text)' : 'var(--text-secondary)',
          fontWeight: tab === 'missed_training' ? 500 : 400,
        }}>Missed training{missedTraining.length > 0 ? ` (${missedTraining.length})` : ''}</button>
        <button onClick={() => { setTab('birthdays'); if (!birthdaysLoaded) loadBirthdays() }} style={{
          padding: '8px 16px', fontSize: 13, border: 'none', background: 'none', cursor: 'pointer',
          borderBottom: `2px solid ${tab === 'birthdays' ? 'var(--text)' : 'transparent'}`,
          color: tab === 'birthdays' ? 'var(--text)' : 'var(--text-secondary)',
          fontWeight: tab === 'birthdays' ? 500 : 400,
        }}>Birthdays{birthdays.length > 0 ? ` (${birthdays.length})` : ''}</button>
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
              a match means paid. Names that don't match a student (e.g. a parent's name, or a typo in the bank
              export) show up below so you can link them manually once; that link is remembered for every future
              upload. One payment can also be linked to more than one student — use "+ Link another student" on
              a paid student's card for payments that cover several siblings.
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
                  ) : unmatchedPayments.map(({ payment: p, idx }) => (
                    <div key={idx} draggable
                      onDragStart={() => setDraggedPayment(p)} onDragEnd={() => setDraggedPayment(null)}
                      onClick={() => setSelectedPaymentIdx(selectedPaymentIdx === idx ? null : idx)}
                      style={{
                        padding: '8px 10px', borderRadius: 'var(--radius)', cursor: 'pointer',
                        background: selectedPaymentIdx === idx ? '#378ADD20' : 'var(--bg-secondary)',
                        border: selectedPaymentIdx === idx ? '2px solid #378ADD' : '1px dashed var(--border-strong)',
                        display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8,
                      }}>
                      <div>
                        <span style={{ fontSize: 13, fontWeight: 600 }}>{p.name}</span>
                        {p.amount != null && <span style={{ fontSize: 12, color: 'var(--text-tertiary)', marginLeft: 8 }}>{p.amount}</span>}
                        {selectedPaymentIdx === idx && <div style={{ fontSize: 10, color: '#378ADD', marginTop: 2 }}>Selected — click a student on the right →</div>}
                      </div>
                      <button
                        title="Not a student payment / not needed here"
                        onClick={e => { e.stopPropagation(); removePayment(idx) }}
                        style={{
                          border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-tertiary)',
                          fontSize: 14, lineHeight: 1, padding: '2px 4px', flexShrink: 0,
                        }}>✕</button>
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
                      onClick={() => { if (selectedPaymentIdx != null) linkPayment(payments[selectedPaymentIdx], s.id) }}
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
                        {matchedPayments.map(({ payment: p, idx }) => (
                          <div key={idx} style={{ marginTop: 4, paddingTop: 4, borderTop: idx === matchedPayments[0].idx ? '1px solid #1D9E7530' : 'none' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                                💳 {p.name}{p.amount != null ? ` — ${p.amount}` : ''}
                              </span>
                              {isManualLink(p) ? (
                                <button className="btn btn-sm" style={{ fontSize: 10, padding: '2px 8px' }}
                                  onClick={() => unlinkPayment(p.name, s.id)}>Unlink</button>
                              ) : (
                                <button className="btn btn-sm" style={{ fontSize: 10, padding: '2px 8px' }}
                                  title="This was matched automatically. Use this if it's the wrong student — it won't be suggested for this payment again."
                                  onClick={() => rejectAutoMatch(p, s.id)}>Wrong student ✕</button>
                              )}
                            </div>
                            {/* Lets one payment be linked to MORE than one student --
                                e.g. a single standing order covering several siblings.
                                Selecting here re-uses the same click-a-student flow as
                                unmatched payments, just seeded with this payment's index. */}
                            <button className="btn btn-sm" style={{ fontSize: 10, padding: '2px 8px', marginTop: 2 }}
                              onClick={() => setSelectedPaymentIdx(selectedPaymentIdx === idx ? null : idx)}>
                              {selectedPaymentIdx === idx ? 'Selected — click another student →' : '+ Link another student to this payment'}
                            </button>
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

      {tab === 'missed_training' && (
        <div>
          <div className="card" style={{ marginBottom: 16 }}>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 10 }}>
              Active students with an assigned class who haven't attended anything in 4+ weeks (28 days) — or have never attended at all.
            </p>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, opacity: 0.6 }}>
              <input type="checkbox" checked={autoSendMissedTraining} disabled onChange={() => {}} />
              Auto-send a reminder automatically
              <span style={{ fontStyle: 'italic' }}>— needs an email/SMS service connected first (not set up yet); manual send below works now</span>
            </label>
          </div>

          {missedTrainingLoading ? (
            <div className="loading">Loading…</div>
          ) : missedTraining.length === 0 ? (
            <div className="empty-state"><h3>Nobody's missing training</h3><p>Every assigned, active student has trained within the last 4 weeks.</p></div>
          ) : (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
                <button className="btn btn-sm" onClick={() => setSelectedMissed(
                  selectedMissed.size === missedTraining.length ? new Set() : new Set(missedTraining.map(r => r.student.id))
                )}>
                  {selectedMissed.size === missedTraining.length ? 'Deselect all' : 'Select all'}
                </button>
                {selectedMissed.size > 0 && (() => {
                  const selectedRows = missedTraining.filter(r => selectedMissed.has(r.student.id))
                  const emails = selectedRows.map(r => r.student.members?.email).filter(e => e && !e.includes('@kr-centre.placeholder'))
                  const subject = encodeURIComponent("We've missed you at training!")
                  const body = encodeURIComponent("Hi,\n\nWe noticed it's been a few weeks since your last session — we'd love to see you back on the mats/in the ring soon!\n\nLet us know if there's anything stopping you from training, we're happy to help.\n\nSee you soon,\nKR Centre")
                  return (
                    <div style={{ display: 'flex', gap: 8 }}>
                      <span style={{ fontSize: 12, color: 'var(--text-tertiary)', alignSelf: 'center' }}>{selectedMissed.size} selected</span>
                      <a className="btn btn-sm btn-primary" href={emails.length ? `mailto:?bcc=${emails.join(',')}&subject=${subject}&body=${body}` : undefined}
                        onClick={e => { if (!emails.length) { e.preventDefault(); alert('None of the selected students have a real email on file.') } }}>
                        ✉️ Email selected ({emails.length})
                      </a>
                    </div>
                  )
                })()}
              </div>
              <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
                <table>
                  <thead><tr>
                    <th style={{ width: 30 }}></th>
                    <th>Student</th>
                    <th>Last attended</th>
                    <th>Weeks missed</th>
                    <th>Contact</th>
                  </tr></thead>
                  <tbody>
                    {missedTraining.map(r => {
                      const m = r.student.members
                      const email = m?.email && !m.email.includes('@kr-centre.placeholder') ? m.email : null
                      const phone = m?.phone
                      const smsBody = encodeURIComponent(`Hi ${m?.first_name}, we've missed you at training — it's been a few weeks since your last session. Hope to see you back soon! - KR Centre`)
                      return (
                        <tr key={r.student.id}>
                          <td><input type="checkbox" checked={selectedMissed.has(r.student.id)}
                            onChange={() => setSelectedMissed(prev => {
                              const next = new Set(prev)
                              next.has(r.student.id) ? next.delete(r.student.id) : next.add(r.student.id)
                              return next
                            })} /></td>
                          <td style={{ fontSize: 13 }}>{m?.first_name} {m?.last_name}</td>
                          <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{r.lastDate ? new Date(r.lastDate).toLocaleDateString('en-GB') : 'Never'}</td>
                          <td style={{ fontSize: 13, fontWeight: 600, color: '#E24B4A' }}>{r.weeksMissed ?? '—'}</td>
                          <td>
                            <div style={{ display: 'flex', gap: 6 }}>
                              <a className="btn btn-sm" style={{ fontSize: 11 }} href={email ? `mailto:${email}?subject=We've%20missed%20you!&body=${smsBody}` : undefined}
                                onClick={e => { if (!email) e.preventDefault() }}
                                title={email || 'No real email on file'}>✉️</a>
                              <a className="btn btn-sm" style={{ fontSize: 11 }} href={phone ? `sms:${phone.replace(/\s/g,'')}?body=${smsBody}` : undefined}
                                onClick={e => { if (!phone) e.preventDefault() }}
                                title={phone || 'No phone on file'}>📱</a>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {tab === 'birthdays' && (
        <div>
          <div className="card" style={{ marginBottom: 16 }}>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 10 }}>
              Active students with a birthday in the next 4 weeks.
            </p>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, opacity: 0.6 }}>
              <input type="checkbox" checked={autoSendBirthdays} disabled onChange={() => {}} />
              Auto-send a birthday message on the morning of their birthday
              <span style={{ fontStyle: 'italic' }}>— needs an email/SMS service + a daily scheduled job (not set up yet); manual send below works now</span>
            </label>
          </div>

          {birthdays.length === 0 ? (
            <div className="empty-state"><h3>No birthdays in the next 4 weeks</h3></div>
          ) : (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
                <button className="btn btn-sm" onClick={() => setSelectedBirthdays(
                  selectedBirthdays.size === birthdays.length ? new Set() : new Set(birthdays.map(r => r.student.id))
                )}>
                  {selectedBirthdays.size === birthdays.length ? 'Deselect all' : 'Select all'}
                </button>
                {selectedBirthdays.size > 0 && (() => {
                  const selectedRows = birthdays.filter(r => selectedBirthdays.has(r.student.id))
                  const emails = selectedRows.map(r => r.student.members?.email).filter(e => e && !e.includes('@kr-centre.placeholder'))
                  const subject = encodeURIComponent('Happy Birthday!')
                  const body = encodeURIComponent("Hi,\n\nWishing you a very happy birthday from everyone at KR Centre! Hope you have a great day.\n\nSee you at training soon,\nKR Centre")
                  return (
                    <div style={{ display: 'flex', gap: 8 }}>
                      <span style={{ fontSize: 12, color: 'var(--text-tertiary)', alignSelf: 'center' }}>{selectedBirthdays.size} selected</span>
                      <a className="btn btn-sm btn-primary" href={emails.length ? `mailto:?bcc=${emails.join(',')}&subject=${subject}&body=${body}` : undefined}
                        onClick={e => { if (!emails.length) { e.preventDefault(); alert('None of the selected students have a real email on file.') } }}>
                        ✉️ Email selected ({emails.length})
                      </a>
                    </div>
                  )
                })()}
              </div>
              <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
                <table>
                  <thead><tr>
                    <th style={{ width: 30 }}></th>
                    <th>Student</th>
                    <th>Birthday</th>
                    <th>Turning</th>
                    <th>Contact</th>
                  </tr></thead>
                  <tbody>
                    {birthdays.map(r => {
                      const m = r.student.members
                      const email = m?.email && !m.email.includes('@kr-centre.placeholder') ? m.email : null
                      const phone = m?.phone
                      const whenLabel = r.daysUntil === 0 ? 'Today! 🎉' : r.daysUntil === 1 ? 'Tomorrow' : `In ${r.daysUntil} days`
                      const msgBody = encodeURIComponent(`Hi ${m?.first_name}, happy birthday from everyone at KR Centre! Hope you have a great day 🎉`)
                      return (
                        <tr key={r.student.id}>
                          <td><input type="checkbox" checked={selectedBirthdays.has(r.student.id)}
                            onChange={() => setSelectedBirthdays(prev => {
                              const next = new Set(prev)
                              next.has(r.student.id) ? next.delete(r.student.id) : next.add(r.student.id)
                              return next
                            })} /></td>
                          <td style={{ fontSize: 13 }}>{m?.first_name} {m?.last_name}</td>
                          <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                            {r.nextBirthday.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} — {whenLabel}
                          </td>
                          <td style={{ fontSize: 13, fontWeight: 600, color: '#EF9F27' }}>{r.turningAge}</td>
                          <td>
                            <div style={{ display: 'flex', gap: 6 }}>
                              <a className="btn btn-sm" style={{ fontSize: 11 }} href={email ? `mailto:${email}?subject=Happy%20Birthday!&body=${msgBody}` : undefined}
                                onClick={e => { if (!email) e.preventDefault() }}
                                title={email || 'No real email on file'}>✉️</a>
                              <a className="btn btn-sm" style={{ fontSize: 11 }} href={phone ? `sms:${phone.replace(/\s/g,'')}?body=${msgBody}` : undefined}
                                onClick={e => { if (!phone) e.preventDefault() }}
                                title={phone || 'No phone on file'}>📱</a>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
