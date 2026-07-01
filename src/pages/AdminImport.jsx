import { useState } from 'react'
import { supabase } from '../lib/supabase.js'

export default function AdminImport() {
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState([])
  const [headers, setHeaders] = useState([])
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState(null)
  const [sheetUrl, setSheetUrl] = useState('')

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
