import { useEffect, useMemo, useRef, useState } from 'react'
import { Chess } from 'chess.js'

// Chess for the Chess question (Oct 2026): play the computer (Easy / Medium /
// Hard) or a friend on the same phone. A finished game (win, loss, draw or
// resign) counts as +1 game for today's Chess question.

const GLYPH = { wk: '♔', wq: '♕', wr: '♖', wb: '♗', wn: '♘', wp: '♙', bk: '♚', bq: '♛', br: '♜', bb: '♝', bn: '♞', bp: '♟' }
const VAL = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 }
const CENTER = [0, 1, 2, 3, 3, 2, 1, 0]
const FILES = 'abcdefgh'

function evaluate(game) {
  // material + a little central control, from White's point of view
  let score = 0
  const b = game.board()
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    const p = b[r][c]; if (!p) continue
    let v = VAL[p.type] + (p.type === 'n' || p.type === 'b' || p.type === 'p' ? (CENTER[r] + CENTER[c]) * 4 : 0)
    if (p.type === 'p') v += (p.color === 'w' ? (6 - r) : (r - 1)) * 6 // pawns like to advance
    score += p.color === 'w' ? v : -v
  }
  return score
}
let deadline = Infinity // the computer never thinks longer than this (phones are slower)
function search(game, depth, alpha, beta, maximizing) {
  if (depth === 0 || game.isGameOver() || Date.now() > deadline) {
    if (game.isCheckmate()) return maximizing ? -100000 - depth : 100000 + depth
    if (game.isDraw() || game.isStalemate()) return 0
    return evaluate(game)
  }
  const moves = game.moves({ verbose: true }).sort((a, b) => (b.captured ? VAL[b.captured] : 0) - (a.captured ? VAL[a.captured] : 0))
  if (maximizing) {
    let best = -Infinity
    for (const m of moves) { game.move(m); best = Math.max(best, search(game, depth - 1, alpha, beta, false)); game.undo(); alpha = Math.max(alpha, best); if (beta <= alpha) break }
    return best
  }
  let best = Infinity
  for (const m of moves) { game.move(m); best = Math.min(best, search(game, depth - 1, alpha, beta, true)); game.undo(); beta = Math.min(beta, best); if (beta <= alpha) break }
  return best
}
function bestMove(fen, level) {
  const game = new Chess(fen)
  const moves = game.moves({ verbose: true })
  if (!moves.length) return null
  if (level === 'easy' && Math.random() < 0.45) return moves[Math.floor(Math.random() * moves.length)]
  const depth = level === 'hard' ? 3 : level === 'medium' ? 2 : 1
  const white = game.turn() === 'w'
  // order root moves by a quick 1-ply look so the best candidates are searched first
  deadline = Infinity
  const scored = moves.sort(() => Math.random() - 0.5).map(m => { game.move(m); const sc = evaluate(game) + (game.isCheckmate() ? (white ? 1e6 : -1e6) : 0); game.undo(); return { m, sc } })
    .sort((a, b) => white ? b.sc - a.sc : a.sc - b.sc)
  deadline = Date.now() + (level === 'hard' ? 2500 : 1500)
  let best = scored[0].m, bestScore = white ? -Infinity : Infinity
  for (const { m } of scored) {
    if (Date.now() > deadline) break
    game.move(m)
    const sc = search(game, depth - 1, -Infinity, Infinity, !white)
    game.undo()
    if (white ? sc > bestScore : sc < bestScore) { bestScore = sc; best = m }
  }
  deadline = Infinity
  return best
}

