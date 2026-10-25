import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase.js'

// 🃏 Situation cards (Coaching tools): scenarios to set for sparring. The club's cards, extra
// suggested ones (✨, can be hidden), custom cards (admins), and a random draw -- one card, or a
// different secret card for Red and Blue. Custom / hidden cards are kept in settings.
const KEY = 'coaching_situation_cards'
export const GROUPS = ['Score & clock', 'Referee', 'Opponent style', 'Your condition', 'Ring craft & rules']
const CLUB = [
  ['Referee is only scoring counters', 'Referee'], ['Referee is only scoring blitzes', 'Referee'],
  ['15 seconds left, losing by 3 points', 'Score & clock'], ['15 seconds left, winning by 3 points', 'Score & clock'],
  ['Opponent calls time for equipment', 'Ring craft & rules'], ['Winded', 'Your condition'], ['Buzzed', 'Your condition'], ['Injury', 'Your condition'],
  ['Fighting an aggressive kicker', 'Opponent style'], ['Fighting an aggressive puncher', 'Opponent style'],
  ['Fighting a counter puncher', 'Opponent style'], ['Fighting a counter kicker', 'Opponent style'], ['Fighting a mover', 'Opponent style'],
  ['Opponent in open stance', 'Opponent style'], ['Opponent in closed stance', 'Opponent style'],
].map(([text, group], i) => ({ id: `club_${i}`, text, group }))
const SUGGESTED = [
  ['Scores level, 10 seconds left — next point wins', 'Score & clock'], ['Losing by 1 point with 30 seconds left', 'Score & clock'],
  ['Winning by 1 point with 30 seconds left', 'Score & clock'], ['First point wins (sudden death)', 'Score & clock'],
  ['You have a warning — one more is a point deduction', 'Ring craft & rules'], ['Backed onto the edge of the mat', 'Ring craft & rules'],
  ['Referee keeps breaking you up at close range', 'Referee'], ['Referee is only scoring kicks to the head', 'Referee'],
  ['Opponent is much taller with a longer reach', 'Opponent style'], ['Opponent is much shorter and keeps closing in', 'Opponent style'],
  ['Opponent keeps switching stance', 'Opponent style'], ['Opponent only throws one technique (e.g. back fist)', 'Opponent style'],
  ['Opponent fakes a lot', 'Opponent style'], ['Opponent keeps grabbing / holding', 'Opponent style'],
  ['You are tired — opponent is still fresh', 'Your condition'], ['Opponent is tired — you are fresh', 'Your condition'],
  ['Hurt hand — no punching with your back hand', 'Your condition'], ["Can't hear your coach", 'Ring craft & rules'],
].map(([text, group], i) => ({ id: `sugg_${i}`, text, group, suggested: true }))

