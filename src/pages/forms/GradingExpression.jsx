import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase.js'
import FormLogo from '../../components/shared/FormLogo.jsx'

// Derby PKA grade order, per age band (from the club's official grading guide).
const PKA_GRADE_ORDERS = {
  'Tiny Tots (3-5 years)': ['Red', 'Yellow', 'Yellow tag', 'Orange', 'Orange tag', 'Green', 'Green tag', 'Blue', 'Blue tag', 'Purple', 'Purple tag', 'Brown', 'Brown tag', 'Black'],
  'Small Soldiers (6-8 years)': ['Red', 'Yellow', 'Orange', 'Green', 'Blue', 'Blue tag', 'Purple', 'Purple tag', 'Brown', 'Brown tag', 'Black'],
  'Junior Jedi (9-13 years)': ['Red', 'Yellow', 'Orange', 'Green', 'Blue', 'Purple', 'Purple tag', 'Brown', 'Brown tag', 'Black'],
  'Adults (14+)': ['Red', 'Yellow', 'Orange', 'Green', 'Blue', 'Purple', 'Brown', 'Black'],
}

function ageBandFor(dob) {
  if (!dob) return null
  const age = Math.floor((Date.now() - new Date(dob)) / (365.25 * 24 * 60 * 60 * 1000))
  if (age <= 5) return 'Tiny Tots (3-5 years)'
  if (age <= 8) return 'Small Soldiers (6-8 years)'
  if (age <= 13) return 'Junior Jedi (9-13 years)'
  return 'Adults (14+)'
}

