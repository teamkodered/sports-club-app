import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import { useFightFootageUpload } from '../hooks/useFightFootageUpload.jsx'
import { ALL_GRADES, EVENT_TYPES } from '../lib/mediaConstants.js'
import CctvViewer from './CctvViewer.jsx'
import Uploads from './Uploads.jsx'
import ViewIt from './ViewIt.jsx'

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
  const [allTags, setAllTags] = useState([]) // every distinct tag already in use, for autocomplete
  const [students, setStudents] = useState([])
  const [loaded, setLoaded] = useState(false)

  const [filterEventId, setFilterEventId] = useState('')
  const [filterStudentId, setFilterStudentId] = useState('')
  const [filterTag, setFilterTag] = useState('')
  const [filterGrade, setFilterGrade] = useState('')
  const [filterEventType, setFilterEventType] = useState('')
  const [searchText, setSearchText] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const [tab, setTab] = useState('cctv')

  useEffect(() => { load() }, [])

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
  function clearFilters() {
    setFilterEventId(''); setFilterStudentId(''); setFilterTag(''); setFilterGrade(''); setFilterEventType(''); setSearchText(''); setDateFrom(''); setDateTo('')
  }

  const sharedProps = {
    footage, visibleFootage, events, setEvents, allTags, students, studentName, loaded, load,
    filterEventId, setFilterEventId, filterStudentId, setFilterStudentId, filterTag, setFilterTag,
    filterGrade, setFilterGrade, filterEventType, setFilterEventType, searchText, setSearchText,
    dateFrom, setDateFrom, dateTo, setDateTo, hasAnyFilter, clearFilters,
    upload, startUpload, startBulkUpload,
  }

  return (
    <div>
      <button className="btn btn-sm" style={{ marginBottom: 12 }} onClick={() => navigate(-1)}>← Back</button>

      <div className="page-header">
        <h1>Media</h1>
        <p>CCTV footage and coach-shared fight/sparring video, all in one place</p>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button className={tab === 'cctv' ? 'btn btn-primary' : 'btn'} onClick={() => setTab('cctv')}>📹 CCTV</button>
        <button className={tab === 'uploads' ? 'btn btn-primary' : 'btn'} onClick={() => setTab('uploads')}>⬆️ Uploads</button>
        <button className={tab === 'view-it' ? 'btn btn-primary' : 'btn'} onClick={() => setTab('view-it')}>🥊 View IT</button>
      </div>

      {tab === 'cctv' && <CctvViewer embedded />}
      {tab === 'uploads' && <Uploads {...sharedProps} />}
      {tab === 'view-it' && <ViewIt embedded {...sharedProps} />}
    </div>
  )
}
