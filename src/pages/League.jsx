import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'

const HOUSE_COLOURS = { Phoenix: '#e24b4a', Titan: '#378add', Viper: '#1d9e75', Storm: '#ef9f27' }

export default function League() {
  const [houses, setHouses] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.from('houses').select('*, members(count)').order('points', { ascending: false }).then(({ data }) => {
      setHouses(data || [])
      setLoading(false)
    })
  }, [])

  if (loading) return <div className="loading">Loading league table…</div>

  return (
    <div>
      <div className="page-header">
        <h1>League table</h1>
        <p>Season 2025/26 standings</p>
      </div>

      <div className="card" style={{ padding: 0 }}>
        <table>
          <thead>
            <tr>
              <th style={{ width: 32 }}>#</th>
              <th>House</th>
              <th style={{ textAlign: 'center' }}>P</th>
              <th style={{ textAlign: 'center' }}>W</th>
              <th style={{ textAlign: 'center' }}>D</th>
              <th style={{ textAlign: 'center' }}>L</th>
              <th style={{ textAlign: 'center' }}>GF</th>
              <th style={{ textAlign: 'center' }}>GA</th>
              <th style={{ textAlign: 'center' }}>GD</th>
              <th style={{ textAlign: 'center', fontWeight: 700 }}>Pts</th>
            </tr>
          </thead>
          <tbody>
            {houses.length === 0 ? (
              <tr><td colSpan={10} style={{ textAlign: 'center', padding: 32, color: 'var(--text-tertiary)' }}>No data yet</td></tr>
            ) : houses.map((h, i) => {
              const played = (h.wins || 0) + (h.draws || 0) + (h.losses || 0)
              const gd = (h.goals_for || 0) - (h.goals_against || 0)
              const colour = HOUSE_COLOURS[h.name] || '#888'
              return (
                <tr key={h.id} style={i === 0 ? { background: '#eaf3de44' } : {}}>
                  <td style={{ color: 'var(--text-tertiary)', fontSize: 12, paddingLeft: 16 }}>{i + 1}</td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ width: 10, height: 10, borderRadius: '50%', background: colour, display: 'inline-block', flexShrink: 0 }} />
                      <span style={{ fontWeight: 500 }}>{h.name}</span>
                    </div>
                  </td>
                  <td style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>{played}</td>
                  <td style={{ textAlign: 'center' }}>{h.wins || 0}</td>
                  <td style={{ textAlign: 'center' }}>{h.draws || 0}</td>
                  <td style={{ textAlign: 'center' }}>{h.losses || 0}</td>
                  <td style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>{h.goals_for || 0}</td>
                  <td style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>{h.goals_against || 0}</td>
                  <td style={{ textAlign: 'center', color: gd >= 0 ? 'var(--success)' : '#a32d2d' }}>{gd >= 0 ? `+${gd}` : gd}</td>
                  <td style={{ textAlign: 'center', fontWeight: 700, fontSize: 15 }}>{h.points || 0}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
