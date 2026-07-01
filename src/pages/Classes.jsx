import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../hooks/useAuth.jsx'

const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday','Mon/Fri','Tue/Thu','Derby Moore','Moorways']

export default function Classes() {
  const { isAdmin } = useAuth()
  const [classes, setClasses]   = useState([])
  const [teams, setTeams]       = useState([]) // dynamic from settings
  const [loading, setLoading]   = useState(true)
  const [adding, setAdding]     = useState(false)
  const [editing, setEditing]   = useState(null)
  const [saving, setSaving]     = useState(false)
  const [form, setForm]         = useState({ name: '', discipline: 'PKA', day_of_week: 'Monday', start_time: '', end_time: '', age_category: '', instructor: '', active: true })
  const nameRef = useRef(null)

  useEffect(() => { load() }, [])
  useEffect(() => { if (adding) setTimeout(() => nameRef.current?.focus(), 100) }, [adding])

  async function load() {
    const [{ data: c }, { data: s }] = await Promise.all([
      supabase.from('classes').select('*').order('day_of_week').order('start_time'),
      supabase.from('settings').select('value').eq('key', 'club_teams').single(),
    ])
    setClasses(c || [])
    // Default teams/disciplines if not set
    setTeams(s?.value || ['PKA', 'KRBA', 'Kode Red', 'Leaders', 'PTs'])
    setLoading(false)
  }

  function set(field) {
    return e => setForm(f => ({ ...f, [field]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      save()
    }
    if (e.key === 'Escape') {
      setAdding(false)
      setEditing(null)
    }
  }

  async function save() {
    if (!form.name) return
    setSaving(true)
    if (editing) {
      await supabase.from('classes').update(form).eq('id', editing.id)
    } else {
      await supabase.from('classes').insert(form)
    }
    await load()
    setAdding(false)
    setEditing(null)
    setForm({ name: '', discipline: 'PKA', day_of_week: 'Monday', start_time: '', end_time: '', age_category: '', instructor: '', active: true })
    setSaving(false)
  }

  async function toggleActive(cls) {
    await supabase.from('classes').update({ active: !cls.active }).eq('id', cls.id)
    await load()
  }

  async function deleteClass(id) {
    if (!confirm('Delete this class? This cannot be undone.')) return
    await supabase.from('classes').delete().eq('id', id)
    await load()
  }

  async function duplicateClass(cls) {
    const { id, created_at, ...rest } = cls
    await supabase.from('classes').insert({ ...rest, name: `${cls.name} (copy)` })
    await load()
  }

  function startEdit(cls) {
    setEditing(cls)
    setForm({ name: cls.name, discipline: cls.discipline, day_of_week: cls.day_of_week, start_time: cls.start_time || '', end_time: cls.end_time || '', age_category: cls.age_category || '', instructor: cls.instructor || '', active: cls.active })
    setAdding(true)
  }

  const grouped = classes.reduce((acc, cls) => {
    const day = cls.day_of_week || 'Other'
    if (!acc[day]) acc[day] = []
    acc[day].push(cls)
    return acc
  }, {})

  if (loading) return <div className="loading">Loading classes…</div>

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div className="page-header" style={{ marginBottom: 0 }}>
          <h1>Classes</h1>
          <p>{classes.filter(c => c.active).length} active · {classes.filter(c => !c.active).length} inactive</p>
        </div>
        {isAdmin && (
          <button className="btn btn-primary" onClick={() => { setEditing(null); setAdding(true) }}>+ Add class</button>
        )}
      </div>

      {Object.entries(grouped).map(([day, dayClasses]) => (
        <div key={day} style={{ marginBottom: 20 }}>
          <h2 style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>{day}</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {dayClasses.map(cls => {
              const colour = cls.discipline === 'PKA' ? '#378add' : cls.discipline === 'KRBA' ? '#e24b4a' : '#1d9e75'
              return (
                <div key={cls.id} className="card" style={{
                  display: 'flex', alignItems: 'center', gap: 14, padding: '12px 16px',
                  opacity: cls.active ? 1 : 0.5,
                  borderLeft: `3px solid ${colour}`,
                  borderRadius: '0 var(--border-radius-lg) var(--border-radius-lg) 0',
                }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 14, fontWeight: 600 }}>{cls.name}</span>
                      <span className="badge badge-blue" style={{ fontSize: 10, background: colour + '18', color: colour }}>{cls.discipline}</span>
                      {!cls.active && <span className="badge badge-gray" style={{ fontSize: 10 }}>Inactive</span>}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 3, display: 'flex', gap: 12 }}>
                      {cls.start_time && <span>🕐 {cls.start_time?.slice(0,5)}–{cls.end_time?.slice(0,5)}</span>}
                      {cls.age_category && <span>👥 {cls.age_category}</span>}
                      {cls.instructor && <span>👤 {cls.instructor}</span>}
                    </div>
                  </div>
                  {isAdmin && (
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="btn btn-sm" onClick={() => startEdit(cls)}>Edit</button>
                      <button className="btn btn-sm" onClick={() => duplicateClass(cls)}>Duplicate</button>
                      <button className="btn btn-sm" onClick={() => toggleActive(cls)}>{cls.active ? 'Deactivate' : 'Activate'}</button>
                      <button className="btn btn-sm btn-danger" onClick={() => deleteClass(cls.id)}>Delete</button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ))}

      {classes.length === 0 && (
        <div className="empty-state"><h3>No classes yet</h3><p>Add your first class to get started</p></div>
      )}

      {/* Add/Edit modal */}
      {adding && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 }}>
          <div className="card" style={{ width: '100%', maxWidth: 460, maxHeight: '90vh', overflowY: 'auto' }} onKeyDown={handleKeyDown}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
              <h2 style={{ fontSize: 16, fontWeight: 600 }}>{editing ? 'Edit class' : 'Add class'}</h2>
              <button onClick={() => { setAdding(false); setEditing(null) }} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer' }}>✕</button>
            </div>
            <div className="field">
              <label>Class name <span className="required">*</span></label>
              <input ref={nameRef} value={form.name} onChange={set('name')} placeholder="e.g. KR Centre, Derby Moore Class" />
            </div>
            <div className="field-row">
              <div className="field">
                <label>Club / Team</label>
                <select value={form.discipline} onChange={set('discipline')}>
                  {teams.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Day</label>
                <select value={form.day_of_week} onChange={set('day_of_week')}>
                  {DAYS.map(d => <option key={d}>{d}</option>)}
                </select>
              </div>
            </div>
            <div className="field-row">
              <div className="field"><label>Start time</label><input type="time" value={form.start_time} onChange={set('start_time')} /></div>
              <div className="field"><label>End time</label><input type="time" value={form.end_time} onChange={set('end_time')} /></div>
            </div>
            <div className="field-row">
              <div className="field"><label>Age category</label><input value={form.age_category} onChange={set('age_category')} placeholder="e.g. Under 8, All" /></div>
              <div className="field"><label>Instructor</label><input value={form.instructor} onChange={set('instructor')} placeholder="Initials or name" /></div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <input type="checkbox" id="active" checked={form.active} onChange={set('active')} style={{ width: 15, height: 15 }} />
              <label htmlFor="active" style={{ fontSize: 13, cursor: 'pointer' }}>Active class</label>
            </div>
            <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 12 }}>Press Enter to save · Esc to cancel</p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn" onClick={() => { setAdding(false); setEditing(null) }}>Cancel</button>
              <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={save} disabled={saving || !form.name}>
                {saving ? 'Saving…' : editing ? 'Save changes' : 'Add class'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
