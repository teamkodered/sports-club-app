import { useState } from 'react'
import { supabase } from '../lib/supabase.js'
import * as XLSXModule from 'xlsx'
// See CRM.jsx for why this exists -- some bundlers wrap xlsx's exports
// under .default instead of directly on the namespace, and which one
// happens can differ between dev and production builds.
const XLSX = XLSXModule.utils ? XLSXModule : XLSXModule.default

// Mirrors PDP_SECTIONS in AthleteProfiles.jsx -- combines category +
// column type into one unambiguous human-readable label per section,
// since several sections share a bare label (e.g. "Notes" appears
// under Psychology, Technical, Tactical, Physical, and Skill).
const PDP_EXPORT_SECTIONS = [
  { key: 'winning_ways',          label: 'Winning ways' },
  { key: 'what_to_do',            label: 'What to do (general)' },
  { key: 'psychology_notes',      label: 'Psychology - Notes' },
  { key: 'psychology_maintain',   label: 'Psychology - Maintain' },
  { key: 'psychology_work_on',    label: 'Psychology - Work on' },
  { key: 'psychology_what_to_do', label: 'Psychology - To do' },
  { key: 'tech_notes',            label: 'Technical - Notes' },
  { key: 'tech_maintain',         label: 'Technical - Maintain' },
  { key: 'tech_work_on',          label: 'Technical - Work on' },
  { key: 'tech_what_to_do',       label: 'Technical - To do' },
  { key: 'tact_notes',            label: 'Tactical - Notes' },
  { key: 'tact_maintain',         label: 'Tactical - Maintain' },
  { key: 'tact_work_on',          label: 'Tactical - Work on' },
  { key: 'tact_what_to_do',       label: 'Tactical - To do' },
  { key: 'physical_notes',        label: 'Physical - Notes' },
  { key: 'physical_maintain',     label: 'Physical - Maintain' },
  { key: 'physical_work_on',      label: 'Physical - Work on' },
  { key: 'physical_what_to_do',   label: 'Physical - To do' },
  { key: 'skill_notes',           label: 'Skill - Notes' },
  { key: 'skill_maintain',        label: 'Skill - Maintain' },
  { key: 'skill_work_on',         label: 'Skill - Work on' },
  { key: 'skill_what_to_do',      label: 'Skill - To do' },
  { key: 'athlete_notes',         label: 'Your notes' },
  { key: 'notes',                 label: 'Coach notes' },
]
const PDP_SECTION_BY_LABEL = Object.fromEntries(PDP_EXPORT_SECTIONS.map(s => [s.label.toLowerCase(), s.key]))
const PDP_SECTION_BY_KEY = Object.fromEntries(PDP_EXPORT_SECTIONS.map(s => [s.key, s.label]))