export default function GradingExpression() {
  const [matchedStudent, setMatchedStudent] = useState(null) // set once a typed name matches an existing student, else null
  const [checkingMatch, setCheckingMatch] = useState(false)
  const [pkaClasses, setPkaClasses] = useState([])
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')

  const [form, setForm] = useState({
    name: '',
    dob: '',
    current_belt: '',
    grading_for: '',
    session_class_id: '',
    contact_phone: '',
    coach_name: '',
    student_notes: '',
  })

  function set(field) {
    return e => setForm(f => ({ ...f, [field]: e.target.value }))
  }

  useEffect(() => {
    supabase.from('classes').select('id, name, day_of_week, start_time').eq('active', true).eq('discipline', 'PKA')
      .order('day_of_week').order('start_time')
      .then(({ data }) => setPkaClasses(data || []))
  }, [])

  // Checked once the person finishes typing their name (on blur), not on
  // every keystroke -- this form is standalone and works whether or not
  // there's a match, so a miss is never treated as an error, just silence.
  async function checkForStudentMatch() {
    const typed = form.name.trim()
    if (typed.length < 3) { setMatchedStudent(null); return }
    setCheckingMatch(true)
    // Anonymous visitors can't read the students/members tables directly
    // (RLS requires a real login) -- this RPC runs with elevated
    // privileges internally but only ever returns the one specific
    // match, never the whole table, same pattern as the join forms'
    // lookup_member_by_email.
    const { data } = await supabase.rpc('lookup_student_by_name', { typed_name: typed })
    const match = data?.[0] || null
    setCheckingMatch(false)
    if (match) {
      setMatchedStudent(match)
      setForm(f => ({
        ...f,
        dob: match.date_of_birth || f.dob,
        current_belt: match.pka_belt || f.current_belt,
        contact_phone: f.contact_phone || match.phone || '',
      }))
    } else {
      setMatchedStudent(null)
    }
  }

  // Auto-fills the grade being worked towards as soon as a current belt
  // is picked, staying editable afterwards in case they're grading for
  // something else.
  useEffect(() => {
    if (!form.current_belt) return
    const band = ageBandFor(form.dob)
    const order = PKA_GRADE_ORDERS[band] || []
    const idx = order.indexOf(form.current_belt)
    const next = idx >= 0 && idx < order.length - 1 ? order[idx + 1] : ''
    setForm(f => (f.grading_for === next ? f : { ...f, grading_for: next }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.current_belt, form.dob])

  async function submit(e) {
    e.preventDefault()
    setSubmitting(true)
    setError('')
    try {
      const { error: err } = await supabase.from('grading_expressions').insert({
        student_id: matchedStudent?.id || null,
        discipline: 'PKA',
        current_belt: form.current_belt,
        grading_for: form.grading_for,
        notes: JSON.stringify({
          name: form.name,
          dob: form.dob,
          contact_phone: form.contact_phone,
          session_class_id: form.session_class_id || null,
          coach_name: form.coach_name,
          student_notes: form.student_notes,
        }),
        coach_approved: false,
      })
      if (err) throw err
      setSubmitted(true)
    } catch (err) {
      setError(err.message || 'Something went wrong.')
    }
    setSubmitting(false)
  }

  const ageBand = ageBandFor(form.dob)
  const currentBeltList = ageBand ? (PKA_GRADE_ORDERS[ageBand] || []) : []
  const currentIdx = currentBeltList.indexOf(form.current_belt)
  const nextBelts = currentIdx >= 0 ? currentBeltList.slice(currentIdx + 1) : currentBeltList

  if (submitted) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg-tertiary)', padding: '24px 16px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="card" style={{ maxWidth: 440, width: '100%', textAlign: 'center', padding: 32 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
          <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Expression submitted</h2>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20, lineHeight: 1.6 }}>
            Your grading expression of interest for <strong>{form.grading_for}</strong> has been submitted. Your coach will review it and confirm whether you are ready to grade.
          </p>
          <Link to="/" className="btn btn-primary" style={{ display: 'inline-flex', justifyContent: 'center', width: '100%' }}>Done</Link>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-tertiary)', padding: '24px 16px' }}>
      <div style={{ maxWidth: 540, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <FormLogo formKey="grading" fallbackEmoji="🎽" />
          <h1 style={{ fontSize: 20, fontWeight: 600 }}>Grading expression of interest</h1>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 3 }}>Let your coach know you want to grade</p>
        </div>

        <form onSubmit={submit}>
          <div className="card">
            <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 14 }}>Grading details</h2>

            <div className="field"><label>Name <span className="required">*</span></label>
              <input value={form.name} onChange={set('name')} onBlur={checkForStudentMatch} placeholder="Your full name" required />
              {checkingMatch && <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>Checking…</p>}
              {!checkingMatch && matchedStudent && (
                <p style={{ fontSize: 12, color: '#1D9E75', marginTop: 4 }}>✓ Student match found — details filled in below</p>
              )}
            </div>

            <div className="field"><label>Date of birth <span className="required">*</span></label>
              <input type="date" value={form.dob} onChange={set('dob')} required />
            </div>

            <div className="field-row">
              <div className="field"><label>Current grade</label>
                <select value={form.current_belt} onChange={set('current_belt')} disabled={!form.dob}>
                  <option value="">{form.dob ? 'Select…' : 'Enter date of birth first'}</option>
                  {currentBeltList.map(b => <option key={b}>{b}</option>)}
                </select>
              </div>
              <div className="field"><label>Grading for <span className="required">*</span></label>
                <select value={form.grading_for} onChange={set('grading_for')} required disabled={!form.dob}>
                  <option value="">Select next grade…</option>
                  {nextBelts.map(b => <option key={b}>{b}</option>)}
                  {nextBelts.length === 0 && currentBeltList.map(b => <option key={b}>{b}</option>)}
                </select>
              </div>
            </div>
            {form.current_belt && (
              <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: -8, marginBottom: 14 }}>
                Auto-filled from the {ageBand} grade order — change it if you're grading for something else.
              </p>
            )}

            <div className="field">
              <label>Session attended</label>
              <select value={form.session_class_id} onChange={set('session_class_id')}>
                <option value="">Select your class…</option>
                {pkaClasses.map(c => (
                  <option key={c.id} value={c.id}>{c.name} — {c.day_of_week} {c.start_time?.slice(0, 5)}</option>
                ))}
              </select>
            </div>

            <div className="field">
              <label>Contact number</label>
              <input value={form.contact_phone} onChange={set('contact_phone')} placeholder="e.g. 07xxx xxxxxx" />
            </div>

            <div className="field">
              <label>Your coach's name</label>
              <input value={form.coach_name} onChange={set('coach_name')} placeholder="e.g. MP, GD, LW…" />
            </div>

            <div className="field">
              <label>Any additional notes for your coach</label>
              <textarea rows={2} value={form.student_notes} onChange={set('student_notes')}
                placeholder="Anything else you'd like your coach to know…" style={{ resize: 'none' }} />
            </div>

            {error && <p className="error-msg" style={{ marginBottom: 10 }}>{error}</p>}

            <button type="submit" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }}
              disabled={!form.name.trim() || !form.dob || !form.grading_for || submitting}>
              {submitting ? 'Submitting…' : 'Submit expression of interest'}
            </button>
          </div>
        </form>

        <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-secondary)', marginTop: 16 }}>
          Your coach will review this and confirm grading eligibility.
        </p>
      </div>
    </div>
  )
}
