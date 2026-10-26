import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import { useFightFootageUpload } from '../hooks/useFightFootageUpload.jsx'
import { ALL_GRADES, EVENT_TYPES } from '../lib/mediaConstants.js'
import { matchesSearch } from '../lib/searchMatch.js'
import CctvViewer from './CctvViewer.jsx'
import Uploads from './Uploads.jsx'
import ViewIt from './ViewIt.jsx'
import Study from './Study.jsx'
import AthleteMedia from '../components/media/AthleteMedia.jsx'
import { loadCalendarItems } from '../lib/footageEvents.js'

// Shared entry point for CCTV, Uploads, and View IT -- deliberately
// just a thin tab wrapper around three still-separate pages rather
// than merging their underlying data/access-control systems. CCTV
// stays staff-only security footage, View IT keeps its own
// coach/athlete sharing rules -- combining those into one system would
// risk exactly the kind of access-control bug already found and fixed
// once (a dual-role account seeing footage it shouldn't).
//
// Uploads and View IT DO share one thing though: the fight_footage
// library, its filters, and the event/student/tag lookups needed to
// both upload into and browse it -- that state lives here so setting
// a filter in Uploads is what View IT's list actually reflects,
// without either page needing to know about the other directly.
export default function Media() {
  const navigate = useNavigate()
  const { upload, startUpload, startBulkUpload } = useFightFootageUpload()

  const [footage, setFootage] = useState([])
  const [events, setEvents] = useState([])
  const [folders, setFolders] = useState([])
  const [allTags, setAllTags] = useState([]) // every distinct tag already in use, for autocomplete
  const [students, setStudents] = useState([])
  const [calendarItems, setCalendarItems] = useState([]) // fixtures + club events, offered as one-tap events for uploading / tagging
  const [loaded, setLoaded] = useState(false)

  const [filterEventId, setFilterEventId] = useState('')
  const [filterFolderId, setFilterFolderId] = useState('')
  const [filterStudentId, setFilterStudentId] = useState('')
  const [filterTag, setFilterTag] = useState('')
  const [filterGrade, setFilterGrade] = useState('')
  const [filterEventType, setFilterEventType] = useState('')
  const [searchText, setSearchText] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  // One row of tabs -- 👥 Athletes · 📹 CCTV · ⬆️ Uploads · 🥊 View IT · 📚 Study.
  // All start hidden: press a tab to show it, press it again to hide it.
  const [openTab, setOpenTab] = useState(null)
  const toggleTab = t => setOpenTab(cur => (cur === t ? null : t))

  useEffect(() => { load() }, [])
  useEffect(() => { loadCalendarItems().then(setCalendarItems).catch(() => setCalendarItems([])) }, [])

  // The actual upload lives in a shared context (see
  // useFightFootageUpload) so it survives navigating away from this
  // page (or switching tabs) entirely -- this just refreshes the
  // library here if/when it finishes while still on this page.
  const prevUploadStatusRef = useRef(null)
  useEffect(() => {
    if (upload?.status === 'done' && prevUploadStatusRef.current !== 'done') load()
    prevUploadStatusRef.current = upload?.status
  }, [upload?.status])

  async function load() {
    const [{ data: f }, { data: s }, { data: e }, { data: fo }, { data: markerNotes }] = await Promise.all([
      supabase.from('fight_footage').select('*, fight_footage_athletes(student_id), fight_footage_featured(student_id, students(members(first_name, last_name))), events(id, name, event_type, event_date), footage_folders(id, name)').order('uploaded_at', { ascending: false }),
      supabase.from('students').select('id, is_kr, is_pts, discipline, in_comp, photo_url, members(first_name, last_name)'),
      supabase.from('events').select('*').order('event_date', { ascending: false }),
      supabase.from('footage_folders').select('*').order('name'),
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
    // Athlete and event names are searchable too, so typing "jake regionals"
    // finds Jake's Regionals fights without touching the dropdowns.
    const withNotes = (f || []).map(item => ({
      ...item,
      _searchableNotes: [
        notesByFootage[item.id] || '',
        item.events?.name || '',
        ...(item.fight_footage_featured || []).map(a => `${a.students?.members?.first_name || ''} ${a.students?.members?.last_name || ''}`),
      ].join(' '),
    }))
    setFootage(withNotes)
    setStudents(s || [])
    setEvents(e || [])
    setFolders(fo || [])
    const tagSet = new Set()
    for (const item of withNotes) for (const t of (item.tags || [])) tagSet.add(t)
    setAllTags([...tagSet].sort())
    setLoaded(true)
  }

  function studentName(s) {
    return `${s.members?.first_name || ''} ${s.members?.last_name || ''}`.trim()
  }

  // Study videos / links (kind = 'study') only show in the 📚 Study tab
  const studyFootage = footage.filter(item => item.kind === 'study')
  const visibleFootage = footage.filter(item => {
    if (item.kind === 'study') return false
    if (!item.published) return false // sits in the Uploads pending list until explicitly published
    if (filterEventId && item.event_id !== filterEventId) return false
    if (filterFolderId && item.folder_id !== filterFolderId) return false
    if (filterStudentId && !(item.fight_footage_featured || []).some(a => a.student_id === filterStudentId)) return false
    if (filterTag && !(item.tags || []).includes(filterTag)) return false
    if (filterGrade && item.grade_tag !== filterGrade) return false
    if (filterEventType && item.events?.event_type !== filterEventType) return false
    if (dateFrom && item.uploaded_at < dateFrom) return false
    if (dateTo && item.uploaded_at > dateTo + 'T23:59:59') return false
    if (searchText.trim() && !matchesSearch(searchText, item.title, item.description, item._searchableNotes)) return false
    return true
  })

  const pendingFootage = footage.filter(item => !item.published && item.kind !== 'study')

  const hasAnyFilter = filterEventId || filterFolderId || filterStudentId || filterTag || filterGrade || filterEventType || searchText || dateFrom || dateTo
  function clearFilters() {
    setFilterEventId(''); setFilterFolderId(''); setFilterStudentId(''); setFilterTag(''); setFilterGrade(''); setFilterEventType(''); setSearchText(''); setDateFrom(''); setDateTo('')
  }

  const sharedProps = {
    footage, visibleFootage, pendingFootage, events, setEvents, folders, setFolders, allTags, students, studentName, loaded, load,
    filterEventId, setFilterEventId, filterFolderId, setFilterFolderId, filterStudentId, setFilterStudentId, filterTag, setFilterTag,
    filterGrade, setFilterGrade, filterEventType, setFilterEventType, searchText, setSearchText,
    dateFrom, setDateFrom, dateTo, setDateTo, hasAnyFilter, clearFilters,
    upload, startUpload, startBulkUpload, calendarItems,
  }

  return (
    <div>
      <button className="btn btn-sm" style={{ marginBottom: 12 }} onClick={() => navigate(-1)}>← Back</button>

      <div className="page-header">
        <h1>Media</h1>
        <p>CCTV footage and coach-shared fight/sparring video, all in one place</p>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <button className={openTab === 'athletes' ? 'btn btn-primary' : 'btn'} onClick={() => toggleTab('athletes')}>👥 Athletes {openTab === 'athletes' ? '▾' : '▸'}</button>
        <button className={openTab === 'cctv' ? 'btn btn-primary' : 'btn'} onClick={() => toggleTab('cctv')}>📹 CCTV {openTab === 'cctv' ? '▾' : '▸'}</button>
        <button className={openTab === 'uploads' ? 'btn btn-primary' : 'btn'} onClick={() => toggleTab('uploads')}>⬆️ Uploads {openTab === 'uploads' ? '▾' : '▸'}</button>
        <button className={openTab === 'view-it' ? 'btn btn-primary' : 'btn'} onClick={() => toggleTab('view-it')}>🥊 View IT {openTab === 'view-it' ? '▾' : '▸'}</button>
        <button className={openTab === 'study' ? 'btn btn-primary' : 'btn'} onClick={() => toggleTab('study')}>📚 Study {openTab === 'study' ? '▾' : '▸'}</button>
      </div>

      {openTab === 'athletes' && <AthleteMedia students={students} />}
      {openTab === 'cctv' && <CctvViewer embedded />}
      {openTab === 'uploads' && <Uploads {...sharedProps} />}
      {openTab === 'view-it' && <ViewIt embedded {...sharedProps} />}
      {openTab === 'study' && <Study studyFootage={studyFootage} students={students} studentName={studentName} load={load} startUpload={startUpload} startBulkUpload={startBulkUpload} />}
    </div>
  )
}
