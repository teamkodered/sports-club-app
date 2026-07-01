import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../hooks/useAuth.jsx'

const HOUSE_COLOURS = {
  'Dragon House': '#E24B4A', 'Super House': '#378ADD',
  'Ice House': '#1D9E75', 'Jet House': '#EF9F27',
}

const PDP_SECTIONS = [
  { key: 'winning_ways',         label: '🏆 Winning ways',        colour: '#1D9E75' },
  { key: 'maintain',             label: '✅ Maintain',             colour: '#378ADD' },
  { key: 'to_work_on',           label: '🎯 To work on',           colour: '#EF9F27' },
  { key: 'what_to_do',           label: '📋 What to do',           colour: '#8B5CF6' },
  { key: 'psychology_maintain',  label: '🧠 Psychology — maintain',colour: '#8B5CF6' },
  { key: 'psychology_work_on',   label: '🧠 Psychology — work on', colour: '#7C3AED' },
  { key: 'tech_maintain',        label: '⚙️ Technical — maintain', colour: '#378ADD' },
  { key: 'tech_work_on',         label: '⚙️ Technical — work on',  colour: '#EF9F27' },
  { key: 'tact_maintain',        label: '🎯 Tactical — maintain',  colour: '#1D9E75' },
  { key: 'tact_work_on',         label: '🎯 Tactical — work on',   colour: '#E24B4A' },
  { key: 'physical_maintain',    label: '💪 Physical — maintain',  colour: '#1D9E75' },
  { key: 'physical_work_on',     label: '💪 Physical — work on',   colour: '#059669' },
  { key: 'athlete_notes',        label: '📝 My notes',             colour: '#185FA5' },
]

