import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../../lib/supabase.js'
import { useAuth } from '../../hooks/useAuth.jsx'
import { loadAwardsCurrent, nominationsOpen, catHint } from '../../lib/awards.js'

// 🏆 Coaches: nominate ONE student per award category -- their own classes' awards, plus the
// KR / KRBA squad and club awards (any coach). Results are admin-only.
const fmt = d => new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

export default function AwardsNominate() {
  const { profile, registerAccess, isAdmin } = useAuth()
  const [cur, setCur] = useState(null)
  const [cats, setCats] = useState([])
  const [mine, setMine] = useState({})            // category_id -> my nomination
  const [open, setOpen] = useState(false)
  const [openGrp, setOpenGrp] = useState({})
  const [pick, setPick] = useState(null)          // { cat } -- picker open
  const myClassIds = registerAccess?.classes || null
  const [allowed, setAllowed] = useState(null)    // coaches: ids of students in their classes (admins: null = everyone)
  const [reminder, setReminder] = useState(false)
  const cardRef = useRef(null)

  async function load() {
    const c = await loadAwardsCurrent()
    setCur(c)
    if (!nominationsOpen(c)) return
    const [{ data: cs }, { data: noms }] = await Promise.all([
      supabase.from('awards_categories').select('*').eq('year', c.year).eq('vote', false).neq('grp_kind', 'house').order('sort'),
      supabase.from('awards_nominations').select('*').eq('coach_member_id', profile?.id),
    ])
    // coaches only see / nominate students from THEIR classes: class awards for their classes, and the
    // KR / KRBA / club awards only if some of their students are in them (admins see everything)
    let ids = null, squads = null
    if (!isAdmin && myClassIds) {
      const today = new Date().toISOString().split('T')[0]
      const { data: asg } = await supabase.from('student_class_assignments').select('*').in('class_id', myClassIds.length ? myClassIds : ['00000000-0000-0000-0000-000000000000'])
      ids = [...new Set((asg || []).filter(a => (!a.start_date || a.start_date <= today) && (!a.end_date || a.end_date >= today)).map(a => a.student_id))]
      const { data: st } = ids.length ? await supabase.from('students').select('id, is_kr, discipline').in('id', ids) : { data: [] }
      squads = new Set([(st || []).some(x => x.is_kr) && 'KR', (st || []).some(x => x.discipline === 'KRBA') && 'KRBA'].filter(Boolean))
    }
    setAllowed(ids)
    const visible = (cs || []).filter(x => isAdmin || !myClassIds ? true
      : x.grp_kind === 'class' ? (x.class_ids?.length ? x.class_ids : [x.class_id]).some(id => myClassIds.includes(id))
      : x.grp_kind === 'squad' ? squads.has(x.squad)
      : (ids || []).length > 0)
    setCats(visible)
    const mineMap = Object.fromEntries((noms || []).map(n => [n.category_id, n]))
    setMine(mineMap)
    // 🔔 reminder once per login while some are still to do
    const left = visible.filter(x => !mineMap[x.id]).length
    let shown = false; try { shown = sessionStorage.getItem('kc_awards_reminder') === '1' } catch { /* */ }
    if (left && !shown) { setReminder(true); try { sessionStorage.setItem('kc_awards_reminder', '1') } catch { /* */ } }
  }
  useEffect(() => { if (profile?.id) load() }, [profile?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const groups = useMemo(() => {
    const g = {}
    cats.forEach(c => { (g[c.grp] ||= { grp: c.grp, kind: c.grp_kind, cats: [] }).cats.push(c) })
    const order = { class: 0, squad: 1, club: 2 }
    return Object.values(g).sort((a, b) => (order[a.kind] ?? 9) - (order[b.kind] ?? 9) || a.grp.localeCompare(b.grp))
  }, [cats])

  if (!cur || !nominationsOpen(cur) || !groups.length) return null
  const done = cats.filter(c => mine[c.id]).length

  return (
    <div ref={cardRef} className="card" style={{ marginBottom: 16, border: '1px solid #EF9F2766', scrollMarginTop: 70 }}>
      <button type="button" onClick={() => setOpen(o => !o)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--text)', textAlign: 'left', fontFamily: 'var(--font-sans)' }}>
        <b style={{ fontSize: 15, flex: 1 }}>🏆 Awards {cur.year} nominations</b>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#EF9F27' }}>{done} of {cats.length} done{cur.close ? ` · close ${fmt(cur.close)}` : ''}</span>
        <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{open ? '▲' : '▼'}</span>
      </button>
      <div className={`kc-slide${open ? ' open' : ''}`}><div>
        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', margin: '8px 0' }}>Pick one student for each award -- only students from your classes are shown. You can change it until nominations close.</div>
        {groups.map(g => {
          const gDone = g.cats.filter(c => mine[c.id]).length
          return (
            <div key={g.grp} style={{ border: '1px solid var(--border)', borderRadius: 8, marginBottom: 8 }}>
              <button type="button" onClick={() => setOpenGrp(o => ({ ...o, [g.grp]: !o[g.grp] }))} style={{ width: '100%', display: 'flex', gap: 8, padding: '9px 10px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text)', textAlign: 'left', fontFamily: 'var(--font-sans)' }}>
                <b style={{ flex: 1, fontSize: 13 }}>{g.grp}</b>
                <span style={{ fontSize: 11, color: gDone === g.cats.length ? '#1D9E75' : 'var(--text-tertiary)' }}>{gDone}/{g.cats.length}</span>
                <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{openGrp[g.grp] ? '▲' : '▼'}</span>
              </button>
              <div className={`kc-slide${openGrp[g.grp] ? ' open' : ''}`}><div style={{ padding: openGrp[g.grp] ? '0 10px 6px' : 0 }}>
                {g.cats.map(c => (
                  <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0', borderTop: '1px solid var(--border)' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{c.name}</div>
                      {mine[c.id] ? <div style={{ fontSize: 12, color: '#1D9E75' }}>✓ {mine[c.id].nominee_name}{mine[c.id].reason ? <span style={{ color: 'var(--text-tertiary)' }}> -- {mine[c.id].reason}</span> : null}</div>
                        : <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{catHint(c.name).hint ? `Suggested: ${catHint(c.name).hint}` : 'Not nominated yet'}</div>}
                    </div>
                    <button type="button" className={`btn btn-sm${mine[c.id] ? '' : ' btn-primary'}`} onClick={() => setPick({ cat: c })}>{mine[c.id] ? 'Change' : 'Nominate'}</button>
                  </div>
                ))}
              </div></div>
            </div>
          )
        })}
      </div></div>
      {reminder && createPortal(
        <div onClick={() => setReminder(false)} style={{ position: 'fixed', inset: 0, zIndex: 600, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div className="card" onClick={e => e.stopPropagation()} style={{ maxWidth: 360, width: '100%', padding: 20, textAlign: 'center' }}>
            <div style={{ fontSize: 30 }}>🏆</div>
            <div style={{ fontSize: 17, fontWeight: 700, margin: '6px 0' }}>Awards {cur.year} nominations</div>
            <div style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 14 }}>
              {cats.length - done} award{cats.length - done === 1 ? '' : 's'} still to nominate for{cur.close ? <> · nominations close <b>{fmt(cur.close)}</b></> : ''}. Pick one student from your classes for each.
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn" style={{ flex: 1, justifyContent: 'center' }} onClick={() => setReminder(false)}>Later</button>
              <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={() => {
                setReminder(false); setOpen(true)
                // open the awards list and scroll down to it (and open the first group still to do)
                const first = groups.find(g => g.cats.some(c => !mine[c.id]))
                if (first) setOpenGrp(o => ({ ...o, [first.grp]: true }))
                setTimeout(() => cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 150)
              }}>Nominate now</button>
            </div>
          </div>
        </div>, document.body)}
      {pick && createPortal(<Picker cat={pick.cat} current={mine[pick.cat.id]} year={cur.year} profile={profile} allowed={allowed}
        onClose={() => setPick(null)} onSaved={n => { setMine(m => ({ ...m, [pick.cat.id]: n })); setPick(null) }}
        onRemoved={() => { setMine(m => { const x = { ...m }; delete x[pick.cat.id]; return x }); setPick(null) }} />, document.body)}
    </div>
  )
}

function Picker({ cat, current, year, profile, allowed, onClose, onSaved, onRemoved }) {
  const [people, setPeople] = useState(null)
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(current ? { student_id: current.student_id, member_id: current.member_id, name: current.nominee_name } : null)
  const [reason, setReason] = useState(current?.reason || '')
  const [busy, setBusy] = useState(false)
  const how = catHint(cat.name)

  useEffect(() => {
    (async () => {
      const today = new Date().toISOString().split('T')[0], y0 = `${year}-01-01`
      let list = []
      if (cat.name === 'Coaches coach') {
        const { data } = await supabase.from('members').select('id, first_name, last_name, role').in('role', ['admin', 'captain', 'coach', 'leader', 'head_coach'])
        list = (data || []).map(m => ({ member_id: m.id, name: `${m.first_name} ${m.last_name}`.trim(), sub: m.role }))
      } else {
        let ids = null
        if (cat.grp_kind === 'class' && cat.class_id) {
          const { data: asg } = await supabase.from('student_class_assignments').select('*').in('class_id', cat.class_ids?.length ? cat.class_ids : [cat.class_id])
          ids = [...new Set((asg || []).filter(a => (!a.start_date || a.start_date <= today) && (!a.end_date || a.end_date >= today)).map(a => a.student_id))]
        }
        let qs = supabase.from('students').select('id, is_kr, discipline, house_points, photo_url, members(first_name, last_name, joined_date, status)')
        if (ids) qs = qs.in('id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000'])
        const { data: st } = await qs
        let rows = (st || []).filter(s => (s.members?.status || 'active') === 'active' && (!allowed || allowed.includes(s.id)))   // coaches: their classes only
        if (cat.squad === 'KR') rows = rows.filter(s => s.is_kr)
        if (cat.squad === 'KRBA') rows = rows.filter(s => s.discipline === 'KRBA')
        // sessions this year
        const sids = rows.map(s => s.id), sess = {}
        for (let i = 0; i < sids.length; i += 150) {
          const { data: att } = await supabase.from('attendance').select('student_id, session_date, attendance_type').in('student_id', sids.slice(i, i + 150)).gte('session_date', y0)
          const seen = new Set()
          ;(att || []).filter(a => ['attended', 'full_kit'].includes(a.attendance_type)).forEach(a => { const k = a.student_id + a.session_date; if (!seen.has(k)) { seen.add(k); sess[a.student_id] = (sess[a.student_id] || 0) + 1 } })
        }
        list = rows.map(s => ({ student_id: s.id, photo: s.photo_url, name: `${s.members?.first_name || ''} ${s.members?.last_name || ''}`.trim(),
          joined: s.members?.joined_date || '', sessions: sess[s.id] || 0, points: s.house_points || 0 }))
      }
      const sorters = { joined: (a, b) => String(b.joined).localeCompare(String(a.joined)), sessions: (a, b) => b.sessions - a.sessions, points: (a, b) => b.points - a.points, name: (a, b) => a.name.localeCompare(b.name) }
      setPeople(list.sort(sorters[how.sort] || sorters.name))
    })()
  }, [cat.id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function save() {
    if (!sel) return alert('Choose a student first.')
    setBusy(true)
    const row = { category_id: cat.id, student_id: sel.student_id || null, member_id: sel.member_id || null, nominee_name: sel.name,
      coach_member_id: profile.id, coach_name: `${profile.first_name || ''} ${profile.last_name || ''}`.trim(), reason: reason.trim() || null }
    const { data, error } = await supabase.from('awards_nominations').upsert(row, { onConflict: 'category_id,coach_member_id' }).select().single()
    setBusy(false)
    if (error) return alert('Could not save: ' + error.message)
    onSaved(data)
  }
  async function remove() {
    if (!current || !confirm('Remove your nomination?')) return
    const { error } = await supabase.from('awards_nominations').delete().eq('id', current.id)
    if (error) return alert('Could not remove: ' + error.message)
    onRemoved()
  }
  const y = String(year)
  const shown = (people || []).filter(p => !q.trim() || p.name.toLowerCase().includes(q.trim().toLowerCase()))
  return (
    <div onClick={onClose} style={{ position: 'fixed', top: 0, left: 0, right: 0, height: 'calc(var(--kc-vh, 1vh) * 100)', zIndex: 500, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12 }}>
      <div className="card" onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 440, maxHeight: 'calc(var(--kc-vh, 1vh) * 88)', overflowY: 'auto', overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch', padding: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <b style={{ fontSize: 15 }}>🏆 {cat.name}</b><button className="btn btn-sm" onClick={onClose}>✕</button>
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>{cat.grp}{how.hint ? ` · sorted by ${how.hint}` : ''}</div>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="🔍 Type a name…" style={{ marginBottom: 8 }} />
        {!people ? <div style={{ color: 'var(--text-tertiary)' }}>Loading…</div> : shown.map(p => {
          const on = sel && ((p.student_id && p.student_id === sel.student_id) || (p.member_id && p.member_id === sel.member_id))
          return (
            <button key={p.student_id || p.member_id} type="button" onClick={() => setSel(p)}
              style={{ display: 'flex', width: '100%', alignItems: 'center', gap: 10, padding: '8px 10px', marginBottom: 4, borderRadius: 8, cursor: 'pointer', textAlign: 'left',
                border: `1px solid ${on ? '#1D9E75' : 'var(--border)'}`, background: on ? '#1D9E7522' : 'transparent', color: 'var(--text)' }}>
              {p.photo ? <img src={p.photo} alt="" style={{ width: 34, height: 34, borderRadius: 8, objectFit: 'cover' }} /> : <span style={{ width: 34 }} />}
              <span style={{ flex: 1, fontSize: 14, fontWeight: on ? 700 : 500 }}>{p.name}</span>
              <span style={{ fontSize: 11, color: 'var(--text-tertiary)', textAlign: 'right' }}>
                {p.sub || <>{p.sessions} sessions · {p.points} pts{p.joined?.startsWith(y) ? <><br /><b style={{ color: '#1D9E75' }}>joined {y}</b></> : null}</>}
              </span>
            </button>
          )
        })}
        <input value={reason} onChange={e => setReason(e.target.value)} placeholder="Why? (optional, e.g. never misses a session)" style={{ margin: '8px 0' }} />
        <div style={{ display: 'flex', gap: 8 }}>
          {current && <button className="btn" onClick={remove}>Remove</button>}
          <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} disabled={busy || !sel} onClick={save}>{busy ? 'Saving…' : `Nominate ${sel?.name?.split(' ')[0] || ''}`}</button>
        </div>
      </div>
    </div>
  )
}