export default function AdminImport() {
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState([])
  const [headers, setHeaders] = useState([])
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState(null)
  const [sheetUrl, setSheetUrl] = useState('')

  const [exportingPdp, setExportingPdp] = useState(false)
  const [pdpFile, setPdpFile] = useState(null)
  const [pdpPreview, setPdpPreview] = useState([])
  const [pdpImporting, setPdpImporting] = useState(false)
  const [pdpResult, setPdpResult] = useState(null)

  // Bulk membership-form-scan upload -- matches each selected file to a
  // student by name found in the filename, previews the match before
  // anything is actually uploaded (so mismatches can be caught and
  // fixed by hand first), and skips anyone who already has a scan
  // attached rather than silently overwriting it.
  const [scanFiles, setScanFiles] = useState([])
  const [scanMatches, setScanMatches] = useState([])
  const [scanMatching, setScanMatching] = useState(false)
  const [scanUploading, setScanUploading] = useState(false)
  const [scanResult, setScanResult] = useState(null)

  async function matchScanFiles(files) {
    setScanFiles(files)
    setScanResult(null)
    setScanMatching(true)
    const { data: students } = await supabase
      .from('students')
      .select('id, member_id, members(first_name, last_name)')
    const { data: existingForms } = await supabase.from('membership_forms').select('member_id, document_url')
    const hasDocByMemberId = new Set((existingForms || []).filter(f => f.document_url).map(f => f.member_id))

    const matches = files.map(file => {
      const nameLower = file.name.toLowerCase().replace(/[_\-.]/g, ' ')
      // Requires both first AND last name to appear somewhere in the
      // filename -- a first-name-only match is too likely to hit the
      // wrong person given how common many first names are. Normalizes
      // hyphens in the student's own name the same way the filename
      // was normalized above (e.g. "Rhule-Taylor" -> "rhule taylor"),
      // otherwise a hyphenated surname would never match, since the
      // filename's hyphens already became plain spaces.
      const candidates = (students || []).filter(s => {
        const first = (s.members?.first_name || '').toLowerCase().replace(/[_\-.]/g, ' ')
        const last = (s.members?.last_name || '').toLowerCase().replace(/[_\-.]/g, ' ')
        return first && last && nameLower.includes(first) && nameLower.includes(last)
      })
      const alreadyHasDoc = candidates.length === 1 && hasDocByMemberId.has(candidates[0].member_id)
      return {
        file,
        status: candidates.length === 1 ? (alreadyHasDoc ? 'already_has_scan' : 'matched') : candidates.length === 0 ? 'no_match' : 'ambiguous',
        student: candidates.length === 1 ? candidates[0] : null,
        candidateCount: candidates.length,
      }
    })

    // If several files all matched the same student (e.g. someone
    // submitted the same form multiple times, each upload getting its
    // own auto-numbered filename), only the most recently modified
    // one is actually kept as "matched" -- otherwise every one of them
    // would upload to storage in turn and silently overwrite the same
    // student's document link each time, wasting space on the earlier
    // ones for nothing while still keeping only the last.
    const byStudent = {}
    for (const m of matches) {
      if (m.status !== 'matched') continue
      const key = m.student.member_id
      if (!byStudent[key]) byStudent[key] = []
      byStudent[key].push(m)
    }
    for (const group of Object.values(byStudent)) {
      if (group.length <= 1) continue
      group.sort((a, b) => (b.file.lastModified || 0) - (a.file.lastModified || 0))
      for (const m of group.slice(1)) {
        m.status = 'duplicate_skipped'
        m.keptInstead = group[0].file.name
      }
    }
    setScanMatches(matches)
    setScanMatching(false)
  }

  // Strips accents (é -> e) and anything else Supabase Storage keys
  // don't allow (spaces, parentheses, etc.), since a raw filename like
  // "P.K.A Membership Application for (Tréon Martin).pdf" produced a
  // genuine "Invalid key" error on upload -- storage paths need to
  // stay to a safe, plain character set regardless of what the
  // original file was actually named.
  function safeStorageFilename(name) {
    return name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]/g, '_')
  }

  async function uploadMatchedScans() {
    setScanUploading(true)
    let success = 0, failed = 0
    const errors = []
    for (const m of scanMatches) {
      if (m.status !== 'matched') continue
      try {
        const path = `membership-forms/${m.student.member_id}-${Date.now()}-${safeStorageFilename(m.file.name)}`
        const { error: uploadErr } = await supabase.storage.from('athlete-media').upload(path, m.file)
        if (uploadErr) throw uploadErr
        const { data: urlData } = supabase.storage.from('athlete-media').getPublicUrl(path)
        // Fetches every row for this member rather than picking one
        // via a database-level ORDER BY -- sorting by submitted_at is
        // unreliable once any row has a null value there (which one
        // of a student's own rows commonly does), and picking the
        // wrong one here is exactly what created a genuine duplicate
        // row for at least one student instead of updating their real
        // existing one.
        const { data: existingRows } = await supabase.from('membership_forms').select('id, document_url').eq('member_id', m.student.member_id)
        const existing = (existingRows || []).find(f => f.document_url) || (existingRows || [])[0] || null
        if (existing?.id) {
          // .select() after an update returns the actual updated
          // row(s) -- an empty array here means the update genuinely
          // matched zero rows (e.g. a missing RLS update policy
          // silently blocking it), which Postgres/Supabase does NOT
          // treat as an error by default. Checking only for `error`
          // was exactly why every earlier attempt reported "success"
          // while nothing was actually ever saved.
          const { data: updated, error } = await supabase.from('membership_forms').update({ document_url: urlData.publicUrl }).eq('id', existing.id).select()
          if (error) throw error
          if (!updated || updated.length === 0) throw new Error('Update matched 0 rows (check RLS update policy on membership_forms)')
        } else {
          // form_type has a not-null constraint -- 'unknown' since a
          // scanned file on its own doesn't actually tell us which
          // form this genuinely was (unlike a proper structured
          // membership_forms row already carrying that information).
          const { error } = await supabase.from('membership_forms').insert({ member_id: m.student.member_id, form_type: 'unknown', document_url: urlData.publicUrl, submitted_at: new Date().toISOString() })
          if (error) throw error
        }
        success++
      } catch (err) {
        failed++
        errors.push(`${m.file.name}: ${err.message}`)
      }
    }
    setScanResult({ success, failed, skipped: scanMatches.length - scanMatches.filter(m => m.status === 'matched').length, errors })
    setScanUploading(false)
  }

  const [syncingClasses, setSyncingClasses] = useState(false)
  const [syncResult, setSyncResult] = useState(null)

  function parseCSV(text) {
    const lines = text.trim().split('\n')
    const hdrs = lines[0].split(',').map(h => h.trim().replace(/"/g, ''))
    const rows = lines.slice(1).map(line => {
      const vals = line.split(',').map(v => v.trim().replace(/"/g, ''))
      return Object.fromEntries(hdrs.map((h, i) => [h, vals[i] || '']))
    })
    return { headers: hdrs, rows }
  }

  function handleFile(e) {
    const f = e.target.files[0]
    if (!f) return
    setFile(f)
    const reader = new FileReader()
    reader.onload = ev => {
      const { headers, rows } = parseCSV(ev.target.result)
      setHeaders(headers)
      setPreview(rows.slice(0, 5))
    }
    reader.readAsText(f)
  }

  function getSheetCsvUrl(url) {
    const match = url.match(/\/d\/([a-zA-Z0-9-_]+)/)
    if (!match) return null
    const id = match[1]
    const gidMatch = url.match(/gid=(\d+)/)
    const gid = gidMatch ? gidMatch[1] : '0'
    return `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`
  }

  async function fetchFromSheets() {
    const csvUrl = getSheetCsvUrl(sheetUrl)
    if (!csvUrl) { alert('Invalid Google Sheets URL'); return }
    try {
      const res = await fetch(csvUrl)
      const text = await res.text()
      const { headers, rows } = parseCSV(text)
      setHeaders(headers)
      setPreview(rows.slice(0, 5))
      setFile({ name: 'Google Sheet', _rows: rows, _all: true })
    } catch {
      alert('Could not fetch sheet. Make sure it is publicly viewable (Share → Anyone with the link → Viewer).')
    }
  }

  // Bulk-populates student_class_assignments from each student's
  // class_schedule/class_time/class_time_2 fields -- this is the
  // SAME matching logic Registers.jsx has always used to work out
  // "who's in this class", which turned out to be the real, working
  // source of truth (student_class_assignments itself was mostly
  // empty). This is a one-time sync to catch it up, not a
  // replacement for that matching -- Registers keeps working exactly
  // as it did.
  async function syncClassAssignments() {
    setSyncingClasses(true)
    setSyncResult(null)
    try {
      const shortToFull = { Sun: 'Sunday', Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday', Fri: 'Friday', Sat: 'Saturday' }
      const fullToShort = { Sunday: 'Sun', Monday: 'Mon', Tuesday: 'Tue', Wednesday: 'Wed', Thursday: 'Thu', Friday: 'Fri', Saturday: 'Sat' }

      const [{ data: students, error: sErr }, { data: classes, error: cErr }, { data: existing, error: eErr }] = await Promise.all([
        supabase.from('students').select('id, class_schedule, class_time, class_time_2, members(status)'),
        supabase.from('classes').select('id, name, day_of_week, start_time').eq('active', true),
        supabase.from('student_class_assignments').select('student_id, class_id'),
      ])
      if (sErr) throw sErr
      if (cErr) throw cErr
      if (eErr) throw eErr

      const existingKeys = new Set((existing || []).map(a => `${a.student_id}::${a.class_id}`))
      const toInsert = []

      for (const s of (students || [])) {
        if (s.members?.status !== 'active') continue
        const fullSchedule = (s.class_schedule || '').trim()
        if (!fullSchedule) continue

        for (const c of (classes || [])) {
          const classStart = c.start_time?.slice(0, 5)
          const shortDay = fullToShort[c.day_of_week] || c.day_of_week
          const fullDay2 = shortToFull[c.day_of_week] || c.day_of_week
          const className = (c.name || '').trim()

          const timeMatch = s.class_time === classStart || s.class_time_2 === classStart
          // Deliberately does NOT match on class name alone -- that
          // branch is safe in Registers.jsx because it only ever
          // evaluates one specific day at a time, but is unsafe here
          // since this loops over every class across every day: if a
          // student's class_schedule is a venue name (e.g. "KR
          // Centre") rather than an actual day, and multiple classes
          // share that name across different days, name-only matching
          // would incorrectly match all of them.
          const schedMatch = fullSchedule === c.day_of_week
            || fullSchedule === shortDay
            || fullSchedule === fullDay2
            || fullSchedule.split('/').map(p => p.trim()).some(p => p === c.day_of_week || p === shortDay || p === fullDay2)

          if (timeMatch && schedMatch) {
            const key = `${s.id}::${c.id}`
            if (!existingKeys.has(key)) {
              existingKeys.add(key) // avoid inserting the same pair twice if matched by more than one rule
              toInsert.push({ student_id: s.id, class_id: c.id })
            }
          }
        }
      }

      if (toInsert.length === 0) {
        setSyncResult({ inserted: 0, message: 'No new matches found -- everything that could be matched already has an assignment.' })
        setSyncingClasses(false)
        return
      }

      const { error: insertError } = await supabase.from('student_class_assignments').insert(toInsert)
      if (insertError) throw insertError

      setSyncResult({ inserted: toInsert.length })
    } catch (e) {
      setSyncResult({ inserted: 0, error: e.message })
    }
    setSyncingClasses(false)
  }

  async function exportPdpData() {
    setExportingPdp(true)
    try {
      const { data: profiles, error } = await supabase
        .from('athlete_profiles')
        .select('student_id, pdp_notes, students(student_ref, members(first_name, last_name))')
      if (error) throw error

      const rows = []
      for (const p of (profiles || [])) {
        const pdp = p.pdp_notes || {}
        const studentRef = p.students?.student_ref || ''
        const firstName = p.students?.members?.first_name || ''
        const lastName = p.students?.members?.last_name || ''
        for (const section of PDP_EXPORT_SECTIONS) {
          const items = pdp[section.key]
          if (!Array.isArray(items) || items.length === 0) continue
          const highlighted = new Set(pdp[`__highlights_${section.key}`] || [])
          const completed = new Set(pdp[`__completed_${section.key}`] || [])
          for (const item of items) {
            rows.push({
              student_ref: studentRef,
              first_name: firstName,
              last_name: lastName,
              section: section.label,
              item,
              highlighted: highlighted.has(item) ? 'yes' : '',
              completed: completed.has(item) ? 'yes' : '',
            })
          }
        }
      }

      if (rows.length === 0) { alert('No PDP data found to export.'); setExportingPdp(false); return }

      const wb = XLSX.utils.book_new()
      const ws = XLSX.utils.json_to_sheet(rows)
      XLSX.utils.book_append_sheet(wb, ws, 'PDP Data')
      XLSX.writeFile(wb, `PDP_export_${new Date().toISOString().split('T')[0]}.xlsx`)
    } catch (e) {
      alert('Error exporting PDP data: ' + e.message)
    }
    setExportingPdp(false)
  }

  function handlePdpFile(e) {
    const f = e.target.files[0]
    if (!f) return
    setPdpFile(f)
    setPdpResult(null)
    const reader = new FileReader()
    reader.onload = ev => {
      const wb = XLSX.read(ev.target.result, { type: 'binary' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json(ws)
      setPdpPreview(rows)
    }
    reader.readAsBinaryString(f)
  }

  async function runPdpImport() {
    setPdpImporting(true)
    setPdpResult(null)
    try {
      const { data: studentsData, error: sErr } = await supabase.from('students').select('id, student_ref')
      if (sErr) throw sErr
      const studentByRef = Object.fromEntries((studentsData || []).map(s => [s.student_ref, s.id]))

      const { data: existingProfiles, error: pErr } = await supabase.from('athlete_profiles').select('student_id, pdp_notes')
      if (pErr) throw pErr
      const pdpByStudentId = Object.fromEntries((existingProfiles || []).map(p => [p.student_id, p.pdp_notes || {}]))

      // Group rows by student_ref + section, rebuilding each section's
      // item list (and highlight/completed flags) from scratch --
      // this replaces that section's contents with exactly what's in
      // the file, rather than appending to whatever's already there.
      const touchedStudentIds = new Set()
      const rowsByStudent = {}
      let unmatchedRefs = new Set()
      for (const row of pdpPreview) {
        const ref = row.student_ref || row['Student Ref'] || row.studentRef
        const studentId = studentByRef[ref]
        if (!studentId) { if (ref) unmatchedRefs.add(ref); continue }
        const sectionKey = PDP_SECTION_BY_LABEL[String(row.section || row.Section || '').toLowerCase().trim()]
        if (!sectionKey) continue
        touchedStudentIds.add(studentId)
        if (!rowsByStudent[studentId]) rowsByStudent[studentId] = {}
        if (!rowsByStudent[studentId][sectionKey]) rowsByStudent[studentId][sectionKey] = []
        const item = row.item || row.Item
        if (!item) continue
        rowsByStudent[studentId][sectionKey].push({
          item,
          highlighted: String(row.highlighted || row.Highlighted || '').toLowerCase() === 'yes',
          completed: String(row.completed || row.Completed || '').toLowerCase() === 'yes',
        })
      }

      let success = 0, failed = 0, errors = []
      for (const studentId of touchedStudentIds) {
        const current = pdpByStudentId[studentId] || {}
        const updated = { ...current }
        for (const [sectionKey, entries] of Object.entries(rowsByStudent[studentId])) {
          updated[sectionKey] = entries.map(e => e.item)
          const hl = entries.filter(e => e.highlighted).map(e => e.item)
          const done = entries.filter(e => e.completed).map(e => e.item)
          if (hl.length) updated[`__highlights_${sectionKey}`] = hl
          if (done.length) updated[`__completed_${sectionKey}`] = done
        }
        const { error } = await supabase.from('athlete_profiles').upsert({ student_id: studentId, pdp_notes: updated }, { onConflict: 'student_id' })
        if (error) { failed++; errors.push(`Student ${studentId}: ${error.message}`) }
        else success++
      }
      if (unmatchedRefs.size) errors.push(`Unmatched student_ref values (skipped): ${[...unmatchedRefs].join(', ')}`)
      setPdpResult({ success, failed, errors, total: touchedStudentIds.size })
    } catch (e) {
      setPdpResult({ success: 0, failed: 0, errors: [e.message], total: 0 })
    }
    setPdpImporting(false)
  }

  async function runImport() {
    setImporting(true)
    setResult(null)
    let rows = preview
    if (file?._all) {
      const csvUrl = getSheetCsvUrl(sheetUrl)
      const res = await fetch(csvUrl)
      const text = await res.text()
      rows = parseCSV(text).rows
    } else if (file && !file._all) {
      const text = await file.text()
      rows = parseCSV(text).rows
    }

    const { data: houses } = await supabase.from('houses').select('id,name')
    const houseMap = Object.fromEntries((houses || []).map(h => [h.name.toLowerCase(), h.id]))

    let success = 0, failed = 0, errors = []
    for (const row of rows) {
      const houseName = (row.house || row.House || row.house_name || '').toLowerCase()
      const houseId = houseMap[houseName] || null
      const { error } = await supabase.from('members').upsert({
        first_name: row.first_name || row['First Name'] || row.firstname || '',
        last_name: row.last_name || row['Last Name'] || row.lastname || '',
        email: row.email || row.Email || '',
        phone: row.phone || row.Phone || '',
        house_id: houseId,
        role: (row.role || row.Role || 'member').toLowerCase(),
        status: (row.status || row.Status || 'active').toLowerCase(),
        joined_date: row.joined_date || row['Joined Date'] || row.joined || null,
        member_id: row.member_id || row['Member ID'] || null,
      }, { onConflict: 'email' })
      if (error) { failed++; errors.push(`${row.email}: ${error.message}`) }
      else success++
    }
    setResult({ success, failed, errors, total: rows.length })
    setImporting(false)
  }

  return (
    <div style={{ maxWidth: 640 }}>
      <div className="page-header">
        <h1>Import data</h1>
        <p>Import members from Google Sheets or a CSV file</p>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>Sync class assignments from timetable</h2>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 14 }}>
          Registers has always worked out who's in each class using each student's own Class/Time fields
          (set on their record) — but this data was never copied into a proper class assignment record,
          which is what Attendance %, the weekly timetable, and calendar displays rely on. This fills in
          that gap using the exact same matching Registers already uses, so nothing about how Registers
          itself works changes. Safe to run more than once — it only adds assignments that don't already exist.
        </p>
        <button className="btn btn-primary" onClick={syncClassAssignments} disabled={syncingClasses}>
          {syncingClasses ? 'Syncing…' : '🔄 Sync class assignments'}
        </button>
        {syncResult && (
          <div style={{ marginTop: 14, borderLeft: `3px solid ${syncResult.error ? '#e24b4a' : 'var(--success)'}`, borderRadius: '0 var(--border-radius-lg) var(--border-radius-lg) 0', padding: '10px 14px', background: 'var(--bg-secondary)' }}>
            {syncResult.error ? (
              <p style={{ fontSize: 13, color: '#a32d2d' }}>Error: {syncResult.error}</p>
            ) : syncResult.message ? (
              <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{syncResult.message}</p>
            ) : (
              <p style={{ fontSize: 13 }}><span style={{ fontSize: 18, fontWeight: 700, color: 'var(--success)' }}>{syncResult.inserted}</span> new class assignment{syncResult.inserted === 1 ? '' : 's'} created</p>
            )}
          </div>
        )}
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>PDP data — export & import</h2>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 14 }}>
          Export every athlete's current PDP notes to Excel, or re-import a file in that same format —
          the app recognises each row by student reference + section, so a re-uploaded file lands back
          in the right place. Re-importing replaces a section's contents with exactly what's in the
          file for any student/section combination present in it.
        </p>
        <button className="btn btn-primary" style={{ marginBottom: 16 }} onClick={exportPdpData} disabled={exportingPdp}>
          {exportingPdp ? 'Exporting…' : '⬇️ Export all PDP data'}
        </button>

        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
          <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Re-import a PDP file</p>
          <input type="file" accept=".xlsx,.xls" onChange={handlePdpFile}
            style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 10 }} />
          {pdpPreview.length > 0 && (
            <>
              <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 10 }}>
                {pdpPreview.length} rows detected. Columns expected: student_ref, first_name, last_name, section, item, highlighted, completed.
              </p>
              <button className="btn btn-primary" style={{ justifyContent: 'center', minWidth: 160 }} onClick={runPdpImport} disabled={pdpImporting}>
                {pdpImporting ? 'Importing…' : 'Run PDP import'}
              </button>
            </>
          )}
          {pdpResult && (
            <div style={{ marginTop: 14, borderLeft: `3px solid ${pdpResult.failed === 0 ? 'var(--success)' : '#e24b4a'}`, borderRadius: '0 var(--radius-lg) var(--radius-lg) 0', padding: '10px 14px', background: 'var(--bg-secondary)' }}>
              <div style={{ display: 'flex', gap: 16, marginBottom: pdpResult.errors.length ? 10 : 0 }}>
                <div><span style={{ fontSize: 18, fontWeight: 700, color: 'var(--success)' }}>{pdpResult.success}</span><div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>athletes updated</div></div>
                {pdpResult.failed > 0 && <div><span style={{ fontSize: 18, fontWeight: 700, color: '#a32d2d' }}>{pdpResult.failed}</span><div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>failed</div></div>}
              </div>
              {pdpResult.errors.length > 0 && (
                <div style={{ fontSize: 12, color: '#a32d2d' }}>
                  {pdpResult.errors.map((e, i) => <div key={i}>{e}</div>)}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 14 }}>Option 1 — Google Sheets</h2>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 10 }}>
          Make your sheet public (Share → Anyone with the link → Viewer), then paste the URL below.
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          <input value={sheetUrl} onChange={e => setSheetUrl(e.target.value)} placeholder="https://docs.google.com/spreadsheets/d/…"
            style={{ flex: 1, padding: '8px 12px', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius)', fontSize: 13, background: 'var(--bg-secondary)' }} />
          <button className="btn btn-primary" onClick={fetchFromSheets}>Preview</button>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 14 }}>Option 2 — Upload CSV</h2>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 10 }}>
          Export your Google Sheet as CSV (File → Download → CSV) and upload it here.
        </p>
        <input type="file" accept=".csv" onChange={handleFile}
          style={{ fontSize: 13, color: 'var(--text-secondary)' }} />
      </div>

      {preview.length > 0 && (
        <div className="card" style={{ marginBottom: 14 }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>Preview</h2>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12 }}>Showing first {preview.length} rows. Columns detected: {headers.join(', ')}</p>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ minWidth: 500 }}>
              <thead>
                <tr>{headers.slice(0, 6).map(h => <th key={h}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {preview.map((row, i) => (
                  <tr key={i}>{headers.slice(0, 6).map(h => <td key={h} style={{ maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row[h]}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ marginTop: 14, padding: '12px 14px', background: 'var(--bg-secondary)', borderRadius: 'var(--radius)', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 14 }}>
            <strong style={{ color: 'var(--text)' }}>Expected columns:</strong> first_name, last_name, email, phone, house, role, status, joined_date, member_id
            <br />Column names are flexible — the importer will try to match common variations.
          </div>
          <button className="btn btn-primary" style={{ justifyContent: 'center', minWidth: 160 }} onClick={runImport} disabled={importing}>
            {importing ? 'Importing…' : 'Run import'}
          </button>
        </div>
      )}

      {result && (
        <div className="card" style={{ borderLeft: `3px solid ${result.failed === 0 ? 'var(--success)' : '#e24b4a'}`, borderRadius: '0 var(--radius-lg) var(--radius-lg) 0' }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 10 }}>Import complete</h2>
          <div style={{ display: 'flex', gap: 16, marginBottom: result.errors.length ? 12 : 0 }}>
            <div><span style={{ fontSize: 22, fontWeight: 700, color: 'var(--success)' }}>{result.success}</span><div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>imported</div></div>
            {result.failed > 0 && <div><span style={{ fontSize: 22, fontWeight: 700, color: '#a32d2d' }}>{result.failed}</span><div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>failed</div></div>}
            <div><span style={{ fontSize: 22, fontWeight: 700 }}>{result.total}</span><div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>total</div></div>
          </div>
          {result.errors.length > 0 && (
            <div style={{ background: '#fcebeb', borderRadius: 'var(--radius)', padding: '10px 12px', fontSize: 12, color: '#a32d2d' }}>
              {result.errors.map((e, i) => <div key={i}>{e}</div>)}
            </div>
          )}
        </div>
      )}

      <div className="card" style={{ marginTop: 16 }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>Bulk upload — membership form scans</h2>
        <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12 }}>
          Select every scanned/photographed original form at once (e.g. everything from a downloaded Drive folder). Each file is matched to a student by their first + last name appearing in the filename -- nothing uploads until you review the matches below.
        </p>
        <input type="file" multiple accept="image/*,application/pdf"
          onChange={e => { if (e.target.files.length) matchScanFiles(Array.from(e.target.files)) }} />

        {scanMatching && <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 10 }}>Matching {scanFiles.length} files against students…</p>}

        {scanMatches.length > 0 && !scanMatching && (
          <div style={{ marginTop: 14 }}>
            {(() => {
              const matched = scanMatches.filter(m => m.status === 'matched').length
              const alreadyHas = scanMatches.filter(m => m.status === 'already_has_scan').length
              const noMatch = scanMatches.filter(m => m.status === 'no_match').length
              const ambiguous = scanMatches.filter(m => m.status === 'ambiguous').length
              const duplicates = scanMatches.filter(m => m.status === 'duplicate_skipped').length
              return (
                <div style={{ display: 'flex', gap: 16, marginBottom: 12, fontSize: 12, flexWrap: 'wrap' }}>
                  <span style={{ color: 'var(--success)' }}>{matched} ready to upload</span>
                  {alreadyHas > 0 && <span style={{ color: 'var(--text-tertiary)' }}>{alreadyHas} already have a scan (skipped)</span>}
                  {duplicates > 0 && <span style={{ color: 'var(--text-tertiary)' }}>{duplicates} duplicate copies of the same student (only the newest kept)</span>}
                  {noMatch > 0 && <span style={{ color: '#a32d2d' }}>{noMatch} no matching student found</span>}
                  {ambiguous > 0 && <span style={{ color: '#EF9F27' }}>{ambiguous} matched more than one student (skipped)</span>}
                </div>
              )
            })()}
            <div style={{ maxHeight: 300, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
              {scanMatches.map((m, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', fontSize: 12, borderBottom: '1px solid var(--border)' }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{m.file.name}</span>
                  <span style={{
                    color: m.status === 'matched' ? 'var(--success)' : m.status === 'ambiguous' ? '#EF9F27' : m.status === 'no_match' ? '#a32d2d' : 'var(--text-tertiary)',
                    fontWeight: 500, flexShrink: 0, marginLeft: 10,
                  }}>
                    {m.status === 'matched' ? `→ ${m.student.members.first_name} ${m.student.members.last_name}` :
                     m.status === 'already_has_scan' ? `${m.student.members.first_name} ${m.student.members.last_name} (already has scan)` :
                     m.status === 'duplicate_skipped' ? `Duplicate -- keeping "${m.keptInstead}" instead` :
                     m.status === 'ambiguous' ? `${m.candidateCount} possible matches` : 'No match'}
                  </span>
                </div>
              ))}
            </div>
            <button className="btn btn-primary" style={{ marginTop: 12 }} disabled={scanUploading || !scanMatches.some(m => m.status === 'matched')} onClick={uploadMatchedScans}>
              {scanUploading ? 'Uploading…' : `Upload ${scanMatches.filter(m => m.status === 'matched').length} matched scans`}
            </button>
          </div>
        )}

        {scanResult && (
          <div className="card" style={{ marginTop: 14, borderLeft: `3px solid ${scanResult.failed === 0 ? 'var(--success)' : '#e24b4a'}`, borderRadius: '0 var(--radius-lg) var(--radius-lg) 0' }}>
            <div style={{ display: 'flex', gap: 16 }}>
              <div><span style={{ fontSize: 20, fontWeight: 700, color: 'var(--success)' }}>{scanResult.success}</span><div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>uploaded</div></div>
              {scanResult.failed > 0 && <div><span style={{ fontSize: 20, fontWeight: 700, color: '#a32d2d' }}>{scanResult.failed}</span><div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>failed</div></div>}
              <div><span style={{ fontSize: 20, fontWeight: 700 }}>{scanResult.skipped}</span><div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>skipped</div></div>
            </div>
            {scanResult.errors.length > 0 && (
              <div style={{ marginTop: 10, background: '#fcebeb', borderRadius: 'var(--radius)', padding: '10px 12px', fontSize: 12, color: '#a32d2d' }}>
                {scanResult.errors.map((e, i) => <div key={i}>{e}</div>)}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
