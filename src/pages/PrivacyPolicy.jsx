export default function PrivacyPolicy() {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-tertiary)', padding: '32px 16px' }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <div className="card">
          <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>Privacy Policy</h1>
          <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 20 }}>Last updated: 13 August 2026</p>

          <p style={{ marginBottom: 16 }}>
            KR Centre ("we", "us", "our") operates this training management app for our members, athletes and coaches.
            This policy explains what personal data we collect, why, and how it's handled.
          </p>

          <h2 style={{ fontSize: 16, fontWeight: 600, marginTop: 20, marginBottom: 8 }}>1. Information we collect</h2>
          <ul style={{ paddingLeft: 20, marginBottom: 16 }}>
            <li>Account details: name, email address, phone number, date of birth.</li>
            <li>Membership and training data: attendance, class schedules, competition record, points, house/team assignment.</li>
            <li>Fitness and performance data you or your coach log: training sessions, weight, physical test results, wellbeing and mentality check-ins.</li>
            <li>If you choose to connect a Whoop account: workout activity and basic profile information from Whoop, used to enrich your training log. You can disconnect this at any time from within the app.</li>
            <li>Notes and PDP (personal development plan) content added by you or your coach.</li>
          </ul>

          <h2 style={{ fontSize: 16, fontWeight: 600, marginTop: 20, marginBottom: 8 }}>2. How we use this information</h2>
          <ul style={{ paddingLeft: 20, marginBottom: 16 }}>
            <li>To operate the app: tracking attendance, training progress, and communicating with you about your membership.</li>
            <li>To help coaches support your training and development.</li>
            <li>To calculate points, standings, and league/house results.</li>
            <li>To send you relevant messages (e.g. missed training reminders, birthday messages) — only sent manually by a coach, not automatically.</li>
          </ul>

          <h2 style={{ fontSize: 16, fontWeight: 600, marginTop: 20, marginBottom: 8 }}>3. Third-party services</h2>
          <p style={{ marginBottom: 16 }}>
            If you connect a Whoop account, we access only the workout and basic profile data Whoop's API provides with your
            permission, for the purpose of showing that data alongside your own training log. We do not sell or share this
            data with any other third party. You can revoke this access at any time through your Whoop account settings or
            by disconnecting within this app.
          </p>

          <h2 style={{ fontSize: 16, fontWeight: 600, marginTop: 20, marginBottom: 8 }}>4. Data storage and security</h2>
          <p style={{ marginBottom: 16 }}>
            Data is stored securely using Supabase, with access controls restricting who can view or edit different types of
            information. We take reasonable measures to protect stored data, but no electronic system can be guaranteed
            completely secure.
          </p>

          <h2 style={{ fontSize: 16, fontWeight: 600, marginTop: 20, marginBottom: 8 }}>5. Data retention</h2>
          <p style={{ marginBottom: 16 }}>
            We retain your data for as long as you remain a member, and for a reasonable period afterward for record-keeping
            purposes. You can ask us to delete your data at any time by contacting us (see below).
          </p>

          <h2 style={{ fontSize: 16, fontWeight: 600, marginTop: 20, marginBottom: 8 }}>6. Your rights</h2>
          <p style={{ marginBottom: 16 }}>
            Under UK GDPR and the Data Protection Act 2018, you have the right to access, correct, or request deletion of
            your personal data. Contact us using the details below to exercise these rights.
          </p>

          <h2 style={{ fontSize: 16, fontWeight: 600, marginTop: 20, marginBottom: 8 }}>7. Changes to this policy</h2>
          <p style={{ marginBottom: 16 }}>
            We may update this policy from time to time. Continued use of the app after changes are published constitutes
            acceptance of the updated policy.
          </p>

          <h2 style={{ fontSize: 16, fontWeight: 600, marginTop: 20, marginBottom: 8 }}>8. Contact us</h2>
          <p>
            If you have any questions about this policy or how your data is handled, please contact us at{' '}
            <a href="mailto:privacy@kr-centre.example">privacy@kr-centre.example</a>.
          </p>
        </div>
      </div>
    </div>
  )
}
