import { useEffect, useMemo, useRef, useState } from 'react'
import { newRunId, runKey, EffortSwitcher } from './RunEfforts.jsx'

// Watt bike in one panel (Oct 2026): every interval as chips in one list (grouped
// Output / Standard / Distance / Single set), then quick rep entry -- Watts + km side
// by side, the next rep appears by itself, "Same as last", last time's numbers shown
// faintly with a ⭐ when a rep beats your best for that interval. Data is saved exactly
// as before (watt_bike entries: { id, group, interval_mode, sets: [{ wattage, distance }] }
// and the Single set test values), so history, PBs, bars and Results all carry on.

const SINGLE_SHORT = { 'Watt bike 10 second (output)': '10 sec output', 'Watt bike 30 sec (distance)': '30 sec distance', 'Watt bike 1 min (distance)': '1 min distance', 'Watt bike 2 min (distance)': '2 min distance', 'Watt bike 3 min (distance)': '3 min distance' }
// '10s on 90s off' -> the s after each number in black so the numbers stand out
const secLabel = t => t.split(/(\d+)s\b/).map((part, i) => i % 2 ? <span key={i}>{part}<span style={{ color: '#000', textShadow: 'none' }}>s</span></span> : part)
const num = v => { const n = parseFloat(v); return isNaN(n) ? null : n }

