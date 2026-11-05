// 🎨 Belt / grade colours -- 'Yellow', 'Orange tag', 'Red/Black', 'Brown tag', 'Black 1st Dan'...
const C = { white: '#E6E6E6', red: '#E24B4A', yellow: '#F5C542', orange: '#F28C28', green: '#2FB36B', blue: '#3B82F6', purple: '#9B5DE5', brown: '#A0522D', black: '#111111', grey: '#9CA3AF', gray: '#9CA3AF', pink: '#F472B6' }
export function beltColour(name) {
  const n = String(name || '').toLowerCase()
  if (!n || /ungraded|none/.test(n)) return null
  // first colour word named (e.g. "Red/Black" -> red, "Black tag" -> black)
  const hit = Object.keys(C).map(k => [k, n.indexOf(k)]).filter(([, i]) => i >= 0).sort((a, b) => a[1] - b[1])[0]
  return hit ? C[hit[0]] : null
}
// a pill style that stays readable on dark and light backgrounds
export function beltStyle(name) {
  const c = beltColour(name)
  if (!c) return { fontWeight: 700 }
  const dark = ['#111111', '#A0522D', '#3B82F6', '#9B5DE5', '#E24B4A', '#2FB36B'].includes(c)
  return { fontWeight: 700, background: c, color: dark ? '#fff' : '#111', borderRadius: 6, padding: '1px 7px', border: c === '#111111' ? '1px solid #666' : 'none', whiteSpace: 'nowrap' }
}
