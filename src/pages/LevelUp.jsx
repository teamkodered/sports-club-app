import { useEffect, useMemo, useState } from 'react'
import { supabasePublic } from '../lib/supabasePublic.js'

// Public Level Up booking page (replaces the Google Form). Same questions and wording.
// Books onto THIS week's extra sessions (from Sunday the week starting tomorrow); past
// sessions are hidden. Requests wait for the club to confirm -- nothing is auto-capped.
const DEFAULT_SESSIONS = [
  { label: 'Monday 7pm (14+yrs)', day: 1 }, { label: 'Tuesday 7pm (14+yrs)', day: 2 },
  { label: 'Wednesday 7pm (Jnr & snr mixed)', day: 3 }, { label: 'Thursday 7pm (14+yrs)', day: 4 },
  { label: 'Thursday 8pm (Sparring 14+years)', day: 4 }, { label: 'Friday 7pm (14+yrs)', day: 5 },
  { label: 'Sunday 11am (Ladies only 14+yrs)', day: 7 }, { label: 'Sunday 12pm (Jnr & Snr mixed)', day: 7 },
]
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
// The week being booked: Sunday -> the week starting tomorrow; Monday..Saturday -> this week
export function levelUpWeekStart(now = new Date()) {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const dow = d.getDay()               // 0 Sun .. 6 Sat
  d.setDate(d.getDate() + (dow === 0 ? 1 : 1 - dow))
  return d
}
export const sessionDate = (weekStart, day) => { const d = new Date(weekStart); d.setDate(d.getDate() + (day - 1)); return d }
const fmt = d => d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })

