import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase.js'
import { fetchAll } from '../../lib/fetchAll.js'
import { studentProfileLink } from '../../lib/studentLinks.js'
import { divisionsForAge, kbLabel, boxLabel, divisionKey } from '../../lib/divisions.js'

// 🌐 Website profiles (teamkodered.com) -- coach approval card, bottom of the coach Dashboard.
// Who: athletes with "Show on website" ticked, KR (-> Kickboxing page) and/or KRBA (-> Boxing page).
// Juniors (under 18, or no date of birth) only with media consent = Yes; "No media" never goes.
// A profile is WAITING when what would go on the website differs from what a coach last approved
// (or it has never been approved). Approve stores that snapshot; Send back parks it with a note
// until the profile changes again. Nothing is sent to WordPress yet (step 2).

const FIELDS = [
  ['name', 'Name'], ['photo', 'Photo'], ['pages', 'Page'], ['house', 'House'],
  ['age_kickboxing', 'Age division (kickboxing)'], ['age_boxing', 'Age division (boxing)'],
  ['weight_division', 'Weight division'], ['debut', 'Kode Red debut'],
  ['top_achievements', 'Top achievements'], ['favourite_technique', 'Favourite technique'],
  ['training_music', 'Training music'], ['results', 'Results'],
]
const BLUE = '#378ADD'
const chunk = (arr, n) => { const out = []; for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out }
const ageNow = dob => {
  if (!dob) return null
  const b = new Date(String(dob).slice(0, 10) + 'T12:00:00'), n = new Date()
  return n.getFullYear() - b.getFullYear() - ((n.getMonth() < b.getMonth() || (n.getMonth() === b.getMonth() && n.getDate() < b.getDate())) ? 1 : 0)
}
const clean = v => (v == null ? '' : String(v).trim())

function buildSnapshot(st, ap) {
  const m = st.members || {}
  const boxing = st.discipline === 'KRBA', kick = !!st.is_kr
  const div = divisionsForAge(m.date_of_birth)
  // Elite is a choice, not an age: keep it when the saved boxing division says Elite and the age fits
  let boxAge = div.boxing?.label || ''
  if (boxing && divisionKey(ap.age_division_boxing) === 'ELT' && div.age >= 19 && div.age <= 40) boxAge = boxLabel('ELT')
  return {
    name: [clean(m.first_name), clean(m.last_name)].filter(Boolean).join(' '),
    photo: clean(st.photo_url || ap.profile_photo_url),
    pages: [boxing && 'Boxing', kick && 'Kickboxing'].filter(Boolean).join(' + '),
    house: clean(m.houses?.name || st.house_name),
    age_kickboxing: kick ? clean(div.kickboxing ? kbLabel(div.kickboxing.key) : '') : '',
    age_boxing: boxing ? clean(boxAge) : '',
    weight_division: clean(ap.weight_division),
    debut: ap.kode_red_debut ? String(ap.kode_red_debut).slice(0, 4) : '',
    top_achievements: clean(ap.top_achievements),
    favourite_technique: clean(ap.favourite_technique),
    training_music: clean(ap.training_music),
    results: (Array.isArray(ap.recent_results) ? ap.recent_results : []).map(clean).filter(Boolean).join('\n'),
  }
}
const same = (a, b) => !!a && !!b && FIELDS.every(([k]) => clean(a[k]) === clean(b[k]))

