// Target shown as five-bar-gate tally marks: every mark is the target, dimmed;
// marks light up as tasks are completed (4 uprights + a diagonal per gate).
export default function TallyGate({ target = 0, done = 0, colour = '#22B14C', label }) {
  if (!target) return null
  const gates = Math.ceil(target / 5), h = 16, gw = 26
  const marks = []
  for (let i = 0; i < target; i++) {
    const g = Math.floor(i / 5), k = i % 5, x0 = g * (gw + 6)
    const lit = i < done
    marks.push(k < 4
      ? <line key={i} x1={x0 + 3 + k * 5} y1={2} x2={x0 + 3 + k * 5} y2={h - 2} stroke={colour} strokeWidth="2.2" strokeLinecap="round" opacity={lit ? 1 : 0.22} style={lit ? { filter: `drop-shadow(0 0 2px ${colour})` } : undefined} />
      : <line key={i} x1={x0} y1={h - 3} x2={x0 + 22} y2={3} stroke={colour} strokeWidth="2.2" strokeLinecap="round" opacity={lit ? 1 : 0.22} style={lit ? { filter: `drop-shadow(0 0 2px ${colour})` } : undefined} />)
  }
  return (
    <span className="neon-tally" title={`${label ? label + ' target: ' : 'Target: '}${Math.min(done, target)} of ${target} done`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <svg width={gates * (gw + 6)} height={h} viewBox={`0 0 ${gates * (gw + 6)} ${h}`} aria-hidden="true">{marks}</svg>
    </span>
  )
}
