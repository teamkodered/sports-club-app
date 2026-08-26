import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../hooks/useAuth.jsx'
import { useBackableTab } from '../hooks/useBackableTab.js'
import * as XLSX from 'xlsx'

// Loosely finds the "name" and "amount" columns in an uploaded
// spreadsheet, since bank/standing-order exports vary a lot in
// their exact headers.
const NAME_HEADER_HINTS = ['name', 'description', 'reference', 'payer', 'payee', 'details', 'narrative']
const AMOUNT_HEADER_HINTS = ['amount', 'credit', 'value', 'paid', 'total']

function detectColumns(rows) {
  if (!rows.length) return { nameKey: null, amountKey: null }
  const headers = Object.keys(rows[0])
  const nameKey = headers.find(h => NAME_HEADER_HINTS.some(hint => h.toLowerCase().includes(hint))) || headers[0]
  const amountKey = headers.find(h => AMOUNT_HEADER_HINTS.some(hint => h.toLowerCase().includes(hint)))
    || headers.find(h => h !== nameKey && rows.some(r => !isNaN(parseFloat(r[h]))))
  return { nameKey, amountKey }
}

function normalizeName(s) {
  // Turn anything that isn't a letter into a SPACE (not delete it) so
  // hyphenated names like "Ellis-Jay" split into separate words instead
  // of getting squashed into "ellisjay" -- a bank export writing it as
  // "Ellis Jay" would otherwise never be able to match.
  return (s || '').toString().trim().toLowerCase().replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim()
}

const TITLE_WORDS = new Set(['mr', 'mrs', 'miss', 'ms', 'mx', 'dr'])

function wordsOf(s) {
  return normalizeName(s).split(' ').filter(w => w && !TITLE_WORDS.has(w))
}

// Bulk-send options for a set of selected people -- Email (true BCC,
// one message, everyone included) and Text/SMS (comma-joined numbers,
// works well on iOS and most Android browsers as a group text) both
// genuinely support addressing everyone at once. WhatsApp does NOT --
// there's no bulk/broadcast mechanism via a simple link, wa.me only
// ever opens a chat with exactly one number -- so instead of pretending
// otherwise, this shows a small list letting the sender quickly click
// through each person in turn, with the message already pre-filled
// for each one (saves searching for each contact + retyping the
// message, even though it's still one tap per person).
function BulkSendOptions({ people, subjectText, bodyText, noun = 'people' }) {
  const [showWhatsapp, setShowWhatsapp] = useState(false)
  const emailPeople = people.filter(p => p.email)
  const phonePeople = people.filter(p => p.phone)
  const subject = encodeURIComponent(subjectText)
  const body = encodeURIComponent(bodyText)
  // UK-centric default: wa.me needs full international digits with no
  // leading 0/+ -- converts a local "07..." number to "447...".
  const toWhatsappNumber = phone => {
    const digits = phone.replace(/[^0-9]/g, '')
    return digits.startsWith('0') ? '44' + digits.slice(1) : digits
  }
  return (
    <div style={{ display: 'flex', gap: 8, position: 'relative' }}>
      <a className="btn btn-sm btn-primary"
        href={emailPeople.length ? `mailto:?bcc=${emailPeople.map(p => p.email).join(',')}&subject=${subject}&body=${body}` : undefined}
        onClick={e => { if (!emailPeople.length) { e.preventDefault(); alert(`None of the selected ${noun} have a real email on file.`) } }}>
        ✉️ Email ({emailPeople.length})
      </a>
      <a className="btn btn-sm"
        href={phonePeople.length ? `sms:${phonePeople.map(p => p.phone).join(',')}?body=${body}` : undefined}
        onClick={e => { if (!phonePeople.length) { e.preventDefault(); alert(`None of the selected ${noun} have a phone number on file.`) } }}>
        📱 Text ({phonePeople.length})
      </a>
      <button type="button" className="btn btn-sm" disabled={!phonePeople.length} onClick={() => setShowWhatsapp(v => !v)}>
        💬 WhatsApp ({phonePeople.length})
      </button>
      {showWhatsapp && (
        <div className="card" style={{ position: 'absolute', top: '110%', right: 0, zIndex: 20, width: 260, maxHeight: 280, overflowY: 'auto', padding: 10 }}>
          <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 8 }}>
            WhatsApp can't send to everyone in one go — tap a name to open a chat with them, message already filled in.
          </p>
          {phonePeople.map((p, i) => (
            <a key={i} href={`https://wa.me/${toWhatsappNumber(p.phone)}?text=${body}`} target="_blank" rel="noreferrer"
              style={{ display: 'block', padding: '6px 2px', fontSize: 12, borderBottom: i < phonePeople.length - 1 ? '1px solid var(--border)' : 'none' }}>
              💬 {p.name}
            </a>
          ))}
        </div>
      )}
    </div>
  )
}

