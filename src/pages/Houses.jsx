import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../hooks/useAuth.jsx'

const HOUSE_COLOURS = { Phoenix: '#e24b4a', Titan: '#378add', Viper: '#1d9e75', Storm: '#ef9f27' }
const HOUSE_EMOJI = { Phoenix: '🔴', Titan: '🔵', Viper: '🟢', Storm: '🟡' }

export default function Houses() {
  const { isAdmin } = useAuth()
  const [houses, setHouses] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    const { data } = await supabase
      .from('houses')
      .select('*, members(count)')
      .order('points', { ascending: false })
    setHouses(data || [])
    setLoading(false)
  }

  async function saveEdit() {
    setSaving(true)
    await supabase.from('houses').update({ name: editing.name, points: editing.points, wins: editing.wins, draws: editing.draws, losses: editing.losses }).eq('id', editing.id)
    await load()
    setEditing(null)
    setSaving(false)
  }

  if (loading) return <div className="loading">Loading houses…</div>

  return (
    <div>
      <div className="page-header">
        <h1>Houses</h1>
        <p>Current season standings by house</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
        {houses.map((h, i) => {
          const colour = HOUSE_COLOURS[h.name] || '#888'
          return (
            <div key={h.id} className="card" style={{ borderLeft: `3px solid ${colour}`, borderRadius: '0 var(--radius-lg) var(--radius-lg) 0' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <div style={{ fontSize: 16, fontWeight: 600 }}>{HOUSE_EMOJI[h.name] || '🏠'} {h.name}</div>
                <span className={`badge ${i === 0 ? 'badge-green' : i === 1 ? 'badge-blue' : i === 2 ? 'badge-amber' : 'badge-gray'}`}>
                  {['1st','2nd','3rd','4th'][i] || `${i+1}th`}
                </span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, textAlign: 'center', marginBottom: 12 }}>
                {[
                  { label: 'Members', value: h.members?.[0]?.count ?? 0 },
                  { label: 'Points', value: h.points || 0 },
                  { label: 'Wins', value: h.wins || 0 },
                ].map(s => (
                  <div key={s.label} style={{ background: 'var(--bg-secondary)', borderRadius: 'var(--radius)', padding: '8px 4px' }}>
                    <div style={{ fontSize: 18, fontWeight: 600 }}>{s.value}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 1 }}>{s.label}</div>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'flex', gap: 12 }}>
                <span>W: {h.wins || 0}</span>
                <span>D: {h.draws || 0}</span>
                <span>L: {h.losses || 0}</span>
              </div>
              {isAdmin && (
                <button className="btn btn-sm" style={{ marginTop: 12, width: '100%', justifyContent: 'center' }} onClick={() => setEditing(h)}>
                  Edit points
                </button>
              )}
            </div>
          )
        })}
      </div>

      {editing && isAdmin && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 }}>
          <div className="card" style={{ width: '100%', maxWidth: 380 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
              <h2 style={{ fontSize: 16, fontWeight: 600 }}>Edit {editing.name}</h2>
              <button onClick={() => setEditing(null)} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer' }}>✕</button>
            </div>
            <div className="field-row">
              <div className="field"><label>Points</label><input type="number" value={editing.points || 0} onChange={e => setEditing(v => ({ ...v, points: +e.target.value }))} /></div>
              <div className="field"><label>Wins</label><input type="number" value={editing.wins || 0} onChange={e => setEditing(v => ({ ...v, wins: +e.target.value }))} /></div>
            </div>
            <div className="field-row">
              <div className="field"><label>Draws</label><input type="number" value={editing.draws || 0} onChange={e => setEditing(v => ({ ...v, draws: +e.target.value }))} /></div>
              <div className="field"><label>Losses</label><input type="number" value={editing.losses || 0} onChange={e => setEditing(v => ({ ...v, losses: +e.target.value }))} /></div>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn" onClick={() => setEditing(null)}>Cancel</button>
              <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={saveEdit} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
