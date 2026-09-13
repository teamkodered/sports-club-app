import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import { useFightFootageUpload } from '../hooks/useFightFootageUpload.jsx'
import FightFootagePlayer from '../components/shared/FightFootagePlayer.jsx'

// Full flat list of every belt name used across all PKA age bands --
// this tag is just for categorising a clip's technique level, not tied
// to any specific student's own age-banded progression, so one flat
// list covering everything is simplest.
const ALL_GRADES = ['Red', 'Yellow', 'Yellow tag', 'Orange', 'Orange tag', 'Green', 'Green tag', 'Blue', 'Blue tag', 'Purple', 'Purple tag', 'Brown', 'Brown tag', 'Black']
const EVENT_TYPES = [
  { value: 'competition', label: 'Competition' },
  { value: 'grading', label: 'Grading' },
  { value: 'training', label: 'Training' },
  { value: 'other', label: 'Other' },
]

export default function ViewIt({ embedded = false }) {
  const navigate = useNavigate()
  const { upload, startUpload, startBulkUpload } = useFightFootageUpload()
  const [footage, setFootage] = useState([])
  const [events, setEvents] = useState([])
  const [allTags, setAllTags] = useState([]) // every distinct tag already in use, for autocomplete
  const [loaded, setLoaded] = useState(false)
  const [students, setStudents] = useState([])
  const [showUpload, setShowUpload] = useState(false)
  const [bulkMode, setBulkMode] = useState(false)
  const [bulkFiles, setBulkFiles] = useState([])
  const [bulkTotalSelected, setBulkTotalSelected] = useState(0)
  const [uploadForm, setUploadForm] = useState({ title: '', description: '', accessMode: 'coach_only', studentIds: new Set(), eventId: '', newEventName: '', newEventType: 'other', tagsInput: '', gradeTag: '' })
  const [tagSuggestOpen, setTagSuggestOpen] = useState(false)
  const [studentSearch, setStudentSearch] = useState('')
  const [file, setFile] = useState(null)
  const [playingUrl, setPlayingUrl] = useState(null)
  const [playingTitle, setPlayingTitle] = useState('')
  const [playingItem, setPlayingItem] = useState(null)
  const [editingAccessId, setEditingAccessId] = useState(null)
  const [editAccessMode, setEditAccessMode] = useState('coach_only')
  const [editStudentIds, setEditStudentIds] = useState(() => new Set())
  const [editStudentSearch, setEditStudentSearch] = useState('')
  const [filterEventId, setFilterEventId] = useState('')
  const [filterStudentId, setFilterStudentId] = useState('')
  const [filterTag, setFilterTag] = useState('')
  const [filterGrade, setFilterGrade] = useState('')
  const [filterEventType, setFilterEventType] = useState('')
  const [searchText, setSearchText] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

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
    const [{ data: f }, { data: s }, { data: e }, { data: markerNotes }] = await Promise.all([
      supabase.from('fight_footage').select('*, fight_footage_athletes(student_id, students(members(first_name, last_name))), events(id, name, event_type)').order('uploaded_at', { ascending: false }),
      supabase.from('students').select('id, members(first_name, last_name)'),
      supabase.from('events').select('*').order('event_date', { ascending: false }),
      // Marker notes are searched alongside title/description -- often
      // the richest description of what's actually in a clip lives in
      // a note made while marking it up (e.g. "great roundhouse here"),
      // so a coach doesn't need to separately re-tag something already
      // described in detail while reviewing it.
      supabase.from('fight_footage_markers').select('footage_id, note_text').not('note_text', 'is', null),
    ])
    const notesByFootage = {}
    for (const m of (markerNotes || [])) {
      if (!m.note_text) continue
      notesByFootage[m.footage_id] = notesByFootage[m.footage_id] ? `${notesByFootage[m.footage_id]} ${m.note_text}` : m.note_text
    }
    const withNotes = (f || []).map(item => ({ ...item, _searchableNotes: notesByFootage[item.id] || '' }))
    setFootage(withNotes)
    setStudents(s || [])
    setEvents(e || [])
    const tagSet = new Set()
    for (const item of withNotes) for (const t of (item.tags || [])) tagSet.add(t)
    setAllTags([...tagSet].sort())
    setLoaded(true)
  }

  function studentName(s) {
    return `${s.members?.first_name || ''} ${s.members?.last_name || ''}`.trim()
  }

  // Resolves whatever the coach picked in the Event dropdown into a
  // real event_id -- creating a brand new event row first if "+ New
  // event" was chosen instead of an existing one.
  async function resolveEventId() {
    if (uploadForm.eventId === '__new__') {
      if (!uploadForm.newEventName.trim()) return null
      const { data: newEvent, error } = await supabase.from('events').insert({ name: uploadForm.newEventName.trim(), event_type: uploadForm.newEventType }).select().single()
      if (error) { alert('Could not create event: ' + error.message); return null }
      setEvents(prev => [newEvent, ...prev])
      return newEvent.id
    }
    return uploadForm.eventId || null
  }

  function parsedTags() {
    return uploadForm.tagsInput.split(',').map(t => t.trim()).filter(Boolean)
  }

  async function handleUpload() {
    if (!file || !uploadForm.title.trim()) { alert('Add a title and choose a video file first.'); return }
    const eventId = await resolveEventId()
    // Fire-and-forget into the shared upload context -- closing this
    // panel and even navigating away doesn't interrupt it, it'll keep
    // going and show progress via the floating indicator instead.
    startUpload({
      file,
      title: uploadForm.title,
      description: uploadForm.description,
      accessMode: uploadForm.accessMode,
      studentIds: uploadForm.studentIds,
      eventId,
      tags: parsedTags(),
      gradeTag: uploadForm.gradeTag,
    })
    resetUploadForm()
  }

  async function handleBulkUpload() {
    if (bulkFiles.length === 0) { alert('Choose a folder with video files first.'); return }
    const eventId = await resolveEventId()
    startBulkUpload(bulkFiles, {
      accessMode: uploadForm.accessMode,
      studentIds: uploadForm.studentIds,
      eventId,
      tags: parsedTags(),
      gradeTag: uploadForm.gradeTag,
    })
    resetUploadForm()
  }

  function resetUploadForm() {
    setShowUpload(false)
    setBulkMode(false)
    setUploadForm({ title: '', description: '', accessMode: 'coach_only', studentIds: new Set(), eventId: '', newEventName: '', newEventType: 'other', tagsInput: '', gradeTag: '' })
    setFile(null)
    setBulkFiles([])
  }

  function handleFolderSelect(e) {
    const totalSelected = e.target.files.length
    const files = [...e.target.files].filter(f => f.type.startsWith('video/') || /\.(mp4|mkv|avi|mov|wmv|flv|3gp|webm|m4v)$/i.test(f.name))
    setBulkFiles(files)
    setBulkTotalSelected(totalSelected)
    // Suggests the containing folder's name as the event, since that's
    // usually exactly what it's organised by (e.g. Dropbox event
    // folders) -- easy to change before uploading if it's not right.
    const relPath = files[0]?.webkitRelativePath
    const folderName = relPath ? relPath.split('/')[0] : ''
    if (folderName && !uploadForm.newEventName) {
      setUploadForm(f => ({ ...f, eventId: '__new__', newEventName: folderName }))
    }
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
  const currentTags = parsedTags()
  const tagSuggestions = allTags.filter(t => !currentTags.includes(t) && (currentTags.length === 0 || true))

  const visibleFootage = footage.filter(item => {
    if (filterEventId && item.event_id !== filterEventId) return false
    if (filterStudentId && !(item.fight_footage_athletes || []).some(a => a.student_id === filterStudentId)) return false
    if (filterTag && !(item.tags || []).includes(filterTag)) return false
    if (filterGrade && item.grade_tag !== filterGrade) return false
    if (filterEventType && item.events?.event_type !== filterEventType) return false
    if (dateFrom && item.uploaded_at < dateFrom) return false
    if (dateTo && item.uploaded_at > dateTo + 'T23:59:59') return false
    if (searchText.trim()) {
      const q = searchText.trim().toLowerCase()
      const haystack = `${item.title} ${item.description || ''} ${item._searchableNotes || ''}`.toLowerCase()
      if (!haystack.includes(q)) return false
    }
    return true
  })

  const hasAnyFilter = filterEventId || filterStudentId || filterTag || filterGrade || filterEventType || searchText || dateFrom || dateTo

  return (
    <div>
      {!embedded && (
        <>
          <button className="btn btn-sm" style={{ marginBottom: 12 }} onClick={() => {
            // Prefers the actual previous page (e.g. wherever this was
            // linked from) via normal browser back -- but if there's
            // nothing meaningful to go back to in this session's
            // history (arrived via a direct link or bookmark),
            // View IT is logically part of Media now, so that's a
            // better fallback than landing on the dashboard.
            if (window.history.state?.idx > 0) navigate(-1)
            else navigate('/media')
          }}>← Back</button>

          <div className="page-header">
            <h1>View IT</h1>
            <p>Record, review, and share fight/sparring footage with athletes or the team</p>
          </div>
        </>
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <button className="btn btn-primary" onClick={() => { setBulkMode(false); setShowUpload(true) }}>+ Upload footage</button>
        <button className="btn" onClick={() => { setBulkMode(true); setShowUpload(true) }}>📁 Bulk upload (folder)</button>
      </div>

      {showUpload && (
        <div className="card" style={{ marginBottom: 16, padding: 16 }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>{bulkMode ? 'Bulk upload from a folder' : 'Upload footage'}</h3>

          {bulkMode ? (
            <div className="field"><label>Videos to upload</label>
              <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                <input type="file" webkitdirectory="" directory="" multiple onChange={handleFolderSelect} style={{ display: 'none' }} id="folder-picker" />
                <label htmlFor="folder-picker" className="btn btn-sm" style={{ cursor: 'pointer' }}>📁 Select whole folder</label>
                <input type="file" accept="video/*,.mkv,.avi,.mov,.wmv,.flv,.3gp,.webm,.m4v" multiple onChange={handleFolderSelect} style={{ display: 'none' }} id="multi-file-picker" />
                <label htmlFor="multi-file-picker" className="btn btn-sm" style={{ cursor: 'pointer' }}>🎞️ Select multiple files</label>
              </div>
              <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 8 }}>
                If "Select whole folder" shows nothing for a Dropbox/cloud-synced folder (a known quirk with how some cloud-sync apps interact with folder selection), use "Select multiple files" instead — same picker that already works for individual files, just hold Ctrl (or Shift for a range) to select several at once.
              </p>
              {bulkFiles.length > 0 && <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>{bulkFiles.length} video file{bulkFiles.length === 1 ? '' : 's'} selected — each will be titled from its own filename.</p>}
              {bulkTotalSelected > 0 && bulkFiles.length === 0 && (
                <p style={{ fontSize: 12, color: '#E24B4A', marginTop: 4 }}>Selected {bulkTotalSelected} file{bulkTotalSelected === 1 ? '' : 's'}, but none looked like a recognised video format.</p>
              )}
              {bulkTotalSelected === 0 && (
                <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 4 }}>Nothing selected yet.</p>
              )}
              <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>Note: whole-folder selection isn't supported on iPhone/iPad Safari at all — use "Select multiple files" or "+ Upload footage" one at a time there instead.</p>
            </div>
          ) : (
            <>
              <div className="field"><label>Title</label>
                <input value={uploadForm.title} onChange={e => setUploadForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Jake vs Marcus - sparring round 3" />
              </div>
              <div className="field"><label>Notes (optional)</label>
                <textarea value={uploadForm.description} onChange={e => setUploadForm(f => ({ ...f, description: e.target.value }))} style={{ minHeight: 60 }} />
              </div>
              <div className="field"><label>Video file</label>
                <input type="file" accept="video/*,.mkv,.avi,.mov,.wmv,.flv,.3gp,.webm,.m4v" onChange={e => setFile(e.target.files[0])} />
              </div>
            </>
          )}

          <div className="field"><label>Event (optional)</label>
            <select value={uploadForm.eventId} onChange={e => setUploadForm(f => ({ ...f, eventId: e.target.value }))}>
              <option value="">No event</option>
              <option value="__new__">+ New event…</option>
              {events.map(ev => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
            </select>
            {uploadForm.eventId === '__new__' && (
              <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                <input style={{ flex: 1 }} value={uploadForm.newEventName} onChange={e => setUploadForm(f => ({ ...f, newEventName: e.target.value }))} placeholder="Event name, e.g. Regionals 2026" />
                <select value={uploadForm.newEventType} onChange={e => setUploadForm(f => ({ ...f, newEventType: e.target.value }))} style={{ width: 130 }}>
                  {EVENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <div className="field" style={{ flex: 1, position: 'relative' }}>
              <label>Technique tags (optional)</label>
              <input value={uploadForm.tagsInput}
                onChange={e => setUploadForm(f => ({ ...f, tagsInput: e.target.value }))}
                onFocus={() => setTagSuggestOpen(true)}
                onBlur={() => setTimeout(() => setTagSuggestOpen(false), 150)}
                placeholder="e.g. roundhouse, jab-cross" />
              {tagSuggestOpen && tagSuggestions.length > 0 && (
                <div style={{ position: 'absolute', zIndex: 5, top: '100%', left: 0, right: 0, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, maxHeight: 140, overflowY: 'auto' }}>
                  {tagSuggestions.slice(0, 8).map(t => (
                    <div key={t} onMouseDown={() => setUploadForm(f => ({ ...f, tagsInput: currentTags.length > 0 ? `${f.tagsInput.replace(/,\s*[^,]*$/, '')}, ${t}` : t }))}
                      style={{ padding: '6px 10px', fontSize: 12, cursor: 'pointer' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-secondary)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                      {t}
                    </div>
                  ))}
                </div>
              )}
              <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 3 }}>Comma-separated, any words you like — existing tags are suggested as you type to keep things consistent.</p>
            </div>
            <div className="field" style={{ width: 140 }}>
              <label>Grade (optional)</label>
              <select value={uploadForm.gradeTag} onChange={e => setUploadForm(f => ({ ...f, gradeTag: e.target.value }))}>
                <option value="">—</option>
                {ALL_GRADES.map(g => <option key={g}>{g}</option>)}
              </select>
            </div>
          </div>

          <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 6 }}>Who can see this?</label>
          <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
            <button className={uploadForm.accessMode === 'coach_only' ? 'btn btn-sm btn-primary' : 'btn btn-sm'} onClick={() => setUploadForm(f => ({ ...f, accessMode: 'coach_only' }))}>Coach only</button>
            <button className={uploadForm.accessMode === 'select_athletes' ? 'btn btn-sm btn-primary' : 'btn btn-sm'} onClick={() => setUploadForm(f => ({ ...f, accessMode: 'select_athletes' }))}>Specific athletes</button>
            <button className={uploadForm.accessMode === 'all' ? 'btn btn-sm btn-primary' : 'btn btn-sm'} onClick={() => setUploadForm(f => ({ ...f, accessMode: 'all' }))}>Whole team</button>
          </div>
          <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 10 }}>
            {bulkMode ? 'This applies to every video in the folder.' : 'Uploads always start as "Coach only" — you can open it up to specific athletes or the whole team any time afterward.'}
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
            <button className="btn btn-primary" onClick={bulkMode ? handleBulkUpload : handleUpload}>⬆️ Upload</button>
            <button className="btn" onClick={resetUploadForm}>Cancel</button>
          </div>
        </div>
      )}

      <div className="card" style={{ padding: 12, marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
          <input type="text" placeholder="🔍 Search title, notes, marker notes…" value={searchText} onChange={e => setSearchText(e.target.value)} style={{ flex: '1 1 220px', fontSize: 13 }} />
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} title="From date" style={{ fontSize: 13 }} />
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} title="To date" style={{ fontSize: 13 }} />
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {events.length > 0 && (
            <select value={filterEventId} onChange={e => setFilterEventId(e.target.value)} style={{ fontSize: 13 }}>
              <option value="">All events</option>
              {events.map(ev => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
            </select>
          )}
          <select value={filterEventType} onChange={e => setFilterEventType(e.target.value)} style={{ fontSize: 13 }}>
            <option value="">All event types</option>
            {EVENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <select value={filterStudentId} onChange={e => setFilterStudentId(e.target.value)} style={{ fontSize: 13 }}>
            <option value="">All athletes</option>
            {students.map(s => <option key={s.id} value={s.id}>{studentName(s)}</option>)}
          </select>
          {allTags.length > 0 && (
            <select value={filterTag} onChange={e => setFilterTag(e.target.value)} style={{ fontSize: 13 }}>
              <option value="">All techniques</option>
              {allTags.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          )}
          <select value={filterGrade} onChange={e => setFilterGrade(e.target.value)} style={{ fontSize: 13 }}>
            <option value="">All grades</option>
            {ALL_GRADES.map(g => <option key={g}>{g}</option>)}
          </select>
          {hasAnyFilter && (
            <button className="btn btn-sm" onClick={() => { setFilterEventId(''); setFilterStudentId(''); setFilterTag(''); setFilterGrade(''); setFilterEventType(''); setSearchText(''); setDateFrom(''); setDateTo('') }}>✕ Clear filters</button>
          )}
        </div>
      </div>

      {!loaded ? (
        <p style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>Loading…</p>
      ) : visibleFootage.length === 0 ? (
        <div className="empty-state"><h3>No footage yet</h3><p>{footage.length > 0 ? 'Nothing matches these filters' : 'Upload your first clip to get started'}</p></div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {visibleFootage.map(item => (
            <div key={item.id} className="card" style={{ padding: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 0, cursor: 'pointer' }} onClick={() => openFootage(item)}>
                  <div style={{ fontSize: 14, fontWeight: 500 }}>▶️ {item.title}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                    {new Date(item.uploaded_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                    {item.events?.name && <> · 🏆 {item.events.name}{item.events.event_type ? ` (${EVENT_TYPES.find(t => t.value === item.events.event_type)?.label})` : ''}</>}
                    {' · '}{item.access_mode === 'all' ? 'Whole team' : item.access_mode === 'coach_only' ? 'Coach only' : `${item.fight_footage_athletes?.length || 0} athlete${item.fight_footage_athletes?.length === 1 ? '' : 's'}`}
                  </div>
                  {item.description && <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>{item.description}</div>}
                  {(item.tags?.length > 0 || item.grade_tag) && (
                    <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
                      {item.grade_tag && <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 10, background: '#8B5CF622', color: '#8B5CF6' }}>🥋 {item.grade_tag}</span>}
                      {(item.tags || []).map(t => (
                        <span key={t} style={{ fontSize: 10, padding: '2px 7px', borderRadius: 10, background: 'var(--bg-secondary)', color: 'var(--text-tertiary)' }}>{t}</span>
                      ))}
                    </div>
                  )}
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
