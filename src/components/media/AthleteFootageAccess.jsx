import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase.js'

// 👀 Media -> Athlete access: which sessions' CCTV footage athletes can watch in their app (only sessions
// THEY attended). Classes ticked here + their own daytime check-ins (Mon-Fri) outside a session.
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const dayIdx = d => { const i = DAYS.findIndex(x => String(d || '').toLowerCase().startsWith(x.toLowerCase())); return i < 0 ? 9 : i }
export default function AthleteFootageAccess() {
  const [classes, setClasses] = useState([])
  const [cfg, setCfg] = useState(null)
  const [saving, setSaving] = useState(false), [saved, setSaved] = useState(false)
  useEffect(() => {
    Promise.all([
      supabase.from('classes').select('id, name, day_of_week, start_time, end_time, active'),
      supabase.from('settings').select('value').eq('key', 'athlete_footage').maybeSingle(),
    ]).then(([c, s]) => {
      setClasses((c.data || []).filter(x => x.active !== false).sort((a, b) => dayIdx(a.day_of_week) - dayIdx(b.day_of_week) || String(a.start_time).localeCompare(String(b.start_time))))
      setCfg(s.data?.value || { enabled: false, classes: [], day_checkins: false, day_from: '06:00', day_to: '17:00' })
    })
  }, [])
  const chosen = useMemo(() => new Set(cfg?.classes || []), [cfg])
  if (!cfg) return <div className="card">Loading…</div>
  const set = patch => { setCfg(c => ({ ...c, ...patch })); setSaved(false) }
  const tick = (ids, on) => set({ classes: on ? [...new Set([...(cfg.classes || []), ...ids])] : (cfg.classes || []).filter(x => !ids.includes(x)) })
  const isDay = c => dayIdx(c.day_of_week) <= 4 && String(c.start_time || '').slice(0, 5) < '17:00'
  const quick = [
    ['Wed Khaos', classes.filter(c => /^wed/i.test(c.day_of_week || '') && /k?haos/i.test(c.name || ''))],
    ['Wed Boxing', classes.filter(c => /^wed/i.test(c.day_of_week || '') && /boxing/i.test(c.name || ''))],
    ['All Mon–Fri daytime', classes.filter(isDay)],
  ]
  async function save() {
    setSaving(true)
    const { error } = await supabase.from('settings').upsert({ key: 'athlete_footage', value: cfg }, { onConflict: 'key' })
    setSaving(false)
    if (error) return alert('Could not save: ' + error.message)
    setSaved(true)
  }
  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>👀 Athlete access to session footage</h2>
      <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 10 }}>Athletes see CCTV clips only from sessions <b>they attended</b>, in their app. Choose which sessions.</p>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 700, marginBottom: 12, cursor: 'pointer' }}>
        <input type="checkbox" checked={!!cfg.enabled} onChange={e => set({ enabled: e.target.checked })} /> Athletes can watch their session footage
      </label>
      <div style={{ opacity: cfg.enabled ? 1 : 0.5 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
          {quick.map(([l, list]) => { const on = list.length && list.every(c => chosen.has(c.id)); return (
            <button key={l} type="button" className={`btn btn-sm${on ? ' btn-primary' : ''}`} disabled={!list.length} onClick={() => tick(list.map(c => c.id), !on)}>{on ? '✓ ' : '+ '}{l}{list.length ? ` (${list.length})` : ''}</button>) })}
        </div>
        <div style={{ maxHeight: 280, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8, padding: 6, marginBottom: 10 }}>
          {classes.map(c => (
            <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, padding: '3px 4px', cursor: 'pointer' }}>
              <input type="checkbox" checked={chosen.has(c.id)} onChange={e => tick([c.id], e.target.checked)} />
              <span style={{ width: 90, color: 'var(--text-secondary)' }}>{c.day_of_week} {String(c.start_time || '').slice(0, 5)}</span>
              <span style={{ flex: 1 }}>{c.name}</span>
              {chosen.has(c.id) && [['1', 'Bags'], ['2', 'Ring'], ['3', 'Main']].map(([k, l]) => {
                const hidden = (cfg.hidden_cams?.[c.id] || []).includes(k)
                return (
                  <button key={k} type="button" title={hidden ? `${l} camera hidden from athletes for this class -- press to show` : `Press to hide the ${l} camera from athletes for this class`}
                    onClick={e => { e.preventDefault(); const cur = cfg.hidden_cams?.[c.id] || []; set({ hidden_cams: { ...(cfg.hidden_cams || {}), [c.id]: hidden ? cur.filter(x => x !== k) : [...cur, k] } }) }}
                    style={{ fontSize: 10, padding: '1px 6px', borderRadius: 10, border: '1px solid var(--border)', cursor: 'pointer', background: hidden ? '#E24B4A22' : 'transparent', color: hidden ? '#E24B4A' : 'var(--text-secondary)', textDecoration: hidden ? 'line-through' : 'none' }}>
                    {l}
                  </button>
                )
              })}
            </label>
          ))}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', margin: '-4px 0 10px' }}>Bags / Ring / Main next to a ticked class: press a camera to hide it from athletes for that class only (red = hidden).</div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginBottom: 6, cursor: 'pointer' }}>
          <input type="checkbox" checked={!!cfg.day_checkins} onChange={e => set({ day_checkins: e.target.checked })} /> Include their own daytime check-ins outside a session (Mon–Fri)
        </label>
        {cfg.day_checkins && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)', marginBottom: 10, marginLeft: 26 }}>
            between <input type="time" value={cfg.day_from || '06:00'} onChange={e => set({ day_from: e.target.value })} /> and <input type="time" value={cfg.day_to || '17:00'} onChange={e => set({ day_to: e.target.value })} />
          </div>
        )}
      </div>
      <button className="btn btn-primary" disabled={saving} onClick={save}>{saving ? 'Saving…' : saved ? '✓ Saved' : 'Save'}</button>
      <span style={{ fontSize: 12, color: 'var(--text-tertiary)', marginLeft: 10 }}>{(cfg.classes || []).length} class{(cfg.classes || []).length === 1 ? '' : 'es'} opened</span>
    </div>
  )
}
