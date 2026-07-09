import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../hooks/useAuth.jsx'

function SortTh({ children, col, sortKey, sortDir, onSort, style = {} }) {
  const active = sortKey === col
  return (
    <th onClick={() => onSort(col)} style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap', color: active ? 'var(--text)' : undefined, ...style }}>
      {children}<span style={{ marginLeft: 4, fontSize: 9, opacity: active ? 1 : 0.4 }}>{active ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}</span>
    </th>
  )
}

export default function Fixtures() {
  const { isAdmin } = useAuth()
  const [tab, setTab]         = useState('upcoming')
  const [fixtures, setFixtures] = useState([])
  const [houses, setHouses]   = useState([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding]   = useState(false)
  const [scoring, setScoring] = useState(null)
  const [form, setForm]       = useState({ date: '', home_house_id: '', away_house_id: '', venue: '' })
  const [scoreForm, setScoreForm] = useState({ home_score: '', away_score: '' })
  const [saving, setSaving]   = useState(false)
  const [sortKey, setSortKey] = useState('date')
  const [sortDir, setSortDir] = useState('desc')
  const [houseFilter, setHouseFilter] = useState('')
  const [venueFilter, setVenueFilter] = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    const [{ data: f }, { data: h }] = await Promise.all([
      supabase.from('fixtures').select('*, home_house:houses!home_house_id(name), away_house:houses!away_house_id(name)').order('date', { ascending: false }),
      supabase.from('houses').select('id,name').order('name'),
    ])
    setFixtures(f || [])
    setHouses(h || [])
    setLoading(false)
  }

  function toggleSort(key) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  const upcoming = fixtures.filter(f => f.status !== 'completed')
  const results  = fixtures.filter(f => f.status === 'completed')
  const list = (tab === 'upcoming' ? upcoming : results)
    .filter(f => !houseFilter || f.home_house_id === houseFilter || f.away_house_id === houseFilter)
    .filter(f => !venueFilter || (f.venue || '').toLowerCase().includes(venueFilter.toLowerCase()))
    .sort((a, b) => {
      let aVal, bVal
      switch (sortKey) {
        case 'date':       aVal = a.date || ''; bVal = b.date || ''; break
        case 'home_house': aVal = a.home_house?.name || ''; bVal = b.home_house?.name || ''; break
        case 'away_house': aVal = a.away_house?.name || ''; bVal = b.away_house?.name || ''; break
        case 'venue':      aVal = a.venue || ''; bVal = b.venue || ''; break
        case 'status':     aVal = a.status || ''; bVal = b.status || ''; break
        default:           aVal = ''; bVal = ''
      }
      return sortDir === 'asc' ? String(aVal).localeCompare(String(bVal)) : String(bVal).localeCompare(String(aVal))
    })

  async function addFixture() {
    setSaving(true)
    await supabase.from('fixtures').insert({ ...form, status: 'scheduled' })
    await load(); setAdding(false)
    setForm({ date: '', home_house_id: '', away_house_id: '', venue: '' })
    setSaving(false)
  }

  async function saveScore() {
    setSaving(true)
    const hs = parseInt(scoreForm.home_score), as_ = parseInt(scoreForm.away_score)
    await supabase.from('fixtures').update({ home_score: hs, away_score: as_, status: 'completed' }).eq('id', scoring.id)
    await load(); setScoring(null); setSaving(false)
  }

  const venues = [...new Set(fixtures.map(f => f.venue).filter(Boolean))].sort()

  if (loading) return <div className="loading">Loading fixtures…</div>

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div className="page-header" style={{ marginBottom: 0 }}>
          <h1>Fixtures</h1>
          <p>{upcoming.length} upcoming · {results.length} played</p>
        </div>
        {isAdmin && <button className="btn btn-primary" onClick={() => setAdding(true)}>+ Add fixture</button>}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <select value={houseFilter} onChange={e => setHouseFilter(e.target.value)}
          style={{ padding: '7px 10px', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius)', background: 'var(--bg-secondary)', fontSize: 13, color: 'var(--text)' }}>
          <option value="">All houses</option>
          {houses.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
        </select>
        <select value={venueFilter} onChange={e => setVenueFilter(e.target.value)}
          style={{ padding: '7px 10px', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius)', background: 'var(--bg-secondary)', fontSize: 13, color: 'var(--text)' }}>
          <option value="">All venues</option>
          {venues.map(v => <option key={v}>{v}</option>)}
        </select>
      </div>

      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border)', marginBottom: 16 }}>
        {['upcoming', 'results'].map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '8px 16px', fontSize: 13, border: 'none', background: 'none', cursor: 'pointer',
            borderBottom: `2px solid ${tab === t ? 'var(--text)' : 'transparent'}`,
            color: tab === t ? 'var(--text)' : 'var(--text-secondary)',
            fontWeight: tab === t ? 500 : 400, textTransform: 'capitalize',
          }}>{t}</button>
        ))}
      </div>

      <div className="card" style={{ padding: 0 }}>
        <table>
          <thead>
            <tr>
              <SortTh col="date" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>Date</SortTh>
              <SortTh col="home_house" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>Home</SortTh>
              <th style={{ textAlign: 'center' }}>{tab === 'results' ? 'Score' : 'vs'}</th>
              <SortTh col="away_house" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>Away</SortTh>
              <SortTh col="venue" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>Venue</SortTh>
              <SortTh col="status" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>Status</SortTh>
              {isAdmin && <th></th>}
            </tr>
          </thead>
          <tbody>
            {list.length === 0 ? (
              <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-tertiary)', padding: 32 }}>No {tab} fixtures</td></tr>
            ) : list.map(f => (
              <tr key={f.id}>
                <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{f.date}</td>
                <td style={{ fontWeight: 500 }}>{f.home_house?.name}</td>
                <td style={{ textAlign: 'center', fontWeight: 600 }}>
                  {f.status === 'completed' ? `${f.home_score} – ${f.away_score}` : <span style={{ color: 'var(--text-tertiary)' }}>vs</span>}
                </td>
                <td style={{ fontWeight: 500 }}>{f.away_house?.name}</td>
                <td style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{f.venue || '—'}</td>
                <td><span className={`badge ${f.status === 'completed' ? 'badge-green' : f.status === 'scheduled' ? 'badge-blue' : 'badge-amber'}`}>{f.status}</span></td>
                {isAdmin && (
                  <td>{f.status !== 'completed' && <button className="btn btn-sm" onClick={() => { setScoring(f); setScoreForm({ home_score: '', away_score: '' }) }}>Add result</button>}</td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add fixture modal */}
      {adding && isAdmin && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 }}>
          <div className="card" style={{ width: '100%', maxWidth: 420 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
              <h2 style={{ fontSize: 16, fontWeight: 600 }}>Add fixture</h2>
              <button onClick={() => setAdding(false)} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer' }}>✕</button>
            </div>
            <div className="field"><label>Date</label><input type="date" value={form.date} onChange={e => setForm(v => ({ ...v, date: e.target.value }))} /></div>
            <div className="field-row">
              <div className="field"><label>Home house</label>
                <select value={form.home_house_id} onChange={e => setForm(v => ({ ...v, home_house_id: e.target.value }))}>
                  <option value="">Select…</option>{houses.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
                </select>
              </div>
              <div className="field"><label>Away house</label>
                <select value={form.away_house_id} onChange={e => setForm(v => ({ ...v, away_house_id: e.target.value }))}>
                  <option value="">Select…</option>{houses.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
                </select>
              </div>
            </div>
            <div className="field"><label>Venue</label><input value={form.venue} onChange={e => setForm(v => ({ ...v, venue: e.target.value }))} placeholder="Main pitch, Hall A…" /></div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn" onClick={() => setAdding(false)}>Cancel</button>
              <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={addFixture} disabled={saving}>{saving ? 'Saving…' : 'Add fixture'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Score modal */}
      {scoring && isAdmin && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 }}>
          <div className="card" style={{ width: '100%', maxWidth: 340 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
              <h2 style={{ fontSize: 16, fontWeight: 600 }}>Add result</h2>
              <button onClick={() => setScoring(null)} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer' }}>✕</button>
            </div>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 14 }}>{scoring.home_house?.name} vs {scoring.away_house?.name}</p>
            <div className="field-row">
              <div className="field"><label>{scoring.home_house?.name}</label><input type="number" min="0" value={scoreForm.home_score} onChange={e => setScoreForm(v => ({ ...v, home_score: e.target.value }))} /></div>
              <div className="field"><label>{scoring.away_house?.name}</label><input type="number" min="0" value={scoreForm.away_score} onChange={e => setScoreForm(v => ({ ...v, away_score: e.target.value }))} /></div>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn" onClick={() => setScoring(null)}>Cancel</button>
              <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={saveScore} disabled={saving}>{saving ? 'Saving…' : 'Save result'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
