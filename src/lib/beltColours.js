// 🎨 Belt / grade colours -- 'Yellow', 'Orange tag', 'Red/Black', 'Brown tag', 'Black 1st Dan'...
const C = { white: '#E6E6E6', red: '#E24B4A', yellow: '#F5C542', orange: '#F28C28', green: '#2FB36B', blue: '#3B82F6', purple: '#9B5DE5', brown: '#A0522D', black: '#111111', grey: '#9CA3AF', gray: '#9CA3AF', pink: '#F472B6' }
export function beltColour(name) {
  const n = String(name || '').toLowerCase()
  if (!n || /ungraded|none/.test(n)) return null
  // first colour word named (e.g. "Red/Black" -> red, "Black tag" -> black)
  const hit = Object.keys(C).map(k => [k, n.indexOf(k)]).filter(([, i]) => i >= 0).sort((a, b) => a[1] - b[1])[0]
  return hit ? C[hit[0]] : null
}
// the grade written in its belt colour (no box). Black / dark brown get a faint light outline so they
// still show on the dark screens; white gets a faint dark outline for light screens.
export function beltStyle(name) {
  const c = beltColour(name)
  if (!c) return { fontWeight: 700 }
  const outline = c === '#111111' || c === '#A0522D' ? '0 0 2px rgba(255,255,255,0.85), 0 0 1px rgba(255,255,255,0.85)'
    : c === '#E6E6E6' ? '0 0 2px rgba(0,0,0,0.7)' : 'none'
  return { fontWeight: 800, color: c, textShadow: outline, whiteSpace: 'nowrap' }
}
