import { useState, useEffect, Fragment } from 'react'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../hooks/useAuth.jsx'
import { useBackableTab } from '../hooks/useBackableTab.js'
import * as XLSX from 'xlsx'
import Trackers from './Trackers.jsx'

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

// Same age-banded PKA grade order used on the Grading expression form --
// duplicated here (not imported) to match the existing pattern in this
// codebase of small constant tables being local to each file that needs
// them (see TEST_CATEGORIES in AthleteApp.jsx/AthleteProfiles.jsx).
const PKA_GRADE_ORDERS = {
  'Tiny Tots (3-5 years)': ['Red', 'Yellow', 'Yellow tag', 'Orange', 'Orange tag', 'Green', 'Green tag', 'Blue', 'Blue tag', 'Purple', 'Purple tag', 'Brown', 'Brown tag', 'Black'],
  'Small Soldiers (6-8 years)': ['Red', 'Yellow', 'Orange', 'Green', 'Blue', 'Blue tag', 'Purple', 'Purple tag', 'Brown', 'Brown tag', 'Black'],
  'Junior Jedi (9-13 years)': ['Red', 'Yellow', 'Orange', 'Green', 'Blue', 'Purple', 'Purple tag', 'Brown', 'Brown tag', 'Black'],
  'Adults (14+)': ['Red', 'Yellow', 'Orange', 'Green', 'Blue', 'Purple', 'Brown', 'Black'],
}
const PKA_BAND_ORDER = ['Tiny Tots (3-5 years)', 'Small Soldiers (6-8 years)', 'Junior Jedi (9-13 years)', 'Adults (14+)', 'KRBA']

function ageFromDOB(dob) {
  if (!dob) return null
  return Math.floor((Date.now() - new Date(dob)) / (365.25 * 24 * 60 * 60 * 1000))
}
function ageBandFor(dob) {
  const age = ageFromDOB(dob)
  if (age == null) return 'Adults (14+)'
  if (age <= 5) return 'Tiny Tots (3-5 years)'
  if (age <= 8) return 'Small Soldiers (6-8 years)'
  if (age <= 13) return 'Junior Jedi (9-13 years)'
  return 'Adults (14+)'
}
function beltOrderIndex(discipline, ageBand, beltName, krbaLevels) {
  const order = discipline === 'PKA' ? (PKA_GRADE_ORDERS[ageBand] || []) : (krbaLevels || [])
  const idx = order.indexOf(beltName)
  return idx === -1 ? 999 : idx
}
function beltSizeFor(dob, rule) {
  const age = ageFromDOB(dob)
  if (age == null) return rule.over_size
  return age < rule.threshold_age ? rule.under_size : rule.over_size
}

// The redesigned targeted-send flow for a notice: pick a method, pick
// recipients from the full student list, then either send
// immediately, schedule it for a later time, or set it up to repeat
// to the same list on an interval. Scheduled/recurring sends are
// written to notice_sends and fired later by the send-scheduled-
// notices cron job -- nobody needs to keep the app open for those.
//
// Defined at module level (not nested inside CRM's render) since it
// holds its own interactive state (search text, selected checkboxes)
// that must survive CRM re-rendering, which happens often given how
// large that component is.
function NoticeTargetedSend({ notice, students, sendRealEmail, studentFullName }) {
  const [open, setOpen] = useState(false)
  const [method, setMethod] = useState('email')
  const [search, setSearch] = useState('')
  const [selectedIds, setSelectedIds] = useState(() => new Set())
  const [sendMode, setSendMode] = useState('now') // 'now' | 'schedule' | 'recurring'
  const [scheduleAt, setScheduleAt] = useState('')
  const [repeatInterval, setRepeatInterval] = useState('weekly')
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState(null)

  if (!open) {
    return <button className="btn btn-sm" style={{ marginBottom: 14 }} onClick={() => setOpen(true)}>🎯 Send to specific students</button>
  }

  const filtered = students.filter(s => !search.trim() || studentFullName(s).toLowerCase().includes(search.trim().toLowerCase()))
  const messageBody = notice.message_text || `Check out our upcoming notice: ${notice.title}`

  async function handleSend() {
    const ids = [...selectedIds]
    if (ids.length === 0) { alert('Select at least one student first.'); return }
    setSending(true)
    setResult(null)

    if (sendMode === 'now') {
      let sent = 0, skipped = 0
      for (const sid of ids) {
        const s = students.find(x => x.id === sid)
        const email = s?.members?.email && !s.members.email.includes('@kr-centre.placeholder') ? s.members.email : null
        if (!email) { skipped++; continue }
        const text = messageBody.replace(/\{name\}/gi, s.members?.first_name || '')
        const ok = await sendRealEmail(email, notice.title, text, true)
        if (ok) sent++; else skipped++
      }
      setResult(`Sent to ${sent} student${sent === 1 ? '' : 's'}${skipped ? ` · ${skipped} skipped (no email on file, or send failed)` : ''}`)
    } else {
      const { error } = await supabase.from('notice_sends').insert({
        course_id: notice.id,
        method: 'email',
        student_ids: ids,
        subject: notice.title,
        message_text: messageBody,
        send_at: sendMode === 'schedule' ? new Date(scheduleAt).toISOString() : new Date().toISOString(),
        repeat_interval: sendMode === 'recurring' ? repeatInterval : 'none',
      })
      if (error) setResult('Error: ' + error.message)
      else setResult(sendMode === 'schedule' ? `Scheduled for ${new Date(scheduleAt).toLocaleString('en-GB')}` : `Set up to send every ${repeatInterval === 'weekly' ? 'week' : 'month'} to this list, starting now`)
    }
    setSending(false)
  }

  return (
    <div className="card" style={{ background: 'var(--bg-secondary)', marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <p style={{ fontSize: 12, fontWeight: 600 }}>🎯 Send to specific students</p>
        <button className="btn btn-sm" onClick={() => setOpen(false)}>Close</button>
      </div>

      <label style={{ fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 4 }}>Method</label>
      <select value={method} onChange={e => setMethod(e.target.value)} style={{ width: '100%', fontSize: 13, marginBottom: 10 }}>
        <option value="email">Email</option>
      </select>
      <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: -6, marginBottom: 10 }}>
        Only email can be sent directly to a chosen list from here — text/WhatsApp need your phone's own share menu (use "Send details" above for those instead).
      </p>

      <input type="text" placeholder="🔍 Search by name…" value={search} onChange={e => setSearch(e.target.value)} style={{ width: '100%', fontSize: 13, marginBottom: 8 }} />
      <div style={{ maxHeight: 160, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 6, marginBottom: 10 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, padding: '6px 8px', borderBottom: '1px solid var(--border)', fontWeight: 600 }}>
          <input type="checkbox" checked={filtered.length > 0 && filtered.every(s => selectedIds.has(s.id))}
            onChange={e => setSelectedIds(prev => {
              const next = new Set(prev)
              filtered.forEach(s => e.target.checked ? next.add(s.id) : next.delete(s.id))
              return next
            })} />
          Select all ({filtered.length})
        </label>
        {filtered.map(s => (
          <label key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, padding: '4px 8px' }}>
            <input type="checkbox" checked={selectedIds.has(s.id)} onChange={e => setSelectedIds(prev => {
              const next = new Set(prev)
              if (e.target.checked) next.add(s.id); else next.delete(s.id)
              return next
            })} />
            {studentFullName(s)}
          </label>
        ))}
      </div>
      <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 10 }}>{selectedIds.size} selected</p>

      <label style={{ fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 4 }}>When</label>
      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        {[['now', 'Send now'], ['schedule', 'Schedule'], ['recurring', 'Repeat to this list']].map(([val, label]) => (
          <button key={val} className={sendMode === val ? 'btn btn-sm btn-primary' : 'btn btn-sm'} onClick={() => setSendMode(val)}>{label}</button>
        ))}
      </div>
      {sendMode === 'schedule' && (
        <input type="datetime-local" value={scheduleAt} onChange={e => setScheduleAt(e.target.value)} style={{ width: '100%', fontSize: 13, marginBottom: 10 }} />
      )}
      {sendMode === 'recurring' && (
        <select value={repeatInterval} onChange={e => setRepeatInterval(e.target.value)} style={{ width: '100%', fontSize: 13, marginBottom: 10 }}>
          <option value="weekly">Every week</option>
          <option value="monthly">Every month</option>
        </select>
      )}

      <button className="btn btn-sm btn-primary" style={{ width: '100%', justifyContent: 'center' }}
        disabled={sending || selectedIds.size === 0 || (sendMode === 'schedule' && !scheduleAt)}
        onClick={handleSend}>
        {sending ? 'Sending…' : sendMode === 'now' ? `✉️ Send now to ${selectedIds.size}` : sendMode === 'schedule' ? '🕐 Schedule send' : '🔁 Set up recurring send'}
      </button>
      {result && <p style={{ fontSize: 12, color: result.startsWith('Error') ? '#E24B4A' : 'var(--text-secondary)', marginTop: 8 }}>{result}</p>}
    </div>
  )
}

