import { useEffect, useState } from 'react'
import { MENTALITY_QUESTIONS, WELLBEING_QUESTIONS, TACTICAL_CATEGORIES, TECHNIQUE_STYLES, BODYWEIGHT_GROUPS } from '../../pages/AthleteApp.jsx'
import { QUESTION_SECTIONS, loadQuestionConfig, saveQuestionConfig, slugQ } from '../../lib/questionConfig.js'

// Settings -> Questions: rename, hide, reorder the preset questions in each section and add your own.
// Renaming keeps the original name as a hidden key, so everyone's logged history stays matched.
const PRESETS = {
  mentality: MENTALITY_QUESTIONS.map(q => q.label),
  tactical: ['Video analysis', ...Object.keys(TACTICAL_CATEGORIES)],
  technique: [...new Set(TECHNIQUE_STYLES.flatMap(st => Object.keys(st.categories)))],
  physical: BODYWEIGHT_GROUPS.filter(g => g.key !== 'compound_lifts').map(g => g.label),
  wellbeing: WELLBEING_QUESTIONS.map(q => q.label),
}
export default function QuestionsManager() {
  const [cfg, setCfg] = useState(null)
  const [sec, setSec] = useState('mentality')
  const [busy, setBusy] = useState(false)
  useEffect(() => { loadQuestionConfig(true).then(setCfg, () => setCfg({ custom: {}, overrides: {} })) }, [])
  if (!cfg) return null
  const ov = cfg.overrides?.[sec] || {}
  const custom = cfg.custom?.[sec] || []
  const presets = [...PRESETS[sec]].sort((a, b) => (ov[a]?.order ?? 999) - (ov[b]?.order ?? 999))
  async function save(next) { setBusy(true); const err = await saveQuestionConfig(next); setBusy(false); if (err) { alert('Could not save: ' + err.message); return } setCfg(next) }
  const setOv = (label, patch) => save({ ...cfg, overrides: { ...(cfg.overrides || {}), [sec]: { ...ov, [label]: { ...(ov[label] || {}), ...patch } } } })
  const move = (label, d) => {
    const order = presets.slice(); const i = order.indexOf(label), j = i + d
    if (j < 0 || j >= order.length) return
    ;[order[i], order[j]] = [order[j], order[i]]
    const nextOv = { ...ov }; order.forEach((l, n) => { nextOv[l] = { ...(nextOv[l] || {}), order: n } })
    save({ ...cfg, overrides: { ...(cfg.overrides || {}), [sec]: nextOv } })
  }
  const setCustom = list => save({ ...cfg, custom: { ...(cfg.custom || {}), [sec]: list } })
  const row = { display: 'flex', alignItems: 'center', gap: 6, padding: '6px 0', borderTop: '1px solid var(--border)' }
  return (
    <div className="card" style={{ padding: 14, marginBottom: 14 }}>
      <b style={{ fontSize: 14 }}>❓ Questions</b>
      <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '4px 0 10px' }}>Rename, hide or reorder each section's questions, and add your own (they work the same as the preset ones). Renaming keeps everyone's history.</p>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
        {QUESTION_SECTIONS.map(([k, l]) => <button key={k} type="button" className={sec === k ? 'btn btn-sm btn-primary' : 'btn btn-sm'} onClick={() => setSec(k)}>{l}</button>)}
      </div>
      {presets.map(label => { const o = ov[label] || {}; return (
        <div key={label} style={{ ...row, opacity: o.hidden ? 0.45 : 1 }}>
          <span style={{ display: 'flex', flexDirection: 'column' }}>
            <button type="button" className="btn btn-sm" style={{ padding: '0 6px', height: 18, fontSize: 10 }} disabled={busy} onClick={() => move(label, -1)}>▲</button>
            <button type="button" className="btn btn-sm" style={{ padding: '0 6px', height: 18, fontSize: 10 }} disabled={busy} onClick={() => move(label, 1)}>▼</button>
          </span>
          <span style={{ flex: 1, fontSize: 13 }}>{o.label || label}{o.label && <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}> (was {label})</span>}</span>
          <button type="button" className="btn btn-sm" disabled={busy} onClick={() => { const v = prompt(`Rename "${o.label || label}"`, o.label || label); if (v == null) return; setOv(label, { label: v.trim() && v.trim() !== label ? v.trim() : undefined }) }}>✎ Rename</button>
          <button type="button" className="btn btn-sm" disabled={busy} onClick={() => setOv(label, { hidden: !o.hidden })}>{o.hidden ? '👁 Show' : '🙈 Hide'}</button>
        </div>
      ) })}
      <div style={{ fontSize: 12, fontWeight: 700, margin: '12px 0 4px' }}>Added questions</div>
      {custom.length === 0 && <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: 0 }}>None yet -- add one below, or use ➕ Create question on a PDP note.</p>}
      {custom.map((q, i) => (
        <div key={q.key} style={{ ...row, opacity: q.hidden ? 0.45 : 1 }}>
          <span style={{ flex: 1, fontSize: 13 }}>{q.label}</span>
          <button type="button" className="btn btn-sm" disabled={busy} onClick={() => { const v = (prompt('Rename', q.label) || '').trim(); if (v) setCustom(custom.map((x, n) => n === i ? { ...x, label: v } : x)) }}>✎ Rename</button>
          <button type="button" className="btn btn-sm" disabled={busy} onClick={() => setCustom(custom.map((x, n) => n === i ? { ...x, hidden: !x.hidden } : x))}>{q.hidden ? '👁 Show' : '🙈 Hide'}</button>
        </div>
      ))}
      <button type="button" className="btn btn-sm btn-primary" style={{ marginTop: 8 }} disabled={busy}
        onClick={() => { const v = (prompt('New question for this section (every athlete):') || '').trim(); if (!v) return; let k = slugQ(v); while (custom.some(x => x.key === k)) k += '_2'; setCustom([...custom, { key: k, label: v }]) }}>➕ Add question</button>
    </div>
  )
}
