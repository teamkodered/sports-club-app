import { useEffect, useRef, useState } from 'react'
import { FIGHTERS, STYLES, STYLE_KEYS } from '../krfight/data.js'
import { makeSfx } from '../krfight/sfx.js'
import { makeRoster, ordinal } from './sim.js'

// LAST MAN STANDING -- choose your character, watch ten fighters battle it out in one ring, see who wins.
// Automatic play for now (like Marbles on Stream): you pick a colour, style and name and cheer them on.
const LS = 'lms-player'
const pill = (on, col) => ({ height: 40, padding: '0 14px', borderRadius: 12, border: `2px solid ${on ? col : '#2A3138'}`, background: on ? `${col}22` : 'rgba(26,31,36,0.9)', color: on ? col : '#C9CED6', fontFamily: "'Saira Condensed', sans-serif", fontStyle: 'italic', fontWeight: 800, fontSize: 16, cursor: 'pointer' })

export default function LastManStanding({ onClose, defaultName = '' }) {
  const [stage, setStage] = useState('setup') // setup | battle | results
  const [player, setPlayer] = useState(() => { try { return { name: defaultName, colour: 'mentality', style: 'pro', arena: 'ring', ...JSON.parse(localStorage.getItem(LS) || '{}') } } catch (e) { return { name: defaultName, colour: 'mentality', style: 'pro' } } })
  const [results, setResults] = useState(null)
  const [portrait, setPortrait] = useState(() => window.innerHeight > window.innerWidth)
  const host = useRef(null), game = useRef(null), sfx = useRef(null)
  useEffect(() => {
    const on = () => setPortrait(window.innerHeight > window.innerWidth)
    window.addEventListener('resize', on); window.addEventListener('orientationchange', on)
    try { window.screen?.orientation?.lock?.('landscape').catch(() => {}) } catch (e) { /* not supported */ }
    sfx.current = makeSfx()
    return () => { window.removeEventListener('resize', on); window.removeEventListener('orientationchange', on); try { game.current?.destroy(true) } catch (e) { /* ignore */ } try { sfx.current?.close?.() } catch (e) { /* ignore */ } }
  }, [])
  // start a battle
  useEffect(() => {
    if (stage !== 'battle' || !host.current) return
    let dead = false
    import('./scene.js').then(({ startLms }) => {
      if (dead) return
      sfx.current?.resume?.()
      game.current = startLms(host.current, { roster: makeRoster(player), arena: player.arena || 'ring', sfx: sfx.current, onDone: placings => { if (!dead) { setResults(placings); setStage('results') } } })
    })
    return () => { dead = true; try { sfx.current?.stopMusic?.() } catch (e) { /* ignore */ } try { game.current?.destroy(true) } catch (e) { /* ignore */ } game.current = null }
  }, [stage])
  useEffect(() => { if (game.current) { try { portrait ? game.current.loop.sleep() : game.current.loop.wake() } catch (e) { /* ignore */ } } }, [portrait])
  const start = () => { try { localStorage.setItem(LS, JSON.stringify(player)) } catch (e) { /* ignore */ } setResults(null); setStage('battle') }
  const you = results && results.find(r => r.you), yourPlace = results ? results.indexOf(you) + 1 : 0
  const btn = { height: 40, padding: '0 16px', borderRadius: 12, border: '1px solid #2A3138', background: 'rgba(26,31,36,0.9)', color: '#F2F2F2', fontSize: 14, fontWeight: 800, cursor: 'pointer' }

  return (
    <div role="dialog" aria-modal="true" aria-label="Last Man Standing" style={{ position: 'fixed', inset: 0, zIndex: 500, background: '#04060c', color: '#F2F2F2', display: 'flex', flexDirection: 'column', userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none' }} onContextMenu={e => e.preventDefault()}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 'calc(6px + env(safe-area-inset-top, 0px)) calc(12px + env(safe-area-inset-right, 0px)) 6px calc(12px + env(safe-area-inset-left, 0px))' }}>
        <button type="button" onClick={onClose} style={btn}>Close</button>
        <b style={{ fontFamily: "'Saira Condensed', sans-serif", fontStyle: 'italic', fontSize: 22, color: '#F5C542', flex: 1 }}>LAST MAN STANDING</b>
        {stage === 'battle' && <button type="button" onClick={() => setStage('setup')} style={btn}>Change character</button>}
      </div>

      {stage === 'setup' && (
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, padding: '10px 16px 20px' }}>
          <div style={{ fontSize: 14, color: '#9AA3AE', textAlign: 'center', maxWidth: 520 }}>Ten fighters. Every hit raises their damage % — the higher it is, the further they fly. In the Ring, knock them over the ropes: last one in wins. On the Track, race to the finish and knock them off the sides: first across the line wins. Pick your fighter and watch.</div>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, fontWeight: 700, color: '#C9CED6' }}>Your name
            <input value={player.name} maxLength={14} onChange={e => setPlayer(p => ({ ...p, name: e.target.value }))} placeholder="Your name" style={{ height: 40, width: 220, borderRadius: 10, border: '1px solid #2A3138', background: '#0B0E12', color: '#F2F2F2', padding: '0 12px', fontSize: 16 }} />
          </label>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#C9CED6' }}>Arena</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
            {[['ring', 'Ring', 'Knock them over the ropes · last one in wins'], ['track', 'Track', 'Race to the finish · knock them off the track']].map(([k, name, blurb]) => (
              <button key={k} type="button" onClick={() => setPlayer(p => ({ ...p, arena: k }))} style={{ ...pill((player.arena || 'ring') === k, '#F5C542'), height: 'auto', padding: '8px 14px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                <span>{name}</span><span style={{ fontFamily: "'Rajdhani', sans-serif", fontStyle: 'normal', fontWeight: 600, fontSize: 12, color: '#9AA3AE' }}>{blurb}</span>
              </button>
            ))}
          </div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#C9CED6' }}>Colour</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
            {FIGHTERS.map(f => <button key={f.key} type="button" onClick={() => setPlayer(p => ({ ...p, colour: f.key }))} style={pill(player.colour === f.key, f.colour)}>{f.name}</button>)}
          </div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#C9CED6' }}>Style</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
            {STYLE_KEYS.map(k => <button key={k} type="button" onClick={() => setPlayer(p => ({ ...p, style: k }))} style={pill(player.style === k, '#F2F2F2')}>{STYLES[k].name}</button>)}
          </div>
          <button type="button" onClick={start} style={{ marginTop: 6, height: 52, padding: '0 34px', borderRadius: 14, border: 'none', background: '#22B14C', color: '#FFFFFF', fontFamily: "'Saira Condensed', sans-serif", fontStyle: 'italic', fontWeight: 800, fontSize: 26, cursor: 'pointer', boxShadow: '0 0 16px #22B14C88' }}>FIGHT!</button>
        </div>
      )}

      {stage === 'battle' && <div ref={host} style={{ flex: 1, minHeight: 0, position: 'relative' }} />}

      {stage === 'results' && results && (
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', gap: 24, padding: '10px 24px 20px', flexWrap: 'wrap', justifyContent: 'center' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, minWidth: 240 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#9AA3AE', letterSpacing: 2 }}>WINNER</div>
            <div style={{ fontFamily: "'Saira Condensed', sans-serif", fontStyle: 'italic', fontWeight: 800, fontSize: 40, color: results[0].colour, textAlign: 'center' }}>{results[0].colourName} · {results[0].name}</div>
            <div style={{ fontSize: 14, color: '#C9CED6' }}>{STYLES[results[0].style].name} · {results[0].kos} knock-{player.arena === 'track' ? 'off' : 'out'}{results[0].kos === 1 ? '' : 's'}{player.arena === 'track' ? ' · first across the line' : ''}</div>
            {you && <div style={{ marginTop: 6, fontFamily: "'Saira Condensed', sans-serif", fontStyle: 'italic', fontWeight: 800, fontSize: 24, color: '#5BE0FF' }}>{yourPlace === 1 ? 'YOU WON!' : `You came ${ordinal(yourPlace)}`}</div>}
            <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
              <button type="button" onClick={start} style={{ ...btn, borderColor: '#22B14C', color: '#22B14C' }}>Run it again</button>
              <button type="button" onClick={() => setStage('setup')} style={btn}>Change character</button>
            </div>
          </div>
          <ol style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 4, minWidth: 280 }}>
            {results.map((r, i) => (
              <li key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 10px', borderRadius: 8, background: r.you ? '#5BE0FF22' : '#1A1F24', border: `1px solid ${r.you ? '#5BE0FF' : '#2A3138'}` }}>
                <b style={{ width: 34, color: i === 0 ? '#F5C542' : '#9AA3AE' }}>{ordinal(i + 1)}</b>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: r.colour }} />
                <span style={{ flex: 1, fontWeight: 700 }}>{r.name}{r.you ? ' (you)' : ''}</span>
                <span style={{ fontSize: 12, color: '#9AA3AE' }}>{STYLES[r.style].name.split(' ')[0]} · {r.kos} KO{r.finished ? ' · finished' : r.fell ? ' · fell off' : (player.arena === 'track' ? ' · still racing' : '')}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {portrait && stage === 'battle' && (
        <div role="alert" style={{ position: 'absolute', inset: 0, zIndex: 50, background: '#05070A', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, textAlign: 'center', padding: 24 }}>
          <div style={{ fontFamily: "'Saira Condensed', sans-serif", fontStyle: 'italic', fontWeight: 800, fontSize: 26 }}>Turn your phone sideways</div>
          <div style={{ fontSize: 14, color: '#9AA3AE' }}>Last Man Standing plays in landscape.</div>
          <button type="button" onClick={onClose} style={btn}>Close</button>
        </div>
      )}
    </div>
  )
}
