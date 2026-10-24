import { useState, useEffect, useCallback } from 'react'
import { wall } from '../components/shared/SessionFootage.jsx'
import { supabase } from '../lib/supabase.js'
import FightFootagePlayer from '../components/shared/FightFootagePlayer.jsx'

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

// Same layout as the athlete-side Session footage: one heading per day, three camera columns
// (Bags / Ring / Main -- recordings come from cameras 01, 02 and 04), square tiles in time order.
const CAM_COLS = [{ key: '1', label: 'Bags' }, { key: '2', label: 'Ring' }, { key: '3', label: 'Main' }]
const camCol = n => { const m = String(n || '').match(/(\d+)/); const v = m ? parseInt(m[1]) : 0; return v === 1 ? '1' : v === 2 ? '2' : '3' }
const dayKey = iso => { const d = wall(iso); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
const fmtDayHead = k => new Date(k + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })

export default function CctvViewer({ embedded = false }) {
  const [cameras, setCameras] = useState([])
  const [activityFilter, setActivityFilter] = useState('all') // 'all' | 'during' | 'unmatched'
  const [classSchedule, setClassSchedule] = useState([])
  const [attendanceTimes, setAttendanceTimes] = useState([])
  const [cameraFilter, setCameraFilter] = useState('all')
  const [dateFilter, setDateFilter] = useState(() => new Date().toISOString().split('T')[0])
  const [clips, setClips] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedClip, setSelectedClip] = useState(null)
  const [showPlayer, setShowPlayer] = useState(false)
  const [playbackUrl, setPlaybackUrl] = useState(null)
  const [playbackLoading, setPlaybackLoading] = useState(false)
  const [playbackError, setPlaybackError] = useState(null)
  const [debugResult, setDebugResult] = useState(null)
  const [students, setStudents] = useState([])
  const [taggedIds, setTaggedIds] = useState([])
  const [studentSearch, setStudentSearch] = useState('')
  const [savingAccess, setSavingAccess] = useState(false)
  const [flagText, setFlagText] = useState('')
  const [bulkSelected, setBulkSelected] = useState(() => new Set())
  const [bulkDownloading, setBulkDownloading] = useState(false)
  const [bulkEnabling, setBulkEnabling] = useState(false)

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
    // For the "only show during activity" filter -- a clip counts as
    // having activity if it overlaps a scheduled class OR someone
    // actually checked in during it (covers off-timetable training
    // that a class-only check would miss).
    supabase.from('classes').select('day_of_week, start_time, end_time').eq('active', true).then(({ data }) => setClassSchedule(data || []))
  }, [])

  // Scoped to the currently visible date filter (or a reasonable
  // default window if none is set) -- fetching all-time attendance
  // history unfiltered would be a lot of data for a large, established
  // club.
  useEffect(() => {
    let query = supabase.from('attendance').select('attended_at')
    if (dateFilter) {
      query = query.gte('attended_at', dateFilter + 'T00:00:00').lte('attended_at', dateFilter + 'T23:59:59')
    } else {
      const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 60)
      query = query.gte('attended_at', cutoff.toISOString())
    }
    query.then(({ data }) => setAttendanceTimes((data || []).map(r => r.attended_at).filter(Boolean)))
  }, [dateFilter])

  // Does this clip's time window overlap a scheduled class, or
  // contain an actual check-in? Class end time defaults to 1 hour
  // after start if a class has no explicit end_time set.
  function clipHasActivity(clip) {
    // motion_detected comes from analysing the actual downloaded video
    // file itself (see the sync script) -- a genuinely reliable signal
    // once present, unlike check-ins (which not every session has, and
    // aren't always on time) or class-schedule overlap (which only
    // covers scheduled sessions at all). Only falls back to that older
    // heuristic for clips synced before this existed, which won't have
    // this field populated at all.
    if (clip.motion_detected !== null && clip.motion_detected !== undefined) {
      return clip.motion_detected
    }

    const clipStart = new Date(clip.recorded_at)
    const clipEnd = new Date(clipStart.getTime() + (clip.duration_seconds || 0) * 1000)

    const hadCheckIn = attendanceTimes.some(t => {
      const at = new Date(t)
      return at >= clipStart && at <= clipEnd
    })
    if (hadCheckIn) return true

    const dayName = clipStart.toLocaleDateString('en-GB', { weekday: 'long' })
    return classSchedule.some(c => {
      if (c.day_of_week !== dayName) return false
      const [sh, sm] = (c.start_time || '00:00').split(':').map(Number)
      const [eh, em] = (c.end_time || '').split(':').map(Number)
      const classStart = new Date(clipStart); classStart.setHours(sh, sm, 0, 0)
      const classEnd = c.end_time ? (() => { const d = new Date(clipStart); d.setHours(eh, em, 0, 0); return d })() : new Date(classStart.getTime() + 60 * 60 * 1000)
      return classStart <= clipEnd && classEnd >= clipStart
    })
  }

  // swipe in the player (controls hidden): left / right = next / previous file on this camera,
  // up / down = another camera at the same moment
  const [startAt, setStartAt] = useState(0)
  const camNo = n => { const m = String(n || '').match(/(\d+)/); return m ? parseInt(m[1]) : 0 }
  function clipSwipe(dir, currentTime) {
    const cur = selectedClip; if (!cur) return
    const t0 = new Date(cur.recorded_at).getTime(), now = t0 + (currentTime || 0) * 1000
    if (dir === 'next' || dir === 'prev') {
      const same = clips.filter(c => camNo(c.camera_name) === camNo(cur.camera_name)).sort((a, b) => new Date(a.recorded_at) - new Date(b.recorded_at))
      const i = same.findIndex(c => c.id === cur.id), nx = same[i + (dir === 'next' ? 1 : -1)]
      if (nx) openClip(nx, 0)
      return
    }
    const cams = [...new Set(clips.map(c => camNo(c.camera_name)))].sort((a, b) => a - b)
    const ci = cams.indexOf(camNo(cur.camera_name))
    for (let step = 1; step < cams.length; step++) {
      const cam = cams[(ci + (dir === 'camUp' ? step : cams.length - step)) % cams.length]
      const hit = clips.find(c => camNo(c.camera_name) === cam && new Date(c.recorded_at).getTime() <= now && new Date(c.recorded_at).getTime() + (c.duration_seconds || 0) * 1000 > now)
      if (hit) { openClip(hit, Math.round((now - new Date(hit.recorded_at).getTime()) / 1000)); return }
    }
  }

  async function openClip(clip, autoplayAt) {
    setSelectedClip(clip)
    setShowPlayer(false)
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
    if (autoplayAt != null) { setStartAt(autoplayAt); setShowPlayer(true) } else setStartAt(0)
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

  function toggleBulkSelect(clipId) {
    setBulkSelected(prev => {
      const next = new Set(prev)
      if (next.has(clipId)) next.delete(clipId); else next.add(clipId)
      return next
    })
  }

  // Sequential, not parallel -- a signed URL per clip, opened one at a
  // time with a short pause in between, since firing many window.open
  // calls back-to-back is exactly the pattern browsers' popup blockers
  // are designed to catch, and a real backup could be dozens of large
  // video files.
  async function bulkDownload() {
    const toDownload = visibleClips.filter(c => bulkSelected.has(c.id) && c.allow_download)
    if (toDownload.length === 0) { alert('None of the selected clips have "Allow download" enabled -- enable it first (per clip, or use "Allow download for selected" below).'); return }
    setBulkDownloading(true)
    const { data: { session } } = await supabase.auth.getSession()
    for (const clip of toDownload) {
      try {
        const { data, error } = await supabase.functions.invoke('cctv-presigned-url', {
          body: { storage_path: clip.storage_path, download: true },
          headers: { Authorization: `Bearer ${session?.access_token}` },
        })
        if (error || data?.error) { console.error(`Failed to prepare download for ${clip.storage_path}:`, error || data.error); continue }
        window.open(data.url, '_blank')
      } catch (err) {
        console.error(`Failed to download ${clip.storage_path}:`, err.message)
      }
      await new Promise(r => setTimeout(r, 800)) // gives each download a moment to actually start before firing the next
    }
    setBulkDownloading(false)
  }

  async function bulkEnableDownload() {
    const ids = [...bulkSelected]
    if (ids.length === 0) return
    setBulkEnabling(true)
    const { error } = await supabase.from('cctv_clips').update({ allow_download: true }).in('id', ids)
    setBulkEnabling(false)
    if (error) { alert('Error enabling download: ' + error.message); return }
    setClips(prev => prev.map(c => ids.includes(c.id) ? { ...c, allow_download: true } : c))
  }

  async function runDebugProbe() {
    if (!selectedClip) return
    setDebugResult('Checking…')
    const { data: { session } } = await supabase.auth.getSession()
    const { data, error } = await supabase.functions.invoke('cctv-presigned-url', {
      body: { storage_path: selectedClip.storage_path, debug: true },
      headers: { Authorization: `Bearer ${session?.access_token}` },
    })
    setDebugResult(JSON.stringify(error ? { error: error.message } : data, null, 2))
  }

  const filteredStudents = students.filter(s => s.name.toLowerCase().includes(studentSearch.toLowerCase()))
  const visibleClips = activityFilter === 'during' ? clips.filter(clipHasActivity)
    : activityFilter === 'unmatched' ? clips.filter(c => !clipHasActivity(c))
    : clips

  return (
    <div style={{ padding: embedded ? 0 : 20, maxWidth: 1100, margin: '0 auto' }}>
      {!embedded && (
        <>
          <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 4 }}>📹 CCTV</h1>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20 }}>Browse recorded clips, control who can see each one, and tag athletes.</p>
        </>
      )}

      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <select value={cameraFilter} onChange={e => setCameraFilter(e.target.value)} style={{ fontSize: 13 }}>
          <option value="all">All cameras</option>
          {cameras.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <input type="date" value={dateFilter} onChange={e => setDateFilter(e.target.value)} style={{ fontSize: 13 }} />
        {dateFilter && <button className="btn btn-sm" onClick={() => setDateFilter('')}>Clear date</button>}
        <select value={activityFilter} onChange={e => setActivityFilter(e.target.value)} style={{ fontSize: 13 }}>
          <option value="all">All clips</option>
          <option value="during">Only during activity (check-in or scheduled class)</option>
          <option value="unmatched">⚠️ Unmatched activity (recorded but no check-in or schedule)</option>
        </select>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <button className="btn btn-sm" onClick={() => setBulkSelected(new Set(visibleClips.map(c => c.id)))}>Select all ({visibleClips.length})</button>
        {bulkSelected.size > 0 && (
          <>
            <button className="btn btn-sm" onClick={() => setBulkSelected(new Set())}>✕ Deselect all</button>
            <button className="btn btn-sm" disabled={bulkEnabling} onClick={bulkEnableDownload}>
              {bulkEnabling ? 'Enabling…' : `Allow download for selected (${bulkSelected.size})`}
            </button>
            <button className="btn btn-sm btn-primary" disabled={bulkDownloading} onClick={bulkDownload}>
              {bulkDownloading ? 'Downloading…' : `⬇ Download selected (${bulkSelected.size})`}
            </button>
          </>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: selectedClip ? '1fr 1fr' : '1fr', gap: 20 }}>
        <div>
          {loading ? (
            <p style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>Loading…</p>
          ) : visibleClips.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>
              {activityFilter === 'during' ? 'No clips with detected activity in this filter.'
                : activityFilter === 'unmatched' ? 'No unmatched clips -- everything recorded lines up with a check-in or scheduled class. 👍'
                : 'No clips found for this filter.'}
            </p>
          ) : (() => {
            // newest day first; within a day, tiles run in time order like the athlete view
            const days = [...new Set(visibleClips.map(c => dayKey(c.recorded_at)))].sort().reverse()
            const cols = cameraFilter === 'all' ? CAM_COLS.filter(cam => visibleClips.some(c => camCol(c.camera_name) === cam.key)) : CAM_COLS.filter(cam => cam.key === camCol(cameraFilter))
            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 700, overflowY: 'auto' }}>
                {days.map(day => {
                  const dayClips = visibleClips.filter(c => dayKey(c.recorded_at) === day).sort((a, b) => wall(a.recorded_at) - wall(b.recorded_at))
                  return (
                    <div key={day} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 10 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>{fmtDayHead(day)} <span style={{ fontWeight: 400, color: 'var(--text-tertiary)', fontSize: 11 }}>· {dayClips.length} clip{dayClips.length === 1 ? '' : 's'}</span></div>
                      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.max(1, cols.length)}, minmax(0, 1fr))`, gap: 6 }}>
                        {cols.map(cam => (
                          <div key={cam.key} style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textAlign: 'center' }}>{cam.label}</div>
                            {dayClips.filter(c => camCol(c.camera_name) === cam.key).map(clip => (
                              <div key={clip.id} role="button" tabIndex={0} onClick={() => openClip(clip)} onKeyDown={e => { if (e.key === 'Enter') openClip(clip) }} className="btn"
                                style={{ position: 'relative', aspectRatio: '1 / 1', width: '100%', padding: 4, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, borderRadius: 10, cursor: 'pointer',
                                  outline: selectedClip?.id === clip.id ? '2px solid var(--text)' : 'none', outlineOffset: -2 }}>
                                <input type="checkbox" checked={bulkSelected.has(clip.id)} onClick={e => e.stopPropagation()} onChange={() => toggleBulkSelect(clip.id)}
                                  aria-label="Select clip" style={{ position: 'absolute', top: 5, left: 5, margin: 0 }} />
                                <span style={{ fontSize: 16 }}>▶</span>
                                <span style={{ fontFamily: 'Orbitron, sans-serif', fontSize: 13, fontWeight: 700 }}>{wall(clip.recorded_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span>
                                {clip.duration_seconds ? <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{Math.round(clip.duration_seconds / 60)} min</span> : null}
                                {(clip.flagged_reason || clip.allow_download) && (
                                  <span style={{ position: 'absolute', top: 4, right: 5, fontSize: 9, display: 'flex', gap: 2 }}>
                                    {clip.flagged_reason && <span title="Flagged">🚩</span>}
                                    {clip.allow_download && <span title="Downloadable" style={{ color: '#1D9E75' }}>⬇</span>}
                                  </span>
                                )}
                              </div>
                            ))}
                            {dayClips.every(c => camCol(c.camera_name) !== cam.key) && <div style={{ fontSize: 11, color: 'var(--text-tertiary)', textAlign: 'center' }}>—</div>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          })()}
        </div>

        {selectedClip && (
          <div>
            <div className="card" style={{ padding: 16, marginBottom: 12 }}>
              {playbackLoading ? (
                <p style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>Preparing playback…</p>
              ) : playbackError ? (
                <p style={{ fontSize: 13, color: '#E24B4A' }}>Couldn't load this clip: {playbackError}</p>
              ) : playbackUrl ? (
                <>
                  <button className="btn btn-primary" onClick={() => setShowPlayer(true)} style={{ width: '100%', padding: '14px 0', justifyContent: 'center' }}>
                    ▶️ Play clip
                  </button>
                  <a href={playbackUrl} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: 'var(--text-tertiary)', display: 'block', marginTop: 6 }}>Open clip directly (for troubleshooting)</a>
                </>
              ) : null}
              <button className="btn btn-sm" style={{ marginTop: 8 }} onClick={runDebugProbe}>🔍 Run diagnostic check</button>
              {debugResult && <pre style={{ fontSize: 10, background: 'var(--bg-secondary)', padding: 10, borderRadius: 6, marginTop: 8, overflowX: 'auto', whiteSpace: 'pre-wrap' }}>{debugResult}</pre>}
              <div style={{ fontSize: 13, fontWeight: 500, marginTop: 10 }}>
                {selectedClip.camera_name} — {new Date(selectedClip.recorded_at).toLocaleString('en-GB', { timeZone: 'UTC' })}
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

      {showPlayer && playbackUrl && selectedClip && (
        <FightFootagePlayer videoUrl={playbackUrl} title={`${selectedClip.camera_name} — ${new Date(selectedClip.recorded_at).toLocaleString('en-GB', { timeZone: 'UTC' })}`}
          cctvClipId={selectedClip.id} storagePath={selectedClip.storage_path} isCoach key={selectedClip.id} startAt={startAt} onClipSwipe={clipSwipe}
          onClose={() => setShowPlayer(false)} />
      )}
    </div>
  )
}