export default function ChessGame({ onFinished, onClose, colour = '#22B14C' }) {
  const [mode, setMode] = useState(null) // { vs: 'cpu'|'friend', level, side: 'w'|'b' }
  const gameRef = useRef(new Chess())
  const [fen, setFen] = useState(gameRef.current.fen())
  const [sel, setSel] = useState(null)
  const [last, setLast] = useState(null)
  const [thinking, setThinking] = useState(false)
  const [result, setResult] = useState(null)
  const counted = useRef(false)
  const game = gameRef.current

  const flipped = mode?.vs === 'cpu' && mode.side === 'b'
  const legalTargets = useMemo(() => sel ? game.moves({ square: sel, verbose: true }).map(m => m.to) : [], [sel, fen]) // eslint-disable-line react-hooks/exhaustive-deps

  function finish(text) {
    setResult(text)
    if (!counted.current) { counted.current = true; onFinished?.() }
  }
  function checkEnd() {
    if (!game.isGameOver()) return
    if (game.isCheckmate()) {
      const winner = game.turn() === 'w' ? 'Black' : 'White'
      finish(mode?.vs === 'cpu' ? ((winner === 'White') === (mode.side === 'w') ? 'Checkmate — you win! 🏆' : 'Checkmate — the computer wins') : `Checkmate — ${winner} wins!`)
    } else if (game.isStalemate()) finish('Stalemate — draw')
    else if (game.isThreefoldRepetition()) finish('Draw by repetition')
    else if (game.isInsufficientMaterial()) finish('Draw — not enough pieces')
    else finish('Draw')
  }
  function play(from, to) {
    try {
      const m = game.move({ from, to, promotion: 'q' })
      setLast({ from: m.from, to: m.to }); setSel(null); setFen(game.fen()); checkEnd()
      return true
    } catch { return false }
  }
  // computer's turn
  useEffect(() => {
    if (!mode || mode.vs !== 'cpu' || result || game.isGameOver() || game.turn() === mode.side) return
    setThinking(true)
    const t = setTimeout(() => {
      const m = bestMove(game.fen(), mode.level)
      if (m) { game.move(m); setLast({ from: m.from, to: m.to }); setFen(game.fen()); checkEnd() }
      setThinking(false)
    }, 250)
    return () => clearTimeout(t)
  }, [fen, mode]) // eslint-disable-line react-hooks/exhaustive-deps

  function tap(sq) {
    if (result || thinking) return
    if (mode.vs === 'cpu' && game.turn() !== mode.side) return
    const p = game.get(sq)
    if (sel && legalTargets.includes(sq)) { play(sel, sq); return }
    if (p && p.color === game.turn()) setSel(sq === sel ? null : sq)
    else setSel(null)
  }
  function newGame(m) { gameRef.current = new Chess(); counted.current = false; setResult(null); setSel(null); setLast(null); setFen(gameRef.current.fen()); setMode(m) }
  function undo() {
    if (result || thinking) return
    game.undo(); if (mode.vs === 'cpu' && game.turn() !== mode.side) game.undo()
    setSel(null); setLast(null); setFen(game.fen())
  }
  function resign() { if (!result && confirm('Resign this game?')) finish(mode.vs === 'cpu' ? 'You resigned — the computer wins' : `${game.turn() === 'w' ? 'White' : 'Black'} resigned`) }

  const board = game.board()
  const inCheck = game.inCheck()
  const kingSq = (() => { if (!inCheck) return null; for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) { const p = board[r][c]; if (p && p.type === 'k' && p.color === game.turn()) return FILES[c] + (8 - r) } return null })()
  const btn = { height: 40, padding: '0 14px', borderRadius: 8, border: '1px solid #2A3138', background: '#1A1F24', color: '#F2F2F2', fontSize: 14, cursor: 'pointer' }
  const opt = (on, text, onClick) => <button type="button" onClick={onClick} style={{ ...btn, borderColor: on ? colour : '#2A3138', background: on ? colour + '26' : '#1A1F24' }}>{text}</button>

  return (
    <div role="dialog" aria-modal="true" style={{ position: 'fixed', inset: 0, zIndex: 490, background: '#05070A', color: '#F2F2F2', overflowY: 'auto', padding: '14px 12px calc(16px + env(safe-area-inset-bottom, 0px))', boxSizing: 'border-box' }}>
      <div style={{ maxWidth: 480, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <button type="button" onClick={onClose} style={{ ...btn, height: 36 }}>Close</button>
          <div style={{ fontWeight: 800, fontSize: 18, flex: 1 }}>♟ Chess</div>
          {mode && <button type="button" onClick={() => setMode(null)} style={{ ...btn, height: 36 }}>New game</button>}
        </div>

        {!mode ? <Setup onStart={newGame} opt={opt} btn={btn} colour={colour} /> : (
          <>
            <div style={{ fontSize: 14, marginBottom: 8, minHeight: 20, color: result ? colour : '#CFCFCF', fontWeight: result ? 700 : 400 }}>
              {result || (thinking ? 'Computer is thinking…' : `${game.turn() === 'w' ? 'White' : 'Black'} to move${inCheck ? ' — check!' : ''}`)}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', width: '100%', aspectRatio: '1 / 1', border: '2px solid #2A3138', borderRadius: 6, overflow: 'hidden', userSelect: 'none' }}>
              {Array.from({ length: 64 }, (_, i) => {
                const r = flipped ? 7 - Math.floor(i / 8) : Math.floor(i / 8), c = flipped ? 7 - (i % 8) : i % 8
                const sq = FILES[c] + (8 - r), p = board[r][c]
                const dark = (r + c) % 2 === 1
                const isSel = sel === sq, target = legalTargets.includes(sq), isLast = last && (last.from === sq || last.to === sq)
                return (
                  <button key={sq} type="button" onClick={() => tap(sq)} aria-label={sq + (p ? ` ${p.color === 'w' ? 'white' : 'black'} ${p.type}` : '')}
                    style={{ position: 'relative', border: 'none', padding: 0, cursor: 'pointer', aspectRatio: '1 / 1',
                      background: isSel ? '#F5C542' : kingSq === sq ? '#E24B4A' : isLast ? (dark ? '#9A8A3A' : '#CDBE6A') : dark ? '#6B7F5A' : '#E8E4D0',
                      fontSize: 'min(9vw, 46px)', lineHeight: 1, color: p?.color === 'w' ? '#FFFFFF' : '#111111', textShadow: p?.color === 'w' ? '0 0 2px #000, 0 0 2px #000' : 'none' }}>
                    {p ? GLYPH[p.color + p.type] : ''}
                    {target && <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                      <span style={{ width: p ? '86%' : '28%', height: p ? '86%' : '28%', borderRadius: '50%', border: p ? '3px solid rgba(34,177,76,0.85)' : 'none', background: p ? 'transparent' : 'rgba(34,177,76,0.6)' }} />
                    </span>}
                  </button>
                )
              })}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button type="button" style={{ ...btn, flex: 1 }} onClick={undo} disabled={!!result || thinking || game.history().length === 0}>↶ Undo</button>
              <button type="button" style={{ ...btn, flex: 1, borderColor: '#E24B4A', color: '#E24B4A' }} onClick={resign} disabled={!!result}>Resign</button>
            </div>
            {result && <button type="button" onClick={() => newGame(mode)} style={{ ...btn, width: '100%', marginTop: 10, background: colour, color: '#0A0A0A', border: 'none', fontWeight: 700 }}>Play again</button>}
            <p style={{ fontSize: 11, color: '#777', marginTop: 10 }}>Each finished game (including draws and resigning) counts as 1 game on today's Chess question. Pawns promote to a queen.</p>
          </>
        )}
      </div>
    </div>
  )
}

function Setup({ onStart, opt, btn, colour }) {
  const [vs, setVs] = useState('cpu')
  const [level, setLevel] = useState('medium')
  const [side, setSide] = useState('w')
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div><div style={{ fontSize: 12, color: '#9A9A9A', marginBottom: 6 }}>Opponent</div>
        <div style={{ display: 'flex', gap: 6 }}>{opt(vs === 'cpu', '🤖 Computer', () => setVs('cpu'))}{opt(vs === 'friend', '👥 Friend (same phone)', () => setVs('friend'))}</div></div>
      {vs === 'cpu' && <>
        <div><div style={{ fontSize: 12, color: '#9A9A9A', marginBottom: 6 }}>Level</div>
          <div style={{ display: 'flex', gap: 6 }}>{opt(level === 'easy', 'Easy', () => setLevel('easy'))}{opt(level === 'medium', 'Medium', () => setLevel('medium'))}{opt(level === 'hard', 'Hard', () => setLevel('hard'))}</div></div>
        <div><div style={{ fontSize: 12, color: '#9A9A9A', marginBottom: 6 }}>Play as</div>
          <div style={{ display: 'flex', gap: 6 }}>{opt(side === 'w', '♔ White', () => setSide('w'))}{opt(side === 'b', '♚ Black', () => setSide('b'))}</div></div>
      </>}
      <button type="button" onClick={() => onStart({ vs, level, side })} style={{ ...btn, height: 50, background: colour, color: '#0A0A0A', border: 'none', fontWeight: 800, fontSize: 18 }}>▶ Start game</button>
    </div>
  )
}