export default function WattBikePanel({ entries = [], onSaveEntries, history = [], groups, presets, normalize = m => m, singleTests = [], todaysTest = {}, onSaveTest, saving, pdpNotesFor, groupLabel }) {
  const [sel, setSel] = useState(null) // effort key | '__new__'
  const [single, setSingle] = useState(null) // single-set test name
  const [other, setOther] = useState('')
  const efforts = entries.map((e, i) => ({ e, k: runKey(e, i), i })).filter(x => !x.e.quickLogged || (x.e.sets || []).length)
  const current = (sel === '__new__' || efforts.length === 0) ? null : (efforts.find(x => x.k === sel) || efforts[efforts.length - 1])
  const entry = current ? current.e : { interval_mode: '', sets: [] }
  const mode = normalize(entry.interval_mode || '')
  const groupOf = m => (groups.find(g => g.match(m))?.key) || 'standard'

  const save = list => onSaveEntries(list)
  const upsert = updated => {
    if (current) {
      const id = current.e.id || newRunId()
      save(entries.map((e, i) => i === current.i ? { ...updated, id } : e)); if (!current.e.id) setSel(id)
    } else { const id = newRunId(); save([...entries, { ...updated, id }]); setSel(id) }
  }
  const pickInterval = m => {
    setSingle(null)
    const patch = { interval_mode: m, group: groupOf(normalize(m)) }
    if (current && (entry.sets || []).some(s => num(s?.wattage) != null || num(s?.distance) != null)) {
      const id = newRunId(); save([...entries, { sets: [], ...patch, id }]); setSel(id)       // results already in -> new effort
    } else upsert({ ...entry, ...patch, sets: entry.sets || [] })
  }
  const removeEffort = () => { if (!current) return; if (!confirm('Remove this effort?')) return; save(entries.filter((_, i) => i !== current.i)); setSel(null) }

  // rows: saved sets + one empty row ready
  const savedRows = (entry.sets || []).map(s => (s && typeof s === 'object') ? { wattage: s.wattage ?? '', distance: s.distance ?? '' } : { wattage: s ?? '', distance: '' })
  const [rows, setRows] = useState(savedRows)
  const keyRef = useRef('')
  const rowsKey = `${current?.k || 'new'}|${mode}`
  useEffect(() => { if (keyRef.current !== rowsKey) { keyRef.current = rowsKey; setRows(savedRows) } }) // eslint-disable-line react-hooks/exhaustive-deps
  const shown = rows.length === 0 || (rows[rows.length - 1].wattage !== '' || rows[rows.length - 1].distance !== '') ? [...rows, { wattage: '', distance: '' }] : rows
  const commit = next => { const clean = next.filter(r => r.wattage !== '' || r.distance !== ''); setRows(clean); upsert({ ...entry, group: entry.group || groupOf(mode), sets: clean }) }

  // last time + best for this interval (earlier days)
  const { ghost, bestW, bestD } = useMemo(() => {
    if (!mode) return { ghost: [], bestW: null, bestD: null }
    const today = new Date().toISOString().split('T')[0]
    const past = [...history].filter(s => s.session_date < today).sort((a, b) => b.session_date.localeCompare(a.session_date))
    let ghost = [], bestW = null, bestD = null
    for (const s of past) for (const e of (s.watt_bike || [])) {
      if (normalize(e.interval_mode || '') !== mode) continue
      const sets = (e.sets || []).map(x => (x && typeof x === 'object') ? x : { wattage: x })
      if (!ghost.length && sets.length) ghost = sets
      for (const x of sets) { const w = num(x.wattage), d = num(x.distance); if (w != null && (bestW == null || w > bestW)) bestW = w; if (d != null && (bestD == null || d > bestD)) bestD = d }
    }
    return { ghost, bestW, bestD }
  }, [history, mode]) // eslint-disable-line react-hooks/exhaustive-deps

  const chip = (on, text, onClick) => (
    <button type="button" onClick={onClick} className="btn btn-sm" style={{ background: on ? '#E6B80026' : undefined, borderColor: on ? '#E6B800' : undefined, color: on ? '#F2F2F2' : undefined }}>{text}</button>
  )
  const box = { width: '100%', boxSizing: 'border-box', height: 46, fontSize: 18, fontWeight: 700, textAlign: 'center', borderRadius: 8, border: '1px solid var(--border-strong, #3A3F46)', background: 'var(--bg, #0B0F12)', color: 'var(--text, #fff)' }

  return (
    <div className="card neon-qpanel neon-q-physical neon-run-panel" style={{ marginBottom: 8 }}>
      {efforts.length > 0 && <EffortSwitcher efforts={efforts} currentKey={current?.k} isNew={!current} onPick={k => { setSel(k); setSingle(null) }} onNew={() => { setSel('__new__'); setSingle(null) }} labelOf={e => e.interval_mode || 'Effort'} />}
      {current && !single && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
          <button type="button" className="btn btn-sm neon-danger" style={{ fontSize: 11 }} onClick={removeEffort}>✕ Remove effort</button>
        </div>
      )}
      {pdpNotesFor && !single && mode && pdpNotesFor(groupOf(mode))}

      {/* one list: every interval, grouped */}
      {groups.map(g => (
        <div key={g.key} style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>{g.icon} {groupLabel ? groupLabel(g) : g.label}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {(presets[g.key] || []).map(m => <span key={m}>{chip(!single && mode === m, secLabel(m.replace(' seconds on ', 's on ').replace(' seconds off', 's off').replace('1 min 30 sec', '90s')), () => pickInterval(m))}</span>)}
          </div>
        </div>
      ))}
      {singleTests.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>1️⃣ Single set</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {singleTests.map(t => <span key={t.name}>{chip(single === t.name, SINGLE_SHORT[t.name] || t.name, () => setSingle(single === t.name ? null : t.name))}</span>)}
          </div>
        </div>
      )}
      {!single && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
          <input value={other} onChange={e => setOther(e.target.value)} placeholder="Other interval… e.g. 45s on 45s off" style={{ flex: 1, minWidth: 0 }} />
          <button type="button" className="btn btn-sm" disabled={!other.trim()} onClick={() => { pickInterval(other.trim()); setOther('') }}>Use</button>
        </div>
      )}

      {/* single set: just the one box */}
      {single && (() => {
        const t = singleTests.find(x => x.name === single)
        return (
          <SingleBox key={single} test={t} value={todaysTest?.[single] ?? ''} onSave={v => onSaveTest(single, v)} box={box} />
        )
      })()}

      {/* reps */}
      {!single && mode && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: '44px 1fr 1fr 28px', gap: 6, alignItems: 'center', fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>
            <span>Rep</span><span style={{ textAlign: 'center' }}>Watts</span><span style={{ textAlign: 'center' }}>km</span><span />
          </div>
          {shown.map((r, i) => {
            const g = ghost[i] || {}
            const star = (bestW != null && num(r.wattage) != null && num(r.wattage) > bestW) || (bestD != null && num(r.distance) != null && num(r.distance) > bestD)
            const set = (k, v) => { const next = shown.map((x, j) => j === i ? { ...x, [k]: v } : x); setRows(next) }
            return (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '44px 1fr 1fr 28px', gap: 6, alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontWeight: 700, fontSize: 13 }}>{i + 1}</span>
                <input type="number" inputMode="numeric" value={r.wattage} placeholder={g.wattage != null && g.wattage !== '' ? String(g.wattage) : 'W'} onChange={e => set('wattage', e.target.value)} onBlur={() => commit(rows)} style={box} aria-label={`Rep ${i + 1} watts`} />
                <input type="number" inputMode="decimal" step="0.01" value={r.distance} placeholder={g.distance != null && g.distance !== '' ? String(g.distance) : 'km'} onChange={e => set('distance', e.target.value)} onBlur={() => commit(rows)} style={box} aria-label={`Rep ${i + 1} km`} />
                <span style={{ textAlign: 'center' }}>{star ? '⭐' : ''}</span>
              </div>
            )
          })}
          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <button type="button" className="btn btn-sm" disabled={!rows.length} onClick={() => { const last = rows[rows.length - 1]; if (last) commit([...rows, { ...last }]) }}>↻ Same as last</button>
            {rows.length > 0 && <button type="button" className="btn btn-sm" onClick={() => commit(rows.slice(0, -1))}>Remove last rep</button>}
          </div>
          {ghost.length > 0 && <p style={{ fontSize: 11, color: 'var(--text-tertiary)', margin: '8px 0 0' }}>Faint numbers = last time on this interval · ⭐ = beats your best</p>}
          {saving && <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 6 }}>Saving…</p>}
        </div>
      )}
      {!single && !mode && <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0 }}>Pick an interval (or a single set) to start.</p>}
    </div>
  )
}

function SingleBox({ test, value, onSave, box }) {
  const [v, setV] = useState(value)
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
      <input type="number" inputMode="decimal" value={v} onChange={e => setV(e.target.value)} placeholder={test?.unit === 'W' ? 'Watts' : 'km'} style={{ ...box, flex: 1 }} />
      <span style={{ fontSize: 14, color: 'var(--text-secondary)', width: 26 }}>{test?.unit}</span>
      <button type="button" className="btn btn-sm btn-primary" disabled={v === '' || v === value} onClick={() => onSave(v)}>Save</button>
    </div>
  )
}
