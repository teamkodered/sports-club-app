import { useState } from 'react'
import { supabase } from '../../lib/supabase.js'
import { generateStudentId } from '../../lib/studentId.js'

const STEPS = ['Your details', 'Medical & Emergency', 'Waiver', 'Done']

export default function JoinKRBA() {
  const [step, setStep] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [studentRef, setStudentRef] = useState('')
  const [form, setForm] = useState({
    full_name: '', address: '', postcode: '', dob: '',
    home_phone: '', mobile_phone: '', email: '',
    additional_needs: '', medical_concerns: '', medication: '',
    emergency_contact: '', previous_club: '', media_permission: '',
    waiver_agreed: false, signed_name: '', signed_date: '',
  })

  function set(field) { return e => setForm(f => ({ ...f, [field]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })) }

  async function submit() {
    setSubmitting(true)
    try {
      const parts = form.full_name.trim().split(' ')
      const first_name = parts[0]
      const last_name = parts.slice(1).join(' ')
      const ref = generateStudentId(last_name, first_name, form.dob)
      setStudentRef(ref)

      const { data: member, error: mErr } = await supabase.from('members').insert({
        member_id: ref, first_name, last_name,
        email: form.email, phone: form.mobile_phone, date_of_birth: form.dob,
        address_line1: form.address, role: 'member', status: 'pending',
        joined_date: new Date().toISOString().split('T')[0],
      }).select().single()
      if (mErr) throw mErr

      await supabase.from('students').insert({
        member_id: member.id, student_ref: ref, discipline: 'KRBA',
        media_restriction: form.media_permission === 'Yes' ? 'Yes' : 'No',
        medical_conditions: form.medical_concerns || null,
        medication: form.medication || null,
      })

      await supabase.from('membership_forms').insert({
        student_id: member.id, form_type: 'krba',
        additional_needs: form.additional_needs,
        previous_club: form.previous_club,
        emergency_contact_name: form.emergency_contact,
        waiver_agreed: form.waiver_agreed,
        submitted_at: new Date().toISOString(),
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
        <p style={{ fontSize: 12, color: 'var(--text-tertiary)', fontFamily: 'monospace', background: 'var(--bg-secondary)', padding: '6px 12px', borderRadius: 'var(--radius)', display: 'inline-block' }}>Student ID: {studentRef}</p>
      </div>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-tertiary)', padding: '24px 16px' }}>
      <div style={{ maxWidth: 520, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>🥊</div>
          <h1 style={{ fontSize: 20, fontWeight: 600 }}>KRBA Membership</h1>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Kode Red Boxing Academy</p>
        </div>
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 500 }}>{STEPS[step]}</span>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Step {step + 1} of {STEPS.length - 1}</span>
          </div>
          <div style={{ height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${progress}%`, background: '#E24B4A', transition: 'width 0.3s', borderRadius: 2 }} />
          </div>
        </div>
        <div className="card">
          {step === 0 && <>
            <div className="field"><label>Full name <span className="required">*</span></label><input value={form.full_name} onChange={set('full_name')} placeholder="First and last name" /></div>
            <div className="field"><label>Address <span className="required">*</span></label><input value={form.address} onChange={set('address')} /></div>
            <div className="field"><label>Postcode</label><input value={form.postcode} onChange={set('postcode')} /></div>
            <div className="field"><label>Date of birth <span className="required">*</span></label><input type="date" value={form.dob} onChange={set('dob')} /></div>
            <div className="field-row">
              <div className="field"><label>Home phone</label><input type="tel" value={form.home_phone} onChange={set('home_phone')} /></div>
              <div className="field"><label>Mobile phone <span className="required">*</span></label><input type="tel" value={form.mobile_phone} onChange={set('mobile_phone')} /></div>
            </div>
            <div className="field"><label>Email</label><input type="email" value={form.email} onChange={set('email')} /></div>
            <div className="field"><label>Previous club details</label><input value={form.previous_club} onChange={set('previous_club')} /></div>
            <div className="field"><label>Media permissions <span className="required">*</span></label>
              <select value={form.media_permission} onChange={set('media_permission')}>
                <option value="">Select…</option>
                <option value="Yes">Yes — I agree to photos/videos</option>
                <option value="No">No — I do not consent</option>
              </select>
            </div>
          </>}
          {step === 1 && <>
            <div className="field"><label>Additional needs</label><textarea rows={2} value={form.additional_needs} onChange={set('additional_needs')} placeholder="None if not applicable" style={{ resize: 'none' }} /></div>
            <div className="field"><label>Medical concerns</label><textarea rows={3} value={form.medical_concerns} onChange={set('medical_concerns')} placeholder="Any medical conditions, allergies or disabilities. None if not applicable." style={{ resize: 'none' }} /></div>
            <div className="field"><label>Medication</label><textarea rows={2} value={form.medication} onChange={set('medication')} placeholder="Any medication. None if not applicable." style={{ resize: 'none' }} /></div>
            <div className="field"><label>Emergency contact</label><input value={form.emergency_contact} onChange={set('emergency_contact')} placeholder="Name and phone number" /></div>
          </>}
          {step === 2 && <>
            <div style={{ background: 'var(--bg-secondary)', borderRadius: 'var(--radius)', padding: 14, marginBottom: 16, fontSize: 12, lineHeight: 1.7, color: 'var(--text-secondary)' }}>
              In consideration for my attendance and participation in this school's boxing training I acknowledge the existence of certain inherent risks and hereby agree to assume all risks. I relieve the school, its management, assigned staff and fellow students from any liability resulting from personal injury or loss of personal belongings. I confirm I am physically fit to take the prescribed course of instruction. I understand there is no refund policy on any monies paid to this school.
            </div>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 16, cursor: 'pointer', fontSize: 13 }}>
              <input type="checkbox" checked={form.waiver_agreed} onChange={set('waiver_agreed')} style={{ marginTop: 2 }} />
              I have read and agree to the above terms and conditions.
            </label>
            <div className="field"><label>Your name (signature)</label><input value={form.signed_name} onChange={set('signed_name')} /></div>
            <div className="field"><label>Date</label><input type="date" value={form.signed_date || new Date().toISOString().split('T')[0]} onChange={set('signed_date')} /></div>
          </>}
          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            {step > 0 && <button className="btn" onClick={() => setStep(s => s - 1)}>← Back</button>}
            {step < STEPS.length - 2 ? (
              <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={() => setStep(s => s + 1)}
                disabled={step === 0 && (!form.full_name || !form.dob || !form.mobile_phone || !form.media_permission)}>
                Continue →
              </button>
            ) : (
              <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={submit} disabled={submitting || !form.waiver_agreed}>
                {submitting ? 'Submitting…' : 'Submit application'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
