import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase.js'

// 🧪 Lab testing: results from outside testing (DIS Personal Performance Day and any other provider), record only.
// Coaches import a report (PDF / photo -- read by AI, checked before saving) or a spreadsheet (columns matched once,
// saved as a template per provider). Athletes see their own results (read-only).
const fmtD = d => d ? new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : ''
const num = v => { const n = parseFloat(String(v ?? '').replace(',', '.')); return isNaN(n) ? null : n }
const asymColour = a => a >= 15 ? '#E24B4A' : a >= 10 ? '#EF9F27' : '#1D9E75'
const toB64 = file => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.onerror = rej; r.readAsDataURL(file) })
const parseDate = v => {
  if (v == null || v === '') return null
  if (typeof v === 'number') { const d = new Date(Math.round((v - 25569) * 86400000)); return isNaN(d) ? null : d.toISOString().slice(0, 10) }
  const s = String(v).trim(), m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/)
  if (m) return `${m[3].length === 2 ? '20' + m[3] : m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  const d = new Date(s); return isNaN(d) ? null : d.toISOString().slice(0, 10)
}

export default function LabResults({ studentId, studentName = '', canEdit = false }) {
  const [rows, setRows] = useState([])
  const [open, setOpen] = useState(null)          // test name opened
  const [mode, setMode] = useState(null)          // 'pdf' | 'sheet'
  const [msg, setMsg] = useState('')
  const load = async () => {
    if (!studentId) return
    const { data } = await supabase.from('lab_results').select('*').eq('student_id', studentId).order('test_date', { ascending: false })
    setRows(data || [])
  }
  useEffect(() => { load() }, [studentId]) // eslint-disable-line react-hooks/exhaustive-deps

  // tests -> metrics -> latest value (by side), history and benchmarks
  const tests = useMemo(() => {
    const t = {}
    for (const r of rows) {
      const T = (t[r.test] ||= { name: r.test, provider: r.provider, latest: r.test_date, metrics: {} })
      if (r.test_date > T.latest) T.latest = r.test_date
      const M = (T.metrics[r.metric] ||= { name: r.metric, unit: r.unit, sides: {}, history: [], benchmarks: null })
      const k = r.side || '-'
      if (!M.sides[k] || r.test_date > M.sides[k].test_date) M.sides[k] = r
      M.history.push(r)
      if (r.benchmarks && Object.keys(r.benchmarks).length && (!M.benchmarks || r.test_date >= M.bDate)) { M.benchmarks = r.benchmarks; M.bDate = r.test_date }
    }
    return Object.values(t).sort((a, b) => a.name.localeCompare(b.name))
  }, [rows])
  const dates = [...new Set(rows.map(r => r.test_date))].sort().reverse()

  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, flex: 1, margin: 0 }}>🧪 Lab testing</h3>
        {dates.length > 0 && <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>latest {fmtD(dates[0])}</span>}
      </div>
      {canEdit && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
          <button type="button" className="btn btn-sm" onClick={() => setMode(mode === 'pdf' ? null : 'pdf')}>⬆ Report (PDF / photo)</button>
          <button type="button" className="btn btn-sm" onClick={() => setMode(mode === 'sheet' ? null : 'sheet')}>⬆ Spreadsheet</button>
        </div>
      )}
      {msg && <p style={{ fontSize: 12, color: '#1D9E75', margin: '4px 0 8px' }}>{msg}</p>}
      {canEdit && mode === 'pdf' && <PdfImport studentId={studentId} studentName={studentName} onDone={m => { setMode(null); setMsg(m); load() }} />}
      {canEdit && mode === 'sheet' && <SheetImport onDone={m => { setMode(null); setMsg(m); load() }} />}

      {tests.length === 0 ? (
        <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: 0 }}>No lab testing results yet.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {tests.map(T => {
            const isOpen = open === T.name
            const ms = Object.values(T.metrics)
            const worstAsym = Math.max(0, ...ms.filter(m => /asym/i.test(m.name)).map(m => num(m.sides['-']?.value) || 0),
              ...ms.map(m => (m.sides.L && m.sides.R) ? Math.abs(m.sides.L.value - m.sides.R.value) / Math.max(m.sides.L.value, m.sides.R.value) * 100 : 0))
            return (
              <div key={T.name} style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
                <button type="button" onClick={() => setOpen(isOpen ? null : T.name)} style={{ all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, width: '100%', boxSizing: 'border-box', padding: '10px 12px' }}>
                  <span style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{T.name}</span>
                  {worstAsym >= 10 && <span style={{ fontSize: 10, fontWeight: 700, color: asymColour(worstAsym) }}>⚠ {Math.round(worstAsym)}% L/R</span>}
                  <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{fmtD(T.latest)} {isOpen ? '▲' : '▼'}</span>
                </button>
                {isOpen && (
                  <div style={{ padding: '0 12px 10px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {ms.map(M => {
                      const L = M.sides.L, R = M.sides.R, one = M.sides['-']
                      const asym = L && R ? Math.abs(L.value - R.value) / Math.max(L.value, R.value) * 100 : null
                      const hist = M.history.filter(h => (h.side || '-') === (one ? '-' : 'L')).sort((a, b) => a.test_date.localeCompare(b.test_date))
                      return (
                        <div key={M.name}>
                          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 3 }}>{M.name}{M.unit ? ` (${M.unit})` : ''}</div>
                          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                            {one && <b style={{ fontSize: 18, color: /asym/i.test(M.name) ? asymColour(num(one.value) || 0) : undefined }}>{one.value}</b>}
                            {L && <span>L <b style={{ fontSize: 16 }}>{L.value}</b></span>}
                            {R && <span>R <b style={{ fontSize: 16 }}>{R.value}</b></span>}
                            {asym != null && <span style={{ fontSize: 11, fontWeight: 700, color: asymColour(asym) }}>{asym.toFixed(1)}% difference</span>}
                          </div>
                          {M.benchmarks && (
                            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
                              {Object.entries(M.benchmarks).map(([g, v]) => <span key={g} style={{ fontSize: 10, padding: '2px 7px', borderRadius: 8, background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>{g}: <b>{v}</b></span>)}
                            </div>
                          )}
                          {hist.length > 1 && (
                            <div style={{ display: 'flex', gap: 6, marginTop: 4, fontSize: 10, color: 'var(--text-tertiary)', flexWrap: 'wrap' }}>
                              {hist.map(h => <span key={h.id}>{fmtD(h.test_date)}: <b style={{ color: 'var(--text-secondary)' }}>{h.value}</b></span>)}
                            </div>
                          )}
                        </div>
                      )
                    })}
                    {canEdit && <button type="button" className="btn btn-sm" style={{ alignSelf: 'flex-start', color: '#E24B4A' }} onClick={async () => {
                      if (!window.confirm(`Delete all ${T.name} results for this athlete?`)) return
                      await supabase.from('lab_results').delete().eq('student_id', studentId).eq('test', T.name); load()
                    }}>✕ Delete {T.name}</button>}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ⬆ PDF / photo report -> AI reads it in the background -> coach checks the list -> save
function PdfImport({ studentId, studentName, onDone }) {
  const [state, setState] = useState('pick')   // pick | reading | review | saving
  const [err, setErr] = useState('')
  const [info, setInfo] = useState({ date: '', provider: '' })
  const [list, setList] = useState([])
  const [ath, setAth] = useState({})
  const start = async file => {
    if (!file) return
    setErr(''); setState('reading')
    try {
      const data = await toB64(file)
      const { data: imp, error } = await supabase.from('lab_imports').insert({ file_name: file.name }).select('id').single()
      if (error) throw error
      fetch('/.netlify/functions/read-lab-report-background', { method: 'POST', body: JSON.stringify({ import_id: imp.id, data, media_type: file.type || 'application/pdf' }) })
      for (let i = 0; i < 90; i++) {   // up to ~6 min
        await new Promise(r => setTimeout(r, 4000))
        const { data: row } = await supabase.from('lab_imports').select('status,result,error').eq('id', imp.id).single()
        if (row?.status === 'done') {
          const a = row.result?.athlete || {}
          setAth(a); setInfo({ date: a.test_date || new Date().toISOString().slice(0, 10), provider: a.provider || '' })
          const res = (row.result?.results || []).filter(r => r && r.test && r.metric)
          if (a.weight_kg) res.unshift({ test: 'Body measurements', metric: 'Body weight', value: a.weight_kg, unit: 'kg' })
          if (a.height_cm) res.unshift({ test: 'Body measurements', metric: 'Height', value: a.height_cm, unit: 'cm' })
          setList(res.map((r, i) => ({ ...r, _k: i, keep: true }))); setState('review'); return
        }
        if (row?.status === 'error') throw new Error(row.error || 'Could not read it')
      }
      throw new Error('It took too long -- try again')
    } catch (e) { setErr(String(e.message || e)); setState('pick') }
  }
  const save = async () => {
    setState('saving')
    const ins = list.filter(r => r.keep && num(r.value) != null).map(r => ({ student_id: studentId, test_date: info.date, provider: info.provider || null, test: r.test, metric: r.metric, value: num(r.value), unit: r.unit || null, side: r.side || null, benchmarks: r.benchmarks || null, source: 'report' }))
    const { error } = await supabase.from('lab_results').insert(ins)
    if (error) { setErr(error.message); setState('review'); return }
    onDone(`✓ ${ins.length} results saved`)
  }
  const nameOff = ath.name && studentName && !studentName.toLowerCase().split(' ').every(w => ath.name.toLowerCase().includes(w))
  return (
    <div style={{ border: '1px dashed var(--border)', borderRadius: 10, padding: 10, marginBottom: 10 }}>
      {state === 'pick' && <>
        <p style={{ fontSize: 12, margin: '0 0 8px', color: 'var(--text-secondary)' }}>Pick the report (PDF or a photo). It's read automatically -- you check everything before it's saved.</p>
        <input type="file" accept="application/pdf,image/*" onChange={e => start(e.target.files?.[0])} />
      </>}
      {state === 'reading' && <p style={{ fontSize: 13, margin: 0 }}>⏳ Reading the report… this can take a minute or two for a long PDF.</p>}
      {(state === 'review' || state === 'saving') && <>
        {nameOff && <p style={{ fontSize: 12, color: '#E24B4A', margin: '0 0 6px' }}>⚠ The report is for <b>{ath.name}</b> -- check it's the right athlete.</p>}
        <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
          <label style={{ fontSize: 12 }}>Date <input type="date" value={info.date} onChange={e => setInfo(v => ({ ...v, date: e.target.value }))} /></label>
          <label style={{ fontSize: 12 }}>Provider <input value={info.provider} onChange={e => setInfo(v => ({ ...v, provider: e.target.value }))} style={{ width: 110 }} /></label>
        </div>
        <div style={{ maxHeight: 340, overflow: 'auto', fontSize: 12 }}>
          {list.map(r => (
            <div key={r._k} style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '4px 0', borderBottom: '1px solid var(--border)', opacity: r.keep ? 1 : 0.4 }}>
              <input type="checkbox" checked={r.keep} onChange={e => setList(l => l.map(x => x._k === r._k ? { ...x, keep: e.target.checked } : x))} />
              <span style={{ flex: 1 }}>{r.test} · {r.metric}{r.side ? ` (${r.side})` : ''}</span>
              <input value={r.value ?? ''} onChange={e => setList(l => l.map(x => x._k === r._k ? { ...x, value: e.target.value } : x))} style={{ width: 64 }} />
              <span style={{ width: 40, color: 'var(--text-tertiary)' }}>{r.unit}</span>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
          <button type="button" className="btn btn-primary btn-sm" disabled={state === 'saving' || !info.date} onClick={save}>💾 Save {list.filter(r => r.keep).length} results</button>
          <button type="button" className="btn btn-sm" onClick={() => onDone('')}>Cancel</button>
        </div>
      </>}
      {err && <p style={{ fontSize: 12, color: '#E24B4A', margin: '6px 0 0' }}>{err}</p>}
    </div>
  )
}

// ⬆ Spreadsheet (CSV / Excel): one row per athlete (or per athlete + date); columns matched once and saved as a template
function SheetImport({ onDone }) {
  const [sheet, setSheet] = useState(null)       // { headers, rows }
  const [map, setMap] = useState({ nameCol: '', dateCol: '', provider: '', date: '', cols: {} })
  const [templates, setTemplates] = useState({})
  const [tplName, setTplName] = useState('')
  const [students, setStudents] = useState([])
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    supabase.from('team_settings').select('value').eq('key', 'lab_templates').maybeSingle().then(({ data }) => { try { setTemplates(JSON.parse(data?.value || '{}')) } catch { /* */ } })
    supabase.from('students').select('id, members(first_name, last_name)').then(({ data }) => setStudents(data || []))
  }, [])
  const read = async file => {
    if (!file) return
    setErr('')
    try {
      const XLSX = await import('xlsx')
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' })
      const aoa = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: '' })
      const hi = aoa.findIndex(r => r.filter(c => String(c).trim()).length >= 2)
      const headers = (aoa[hi] || []).map(h => String(h).trim())
      const rowsX = aoa.slice(hi + 1).filter(r => r.some(c => String(c).trim()))
      const guessName = headers.find(h => /name|athlete/i.test(h)) || ''
      const guessDate = headers.find(h => /date/i.test(h)) || ''
      const cols = Object.fromEntries(headers.filter(h => h && h !== guessName && h !== guessDate).map(h => {
        const u = (h.match(/\(([^)]+)\)\s*$/) || [])[1] || ''
        return [h, { use: true, test: h.replace(/\s*\([^)]*\)\s*$/, ''), metric: h.replace(/\s*\([^)]*\)\s*$/, ''), unit: u }]
      }))
      setSheet({ headers, rows: rowsX }); setMap(m => ({ ...m, nameCol: guessName, dateCol: guessDate, cols }))
    } catch (e) { setErr('Could not read that file: ' + (e.message || e)) }
  }
  const useTpl = n => { const t = templates[n]; if (!t || !sheet) return; setTplName(n); setMap(m => ({ ...m, ...t, cols: { ...m.cols, ...Object.fromEntries(Object.entries(t.cols || {}).filter(([h]) => sheet.headers.includes(h))) } })) }
  const findStudent = name => {
    const w = String(name || '').toLowerCase().replace(/[^a-z\s-]/g, ' ').split(/\s+/).filter(Boolean)
    if (!w.length) return null
    const hits = students.filter(s => { const full = `${s.members?.first_name || ''} ${s.members?.last_name || ''}`.toLowerCase(); return w.every(x => full.includes(x)) })
    return hits.length === 1 ? hits[0] : null
  }
  const preview = sheet ? sheet.rows.map(r => ({ r, s: findStudent(r[sheet.headers.indexOf(map.nameCol)]) })) : []
  const save = async () => {
    setBusy(true); setErr('')
    const ins = []
    for (const { r, s } of preview) {
      if (!s) continue
      const d = parseDate(map.dateCol ? r[sheet.headers.indexOf(map.dateCol)] : '') || map.date
      if (!d) continue
      for (const [h, c] of Object.entries(map.cols)) {
        if (!c.use) continue
        const v = num(r[sheet.headers.indexOf(h)])
        if (v == null) continue
        ins.push({ student_id: s.id, test_date: d, provider: map.provider || null, test: c.test || h, metric: c.metric || h, value: v, unit: c.unit || null, side: c.side || null, source: 'spreadsheet' })
      }
    }
    if (!ins.length) { setErr('Nothing to save -- check the name / date columns.'); setBusy(false); return }
    const { error } = await supabase.from('lab_results').insert(ins)
    if (error) { setErr(error.message); setBusy(false); return }
    if (tplName.trim()) {
      const next = { ...templates, [tplName.trim()]: { nameCol: map.nameCol, dateCol: map.dateCol, provider: map.provider, cols: map.cols } }
      await supabase.from('team_settings').upsert({ key: 'lab_templates', value: JSON.stringify(next) }, { onConflict: 'key' })
    }
    onDone(`✓ ${ins.length} results saved for ${new Set(ins.map(i => i.student_id)).size} athletes`)
  }
  const sel = { fontSize: 12, padding: '4px 6px' }
  return (
    <div style={{ border: '1px dashed var(--border)', borderRadius: 10, padding: 10, marginBottom: 10, fontSize: 12 }}>
      <p style={{ margin: '0 0 8px', color: 'var(--text-secondary)' }}>CSV or Excel, one row per athlete. Match the columns once and save it as a template for next time. Works for many athletes at once.</p>
      <input type="file" accept=".csv,.xlsx,.xls" onChange={e => read(e.target.files?.[0])} />
      {sheet && <>
        {Object.keys(templates).length > 0 && (
          <div style={{ margin: '8px 0' }}>Template: <select style={sel} value={tplName} onChange={e => useTpl(e.target.value)}><option value="">--</option>{Object.keys(templates).map(n => <option key={n}>{n}</option>)}</select></div>
        )}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '8px 0' }}>
          <label>Name column <select style={sel} value={map.nameCol} onChange={e => setMap(m => ({ ...m, nameCol: e.target.value }))}><option value="">--</option>{sheet.headers.map(h => <option key={h}>{h}</option>)}</select></label>
          <label>Date column <select style={sel} value={map.dateCol} onChange={e => setMap(m => ({ ...m, dateCol: e.target.value }))}><option value="">(none)</option>{sheet.headers.map(h => <option key={h}>{h}</option>)}</select></label>
          {!map.dateCol && <label>Date <input type="date" value={map.date} onChange={e => setMap(m => ({ ...m, date: e.target.value }))} /></label>}
          <label>Provider <input value={map.provider} onChange={e => setMap(m => ({ ...m, provider: e.target.value }))} style={{ width: 100 }} /></label>
        </div>
        <div style={{ maxHeight: 260, overflow: 'auto' }}>
          {Object.entries(map.cols).map(([h, c]) => (
            <div key={h} style={{ display: 'flex', gap: 4, alignItems: 'center', padding: '3px 0', borderBottom: '1px solid var(--border)', opacity: c.use ? 1 : 0.4 }}>
              <input type="checkbox" checked={c.use} onChange={e => setMap(m => ({ ...m, cols: { ...m.cols, [h]: { ...c, use: e.target.checked } } }))} />
              <span style={{ width: 90, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={h}>{h}</span>
              <input placeholder="Test" value={c.test} onChange={e => setMap(m => ({ ...m, cols: { ...m.cols, [h]: { ...c, test: e.target.value } } }))} style={{ flex: 1, minWidth: 0 }} />
              <input placeholder="Measure" value={c.metric} onChange={e => setMap(m => ({ ...m, cols: { ...m.cols, [h]: { ...c, metric: e.target.value } } }))} style={{ flex: 1, minWidth: 0 }} />
              <select style={sel} value={c.side || ''} onChange={e => setMap(m => ({ ...m, cols: { ...m.cols, [h]: { ...c, side: e.target.value } } }))}><option value="">-</option><option>L</option><option>R</option></select>
              <input placeholder="unit" value={c.unit} onChange={e => setMap(m => ({ ...m, cols: { ...m.cols, [h]: { ...c, unit: e.target.value } } }))} style={{ width: 44 }} />
            </div>
          ))}
        </div>
        <p style={{ margin: '8px 0 4px' }}>{preview.filter(p => p.s).length} of {preview.length} rows matched to athletes{preview.some(p => !p.s) ? ` -- not matched: ${preview.filter(p => !p.s).map(p => p.r[sheet.headers.indexOf(map.nameCol)]).filter(Boolean).slice(0, 6).join(', ')}` : ''}</p>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <input placeholder="Save as template (e.g. DIS)" value={tplName} onChange={e => setTplName(e.target.value)} style={{ width: 170 }} />
          <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={save}>💾 Save results</button>
          <button type="button" className="btn btn-sm" onClick={() => onDone('')}>Cancel</button>
        </div>
      </>}
      {err && <p style={{ color: '#E24B4A', margin: '6px 0 0' }}>{err}</p>}
    </div>
  )
}
