import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useBackableTab } from '../../hooks/useBackableTab.js'
import { supabase } from '../../lib/supabase.js'

const HOUSE_COLOURS = { Phoenix: '#e24b4a', Titan: '#378add', Viper: '#1d9e75', Storm: '#ef9f27' }

export default function StudentProfile({ student, onClose, isAdmin, embedded = false }) {
  const navigate = useNavigate()
  const [tab, setTab] = useBackableTab('profile')
  const [pointTypes, setPointTypes] = useState([])
  const [pointsLog, setPointsLog] = useState([])
  const [awardForm, setAwardForm] = useState({ point_type: '', scope: 'both', note: '' })
  const [awarding, setAwarding] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editForm, setEditForm] = useState({})
  const [belts, setBelts] = useState([])
  const [houses, setHouses] = useState([])
  const [saving, setSaving] = useState(false)
  const [localStudent, setLocalStudent] = useState(student)
  const [assignedClasses, setAssignedClasses] = useState([])
  const [allClasses, setAllClasses] = useState([])
  const [addingClass, setAddingClass] = useState(false)
  const [addClassSelection, setAddClassSelection] = useState('')
  const [savingClassAdd, setSavingClassAdd] = useState(false)
  const [showMembershipForm, setShowMembershipForm] = useState(false)
  const [membershipForm, setMembershipForm] = useState(null)
  const [membershipFormLoading, setMembershipFormLoading] = useState(false)
  const [uploadingMembershipDoc, setUploadingMembershipDoc] = useState(false)

  async function openMembershipForm() {
    setShowMembershipForm(true)
    if (membershipForm || !localStudent.members?.id) return
    setMembershipFormLoading(true)
    // Fetches every row for this member rather than picking one via a
    // database-level ORDER BY -- a student can genuinely end up with
    // more than one row (e.g. one holding the original structured
    // submission, another created separately just to hold an attached
    // scan), and sorting by submitted_at is unreliable once any row
    // has a null value there, which is exactly what caused a student
    // with a newly-attached scan to still show "no form on file": the
    // wrong row (or neither) got picked. Prefers whichever row
    // actually has a document attached, since that's the most
    // recently-added, most complete one to show.
    const { data } = await supabase.from('membership_forms').select('*').eq('member_id', localStudent.members.id)
    const best = (data || []).find(f => f.document_url) || (data || [])[0] || null
    setMembershipForm(best)
    setMembershipFormLoading(false)
  }

  // Attaches a scanned/photographed copy of the actual original form
  // (e.g. downloaded from wherever it was originally kept, like an old
  // Google Drive folder) to this student's record. If there's no
  // membership_forms row at all yet, this creates a minimal one just
  // to hold the document, rather than requiring a full structured
  // record to exist first -- some students may only ever have the
  // scanned original, with no separately-captured structured data.
  async function uploadMembershipDocument(file) {
    // Temporary diagnostic -- confirms whether this function is even
    // being reached at all, and what member id it would try to use,
    // since the guard right below returns completely silently (no
    // error, nothing) if localStudent.members.id is missing for any
    // reason, which would otherwise look identical to "nothing
    // happened" from the outside.
    alert('Attach scan started. member id: ' + (localStudent.members?.id || 'MISSING'))
    if (!localStudent.members?.id) return
    setUploadingMembershipDoc(true)
    try {
      // Sanitized the same way as the bulk-upload tool -- a raw
      // filename with spaces/parentheses/punctuation (e.g. "P.K.A
      // Membership Application for (De-Reece Williams).pdf") can
      // produce an invalid storage key and silently throw, rather
      // than returning a normal {error}, which is exactly the kind of
      // failure the try/catch below is now here to actually catch and
      // show, instead of failing with nothing visible to the user at
      // all.
      const safeName = file.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]/g, '_')
      const path = `membership-forms/${localStudent.members.id}-${Date.now()}-${safeName}`
      const { error: uploadErr } = await supabase.storage.from('athlete-media').upload(path, file)
      if (uploadErr) { alert('Error uploading document: ' + uploadErr.message); setUploadingMembershipDoc(false); return }
      const { data: urlData } = supabase.storage.from('athlete-media').getPublicUrl(path)
      if (membershipForm?.id) {
        // .select() after an update returns the actual updated row(s) --
        // an empty array here means the update genuinely matched zero
        // rows (e.g. a missing RLS update policy silently blocking it),
        // which Postgres/Supabase does NOT treat as an error by default.
        // Checking only for `error` previously meant this could silently
        // "succeed" while nothing was actually ever saved.
        const { data: updated, error } = await supabase.from('membership_forms').update({ document_url: urlData.publicUrl }).eq('id', membershipForm.id).select()
        if (error) { alert('Error saving document link: ' + error.message); setUploadingMembershipDoc(false); return }
        if (!updated || updated.length === 0) { alert('The document uploaded, but saving the link failed silently (matched 0 rows) -- likely a missing update permission. Please tell your admin.'); setUploadingMembershipDoc(false); return }
        setMembershipForm(f => ({ ...f, document_url: urlData.publicUrl }))
      } else {
        const { data, error } = await supabase.from('membership_forms').insert({
          member_id: localStudent.members.id, form_type: 'unknown', document_url: urlData.publicUrl, submitted_at: new Date().toISOString(),
        }).select().single()
        if (error) { alert('Error creating record: ' + error.message); setUploadingMembershipDoc(false); return }
        setMembershipForm(data)
      }
    } catch (err) {
      // A genuine, previously-uncaught exception (as opposed to a
      // normal {error} response) would otherwise fail completely
      // silently here -- this is exactly the gap that let earlier
      // attempts show no error message at all despite nothing actually
      // saving.
      alert('Unexpected error: ' + (err?.message || String(err)))
    }
    setUploadingMembershipDoc(false)
  }

  useEffect(() => { setLocalStudent(student) }, [student?.id])

  const m = localStudent.members
  const houseName = m?.houses?.name
  const colour = HOUSE_COLOURS[houseName] || '#888'

  useEffect(() => {
    supabase.from('houses').select('id,name').order('name').then(({ data }) => setHouses(data || []))
  }, [])

  useEffect(() => {
    supabase.from('classes').select('*').eq('active', true).order('day_of_week').order('start_time')
      .then(({ data }) => setAllClasses(data || []))
  }, [])

  useEffect(() => {
    loadAssignedClasses()
  }, [localStudent?.id])

  async function loadAssignedClasses() {
    if (!localStudent?.id) return
    const { data } = await supabase.from('student_class_assignments').select('id, class_id, classes(*)').eq('student_id', localStudent.id)
    setAssignedClasses(data || [])
  }

  async function addClassAssignment() {
    if (!addClassSelection) return
    setSavingClassAdd(true)
    const { data, error } = await supabase.from('student_class_assignments')
      .insert({ student_id: localStudent.id, class_id: addClassSelection })
      .select('id, class_id, classes(*)').single()
    if (error) { alert('Error adding class: ' + error.message); setSavingClassAdd(false); return }
    setAssignedClasses(prev => [...prev, data])
    setAddingClass(false)
    setAddClassSelection('')
    setSavingClassAdd(false)
  }

  async function removeClassAssignment(assignmentId) {
    const { error } = await supabase.from('student_class_assignments').delete().eq('id', assignmentId)
    if (error) return alert('Error removing class: ' + error.message)
    setAssignedClasses(prev => prev.filter(a => a.id !== assignmentId))
  }

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

    const { error: logError } = await supabase.from('points_log').insert({
      student_id: localStudent.id,
      house_id: m?.house_id,
      point_type: awardForm.point_type,
      points_awarded: pts,
      point_scope: 'both',
      note: awardForm.note,
    })
    if (logError) {
      alert('Error awarding points: ' + logError.message)
      setAwarding(false)
      return
    }

    const updates = {
      house_points: (localStudent.house_points || 0) + pts,
      individual_points: (localStudent.individual_points || 0) + pts,
    }
    if (awardForm.point_type === 'Class Champion') updates.class_champion_count = (localStudent.class_champion_count || 0) + 1

    const { error: updateError } = await supabase.from('students').update(updates).eq('id', localStudent.id)
    if (updateError) {
      alert('Points were logged, but saving the student total failed: ' + updateError.message)
      setAwarding(false)
      return
    }

    if (houseName) {
      const { error: houseErr } = await supabase.rpc('adjust_house_points', { p_house_name: houseName, p_delta: pts })
      if (houseErr) alert('Points were logged, but the house total failed to update: ' + houseErr.message)
    }

    setLocalStudent(s => ({ ...s, ...updates }))
    setAwardForm(f => ({ ...f, note: '' }))
    await loadPointsLog()
    setAwarding(false)
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

  const [uploadingPhoto, setUploadingPhoto] = useState(false)

  async function uploadStudentPhoto(file) {
    if (!file) return
    setUploadingPhoto(true)
    const path = `student-photos/${localStudent.id}-${Date.now()}-${file.name}`
    const { error } = await supabase.storage.from('athlete-media').upload(path, file)
    if (error) { alert('Error uploading photo: ' + error.message); setUploadingPhoto(false); return }
    const { data: urlData } = supabase.storage.from('athlete-media').getPublicUrl(path)
    const { error: updateError } = await supabase.from('students').update({ photo_url: urlData.publicUrl }).eq('id', localStudent.id)
    if (updateError) { alert('Photo uploaded but saving it to the profile failed: ' + updateError.message); setUploadingPhoto(false); return }
    setLocalStudent(s => ({ ...s, photo_url: urlData.publicUrl }))
    setUploadingPhoto(false)
  }

  const age = calcAge(m?.date_of_birth)
  const initials = `${m?.first_name?.[0] || ''}${m?.last_name?.[0] || ''}`.toUpperCase()
  const currentBelt = localStudent.discipline === 'KRBA' ? localStudent.krba_level : localStudent.pka_belt

  return (
    <>
    <div style={embedded ? {} : { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 16 }}
      onClick={embedded ? undefined : onClose}>
      <div style={embedded
        ? { background: 'var(--bg)' }
        : { background: 'var(--bg)', borderRadius: 'var(--radius-lg)', width: '100%', maxWidth: 580, maxHeight: '92vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
        onClick={embedded ? undefined : e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12 }}>
          {localStudent.photo_url ? (
            <div style={{ position: 'relative', width: 44, height: 44, flexShrink: 0 }}>
              <img src={localStudent.photo_url} alt="" style={{ width: 44, height: 44, borderRadius: '50%', objectFit: 'cover', display: 'block' }} />
              {isAdmin && (
                <>
                  <input type="file" accept="image/*" style={{ display: 'none' }} id="student-photo-replace"
                    onChange={e => uploadStudentPhoto(e.target.files?.[0])} />
                  <label htmlFor="student-photo-replace" title="Replace photo" style={{
                    position: 'absolute', bottom: -2, right: -2, width: 16, height: 16, borderRadius: '50%',
                    background: 'var(--text)', color: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 9, cursor: 'pointer', border: '2px solid var(--bg)',
                  }}>✎</label>
                </>
              )}
            </div>
          ) : isAdmin ? (
            <div style={{ position: 'relative', width: 44, height: 44, flexShrink: 0 }}>
              <div style={{ width: 44, height: 44, borderRadius: '50%', background: colour + '22', color: colour, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 700 }}>
                {uploadingPhoto ? '…' : initials}
              </div>
              {!uploadingPhoto && (
                <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', display: 'flex' }}>
                  <input type="file" accept="image/*" style={{ display: 'none' }} id="student-photo-upload"
                    onChange={e => uploadStudentPhoto(e.target.files?.[0])} />
                  <input type="file" accept="image/*" capture="environment" style={{ display: 'none' }} id="student-photo-camera"
                    onChange={e => uploadStudentPhoto(e.target.files?.[0])} />
                  <label htmlFor="student-photo-upload" title="Upload a photo" style={{
                    flex: 1, cursor: 'pointer', background: 'rgba(0,0,0,0.35)', color: '#fff', fontSize: 12,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50% 0 0 50%',
                  }}>📁</label>
                  <label htmlFor="student-photo-camera" title="Take a photo" style={{
                    flex: 1, cursor: 'pointer', background: 'rgba(0,0,0,0.35)', color: '#fff', fontSize: 12,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '0 50% 50% 0',
                  }}>📷</label>
                </div>
              )}
            </div>
          ) : (
            <div style={{ width: 44, height: 44, borderRadius: '50%', background: colour + '22', color: colour, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 700, flexShrink: 0 }}>{initials}</div>
          )}
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
          {!embedded && (
            <button className="btn btn-sm" onClick={() => {
              const params = new URLSearchParams({ student_id: localStudent.id })
              if (assignedClasses[0]?.class_id) params.set('class_id', assignedClasses[0].class_id)
              navigate(`/registers?${params.toString()}`)
            }} style={{ marginLeft: 8, flexShrink: 0 }}>
              📋 Register
            </button>
          )}
          <button className="btn btn-sm" onClick={openMembershipForm} style={{ marginLeft: 8, flexShrink: 0 }}>
            📄 View Membership
          </button>
          {!embedded && (
            <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--text-secondary)', marginLeft: 8, padding: 8, lineHeight: 1 }}>✕</button>
          )}
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
                      ['Club', localStudent.discipline],
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
                  <div style={{ marginTop: 16 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <h3 style={{ fontSize: 13, fontWeight: 600 }}>Classes</h3>
                      {isAdmin && (
                        <button className="btn btn-sm" onClick={() => { setAddingClass(v => !v); setAddClassSelection('') }}>
                          {addingClass ? 'Cancel' : '+ Add class'}
                        </button>
                      )}
                    </div>
                    {addingClass && (
                      <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                        <select value={addClassSelection} onChange={e => setAddClassSelection(e.target.value)} style={{ flex: 1, minWidth: 160 }}>
                          <option value="">— Select a class —</option>
                          {allClasses.filter(cl => !assignedClasses.some(a => a.class_id === cl.id)).map(cl => (
                            <option key={cl.id} value={cl.id}>{cl.name} ({cl.day_of_week} {cl.start_time?.slice(0,5)})</option>
                          ))}
                        </select>
                        <button className="btn btn-sm btn-primary" disabled={!addClassSelection || savingClassAdd} onClick={addClassAssignment}>
                          {savingClassAdd ? '…' : 'Add'}
                        </button>
                      </div>
                    )}
                    {(localStudent.class_schedule || assignedClasses.length === 0) && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: assignedClasses.length > 0 ? 6 : 0 }}>
                        {localStudent.class_schedule ? (
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: 13, background: 'var(--bg-secondary)' }}>
                            <span>{localStudent.class_schedule}{localStudent.class_time ? ` — ${localStudent.class_time}` : ''}</span>
                            <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>Main class</span>
                          </div>
                        ) : assignedClasses.length === 0 && (
                          <p style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>No classes assigned yet.</p>
                        )}
                      </div>
                    )}
                    {assignedClasses.length > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {assignedClasses.map(a => (
                          <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: 13 }}>
                            <span>{a.classes?.name} — {a.classes?.day_of_week} {a.classes?.start_time?.slice(0,5)}</span>
                            {isAdmin && (
                              <button onClick={() => removeClassAssignment(a.id)} style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: 14 }}>×</button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  {isAdmin && (
                    <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
                      <button className="btn btn-sm" onClick={() => { setEditForm({ pka_belt: localStudent.pka_belt, krba_level: localStudent.krba_level, age_category: localStudent.age_category, competition_team: localStudent.competition_team, weight_kg: localStudent.weight_kg, weight_category: localStudent.weight_category, media_restriction: localStudent.media_restriction, media_notes: localStudent.media_notes, medical_conditions: localStudent.medical_conditions, medication: localStudent.medication, house_id: localStudent.members?.house_id || '', is_kr: localStudent.is_kr || false, is_pts: localStudent.is_pts || false, is_leader: localStudent.is_leader || false, is_coach: localStudent.is_coach || false, class_schedule: localStudent.class_schedule || '', class_time: localStudent.class_time || '', class_time_2: localStudent.class_time_2 || '', house_name: localStudent.house_name || '' }); setEditing(true) }}>Edit record</button>
                      {!embedded && (localStudent.is_kr || localStudent.is_pts || localStudent.discipline === 'KRBA') && (
                        <a href={`/athletes?id=${localStudent.id}`} className="btn btn-sm btn-primary">🏅 View athlete profile</a>
                      )}
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
                        <option>Wed/Sun</option>
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
                  <div className="field"><label>Note (optional)</label><input value={awardForm.note} onChange={e => setAwardForm(f => ({ ...f, note: e.target.value }))} placeholder="e.g. Won Monday class champion" /></div>
                  <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 10 }}>Points always count toward both this athlete's individual total and their house's total.</p>
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
                  ['Club', localStudent.discipline],
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

    {showMembershipForm && (
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 16 }}
        onClick={() => setShowMembershipForm(false)}>
        <div style={{ background: '#fff', color: '#111', borderRadius: 'var(--radius-lg)', width: '100%', maxWidth: 680, maxHeight: '92vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
          onClick={e => e.stopPropagation()}>
          <div className="no-print" style={{ padding: '14px 20px', borderBottom: '1px solid #ddd', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>Membership Form</h2>
            <div style={{ display: 'flex', gap: 8 }} className="no-print">
              <label className="btn btn-sm" style={{ cursor: 'pointer' }}>
                {uploadingMembershipDoc ? 'Uploading…' : membershipForm?.document_url ? '📎 Replace scan' : '📎 Attach scan'}
                <input type="file" accept="image/*,application/pdf" style={{ display: 'none' }} disabled={uploadingMembershipDoc}
                  onChange={e => { if (e.target.files[0]) uploadMembershipDocument(e.target.files[0]); e.target.value = '' }} />
              </label>
              {membershipForm && <button className="btn btn-sm" onClick={() => window.print()}>🖨️ Print</button>}
              <button onClick={() => setShowMembershipForm(false)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', padding: 4, lineHeight: 1 }}>✕</button>
            </div>
          </div>
          <div id="membership-form-printable" style={{ padding: 24, overflowY: 'auto' }}>
            {membershipFormLoading ? (
              <p style={{ fontSize: 13, color: '#666' }}>Loading…</p>
            ) : !membershipForm ? (
              <p style={{ fontSize: 13, color: '#666' }}>No membership form on file for this student. If you have the original scanned/photographed copy, use "Attach scan" above to add it.</p>
            ) : (() => {
              const f = membershipForm
              // Shows the form as it was actually submitted -- the
              // name/DOB/contact fields are a snapshot taken at
              // signup time, which can genuinely differ from the
              // student's current record if any of that was corrected
              // or updated since (e.g. a typo fixed, a new phone
              // number) -- this is deliberately the original
              // submission, not a live view of today's record.
              const goalScores = [
                ['Health — Physical Fitness, Stress Reduction, Relaxation', f.goal_health],
                ['Appearance — Weight Control, Muscle Tone, Posture', f.goal_appearance],
                ['Performance — Endurance, Flexibility, Mental Focus', f.goal_performance],
                ['Self Defence — Safety, Confidence, Awareness', f.goal_selfdefence],
              ].filter(([, v]) => v != null)
              const row = (label, value) => (
                <div style={{ display: 'flex', gap: 8, padding: '5px 0', borderBottom: '1px solid #eee', fontSize: 13 }}>
                  <div style={{ width: 200, flexShrink: 0, color: '#555' }}>{label}</div>
                  <div style={{ fontWeight: 500 }}>{value || value === 0 ? value : '—'}</div>
                </div>
              )
              const isKrba = f.form_type === 'krba'
              const isChild = f.form_type === 'pka_child'
              const isAdult = f.form_type === 'pka_adult'
              // 'unknown' means this record only exists to hold an
              // attached scan with no separately-captured structured
              // data behind it -- shown plainly rather than
              // incorrectly defaulting to "Adult" just because it's
              // neither Child nor KRBA specifically.
              const formTitle = isKrba ? 'Membership Application' : isChild ? 'Child Future Student Personal Analysis' : isAdult ? 'Adult Future Student Personal Analysis' : 'Membership Form'
              return (
                <div style={{ fontFamily: 'var(--font-sans)' }}>
                  <div style={{ textAlign: 'center', marginBottom: 18 }}>
                    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 14, marginBottom: 6 }}>
                      {!isKrba && <img src="/images/pka-logo.png" alt="" style={{ height: 44 }} />}
                      {isKrba && <img src="/logos/krba-logo.png" alt="" style={{ height: 44 }} />}
                      <div style={{ fontSize: 20, fontWeight: 800, color: '#111', letterSpacing: 0.3 }}>
                        {isKrba ? 'KR Boxing Academy' : 'Derby PKA Kickboxing'}
                      </div>
                      {!isKrba && <img src="/images/pka-logo.png" alt="" style={{ height: 44 }} />}
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>{formTitle}</div>
                    <div style={{ fontSize: 12, color: '#666' }}>
                      Submitted {f.submitted_at ? new Date(f.submitted_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '—'}
                    </div>
                    {f.document_url && (
                      <div className="no-print" style={{ marginTop: 6 }}>
                        <a href={f.document_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: '#378ADD' }}>📎 View original scanned/photographed form</a>
                      </div>
                    )}
                  </div>
                  {row('Student name', `${f.first_name || ''} ${f.last_name || ''}`.trim())}
                  {row('Date of birth', f.date_of_birth ? new Date(f.date_of_birth + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : null)}
                  {row('Sponsor name', f.sponsor_name)}
                  {row('Parents/Carers', f.parents_carers)}
                  {row('Email', f.email)}
                  {row('Phone', f.phone)}
                  {row('Emergency contact', [f.emergency_contact_name, f.emergency_contact_phone].filter(Boolean).join(' — '))}
                  {row('How did you hear about us?', f.hear_about)}
                  {row('Promo code', f.promo_code)}
                  {row('School', f.school)}
                  {row('Year', f.school_year || f.year)}
                  {row('Other activities', f.other_activities)}
                  {row('Previous club', f.previous_club)}
                  {row('Fitness level', f.fitness_level)}
                  {row('What would you like to accomplish?', f.goal_description)}
                  {row('Additional needs', f.additional_needs)}
                  {row('Medical concerns', f.medical_concerns || f.medical)}
                  {row('Medication', f.medication)}
                  {row('Other contact', f.other_contact)}

                  {goalScores.length > 0 && (
                    <div style={{ marginTop: 14 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Main reason for attending (scored out of 5)</div>
                      {goalScores.map(([label, score]) => (
                        <div key={label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '4px 0', borderBottom: '1px solid #eee' }}>
                          <div>{label}</div>
                          <div style={{ fontWeight: 700 }}>{score}</div>
                        </div>
                      ))}
                    </div>
                  )}
                  {f.goal_notes && (
                    <div style={{ marginTop: 10, fontSize: 12, color: '#555', fontStyle: 'italic' }}>{f.goal_notes}</div>
                  )}

                  <div style={{ marginTop: 16, paddingTop: 12, borderTop: '2px solid #333', fontSize: 13 }}>
                    <strong>Waiver agreed:</strong> {f.waiver_agreed ? '✓ Yes' : 'Not recorded'}
                  </div>
                </div>
              )
            })()}
          </div>
        </div>
      </div>
    )}
    </>
  )
}
