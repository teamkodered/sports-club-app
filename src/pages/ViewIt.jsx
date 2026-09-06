import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import { useFightFootageUpload } from '../hooks/useFightFootageUpload.jsx'
import FightFootagePlayer from '../components/shared/FightFootagePlayer.jsx'

export default function ViewIt() {
  const navigate = useNavigate()
  const { upload, startUpload } = useFightFootageUpload()
  const [footage, setFootage] = useState([])
  const [loaded, setLoaded] = useState(false)
  const [students, setStudents] = useState([])
  const [showUpload, setShowUpload] = useState(false)
  const [uploadForm, setUploadForm] = useState({ title: '', description: '', accessMode: 'coach_only', studentIds: new Set() })
  const [studentSearch, setStudentSearch] = useState('')
  const [file, setFile] = useState(null)
  const [playingUrl, setPlayingUrl] = useState(null)
  const [playingTitle, setPlayingTitle] = useState('')
  const [playingItem, setPlayingItem] = useState(null)
  const [editingAccessId, setEditingAccessId] = useState(null)
  const [editAccessMode, setEditAccessMode] = useState('coach_only')
  const [editStudentIds, setEditStudentIds] = useState(() => new Set())
  const [editStudentSearch, setEditStudentSearch] = useState('')

  useEffect(() => { load() }, [])

  // The actual upload now lives in a shared context (see
  // useFightFootageUpload) so it survives navigating away from this
  // page entirely -- this just refreshes the list here if/when it
  // finishes while the person happens to still be on this screen.
  const prevUploadStatusRef = useRef(null)
  useEffect(() => {
    if (upload?.status === 'done' && prevUploadStatusRef.current !== 'done') load()
    prevUploadStatusRef.current = upload?.status
  }, [upload?.status])

  async function load() {
    const [{ data: f }, { data: s }] = await Promise.all([
      supabase.from('fight_footage').select('*, fight_footage_athletes(student_id, students(members(first_name, last_name)))').order('uploaded_at', { ascending: false }),
      supabase.from('students').select('id, members(first_name, last_name)'),
    ])
    setFootage(f || [])
    setStudents(s || [])
    setLoaded(true)
  }

  function studentName(s) {
    return `${s.members?.first_name || ''} ${s.members?.last_name || ''}`.trim()
  }

  async function handleUpload() {
    if (!file || !uploadForm.title.trim()) { alert('Add a title and choose a video file first.'); return }
    // Fire-and-forget into the shared upload context -- closing this
    // panel and even navigating away doesn't interrupt it, it'll keep
    // going and show progress via the floating indicator instead.
    startUpload({
      file,
      title: uploadForm.title,
      description: uploadForm.description,
      accessMode: uploadForm.accessMode,
      studentIds: uploadForm.studentIds,
    })
    setShowUpload(false)
    setUploadForm({ title: '', description: '', accessMode: 'coach_only', studentIds: new Set() })
    setFile(null)
  }

  async function openFootage(item) {
    const { data: sessionData } = await supabase.auth.getSession()
    const accessToken = sessionData?.session?.access_token
    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/fight-footage-url`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ mode: 'read', footage_id: item.id }),
    })
    const data = await res.json()
    if (data.error) { alert('Could not open this video: ' + data.error); return }
    setPlayingUrl(data.url)
    setPlayingTitle(item.title)
    setPlayingItem(item)
  }

  function startEditAccess(item) {
    setEditingAccessId(item.id)
    setEditAccessMode(item.access_mode)
    setEditStudentIds(new Set((item.fight_footage_athletes || []).map(a => a.student_id)))
    setEditStudentSearch('')
  }

  async function saveEditAccess(item) {
    await supabase.from('fight_footage').update({ access_mode: editAccessMode }).eq('id', item.id)
    // Simplest correct approach: replace the whole tagged-athletes set
    // rather than trying to diff it, since this is a small, infrequent
    // admin action, not a hot path worth optimising.
    await supabase.from('fight_footage_athletes').delete().eq('footage_id', item.id)
    if (editAccessMode === 'select_athletes' && editStudentIds.size > 0) {
      await supabase.from('fight_footage_athletes').insert([...editStudentIds].map(student_id => ({ footage_id: item.id, student_id })))
    }
    setEditingAccessId(null)
    load()
  }

  async function deleteFootage(item) {
    if (!confirm(`Delete "${item.title}"? This cannot be undone.`)) return
    await supabase.from('fight_footage').delete().eq('id', item.id)
    load()
  }

  const filteredStudents = students.filter(s => !studentSearch.trim() || studentName(s).toLowerCase().includes(studentSearch.trim().toLowerCase()))

  return (
    <div>
      <button className="btn btn-sm" style={{ marginBottom: 12 }} onClick={() => navigate(-1)}>← Back</button>

      <div className="page-header">
        <h1>View IT</h1>
        <p>Record, review, and share fight/sparring footage with athletes or the team</p>
      </div>

      <button className="btn btn-primary" style={{ marginBottom: 16 }} onClick={() => setShowUpload(true)}>+ Upload footage</button>

      {showUpload && (
        <div className="card" style={{ marginBottom: 16, padding: 16 }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>Upload footage</h3>
          <div className="field"><label>Title</label>
            <input value={uploadForm.title} onChange={e => setUploadForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Jake vs Marcus - sparring round 3" />
          </div>
          <div className="field"><label>Notes (optional)</label>
            <textarea value={uploadForm.description} onChange={e => setUploadForm(f => ({ ...f, description: e.target.value }))} style={{ minHeight: 60 }} />
          </div>
          <div className="field"><label>Video file</label>
            <input type="file" accept="video/*,.mkv,.avi,.mov,.wmv,.flv,.3gp,.webm,.m4v" onChange={e => setFile(e.target.files[0])} />
          </div>

          <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 6 }}>Who can see this?</label>
          <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
            <button className={uploadForm.accessMode === 'coach_only' ? 'btn btn-sm btn-primary' : 'btn btn-sm'} onClick={() => setUploadForm(f => ({ ...f, accessMode: 'coach_only' }))}>Coach only</button>
            <button className={uploadForm.accessMode === 'select_athletes' ? 'btn btn-sm btn-primary' : 'btn btn-sm'} onClick={() => setUploadForm(f => ({ ...f, accessMode: 'select_athletes' }))}>Specific athletes</button>
            <button className={uploadForm.accessMode === 'all' ? 'btn btn-sm btn-primary' : 'btn btn-sm'} onClick={() => setUploadForm(f => ({ ...f, accessMode: 'all' }))}>Whole team</button>
          </div>
          <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 10 }}>
            Uploads always start as "Coach only" — you can open it up to specific athletes or the whole team any time afterward.
          </p>

          {uploadForm.accessMode === 'select_athletes' && (
            <div style={{ marginBottom: 14 }}>
              <input type="text" placeholder="🔍 Search by name…" value={studentSearch} onChange={e => setStudentSearch(e.target.value)} style={{ width: '100%', fontSize: 13, marginBottom: 8 }} />
              <div style={{ maxHeight: 160, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 6 }}>
                {filteredStudents.map(s => (
                  <label key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, padding: '4px 8px' }}>
                    <input type="checkbox" checked={uploadForm.studentIds.has(s.id)} onChange={e => setUploadForm(f => {
                      const next = new Set(f.studentIds)
                      if (e.target.checked) next.add(s.id); else next.delete(s.id)
                      return { ...f, studentIds: next }
                    })} />
                    {studentName(s)}
                  </label>
                ))}
              </div>
              <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>{uploadForm.studentIds.size} selected</p>
            </div>
          )}

          <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 10 }}>
            Once you hit Upload, it'll keep going in the background — feel free to close this or navigate elsewhere, a small progress indicator stays visible until it's done.
          </p>

          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary" onClick={handleUpload}>⬆️ Upload</button>
            <button className="btn" onClick={() => { setShowUpload(false); setFile(null) }}>Cancel</button>
          </div>
        </div>
      )}

      {!loaded ? (
        <p style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>Loading…</p>
      ) : footage.length === 0 ? (
        <div className="empty-state"><h3>No footage yet</h3><p>Upload your first clip to get started</p></div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {footage.map(item => (
            <div key={item.id} className="card" style={{ padding: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 0, cursor: 'pointer' }} onClick={() => openFootage(item)}>
                  <div style={{ fontSize: 14, fontWeight: 500 }}>▶️ {item.title}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                    {new Date(item.uploaded_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                    {' · '}{item.access_mode === 'all' ? 'Whole team' : item.access_mode === 'coach_only' ? 'Coach only' : `${item.fight_footage_athletes?.length || 0} athlete${item.fight_footage_athletes?.length === 1 ? '' : 's'}`}
                  </div>
                  {item.description && <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>{item.description}</div>}
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn btn-sm" onClick={() => startEditAccess(item)}>Who can see this?</button>
                  <button className="btn btn-sm" style={{ color: '#E24B4A' }} onClick={() => deleteFootage(item)}>Delete</button>
                </div>
              </div>

              {editingAccessId === item.id && (
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                    <button className={editAccessMode === 'coach_only' ? 'btn btn-sm btn-primary' : 'btn btn-sm'} onClick={() => setEditAccessMode('coach_only')}>Coach only</button>
                    <button className={editAccessMode === 'select_athletes' ? 'btn btn-sm btn-primary' : 'btn btn-sm'} onClick={() => setEditAccessMode('select_athletes')}>Specific athletes</button>
                    <button className={editAccessMode === 'all' ? 'btn btn-sm btn-primary' : 'btn btn-sm'} onClick={() => setEditAccessMode('all')}>Whole team</button>
                  </div>
                  {editAccessMode === 'select_athletes' && (
                    <div style={{ marginBottom: 10 }}>
                      <input type="text" placeholder="🔍 Search by name…" value={editStudentSearch} onChange={e => setEditStudentSearch(e.target.value)} style={{ width: '100%', fontSize: 13, marginBottom: 8 }} />
                      <div style={{ maxHeight: 160, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 6 }}>
                        {students.filter(s => !editStudentSearch.trim() || studentName(s).toLowerCase().includes(editStudentSearch.trim().toLowerCase())).map(s => (
                          <label key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, padding: '4px 8px' }}>
                            <input type="checkbox" checked={editStudentIds.has(s.id)} onChange={e => setEditStudentIds(prev => {
                              const next = new Set(prev)
                              if (e.target.checked) next.add(s.id); else next.delete(s.id)
                              return next
                            })} />
                            {studentName(s)}
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-sm btn-primary" onClick={() => saveEditAccess(item)}>Save</button>
                    <button className="btn btn-sm" onClick={() => setEditingAccessId(null)}>Cancel</button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {playingUrl && (
        <FightFootagePlayer videoUrl={playingUrl} title={playingTitle} footageId={playingItem?.id} storagePath={playingItem?.storage_path} isCoach
          onClose={() => { setPlayingUrl(null); setPlayingTitle(''); setPlayingItem(null) }} />
      )}
    </div>
  )
}
