import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase.js'

// League board settings (seconds per board, show top, show top per house, its own
// league period). Shown on the League page and the coach view's Leagues pages.
// None of these change the main public league.
export default function LeagueBoardSettings() {
  // League board (public display + athlete app) settings
  const [boardSeconds, setBoardSeconds] = useState(8)
  const [boardTopN, setBoardTopN] = useState(10)
  const [boardTopHouse, setBoardTopHouse] = useState(null) // null = use the main league's
  const [boardFrom, setBoardFrom] = useState('')
  const [boardTo, setBoardTo] = useState('')
  useEffect(() => {
    supabase.from('settings').select('key,value').in('key', ['board_seconds', 'board_topn', 'board_date_from', 'board_date_to', 'board_topn_house']).then(({ data }) => {
      const m = Object.fromEntries((data || []).map(r => [r.key, r.value]))
      if (m.board_seconds) setBoardSeconds(parseInt(m.board_seconds) || 8)
      if (m.board_topn) setBoardTopN(parseInt(m.board_topn) || 10)
      setBoardFrom(m.board_date_from || ''); setBoardTo(m.board_date_to || '')
      if (m.board_topn_house) setBoardTopHouse(parseInt(m.board_topn_house) || null)
    })
  }, [])
  async function saveBoardSetting(key, val) {
    const { error } = await supabase.from('settings').upsert({ key, value: val }, { onConflict: 'key' })
    if (error) alert('Error saving board setting: ' + error.message)
  }

  return (
  <div className="card" style={{ marginBottom: 12, padding: '10px 12px' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 12 }}>
      <b style={{ marginRight: 4 }}>League board</b>
      <a href="/results-public" target="_blank" rel="noreferrer" style={{ fontSize: 11 }}>open ↗</a>
      <span style={{ color: 'var(--text-secondary)', marginLeft: 8 }}>Seconds per board:</span>
      {[5, 8, 12, 20, 30].map(n => (
        <button key={n} onClick={() => { setBoardSeconds(n); saveBoardSetting('board_seconds', n) }} style={{ padding: '3px 9px', borderRadius: 20, fontSize: 11, cursor: 'pointer', border: `1px solid ${boardSeconds === n ? 'var(--text)' : 'var(--border-strong)'}`, background: boardSeconds === n ? 'var(--text)' : 'var(--bg)', color: boardSeconds === n ? 'var(--bg)' : 'var(--text-secondary)' }}>{n}</button>
      ))}
      <span style={{ color: 'var(--text-secondary)', marginLeft: 8 }}>Show top (tasks / exercise):</span>
      {[5, 10, 15, 20].map(n => (
        <button key={n} onClick={() => { setBoardTopN(n); saveBoardSetting('board_topn', n) }} style={{ padding: '3px 9px', borderRadius: 20, fontSize: 11, cursor: 'pointer', border: `1px solid ${boardTopN === n ? 'var(--text)' : 'var(--border-strong)'}`, background: boardTopN === n ? 'var(--text)' : 'var(--bg)', color: boardTopN === n ? 'var(--bg)' : 'var(--text-secondary)' }}>{n}</button>
      ))}
    </div>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 12, marginTop: 8 }}>
      <span style={{ color: 'var(--text-secondary)' }}>House points — show top per house:</span>
      {[3, 5, 10, 15, 20].map(n => (
        <button key={n} onClick={() => { setBoardTopHouse(n); saveBoardSetting('board_topn_house', n) }} style={{ padding: '3px 9px', borderRadius: 20, fontSize: 11, cursor: 'pointer', border: `1px solid ${boardTopHouse === n ? 'var(--text)' : 'var(--border-strong)'}`, background: boardTopHouse === n ? 'var(--text)' : 'var(--bg)', color: boardTopHouse === n ? 'var(--bg)' : 'var(--text-secondary)' }}>{n}</button>
      ))}
      {boardTopHouse && <button onClick={() => { setBoardTopHouse(null); saveBoardSetting('board_topn_house', null) }} style={{ padding: '3px 9px', borderRadius: 20, fontSize: 11, cursor: 'pointer', border: '1px solid var(--border-strong)', background: 'var(--bg)', color: 'var(--text-secondary)' }}>Use main league's</button>}
    </div>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 12, marginTop: 8 }}>
      <span style={{ color: 'var(--text-secondary)' }}>League period:</span>
      <input type="date" value={boardFrom} onChange={e => { setBoardFrom(e.target.value); saveBoardSetting('board_date_from', e.target.value || null) }} style={{ fontSize: 12 }} />
      <span>to</span>
      <input type="date" value={boardTo} min={boardFrom || undefined} onChange={e => { setBoardTo(e.target.value); saveBoardSetting('board_date_to', e.target.value || null) }} style={{ fontSize: 12 }} />
      {(boardFrom || boardTo) && <button onClick={() => { setBoardFrom(''); setBoardTo(''); saveBoardSetting('board_date_from', null); saveBoardSetting('board_date_to', null) }} style={{ padding: '3px 9px', borderRadius: 20, fontSize: 11, cursor: 'pointer', border: '1px solid var(--border-strong)', background: 'var(--bg)', color: 'var(--text-secondary)' }}>Use main league dates</button>}
    </div>
    <p style={{ fontSize: 11, color: 'var(--text-tertiary)', margin: '6px 0 0' }}>
      {boardFrom ? 'The board uses its own league period (separate from the main league). No end date = up to today; once the end date has passed, the board stays frozen at it.' : 'No board dates set -- the board uses the main league dates on this page (or this month if none).'} {boardTopHouse ? `House points shows the top ${boardTopHouse} per house.` : 'House points per house follows the main league\'s "show top" until you pick one above.'}
    </p>
  </div>
  )
}
