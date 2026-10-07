import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase.js'
import { TEST_CATEGORIES, bestByTest, lowerIsBetter, saveTestResults } from '../../lib/testResults.js'

const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
const fmtVal = (v, unit) => `${v}${unit === 'reps' || unit === 'punches' || unit === 'per min' ? ` ${unit}` : unit ? unit === 'level' ? '' : unit : ''}`

// ── PB celebration (same feel as the "+1 house point" pop-up) ──
export function PbPopup({ pbs, onDone, who }) {
  useEffect(() => {
    if (!pbs?.length) return
    if (navigator.vibrate) navigator.vibrate([20, 40, 20])
    const t = setTimeout(onDone, 2600 + pbs.length * 600)
    return () => clearTimeout(t)
  }, [pbs])
  if (!pbs?.length) return null
  return (
    <div className="pb-pop" role="status" onClick={onDone}>
      <div className="pb-pop-title">🏆 New PB{pbs.length > 1 ? 's' : ''}!{who ? ` · ${who}` : ''}</div>
      {pbs.map(p => (
        <div key={p.name} className="pb-pop-row">
          <b>{p.name}</b> {fmtVal(p.value, p.unit)} <span>(was {fmtVal(p.previous, p.unit)})</span>
        </div>
      ))}
    </div>
  )
}

// ── One athlete: pick a date and a category, fill in any tests (several sets for body weight) ──
export function TestSessionModal({ studentId, studentName, onClose, onSaved }) {
  const [date, setDate] = useState(todayISO())
  const [catKey, setCatKey] = useState(TEST_CATEGORIES[0].key)
  const [history, setHistory] = useState([])
  const [vals, setVals] = useState({})      // name -> value (single-set tests)
  const [sets, setSets] = useState({})      // name -> [values] (body weight)
  const [saving, setSaving] = useState(false)
  const [pbs, setPbs] = useState(null)

  useEffect(() => {
    supabase.from('fit2fight_sessions').select('session_date, test').eq('student_id', studentId)
      .then(({ data }) => setHistory(data || []))
  }, [studentId])
  // pre-fill anything already recorded for the chosen date
  useEffect(() => {
    const day = history.find(s => s.session_date === date)
    setVals(day?.test ? Object.fromEntries(Object.entries(day.test).filter(([, v]) => v !== '' && v != null && typeof v !== 'object').map(([k, v]) => [k, String(v)])) : {})
    setSets({})
  }, [date, history])

  const { best, last } = useMemo(() => bestByTest(history, date), [history, date])
  const cat = TEST_CATEGORIES.find(c => c.key === catKey)
  const filledCount = c => c.tests.filter(t => (c.multiSet ? (sets[t.name] || []).some(v => v !== '') : false) || (vals[t.name] ?? '') !== '').length

  async function save() {
    // body weight: the best set is the result
    const values = { ...vals }
    Object.entries(sets).forEach(([k, arr]) => {
      const nums = arr.map(Number).filter(n => !isNaN(n) && n > 0)
      if (nums.length) values[k] = Math.max(...nums)
    })
    setSaving(true)
    const { error, pbs: newPbs } = await saveTestResults(studentId, date, values, sets)
    setSaving(false)
    if (error) return alert('Could not save results: ' + error.message)
    onSaved && onSaved()
    if (newPbs.length) setPbs(newPbs)
    else onClose()
  }

  return (
    <div className="ts-backdrop" onClick={onClose}>
      <div className="ts-sheet" onClick={e => e.stopPropagation()} role="dialog" aria-label="Test session">
        <div className="ts-head">
          <div><b>📋 Test session</b>{studentName && <div className="ts-sub">{studentName}</div>}</div>
          <button type="button" className="btn btn-sm" onClick={onClose}>Close</button>
        </div>
        <label className="ts-label" htmlFor="ts-date">DATE</label>
        <input id="ts-date" type="date" value={date} max={todayISO()} onChange={e => setDate(e.target.value)} className="ts-input" />

        <div className="ts-label">TEST</div>
        <div className="ts-cats">
          {TEST_CATEGORIES.map(c => {
            const n = filledCount(c)
            return <button key={c.key} type="button" className={catKey === c.key ? 'on' : ''} onClick={() => setCatKey(c.key)}>{c.icon} {c.label}{n ? <b> {n}</b> : null}</button>
          })}
        </div>

        <div className="ts-tests">
          {cat.tests.map(t => {
            const b = best[t.name], l = last[t.name]
            const hint = <div className="ts-hint">{b != null ? <>Best <b>{fmtVal(b, t.unit)}</b>{l ? <> · Last {fmtVal(l.value, t.unit)} ({new Date(l.date + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })})</> : null}</> : 'No result yet'}{lowerIsBetter(t.name) ? ' · lower is better' : ''}</div>
            if (cat.multiSet) {
              const arr = sets[t.name] || ['']
              return (
                <div key={t.name} className="ts-test">
                  <div className="ts-test-name">{t.name}</div>
                  <div className="ts-sets">
                    {arr.map((v, i) => (
                      <input key={i} type="number" inputMode="numeric" min="0" placeholder={`Set ${i + 1}`} value={v} aria-label={`${t.name} set ${i + 1}`}
                        onChange={e => setSets(p => { const a = [...(p[t.name] || [''])]; a[i] = e.target.value; return { ...p, [t.name]: a } })} />
                    ))}
                    <button type="button" className="btn btn-sm" onClick={() => setSets(p => ({ ...p, [t.name]: [...(p[t.name] || ['']), ''] }))}>+ Set</button>
                  </div>
                  {hint}
                </div>
              )
            }
            return (
              <div key={t.name} className="ts-test">
                <label className="ts-test-name" htmlFor={`ts-${t.name}`}>{t.name}</label>
                <div className="ts-one">
                  <input id={`ts-${t.name}`} type="number" inputMode="decimal" step="any" value={vals[t.name] ?? ''} onChange={e => setVals(p => ({ ...p, [t.name]: e.target.value }))} />
                  <span>{t.unit}</span>
                </div>
                {hint}
              </div>
            )
          })}
        </div>
        <button type="button" className="btn btn-primary ts-save" disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save results'}</button>
        <PbPopup pbs={pbs} who={studentName} onDone={() => { setPbs(null); onClose() }} />
      </div>
    </div>
  )
}