export default function AthleteApp() {
  const { profile, isAdmin } = useAuth()
  const navigate = useNavigate()
  const [tab, setTab]           = useState('dashboard')
  const [student, setStudent]   = useState(null)
  const [apData, setApData]     = useState(null)
  const [points, setPoints]     = useState([])
  const [sessions, setSessions] = useState([])
  const [loading, setLoading]   = useState(true)
  const [editNotes, setEditNotes] = useState(null) // section key being edited
  const [noteText, setNoteText]   = useState('')
  const [saving, setSaving]       = useState(false)

  useEffect(() => {
    if (profile) load()
    else if (profile === null) setLoading(false)
  }, [profile])

  async function load() {
    const { data: s } = await supabase
      .from('students')
      .select('*, members(first_name, last_name, date_of_birth, email, phone, house_id, houses(name))')
      .eq('member_id', profile.id)
      .single()

    if (!s) { setLoading(false); return }
    setStudent(s)

    const [{ data: ap }, { data: pts }, { data: sess }] = await Promise.all([
      supabase.from('athlete_profiles').select('*').eq('student_id', s.id).single(),
      supabase.from('points_log').select('*').eq('student_id', s.id)
        .order('awarded_at', { ascending: false }).limit(20),
      supabase.from('fit2fight_sessions').select('*').eq('student_id', s.id)
        .order('session_date', { ascending: false }).limit(10),
    ])
    setApData(ap)
    setPoints(pts || [])
    setSessions(sess || [])
    setLoading(false)
  }

  async function saveAthleteNote(key, text) {
    setSaving(true)
    const currentNotes = apData?.pdp_notes || {}
    const updated = {
      ...currentNotes,
      athlete_notes: text ? [text] : [],
    }
    await supabase.from('athlete_profiles')
      .upsert({ student_id: student.id, pdp_notes: updated }, { onConflict: 'student_id' })
    setApData(a => ({ ...a, pdp_notes: updated }))
    setEditNotes(null)
    setSaving(false)
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 300 }}>
      <div className="loading">Loading your app…</div>
    </div>
  )

  if (!student) return (
    <div style={{ maxWidth: 480, margin: '0 auto', textAlign: 'center', padding: '48px 16px' }}>
      <div style={{ fontSize: 48, marginBottom: 12 }}>🎽</div>
      <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>No student record linked</h2>
      <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20 }}>
        Your account hasn't been linked to a student record yet. Ask your coach to set this up.
      </p>
      <Link to="/join-pka-adult" className="btn btn-primary">Complete membership form →</Link>
    </div>
  )

  const m = student.members
  const houseName = student.house_name || m?.houses?.name
  const colour = HOUSE_COLOURS[houseName] || '#378ADD'
  const initials = `${m?.first_name?.[0] || ''}${m?.last_name?.[0] || ''}`.toUpperCase()
  const age = m?.date_of_birth ? Math.floor((Date.now() - new Date(m.date_of_birth)) / (365.25*24*60*60*1000)) : null
  const totalPts = points.reduce((s, p) => s + (p.points_awarded || 0), 0)
  const shared = apData?.pdp_shared || {}
  const pdp = apData?.pdp_notes || {}

  const sharedSections = PDP_SECTIONS.filter(s => {
    if (s.key === 'athlete_notes') return true
    return shared[s.key]?.length > 0
  })

  return (
    <div style={{ maxWidth: 640, margin: '0 auto' }}>

      {/* Profile header */}
      <div className="card" style={{ marginBottom: 12, borderLeft: `4px solid ${colour}`, borderRadius: '0 var(--border-radius-lg) var(--border-radius-lg) 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 52, height: 52, borderRadius: '50%', background: colour + '22', color: colour, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 700, flexShrink: 0 }}>
            {initials}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{m?.first_name} {m?.last_name}</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
              {student.student_ref} · {student.discipline}
              {age ? ` · Age ${age}` : ''}
              {student.pka_belt || student.krba_level ? ` · ${student.pka_belt || student.krba_level}` : ''}
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
              {houseName && <span style={{ background: colour + '18', color: colour, borderRadius: 20, padding: '2px 10px', fontSize: 11, fontWeight: 600 }}>{houseName}</span>}
              {student.is_kr     && <span className="badge badge-purple" style={{ fontSize: 10 }}>KR</span>}
              {student.is_pts    && <span className="badge badge-blue"   style={{ fontSize: 10 }}>PTs</span>}
              {student.is_leader && <span className="badge badge-green"  style={{ fontSize: 10 }}>Leader</span>}
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: 14, overflowX: 'auto' }}>
        {[
          ['dashboard', '🏠 Home'],
          ['pdp',       '🎯 My PDP'],
          ['tpt',       '📊 Analysis'],
          ['fit2fight', '💪 Fit II Fight'],
          ['points',    '⭐ Points'],
          ['search',    '🔍 Find athlete'],
        ].map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)} style={{
            padding: '10px 14px', fontSize: 13, border: 'none', background: 'none', cursor: 'pointer',
            borderBottom: `2px solid ${tab === key ? colour : 'transparent'}`,
            color: tab === key ? 'var(--text)' : 'var(--text-secondary)',
            fontWeight: tab === key ? 600 : 400, whiteSpace: 'nowrap',
          }}>{label}</button>
        ))}
      </div>

      {/* ── Dashboard ── */}
      {tab === 'dashboard' && (
        <div>
          {/* Stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 14 }}>
            {[
              { label: 'Points',      value: totalPts,        colour, icon: '⭐' },
              { label: 'F2F sessions',value: sessions.length, colour: '#378ADD', icon: '💪' },
              { label: 'Class champ', value: student.class_champion_count || 0, colour: '#EF9F27', icon: '🏆' },
            ].map(s => (
              <div key={s.label} className="card" style={{ textAlign: 'center', padding: '12px 8px' }}>
                <div style={{ fontSize: 22, fontWeight: 700, color: s.colour }}>{s.value}</div>
                <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 2 }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Quick links */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 14 }}>
            {[
              { label: 'My PDP',      icon: '🎯', tab: 'pdp',       colour: '#1D9E75' },
              { label: 'Analysis',    icon: '📊', tab: 'tpt',       colour: '#E24B4A' },
              { label: 'Fit II Fight',icon: '💪', tab: 'fit2fight', colour: '#EF9F27' },
            ].map(l => (
              <button key={l.label} onClick={() => setTab(l.tab)} style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                padding: '14px 8px', background: l.colour + '12',
                border: `1px solid ${l.colour}30`, borderRadius: 'var(--border-radius-lg)',
                cursor: 'pointer', fontFamily: 'var(--font-sans)',
              }}>
                <span style={{ fontSize: 24 }}>{l.icon}</span>
                <span style={{ fontSize: 12, fontWeight: 500, color: l.colour }}>{l.label}</span>
              </button>
            ))}
          </div>

          {/* Recent points */}
          {points.length > 0 && (
            <div className="card" style={{ padding: 0 }}>
              <div style={{ padding: '10px 14px', fontWeight: 600, fontSize: 13, borderBottom: '1px solid var(--border)' }}>Recent points</div>
              <table>
                <tbody>
                  {points.slice(0,5).map((p,i) => (
                    <tr key={i}>
                      <td style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{new Date(p.awarded_at).toLocaleDateString('en-GB')}</td>
                      <td style={{ fontSize: 13 }}>{p.point_type}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: p.points_awarded < 0 ? '#a32d2d' : '#1d9e75' }}>{p.points_awarded > 0 ? '+' : ''}{p.points_awarded}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── PDP ── */}
      {tab === 'pdp' && (
        <div>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 14 }}>
            Notes shared by your coach. Only you and your coach can see these.
          </p>
          {sharedSections.length === 0 && !(pdp.athlete_notes?.length) ? (
            <div className="empty-state">
              <h3>No notes yet</h3>
              <p>Your coach hasn't shared any PDP notes yet</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {sharedSections.map(section => {
                const items = section.key === 'athlete_notes'
                  ? (pdp.athlete_notes || [])
                  : (shared[section.key] || [])
                const sentAt = shared[`${section.key}_sent_at`]
                if (section.key !== 'athlete_notes' && !items.length) return null

                return (
                  <div key={section.key} className="card" style={{ borderLeft: `3px solid ${section.colour}`, borderRadius: '0 var(--border-radius-lg) var(--border-radius-lg) 0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <h3 style={{ fontSize: 13, fontWeight: 600, color: section.colour, margin: 0 }}>{section.label}</h3>
                      <div style={{ display: 'flex', align: 'center', gap: 8 }}>
                        {sentAt && <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{new Date(sentAt).toLocaleDateString('en-GB')}</span>}
                        {section.key === 'athlete_notes' && (
                          <button className="btn btn-sm" style={{ fontSize: 10 }}
                            onClick={() => { setEditNotes(section.key); setNoteText(items[0] || '') }}>
                            {items.length ? 'Edit' : '+ Add note'}
                          </button>
                        )}
                      </div>
                    </div>

                    {editNotes === section.key ? (
                      <div>
                        <textarea rows={4} value={noteText} onChange={e => setNoteText(e.target.value)}
                          placeholder="Write your personal notes here…"
                          style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius)', fontSize: 13, resize: 'vertical', background: 'var(--bg-secondary)', color: 'var(--text)' }} />
                        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                          <button className="btn btn-sm" onClick={() => setEditNotes(null)}>Cancel</button>
                          <button className="btn btn-primary btn-sm" onClick={() => saveAthleteNote(section.key, noteText)} disabled={saving}>
                            {saving ? 'Saving…' : 'Save note'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {items.length > 0 ? items.map((item, i) => (
                          <span key={i} style={{ background: section.colour + '15', color: section.colour, border: `1px solid ${section.colour}30`, borderRadius: 20, padding: '4px 10px', fontSize: 12 }}>{item}</span>
                        )) : (
                          <span style={{ fontSize: 12, color: 'var(--text-tertiary)', fontStyle: 'italic' }}>No notes yet — click Edit to add</span>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Analysis / TPT ── */}
      {tab === 'tpt' && (
        <div>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 14 }}>
            Complete your technical analysis forms
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {student.discipline === 'PKA' ? (
              <Link to="/kickboxing-tpt" className="card" style={{ textDecoration: 'none', textAlign: 'center', padding: 20, color: '#378ADD' }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>📊</div>
                <div style={{ fontWeight: 600 }}>Kickboxing TPT</div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>Technical analysis</div>
              </Link>
            ) : (
              <Link to="/boxing-tpt" className="card" style={{ textDecoration: 'none', textAlign: 'center', padding: 20, color: '#E24B4A' }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>📊</div>
                <div style={{ fontWeight: 600 }}>Boxing TPT</div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>Technical analysis</div>
              </Link>
            )}
            <Link to="/grading" className="card" style={{ textDecoration: 'none', textAlign: 'center', padding: 20, color: '#1D9E75' }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>🎽</div>
              <div style={{ fontWeight: 600 }}>Grading</div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>Expression of interest</div>
            </Link>
          </div>
        </div>
      )}

      {/* ── Fit II Fight ── */}
      {tab === 'fit2fight' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{sessions.length} sessions logged</p>
            <Link to="/fit2fight" className="btn btn-primary btn-sm">+ Log session</Link>
          </div>
          {sessions.length === 0 ? (
            <div className="empty-state"><h3>No sessions yet</h3><p>Log your first training session</p></div>
          ) : (
            <div className="card" style={{ padding: 0 }}>
              <table>
                <thead><tr><th>Date</th><th style={{ textAlign: 'center' }}>Before</th><th style={{ textAlign: 'center' }}>After</th><th style={{ textAlign: 'center' }}>Change</th></tr></thead>
                <tbody>
                  {sessions.map((s,i) => {
                    const wc = s.weight_before && s.weight_after ? (parseFloat(s.weight_after) - parseFloat(s.weight_before)).toFixed(1) : null
                    return (
                      <tr key={i}>
                        <td style={{ fontSize: 12 }}>{new Date(s.session_date).toLocaleDateString('en-GB')}</td>
                        <td style={{ textAlign: 'center', fontSize: 13 }}>{s.weight_before ? `${s.weight_before}kg` : '—'}</td>
                        <td style={{ textAlign: 'center', fontSize: 13 }}>{s.weight_after  ? `${s.weight_after}kg`  : '—'}</td>
                        <td style={{ textAlign: 'center', fontWeight: 700, color: wc < 0 ? '#1d9e75' : wc > 0 ? '#a32d2d' : 'var(--text-secondary)' }}>
                          {wc ? `${wc > 0 ? '+' : ''}${wc}kg` : '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Points log ── */}
      {tab === 'points' && (
        <div>
          <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
            <div className="card" style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ fontSize: 24, fontWeight: 700, color: colour }}>{student.house_points || 0}</div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>House points</div>
            </div>
            <div className="card" style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ fontSize: 24, fontWeight: 700, color: '#1d9e75' }}>{student.individual_points || 0}</div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Individual points</div>
            </div>
          </div>
          <div className="card" style={{ padding: 0 }}>
            <div style={{ padding: '10px 14px', fontWeight: 600, fontSize: 13, borderBottom: '1px solid var(--border)' }}>Points history</div>
            {points.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>No points yet</div>
            ) : (
              <table>
                <thead><tr><th>Date</th><th>Reason</th><th style={{ textAlign: 'right' }}>Points</th></tr></thead>
                <tbody>
                  {points.map((p,i) => (
                    <tr key={i}>
                      <td style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{new Date(p.awarded_at).toLocaleDateString('en-GB')}</td>
                      <td style={{ fontSize: 13 }}>{p.point_type}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700, fontSize: 13, color: p.points_awarded < 0 ? '#a32d2d' : '#1d9e75' }}>
                        {p.points_awarded > 0 ? '+' : ''}{p.points_awarded}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
      {/* ── Athlete search ── */}
      {tab === 'search' && (
        <div>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 14 }}>Search for another athlete's public profile</p>
          <AthleteSearch />
        </div>
      )}
    </div>
  )
}

function AthleteSearch() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])

  useEffect(() => {
    if (query.length < 2) { setResults([]); return }
    const t = setTimeout(async () => {
      const { data: memberData } = await supabase
        .from('members').select('id, first_name, last_name')
        .or(`first_name.ilike.%${query}%,last_name.ilike.%${query}%`).limit(8)
      if (!memberData?.length) { setResults([]); return }
      const { data: athletes } = await supabase
        .from('students').select('id, student_ref, pka_belt, krba_level, discipline, house_name, member_id')
        .in('member_id', memberData.map(m => m.id))
      const merged = (athletes || []).map(s => ({ ...s, members: memberData.find(m => m.id === s.member_id) }))
      setResults(merged)
    }, 200)
    return () => clearTimeout(t)
  }, [query])

  return (
    <div>
      <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Type athlete name…"
        style={{ width: '100%', padding: '10px', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius)', fontSize: 14, background: 'var(--bg-secondary)', color: 'var(--text)', marginBottom: 10 }} />
      {results.map(s => {
        const m = s.members
        return (
          <a key={s.id} href={`/athletes?id=${s.id}`} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 12, border: '1px solid var(--border)', borderRadius: 'var(--radius)', textDecoration: 'none', color: 'var(--text)', marginBottom: 6 }}>
            <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--bg-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700 }}>
              {m?.first_name?.[0]}{m?.last_name?.[0]}
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 500 }}>{m?.first_name} {m?.last_name}</div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{s.student_ref} · {s.discipline} · {s.pka_belt || s.krba_level || '—'}</div>
            </div>
          </a>
        )
      })}
    </div>
  )
}
