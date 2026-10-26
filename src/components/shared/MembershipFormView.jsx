// The submitted membership form, laid out like the paper form (logo, title, rows).
// Used on screen (student profile) and for printing (Forms page + student profile).
// blank: an empty paper copy to fill in by hand (lines instead of answers, only that form's questions)
export default function MembershipFormView({ f, onViewScan, logoSrc, blank = false }) {
  if (!f) return null
  // Shows the form as it was actually submitted -- the
  // name/DOB/contact fields are a snapshot taken at
  // signup time, which can genuinely differ from the
  // student's current record if any of that was corrected
  // or updated since (e.g. a typo fixed, a new phone
  // number) -- this is deliberately the original
  // submission, not a live view of today's record.
  const goalScores = [
    ['Health — Physical Fitness, Stress Reduction, Relaxation', f.goal_health],
    ['Appearance — Weight Control, Muscle Tone, Posture', f.goal_appearance],
    ['Performance — Endurance, Flexibility, Mental Focus', f.goal_performance],
    ['Self Defence — Safety, Confidence, Awareness', f.goal_selfdefence],
  ].filter(([, v]) => blank || v != null)
  const row = (label, value, only) => {
    if (blank && only && !only.includes(f.form_type)) return null
    if (blank) return (
      <div style={{ display: 'flex', gap: 8, padding: '14px 0 4px', borderBottom: '1px solid #999', fontSize: 13 }}>
        <div style={{ width: 200, flexShrink: 0, color: '#333' }}>{label}</div>
      </div>
    )
    return (
      <div style={{ display: 'flex', gap: 8, padding: '5px 0', borderBottom: '1px solid #eee', fontSize: 13 }}>
        <div style={{ width: 200, flexShrink: 0, color: '#555' }}>{label}</div>
        <div style={{ fontWeight: 500 }}>{value || value === 0 ? value : '—'}</div>
      </div>
    )
  }
  const isKrba = f.form_type === 'krba'
  const isChild = f.form_type === 'pka_child'
  const isAdult = f.form_type === 'pka_adult'
  // 'unknown' means this record only exists to hold an
  // attached scan with no separately-captured structured
  // data behind it -- shown plainly rather than
  // incorrectly defaulting to "Adult" just because it's
  // neither Child nor KRBA specifically.
  const formTitle = isKrba ? 'Membership Application' : isChild ? 'Child Future Student Personal Analysis' : isAdult ? 'Adult Future Student Personal Analysis' : 'Membership Form'
  return (
    <div style={{ fontFamily: 'var(--font-sans)' }}>
      <div style={{ textAlign: 'center', marginBottom: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 14, marginBottom: 6 }}>
          {!isKrba && <img src={logoSrc || "/images/pka-logo.png"} alt="" style={{ height: 44 }} />}
          {isKrba && <img src={logoSrc || "/logos/krba-logo.png"} alt="" style={{ height: 44 }} />}
          <div style={{ fontSize: 20, fontWeight: 800, color: '#111', letterSpacing: 0.3 }}>
            {isKrba ? 'KR Boxing Academy' : 'Derby PKA Kickboxing'}
          </div>
          {!isKrba && <img src={logoSrc || "/images/pka-logo.png"} alt="" style={{ height: 44 }} />}
        </div>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>{formTitle}</div>
        <div style={{ fontSize: 12, color: '#666' }}>
          {blank ? 'Date: ____________________' : <>Submitted {f.submitted_at ? new Date(f.submitted_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '—'}</>}
        </div>
        {f.document_url && onViewScan && (
          <div className="no-print" style={{ marginTop: 6 }}>
            <a href="#" onClick={e => { e.preventDefault(); onViewScan?.(f.document_url) }} style={{ fontSize: 12, color: '#378ADD' }}>📎 View original scanned/photographed form</a>
          </div>
        )}
      </div>
      {row('Student name', `${f.first_name || ''} ${f.last_name || ''}`.trim())}
      {row('Date of birth', f.date_of_birth ? new Date(f.date_of_birth + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : null)}
      {row('Sponsor name', f.sponsor_name, ['pka_child'])}
      {row('Parents/Carers', f.parents_carers, ['pka_child'])}
      {row('Email', f.email)}
      {row('Phone', f.phone)}
      {row('Emergency contact', [f.emergency_contact_name, f.emergency_contact_phone].filter(Boolean).join(' — '))}
      {row('How did you hear about us?', f.hear_about)}
      {row('Promo code', f.promo_code, ['pka_child', 'pka_adult'])}
      {row('School', f.school, ['pka_child'])}
      {row('Year', f.school_year || f.year, ['pka_child'])}
      {row('Other activities', f.other_activities)}
      {row('Previous club', f.previous_club)}
      {row('Fitness level', f.fitness_level, ['pka_adult', 'krba'])}
      {row('What would you like to accomplish?', f.goal_description, ['pka_adult', 'krba'])}
      {row('Additional needs', f.additional_needs)}
      {row('Medical concerns', f.medical_concerns || f.medical)}
      {row('Medication', f.medication)}
      {row('Other contact', f.other_contact)}

      {goalScores.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Main reason for attending (scored out of 5)</div>
          {goalScores.map(([label, score]) => (
            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '4px 0', borderBottom: '1px solid #eee' }}>
              <div>{label}</div>
              <div style={{ fontWeight: 700 }}>{blank ? '1   2   3   4   5' : score}</div>
            </div>
          ))}
        </div>
      )}
      {f.goal_notes && (
        <div style={{ marginTop: 10, fontSize: 12, color: '#555', fontStyle: 'italic' }}>{f.goal_notes}</div>
      )}

      <div style={{ marginTop: 16, paddingTop: 12, borderTop: '2px solid #333', fontSize: 13 }}>
        <strong>Waiver agreed:</strong> {blank ? '☐ Yes' : f.waiver_agreed ? '✓ Yes' : 'Not recorded'}
      </div>
    </div>
  )
}
