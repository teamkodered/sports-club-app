import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import { generateStudentId } from '../lib/studentId.js'

const STEPS = ['Your details', 'Emergency contact', 'Payment', 'Welcome']
const PAYMENT_METHODS = [
  { id: 'stripe', label: 'Card', icon: '💳', sub: 'Stripe' },
  { id: 'paypal', label: 'PayPal', icon: '🅿️', sub: 'PayPal' },
  { id: 'bank', label: 'Bank transfer', icon: '🏦', sub: 'BACS' },
]

export default function Join() {
  const [step, setStep] = useState(0)
  const [payMethod, setPayMethod] = useState('stripe')
  const [assignedHouse, setAssignedHouse] = useState(null)
  const [memberId, setMemberId] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const [form, setForm] = useState({
    first_name: '', last_name: '', email: '', phone: '', dob: '', gender: '',
    address_line1: '', address_line2: '',
    ec_name: '', ec_relationship: '', ec_phone: '', ec_email: '', ec_medical: '',
    terms: false,
  })

  function set(field) {
    return e => setForm(f => ({ ...f, [field]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))
  }

  async function autoAssignHouse() {
    const { data: houses } = await supabase
      .from('houses')
      .select('id, name, colour')
    if (!houses?.length) return houses?.[0] || { id: null, name: 'Phoenix', colour: '#e24b4a' }

    const counts = await Promise.all(
      houses.map(async h => {
        const { count } = await supabase.from('members').select('id', { count: 'exact', head: true }).eq('house_id', h.id)
        return { ...h, count: count || 0 }
      })
    )
    return counts.sort((a, b) => a.count - b.count)[0]
  }

  async function handleSubmit() {
    setSubmitting(true)
    setError('')
    try {
      const house = await autoAssignHouse()
      const { data: authData, error: authErr } = await supabase.auth.signUp({
        email: form.email,
        password: Math.random().toString(36).slice(-10) + 'A1!',
        options: { emailRedirectTo: `${window.location.origin}/login` }
      })
      if (authErr) throw authErr

      const mid = `PSC-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`
      const studentRef = generateStudentId(form.first_name, form.last_name, form.dob || '00000000')

      const { error: memberErr } = await supabase.from('members').insert({
        auth_id: authData.user?.id,
        member_id: mid,
        first_name: form.first_name,
        last_name: form.last_name,
        email: form.email,
        phone: form.phone,
        date_of_birth: form.dob || null,
        gender: form.gender || null,
        address_line1: form.address_line1,
        address_line2: form.address_line2,
        house_id: house?.id,
        role: 'member',
        status: payMethod === 'bank' ? 'pending' : 'active',
        payment_method: payMethod,
        ec_name: form.ec_name,
        ec_relationship: form.ec_relationship,
        ec_phone: form.ec_phone,
        ec_email: form.ec_email,
        ec_medical: form.ec_medical,
        joined_date: new Date().toISOString().split('T')[0],
      })
      if (memberErr) throw memberErr

      setAssignedHouse(house)
      setMemberId(mid)
      setStep(3)
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.')
    }
    setSubmitting(false)
  }

  const HOUSE_EMOJI = { 'Dragon House': '🔴', 'Super House': '🔵', 'Ice House': '🟢', 'Jet House': '🟡' }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-tertiary)', padding: '24px 16px' }}>
      <div style={{ maxWidth: 560, margin: '0 auto' }}>

        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>🔥</div>
          <h1 style={{ fontSize: 20, fontWeight: 600 }}>Phoenix Sports Club</h1>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 3 }}>Membership registration</p>
        </div>

        {step < 3 && (
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 24 }}>
            {STEPS.slice(0, 3).map((s, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', flex: i < 2 ? 1 : 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{
                    width: 26, height: 26, borderRadius: '50%', display: 'flex',
                    alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600,
                    flexShrink: 0,
                    background: i < step ? '#eaf3de' : i === step ? 'var(--text)' : 'var(--bg)',
                    color: i < step ? '#3b6d11' : i === step ? '#fff' : 'var(--text-tertiary)',
                    border: `1px solid ${i < step ? '#c0dd97' : i === step ? 'var(--text)' : 'var(--border-strong)'}`,
                  }}>{i < step ? '✓' : i + 1}</div>
                  <span style={{ fontSize: 11, color: i === step ? 'var(--text)' : 'var(--text-tertiary)', fontWeight: i === step ? 500 : 400, whiteSpace: 'nowrap' }}>{s}</span>
                </div>
                {i < 2 && <div style={{ flex: 1, height: 1, background: 'var(--border)', margin: '0 8px' }} />}
              </div>
            ))}
          </div>
        )}

        {step === 0 && (
          <div className="card">
            <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>Personal details</h2>
            <div className="field-row">
              <div className="field"><label>First name <span className="required">*</span></label><input value={form.first_name} onChange={set('first_name')} placeholder="Jamie" required /></div>
              <div className="field"><label>Last name <span className="required">*</span></label><input value={form.last_name} onChange={set('last_name')} placeholder="Taylor" required /></div>
            </div>
            <div className="field"><label>Email <span className="required">*</span></label><input type="email" value={form.email} onChange={set('email')} placeholder="jamie@example.com" required /></div>
            <div className="field"><label>Phone <span className="required">*</span></label><input type="tel" value={form.phone} onChange={set('phone')} placeholder="+44 7700 000000" required /></div>
            <div className="field-row">
              <div className="field"><label>Date of birth</label><input type="date" value={form.dob} onChange={set('dob')} /></div>
              <div className="field"><label>Gender</label>
                <select value={form.gender} onChange={set('gender')}>
                  <option value="">Prefer not to say</option>
                  <option>Male</option><option>Female</option><option>Non-binary</option><option>Other</option>
                </select>
              </div>
            </div>
            <div className="field"><label>Address</label>
              <input value={form.address_line1} onChange={set('address_line1')} placeholder="Street address" style={{ marginBottom: 6 }} />
              <input value={form.address_line2} onChange={set('address_line2')} placeholder="City, postcode" />
            </div>
            <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }}
              onClick={() => { if (form.first_name && form.last_name && form.email && form.phone) setStep(1) }}>
              Continue →
            </button>
          </div>
        )}

        {step === 1 && (
          <div className="card">
            <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>Emergency contact</h2>
            <div className="field"><label>Full name <span className="required">*</span></label><input value={form.ec_name} onChange={set('ec_name')} placeholder="Sam Taylor" /></div>
            <div className="field"><label>Relationship <span className="required">*</span></label>
              <select value={form.ec_relationship} onChange={set('ec_relationship')}>
                <option value="">Select…</option>
                <option>Parent</option><option>Spouse / Partner</option><option>Sibling</option><option>Friend</option><option>Other</option>
              </select>
            </div>
            <div className="field"><label>Phone <span className="required">*</span></label><input type="tel" value={form.ec_phone} onChange={set('ec_phone')} placeholder="+44 7700 000000" /></div>
            <div className="field"><label>Email</label><input type="email" value={form.ec_email} onChange={set('ec_email')} placeholder="sam@example.com" /></div>
            <div className="field">
              <label>Medical notes</label>
              <textarea rows={3} value={form.ec_medical} onChange={set('ec_medical')} placeholder="Allergies, conditions, medication…" style={{ resize: 'none' }} />
              <p className="hint">Optional — kept confidential</p>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn" onClick={() => setStep(0)}>← Back</button>
              <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }}
                onClick={() => { if (form.ec_name && form.ec_phone) setStep(2) }}>
                Continue →
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="card">
            <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>Payment</h2>

            <div style={{ background: 'var(--bg-secondary)', borderRadius: 'var(--radius)', padding: '12px 14px', marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '3px 0' }}><span>Joining fee (once-off)</span><strong>£25.00</strong></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '3px 0' }}><span>Monthly membership</span><strong>£10.00/mo</strong></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, fontWeight: 600, paddingTop: 8, marginTop: 4, borderTop: '1px solid var(--border)' }}><span>Due today</span><span>£35.00</span></div>
            </div>

            <p style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Pay joining fee via</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 16 }}>
              {PAYMENT_METHODS.map(m => (
                <div key={m.id} onClick={() => setPayMethod(m.id)} style={{
                  border: `${payMethod === m.id ? 2 : 1}px solid ${payMethod === m.id ? 'var(--text)' : 'var(--border-strong)'}`,
                  borderRadius: 'var(--radius)', padding: '10px 8px', textAlign: 'center', cursor: 'pointer',
                  background: payMethod === m.id ? 'var(--bg-secondary)' : 'var(--bg)',
                }}>
                  <div style={{ fontSize: 20, marginBottom: 4 }}>{m.icon}</div>
                  <div style={{ fontSize: 12, fontWeight: 500 }}>{m.label}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{m.sub}</div>
                </div>
              ))}
            </div>

            {payMethod === 'stripe' && (
              <div>
                <div className="field"><label>Card number</label><input placeholder="1234 5678 9012 3456" maxLength={19} /></div>
                <div className="field-row">
                  <div className="field"><label>Expiry</label><input placeholder="MM / YY" maxLength={7} /></div>
                  <div className="field"><label>CVC</label><input placeholder="123" maxLength={4} /></div>
                </div>
                <div className="field"><label>Name on card</label><input placeholder={`${form.first_name} ${form.last_name}`.trim() || 'Jamie Taylor'} /></div>
              </div>
            )}

            {payMethod === 'paypal' && (
              <div style={{ textAlign: 'center', padding: '16px 0', color: 'var(--text-secondary)', fontSize: 13 }}>
                You'll be redirected to PayPal to complete the joining fee after submitting.
              </div>
            )}

            {payMethod === 'bank' && (
              <div style={{ background: 'var(--bg-secondary)', borderRadius: 'var(--radius)', padding: '12px 14px', fontSize: 13 }}>
                <p style={{ fontWeight: 600, marginBottom: 8 }}>Bank transfer details</p>
                {[['Account name','Phoenix Sports Club'],['Sort code','12-34-56'],['Account no.','87654321'],['Reference', `PSC-${form.first_name.toUpperCase() || 'NEW'}`]].map(([k,v]) => (
                  <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>{k}</span><strong>{v}</strong>
                  </div>
                ))}
                <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 8 }}>Account activated within 1–2 working days once payment confirmed.</p>
              </div>
            )}

            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14, marginTop: 14 }}>
              <p style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Monthly standing order</p>
              <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>After joining you'll receive standing order instructions by email to set up your £10/month membership. This is separate from today's joining fee.</p>
            </div>

            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, margin: '14px 0' }}>
              <input type="checkbox" id="terms" checked={form.terms} onChange={set('terms')} style={{ width: 15, height: 15, marginTop: 1, flexShrink: 0 }} />
              <label htmlFor="terms" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                I agree to the membership terms &amp; conditions and confirm my details are correct.
              </label>
            </div>

            {error && <p className="error-msg" style={{ marginBottom: 12 }}>{error}</p>}

            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn" onClick={() => setStep(1)}>← Back</button>
              <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }}
                onClick={handleSubmit} disabled={!form.terms || submitting}>
                {submitting ? 'Registering…' : 'Complete registration'}
              </button>
            </div>
          </div>
        )}

        {step === 3 && assignedHouse && (
          <div className="card" style={{ textAlign: 'center', padding: 32 }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🎉</div>
            <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 6 }}>Welcome, {form.first_name}!</h2>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20 }}>You've been assigned to a house based on current team balance.</p>

            <div style={{ background: 'var(--bg-secondary)', borderRadius: 'var(--radius-lg)', padding: '20px 24px', marginBottom: 20 }}>
              <div style={{ fontSize: 40, marginBottom: 6 }}>{HOUSE_EMOJI[assignedHouse.name] || '🏠'}</div>
              <div style={{ fontSize: 22, fontWeight: 600 }}>{assignedHouse.name}</div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 3 }}>Your house</div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 20, textAlign: 'left' }}>
              <div style={{ background: 'var(--bg-secondary)', borderRadius: 'var(--radius)', padding: '10px 12px' }}>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Member ID</div>
                <div style={{ fontSize: 13, fontWeight: 600, marginTop: 2 }}>{memberId}</div>
              </div>
              <div style={{ background: 'var(--bg-secondary)', borderRadius: 'var(--radius)', padding: '10px 12px' }}>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Status</div>
                <div style={{ fontSize: 13, fontWeight: 600, marginTop: 2 }}>{payMethod === 'bank' ? '⏳ Pending payment' : '✅ Active'}</div>
              </div>
            </div>

            <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 20 }}>
              A confirmation email has been sent to <strong>{form.email}</strong> with standing order instructions and your login details.
            </p>

            <Link to="/login" className="btn btn-primary" style={{ display: 'inline-flex', justifyContent: 'center', width: '100%' }}>
              Go to member portal →
            </Link>
          </div>
        )}

        {step < 3 && (
          <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-secondary)', marginTop: 16 }}>
            Already a member? <Link to="/login" style={{ color: 'var(--text)', fontWeight: 500 }}>Sign in</Link>
          </p>
        )}
      </div>
    </div>
  )
}
