import { useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { ALL_GRADES, EVENT_TYPES, FOOTAGE_ACCESS_MODES, footageAccessLabel, eventLabel } from '../lib/mediaConstants.js'
import { saveFootageAthletes, guessAthletesFromFilename } from '../lib/fightFootageTags.js'
import AthletePicker from '../components/shared/AthletePicker.jsx'

// Upload forms (single + bulk) and the search/filter tools for the
// shared fight_footage library -- these live in their own tab
// separately from View IT's actual browse/watch list, since setting
// up how things are organised (tags, events, filters) is naturally a
// different moment than watching something you've already found.
export default function Uploads({
  pendingFootage, events, setEvents, folders, setFolders, allTags, students, studentName, load,
  filterEventId, setFilterEventId, filterFolderId, setFilterFolderId, filterStudentId, setFilterStudentId, filterTag, setFilterTag,
  filterGrade, setFilterGrade, filterEventType, setFilterEventType, searchText, setSearchText,
  dateFrom, setDateFrom, dateTo, setDateTo, hasAnyFilter, clearFilters,
  startUpload, startBulkUpload,
}) {
  const [showUpload, setShowUpload] = useState(false)
  const [bulkMode, setBulkMode] = useState(false)
  // One row per selected file: { key, file, title, featuredIds, touched }.
  // touched = athletes were set by hand, so filename matching leaves it alone.
  const [bulkItems, setBulkItems] = useState([])
  const [bulkTotalSelected, setBulkTotalSelected] = useState(0)
  const [uploadForm, setUploadForm] = useState({ title: '', description: '', accessMode: 'featured', featuredIds: new Set(), viewerIds: new Set(), eventId: '', newEventName: '', newEventType: 'competition', newEventDate: '', folderId: '', newFolderName: '', tagsInput: '', gradeTag: '' })
  const [tagSuggestOpen, setTagSuggestOpen] = useState(false)
  const [file, setFile] = useState(null)
  const [editingPendingId, setEditingPendingId] = useState(null)
  const [pendingEdit, setPendingEdit] = useState(null) // { title, description, eventId, tagsInput, gradeTag }
  const [pendingTagSuggestOpen, setPendingTagSuggestOpen] = useState(false)
  const [expandedPreviewId, setExpandedPreviewId] = useState(null)
  const [previewUrl, setPreviewUrl] = useState(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [justPublishedId, setJustPublishedId] = useState(null)
  const [selectedPendingIds, setSelectedPendingIds] = useState(() => new Set())

  // Resolves whatever the coach picked in the Event dropdown into a
  // real event_id -- creating a brand new event row first if "+ New
  // event" was chosen instead of an existing one.
  async function resolveEventId() {
    if (uploadForm.eventId === '__new__') {
      if (!uploadForm.newEventName.trim()) return null
      const { data: newEvent, error } = await supabase.from('events').insert({ name: uploadForm.newEventName.trim(), event_type: uploadForm.newEventType, event_date: uploadForm.newEventDate || null }).select().single()
      if (error) { alert('Could not create event: ' + error.message); return null }
      setEvents(prev => [newEvent, ...prev].sort((a, b) => (b.event_date || '').localeCompare(a.event_date || '')))
      // Switch the form over to the real event, so a second batch straight
      // after this one reuses it instead of creating a duplicate.
      setUploadForm(f => ({ ...f, eventId: newEvent.id, newEventName: '', newEventDate: '' }))
      return newEvent.id
    }
    return uploadForm.eventId || null
  }

  // Folders are deliberately a separate concept from Events -- this
  // find-or-create is what lets uploading more files into the same
  // folder later actually add to it rather than creating a duplicate:
  // if the typed name already matches an existing folder (case-
  // insensitive), that existing one is reused instead of inserting a
  // new row -- footage_folders.name also has a unique constraint as a
  // backstop against a race between two near-simultaneous uploads.
  async function resolveFolderId() {
    if (uploadForm.folderId === '__new__') {
      const typedName = uploadForm.newFolderName.trim()
      if (!typedName) return null
      const existing = folders.find(fo => fo.name.toLowerCase() === typedName.toLowerCase())
      if (existing) return existing.id
      const { data: newFolder, error } = await supabase.from('footage_folders').insert({ name: typedName }).select().single()
      if (error) {
        // Someone else's upload just created the same folder name
        // between the check above and this insert -- re-check once
        // rather than failing outright.
        const { data: raceWinner } = await supabase.from('footage_folders').select('*').ilike('name', typedName).maybeSingle()
        if (raceWinner) { setFolders(prev => [...prev, raceWinner].sort((a, b) => a.name.localeCompare(b.name))); return raceWinner.id }
        alert('Could not create folder: ' + error.message)
        return null
      }
      setFolders(prev => [...prev, newFolder].sort((a, b) => a.name.localeCompare(b.name)))
      return newFolder.id
    }
    return uploadForm.folderId || null
  }

  // Batch athletes -> per-file athletes. A filename that names an athlete
  // gets that athlete; with only one athlete in the batch, every file gets
  // them. Anything else is left for the coach to tick.
  function matchFileToAthletes(fileName, batchIds) {
    const candidates = students.filter(s => batchIds.has(s.id))
    if (candidates.length === 1) return new Set([candidates[0].id])
    return guessAthletesFromFilename(fileName, candidates, studentName)
  }

  function setBatchAthletes(next) {
    setUploadForm(f => ({ ...f, featuredIds: next }))
    setBulkItems(items => items.map(it => it.touched
      ? { ...it, featuredIds: new Set([...it.featuredIds].filter(id => next.has(id))) }
      : { ...it, featuredIds: matchFileToAthletes(it.file.name, next) }))
  }

  function toggleItemAthlete(key, studentId) {
    setBulkItems(items => items.map(it => {
      if (it.key !== key) return it
      const next = new Set(it.featuredIds)
      if (next.has(studentId)) next.delete(studentId); else next.add(studentId)
      return { ...it, featuredIds: next, touched: true }
    }))
  }

  function parsedTags() {
    return uploadForm.tagsInput.split(',').map(t => t.trim()).filter(Boolean)
  }

  async function handleUpload() {
    if (!file || !uploadForm.title.trim()) { alert('Add a title and choose a video file first.'); return }
    const eventId = await resolveEventId()
    const folderId = await resolveFolderId()
    // Fire-and-forget into the shared upload context -- closing this
    // panel and even navigating away/switching tabs doesn't interrupt
    // it, it'll keep going and show progress via the floating
    // indicator instead.
    startUpload({
      file,
      title: uploadForm.title,
      description: uploadForm.description,
      accessMode: uploadForm.accessMode,
      featuredIds: uploadForm.featuredIds,
      viewerIds: uploadForm.viewerIds,
      eventId,
      folderId,
      tags: parsedTags(),
      gradeTag: uploadForm.gradeTag,
    })
    resetUploadForm()
  }

  async function handleBulkUpload() {
    if (bulkItems.length === 0) { alert('Choose some video files first.'); return }
    if (uploadForm.accessMode === 'featured' && bulkItems.some(it => it.featuredIds.size === 0)
      && !confirm("Some videos have no athlete ticked, so with \"Athletes in this fight\" nobody but coaches will be able to watch them. Upload anyway?")) return
    const eventId = await resolveEventId()
    const folderId = await resolveFolderId()
    startBulkUpload(bulkItems.map(({ file, title, featuredIds }) => ({ file, title, featuredIds })), {
      accessMode: uploadForm.accessMode,
      viewerIds: uploadForm.viewerIds,
      eventId,
      folderId,
      tags: parsedTags(),
      gradeTag: uploadForm.gradeTag,
    })
    resetUploadForm()
  }

  function resetUploadForm() {
    setShowUpload(false)
    setBulkMode(false)
    setUploadForm({ title: '', description: '', accessMode: 'featured', featuredIds: new Set(), viewerIds: new Set(), eventId: '', newEventName: '', newEventType: 'competition', newEventDate: '', folderId: '', newFolderName: '', tagsInput: '', gradeTag: '' })
    setFile(null)
    setBulkItems([])
    setBulkTotalSelected(0)
  }

  function handleFolderSelect(e) {
    const totalSelected = e.target.files.length
    const files = [...e.target.files].filter(f => f.type.startsWith('video/') || /\.(mp4|mkv|avi|mov|wmv|flv|3gp|webm|m4v)$/i.test(f.name))
    setBulkItems(files.map((f, i) => ({
      key: `${f.name}-${f.size}-${i}`,
      file: f,
      title: f.name.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' '),
      featuredIds: matchFileToAthletes(f.name, uploadForm.featuredIds),
      touched: false,
    })))
    setBulkTotalSelected(totalSelected)
    // Suggests the containing folder's name as the Folder (a separate
    // concept from Event) -- if a folder with that exact name already
    // exists from a previous upload, it's auto-selected directly so
    // this batch joins it, rather than always proposing a brand new
    // one. Easy to change before uploading if it's not right.
    const relPath = files[0]?.webkitRelativePath
    const folderName = relPath ? relPath.split('/')[0] : ''
    if (folderName && !uploadForm.newFolderName && !uploadForm.folderId) {
      const existing = folders.find(fo => fo.name.toLowerCase() === folderName.toLowerCase())
      if (existing) {
        setUploadForm(f => ({ ...f, folderId: existing.id }))
      } else {
        setUploadForm(f => ({ ...f, folderId: '__new__', newFolderName: folderName }))
      }
    }
  }

  async function togglePreview(item) {
    if (expandedPreviewId === item.id) {
      setExpandedPreviewId(null)
      setPreviewUrl(null)
      return
    }
    setExpandedPreviewId(item.id)
    setPreviewUrl(null)
    setPreviewLoading(true)
    const { data: sessionData } = await supabase.auth.getSession()
    const accessToken = sessionData?.session?.access_token
    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/fight-footage-url`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ mode: 'read', footage_id: item.id }),
    })
    const data = await res.json()
    setPreviewLoading(false)
    if (data.error) { alert('Could not load preview: ' + data.error); setExpandedPreviewId(null); return }
    setPreviewUrl(data.url)
  }

  function startEditPending(item) {
    setEditingPendingId(item.id)
    setPendingEdit({
      title: item.title,
      description: item.description || '',
      eventId: item.event_id || '',
      folderId: item.folder_id || '',
      tagsInput: (item.tags || []).join(', '),
      gradeTag: item.grade_tag || '',
      accessMode: item.access_mode,
      featuredIds: new Set((item.fight_footage_featured || []).map(a => a.student_id)),
      viewerIds: new Set((item.fight_footage_athletes || []).map(a => a.student_id)),
    })
  }

  async function savePendingEdit(item) {
    const { error } = await supabase.from('fight_footage').update({
      title: pendingEdit.title.trim(),
      description: pendingEdit.description?.trim() || null,
      event_id: pendingEdit.eventId || null,
      folder_id: pendingEdit.folderId || null,
      tags: pendingEdit.tagsInput.split(',').map(t => t.trim()).filter(Boolean),
      grade_tag: pendingEdit.gradeTag || null,
      access_mode: pendingEdit.accessMode,
    }).eq('id', item.id)
    if (error) { alert('Could not save changes: ' + error.message); return }
    try {
      await saveFootageAthletes(item.id, pendingEdit)
    } catch (err) { alert('Saved details, but could not save athletes: ' + err.message); return }
    setEditingPendingId(null)
    load()
  }

  async function publishItem(item) {
    const { error } = await supabase.from('fight_footage').update({ published: true }).eq('id', item.id)
    if (error) { alert('Could not publish: ' + error.message); return }
    // Flashes a green confirmation on the button briefly before the
    // item disappears from this pending list (it's no longer pending
    // once published), rather than it just vanishing instantly with no
    // visible confirmation that it actually worked.
    setJustPublishedId(item.id)
    setTimeout(() => { load(); setJustPublishedId(null) }, 900)
  }

  async function deletePendingItem(item) {
    if (!confirm(`Delete "${item.title}"? This cannot be undone.`)) return
    await supabase.from('fight_footage').delete().eq('id', item.id)
    load()
  }

  function toggleSelectAllPending() {
    setSelectedPendingIds(prev => prev.size === pendingFootage.length ? new Set() : new Set(pendingFootage.map(i => i.id)))
  }

  async function bulkPublishSelected() {
    const ids = [...selectedPendingIds]
    const { error } = await supabase.from('fight_footage').update({ published: true }).in('id', ids)
    if (error) { alert('Could not publish: ' + error.message); return }
    setSelectedPendingIds(new Set())
    load()
  }

  async function bulkDeleteSelected() {
    if (!confirm(`Delete ${selectedPendingIds.size} selected upload${selectedPendingIds.size === 1 ? '' : 's'}? This cannot be undone.`)) return
    const ids = [...selectedPendingIds]
    await supabase.from('fight_footage').delete().in('id', ids)
    setSelectedPendingIds(new Set())
    load()
  }

  const studentById = Object.fromEntries(students.map(s => [s.id, s]))
  const batchAthletes = students.filter(s => uploadForm.featuredIds.has(s.id))
  const featuredNames = item => (item.fight_footage_featured || []).map(a => studentById[a.student_id]).filter(Boolean).map(studentName)
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
              {bulkItems.length > 0 && <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>{bulkItems.length} video file{bulkItems.length === 1 ? '' : 's'} selected — titles and athletes can be set per video below.</p>}
              {bulkTotalSelected > 0 && bulkItems.length === 0 && (
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
              {events.map(ev => <option key={ev.id} value={ev.id}>{eventLabel(ev)}</option>)}
            </select>
            {uploadForm.eventId === '__new__' && (
              <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                <input style={{ flex: '1 1 180px' }} value={uploadForm.newEventName} onChange={e => setUploadForm(f => ({ ...f, newEventName: e.target.value }))} placeholder="Event name, e.g. Regionals 2026" />
                <input type="date" value={uploadForm.newEventDate} onChange={e => setUploadForm(f => ({ ...f, newEventDate: e.target.value }))} title="Event date" style={{ width: 150 }} />
                <select value={uploadForm.newEventType} onChange={e => setUploadForm(f => ({ ...f, newEventType: e.target.value }))} style={{ width: 130 }}>
                  {EVENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
            )}
          </div>

          <div className="field">
            <label>{bulkMode ? 'Athletes in this batch' : 'Athletes in this fight'}</label>
            <AthletePicker students={students} studentName={studentName} selected={uploadForm.featuredIds}
              onChange={bulkMode ? setBatchAthletes : next => setUploadForm(f => ({ ...f, featuredIds: next }))} maxHeight={130} />
            <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 3 }}>
              {bulkMode
                ? 'Pick everyone who fought in these videos, then tick who is in each one below. A filename containing an athlete\'s name is ticked for you.'
                : 'Labels the clip for searching and filtering. On its own this doesn\'t let anyone watch it — that\'s "Who can see this?" below.'}
            </p>
          </div>

          {bulkMode && bulkItems.length > 0 && (
            <div className="field">
              <label>Videos ({bulkItems.length})</label>
              <div style={{ border: '1px solid var(--border)', borderRadius: 6, maxHeight: 320, overflowY: 'auto' }}>
                {bulkItems.map(it => (
                  <div key={it.key} style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)' }}>
                    <input value={it.title} onChange={e => setBulkItems(items => items.map(x => x.key === it.key ? { ...x, title: e.target.value } : x))}
                      style={{ width: '100%', fontSize: 13, marginBottom: 4 }} />
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
                      <span style={{ fontSize: 10, color: 'var(--text-tertiary)', marginRight: 2 }}>{it.file.name}</span>
                      {batchAthletes.map(s => (
                        <button key={s.id} type="button" onClick={() => toggleItemAthlete(it.key, s.id)}
                          className={it.featuredIds.has(s.id) ? 'btn btn-sm btn-primary' : 'btn btn-sm'} style={{ fontSize: 11, padding: '2px 8px' }}>
                          {it.featuredIds.has(s.id) ? '✓ ' : ''}{studentName(s)}
                        </button>
                      ))}
                      {batchAthletes.length === 0 && <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Pick athletes above to tag this video</span>}
                      {batchAthletes.length > 0 && it.featuredIds.size === 0 && <span style={{ fontSize: 11, color: '#E24B4A' }}>No athlete ticked</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="field"><label>Folder (optional)</label>
            <select value={uploadForm.folderId} onChange={e => setUploadForm(f => ({ ...f, folderId: e.target.value }))}>
              <option value="">No folder</option>
              <option value="__new__">+ New folder…</option>
              {folders.map(fo => <option key={fo.id} value={fo.id}>{fo.name}</option>)}
            </select>
            {uploadForm.folderId === '__new__' && (
              <input style={{ marginTop: 6 }} value={uploadForm.newFolderName} onChange={e => setUploadForm(f => ({ ...f, newFolderName: e.target.value }))} placeholder="Folder name" />
            )}
            <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 3 }}>A separate way to organise clips from Event — uploading more into the same folder name later automatically joins this same folder rather than making a duplicate.</p>
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
            {FOOTAGE_ACCESS_MODES.map(m => (
              <button key={m.value} className={uploadForm.accessMode === m.value ? 'btn btn-sm btn-primary' : 'btn btn-sm'} onClick={() => setUploadForm(f => ({ ...f, accessMode: m.value }))}>{m.label}</button>
            ))}
          </div>
          <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 10 }}>
            {uploadForm.accessMode === 'featured' ? 'Each athlete sees only the videos they\'re tagged in. ' : ''}
            {bulkMode ? 'Applies to every video in this batch. ' : ''}Nothing is visible to athletes until you publish it from the "Awaiting publish" list.
          </p>

          {uploadForm.accessMode === 'select_athletes' && (
            <div style={{ marginBottom: 14 }}>
              <AthletePicker students={students} studentName={studentName} selected={uploadForm.viewerIds} onChange={next => setUploadForm(f => ({ ...f, viewerIds: next }))} />
              <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>{uploadForm.viewerIds.size} can watch</p>
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

      {pendingFootage.length > 0 && (
        <div className="card" style={{ padding: 12, marginBottom: 16 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Awaiting publish ({pendingFootage.length})</h3>
          <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 10 }}>Uploaded here, but not yet visible in the View IT tab — review or edit the details, then publish when ready.</p>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer' }}>
              <input type="checkbox" checked={selectedPendingIds.size === pendingFootage.length && pendingFootage.length > 0} onChange={toggleSelectAllPending} />
              Select all
            </label>
            {selectedPendingIds.size > 0 && (
              <>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{selectedPendingIds.size} selected</span>
                <button className="btn btn-sm btn-primary" onClick={bulkPublishSelected}>✓ Publish selected</button>
                <button className="btn btn-sm" style={{ color: '#E24B4A' }} onClick={bulkDeleteSelected}>Delete selected</button>
              </>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {pendingFootage.map(item => (
              <div key={item.id} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 10, display: 'flex', gap: 10 }}>
                <input type="checkbox" style={{ marginTop: 3, flexShrink: 0 }} checked={selectedPendingIds.has(item.id)} onChange={e => setSelectedPendingIds(prev => {
                  const next = new Set(prev)
                  if (e.target.checked) next.add(item.id); else next.delete(item.id)
                  return next
                })} />
                <div style={{ flex: 1, minWidth: 0 }}>
                {editingPendingId === item.id ? (
                  <div>
                    <div className="field"><label>Title</label>
                      <input value={pendingEdit.title} onChange={e => setPendingEdit(f => ({ ...f, title: e.target.value }))} />
                    </div>
                    <div className="field"><label>Notes</label>
                      <textarea value={pendingEdit.description} onChange={e => setPendingEdit(f => ({ ...f, description: e.target.value }))} style={{ minHeight: 50 }} />
                    </div>
                    <div className="field"><label>Event</label>
                      <select value={pendingEdit.eventId} onChange={e => setPendingEdit(f => ({ ...f, eventId: e.target.value }))}>
                        <option value="">No event</option>
                        {events.map(ev => <option key={ev.id} value={ev.id}>{eventLabel(ev)}</option>)}
                      </select>
                    </div>
                    <div className="field"><label>Folder</label>
                      <select value={pendingEdit.folderId} onChange={e => setPendingEdit(f => ({ ...f, folderId: e.target.value }))}>
                        <option value="">No folder</option>
                        {folders.map(fo => <option key={fo.id} value={fo.id}>{fo.name}</option>)}
                      </select>
                    </div>
                    <div className="field"><label>Athletes in this fight</label>
                      <AthletePicker students={students} studentName={studentName} selected={pendingEdit.featuredIds} onChange={next => setPendingEdit(f => ({ ...f, featuredIds: next }))} maxHeight={120} />
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <div className="field" style={{ flex: 1, position: 'relative' }}>
                        <label>Technique tags</label>
                        <input value={pendingEdit.tagsInput} onChange={e => setPendingEdit(f => ({ ...f, tagsInput: e.target.value }))}
                          onFocus={() => setPendingTagSuggestOpen(true)} onBlur={() => setTimeout(() => setPendingTagSuggestOpen(false), 150)} />
                        {pendingTagSuggestOpen && allTags.filter(t => !pendingEdit.tagsInput.includes(t)).length > 0 && (
                          <div style={{ position: 'absolute', zIndex: 5, top: '100%', left: 0, right: 0, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, maxHeight: 140, overflowY: 'auto' }}>
                            {allTags.filter(t => !pendingEdit.tagsInput.includes(t)).slice(0, 8).map(t => (
                              <div key={t} onMouseDown={() => setPendingEdit(f => ({ ...f, tagsInput: f.tagsInput.trim() ? `${f.tagsInput.replace(/,\s*[^,]*$/, '')}, ${t}` : t }))}
                                style={{ padding: '6px 10px', fontSize: 12, cursor: 'pointer' }}
                                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-secondary)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>{t}</div>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="field" style={{ width: 140 }}>
                        <label>Grade</label>
                        <select value={pendingEdit.gradeTag} onChange={e => setPendingEdit(f => ({ ...f, gradeTag: e.target.value }))}>
                          <option value="">—</option>
                          {ALL_GRADES.map(g => <option key={g}>{g}</option>)}
                        </select>
                      </div>
                    </div>
                    <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 6 }}>Who can see this?</label>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                      {FOOTAGE_ACCESS_MODES.map(m => (
                        <button key={m.value} className={pendingEdit.accessMode === m.value ? 'btn btn-sm btn-primary' : 'btn btn-sm'} onClick={() => setPendingEdit(f => ({ ...f, accessMode: m.value }))}>{m.label}</button>
                      ))}
                    </div>
                    {pendingEdit.accessMode === 'select_athletes' && (
                      <div style={{ marginBottom: 10 }}>
                        <AthletePicker students={students} studentName={studentName} selected={pendingEdit.viewerIds} onChange={next => setPendingEdit(f => ({ ...f, viewerIds: next }))} maxHeight={140} />
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                      <button className="btn btn-sm btn-primary" onClick={() => savePendingEdit(item)}>Save</button>
                      <button className="btn btn-sm" onClick={() => setEditingPendingId(null)}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                      <div style={{ flex: 1, minWidth: 0, cursor: 'pointer' }} onClick={() => togglePreview(item)}>
                        <div style={{ fontSize: 13, fontWeight: 500 }}>{expandedPreviewId === item.id ? '▾' : '▸'} {item.title}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>
                          {new Date(item.uploaded_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                          {item.events?.name && <> · 🏆 {item.events.name}</>}
                          {item.footage_folders?.name && <> · 📁 {item.footage_folders.name}</>}
                          {featuredNames(item).length > 0 && <> · 🥊 {featuredNames(item).join(', ')}</>}
                          {' · '}👁 {footageAccessLabel(item)}
                        </div>
                        {(item.tags?.length > 0 || item.grade_tag) && (
                          <div style={{ display: 'flex', gap: 4, marginTop: 4, flexWrap: 'wrap' }}>
                            {item.grade_tag && <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 10, background: '#8B5CF622', color: '#8B5CF6' }}>🥋 {item.grade_tag}</span>}
                            {(item.tags || []).map(t => <span key={t} style={{ fontSize: 10, padding: '2px 7px', borderRadius: 10, background: 'var(--bg-secondary)', color: 'var(--text-tertiary)' }}>{t}</span>)}
                          </div>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="btn btn-sm" onClick={() => startEditPending(item)}>Edit</button>
                        <button className="btn btn-sm btn-primary" style={justPublishedId === item.id ? { background: '#1D9E75', borderColor: '#1D9E75' } : undefined} onClick={() => publishItem(item)}>
                          {justPublishedId === item.id ? '✓ Published' : '✓ Publish to View IT'}
                        </button>
                        <button className="btn btn-sm" style={{ color: '#E24B4A' }} onClick={() => deletePendingItem(item)}>Delete</button>
                      </div>
                    </div>
                    {expandedPreviewId === item.id && (
                      <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
                        {previewLoading ? (
                          <p style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Loading preview…</p>
                        ) : previewUrl ? (
                          <video src={previewUrl} controls style={{ width: '100%', maxHeight: 360, borderRadius: 8, background: '#000' }} />
                        ) : null}
                      </div>
                    )}
                  </div>
                )}
                </div>
              </div>
            ))}
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
              {events.map(ev => <option key={ev.id} value={ev.id}>{eventLabel(ev)}</option>)}
            </select>
          )}
          {folders.length > 0 && (
            <select value={filterFolderId} onChange={e => setFilterFolderId(e.target.value)} style={{ fontSize: 13 }}>
              <option value="">All folders</option>
              {folders.map(fo => <option key={fo.id} value={fo.id}>{fo.name}</option>)}
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
