import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase.js'
import FightFootagePlayer from '../components/shared/FightFootagePlayer.jsx'

export default function ViewIt() {
  const [footage, setFootage] = useState([])
  const [loaded, setLoaded] = useState(false)
  const [students, setStudents] = useState([])
  const [showUpload, setShowUpload] = useState(false)
  const [uploadForm, setUploadForm] = useState({ title: '', description: '', accessMode: 'select_athletes', studentIds: new Set() })
  const [studentSearch, setStudentSearch] = useState('')
  const [file, setFile] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [playingUrl, setPlayingUrl] = useState(null)
  const [playingTitle, setPlayingTitle] = useState('')

  useEffect(() => { load() }, [])

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
    setUploading(true)
    setUploadProgress(0)
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const accessToken = sessionData?.session?.access_token

      const urlRes = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/fight-footage-url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ mode: 'upload', file_name: file.name }),
      })
      const urlData = await urlRes.json()
      if (urlData.error) throw new Error(urlData.error)

      // Plain fetch PUT doesn't report upload progress -- XHR does,
      // and a multi-hundred-MB fight video upload is exactly the kind
      // of thing where "is this actually doing anything?" matters.
      await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.open('PUT', urlData.upload_url)
        xhr.upload.onprogress = e => { if (e.lengthComputable) setUploadProgress(Math.round((e.loaded / e.total) * 100)) }
        xhr.onload = () => (xhr.status >= 200 && xhr.status < 300) ? resolve() : reject(new Error(`Upload failed (${xhr.status})`))
        xhr.onerror = () => reject(new Error('Upload failed'))
        xhr.send(file)
      })

      const { data: newFootage, error: insertErr } = await supabase.from('fight_footage').insert({
        title: uploadForm.title.trim(),
        description: uploadForm.description.trim() || null,
        storage_path: urlData.storage_path,
        file_size_bytes: file.size,
        access_mode: uploadForm.accessMode,
      }).select().single()
      if (insertErr) throw insertErr

      if (uploadForm.accessMode === 'select_athletes' && uploadForm.studentIds.size > 0) {
        await supabase.from('fight_footage_athletes').insert(
          [...uploadForm.studentIds].map(student_id => ({ footage_id: newFootage.id, student_id }))
        )
      }

      setShowUpload(false)
      setUploadForm({ title: '', description: '', accessMode: 'select_athletes', studentIds: new Set() })
      setFile(null)
      load()
    } catch (err) {
      alert('Upload failed: ' + err.message)
    }
    setUploading(false)
    setUploadProgress(0)
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
  }

  async function deleteFootage(item) {
    if (!confirm(`Delete "${item.title}"? This cannot be undone.`)) return
    await supabase.from('fight_footage').delete().eq('id', item.id)
    load()
  }

  const filteredStudents = students.filter(s => !studentSearch.trim() || studentName(s).toLowerCase().includes(studentSearch.trim().toLowerCase()))

  return (
    <div>
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
            <input type="file" accept="video/*" onChange={e => setFile(e.target.files[0])} />
          </div>

          <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 6 }}>Who can see this?</label>
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <button className={uploadForm.accessMode === 'select_athletes' ? 'btn btn-sm btn-primary' : 'btn btn-sm'} onClick={() => setUploadForm(f => ({ ...f, accessMode: 'select_athletes' }))}>Specific athletes</button>
            <button className={uploadForm.accessMode === 'all' ? 'btn btn-sm btn-primary' : 'btn btn-sm'} onClick={() => setUploadForm(f => ({ ...f, accessMode: 'all' }))}>Whole team</button>
          </div>

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

          {uploading && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ height: 6, background: 'var(--bg-secondary)', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ width: `${uploadProgress}%`, height: '100%', background: '#378ADD', transition: 'width 0.2s' }} />
              </div>
              <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>Uploading… {uploadProgress}%</p>
            </div>
          )}

          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary" disabled={uploading} onClick={handleUpload}>{uploading ? 'Uploading…' : '⬆️ Upload'}</button>
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
            <div key={item.id} className="card" style={{ padding: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 0, cursor: 'pointer' }} onClick={() => openFootage(item)}>
                <div style={{ fontSize: 14, fontWeight: 500 }}>▶️ {item.title}</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                  {new Date(item.uploaded_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                  {' · '}{item.access_mode === 'all' ? 'Whole team' : `${item.fight_footage_athletes?.length || 0} athlete${item.fight_footage_athletes?.length === 1 ? '' : 's'}`}
                </div>
                {item.description && <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>{item.description}</div>}
              </div>
              <button className="btn btn-sm" style={{ color: '#E24B4A' }} onClick={() => deleteFootage(item)}>Delete</button>
            </div>
          ))}
        </div>
      )}

      {playingUrl && (
        <FightFootagePlayer videoUrl={playingUrl} title={playingTitle} onClose={() => { setPlayingUrl(null); setPlayingTitle('') }} />
      )}
    </div>
  )
}
