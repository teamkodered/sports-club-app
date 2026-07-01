import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../hooks/useAuth.jsx'

const HOUSE_COLOURS = {
  'Dragon House': '#E24B4A', 'Super House': '#378ADD',
  'Ice House': '#1D9E75',    'Jet House':   '#EF9F27',
}

const KB_DIVISIONS  = ['Children', 'Younger Cadet (10-12)', 'Older Cadet (13-15)', 'Junior (16-18)', 'Senior (19-40)', 'Masters (40+)']
const BOX_DIVISIONS = ['Schoolboy', 'Schoolgirl', 'Junior', 'Youth', 'Elite', 'Senior']


// ── PDP Tab Component ──────────────────────────────────────────────────────
const PDP_SECTIONS = [
  { key: 'winning_ways',          label: '🏆 Winning ways',             colour: '#1D9E75', coachOnly: false },
  { key: 'maintain',              label: '✅ Maintain',                  colour: '#378ADD', coachOnly: false },
  { key: 'to_work_on',            label: '🎯 To work on',                colour: '#EF9F27', coachOnly: false },
  { key: 'what_to_do',            label: '📋 What to do',                colour: '#8B5CF6', coachOnly: false },
  { key: 'technical_notes',       label: '⚙️ Technical notes',           colour: '#E24B4A', coachOnly: true  },
  { key: 'tech_maintain',         label: '✅ Technical — maintain',      colour: '#378ADD', coachOnly: true  },
  { key: 'tech_work_on',          label: '🎯 Technical — work on',       colour: '#EF9F27', coachOnly: true  },
  { key: 'tact_maintain',         label: '✅ Tactical — maintain',       colour: '#1D9E75', coachOnly: true  },
  { key: 'tact_work_on',          label: '🎯 Tactical — work on',        colour: '#E24B4A', coachOnly: true  },
  { key: 'psychology_maintain',   label: '🧠 Psychology — maintain',     colour: '#8B5CF6', coachOnly: true  },
  { key: 'psychology_work_on',    label: '🧠 Psychology — work on',      colour: '#7C3AED', coachOnly: true  },
  { key: 'physical_maintain',     label: '💪 Physical — maintain',       colour: '#1D9E75', coachOnly: true  },
  { key: 'physical_work_on',      label: '💪 Physical — work on',        colour: '#059669', coachOnly: true  },
  { key: 'coach_drills',          label: '🥊 Coach drills',              colour: '#E24B4A', coachOnly: true  },
  { key: 'sparring_notes',        label: '🥋 Sparring / partners',       colour: '#854F0B', coachOnly: true  },
  { key: 'notes',                 label: '📝 Coach notes',               colour: '#666',    coachOnly: true  },
  { key: 'athlete_notes',         label: '📝 Your notes',                colour: '#185FA5', coachOnly: false },
]

