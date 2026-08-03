import { useState } from 'react'
import { supabase } from '../lib/supabase.js'
import * as XLSX from 'xlsx'

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
    </div>
  )
}
