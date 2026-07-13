import { supabase } from '../lib/supabase.js'
import { generateStudentId } from './studentId.js'

// Auto-assign house by lowest member count
export async function autoAssignHouse() {
  const { data: houses } = await supabase
    .from('houses')
    .select('id, name, colour')
  if (!houses?.length) return null

  const counts = await Promise.all(
    houses.map(async h => {
      const { count } = await supabase
        .from('members')
        .select('id', { count: 'exact', head: true })
        .eq('house_id', h.id)
      return { ...h, count: count || 0 }
    })
  )
  return counts.sort((a, b) => a.count - b.count)[0]
}

// Create member + student record, return { member, student, house, error }
export async function createMemberAndStudent({ form, discipline, guardianEmail }) {
  try {
    const house = await autoAssignHouse()
    const email = guardianEmail || form.email
    const dob = form.dob || form.student_dob || ''

    // Only check for a duplicate account on self-registration -- siblings
    // registered via a guardian's email are expected to share that email
    if (!guardianEmail) {
      const { data: existing } = await supabase.from('members').select('id').ilike('email', email).maybeSingle()
      if (existing) {
        return { error: { message: 'An account with this email already exists. Please log in instead, or contact us if you need help accessing it.' } }
      }
    }

    // Auth signup
    const { data: authData, error: authErr } = await supabase.auth.signUp({
      email,
      password: Math.random().toString(36).slice(-10) + 'A1!',
      options: { emailRedirectTo: `${window.location.origin}/login` }
    })
    if (authErr) throw authErr

    const studentRef = generateStudentId(form.first_name, form.last_name, dob)

    // Member record
    const { data: member, error: memberErr } = await supabase.from('members').insert({
      auth_id: authData.user?.id,
      member_id: studentRef,
      first_name: form.first_name,
      last_name: form.last_name,
      email,
      phone: form.mobile_phone || form.phone || '',
      date_of_birth: dob || null,
      address_line1: form.address || '',
      house_id: house?.id || null,
      role: 'member',
      status: form.pay_method === 'bank' ? 'pending' : 'active',
      payment_method: form.pay_method || 'bank',
      ec_name: form.ec_name || '',
      ec_phone: form.ec_phone || '',
      ec_relationship: form.ec_relationship || '',
      joined_date: new Date().toISOString().split('T')[0],
    }).select().single()
    if (memberErr) throw memberErr

    // Age calc
    const age = dob ? Math.floor((Date.now() - new Date(dob)) / (365.25 * 24 * 60 * 60 * 1000)) : 0
    const ageCategory = age < 8 ? 'Under 8' : age <= 11 ? '8-11' : age <= 15 ? '12-15' : age <= 17 ? '16-17' : '18+'

    // Student record
    const { data: student, error: stuErr } = await supabase.from('students').insert({
      member_id: member.id,
      student_ref: studentRef,
      discipline,
      pka_belt: discipline === 'PKA' ? 'Ungraded' : null,
      krba_level: discipline === 'KRBA' ? 'Beginner' : null,
      age_category: ageCategory,
      media_restriction: form.media || 'Yes',
      medical_conditions: form.medical || null,
      guardian_name: form.guardian_name || form.parents_carers || null,
      guardian_phone: form.guardian_phone || form.mobile_phone || null,
      guardian_email: guardianEmail || null,
      guardian_relationship: form.guardian_relationship || 'Parent',
      ec_name: form.ec_name || null,
      ec_phone: form.ec_phone || null,
      ec_relationship: form.ec_relationship || null,
    }).select().single()
    if (stuErr) throw stuErr

    return { member, student, house, error: null }
  } catch (error) {
    return { member: null, student: null, house: null, error }
  }
}

// Goal rating component (1-4 stars used in PKA forms)
export function GoalRating({ label, value, onChange }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 0', borderBottom: '1px solid var(--border)' }}>
      <span style={{ fontSize: 13, flex: 1 }}>{label}</span>
      <div style={{ display: 'flex', gap: 4 }}>
        {[1, 2, 3, 4].map(n => (
          <button key={n} onClick={() => onChange(n)} style={{
            width: 28, height: 28, borderRadius: '50%', border: '1px solid var(--border-strong)',
            background: value >= n ? 'var(--text)' : 'var(--bg-secondary)',
            color: value >= n ? 'var(--bg)' : 'var(--text-secondary)',
            fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-sans)',
          }}>{n}</button>
        ))}
      </div>
    </div>
  )
}

// Step progress bar
export function StepBar({ steps, current }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', marginBottom: 24, overflowX: 'auto', gap: 0 }}>
      {steps.map((s, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', flex: i < steps.length - 1 ? 1 : 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            <div style={{
              width: 26, height: 26, borderRadius: '50%', fontSize: 11, fontWeight: 600,
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              background: i < current ? '#eaf3de' : i === current ? 'var(--text)' : 'var(--bg)',
              color: i < current ? '#3b6d11' : i === current ? '#fff' : 'var(--text-tertiary)',
              border: `1px solid ${i < current ? '#c0dd97' : i === current ? 'var(--text)' : 'var(--border-strong)'}`,
            }}>{i < current ? '✓' : i + 1}</div>
            <span style={{ fontSize: 11, whiteSpace: 'nowrap', color: i === current ? 'var(--text)' : 'var(--text-tertiary)', fontWeight: i === current ? 500 : 400 }}>{s}</span>
          </div>
          {i < steps.length - 1 && <div style={{ flex: 1, height: 1, background: 'var(--border)', margin: '0 8px', minWidth: 12 }} />}
        </div>
      ))}
    </div>
  )
}

