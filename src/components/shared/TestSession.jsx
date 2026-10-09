import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import VideoMeasureTool from './VideoMeasureTool.jsx'
import PunchCountTool from './PunchCountTool.jsx'
import BleepTestPlayer from './BleepTestPlayer.jsx'
import PhotoMeasureTool from './PhotoMeasureTool.jsx'
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
// Saves the test video to the athlete's question uploads (Physical -> tests) so it shows with the
// test, alongside their other uploads. (Under-18s: no uploads -- allowUpload is false.)
async function attachTestVideo(studentId, file, label, date) {
  const safeName = (file.name || 'video').replace(/[^a-zA-Z0-9._-]+/g, '_').slice(-80)
  const path = `athletes/${studentId}/${Date.now()}-${safeName}`
  const { error } = await supabase.storage.from('athlete-media').upload(path, file, { contentType: file.type || undefined })
  if (error) return error
  const { data: urlData } = supabase.storage.from('athlete-media').getPublicUrl(path)
  const { data: cur } = await supabase.from('athlete_profiles').select('media_files').eq('student_id', studentId).maybeSingle()
  const updated = [...(cur?.media_files || []), { name: file.name, url: urlData.publicUrl, type: file.type, uploaded_at: new Date().toISOString(), section_key: 'test', question_label: label, session_date: date }]
  const { error: e2 } = await supabase.from('athlete_profiles').upsert({ student_id: studentId, media_files: updated }, { onConflict: 'student_id' })
  return e2 || null
}

// Test video -> View iT ("<Name> — Tests" folder, private to the athlete). Works for the athlete
// themselves and for coaches; the server checks who may upload for whom.
export async function uploadTestVideoToViewIt(studentId, file, title) {
  const { data: sess } = await supabase.auth.getSession()
  const call = body => fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/fight-footage-url`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sess?.session?.access_token}` }, body: JSON.stringify(body),
  }).then(r => r.json())
  const up = await call({ mode: 'test_upload', student_id: studentId, file_name: file.name || 'video.mp4' })
  if (up.error) throw new Error(up.error)
  await new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', up.upload_url)
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300) ? resolve() : reject(new Error(`Upload failed (${xhr.status})`))
    xhr.onerror = () => reject(new Error('Upload failed'))
    xhr.send(file)
  })
  const reg = await call({ mode: 'test_register', student_id: studentId, storage_path: up.storage_path, title, file_size: file.size })
  if (reg.error) throw new Error(reg.error)
  return reg.footage_id
}

// +5 points for each test completed (once per test per day)
export const TEST_POINTS = 5
export async function awardTestPoints(studentId, testNames) {
  if (!testNames.length) return 0
  const today = new Date().toISOString().split('T')[0]
  const labels = testNames.map(n => `Test completed: ${n}`)
  const { data: done } = await supabase.from('points_log').select('point_type').eq('student_id', studentId).in('point_type', labels).gte('awarded_at', today)
  const already = new Set((done || []).map(r => r.point_type))
  const fresh = labels.filter(l => !already.has(l))
  if (!fresh.length) return 0
  const total = fresh.length * TEST_POINTS
  const { data: s } = await supabase.from('students').select('house_name, members(houses(name))').eq('id', studentId).single()
  const { error } = await supabase.from('points_log').insert(fresh.map(l => ({ student_id: studentId, point_type: l, points_awarded: TEST_POINTS, point_scope: 'both', awarded_at: new Date().toISOString() })))
  if (error) { console.warn('Test points not saved:', error.message); return 0 }
  await supabase.rpc('adjust_student_points', { p_student_id: studentId, p_house_delta: total, p_individual_delta: total })
  const house = s?.house_name || s?.members?.houses?.name
  if (house) await supabase.rpc('adjust_house_points', { p_house_name: house, p_delta: total })
  return total
}

