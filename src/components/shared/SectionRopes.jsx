// Ring-rope progress for a pillar card in the neon home theme.
// Three glowing lines on the card's OUTER two edges = the D / W / M bars.
// corner: 'tl' | 'tr' | 'bl' | 'br' | 'bottom' (Foundation: three lines along the bottom)
// byPeriod: { day: {done,target}, week: {...}, month: {...} }
const NEON = { tl: '#22B14C', tr: '#FF2A2A', bl: '#2F6BFF', br: '#E6B800', bottom: '#C93BFF' }

export default function SectionRopes({ byPeriod, accent: _accent, corner = 'tl', dim }) {
  const accent = NEON[corner] || _accent
  const track = dim || `${accent}80`
  const periods = [['day', 'D', 0], ['week', 'W', 14], ['month', 'M', 28]]
  const side = corner.includes('r') ? 'right' : 'left'
  const other = side === 'right' ? 'left' : 'right'
  const vert = corner.startsWith('b') || corner === 'bottom' ? 'bottom' : 'top'
  const vother = vert === 'top' ? 'bottom' : 'top'
  const glow = `0 0 3px ${accent}`
  return (
    <>
      {periods.map(([key, letter, o]) => {
        const { done, target } = byPeriod[key] || { done: 0, target: 0 }
        const hasTarget = target > 0
        const pct = hasTarget ? Math.min(100, Math.round((done / target) * 100)) : 0
        const labelColour = hasTarget ? accent : '#666'
        const letterStyle = { position: 'absolute', fontFamily: 'Orbitron, sans-serif', fontSize: 9, fontWeight: 500, letterSpacing: 0, lineHeight: '11px', width: 12, textAlign: 'center', color: '#9A9A9A' }
        if (corner === 'bottom') {
          return (
            <div key={key}>
              <div style={{ position: 'absolute', left: 0, right: 0, bottom: o, height: 3, background: track, borderRadius: 2 }}>
                <div style={{ width: `${pct}%`, height: '100%', background: accent, boxShadow: glow, borderRadius: 2, transition: 'width 0.3s' }} />
              </div>
              <div style={{ ...letterStyle, left: 4, bottom: o - 4, padding: '0 3px', background: '#1A1F24' }}>{letter}</div>
              {hasTarget && <div style={{ position: 'absolute', right: 4, bottom: o - 4, padding: '0 3px', background: '#1A1F24', fontFamily: 'Orbitron, sans-serif', fontSize: 9, letterSpacing: 1, lineHeight: '11px', color: labelColour }}>{done}/{target}</div>}
            </div>
          )
        }
        return (
          <div key={key}>
            {/* Each rope is one L-shaped line: the post down the outer side plus the rope
                along the outer edge. Progress charges along the whole L, starting at the
                FAR end of the post (bottom for the top cards, top for the bottom cards),
                running up/down the post, round the corner and out along the rope.
                Cards are square, so post and rope are about the same length: the first
                half of the progress fills the post, the second half the rope. */}
            {(() => {
              const postPct = Math.min(100, pct * 2)
              const ropePct = Math.max(0, pct * 2 - 100)
              return (
                <>
                  <div style={{ position: 'absolute', [side]: o, [vert]: o, [vother]: 0, width: 3, background: track, borderRadius: 2 }}>
                    <div style={{ position: 'absolute', left: 0, [vother]: 0, width: '100%', height: `${postPct}%`, background: accent, boxShadow: glow, borderRadius: 2, transition: 'height 0.3s' }} />
                  </div>
                  <div style={{ position: 'absolute', [side]: o, [other]: 0, [vert]: o, height: 3, background: track, borderRadius: 2 }}>
                    <div style={{ position: 'absolute', [side]: 0, top: 0, height: '100%', width: `${ropePct}%`, background: accent, boxShadow: glow, borderRadius: 2, transition: 'width 0.3s' }} />
                  </div>
                </>
              )
            })()}
            {/* count on the line, at its open end */}
            {hasTarget && <div style={{ position: 'absolute', [other]: 6, [vert]: o - 4, padding: '0 4px', background: '#1A1F24', fontFamily: 'Orbitron, sans-serif', fontSize: 9, fontWeight: 500, letterSpacing: 0, lineHeight: '11px', textAlign: side === 'left' ? 'right' : 'left', color: labelColour }}>{done}/{target}</div>}
            {/* one D / W / M letter per rope row, in the gap between the two cards (left-hand card draws it) */}
            {side === 'left' && <div style={{ ...letterStyle, left: 'calc(100% + 8px)', transform: 'translateX(-50%)', [vert]: o - 4 }}>{letter}</div>}
          </div>
        )
      })}
    </>
  )
}