export default function LevelUp() {
  const [sessions, setSessions] = useState(DEFAULT_SESSIONS)
  const [f, setF] = useState({ surname: '', first: '', age: '', phone: '', agree: false, picks: [] })
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(null)
  const [err, setErr] = useState('')
  useEffect(() => {
    supabasePublic.from('settings').select('value').eq('key', 'level_up_sessions').maybeSingle()
      .then(({ data }) => { if (Array.isArray(data?.value) && data.value.length) setSessions(data.value) })
  }, [])
  const week = useMemo(() => levelUpWeekStart(), [])
  const today = iso(new Date())
  const options = sessions.map(s => ({ ...s, date: iso(sessionDate(week, s.day)) })).filter(s => s.date >= today)

  async function submit(e) {
    e.preventDefault(); setErr('')
    if (!f.picks.length) return setErr('Please choose at least one session.')
    if (!f.agree) return setErr('Please tick Agree to confirm you will wait for confirmation.')
    if (!f.phone.trim()) return setErr('Please add a contact number.')
    setBusy(true)
    const { data, error } = await supabasePublic.rpc('kc_level_up_request', {
      p_week: iso(week), p_first: f.first, p_surname: f.surname, p_age: parseInt(f.age, 10) || null, p_phone: f.phone,
      p_sessions: options.filter(o => f.picks.includes(o.label)).map(o => ({ label: o.label, date: o.date })),
    })
    setBusy(false)
    if (error) return setErr("Sorry, that didn't send — please try again. (" + error.message + ')')
    if (data?.error) return setErr(data.error)
    setDone(options.filter(o => f.picks.includes(o.label)))
  }

  const box = { width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 8, border: '1px solid #cfd4da', fontSize: 15 }
  return (
    <div style={{ minHeight: '100vh', background: '#f0ebf8', padding: '16px 12px 40px', fontFamily: 'Roboto, system-ui, sans-serif', color: '#202124' }}>
      <div style={{ maxWidth: 640, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ background: '#fff', borderRadius: 10, borderTop: '10px solid #E24B4A', padding: '20px 22px' }}>
          <h1 style={{ fontSize: 28, fontWeight: 400, margin: '0 0 12px' }}>Level up your training!!!</h1>
          <p style={{ fontSize: 14, lineHeight: 1.5, margin: '0 0 10px' }}>Now's your chance to super sharpen your skills! Grading preparation? Upcoming competition? or simply just want more punching and kicking???</p>
          <p style={{ fontSize: 14, lineHeight: 1.5, margin: '0 0 10px' }}>With an extra one off training session for just £5 per session (Special offer) you can make those extra improvements needed!!!</p>
          <p style={{ fontSize: 14, lineHeight: 1.5, margin: '0 0 10px' }}>Spaces are limited - book in advance below.</p>
          <p style={{ fontSize: 14, lineHeight: 1.5, margin: 0, fontWeight: 600 }}>***Please wait for confirmation of booking as spots are very limited and will be on a first come first served basis***</p>
          <p style={{ fontSize: 12, color: '#5f6368', margin: '12px 0 0' }}>Booking for the week of <b>{fmt(week)}</b></p>
        </div>

        {done ? (
          <div style={{ background: '#fff', borderRadius: 10, padding: '22px' }}>
            <h2 style={{ fontSize: 20, fontWeight: 500, margin: '0 0 10px' }}>Thanks — request received! 💪❤️</h2>
            <p style={{ fontSize: 14, margin: '0 0 8px' }}>You asked for:</p>
            <ul style={{ margin: '0 0 12px', paddingLeft: 20, fontSize: 14 }}>{done.map(o => <li key={o.label}>{o.label} — {fmt(new Date(o.date + 'T12:00:00'))}</li>)}</ul>
            <p style={{ fontSize: 14, margin: 0 }}>This doesn't guarantee a place yet — <b>please wait for our confirmation message</b> before attending.</p>
          </div>
        ) : (
          <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[['surname', 'Surname (Student)'], ['first', 'First Name (Student)'], ['age', 'Age (Student)']].map(([k, l]) => (
              <div key={k} style={{ background: '#fff', borderRadius: 10, padding: '18px 22px' }}>
                <label htmlFor={`lu-${k}`} style={{ display: 'block', fontSize: 15, marginBottom: 10 }}>{l} <span style={{ color: '#d93025' }}>*</span></label>
                <input id={`lu-${k}`} required type={k === 'age' ? 'number' : 'text'} inputMode={k === 'age' ? 'numeric' : undefined} min={k === 'age' ? 3 : undefined}
                  value={f[k]} onChange={e => setF(x => ({ ...x, [k]: e.target.value }))} style={{ ...box, maxWidth: k === 'age' ? 120 : 360 }} />
              </div>
            ))}
            <div style={{ background: '#fff', borderRadius: 10, padding: '18px 22px' }}>
              <div style={{ fontSize: 15, marginBottom: 10 }}>Which session(s) would you like to attend as extra? <span style={{ color: '#d93025' }}>*</span></div>
              {options.length === 0 && <p style={{ fontSize: 14, color: '#5f6368' }}>No sessions left this week — check back on Sunday for next week's.</p>}
              {options.map(o => (
                <label key={o.label} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', fontSize: 14, cursor: 'pointer' }}>
                  <input type="checkbox" checked={f.picks.includes(o.label)} style={{ width: 20, height: 20 }}
                    onChange={() => setF(x => ({ ...x, picks: x.picks.includes(o.label) ? x.picks.filter(p => p !== o.label) : [...x.picks, o.label] }))} />
                  <span>{o.label} <span style={{ color: '#5f6368' }}>· {fmt(new Date(o.date + 'T12:00:00'))}</span></span>
                </label>
              ))}
            </div>
            <div style={{ background: '#fff', borderRadius: 10, padding: '18px 22px' }}>
              <div style={{ fontSize: 15, marginBottom: 10 }}>I acknowledge that this expression of interest does not guarantee my place and I will wait for confirmation before attending the extra session. <span style={{ color: '#d93025' }}>*</span></div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 14, cursor: 'pointer' }}>
                <input type="checkbox" checked={f.agree} onChange={e => setF(x => ({ ...x, agree: e.target.checked }))} style={{ width: 20, height: 20 }} /> Agree
              </label>
            </div>
            <div style={{ background: '#fff', borderRadius: 10, padding: '18px 22px' }}>
              <label htmlFor="lu-phone" style={{ display: 'block', fontSize: 15, marginBottom: 10 }}>Contact number <span style={{ color: '#d93025' }}>*</span></label>
              <input id="lu-phone" required type="tel" inputMode="tel" value={f.phone} onChange={e => setF(x => ({ ...x, phone: e.target.value }))} style={{ ...box, maxWidth: 360 }} />
            </div>
            {err && <div style={{ background: '#fce8e6', color: '#c5221f', borderRadius: 8, padding: '10px 14px', fontSize: 14 }}>{err}</div>}
            <button disabled={busy} style={{ alignSelf: 'flex-start', padding: '10px 24px', borderRadius: 6, border: 'none', background: '#E24B4A', color: '#fff', fontSize: 15, fontWeight: 600, cursor: 'pointer' }}>{busy ? 'Sending…' : 'Submit'}</button>
          </form>
        )}
      </div>
    </div>
  )
}
