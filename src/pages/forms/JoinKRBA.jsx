import { useState } from 'react'
import { supabase } from '../../lib/supabase.js'
import FormLogo from '../../components/shared/FormLogo.jsx'
import { generateStudentId } from '../../lib/studentId.js'
import { useFormDraft } from '../../hooks/useFormDraft.js'
import { useReturningPerson } from '../../hooks/useReturningPerson.js'

const STEPS = ['Your details', 'Medical & Emergency', 'Waiver', 'Done']
const HEAR_OPTIONS = ['Search Engine (Google etc)', 'Word of Mouth', 'Social Media', 'Walked Past', 'Leaflet/Poster', 'Other']

export default function JoinKRBA() {
  const [step, setStep] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [studentRef, setStudentRef] = useState('')
  const [form, setForm] = useState({
    full_name: '', address: '', postcode: '', dob: '',
    home_phone: '', mobile_phone: '', email: '',
    additional_needs: '', medical_concerns: '', medication: '',
    emergency_contact: '', previous_club: '', media_permission: '', hear_about: '',
    waiver_agreed: false, signed_name: '', signed_date: '',
  })

  const draft = useFormDraft('krba', form, setForm, step, setStep)
  const [copiedLink, setCopiedLink] = useState(false)
  const returning = useReturningPerson()

  function set(field) { return e => setForm(f => ({ ...f, [field]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })) }

  async function submit() {
    setSubmitting(true)
    try {
      // Uses the same SECURITY DEFINER RPC as the "welcome back" lookup
      // -- this needs to work anonymously (before the person has an
      // account), so it can't rely on a raw table read once that's
      // locked down to authenticated-only.
      const { data: existingRows } = await supabase.rpc('lookup_member_by_email', { p_email: form.email })
      if (existingRows && existingRows.length && existingRows[0].member_exists) throw new Error('An account with this email already exists. Please contact us if you need help accessing it, rather than submitting a new form.')

      const parts = form.full_name.trim().split(' ')
      const first_name = parts[0]
      const last_name = parts.slice(1).join(' ')
      const ref = generateStudentId(last_name, first_name, form.dob)
      setStudentRef(ref)

      const memberId = crypto.randomUUID()
      const { error: mErr } = await supabase.from('members').insert({
        id: memberId,
        member_id: ref, first_name, last_name,
        email: form.email, phone: form.mobile_phone, date_of_birth: form.dob,
        address_line1: form.address, role: 'member', status: 'pending',
        joined_date: new Date().toISOString().split('T')[0],
      })
      if (mErr) throw mErr

      const { error: sErr } = await supabase.from('students').insert({
        member_id: memberId, student_ref: ref, discipline: 'KRBA',
        media_restriction: form.media_permission === 'Yes' ? 'Yes' : 'No',
        medical_conditions: form.medical_concerns || null,
        medication: form.medication || null,
      })
      if (sErr) throw sErr

      const { error: mfErr } = await supabase.from('membership_forms').insert({
        member_id: memberId, form_type: 'krba',
        additional_needs: form.additional_needs,
        previous_club: form.previous_club,
        emergency_contact_name: form.emergency_contact,
        waiver_agreed: form.waiver_agreed,
        hear_about: form.hear_about,
        submitted_at: new Date().toISOString(),
      })
      if (mfErr) console.error('Error saving membership_forms entry:', mfErr)
      await draft.clearOnSubmit()
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

  if (draft.hasPendingResume) return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div className="card" style={{ maxWidth: 420, textAlign: 'center', padding: 32 }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>👋</div>
        <h1 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Welcome back!</h1>
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 20 }}>
          Looks like you started this form before. Would you like to continue where you left off, or start fresh?
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" style={{ flex: 1, justifyContent: 'center' }} onClick={draft.discard}>Start fresh</button>
          <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={draft.resume}>Continue</button>
        </div>
      </div>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-tertiary)', padding: '24px 16px' }}>
      <div style={{ maxWidth: 520, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <FormLogo formKey="krba" fallbackEmoji="🥊" />
          <h1 style={{ fontSize: 20, fontWeight: 600 }}>KRBA Membership</h1>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Kode Red Boxing Academy</p>
          <button className="btn btn-sm" style={{ marginTop: 10 }} onClick={() => {
            navigator.clipboard.writeText(draft.resumeLink)
            setCopiedLink(true)
            setTimeout(() => setCopiedLink(false), 2000)
          }}>{copiedLink ? '✓ Link copied!' : '🔗 Copy link to finish later'}</button>
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
            <div className="field"><label>Email</label>
              <input type="email" value={form.email} onChange={e => { set('email')(e); returning.checkEmail(e.target.value) }} />
            </div>
            {returning.match && (
              <div className="card" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-strong)', marginBottom: 14, padding: 12 }}>
                <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Welcome back!</p>
                <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 10 }}>
                  We can fill in your contact details from before. Use those?
                </p>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-sm" onClick={returning.dismiss}>No, enter fresh</button>
                  <button className="btn btn-sm btn-primary" onClick={() => {
                    const m = returning.match
                    setForm(f => ({
                      ...f,
                      address: m.address_line1 || f.address,
                      mobile_phone: m.phone || f.mobile_phone,
                      emergency_contact: m.emergencyContact?.emergency_contact_name
                        ? `${m.emergencyContact.emergency_contact_name}${m.emergencyContact.emergency_contact_phone ? ` — ${m.emergencyContact.emergency_contact_phone}` : ''}`
                        : f.emergency_contact,
                    }))
                    returning.dismiss()
                  }}>Yes, use those</button>
                </div>
              </div>
            )}
            <div className="field"><label>Previous club details</label><input value={form.previous_club} onChange={set('previous_club')} /></div>
            <div className="field"><label>How did you hear about us?</label>
              <select value={form.hear_about} onChange={set('hear_about')}>
                <option value="">Select…</option>
                {HEAR_OPTIONS.map(o => <option key={o}>{o}</option>)}
              </select>
            </div>
            <div className="field"><label>Media permissions <span className="required">*</span></label>
              <select value={form.media_permission} onChange={set('media_permission')}>
                <option value="">Select…</option>
                <option value="Yes">Yes — photos/videos of me may be used for promotional material (e.g. social media, website, marketing)</option>
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
