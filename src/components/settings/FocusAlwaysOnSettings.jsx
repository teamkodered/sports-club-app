import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase.js'
import { FOCUS_ALWAYS_ON_DEFAULT, FOCUS_SECTION_LABELS } from '../../lib/focus.js'

// Settings: Monthly focus -- the questions that are always on (never greyed out) in each section
export default function FocusAlwaysOnSettings() {
  const [vals, setVals] = useState(null)
  const [saved, setSaved] = useState(false)
  useEffect(() => {
    const toText = v => Object.fromEntries(Object.entries(v).map(([k, l]) => [k, (l || []).join(', ')]))
    supabase.from('settings').select('value').eq('key', 'focus_always_on').maybeSingle()
      .then(({ data }) => setVals(toText({ ...FOCUS_ALWAYS_ON_DEFAULT, ...(data?.value && typeof data.value === 'object' ? data.value : {}) })), () => setVals(toText(FOCUS_ALWAYS_ON_DEFAULT)))
  }, [])
  async function save() {
    const value = Object.fromEntries(Object.entries(vals).map(([k, t]) => [k, t.split(',').map(x => x.trim()).filter(Boolean)]))
    const { error } = await supabase.from('settings').upsert({ key: 'focus_always_on', value }, { onConflict: 'key' })
    if (error) { alert('Could not save: ' + error.message); return }
    setSaved(true); setTimeout(() => setSaved(false), 2000)
  }
  if (!vals) return null
  return (
    <div className="card" style={{ padding: 14, marginBottom: 14 }}>
      <b style={{ fontSize: 14 }}>🎯 Monthly focus · always-on questions</b>
      <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '4px 0 10px' }}>Each month athletes pick one focus question per section; the others grey out (still logged, no points) -- except these, which always count. Type the question names, separated by commas.</p>
      {Object.keys(FOCUS_SECTION_LABELS).map(k => (
        <label key={k} style={{ display: 'block', fontSize: 12, marginBottom: 8 }}>
          <span style={{ display: 'block', color: 'var(--text-secondary)', marginBottom: 3 }}>{FOCUS_SECTION_LABELS[k]}</span>
          <input value={vals[k] || ''} onChange={e => setVals(v => ({ ...v, [k]: e.target.value }))} placeholder="e.g. Sleep, Hydration" style={{ width: '100%' }} />
        </label>
      ))}
      <button type="button" className="btn btn-primary btn-sm" onClick={save}>{saved ? '✓ Saved' : 'Save'}</button>
    </div>
  )
}
