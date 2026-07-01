import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase.js'

const HOUSE_COLOURS = {
  'Dragon House': '#E24B4A', 'Super House': '#378ADD',
  'Ice House': '#1D9E75', 'Jet House': '#EF9F27',
}

export default function CheckIn() {
  const [search, setSearch]         = useState('')
  const [results, setResults]       = useState([])
  const [checking, setChecking]     = useState(null) // student being checked in
  const [mode, setMode]             = useState('attended') // attended | weight
  const [weight, setWeight]         = useState('')
  const [saving, setSaving]         = useState(false)
  const [confirmed, setConfirmed]   = useState(null)
  const [date]                      = useState(new Date().toISOString().split('T')[0])
  const [shareUrl, setShareUrl]     = useState('')
  const [showQR, setShowQR]         = useState(false)
  const inputRef = useRef(null)

  useEffect(() => {
    setShareUrl(`${window.location.origin}/checkin-public`)
  }, [])

  useEffect(() => {
    if (search.length < 3) { setResults([]); return }
    const timer = setTimeout(() => searchStudents(search), 200)
    return () => clearTimeout(timer)
  }, [search])

  async function searchStudents(q) {
    const { data } = await supabase
      .from('students')
      .select('id, student_ref, pka_belt, krba_level, members(first_name, last_name, date_of_birth, houses(name))')
      .or(`members.first_name.ilike.%${q}%,members.last_name.ilike.%${q}%,student_ref.ilike.%${q}%`)
      .limit(10)
    setResults(data || [])
  }

  function selectStudent(s) {
    // If already checked in, cycle through modes
    // If already confirmed this session, move to next mode
    setChecking(s)
    setMode('attended')
    setWeight('')
    setSearch('')
    setResults([])
  }

  async function checkIn(attendMode) {
    if (!checking) return
    setSaving(true)
    const now = new Date().toISOString()

    // Log attendance
    await supabase.from('attendance').insert({
      student_id: checking.id,
      attended_at: now,
      attendance_type: attendMode,
    })

    // If weight mode, save weight
    if (attendMode === 'weight' && weight) {
      await supabase.from('fit2fight_sessions').insert({
        student_id: checking.id,
        session_date: date,
        weight_before: parseFloat(weight),
      })
    }

    // Award attendance points
    const pts = attendMode === 'full_kit' ? 2 : 1
    const { data: s } = await supabase.from('students').select('house_points, individual_points, members(houses(name))').eq('id', checking.id).single()
    if (s) {
      await supabase.from('students').update({
        house_points: (s.house_points || 0) + pts,
        individual_points: (s.individual_points || 0) + pts,
      }).eq('id', checking.id)
      await supabase.from('points_log').insert({
        student_id: checking.id, point_type: attendMode === 'full_kit' ? 'Full Kit' : 'Attendance',
        points_awarded: pts, point_scope: 'both', awarded_at: now,
      })
    }

    setConfirmed({ student: checking, mode: attendMode, weight: weight || null })
    setChecking(null)
    setSaving(false)
    setTimeout(() => { setConfirmed(null); inputRef.current?.focus() }, 2500)
  }

  return (
    <div style={{ maxWidth: 520, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div className="page-header" style={{ marginBottom: 0 }}>
          <h1>Check in</h1>
          <p>{new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-sm" onClick={() => setShowQR(v => !v)}>📱 QR Code</button>
          <button className="btn btn-sm" onClick={() => { navigator.clipboard.writeText(shareUrl) }}>🔗 Share</button>
        </div>
      </div>

      {/* QR Code */}
      {showQR && (
        <div className="card" style={{ marginBottom: 14, textAlign: 'center' }}>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 10 }}>
            Students scan this QR code with their phone camera → opens the check-in page → they search their name → tap Attended or Full Kit
          </p>
          <img src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(shareUrl)}`}
            alt="QR Code" style={{ width: 180, height: 180, border: '1px solid var(--border)', borderRadius: 8 }} />
          <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 8, wordBreak: 'break-all' }}>{shareUrl}</p>
        </div>
      )}

      {/* Confirmation flash */}
      {confirmed && (
        <div style={{
          background: '#eaf3de', border: '1px solid #3b6d11', borderRadius: 'var(--radius)',
          padding: '14px 16px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <span style={{ fontSize: 28 }}>✅</span>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#3b6d11' }}>
              {confirmed.student.members?.first_name} {confirmed.student.members?.last_name} checked in
            </div>
            <div style={{ fontSize: 12, color: '#3b6d11' }}>
              {confirmed.mode === 'full_kit' ? '✓ Full kit' : confirmed.mode === 'weight' ? `⚖️ Weight: ${confirmed.weight}kg` : '✓ Attended'}
            </div>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="card" style={{ marginBottom: 14 }}>
        <input
          ref={inputRef}
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Type at least 3 letters to search…"
          autoFocus
          style={{ width: '100%', padding: '10px 14px', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius)', fontSize: 15, background: 'var(--bg-secondary)', color: 'var(--text)' }}
        />
        {search.length > 0 && search.length < 3 && (
          <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 6 }}>Enter {3 - search.length} more letter{3 - search.length > 1 ? 's' : ''}…</p>
        )}

        {/* Results */}
        {results.length > 0 && (
          <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {results.map(s => {
              const m = s.members
              const colour = HOUSE_COLOURS[m?.houses?.name] || '#888'
              return (
                <button key={s.id} onClick={() => selectStudent(s)} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 12px', border: '1px solid var(--border)',
                  borderRadius: 'var(--radius)', background: 'var(--bg)',
                  cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--font-sans)',
                }}>
                  <div style={{ width: 36, height: 36, borderRadius: '50%', background: colour + '20', color: colour, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700 }}>
                    {m?.first_name?.[0]}{m?.last_name?.[0]}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text)' }}>{m?.first_name} {m?.last_name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{s.student_ref} · {m?.houses?.name || 'No house'}</div>
                  </div>
                  <span style={{ fontSize: 12, color: colour, fontWeight: 500 }}>{s.pka_belt || s.krba_level || '—'}</span>
                </button>
              )
            })}
          </div>
        )}
        {search.length >= 3 && results.length === 0 && (
          <p style={{ fontSize: 13, color: 'var(--text-tertiary)', marginTop: 8, textAlign: 'center' }}>No students found</p>
        )}
      </div>

      {/* Check-in options modal */}
      {checking && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 50, padding: 16 }}>
          <div className="card" style={{ width: '100%', maxWidth: 480, marginBottom: 0 }}>
            <div style={{ textAlign: 'center', marginBottom: 16 }}>
              <div style={{ fontSize: 32, marginBottom: 6 }}>👋</div>
              <h2 style={{ fontSize: 17, fontWeight: 600 }}>{checking.members?.first_name} {checking.members?.last_name}</h2>
              <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{checking.student_ref} · {checking.members?.houses?.name}</p>
            </div>

            {/* Mode tabs */}
            <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: 16 }}>
              {[['attended','✓ Attended'],['full_kit','✓ Full Kit'],['weight','⚖️ Weight check']].map(([key, label]) => (
                <button key={key} onClick={() => setMode(key)} style={{
                  flex: 1, padding: '8px 4px', fontSize: 12, border: 'none', background: 'none', cursor: 'pointer',
                  borderBottom: `2px solid ${mode === key ? 'var(--text)' : 'transparent'}`,
                  color: mode === key ? 'var(--text)' : 'var(--text-secondary)',
                  fontWeight: mode === key ? 500 : 400,
                }}>{label}</button>
              ))}
            </div>

            {mode === 'weight' && (
              <div className="field" style={{ marginBottom: 14 }}>
                <label>Weight (kg)</label>
                <input type="number" step="0.1" value={weight} onChange={e => setWeight(e.target.value)}
                  placeholder="e.g. 65.5" autoFocus style={{ fontSize: 18, textAlign: 'center', fontWeight: 600 }} />
              </div>
            )}

            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn" onClick={() => setChecking(null)}>Cancel</button>
              <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center', fontSize: 15 }}
                onClick={() => checkIn(mode)}
                disabled={saving || (mode === 'weight' && !weight)}>
                {saving ? 'Checking in…' : mode === 'weight' ? `Save ${weight || '?'}kg` : mode === 'full_kit' ? '✓ Full Kit' : '✓ Check in'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