export default function CRM() {
  const { isAdmin } = useAuth()
  const [tab, setTab] = useBackableTab('standing_orders')
  const [students, setStudents] = useState([])
  const [payerLinks, setPayerLinks] = useState([])
  const [payments, setPayments] = useState([]) // parsed from the uploaded file: [{ name, amount, raw }]
  const [adhocKeywords, setAdhocKeywords] = useState(['level up'])
  const [adhocKeywordDraft, setAdhocKeywordDraft] = useState('')
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
  const [confirmStopFor, setConfirmStopFor] = useState(null) // { memberId, studentId, name } currently confirming a "mark as stopped" action, or null
  const [stoppingInProgress, setStoppingInProgress] = useState(false)
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
  const [enquiries, setEnquiries] = useState([])
  const [enquiriesLoaded, setEnquiriesLoaded] = useState(false)
  const [enquiryStatusFilter, setEnquiryStatusFilter] = useState('all')
  const [enquiryMethodFilter, setEnquiryMethodFilter] = useState('all')
  const [leadSources, setLeadSources] = useState([])
  const [leadSourcesLoaded, setLeadSourcesLoaded] = useState(false)
  const [joinsStopsMembers, setJoinsStopsMembers] = useState([])
  const [joinsStopsLoaded, setJoinsStopsLoaded] = useState(false)
  const [trackersStats, setTrackersStats] = useState(null)
  const [trainedPerDay, setTrainedPerDay] = useState([])
  const [trainedPerDayLoaded, setTrainedPerDayLoaded] = useState(false)
  const [showNewEnquiryForm, setShowNewEnquiryForm] = useState(false)
  const [editingEnquiryId, setEditingEnquiryId] = useState(null)
  const [contactPopupFor, setContactPopupFor] = useState(null)
  const [standingOrderCheckMonth, setStandingOrderCheckMonth] = useState(null)
  const [enquiryDraft, setEnquiryDraft] = useState(null)
  const [savingEnquiry, setSavingEnquiry] = useState(false)
  const [linkingEnquiryId, setLinkingEnquiryId] = useState(null)
  const [memberLinkSearch, setMemberLinkSearch] = useState('')
  const [memberLinkResults, setMemberLinkResults] = useState([])
  const [importingFacebookLeads, setImportingFacebookLeads] = useState(false)
  const [facebookImportResult, setFacebookImportResult] = useState(null)
  const [emailingEnquiry, setEmailingEnquiry] = useState(null)
  const [enquiryEmailDraft, setEnquiryEmailDraft] = useState(null)
  const [sendingEnquiryEmail, setSendingEnquiryEmail] = useState(false)
  const [deletingEmailUid, setDeletingEmailUid] = useState(null)
  const [markingContactedUid, setMarkingContactedUid] = useState(null)
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
  const [msgSelectedStudentIds, setMsgSelectedStudentIds] = useState(() => new Set())
  const [msgNameSearch, setMsgNameSearch] = useState('')
  const [msgBatchSending, setMsgBatchSending] = useState(false)
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
  const [courseForm, setCourseForm] = useState({ title: '', description: '', poster_url: '', start_date: '', end_date: '', location: '', price: '', message_text: '', repeat_type: 'none', repeat_count: 8 })
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
  const [showStoppedHelp, setShowStoppedHelp] = useState(false)
  const [stTemplates, setStTemplates] = useState([
    { label: 'Template 1', body: '' },
    { label: 'Template 2', body: '' },
    { label: 'Template 3', body: '' },
    { label: 'Template 4', body: '' },
    { label: 'Template 5', body: '' },
  ])
  const [stEditingIdx, setStEditingIdx] = useState(null)
  const [stTemplateDraft, setStTemplateDraft] = useState({ label: '', body: '' })
  const [stSavingTemplate, setStSavingTemplate] = useState(false)
  const [stSelectedTemplateIdx, setStSelectedTemplateIdx] = useState(null)
  const [stRecipientId, setStRecipientId] = useState(null)
  const [stRecipientSearch, setStRecipientSearch] = useState('')

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
    supabase.from('settings').select('value').eq('key', 'crm_stopped_training_templates').single()
      .then(({ data }) => {
        if (Array.isArray(data?.value) && data.value.length === 5) setStTemplates(data.value)
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

  async function saveStTemplate(idx) {
    setStSavingTemplate(true)
    const updated = stTemplates.map((t, i) => i === idx ? { ...stTemplateDraft } : t)
    const { error } = await supabase.from('settings').upsert({ key: 'crm_stopped_training_templates', value: updated }, { onConflict: 'key' })
    setStSavingTemplate(false)
    if (error) { alert('Error saving template: ' + error.message); return }
    setStTemplates(updated)
    setStEditingIdx(null)
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
      ? { title: course.title, description: course.description || '', poster_url: course.poster_url || '', start_date: course.start_date, end_date: course.end_date || '', location: course.location || '', price: course.price || '', message_text: course.message_text || '', repeat_type: 'none', repeat_count: 8 }
      : { title: '', description: '', poster_url: '', start_date: '', end_date: '', location: '', price: '', message_text: '', repeat_type: 'none', repeat_count: 8 })
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
    const { repeat_type, repeat_count, ...base } = courseForm
    const payload = { ...base, end_date: base.end_date || null }
    let error

    if (editingCourse?.id) {
      ;({ error } = await supabase.from('courses').update(payload).eq('id', editingCourse.id))
    } else if (repeat_type === 'none') {
      ;({ error } = await supabase.from('courses').insert(payload))
    } else {
      // Repeating notices are generated as several real, independent
      // rows up front (rather than one row with "repeat" metadata),
      // so every other part of the app that already reads from the
      // courses table (calendar etc.) just sees normal individual
      // notices with no extra logic needed anywhere else.
      const groupId = crypto.randomUUID()
      const startBase = new Date(payload.start_date + 'T00:00:00')
      const endBase = payload.end_date ? new Date(payload.end_date + 'T00:00:00') : null
      const rows = Array.from({ length: Math.max(1, repeat_count || 1) }, (_, i) => {
        const s = new Date(startBase)
        const e = endBase ? new Date(endBase) : null
        if (repeat_type === 'weekly') { s.setDate(s.getDate() + i * 7); if (e) e.setDate(e.getDate() + i * 7) }
        else { s.setMonth(s.getMonth() + i); if (e) e.setMonth(e.getMonth() + i) }
        return { ...payload, start_date: s.toISOString().split('T')[0], end_date: e ? e.toISOString().split('T')[0] : null, recurring_group_id: groupId }
      })
      ;({ error } = await supabase.from('courses').insert(rows))
    }

    setSavingCourse(false)
    if (error) { alert('Error saving notice: ' + error.message); return }
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
  const [gradingView, setGradingView] = useState('requests') // 'requests' | 'list'
  const [gradingDisciplineFilter, setGradingDisciplineFilter] = useState('all')
  const [gradingApprovedOnly, setGradingApprovedOnly] = useState(false)
  const [gradingSelected, setGradingSelected] = useState({}) // id -> bool, defaults to selected
  const [krbaLevelsForGrading, setKrbaLevelsForGrading] = useState([])
  const [beltSizeRule, setBeltSizeRule] = useState({ threshold_age: 10, under_size: '240', over_size: '280' })
  const [editingBeltSizeRule, setEditingBeltSizeRule] = useState(false)
  const [beltStock, setBeltStock] = useState([]) // [{ size, belt, qty }]
  const [savingBeltSettings, setSavingBeltSettings] = useState(false)
  const [showBeltStock, setShowBeltStock] = useState(false)
  const [showOrderForm, setShowOrderForm] = useState(false)

  async function loadGradingRequests() {
    setGradingLoading(true)
    const cutoff = new Date()
    cutoff.setMonth(cutoff.getMonth() - 3)
    const cutoffStr = cutoff.toISOString().split('T')[0]

    const [{ data, error }, { data: settingsRows }] = await Promise.all([
      supabase
        .from('grading_expressions')
        .select('*, students(id, discipline, pka_belt, krba_level, members(first_name, last_name, date_of_birth))')
        .order('created_at', { ascending: false }),
      supabase.from('settings').select('key,value').in('key', ['krba_levels', 'grading_belt_size_rule', 'grading_belt_stock']),
    ])
    if (error) { alert('Error loading grading requests: ' + error.message); setGradingLoading(false); return }

    const sm = Object.fromEntries((settingsRows || []).map(r => [r.key, r.value]))
    setKrbaLevelsForGrading(sm.krba_levels || [])
    if (sm.grading_belt_size_rule) setBeltSizeRule(sm.grading_belt_size_rule)
    setBeltStock(sm.grading_belt_stock || [])

    const enriched = await Promise.all((data || []).map(async (r) => {
      if (!r.student_id) return { ...r, attendanceCount: null }
      const { count } = await supabase.from('attendance').select('*', { count: 'exact', head: true })
        .eq('student_id', r.student_id).gte('session_date', cutoffStr)
      return { ...r, attendanceCount: count ?? 0 }
    }))

    setGradingRequests(enriched)
    setGradingSelected(Object.fromEntries(enriched.map(r => [r.id, true])))
    setGradingLoaded(true)
    setGradingLoading(false)
  }

  async function saveBeltSizeRule(rule) {
    setSavingBeltSettings(true)
    const { error } = await supabase.from('settings').upsert({ key: 'grading_belt_size_rule', value: rule }, { onConflict: 'key' })
    setSavingBeltSettings(false)
    if (error) { alert('Error saving: ' + error.message); return }
    setBeltSizeRule(rule)
    setEditingBeltSizeRule(false)
  }

  async function saveBeltStock(stock) {
    setSavingBeltSettings(true)
    const { error } = await supabase.from('settings').upsert({ key: 'grading_belt_stock', value: stock }, { onConflict: 'key' })
    setSavingBeltSettings(false)
    if (error) { alert('Error saving: ' + error.message); return }
    setBeltStock(stock)
  }

  // Builds the flat, sortable/groupable row list the Grading list view,
  // exports and printouts all share -- one place computing name/age/
  // band/belt-order/size so every output stays consistent with the others.
  function computeGradingRows() {
    return gradingRequests
      .filter(r => gradingDisciplineFilter === 'all' || r.discipline === gradingDisciplineFilter)
      .filter(r => !gradingApprovedOnly || r.coach_approved)
      .map(r => {
        const m = r.students?.members
        const dob = m?.date_of_birth
        const band = r.discipline === 'PKA' ? ageBandFor(dob) : 'KRBA'
        const orderIdx = beltOrderIndex(r.discipline, band, r.grading_for, krbaLevelsForGrading)
        return {
          ...r,
          name: m ? `${m.first_name} ${m.last_name}` : 'Unknown student',
          age: ageFromDOB(dob),
          band,
          orderIdx,
          size: beltSizeFor(dob, beltSizeRule),
        }
      })
      .sort((a, b) => {
        const bandDiff = PKA_BAND_ORDER.indexOf(a.band) - PKA_BAND_ORDER.indexOf(b.band)
        if (bandDiff !== 0) return bandDiff
        return a.orderIdx - b.orderIdx
      })
  }

  function computeBeltTally(rows) {
    const tally = {}
    rows.forEach(r => {
      const key = `${r.size}__${r.grading_for}`
      if (!tally[key]) tally[key] = { size: r.size, belt: r.grading_for, qty: 0 }
      tally[key].qty++
    })
    return Object.values(tally).sort((a, b) => a.size.localeCompare(b.size) || a.belt.localeCompare(b.belt))
  }

  function exportGradingList(rows) {
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.json_to_sheet(rows.map(r => ({
      Name: r.name, Age: r.age ?? '', 'Age group': r.band, Discipline: r.discipline,
      'Current belt': r.current_belt || '', 'Grading for': r.grading_for, 'Belt size': r.size,
      Approved: r.coach_approved ? 'Yes' : 'No',
    })))
    XLSX.utils.book_append_sheet(wb, ws, 'Grading list')
    XLSX.writeFile(wb, `grading_list_${new Date().toISOString().split('T')[0]}.xlsx`)
  }

  function exportOrderForm(rows) {
    const tally = computeBeltTally(rows)
    const stockMap = Object.fromEntries(beltStock.map(s => [`${s.size}__${s.belt}`, s.qty]))
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.json_to_sheet(tally.map(t => {
      const inStock = stockMap[`${t.size}__${t.belt}`] || 0
      return { Size: t.size, Belt: t.belt, Needed: t.qty, 'In stock': inStock, 'To order': Math.max(0, t.qty - inStock) }
    }))
    XLSX.utils.book_append_sheet(wb, ws, 'Belt order form')
    XLSX.writeFile(wb, `belt_order_form_${new Date().toISOString().split('T')[0]}.xlsx`)
  }

  function printGradingWindow(title, bodyHtml) {
    const win = window.open('', '_blank')
    if (!win) { alert('Please allow pop-ups to print.'); return }
    win.document.write(`<html><head><title>${title}</title><style>
      body{font-family:sans-serif;padding:24px;color:#111;}
      h1{font-size:18px;margin-bottom:4px;} h2{font-size:14px;margin-top:24px;border-bottom:1px solid #ccc;padding-bottom:4px;}
      table{width:100%;border-collapse:collapse;margin-top:8px;}
      th,td{border:1px solid #ccc;padding:6px 8px;text-align:left;font-size:12px;}
      th{background:#f0f0f0;}
    </style></head><body>${bodyHtml}</body></html>`)
    win.document.close()
    win.focus()
    setTimeout(() => win.print(), 300)
  }

  function printExaminersForm(rows) {
    const bandsPresent = [...new Set(rows.map(r => r.band))]
    let html = `<h1>Grading examiners form</h1><p style="font-size:12px;color:#666;">${new Date().toLocaleDateString('en-GB')}</p>`
    bandsPresent.forEach(band => {
      html += `<h2>${band}</h2><table><thead><tr><th>Name</th><th>Age</th><th>Current belt</th><th>Grading for</th><th>Result</th></tr></thead><tbody>`
      rows.filter(r => r.band === band).forEach(r => {
        html += `<tr><td>${r.name}</td><td>${r.age ?? ''}</td><td>${r.current_belt || ''}</td><td>${r.grading_for}</td><td>PASS&nbsp;&nbsp;/&nbsp;&nbsp;REFER&nbsp;&nbsp;/&nbsp;&nbsp;FAIL</td></tr>`
      })
      html += `</tbody></table>`
    })
    printGradingWindow('Examiners form', html)
  }

  function printCertificateList(rows) {
    let html = `<h1>Certificates to print</h1><table><thead><tr><th>Name</th><th>New belt</th></tr></thead><tbody>`
    rows.forEach(r => { html += `<tr><td>${r.name}</td><td>${r.grading_for}</td></tr>` })
    html += `</tbody></table>`
    printGradingWindow('Certificate list', html)
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

  useEffect(() => {
    supabase.from('settings').select('value').eq('key', 'standing_order_adhoc_keywords').maybeSingle()
      .then(({ data }) => { if (data?.value?.length) setAdhocKeywords(data.value) })
  }, [])

  // Loads the data these three reminder banners need eagerly, rather
  // than waiting for someone to click into those tabs first -- the
  // whole point of a reminder is that it's visible without having to
  // go looking for it. Runs once students are available (missed
  // training / birthdays are both computed from that array).
  useEffect(() => {
    if (students.length === 0) return
    if (!missedTrainingLoaded) loadMissedTraining()
    if (!birthdaysLoaded) loadBirthdays()
  }, [students.length])

  useEffect(() => {
    supabase.from('settings').select('value').eq('key', 'standing_order_check_last_done').maybeSingle()
      .then(({ data }) => setStandingOrderCheckMonth(data?.value || null))
  }, [])

  async function markStandingOrderCheckDone() {
    const thisMonth = new Date().toISOString().slice(0, 7) // 'YYYY-MM'
    await supabase.from('settings').upsert({ key: 'standing_order_check_last_done', value: thisMonth }, { onConflict: 'key' })
    setStandingOrderCheckMonth(thisMonth)
  }

  async function saveAdhocKeywords(next) {
    setAdhocKeywords(next)
    await supabase.from('settings').upsert({ key: 'standing_order_adhoc_keywords', value: next }, { onConflict: 'key' })
  }
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
  // Some senders' emails include their own raw delivery headers
  // (Return-Path, Received, DKIM-Signature etc.) as if they were part
  // of the message body -- either a bug on the sending side, or (as
  // seen with a long DKIM signature) headers that fold across many
  // physical lines, which broke an earlier, simpler per-line check.
  // RFC822 headers reliably end at the first truly blank line no
  // matter how many lines they span, so that's the boundary used here
  // -- checking for several recognisable header field names before it
  // (rather than validating every line) means folded/wrapped headers
  // no longer trip this up.
  function stripLeadingRawHeaders(body) {
    if (!body) return body
    const blankLineIdx = body.search(/\r?\n\s*\r?\n/)
    if (blankLineIdx === -1) return body
    const headerChunk = body.slice(0, blankLineIdx)
    const knownHeaders = ['Return-Path:', 'Delivered-To:', 'Received:', 'DKIM-Signature:', 'Message-Id:', 'Message-ID:', 'X-Mailer:', 'Content-Type:', 'Content-Transfer-Encoding:', 'MIME-Version:', 'Envelope-to:', 'Envelope-from:', 'X-PHP-Script:', 'X-Spam-Status:', 'X-Spam-Score:']
    const matches = knownHeaders.filter(h => headerChunk.includes(h)).length
    if (matches < 3) return body
    const stripped = body.slice(blankLineIdx).replace(/^(\r?\n\s*)+/, '')
    return stripped.trim() ? stripped : "(This message's content couldn't be separated from its headers -- the raw text has been hidden rather than shown as-is.)"
  }

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
        const listEntry = inboxMessages.find(m => m.uid === uid)
        setOpenMessage({ ...result.message, body: stripLeadingRawHeaders(result.message.body), flagged: listEntry?.flagged || false })
      }
    } catch (e) {
      setOpenMessageError(e.message)
    }
    setOpenMessageLoading(false)
  }

  // Next/previous just move through the same ordered list already
  // showing on screen -- no need to re-fetch the whole inbox.
  function goToAdjacentMessage(direction) {
    if (!openMessage?.uid || inboxMessages.length === 0) return
    const idx = inboxMessages.findIndex(m => m.uid === openMessage.uid)
    if (idx === -1) return
    const nextIdx = idx + direction
    if (nextIdx < 0 || nextIdx >= inboxMessages.length) return
    setReplyDraft(null)
    openInboxMessage(inboxMessages[nextIdx].uid)
  }

  async function toggleStarOpenMessage() {
    if (!openMessage?.uid) return
    const newStarred = !openMessage.flagged
    setOpenMessage(prev => ({ ...prev, flagged: newStarred })) // optimistic
    setInboxMessages(prev => prev.map(m => m.uid === openMessage.uid ? { ...m, flagged: newStarred } : m))
    const { data: sessionData } = await supabase.auth.getSession()
    const accessToken = sessionData?.session?.access_token
    const res = await fetch('/.netlify/functions/star-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ uid: openMessage.uid, starred: newStarred }),
    })
    if (!res.ok) {
      // revert on failure
      setOpenMessage(prev => ({ ...prev, flagged: !newStarred }))
      setInboxMessages(prev => prev.map(m => m.uid === openMessage.uid ? { ...m, flagged: !newStarred } : m))
    }
  }

  // Deletes the message from the actual mailbox via IMAP (not just
  // hiding it in this view) -- the delete-email function already
  // existed but was never wired up to anything in the UI.
  async function deleteOpenMessage() {
    if (!openMessage?.uid) return
    if (!confirm('Delete this email? This removes it from the mailbox permanently.')) return
    const { data: sessionData } = await supabase.auth.getSession()
    const accessToken = sessionData?.session?.access_token
    const res = await fetch('/.netlify/functions/delete-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ uid: openMessage.uid }),
    })
    const result = await res.json()
    if (!res.ok || result.error) { alert('Error deleting: ' + (result.error || res.statusText)); return }
    setInboxMessages(prev => prev.filter(m => m.uid !== openMessage.uid))
    setOpenMessage(null)
  }

  // A UK phone number found anywhere in the message body, so a
  // Text/Call button can appear without needing a structured "phone"
  // field on the email itself. Matches mobiles (07...) and landlines
  // (01/02/03...) alike -- both start with 0 (or +44) followed by 9-10
  // more digits, with optional spaces/dashes between groups (e.g.
  // "01332 123456", "0116-496 0123", "+44 7856 513738"). Text
  // messages/calls don't really apply to a landline, but the button
  // still shows for click-to-call convenience.
  function extractPhoneNumber(text) {
    if (!text) return null
    const match = text.match(/(?:\+44\s?|0)(?:\d[\s-]?){9,10}/)
    return match ? match[0].replace(/[\s-]/g, '') : null
  }

  // Adds (or updates) this sender as an Enquiries entry marked
  // "Contacted" -- a manual equivalent to the automatic add-on-inbox-
  // load, for explicitly logging that this exact email was dealt with.
  async function markMessageContacted() {
    if (!openMessage?.from) return
    const { data: existing } = await supabase.from('enquiries').select('id').ilike('contact_email', openMessage.from).maybeSingle()
    if (existing) {
      await supabase.from('enquiries').update({ status: 'contacted', updated_at: new Date().toISOString() }).eq('id', existing.id)
    } else {
      await supabase.from('enquiries').insert({
        name: openMessage.fromName || openMessage.from.split('@')[0],
        contact_email: openMessage.from,
        contact_method: 'email',
        enquiry_date: openMessage.date ? new Date(openMessage.date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
        notes: openMessage.subject ? `From email: "${openMessage.subject}"` : 'From email',
        status: 'contacted',
      })
    }
    if (enquiriesLoaded) loadEnquiries()
    alert('Added to Enquiries, marked as Contacted')
  }

  async function sendReply() {
    if (!replyDraft) return
    setReplySending(true)
    const ok = await sendRealEmail(replyDraft.to, replyDraft.subject, replyDraft.body)
    setReplySending(false)
    if (ok) {
      alert(`✓ Reply sent to ${replyDraft.to}`)
      await markEnquiryContactedByEmail(replyDraft.to)
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

  async function sendRealEmail(to, subject, text, silent = false) {
    if (!to) { if (!silent) alert('No email address on file for this person.'); return false }
    if (!text || !text.trim()) { if (!silent) alert('This message is empty — add some text to the template first.'); return false }
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const accessToken = sessionData?.session?.access_token
      const res = await fetch('/.netlify/functions/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ to, subject, text }),
      })
      const result = await res.json()
      if (!res.ok || result.error) { if (!silent) alert('Could not send email: ' + (result.error || res.statusText)); return false }
      return true
    } catch (e) {
      if (!silent) alert('Could not send email: ' + e.message)
      return false
    }
  }


  async function sharePaymentReminder(studentName, encodedMsgBody) {
    await shareText(decodeURIComponent(encodedMsgBody))
  }


  async function loadData() {
    setLoading(true)
    const [{ data: s }, { data: pl }, { data: notes }] = await Promise.all([
      supabase.from('students').select('id, student_ref, discipline, class_schedule, sponsored, guardian_name, pka_belt, krba_level, house_name, media_restriction, is_kr, is_pts, is_leader, is_coach, member_id, members(first_name, last_name, status, email, phone, date_of_birth, do_not_contact, houses(name))'),
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

  async function markAsStopped() {
    if (!confirmStopFor) return
    setStoppingInProgress(true)
    const { error } = await supabase.from('members').update({ status: 'stopped' }).eq('id', confirmStopFor.memberId)
    setStoppingInProgress(false)
    if (error) { alert('Error updating status: ' + error.message); return }
    // Remove them from the Missed Training list immediately -- they're
    // no longer "missing", they've actually stopped, which is a
    // different tab (Stopped training) entirely now.
    setMissedTraining(prev => prev.filter(r => r.student.id !== confirmStopFor.studentId))
    setConfirmStopFor(null)
    setStoppedLoaded(false) // force a fresh load next time that tab is opened, so this student shows up there
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
  // Daily enquiry-count bar chart, respecting the method filter --
  // last 30 days, matching the app's existing hand-rolled SVG chart
  // style rather than pulling in a charting library.
  function EnquiriesDailyChart({ enquiries, methodFilter }) {
    const days = Array.from({ length: 30 }, (_, i) => {
      const d = new Date(); d.setDate(d.getDate() - (29 - i)); return d.toISOString().split('T')[0]
    })
    const filtered = methodFilter === 'all' ? enquiries : enquiries.filter(e => e.contact_method === methodFilter)
    const counts = days.map(day => filtered.filter(e => e.enquiry_date === day).length)
    const maxCount = Math.max(1, ...counts)
    const w = 600, h = 140, pad = { t: 10, r: 10, b: 24, l: 24 }
    const iw = w - pad.l - pad.r, ih = h - pad.t - pad.b
    const barW = iw / days.length
    return (
      <div className="hscroll-area" style={{ overflowX: 'auto', marginBottom: 16 }}>
        <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', minWidth: 320, height: 'auto' }}>
          {[0, 0.5, 1].map((t, i) => {
            const yv = pad.t + ih * (1 - t)
            return <g key={i}>
              <line x1={pad.l} x2={pad.l + iw} y1={yv} y2={yv} stroke="var(--border)" strokeWidth="0.5" />
              <text x={pad.l - 4} y={yv + 3} textAnchor="end" fontSize="8" fill="var(--text-tertiary)">{Math.round(maxCount * t)}</text>
            </g>
          })}
          {days.map((day, i) => {
            const barH = (counts[i] / maxCount) * ih
            return (
              <g key={day}>
                <rect x={pad.l + i * barW + 1} y={pad.t + ih - barH} width={Math.max(1, barW - 2)} height={barH} fill="#378ADD" rx="1" />
                {i % 5 === 0 && (
                  <text x={pad.l + i * barW + barW / 2} y={h - 6} textAnchor="middle" fontSize="7" fill="var(--text-tertiary)">
                    {new Date(day + 'T12:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                  </text>
                )}
              </g>
            )
          })}
        </svg>
      </div>
    )
  }

  // How actual members said they found the club, straight from the
  // join forms' own "How did you hear about us?" question -- this
  // covers everyone who joined, not just people who went through a
  // manually-logged call/text/email enquiry first (e.g. someone who
  // just walked in and filled the form on the spot).
  // Raw hear_about values are messier than the clean list of options
  // the join form offers -- variants like "Facebook Ads", "Facebook",
  // even garbled ones with stray spaces or ligature characters split
  // into the text ("F acebook", "Sear ch", "Leaﬂet") all needed
  // folding into the same category, or the breakdown fragments into
  // near-duplicate rows for what's really the same answer.
  function normalizeHearAboutSource(raw) {
    if (!raw || !raw.trim()) return 'Not recorded'
    const clean = raw.toLowerCase().replace(/ﬂ/g, 'fl').replace(/\s+/g, '')
    if (clean.includes('facebook') || clean.includes('instagram') || clean.includes('socialmedia')) return 'Social Media'
    if (clean.includes('wordofmouth') || clean === 'word') return 'Word of Mouth'
    if (clean.includes('search') || clean.includes('google')) return 'Search Engine (Google etc)'
    if (clean.includes('leaflet') || clean.includes('poster')) return 'Leaflet/Poster'
    if (clean.includes('walked')) return 'Walked Past'
    if (clean === 'other') return 'Other'
    return raw.trim() // anything genuinely unrecognised shows as-is, rather than being silently hidden
  }

  function loadLeadSources() {
    supabase.from('membership_forms').select('hear_about').then(({ data }) => {
      const counts = {}
      for (const row of data || []) {
        const key = normalizeHearAboutSource(row.hear_about)
        counts[key] = (counts[key] || 0) + 1
      }
      const sorted = Object.entries(counts).map(([source, count]) => ({ source, count })).sort((a, b) => b.count - a.count)
      setLeadSources(sorted)
      setLeadSourcesLoaded(true)
    })
  }

  // Moved here from Trackers -- same underlying data/logic, just
  // living alongside the other Enquiries-tab charts now instead.
  function loadJoinsVsStops() {
    supabase.from('members').select('id, first_name, last_name, joined_date, status, stopped_at').then(({ data }) => {
      setJoinsStopsMembers(data || [])
      setJoinsStopsLoaded(true)
    })
  }

  function loadTrainedPerDay() {
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 30)
    supabase.from('attendance').select('student_id, session_date').gte('session_date', cutoff.toISOString().split('T')[0]).then(({ data }) => {
      const byDay = {}
      for (const row of data || []) {
        if (!row.session_date) continue
        byDay[row.session_date] = byDay[row.session_date] || new Set()
        byDay[row.session_date].add(row.student_id)
      }
      setTrainedPerDay(Object.entries(byDay).map(([date, students]) => ({ date, count: students.size })))
      setTrainedPerDayLoaded(true)
    })
  }

  function JoinsVsStopsChart({ allMembers }) {
    const timelineMap = {}
    allMembers.forEach(m => {
      if (m.joined_date) {
        const key = m.joined_date
        timelineMap[key] = timelineMap[key] || { date: key, joined: 0, stopped: 0 }
        timelineMap[key].joined++
      }
      if (m.stopped_at) {
        const key = m.stopped_at.split('T')[0]
        timelineMap[key] = timelineMap[key] || { date: key, joined: 0, stopped: 0 }
        timelineMap[key].stopped++
      }
    })
    const timeline = Object.values(timelineMap).sort((a, b) => b.date.localeCompare(a.date))

    const monthMap = {}
    timeline.forEach(t => {
      const monthKey = t.date.slice(0, 7)
      monthMap[monthKey] = monthMap[monthKey] || { month: monthKey, joined: 0, stopped: 0 }
      monthMap[monthKey].joined += t.joined
      monthMap[monthKey].stopped += t.stopped
    })
    const months = Object.values(monthMap).sort((a, b) => a.month.localeCompare(b.month)).slice(-12)
    const maxMonthCount = Math.max(1, ...months.map(m => Math.max(m.joined, m.stopped)))

    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 130, borderBottom: '1px solid var(--border)', paddingBottom: 4, overflowX: 'auto' }}>
          {months.map(m => (
            <div key={m.month} style={{ flex: 1, minWidth: 32, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 100 }}>
                <div title={`${m.joined} joined`} style={{ width: 10, minHeight: m.joined ? 3 : 0, height: `${(m.joined / maxMonthCount) * 90}px`, background: '#1D9E75', borderRadius: '2px 2px 0 0' }} />
                <div title={`${m.stopped} stopped`} style={{ width: 10, minHeight: m.stopped ? 3 : 0, height: `${(m.stopped / maxMonthCount) * 90}px`, background: '#E24B4A', borderRadius: '2px 2px 0 0' }} />
              </div>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
          {months.map(m => (
            <div key={m.month} style={{ flex: 1, minWidth: 32, textAlign: 'center', fontSize: 9, color: 'var(--text-secondary)' }}>
              {new Date(m.month + '-02').toLocaleDateString(undefined, { month: 'short' })}
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 16, marginTop: 10, fontSize: 11, color: 'var(--text-secondary)' }}>
          <span><span style={{ display: 'inline-block', width: 8, height: 8, background: '#1D9E75', borderRadius: 2, marginRight: 4 }} />Joined</span>
          <span><span style={{ display: 'inline-block', width: 8, height: 8, background: '#E24B4A', borderRadius: 2, marginRight: 4 }} />Stopped</span>
        </div>

        <div style={{ marginTop: 16, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: 'var(--text-secondary)' }}>By date</div>
          <div style={{ maxHeight: 220, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {timeline.length === 0 ? (
              <p style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>No join/stop data yet.</p>
            ) : timeline.map(t => (
              <div key={t.date} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '4px 0' }}>
                <span>{new Date(t.date).toLocaleDateString('en-GB')}</span>
                <span style={{ display: 'flex', gap: 10 }}>
                  {t.joined > 0 && <span style={{ color: '#1D9E75' }}>{t.joined} joined</span>}
                  {t.stopped > 0 && <span style={{ color: '#E24B4A' }}>{t.stopped} stopped</span>}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  function LeadSourcesChart({ sources }) {
    const total = sources.reduce((sum, s) => sum + s.count, 0)
    const maxCount = Math.max(1, ...sources.map(s => s.count))
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {sources.map(s => (
          <div key={s.source}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 2 }}>
              <span>{s.source}</span>
              <span style={{ color: 'var(--text-tertiary)' }}>{s.count} ({total ? Math.round(s.count / total * 100) : 0}%)</span>
            </div>
            <div style={{ height: 8, background: 'var(--bg-secondary)', borderRadius: 4, overflow: 'hidden' }}>
              <div style={{ width: `${(s.count / maxCount) * 100}%`, height: '100%', background: '#378ADD', borderRadius: 4 }} />
            </div>
          </div>
        ))}
        {sources.length === 0 && <p style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>No join forms recorded yet.</p>}
      </div>
    )
  }

  // One combined analytics card with a category selector, rather than
  // three separate stacked cards -- "All" shows a compact version of
  // everything at once, and picking a specific category shows that
  // one full-size with its own controls (e.g. the method filter chips
  // only make sense for the Enquiries view specifically).
  // Enquiries, Joins, Stops, and Students Trained all plotted on ONE
  // shared daily chart, each independently toggleable -- "All" shows
  // everything at once, deselecting a series hides just that one, so
  // you can view any single metric or any combination. All four use
  // the same last-30-days window so they genuinely line up on one
  // x-axis (Joins vs Stops previously used a 12-month view, which
  // can't overlay with the other two daily metrics, so it's been
  // recomputed daily here to match).
  //
  // "Where they came from" stays a completely separate card below --
  // it's a percentage breakdown by category, not a time series, so it
  // was never going to sensibly overlay with the others.
  function CombinedDailyChart({ enquiries, joinsStopsMembers, trainedPerDay }) {
    const SERIES = [
      { key: 'enquiries', label: 'Enquiries', colour: '#378ADD' },
      { key: 'joined', label: 'Joined', colour: '#1D9E75' },
      { key: 'stopped', label: 'Stopped', colour: '#E24B4A' },
      { key: 'trained', label: 'Students trained', colour: '#EF9F27' },
    ]
    const [visible, setVisible] = useState(() => new Set(SERIES.map(s => s.key)))

    function toggleSeries(key) {
      setVisible(prev => {
        const next = new Set(prev)
        next.has(key) ? next.delete(key) : next.add(key)
        return next
      })
    }

    const days = Array.from({ length: 30 }, (_, i) => {
      const d = new Date(); d.setDate(d.getDate() - (29 - i)); return d.toISOString().split('T')[0]
    })
    const trainedByDay = Object.fromEntries(trainedPerDay.map(t => [t.date, t.count]))
    const data = days.map(day => ({
      date: day,
      enquiries: enquiries.filter(e => e.enquiry_date === day).length,
      joined: joinsStopsMembers.filter(m => m.joined_date === day).length,
      stopped: joinsStopsMembers.filter(m => m.stopped_at?.split('T')[0] === day).length,
      trained: trainedByDay[day] || 0,
    }))
    const activeSeries = SERIES.filter(s => visible.has(s.key))
    const maxVal = Math.max(1, ...data.flatMap(d => activeSeries.map(s => d[s.key])))

    const w = 700, h = 180, pad = { t: 10, r: 10, b: 24, l: 28 }
    const iw = w - pad.l - pad.r, ih = h - pad.t - pad.b
    const groupW = iw / days.length
    const barW = activeSeries.length ? Math.max(1, (groupW - 2) / activeSeries.length) : 0

    return (
      <div className="card" style={{ padding: 14, marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Enquiries, Joins/Stops & Training — last 30 days</div>
        <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
          <button onClick={() => setVisible(new Set(SERIES.map(s => s.key)))}
            style={{ padding: '4px 12px', borderRadius: 20, fontSize: 12, cursor: 'pointer', fontFamily: 'var(--font-sans)',
              border: '1px solid var(--border)', background: visible.size === SERIES.length ? '#37373718' : 'transparent',
              color: 'var(--text-secondary)', fontWeight: visible.size === SERIES.length ? 600 : 400 }}>
            All
          </button>
          {SERIES.map(s => (
            <button key={s.key} onClick={() => toggleSeries(s.key)}
              style={{ padding: '4px 12px', borderRadius: 20, fontSize: 12, cursor: 'pointer', fontFamily: 'var(--font-sans)',
                border: `1px solid ${visible.has(s.key) ? s.colour : 'var(--border)'}`,
                background: visible.has(s.key) ? s.colour + '18' : 'transparent',
                color: visible.has(s.key) ? s.colour : 'var(--text-tertiary)', fontWeight: visible.has(s.key) ? 600 : 400 }}>
              {s.label}
            </button>
          ))}
        </div>

        {activeSeries.length === 0 ? (
          <p style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Select at least one to display.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', minWidth: 500, height: 'auto' }}>
              {[0, 0.5, 1].map((t, i) => {
                const yv = pad.t + ih * (1 - t)
                return <g key={i}>
                  <line x1={pad.l} x2={pad.l + iw} y1={yv} y2={yv} stroke="var(--border)" strokeWidth="0.5" />
                  <text x={pad.l - 4} y={yv + 3} textAnchor="end" fontSize="8" fill="var(--text-tertiary)">{Math.round(maxVal * t)}</text>
                </g>
              })}
              {data.map((d, i) => (
                <g key={d.date}>
                  {activeSeries.map((s, si) => {
                    const val = d[s.key]
                    const barH = (val / maxVal) * ih
                    return (
                      <rect key={s.key} x={pad.l + i * groupW + si * barW + 1} y={pad.t + ih - barH}
                        width={Math.max(1, barW - 1)} height={barH} fill={s.colour} rx="1">
                        <title>{`${s.label}: ${val} on ${d.date}`}</title>
                      </rect>
                    )
                  })}
                  {i % 5 === 0 && (
                    <text x={pad.l + i * groupW + groupW / 2} y={h - 6} textAnchor="middle" fontSize="7" fill="var(--text-tertiary)">
                      {new Date(d.date + 'T12:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                    </text>
                  )}
                </g>
              ))}
            </svg>
          </div>
        )}
      </div>
    )
  }

  // Generic export used by every tab -- takes rows already shaped as
  // flat objects (matching what's actually shown on screen for that
  // tab) and writes them straight to a downloadable .xlsx file.
  function exportToExcel(rows, filename) {
    if (!rows || rows.length === 0) { alert('Nothing to export yet.'); return }
    const sheet = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, sheet, 'Export')
    XLSX.writeFile(wb, `${filename}_${new Date().toISOString().split('T')[0]}.xlsx`)
  }

  function loadEnquiries() {
    supabase.from('enquiries').select('*, members(id, first_name, last_name)').order('enquiry_date', { ascending: false })
      .then(({ data }) => { setEnquiries(data || []); setEnquiriesLoaded(true) })
  }

  async function saveNewEnquiry() {
    setSavingEnquiry(true)
    const { data: { user } } = await supabase.auth.getUser()
    const { error } = await supabase.from('enquiries').insert({
      name: enquiryDraft.name?.trim() || 'Unknown',
      contact_phone: enquiryDraft.contact_phone?.trim() || null,
      contact_email: enquiryDraft.contact_email?.trim() || null,
      contact_method: enquiryDraft.contact_method || 'call',
      enquiry_date: enquiryDraft.enquiry_date || new Date().toISOString().split('T')[0],
      notes: enquiryDraft.notes?.trim() || null,
      status: 'not_started',
      created_by: user?.id || null,
    })
    setSavingEnquiry(false)
    if (error) { alert('Error saving enquiry: ' + error.message); return }
    setShowNewEnquiryForm(false)
    setEnquiryDraft(null)
    loadEnquiries()
  }

  async function saveEditedEnquiry() {
    if (!editingEnquiryId) return
    setSavingEnquiry(true)
    const { error } = await supabase.from('enquiries').update({
      name: enquiryDraft.name?.trim() || 'Unknown',
      contact_phone: enquiryDraft.contact_phone?.trim() || null,
      contact_email: enquiryDraft.contact_email?.trim() || null,
      contact_method: enquiryDraft.contact_method || 'call',
      enquiry_date: enquiryDraft.enquiry_date || new Date().toISOString().split('T')[0],
      notes: enquiryDraft.notes?.trim() || null,
      updated_at: new Date().toISOString(),
    }).eq('id', editingEnquiryId)
    setSavingEnquiry(false)
    if (error) { alert('Error saving changes: ' + error.message); return }
    setEditingEnquiryId(null)
    setEnquiryDraft(null)
    loadEnquiries()
  }

  async function deleteEnquiry(id) {
    if (!confirm('Delete this enquiry? This cannot be undone.')) return
    const { error } = await supabase.from('enquiries').delete().eq('id', id)
    if (error) { alert('Error deleting: ' + error.message); return }
    loadEnquiries()
  }

  async function updateEnquiryStatus(id, status) {
    await supabase.from('enquiries').update({ status, updated_at: new Date().toISOString() }).eq('id', id)
    loadEnquiries()
  }

  // The progress button's stages, in order. Each entry's label is the
  // prompt/action for a card CURRENTLY sitting at that stage -- e.g.
  // a card at 'contacted' shows "Trial booked?" as the next thing to
  // confirm, not the stage's own past-tense name.
  const ENQUIRY_STAGES = [
    { key: 'not_started', label: 'Contact', colour: '#EF9F27' },
    { key: 'contacted', label: 'Trial booked?', colour: '#378ADD' },
    { key: 'trial_booked', label: 'Joined?', colour: '#8B5CF6' },
    { key: 'joined', label: '✓ Joined', colour: '#1D9E75' },
  ]

  function openWelcomeMessagePopup(enq) {
    setEmailingEnquiry(enq)
    setEnquiryEmailDraft({
      subject: 'Welcome to KR Centre!',
      body: `Hi ${enq.name.split(' ')[0]},\n\nWelcome to KR Centre! We're really glad you've joined us.\n\n`,
    })
  }

  // Middle stages (contacted -> trial_booked -> joined) advance
  // straight away with no popup, per the confirmed flow -- only the
  // very first stage (contact) and the final stage (joined) show
  // anything extra.
  function handleProgressClick(enq) {
    if (enq.status === 'not_started') {
      setContactPopupFor(enq)
    } else if (enq.status === 'contacted') {
      updateEnquiryStatus(enq.id, 'trial_booked')
    } else if (enq.status === 'trial_booked') {
      updateEnquiryStatus(enq.id, 'joined')
      openWelcomeMessagePopup(enq)
    } else if (enq.status === 'joined') {
      openWelcomeMessagePopup(enq)
    }
  }

  async function searchMembersToLink(query) {
    setMemberLinkSearch(query)
    if (!query.trim()) { setMemberLinkResults([]); return }
    const { data } = await supabase.from('members').select('id, first_name, last_name, email, phone')
      .or(`first_name.ilike.%${query}%,last_name.ilike.%${query}%`).limit(10)
    setMemberLinkResults(data || [])
  }

  // If the email address being replied/sent to matches an open
  // enquiry (not already joined or marked not-interested), moves it
  // to "Contacted" automatically -- covers both replying to them via
  // the existing inbox AND emailing them directly from the Enquiries
  // tab, since both funnel through here.
  async function markEnquiryContactedByEmail(email) {
    if (!email) return
    await supabase.from('enquiries')
      .update({ status: 'contacted', updated_at: new Date().toISOString() })
      .ilike('contact_email', email)
      .eq('status', 'not_started')
    if (enquiriesLoaded) loadEnquiries()
  }

  async function sendEnquiryEmail() {
    if (!emailingEnquiry || !enquiryEmailDraft?.body?.trim()) return
    setSendingEnquiryEmail(true)
    const ok = await sendRealEmail(emailingEnquiry.contact_email, enquiryEmailDraft.subject, enquiryEmailDraft.body)
    setSendingEnquiryEmail(false)
    if (ok) {
      await markEnquiryContactedByEmail(emailingEnquiry.contact_email)
      setEmailingEnquiry(null)
      setEnquiryEmailDraft(null)
    }
  }

  async function linkEnquiryToMember(enquiryId, memberId) {
    await supabase.from('enquiries').update({ linked_member_id: memberId, status: 'joined', updated_at: new Date().toISOString() }).eq('id', enquiryId)
    setLinkingEnquiryId(null)
    setMemberLinkSearch('')
    setMemberLinkResults([])
    loadEnquiries()
  }

  // Imports a Facebook Lead Ads export (the "download leads" .xls/.csv
  // file Meta's ad manager produces). Each Facebook lead has its own
  // unique id, stored in external_id, so re-uploading the same file
  // (or a file with an overlapping date range) never creates
  // duplicates -- already-imported leads are just skipped.
  async function importFacebookLeadsFile(file) {
    setImportingFacebookLeads(true)
    setFacebookImportResult(null)
    try {
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array', cellDates: true })
      const sheet = wb.Sheets[wb.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' })

      if (rows.length === 0) { setFacebookImportResult({ error: 'No rows found in that file.' }); return }

      const externalIds = rows.map(r => String(r.id || '')).filter(Boolean)
      const { data: existing } = await supabase.from('enquiries').select('external_id').in('external_id', externalIds)
      const existingIds = new Set((existing || []).map(e => e.external_id))

      const toInsert = rows
        .filter(r => r.id && !existingIds.has(String(r.id)))
        .map(r => {
          const created = r.created_time instanceof Date ? r.created_time : new Date(r.created_time)
          const dateStr = isNaN(created) ? new Date().toISOString().split('T')[0] : created.toISOString().split('T')[0]
          const notesParts = []
          if (r.campaign_name) notesParts.push(`Campaign: ${r.campaign_name}`)
          if (r.ad_name) notesParts.push(`Ad: ${r.ad_name}`)
          if (r.platform) notesParts.push(`Platform: ${r.platform === 'ig' ? 'Instagram' : r.platform === 'fb' ? 'Facebook' : r.platform}`)
          return {
            name: r['full name'] || r.full_name || 'Unknown',
            contact_phone: r.phone_number || null,
            contact_email: r.email || null,
            contact_method: 'facebook_ad',
            enquiry_date: dateStr,
            notes: notesParts.join(' · ') || null,
            status: 'not_started',
            external_id: String(r.id),
          }
        })

      if (toInsert.length === 0) {
        setFacebookImportResult({ added: 0, skipped: rows.length })
        return
      }
      const { error } = await supabase.from('enquiries').insert(toInsert)
      if (error) { setFacebookImportResult({ error: error.message }); return }
      setFacebookImportResult({ added: toInsert.length, skipped: rows.length - toInsert.length })
      loadEnquiries()
    } catch (err) {
      setFacebookImportResult({ error: 'Could not read that file: ' + err.message })
    } finally {
      setImportingFacebookLeads(false)
    }
  }

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

  // BUG FIX: this used to return early with ONLY the manually-linked
  // students the moment any manual link existed for a payer name --
  // which meant an already-correct AUTOMATIC match for one sibling
  // would silently disappear (bounced back to "unpaid") the instant a
  // second sibling got manually linked to the same payment. A manual
  // link should always ADD to the matched set, never replace it.
  function matchStudentIdsForPayment(payment) {
    const n = normalizeName(payment.name)
    const manualIds = linksByPayerName[n] || []
    const excluded = excludedByPayerName[n]
    const dropExcluded = list => excluded ? list.filter(s => !excluded.has(s.id)) : list

    let autoIds = []
    if (studentByNormalizedName[n]) {
      const sid = studentByNormalizedName[n]
      autoIds = excluded?.has(sid) ? [] : [sid]
    } else {
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
      if (nameCandidates.length >= 1) {
        autoIds = nameCandidates.map(s => s.id)
      } else {
        const surnameCandidates = []
        for (const w of paymentWordSet) {
          if (w.length >= 3 && lastNameCounts[w] === 1) {
            surnameCandidates.push(...students.filter(s => normalizeName(s.members?.last_name) === w))
          }
        }
        const filteredSurname = dropExcluded(surnameCandidates)
        if (filteredSurname.length === 1) {
          autoIds = [filteredSurname[0].id]
        } else {
          const firstNameCandidates = []
          for (const w of paymentWordSet) {
            if (w.length >= 4 && firstNameCounts[w] === 1) {
              firstNameCandidates.push(...students.filter(s => normalizeName(s.members?.first_name) === w))
            }
          }
          const filteredFirst = dropExcluded(firstNameCandidates)
          if (filteredFirst.length === 1) autoIds = [filteredFirst[0].id]
        }
      }
    }

    // Union, not replace -- a manual link for one sibling never hides
    // an already-correct automatic match for another sibling on the
    // same payment. Deduplicated in case the same student is somehow
    // in both (e.g. manually confirming what was already auto-matched).
    return [...new Set([...manualIds, ...autoIds])]
  }

  // Map of studentId -> the payment(s) that matched them, so the
  // Paid students card can show what payment they're linked to.
  // Each entry keeps the payment's index in the master `payments`
  // array (not a filtered-list index) so a payment can be selected
  // for linking whether it's showing up as unmatched OR already
  // matched to someone else -- this is what makes it possible to
  // link ONE payment to MULTIPLE students (e.g. a parent paying for
  // several siblings in one standing order).
  // Payments containing a configured ad-hoc keyword (e.g. "Level Up"
  // sessions, equipment purchases) are pulled out here entirely --
  // shown separately for visibility, but never matched to a student or
  // counted toward their standing order being paid.
  function isAdhocPayment(name) {
    const lower = (name || '').toLowerCase()
    return adhocKeywords.some(kw => kw.trim() && lower.includes(kw.trim().toLowerCase()))
  }

  const paymentsByStudentId = {}
  const unmatchedPayments = []
  const adhocPayments = []
  payments.forEach((p, idx) => {
    if (isAdhocPayment(p.name)) { adhocPayments.push({ payment: p, idx }); return }
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

      {(() => {
        const thisMonth = new Date().toISOString().slice(0, 7)
        const standingOrderDue = standingOrderCheckMonth !== null && standingOrderCheckMonth !== thisMonth
        const standingOrderNeverChecked = standingOrderCheckMonth === null
        const birthdaysToday = birthdays.filter(b => b.daysUntil === 0)
        const birthdaysThisWeek = birthdays.filter(b => b.daysUntil > 0 && b.daysUntil <= 7)
        const hasAnyReminder = standingOrderDue || standingOrderNeverChecked || missedTraining.length > 0 || birthdaysToday.length > 0 || birthdaysThisWeek.length > 0
        if (!hasAnyReminder) return null
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
            {(standingOrderDue || standingOrderNeverChecked) && (
              <div className="card" style={{ padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, background: '#EF9F2718' }}>
                <span style={{ fontSize: 13 }}>📋 Standing order check {standingOrderNeverChecked ? 'has never been marked done' : `hasn't been done for ${new Date().toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })} yet`}</span>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn btn-sm" onClick={() => setTab('standing_orders')}>View</button>
                  <button className="btn btn-sm btn-primary" onClick={markStandingOrderCheckDone}>✓ Mark done for this month</button>
                </div>
              </div>
            )}
            {missedTraining.length > 0 && (
              <div className="card" style={{ padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, background: '#E24B4A18' }}>
                <span style={{ fontSize: 13 }}>⚠️ {missedTraining.length} student{missedTraining.length === 1 ? ' has' : 's have'} missed training</span>
                <button className="btn btn-sm" onClick={() => setTab('missed_training')}>View list → contact</button>
              </div>
            )}
            {birthdaysToday.length > 0 && (
              <div className="card" style={{ padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, background: '#378ADD18' }}>
                <span style={{ fontSize: 13 }}>🎂 It's {birthdaysToday.map(b => `${b.student.members?.first_name}`).join(', ')}'s birthday today!</span>
                <button className="btn btn-sm" onClick={() => setTab('birthdays')}>View</button>
              </div>
            )}
            {birthdaysThisWeek.length > 0 && (
              <div className="card" style={{ padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, background: '#378ADD18' }}>
                <span style={{ fontSize: 13 }}>🎂 {birthdaysThisWeek.map(b => `${b.student.members?.first_name}`).join(', ')} — birthday this week</span>
                <button className="btn btn-sm" onClick={() => setTab('birthdays')}>View</button>
              </div>
            )}
          </div>
        )
      })()}

      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border)', marginBottom: 20, overflowX: 'auto', WebkitOverflowScrolling: 'touch', flexWrap: 'nowrap' }}>
        <button onClick={() => setTab('standing_orders')} style={{
          padding: '8px 16px', fontSize: 13, border: 'none', background: 'none', cursor: 'pointer', flexShrink: 0,
          borderBottom: `2px solid ${tab === 'standing_orders' ? 'var(--text)' : 'transparent'}`,
          color: tab === 'standing_orders' ? 'var(--text)' : 'var(--text-secondary)',
          fontWeight: tab === 'standing_orders' ? 500 : 400,
        }}>Standing orders</button>
        <button onClick={() => { setTab('missed_training'); if (!missedTrainingLoaded) loadMissedTraining() }} style={{
          padding: '8px 16px', fontSize: 13, border: 'none', background: 'none', cursor: 'pointer', flexShrink: 0,
          borderBottom: `2px solid ${tab === 'missed_training' ? 'var(--text)' : 'transparent'}`,
          color: tab === 'missed_training' ? 'var(--text)' : 'var(--text-secondary)',
          fontWeight: tab === 'missed_training' ? 500 : 400,
        }}>Missed training{missedTraining.length > 0 ? ` (${missedTraining.length})` : ''}</button>
        <button onClick={() => { setTab('stopped_training'); if (!stoppedLoaded) loadStoppedStudents() }} style={{
          padding: '8px 16px', fontSize: 13, border: 'none', background: 'none', cursor: 'pointer', flexShrink: 0,
          borderBottom: `2px solid ${tab === 'stopped_training' ? 'var(--text)' : 'transparent'}`,
          color: tab === 'stopped_training' ? 'var(--text)' : 'var(--text-secondary)',
          fontWeight: tab === 'stopped_training' ? 500 : 400,
        }}>Stopped training{stoppedStudents.length > 0 ? ` (${stoppedStudents.length})` : ''}</button>
        <button onClick={() => { setTab('grading_requests'); if (!gradingLoaded) loadGradingRequests() }} style={{
          padding: '8px 16px', fontSize: 13, border: 'none', background: 'none', cursor: 'pointer', flexShrink: 0,
          borderBottom: `2px solid ${tab === 'grading_requests' ? 'var(--text)' : 'transparent'}`,
          color: tab === 'grading_requests' ? 'var(--text)' : 'var(--text-secondary)',
          fontWeight: tab === 'grading_requests' ? 500 : 400,
        }}>Grading requests{gradingRequests.filter(r => !r.coach_approved).length > 0 ? ` (${gradingRequests.filter(r => !r.coach_approved).length})` : ''}</button>
        <button onClick={() => { setTab('birthdays'); if (!birthdaysLoaded) loadBirthdays() }} style={{
          padding: '8px 16px', fontSize: 13, border: 'none', background: 'none', cursor: 'pointer', flexShrink: 0,
          borderBottom: `2px solid ${tab === 'birthdays' ? 'var(--text)' : 'transparent'}`,
          color: tab === 'birthdays' ? 'var(--text)' : 'var(--text-secondary)',
          fontWeight: tab === 'birthdays' ? 500 : 400,
        }}>Birthdays{birthdays.length > 0 ? ` (${birthdays.length})` : ''}</button>
        <button onClick={() => { setTab('enquiries'); if (!enquiriesLoaded) loadEnquiries() }} style={{
          padding: '8px 16px', fontSize: 13, border: 'none', background: 'none', cursor: 'pointer', flexShrink: 0,
          borderBottom: `2px solid ${tab === 'enquiries' ? 'var(--text)' : 'transparent'}`,
          color: tab === 'enquiries' ? 'var(--text)' : 'var(--text-secondary)',
          fontWeight: tab === 'enquiries' ? 500 : 400,
        }}>Enquiries</button>
        <button onClick={() => { setTab('trackers'); if (!enquiriesLoaded) loadEnquiries(); if (!leadSourcesLoaded) loadLeadSources(); if (!joinsStopsLoaded) loadJoinsVsStops(); if (!trainedPerDayLoaded) loadTrainedPerDay() }} style={{
          padding: '8px 16px', fontSize: 13, border: 'none', background: 'none', cursor: 'pointer', flexShrink: 0,
          borderBottom: `2px solid ${tab === 'trackers' ? 'var(--text)' : 'transparent'}`,
          color: tab === 'trackers' ? 'var(--text)' : 'var(--text-secondary)',
          fontWeight: tab === 'trackers' ? 500 : 400,
        }}>Trackers</button>
        <button onClick={() => setTab('messages')} style={{
          padding: '8px 16px', fontSize: 13, border: 'none', background: 'none', cursor: 'pointer', flexShrink: 0,
          borderBottom: `2px solid ${tab === 'messages' ? 'var(--text)' : 'transparent'}`,
          color: tab === 'messages' ? 'var(--text)' : 'var(--text-secondary)',
          fontWeight: tab === 'messages' ? 500 : 400,
        }}>Messages</button>
        <button onClick={() => { setTab('email'); if (!inboxLoaded) loadInbox() }} style={{
          padding: '8px 16px', fontSize: 13, border: 'none', background: 'none', cursor: 'pointer', flexShrink: 0,
          borderBottom: `2px solid ${tab === 'email' ? 'var(--text)' : 'transparent'}`,
          color: tab === 'email' ? 'var(--text)' : 'var(--text-secondary)',
          fontWeight: tab === 'email' ? 500 : 400,
        }}>Email</button>
        <button onClick={() => { setTab('courses'); if (!coursesLoaded) loadCourses() }} style={{
          padding: '8px 16px', fontSize: 13, border: 'none', background: 'none', cursor: 'pointer', flexShrink: 0,
          borderBottom: `2px solid ${tab === 'courses' ? 'var(--text)' : 'transparent'}`,
          color: tab === 'courses' ? 'var(--text)' : 'var(--text-secondary)',
          fontWeight: tab === 'courses' ? 500 : 400,
        }}>Notices{courses.length > 0 ? ` (${courses.length})` : ''}</button>
      </div>

      {tab === 'enquiries' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <select value={enquiryStatusFilter} onChange={e => setEnquiryStatusFilter(e.target.value)} style={{ fontSize: 13 }}>
              <option value="all">All statuses</option>
              <option value="not_started">Not started</option>
              <option value="contacted">Contacted</option>
              <option value="trial_booked">Trial booked</option>
              <option value="joined">Joined</option>
              <option value="not_interested">Not interested</option>
            </select>
            <button className="btn btn-sm btn-primary" onClick={() => { setShowNewEnquiryForm(true); setEnquiryDraft({ name: '', contact_phone: '', contact_email: '', contact_method: 'call', enquiry_date: new Date().toISOString().split('T')[0], notes: '' }) }}>+ Log new enquiry</button>
            <button className="btn btn-sm" onClick={() => exportToExcel(enquiries.map(e => ({
              Name: e.name, Phone: e.contact_phone || '', Email: e.contact_email || '',
              Method: e.contact_method, Date: e.enquiry_date, Status: e.status, Notes: e.notes || '',
              'Linked member': e.members ? `${e.members.first_name} ${e.members.last_name}` : '',
            })), 'enquiries')}>⬇️ Export</button>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label className="btn btn-sm" style={{ cursor: 'pointer', display: 'inline-flex' }}>
              {importingFacebookLeads ? 'Importing…' : '📥 Import Facebook leads file'}
              <input type="file" accept=".xls,.xlsx,.csv" style={{ display: 'none' }} disabled={importingFacebookLeads}
                onChange={e => { if (e.target.files[0]) importFacebookLeadsFile(e.target.files[0]); e.target.value = '' }} />
            </label>
            {facebookImportResult && (
              <span style={{ fontSize: 12, marginLeft: 10, color: facebookImportResult.error ? '#E24B4A' : 'var(--text-secondary)' }}>
                {facebookImportResult.error || `Added ${facebookImportResult.added} new, skipped ${facebookImportResult.skipped} already imported`}
              </span>
            )}
          </div>

          <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
            {[['all', 'All'], ['call', 'Call'], ['text', 'Text'], ['email', 'Email'], ['facebook_ad', 'Social media']].map(([val, label]) => (
              <button key={val} onClick={() => setEnquiryMethodFilter(val)}
                style={{ padding: '4px 12px', borderRadius: 20, fontSize: 12, cursor: 'pointer', fontFamily: 'var(--font-sans)',
                  border: `1px solid ${enquiryMethodFilter === val ? '#378ADD' : 'var(--border)'}`,
                  background: enquiryMethodFilter === val ? '#378ADD18' : 'transparent',
                  color: enquiryMethodFilter === val ? '#378ADD' : 'var(--text-secondary)', fontWeight: enquiryMethodFilter === val ? 600 : 400 }}>
                {label}
              </button>
            ))}
          </div>
          {(showNewEnquiryForm || editingEnquiryId) && (
            <div className="card" style={{ marginBottom: 16, padding: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 10 }}>{editingEnquiryId ? 'Edit enquiry' : 'New enquiry'}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <input type="text" placeholder="Name (optional)" value={enquiryDraft.name} onChange={e => setEnquiryDraft(d => ({ ...d, name: e.target.value }))} style={{ fontSize: 13 }} />
                <div style={{ display: 'flex', gap: 8 }}>
                  <input type="text" placeholder="Phone" value={enquiryDraft.contact_phone} onChange={e => setEnquiryDraft(d => ({ ...d, contact_phone: e.target.value }))} style={{ fontSize: 13, flex: 1 }} />
                  <input type="email" placeholder="Email" value={enquiryDraft.contact_email} onChange={e => setEnquiryDraft(d => ({ ...d, contact_email: e.target.value }))} style={{ fontSize: 13, flex: 1 }} />
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <select value={enquiryDraft.contact_method} onChange={e => setEnquiryDraft(d => ({ ...d, contact_method: e.target.value }))} style={{ fontSize: 13, flex: 1 }}>
                    <option value="call">Phone call</option>
                    <option value="text">Text message</option>
                    <option value="email">Email</option>
                    <option value="in_person">In person</option>
                    <option value="facebook_ad">Facebook/Instagram ad</option>
                    <option value="other">Other</option>
                  </select>
                  <input type="date" value={enquiryDraft.enquiry_date} onChange={e => setEnquiryDraft(d => ({ ...d, enquiry_date: e.target.value }))} style={{ fontSize: 13, flex: 1 }} />
                </div>
                <textarea placeholder="Notes (what they asked about, any follow-up needed...)" value={enquiryDraft.notes} onChange={e => setEnquiryDraft(d => ({ ...d, notes: e.target.value }))} style={{ fontSize: 13, minHeight: 60 }} />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-sm btn-primary" disabled={savingEnquiry} onClick={editingEnquiryId ? saveEditedEnquiry : saveNewEnquiry}>{savingEnquiry ? 'Saving…' : editingEnquiryId ? 'Save changes' : 'Save enquiry'}</button>
                  <button className="btn btn-sm" onClick={() => { setShowNewEnquiryForm(false); setEditingEnquiryId(null); setEnquiryDraft(null) }}>Cancel</button>
                </div>
              </div>
            </div>
          )}

          {!enquiriesLoaded ? (
            <p style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>Loading…</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {enquiries.filter(e => (enquiryStatusFilter === 'all' || e.status === enquiryStatusFilter) && (enquiryMethodFilter === 'all' || e.contact_method === enquiryMethodFilter)).map(enq => {
                const stageIdx = ENQUIRY_STAGES.findIndex(s => s.key === enq.status)
                const stage = stageIdx >= 0 ? ENQUIRY_STAGES[stageIdx] : ENQUIRY_STAGES[0]
                const borderColour = enq.status === 'not_interested' ? '#9CA3AF' : stage.colour
                return (
                <div key={enq.id} className="card" style={{ padding: 14, borderLeft: `4px solid ${borderColour}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 10, flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      {enq.status === 'not_interested' ? (
                        <>
                          <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Not interested</span>
                          <button className="btn btn-sm" style={{ fontSize: 11 }} onClick={() => updateEnquiryStatus(enq.id, 'not_started')}>↺ Reopen</button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => handleProgressClick(enq)} style={{
                            padding: '5px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-sans)',
                            border: `1px solid ${stage.colour}`, background: stage.colour + '18', color: stage.colour,
                          }}>
                            {stage.label}
                          </button>
                          {enq.status !== 'joined' && (
                            <button className="btn btn-sm" style={{ fontSize: 10, color: 'var(--text-tertiary)' }} onClick={() => updateEnquiryStatus(enq.id, 'not_interested')}>Not interested</button>
                          )}
                        </>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                      <button className="btn btn-sm" onClick={() => { setEditingEnquiryId(enq.id); setShowNewEnquiryForm(false); setEnquiryDraft({ name: enq.name === 'Unknown' ? '' : enq.name, contact_phone: enq.contact_phone || '', contact_email: enq.contact_email || '', contact_method: enq.contact_method, enquiry_date: enq.enquiry_date, notes: enq.notes || '' }) }}>Edit</button>
                      <button className="btn btn-sm" style={{ color: '#E24B4A' }} onClick={() => deleteEnquiry(enq.id)}>Delete</button>
                    </div>
                  </div>
                  <div style={{ textAlign: 'left' }}>
                    <div style={{ fontSize: 14, fontWeight: 500 }}>{enq.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                      {new Date(enq.enquiry_date + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                      {' · '}{{ call: 'Phone call', text: 'Text message', email: 'Email', in_person: 'In person', other: 'Other', facebook_ad: 'Facebook/Instagram ad' }[enq.contact_method]}
                      {enq.contact_phone ? ` · ${enq.contact_phone}` : ''}{enq.contact_email ? ` · ${enq.contact_email}` : ''}
                    </div>
                    {enq.notes && (
                      <div style={{ fontSize: 13, color: 'var(--text)', marginTop: 8, padding: '8px 10px', background: 'var(--bg-secondary)', borderRadius: 6, maxWidth: '85%', textAlign: 'left' }}>
                        {enq.notes}
                      </div>
                    )}
                    {enq.members && (
                      <div style={{ fontSize: 12, color: '#1D9E75', marginTop: 8, fontWeight: 500 }}>
                        ✓ Joined — linked to {enq.members.first_name} {enq.members.last_name}
                      </div>
                    )}
                  </div>
                  {enq.contact_email && (
                    <div style={{ marginTop: 8 }}>
                      <button className="btn btn-sm" onClick={() => { setEmailingEnquiry(enq); setEnquiryEmailDraft({ subject: 'Following up from KR Centre', body: `Hi ${enq.name.split(' ')[0]},\n\n` }) }}>
                        ✉️ Email this lead
                      </button>
                    </div>
                  )}
                  {!enq.linked_member_id && (
                    <div style={{ marginTop: 8 }}>
                      {linkingEnquiryId === enq.id ? (
                        <div>
                          <input type="text" placeholder="Search members by name…" value={memberLinkSearch} onChange={e => searchMembersToLink(e.target.value)} style={{ fontSize: 12, width: '100%', marginBottom: 4 }} />
                          {memberLinkResults.map(m => (
                            <div key={m.id} onClick={() => linkEnquiryToMember(enq.id, m.id)} style={{ fontSize: 12, padding: '4px 6px', cursor: 'pointer', borderRadius: 4 }}
                              onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-secondary)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                              {m.first_name} {m.last_name} {m.email ? `· ${m.email}` : ''}
                            </div>
                          ))}
                          <button className="btn btn-sm" style={{ marginTop: 4 }} onClick={() => { setLinkingEnquiryId(null); setMemberLinkSearch(''); setMemberLinkResults([]) }}>Cancel</button>
                        </div>
                      ) : (
                        <button className="btn btn-sm" onClick={() => setLinkingEnquiryId(enq.id)}>Link to member (once they've joined)</button>
                      )}
                    </div>
                  )}
                </div>
              )})}
              {enquiries.filter(e => (enquiryStatusFilter === 'all' || e.status === enquiryStatusFilter) && (enquiryMethodFilter === 'all' || e.contact_method === enquiryMethodFilter)).length === 0 && (
                <p style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>No enquiries logged yet.</p>
              )}
            </div>
          )}

          {contactPopupFor && (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 16 }}
              onClick={() => setContactPopupFor(null)}>
              <div className="card" style={{ width: '100%', maxWidth: 400 }} onClick={e => e.stopPropagation()}>
                <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>Contact {contactPopupFor.name}</h3>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
                  {contactPopupFor.contact_phone && <a className="btn btn-sm" href={`tel:${contactPopupFor.contact_phone}`}>📞 Call</a>}
                  {contactPopupFor.contact_phone && /^(?:\+447|07)/.test(contactPopupFor.contact_phone) && (
                    <a className="btn btn-sm" href={`sms:${contactPopupFor.contact_phone}`}>💬 Text</a>
                  )}
                  {contactPopupFor.contact_email && (
                    <button className="btn btn-sm" onClick={() => {
                      setEmailingEnquiry(contactPopupFor)
                      setEnquiryEmailDraft({ subject: 'Following up from KR Centre', body: `Hi ${contactPopupFor.name.split(' ')[0]},\n\n` })
                      setContactPopupFor(null)
                    }}>✉️ Email</button>
                  )}
                </div>
                <p style={{ fontSize: 13, marginBottom: 10 }}>Have you contacted them? (in case this happened outside the app, e.g. a personal phone call)</p>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }}
                    onClick={() => { updateEnquiryStatus(contactPopupFor.id, 'contacted'); setContactPopupFor(null) }}>
                    Yes
                  </button>
                  <button className="btn" style={{ flex: 1, justifyContent: 'center' }} onClick={() => setContactPopupFor(null)}>
                    No
                  </button>
                </div>
              </div>
            </div>
          )}

          {emailingEnquiry && (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 16 }}
              onClick={() => { setEmailingEnquiry(null); setEnquiryEmailDraft(null) }}>
              <div className="card" style={{ width: '100%', maxWidth: 480 }} onClick={e => e.stopPropagation()}>
                <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 10 }}>Email {emailingEnquiry.name}</h3>
                <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 10 }}>To: {emailingEnquiry.contact_email}</p>
                <input type="text" value={enquiryEmailDraft.subject} onChange={e => setEnquiryEmailDraft(d => ({ ...d, subject: e.target.value }))}
                  placeholder="Subject" style={{ width: '100%', fontSize: 13, marginBottom: 8 }} />
                <textarea value={enquiryEmailDraft.body} onChange={e => setEnquiryEmailDraft(d => ({ ...d, body: e.target.value }))}
                  rows={8} style={{ width: '100%', fontSize: 14, padding: '10px 12px', marginBottom: 10, resize: 'vertical' }} />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-primary" disabled={sendingEnquiryEmail || !enquiryEmailDraft.body.trim()} onClick={sendEnquiryEmail}>
                    {sendingEnquiryEmail ? 'Sending…' : '✉️ Send'}
                  </button>
                  <button className="btn" onClick={() => { setEmailingEnquiry(null); setEnquiryEmailDraft(null) }}>Cancel</button>
                </div>
                <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 8 }}>Sending this will automatically move their status to "Contacted".</p>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'trackers' && (
        <div>
          {trackersStats && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10, marginBottom: 16 }}>
              {[
                { label: 'Total students', value: trackersStats.totalStudents, colour: '#378ADD', icon: '🎽' },
                { label: 'New members this month', value: trackersStats.newMembersThisMonth, colour: '#E24B4A', icon: '🆕' },
                { label: 'Trained this month', value: trackersStats.trainedThisMonth, colour: '#1D9E75', icon: '💪' },
                { label: 'Avg sessions/student', value: trackersStats.avgSessions, colour: '#EF9F27', icon: '📈' },
                {
                  label: 'Avg length of training', colour: '#8B5CF6', icon: '⏱️',
                  value: trackersStats.avgMonthsTrained !== null ? `${trackersStats.avgMonthsTrained}mo` : '—',
                  caption: `Joined → stopped, based on ${trackersStats.completedDurationsCount} member${trackersStats.completedDurationsCount === 1 ? '' : 's'}`,
                  warning: trackersStats.missingStopDates > 0 ? `⚠️ ${trackersStats.missingStopDates} missing a stop date` : null,
                },
              ].map(s => (
                <div key={s.label} className="card" style={{ textAlign: 'center' }} title={s.warning || undefined}>
                  <div style={{ fontSize: 28, marginBottom: 4 }}>{s.icon}</div>
                  <div style={{ fontSize: 26, fontWeight: 700, color: s.colour }}>{s.value}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>{s.label}</div>
                  {s.caption && <div style={{ fontSize: 9, color: 'var(--text-tertiary)', marginTop: 4 }}>{s.caption}</div>}
                  {s.warning && <div style={{ fontSize: 9, color: '#EF9F27', marginTop: 2 }}>{s.warning}</div>}
                </div>
              ))}
            </div>
          )}
          <CombinedDailyChart
            enquiries={enquiries}
            joinsStopsMembers={joinsStopsMembers}
            trainedPerDay={trainedPerDay}
          />
          <div className="card" style={{ padding: 14, marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Where members actually said they found us</div>
            {!leadSourcesLoaded ? (
              <p style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Loading…</p>
            ) : (
              <LeadSourcesChart sources={leadSources} />
            )}
          </div>
          <Trackers onStatsReady={setTrackersStats} />
        </div>
      )}

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
              <button className="btn btn-sm" style={{ marginLeft: 'auto' }} onClick={() => exportToExcel(students.map(s => ({
                Name: `${s.members?.first_name || ''} ${s.members?.last_name || ''}`.trim(),
                Discipline: s.discipline || '',
                Paid: matchedStudentIds.has(s.id) ? 'Yes' : 'No',
                'Amount matched': (paymentsByStudentId[s.id] || []).reduce((sum, p) => sum + (Number(p.payment.amount) || 0), 0) || '',
              })), 'standing_orders')}>⬇️ Export</button>
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
                {payments.length} payments loaded · {matchedStudentIds.size} matched · {unmatchedPayments.length} unmatched · {adhocPayments.length} ad-hoc (excluded)
                <button className="btn btn-sm" onClick={clearPayments}>✕ Clear</button>
              </p>
            )}
          </div>

          <div className="card" style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>🏷️ Ad-hoc payment keywords</div>
            <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 8 }}>
              Any payment whose description contains one of these words is treated as a one-off (Level Up sessions, equipment, etc.) — shown separately below, never matched to a student or counted as their standing order.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
              {adhocKeywords.map((kw, i) => (
                <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, padding: '3px 8px', borderRadius: 12, background: 'var(--bg-secondary)' }}>
                  {kw}
                  <button onClick={() => saveAdhocKeywords(adhocKeywords.filter((_, j) => j !== i))} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', fontSize: 12, padding: 0 }}>✕</button>
                </span>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <input type="text" value={adhocKeywordDraft} onChange={e => setAdhocKeywordDraft(e.target.value)}
                placeholder="e.g. equipment" style={{ fontSize: 12, flex: 1 }}
                onKeyDown={e => { if (e.key === 'Enter' && adhocKeywordDraft.trim()) { saveAdhocKeywords([...adhocKeywords, adhocKeywordDraft.trim()]); setAdhocKeywordDraft('') } }} />
              <button className="btn btn-sm" onClick={() => { if (adhocKeywordDraft.trim()) { saveAdhocKeywords([...adhocKeywords, adhocKeywordDraft.trim()]); setAdhocKeywordDraft('') } }}>+ Add</button>
            </div>
          </div>

          {adhocPayments.length > 0 && (
            <div className="card" style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Ad-hoc payments in this upload ({adhocPayments.length})</div>
              <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 8 }}>For reference only — not counted anywhere above.</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {adhocPayments.map(({ payment: p, idx }) => (
                  <div key={idx} style={{ fontSize: 12, display: 'flex', justifyContent: 'space-between', padding: '4px 8px', background: 'var(--bg-secondary)', borderRadius: 6 }}>
                    <span>{p.name}</span>
                    {p.amount != null && <span style={{ color: 'var(--text-tertiary)' }}>{p.amount}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

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
              <button className="btn btn-sm" style={{ marginLeft: 'auto' }} onClick={() => exportToExcel(missedTraining.map(r => ({
                Name: `${r.student.members?.first_name || ''} ${r.student.members?.last_name || ''}`.trim(),
                Phone: r.student.members?.phone || '',
                Email: r.student.members?.email || '',
                'Last attended': r.lastDate || 'Never',
                'Weeks missed': r.weeksMissed ?? '',
              })), 'missed_training')}>⬇️ Export</button>
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
                    <th>Stop</th>
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
                          <td>
                            <button className="btn btn-sm" style={{ fontSize: 11, color: '#E24B4A', borderColor: '#E24B4A' }} title="Mark this student as stopped training"
                              onClick={() => setConfirmStopFor({ memberId: r.student.member_id, studentId: r.student.id, name: `${m?.first_name || ''} ${m?.last_name || ''}`.trim() })}>
                              🛑 Stop
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
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: showStoppedHelp ? 6 : 10 }}>
              <h2 style={{ fontSize: 15, fontWeight: 600 }}>Stopped training</h2>
              <button className="btn btn-sm" title="What does this do?" onClick={() => setShowStoppedHelp(v => !v)}
                style={{ width: 20, height: 20, padding: 0, borderRadius: '50%', fontSize: 11, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                ?
              </button>
              <button className="btn btn-sm" style={{ marginLeft: 'auto' }} onClick={() => exportToExcel(stoppedStudents.map(s => ({
                Name: `${s.members?.first_name || ''} ${s.members?.last_name || ''}`.trim(),
                Phone: s.members?.phone || '',
                Email: s.members?.email || '',
                'Do not contact': s.members?.do_not_contact ? 'Yes' : 'No',
              })), 'stopped_training')}>⬇️ Export</button>
            </div>
            {showStoppedHelp && (
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 10 }}>
                Everyone with a "stopped" status.
                <br /><br />
                <b>Template placeholders:</b> use <code>{'{name}'}</code> for the student's first name and <code>{'{parent_name}'}</code> for the parent/guardian's name — filled in automatically when you share a template.
              </p>
            )}
            <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>Message templates — press to select, then choose who to send it to</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8, marginBottom: 12 }}>
              {stTemplates.map((t, i) => (
                stEditingIdx === i ? (
                  <div key={i} className="card" style={{ padding: 8, background: 'var(--bg-secondary)' }}>
                    <input value={stTemplateDraft.label} onChange={e => setStTemplateDraft(d => ({ ...d, label: e.target.value }))}
                      placeholder="Label" style={{ width: '100%', fontSize: 11, fontWeight: 600, marginBottom: 6, padding: '3px 6px' }} />
                    <textarea value={stTemplateDraft.body} onChange={e => setStTemplateDraft(d => ({ ...d, body: e.target.value }))}
                      placeholder="Message text — use {name} for first name, {parent_name} for the parent/guardian's name" rows={7}
                      style={{ width: '100%', fontSize: 15, padding: '10px 12px', marginBottom: 6, resize: 'vertical' }} />
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button className="btn btn-sm" style={{ fontSize: 10, padding: '2px 8px', flex: 1 }} disabled={stSavingTemplate}
                        onClick={() => saveStTemplate(i)}>{stSavingTemplate ? 'Saving…' : 'Save'}</button>
                      <button className="btn btn-sm" style={{ fontSize: 10, padding: '2px 8px' }} onClick={() => setStEditingIdx(null)}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div key={i}
                    onClick={() => setStSelectedTemplateIdx(stSelectedTemplateIdx === i ? null : i)}
                    style={{
                      padding: 8, borderRadius: 'var(--radius)', cursor: 'pointer', position: 'relative',
                      background: stSelectedTemplateIdx === i ? '#378ADD20' : 'var(--bg-secondary)',
                      border: stSelectedTemplateIdx === i ? '2px solid #378ADD' : '1px solid var(--border)',
                      minHeight: 92, display: 'flex', flexDirection: 'column',
                    }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                      <span style={{ fontSize: 11, fontWeight: 600 }}>{t.label || `Template ${i + 1}`}</span>
                      <button className="btn btn-sm" style={{ fontSize: 9, padding: '1px 6px' }}
                        onClick={e => { e.stopPropagation(); setStEditingIdx(i); setStTemplateDraft(t) }}>Edit</button>
                    </div>
                    <p style={{ fontSize: 10, color: 'var(--text-tertiary)', lineHeight: 1.4, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical' }}>
                      {t.body || 'No message set yet — click Edit'}
                    </p>
                  </div>
                )
              ))}
            </div>

            {stSelectedTemplateIdx != null && (
              <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 10 }}>
                <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>Send "{stTemplates[stSelectedTemplateIdx].label}" to:</p>
                <input value={stRecipientSearch} onChange={e => { setStRecipientSearch(e.target.value); setStRecipientId(null) }}
                  placeholder="Search stopped students…" style={{ width: '100%', fontSize: 12, marginBottom: 6 }} />
                {stRecipientSearch && !stRecipientId && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 160, overflowY: 'auto', marginBottom: 6 }}>
                    {stoppedStudents.filter(s => `${s.members?.first_name || ''} ${s.members?.last_name || ''}`.toLowerCase().includes(stRecipientSearch.toLowerCase())).slice(0, 8).map(s => (
                      <div key={s.id} onClick={() => { setStRecipientId(s.id); setStRecipientSearch(`${s.members?.first_name || ''} ${s.members?.last_name || ''}`.trim()) }}
                        style={{ fontSize: 12, padding: '4px 8px', borderRadius: 'var(--radius)', cursor: 'pointer', background: 'var(--bg)' }}>
                        {s.members?.first_name} {s.members?.last_name}
                      </div>
                    ))}
                  </div>
                )}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-sm btn-primary" disabled={!stRecipientId}
                    onClick={() => {
                      const recipient = stoppedStudents.find(s => s.id === stRecipientId)
                      const text = (stTemplates[stSelectedTemplateIdx].body || '')
                        .replace(/\{name\}/gi, recipient?.members?.first_name || '')
                        .replace(/\{parent_name\}/gi, recipient?.guardian_name || '')
                      shareText(text)
                    }}>
                    📤 Share to {stRecipientId ? `${stoppedStudents.find(s => s.id === stRecipientId)?.members?.first_name || ''} ${stoppedStudents.find(s => s.id === stRecipientId)?.members?.last_name || ''}`.trim() : 'selected student'}
                  </button>
                  {(() => {
                    const recipient = stoppedStudents.find(s => s.id === stRecipientId)
                    const email = recipient?.members?.email && !recipient.members.email.includes('@kr-centre.placeholder') ? recipient.members.email : null
                    if (!stRecipientId || !email) return null
                    return (
                      <button className="btn btn-sm" title={`Send a real email to ${email}`}
                        onClick={() => {
                          const text = (stTemplates[stSelectedTemplateIdx].body || '')
                            .replace(/\{name\}/gi, recipient?.members?.first_name || '')
                            .replace(/\{parent_name\}/gi, recipient?.guardian_name || '')
                          sendRealEmail(email, stTemplates[stSelectedTemplateIdx].label || 'Message from KR Centre', text)
                        }}>✉️ Email</button>
                    )
                  })()}
                </div>
              </div>
            )}
          </div>

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
          <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
            <button className={gradingView === 'requests' ? 'btn btn-sm btn-primary' : 'btn btn-sm'} onClick={() => setGradingView('requests')}>Requests</button>
            <button className={gradingView === 'list' ? 'btn btn-sm btn-primary' : 'btn btn-sm'} onClick={() => setGradingView('list')}>Grading list</button>
            <button className="btn btn-sm" style={{ marginLeft: 'auto' }} onClick={() => exportToExcel(gradingRequests.map(r => ({
              Name: `${r.students?.members?.first_name || ''} ${r.students?.members?.last_name || ''}`.trim(),
              Discipline: r.students?.discipline || '',
              'Current belt/level': r.students?.pka_belt || r.students?.krba_level || '',
              'Grading for': r.grading_for || '',
              'Sessions attended (claimed)': r.notes?.sessions_attended ?? '',
              'Sessions attended (actual, last 3mo)': r.attendanceCount ?? '',
              Approved: r.coach_approved ? 'Yes' : 'No',
              'Submitted': r.created_at ? new Date(r.created_at).toLocaleDateString('en-GB') : '',
            })), 'grading_requests')}>⬇️ Export</button>
          </div>

          {gradingLoading ? (
            <div className="loading">Loading…</div>
          ) : gradingRequests.length === 0 ? (
            <div className="empty-state"><h3>No grading requests</h3><p>Nobody has submitted a grading expression of interest yet.</p></div>
          ) : gradingView === 'requests' ? (
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
                        <span style={{ color: 'var(--text-tertiary)' }}>Self-reported sessions: </span>
                        <strong>{extra.sessions_attended != null ? `${extra.sessions_attended} of ${extra.sessions_possible ?? '?'}` : '—'}</strong>
                      </div>
                      <div style={{ fontSize: 12 }}>
                        <span style={{ color: 'var(--text-tertiary)' }}>Actual attendance (last 3 months): </span>
                        <strong style={{ color: r.attendanceCount === 0 ? '#E24B4A' : undefined }}>
                          {r.attendanceCount === null ? 'No student record linked' : `${r.attendanceCount} session${r.attendanceCount === 1 ? '' : 's'}`}
                        </strong>
                      </div>
                      {extra.contact_phone && (
                        <div style={{ fontSize: 12 }}>
                          <span style={{ color: 'var(--text-tertiary)' }}>Contact: </span>
                          <strong>{extra.contact_phone}</strong>
                        </div>
                      )}
                    </div>

                    {(extra.fitness_comments || extra.coach_name || extra.student_notes) && (
                      <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {extra.fitness_comments && <p style={{ fontSize: 12 }}><span style={{ color: 'var(--text-tertiary)' }}>Fitness/technique comments: </span>{extra.fitness_comments}</p>}
                        {extra.coach_name && <p style={{ fontSize: 12 }}><span style={{ color: 'var(--text-tertiary)' }}>Coach named: </span>{extra.coach_name}</p>}
                        {extra.student_notes && <p style={{ fontSize: 12 }}><span style={{ color: 'var(--text-tertiary)' }}>Student notes: </span>{extra.student_notes}</p>}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          ) : (() => {
            const allRows = computeGradingRows()
            const selectedRows = allRows.filter(r => gradingSelected[r.id])
            const tally = computeBeltTally(selectedRows)
            let currentBand = null
            return (
              <div>
                {/* Filters */}
                <div className="card" style={{ padding: 12, marginBottom: 12, display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
                  <div className="field" style={{ marginBottom: 0 }}>
                    <label style={{ fontSize: 11 }}>Discipline</label>
                    <select value={gradingDisciplineFilter} onChange={e => setGradingDisciplineFilter(e.target.value)}>
                      <option value="all">All</option>
                      <option value="PKA">PKA</option>
                      <option value="KRBA">KRBA</option>
                    </select>
                  </div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer' }}>
                    <input type="checkbox" checked={gradingApprovedOnly} onChange={e => setGradingApprovedOnly(e.target.checked)} />
                    Approved only
                  </label>
                  <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                    <button className="btn btn-sm" onClick={() => setGradingSelected(Object.fromEntries(allRows.map(r => [r.id, true])))}>Select all</button>
                    <button className="btn btn-sm" onClick={() => setGradingSelected(Object.fromEntries(allRows.map(r => [r.id, false])))}>Deselect all</button>
                  </div>
                </div>

                {/* Belt size rule */}
                <div className="card" style={{ padding: 12, marginBottom: 12 }}>
                  {editingBeltSizeRule ? (
                    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                      <div className="field" style={{ marginBottom: 0 }}><label style={{ fontSize: 11 }}>Under this age (yo)</label>
                        <input type="number" style={{ width: 70 }} value={beltSizeRule.threshold_age}
                          onChange={e => setBeltSizeRule(r => ({ ...r, threshold_age: parseInt(e.target.value) || 0 }))} />
                      </div>
                      <div className="field" style={{ marginBottom: 0 }}><label style={{ fontSize: 11 }}>Size under threshold</label>
                        <input style={{ width: 80 }} value={beltSizeRule.under_size}
                          onChange={e => setBeltSizeRule(r => ({ ...r, under_size: e.target.value }))} />
                      </div>
                      <div className="field" style={{ marginBottom: 0 }}><label style={{ fontSize: 11 }}>Size at/above threshold</label>
                        <input style={{ width: 80 }} value={beltSizeRule.over_size}
                          onChange={e => setBeltSizeRule(r => ({ ...r, over_size: e.target.value }))} />
                      </div>
                      <button className="btn btn-sm btn-primary" disabled={savingBeltSettings} onClick={() => saveBeltSizeRule(beltSizeRule)}>
                        {savingBeltSettings ? 'Saving…' : 'Save'}
                      </button>
                      <button className="btn btn-sm" onClick={() => setEditingBeltSizeRule(false)}>Cancel</button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                        Belt size rule: under <strong>{beltSizeRule.threshold_age}yo</strong> → <strong>{beltSizeRule.under_size}</strong>,
                        {' '}{beltSizeRule.threshold_age}+ → <strong>{beltSizeRule.over_size}</strong>
                      </p>
                      <button className="btn btn-sm" onClick={() => setEditingBeltSizeRule(true)}>Edit</button>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
                  <button className="btn btn-sm btn-primary" onClick={() => exportGradingList(selectedRows)}>⬇ Export list (Excel)</button>
                  <button className="btn btn-sm" onClick={() => setShowOrderForm(v => !v)}>📋 Generate belt order form</button>
                  <button className="btn btn-sm" onClick={() => printExaminersForm(selectedRows)}>🖨️ Print examiners form</button>
                  <button className="btn btn-sm" onClick={() => printCertificateList(selectedRows)}>🖨️ Print certificate list</button>
                  <button className="btn btn-sm" onClick={() => setShowBeltStock(v => !v)}>📦 Stock list of belts</button>
                </div>

                {/* Belt order form (tally) */}
                {showOrderForm && (
                  <div className="card" style={{ padding: 14, marginBottom: 14 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                      <h3 style={{ fontSize: 14, fontWeight: 600 }}>Belt order form ({selectedRows.length} selected)</h3>
                      <button className="btn btn-sm btn-primary" onClick={() => exportOrderForm(selectedRows)}>⬇ Export order form (Excel)</button>
                    </div>
                    {tally.length === 0 ? <p style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Nothing selected.</p> : (
                      <table style={{ width: '100%', fontSize: 12 }}>
                        <thead><tr><th style={{ textAlign: 'left' }}>Size</th><th style={{ textAlign: 'left' }}>Belt</th><th style={{ textAlign: 'right' }}>Needed</th></tr></thead>
                        <tbody>
                          {tally.map(t => (
                            <tr key={t.size + t.belt}><td>{t.size}</td><td>{t.belt}</td><td style={{ textAlign: 'right' }}>{t.qty}</td></tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}

                {/* Stock list */}
                {showBeltStock && (
                  <div className="card" style={{ padding: 14, marginBottom: 14 }}>
                    <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>Stock list of belts</h3>
                    {beltStock.map((s, i) => (
                      <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6, alignItems: 'center' }}>
                        <input style={{ width: 70 }} placeholder="Size" value={s.size}
                          onChange={e => setBeltStock(prev => prev.map((row, ri) => ri === i ? { ...row, size: e.target.value } : row))} />
                        <input style={{ flex: 1 }} placeholder="Belt" value={s.belt}
                          onChange={e => setBeltStock(prev => prev.map((row, ri) => ri === i ? { ...row, belt: e.target.value } : row))} />
                        <input type="number" style={{ width: 80 }} placeholder="Qty" value={s.qty}
                          onChange={e => setBeltStock(prev => prev.map((row, ri) => ri === i ? { ...row, qty: parseInt(e.target.value) || 0 } : row))} />
                        <button className="btn btn-sm" onClick={() => setBeltStock(prev => prev.filter((_, ri) => ri !== i))}>✕</button>
                      </div>
                    ))}
                    <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                      <button className="btn btn-sm" onClick={() => setBeltStock(prev => [...prev, { size: '', belt: '', qty: 0 }])}>+ Add row</button>
                      <button className="btn btn-sm btn-primary" disabled={savingBeltSettings} onClick={() => saveBeltStock(beltStock)}>
                        {savingBeltSettings ? 'Saving…' : 'Save stock list'}
                      </button>
                    </div>
                  </div>
                )}

                {/* Main table, grouped by age group then belt order */}
                <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                  <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: 'var(--bg-secondary)' }}>
                        <th style={{ padding: 8, textAlign: 'left' }}></th>
                        <th style={{ padding: 8, textAlign: 'left' }}>Name</th>
                        <th style={{ padding: 8, textAlign: 'left' }}>Age</th>
                        <th style={{ padding: 8, textAlign: 'left' }}>Belt size</th>
                        <th style={{ padding: 8, textAlign: 'left' }}>Current belt</th>
                        <th style={{ padding: 8, textAlign: 'left' }}>Grading for</th>
                        <th style={{ padding: 8, textAlign: 'left' }}>Approved</th>
                      </tr>
                    </thead>
                    <tbody>
                      {allRows.map(r => {
                        const showBandHeader = r.band !== currentBand
                        currentBand = r.band
                        return (
                          <Fragment key={r.id}>
                            {showBandHeader && (
                              <tr key={r.band + '-header'} style={{ background: 'var(--bg-tertiary)' }}>
                                <td colSpan={7} style={{ padding: '6px 8px', fontWeight: 700, fontSize: 12 }}>{r.band}</td>
                              </tr>
                            )}
                            <tr style={{ borderTop: '1px solid var(--border)' }}>
                              <td style={{ padding: 8 }}><input type="checkbox" checked={!!gradingSelected[r.id]}
                                onChange={e => setGradingSelected(prev => ({ ...prev, [r.id]: e.target.checked }))} /></td>
                              <td style={{ padding: 8, fontWeight: 500 }}>{r.name}</td>
                              <td style={{ padding: 8 }}>{r.age ?? '—'}</td>
                              <td style={{ padding: 8 }}>{r.size}</td>
                              <td style={{ padding: 8 }}>{r.current_belt || '—'}</td>
                              <td style={{ padding: 8, fontWeight: 600 }}>{r.grading_for}</td>
                              <td style={{ padding: 8 }}>{r.coach_approved ? <span style={{ color: '#1D9E75' }}>✓</span> : '—'}</td>
                            </tr>
                          </Fragment>
                        )
                      })}
                    </tbody>
                  </table>
                  {allRows.length === 0 && <p style={{ padding: 14, fontSize: 12, color: 'var(--text-tertiary)', textAlign: 'center' }}>No rows match the current filters.</p>}
                </div>
              </div>
            )
          })()}
        </div>
      )}

      {/* Confirmation before marking a student as stopped, from the
          Missed Training list -- a status change worth double-checking
          before committing, since it moves them to the Stopped
          training tab and out of active tracking. */}
      {confirmStopFor && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 16 }}
          onClick={() => !stoppingInProgress && setConfirmStopFor(null)}>
          <div className="card" style={{ width: '100%', maxWidth: 360 }} onClick={e => e.stopPropagation()}>
            <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 10 }}>Mark as stopped?</h2>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
              This will mark <strong>{confirmStopFor.name}</strong> as stopped training. They'll move to the
              "Stopped training" tab and drop out of Missed Training and attendance tracking.
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn" style={{ flex: 1, justifyContent: 'center' }} disabled={stoppingInProgress} onClick={() => setConfirmStopFor(null)}>Cancel</button>
              <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center', background: '#E24B4A', borderColor: '#E24B4A' }} disabled={stoppingInProgress} onClick={markAsStopped}>
                {stoppingInProgress ? 'Marking…' : '🛑 Yes, mark as stopped'}
              </button>
            </div>
          </div>
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
              <button className="btn btn-sm" style={{ marginLeft: 'auto' }} onClick={() => exportToExcel(birthdays.map(b => ({
                Name: `${b.student.members?.first_name || ''} ${b.student.members?.last_name || ''}`.trim(),
                Phone: b.student.members?.phone || '',
                Email: b.student.members?.email || '',
                'Birthday': b.nextBirthday ? new Date(b.nextBirthday).toLocaleDateString('en-GB') : '',
                'Turning': b.turningAge ?? '',
                'Days until': b.daysUntil ?? '',
              })), 'birthdays')}>⬇️ Export</button>
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

          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
            <input type="text" placeholder="🔍 Search by name…" value={msgNameSearch} onChange={e => setMsgNameSearch(e.target.value)} style={{ fontSize: 13, flex: 1, minWidth: 160 }} />
            {msgSelectedStudentIds.size > 0 && (
              <>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{msgSelectedStudentIds.size} selected</span>
                <button className="btn btn-sm" onClick={() => setMsgSelectedStudentIds(new Set())}>Clear</button>
                <button className="btn btn-sm btn-primary" disabled={msgSelectedTemplateIdx == null || msgBatchSending}
                  title={msgSelectedTemplateIdx == null ? 'Select a template first' : 'Emails every selected student who has a real email address on file'}
                  onClick={async () => {
                    setMsgBatchSending(true)
                    const targets = students.filter(s => msgSelectedStudentIds.has(s.id))
                    let sent = 0, skipped = 0
                    for (const s of targets) {
                      const email = s.members?.email && !s.members.email.includes('@kr-centre.placeholder') ? s.members.email : null
                      if (!email) { skipped++; continue }
                      const text = (msgTemplates[msgSelectedTemplateIdx].body || '')
                        .replace(/\{name\}/gi, s.members?.first_name || '')
                        .replace(/\{parent_name\}/gi, s.guardian_name || '')
                      const ok = await sendRealEmail(email, msgTemplates[msgSelectedTemplateIdx].label || 'Message from KR Centre', text, true)
                      if (ok) sent++; else skipped++
                    }
                    setMsgBatchSending(false)
                    alert(`Sent to ${sent} student${sent === 1 ? '' : 's'}${skipped ? ` · ${skipped} skipped (no email on file, or send failed)` : ''}`)
                  }}>
                  {msgBatchSending ? 'Sending…' : `✉️ Send to ${msgSelectedStudentIds.size} selected`}
                </button>
              </>
            )}
          </div>

          <div className="card" style={{ overflowX: 'auto' }}>
            <table style={{ minWidth: 700 }}>
              <thead>
                <tr>
                  <th style={{ width: 32 }}>
                    <input type="checkbox"
                      checked={sortedMessagesStudents().filter(s => !msgNameSearch.trim() || studentFullName(s).toLowerCase().includes(msgNameSearch.trim().toLowerCase())).length > 0 && sortedMessagesStudents().filter(s => !msgNameSearch.trim() || studentFullName(s).toLowerCase().includes(msgNameSearch.trim().toLowerCase())).every(s => msgSelectedStudentIds.has(s.id))}
                      onChange={e => {
                        const visible = sortedMessagesStudents().filter(s => !msgNameSearch.trim() || studentFullName(s).toLowerCase().includes(msgNameSearch.trim().toLowerCase()))
                        setMsgSelectedStudentIds(prev => {
                          const next = new Set(prev)
                          if (e.target.checked) visible.forEach(s => next.add(s.id))
                          else visible.forEach(s => next.delete(s.id))
                          return next
                        })
                      }} />
                  </th>
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
                {sortedMessagesStudents().filter(s => !msgNameSearch.trim() || studentFullName(s).toLowerCase().includes(msgNameSearch.trim().toLowerCase())).map(s => (
                  <tr key={s.id}>
                    <td>
                      <input type="checkbox" checked={msgSelectedStudentIds.has(s.id)} onChange={e => {
                        setMsgSelectedStudentIds(prev => {
                          const next = new Set(prev)
                          if (e.target.checked) next.add(s.id); else next.delete(s.id)
                          return next
                        })
                      }} />
                    </td>
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
                      {m.flagged && <span style={{ fontSize: 12, flexShrink: 0 }}>⭐</span>}
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
                {/* Top toolbar -- navigation, star, close. Always visible, even
                    while loading, so switching messages doesn't feel like it
                    resets the modal each time. */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, paddingBottom: 10, borderBottom: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button className="btn btn-sm" title="Previous message" disabled={inboxMessages.findIndex(m => m.uid === openMessage.uid) <= 0} onClick={() => goToAdjacentMessage(-1)}>⬅️</button>
                    <button className="btn btn-sm" title="Next message" disabled={inboxMessages.findIndex(m => m.uid === openMessage.uid) === inboxMessages.length - 1} onClick={() => goToAdjacentMessage(1)}>➡️</button>
                  </div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {!openMessageLoading && !openMessageError && (
                      <button className="btn btn-sm" title={openMessage.flagged ? 'Unstar' : 'Star'} onClick={toggleStarOpenMessage}>{openMessage.flagged ? '⭐' : '☆'}</button>
                    )}
                    <button className="btn btn-sm" title="Close" onClick={() => { setOpenMessage(null); setReplyDraft(null) }}>✕</button>
                  </div>
                </div>

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

                    {!replyDraft && (() => {
                      const phone = extractPhoneNumber(openMessage.body) || extractPhoneNumber(openMessage.subject)
                      const isMobile = phone && /^(?:\+447|07)/.test(phone)
                      return (
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                          <button className="btn btn-sm btn-primary" onClick={() => setReplyDraft({
                            to: openMessage.from, subject: openMessage.subject?.toLowerCase().startsWith('re:') ? openMessage.subject : `Re: ${openMessage.subject}`,
                            body: `\n\n---\nOn ${openMessage.date ? new Date(openMessage.date).toLocaleString('en-GB') : ''}, ${openMessage.fromName || openMessage.from} wrote:\n${openMessage.body}`,
                          })}>↩️ Reply</button>
                          {phone && <a className="btn btn-sm" href={`tel:${phone}`}>📞 Call {phone}</a>}
                          {phone && isMobile && <a className="btn btn-sm" href={`sms:${phone}`}>💬 Text {phone}</a>}
                          <button className="btn btn-sm" onClick={markMessageContacted}>✓ Mark contacted → Enquiries</button>
                          <button className="btn btn-sm" style={{ color: '#E24B4A' }} onClick={deleteOpenMessage}>🗑️ Delete</button>
                        </div>
                      )
                    })()}

                    {replyDraft && (
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
            {isAdmin && <button className="btn btn-primary btn-sm" onClick={() => startEditCourse(null)}>+ Add notice</button>}
            <button className="btn btn-sm" onClick={() => exportToExcel(courses.map(c => ({
              Title: c.title, Description: c.description || '', 'Start date': c.start_date, 'End date': c.end_date || '',
              Location: c.location || '', Price: c.price || '',
            })), 'notices')}>⬇️ Export</button>
          </div>

          {courses.length === 0 ? (
            <div className="empty-state"><h3>No courses yet</h3><p>Add your first course to get started</p></div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {courses.map(c => {
                const isOpen = expandedCourseId === c.id
                const isPast = c.start_date < new Date().toISOString().split('T')[0]
                const daysUntil = Math.round((new Date(c.start_date + 'T00:00:00') - new Date(new Date().toISOString().split('T')[0] + 'T00:00:00')) / (24 * 60 * 60 * 1000))
                const untilLabel = isPast ? null : daysUntil === 0 ? 'Today' : daysUntil < 7 ? `${daysUntil} day${daysUntil === 1 ? '' : 's'} away` : `${Math.floor(daysUntil / 7)} week${Math.floor(daysUntil / 7) === 1 ? '' : 's'}${daysUntil % 7 ? ` ${daysUntil % 7} day${daysUntil % 7 === 1 ? '' : 's'}` : ''} away`
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
                        {untilLabel && <div style={{ fontSize: 11, color: '#378ADD', fontWeight: 600, marginTop: 2 }}>{untilLabel}</div>}
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

                        {isAdmin && <NoticeTargetedSend notice={c} students={students} sendRealEmail={sendRealEmail} studentFullName={studentFullName} />}

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
                <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 14 }}>{editingCourse?.id ? 'Edit notice' : 'Add notice'}</h3>

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

                {!editingCourse?.id && (
                  <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                    <div style={{ flex: 1 }}>
                      <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Repeat</label>
                      <select value={courseForm.repeat_type} onChange={e => setCourseForm(f => ({ ...f, repeat_type: e.target.value }))} style={{ width: '100%' }}>
                        <option value="none">Doesn't repeat</option>
                        <option value="weekly">Weekly (same day)</option>
                        <option value="monthly">Monthly (same date)</option>
                      </select>
                    </div>
                    {courseForm.repeat_type !== 'none' && (
                      <div style={{ flex: 1 }}>
                        <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Number of occurrences</label>
                        <input type="number" min="2" max="52" value={courseForm.repeat_count} onChange={e => setCourseForm(f => ({ ...f, repeat_count: Number(e.target.value) }))} style={{ width: '100%' }} />
                      </div>
                    )}
                  </div>
                )}

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
