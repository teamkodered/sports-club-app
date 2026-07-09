import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase.js'

const HOUSE_COLOURS = { Phoenix: '#e24b4a', Titan: '#378add', Viper: '#1d9e75', Storm: '#ef9f27' }

export default function StudentProfile({ student, onClose, isAdmin }) {
  const [tab, setTab] = useState('profile')
  const [pointTypes, setPointTypes] = useState([])
  const [pointsLog, setPointsLog] = useState([])
  const [awardForm, setAwardForm] = useState({ point_type: '', scope: 'both', note: '' })
  const [awarding, setAwarding] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editForm, setEditForm] = useState({})
  const [belts, setBelts] = useState([])
  const [houses, setHouses] = useState([])
  const [saving, setSaving] = useState(false)
  const [inviting, setInviting] = useState(false)
  const [inviteStatus, setInviteStatus] = useState(null) // 'sent' | 'error' | null
  const [localStudent, setLocalStudent] = useState(student)

  const m = localStudent.members
  const houseName = m?.houses?.name
  const colour = HOUSE_COLOURS[houseName] || '#888'

  useEffect(() => {
    supabase.from('houses').select('id,name').order('name').then(({ data }) => setHouses(data || []))
  }, [])

  useEffect(() => {
    loadSettings()
    loadPointsLog()
  }, [])

  async function loadSettings() {
    const { data } = await supabase.from('settings').select('key,value').in('key', ['point_types','pka_junior_belts','pka_senior_belts','krba_levels'])
    if (!data) return
    const map = Object.fromEntries(data.map(r => [r.key, r.value]))
    setPointTypes(map.point_types || [])
    const age = calcAge(m?.date_of_birth)
    if (localStudent.discipline === 'KRBA') setBelts(map.krba_levels || [])
    else if (age < 16) setBelts(map.pka_junior_belts || [])
    else setBelts(map.pka_senior_belts || [])
    if (awardForm.point_type === '' && map.point_types?.length) {
      setAwardForm(f => ({ ...f, point_type: map.point_types[0].label }))
    }
  }

  async function loadPointsLog() {
    const { data } = await supabase
      .from('points_log')
      .select('*')
      .eq('student_id', localStudent.id)
      .order('awarded_at', { ascending: false })
      .limit(20)
    setPointsLog(data || [])
  }

  function calcAge(dob) {
    if (!dob) return 0
    return Math.floor((Date.now() - new Date(dob).getTime()) / (1000 * 60 * 60 * 24 * 365.25))
  }

  function getPointsForType(label) {
    return pointTypes.find(p => p.label === label)?.points || 0
  }

  async function awardPoints() {
    if (!awardForm.point_type) return
    setAwarding(true)
    const pts = getPointsForType(awardForm.point_type)

    await supabase.from('points_log').insert({
      student_id: localStudent.id,
      house_id: m?.house_id,
      point_type: awardForm.point_type,
      points_awarded: pts,
      point_scope: awardForm.scope,
      note: awardForm.note,
    })

    const updates = {}
    if (awardForm.scope === 'house' || awardForm.scope === 'both') updates.house_points = (localStudent.house_points || 0) + pts
    if (awardForm.scope === 'individual' || awardForm.scope === 'both') updates.individual_points = (localStudent.individual_points || 0) + pts
    if (awardForm.point_type === 'Class Champion') updates.class_champion_count = (localStudent.class_champion_count || 0) + 1

    await supabase.from('students').update(updates).eq('id', localStudent.id)
    if (houseName && (awardForm.scope === 'house' || awardForm.scope === 'both')) {
      await supabase.rpc ? null : await supabase.from('houses').update({ points: supabase._housePoints }).eq('name', houseName)
    }

    setLocalStudent(s => ({ ...s, ...updates }))
    setAwardForm(f => ({ ...f, note: '' }))
    await loadPointsLog()
    setAwarding(false)
  }

  async function sendInvite() {
    const email = localStudent.members?.email
    if (!email) return alert('No email address on file for this student.')
    if (!confirm(`Send login invite to ${email}?`)) return
    setInviting(true)
    setInviteStatus(null)
    try {
      const res = await fetch('/.netlify/functions/invite-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, name: `${localStudent.members?.first_name} ${localStudent.members?.last_name}` }),
      })
      const data = await res.json()
      if (data.success) setInviteStatus('sent')
      else setInviteStatus(data.error || 'error')
    } catch (e) {
      setInviteStatus('error')
    }
    setInviting(false)
  }

  async function saveEdit() {
    setSaving(true)
    const { house_id, house_name, ...studentFields } = editForm
    await supabase.from('students').update({ ...studentFields, house_name }).eq('id', localStudent.id)
    if (house_id !== undefined && localStudent.members?.id) {
      await supabase.from('members').update({ house_id }).eq('id', localStudent.member_id)
    }
    setLocalStudent(s => ({ ...s, ...studentFields, members: { ...s.members, house_id } }))
    setEditing(false)
    setSaving(false)
  }

  const age = calcAge(m?.date_of_birth)
  const initials = `${m?.first_name?.[0] || ''}${m?.last_name?.[0] || ''}`.toUpperCase()
  const currentBelt = localStudent.discipline === 'KRBA' ? localStudent.krba_level : localStudent.pka_belt

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 16 }}>
      <div style={{ background: 'var(--bg)', borderRadius: 'var(--radius-lg)', width: '100%', maxWidth: 580, maxHeight: '92vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 44, height: 44, borderRadius: '50%', background: colour + '22', color: colour, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 700, flexShrink: 0 }}>{initials}</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 600 }}>{m?.first_name} {m?.last_name}</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 1 }}>
              {localStudent.student_ref} · Age {age} · {localStudent.discipline} · {currentBelt || 'No grade'}
              {localStudent.media_restriction === 'No' && <span style={{ marginLeft: 6, color: '#a32d2d', fontWeight: 600 }}>⚠ No media</span>}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 18, fontWeight: 700 }}>{localStudent.house_points || 0}</div>
              <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>House pts</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 18, fontWeight: 700 }}>{localStudent.individual_points || 0}</div>
              <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>Indiv. pts</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 18, fontWeight: 700 }}>🏆 {localStudent.class_champion_count || 0}</div>
              <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>Champ</div>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--text-secondary)', marginLeft: 8 }}>✕</button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', paddingLeft: 20 }}>
          {['profile','contact','points','grading'].map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              padding: '9px 14px', fontSize: 12, border: 'none', background: 'none', cursor: 'pointer',
              borderBottom: `2px solid ${tab === t ? 'var(--text)' : 'transparent'}`,
              color: tab === t ? 'var(--text)' : 'var(--text-secondary)',
              fontWeight: tab === t ? 500 : 400, textTransform: 'capitalize'
            }}>{t}</button>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>

          {tab === 'profile' && (
            <div>
              {!editing ? (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0 }}>
                    {[
                      ['Discipline', localStudent.discipline],
                      ['Belt / level', currentBelt || '—'],
                      ['Age category', localStudent.age_category || '—'],
                      ['House', houseName || '—'],
                      ['Competition team', localStudent.competition_team || '—'],
                      ['Weight', localStudent.weight_kg ? `${localStudent.weight_kg} kg` : '—'],
                      ['Weight category', localStudent.weight_category || '—'],
                      ['Media', localStudent.media_restriction],
                      ['Medical', localStudent.medical_conditions || 'None recorded'],
                      ['Medication', localStudent.medication || 'None'],
                      ['Groups', [localStudent.is_kr && 'KR', localStudent.is_pts && 'PTs', localStudent.is_leader && 'Leader', localStudent.is_coach && 'Coach'].filter(Boolean).join(', ') || 'Main class only'],
                    ].map(([label, val]) => (
                      <div key={label} style={{ padding: '9px 0', borderBottom: '1px solid var(--border)' }}>
                        <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginBottom: 2 }}>{label}</div>
                        <div style={{ fontSize: 13, fontWeight: 500 }}>{val}</div>
                      </div>
                    ))}
                  </div>
                  {isAdmin && (
                    <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
                      <button className="btn btn-sm" onClick={() => { setEditForm({ pka_belt: localStudent.pka_belt, krba_level: localStudent.krba_level, age_category: localStudent.age_category, competition_team: localStudent.competition_team, weight_kg: localStudent.weight_kg, weight_category: localStudent.weight_category, media_restriction: localStudent.media_restriction, media_notes: localStudent.media_notes, medical_conditions: localStudent.medical_conditions, medication: localStudent.medication, house_id: localStudent.members?.house_id || '', is_kr: localStudent.is_kr || false, is_pts: localStudent.is_pts || false, is_leader: localStudent.is_leader || false, is_coach: localStudent.is_coach || false, class_schedule: localStudent.class_schedule || '', class_time: localStudent.class_time || '', class_time_2: localStudent.class_time_2 || '', house_name: localStudent.house_name || '' }); setEditing(true) }}>Edit record</button>
                      <button className="btn btn-sm" onClick={sendInvite} disabled={inviting}
                        style={{ color: '#378ADD', borderColor: '#378ADD' }}>
                        {inviting ? 'Sending…' : '✉️ Invite athlete'}
                      </button>
                      {inviteStatus === 'sent' && <span style={{ fontSize: 11, color: '#1d9e75', alignSelf: 'center' }}>✓ Invite sent!</span>}
                      {inviteStatus && inviteStatus !== 'sent' && <span style={{ fontSize: 11, color: '#a32d2d', alignSelf: 'center' }}>⚠ {inviteStatus}</span>}
                    </div>
                  )}
                </>
              ) : (
                <div>
                  <div className="field-row">
                    <div className="field"><label>{localStudent.discipline === 'KRBA' ? 'KRBA level' : 'PKA belt'}</label>
                      <select value={localStudent.discipline === 'KRBA' ? editForm.krba_level : editForm.pka_belt}
                        onChange={e => setEditForm(f => localStudent.discipline === 'KRBA' ? { ...f, krba_level: e.target.value } : { ...f, pka_belt: e.target.value })}>
                        <option value="">Select…</option>
                        {belts.map(b => <option key={b}>{b}</option>)}
                      </select>
                    </div>
                    <div className="field"><label>Age category</label><input value={editForm.age_category || ''} onChange={e => setEditForm(f => ({ ...f, age_category: e.target.value }))} /></div>
                  </div>
                  <div className="field-row">
                    <div className="field"><label>Competition team</label><input value={editForm.competition_team || ''} onChange={e => setEditForm(f => ({ ...f, competition_team: e.target.value }))} /></div>
                    <div className="field"><label>Weight (kg)</label><input type="number" value={editForm.weight_kg || ''} onChange={e => setEditForm(f => ({ ...f, weight_kg: e.target.value }))} /></div>
                  </div>
                  <div className="field"><label>House</label>
                    <select value={editForm.house_id || ''} onChange={e => setEditForm(f => ({ ...f, house_id: e.target.value }))}>
                      <option value="">No house</option>
                      {houses.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
                    </select>
                  </div>
                  <div className="field"><label>House name (display)</label>
                    <select value={editForm.house_name || ''} onChange={e => setEditForm(f => ({ ...f, house_name: e.target.value }))}>
                      <option value="">— No house —</option>
                      <option>Dragon House</option>
                      <option>Super House</option>
                      <option>Ice House</option>
                      <option>Jet House</option>
                    </select>
                  </div>
                  <div className="field-row">
                    <div className="field"><label>Class schedule</label>
                      <select value={editForm.class_schedule || ''} onChange={e => setEditForm(f => ({ ...f, class_schedule: e.target.value }))}>
                        <option value="">— Not set —</option>
                        <option>Mon/Fri</option>
                        <option>Tue/Thu</option>
                        <option>Wednesday</option>
                        <option>Saturday</option>
                        <option>Sunday</option>
                        <option>Derby Moore</option>
                        <option>Moorways</option>
                      </select>
                    </div>
                    <div className="field"><label>Class time</label>
                      <select value={editForm.class_time || ''} onChange={e => setEditForm(f => ({ ...f, class_time: e.target.value }))}>
                        <option value="">— Not set —</option>
                        <option>17:00</option>
                        <option>18:00</option>
                        <option>19:00</option>
                        <option>20:00</option>
                      </select>
                    </div>
                  </div>
                  <div className="field"><label>2nd class time (optional)</label>
                    <select value={editForm.class_time_2 || ''} onChange={e => setEditForm(f => ({ ...f, class_time_2: e.target.value }))}>
                      <option value="">— None —</option>
                      <option>17:00</option>
                      <option>18:00</option>
                      <option>19:00</option>
                      <option>20:00</option>
                    </select>
                  </div>
                  <div className="field"><label>Media restriction</label>
                    <select value={editForm.media_restriction} onChange={e => setEditForm(f => ({ ...f, media_restriction: e.target.value }))}>
                      <option value="Yes">Yes — media OK</option>
                      <option value="No">No — no media</option>
                      <option value="Limited">Limited</option>
                    </select>
                  </div>
                  <div style={{ marginBottom: 12 }}>
                    <label style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 500, display: 'block', marginBottom: 8 }}>Group membership</label>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {[
                        { key: 'is_kr',     label: 'KR Squad',  cls: 'badge-purple' },
                        { key: 'is_pts',    label: 'PTs Squad', cls: 'badge-blue' },
                        { key: 'is_leader', label: 'Leader',    cls: 'badge-green' },
                        { key: 'is_coach',  label: 'Coach',     cls: 'badge-amber' },
                      ].map(g => (
                        <button key={g.key} onClick={() => setEditForm(f => ({ ...f, [g.key]: !f[g.key] }))} style={{
                          padding: '5px 12px', borderRadius: 20, fontSize: 12, cursor: 'pointer',
                          border: `2px solid ${editForm[g.key] ? 'var(--text)' : 'var(--border-strong)'}`,
                          background: editForm[g.key] ? 'var(--text)' : 'var(--bg)',
                          color: editForm[g.key] ? 'var(--bg)' : 'var(--text-secondary)',
                          fontFamily: 'var(--font-sans)', fontWeight: 500,
                        }}>{g.label}</button>
                      ))}
                    </div>
                  </div>
                  <div className="field"><label>Medical conditions</label><textarea rows={2} value={editForm.medical_conditions || ''} onChange={e => setEditForm(f => ({ ...f, medical_conditions: e.target.value }))} style={{ resize: 'none' }} /></div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn" onClick={() => setEditing(false)}>Cancel</button>
                    <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={saveEdit} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
                  </div>
                </div>
              )}
            </div>
          )}

          {tab === 'contact' && (
            <div>
              <h3 style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Contact details</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0, marginBottom: 16 }}>
                {[['Email', m?.email], ['Phone', m?.phone || '—']].map(([l, v]) => (
                  <div key={l} style={{ padding: '9px 0', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginBottom: 2 }}>{l}</div>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{v}</div>
                  </div>
                ))}
              </div>
              {(localStudent.guardian_name || age < 16) && (
                <>
                  <h3 style={{ fontSize: 13, fontWeight: 600, margin: '14px 0 10px' }}>Parent / guardian</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0, marginBottom: 16 }}>
                    {[['Name', localStudent.guardian_name || '—'], ['Relationship', localStudent.guardian_relationship || '—'], ['Phone', localStudent.guardian_phone || '—'], ['Email', localStudent.guardian_email || '—']].map(([l, v]) => (
                      <div key={l} style={{ padding: '9px 0', borderBottom: '1px solid var(--border)' }}>
                        <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginBottom: 2 }}>{l}</div>
                        <div style={{ fontSize: 13, fontWeight: 500 }}>{v}</div>
                      </div>
                    ))}
                  </div>
                </>
              )}
              <h3 style={{ fontSize: 13, fontWeight: 600, margin: '14px 0 10px' }}>Emergency contact</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0 }}>
                {[['Name', localStudent.ec_name || '—'], ['Relationship', localStudent.ec_relationship || '—'], ['Phone', localStudent.ec_phone || '—']].map(([l, v]) => (
                  <div key={l} style={{ padding: '9px 0', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginBottom: 2 }}>{l}</div>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{v}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === 'points' && (
            <div>
              {isAdmin && (
                <div style={{ background: 'var(--bg-secondary)', borderRadius: 'var(--radius)', padding: 14, marginBottom: 16 }}>
                  <h3 style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Award points</h3>
                  <div className="field">
                    <label>Point type</label>
                    <select value={awardForm.point_type} onChange={e => setAwardForm(f => ({ ...f, point_type: e.target.value }))}>
                      {pointTypes.map(p => <option key={p.label} value={p.label}>{p.label} (+{p.points} pts)</option>)}
                    </select>
                  </div>
                  <div className="field">
                    <label>Award to</label>
                    <select value={awardForm.scope} onChange={e => setAwardForm(f => ({ ...f, scope: e.target.value }))}>
                      <option value="both">House + Individual</option>
                      <option value="house">House only</option>
                      <option value="individual">Individual only</option>
                    </select>
                  </div>
                  <div className="field"><label>Note (optional)</label><input value={awardForm.note} onChange={e => setAwardForm(f => ({ ...f, note: e.target.value }))} placeholder="e.g. Won Monday class champion" /></div>
                  <button className="btn btn-primary" style={{ justifyContent: 'center', width: '100%' }} onClick={awardPoints} disabled={awarding}>
                    {awarding ? 'Awarding…' : `Award ${getPointsForType(awardForm.point_type)} points`}
                  </button>
                </div>
              )}

              <h3 style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Points history</h3>
              {pointsLog.length === 0 ? (
                <p style={{ fontSize: 13, color: 'var(--text-tertiary)', textAlign: 'center', padding: 24 }}>No points awarded yet</p>
              ) : pointsLog.map(p => (
                <div key={p.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                  <div>
                    <div style={{ fontWeight: 500 }}>{p.point_type}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{p.note || ''} · {new Date(p.awarded_at).toLocaleDateString()}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className={`badge ${p.point_scope === 'house' ? 'badge-blue' : p.point_scope === 'individual' ? 'badge-purple' : 'badge-green'}`} style={{ fontSize: 10 }}>
                      {p.point_scope}
                    </span>
                    <span style={{ fontWeight: 700, color: 'var(--success)' }}>+{p.points_awarded}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab === 'grading' && (
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0, marginBottom: 16 }}>
                {[
                  ['Discipline', localStudent.discipline],
                  ['Current belt', currentBelt || '—'],
                  ['Class champion', `${localStudent.class_champion_count || 0}x`],
                  ['Individual pts', localStudent.individual_points || 0],
                ].map(([l, v]) => (
                  <div key={l} style={{ padding: '9px 0', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginBottom: 2 }}>{l}</div>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{v}</div>
                  </div>
                ))}
              </div>
              <div style={{ background: 'var(--bg-secondary)', borderRadius: 'var(--radius)', padding: 14 }}>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Grading expression of interest form available via the student portal. Coach approval required before grading.</p>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
