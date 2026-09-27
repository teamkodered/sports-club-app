// Ring-rope progress for a pillar card in the neon home theme.
// Three glowing lines on the card's OUTER two edges = the D / W / M bars.
// corner: 'tl' | 'tr' | 'bl' | 'br' | 'bottom' (Foundation: three lines along the bottom)
// byPeriod: { day: {done,target}, week: {...}, month: {...} }
// Lighter tint of a colour (mix with white) -- the uncharged part of each rope
const lighten = (hex, amt = 0.55) => {
  const n = parseInt(hex.slice(1), 16)
  const mix = c => Math.round(c + (255 - c) * amt)
  const r = mix(n >> 16), g = mix((n >> 8) & 255), b = mix(n & 255)
  return `rgb(${r}, ${g}, ${b})`
}

const MOCKUP_TRACK = { '#22B14C': '#0B2A12', '#FF2A2A': '#331010', '#2F6BFF': '#0F1A33', '#E6B800': '#332A00', '#C93BFF': '#2A1533' }

const NEON = { tl: '#22B14C', tr: '#FF2A2A', bl: '#2F6BFF', br: '#E6B800', bottom: '#C93BFF' }

export default function SectionRopes({ byPeriod, accent: _accent, corner = 'tl', dim }) {
  const accent = NEON[corner] || _accent
  const track = dim || MOCKUP_TRACK[accent] || lighten(accent, 0.2)
  const periods = [['day', 'D', 0], ['week', 'W', 18], ['month', 'M', 36]]  // wider spacing
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
        const letterStyle = { position: 'absolute', fontFamily: 'Orbitron, sans-serif', fontSize: 11, fontWeight: 500, letterSpacing: 0, lineHeight: '12px', width: 14, textAlign: 'center', color: '#9A9A9A' }
        if (corner === 'bottom') {
          return (
            <div key={key}>
              <div style={{ position: 'absolute', left: 0, right: 0, bottom: o, height: 4, background: track, borderRadius: 2 }}>
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
            {/* As the mockup: solid glowing post on the outer side, rope along the outer
                edge filling from the post outward over a dark track */}
            <div style={{ position: 'absolute', [side]: o, [vert]: o, [vother]: 0, width: 4, background: accent, boxShadow: glow, borderRadius: 2 }} />
            <div style={{ position: 'absolute', [side]: o, [other]: 0, [vert]: o, height: 4, background: track, borderRadius: 2 }}>
              <div style={{ position: 'absolute', [side]: 0, top: 0, height: '100%', width: `${pct}%`, background: accent, boxShadow: glow, borderRadius: 2, transition: 'width 0.3s' }} />
            </div>
            {/* count on the line, at its open end */}
            {hasTarget && <div style={{ position: 'absolute', [other]: 6, [vert]: o - 4, padding: '0 4px', background: '#1A1F24', fontFamily: 'Orbitron, sans-serif', fontSize: 11, fontWeight: 500, letterSpacing: 0, lineHeight: '12px', textAlign: side === 'left' ? 'right' : 'left', color: labelColour }}>{done}/{target}</div>}
            {/* one D / W / M letter per rope row, in the gap between the two cards (left-hand card draws it) */}
            {side === 'left' && <div style={{ ...letterStyle, left: 'calc(100% + 10px)', transform: 'translateX(-50%)', [vert]: o - 4 }}>{letter}</div>}
          </div>
        )
      })}
    </>
  )
}
