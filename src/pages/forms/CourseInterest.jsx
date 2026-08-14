import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabasePublic as supabase } from '../../lib/supabasePublic.js'

export default function CourseInterest() {
  const [searchParams] = useSearchParams()
  const courseId = searchParams.get('course_id')
  const [course, setCourse] = useState(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({ name: '', email: '', phone: '', notes: '' })

  useEffect(() => {
    if (!courseId) { setLoading(false); return }
    supabase.from('courses').select('*').eq('id', courseId).single()
      .then(({ data }) => { setCourse(data); setLoading(false) })
  }, [courseId])

  function set(field) {
    return e => setForm(f => ({ ...f, [field]: e.target.value }))
  }

  async function submit(e) {
    e.preventDefault()
    if (!form.name.trim() || (!form.email.trim() && !form.phone.trim())) {
      setError('Please give your name and at least an email or phone number.')
      return
    }
    setError('')
    setSubmitting(true)
    const { error: insertErr } = await supabase.from('course_interest').insert({
      course_id: courseId, name: form.name.trim(), email: form.email.trim() || null,
      phone: form.phone.trim() || null, notes: form.notes.trim() || null,
    })
    setSubmitting(false)
    if (insertErr) { setError('Something went wrong submitting this — please try again.'); return }
    setSubmitted(true)
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-tertiary)' }}>
      <div className="loading">Loading…</div>
    </div>
  )

  if (!courseId || !course) return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-tertiary)', padding: '32px 16px' }}>
      <div style={{ maxWidth: 480, margin: '0 auto' }} className="card">
        <h1 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Course not found</h1>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>This link doesn't point to a valid course — please check with your coach for the correct link.</p>
      </div>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-tertiary)', padding: '32px 16px' }}>
      <div style={{ maxWidth: 480, margin: '0 auto' }}>
        <div className="card" style={{ marginBottom: 16 }}>
          {course.poster_url && <img src={course.poster_url} alt="" style={{ width: '100%', borderRadius: 'var(--radius)', marginBottom: 14 }} />}
          <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 6 }}>{course.title}</h1>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 4 }}>
            {new Date(course.start_date).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            {course.end_date ? ` – ${new Date(course.end_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}` : ''}
          </p>
          {course.location && <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>📍 {course.location}</p>}
          {course.price && <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>💷 {course.price}</p>}
          {course.description && <p style={{ fontSize: 13, marginTop: 10, whiteSpace: 'pre-line' }}>{course.description}</p>}
        </div>

        <div className="card">
          {submitted ? (
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <div style={{ fontSize: 40, marginBottom: 10 }}>✅</div>
              <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>Thanks — you're on the list!</h2>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Your coach will be in touch to confirm your place.</p>
            </div>
          ) : (
            <form onSubmit={submit}>
              <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Express your interest</h2>
              <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Name</label>
              <input value={form.name} onChange={set('name')} required style={{ width: '100%', marginBottom: 10 }} />
              <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Email</label>
              <input type="email" value={form.email} onChange={set('email')} style={{ width: '100%', marginBottom: 10 }} />
              <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Phone</label>
              <input type="tel" value={form.phone} onChange={set('phone')} style={{ width: '100%', marginBottom: 10 }} />
              <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Anything else? (optional)</label>
              <textarea value={form.notes} onChange={set('notes')} rows={3} style={{ width: '100%', marginBottom: 12, resize: 'vertical' }} />
              {error && <p style={{ fontSize: 12, color: '#E24B4A', marginBottom: 10 }}>{error}</p>}
              <button type="submit" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} disabled={submitting}>
                {submitting ? 'Submitting…' : 'Submit interest'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
