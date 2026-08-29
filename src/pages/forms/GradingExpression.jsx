import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase.js'
import { useAuth } from '../../hooks/useAuth.jsx'
import FormLogo from '../../components/shared/FormLogo.jsx'

// Derby PKA grade order, per age band (from the club's official grading guide).
// KRBA doesn't have an age-banded structure so it keeps using the
// krba_levels list from settings, same as before.
const PKA_GRADE_ORDERS = {
  'Tiny Tots (3-5 years)': ['Red', 'Yellow', 'Yellow tag', 'Orange', 'Orange tag', 'Green', 'Green tag', 'Blue', 'Blue tag', 'Purple', 'Purple tag', 'Brown', 'Brown tag', 'Black'],
  'Small Soldiers (6-8 years)': ['Red', 'Yellow', 'Orange', 'Green', 'Blue', 'Blue tag', 'Purple', 'Purple tag', 'Brown', 'Brown tag', 'Black'],
  'Junior Jedi (9-13 years)': ['Red', 'Yellow', 'Orange', 'Green', 'Blue', 'Purple', 'Purple tag', 'Brown', 'Brown tag', 'Black'],
  'Adults (14+)': ['Red', 'Yellow', 'Orange', 'Green', 'Blue', 'Purple', 'Brown', 'Black'],
}

function ageBandFor(dob) {
  if (!dob) return 'Adults (14+)'
  const age = Math.floor((Date.now() - new Date(dob)) / (365.25 * 24 * 60 * 60 * 1000))
  if (age <= 5) return 'Tiny Tots (3-5 years)'
  if (age <= 8) return 'Small Soldiers (6-8 years)'
  if (age <= 13) return 'Junior Jedi (9-13 years)'
  return 'Adults (14+)'
}

// How far back to look when counting "possible" vs "attended" sessions.
const SESSION_WINDOW_DAYS = 90

