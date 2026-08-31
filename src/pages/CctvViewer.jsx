import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase.js'

const ACCESS_MODES = [
  { value: 'staff_only', label: 'Staff only' },
  { value: 'checked_in', label: 'Checked in during clip' },
  { value: 'select',     label: 'Selected athletes only' },
  { value: 'all',        label: 'All members' },
]

function formatDuration(seconds) {
  if (!seconds) return ''
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

export default function CctvViewer() {
  const [cameras, setCameras] = useState([])
  const [cameraFilter, setCameraFilter] = useState('all')
  const [dateFilter, setDateFilter] = useState(() => new Date().toISOString().split('T')[0])
  const [clips, setClips] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedClip, setSelectedClip] = useState(null)
  const [playbackUrl, setPlaybackUrl] = useState(null)
  const [playbackLoading, setPlaybackLoading] = useState(false)
  const [playbackError, setPlaybackError] = useState(null)
  const [students, setStudents] = useState([])
  const [taggedIds, setTaggedIds] = useState([])
  const [studentSearch, setStudentSearch] = useState('')
  const [savingAccess, setSavingAccess] = useState(false)
  const [flagText, setFlagText] = useState('')

  const loadClips = useCallback(() => {
    setLoading(true)
    let query = supabase.from('cctv_clips').select('*').order('recorded_at', { ascending: false })
    if (cameraFilter !== 'all') query = query.eq('camera_name', cameraFilter)
    if (dateFilter) {
      query = query.gte('recorded_at', dateFilter + 'T00:00:00').lte('recorded_at', dateFilter + 'T23:59:59')
    }
    query.then(({ data }) => {
      setClips(data || [])
      setLoading(false)
    })
  }, [cameraFilter, dateFilter])

  useEffect(() => { loadClips() }, [loadClips])

  useEffect(() => {
    supabase.from('cctv_clips').select('camera_name').then(({ data }) => {
      setCameras([...new Set((data || []).map(r => r.camera_name))].sort())
    })
    supabase.from('students').select('id, member_id, members(first_name, last_name)').then(({ data }) => {
      setStudents((data || []).map(s => ({ id: s.id, name: `${s.members?.first_name || ''} ${s.members?.last_name || ''}`.trim() })))
    })
  }, [])

  async function openClip(clip) {
    setSelectedClip(clip)
    setPlaybackUrl(null)
    setPlaybackError(null)
    setFlagText(clip.flagged_reason || '')
    setPlaybackLoading(true)
    const { data: taggedRows } = await supabase.from('cctv_clip_athletes').select('student_id').eq('clip_id', clip.id)
    setTaggedIds((taggedRows || []).map(r => r.student_id))

    const { data: { session } } = await supabase.auth.getSession()
    const { data, error } = await supabase.functions.invoke('cctv-presigned-url', {
      body: { storage_path: clip.storage_path },
      headers: { Authorization: `Bearer ${session?.access_token}` },
    })
    setPlaybackLoading(false)
    if (error || data?.error) { setPlaybackError(data?.error || error.message); return }
    setPlaybackUrl(data.url)
  }

  async function updateClipField(field, value) {
    if (!selectedClip) return
    setSavingAccess(true)
    const { error } = await supabase.from('cctv_clips').update({ [field]: value }).eq('id', selectedClip.id)
    if (error) { alert('Error saving: ' + error.message); setSavingAccess(false); return }
    setSelectedClip(prev => ({ ...prev, [field]: value }))
    setClips(prev => prev.map(c => c.id === selectedClip.id ? { ...c, [field]: value } : c))
    setSavingAccess(false)
  }

  async function toggleTaggedAthlete(studentId) {
    if (!selectedClip) return
    const isTagged = taggedIds.includes(studentId)
    if (isTagged) {
      await supabase.from('cctv_clip_athletes').delete().eq('clip_id', selectedClip.id).eq('student_id', studentId)
      setTaggedIds(prev => prev.filter(id => id !== studentId))
    } else {
      await supabase.from('cctv_clip_athletes').insert({ clip_id: selectedClip.id, student_id: studentId })
      setTaggedIds(prev => [...prev, studentId])
    }
  }

  async function saveFlag() {
    if (!selectedClip) return
    setSavingAccess(true)
    const { data: { user } } = await supabase.auth.getUser()
    const patch = flagText.trim()
      ? { flagged_reason: flagText.trim(), flagged_by: user?.id, flagged_at: new Date().toISOString() }
      : { flagged_reason: null, flagged_by: null, flagged_at: null }
    const { error } = await supabase.from('cctv_clips').update(patch).eq('id', selectedClip.id)
    if (error) { alert('Error saving flag: ' + error.message); setSavingAccess(false); return }
    setSelectedClip(prev => ({ ...prev, ...patch }))
    setClips(prev => prev.map(c => c.id === selectedClip.id ? { ...c, ...patch } : c))
    setSavingAccess(false)
  }

  async function downloadClip() {
    if (!selectedClip?.allow_download) return
    const { data: { session } } = await supabase.auth.getSession()
    const { data, error } = await supabase.functions.invoke('cctv-presigned-url', {
      body: { storage_path: selectedClip.storage_path, download: true },
      headers: { Authorization: `Bearer ${session?.access_token}` },
    })
    if (error || data?.error) { alert('Error preparing download: ' + (data?.error || error.message)); return }
    window.open(data.url, '_blank')
  }

  const filteredStudents = students.filter(s => s.name.toLowerCase().includes(studentSearch.toLowerCase()))

  return (
    <div style={{ padding: 20, maxWidth: 1100, margin: '0 auto' }}>
      <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 4 }}>📹 CCTV</h1>
      <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20 }}>Browse recorded clips, control who can see each one, and tag athletes.</p>

      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <select value={cameraFilter} onChange={e => setCameraFilter(e.target.value)} style={{ fontSize: 13 }}>
          <option value="all">All cameras</option>
          {cameras.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <input type="date" value={dateFilter} onChange={e => setDateFilter(e.target.value)} style={{ fontSize: 13 }} />
        {dateFilter && <button className="btn btn-sm" onClick={() => setDateFilter('')}>Clear date</button>}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: selectedClip ? '1fr 1fr' : '1fr', gap: 20 }}>
        <div>
          {loading ? (
            <p style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>Loading…</p>
          ) : clips.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>No clips found for this filter.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 600, overflowY: 'auto' }}>
              {clips.map(clip => (
                <div key={clip.id} onClick={() => openClip(clip)}
                  className="card"
                  style={{ padding: '10px 14px', cursor: 'pointer', border: selectedClip?.id === clip.id ? '2px solid var(--text)' : undefined }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 500 }}>
                    <span>{clip.camera_name}</span>
                    <span style={{ color: 'var(--text-tertiary)' }}>{formatDuration(clip.duration_seconds)}</span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                    {new Date(clip.recorded_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 10, background: 'var(--bg-secondary)', color: 'var(--text-tertiary)' }}>
                      {ACCESS_MODES.find(m => m.value === clip.access_mode)?.label || clip.access_mode}
                    </span>
                    {clip.keep_forever && <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 10, background: 'var(--bg-secondary)', color: 'var(--text-tertiary)' }}>Kept forever</span>}
                    {clip.flagged_reason && <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 10, background: '#E24B4A22', color: '#E24B4A' }}>🚩 Flagged</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {selectedClip && (
          <div>
            <div className="card" style={{ padding: 16, marginBottom: 12 }}>
              {playbackLoading ? (
                <p style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>Preparing playback…</p>
              ) : playbackError ? (
                <p style={{ fontSize: 13, color: '#E24B4A' }}>Couldn't load this clip: {playbackError}</p>
              ) : playbackUrl ? (
                <video src={playbackUrl} controls style={{ width: '100%', borderRadius: 8, background: '#000' }} />
              ) : null}
              <div style={{ fontSize: 13, fontWeight: 500, marginTop: 10 }}>
                {selectedClip.camera_name} — {new Date(selectedClip.recorded_at).toLocaleString('en-GB')}
              </div>
              {selectedClip.allow_download && (
                <button className="btn btn-sm" style={{ marginTop: 8 }} onClick={downloadClip}>⬇ Download</button>
              )}
            </div>

            <div className="card" style={{ padding: 16, marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 8 }}>Who can see this clip</div>
              <select value={selectedClip.access_mode} onChange={e => updateClipField('access_mode', e.target.value)} disabled={savingAccess} style={{ fontSize: 13, width: '100%', marginBottom: 10 }}>
                {ACCESS_MODES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>

              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginBottom: 6 }}>
                <input type="checkbox" checked={selectedClip.allow_download} disabled={savingAccess} onChange={e => updateClipField('allow_download', e.target.checked)} />
                Allow download
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                <input type="checkbox" checked={selectedClip.keep_forever} disabled={savingAccess} onChange={e => updateClipField('keep_forever', e.target.checked)} />
                Keep forever (exempt from automatic cleanup)
              </label>

              {selectedClip.access_mode === 'select' && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 6 }}>Tagged athletes ({taggedIds.length})</div>
                  <input type="text" placeholder="Search athletes…" value={studentSearch} onChange={e => setStudentSearch(e.target.value)}
                    style={{ fontSize: 12, width: '100%', marginBottom: 6 }} />
                  <div style={{ maxHeight: 180, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {filteredStudents.map(s => (
                      <label key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, padding: '3px 4px' }}>
                        <input type="checkbox" checked={taggedIds.includes(s.id)} onChange={() => toggleTaggedAthlete(s.id)} />
                        {s.name}
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="card" style={{ padding: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 8 }}>🚩 Flag for review</div>
              <textarea value={flagText} onChange={e => setFlagText(e.target.value)} placeholder="Reason (leave blank to clear a flag)…"
                style={{ fontSize: 13, width: '100%', minHeight: 60, marginBottom: 8 }} />
              <button className="btn btn-sm btn-primary" disabled={savingAccess} onClick={saveFlag}>
                {selectedClip.flagged_reason ? 'Update flag' : 'Flag this clip'}
              </button>
              {selectedClip.flagged_at && (
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 6 }}>
                  Flagged {new Date(selectedClip.flagged_at).toLocaleString('en-GB')}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
