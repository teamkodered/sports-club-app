import { useState } from 'react'
// ❤️ HR recovery -- type it in at the end of an effort: heart rate at the end, then 1 minute later.
// Saves '<HRR % (after X)>' (+ the two bpm) to today's tests, so it shows in results and the profile's HRR row.
export default function HrrEntry({ afterTest, onSaveValues, colour = '#E24B4A' }) {
  const [a, setA] = useState(''), [b, setB] = useState(''), [done, setDone] = useState('')
  const s = parseFloat(a), e = parseFloat(b)
  const ok = s > 40 && e > 30 && e < s
  const pct = ok ? Math.round((s - e) / s * 1000) / 10 : null
  const box = { width: '100%', boxSizing: 'border-box', padding: '8px 10px', border: '1px solid var(--border-strong)', borderRadius: 6, fontSize: 15, background: 'var(--bg-primary)', color: 'var(--text)' }
  return (
    <div style={{ marginTop: 12, padding: 10, borderRadius: 10, border: `1px solid ${colour}55`, background: `${colour}0f` }}>
      <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>❤️ HR recovery <span style={{ fontWeight: 400, color: 'var(--text-tertiary)' }}>· after {afterTest}</span></div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 6, alignItems: 'end' }}>
        <label style={{ fontSize: 10, color: 'var(--text-secondary)' }}>At the end (bpm)<input type="number" inputMode="numeric" value={a} onChange={x => { setA(x.target.value); setDone('') }} style={box} /></label>
        <label style={{ fontSize: 10, color: 'var(--text-secondary)' }}>1 min later (bpm)<input type="number" inputMode="numeric" value={b} onChange={x => { setB(x.target.value); setDone('') }} style={box} /></label>
        <button type="button" className="btn btn-sm neon-save" disabled={!ok} style={{ height: 38 }} onClick={async () => {
          await onSaveValues({ [`HRR % (after ${afterTest})`]: String(pct), [`HRR start bpm (after ${afterTest})`]: String(s), [`HRR end bpm (after ${afterTest})`]: String(e) })
          setDone(`✓ Saved · ${s - e} bpm drop · ${pct}%`); setA(''); setB('')
        }}>Save</button>
      </div>
      <div style={{ fontSize: 11, marginTop: 6, color: done ? '#1D9E75' : 'var(--text-tertiary)' }}>{done || (ok ? `${s - e} bpm drop · ${pct}% recovery` : 'Enter both to work out the recovery')}</div>
    </div>
  )
}