export default function CRM() {
  const { isAdmin } = useAuth()
  const [tab, setTab] = useBackableTab('standing_orders')
  const [students, setStudents] = useState([])
  const [payerLinks, setPayerLinks] = useState([])
  const [payments, setPayments] = useState([]) // parsed from the uploaded file: [{ name, amount, raw }]
  const [pastUploads, setPastUploads] = useState([]) // [{ id, uploaded_at, filename }] -- history list, not the full payments
  const [activeUploadId, setActiveUploadId] = useState(null) // which past upload (if any) is currently loaded
  const [lastAction, setLastAction] = useState(null) // { label, undo } -- covers every undoable action on this page, not just dismiss
  const [unmatchedSearch, setUnmatchedSearch] = useState('')
  const [unpaidSearch, setUnpaidSearch] = useState('')
  const [paidSearch, setPaidSearch] = useState('')
  const [addingNoteForStudent, setAddingNoteForStudent] = useState(null) // student object, or null
  const [athleteNotesByStudent, setAthleteNotesByStudent] = useState({}) // student_id -> [{id, note_text, created_at}], newest first
  const [quickNoteDraft, setQuickNoteDraft] = useState('')
  const [savingQuickNote, setSavingQuickNote] = useState(false)
  const [loading, setLoading] = useState(false)
  const [draggedPayment, setDraggedPayment] = useState(null)
  const [dragOverStudentId, setDragOverStudentId] = useState(null)
  const [selectedPaymentIdx, setSelectedPaymentIdx] = useState(null) // click-to-select alternative to drag & drop
  const [venueFilter, setVenueFilter] = useState('all') // all | krcentre_pka | derbymoore | moorways | krba
  const [missedTraining, setMissedTraining] = useState([]) // computed list, loaded on first visit to that tab
  const [stoppedStudents, setStoppedStudents] = useState([])
  const [stoppedLoaded, setStoppedLoaded] = useState(false)
  const [stoppedLoading, setStoppedLoading] = useState(false)
  const [selectedStopped, setSelectedStopped] = useState(new Set())
  const [stoppedSearch, setStoppedSearch] = useState('')
  const [holidayModalFor, setHolidayModalFor] = useState(null) // { id, name } of the student currently being given a holiday, or null
  const [holidayForm, setHolidayForm] = useState({ name: '', start_date: '', end_date: '' })
  const [savingHoliday, setSavingHoliday] = useState(false)
  const [missedTrainingLoaded, setMissedTrainingLoaded] = useState(false)
  const [missedTrainingLoading, setMissedTrainingLoading] = useState(false)
  const [selectedMissed, setSelectedMissed] = useState(new Set())
  const [autoSendMissedTraining, setAutoSendMissedTraining] = useState(false)
  const [showMissedTrainingHelp, setShowMissedTrainingHelp] = useState(false)
  const [mtTemplates, setMtTemplates] = useState([
    { label: 'Template 1', body: '' },
    { label: 'Template 2', body: '' },
    { label: 'Template 3', body: '' },
    { label: 'Template 4', body: '' },
    { label: 'Template 5', body: '' },
  ])
  const [mtEditingIdx, setMtEditingIdx] = useState(null)
  const [mtTemplateDraft, setMtTemplateDraft] = useState({ label: '', body: '' })
  const [mtSavingTemplate, setMtSavingTemplate] = useState(false)
  const [mtSelectedTemplateIdx, setMtSelectedTemplateIdx] = useState(null)
  const [mtRecipientId, setMtRecipientId] = useState(null)
  const [mtRecipientSearch, setMtRecipientSearch] = useState('')
  const [birthdays, setBirthdays] = useState([]) // computed list, loaded on first visit to that tab
  const [birthdaysLoaded, setBirthdaysLoaded] = useState(false)
  const [selectedBirthdays, setSelectedBirthdays] = useState(new Set())
  const [autoSendBirthdays, setAutoSendBirthdays] = useState(false)
  const [showBirthdaysHelp, setShowBirthdaysHelp] = useState(false)
  const [bdTemplates, setBdTemplates] = useState([
    { label: 'Template 1', body: '' },
    { label: 'Template 2', body: '' },
    { label: 'Template 3', body: '' },
    { label: 'Template 4', body: '' },
    { label: 'Template 5', body: '' },
  ])
  const [bdEditingIdx, setBdEditingIdx] = useState(null)
  const [bdTemplateDraft, setBdTemplateDraft] = useState({ label: '', body: '' })
  const [bdSavingTemplate, setBdSavingTemplate] = useState(false)
  const [bdSelectedTemplateIdx, setBdSelectedTemplateIdx] = useState(null)
  const [bdRecipientId, setBdRecipientId] = useState(null)
  const [bdRecipientSearch, setBdRecipientSearch] = useState('')
  const [showMessagesHelp, setShowMessagesHelp] = useState(false)
  const [msgTemplates, setMsgTemplates] = useState([
    { label: 'Template 1', body: '' },
    { label: 'Template 2', body: '' },
    { label: 'Template 3', body: '' },
    { label: 'Template 4', body: '' },
    { label: 'Template 5', body: '' },
  ])
  const [msgEditingIdx, setMsgEditingIdx] = useState(null)
  const [msgTemplateDraft, setMsgTemplateDraft] = useState({ label: '', body: '' })
  const [msgSavingTemplate, setMsgSavingTemplate] = useState(false)
  const [msgSelectedTemplateIdx, setMsgSelectedTemplateIdx] = useState(null)
  const [messagesSortKey, setMessagesSortKey] = useState('name')
  const [messagesGroupFilter, setMessagesGroupFilter] = useState('')
  const [messagesGroupFilterOpen, setMessagesGroupFilterOpen] = useState(false)
  const [inboxLoaded, setInboxLoaded] = useState(false)
  const [inboxLoading, setInboxLoading] = useState(false)
  const [inboxMessages, setInboxMessages] = useState([])
  const [inboxError, setInboxError] = useState(null)
  const [testEmailStatus, setTestEmailStatus] = useState(null) // null | 'sending' | 'sent' | 'error'
  const [openMessage, setOpenMessage] = useState(null) // full message detail once loaded, or null
  const [openMessageLoading, setOpenMessageLoading] = useState(false)
  const [openMessageError, setOpenMessageError] = useState(null)
  const [replyDraft, setReplyDraft] = useState(null) // { to, subject, body } while composing, or null
  const [replySending, setReplySending] = useState(false)
  const [messagesSortDir, setMessagesSortDir] = useState('asc')
  const [courses, setCourses] = useState([])
  const [coursesLoaded, setCoursesLoaded] = useState(false)
  const [editingCourse, setEditingCourse] = useState(null) // {} for new, or the course object
  const [courseForm, setCourseForm] = useState({ title: '', description: '', poster_url: '', start_date: '', end_date: '', location: '', price: '', message_text: '' })
  const [courseInterest, setCourseInterest] = useState({}) // course_id -> array of responses
  const [loadingInterestFor, setLoadingInterestFor] = useState(null)
  const [savingCourse, setSavingCourse] = useState(false)
  const [uploadingPoster, setUploadingPoster] = useState(false)
  const [expandedCourseId, setExpandedCourseId] = useState(null)
  const [showUploadHelp, setShowUploadHelp] = useState(false)
  const [templates, setTemplates] = useState([
    { label: 'Template 1', body: '' },
    { label: 'Template 2', body: '' },
    { label: 'Template 3', body: '' },
    { label: 'Template 4', body: '' },
    { label: 'Template 5', body: '' },
  ])
  const [templatesLoaded, setTemplatesLoaded] = useState(false)
  const [editingTemplateIdx, setEditingTemplateIdx] = useState(null) // index being edited, or null
  const [templateDraft, setTemplateDraft] = useState({ label: '', body: '' })
  const [savingTemplate, setSavingTemplate] = useState(false)
  const [selectedTemplateIdx, setSelectedTemplateIdx] = useState(null)
  const [templateRecipientId, setTemplateRecipientId] = useState(null) // student id chosen to send the selected template to
  const [templateRecipientSearch, setTemplateRecipientSearch] = useState('')

  useEffect(() => {
    supabase.from('settings').select('value').eq('key', 'crm_payment_reminder_templates').single()
      .then(({ data }) => {
        if (Array.isArray(data?.value) && data.value.length === 5) setTemplates(data.value)
        setTemplatesLoaded(true)
      })
    supabase.from('settings').select('value').eq('key', 'crm_missed_training_templates').single()
      .then(({ data }) => {
        if (Array.isArray(data?.value) && data.value.length === 5) setMtTemplates(data.value)
      })
    supabase.from('settings').select('value').eq('key', 'crm_birthday_templates').single()
      .then(({ data }) => {
        if (Array.isArray(data?.value) && data.value.length === 5) setBdTemplates(data.value)
      })
    supabase.from('settings').select('value').eq('key', 'crm_general_message_templates').single()
      .then(({ data }) => {
        if (Array.isArray(data?.value) && data.value.length === 5) setMsgTemplates(data.value)
      })
  }, [])

  async function saveTemplate(idx) {
    setSavingTemplate(true)
    const updated = templates.map((t, i) => i === idx ? { ...templateDraft } : t)
    const { error } = await supabase.from('settings').upsert({ key: 'crm_payment_reminder_templates', value: updated }, { onConflict: 'key' })
    setSavingTemplate(false)
    if (error) { alert('Error saving template: ' + error.message); return }
    setTemplates(updated)
    setEditingTemplateIdx(null)
  }

  async function saveMtTemplate(idx) {
    setMtSavingTemplate(true)
    const updated = mtTemplates.map((t, i) => i === idx ? { ...mtTemplateDraft } : t)
    const { error } = await supabase.from('settings').upsert({ key: 'crm_missed_training_templates', value: updated }, { onConflict: 'key' })
    setMtSavingTemplate(false)
    if (error) { alert('Error saving template: ' + error.message); return }
    setMtTemplates(updated)
    setMtEditingIdx(null)
  }

  async function saveBdTemplate(idx) {
    setBdSavingTemplate(true)
    const updated = bdTemplates.map((t, i) => i === idx ? { ...bdTemplateDraft } : t)
    const { error } = await supabase.from('settings').upsert({ key: 'crm_birthday_templates', value: updated }, { onConflict: 'key' })
    setBdSavingTemplate(false)
    if (error) { alert('Error saving template: ' + error.message); return }
    setBdTemplates(updated)
    setBdEditingIdx(null)
  }

  async function saveMsgTemplate(idx) {
    setMsgSavingTemplate(true)
    const updated = msgTemplates.map((t, i) => i === idx ? { ...msgTemplateDraft } : t)
    const { error } = await supabase.from('settings').upsert({ key: 'crm_general_message_templates', value: updated }, { onConflict: 'key' })
    setMsgSavingTemplate(false)
    if (error) { alert('Error saving template: ' + error.message); return }
    setMsgTemplates(updated)
    setMsgEditingIdx(null)
  }

  async function loadCourses() {
    const { data } = await supabase.from('courses').select('*').order('start_date', { ascending: true })
    setCourses(data || [])
    setCoursesLoaded(true)
  }

  function startEditCourse(course) {
    setEditingCourse(course || {})
    setCourseForm(course
      ? { title: course.title, description: course.description || '', poster_url: course.poster_url || '', start_date: course.start_date, end_date: course.end_date || '', location: course.location || '', price: course.price || '', message_text: course.message_text || '' }
      : { title: '', description: '', poster_url: '', start_date: '', end_date: '', location: '', price: '', message_text: '' })
  }

  async function uploadCoursePoster(file) {
    setUploadingPoster(true)
    const path = `courses/${Date.now()}-${file.name}`
    const { error } = await supabase.storage.from('athlete-media').upload(path, file)
    if (!error) {
      const { data: urlData } = supabase.storage.from('athlete-media').getPublicUrl(path)
      setCourseForm(f => ({ ...f, poster_url: urlData.publicUrl }))
    } else {
      alert('Error uploading poster: ' + error.message)
    }
    setUploadingPoster(false)
  }

  async function saveCourse() {
    if (!courseForm.title || !courseForm.start_date) { alert('Please fill in at least a title and start date.'); return }
    setSavingCourse(true)
    const payload = { ...courseForm, end_date: courseForm.end_date || null }
    let error
    if (editingCourse?.id) {
      ;({ error } = await supabase.from('courses').update(payload).eq('id', editingCourse.id))
    } else {
      ;({ error } = await supabase.from('courses').insert(payload))
    }
    setSavingCourse(false)
    if (error) { alert('Error saving course: ' + error.message); return }
    setEditingCourse(null)
    await loadCourses()
  }

  async function deleteCourse(id) {
    if (!confirm('Delete this course?')) return
    const { error } = await supabase.from('courses').delete().eq('id', id)
    if (error) { alert('Error deleting course: ' + error.message); return }
    setCourses(prev => prev.filter(c => c.id !== id))
  }

  const [gradingRequests, setGradingRequests] = useState([])
  const [gradingLoaded, setGradingLoaded] = useState(false)
  const [gradingLoading, setGradingLoading] = useState(false)
  const [approvingGradingId, setApprovingGradingId] = useState(null)

  async function loadGradingRequests() {
    setGradingLoading(true)
    const cutoff = new Date()
    cutoff.setMonth(cutoff.getMonth() - 3)
    const cutoffStr = cutoff.toISOString().split('T')[0]

    const { data, error } = await supabase
      .from('grading_expressions')
      .select('*, students(id, discipline, pka_belt, krba_level, members(first_name, last_name))')
      .order('created_at', { ascending: false })
    if (error) { alert('Error loading grading requests: ' + error.message); setGradingLoading(false); return }

    const enriched = await Promise.all((data || []).map(async (r) => {
      if (!r.student_id) return { ...r, attendanceCount: null }
      const { count } = await supabase.from('attendance').select('*', { count: 'exact', head: true })
        .eq('student_id', r.student_id).gte('session_date', cutoffStr)
      return { ...r, attendanceCount: count ?? 0 }
    }))

    setGradingRequests(enriched)
    setGradingLoaded(true)
    setGradingLoading(false)
  }

  async function approveGrading(id) {
    setApprovingGradingId(id)
    const { error } = await supabase.from('grading_expressions').update({ coach_approved: true }).eq('id', id)
    setApprovingGradingId(null)
    if (error) { alert('Error approving: ' + error.message); return }
    setGradingRequests(prev => prev.map(r => r.id === id ? { ...r, coach_approved: true } : r))
  }

  async function loadCourseInterest(courseId) {
    setLoadingInterestFor(courseId)
    const { data } = await supabase.from('course_interest').select('*').eq('course_id', courseId).order('submitted_at', { ascending: false })
    const rows = data || []

    // Try to match each respondent to an existing student (this form is
    // open/anonymous -- just a name + email/phone typed in -- so there's
    // no guaranteed link). Email match first, then phone. If exactly one
    // member matches, pull their attendance for the last 3 months.
    const cutoff = new Date()
    cutoff.setMonth(cutoff.getMonth() - 3)
    const cutoffStr = cutoff.toISOString().split('T')[0]

    const enriched = await Promise.all(rows.map(async (r) => {
      let matches = []
      if (r.email) {
        const { data: m } = await supabase.from('members').select('id, first_name, last_name, students(id)').ilike('email', r.email)
        matches = m || []
      }
      if (matches.length === 0 && r.phone) {
        const { data: m } = await supabase.from('members').select('id, first_name, last_name, students(id)').eq('phone', r.phone)
        matches = m || []
      }
      if (matches.length !== 1) return { ...r, attendanceCount: null } // no match, or ambiguous -- treat as not an existing student
      const studentIds = (matches[0].students || []).map(s => s.id)
      if (studentIds.length === 0) return { ...r, attendanceCount: 0 }
      const { count } = await supabase.from('attendance').select('*', { count: 'exact', head: true })
        .in('student_id', studentIds).gte('session_date', cutoffStr)
      return { ...r, attendanceCount: count ?? 0 }
    }))

    setCourseInterest(prev => ({ ...prev, [courseId]: enriched }))
    setLoadingInterestFor(null)
  }

  async function confirmAttendance(interestId, courseId) {
    const { error } = await supabase.from('course_interest')
      .update({ status: 'confirmed', confirmed_at: new Date().toISOString() }).eq('id', interestId)
    if (error) { alert('Error confirming: ' + error.message); return }
    setCourseInterest(prev => ({
      ...prev,
      [courseId]: (prev[courseId] || []).map(r => r.id === interestId ? { ...r, status: 'confirmed', confirmed_at: new Date().toISOString() } : r),
    }))
  }

  useEffect(() => { loadData() }, [])
  useEffect(() => { loadPastUploads() }, [])

  async function loadPastUploads() {
    const { data } = await supabase.from('standing_order_uploads')
      .select('id, uploaded_at, filename').order('uploaded_at', { ascending: false }).limit(30)
    setPastUploads(data || [])
  }

  async function openPastUpload(id) {
    const { data, error } = await supabase.from('standing_order_uploads').select('payments').eq('id', id).single()
    if (error) { alert('Error opening this list: ' + error.message); return }
    setPayments(data.payments || [])
    setSelectedPaymentIdx(null)
    setActiveUploadId(id)
    setLastAction(null)
  }

  async function saveQuickNote() {
    if (!addingNoteForStudent || !quickNoteDraft.trim()) return
    setSavingQuickNote(true)
    const { data, error } = await supabase.from('athlete_notes_log').insert({
      student_id: addingNoteForStudent.id, note_text: quickNoteDraft.trim(), author_role: 'coach', visible_to_athlete: false,
    }).select().single()
    setSavingQuickNote(false)
    if (error) { alert('Error saving note: ' + error.message); return }
    setAthleteNotesByStudent(prev => ({
      ...prev,
      [addingNoteForStudent.id]: [data, ...(prev[addingNoteForStudent.id] || [])],
    }))
    setQuickNoteDraft('')
  }

  async function markSponsored(studentId, sponsored) {
    const priorValue = students.find(s => s.id === studentId)?.sponsored ?? false
    const { error } = await supabase.from('students').update({ sponsored }).eq('id', studentId)
    if (error) { alert('Error updating: ' + error.message); return }
    setStudents(prev => prev.map(s => s.id === studentId ? { ...s, sponsored } : s))
    setLastAction({
      label: sponsored ? 'Marked as sponsored' : 'Unmarked as sponsored',
      undo: async () => {
        await supabase.from('students').update({ sponsored: priorValue }).eq('id', studentId)
        setStudents(prev => prev.map(s => s.id === studentId ? { ...s, sponsored: priorValue } : s))
      },
    })
  }

  // Opens the device's native share sheet (Messages, WhatsApp, Email, etc.)
  // pre-filled with the given text. Falls back to copying to clipboard
  // on browsers/desktops without Web Share support. Empty text is
  // rejected up front -- navigator.share() throws for an empty/blank
  // string (no valid share data), and that error was previously
  // swallowed silently by the same catch used for "user cancelled",
  // making an empty template look identical to a working share sheet
  // that simply didn't open.
  // Opens the device's native share sheet (Messages, WhatsApp, Email, etc.)
  // pre-filled with the given text. Falls back to copying to clipboard
  // on browsers/desktops without Web Share support. Empty text is
  // rejected up front -- navigator.share() throws for an empty/blank
  // string (no valid share data), and that error was previously
  // swallowed silently by the same catch used for "user cancelled",
  // making an empty template look identical to a working share sheet
  // that simply didn't open.
  async function shareText(text) {
    if (!text || !text.trim()) {
      alert("This message is empty — add some text to the template first.")
      return
    }
    if (navigator.share) {
      try {
        await navigator.share({ text })
      } catch (e) {
        // AbortError = the person closed the share sheet themselves,
        // nothing to report. Anything else is a real failure worth
        // surfacing rather than silently swallowing.
        if (e.name !== 'AbortError') {
          console.error('Share failed:', e)
          alert('Could not open the share sheet: ' + (e.message || e.name))
        }
      }
      return
    }
    try {
      await navigator.clipboard.writeText(text)
      alert('Share isn\'t supported on this browser — message copied to clipboard instead.')
    } catch {
      alert(text)
    }
  }

  // Loads the club mailbox's recent inbox via IMAP (list-inbox.js) --
  // also doubles as a straightforward way to check the mailbox
  // credentials are actually working, since a failure here surfaces a
  // clear error (e.g. wrong password) rather than needing to guess.
  async function loadInbox() {
    setInboxLoading(true)
    setInboxError(null)
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const accessToken = sessionData?.session?.access_token
      const res = await fetch('/.netlify/functions/list-inbox', {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      const result = await res.json()
      if (!res.ok || result.error) {
        setInboxError(result.error || res.statusText)
      } else {
        setInboxMessages(result.messages || [])
      }
    } catch (e) {
      setInboxError(e.message)
    }
    setInboxLoaded(true)
    setInboxLoading(false)
  }

  // Sends a real test email to the club's own address -- a quick,
  // unambiguous way to confirm the SMTP side (sending) is working,
  // separate from the IMAP side (reading) that loadInbox checks.
  async function sendTestEmail() {
    setTestEmailStatus('sending')
    const ok = await sendRealEmail(
      'info@derbykickboxing.org.uk',
      'Test email from the app',
      `This is a test email sent from the CRM's Email tab at ${new Date().toLocaleString('en-GB')}, to confirm sending is working correctly.`
    )
    setTestEmailStatus(ok ? 'sent' : 'error')
  }

  // Opens a single inbox message, fetching its full body on demand
  // (the list view only ever loads headers, to keep it fast).
  async function openInboxMessage(uid) {
    setOpenMessage({ uid }) // shows the modal immediately with a loading state
    setOpenMessageLoading(true)
    setOpenMessageError(null)
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const accessToken = sessionData?.session?.access_token
      const res = await fetch(`/.netlify/functions/list-inbox?uid=${uid}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      const result = await res.json()
      if (!res.ok || result.error) {
        setOpenMessageError(result.error || res.statusText)
      } else {
        setOpenMessage(result.message)
      }
    } catch (e) {
      setOpenMessageError(e.message)
    }
    setOpenMessageLoading(false)
  }

  async function sendReply() {
    if (!replyDraft) return
    setReplySending(true)
    const ok = await sendRealEmail(replyDraft.to, replyDraft.subject, replyDraft.body)
    setReplySending(false)
    if (ok) {
      alert(`✓ Reply sent to ${replyDraft.to}`)
      setReplyDraft(null)
      setOpenMessage(null)
    }
  }


  // via the send-email Netlify function -- an actual email that lands in the
  // recipient's inbox, not a mailto:/share-sheet handoff the person has to
  // action themselves.
  // Downloads the poster as its original, unmodified file -- a direct
  // blob transfer of the exact bytes stored, so there's zero quality
  // loss (no re-encoding/compression) when someone wants to edit and
  // re-upload an updated version.
  async function downloadPosterImage(course) {
    if (!course.poster_url) { alert('This course has no poster image set.'); return }
    try {
      const res = await fetch(course.poster_url)
      const blob = await res.blob()
      const ext = (course.poster_url.split('.').pop() || 'jpg').split('?')[0]
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${course.title.replace(/[^a-z0-9]/gi, '-')}-poster.${ext}`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (e) {
      alert('Could not download the image: ' + e.message)
    }
  }

  // Shares the ACTUAL poster image file (not just a link to it) via
  // the OS share sheet -- mailto:/sms:/wa.me links can never attach a
  // real file, only text and URLs, so this is the only way to send
  // the poster itself rather than a link to it.
  async function sharePosterFile(course) {
    if (!course.poster_url) { alert('This course has no poster image set.'); return }
    try {
      const res = await fetch(course.poster_url)
      const blob = await res.blob()
      const ext = (course.poster_url.split('.').pop() || 'jpg').split('?')[0]
      const file = new File([blob], `${course.title.replace(/[^a-z0-9]/gi, '-')}-poster.${ext}`, { type: blob.type || 'image/jpeg' })

      const interestUrl = `${window.location.origin}/course-interest?course_id=${course.id}`
      const caption = `${course.message_text || `Check out our upcoming course: ${course.title}`}\n\nExpress your interest here: ${interestUrl}`

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        // Many share targets (WhatsApp in particular) silently drop the
        // accompanying text/caption when a file is attached via the Web
        // Share API, keeping only the image -- a real platform
        // limitation, not something this code can force around. As a
        // reliable fallback, also copy the message onto the clipboard
        // so it can just be pasted into the same chat right after the
        // poster lands, even on a share target that dropped it.
        try { await navigator.clipboard.writeText(caption) } catch {}
        await navigator.share({ files: [file], title: course.title, text: caption })
        alert('Poster shared! Some apps drop the message text when sharing an image — it\'s been copied to your clipboard too, so just paste it into the same chat if it didn\'t come through.')
      } else {
        alert("This browser/device can't attach the actual image to a share — falling back to sharing the link instead.")
        await shareText(`${caption}\n${course.poster_url}`)
      }
    } catch (e) {
      if (e.name !== 'AbortError') alert('Could not share the poster: ' + e.message)
    }
  }

  async function sendRealEmail(to, subject, text) {
    if (!to) { alert('No email address on file for this person.'); return false }
    if (!text || !text.trim()) { alert('This message is empty — add some text to the template first.'); return false }
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const accessToken = sessionData?.session?.access_token
      const res = await fetch('/.netlify/functions/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ to, subject, text }),
      })
      const result = await res.json()
      if (!res.ok || result.error) { alert('Could not send email: ' + (result.error || res.statusText)); return false }
      return true
    } catch (e) {
      alert('Could not send email: ' + e.message)
      return false
    }
  }


  async function sharePaymentReminder(studentName, encodedMsgBody) {
    await shareText(decodeURIComponent(encodedMsgBody))
  }


  async function loadData() {
    setLoading(true)
    const [{ data: s }, { data: pl }, { data: notes }] = await Promise.all([
      supabase.from('students').select('id, student_ref, discipline, class_schedule, sponsored, guardian_name, pka_belt, krba_level, house_name, media_restriction, is_kr, is_pts, is_leader, is_coach, members(first_name, last_name, status, email, phone, date_of_birth, do_not_contact, houses(name))'),
      supabase.from('payer_links').select('*'),
      supabase.from('athlete_notes_log').select('id, student_id, note_text, created_at').order('created_at', { ascending: false }),
    ])
    setStudents((s || []).filter(x => x.members?.status === 'active'))
    setPayerLinks(pl || [])
    const grouped = {}
    ;(notes || []).forEach(n => { (grouped[n.student_id] ||= []).push(n) })
    setAthleteNotesByStudent(grouped)
    setLoading(false)
  }

  // "Missed training" = an active student with at least one assigned
  // class, whose most recent attendance record (of any class) is 28+
  // days ago -- or who has never attended at all despite being active
  // for 28+ days. Loaded on first visit to the tab, not on every page
  // load, since it's a heavier set of queries than the standing orders
  // check.
  async function saveStudentHoliday() {
    if (!holidayModalFor) return
    if (!holidayForm.start_date || !holidayForm.end_date) { alert('Please set both a From and To date.'); return }
    if (holidayForm.end_date < holidayForm.start_date) { alert('The To date must be on or after the From date.'); return }
    setSavingHoliday(true)
    const { error } = await supabase.from('holidays').insert({
      name: holidayForm.name.trim() || 'Holiday',
      start_date: holidayForm.start_date,
      end_date: holidayForm.end_date,
      student_id: holidayModalFor.id,
    })
    setSavingHoliday(false)
    if (error) { alert('Error saving holiday: ' + error.message); return }
    alert(`Holiday saved for ${holidayModalFor.name}.`)
    setHolidayModalFor(null)
  }

  async function loadStoppedStudents() {
    setStoppedLoading(true)
    const { data, error } = await supabase
      .from('students')
      .select('*, members!inner(first_name, last_name, email, phone, do_not_contact, status)')
      .eq('members.status', 'stopped')
      .order('members(last_name)')
    if (error) { alert('Error loading stopped students: ' + error.message); setStoppedLoading(false); return }
    setStoppedStudents(data || [])
    setStoppedLoaded(true)
    setStoppedLoading(false)
  }

  async function toggleDoNotContact(student) {
    const newValue = !student.members?.do_not_contact
    const { error } = await supabase.from('members').update({ do_not_contact: newValue }).eq('id', student.member_id)
    if (error) { alert('Error updating: ' + error.message); return }
    setStoppedStudents(prev => prev.map(s => s.id === student.id ? { ...s, members: { ...s.members, do_not_contact: newValue } } : s))
    // A do-not-contact person should never stay selected for a bulk send
    if (newValue) setSelectedStopped(prev => { const next = new Set(prev); next.delete(student.id); return next })
  }

  async function loadMissedTraining() {
    setMissedTrainingLoading(true)
    const [{ data: assignments }, { data: attendance }] = await Promise.all([
      supabase.from('student_class_assignments').select('student_id'),
      supabase.from('attendance').select('student_id, session_date').order('session_date', { ascending: false }),
    ])
    const assignedStudentIds = new Set((assignments || []).map(a => a.student_id))
    const lastAttendedByStudent = {}
    ;(attendance || []).forEach(a => {
      if (!lastAttendedByStudent[a.student_id]) lastAttendedByStudent[a.student_id] = a.session_date
    })
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - 28)
    const cutoffStr = cutoff.toISOString().split('T')[0]

    const results = students
      .filter(s => assignedStudentIds.has(s.id))
      .map(s => {
        const lastDate = lastAttendedByStudent[s.id] || null
        if (lastDate && lastDate >= cutoffStr) return null // trained recently, not missing
        const weeksMissed = lastDate
          ? Math.floor((Date.now() - new Date(lastDate).getTime()) / (7 * 24 * 60 * 60 * 1000))
          : null // never attended at all
        return { student: s, lastDate, weeksMissed }
      })
      .filter(Boolean)
      .sort((a, b) => (b.weeksMissed ?? 999) - (a.weeksMissed ?? 999))

    setMissedTraining(results)
    setMissedTrainingLoaded(true)
    setMissedTrainingLoading(false)
  }

  // Upcoming birthdays -- any active student whose next birthday
  // (this year, or next year if it's already passed) falls within the
  // next 28 days. Purely computed from date_of_birth already loaded
  // with students, so no extra queries needed.
  function loadBirthdays() {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const results = students
      .map(s => {
        const dob = s.members?.date_of_birth
        if (!dob) return null
        const birth = new Date(dob + 'T00:00:00')
        let next = new Date(today.getFullYear(), birth.getMonth(), birth.getDate())
        if (next < today) next = new Date(today.getFullYear() + 1, birth.getMonth(), birth.getDate())
        const daysUntil = Math.round((next - today) / (24 * 60 * 60 * 1000))
        if (daysUntil > 28) return null
        const turningAge = next.getFullYear() - birth.getFullYear()
        return { student: s, nextBirthday: next, daysUntil, turningAge }
      })
      .filter(Boolean)
      .sort((a, b) => a.daysUntil - b.daysUntil)
    setBirthdays(results)
    setBirthdaysLoaded(true)
  }

  // KR Centre PKA students are identified by having a day-pattern class_schedule
  // value (or being blank) rather than one of the two satellite venue names.
  const venueFilteredStudents = students.filter(s => {
    if (venueFilter === 'all') return true
    if (venueFilter === 'krcentre_pka') return s.discipline === 'PKA' && s.class_schedule !== 'Moorways' && s.class_schedule !== 'Derby Moore'
    if (venueFilter === 'derbymoore') return s.class_schedule === 'Derby Moore'
    if (venueFilter === 'moorways') return s.class_schedule === 'Moorways'
    if (venueFilter === 'krba') return s.discipline === 'KRBA'
    return true
  })

  function handleFile(e) {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = async ev => {
      const wb = XLSX.read(ev.target.result, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json(ws, { raw: false, defval: '' })
      const { nameKey, amountKey } = detectColumns(rows)
      const parsed = rows
        .map(r => ({ name: (r[nameKey] || '').toString().trim(), amount: amountKey ? r[amountKey] : null, raw: r }))
        .filter(p => p.name)
      setPayments(parsed)
      setActiveUploadId(null)
      setLastAction(null)

      // Save this list so it can be reopened later by date, rather than
      // being lost the moment the page reloads or someone navigates away.
      const { data, error } = await supabase.from('standing_order_uploads')
        .insert({ payments: parsed, filename: file.name }).select('id, uploaded_at, filename').single()
      if (!error && data) {
        setPastUploads(prev => [data, ...prev])
        setActiveUploadId(data.id)
      }
    }
    reader.readAsArrayBuffer(file)
    // Without this, selecting a file with the same filename as last
    // time (e.g. re-exporting/re-uploading from the same source)
    // wouldn't fire this input's change event at all -- the browser
    // only fires it when the input's value actually changes, and
    // re-picking the same filename doesn't count as a change. This
    // was very likely why re-uploads seemed to show stale results.
    e.target.value = ''
  }

  function clearPayments() {
    setPayments([])
    setSelectedPaymentIdx(null)
    setActiveUploadId(null)
    setLastAction(null)
  }

  // Removes a single transaction from the list -- for bank-export noise
  // (Netflix, Uber Eats, DVLA, Capquest, etc.) or anything else that was
  // never a student payment. Only affects this uploaded file's display;
  // it doesn't touch any stored data, so re-uploading the same export
  // later brings it back (nothing to "undo" otherwise, and no risk of
  // accidentally suppressing a real payment for good).
  async function removePayment(idx) {
    const removed = payments[idx]
    const updated = payments.filter((_, i) => i !== idx)
    setPayments(updated)
    // Any payment after this one shifts down by one index once the
    // array is filtered, so a stale selectedPaymentIdx could end up
    // pointing at the wrong transaction -- always clear it here.
    setSelectedPaymentIdx(null)
    // Persist immediately so this stays dismissed the next time this
    // same saved list is reopened, instead of the removed entry
    // silently reappearing since the saved copy was never updated.
    if (activeUploadId) {
      await supabase.from('standing_order_uploads').update({ payments: updated }).eq('id', activeUploadId)
    }
    setLastAction({
      label: `Removed "${removed.name}"`,
      undo: async () => {
        const restored = [...payments]
        restored.splice(idx, 0, removed)
        setPayments(restored)
        if (activeUploadId) {
          await supabase.from('standing_order_uploads').update({ payments: restored }).eq('id', activeUploadId)
        }
      },
    })
  }

  function studentFullName(s) {
    return `${s.members?.first_name || ''} ${s.members?.last_name || ''}`.trim()
  }

  function studentAge(s) {
    const dob = s.members?.date_of_birth
    if (!dob) return null
    const birth = new Date(dob + 'T00:00:00')
    const today = new Date()
    let age = today.getFullYear() - birth.getFullYear()
    const hasHadBirthdayThisYear = (today.getMonth() > birth.getMonth()) || (today.getMonth() === birth.getMonth() && today.getDate() >= birth.getDate())
    if (!hasHadBirthdayThisYear) age -= 1
    return age
  }

  function studentGroupsLabel(s) {
    return [s.is_kr && 'KR', s.is_pts && 'PTs', s.is_leader && 'Leader', s.is_coach && 'Coach'].filter(Boolean).join(', ')
  }

  function toggleMessagesSort(col) {
    if (messagesSortKey === col) setMessagesSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setMessagesSortKey(col); setMessagesSortDir('asc') }
  }

  function sortedMessagesStudents() {
    const withVals = students
      .filter(s => !messagesGroupFilter || s[messagesGroupFilter])
      .map(s => ({
      s,
      student_ref: s.student_ref || '',
      name: studentFullName(s),
      age: studentAge(s) ?? -1,
      house: s.house_name || s.members?.houses?.name || '',
      grade: s.pka_belt || s.krba_level || '',
      groups: studentGroupsLabel(s),
      media: s.media_restriction || '',
    }))
    withVals.sort((a, b) => {
      const av = a[messagesSortKey], bv = b[messagesSortKey]
      if (typeof av === 'number' || typeof bv === 'number') {
        return messagesSortDir === 'asc' ? av - bv : bv - av
      }
      return messagesSortDir === 'asc' ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av))
    })
    return withVals.map(x => x.s)
  }

  // Matching: payer_links (remembered) first -- a payer name can now
  // link to MULTIPLE students (e.g. one payment covering two
  // children) -- then a name-based match against the roster as a
  // fallback, checked in decreasing order of confidence:
  //
  //  1. Exact full-name match.
  //  2. "Name parts present" - every word of the student's first name
  //     AND every word of their last name shows up somewhere in the
  //     payment text (exact word match, or as a substring inside a
  //     longer glued-together word e.g. "Piorkowskifp" contains
  //     "piorkowski", "Jaxonbrowning" contains both "jaxon" and
  //     "browning"). This is order-independent and handles bank
  //     formats like "Surname Initial ChildFirstName Fp", reordered
  //     names, middle initials, and concatenated/truncated suffixes.
  //  3. Unique surname fallback - if a whole word in the payment
  //     matches exactly one active student's surname (no one else
  //     shares it), that's enough on its own - covers payments that
  //     give a surname and only an initial, never a spelled-out first
  //     name (e.g. "Mazur M Fp L").
  //  4. Unique first-name fallback - same idea for first names, with a
  //     slightly higher length threshold since first names repeat more
  //     often across a large roster.
  //
  // In every case, if more than one active student could plausibly
  // match, it's left unmatched rather than risk linking the wrong
  // person - those go through the manual link flow, which is
  // remembered for every future upload.
  const linksByPayerName = {}
  const excludedByPayerName = {} // payer name -> Set of student_ids explicitly rejected as wrong for that payment
  for (const l of payerLinks) {
    const n = normalizeName(l.payer_name)
    if (l.excluded) (excludedByPayerName[n] ||= new Set()).add(l.student_id)
    else (linksByPayerName[n] ||= []).push(l.student_id)
  }
  const studentByNormalizedName = Object.fromEntries(students.map(s => [normalizeName(studentFullName(s)), s.id]))
  const firstNameCounts = {}
  const lastNameCounts = {}
  for (const s of students) {
    const fn = normalizeName(s.members?.first_name)
    const ln = normalizeName(s.members?.last_name)
    if (fn) firstNameCounts[fn] = (firstNameCounts[fn] || 0) + 1
    if (ln) lastNameCounts[ln] = (lastNameCounts[ln] || 0) + 1
  }

  // A name part (a single word from a first or last name) counts as
  // "present" in a payment if it appears as a whole word, or as a
  // substring inside a longer word that's clearly a glued-together
  // concatenation (only for name parts of 4+ letters, to avoid short
  // words spuriously matching inside unrelated text).
  function namePartPresent(part, paymentWordSet) {
    if (paymentWordSet.has(part)) return true
    if (part.length >= 4) {
      for (const w of paymentWordSet) {
        if (w.length > part.length && w.includes(part)) return true
      }
    }
    return false
  }

  function matchStudentIdsForPayment(payment) {
    const n = normalizeName(payment.name)
    if (linksByPayerName[n]?.length) return linksByPayerName[n]

    const excluded = excludedByPayerName[n]
    const dropExcluded = list => excluded ? list.filter(s => !excluded.has(s.id)) : list

    if (studentByNormalizedName[n]) {
      const sid = studentByNormalizedName[n]
      return excluded?.has(sid) ? [] : [sid]
    }

    const paymentWords = wordsOf(payment.name)
    const paymentWordSet = new Set(paymentWords)

    const nameCandidates = dropExcluded(students.filter(s => {
      const fw = wordsOf(s.members?.first_name)
      const lw = wordsOf(s.members?.last_name)
      if (!fw.length || !lw.length) return false
      return fw.every(w => namePartPresent(w, paymentWordSet)) && lw.every(w => namePartPresent(w, paymentWordSet))
    }))
    // A full first+last name match is a strong, reliable signal on its
    // own -- finding it for MORE than one student just means a family
    // payment genuinely covering several siblings (e.g. "Smith Family -
    // John and Jane Smith"), not an ambiguous guess. All of them get
    // matched automatically. The looser surname-only/first-name-only
    // fallbacks below stay conservative and single-match-only, since
    // those are weaker signals where ambiguity really does mean "don't guess".
    if (nameCandidates.length >= 1) return nameCandidates.map(s => s.id)

    if (!nameCandidates.length) {
      const surnameCandidates = []
      for (const w of paymentWordSet) {
        if (w.length >= 3 && lastNameCounts[w] === 1) {
          surnameCandidates.push(...students.filter(s => normalizeName(s.members?.last_name) === w))
        }
      }
      const filtered = dropExcluded(surnameCandidates)
      if (filtered.length === 1) return [filtered[0].id]
    }

    if (!nameCandidates.length) {
      const firstNameCandidates = []
      for (const w of paymentWordSet) {
        if (w.length >= 4 && firstNameCounts[w] === 1) {
          firstNameCandidates.push(...students.filter(s => normalizeName(s.members?.first_name) === w))
        }
      }
      const filtered = dropExcluded(firstNameCandidates)
      if (filtered.length === 1) return [filtered[0].id]
    }

    return []
  }

  // Map of studentId -> the payment(s) that matched them, so the
  // Paid students card can show what payment they're linked to.
  // Each entry keeps the payment's index in the master `payments`
  // array (not a filtered-list index) so a payment can be selected
  // for linking whether it's showing up as unmatched OR already
  // matched to someone else -- this is what makes it possible to
  // link ONE payment to MULTIPLE students (e.g. a parent paying for
  // several siblings in one standing order).
  const paymentsByStudentId = {}
  const unmatchedPayments = []
  payments.forEach((p, idx) => {
    const sids = matchStudentIdsForPayment(p)
    if (sids.length) sids.forEach(sid => (paymentsByStudentId[sid] ||= []).push({ payment: p, idx }))
    else unmatchedPayments.push({ payment: p, idx })
  })
  const matchedStudentIds = new Set(Object.keys(paymentsByStudentId))
  const sortByName = (a, b) => studentFullName(a).localeCompare(studentFullName(b))
  // Sponsored students always count as "paid" -- their fees are covered
  // another way, so they shouldn't need to appear in every upload to
  // avoid being chased for payment.
  const unpaidStudents = venueFilteredStudents.filter(s => !matchedStudentIds.has(s.id) && !s.sponsored).sort(sortByName)
  const paidStudents = venueFilteredStudents.filter(s => matchedStudentIds.has(s.id) || s.sponsored).sort(sortByName)

  async function linkPayment(payment, studentId) {
    // Capture whatever existed for this exact pairing before this
    // change, so undo can put it back exactly as it was (not just
    // delete the new link, which would be wrong if one already existed).
    const priorLink = payerLinks.find(l => l.payer_name === payment.name && l.student_id === studentId) || null
    // excluded: false explicitly clears any earlier "this isn't right"
    // rejection stored against this exact payment+student pairing, so
    // re-linking after a mistaken exclusion works correctly.
    const { error } = await supabase.from('payer_links').upsert(
      { payer_name: payment.name, student_id: studentId, excluded: false },
      { onConflict: 'payer_name,student_id' }
    )
    if (error) { alert('Error saving link: ' + error.message); return }
    setPayerLinks(prev => {
      const others = prev.filter(l => !(l.payer_name === payment.name && l.student_id === studentId))
      return [...others, { payer_name: payment.name, student_id: studentId, excluded: false }]
    })
    setSelectedPaymentIdx(null)
    setLastAction({
      label: `Linked "${payment.name}" to a student`,
      undo: async () => {
        if (priorLink) {
          await supabase.from('payer_links').upsert(priorLink, { onConflict: 'payer_name,student_id' })
          setPayerLinks(prev => [...prev.filter(l => !(l.payer_name === payment.name && l.student_id === studentId)), priorLink])
        } else {
          await supabase.from('payer_links').delete().eq('payer_name', payment.name).eq('student_id', studentId)
          setPayerLinks(prev => prev.filter(l => !(l.payer_name === payment.name && l.student_id === studentId)))
        }
      },
    })
  }

  async function unlinkPayment(payerName, studentId) {
    const priorLink = payerLinks.find(l => l.payer_name === payerName && l.student_id === studentId) || null
    const { error } = await supabase.from('payer_links').delete().eq('payer_name', payerName).eq('student_id', studentId)
    if (error) { alert('Error removing link: ' + error.message); return }
    setPayerLinks(prev => prev.filter(l => !(l.payer_name === payerName && l.student_id === studentId)))
    if (priorLink) {
      setLastAction({
        label: `Unlinked "${payerName}"`,
        undo: async () => {
          await supabase.from('payer_links').upsert(priorLink, { onConflict: 'payer_name,student_id' })
          setPayerLinks(prev => [...prev.filter(l => !(l.payer_name === payerName && l.student_id === studentId)), priorLink])
        },
      })
    }
  }

  // For an AUTOMATIC match (not a manually-created link) there's nothing
  // to delete -- the pairing was never stored anywhere, it's recomputed
  // fresh from the matching rules every render. So "this is wrong" has to
  // be recorded as an explicit rejection instead, which the matcher then
  // knows to skip for that exact payment name going forward.
  async function rejectAutoMatch(payment, studentId) {
    const priorLink = payerLinks.find(l => l.payer_name === payment.name && l.student_id === studentId) || null
    const { error } = await supabase.from('payer_links').upsert(
      { payer_name: payment.name, student_id: studentId, excluded: true },
      { onConflict: 'payer_name,student_id' }
    )
    if (error) { alert('Error saving rejection: ' + error.message); return }
    setPayerLinks(prev => {
      const others = prev.filter(l => !(l.payer_name === payment.name && l.student_id === studentId))
      return [...others, { payer_name: payment.name, student_id: studentId, excluded: true }]
    })
    setLastAction({
      label: `Marked "${payment.name}" as wrong student`,
      undo: async () => {
        if (priorLink) {
          await supabase.from('payer_links').upsert(priorLink, { onConflict: 'payer_name,student_id' })
          setPayerLinks(prev => [...prev.filter(l => !(l.payer_name === payment.name && l.student_id === studentId)), priorLink])
        } else {
          await supabase.from('payer_links').delete().eq('payer_name', payment.name).eq('student_id', studentId)
          setPayerLinks(prev => prev.filter(l => !(l.payer_name === payment.name && l.student_id === studentId)))
        }
      },
    })
  }

  return (
    <div>
      <div className="page-header">
        <h1>CRM</h1>
        <p>Standing orders, and more to come</p>
      </div>

      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border)', marginBottom: 20 }}>
        <button onClick={() => setTab('standing_orders')} style={{
          padding: '8px 16px', fontSize: 13, border: 'none', background: 'none', cursor: 'pointer',
          borderBottom: `2px solid ${tab === 'standing_orders' ? 'var(--text)' : 'transparent'}`,
          color: tab === 'standing_orders' ? 'var(--text)' : 'var(--text-secondary)',
          fontWeight: tab === 'standing_orders' ? 500 : 400,
        }}>Standing orders</button>
        <button onClick={() => { setTab('missed_training'); if (!missedTrainingLoaded) loadMissedTraining() }} style={{
          padding: '8px 16px', fontSize: 13, border: 'none', background: 'none', cursor: 'pointer',
          borderBottom: `2px solid ${tab === 'missed_training' ? 'var(--text)' : 'transparent'}`,
          color: tab === 'missed_training' ? 'var(--text)' : 'var(--text-secondary)',
          fontWeight: tab === 'missed_training' ? 500 : 400,
        }}>Missed training{missedTraining.length > 0 ? ` (${missedTraining.length})` : ''}</button>
        <button onClick={() => { setTab('stopped_training'); if (!stoppedLoaded) loadStoppedStudents() }} style={{
          padding: '8px 16px', fontSize: 13, border: 'none', background: 'none', cursor: 'pointer',
          borderBottom: `2px solid ${tab === 'stopped_training' ? 'var(--text)' : 'transparent'}`,
          color: tab === 'stopped_training' ? 'var(--text)' : 'var(--text-secondary)',
          fontWeight: tab === 'stopped_training' ? 500 : 400,
        }}>Stopped training{stoppedStudents.length > 0 ? ` (${stoppedStudents.length})` : ''}</button>
        <button onClick={() => { setTab('grading_requests'); if (!gradingLoaded) loadGradingRequests() }} style={{
          padding: '8px 16px', fontSize: 13, border: 'none', background: 'none', cursor: 'pointer',
          borderBottom: `2px solid ${tab === 'grading_requests' ? 'var(--text)' : 'transparent'}`,
          color: tab === 'grading_requests' ? 'var(--text)' : 'var(--text-secondary)',
          fontWeight: tab === 'grading_requests' ? 500 : 400,
        }}>Grading requests{gradingRequests.filter(r => !r.coach_approved).length > 0 ? ` (${gradingRequests.filter(r => !r.coach_approved).length})` : ''}</button>
        <button onClick={() => { setTab('birthdays'); if (!birthdaysLoaded) loadBirthdays() }} style={{
          padding: '8px 16px', fontSize: 13, border: 'none', background: 'none', cursor: 'pointer',
          borderBottom: `2px solid ${tab === 'birthdays' ? 'var(--text)' : 'transparent'}`,
          color: tab === 'birthdays' ? 'var(--text)' : 'var(--text-secondary)',
          fontWeight: tab === 'birthdays' ? 500 : 400,
        }}>Birthdays{birthdays.length > 0 ? ` (${birthdays.length})` : ''}</button>
        <button onClick={() => setTab('messages')} style={{
          padding: '8px 16px', fontSize: 13, border: 'none', background: 'none', cursor: 'pointer',
          borderBottom: `2px solid ${tab === 'messages' ? 'var(--text)' : 'transparent'}`,
          color: tab === 'messages' ? 'var(--text)' : 'var(--text-secondary)',
          fontWeight: tab === 'messages' ? 500 : 400,
        }}>Messages</button>
        <button onClick={() => { setTab('email'); if (!inboxLoaded) loadInbox() }} style={{
          padding: '8px 16px', fontSize: 13, border: 'none', background: 'none', cursor: 'pointer',
          borderBottom: `2px solid ${tab === 'email' ? 'var(--text)' : 'transparent'}`,
          color: tab === 'email' ? 'var(--text)' : 'var(--text-secondary)',
          fontWeight: tab === 'email' ? 500 : 400,
        }}>Email</button>
        <button onClick={() => { setTab('courses'); if (!coursesLoaded) loadCourses() }} style={{
          padding: '8px 16px', fontSize: 13, border: 'none', background: 'none', cursor: 'pointer',
          borderBottom: `2px solid ${tab === 'courses' ? 'var(--text)' : 'transparent'}`,
          color: tab === 'courses' ? 'var(--text)' : 'var(--text-secondary)',
          fontWeight: tab === 'courses' ? 500 : 400,
        }}>Courses{courses.length > 0 ? ` (${courses.length})` : ''}</button>
      </div>

      {tab === 'standing_orders' && (
        <div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            {[
              { key: 'all', label: 'All' },
              { key: 'krcentre_pka', label: 'KR Centre PKA' },
              { key: 'derbymoore', label: 'Derby Moore' },
              { key: 'moorways', label: 'Moorways' },
              { key: 'krba', label: 'KRBA' },
            ].map(f => (
              <button key={f.key} className="btn btn-sm"
                onClick={() => setVenueFilter(f.key)}
                style={{
                  fontWeight: venueFilter === f.key ? 600 : 400,
                  background: venueFilter === f.key ? 'var(--text)' : undefined,
                  color: venueFilter === f.key ? 'var(--bg)' : undefined,
                }}>
                {f.label}
              </button>
            ))}
          </div>

          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: showUploadHelp ? 6 : 12, position: 'relative' }}>
              <h2 style={{ fontSize: 15, fontWeight: 600 }}>Upload payment list</h2>
              <button className="btn btn-sm" title="What does this do?" onClick={() => setShowUploadHelp(v => !v)}
                style={{ width: 20, height: 20, padding: 0, borderRadius: '50%', fontSize: 11, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                ?
              </button>
            </div>
            {showUploadHelp && (
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 }}>
                Upload an Excel export of standing order/payment names. It's cross-checked against active students —
                a match means paid. Names that don't match a student (e.g. a parent's name, or a typo in the bank
                export) show up below so you can link them manually once; that link is remembered for every future
                upload. One payment can also be linked to more than one student — use "+ Link another student" on
                a paid student's card for payments that cover several siblings.
                <br /><br />
                <b>Template placeholders:</b> use <code>{'{name}'}</code> for the student's first name and <code>{'{parent_name}'}</code> for the parent/guardian's name — both are filled in automatically when you share it.
              </p>
            )}

            <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>Message templates — press to select, then choose who to send it to</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8, marginBottom: 12 }}>
              {templates.map((t, i) => (
                editingTemplateIdx === i ? (
                  <div key={i} className="card" style={{ padding: 8, background: 'var(--bg-secondary)' }}>
                    <input value={templateDraft.label} onChange={e => setTemplateDraft(d => ({ ...d, label: e.target.value }))}
                      placeholder="Label" style={{ width: '100%', fontSize: 11, fontWeight: 600, marginBottom: 6, padding: '3px 6px' }} />
                    <textarea value={templateDraft.body} onChange={e => setTemplateDraft(d => ({ ...d, body: e.target.value }))}
                      placeholder="Message text — use {name} for first name, {parent_name} for the parent/guardian's name" rows={7}
                      style={{ width: '100%', fontSize: 15, padding: '10px 12px', marginBottom: 6, resize: 'vertical' }} />
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button className="btn btn-sm" style={{ fontSize: 10, padding: '2px 8px', flex: 1 }} disabled={savingTemplate}
                        onClick={() => saveTemplate(i)}>{savingTemplate ? 'Saving…' : 'Save'}</button>
                      <button className="btn btn-sm" style={{ fontSize: 10, padding: '2px 8px' }} onClick={() => setEditingTemplateIdx(null)}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div key={i}
                    onClick={() => setSelectedTemplateIdx(selectedTemplateIdx === i ? null : i)}
                    style={{
                      padding: 8, borderRadius: 'var(--radius)', cursor: 'pointer', position: 'relative',
                      background: selectedTemplateIdx === i ? '#378ADD20' : 'var(--bg-secondary)',
                      border: selectedTemplateIdx === i ? '2px solid #378ADD' : '1px solid var(--border)',
                      minHeight: 92, display: 'flex', flexDirection: 'column',
                    }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                      <span style={{ fontSize: 11, fontWeight: 600 }}>{t.label || `Template ${i + 1}`}</span>
                      <button className="btn btn-sm" style={{ fontSize: 9, padding: '1px 6px' }}
                        onClick={e => { e.stopPropagation(); setEditingTemplateIdx(i); setTemplateDraft(t) }}>Edit</button>
                    </div>
                    <p style={{ fontSize: 10, color: 'var(--text-tertiary)', lineHeight: 1.4, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical' }}>
                      {t.body || 'No message set yet — click Edit'}
                    </p>
                  </div>
                )
              ))}
            </div>

            {selectedTemplateIdx != null && (
              <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 10, marginBottom: 12 }}>
                <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>Send "{templates[selectedTemplateIdx].label}" to:</p>
                <input value={templateRecipientSearch} onChange={e => { setTemplateRecipientSearch(e.target.value); setTemplateRecipientId(null) }}
                  placeholder="Search students…" style={{ width: '100%', fontSize: 12, marginBottom: 6 }} />
                {templateRecipientSearch && !templateRecipientId && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 160, overflowY: 'auto', marginBottom: 6 }}>
                    {students.filter(s => studentFullName(s).toLowerCase().includes(templateRecipientSearch.toLowerCase())).slice(0, 8).map(s => (
                      <div key={s.id} onClick={() => { setTemplateRecipientId(s.id); setTemplateRecipientSearch(studentFullName(s)) }}
                        style={{ fontSize: 12, padding: '4px 8px', borderRadius: 'var(--radius)', cursor: 'pointer', background: 'var(--bg)' }}>
                        {studentFullName(s)}
                      </div>
                    ))}
                  </div>
                )}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-sm btn-primary" disabled={!templateRecipientId}
                    onClick={() => {
                      const recipient = students.find(s => s.id === templateRecipientId)
                      const text = (templates[selectedTemplateIdx].body || '')
                        .replace(/\{name\}/gi, recipient?.members?.first_name || '')
                        .replace(/\{parent_name\}/gi, recipient?.guardian_name || '')
                      shareText(text)
                    }}>
                    📤 Share to {templateRecipientId ? studentFullName(students.find(s => s.id === templateRecipientId)) : 'selected student'}
                  </button>
                  {(() => {
                    const recipient = students.find(s => s.id === templateRecipientId)
                    const email = recipient?.members?.email && !recipient.members.email.includes('@kr-centre.placeholder') ? recipient.members.email : null
                    if (!templateRecipientId || !email) return null
                    return (
                      <button className="btn btn-sm" title={`Send a real email to ${email}`}
                        onClick={() => {
                          const text = (templates[selectedTemplateIdx].body || '')
                            .replace(/\{name\}/gi, recipient?.members?.first_name || '')
                            .replace(/\{parent_name\}/gi, recipient?.guardian_name || '')
                          sendRealEmail(email, templates[selectedTemplateIdx].label || 'Message from KR Centre', text)
                        }}>✉️ Email</button>
                    )
                  })()}
                </div>
              </div>
            )}

            <input type="file" accept=".xlsx,.xls" onChange={handleFile} />
            {pastUploads.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>Past lists — click to reopen:</p>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {pastUploads.map(u => (
                    <button key={u.id} className="btn btn-sm" onClick={() => openPastUpload(u.id)}
                      title={u.filename || undefined}
                      style={activeUploadId === u.id ? { background: 'var(--text)', color: 'var(--bg)' } : undefined}>
                      {new Date(u.uploaded_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                      {' '}{new Date(u.uploaded_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {payments.length > 0 && (
              <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 8, display: 'flex', alignItems: 'center', gap: 10 }}>
                {payments.length} payments loaded · {matchedStudentIds.size} matched · {unmatchedPayments.length} unmatched
                <button className="btn btn-sm" onClick={clearPayments}>✕ Clear</button>
              </p>
            )}
          </div>

          {loading ? <p>Loading…</p> : payments.length > 0 && (
            <>
            {lastAction && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-tertiary)', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius)', padding: '8px 14px', marginBottom: 14, fontSize: 13 }}>
                <span>{lastAction.label}</span>
                <button className="btn btn-sm" onClick={() => { lastAction.undo(); setLastAction(null) }}>Undo</button>
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 20 }}>
              <div className="card">
                <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>💳 Unmatched payments ({unmatchedPayments.length})</h3>
                <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 10 }}>
                  Drag onto a student, or click one here then click a student, to link them
                </p>
                <input value={unmatchedSearch} onChange={e => setUnmatchedSearch(e.target.value)} placeholder="Search…"
                  style={{ width: '100%', fontSize: 12, marginBottom: 10 }} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {unmatchedPayments.filter(({ payment: p }) => !unmatchedSearch || p.name.toLowerCase().includes(unmatchedSearch.toLowerCase())).length === 0 ? (
                    <p style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{unmatchedSearch ? 'No matches' : 'Everything matched 🎉'}</p>
                  ) : unmatchedPayments.filter(({ payment: p }) => !unmatchedSearch || p.name.toLowerCase().includes(unmatchedSearch.toLowerCase())).map(({ payment: p, idx }) => (
                    <div key={idx} draggable
                      onDragStart={() => setDraggedPayment(p)} onDragEnd={() => setDraggedPayment(null)}
                      onClick={() => setSelectedPaymentIdx(selectedPaymentIdx === idx ? null : idx)}
                      style={{
                        padding: '8px 10px', borderRadius: 'var(--radius)', cursor: 'pointer',
                        background: selectedPaymentIdx === idx ? '#378ADD20' : 'var(--bg-secondary)',
                        border: selectedPaymentIdx === idx ? '2px solid #378ADD' : '1px dashed var(--border-strong)',
                        display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8,
                      }}>
                      <div>
                        <span style={{ fontSize: 13, fontWeight: 600 }}>{p.name}</span>
                        {p.amount != null && <span style={{ fontSize: 12, color: 'var(--text-tertiary)', marginLeft: 8 }}>{p.amount}</span>}
                        {selectedPaymentIdx === idx && <div style={{ fontSize: 10, color: '#378ADD', marginTop: 2 }}>Selected — click a student on the right →</div>}
                      </div>
                      <button
                        title="Not a student payment / not needed here"
                        onClick={e => { e.stopPropagation(); removePayment(idx) }}
                        style={{
                          border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-tertiary)',
                          fontSize: 14, lineHeight: 1, padding: '2px 4px', flexShrink: 0,
                        }}>✕</button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="card">
                <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>🚫 Students not paid ({unpaidStudents.length})</h3>
                <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 10 }}>
                  {selectedPaymentIdx != null ? 'Click a student to link the selected payment' : 'Drop an unmatched payment here to link'}
                </p>
                <input value={unpaidSearch} onChange={e => setUnpaidSearch(e.target.value)} placeholder="Search…"
                  style={{ width: '100%', fontSize: 12, marginBottom: 10 }} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {unpaidStudents.filter(s => !unpaidSearch || studentFullName(s).toLowerCase().includes(unpaidSearch.toLowerCase())).length === 0 ? (
                    <p style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{unpaidSearch ? 'No matches' : "Everyone's paid 🎉"}</p>
                  ) : unpaidStudents.filter(s => !unpaidSearch || studentFullName(s).toLowerCase().includes(unpaidSearch.toLowerCase())).map(s => {
                    const email = s.members?.email && !s.members.email.includes('@kr-centre.placeholder') ? s.members.email : null
                    const phone = s.members?.phone
                    const msgText = `Hi ${s.members?.first_name}, just checking in about your membership payment — let us know if there's anything we can help with. Thanks, KR Centre`
                    const msgBody = encodeURIComponent(msgText)
                    const hasNotes = (athleteNotesByStudent[s.id] || []).length > 0
                    return (
                    <div key={s.id}
                      onDragOver={e => { e.preventDefault(); setDragOverStudentId(s.id) }}
                      onDragLeave={() => setDragOverStudentId(null)}
                      onDrop={e => { e.preventDefault(); if (draggedPayment) linkPayment(draggedPayment, s.id); setDragOverStudentId(null) }}
                      onClick={() => { if (selectedPaymentIdx != null) linkPayment(payments[selectedPaymentIdx], s.id) }}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6,
                        padding: '8px 10px', borderRadius: 'var(--radius)', cursor: selectedPaymentIdx != null ? 'pointer' : 'default',
                        background: dragOverStudentId === s.id ? '#1D9E7520' : hasNotes ? '#EF9F2720' : 'var(--bg-secondary)',
                        border: dragOverStudentId === s.id ? '2px solid #1D9E75' : hasNotes ? '1px solid #EF9F27' : '1px solid transparent',
                      }}>
                      <span style={{ minWidth: 0 }}>
                        <span style={{ fontSize: 13, fontWeight: 600 }}>{studentFullName(s)}</span>
                        <span style={{ fontSize: 11, color: 'var(--text-tertiary)', marginLeft: 8 }}>{s.student_ref}</span>
                      </span>
                      <span style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                        <button className="btn btn-sm" style={{ fontSize: 11 }} title="Share payment reminder (text, WhatsApp, email...)"
                          onClick={e => { e.stopPropagation(); sharePaymentReminder(s.members?.first_name, msgBody) }}>📤</button>
                        {email && (
                          <button className="btn btn-sm" style={{ fontSize: 11 }} title={`Send a real email to ${email}`}
                            onClick={e => { e.stopPropagation(); sendRealEmail(email, 'Membership payment', msgText) }}>✉️</button>
                        )}
                        <button className="btn btn-sm" style={{ fontSize: 11, background: hasNotes ? '#EF9F2730' : undefined, borderColor: hasNotes ? '#EF9F27' : undefined }}
                          title={hasNotes ? `${athleteNotesByStudent[s.id].length} note(s) — click to view/add` : 'Add a note about this student'}
                          onClick={e => { e.stopPropagation(); setAddingNoteForStudent(s); setQuickNoteDraft('') }}>📝{hasNotes ? ` ${athleteNotesByStudent[s.id].length}` : ''}</button>
                        <button className="btn btn-sm" style={{ fontSize: 11 }} title="Mark as sponsored -- moves to paid list, won't be chased for payment"
                          onClick={e => { e.stopPropagation(); markSponsored(s.id, true) }}>🎗️ Sponsored</button>
                      </span>
                    </div>
                    )
                  })}
                </div>
              </div>

              <div className="card">
                <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>✅ Paid students ({paidStudents.length})</h3>
                <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 10 }}>Matched against this upload{paidStudents.some(s => s.sponsored) ? ', plus sponsored students' : ''}</p>
                <input value={paidSearch} onChange={e => setPaidSearch(e.target.value)} placeholder="Search…"
                  style={{ width: '100%', fontSize: 12, marginBottom: 10 }} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {paidStudents.filter(s => !paidSearch || studentFullName(s).toLowerCase().includes(paidSearch.toLowerCase())).length === 0 ? (
                    <p style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{paidSearch ? 'No matches' : 'No matches yet'}</p>
                  ) : paidStudents.filter(s => !paidSearch || studentFullName(s).toLowerCase().includes(paidSearch.toLowerCase())).map(s => {
                    const matchedPayments = paymentsByStudentId[s.id] || []
                    // Only manually-created payer_links can be unlinked --
                    // a direct name match has nothing stored to remove,
                    // it would just re-match immediately anyway.
                    const isManualLink = payment => payerLinks.some(l => normalizeName(l.payer_name) === normalizeName(payment.name) && l.student_id === s.id)
                    return (
                      <div key={s.id} style={{ padding: '8px 10px', borderRadius: 'var(--radius)', background: s.sponsored && !matchedStudentIds.has(s.id) ? '#EF9F2712' : '#1D9E7512' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                            {studentFullName(s)}
                            {s.sponsored && (
                              <span style={{ fontSize: 10, fontWeight: 600, color: '#EF9F27', background: '#EF9F2720', borderRadius: 10, padding: '1px 8px' }}>🎗️ Sponsored</span>
                            )}
                          </span>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{s.student_ref}</span>
                            {s.sponsored && (
                              <button className="btn btn-sm" style={{ fontSize: 10, padding: '2px 8px' }} onClick={() => markSponsored(s.id, false)}>Unmark</button>
                            )}
                          </span>
                        </div>
                        {matchedPayments.map(({ payment: p, idx }) => (
                          <div key={idx} style={{ marginTop: 4, paddingTop: 4, borderTop: idx === matchedPayments[0].idx ? '1px solid #1D9E7530' : 'none' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                                💳 {p.name}{p.amount != null ? ` — ${p.amount}` : ''}
                              </span>
                              {isManualLink(p) ? (
                                <button className="btn btn-sm" style={{ fontSize: 10, padding: '2px 8px' }}
                                  onClick={() => unlinkPayment(p.name, s.id)}>Unlink</button>
                              ) : (
                                <button className="btn btn-sm" style={{ fontSize: 10, padding: '2px 8px' }}
                                  title="This was matched automatically. Use this if it's the wrong student — it won't be suggested for this payment again."
                                  onClick={() => rejectAutoMatch(p, s.id)}>Wrong student ✕</button>
                              )}
                            </div>
                            {/* Lets one payment be linked to MORE than one student --
                                e.g. a single standing order covering several siblings.
                                Selecting here re-uses the same click-a-student flow as
                                unmatched payments, just seeded with this payment's index. */}
                            <button className="btn btn-sm" style={{ fontSize: 10, padding: '2px 8px', marginTop: 2 }}
                              onClick={() => setSelectedPaymentIdx(selectedPaymentIdx === idx ? null : idx)}>
                              {selectedPaymentIdx === idx ? 'Selected — click another student →' : '+ Link another student to this payment'}
                            </button>
                          </div>
                        ))}
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
            </>
          )}
        </div>
      )}

      {tab === 'missed_training' && (
        <div>
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: showMissedTrainingHelp ? 6 : 10 }}>
              <h2 style={{ fontSize: 15, fontWeight: 600 }}>Missed training</h2>
              <button className="btn btn-sm" title="What does this do?" onClick={() => setShowMissedTrainingHelp(v => !v)}
                style={{ width: 20, height: 20, padding: 0, borderRadius: '50%', fontSize: 11, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                ?
              </button>
            </div>
            {showMissedTrainingHelp && (
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 10 }}>
                Active students with an assigned class who haven't attended anything in 4+ weeks (28 days) — or have never attended at all.
                <br /><br />
                <b>Template placeholders:</b> use <code>{'{name}'}</code> for the student's first name, <code>{'{weeks}'}</code> for the number of weeks since their last session, and <code>{'{parent_name}'}</code> for the parent/guardian's name — all filled in automatically when you share a template.
              </p>
            )}
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, opacity: 0.6, marginBottom: 14 }}>
              <input type="checkbox" checked={autoSendMissedTraining} disabled onChange={() => {}} />
              Auto-send a reminder automatically
              <span style={{ fontStyle: 'italic' }}>— needs an email/SMS service connected first (not set up yet); manual send below works now</span>
            </label>

            <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>Message templates — press to select, then choose who to send it to</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8, marginBottom: 12 }}>
              {mtTemplates.map((t, i) => (
                mtEditingIdx === i ? (
                  <div key={i} className="card" style={{ padding: 8, background: 'var(--bg-secondary)' }}>
                    <input value={mtTemplateDraft.label} onChange={e => setMtTemplateDraft(d => ({ ...d, label: e.target.value }))}
                      placeholder="Label" style={{ width: '100%', fontSize: 11, fontWeight: 600, marginBottom: 6, padding: '3px 6px' }} />
                    <textarea value={mtTemplateDraft.body} onChange={e => setMtTemplateDraft(d => ({ ...d, body: e.target.value }))}
                      placeholder="Message text — use {name} for first name, {weeks} for weeks missed, {parent_name} for the parent/guardian's name" rows={7}
                      style={{ width: '100%', fontSize: 15, padding: '10px 12px', marginBottom: 6, resize: 'vertical' }} />
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button className="btn btn-sm" style={{ fontSize: 10, padding: '2px 8px', flex: 1 }} disabled={mtSavingTemplate}
                        onClick={() => saveMtTemplate(i)}>{mtSavingTemplate ? 'Saving…' : 'Save'}</button>
                      <button className="btn btn-sm" style={{ fontSize: 10, padding: '2px 8px' }} onClick={() => setMtEditingIdx(null)}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div key={i}
                    onClick={() => setMtSelectedTemplateIdx(mtSelectedTemplateIdx === i ? null : i)}
                    style={{
                      padding: 8, borderRadius: 'var(--radius)', cursor: 'pointer', position: 'relative',
                      background: mtSelectedTemplateIdx === i ? '#378ADD20' : 'var(--bg-secondary)',
                      border: mtSelectedTemplateIdx === i ? '2px solid #378ADD' : '1px solid var(--border)',
                      minHeight: 92, display: 'flex', flexDirection: 'column',
                    }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                      <span style={{ fontSize: 11, fontWeight: 600 }}>{t.label || `Template ${i + 1}`}</span>
                      <button className="btn btn-sm" style={{ fontSize: 9, padding: '1px 6px' }}
                        onClick={e => { e.stopPropagation(); setMtEditingIdx(i); setMtTemplateDraft(t) }}>Edit</button>
                    </div>
                    <p style={{ fontSize: 10, color: 'var(--text-tertiary)', lineHeight: 1.4, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical' }}>
                      {t.body || 'No message set yet — click Edit'}
                    </p>
                  </div>
                )
              ))}
            </div>

            {mtSelectedTemplateIdx != null && (
              <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 10 }}>
                <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>Send "{mtTemplates[mtSelectedTemplateIdx].label}" to:</p>
                <input value={mtRecipientSearch} onChange={e => { setMtRecipientSearch(e.target.value); setMtRecipientId(null) }}
                  placeholder="Search students missing training…" style={{ width: '100%', fontSize: 12, marginBottom: 6 }} />
                {mtRecipientSearch && !mtRecipientId && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 160, overflowY: 'auto', marginBottom: 6 }}>
                    {missedTraining.filter(r => studentFullName(r.student).toLowerCase().includes(mtRecipientSearch.toLowerCase())).slice(0, 8).map(r => (
                      <div key={r.student.id} onClick={() => { setMtRecipientId(r.student.id); setMtRecipientSearch(studentFullName(r.student)) }}
                        style={{ fontSize: 12, padding: '4px 8px', borderRadius: 'var(--radius)', cursor: 'pointer', background: 'var(--bg)' }}>
                        {studentFullName(r.student)}
                      </div>
                    ))}
                  </div>
                )}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-sm btn-primary" disabled={!mtRecipientId}
                    onClick={() => {
                      const recipientRow = missedTraining.find(r => r.student.id === mtRecipientId)
                      const text = (mtTemplates[mtSelectedTemplateIdx].body || '')
                        .replace(/\{name\}/gi, recipientRow?.student?.members?.first_name || '')
                        .replace(/\{weeks\}/gi, recipientRow?.weeksMissed ?? '')
                        .replace(/\{parent_name\}/gi, recipientRow?.student?.guardian_name || '')
                      shareText(text)
                    }}>
                    📤 Share to {mtRecipientId ? studentFullName(missedTraining.find(r => r.student.id === mtRecipientId)?.student) : 'selected student'}
                  </button>
                  {(() => {
                    const recipientRow = missedTraining.find(r => r.student.id === mtRecipientId)
                    const email = recipientRow?.student?.members?.email && !recipientRow.student.members.email.includes('@kr-centre.placeholder') ? recipientRow.student.members.email : null
                    if (!mtRecipientId || !email) return null
                    return (
                      <button className="btn btn-sm" title={`Send a real email to ${email}`}
                        onClick={() => {
                          const text = (mtTemplates[mtSelectedTemplateIdx].body || '')
                            .replace(/\{name\}/gi, recipientRow?.student?.members?.first_name || '')
                            .replace(/\{weeks\}/gi, recipientRow?.weeksMissed ?? '')
                            .replace(/\{parent_name\}/gi, recipientRow?.student?.guardian_name || '')
                          sendRealEmail(email, mtTemplates[mtSelectedTemplateIdx].label || 'Message from KR Centre', text)
                        }}>✉️ Email</button>
                    )
                  })()}
                </div>
              </div>
            )}
          </div>

          {missedTrainingLoading ? (
            <div className="loading">Loading…</div>
          ) : missedTraining.length === 0 ? (
            <div className="empty-state"><h3>Nobody's missing training</h3><p>Every assigned, active student has trained within the last 4 weeks.</p></div>
          ) : (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
                <button className="btn btn-sm" onClick={() => setSelectedMissed(
                  selectedMissed.size === missedTraining.length ? new Set() : new Set(missedTraining.map(r => r.student.id))
                )}>
                  {selectedMissed.size === missedTraining.length ? 'Deselect all' : 'Select all'}
                </button>
                {selectedMissed.size > 0 && (() => {
                  const selectedRows = missedTraining.filter(r => selectedMissed.has(r.student.id))
                  const people = selectedRows
                    .filter(r => !r.student.members?.do_not_contact)
                    .map(r => ({
                      name: `${r.student.members?.first_name || ''} ${r.student.members?.last_name || ''}`.trim(),
                      email: r.student.members?.email && !r.student.members.email.includes('@kr-centre.placeholder') ? r.student.members.email : null,
                      phone: r.student.members?.phone || null,
                    }))
                  return (
                    <div style={{ display: 'flex', gap: 8 }}>
                      <span style={{ fontSize: 12, color: 'var(--text-tertiary)', alignSelf: 'center' }}>{selectedMissed.size} selected</span>
                      <BulkSendOptions people={people} noun="students"
                        subjectText="We've missed you at training!"
                        bodyText={"Hi,\n\nWe noticed it's been a few weeks since your last session — we'd love to see you back on the mats/in the ring soon!\n\nLet us know if there's anything stopping you from training, we're happy to help.\n\nSee you soon,\nKR Centre"} />
                    </div>
                  )
                })()}
              </div>
              <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
                <table>
                  <thead><tr>
                    <th style={{ width: 30 }}></th>
                    <th>Student</th>
                    <th>Last attended</th>
                    <th>Weeks missed</th>
                    <th>Contact</th>
                    <th>Holiday</th>
                  </tr></thead>
                  <tbody>
                    {missedTraining.map(r => {
                      const m = r.student.members
                      const dnc = !!m?.do_not_contact
                      const email = m?.email && !m.email.includes('@kr-centre.placeholder') ? m.email : null
                      const phone = m?.phone
                      const smsBody = encodeURIComponent(`Hi ${m?.first_name}, we've missed you at training — it's been a few weeks since your last session. Hope to see you back soon! - KR Centre`)
                      return (
                        <tr key={r.student.id} style={dnc ? { opacity: 0.5 } : undefined}>
                          <td><input type="checkbox" checked={selectedMissed.has(r.student.id)} disabled={dnc}
                            onChange={() => setSelectedMissed(prev => {
                              const next = new Set(prev)
                              next.has(r.student.id) ? next.delete(r.student.id) : next.add(r.student.id)
                              return next
                            })} /></td>
                          <td style={{ fontSize: 13 }}>{m?.first_name} {m?.last_name}{dnc ? ' 🚫' : ''}</td>
                          <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{r.lastDate ? new Date(r.lastDate).toLocaleDateString('en-GB') : 'Never'}</td>
                          <td style={{ fontSize: 13, fontWeight: 600, color: '#E24B4A' }}>{r.weeksMissed ?? '—'}</td>
                          <td>
                            <button className="btn btn-sm" style={{ fontSize: 11 }} title="Share reminder (text, WhatsApp, email...)"
                              onClick={() => shareText(decodeURIComponent(smsBody))}>📤</button>
                          </td>
                          <td>
                            <button className="btn btn-sm" style={{ fontSize: 11 }} title="Set a holiday period for this student — excludes them from missed-training/attendance tracking while away"
                              onClick={() => { setHolidayForm({ name: '', start_date: '', end_date: '' }); setHolidayModalFor({ id: r.student.id, name: `${m?.first_name || ''} ${m?.last_name || ''}`.trim() }) }}>
                              🏖️ Holiday
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* Stopped training -- lists everyone with status='stopped', with
          the same search/select/select-all/bulk-message pattern as
          Missed training, plus a Do Not Contact flag that permanently
          excludes someone from bulk sends (and removes them from any
          current selection the moment it's turned on). */}
      {tab === 'stopped_training' && (
        <div>
          {stoppedLoading ? (
            <div className="loading">Loading…</div>
          ) : stoppedStudents.length === 0 ? (
            <div className="empty-state"><h3>No stopped students</h3><p>Nobody currently has a "stopped" status.</p></div>
          ) : (() => {
            const filtered = stoppedStudents.filter(s => {
              const name = `${s.members?.first_name || ''} ${s.members?.last_name || ''}`.toLowerCase()
              return name.includes(stoppedSearch.toLowerCase())
            })
            const contactable = filtered.filter(s => !s.members?.do_not_contact)
            return (
              <>
                <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                  <input value={stoppedSearch} onChange={e => setStoppedSearch(e.target.value)}
                    placeholder="Search by name…" style={{ maxWidth: 240 }} />
                  <button className="btn btn-sm" onClick={() => setSelectedStopped(
                    selectedStopped.size === contactable.length ? new Set() : new Set(contactable.map(s => s.id))
                  )}>
                    {selectedStopped.size === contactable.length && contactable.length > 0 ? 'Deselect all' : 'Select all'}
                  </button>
                  {selectedStopped.size > 0 && (() => {
                    const selectedRows = filtered.filter(s => selectedStopped.has(s.id))
                    const people = selectedRows.map(s => ({
                      name: `${s.members?.first_name || ''} ${s.members?.last_name || ''}`.trim(),
                      email: s.members?.email && !s.members.email.includes('@kr-centre.placeholder') ? s.members.email : null,
                      phone: s.members?.phone || null,
                    }))
                    return (
                      <div style={{ display: 'flex', gap: 8 }}>
                        <span style={{ fontSize: 12, color: 'var(--text-tertiary)', alignSelf: 'center' }}>{selectedStopped.size} selected</span>
                        <BulkSendOptions people={people} noun="people"
                          subjectText="We'd love to have you back!"
                          bodyText={"Hi,\n\nIt's been a while since you trained with us and we wanted to reach out — the door's always open if you'd like to come back.\n\nLet us know if you have any questions.\n\nKR Centre"} />
                      </div>
                    )
                  })()}
                </div>
                <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
                  <table>
                    <thead><tr>
                      <th style={{ width: 30 }}></th>
                      <th>Student</th>
                      <th>Contact</th>
                      <th>Message</th>
                      <th>Do not contact</th>
                    </tr></thead>
                    <tbody>
                      {filtered.map(s => {
                        const m = s.members
                        const dnc = !!m?.do_not_contact
                        const email = m?.email && !m.email.includes('@kr-centre.placeholder') ? m.email : null
                        const smsBody = encodeURIComponent(`Hi ${m?.first_name}, it's been a while since you trained with us — we'd love to have you back if you're interested! - KR Centre`)
                        return (
                          <tr key={s.id} style={dnc ? { opacity: 0.5 } : undefined}>
                            <td>
                              <input type="checkbox" checked={selectedStopped.has(s.id)} disabled={dnc}
                                onChange={() => setSelectedStopped(prev => {
                                  const next = new Set(prev)
                                  next.has(s.id) ? next.delete(s.id) : next.add(s.id)
                                  return next
                                })} />
                            </td>
                            <td style={{ fontSize: 13 }}>{m?.first_name} {m?.last_name}</td>
                            <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{email || m?.phone || '—'}</td>
                            <td>
                              <button className="btn btn-sm" style={{ fontSize: 11 }} disabled={dnc}
                                title={dnc ? 'This person has opted out of contact' : 'Share a message (text, WhatsApp, email...)'}
                                onClick={() => shareText(decodeURIComponent(smsBody))}>📤</button>
                            </td>
                            <td>
                              <button className="btn btn-sm" style={{ fontSize: 11, background: dnc ? '#E24B4A15' : undefined, borderColor: dnc ? '#E24B4A' : undefined, color: dnc ? '#E24B4A' : undefined }}
                                title={dnc ? 'Currently opted out — click to allow contact again' : 'Mark as do not contact — excludes from all messaging, especially bulk sends'}
                                onClick={() => toggleDoNotContact(s)}>
                                {dnc ? '🚫 Opted out' : 'Do not contact'}
                              </button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )
          })()}
        </div>
      )}

      {/* Grading requests -- review screen for grading_expressions, which
          previously had a student-facing submit form but nothing for a
          coach to actually see and approve them. Shows the student's
          self-reported classes attended alongside their ACTUAL attendance
          from the last 3 months (pulled from the attendance table), so a
          coach can spot a mismatch between what's claimed and what
          actually happened before approving. */}
      {tab === 'grading_requests' && (
        <div>
          {gradingLoading ? (
            <div className="loading">Loading…</div>
          ) : gradingRequests.length === 0 ? (
            <div className="empty-state"><h3>No grading requests</h3><p>Nobody has submitted a grading expression of interest yet.</p></div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {gradingRequests.map(r => {
                const m = r.students?.members
                let extra = {}
                try { extra = JSON.parse(r.notes || '{}') } catch { /* ignore malformed notes */ }
                return (
                  <div key={r.id} className="card" style={{ padding: 14, background: r.coach_approved ? '#1D9E7512' : undefined }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
                      <div>
                        <p style={{ fontSize: 14, fontWeight: 700 }}>{m ? `${m.first_name} ${m.last_name}` : 'Unknown student'}</p>
                        <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                          {r.discipline} · {r.current_belt || '—'} → <strong>{r.grading_for}</strong>
                        </p>
                        <p style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                          Submitted {r.created_at ? new Date(r.created_at).toLocaleDateString('en-GB') : '—'}
                        </p>
                      </div>
                      {r.coach_approved ? (
                        <span style={{ fontSize: 12, fontWeight: 600, color: '#1D9E75', flexShrink: 0 }}>✓ Approved</span>
                      ) : (
                        <button className="btn btn-sm btn-primary" style={{ flexShrink: 0 }} disabled={approvingGradingId === r.id}
                          onClick={() => approveGrading(r.id)}>
                          {approvingGradingId === r.id ? 'Approving…' : 'Approve grading'}
                        </button>
                      )}
                    </div>

                    <div style={{ display: 'flex', gap: 16, marginTop: 10, flexWrap: 'wrap' }}>
                      <div style={{ fontSize: 12 }}>
                        <span style={{ color: 'var(--text-tertiary)' }}>Self-reported classes attended: </span>
                        <strong>{extra.classes_attended || '—'}</strong>
                      </div>
                      <div style={{ fontSize: 12 }}>
                        <span style={{ color: 'var(--text-tertiary)' }}>Actual attendance (last 3 months): </span>
                        <strong style={{ color: r.attendanceCount === 0 ? '#E24B4A' : undefined }}>
                          {r.attendanceCount === null ? 'No student record linked' : `${r.attendanceCount} session${r.attendanceCount === 1 ? '' : 's'}`}
                        </strong>
                      </div>
                    </div>

                    {(extra.competition_history || extra.fitness_comments || extra.coach_name || extra.student_notes) && (
                      <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {extra.competition_history && <p style={{ fontSize: 12 }}><span style={{ color: 'var(--text-tertiary)' }}>Competition history: </span>{extra.competition_history}</p>}
                        {extra.fitness_comments && <p style={{ fontSize: 12 }}><span style={{ color: 'var(--text-tertiary)' }}>Fitness/technique comments: </span>{extra.fitness_comments}</p>}
                        {extra.coach_name && <p style={{ fontSize: 12 }}><span style={{ color: 'var(--text-tertiary)' }}>Coach named: </span>{extra.coach_name}</p>}
                        {extra.student_notes && <p style={{ fontSize: 12 }}><span style={{ color: 'var(--text-tertiary)' }}>Student notes: </span>{extra.student_notes}</p>}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Set an individual holiday for a student, from the Missed
          Training list -- same underlying holidays table (student_id)
          used on the main Calendar page, so it's excluded from
          attendance/missed-training tracking consistently everywhere. */}
      {holidayModalFor && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 16 }}
          onClick={() => setHolidayModalFor(null)}>
          <div className="card" style={{ width: '100%', maxWidth: 380 }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h2 style={{ fontSize: 15, fontWeight: 600 }}>🏖️ Set holiday — {holidayModalFor.name}</h2>
              <button onClick={() => setHolidayModalFor(null)} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--text-secondary)' }}>✕</button>
            </div>
            <div className="field"><label>Holiday name (optional)</label>
              <input value={holidayForm.name} onChange={e => setHolidayForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Family holiday" />
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
              <div className="field" style={{ flex: 1, marginBottom: 0 }}><label>From</label>
                <input type="date" value={holidayForm.start_date} onChange={e => setHolidayForm(f => ({ ...f, start_date: e.target.value }))} />
              </div>
              <div className="field" style={{ flex: 1, marginBottom: 0 }}><label>To</label>
                <input type="date" value={holidayForm.end_date} onChange={e => setHolidayForm(f => ({ ...f, end_date: e.target.value }))} />
              </div>
            </div>
            <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 6 }}>Quick add — from today:</p>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
              {[1, 2, 3, 4].map(weeks => (
                <button key={weeks} className="btn btn-sm" onClick={() => {
                  const today = new Date()
                  const to = new Date(today); to.setDate(to.getDate() + weeks * 7)
                  setHolidayForm(f => ({ ...f, start_date: today.toISOString().split('T')[0], end_date: to.toISOString().split('T')[0] }))
                }}>+{weeks} week{weeks > 1 ? 's' : ''}</button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn" onClick={() => setHolidayModalFor(null)}>Cancel</button>
              <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={saveStudentHoliday} disabled={savingHoliday}>
                {savingHoliday ? 'Saving…' : '✓ Save holiday'}
              </button>
            </div>
          </div>
        </div>
      )}

      {tab === 'birthdays' && (
        <div>
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: showBirthdaysHelp ? 6 : 10 }}>
              <h2 style={{ fontSize: 15, fontWeight: 600 }}>Birthdays</h2>
              <button className="btn btn-sm" title="What does this do?" onClick={() => setShowBirthdaysHelp(v => !v)}
                style={{ width: 20, height: 20, padding: 0, borderRadius: '50%', fontSize: 11, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                ?
              </button>
            </div>
            {showBirthdaysHelp && (
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 10 }}>
                Active students with a birthday in the next 4 weeks.
                <br /><br />
                <b>Template placeholders:</b> use <code>{'{name}'}</code> for the student's first name, <code>{'{age}'}</code> for the age they're turning, and <code>{'{parent_name}'}</code> for the parent/guardian's name — all filled in automatically when you share a template.
              </p>
            )}
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, opacity: 0.6, marginBottom: 14 }}>
              <input type="checkbox" checked={autoSendBirthdays} disabled onChange={() => {}} />
              Auto-send a birthday message on the morning of their birthday
              <span style={{ fontStyle: 'italic' }}>— needs an email/SMS service + a daily scheduled job (not set up yet); manual send below works now</span>
            </label>

            <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>Message templates — press to select, then choose who to send it to</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8, marginBottom: 12 }}>
              {bdTemplates.map((t, i) => (
                bdEditingIdx === i ? (
                  <div key={i} className="card" style={{ padding: 8, background: 'var(--bg-secondary)' }}>
                    <input value={bdTemplateDraft.label} onChange={e => setBdTemplateDraft(d => ({ ...d, label: e.target.value }))}
                      placeholder="Label" style={{ width: '100%', fontSize: 11, fontWeight: 600, marginBottom: 6, padding: '3px 6px' }} />
                    <textarea value={bdTemplateDraft.body} onChange={e => setBdTemplateDraft(d => ({ ...d, body: e.target.value }))}
                      placeholder="Message text — use {name} for first name, {age} for the age they're turning, {parent_name} for the parent/guardian's name" rows={7}
                      style={{ width: '100%', fontSize: 15, padding: '10px 12px', marginBottom: 6, resize: 'vertical' }} />
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button className="btn btn-sm" style={{ fontSize: 10, padding: '2px 8px', flex: 1 }} disabled={bdSavingTemplate}
                        onClick={() => saveBdTemplate(i)}>{bdSavingTemplate ? 'Saving…' : 'Save'}</button>
                      <button className="btn btn-sm" style={{ fontSize: 10, padding: '2px 8px' }} onClick={() => setBdEditingIdx(null)}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div key={i}
                    onClick={() => setBdSelectedTemplateIdx(bdSelectedTemplateIdx === i ? null : i)}
                    style={{
                      padding: 8, borderRadius: 'var(--radius)', cursor: 'pointer', position: 'relative',
                      background: bdSelectedTemplateIdx === i ? '#378ADD20' : 'var(--bg-secondary)',
                      border: bdSelectedTemplateIdx === i ? '2px solid #378ADD' : '1px solid var(--border)',
                      minHeight: 92, display: 'flex', flexDirection: 'column',
                    }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                      <span style={{ fontSize: 11, fontWeight: 600 }}>{t.label || `Template ${i + 1}`}</span>
                      <button className="btn btn-sm" style={{ fontSize: 9, padding: '1px 6px' }}
                        onClick={e => { e.stopPropagation(); setBdEditingIdx(i); setBdTemplateDraft(t) }}>Edit</button>
                    </div>
                    <p style={{ fontSize: 10, color: 'var(--text-tertiary)', lineHeight: 1.4, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical' }}>
                      {t.body || 'No message set yet — click Edit'}
                    </p>
                  </div>
                )
              ))}
            </div>

            {bdSelectedTemplateIdx != null && (
              <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 10 }}>
                <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>Send "{bdTemplates[bdSelectedTemplateIdx].label}" to:</p>
                <input value={bdRecipientSearch} onChange={e => { setBdRecipientSearch(e.target.value); setBdRecipientId(null) }}
                  placeholder="Search students with a birthday coming up…" style={{ width: '100%', fontSize: 12, marginBottom: 6 }} />
                {bdRecipientSearch && !bdRecipientId && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 160, overflowY: 'auto', marginBottom: 6 }}>
                    {birthdays.filter(r => studentFullName(r.student).toLowerCase().includes(bdRecipientSearch.toLowerCase())).slice(0, 8).map(r => (
                      <div key={r.student.id} onClick={() => { setBdRecipientId(r.student.id); setBdRecipientSearch(studentFullName(r.student)) }}
                        style={{ fontSize: 12, padding: '4px 8px', borderRadius: 'var(--radius)', cursor: 'pointer', background: 'var(--bg)' }}>
                        {studentFullName(r.student)}
                      </div>
                    ))}
                  </div>
                )}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-sm btn-primary" disabled={!bdRecipientId}
                    onClick={() => {
                      const recipientRow = birthdays.find(r => r.student.id === bdRecipientId)
                      const text = (bdTemplates[bdSelectedTemplateIdx].body || '')
                        .replace(/\{name\}/gi, recipientRow?.student?.members?.first_name || '')
                        .replace(/\{age\}/gi, recipientRow?.turningAge ?? '')
                        .replace(/\{parent_name\}/gi, recipientRow?.student?.guardian_name || '')
                      shareText(text)
                    }}>
                    📤 Share to {bdRecipientId ? studentFullName(birthdays.find(r => r.student.id === bdRecipientId)?.student) : 'selected student'}
                  </button>
                  {(() => {
                    const recipientRow = birthdays.find(r => r.student.id === bdRecipientId)
                    const email = recipientRow?.student?.members?.email && !recipientRow.student.members.email.includes('@kr-centre.placeholder') ? recipientRow.student.members.email : null
                    if (!bdRecipientId || !email) return null
                    return (
                      <button className="btn btn-sm" title={`Send a real email to ${email}`}
                        onClick={() => {
                          const text = (bdTemplates[bdSelectedTemplateIdx].body || '')
                            .replace(/\{name\}/gi, recipientRow?.student?.members?.first_name || '')
                            .replace(/\{age\}/gi, recipientRow?.turningAge ?? '')
                            .replace(/\{parent_name\}/gi, recipientRow?.student?.guardian_name || '')
                          sendRealEmail(email, bdTemplates[bdSelectedTemplateIdx].label || 'Message from KR Centre', text)
                        }}>✉️ Email</button>
                    )
                  })()}
                </div>
              </div>
            )}
          </div>

          {birthdays.length === 0 ? (
            <div className="empty-state"><h3>No birthdays in the next 4 weeks</h3></div>
          ) : (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
                <button className="btn btn-sm" onClick={() => setSelectedBirthdays(
                  selectedBirthdays.size === birthdays.length ? new Set() : new Set(birthdays.map(r => r.student.id))
                )}>
                  {selectedBirthdays.size === birthdays.length ? 'Deselect all' : 'Select all'}
                </button>
                {selectedBirthdays.size > 0 && (() => {
                  const selectedRows = birthdays.filter(r => selectedBirthdays.has(r.student.id))
                  const people = selectedRows.map(r => ({
                    name: `${r.student.members?.first_name || ''} ${r.student.members?.last_name || ''}`.trim(),
                    email: r.student.members?.email && !r.student.members.email.includes('@kr-centre.placeholder') ? r.student.members.email : null,
                    phone: r.student.members?.phone || null,
                  }))
                  return (
                    <div style={{ display: 'flex', gap: 8 }}>
                      <span style={{ fontSize: 12, color: 'var(--text-tertiary)', alignSelf: 'center' }}>{selectedBirthdays.size} selected</span>
                      <BulkSendOptions people={people} noun="students"
                        subjectText="Happy Birthday!"
                        bodyText={"Hi,\n\nWishing you a very happy birthday from everyone at KR Centre! Hope you have a great day.\n\nSee you at training soon,\nKR Centre"} />
                    </div>
                  )
                })()}
              </div>
              <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
                <table>
                  <thead><tr>
                    <th style={{ width: 30 }}></th>
                    <th>Student</th>
                    <th>Birthday</th>
                    <th>Turning</th>
                    <th>Contact</th>
                  </tr></thead>
                  <tbody>
                    {birthdays.map(r => {
                      const m = r.student.members
                      const email = m?.email && !m.email.includes('@kr-centre.placeholder') ? m.email : null
                      const phone = m?.phone
                      const whenLabel = r.daysUntil === 0 ? 'Today! 🎉' : r.daysUntil === 1 ? 'Tomorrow' : `In ${r.daysUntil} days`
                      const msgBody = encodeURIComponent(`Hi ${m?.first_name}, happy birthday from everyone at KR Centre! Hope you have a great day 🎉`)
                      return (
                        <tr key={r.student.id}>
                          <td><input type="checkbox" checked={selectedBirthdays.has(r.student.id)}
                            onChange={() => setSelectedBirthdays(prev => {
                              const next = new Set(prev)
                              next.has(r.student.id) ? next.delete(r.student.id) : next.add(r.student.id)
                              return next
                            })} /></td>
                          <td style={{ fontSize: 13 }}>{m?.first_name} {m?.last_name}</td>
                          <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                            {r.nextBirthday.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} — {whenLabel}
                          </td>
                          <td style={{ fontSize: 13, fontWeight: 600, color: '#EF9F27' }}>{r.turningAge}</td>
                          <td>
                            <button className="btn btn-sm" style={{ fontSize: 11 }} title="Share birthday message (text, WhatsApp, email...)"
                              onClick={() => shareText(decodeURIComponent(msgBody))}>📤</button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {tab === 'messages' && (
        <div>
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: showMessagesHelp ? 6 : 10 }}>
              <h2 style={{ fontSize: 15, fontWeight: 600 }}>Messages</h2>
              <button className="btn btn-sm" title="What does this do?" onClick={() => setShowMessagesHelp(v => !v)}
                style={{ width: 20, height: 20, padding: 0, borderRadius: '50%', fontSize: 11, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                ?
              </button>
            </div>
            {showMessagesHelp && (
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 10 }}>
                Every active student, so you can message anyone regardless of payments, attendance, or birthday.
                <br /><br />
                <b>Template placeholders:</b> use <code>{'{name}'}</code> for the student's first name and <code>{'{parent_name}'}</code> for the parent/guardian's name — both are filled in automatically when you share a template.
              </p>
            )}

            <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>Message templates — press to select, then use the 📤 button on any student below</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8, marginBottom: 4 }}>
              {msgTemplates.map((t, i) => (
                msgEditingIdx === i ? (
                  <div key={i} className="card" style={{ padding: 8, background: 'var(--bg-secondary)' }}>
                    <input value={msgTemplateDraft.label} onChange={e => setMsgTemplateDraft(d => ({ ...d, label: e.target.value }))}
                      placeholder="Label" style={{ width: '100%', fontSize: 11, fontWeight: 600, marginBottom: 6, padding: '3px 6px' }} />
                    <textarea value={msgTemplateDraft.body} onChange={e => setMsgTemplateDraft(d => ({ ...d, body: e.target.value }))}
                      placeholder="Message text — use {name} for first name, {parent_name} for the parent/guardian's name" rows={7}
                      style={{ width: '100%', fontSize: 15, padding: '10px 12px', marginBottom: 6, resize: 'vertical' }} />
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button className="btn btn-sm" style={{ fontSize: 10, padding: '2px 8px', flex: 1 }} disabled={msgSavingTemplate}
                        onClick={() => saveMsgTemplate(i)}>{msgSavingTemplate ? 'Saving…' : 'Save'}</button>
                      <button className="btn btn-sm" style={{ fontSize: 10, padding: '2px 8px' }} onClick={() => setMsgEditingIdx(null)}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div key={i}
                    onClick={() => setMsgSelectedTemplateIdx(msgSelectedTemplateIdx === i ? null : i)}
                    style={{
                      padding: 8, borderRadius: 'var(--radius)', cursor: 'pointer', position: 'relative',
                      background: msgSelectedTemplateIdx === i ? '#378ADD20' : 'var(--bg-secondary)',
                      border: msgSelectedTemplateIdx === i ? '2px solid #378ADD' : '1px solid var(--border)',
                      minHeight: 92, display: 'flex', flexDirection: 'column',
                    }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                      <span style={{ fontSize: 11, fontWeight: 600 }}>{t.label || `Template ${i + 1}`}</span>
                      <button className="btn btn-sm" style={{ fontSize: 9, padding: '1px 6px' }}
                        onClick={e => { e.stopPropagation(); setMsgEditingIdx(i); setMsgTemplateDraft(t) }}>Edit</button>
                    </div>
                    <p style={{ fontSize: 10, color: 'var(--text-tertiary)', lineHeight: 1.4, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical' }}>
                      {t.body || 'No message set yet — click Edit'}
                    </p>
                  </div>
                )
              ))}
            </div>
            {msgSelectedTemplateIdx == null && (
              <p style={{ fontSize: 11, color: 'var(--text-tertiary)', fontStyle: 'italic', marginBottom: 4 }}>Select a template above to enable the send buttons below.</p>
            )}
          </div>

          <div className="card" style={{ overflowX: 'auto' }}>
            <table style={{ minWidth: 700 }}>
              <thead>
                <tr>
                  {[
                    ['student_ref', 'ID'], ['name', 'Name'], ['age', 'Age'], ['house', 'House'],
                    ['grade', 'Grade'],
                  ].map(([col, label]) => (
                    <th key={col} onClick={() => toggleMessagesSort(col)} style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}>
                      {label}{messagesSortKey === col ? (messagesSortDir === 'asc' ? ' ▲' : ' ▼') : ''}
                    </th>
                  ))}
                  <th style={{ whiteSpace: 'nowrap', position: 'relative' }}>
                    <span onClick={e => { e.stopPropagation(); setMessagesGroupFilterOpen(v => !v) }}
                      style={{ cursor: 'pointer', userSelect: 'none', textDecoration: messagesGroupFilter ? 'underline' : 'none' }}>
                      {messagesGroupFilter ? `Groups: ${{ is_kr: 'KR', is_pts: 'PTs', is_leader: 'Leader', is_coach: 'Coach' }[messagesGroupFilter]}` : 'Groups'}
                    </span>
                    <span onClick={e => { e.stopPropagation(); toggleMessagesSort('groups') }}
                      style={{ marginLeft: 4, fontSize: 9, cursor: 'pointer', padding: '4px 2px' }}>
                      {messagesSortKey === 'groups' ? (messagesSortDir === 'asc' ? '▲' : '▼') : '↕'}
                    </span>
                    {messagesGroupFilterOpen && (
                      <div className="card" onClick={e => e.stopPropagation()}
                        style={{ position: 'absolute', top: '100%', left: 0, zIndex: 25, padding: 6, minWidth: 130, marginTop: 2 }}>
                        <button onClick={() => { setMessagesGroupFilter(''); setMessagesGroupFilterOpen(false) }}
                          style={{ display: 'block', width: '100%', textAlign: 'left', padding: '5px 8px', borderRadius: 6, fontSize: 12, background: !messagesGroupFilter ? 'var(--bg-secondary)' : 'none', border: 'none', cursor: 'pointer', fontWeight: !messagesGroupFilter ? 600 : 400, fontFamily: 'var(--font-sans)', color: 'var(--text)' }}>
                          All groups
                        </button>
                        {[['is_kr', 'KR'], ['is_pts', 'PTs'], ['is_leader', 'Leader'], ['is_coach', 'Coach']].map(([val, label]) => (
                          <button key={val} onClick={() => { setMessagesGroupFilter(val); setMessagesGroupFilterOpen(false) }}
                            style={{ display: 'block', width: '100%', textAlign: 'left', padding: '5px 8px', borderRadius: 6, fontSize: 12, background: messagesGroupFilter === val ? 'var(--bg-secondary)' : 'none', border: 'none', cursor: 'pointer', fontWeight: messagesGroupFilter === val ? 600 : 400, fontFamily: 'var(--font-sans)', color: 'var(--text)' }}>
                            {label}
                          </button>
                        ))}
                      </div>
                    )}
                  </th>
                  <th key="media" onClick={() => toggleMessagesSort('media')} style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}>
                    Media{messagesSortKey === 'media' ? (messagesSortDir === 'asc' ? ' ▲' : ' ▼') : ''}
                  </th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {sortedMessagesStudents().map(s => (
                  <tr key={s.id}>
                    <td style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{s.student_ref}</td>
                    <td style={{ fontSize: 13, fontWeight: 500 }}>{studentFullName(s)}</td>
                    <td style={{ fontSize: 13 }}>{studentAge(s) ?? '—'}</td>
                    <td style={{ fontSize: 13 }}>{s.house_name || s.members?.houses?.name || '—'}</td>
                    <td style={{ fontSize: 13 }}>{s.pka_belt || s.krba_level || '—'}</td>
                    <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{studentGroupsLabel(s) || '—'}</td>
                    <td>
                      {s.media_restriction && (
                        <span className={`badge ${s.media_restriction === 'No' ? 'badge-red' : s.media_restriction === 'Limited' ? 'badge-amber' : 'badge-green'}`} style={{ fontSize: 10 }}>
                          {s.media_restriction === 'No' ? '⚠ No' : s.media_restriction === 'Limited' ? 'Limited' : 'OK'}
                        </span>
                      )}
                    </td>
                    <td>
                      <button className="btn btn-sm" style={{ fontSize: 11 }} disabled={msgSelectedTemplateIdx == null}
                        title={msgSelectedTemplateIdx == null ? 'Select a template first' : 'Share this template (text, WhatsApp, email...)'}
                        onClick={() => {
                          const text = (msgTemplates[msgSelectedTemplateIdx].body || '')
                            .replace(/\{name\}/gi, s.members?.first_name || '')
                            .replace(/\{parent_name\}/gi, s.guardian_name || '')
                          shareText(text)
                        }}>📤</button>
                      {(() => {
                        const email = s.members?.email && !s.members.email.includes('@kr-centre.placeholder') ? s.members.email : null
                        if (!email) return null
                        return (
                          <button className="btn btn-sm" style={{ fontSize: 11, marginLeft: 4 }} disabled={msgSelectedTemplateIdx == null}
                            title={msgSelectedTemplateIdx == null ? 'Select a template first' : `Send a real email to ${email}`}
                            onClick={() => {
                              const text = (msgTemplates[msgSelectedTemplateIdx].body || '')
                                .replace(/\{name\}/gi, s.members?.first_name || '')
                                .replace(/\{parent_name\}/gi, s.guardian_name || '')
                              sendRealEmail(email, msgTemplates[msgSelectedTemplateIdx].label || 'Message from KR Centre', text)
                            }}>✉️</button>
                        )
                      })()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'email' && (
        <div>
          <div className="card" style={{ marginBottom: 16 }}>
            <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 10 }}>📧 Email — info@derbykickboxing.org.uk</h2>
            <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
              <div>
                <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>Inbox connection (IMAP)</p>
                {inboxLoading ? (
                  <span style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>Checking…</span>
                ) : inboxError ? (
                  <span style={{ fontSize: 13, color: '#a32d2d' }}>✕ {inboxError}</span>
                ) : inboxLoaded ? (
                  <span style={{ fontSize: 13, color: '#1D9E75' }}>✓ Connected — {inboxMessages.length} recent message{inboxMessages.length === 1 ? '' : 's'}</span>
                ) : (
                  <span style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>Not checked yet</span>
                )}
              </div>
              <div>
                <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>Sending (SMTP)</p>
                <button className="btn btn-sm" onClick={sendTestEmail} disabled={testEmailStatus === 'sending'}>
                  {testEmailStatus === 'sending' ? 'Sending…' : '📤 Send test email'}
                </button>
                {testEmailStatus === 'sent' && <span style={{ fontSize: 13, color: '#1D9E75', marginLeft: 8 }}>✓ Sent — check the inbox below</span>}
                {testEmailStatus === 'error' && <span style={{ fontSize: 13, color: '#a32d2d', marginLeft: 8 }}>✕ Failed to send</span>}
              </div>
              <button className="btn btn-sm" onClick={loadInbox} disabled={inboxLoading} style={{ alignSelf: 'flex-end', marginLeft: 'auto' }}>
                ↻ Refresh inbox
              </button>
            </div>
          </div>

          <div className="card" style={{ padding: 0 }}>
            {inboxLoading ? (
              <div className="loading">Loading inbox…</div>
            ) : inboxError ? (
              <p style={{ fontSize: 13, color: 'var(--text-tertiary)', padding: 20, textAlign: 'center' }}>
                Couldn't load the inbox — see the error above. This usually means CLUB_EMAIL_PASSWORD isn't set correctly in Netlify's environment variables yet.
              </p>
            ) : inboxMessages.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--text-tertiary)', padding: 20, textAlign: 'center' }}>No messages found.</p>
            ) : (
              inboxMessages.map(m => (
                <div key={m.uid} onClick={() => openInboxMessage(m.uid)}
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '10px 14px', borderTop: '1px solid var(--border)', cursor: 'pointer' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {!m.seen && <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#378ADD', flexShrink: 0 }} />}
                      <span style={{ fontSize: 13, fontWeight: m.seen ? 400 : 600 }}>{m.fromName || m.from}</span>
                      <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{m.from}</span>
                    </div>
                    <div style={{ fontSize: 13, fontWeight: m.seen ? 400 : 600, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.subject}</div>
                  </div>
                  <span style={{ fontSize: 11, color: 'var(--text-tertiary)', flexShrink: 0 }}>
                    {m.date ? new Date(m.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : ''}
                  </span>
                </div>
              ))
            )}
          </div>

          {/* Message detail / reply modal */}
          {openMessage && (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 16 }}
              onClick={() => { setOpenMessage(null); setReplyDraft(null) }}>
              <div className="card" style={{ width: '100%', maxWidth: 560, maxHeight: '85vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
                {openMessageLoading ? (
                  <div className="loading">Loading message…</div>
                ) : openMessageError ? (
                  <p style={{ fontSize: 13, color: '#a32d2d' }}>Couldn't load this message: {openMessageError}</p>
                ) : (
                  <>
                    <div style={{ marginBottom: 12 }}>
                      <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>{openMessage.subject}</h3>
                      <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                        From {openMessage.fromName ? `${openMessage.fromName} <${openMessage.from}>` : openMessage.from}
                        {openMessage.date && ` · ${new Date(openMessage.date).toLocaleString('en-GB')}`}
                      </p>
                    </div>
                    <div style={{ overflowY: 'auto', flex: 1, marginBottom: 14, whiteSpace: 'pre-line', fontSize: 13, lineHeight: 1.5, padding: '10px 12px', background: 'var(--bg-secondary)', borderRadius: 'var(--radius)' }}>
                      {openMessage.body}
                    </div>

                    {replyDraft ? (
                      <div>
                        <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 6 }}>Replying to {replyDraft.to}</p>
                        <textarea value={replyDraft.body} onChange={e => setReplyDraft(d => ({ ...d, body: e.target.value }))}
                          rows={6} style={{ width: '100%', fontSize: 14, padding: '10px 12px', marginBottom: 10, resize: 'vertical' }} />
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button className="btn btn-primary" disabled={replySending || !replyDraft.body.trim()} onClick={sendReply}>
                            {replySending ? 'Sending…' : '✉️ Send reply'}
                          </button>
                          <button className="btn" onClick={() => setReplyDraft(null)}>Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button className="btn btn-primary" onClick={() => setReplyDraft({
                          to: openMessage.from,
                          subject: openMessage.subject?.toLowerCase().startsWith('re:') ? openMessage.subject : `Re: ${openMessage.subject}`,
                          body: `\n\n---\nOn ${openMessage.date ? new Date(openMessage.date).toLocaleString('en-GB') : ''}, ${openMessage.fromName || openMessage.from} wrote:\n${openMessage.body}`,
                        })}>
                          ↩️ Reply
                        </button>
                        <button className="btn" onClick={() => setOpenMessage(null)}>Close</button>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'courses' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
              Courses, gradings, and seminars — also shown on the club calendar.
            </p>
            {isAdmin && <button className="btn btn-primary btn-sm" onClick={() => startEditCourse(null)}>+ Add course</button>}
          </div>

          {courses.length === 0 ? (
            <div className="empty-state"><h3>No courses yet</h3><p>Add your first course to get started</p></div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {courses.map(c => {
                const isOpen = expandedCourseId === c.id
                const isPast = c.start_date < new Date().toISOString().split('T')[0]
                return (
                  <div key={c.id} className="card" style={{ padding: 0, opacity: isPast ? 0.6 : 1 }}>
                    <button onClick={() => { const next = isOpen ? null : c.id; setExpandedCourseId(next); if (next) loadCourseInterest(next) }}
                      style={{ width: '100%', textAlign: 'left', display: 'flex', gap: 12, padding: 12, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-sans)' }}>
                      {c.poster_url ? (
                        <img src={c.poster_url} alt="" style={{ width: 56, height: 56, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} />
                      ) : (
                        <div style={{ width: 56, height: 56, borderRadius: 8, background: 'var(--bg-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>🎓</div>
                      )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>{c.title}</div>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                          {new Date(c.start_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                          {c.end_date ? ` – ${new Date(c.end_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : ''}
                          {c.location ? ` · ${c.location}` : ''}
                        </div>
                      </div>
                      <span style={{ fontSize: 12, color: 'var(--text-tertiary)', alignSelf: 'center' }}>{isOpen ? '▲' : '▼'}</span>
                    </button>
                    {isOpen && (
                      <div style={{ padding: '0 12px 12px' }}>
                        {c.poster_url && (
                          <div style={{ marginBottom: 10 }}>
                            <img src={c.poster_url} alt="" style={{ width: '100%', maxWidth: 320, borderRadius: 8, marginBottom: 6, display: 'block' }} />
                            {isAdmin && (
                              <button className="btn btn-sm" onClick={() => downloadPosterImage(c)} title="Downloads the original file, full quality, for editing/updating">
                                ⬇️ Download image
                              </button>
                            )}
                          </div>
                        )}
                        {c.description && <p style={{ fontSize: 13, whiteSpace: 'pre-line', marginBottom: 10 }}>{c.description}</p>}
                        {c.price && <p style={{ fontSize: 13, marginBottom: 10 }}><strong>Price:</strong> {c.price}</p>}
                        {isAdmin && (
                          <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
                            <button className="btn btn-sm" onClick={() => startEditCourse(c)}>Edit</button>
                            <button className="btn btn-sm" onClick={() => deleteCourse(c.id)} style={{ color: '#E24B4A' }}>Delete</button>
                          </div>
                        )}

                        {isAdmin && (() => {
                          const interestUrl = `${window.location.origin}/course-interest?course_id=${c.id}`
                          const posterLine = c.poster_url ? `\n${c.poster_url}` : ''
                          const messageBody = `${c.message_text || `Check out our upcoming course: ${c.title}`}${posterLine}\n\nExpress your interest here: ${interestUrl}`
                          const encodedBody = encodeURIComponent(messageBody)
                          const hasNativeFileShare = typeof navigator !== 'undefined' && !!navigator.canShare
                          return (
                            <div className="card" style={{ background: 'var(--bg-secondary)', marginBottom: 14 }}>
                              <p style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>📢 Send details</p>
                              {c.poster_url && hasNativeFileShare && (
                                <>
                                  <button className="btn btn-sm btn-primary" style={{ width: '100%', justifyContent: 'center', marginBottom: 8 }}
                                    onClick={() => sharePosterFile(c)}>
                                    🖼️ Send poster image
                                  </button>
                                  <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 10 }}>
                                    Attaches the actual poster picture via your phone's share menu, instead of just a link to it.
                                  </p>
                                </>
                              )}
                              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                                <a className="btn btn-sm" href={`mailto:?subject=${encodeURIComponent(c.title)}&body=${encodedBody}`}>✉️ Email</a>
                                <a className="btn btn-sm" href={`sms:?body=${encodedBody}`}>📱 Text</a>
                                <a className="btn btn-sm" href={`https://wa.me/?text=${encodedBody}`} target="_blank" rel="noreferrer">💬 WhatsApp</a>
                                <button className="btn btn-sm" onClick={() => { navigator.clipboard?.writeText(interestUrl); alert('Interest form link copied!') }}>🔗 Copy interest link</button>
                              </div>
                              <p style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                                These send the saved message plus a link to the poster (not the image itself — text links can't attach files) and a link to the expression of interest form. Edit the course to change the message.
                              </p>
                            </div>
                          )
                        })()}

                        {isAdmin && (
                          <div>
                            <p style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>
                              📋 Expressions of interest {courseInterest[c.id] ? `(${courseInterest[c.id].length})` : ''}
                            </p>
                            {loadingInterestFor === c.id ? (
                              <p style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Loading…</p>
                            ) : !courseInterest[c.id] || courseInterest[c.id].length === 0 ? (
                              <p style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>No responses yet — share the interest link above.</p>
                            ) : (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                {courseInterest[c.id].map(r => (
                                  <div key={r.id} style={{
                                    display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8,
                                    padding: '8px 10px', borderRadius: 'var(--radius)',
                                    background: r.status === 'confirmed' ? '#1D9E7512' : 'var(--bg-secondary)',
                                  }}>
                                    <span style={{ minWidth: 0 }}>
                                      <span style={{ fontSize: 13, fontWeight: 600 }}>{r.name}</span>
                                      <span style={{ fontSize: 11, color: 'var(--text-tertiary)', marginLeft: 8 }}>
                                        {r.email || r.phone || ''}
                                      </span>
                                      <span style={{ display: 'block', fontSize: 11, marginTop: 2 }}>
                                        {r.attendanceCount === null ? (
                                          <span style={{ color: 'var(--text-tertiary)', fontStyle: 'italic' }}>Not an existing student</span>
                                        ) : (
                                          <span style={{ color: r.attendanceCount === 0 ? '#E24B4A' : 'var(--text-secondary)' }}>
                                            {r.attendanceCount} session{r.attendanceCount === 1 ? '' : 's'} in the last 3 months
                                          </span>
                                        )}
                                      </span>
                                      {r.notes && <span style={{ display: 'block', fontSize: 11, color: 'var(--text-secondary)' }}>{r.notes}</span>}
                                    </span>
                                    {r.status === 'confirmed' ? (
                                      <span style={{ fontSize: 11, fontWeight: 600, color: '#1D9E75', flexShrink: 0 }}>✓ Confirmed</span>
                                    ) : (
                                      <button className="btn btn-sm" style={{ flexShrink: 0 }} onClick={() => confirmAttendance(r.id, c.id)}>Confirm place</button>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {editingCourse !== null && (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 16 }}
              onClick={() => setEditingCourse(null)}>
              <div className="card" style={{ width: '100%', maxWidth: 420, maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
                <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 14 }}>{editingCourse?.id ? 'Edit course' : 'Add course'}</h3>

                <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Title</label>
                <input value={courseForm.title} onChange={e => setCourseForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="e.g. Kickboxing Level 1 Grading" style={{ width: '100%', marginBottom: 10 }} />

                <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Poster</label>
                {courseForm.poster_url && (
                  <div style={{ marginBottom: 8 }}>
                    <img src={courseForm.poster_url} alt="" style={{ width: 120, borderRadius: 8, marginBottom: 6, display: 'block' }} />
                    <button className="btn btn-sm" onClick={() => downloadPosterImage({ title: courseForm.title || 'course', poster_url: courseForm.poster_url })} title="Downloads the original file, full quality, for editing/updating">
                      ⬇️ Download image
                    </button>
                  </div>
                )}
                <input type="file" accept="image/*" style={{ marginBottom: 10 }} disabled={uploadingPoster}
                  onChange={e => { const f = e.target.files?.[0]; if (f) uploadCoursePoster(f) }} />
                {uploadingPoster && <p style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Uploading…</p>}

                <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Start date</label>
                    <input type="date" value={courseForm.start_date} onChange={e => setCourseForm(f => ({ ...f, start_date: e.target.value }))} style={{ width: '100%' }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>End date (optional)</label>
                    <input type="date" value={courseForm.end_date} onChange={e => setCourseForm(f => ({ ...f, end_date: e.target.value }))} style={{ width: '100%' }} />
                  </div>
                </div>

                <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Location</label>
                <input value={courseForm.location} onChange={e => setCourseForm(f => ({ ...f, location: e.target.value }))}
                  placeholder="e.g. KR Centre" style={{ width: '100%', marginBottom: 10 }} />

                <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Price</label>
                <input value={courseForm.price} onChange={e => setCourseForm(f => ({ ...f, price: e.target.value }))}
                  placeholder="e.g. £25" style={{ width: '100%', marginBottom: 10 }} />

                <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Description</label>
                <textarea value={courseForm.description} onChange={e => setCourseForm(f => ({ ...f, description: e.target.value }))}
                  rows={4} style={{ width: '100%', marginBottom: 14, resize: 'vertical' }} />

                <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Message to send (email/text/WhatsApp)</label>
                <textarea value={courseForm.message_text} onChange={e => setCourseForm(f => ({ ...f, message_text: e.target.value }))}
                  rows={4} placeholder="e.g. Places still available for our upcoming grading — let us know if you're interested!"
                  style={{ width: '100%', marginBottom: 14, resize: 'vertical' }} />

                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-primary" disabled={savingCourse} onClick={saveCourse}>{savingCourse ? 'Saving…' : 'Save'}</button>
                  <button className="btn" onClick={() => setEditingCourse(null)}>Cancel</button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {addingNoteForStudent && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 16 }}
          onClick={() => setAddingNoteForStudent(null)}>
          <div className="card" style={{ width: '100%', maxWidth: 480, maxHeight: '85vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 10 }}>📝 Notes for {studentFullName(addingNoteForStudent)}</h3>
            {(athleteNotesByStudent[addingNoteForStudent.id] || []).length > 0 && (
              <div style={{ overflowY: 'auto', marginBottom: 12, paddingRight: 4 }}>
                <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>Previous notes</p>
                {athleteNotesByStudent[addingNoteForStudent.id].map(n => (
                  <div key={n.id} style={{ padding: '8px 0', borderTop: '1px solid var(--border)' }}>
                    <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
                      {new Date(n.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })} at {new Date(n.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <p style={{ fontSize: 13, margin: '2px 0 0', whiteSpace: 'pre-line' }}>{n.note_text}</p>
                  </div>
                ))}
              </div>
            )}
            <textarea value={quickNoteDraft} onChange={e => setQuickNoteDraft(e.target.value)} rows={7} autoFocus
              placeholder="e.g. Spoke to parent, payment coming next week…"
              style={{ width: '100%', fontSize: 15, padding: '10px 12px', marginBottom: 12, resize: 'vertical' }} />
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-primary" disabled={!quickNoteDraft.trim() || savingQuickNote} onClick={saveQuickNote}>
                {savingQuickNote ? 'Saving…' : 'Save note'}
              </button>
              <button className="btn" onClick={() => setAddingNoteForStudent(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