// ── Coach: one test, many athletes (group test days) ──
export function TestBatchModal({ onClose }) {
  const [date, setDate] = useState(todayISO())
  const [testName, setTestName] = useState(TEST_CATEGORIES[0].tests[0].name)
  const [group, setGroup] = useState('all')
  const [athletes, setAthletes] = useState([])
  const [vals, setVals] = useState({})
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(false)
  const [summary, setSummary] = useState(null)  // { saved, pbs: [{ who, ...pb }] }

  useEffect(() => {
    supabase.from('students').select('id, discipline, is_kr, members(first_name, last_name, status)')
      .or('is_kr.eq.true,discipline.eq.KRBA')
      .then(({ data }) => setAthletes((data || []).filter(s => (s.members?.status || 'active') === 'active')
        .sort((a, b) => `${a.members?.first_name} ${a.members?.last_name}`.localeCompare(`${b.members?.first_name} ${b.members?.last_name}`))))
  }, [])
  const info = TEST_CATEGORIES.flatMap(c => c.tests.map(t => ({ ...t, cat: c }))).find(t => t.name === testName)
  const q = search.trim().toLowerCase()
  const list = athletes.filter(a => (group === 'all' || (group === 'kr' ? a.is_kr : a.discipline === 'KRBA')) &&
    (!q || `${a.members?.first_name} ${a.members?.last_name}`.toLowerCase().includes(q)))
  const filled = Object.entries(vals).filter(([, v]) => v !== '' && v != null)

  async function saveAll() {
    setSaving(true)
    const pbs = []; let saved = 0; const errs = []
    for (const [id, v] of filled) {
      const a = athletes.find(x => x.id === id)
      const { error, pbs: p } = await saveTestResults(id, date, { [testName]: v })
      if (error) errs.push(`${a?.members?.first_name}: ${error.message}`)
      else { saved++; p.forEach(pb => pbs.push({ ...pb, who: `${a?.members?.first_name} ${a?.members?.last_name}` })) }
    }
    setSaving(false)
    if (errs.length) alert('Some results could not be saved:\n' + errs.join('\n'))
    setSummary({ saved, pbs }); setVals({})
    if (pbs.length && navigator.vibrate) navigator.vibrate([20, 40, 20])
  }

  return (
    <div className="ts-backdrop" onClick={onClose}>
      <div className="ts-sheet" onClick={e => e.stopPropagation()} role="dialog" aria-label="Group test entry">
        <div className="ts-head">
          <div><b>📋 Group test entry</b><div className="ts-sub">One test, many athletes</div></div>
          <button type="button" className="btn btn-sm" onClick={onClose}>Close</button>
        </div>
        {summary ? (
          <div className="ts-summary">
            <div style={{ fontSize: 15, fontWeight: 700 }}>✓ Saved {summary.saved} result{summary.saved === 1 ? '' : 's'} · {testName}</div>
            {summary.pbs.length > 0 ? (
              <>
                <div className="ts-label" style={{ marginTop: 10 }}>🏆 NEW PBS ({summary.pbs.length})</div>
                {summary.pbs.map(p => <div key={p.who} className="pb-pop-row"><b>{p.who}</b> {fmtVal(p.value, p.unit)} <span>(was {fmtVal(p.previous, p.unit)})</span></div>)}
              </>
            ) : <div className="ts-hint" style={{ marginTop: 6 }}>No new PBs this time.</div>}
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button type="button" className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={() => setSummary(null)}>Enter another test</button>
              <button type="button" className="btn" onClick={onClose}>Done</button>
            </div>
          </div>
        ) : <>
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ flex: 1 }}><label className="ts-label" htmlFor="tb-date">DATE</label>
              <input id="tb-date" type="date" value={date} max={todayISO()} onChange={e => setDate(e.target.value)} className="ts-input" /></div>
            <div style={{ flex: 2 }}><label className="ts-label" htmlFor="tb-test">TEST</label>
              <select id="tb-test" value={testName} onChange={e => { setTestName(e.target.value); setVals({}) }} className="ts-input">
                {TEST_CATEGORIES.map(c => <optgroup key={c.key} label={`${c.icon} ${c.label}`}>{c.tests.map(t => <option key={t.name} value={t.name}>{t.name}</option>)}</optgroup>)}
              </select></div>
          </div>
          <div style={{ display: 'flex', gap: 6, margin: '8px 0' }}>
            {[['all', 'All athletes'], ['kr', 'KR'], ['krba', 'KRBA']].map(([k, l]) => <button key={k} type="button" className={`btn btn-sm${group === k ? ' btn-primary' : ''}`} onClick={() => setGroup(k)}>{l}</button>)}
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…" className="ts-input" style={{ flex: 1, height: 32 }} aria-label="Search athletes" />
          </div>
          <div className="ts-hint" style={{ marginBottom: 6 }}>Fill in just the athletes who did it · unit: {info?.unit}{lowerIsBetter(testName) ? ' · lower is better' : ''}{info?.cat?.multiSet ? ' · best 60s set' : ''}</div>
          <div className="ts-batch">
            {list.map(a => (
              <label key={a.id} className="ts-batch-row">
                <span>{a.members?.first_name} {a.members?.last_name}</span>
                <input type="number" inputMode="decimal" step="any" value={vals[a.id] ?? ''} onChange={e => setVals(p => ({ ...p, [a.id]: e.target.value }))} aria-label={`${a.members?.first_name} ${a.members?.last_name}`} />
              </label>
            ))}
            {list.length === 0 && <div className="ts-hint">No athletes match.</div>}
          </div>
          <button type="button" className="btn btn-primary ts-save" disabled={saving || !filled.length} onClick={saveAll}>{saving ? 'Saving…' : `Save all (${filled.length})`}</button>
        </>}
      </div>
    </div>
  )
}
