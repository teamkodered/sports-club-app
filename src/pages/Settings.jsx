import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'

export default function Settings() {
  const [settings, setSettings] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(null)
  const [saved, setSaved] = useState(null)
  const [editKey, setEditKey] = useState(null)
  const [editVal, setEditVal] = useState('')

  // Club info fields
  const [club, setClub] = useState({ name: '', emoji: '', tagline: '', access_code: '' })
  const [clubSaving, setClubSaving] = useState(false)
  const [clubSaved, setClubSaved] = useState(false)

  const [members, setMembers] = useState([])
  const [roleSearch, setRoleSearch] = useState('')
  const [roleSaving, setRoleSaving] = useState(null)

  useEffect(() => { load(); loadMembers() }, [])

  async function loadMembers() {
    const { data } = await supabase.from('members').select('id, first_name, last_name, email, role').order('last_name')
    setMembers(data || [])
  }

  async function updateRole(memberId, newRole) {
    setRoleSaving(memberId)
    await supabase.from('members').update({ role: newRole }).eq('id', memberId)
    setMembers(prev => prev.map(m => m.id === memberId ? { ...m, role: newRole } : m))
    setRoleSaving(null)
  }

  async function load() {
    const { data } = await supabase.from('settings').select('key,value')
    const map = Object.fromEntries((data || []).map(r => [r.key, r.value]))
    // Seed Fit II Fight option defaults so the editor starts pre-filled
    // with what's currently active, rather than looking empty
    if (!map.f2f_run_categories) map.f2f_run_categories = {
      'Distance over time': ['2 Minute Run', '3 Minute Run', '10 Minute Run', '20 Minute Run', '30 Minute Run'],
      'Timed Sprints': ['30m run', '40m run', '50m run', '100m run', '200m run', '300m run', '400m run', '800m run'],
      'Timed Distance Run': ['1600m run', '4800m run', '2K', '5K', '10K', '15K'],
    }
    if (!map.f2f_watt_types) map.f2f_watt_types = ['Interval', 'Power Circuit', 'Sprints']
    if (!map.f2f_interval_modes) map.f2f_interval_modes = ['20 seconds on 20 seconds off', '30 seconds on 30 seconds off', '40 seconds on 20 seconds off']
    if (!map.f2f_bodyweight_types) map.f2f_bodyweight_types = ['Push-ups', 'Pull-ups', 'Squats', 'Dips', 'Sit-ups', 'Burpees', 'Other']
    if (!map.f2f_stretch_options) map.f2f_stretch_options = [
      'Box Splits Stretch', 'Seated toe-touch stretch', 'Arm across the body',
      'Head rotation left and right', 'Hip flexor stretch', 'Standing quad stretch',
      'Hamstring stretch', 'Calf stretch', 'Shoulder rotation', 'Other',
    ]
    if (!map.f2f_test_types) map.f2f_test_types = ['Bleep test', 'Fixed load circuit', '200m sprint', '1600m time trial', '4800m time trial', 'Other']
    if (!map.f2f_technique_types) map.f2f_technique_types = ['Straight punches', 'Round kicks', 'Pads', 'Bag work', 'Combinations', 'Other']
    if (!map.f2f_mentality_types) map.f2f_mentality_types = [
      'Video analysis (Self in competition)', 'Video analysis (Self in training)',
      'Video analysis (Elite athlete in competition)', 'Video analysis (Elite athlete in training)',
      'Meditation', 'Visualisation (Performing a technique)', 'Visualisation (Performing in competition)',
      'Play chess', 'Reading (out loud)', 'Gaming (combat)',
      'Active recovery day (Swimming/Walking/Yoga)',
      'Eye tracking drills', 'Reaction/reflex drills',
      'Ice bath', 'Sleep tracking', 'Nutrition log', 'Hydration tracking', 'Recovery routine',
      'Other',
    ]
    setSettings(map)
    // Load club settings
    setClub({
      name:        map.club_name        || 'KR Centre',
      emoji:       map.club_emoji       || '🔥',
      tagline:     map.club_tagline     || 'Sports Club Portal',
      access_code: map.coach_access_code || 'KODERED2025',
    })
    setLoading(false)
  }

  async function saveClub() {
    setClubSaving(true)
    for (const [k, v] of Object.entries({
      club_name:         club.name,
      club_emoji:        club.emoji,
      club_tagline:      club.tagline,
      coach_access_code: club.access_code,
    })) {
      await supabase.from('settings').upsert({ key: k, value: v, updated_at: new Date().toISOString() }, { onConflict: 'key' })
    }
    setClubSaved(true)
    setTimeout(() => setClubSaved(false), 2500)
    setClubSaving(false)
  }

  async function save(key, value) {
    setSaving(key)
    await supabase.from('settings').upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' })
    setSettings(s => ({ ...s, [key]: value }))
    setSaved(key)
    setTimeout(() => setSaved(null), 2000)
    setSaving(null)
    setEditKey(null)
  }

  function startEdit(key) {
    setEditKey(key)
    const val = settings[key]
    setEditVal(Array.isArray(val) ? val.join('\n') : JSON.stringify(val, null, 2))
  }

  function parseEdit(key) {
    const val = settings[key]
    if (Array.isArray(val)) return editVal.split('\n').map(s => s.trim()).filter(Boolean)
    try { return JSON.parse(editVal) } catch { return editVal }
  }

  if (loading) return <div className="loading">Loading settings…</div>

  function SECTION(label) {
    return (
      <h2 style={{ fontSize: 11, fontWeight: 600, margin: '20px 0 10px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</h2>
    )
  }

  function PointTypesEditor() {
    const pointTypes = settings.point_types || []
    const [localPts, setLocalPts] = useState(pointTypes)
    const [ptSaving, setPtSaving] = useState(false)
    const [ptSaved, setPtSaved] = useState(false)

    useEffect(() => { setLocalPts(settings.point_types || []) }, [settings.point_types])

    function updateItem(idx, field, value) {
      setLocalPts(prev => prev.map((p, i) => i === idx ? { ...p, [field]: value } : p))
    }

    function addItem() {
      setLocalPts(prev => [...prev, { label: 'New reason', points: 1, group: 'General' }])
    }

    function duplicateItem(idx) {
      setLocalPts(prev => {
        const copy = { ...prev[idx], label: prev[idx].label + ' (copy)' }
        const next = [...prev]
        next.splice(idx + 1, 0, copy)
        return next
      })
    }

    function removeItem(idx) {
      setLocalPts(prev => prev.filter((_, i) => i !== idx))
    }

    async function savePoints() {
      setPtSaving(true)
      await supabase.from('settings').upsert({ key: 'point_types', value: localPts }, { onConflict: 'key' })
      setSettings(s => ({ ...s, point_types: localPts }))
      setPtSaving(false)
      setPtSaved(true)
      setTimeout(() => setPtSaved(false), 2000)
    }

    // Group items for display
    const groups = {}
    localPts.forEach((pt, idx) => {
      const g = pt.group || 'General'
      if (!groups[g]) groups[g] = []
      groups[g].push({ ...pt, idx })
    })

    return (
      <div className="card" style={{ marginBottom: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 500 }}>Point types & values</div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>Points on the left, reason on the right. Group field organises sections.</div>
          </div>
          <button className="btn btn-sm btn-primary" onClick={addItem}>+ Add</button>
        </div>

        {Object.entries(groups).map(([groupName, items]) => (
          <div key={groupName} style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>{groupName}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {items.map(item => (
                <div key={item.idx} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input type="number" value={item.points}
                    onChange={e => updateItem(item.idx, 'points', parseInt(e.target.value) || 0)}
                    style={{ width: 60, padding: '6px 8px', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius)', fontSize: 13, fontWeight: 700, textAlign: 'center', background: 'var(--bg-secondary)', color: item.points < 0 ? '#a32d2d' : '#1d9e75' }} />
                  <input value={item.label}
                    onChange={e => updateItem(item.idx, 'label', e.target.value)}
                    placeholder="Reason"
                    style={{ flex: 1, padding: '6px 10px', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius)', fontSize: 13, background: 'var(--bg-secondary)', color: 'var(--text)' }} />
                  <select value={item.group || 'General'}
                    onChange={e => {
                      if (e.target.value === '__new__') {
                        const newGroup = prompt('New category name:')
                        if (newGroup && newGroup.trim()) updateItem(item.idx, 'group', newGroup.trim())
                      } else {
                        updateItem(item.idx, 'group', e.target.value)
                      }
                    }}
                    style={{ width: 110, padding: '6px 8px', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius)', fontSize: 11, background: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>
                    {Object.keys(groups).map(g => <option key={g} value={g}>{g}</option>)}
                    {!Object.keys(groups).includes(item.group || 'General') && <option value={item.group}>{item.group}</option>}
                    <option value="__new__">+ New category…</option>
                  </select>
                  <button onClick={() => duplicateItem(item.idx)} title="Duplicate" style={{ background: 'none', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius)', width: 28, height: 28, cursor: 'pointer', fontSize: 13, color: 'var(--text-secondary)' }}>⧉</button>
                  <button onClick={() => removeItem(item.idx)} title="Delete" style={{ background: 'none', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius)', width: 28, height: 28, cursor: 'pointer', fontSize: 13, color: '#a32d2d' }}>×</button>
                </div>
              ))}
            </div>
          </div>
        ))}

        {localPts.length === 0 && (
          <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 10 }}>No point types yet — click + Add to create one</p>
        )}

        <button className="btn btn-primary btn-sm" onClick={savePoints} disabled={ptSaving}>
          {ptSaving ? 'Saving…' : ptSaved ? '✓ Saved' : 'Save changes'}
        </button>
      </div>
    )
  }

  function ListSetting({ label, settingKey, hint }) {
    const items = settings[settingKey] || []
    const isEditing = editKey === settingKey
    return (
      <div className="card" style={{ marginBottom: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: isEditing ? 10 : 0 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 500 }}>{label}</div>
            {hint && <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>{hint}</div>}
            {!isEditing && <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 6 }}>{items.length} items: {Array.isArray(items) && typeof items[0] === 'string' ? items.join(', ') : JSON.stringify(items)}</div>}
          </div>
          {!isEditing && <button className="btn btn-sm" onClick={() => startEdit(settingKey)}>Edit</button>}
        </div>
        {isEditing && (
          <>
            <textarea value={editVal} onChange={e => setEditVal(e.target.value)}
              rows={Math.max(4, editVal.split('\n').length + 1)}
              style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius)', fontSize: 12, fontFamily: 'monospace', background: 'var(--bg-secondary)', resize: 'vertical' }} />
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 8 }}>
              {typeof (settings[settingKey]?.[0]) === 'string' ? 'One item per line' : 'Edit JSON directly'}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-sm" onClick={() => setEditKey(null)}>Cancel</button>
              <button className="btn btn-sm btn-primary" onClick={() => save(settingKey, parseEdit(settingKey))} disabled={saving === settingKey}>
                {saving === settingKey ? 'Saving…' : saved === settingKey ? '✓ Saved' : 'Save'}
              </button>
            </div>
          </>
        )}
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 640 }}>
      <div className="page-header">
        <h1>Settings</h1>
        <p>Configure club details, belt levels, age categories, point types and Fit II Fight options</p>
      </div>

      {SECTION('Club details')}
      <div className="card" style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 14 }}>Club information</div>
        <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
          <div className="field" style={{ width: 80, flexShrink: 0, marginBottom: 0 }}>
            <label>Emoji / icon</label>
            <input value={club.emoji} onChange={e => setClub(c => ({ ...c, emoji: e.target.value }))}
              placeholder="🔥" style={{ textAlign: 'center', fontSize: 20 }} />
          </div>
          <div className="field" style={{ flex: 1, marginBottom: 0 }}>
            <label>Club name</label>
            <input value={club.name} onChange={e => setClub(c => ({ ...c, name: e.target.value }))}
              placeholder="KR Centre" />
          </div>
        </div>
        <div className="field">
          <label>Tagline / subtitle</label>
          <input value={club.tagline} onChange={e => setClub(c => ({ ...c, tagline: e.target.value }))}
            placeholder="Sports Club Portal" />
        </div>
        <div className="field">
          <label>Coach signup access code</label>
          <input value={club.access_code} onChange={e => setClub(c => ({ ...c, access_code: e.target.value }))}
            placeholder="KODERED2025" style={{ fontFamily: 'monospace', letterSpacing: '0.1em' }} />
          <p className="hint">Share this code with coaches so they can register at /coach-signup</p>
        </div>

        {/* Live preview */}
        <div style={{ background: 'var(--bg-secondary)', borderRadius: 'var(--radius)', padding: '10px 14px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 24 }}>{club.emoji || '🔥'}</span>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>{club.name || 'Club name'}</div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{club.tagline || 'Tagline'}</div>
          </div>
          <span style={{ fontSize: 11, color: 'var(--text-tertiary)', marginLeft: 'auto' }}>Preview</span>
        </div>

        <button className="btn btn-primary" onClick={saveClub} disabled={clubSaving}>
          {clubSaving ? 'Saving…' : clubSaved ? '✓ Saved!' : 'Save club details'}
        </button>
        <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 8 }}>
          Changes take effect after the next page refresh.
        </p>
      </div>

      {SECTION('PKA Belt System')}
      <ListSetting label="Junior belts (under 16)" settingKey="pka_junior_belts" hint="Displayed on PKA student records for members under 16" />
      <ListSetting label="Senior belts (16+)" settingKey="pka_senior_belts" hint="Displayed on PKA student records for members 16 and over" />

      {SECTION('KRBA Levels')}
      <ListSetting label="KRBA boxing levels" settingKey="krba_levels" hint="Used on KRBA student records" />

      {SECTION('Age Categories')}
      <ListSetting label="Age categories" settingKey="age_categories" hint='JSON format: [{"label":"Under 8","min":0,"max":7}, …]' />

      {SECTION('Points System')}
      <PointTypesEditor />

      {SECTION('Fit II Fight Options')}
      <ListSetting label="Running categories & tests" settingKey="f2f_run_categories"
        hint='JSON format: {"Category name": ["Test 1", "Test 2"], …}. Category name determines whether the input is distance (km) or time (mm:ss) — categories containing "Distance" use km, everything else uses time.' />
      <ListSetting label="Watt bike types" settingKey="f2f_watt_types" hint="One per line. 'Custom' interval option is always available automatically and doesn't need to be listed here." />
      <ListSetting label="Watt bike interval modes" settingKey="f2f_interval_modes" hint="One per line, e.g. '30 seconds on 30 seconds off'" />
      <ListSetting label="Bodyweight exercise types" settingKey="f2f_bodyweight_types" hint="One per line" />
      <ListSetting label="Stretch options" settingKey="f2f_stretch_options" hint="One per line" />
      <ListSetting label="Test types" settingKey="f2f_test_types" hint="One per line" />
      <ListSetting label="Technique types" settingKey="f2f_technique_types" hint="One per line" />
      <ListSetting label="Mentality activities" settingKey="f2f_mentality_types" hint="One per line" />

      {SECTION('Roles & Access')}
      <div className="card" style={{ marginBottom: 10 }}>
        <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12 }}>
          Admin — full access · Captain — coach access · Member — student access
        </p>
        <input value={roleSearch} onChange={e => setRoleSearch(e.target.value)} placeholder="🔍 Search by name or email…"
          style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius)', fontSize: 13, background: 'var(--bg-secondary)', color: 'var(--text)', marginBottom: 12 }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {members
            .slice()
            .sort((a, b) => `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`))
            .filter(m => {
              if (!roleSearch) return true
              const q = roleSearch.toLowerCase()
              return `${m.first_name} ${m.last_name} ${m.email}`.toLowerCase().includes(q)
            })
            .map(m => (
            <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{m.first_name} {m.last_name}</div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.email}</div>
              </div>
              <select value={m.role} onChange={e => updateRole(m.id, e.target.value)}
                disabled={roleSaving === m.id}
                style={{ padding: '5px 8px', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius)', fontSize: 12, background: 'var(--bg-secondary)', color: 'var(--text)', minWidth: 110 }}>
                <option value="member">Member</option>
                <option value="captain">Captain</option>
                <option value="admin">Admin</option>
              </select>
              {roleSaving === m.id && <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>…</span>}
            </div>
          ))}
          {members.length === 0 && <p style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>No members found</p>}
        </div>
      </div>

      {SECTION('Supabase Connection')}
      <div className="card">
        <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 12 }}>Database connection</div>
        <div className="field"><label>Supabase URL</label>
          <input placeholder="Set via VITE_SUPABASE_URL in Netlify environment variables" readOnly style={{ opacity: 0.6 }} />
        </div>
        <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Connection credentials are set via environment variables in your Netlify dashboard.</p>
      </div>
    </div>
  )
}
