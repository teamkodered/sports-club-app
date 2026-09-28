import { useState } from 'react'

// Running: ONE saved item per effort (Sep 2026). Previously each running
// type held a single entry per day, so choosing a second test the same day
// overwrote the first one's test with both results mixed together. Now each
// effort is its own item (with an id); older entries without an id are
// read exactly as they are and get an id the first time they're edited.

export const newRunId = () => `run-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
export const runKey = (e, i) => e.id || `legacy-${i}`

// Suicides (inside Interval): a 1 m pyramid -- out to the 1 m line and
// back, then 2 m, 3 m ... until time runs out. The athlete records the
// last line reached per rep; reaching line n = 2 x (1 + 2 + ... + n) = n(n+1) m.
export const isSuicideTest = test => /suicide/i.test(test || '')
export const suicideMetres = n => (n > 0 ? n * (n + 1) : 0)
export const SUICIDE_PRESETS = ['Suicides 20 seconds on 10 seconds off', 'Suicides 30 seconds on 30 seconds off', 'Suicides 45 seconds on 45 seconds off', 'Suicides 60 seconds on 60 seconds off']

export function EffortSwitcher({ efforts, currentKey, isNew, onPick, onNew, colour = '#E24B4A' }) {
  if (!efforts.length) return null
  const chip = on => ({ fontSize: 11, background: on ? colour + '20' : undefined, borderColor: on ? colour : undefined })
  return (
    <div className="field" style={{ marginBottom: 10 }}>
      <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Today's efforts</label>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {efforts.map(({ e, k }, i) => (
          <button key={k} type="button" className="btn btn-sm" style={chip(!isNew && k === currentKey)} onClick={() => onPick(k)}>
            {i + 1} · {e.test || (e.quickLogged ? 'Quick log' : 'No test')}{e.sets?.length ? ` (${e.sets.length})` : ''}
          </button>
        ))}
        <button type="button" className="btn btn-sm" style={chip(isNew)} onClick={onNew}>+ New effort</button>
      </div>
    </div>
  )
}

export function SuicideInput({ lines = [], onChange, colour = '#E24B4A' }) {
  const [v, setV] = useState('')
  const n = parseInt(v, 10)
  const ok = Number.isFinite(n) && n > 0
  const add = () => { if (!ok) return; onChange([...lines, n]); setV('') }
  const total = lines.reduce((t, x) => t + suicideMetres(x), 0)
  const best = lines.length ? Math.max(...lines) : 0
  return (
    <div>
      <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 8px' }}>1 m pyramid: out to 1 m and back, 2 m and back … Enter the last line reached each rep.</p>
      {lines.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
          {lines.map((x, i) => (
            <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 8px', borderRadius: 6, background: colour + '14', border: `1px solid ${colour}55`, fontSize: 12 }}>
              <b>{x} m line</b><span style={{ color: 'var(--text-tertiary)' }}>{suicideMetres(x)} m</span>
              <button type="button" aria-label={`Remove rep ${i + 1}`} onClick={() => onChange(lines.filter((_, j) => j !== i))}
                style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: 14, padding: 0 }}>×</button>
            </span>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8 }}>
        <input type="number" inputMode="numeric" min="1" value={v} onChange={e => setV(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') add() }}
          placeholder="End line reached (m)" aria-label="End line reached in metres" className="neon-min"
          style={{ flex: 1, minWidth: 0, padding: '8px 10px', border: '1px solid var(--border-strong)', borderRadius: 6, fontSize: 15, background: 'var(--bg-primary)', color: 'var(--text)', fontFamily: 'var(--font-sans)' }} />
        <button type="button" className="btn btn-sm neon-save" disabled={!ok} onClick={add}>Add rep</button>
      </div>
      {lines.length > 0 && (
        <p style={{ fontSize: 12, margin: '8px 0 0', color: 'var(--text-secondary)' }}>
          {lines.length} rep{lines.length === 1 ? '' : 's'} · best <b>{best} m line</b> · total <b>{total} m</b>
        </p>
      )}
    </div>
  )
}