export default function GradingExpression() {
  const { profile, session } = useAuth()
  const [belts, setBelts] = useState({ PKA: [], KRBA: [] })
  const [student, setStudent] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')

  const [classAssignments, setClassAssignments] = useState([])
  const [sessionStats, setSessionStats] = useState(null) // { attended, possible } | null while loading/unavailable

  const [form, setForm] = useState({
    discipline: 'PKA',
    current_belt: '',
    grading_for: '',
    contact_phone: '',
    fitness_comments: '',
    coach_name: '',
    student_notes: '',
  })

  function set(field) {
    return e => setForm(f => ({ ...f, [field]: e.target.value }))
  }

  useEffect(() => { if (session) loadStudentAndBelts() }, [session])

  async function loadStudentAndBelts() {
    let studentRow = null
    if (profile?.id) {
      const { data } = await supabase
        .from('students')
        .select('*, members(first_name, last_name, phone, date_of_birth)')
        .eq('member_id', profile.id)
        .single()
      if (data) {
        studentRow = data
        setStudent(data)
        const dob = data.members?.date_of_birth
        setForm(f => ({
          ...f,
          discipline: data.discipline || 'PKA',
          current_belt: data.pka_belt || data.krba_level || '',
          contact_phone: f.contact_phone || data.members?.phone || profile?.phone || '',
        }))
        loadClassesAndAttendance(data.id)
      }
    }

    // KRBA still uses the settings-defined level list -- PKA now uses the
    // fixed age-banded grade order below instead of pulling from settings.
    const { data } = await supabase.from('settings').select('key,value').eq('key', 'krba_levels')
    const krbaList = data?.find(r => r.key === 'krba_levels')?.value || []
    setBelts(b => ({ ...b, KRBA: krbaList }))
  }

  async function loadClassesAndAttendance(studentId) {
    const { data: assignments } = await supabase
      .from('student_class_assignments')
      .select('class_id, classes(name, day_of_week, start_time, discipline)')
      .eq('student_id', studentId)
    setClassAssignments(assignments || [])

    const classIds = (assignments || []).map(a => a.class_id).filter(Boolean)
    if (!classIds.length) { setSessionStats(null); return }

    const since = new Date(Date.now() - SESSION_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const { data: attRows } = await supabase
      .from('attendance')
      .select('session_date, student_id')
      .in('class_id', classIds)
      .gte('session_date', since)

    if (!attRows) { setSessionStats(null); return }
    // A session only has attendance rows for students who were present,
    // so "possible" sessions = every date the class ran for *anyone*,
    // and "attended" = the dates this particular student shows up on.
    const possibleDates = new Set(attRows.map(r => r.session_date))
    const attendedDates = new Set(attRows.filter(r => r.student_id === studentId).map(r => r.session_date))
    setSessionStats({ attended: attendedDates.size, possible: possibleDates.size })
  }

  // Auto-fill the grade being worked towards from the official grade order,
  // as soon as a current belt is picked (for PKA -- KRBA levels are still
  // manually chosen since there's no fixed age-banded order for it).
  useEffect(() => {
    if (form.discipline !== 'PKA' || !form.current_belt) return
    const band = ageBandFor(student?.members?.date_of_birth)
    const order = PKA_GRADE_ORDERS[band]
    const idx = order.indexOf(form.current_belt)
    const next = idx >= 0 && idx < order.length - 1 ? order[idx + 1] : ''
    setForm(f => (f.grading_for === next ? f : { ...f, grading_for: next }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.discipline, form.current_belt])

  async function submit(e) {
    e.preventDefault()
    setSubmitting(true)
    setError('')
    try {
      const { error: err } = await supabase.from('grading_expressions').insert({
        student_id: student?.id,
        discipline: form.discipline,
        current_belt: form.current_belt,
        grading_for: form.grading_for,
        notes: JSON.stringify({
          contact_phone: form.contact_phone,
          sessions_attended: sessionStats?.attended ?? null,
          sessions_possible: sessionStats?.possible ?? null,
          fitness_comments: form.fitness_comments,
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

  const ageBand = ageBandFor(student?.members?.date_of_birth)
  const currentBeltList = form.discipline === 'PKA' ? (PKA_GRADE_ORDERS[ageBand] || []) : (belts.KRBA || [])
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
          <Link to="/dashboard" className="btn btn-primary" style={{ display: 'inline-flex', justifyContent: 'center', width: '100%' }}>Back to dashboard</Link>
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
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 3 }}>
            {student ? `${student.members?.first_name} ${student.members?.last_name} · ${form.current_belt}` : 'Let your coach know you want to grade'}
          </p>
        </div>

        <form onSubmit={submit}>
          <div className="card">
            <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 14 }}>Grading details</h2>

            {!session && (
              <div style={{ background: '#faeeda', borderRadius: 'var(--radius)', padding: '10px 12px', fontSize: 13, marginBottom: 14, color: '#854f0b' }}>
                <strong>Note:</strong> You're not logged in. <Link to="/login" style={{ color: '#854f0b', fontWeight: 600 }}>Sign in</Link> to pre-fill your details.
              </div>
            )}

            <div className="field-row">
              <div className="field"><label>Discipline</label>
                <select value={form.discipline} onChange={set('discipline')}>
                  <option value="PKA">PKA — Kickboxing</option>
                  <option value="KRBA">KRBA — Boxing</option>
                </select>
              </div>
              <div className="field"><label>Current belt / level</label>
                <select value={form.current_belt} onChange={set('current_belt')}>
                  <option value="">Select…</option>
                  {currentBeltList.map(b => <option key={b}>{b}</option>)}
                </select>
              </div>
            </div>

            <div className="field"><label>Grading for <span className="required">*</span></label>
              <select value={form.grading_for} onChange={set('grading_for')} required>
                <option value="">Select next grade…</option>
                {nextBelts.map(b => <option key={b}>{b}</option>)}
                {nextBelts.length === 0 && currentBeltList.map(b => <option key={b}>{b}</option>)}
              </select>
              {form.discipline === 'PKA' && form.current_belt && (
                <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
                  Auto-filled from the {ageBand} grade order — change it if you're grading for something else.
                </p>
              )}
            </div>

            <div className="field">
              <label>Sessions attended</label>
              {classAssignments.length === 0 ? (
                <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>No classes assigned yet — ask your coach to add you to a class.</p>
              ) : (
                <>
                  <ul style={{ margin: '0 0 8px', paddingLeft: 18, fontSize: 13, color: 'var(--text-secondary)' }}>
                    {classAssignments.map(a => (
                      <li key={a.class_id}>{a.classes?.name} — {a.classes?.day_of_week} {a.classes?.start_time?.slice(0, 5)}</li>
                    ))}
                  </ul>
                  <p style={{ fontSize: 13 }}>
                    {sessionStats
                      ? <><strong>{sessionStats.attended}</strong> of <strong>{sessionStats.possible}</strong> possible sessions attended in the last {SESSION_WINDOW_DAYS} days</>
                      : 'Loading attendance…'}
                  </p>
                </>
              )}
            </div>

            <div className="field">
              <label>Contact number</label>
              <input value={form.contact_phone} onChange={set('contact_phone')} placeholder="e.g. 07xxx xxxxxx" />
            </div>

            <div className="field">
              <label>Current fitness & technique comments</label>
              <textarea rows={2} value={form.fitness_comments} onChange={set('fitness_comments')}
                placeholder="How do you feel about your current level and readiness?" style={{ resize: 'none' }} />
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
              disabled={!form.grading_for || submitting}>
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
