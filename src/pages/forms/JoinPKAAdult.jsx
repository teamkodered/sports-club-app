import { useState } from 'react'
import { supabase } from '../../lib/supabase.js'
import { generateStudentId } from '../../lib/studentId.js'

const STEPS = ['Your details', 'Contact', 'Goals & Fitness', 'Medical', 'Waiver', 'Done']
const GOALS = [
  'Health - Physical Fitness, Stress Reduction, Relaxation',
  'Appearance - Weight Control, Muscle Tone, Posture',
  'Performance - Endurance, Flexibility, Mental Focus',
  'Self Defence - Safety, Confidence, Awareness',
]
const FITNESS_LEVELS = ['Poor', 'Below Average', 'Average', 'Good', 'Excellent']
const HEAR_OPTIONS = ['Search Engine (Google etc)', 'Word of Mouth', 'Social Media', 'Walked Past', 'Leaflet/Poster', 'Other']

export default function JoinPKAAdult() {
  const [step, setStep] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [studentRef, setStudentRef] = useState('')
  const [form, setForm] = useState({
    first_name: '', last_name: '', dob: '', address: '',
    home_phone: '', work_phone: '', mobile_phone: '', email: '', other_contact: '',
    media_permission: '', hear_about: '', promo_code: '',
    goals: [], goal_notes: '', fitness_level: '', other_activities: '',
    medical_concerns: '',
    waiver_agreed: false, signature_name: '', signature_dob: '', signature_postcode: '', signature_phone: '',
  })

  function set(field) { return e => setForm(f => ({ ...f, [field]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })) }
  function toggleGoal(g) { setForm(f => ({ ...f, goals: f.goals.includes(g) ? f.goals.filter(x => x !== g) : [...f.goals, g] })) }

  async function submit() {
    setSubmitting(true)
    try {
      const ref = generateStudentId(form.last_name, form.first_name, form.dob)
      setStudentRef(ref)
      const age = form.dob ? Math.floor((Date.now() - new Date(form.dob)) / (365.25*24*60*60*1000)) : 0
      const ageCategory = age < 18 ? '16-17' : '18+'

      const { data: member, error: mErr } = await supabase.from('members').insert({
        member_id: ref, first_name: form.first_name, last_name: form.last_name,
        email: form.email, phone: form.mobile_phone, date_of_birth: form.dob,
        address_line1: form.address, role: 'member', status: 'pending',
        joined_date: new Date().toISOString().split('T')[0],
      }).select().single()
      if (mErr) throw mErr

      await supabase.from('students').insert({
        member_id: member.id, student_ref: ref, discipline: 'PKA', age_category: ageCategory,
        media_restriction: form.media_permission === 'Yes' ? 'Yes' : 'No',
        medical_conditions: form.medical_concerns || null,
      })

      await supabase.from('membership_forms').insert({
        student_id: member.id, form_type: 'pka_adult',
        hear_about: form.hear_about, promo_code: form.promo_code,
        goals: form.goals, goal_notes: form.goal_notes,
        fitness_level: form.fitness_level, other_activities: form.other_activities,
        waiver_agreed: form.waiver_agreed, submitted_at: new Date().toISOString(),
      })
      setSubmitted(true)
    } catch (err) { alert('Error: ' + err.message) }
    setSubmitting(false)
  }

  const progress = Math.round((step / (STEPS.length - 1)) * 100)

  if (submitted) return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div className="card" style={{ maxWidth: 420, textAlign: 'center', padding: 32 }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
        <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>Application received!</h1>
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 6 }}>Welcome, {form.first_name}!</p>
        <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 20, fontFamily: 'monospace', background: 'var(--bg-secondary)', padding: '6px 12px', borderRadius: 'var(--radius)' }}>Student ID: {studentRef}</p>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Your application is pending coach approval.</p>
      </div>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-tertiary)', padding: '24px 16px' }}>
      <div style={{ maxWidth: 520, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>🥋</div>
          <h1 style={{ fontSize: 20, fontWeight: 600 }}>PKA Adult Membership</h1>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>For members 16 and over</p>
        </div>
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 500 }}>{STEPS[step]}</span>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Step {step + 1} of {STEPS.length - 1}</span>
          </div>
          <div style={{ height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${progress}%`, background: '#378ADD', transition: 'width 0.3s', borderRadius: 2 }} />
          </div>
        </div>
        <div className="card">
          {step === 0 && <>
            <div className="field-row">
              <div className="field"><label>First name <span className="required">*</span></label><input value={form.first_name} onChange={set('first_name')} /></div>
              <div className="field"><label>Surname <span className="required">*</span></label><input value={form.last_name} onChange={set('last_name')} /></div>
            </div>
            <div className="field"><label>Date of birth <span className="required">*</span></label><input type="date" value={form.dob} onChange={set('dob')} /></div>
            <div className="field"><label>Address <span className="required">*</span></label><input value={form.address} onChange={set('address')} /></div>
          </>}
          {step === 1 && <>
            <div className="field-row">
              <div className="field"><label>Home phone</label><input type="tel" value={form.home_phone} onChange={set('home_phone')} /></div>
              <div className="field"><label>Work phone</label><input type="tel" value={form.work_phone} onChange={set('work_phone')} /></div>
            </div>
            <div className="field"><label>Mobile phone <span className="required">*</span></label><input type="tel" value={form.mobile_phone} onChange={set('mobile_phone')} /></div>
            <div className="field"><label>Email <span className="required">*</span></label><input type="email" value={form.email} onChange={set('email')} /></div>
            <div className="field"><label>Other / emergency contact</label><input value={form.other_contact} onChange={set('other_contact')} /></div>
            <div className="field"><label>Media permissions <span className="required">*</span></label>
              <select value={form.media_permission} onChange={set('media_permission')}>
                <option value="">Select…</option>
                <option value="Yes">Yes — I agree to photos/videos</option>
                <option value="No">No — I do not consent</option>
              </select>
            </div>
            <div className="field"><label>How did you hear about us?</label>
              <select value={form.hear_about} onChange={set('hear_about')}>
                <option value="">Select…</option>
                {HEAR_OPTIONS.map(o => <option key={o}>{o}</option>)}
              </select>
            </div>
            <div className="field"><label>Promo code</label><input value={form.promo_code} onChange={set('promo_code')} /></div>
          </>}
          {step === 2 && <>
            <div className="field">
              <label>Goals <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>(select all that apply)</span></label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 6 }}>
                {GOALS.map(g => (
                  <label key={g} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', padding: '8px 10px', borderRadius: 'var(--radius)', border: `1px solid ${form.goals.includes(g) ? 'var(--text)' : 'var(--border)'}`, background: form.goals.includes(g) ? 'var(--bg-secondary)' : 'var(--bg)' }}>
                    <input type="checkbox" checked={form.goals.includes(g)} onChange={() => toggleGoal(g)} style={{ marginTop: 2, flexShrink: 0, width: 15, height: 15 }} />
                    <span style={{ fontSize: 13, lineHeight: 1.5 }}>{g}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="field"><label>What do you want to accomplish?</label><textarea rows={2} value={form.goal_notes} onChange={set('goal_notes')} style={{ resize: 'none' }} /></div>
            <div className="field"><label>Current fitness level</label>
              <select value={form.fitness_level} onChange={set('fitness_level')}>
                <option value="">Select…</option>
                {FITNESS_LEVELS.map(f => <option key={f}>{f}</option>)}
              </select>
            </div>
            <div className="field"><label>Other sports / activities</label><input value={form.other_activities} onChange={set('other_activities')} /></div>
          </>}
          {step === 3 && <>
            <div className="field"><label>Medical concerns</label>
              <textarea rows={4} value={form.medical_concerns} onChange={set('medical_concerns')} placeholder="Any medical conditions, allergies or disabilities. Write None if not applicable." style={{ resize: 'none' }} />
            </div>
          </>}
          {step === 4 && <>
            <div style={{ background: 'var(--bg-secondary)', borderRadius: 'var(--radius)', padding: 14, marginBottom: 16, fontSize: 12, lineHeight: 1.7, color: 'var(--text-secondary)' }}>
              In consideration for my attendance and participation in this school's martial arts training I, the student/parent acknowledge the existence of certain inherent risks in this type of training and hereby agree to assume all risks. I further relieve the school its management assigned staff and fellow students from any liability resulting from personal injury or loss of personal belongings. I also hereby state that the students named above are physically fit to take the prescribed course of instruction and do so of their own free will for an agreed upon fee. I understand there is no refund policy on any monies I pay to this school.
            </div>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 16, cursor: 'pointer', fontSize: 13 }}>
              <input type="checkbox" checked={form.waiver_agreed} onChange={set('waiver_agreed')} style={{ marginTop: 2 }} />
              I agree and understand that my name, phone number, postcode and date of birth will act as my signature.
            </label>
            <div className="field-row">
              <div className="field"><label>First name</label><input value={form.signature_name || form.first_name} onChange={set('signature_name')} /></div>
              <div className="field"><label>Surname</label><input value={form.last_name} readOnly style={{ opacity: 0.7 }} /></div>
            </div>
            <div className="field-row">
              <div className="field"><label>Date of birth</label><input type="date" value={form.signature_dob || form.dob} onChange={set('signature_dob')} /></div>
              <div className="field"><label>Postcode</label><input value={form.signature_postcode} onChange={set('signature_postcode')} /></div>
            </div>
            <div className="field"><label>Phone number</label><input type="tel" value={form.signature_phone || form.mobile_phone} onChange={set('signature_phone')} /></div>
          </>}
          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            {step > 0 && <button className="btn" onClick={() => setStep(s => s - 1)}>← Back</button>}
            {step < STEPS.length - 2 ? (
              <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={() => setStep(s => s + 1)}
                disabled={(step === 0 && (!form.first_name || !form.last_name || !form.dob)) || (step === 1 && (!form.email || !form.mobile_phone || !form.media_permission))}>
                Continue →
              </button>
            ) : (
              <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={submit} disabled={submitting || !form.waiver_agreed || !form.signature_name || !form.signature_dob || !form.signature_postcode || !form.signature_phone}>
                {submitting ? 'Submitting…' : 'Submit application'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