function PDPTab({ apData, setApData, student, isAdmin }) {
  const [pdpView, setPdpView]       = useState('athlete') // 'athlete' | 'coach'
  const [editSection, setEditSection] = useState(null)
  const [editItems, setEditItems]   = useState([])
  const [newItem, setNewItem]       = useState('')
  const [saving, setSaving]         = useState(false)
  const [sendModal, setSendModal]   = useState(null)
  const [pdpHistory, setPdpHistory] = useState([]) // for undo

  const pdp = apData?.pdp_notes || {}
  const shared = apData?.pdp_shared || {} // items shared to athlete view

  // Sections visible to athlete: non-coachOnly + any shared coach items
  const athleteSections = PDP_SECTIONS.filter(s => !s.coachOnly)

  function startEdit(section) {
    setEditSection(section.key)
    setEditItems([...(pdp[section.key] || [])])
    setNewItem('')
  }

  async function saveSection() {
    setSaving(true)
    const updated = { ...pdp, [editSection]: editItems.filter(i => i.trim()) }
    const { error } = await supabase.from('athlete_profiles')
      .upsert({ student_id: student.id, pdp_notes: updated }, { onConflict: 'student_id' })
    if (!error) {
      setPdpHistory(prev => [...prev.slice(-9), pdp]) // save last 10 states
      setApData(a => ({ ...a, pdp_notes: updated }))
    }
    setEditSection(null)
    setSaving(false)
  }

  async function sendToAthlete(sectionKey) {
    // Copy items from coach section to shared/athlete-visible section
    const items = pdp[sectionKey] || []
    const currentShared = apData?.pdp_shared || {}
    const updatedShared = {
      ...currentShared,
      [sectionKey]: items,
      [`${sectionKey}_sent_at`]: new Date().toISOString(),
    }
    setSaving(true)
    await supabase.from('athlete_profiles')
      .upsert({ student_id: student.id, pdp_shared: updatedShared }, { onConflict: 'student_id' })
    setApData(a => ({ ...a, pdp_shared: updatedShared }))
    setSendModal(null)
    setSaving(false)
  }

  function removeItem(idx) {
    setEditItems(prev => prev.filter((_, i) => i !== idx))
  }

  function addItem() {
    if (!newItem.trim()) return
    setEditItems(prev => [...prev, newItem.trim()])
    setNewItem('')
  }

  const isEmpty = !pdp || Object.keys(pdp).every(k => !Array.isArray(pdp[k]) || pdp[k].length === 0)

  return (
    <div>
      {/* View toggle */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {(isAdmin ? [['athlete','🎽 Athlete'],['coach','👁 Coach'],['split','⇔ Split']] : [['athlete','🎽 Your notes']]).map(([key, label]) => (
          <button key={key} onClick={() => setPdpView(key)} className={pdpView === key ? 'btn btn-primary btn-sm' : 'btn btn-sm'}>
            {label}
          </button>
        ))}
        {isAdmin && pdpView === 'coach' && (
          <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
            {pdpHistory.length > 0 && (
              <button className="btn btn-sm" onClick={async () => {
                const prev = pdpHistory[pdpHistory.length - 1]
                await supabase.from('athlete_profiles').upsert({ student_id: student.id, pdp_notes: prev }, { onConflict: 'student_id' })
                setApData(a => ({ ...a, pdp_notes: prev }))
                setPdpHistory(h => h.slice(0, -1))
              }}>↩ Undo</button>
            )}
            <button className="btn btn-sm" onClick={() => startEdit({ key: 'winning_ways' })}>+ Add / Edit notes</button>
          </div>
        )}
      </div>

      {/* ── SPLIT VIEW ── */}
      {pdpView === 'split' && isAdmin && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          {/* Coach side */}
          <div>
            <h3 style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>👁 Coach view</h3>
            {PDP_SECTIONS.map(section => {
              const items = pdp[section.key] || []
              if (!items.length) return null
              const isShared = !!(shared[section.key]?.length)
              return (
                <div key={section.key} style={{ marginBottom: 8, padding: '10px 12px', borderLeft: `3px solid ${section.colour}`, background: 'var(--bg-secondary)', borderRadius: '0 var(--radius) var(--radius) 0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: section.colour }}>{section.label}</span>
                    {!section.coachOnly && <button style={{ fontSize: 10, padding: '2px 8px', background: isShared ? '#eaf3de' : 'var(--bg)', border: `1px solid ${isShared ? '#3b6d11' : 'var(--border)'}`, borderRadius: 20, cursor: 'pointer', color: isShared ? '#3b6d11' : 'var(--text-secondary)' }}
                      onClick={() => setSendModal(section.key)}>
                      {isShared ? '✓ Shared' : '→ Share'}
                    </button>}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {items.map((item, i) => (
                      <span key={i} style={{ background: section.colour + '15', color: section.colour, borderRadius: 20, padding: '2px 8px', fontSize: 11 }}>{item}</span>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
          {/* Athlete side */}
          <div>
            <h3 style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>🎽 Athlete view</h3>
            {PDP_SECTIONS.filter(s => !s.coachOnly).map(section => {
              const items = shared[section.key] || []
              if (!items.length) return null
              const sentAt = shared[`${section.key}_sent_at`]
              return (
                <div key={section.key} style={{ marginBottom: 8, padding: '10px 12px', borderLeft: `3px solid ${section.colour}`, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '0 var(--radius) var(--radius) 0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: section.colour }}>{section.label}</span>
                    {sentAt && <span style={{ fontSize: 9, color: 'var(--text-tertiary)' }}>{new Date(sentAt).toLocaleDateString('en-GB')}</span>}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {items.map((item, i) => (
                      <span key={i} style={{ background: section.colour + '15', color: section.colour, borderRadius: 20, padding: '2px 8px', fontSize: 11 }}>{item}</span>
                    ))}
                  </div>
                </div>
              )
            })}
            {Object.keys(shared).filter(k => !k.endsWith('_sent_at')).every(k => !(shared[k]?.length)) && (
              <p style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>No notes shared yet — use → Share buttons on the left</p>
            )}
          </div>
        </div>
      )}

      {/* ── ATHLETE VIEW ── */}
      {pdpView === 'athlete' && (
        <div>
          {/* Shared coach notes visible to athlete */}
          {PDP_SECTIONS.filter(s => !s.coachOnly).map(section => {
            // Show athlete_notes always, shared coach sections if sent
            const items = section.key === 'athlete_notes'
              ? (pdp.athlete_notes || [])
              : (shared[section.key] || [])
            if (!items.length) return null
            const sentAt = shared[`${section.key}_sent_at`]
            return (
              <div key={section.key} className="card" style={{ borderLeft: `3px solid ${section.colour}`, borderRadius: '0 var(--border-radius-lg) var(--border-radius-lg) 0', marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <h3 style={{ fontSize: 13, fontWeight: 600, color: section.colour, display: 'flex', alignItems: 'center', gap: 7, margin: 0 }}>
                    <span style={{ cursor: 'grab', color: 'var(--text-tertiary)', fontSize: 16, lineHeight: 1, userSelect: 'none' }}>⋮⋮</span>
                    {section.label}</h3>
                  {sentAt && <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>Sent {new Date(sentAt).toLocaleDateString('en-GB')}</span>}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {items.map((item, i) => (
                    <span key={i} style={{ background: section.colour + '15', color: section.colour, border: `1px solid ${section.colour}30`, borderRadius: 20, padding: '4px 10px', fontSize: 12, fontWeight: 500 }}>{item}</span>
                  ))}
                </div>
              </div>
            )
          })}
          {Object.keys(shared).filter(k => !k.endsWith('_sent_at')).every(k => !(shared[k]?.length)) && !(pdp.athlete_notes?.length) && (
            <div className="empty-state"><h3>No notes yet</h3><p>Your coach hasn't shared any PDP notes yet</p></div>
          )}
        </div>
      )}

      {/* ── COACH VIEW ── */}
      {pdpView === 'coach' && isAdmin && (
        <div>
          {isEmpty && (
            <div className="empty-state" style={{ marginBottom: 16 }}>
              <h3>No PDP notes yet</h3>
              <p>Add notes using the sections below</p>
            </div>
          )}
          {(pdp.section_order
            ? pdp.section_order.map(key => PDP_SECTIONS.find(s => s.key === key)).filter(Boolean)
            : PDP_SECTIONS
          ).map(section => {
            const items = pdp[section.key] || []
            const isShared = !!(shared[section.key]?.length)
            const isEditing = editSection === section.key

            return (
              <div key={section.key} className="card"
                draggable
                onDragStart={e => e.dataTransfer.setData('pdp-section', section.key)}
                onDragOver={e => { e.preventDefault(); e.currentTarget.style.outline = `2px dashed ${section.colour}` }}
                onDragLeave={e => { e.currentTarget.style.outline = 'none' }}
                onDrop={e => {
                  e.preventDefault()
                  e.currentTarget.style.outline = 'none'
                  const fromKey = e.dataTransfer.getData('pdp-section')
                  if (!fromKey || fromKey === section.key) return
                  // Reorder section_order array — move fromKey to position of section.key
                  const currentOrder = pdp.section_order || PDP_SECTIONS.map(s => s.key)
                  const fromIdx = currentOrder.indexOf(fromKey)
                  const toIdx   = currentOrder.indexOf(section.key)
                  if (fromIdx === -1 || toIdx === -1) return
                  const newOrder = [...currentOrder]
                  newOrder.splice(fromIdx, 1)
                  newOrder.splice(toIdx, 0, fromKey)
                  const updated = { ...pdp, section_order: newOrder }
                  supabase.from('athlete_profiles').upsert({ student_id: student.id, pdp_notes: updated }, { onConflict: 'student_id' })
                  setApData(a => ({ ...a, pdp_notes: updated }))
                }}
                style={{ borderLeft: `3px solid ${section.colour}`, borderRadius: '0 var(--border-radius-lg) var(--border-radius-lg) 0', marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: isEditing ? 12 : items.length ? 8 : 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <span style={{ cursor: 'grab', color: 'var(--text-tertiary)', fontSize: 16, lineHeight: 1, userSelect: 'none' }}>⋮⋮</span>
                    <h3 style={{ fontSize: 13, fontWeight: 600, color: section.colour, margin: 0 }}>
                      {section.label}
                      {section.coachOnly && <span style={{ fontSize: 9, color: 'var(--text-tertiary)', marginLeft: 6, fontWeight: 400 }}>coach only</span>}
                      {isShared && !section.coachOnly && <span style={{ fontSize: 9, color: '#1d9e75', marginLeft: 6 }}>✓ shared</span>}
                    </h3>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {!section.coachOnly && items.length > 0 && (
                      <button className="btn btn-sm" style={{ fontSize: 10, background: '#eaf3de', color: '#3b6d11', border: '1px solid #3b6d1140' }}
                        onClick={() => setSendModal(section.key)}>
                        → Send to athlete
                      </button>
                    )}
                    <button className="btn btn-sm" style={{ fontSize: 10 }} onClick={() => isEditing ? setEditSection(null) : startEdit(section)}>
                      {isEditing ? 'Cancel' : items.length ? 'Edit' : '+ Add'}
                    </button>
                  </div>
                </div>

                {!isEditing && items.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {items.map((item, i) => (
                      <span key={i} style={{ background: section.colour + '15', color: section.colour, border: `1px solid ${section.colour}30`, borderRadius: 20, padding: '4px 10px', fontSize: 12 }}>{item}</span>
                    ))}
                  </div>
                )}

                {isEditing && (
                  <div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                      {editItems.map((item, i) => (
                        <span key={i} draggable
                          onDragStart={e => e.dataTransfer.setData('text/plain', i)}
                          onDragOver={e => e.preventDefault()}
                          onDrop={e => {
                            e.preventDefault()
                            const from = parseInt(e.dataTransfer.getData('text/plain'))
                            const to = i
                            if (from === to) return
                            setEditItems(prev => {
                              const next = [...prev]
                              const [moved] = next.splice(from, 1)
                              next.splice(to, 0, moved)
                              return next
                            })
                          }}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: section.colour + '15', color: section.colour, border: `1px solid ${section.colour}30`, borderRadius: 20, padding: '4px 10px', fontSize: 12, cursor: 'grab' }}>
                          <span style={{ fontSize: 10, opacity: 0.5 }}>⠿</span>
                          {item}
                          <button onClick={() => removeItem(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: section.colour, fontSize: 14, lineHeight: 1, padding: 0 }}>×</button>
                        </span>
                      ))}
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                      <input value={newItem} onChange={e => setNewItem(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && addItem()}
                        placeholder="Type and press Enter to add…"
                        style={{ flex: 1, padding: '7px 10px', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius)', fontSize: 13, background: 'var(--bg-secondary)', color: 'var(--text)' }} />
                      <button className="btn btn-sm" onClick={addItem}>Add</button>
                    </div>
                    <button className="btn btn-primary btn-sm" onClick={saveSection} disabled={saving}>
                      {saving ? 'Saving…' : 'Save section'}
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Send to athlete confirmation */}
      {sendModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 }}>
          <div className="card" style={{ maxWidth: 380 }}>
            <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>Send to athlete?</h2>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
              This will share the <strong>{PDP_SECTIONS.find(s => s.key === sendModal)?.label}</strong> notes with {student?.members?.first_name}'s athlete view. They'll be able to see these notes when they log in.
            </p>
            <div style={{ marginBottom: 16, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {(pdp[sendModal] || []).map((item, i) => (
                <span key={i} style={{ background: 'var(--bg-secondary)', borderRadius: 20, padding: '3px 10px', fontSize: 12 }}>{item}</span>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn" onClick={() => setSendModal(null)}>Cancel</button>
              <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={() => sendToAthlete(sendModal)} disabled={saving}>
                {saving ? 'Sending…' : '→ Send to athlete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function AthleteProfiles() {
  const { profile, isAdmin } = useAuth()
  const [students, setStudents]     = useState([])
  const [selected, setSelected]     = useState(null)
  const [apData, setApData]         = useState(null)
  const [loading, setLoading]       = useState(true)
  const [saving, setSaving]         = useState(false)
  const [tab, setTab]               = useState('profile')
  const [search, setSearch]         = useState('')
  const [editing, setEditing]       = useState(false)
  const [editForm, setEditForm]     = useState({})
  const [results, setResults]       = useState(['', ''])
  const [reportTab, setReportTab]   = useState('individual')
  const [reportData, setReportData] = useState(null)
  const [reportLoading, setReportLoading] = useState(false)
  const [reportFrom, setReportFrom] = useState(() => { const d = new Date(); d.setMonth(d.getMonth()-3); return d.toISOString().split('T')[0] })
  const [reportTo, setReportTo]     = useState(new Date().toISOString().split('T')[0])

  useEffect(() => { loadStudents() }, [])

  async function loadStudents() {
    const { data } = await supabase
      .from('students')
      .select('*, members(first_name, last_name, email, date_of_birth, houses(name, colour))')
      .order('created_at')
    setStudents(data || [])
    setLoading(false)
  }

  async function selectStudent(s) {
    setSelected(s)
    setTab('profile')
    setEditing(false)
    setReportData(null)
    const { data } = await supabase
      .from('athlete_profiles')
      .select('*, pdp_notes, pdp_shared')
      .eq('student_id', s.id)
      .single()
    setApData(data || null)
    if (data) {
      setEditForm({
        age_division_kickboxing: data.age_division_kickboxing || '',
        age_division_boxing: data.age_division_boxing || '',
        weight_division: data.weight_division || '',
        kode_red_debut: data.kode_red_debut || '',
        top_achievements: data.top_achievements || '',
        favourite_technique: data.favourite_technique || '',
        training_music: data.training_music || '',
        social_media: data.social_media || '',
        sponsor_links: data.sponsor_links || '',
        show_on_website: data.show_on_website || false,
      })
      setResults(data.recent_results || ['', ''])
    } else {
      setEditForm({
        age_division_kickboxing: '', age_division_boxing: '', weight_division: '',
        kode_red_debut: '', top_achievements: '', favourite_technique: '',
        training_music: '', social_media: '', sponsor_links: '', show_on_website: false,
      })
      setResults(['', ''])
    }
  }

  async function saveProfile() {
    setSaving(true)
    const payload = {
      student_id: selected.id,
      ...editForm,
      recent_results: results.filter(r => r.trim()),
      updated_at: new Date().toISOString(),
    }
    if (apData?.id) {
      await supabase.from('athlete_profiles').update(payload).eq('id', apData.id)
    } else {
      const { data } = await supabase.from('athlete_profiles').insert(payload).select().single()
      setApData(data)
    }
    setApData(p => ({ ...(p || {}), ...payload }))
    setEditing(false)
    setSaving(false)
  }

  async function generateReport() {
    if (!selected) return
    setReportLoading(true)

    const [{ data: pts }, { data: sessions }, { data: tptKb }, { data: tptBox }] = await Promise.all([
      supabase.from('points_log')
        .select('point_type, points_awarded, point_scope, awarded_at')
        .eq('student_id', selected.id)
        .gte('awarded_at', reportFrom)
        .lte('awarded_at', reportTo + 'T23:59:59')
        .order('awarded_at', { ascending: false }),

      supabase.from('fit2fight_sessions')
        .select('session_date, weight_before, weight_after, running, watt_bike, bodyweight')
        .eq('student_id', selected.id)
        .gte('session_date', reportFrom)
        .lte('session_date', reportTo)
        .order('session_date', { ascending: false }),

      supabase.from('tpt_kickboxing')
        .select('assessed_at, weight_kg, straight_punches, push_ups, flat_plank, bleep_test_level, vertical_jump')
        .eq('student_id', selected.id)
        .order('assessed_at', { ascending: false })
        .limit(5),

      supabase.from('tpt_boxing')
        .select('assessed_at, shapes, punch_quality, footwork, defence, heart_grit')
        .eq('student_id', selected.id)
        .order('assessed_at', { ascending: false })
        .limit(5),
    ])

    const totalPts = (pts || []).reduce((s, p) => s + (p.points_awarded || 0), 0)
    const champCount = (pts || []).filter(p => p.point_type === 'Class Champ').length
    const firstWeight = sessions?.find(s => s.weight_before)?.weight_before
    const lastWeight  = [...(sessions || [])].reverse().find(s => s.weight_after)?.weight_after

    setReportData({
      student: selected,
      period: { from: reportFrom, to: reportTo },
      points: { total: totalPts, champ: champCount, log: pts || [] },
      sessions: sessions || [],
      tptKb: tptKb || [],
      tptBox: tptBox || [],
      weightChange: firstWeight && lastWeight ? (parseFloat(lastWeight) - parseFloat(firstWeight)).toFixed(2) : null,
      profile: apData,
    })
    setReportLoading(false)
  }

  const filtered = students.filter(s => {
    if (!search) return true
    const q = search.toLowerCase()
    return `${s.members?.first_name} ${s.members?.last_name} ${s.student_ref}`.toLowerCase().includes(q)
  })

  const m = selected?.members
  const houseName = m?.houses?.name
  const colour = HOUSE_COLOURS[houseName] || '#888'
  const age = m?.date_of_birth
    ? Math.floor((Date.now() - new Date(m.date_of_birth)) / (365.25 * 24 * 60 * 60 * 1000))
    : null
  const initials = `${m?.first_name?.[0] || ''}${m?.last_name?.[0] || ''}`.toUpperCase()

  if (loading) return <div className="loading">Loading athlete profiles…</div>

  return (
    <div style={{ display: 'flex', gap: 16, minHeight: 600 }}>

      {/* ── Left: student list ── */}
      <div style={{ width: 220, flexShrink: 0 }}>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search athletes…"
          style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius)', fontSize: 12, background: 'var(--bg-secondary)', color: 'var(--text)', marginBottom: 8 }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 560, overflowY: 'auto' }}>
          {filtered.map(s => {
            const col = HOUSE_COLOURS[s.members?.houses?.name] || '#888'
            const isSelected = selected?.id === s.id
            return (
              <div key={s.id} onClick={() => selectStudent(s)} style={{
                padding: '9px 10px', borderRadius: 'var(--radius)', cursor: 'pointer',
                background: isSelected ? col + '18' : 'var(--bg)',
                border: `1px solid ${isSelected ? col : 'var(--border)'}`,
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <div style={{ width: 28, height: 28, borderRadius: '50%', background: col + '22', color: col, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, flexShrink: 0 }}>
                  {(s.members?.first_name?.[0] || '') + (s.members?.last_name?.[0] || '')}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {s.members?.first_name} {s.members?.last_name}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{s.student_ref}</div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Right: profile detail ── */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {!selected ? (
          <div className="empty-state" style={{ paddingTop: 80 }}>
            <h3>Select an athlete</h3>
            <p>Choose a student from the list to view their profile</p>
          </div>
        ) : (
          <>
            {/* Athlete header */}
            <div className="card" style={{ marginBottom: 12, borderLeft: `3px solid ${colour}`, borderRadius: '0 var(--border-radius-lg) var(--border-radius-lg) 0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ width: 52, height: 52, borderRadius: '50%', background: colour + '22', color: colour, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 700, flexShrink: 0 }}>
                  {initials}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 17, fontWeight: 600 }}>{m?.first_name} {m?.last_name}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                    {selected.student_ref} · {selected.discipline} · {houseName}
                    {age ? ` · Age ${age}` : ''}
                    {selected.pka_belt || selected.krba_level ? ` · ${selected.pka_belt || selected.krba_level}` : ''}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  {apData?.show_on_website && (
                    <span className="badge badge-green" style={{ fontSize: 10 }}>🌐 On website</span>
                  )}
                  {isAdmin && !editing && (
                    <button className="btn btn-sm" onClick={() => setEditing(true)}>Edit profile</button>
                  )}
                </div>
              </div>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: 14 }}>
              {['profile', 'pdp', 'media', 'report'].map(t => (
                <button key={t} onClick={() => setTab(t)} style={{
                  padding: '8px 16px', fontSize: 13, border: 'none', background: 'none', cursor: 'pointer',
                  borderBottom: `2px solid ${tab === t ? 'var(--text)' : 'transparent'}`,
                  color: tab === t ? 'var(--text)' : 'var(--text-secondary)',
                  fontWeight: tab === t ? 500 : 400, textTransform: 'capitalize',
                }}>{t}</button>
              ))}
            </div>

            {/* ── Profile tab ── */}
            {tab === 'profile' && (
              <>
                {!editing ? (
                  <div>
                    {!apData ? (
                      <div className="empty-state">
                        <h3>No profile yet</h3>
                        <p>Add competition details, achievements and social links</p>
                        {isAdmin && <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={() => setEditing(true)}>Create profile</button>}
                      </div>
                    ) : (
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        <div className="card">
                          <h3 style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, color: colour }}>Competition divisions</h3>
                          {[
                            ['Kickboxing', apData.age_division_kickboxing],
                            ['Boxing', apData.age_division_boxing],
                            ['Weight division', apData.weight_division],
                            ['Kode Red debut', apData.kode_red_debut],
                          ].map(([l, v]) => v && (
                            <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                              <span style={{ color: 'var(--text-secondary)' }}>{l}</span>
                              <span style={{ fontWeight: 500 }}>{v}</span>
                            </div>
                          ))}
                        </div>
                        <div className="card">
                          <h3 style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, color: colour }}>Athlete info</h3>
                          {[
                            ['Favourite technique', apData.favourite_technique],
                            ['Training music', apData.training_music],
                            ['Social media', apData.social_media],
                            ['Sponsors', apData.sponsor_links],
                          ].map(([l, v]) => v && (
                            <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                              <span style={{ color: 'var(--text-secondary)' }}>{l}</span>
                              <span style={{ fontWeight: 500, maxWidth: '55%', textAlign: 'right' }}>{v}</span>
                            </div>
                          ))}
                        </div>
                        {apData.top_achievements && (
                          <div className="card" style={{ gridColumn: '1/-1' }}>
                            <h3 style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: colour }}>🏆 Top achievements</h3>
                            <p style={{ fontSize: 13, lineHeight: 1.6 }}>{apData.top_achievements}</p>
                          </div>
                        )}
                        {apData.recent_results?.length > 0 && (
                          <div className="card" style={{ gridColumn: '1/-1' }}>
                            <h3 style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Recent results</h3>
                            {apData.recent_results.map((r, i) => (
                              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                                <span style={{ fontSize: 16 }}>🎖</span>{r}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  /* Edit form */
                  <div className="card">
                    <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: 14 }}>Edit athlete profile</h2>
                    <div className="field-row">
                      <div className="field"><label>Age division (kickboxing)</label>
                        <select value={editForm.age_division_kickboxing} onChange={e => setEditForm(f => ({ ...f, age_division_kickboxing: e.target.value }))}>
                          <option value="">Select…</option>{KB_DIVISIONS.map(d => <option key={d}>{d}</option>)}
                        </select>
                      </div>
                      <div className="field"><label>Age division (boxing)</label>
                        <select value={editForm.age_division_boxing} onChange={e => setEditForm(f => ({ ...f, age_division_boxing: e.target.value }))}>
                          <option value="">Select…</option>{BOX_DIVISIONS.map(d => <option key={d}>{d}</option>)}
                        </select>
                      </div>
                    </div>
                    <div className="field-row">
                      <div className="field"><label>Weight division</label><input value={editForm.weight_division} onChange={e => setEditForm(f => ({ ...f, weight_division: e.target.value }))} placeholder="e.g. -47kg, 63-69kg" /></div>
                      <div className="field"><label>Kode Red debut</label><input type="date" value={editForm.kode_red_debut} onChange={e => setEditForm(f => ({ ...f, kode_red_debut: e.target.value }))} /></div>
                    </div>
                    <div className="field"><label>Top achievements to date</label>
                      <textarea rows={3} value={editForm.top_achievements} onChange={e => setEditForm(f => ({ ...f, top_achievements: e.target.value }))}
                        placeholder="Gold at nationals, Bronze at WAKO Europeans…" style={{ resize: 'none' }} />
                    </div>
                    <div style={{ marginBottom: 12 }}>
                      <label style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 500, display: 'block', marginBottom: 6 }}>Recent results</label>
                      {results.map((r, i) => (
                        <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                          <input value={r} onChange={e => { const next = [...results]; next[i] = e.target.value; setResults(next) }}
                            placeholder={`Result ${i + 1}`}
                            style={{ flex: 1, padding: '7px 10px', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius)', fontSize: 13, background: 'var(--bg-secondary)', color: 'var(--text)' }} />
                          {results.length > 1 && <button onClick={() => setResults(results.filter((_, idx) => idx !== i))} style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: 16 }}>×</button>}
                        </div>
                      ))}
                      <button className="btn btn-sm" onClick={() => setResults([...results, ''])}>+ Add result</button>
                    </div>
                    <div className="field-row">
                      <div className="field"><label>Favourite technique</label><input value={editForm.favourite_technique} onChange={e => setEditForm(f => ({ ...f, favourite_technique: e.target.value }))} placeholder="e.g. Chop kick" /></div>
                      <div className="field"><label>Training music</label><input value={editForm.training_music} onChange={e => setEditForm(f => ({ ...f, training_music: e.target.value }))} placeholder="e.g. Drum & bass" /></div>
                    </div>
                    <div className="field"><label>Social media</label><input value={editForm.social_media} onChange={e => setEditForm(f => ({ ...f, social_media: e.target.value }))} placeholder="e.g. Instagram @athlete_name" /></div>
                    <div className="field"><label>Sponsor / GoFundMe links</label><input value={editForm.sponsor_links} onChange={e => setEditForm(f => ({ ...f, sponsor_links: e.target.value }))} placeholder="Sponsor name + link" /></div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                      <input type="checkbox" id="website" checked={editForm.show_on_website} onChange={e => setEditForm(f => ({ ...f, show_on_website: e.target.checked }))} style={{ width: 15, height: 15 }} />
                      <label htmlFor="website" style={{ fontSize: 13, cursor: 'pointer' }}>Show profile on website</label>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="btn" onClick={() => setEditing(false)}>Cancel</button>
                      <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={saveProfile} disabled={saving}>{saving ? 'Saving…' : 'Save profile'}</button>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* ── PDP tab ── */}
            {tab === 'pdp' && (
              <PDPTab
                apData={apData}
                setApData={setApData}
                student={selected}
                isAdmin={isAdmin}
              />
            )}

                        {/* ── Media tab ── */}
            {tab === 'media' && (
              <div>
                <div className="card" style={{ marginBottom: 12 }}>
                  <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Media files</h2>
                  <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 14 }}>
                    Upload photos, videos, and documents for this athlete. Files are stored in Supabase Storage.
                  </p>
                  <div style={{ border: '2px dashed var(--border-strong)', borderRadius: 'var(--radius)', padding: '28px 20px', textAlign: 'center', color: 'var(--text-secondary)', marginBottom: 12 }}>
                    <div style={{ fontSize: 28, marginBottom: 8 }}>📁</div>
                    <p style={{ fontSize: 13, marginBottom: 8 }}>Drag files here or click to upload</p>
                    <p style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Photos, videos, PDFs — max 50MB per file</p>
                    <input type="file" multiple accept="image/*,video/*,.pdf" style={{ display: 'none' }} id="file-upload"
                      onChange={async e => {
                        const files = Array.from(e.target.files)
                        for (const file of files) {
                          const path = `athletes/${selected.id}/${Date.now()}-${file.name}`
                          const { data, error } = await supabase.storage.from('athlete-media').upload(path, file)
                          if (!error) {
                            const { data: urlData } = supabase.storage.from('athlete-media').getPublicUrl(path)
                            const existing = apData?.media_files || []
                            const updated = [...existing, { name: file.name, url: urlData.publicUrl, type: file.type, uploaded_at: new Date().toISOString() }]
                            await supabase.from('athlete_profiles').upsert({ student_id: selected.id, media_files: updated }, { onConflict: 'student_id' })
                            setApData(p => ({ ...(p || {}), media_files: updated }))
                          }
                        }
                      }} />
                    <label htmlFor="file-upload" className="btn btn-primary" style={{ display: 'inline-flex', marginTop: 10, cursor: 'pointer' }}>Choose files</label>
                  </div>

                  {apData?.media_files?.length > 0 ? (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 8 }}>
                      {apData.media_files.map((f, i) => (
                        <div key={i} style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden', background: 'var(--bg-secondary)' }}>
                          {f.type?.startsWith('image') ? (
                            <img src={f.url} alt={f.name} style={{ width: '100%', height: 80, objectFit: 'cover', display: 'block' }} />
                          ) : (
                            <div style={{ height: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28 }}>
                              {f.type?.includes('video') ? '🎥' : '📄'}
                            </div>
                          )}
                          <div style={{ padding: '6px 8px' }}>
                            <div style={{ fontSize: 10, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</div>
                            <a href={f.url} target="_blank" rel="noreferrer" style={{ fontSize: 10, color: '#185fa5' }}>View</a>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p style={{ fontSize: 13, color: 'var(--text-tertiary)', textAlign: 'center', padding: '16px 0' }}>No media files yet</p>
                  )}
                </div>

                <div className="card">
                  <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>Media restriction</h2>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {['Yes', 'No', 'Limited'].map(v => (
                      <button key={v} onClick={async () => {
                        await supabase.from('students').update({ media_restriction: v }).eq('id', selected.id)
                        setSelected(s => ({ ...s, media_restriction: v }))
                      }} style={{
                        padding: '6px 14px', borderRadius: 'var(--radius)', fontSize: 13, cursor: 'pointer',
                        border: `1px solid ${selected.media_restriction === v ? 'var(--text)' : 'var(--border-strong)'}`,
                        background: selected.media_restriction === v ? 'var(--text)' : 'var(--bg)',
                        color: selected.media_restriction === v ? 'var(--bg)' : 'var(--text)',
                        fontFamily: 'var(--font-sans)',
                      }}>{v === 'Yes' ? '✅ Media OK' : v === 'No' ? '🚫 No media' : '⚠️ Limited'}</button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ── Report tab ── */}
            {tab === 'report' && (
              <div>
                <div className="card" style={{ marginBottom: 12 }}>
                  <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Generate student report</h2>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--bg-secondary)', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius)', padding: '6px 10px' }}>
                      <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>From</span>
                      <input type="date" value={reportFrom} onChange={e => setReportFrom(e.target.value)}
                        style={{ border: 'none', background: 'transparent', fontSize: 13, color: 'var(--text)', outline: 'none' }} />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--bg-secondary)', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius)', padding: '6px 10px' }}>
                      <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>To</span>
                      <input type="date" value={reportTo} onChange={e => setReportTo(e.target.value)}
                        style={{ border: 'none', background: 'transparent', fontSize: 13, color: 'var(--text)', outline: 'none' }} />
                    </div>
                    <button className="btn btn-primary" onClick={generateReport} disabled={reportLoading}>
                      {reportLoading ? 'Generating…' : 'Generate report'}
                    </button>
                  </div>
                </div>

                {reportData && (
                  <div id="report-content">
                    {/* Report header */}
                    <div className="card" style={{ marginBottom: 12, borderLeft: `3px solid ${colour}`, borderRadius: '0 var(--border-radius-lg) var(--border-radius-lg) 0' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
                        <div style={{ width: 48, height: 48, borderRadius: '50%', background: colour + '22', color: colour, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 700 }}>{initials}</div>
                        <div>
                          <div style={{ fontSize: 17, fontWeight: 600 }}>{m?.first_name} {m?.last_name}</div>
                          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                            {selected.student_ref} · {selected.discipline} · {houseName} · {selected.pka_belt || selected.krba_level}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>
                            Report period: {new Date(reportFrom).toLocaleDateString('en-GB')} – {new Date(reportTo).toLocaleDateString('en-GB')}
                          </div>
                        </div>
                      </div>

                      {/* Summary stats */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                        {[
                          { label: 'Total points', value: reportData.points.total, colour: colour },
                          { label: 'Class champ', value: `🏆 ${reportData.points.champ}x`, colour: '#EF9F27' },
                          { label: 'Sessions', value: reportData.sessions.length, colour: '#378ADD' },
                          { label: 'Weight change', value: reportData.weightChange ? `${reportData.weightChange > 0 ? '+' : ''}${reportData.weightChange}kg` : '—', colour: '#1D9E75' },
                        ].map(s => (
                          <div key={s.label} style={{ background: s.colour + '12', borderRadius: 'var(--radius)', padding: '10px 12px', textAlign: 'center' }}>
                            <div style={{ fontSize: 20, fontWeight: 700, color: s.colour }}>{s.value}</div>
                            <div style={{ fontSize: 10, color: s.colour, marginTop: 2 }}>{s.label}</div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Points breakdown */}
                    {reportData.points.log.length > 0 && (
                      <div className="card" style={{ marginBottom: 12, padding: 0 }}>
                        <div style={{ padding: '12px 14px 10px', fontWeight: 600, fontSize: 13, borderBottom: '1px solid var(--border)' }}>
                          Points log ({reportData.points.log.length} entries)
                        </div>
                        <table>
                          <thead><tr><th>Date</th><th>Type</th><th>Scope</th><th style={{ textAlign: 'right' }}>Pts</th></tr></thead>
                          <tbody>
                            {reportData.points.log.slice(0, 15).map((p, i) => (
                              <tr key={i}>
                                <td style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{new Date(p.awarded_at).toLocaleDateString('en-GB')}</td>
                                <td style={{ fontSize: 13 }}>{p.point_type}</td>
                                <td><span className={`badge ${p.point_scope === 'both' ? 'badge-green' : 'badge-blue'}`} style={{ fontSize: 10 }}>{p.point_scope}</span></td>
                                <td style={{ textAlign: 'right', fontWeight: 700, fontSize: 13, color: p.points_awarded < 0 ? '#a32d2d' : '#1d9e75' }}>
                                  {p.points_awarded > 0 ? '+' : ''}{p.points_awarded}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {reportData.points.log.length > 15 && (
                          <div style={{ padding: '8px 14px', fontSize: 12, color: 'var(--text-tertiary)' }}>
                            +{reportData.points.log.length - 15} more entries
                          </div>
                        )}
                      </div>
                    )}

                    {/* TPT snapshots */}
                    {(reportData.tptKb.length > 0 || reportData.tptBox.length > 0) && (
                      <div className="card" style={{ marginBottom: 12 }}>
                        <h3 style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Latest TPT assessments</h3>
                        {reportData.tptKb[0] && (
                          <div style={{ marginBottom: 10 }}>
                            <div style={{ fontSize: 12, fontWeight: 600, color: '#378ADD', marginBottom: 6 }}>Kickboxing TPT — {new Date(reportData.tptKb[0].assessed_at).toLocaleDateString('en-GB')}</div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                              {[
                                ['Weight', `${reportData.tptKb[0].weight_kg}kg`],
                                ['Punches', reportData.tptKb[0].straight_punches],
                                ['Push-ups', reportData.tptKb[0].push_ups],
                                ['Plank', `${reportData.tptKb[0].flat_plank}s`],
                                ['Bleep test', reportData.tptKb[0].bleep_test_level],
                                ['Vert. jump', `${reportData.tptKb[0].vertical_jump}cm`],
                              ].filter(([, v]) => v !== null && v !== undefined).map(([l, v]) => (
                                <div key={l} style={{ background: 'var(--bg-secondary)', borderRadius: 'var(--radius)', padding: '7px 10px' }}>
                                  <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{l}</div>
                                  <div style={{ fontSize: 14, fontWeight: 600 }}>{v}</div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        {reportData.tptBox[0] && (
                          <div>
                            <div style={{ fontSize: 12, fontWeight: 600, color: '#E24B4A', marginBottom: 6 }}>Boxing TPT — {new Date(reportData.tptBox[0].assessed_at).toLocaleDateString('en-GB')}</div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                              {[['Shape', reportData.tptBox[0].shapes], ['Punch quality', reportData.tptBox[0].punch_quality], ['Footwork', reportData.tptBox[0].footwork], ['Defence', reportData.tptBox[0].defence], ['Heart/grit', reportData.tptBox[0].heart_grit]].map(([l, v]) => (
                                <div key={l} style={{ background: 'var(--bg-secondary)', borderRadius: 'var(--radius)', padding: '7px 10px' }}>
                                  <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{l}</div>
                                  <div style={{ fontSize: 14, fontWeight: 600 }}>{v}/10</div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Competition profile */}
                    {reportData.profile && (
                      <div className="card" style={{ marginBottom: 12 }}>
                        <h3 style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Competition profile</h3>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                          {[
                            ['Kickboxing division', reportData.profile.age_division_kickboxing],
                            ['Weight division', reportData.profile.weight_division],
                            ['Top achievements', reportData.profile.top_achievements],
                            ['Fav. technique', reportData.profile.favourite_technique],
                          ].filter(([, v]) => v).map(([l, v]) => (
                            <div key={l} style={{ padding: '7px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 2 }}>{l}</div>
                              <div style={{ fontWeight: 500 }}>{v}</div>
                            </div>
                          ))}
                        </div>
                        {reportData.profile.recent_results?.length > 0 && (
                          <div style={{ marginTop: 10 }}>
                            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>Recent results</div>
                            {reportData.profile.recent_results.map((r, i) => (
                              <div key={i} style={{ fontSize: 13, padding: '4px 0', borderBottom: '1px solid var(--border)' }}>🎖 {r}</div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }}
                      onClick={() => window.print()}>
                      🖨️ Print / save as PDF
                    </button>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