export function TestSessionModal({ studentId, studentName, onClose, onSaved, allowUpload = false, onPoints }) {
  // 📹 measuring from video: jump height / punch speed / punch count fill the boxes below;
  // the video is also kept with the athlete's test uploads (and in View iT when onViewIt is given)
  const [tool, setTool] = useState(null) // null | 'jump' | 'punch' | 'count'
  const [flColour, setFlColour] = useState(null)    // fixed load circuit: the colour being recorded | 'bleep20' | 'bleep10' | 'photo' | 'timer:<test>' | 'reps:<test>'
  const toolFile = useRef(null)
  function keepVideo(label) {
    const f = toolFile.current; if (!f) return
    toolFile.current = null
    if (allowUpload) attachTestVideo(studentId, f, label, date).then(err => { if (err) alert('Result saved, but the video could not be attached: ' + err.message) })
    if (allowUpload) uploadTestVideoToViewIt(studentId, f, `${studentName || 'Athlete'} — ${label} · ${new Date(date + 'T12:00:00').toLocaleDateString('en-GB')}`)
      .catch(err => alert('Result kept, but the video could not be added to View iT: ' + err.message))
  }
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
    const before = history.find(s => s.session_date === date)?.test || {}
    const completed = Object.entries(values).filter(([k, v]) => v !== '' && v != null && (before[k] === '' || before[k] == null)).map(([k]) => k)
    const { error, pbs: newPbs } = await saveTestResults(studentId, date, values, sets)
    if (!error && completed.length) { const pts = await awardTestPoints(studentId, completed); if (pts) onPoints?.(pts) }
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

        {['jumps', 'punch', 'bleep', 'stretches', 'fixedload'].includes(cat.key) && (
          <div className="ts-measure">
            {cat.key === 'bleep' && <>
              <button type="button" className="ts-measure-btn" onClick={() => setTool('bleep20')}>▶ Run 20 m bleep test</button>
              <button type="button" className="ts-measure-btn" onClick={() => setTool('bleep10')}>▶ Run 10 m bleep test</button>
            </>}
            {cat.key === 'stretches' && <button type="button" className="ts-measure-btn" onClick={() => setTool('photo')}>📷 Measure from photo</button>}
            {cat.key === 'fixedload' && <button type="button" className="ts-measure-btn" onClick={() => setTool(`timer:${flColour || cat.tests[0]?.name}`)}>📹 Time circuit from video ({(flColour || cat.tests[0]?.name || '').replace(/^Fixed load circuit - /, '')})</button>}
            {cat.key === 'jumps' && <button type="button" className="ts-measure-btn" onClick={() => setTool('jump')}>📹 Open jump measuring</button>}
            {cat.key === 'punch' && <>
              <button type="button" className="ts-measure-btn" onClick={() => setTool('punch')}>📹 Open punch speed</button>
              <button type="button" className="ts-measure-btn" onClick={() => setTool('count')}>📹 Open punch counter</button>
            </>}
          </div>
        )}
        {tool === 'bleep20' || tool === 'bleep10' ? createPortal(
          <BleepTestPlayer zIndex={700} course={tool === 'bleep10' ? 10 : 20} runners={[{ id: 'me', name: studentName || 'Athlete' }]} onClose={() => setTool(null)}
            onDone={res => { if (res.me) setVals(p => ({ ...p, [tool === 'bleep10' ? 'Bleep test (10m)' : 'Bleep test']: res.me })) }} />, document.body)
        : tool === 'photo' ? createPortal(
          <PhotoMeasureTool zIndex={700} tests={cat.key === 'stretches' ? cat.tests.map(t => t.name) : []} onClose={() => setTool(null)}
            onSave={(name, v) => setVals(p => ({ ...p, [name]: String(v) }))} />, document.body)
        : tool?.startsWith?.('timer:') ? createPortal(
          <VideoMeasureTool mode="timer" zIndex={700} onFile={f => { toolFile.current = f }} onClose={() => setTool(null)}
            saveLabel={v => `Use ${v}s for ${tool.slice(6).replace(/^Fixed load circuit - /, '')}`}
            onResult={v => { setVals(p => ({ ...p, [tool.slice(6)]: String(v) })); keepVideo(tool.slice(6)) }} />, document.body)
        : tool?.startsWith?.('reps:') ? createPortal(
          <PunchCountTool mode="reps" title={`📹 Count reps · ${tool.slice(5)}`} zIndex={700} onFile={f => { toolFile.current = f }} onClose={() => setTool(null)}
            onSave={({ perRound }) => {
              const name = tool.slice(5)
              // fills the first empty set, or adds a new one
              setSets(p => { const a = [...(p[name] || [''])]; const i = a.findIndex(v => v === '' || v == null); if (i >= 0) a[i] = String(perRound); else a.push(String(perRound)); return { ...p, [name]: a } })
              keepVideo(`${name} reps`)
            }} />, document.body)
        : tool && createPortal(tool === 'count'
          ? <PunchCountTool zIndex={700} onFile={f => { toolFile.current = f }} onClose={() => setTool(null)}
              onSave={({ perRound, perMinute }) => { setVals(p => ({ ...p, 'Punches per round': String(perRound), 'Punches per minute': String(perMinute) })); keepVideo('Punch count') }} />
          : <VideoMeasureTool mode={tool} zIndex={700} onFile={f => { toolFile.current = f }} onClose={() => setTool(null)}
              saveLabel={(v, m) => tool === 'jump' ? `Use ${v} cm for Vertical Jump` : `Use ${v} ms for ${m?.punchType || 'Jab'}`}
              onResult={(v, m) => {
                const name = tool === 'jump' ? 'Vertical Jump (distance)' : `${m?.punchType || 'Jab'} time (ms)`
                setVals(p => ({ ...p, [name]: String(v) }))
                keepVideo(tool === 'jump' ? 'Vertical jump' : `${m?.punchType || 'Jab'} speed`)
              }} />, document.body)}

        {/* Fixed load circuit: pick the colour, then one time box for it (plus any colours already filled in) */}
        {cat.key === 'fixedload' && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '0 0 10px' }}>
            {cat.tests.map(t => { const colour = t.name.split(' - ').pop(); const on = (flColour || cat.tests[0]?.name) === t.name; return (
              <button key={t.name} type="button" className="btn btn-sm" onClick={() => setFlColour(t.name)}
                style={{ gap: 6, borderColor: on ? '#E6B800' : undefined, background: on ? '#E6B80022' : undefined }}>
                <span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: '50%', background: ({ Red: '#E24B4A', Yellow: '#F5C542', Green: '#1D9E75', Blue: '#378ADD', Black: '#111' })[colour] || '#888', border: '1px solid #666' }} />{colour}
              </button>
            ) })}
          </div>
        )}
        <div className="ts-tests">
          {cat.tests.filter(t => cat.key !== 'fixedload' || t.name === (flColour || cat.tests[0]?.name) || (vals[t.name] !== '' && vals[t.name] != null)).map(t => {
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
                    <button type="button" className="btn btn-sm" title="Count the reps from a video" onClick={() => setTool(`reps:${t.name}`)}>📹 Count</button>
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
  const [bleepOpen, setBleepOpen] = useState(false)

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
          {testName.startsWith('Bleep test') && (
            <button type="button" className="ts-measure-btn" style={{ marginBottom: 8 }} onClick={() => setBleepOpen(true)}>▶ Run the {testName === 'Bleep test (10m)' ? '10 m' : '20 m'} bleep test for a group</button>
          )}
          {bleepOpen && createPortal(
            <BleepTestPlayer zIndex={700} course={testName === 'Bleep test (10m)' ? 10 : 20} onClose={() => setBleepOpen(false)}
              candidates={list.map(a => ({ id: a.id, name: `${a.members?.first_name || ''} ${a.members?.last_name || ''}`.trim() }))}
              onDone={res => setVals(p => ({ ...p, ...res }))} />, document.body)}
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
