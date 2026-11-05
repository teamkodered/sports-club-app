import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase.js'
import { loadAwardsCurrent, nominationsOpen } from '../../lib/awards.js'

// 🏆 Athletes: vote for the Fighters fighter in their squad (KR / KRBA) -- one vote, can change until
// nominations close. Results stay admin-only.
export default function AwardsVote({ student }) {
  const [cats, setCats] = useState([])        // [{ cat, options, mine }]
  const [busy, setBusy] = useState(null)
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (!student?.id) return
    ;(async () => {
      const cur = await loadAwardsCurrent()
      if (!nominationsOpen(cur)) return
      const squads = [student.is_kr && 'KR', student.discipline === 'KRBA' && 'KRBA'].filter(Boolean)
      if (!squads.length) return
      const { data: cs } = await supabase.from('awards_categories').select('*').eq('year', cur.year).eq('vote', true).in('squad', squads)
      const out = []
      for (const c of cs || []) {
        const [{ data: opts }, { data: v }] = await Promise.all([
          supabase.rpc('kc_awards_vote_options', { p_category: c.id }),
          supabase.from('awards_votes').select('*').eq('category_id', c.id).eq('voter_student_id', student.id).maybeSingle(),
        ])
        out.push({ cat: c, options: opts || [], mine: v || null })
      }
      setCats(out)
    })()
  }, [student?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!cats.length) return null

  async function vote(i, o) {
    const c = cats[i]
    setBusy(o.student_id)
    const { data, error } = await supabase.from('awards_votes').upsert({ category_id: c.cat.id, voter_student_id: student.id, student_id: o.student_id, nominee_name: o.name }, { onConflict: 'category_id,voter_student_id' }).select().single()
    setBusy(null)
    if (error) return alert('Could not vote: ' + error.message)
    setCats(cs => cs.map((x, j) => j === i ? { ...x, mine: data } : x))
  }

  return (
    <div className="card" style={{ padding: 12, marginBottom: 10, border: '1px solid #EF9F2766' }}>
      <button type="button" onClick={() => setOpen(o => !o)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--text)', textAlign: 'left', fontFamily: 'var(--font-sans)' }}>
        <b style={{ flex: 1, fontSize: 14 }}>🏆 Vote: {cats.map(c => `${c.cat.name} (${c.cat.squad})`).join(' · ')}</b>
        <span style={{ fontSize: 11, color: cats.every(c => c.mine) ? '#1D9E75' : '#EF9F27', fontWeight: 700 }}>{cats.every(c => c.mine) ? '✓ voted' : 'vote now'}</span>
        <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{open ? '▲' : '▼'}</span>
      </button>
      <div className={`kc-slide${open ? ' open' : ''}`}><div>
        {cats.map((c, i) => (
          <div key={c.cat.id} style={{ marginTop: 8 }}>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>Who's the best fighter's fighter in {c.cat.squad}? One vote -- you can change it until voting closes.</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {c.options.map(o => {
                const on = c.mine?.student_id === o.student_id
                return <button key={o.student_id} type="button" className={`btn btn-sm${on ? ' btn-primary' : ''}`} disabled={busy === o.student_id} onClick={() => vote(i, o)}>{on ? '✓ ' : ''}{o.name}</button>
              })}
            </div>
          </div>
        ))}
      </div></div>
    </div>
  )
}
