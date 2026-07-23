import { useState, useEffect } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import { supabasePublic } from '../lib/supabasePublic.js'

const HOUSE_COLOURS = {
  'Dragon House': '#E24B4A', 'Super House': '#378ADD',
  'Ice House': '#1D9E75', 'Jet House': '#EF9F27',
}

export default function Claim() {
  const [searchParams] = useSearchParams()
  const ref = searchParams.get('ref')

  const [loading, setLoading] = useState(true)
  const [student, setStudent] = useState(null)
  const [notFound, setNotFound] = useState(false)
  const [session, setSession] = useState(undefined) // undefined = not checked yet
  const [linking, setLinking] = useState(false)
  const [linkError, setLinkError] = useState('')
  const [linked, setLinked] = useState(false)

  const [showCreateLogin, setShowCreateLogin] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [creating, setCreating] = useState(false)
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
  }, [])

  useEffect(() => {
    if (!ref) { setLoading(false); setNotFound(true); return }
    supabasePublic
      .from('students')
      .select('id, student_ref, discipline, pka_belt, krba_level, house_name, member_id, members(first_name, last_name, houses(name))')
      .eq('student_ref', ref)
      .limit(1)
      .then(({ data }) => {
        const s = data?.[0]
        if (!s) setNotFound(true)
        else setStudent(s)
        setLoading(false)
      })
  }, [ref])

  async function doLink(accessToken) {
    setLinking(true)
    setLinkError('')
    try {
      const res = await fetch('/.netlify/functions/link-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ studentId: student.id }),
      })
      const data = await res.json()
      if (data.success) {
        setLinked(true)
        setTimeout(() => { window.location.href = '/athlete-app' }, 1200)
      } else {
        setLinkError(data.error || 'Something went wrong linking your profile.')
      }
    } catch (e) {
      setLinkError('Something went wrong linking your profile.')
    }
    setLinking(false)
  }

  function confirmYes() {
    if (session) doLink(session.access_token)
    else setShowCreateLogin(true)
  }

  async function createLoginAndLink() {
    if (password !== confirmPw) { setLinkError('Passwords do not match.'); return }
    if (password.length < 8) { setLinkError('Password must be at least 8 characters.'); return }
    setCreating(true)
    setLinkError('')
    const { data, error } = await supabase.auth.signUp({
      email, password,
      options: { emailRedirectTo: `${window.location.origin}/claim?ref=${encodeURIComponent(ref)}` },
    })
    if (error) { setLinkError(error.message); setCreating(false); return }
    if (data?.user && data.user.identities?.length === 0) {
      setLinkError('An account with this email already exists. Try logging in instead, then come back to this exact link.')
      setCreating(false)
      return
    }
    if (data?.session) {
      await doLink(data.session.access_token)
    } else {
      setAwaitingConfirmation(true)
    }
    setCreating(false)
  }

  if (loading || session === undefined) return <div className="loading">Loading…</div>

  const m = student?.members
  const houseName = student?.house_name || m?.houses?.name
  const colour = HOUSE_COLOURS[houseName] || '#378ADD'

  return (
    <div style={{ minHeight: '100vh', background: '#111', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ width: '100%', maxWidth: 400 }}>
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <img src="/kr-logo.png" alt="KR" style={{ height: 52, objectFit: 'contain', marginBottom: 8 }} />
        </div>

        <div className="card">
          {notFound ? (
            <div style={{ textAlign: 'center', padding: '12px 0' }}>
              <p style={{ fontSize: 14, marginBottom: 14 }}>We couldn't find a profile for this link. It may have expired, or the reference may be incorrect.</p>
              <Link to="/athlete-app" className="btn btn-primary" style={{ justifyContent: 'center', width: '100%' }}>Find your profile instead</Link>
            </div>
          ) : linked ? (
            <div style={{ textAlign: 'center', padding: '12px 0' }}>
              <div style={{ fontSize: 40, marginBottom: 8 }}>✅</div>
              <p style={{ fontSize: 15, fontWeight: 600 }}>Linked! Taking you to your profile…</p>
            </div>
          ) : awaitingConfirmation ? (
            <div style={{ textAlign: 'center', padding: '12px 0' }}>
              <div style={{ fontSize: 40, marginBottom: 8 }}>📧</div>
              <p style={{ fontSize: 14, marginBottom: 8 }}>Account created! Check your email to confirm it.</p>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Once confirmed, come back to this exact link (or use the same one again) to finish linking your profile.</p>
            </div>
          ) : !showCreateLogin ? (
            <>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', textAlign: 'center', marginBottom: 14 }}>Is this you?</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18 }}>
                <div style={{ width: 52, height: 52, borderRadius: '50%', background: colour + '22', color: colour, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 700, flexShrink: 0 }}>
                  {m?.first_name?.[0]}{m?.last_name?.[0]}
                </div>
                <div>
                  <div style={{ fontSize: 17, fontWeight: 600 }}>{m?.first_name} {m?.last_name}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    {houseName || '—'} · {student.discipline} · {student.pka_belt || student.krba_level || '—'}
                  </div>
                </div>
              </div>
              {linkError && <p className="error-msg" style={{ marginBottom: 10 }}>{linkError}</p>}
              <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', marginBottom: 8 }}
                onClick={confirmYes} disabled={linking}>
                {linking ? 'Linking…' : '✓ Yes, that\'s me'}
              </button>
              <Link to="/athlete-app" style={{ display: 'block', textAlign: 'center', fontSize: 12, color: 'var(--text-secondary)' }}>
                Not you? Find your profile instead
              </Link>
            </>
          ) : (
            <>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', textAlign: 'center', marginBottom: 14 }}>
                Set up your login to link {m?.first_name}'s profile
              </p>
              <div className="field"><label>Email</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" />
              </div>
              <div className="field"><label>Password</label>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Min 8 characters" />
              </div>
              <div className="field"><label>Confirm password</label>
                <input type="password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} placeholder="Repeat password" />
              </div>
              {linkError && <p className="error-msg" style={{ marginBottom: 10 }}>{linkError}</p>}
              <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }}
                onClick={createLoginAndLink} disabled={creating || !email || !password}>
                {creating ? 'Creating…' : 'Create login & link profile'}
              </button>
              <p style={{ fontSize: 12, color: 'var(--text-secondary)', textAlign: 'center', marginTop: 10 }}>
                Already have a login? <Link to="/login" style={{ color: 'var(--text)', fontWeight: 500 }}>Sign in</Link>, then come back to this link.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
