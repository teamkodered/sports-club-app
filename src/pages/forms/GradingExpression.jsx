import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase.js'
import { useAuth } from '../../hooks/useAuth.jsx'

export default function GradingExpression() {
  const { profile, session } = useAuth()
  const [belts, setBelts] = useState([])
  const [student, setStudent] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')

  const [form, setForm] = useState({
    discipline: 'PKA',
    current_belt: '',
    grading_for: '',
    classes_attended: '',
    competition_history: '',
    fitness_comments: '',
    coach_name: '',
    student_notes: '',
  })

  function set(field) {
    return e => setForm(f => ({ ...f, [field]: e.target.value }))
  }

  useEffect(() => { if (session) loadStudentAndBelts() }, [session])

  async function loadStudentAndBelts() {
    // Get student record
    if (profile?.id) {
      const { data } = await supabase
        .from('students')
        .select('*, members(first_name, last_name)')
        .eq('member_id', profile.id)
        .single()
      if (data) {
        setStudent(data)
        setForm(f => ({
          ...f,
          discipline: data.discipline || 'PKA',
          current_belt: data.pka_belt || data.krba_level || '',
        }))
      }
    }

    // Load belts from settings
    const { data } = await supabase.from('settings').select('key,value')
      .in('key', ['pka_junior_belts', 'pka_senior_belts', 'krba_levels'])
    if (data) {
      const map = Object.fromEntries(data.map(r => [r.key, r.value]))
      const age = student ? Math.floor((Date.now() - new Date(student.members?.date_of_birth)) / (365.25 * 24 * 60 * 60 * 1000)) : 20
      const pkaList = age < 16 ? map.pka_junior_belts : map.pka_senior_belts
      setBelts({ PKA: pkaList || [], KRBA: map.krba_levels || [] })
    }
  }

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
          classes_attended: form.classes_attended,
          competition_history: form.competition_history,
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

  const currentBeltList = belts[form.discipline] || []
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
          <div style={{ fontSize: 36, marginBottom: 8 }}>🎽</div>
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
            </div>

            <div className="field">
              <label>Approximate classes attended since last grading</label>
              <input type="number" min="0" value={form.classes_attended} onChange={set('classes_attended')} placeholder="e.g. 24" />
            </div>

            <div className="field">
              <label>Competition history (if applicable)</label>
              <textarea rows={2} value={form.competition_history} onChange={set('competition_history')}
                placeholder="Any competitions entered or results to note…" style={{ resize: 'none' }} />
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