export default function SituationCards({ canEdit }) {
  const [saved, setSaved] = useState({ custom: [], hidden: [] })
  const [groupsOn, setGroupsOn] = useState(new Set(GROUPS))
  const [adding, setAdding] = useState(null)
  const [draw, setDraw] = useState(null)        // { mode: 'one'|'pair', cards: [...] }
  const [used, setUsed] = useState([])          // drawn this session (no repeats until the deck runs out)
  const [manage, setManage] = useState(false)

  useEffect(() => {
    supabase.from('settings').select('value').eq('key', KEY).maybeSingle()
      .then(({ data }) => data?.value && setSaved({ custom: data.value.custom || [], hidden: data.value.hidden || [] }))
  }, [])
  async function persist(next) {
    setSaved(next)
    const { error } = await supabase.from('settings').upsert({ key: KEY, value: next }, { onConflict: 'key' })
    if (error) alert('Could not save: ' + error.message)
  }

  const all = useMemo(() => [...CLUB, ...SUGGESTED, ...saved.custom.map(c => ({ ...c, custom: true }))], [saved.custom])
  const deck = all.filter(c => !saved.hidden.includes(c.id))
  const pool = deck.filter(c => groupsOn.has(c.group))

  function drawCards(mode) {
    let fresh = pool.filter(c => !used.includes(c.id))
    const need = mode === 'pair' ? 2 : 1
    if (fresh.length < need) { fresh = pool; setUsed([]) }   // deck ran out -> reshuffle
    if (fresh.length < need) return alert('Not enough cards in the chosen groups.')
    const pick = []
    const left = [...fresh]
    for (let i = 0; i < need; i++) pick.push(left.splice(Math.floor(Math.random() * left.length), 1)[0])
    setUsed(u => [...u, ...pick.map(c => c.id)])
    setDraw({ mode, cards: pick, reveal: mode === 'one' ? [true] : [false, false] })
  }

  return (
    <div className="card sc-wrap">
      <div className="sc-head">
        <div><b>🃏 Situation cards</b><div className="sc-sub">Scenarios to set during sparring — {deck.length} cards</div></div>
        <span className="sc-actions">
          <button className="btn btn-primary" onClick={() => drawCards('one')}>🎲 Random card</button>
          <button className="btn" onClick={() => drawCards('pair')} title="A different secret card for each fighter">🔴🔵 Red / Blue</button>
        </span>
      </div>
      <div className="sc-groups">
        {GROUPS.map(g => (
          <button key={g} type="button" className={groupsOn.has(g) ? 'on' : ''} onClick={() => setGroupsOn(prev => { const n = new Set(prev); n.has(g) ? n.delete(g) : n.add(g); return n.size ? n : prev })}>
            {g} <span>{deck.filter(c => c.group === g).length}</span>
          </button>
        ))}
      </div>

      <details className="sc-list">
        <summary>See all cards</summary>
        {GROUPS.map(g => {
          const cards = (manage ? all : deck).filter(c => c.group === g)
          if (!cards.length) return null
          return (
            <div key={g} className="sc-grp">
              <div className="sc-grp-h">{g}</div>
              <div className="sc-mini-grid">
                {cards.map(c => {
                  const hidden = saved.hidden.includes(c.id)
                  return (
                    <div key={c.id} className={`sc-mini${hidden ? ' off' : ''}`}>
                      <span>{c.text}{c.suggested && <em title="Suggested"> ✨</em>}{c.custom && <em title="Custom"> ✍️</em>}</span>
                      {canEdit && manage && (
                        <span className="sc-mini-act">
                          <button type="button" onClick={() => persist({ ...saved, hidden: hidden ? saved.hidden.filter(x => x !== c.id) : [...saved.hidden, c.id] })}>{hidden ? 'Show' : 'Hide'}</button>
                          {c.custom && <button type="button" onClick={() => window.confirm(`Delete "${c.text}"?`) && persist({ ...saved, custom: saved.custom.filter(x => x.id !== c.id) })}>Delete</button>}
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
        {canEdit && (
          <div className="sc-edit">
            {adding ? (
              <div className="sc-add">
                <input autoFocus value={adding.text} onChange={e => setAdding(a => ({ ...a, text: e.target.value }))} placeholder="e.g. Opponent keeps turning their back" />
                <select value={adding.group} onChange={e => setAdding(a => ({ ...a, group: e.target.value }))}>{GROUPS.map(g => <option key={g}>{g}</option>)}</select>
                <button className="btn btn-primary btn-sm" disabled={!adding.text.trim()} onClick={() => { persist({ ...saved, custom: [...saved.custom, { id: `custom_${Date.now()}`, text: adding.text.trim(), group: adding.group }] }); setAdding(null) }}>Add</button>
                <button className="btn btn-sm" onClick={() => setAdding(null)}>Cancel</button>
              </div>
            ) : (
              <span style={{ display: 'flex', gap: 6 }}>
                <button className="btn btn-sm" onClick={() => setAdding({ text: '', group: 'Opponent style' })}>+ Add card</button>
                <button className="btn btn-sm" onClick={() => setManage(m => !m)}>{manage ? 'Done' : 'Hide / show cards'}</button>
              </span>
            )}
          </div>
        )}
      </details>

      {draw && (
        <div className="sc-stage" onClick={() => setDraw(null)}>
          <div className="sc-stage-inner" onClick={e => e.stopPropagation()}>
            <div className={`sc-cards ${draw.mode}`}>
              {draw.cards.map((c, i) => {
                const colour = draw.mode === 'pair' ? (i === 0 ? '#E24B4A' : '#378ADD') : '#1F2937'
                const shown = draw.reveal[i]
                return (
                  <button key={c.id} type="button" className={`sc-card${shown ? '' : ' back'}`} style={{ '--sc': colour }}
                    onClick={() => setDraw(d => ({ ...d, reveal: d.reveal.map((r, j) => (j === i ? !r : r)) }))}>
                    {draw.mode === 'pair' && <span className="sc-who">{i === 0 ? 'RED' : 'BLUE'}</span>}
                    {shown ? <><span className="sc-grp-tag">{c.group}</span><span className="sc-text">{c.text}</span></> : <span className="sc-text">Tap to see your card</span>}
                  </button>
                )
              })}
            </div>
            {draw.mode === 'pair' && <p className="sc-tip">Each fighter taps their own card — keep it secret from the other.</p>}
            <div className="sc-stage-btns">
              <button className="btn btn-primary" onClick={() => drawCards(draw.mode)}>🎲 Draw again</button>
              <button className="btn" onClick={() => setDraw(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