// Payment section (shared)
export function PaymentSection({ form, setForm, joiningFee, monthlyFee, label = 'joining fee' }) {
  const METHODS = [
    { id: 'stripe',  icon: '💳', label: 'Card',          sub: 'Stripe' },
    { id: 'paypal',  icon: '🅿️', label: 'PayPal',        sub: 'PayPal' },
    { id: 'bank',    icon: '🏦', label: 'Bank transfer',  sub: 'BACS' },
  ]
  return (
    <div>
      <div style={{ background: 'var(--bg-secondary)', borderRadius: 'var(--radius)', padding: '12px 14px', marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '3px 0' }}>
          <span>{label} (once-off)</span><strong>£{joiningFee}.00</strong>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '3px 0' }}>
          <span>Monthly (standing order)</span><strong>£{monthlyFee}.00/mo</strong>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, fontWeight: 700, paddingTop: 8, marginTop: 4, borderTop: '1px solid var(--border)' }}>
          <span>Due today</span><span>£{joiningFee + monthlyFee}.00</span>
        </div>
      </div>
      <p style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Pay {label} via</p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 14 }}>
        {METHODS.map(m => (
          <div key={m.id} onClick={() => setForm(f => ({ ...f, pay_method: m.id }))} style={{
            border: `${form.pay_method === m.id ? 2 : 1}px solid ${form.pay_method === m.id ? 'var(--text)' : 'var(--border-strong)'}`,
            borderRadius: 'var(--radius)', padding: '10px 8px', textAlign: 'center', cursor: 'pointer',
            background: form.pay_method === m.id ? 'var(--bg-secondary)' : 'var(--bg)',
          }}>
            <div style={{ fontSize: 20, marginBottom: 4 }}>{m.icon}</div>
            <div style={{ fontSize: 12, fontWeight: 500 }}>{m.label}</div>
            <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{m.sub}</div>
          </div>
        ))}
      </div>
      {form.pay_method === 'stripe' && (
        <div>
          <div className="field"><label>Card number</label><input placeholder="1234 5678 9012 3456" maxLength={19} /></div>
          <div className="field-row">
            <div className="field"><label>Expiry</label><input placeholder="MM / YY" maxLength={7} /></div>
            <div className="field"><label>CVC</label><input placeholder="123" maxLength={4} /></div>
          </div>
          <div className="field"><label>Name on card</label><input placeholder={`${form.first_name || ''} ${form.last_name || ''}`.trim()} /></div>
        </div>
      )}
      {form.pay_method === 'paypal' && (
        <div style={{ textAlign: 'center', padding: '16px 0', color: 'var(--text-secondary)', fontSize: 13 }}>
          You'll be redirected to PayPal to complete payment after submitting.
        </div>
      )}
      {form.pay_method === 'bank' && (
        <div style={{ background: 'var(--bg-secondary)', borderRadius: 'var(--radius)', padding: '12px 14px', fontSize: 13 }}>
          <p style={{ fontWeight: 600, marginBottom: 8 }}>Bank transfer details</p>
          {[['Account name','PKA / KRBA Sports Club'],['Sort code','12-34-56'],['Account no.','87654321'],
            ['Reference', `PKA-${(form.first_name || 'NEW').toUpperCase().slice(0,3)}${(form.last_name || '').toUpperCase().slice(0,3)}`]
          ].map(([k, v]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}>
              <span style={{ color: 'var(--text-secondary)' }}>{k}</span><strong>{v}</strong>
            </div>
          ))}
          <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 8 }}>Account activated 1–2 working days after payment confirmed.</p>
        </div>
      )}
    </div>
  )
}

// Liability text
export const LIABILITY_TEXT = `In consideration for my attendance and participation in this school's martial arts training I, the student/parent acknowledge the existence of certain inherent risks in this type of training and hereby agree to assume all risks. I further relieve the school its management assigned staff and fellow students from any liability resulting from personal injury or loss of personal belongings. I also hereby state that the students named above are physically fit to take the prescribed course of instruction and do so of their own free will for an agreed upon fee. I understand there is no refund policy on any monies I pay to this school.`

export const SIGNATURE_TEXT = `I agree and understand that my name, phone number, postcode and date of birth will act as my signature.`

export const HEAR_ABOUT_OPTIONS = [
  'Search Engine (Google, Yahoo etc.)',
  'Word of Mouth',
  'Facebook Ads',
  'Instagram',
  'Leaflet / Flyer',
  'School',
  'Existing Member',
  'Other',
]
