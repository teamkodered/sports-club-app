import { useEffect, useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '../../lib/supabase.js'
import { CLASS_CATS, SQUAD_CATS, CLUB_CATS, VOTE_CATS, loadAwardsCurrent, saveAwardsCurrent, classLabel } from '../../lib/awards.js'

// 🏆 Admin: set up the awards year, open / close nominations, see coaches' nominations and the
// athletes' votes, pick the winners, houses from the points, export the register, past years.
export default function AwardsPanel() {
  const [cur, setCur] = useState(null)
  const [cats, setCats] = useState([])
  const [noms, setNoms] = useState([])
  const [votes, setVotes] = useState([])
  const [classes, setClasses] = useState([])
  const [setup, setSetup] = useState(null)        // { classIds:Set } -- starting a year
  const [openGrp, setOpenGrp] = useState({})
  const [houses, setHouses] = useState(null)
  const [past, setPast] = useState(null), [pastYear, setPastYear] = useState('')
  const [busy, setBusy] = useState(false)

  async function load(c = cur) {
    const [{ data: cs }, { data: cl }] = await Promise.all([
      supabase.from('awards_categories').select('*').eq('year', c.year).order('sort'),
      supabase.from('classes').select('id, name, day_of_week, start_time, active').order('day_of_week'),
    ])
    setCats(cs || [])
    setClasses((cl || []).filter(x => x.active !== false && !/register/i.test(x.name || '')))
    const ids = (cs || []).map(x => x.id)
    if (ids.length) {
      const [{ data: n }, { data: v }] = await Promise.all([
        supabase.from('awards_nominations').select('*').in('category_id', ids),
        supabase.from('awards_votes').select('*').in('category_id', ids),
      ])
      setNoms(n || []); setVotes(v || [])
    } else { setNoms([]); setVotes([]) }
  }
  useEffect(() => { loadAwardsCurrent().then(c => { setCur(c); load(c) }) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function saveCur(patch) {
    const v = { ...cur, ...patch }
    const { error } = await saveAwardsCurrent(v)
    if (error) return alert('Could not save: ' + error.message)
    setCur(v)
  }

  async function startYear() {
    const rows = []; let sort = 0
    classes.filter(c => setup.classIds.has(c.id)).forEach(c => CLASS_CATS.forEach(n => rows.push({ year: cur.year, grp: classLabel(c), grp_kind: 'class', class_id: c.id, name: n, sort: sort++ })))
    ;['KR', 'KRBA'].forEach(sq => SQUAD_CATS.forEach(n => rows.push({ year: cur.year, grp: sq, grp_kind: 'squad', squad: sq, name: n, vote: VOTE_CATS.includes(n), sort: sort++ })))
    CLUB_CATS.forEach(n => rows.push({ year: cur.year, grp: 'Club awards', grp_kind: 'club', name: n, sort: sort++ }))
    setBusy(true)
    const { error } = await supabase.from('awards_categories').insert(rows)
    setBusy(false)
    if (error) return alert('Could not create: ' + error.message + (/awards_/.test(error.message) ? ' (run supabase_awards.sql first)' : ''))
    setSetup(null); load()
  }

  async function pickWinner(cat, n) {
    const patch = n ? { winner_name: n.name, winner_student_id: n.student_id || null, winner_member_id: n.member_id || null } : { winner_name: null, winner_student_id: null, winner_member_id: null }
    const { error } = await supabase.from('awards_categories').update(patch).eq('id', cat.id)
    if (error) return alert('Could not save: ' + error.message)
    setCats(cs => cs.map(c => c.id === cat.id ? { ...c, ...patch } : c))
  }

  // houses: top 3 per house + house winner + student house winner, from the points
  async function loadHouses() {
    const [{ data: hs }, { data: st }] = await Promise.all([
      supabase.from('houses').select('name, points').order('points', { ascending: false }),
      supabase.from('students').select('id, house_points, house_name, members(first_name, last_name, status, houses(name))'),
    ])
    const by = {}
    ;(st || []).filter(s => (s.members?.status || 'active') === 'active').forEach(s => {
      const h = s.members?.houses?.name || s.house_name; if (!h) return
      ;(by[h] ||= []).push({ student_id: s.id, name: `${s.members?.first_name || ''} ${s.members?.last_name || ''}`.trim(), pts: s.house_points || 0 })
    })
    Object.values(by).forEach(l => l.sort((a, b) => b.pts - a.pts))
    const all = Object.values(by).flat().sort((a, b) => b.pts - a.pts)
    setHouses({ list: (hs || []).map(h => ({ ...h, top: (by[h.name] || []).slice(0, 3) })), winner: hs?.[0]?.name, student: all[0] })
  }
  async function saveHouses() {
    if (!houses) return
    const rows = []; let sort = 1000
    houses.list.forEach(h => h.top.forEach((p, i) => rows.push({ year: cur.year, grp: 'Houses', grp_kind: 'house', name: `${h.name} #${i + 1}`, winner_name: p.name, winner_student_id: p.student_id, sort: sort++ })))
    rows.push({ year: cur.year, grp: 'Houses', grp_kind: 'house', name: 'House winners', winner_name: houses.winner, sort: sort++ })
    if (houses.student) rows.push({ year: cur.year, grp: 'Houses', grp_kind: 'house', name: 'Student house winner', winner_name: houses.student.name, winner_student_id: houses.student.student_id, sort: sort++ })
    await supabase.from('awards_categories').delete().eq('year', cur.year).eq('grp_kind', 'house')
    const { error } = await supabase.from('awards_categories').insert(rows)
    if (error) return alert('Could not save: ' + error.message)
    load(); alert('🏠 House results saved to the register.')
  }

  function exportRegister() {
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.json_to_sheet(cats.map(c => {
      const n = noms.filter(x => x.category_id === c.id), v = votes.filter(x => x.category_id === c.id)
      return { Group: c.grp, Award: c.name, Winner: c.winner_name || '', Nominations: c.vote ? `${v.length} votes` : n.map(x => `${x.nominee_name} (${x.coach_name || 'coach'})`).join('; ') }
    }))
    XLSX.utils.book_append_sheet(wb, ws, `Awards ${cur.year}`)
    XLSX.writeFile(wb, `awards_register_${cur.year}.xlsx`)
  }
  async function loadPast() {
    const { data } = await supabase.from('awards_history').select('*').order('year', { ascending: false })
    setPast(data || []); setPastYear(String(data?.[0]?.year || ''))
  }

  const groups = useMemo(() => {
    const g = {}
    cats.forEach(c => { (g[c.grp] ||= { grp: c.grp, kind: c.grp_kind, cats: [] }).cats.push(c) })
    const order = { class: 0, squad: 1, club: 2, house: 3 }
    return Object.values(g).sort((a, b) => (order[a.kind] ?? 9) - (order[b.kind] ?? 9) || a.grp.localeCompare(b.grp))
  }, [cats])

  if (!cur) return <div style={{ color: 'var(--text-tertiary)' }}>Loading…</div>
  const decided = cats.filter(c => c.winner_name).length

  return (
    <div>
      {/* year + nominations open / close */}
      <div className="card" style={{ marginBottom: 12, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <b style={{ fontSize: 16 }}>🏆 Awards</b>
        <input type="number" value={cur.year} onChange={e => { const y = parseInt(e.target.value) || cur.year; saveCur({ year: y }).then(() => load({ ...cur, year: y })) }} style={{ width: 90 }} />
        <label style={{ fontSize: 13 }}>Nominations close <input type="date" value={cur.close || ''} onChange={e => saveCur({ close: e.target.value })} /></label>
        <button className={`btn btn-sm${cur.open ? ' btn-primary' : ''}`} onClick={() => saveCur({ open: !cur.open })}>{cur.open ? '✓ Nominations open' : 'Open nominations'}</button>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{cats.length ? `${decided} of ${cats.length} decided · ${noms.length} nominations · ${votes.length} votes` : ''}</span>
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {cats.length > 0 && <button className="btn btn-sm" onClick={exportRegister}>⬇ Awards register (Excel)</button>}
          <button className="btn btn-sm" onClick={past ? () => setPast(null) : loadPast}>📜 {past ? 'Hide past years' : 'Past years'}</button>
        </span>
      </div>

      {past && (
        <div className="card" style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
            <b>📜 Past awards (admin record)</b>
            <select value={pastYear} onChange={e => setPastYear(e.target.value)}>{[...new Set(past.map(p => p.year))].map(y => <option key={y}>{y}</option>)}</select>
          </div>
          {Object.entries(past.filter(p => String(p.year) === pastYear).reduce((g, p) => { (g[p.grp || ''] ||= []).push(p); return g }, {})).map(([g, l]) => (
            <div key={g} style={{ marginBottom: 8 }}><div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>{g}</div>
              {l.map(p => <div key={p.id} style={{ fontSize: 13, display: 'flex', gap: 8 }}><span style={{ width: 200, color: 'var(--text-secondary)' }}>{p.category}</span><b>{p.winner}</b></div>)}
            </div>
          ))}
        </div>
      )}

      {!cats.length && (
        <div className="card" style={{ marginBottom: 12 }}>
          {!setup ? (
            <>
              <div style={{ fontSize: 14, marginBottom: 8 }}>No awards set up for {cur.year} yet.</div>
              <button className="btn btn-primary" onClick={() => setSetup({ classIds: new Set(classes.map(c => c.id)) })}>Start Awards {cur.year}</button>
            </>
          ) : (
            <>
              <div style={{ fontSize: 13, marginBottom: 6 }}>Classes that get class awards ({CLASS_CATS.join(', ')}). KR, KRBA and club awards are added too.</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 4, maxHeight: 300, overflowY: 'auto', marginBottom: 8 }}>
                {classes.map(c => (
                  <label key={c.id} style={{ display: 'flex', gap: 6, fontSize: 12 }}>
                    <input type="checkbox" checked={setup.classIds.has(c.id)} onChange={() => setSetup(s => { const n = new Set(s.classIds); n.has(c.id) ? n.delete(c.id) : n.add(c.id); return { classIds: n } })} />{classLabel(c)}
                  </label>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-primary" disabled={busy} onClick={startYear}>{busy ? 'Creating…' : 'Create awards'}</button>
                <button className="btn" onClick={() => setSetup(null)}>Cancel</button>
              </div>
            </>
          )}
        </div>
      )}

      {groups.filter(g => g.kind !== 'house').map(g => {
        const gDecided = g.cats.filter(c => c.winner_name).length
        return (
          <div key={g.grp} className="card" style={{ padding: 0, marginBottom: 8, overflow: 'hidden' }}>
            <button type="button" onClick={() => setOpenGrp(o => ({ ...o, [g.grp]: !o[g.grp] }))} style={{ width: '100%', display: 'flex', gap: 8, padding: '11px 14px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text)', textAlign: 'left', fontFamily: 'var(--font-sans)' }}>
              <b style={{ flex: 1 }}>{g.grp}</b>
              <span style={{ fontSize: 12, color: gDecided === g.cats.length ? '#1D9E75' : 'var(--text-secondary)' }}>{gDecided} of {g.cats.length} decided</span>
              <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{openGrp[g.grp] ? '▲' : '▼'}</span>
            </button>
            <div className={`kc-slide${openGrp[g.grp] ? ' open' : ''}`}><div style={{ padding: openGrp[g.grp] ? '0 14px 10px' : 0 }}>
              {g.cats.map(c => {
                // nominees (coaches) or votes (athletes), grouped by person
                const src = c.vote ? votes.filter(v => v.category_id === c.id).map(v => ({ key: v.student_id, student_id: v.student_id, name: v.nominee_name || 'Athlete', by: null }))
                  : noms.filter(n => n.category_id === c.id).map(n => ({ key: n.student_id || n.member_id || n.nominee_name, student_id: n.student_id, member_id: n.member_id, name: n.nominee_name, by: n.coach_name, reason: n.reason }))
                const people = Object.values(src.reduce((m, x) => { const p = (m[x.key] ||= { ...x, count: 0, bys: [], reasons: [] }); p.count++; if (x.by) p.bys.push(x.by); if (x.reason) p.reasons.push(x.reason); return m }, {})).sort((a, b) => b.count - a.count)
                return (
                  <div key={c.id} style={{ borderTop: '1px solid var(--border)', padding: '8px 0' }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <span style={{ fontSize: 13, color: 'var(--text-secondary)', flex: 1 }}>{c.name}{c.vote ? ' · athletes vote' : ''}</span>
                      {c.winner_name && <span style={{ fontSize: 13, fontWeight: 700, color: '#1D9E75' }}>🏆 {c.winner_name} <button className="btn btn-sm" style={{ fontSize: 10, padding: '1px 6px' }} onClick={() => pickWinner(c, null)}>clear</button></span>}
                    </div>
                    {people.length === 0 && <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{c.vote ? 'No votes yet' : 'No nominations yet'}</div>}
                    {people.map(p => (
                      <div key={p.key} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0' }}>
                        <span style={{ flex: 1, fontSize: 14, fontWeight: c.winner_name === p.name ? 700 : 500 }}>{p.name}
                          {p.reasons.length > 0 && <span style={{ fontSize: 11, color: 'var(--text-tertiary)', fontWeight: 400 }}> -- {p.reasons.join(' / ')}</span>}</span>
                        <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{c.vote ? `${p.count} vote${p.count === 1 ? '' : 's'}` : p.bys.join(', ')}</span>
                        {c.winner_name !== p.name && <button className="btn btn-sm" style={{ fontSize: 11 }} onClick={() => pickWinner(c, p)}>Pick</button>}
                      </div>
                    ))}
                    {c.grp_kind === 'club' && (
                      <button className="btn btn-sm" style={{ fontSize: 11, marginTop: 4 }} onClick={() => { const nm = prompt(`Winner for ${c.name}:`, c.winner_name || ''); if (nm != null) pickWinner(c, nm.trim() ? { name: nm.trim() } : null) }}>✏️ Type a winner</button>
                    )}
                  </div>
                )
              })}
            </div></div>
          </div>
        )
      })}

      {/* houses from the points */}
      {cats.length > 0 && (
        <div className="card" style={{ marginBottom: 8 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
            <b style={{ flex: 1 }}>🏠 Houses (from the points)</b>
            <button className="btn btn-sm" onClick={loadHouses}>{houses ? '🔄 Refresh' : 'Show'}</button>
            {houses && <button className="btn btn-sm btn-primary" onClick={saveHouses}>Save to register</button>}
          </div>
          {groups.find(g => g.kind === 'house') && !houses && <div style={{ fontSize: 12, color: '#1D9E75' }}>✓ House results saved -- {groups.find(g => g.kind === 'house').cats.map(c => `${c.name}: ${c.winner_name}`).join(' · ')}</div>}
          {houses && (
            <>
              {houses.list.map(h => (
                <div key={h.name} style={{ fontSize: 13, padding: '3px 0' }}><b>{h.name}</b> ({h.points}) -- {h.top.map((p, i) => `${i + 1}. ${p.name} (${p.pts})`).join('  ')}</div>
              ))}
              <div style={{ fontSize: 13, marginTop: 6 }}>🏆 House winners: <b>{houses.winner}</b> · Student house winner: <b>{houses.student?.name}</b></div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
