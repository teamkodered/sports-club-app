// Neon theme: progress drawn around a (square) stat card's outline,
// starting at the BOTTOM CENTRE and running clockwise. pct = 0..100.
// Hidden outside .neon-home (CSS).
const S = 96, R = 10, EDGE = S - 2 * R           // side, corner radius, straight edge
const P = 4 * EDGE + 2 * Math.PI * R             // perimeter
// SVG rect paths start at the top-left (after the corner) and run: top ->
// right -> bottom (right-to-left) -> left. Bottom centre is halfway along
// the bottom edge; following the path from there runs left, up, across the
// top and down the right -- clockwise on screen.
const BOTTOM_CENTRE = EDGE + Math.PI * R + EDGE + EDGE / 2

export default function StatOutline({ pct }) {
  const p = Math.max(0, Math.min(100, Number(pct) || 0))
  const dash = P * p / 100
  return (
    <svg className="neon-stat-outline" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      <rect x="2" y="2" width={S} height={S} rx={R} fill="none" stroke="#2A3138" strokeWidth="4" />
      {p > 0 && <rect x="2" y="2" width={S} height={S} rx={R} fill="none" stroke="#FFFFFF" strokeWidth="4" strokeLinecap="round"
        strokeDasharray={`${dash.toFixed(2)} ${Math.max(0.01, P - dash).toFixed(2)}`} strokeDashoffset={-BOTTOM_CENTRE}
        style={{ filter: 'drop-shadow(0 0 6px #FFFFFF)' }} />}
    </svg>
  )
}
