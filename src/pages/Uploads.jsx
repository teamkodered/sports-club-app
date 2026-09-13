import { useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { ALL_GRADES, EVENT_TYPES } from '../lib/mediaConstants.js'

// Upload forms (single + bulk) and the search/filter tools for the
// shared fight_footage library -- these live in their own tab
// separately from View IT's actual browse/watch list, since setting
// up how things are organised (tags, events, filters) is naturally a
// different moment than watching something you've already found.
export default function Uploads({
  events, setEvents, allTags, students, studentName, load,
  filterEventId, setFilterEventId, filterStudentId, setFilterStudentId, filterTag, setFilterTag,
  filterGrade, setFilterGrade, filterEventType, setFilterEventType, searchText, setSearchText,
  dateFrom, setDateFrom, dateTo, setDateTo, hasAnyFilter, clearFilters,
  startUpload, startBulkUpload,
}) {
  const [showUpload, setShowUpload] = useState(false)
  const [bulkMode, setBulkMode] = useState(false)
  const [bulkFiles, setBulkFiles] = useState([])
  const [bulkTotalSelected, setBulkTotalSelected] = useState(0)
  const [uploadForm, setUploadForm] = useState({ title: '', description: '', accessMode: 'coach_only', studentIds: new Set(), eventId: '', newEventName: '', newEventType: 'other', tagsInput: '', gradeTag: '' })
  const [tagSuggestOpen, setTagSuggestOpen] = useState(false)
  const [studentSearch, setStudentSearch] = useState('')
  const [file, setFile] = useState(null)

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
    // panel and even navigating away/switching tabs doesn't interrupt
    // it, it'll keep going and show progress via the floating
    // indicator instead.
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

  const filteredStudents = students.filter(s => !studentSearch.trim() || studentName(s).toLowerCase().includes(studentSearch.trim().toLowerCase()))
  const currentTags = parsedTags()
  const tagSuggestions = allTags.filter(t => !currentTags.includes(t))

  return (
    <div>
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
            Once you hit Upload, it'll keep going in the background — feel free to close this or switch tabs, a small progress indicator stays visible until it's done.
          </p>

          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary" onClick={bulkMode ? handleBulkUpload : handleUpload}>⬆️ Upload</button>
            <button className="btn" onClick={resetUploadForm}>Cancel</button>
          </div>
        </div>
      )}

      <div className="card" style={{ padding: 12 }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>Search &amp; sort the library</h3>
        <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 10 }}>These filters also apply to the list shown in the View IT tab.</p>
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
            <button className="btn btn-sm" onClick={clearFilters}>✕ Clear filters</button>
          )}
        </div>
      </div>
    </div>
  )
}
