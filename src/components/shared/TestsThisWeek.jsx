import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase.js'
import { testWeek, slotsFor, itemDone, TEST_PLAN } from '../../lib/testPlan.js'

const fmt = d => new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

// 📋 Athlete: this week's tests (✓ when they've got a result this test week). Tap a test to open it.
export function TestsThisWeek({ sessions, junior = false, onOpen }) {
  const tw = testWeek()
  const head = (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
      <b style={{ fontSize: 13 }}>📋 Tests this week</b>
      <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{tw.week === 5 ? 'Catch-up week' : `Test week ${tw.week}`} · {fmt(tw.from)}–{fmt(tw.to)}</span>
    </div>
  )
  if (tw.week === 5) {
    // catch-up: anything from this month not done yet
    const missed = [1, 2, 3, 4].flatMap(w => { const sl = slotsFor(w, { quarterly: tw.quarterly, junior }); return [...sl.A, ...sl.B] })
      .filter(it => !itemDone(it, sessions, tw.monthFrom, tw.to))
    return (
      <div className="card" style={{ padding: 10, marginBottom: 8 }}>
        {head}
        {missed.length ? <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>Catch up on any tests you missed this month:</div>
          : <div style={{ fontSize: 13, color: '#1D9E75' }}>✓ All this month's tests done — nice work!</div>}
        {missed.slice(0, 8).map(it => <Item key={it.label} it={it} done={false} onOpen={onOpen} />)}
      </div>
    )
  }
  const sl = slotsFor(tw.week, { quarterly: tw.quarterly, junior })
  return (
    <div className="card" style={{ padding: 10, marginBottom: 8 }}>
      {head}
      {['A', 'B'].map(k => (
        <div key={k} style={{ marginBottom: k === 'A' ? 8 : 0 }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, color: 'var(--text-tertiary)', margin: '2px 0 4px' }}>SESSION {k}</div>
          {sl[k].map(it => <Item key={it.label} it={it} done={itemDone(it, sessions, tw.from, tw.to)} onOpen={onOpen} />)}
        </div>
      ))}
      <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 6 }}>Do them in this order · one hard test per session · ❤️ = 1 min HR recovery straight after</div>
    </div>
  )
}

function Item({ it, done, onOpen }) {
  return (
    <button type="button" onClick={() => onOpen?.(it.cat)}
      style={{ display: 'flex', width: '100%', alignItems: 'center', gap: 8, padding: '7px 8px', marginBottom: 4, borderRadius: 6, cursor: 'pointer', textAlign: 'left', fontSize: 13,
        border: `1px solid ${done ? '#1D9E75' : 'var(--border)'}`, background: done ? '#1D9E7518' : 'transparent', color: 'var(--text)' }}>
      <span style={{ width: 18, textAlign: 'center' }}>{done ? '✓' : '○'}</span>
      <span style={{ flex: 1, fontWeight: it.hard ? 700 : 500 }}>{it.label}{it.hrr ? ' ❤️' : ''}</span>
      {it.hard && <span style={{ fontSize: 10, color: '#E24B4A', fontWeight: 700 }}>HARD</span>}
    </button>
  )
}

// 📋 Coach (Dashboard): this test week's plan and how many athletes have a result for each test
export function TestsThisWeekCoach() {
  const tw = testWeek()
  const [counts, setCounts] = useState(null)
  useEffect(() => {
    supabase.from('fit2fight_sessions').select('student_id, session_date, test').gte('session_date', tw.week === 5 ? tw.monthFrom : tw.from).lte('session_date', tw.to)
      .then(({ data }) => {
        const c = {}
        const items = tw.week === 5 ? [1, 2, 3, 4].flatMap(w => { const sl = slotsFor(w, { quarterly: tw.quarterly }); return [...sl.A, ...sl.B] }) : (() => { const sl = slotsFor(tw.week, { quarterly: tw.quarterly }); return [...sl.A, ...sl.B] })()
        items.forEach(it => { c[it.label] = new Set((data || []).filter(s => it.names.some(n => s.test?.[n] != null && s.test[n] !== '')).map(s => s.student_id)).size })
        setCounts(c)
      })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const sl = tw.week === 5 ? null : slotsFor(tw.week, { quarterly: tw.quarterly })
  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8, flexWrap: 'wrap', gap: 6 }}>
        <b style={{ fontSize: 15 }}>📋 Tests this week</b>
        <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{tw.week === 5 ? 'Catch-up week (anything missed this month)' : `Test week ${tw.week} of 4`} · {fmt(tw.from)}–{fmt(tw.to)}{tw.quarterly ? ' · 4800 m month' : ''}</span>
      </div>
      {sl ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 10 }}>
          {['A', 'B'].map(k => (
            <div key={k}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, color: 'var(--text-tertiary)', marginBottom: 4 }}>SESSION {k}</div>
              {sl[k].map(it => (
                <div key={it.label} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '5px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                  <span style={{ fontWeight: it.hard ? 700 : 500 }}>{it.label}{it.hrr ? ' ❤️' : ''}{it.seniors ? <span style={{ color: 'var(--text-tertiary)', fontWeight: 400 }}> (juniors: body weight reps)</span> : null}</span>
                  <span style={{ color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{counts ? `${counts[it.label] || 0} done` : '…'}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      ) : (
        <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
          {Object.entries(counts || {}).map(([l, n]) => <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}><span>{l}</span><span>{n} done this month</span></div>)}
        </div>
      )}
      <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 8 }}>Light / power tests first, one hard test per session, ❤️ = 1 min HR recovery (standing) straight after. Weeks: 1st–7th, 8th–14th, 15th–21st, 22nd–28th.</div>
    </div>
  )
}
void TEST_PLAN