export default function WebsiteProfiles({ profile, onCount }) {
  const [rows, setRows] = useState(null)       // [{ st, snap, review, state }]
  const [heldBack, setHeldBack] = useState([])  // juniors without media consent
  const [error, setError] = useState('')
  const [open, setOpen] = useState(null)        // null = auto (open when something waits)
  const [expanded, setExpanded] = useState({})
  const [sendBack, setSendBack] = useState(null) // { id, note }
  const [busy, setBusy] = useState(null)
  const [showOther, setShowOther] = useState(false)

  const load = useCallback(async () => {
    setError('')
    const { data: aps, error: e1 } = await fetchAll(() => supabase.from('athlete_profiles')
      .select('student_id, weight_division, kode_red_debut, top_achievements, favourite_technique, training_music, recent_results, profile_photo_url, age_division_boxing')
      .eq('show_on_website', true).order('student_id'))
    if (e1) { setError('Could not load website profiles.'); setRows([]); return }
    const ids = [...new Set((aps || []).map(a => a.student_id).filter(Boolean))]
    const studs = [], revs = []
    for (const part of chunk(ids, 150)) {
      const [{ data: s }, { data: r, error: e2 }] = await Promise.all([
        supabase.from('students').select('id, photo_url, is_kr, is_pts, discipline, media_restriction, house_name, member_id, members(first_name, last_name, date_of_birth, houses(name))').in('id', part),
        supabase.from('website_profile_reviews').select('*').in('student_id', part),
      ])
      if (e2) { setError('The website approvals table isn’t set up yet — run supabase_website_profiles.sql in Supabase.'); setRows([]); return }
      studs.push(...(s || [])); revs.push(...(r || []))
    }
    const apBy = Object.fromEntries((aps || []).map(a => [a.student_id, a]))
    const revBy = Object.fromEntries(revs.map(r => [r.student_id, r]))
    const out = [], held = []
    for (const st of studs) {
      if (!(st.is_kr || st.discipline === 'KRBA')) continue // no website page for them
      const age = ageNow(st.members?.date_of_birth)
      if (st.media_restriction === 'No' || ((age == null || age < 18) && st.media_restriction !== 'Yes')) { held.push(st); continue }
      const snap = buildSnapshot(st, apBy[st.id] || {})
      const review = revBy[st.id] || null
      const state = same(snap, review?.approved) ? 'approved' : same(snap, review?.sent_back) ? 'sent_back' : 'waiting'
      out.push({ st, snap, review, state })
    }
    out.sort((a, b) => a.snap.name.localeCompare(b.snap.name))
    setRows(out); setHeldBack(held)
  }, [])

  useEffect(() => { load() }, [load])
  const waiting = (rows || []).filter(r => r.state === 'waiting')
  useEffect(() => { if (rows) onCount?.(waiting.length) }, [rows]) // eslint-disable-line react-hooks/exhaustive-deps

  async function save(row, patch) {
    setBusy(row.st.id)
    const { data, error: e } = await supabase.from('website_profile_reviews')
      .upsert({ student_id: row.st.id, ...patch, updated_at: new Date().toISOString() }, { onConflict: 'student_id' }).select('student_id')
    setBusy(null)
    if (e || !data?.length) { alert('Not saved — you may not have access to this athlete.' + (e ? `\n${e.message}` : '')); return false }
    await load()
    return true
  }
  const approve = row => save(row, { approved: row.snap, approved_at: new Date().toISOString(), approved_by: profile?.id || null, sent_back: null, sent_back_note: null, sent_back_at: null, sent_back_by: null })
  const doSendBack = async () => {
    const row = rows.find(r => r.st.id === sendBack.id)
    if (row && await save(row, { sent_back: row.snap, sent_back_note: sendBack.note.trim() || null, sent_back_at: new Date().toISOString(), sent_back_by: profile?.id || null })) setSendBack(null)
  }
  const reopen = row => save(row, { sent_back: null, sent_back_note: null, sent_back_at: null, sent_back_by: null })
  async function approveAll() {
    if (!confirm(`Approve all ${waiting.length} waiting website profile${waiting.length === 1 ? '' : 's'}?`)) return
    for (const r of waiting) {
      // one at a time so a failure shows which athlete
      const ok = await supabase.from('website_profile_reviews').upsert({ student_id: r.st.id, approved: r.snap, approved_at: new Date().toISOString(), approved_by: profile?.id || null, sent_back: null, sent_back_note: null, sent_back_at: null, sent_back_by: null, updated_at: new Date().toISOString() }, { onConflict: 'student_id' }).select('student_id')
      if (ok.error || !ok.data?.length) { alert(`Stopped at ${r.snap.name} — not saved.`); break }
    }
    load()
  }

  if (!rows) return null
  const isOpen = open ?? waiting.length > 0
  const sentBack = rows.filter(r => r.state === 'sent_back')
  const approved = rows.filter(r => r.state === 'approved')

  const Value = ({ k, v }) => {
    if (!v) return <span style={{ color: 'var(--text-tertiary)' }}>—</span>
    if (k === 'photo') return <img src={v} alt="" style={{ width: 44, height: 44, borderRadius: 8, objectFit: 'cover', display: 'block' }} />
    return <span style={{ whiteSpace: 'pre-line', wordBreak: 'break-word' }}>{v}</span>
  }

  return (
    <div id="website-profiles-card" className="card" style={{ marginTop: 14, padding: 0, border: `1px solid ${BLUE}40` }}>
      <button onClick={() => setOpen(!isOpen)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-sans)', color: 'var(--text)', textAlign: 'left' }}>
        <h2 style={{ fontSize: 14, fontWeight: 600, flex: 1 }}>🌐 Website profiles</h2>
        {waiting.length > 0 && <span style={{ background: BLUE, color: '#fff', borderRadius: 999, fontSize: 11, fontWeight: 700, padding: '2px 8px' }}>{waiting.length} waiting</span>}
        <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{isOpen ? '▲' : '▼'}</span>
      </button>

      {isOpen && (
        <div style={{ padding: '0 16px 14px' }}>
          {error && <p style={{ fontSize: 12, color: '#E24B4A', marginBottom: 8 }}>{error}</p>}
          <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 10 }}>
            Changes to teamkodered.com profiles wait here for a coach. Approved changes go live once the website connection is switched on.
          </p>

          {waiting.length === 0 && !error && <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8 }}>✓ Nothing waiting.</p>}
          {waiting.length > 1 && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
              <button className="btn btn-sm" onClick={approveAll} disabled={!!busy}>✓ Approve all ({waiting.length})</button>
            </div>
          )}

          {waiting.map(r => {
            const old = r.review?.approved
            const changed = FIELDS.filter(([k]) => clean(r.snap[k]) !== clean(old?.[k]) && (old || r.snap[k]))
            const showAll = expanded[r.st.id]
            const list = showAll || !old ? FIELDS.filter(([k]) => old || r.snap[k]) : changed
            return (
              <div key={r.st.id} style={{ border: '1px solid var(--border)', borderRadius: 'var(--border-radius-lg)', padding: 12, marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  {r.snap.photo ? <img src={r.snap.photo} alt="" style={{ width: 34, height: 34, borderRadius: '50%', objectFit: 'cover' }} /> : <span style={{ fontSize: 22 }}>👤</span>}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Link to={studentProfileLink(r.st)} style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{r.snap.name || 'Unnamed'}</Link>
                    <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                      {r.snap.pages} · {old ? `${changed.length} change${changed.length === 1 ? '' : 's'}` : 'New profile'}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {list.map(([k, label]) => {
                    const diff = clean(r.snap[k]) !== clean(old?.[k])
                    return (
                      <div key={k} style={{ fontSize: 12, padding: '6px 8px', borderRadius: 6, background: diff ? `${BLUE}12` : 'transparent' }}>
                        <div style={{ color: 'var(--text-secondary)', marginBottom: 3 }}>{label}</div>
                        {old && diff ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <span style={{ opacity: 0.6, textDecoration: k === 'photo' ? 'none' : 'line-through' }}><Value k={k} v={old[k]} /></span>
                            <span style={{ color: BLUE, fontWeight: 700 }}>→</span>
                            <span style={{ fontWeight: 500 }}><Value k={k} v={r.snap[k]} /></span>
                          </div>
                        ) : <span style={{ fontWeight: 500 }}><Value k={k} v={r.snap[k]} /></span>}
                      </div>
                    )
                  })}
                  {old && <button onClick={() => setExpanded(x => ({ ...x, [r.st.id]: !showAll }))} style={{ alignSelf: 'flex-start', background: 'none', border: 'none', color: BLUE, fontSize: 12, cursor: 'pointer', padding: '2px 0' }}>{showAll ? 'Show changes only' : 'Show whole profile'}</button>}
                </div>

                {sendBack?.id === r.st.id ? (
                  <div style={{ marginTop: 10 }}>
                    <textarea autoFocus value={sendBack.note} onChange={e => setSendBack(s => ({ ...s, note: e.target.value }))} placeholder="What needs fixing? (optional)" rows={2}
                      style={{ width: '100%', padding: 8, fontSize: 13, border: '1px solid var(--border-strong)', borderRadius: 'var(--radius)', background: 'var(--bg-secondary)', color: 'var(--text)', fontFamily: 'var(--font-sans)' }} />
                    <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                      <button className="btn btn-sm" onClick={doSendBack} disabled={busy === r.st.id} style={{ flex: 1 }}>↩ Send back</button>
                      <button className="btn btn-sm" onClick={() => setSendBack(null)} style={{ flex: 1 }}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                    <button className="btn btn-sm" onClick={() => approve(r)} disabled={busy === r.st.id} style={{ flex: 1, background: '#1D9E75', color: '#fff', border: 'none' }}>✓ Approve</button>
                    <button className="btn btn-sm" onClick={() => setSendBack({ id: r.st.id, note: '' })} disabled={busy === r.st.id} style={{ flex: 1 }}>↩ Send back</button>
                  </div>
                )}
              </div>
            )
          })}

          {(sentBack.length > 0 || approved.length > 0 || heldBack.length > 0) && (
            <button onClick={() => setShowOther(v => !v)} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: 12, cursor: 'pointer', padding: '4px 0' }}>
              {showOther ? '▲' : '▼'} {[sentBack.length && `${sentBack.length} sent back`, approved.length && `${approved.length} approved`, heldBack.length && `${heldBack.length} held back (no media consent)`].filter(Boolean).join(' · ')}
            </button>
          )}
          {showOther && (
            <div style={{ fontSize: 12, marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {sentBack.map(r => (
                <div key={r.st.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ flex: 1 }}>↩ <Link to={studentProfileLink(r.st)} style={{ color: 'var(--text)' }}>{r.snap.name}</Link>{r.review?.sent_back_note && <span style={{ color: 'var(--text-tertiary)' }}> — {r.review.sent_back_note}</span>}</span>
                  <button className="btn btn-sm" onClick={() => reopen(r)} disabled={busy === r.st.id}>Review again</button>
                </div>
              ))}
              {approved.map(r => (
                <div key={r.st.id} style={{ padding: '6px 0', borderBottom: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
                  ✓ <Link to={studentProfileLink(r.st)} style={{ color: 'var(--text)' }}>{r.snap.name}</Link> · {r.snap.pages}
                  {r.review?.approved_at && <span style={{ color: 'var(--text-tertiary)' }}> · approved {new Date(r.review.approved_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>}
                  <span style={{ color: 'var(--text-tertiary)' }}> · {r.review?.published_at ? 'on website' : 'not on website yet'}</span>
                </div>
              ))}
              {heldBack.map(st => (
                <div key={st.id} style={{ padding: '6px 0', borderBottom: '1px solid var(--border)', color: 'var(--text-tertiary)' }}>
                  🚫 <Link to={studentProfileLink(st)} style={{ color: 'var(--text-secondary)' }}>{st.members?.first_name} {st.members?.last_name}</Link> · media consent {st.media_restriction || 'not given'}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
