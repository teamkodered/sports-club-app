import { useEffect, useState } from 'react'
import { useAuth } from '../hooks/useAuth.jsx'
import { supabase } from '../lib/supabase.js'

const HOUSE_COLOURS = { 'Dragon House': '#E24B4A', 'Super House': '#378ADD', 'Ice House': '#1D9E75', 'Jet House': '#EF9F27' }

function SortTh({ children, col, sortKey, sortDir, onSort, style = {} }) {
  const active = sortKey === col
  return (
    <th onClick={() => onSort(col)} style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap', color: active ? 'var(--text)' : undefined, ...style }}>
      {children}<span style={{ marginLeft: 4, fontSize: 9, opacity: active ? 1 : 0.4 }}>{active ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}</span>
    </th>
  )
}

export default function Members() {
  const { isAdmin } = useAuth()
  const [members, setMembers]     = useState([])
  const [filtered, setFiltered]   = useState([])
  const [houses, setHouses]       = useState([])
  const [loading, setLoading]     = useState(true)
  const [search, setSearch]       = useState('')
  const [houseFilter, setHouseFilter] = useState('')
  const [roleFilter, setRoleFilter]   = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [editing, setEditing]     = useState(null)
  const [saving, setSaving]       = useState(false)
  const [sortKey, setSortKey]     = useState('last_name')
  const [sortDir, setSortDir]     = useState('asc')

  useEffect(() => { load() }, [])

  async function load() {
    const [{ data: m }, { data: h }] = await Promise.all([
      supabase.from('members').select('*, houses(id,name)').order('last_name'),
      supabase.from('houses').select('id,name').order('name'),
    ])
    setMembers(m || [])
    setHouses(h || [])
    setLoading(false)
  }

  function toggleSort(key) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  useEffect(() => {
    let list = [...members]
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(m => `${m.first_name} ${m.last_name} ${m.email}`.toLowerCase().includes(q))
    }
    if (houseFilter)  list = list.filter(m => m.house_id === houseFilter)
    if (roleFilter)   list = list.filter(m => m.role === roleFilter)
    if (statusFilter) list = list.filter(m => m.status === statusFilter)

    list.sort((a, b) => {
      let aVal, bVal
      switch (sortKey) {
        case 'first_name':   aVal = a.first_name || '';      bVal = b.first_name || '';      break
        case 'last_name':    aVal = a.last_name  || '';      bVal = b.last_name  || '';      break
        case 'email':        aVal = a.email      || '';      bVal = b.email      || '';      break
        case 'house':        aVal = a.houses?.name || '';    bVal = b.houses?.name || '';    break
        case 'role':         aVal = a.role       || '';      bVal = b.role       || '';      break
        case 'status':       aVal = a.status     || '';      bVal = b.status     || '';      break
        case 'joined_date':  aVal = a.joined_date || '';     bVal = b.joined_date || '';     break
        default:             aVal = ''; bVal = ''
      }
      return sortDir === 'asc' ? String(aVal).localeCompare(String(bVal)) : String(bVal).localeCompare(String(aVal))
    })
    setFiltered(list)
  }, [search, houseFilter, roleFilter, statusFilter, members, sortKey, sortDir])

  async function saveEdit() {
    setSaving(true)
    await supabase.from('members').update({
      first_name: editing.first_name, last_name: editing.last_name,
      email: editing.email, phone: editing.phone,
      house_id: editing.house_id, role: editing.role, status: editing.status,
    }).eq('id', editing.id)
    await load()
    setEditing(null)
    setSaving(false)
  }

  const initials = m => `${m.first_name?.[0] || ''}${m.last_name?.[0] || ''}`.toUpperCase()

  if (loading) return <div className="loading">Loading members…</div>

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div className="page-header" style={{ marginBottom: 0 }}>
          <h1>Members</h1>
          <p>{filtered.length} of {members.length} members</p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name or email…"
          style={{ flex: 1, minWidth: 200, padding: '7px 10px', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius)', background: 'var(--bg-secondary)', fontSize: 13, color: 'var(--text)' }} />
        <select value={houseFilter} onChange={e => setHouseFilter(e.target.value)}
          style={{ padding: '7px 10px', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius)', background: 'var(--bg-secondary)', fontSize: 13, color: 'var(--text)' }}>
          <option value="">All houses</option>
          {houses.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
        </select>
        <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)}
          style={{ padding: '7px 10px', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius)', background: 'var(--bg-secondary)', fontSize: 13, color: 'var(--text)' }}>
          <option value="">All roles</option>
          <option value="member">Member</option>
          <option value="captain">Captain</option>
          <option value="admin">Admin</option>
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          style={{ padding: '7px 10px', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius)', background: 'var(--bg-secondary)', fontSize: 13, color: 'var(--text)' }}>
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="pending">Pending</option>
          <option value="inactive">Inactive</option>
          <option value="stopped">Stopped</option>
        </select>
      </div>

      <div className="card" style={{ padding: 0 }}>
        <table>
          <thead>
            <tr>
              <SortTh col="first_name" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>First name</SortTh>
              <SortTh col="last_name"  sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>Last name</SortTh>
              <SortTh col="house"      sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>House</SortTh>
              <SortTh col="role"       sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>Role</SortTh>
              <SortTh col="status"     sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>Status</SortTh>
              <SortTh col="joined_date" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>Joined</SortTh>
              {isAdmin && <th></th>}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-tertiary)', padding: 32 }}>No members found</td></tr>
            ) : filtered.map(m => {
              const colour = HOUSE_COLOURS[m.houses?.name] || '#888'
              return (
                <tr key={m.id}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div className="avatar" style={{ width: 28, height: 28, fontSize: 10, background: colour + '22', color: colour }}>{initials(m)}</div>
                      <div>
                        <div style={{ fontWeight: 500 }}>{m.first_name}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{m.email}</div>
                      </div>
                    </div>
                  </td>
                  <td style={{ fontWeight: 500 }}>{m.last_name}</td>
                  <td>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: colour, display: 'inline-block' }} />
                      {m.houses?.name || '—'}
                    </span>
                  </td>
                  <td style={{ textTransform: 'capitalize' }}>{m.role}</td>
                  <td><span className={`badge ${m.status === 'active' ? 'badge-green' : m.status === 'pending' ? 'badge-amber' : m.status === 'stopped' ? 'badge-red' : 'badge-gray'}`}>{m.status}</span></td>
                  <td style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{m.joined_date || '—'}</td>
                  {isAdmin && <td>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button className="btn btn-sm" onClick={() => setEditing(m)}>Edit</button>
                      {m.status === 'active' && (
                        <button className="btn btn-sm btn-danger" style={{ fontSize: 10 }}
                          onClick={async () => { if (confirm('Mark as stopped training?')) { await supabase.from('members').update({ status: 'stopped' }).eq('id', m.id); load() } }}>
                          Stop
                        </button>
                      )}
                      {m.status === 'stopped' && (
                        <button className="btn btn-sm" style={{ fontSize: 10 }}
                          onClick={async () => { await supabase.from('members').update({ status: 'active' }).eq('id', m.id); load() }}>
                          Reactivate
                        </button>
                      )}
                    </div>
                  </td>}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Archived / Stopped members */}
      <div style={{ marginTop: 20 }}>
        <button className="btn btn-sm" onClick={() => setShowArchived(v => !v)} style={{ marginBottom: 10 }}>
          {showArchived ? '▲ Hide' : '▼ Show'} archived members ({members.filter(m => m.status === 'stopped' || m.status === 'inactive').length})
        </button>
        {showArchived && (
          <div className="card" style={{ padding: 0, opacity: 0.8 }}>
            <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>
              Archived — Stopped / Inactive members
            </div>
            <table>
              <thead><tr><th>Name</th><th>Email</th><th>Status</th><th>House</th>{isAdmin && <th></th>}</tr></thead>
              <tbody>
                {members.filter(m => m.status === 'stopped' || m.status === 'inactive').map(m => (
                  <tr key={m.id} style={{ opacity: 0.7 }}>
                    <td style={{ fontWeight: 500 }}>{m.first_name} {m.last_name}</td>
                    <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{m.email}</td>
                    <td><span className="badge badge-red">{m.status}</span></td>
                    <td style={{ fontSize: 12 }}>{m.houses?.name || '—'}</td>
                    {isAdmin && <td>
                      <button className="btn btn-sm" style={{ fontSize: 10 }}
                        onClick={async () => { await supabase.from('members').update({ status: 'active' }).eq('id', m.id); load() }}>
                        Reactivate
                      </button>
                    </td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editing && isAdmin && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 }}>
          <div className="card" style={{ width: '100%', maxWidth: 440, maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
              <h2 style={{ fontSize: 16, fontWeight: 600 }}>Edit member</h2>
              <button onClick={() => setEditing(null)} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer' }}>✕</button>
            </div>
            <div className="field-row">
              <div className="field"><label>First name</label><input value={editing.first_name} onChange={e => setEditing(v => ({ ...v, first_name: e.target.value }))} /></div>
              <div className="field"><label>Last name</label><input value={editing.last_name} onChange={e => setEditing(v => ({ ...v, last_name: e.target.value }))} /></div>
            </div>
            <div className="field"><label>Email</label><input value={editing.email || ''} onChange={e => setEditing(v => ({ ...v, email: e.target.value }))} /></div>
            <div className="field"><label>Phone</label><input value={editing.phone || ''} onChange={e => setEditing(v => ({ ...v, phone: e.target.value }))} /></div>
            <div className="field"><label>House</label>
              <select value={editing.house_id || ''} onChange={e => setEditing(v => ({ ...v, house_id: e.target.value }))}>
                <option value="">No house</option>
                {houses.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
              </select>
            </div>
            <div className="field-row">
              <div className="field"><label>Role</label>
                <select value={editing.role} onChange={e => setEditing(v => ({ ...v, role: e.target.value }))}>
                  <option value="member">Member</option><option value="captain">Captain</option><option value="admin">Admin</option>
                </select>
              </div>
              <div className="field"><label>Status</label>
                <select value={editing.status} onChange={e => setEditing(v => ({ ...v, status: e.target.value }))}>
                  <option value="active">Active</option><option value="pending">Pending</option><option value="inactive">Inactive</option>
                </select>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn" onClick={() => setEditing(null)}>Cancel</button>
              <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={saveEdit} disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
