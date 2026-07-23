import { useState, useEffect, useRef } from 'react'
import { supabasePublic as supabase } from '../lib/supabasePublic.js'

const HOUSE_COLOURS = {
  'Dragon House': '#E24B4A', 'Super House': '#378ADD',
  'Ice House': '#1D9E75', 'Jet House': '#EF9F27',
}

export default function CheckInPublic() {
  const [search, setSearch]       = useState('')
  const [results, setResults]     = useState([])
  const [checking, setChecking]   = useState(null)
  const [mode, setMode]           = useState('attended')
  const [sheetTab, setSheetTab]   = useState('checkin') // 'checkin' | 'weight'
  const [weight, setWeight]       = useState('')
  const [weightOut, setWeightOut] = useState('')
  const [todaysSession, setTodaysSession] = useState(null)
  const [saving, setSaving]       = useState(false)
  const [confirmed, setConfirmed] = useState(null)
  const [clubName, setClubName]   = useState('KR Centre')
  const inputRef = useRef(null)

  useEffect(() => {
    supabase.from('settings').select('value').eq('key','club_name').single()
      .then(({ data }) => { if (data?.value) setClubName(data.value) })
  }, [])

  useEffect(() => {
    if (search.length < 3) { setResults([]); return }
    const t = setTimeout(async () => {
      const { data: memberData } = await supabase
        .from('members')
        .select('id, first_name, last_name, houses(name)')
        .or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%`)
        .limit(8)
      if (!memberData?.length) { setResults([]); return }
      const memberIds = memberData.map(m => m.id)
      const { data: studentData } = await supabase
        .from('students').select('id, student_ref, house_name, member_id').in('member_id', memberIds)
      const merged = (studentData || []).map(s => ({ ...s, members: memberData.find(m => m.id === s.member_id) }))
      setResults(merged)
    }, 200)
    return () => clearTimeout(t)
  }, [search])

  async function checkIn(attendMode) {
    if (!checking) return
    setSaving(true)
    if (attendMode === 'weight_after') {
      if (weightOut && todaysSession) {
        await supabase.from('fit2fight_sessions').update({ weight_after: parseFloat(weightOut) }).eq('id', todaysSession.id)
      }
      setConfirmed({ name: `${checking.members?.first_name} ${checking.members?.last_name}`, mode: attendMode, weight: weightOut })
      setChecking(null); setWeight(''); setWeightOut(''); setSearch(''); setResults([])
      setSaving(false)
      setTimeout(() => { setConfirmed(null); inputRef.current?.focus() }, 3000)
      return
    }
    await supabase.from('attendance').insert({
      student_id: checking.id,
      present: true,
      late: false,
      attendance_type: attendMode,
      session_date: new Date().toISOString().split('T')[0],
      attended_at: new Date().toISOString(),
    })
    if (attendMode === 'weight' && weight) {
      await supabase.from('fit2fight_sessions').insert({
        student_id: checking.id,
        session_date: new Date().toISOString().split('T')[0],
        weight_before: parseFloat(weight),
      })
    }
    setConfirmed({ name: `${checking.members?.first_name} ${checking.members?.last_name}`, mode: attendMode, weight })
    setChecking(null); setWeight(''); setWeightOut(''); setSearch(''); setResults([])
    setSaving(false)
    setTimeout(() => { setConfirmed(null); inputRef.current?.focus() }, 3000)
  }

  return (
    <div style={{ minHeight: '100vh', background: '#111', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '32px 16px' }}>
      <div style={{ width: '100%', maxWidth: 440 }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <img src="/kr-logo.png" alt="KR" style={{ height: 60, objectFit: 'contain', marginBottom: 10 }} />
          <h1 style={{ fontSize: 20, fontWeight: 700, color: '#fff' }}>{clubName}</h1>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>Class check-in</p>
        </div>

        {confirmed ? (
          <div style={{ background: '#1a3a1a', border: '1px solid #3b6d11', borderRadius: 'var(--radius)', padding: 24, textAlign: 'center' }}>
            <div style={{ fontSize: 48, marginBottom: 8 }}>✅</div>
            <div style={{ fontSize: 18, fontWeight: 600, color: '#4ade80' }}>{confirmed.name}</div>
            <div style={{ fontSize: 14, color: '#86efac', marginTop: 4 }}>
              {confirmed.mode === 'full_kit' ? 'Checked in — Full Kit ✓' : confirmed.mode === 'weight' ? `Weight in saved: ${confirmed.weight}kg` : confirmed.mode === 'weight_after' ? `Weight out saved: ${confirmed.weight}kg` : 'Checked in ✓'}
            </div>
          </div>
        ) : (
          <div style={{ background: 'var(--bg)', borderRadius: 'var(--border-radius-lg)', padding: 20 }}>
            <input ref={inputRef} value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Type your name (min 3 letters)…"
              autoFocus
              style={{ width: '100%', padding: '12px 14px', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius)', fontSize: 16, background: 'var(--bg-secondary)', color: 'var(--text)', marginBottom: 8 }} />
            {search.length > 0 && search.length < 3 && (
              <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 8 }}>{3 - search.length} more letter{3 - search.length > 1 ? 's' : ''} needed…</p>
            )}
            {results.map(s => {
              const m = s.members
              const colour = HOUSE_COLOURS[m?.houses?.name] || '#888'
              return (
                <button key={s.id} onClick={() => {
                  setChecking(s); setMode('attended'); setSheetTab('checkin')
                  setTodaysSession(null)
                  supabase.from('fit2fight_sessions').select('id, weight_before, weight_after')
                    .eq('student_id', s.id).eq('session_date', new Date().toISOString().split('T')[0])
                    .order('created_at', { ascending: false }).limit(1)
                    .then(({ data }) => setTodaysSession(data?.[0] || null))
                }} style={{
                  display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                  padding: '12px', border: '1px solid var(--border)', borderRadius: 'var(--radius)',
                  background: 'var(--bg)', cursor: 'pointer', marginBottom: 6, textAlign: 'left', fontFamily: 'var(--font-sans)',
                }}>
                  <div style={{ width: 40, height: 40, borderRadius: '50%', background: colour + '20', color: colour, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700 }}>
                    {m?.first_name?.[0]}{m?.last_name?.[0]}
                  </div>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--text)' }}>{m?.first_name} {m?.last_name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{m?.houses?.name || 'No house'}</div>
                  </div>
                </button>
              )
            })}
          </div>
        )}

        {/* Check-in action sheet */}
        {checking && !confirmed && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 50, padding: 16, overflowY: 'auto' }}>
            <div style={{ background: 'var(--bg)', borderRadius: '0 0 16px 16px', width: '100%', maxWidth: 440, padding: 24, marginTop: 0 }}>
              <h2 style={{ fontSize: 17, fontWeight: 600, textAlign: 'center', marginBottom: 4 }}>
                {checking.members?.first_name} {checking.members?.last_name}
              </h2>
              <p style={{ fontSize: 12, color: 'var(--text-secondary)', textAlign: 'center', marginBottom: 16 }}>How are you checking in?</p>

              <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden', marginBottom: 18 }}>
                <button onClick={() => setSheetTab('checkin')} style={{
                  flex: 1, padding: '10px', fontSize: 14, fontWeight: 600, cursor: 'pointer', border: 'none',
                  background: sheetTab === 'checkin' ? 'var(--text)' : 'var(--bg-secondary)',
                  color: sheetTab === 'checkin' ? 'var(--bg)' : 'var(--text-secondary)',
                }}>✓ Check in</button>
                <button onClick={() => setSheetTab('weight')} style={{
                  flex: 1, padding: '10px', fontSize: 14, fontWeight: 600, cursor: 'pointer', border: 'none',
                  background: sheetTab === 'weight' ? 'var(--text)' : 'var(--bg-secondary)',
                  color: sheetTab === 'weight' ? 'var(--bg)' : 'var(--text-secondary)',
                }}>⚖️ Weight Check</button>
              </div>

              {sheetTab === 'checkin' ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
                  <button className="btn btn-primary" style={{ justifyContent: 'center', fontSize: 15, padding: '14px' }}
                    onClick={() => checkIn('attended')} disabled={saving}>✓ Attended</button>
                  <button className="btn" style={{ justifyContent: 'center', fontSize: 15, padding: '14px', background: '#eaf3de', color: '#3b6d11', border: '1px solid #3b6d1140' }}
                    onClick={() => checkIn('full_kit')} disabled={saving}>✓ Full Kit</button>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
                  <div>
                    <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6, fontWeight: 500 }}>Before session</p>
                    <input type="number" step="0.1" value={weight} onChange={e => setWeight(e.target.value)}
                      placeholder="Weight in (kg)"
                      style={{ width: '100%', padding: '12px', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius)', fontSize: 15, textAlign: 'center', background: 'var(--bg-secondary)', color: 'var(--text)', marginBottom: 8 }} />
                    {weight && (
                      <button className="btn" style={{ width: '100%', justifyContent: 'center', fontSize: 14, padding: '12px' }}
                        onClick={() => checkIn('weight')} disabled={saving}>⚖️ Save weight in {weight}kg</button>
                    )}
                  </div>
                  <div>
                    <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6, fontWeight: 500 }}>After session</p>
                    {todaysSession?.weight_before ? (
                      <>
                        <input type="number" step="0.1" value={weightOut} onChange={e => setWeightOut(e.target.value)}
                          placeholder={`Weight out (kg) — you were ${todaysSession.weight_before}kg`}
                          style={{ width: '100%', padding: '12px', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius)', fontSize: 15, textAlign: 'center', background: 'var(--bg-secondary)', color: 'var(--text)', marginBottom: 8 }} />
                        {weightOut && (
                          <button className="btn" style={{ width: '100%', justifyContent: 'center', fontSize: 14, padding: '12px' }}
                            onClick={() => checkIn('weight_after')} disabled={saving}>⚖️ Save weight out {weightOut}kg</button>
                        )}
                      </>
                    ) : (
                      <p style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Save a "before session" weight first, then come back here after training.</p>
                    )}
                  </div>
                </div>
              )}
              <button className="btn" style={{ width: '100%', justifyContent: 'center' }} onClick={() => setChecking(null)}>Cancel</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
