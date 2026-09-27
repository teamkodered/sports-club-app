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
        const labelText = hasTarget ? `${letter} ${done}/${target}` : letter
        const labelColour = hasTarget ? accent : '#666'
        if (corner === 'bottom') {
          return (
            <div key={key}>
              <div style={{ position: 'absolute', left: 0, right: 0, bottom: o, height: 3, background: track, borderRadius: 2 }}>
                <div style={{ width: `${pct}%`, height: '100%', background: accent, boxShadow: glow, borderRadius: 2, transition: 'width 0.3s' }} />
              </div>
              <div style={{ position: 'absolute', left: 4, bottom: o - 4, padding: '0 3px', background: '#1A1F24', fontFamily: 'Orbitron, sans-serif', fontSize: 9, letterSpacing: 1, lineHeight: '11px', color: labelColour }}>{labelText}</div>
            </div>
          )
        }
        return (
          <div key={key}>
            {/* post on the outer side */}
            <div style={{ position: 'absolute', [side]: o, [vert]: o, [vother]: 0, width: 3, background: accent, boxShadow: glow, borderRadius: 2 }} />
            {/* rope along the outer top/bottom edge, filling from the post */}
            <div style={{ position: 'absolute', [side]: o, [other]: 0, [vert]: o, height: 3, background: track, borderRadius: 2 }}>
              <div style={{ position: 'absolute', [side]: 0, top: 0, height: '100%', width: `${pct}%`, background: accent, boxShadow: glow, borderRadius: 2, transition: 'width 0.3s' }} />
            </div>
            {/* label on the line, at its open end */}
            <div style={{ position: 'absolute', [other]: 4, [vert]: o - 4, padding: '0 3px', background: '#1A1F24', fontFamily: 'Orbitron, sans-serif', fontSize: 9, letterSpacing: 1, lineHeight: '11px', color: labelColour }}>{labelText}</div>
          </div>
        )
      })}
    </>
  )
}
