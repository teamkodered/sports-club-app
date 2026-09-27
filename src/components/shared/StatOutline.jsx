// Neon theme: progress drawn around a stat card's outline, starting top-centre.
// Hidden outside .neon-home (CSS). pct = 0..100.
export default function StatOutline({ pct }) {
  const p = Math.max(0, Math.min(100, Number(pct) || 0))
  const P = 379 // rounded-rect perimeter in viewBox units
  return (
    <svg className="neon-stat-outline" viewBox="0 0 110 96" preserveAspectRatio="none" aria-hidden="true">
      <rect x="2" y="2" width="106" height="92" rx="10" fill="none" stroke="#2A3138" strokeWidth="4" />
      {p > 0 && <rect x="2" y="2" width="106" height="92" rx="10" fill="none" stroke="#FFFFFF" strokeWidth="4" strokeLinecap="round"
        strokeDasharray={`${(P * p / 100).toFixed(0)} ${P}`} strokeDashoffset={-43} pathLength={P} style={{ filter: 'drop-shadow(0 0 6px #FFFFFF)' }} />}
    </svg>
  )
}
