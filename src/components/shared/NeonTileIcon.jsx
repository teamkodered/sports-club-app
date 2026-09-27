// Line icons for the small home tiles in the neon theme (hidden outside .neon-home).
// Colours as agreed on the mockup.
const ICONS = {
  media:     ['#22B14C', <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 16l5-5 4 4 3-3 6 6" /></>],
  notes:     ['#FF2A2A', <><path d="M4 4h12l4 4v12H4z" /><path d="M8 12h8M8 16h8" /></>],
  opponents: ['#22B14C', <path d="M7 4h7a4 4 0 0 1 4 4v5a4 4 0 0 1-4 4H9l-3 3V8a4 4 0 0 1 1-4z" />],
  reports:   ['#FF2A2A', <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />],
  wearables: ['#2F6BFF', <><rect x="6" y="6" width="12" height="12" rx="3" /><path d="M9 2h6M9 22h6M12 9v3l2 2" /></>],
  mtp:       ['#E6B800', <path d="M3 17l5-6 4 3 5-8 4 5" />],
  sweep:     ['#2F6BFF', <path d="M4 20l6-6M14 4l6 6-8 8-6-6z" />],
  leagues:   ['#E6B800', <path d="M8 4h8v4a4 4 0 0 1-8 0zM6 6H3a3 3 0 0 0 3 3M18 6h3a3 3 0 0 1-3 3M12 12v4M8 20h8" />],
  pdp:       ['#E6B800', <><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="4" /><path d="M12 12l7-7" /></>],
  fight:     ['#FF2A2A', <path d="M6 12h2l2-5 4 10 2-5h2" />],
}
const keyFor = name => {
  const n = String(name || '').toLowerCase()
  if (n.startsWith('media')) return 'media'
  if (n.startsWith('notes')) return 'notes'
  if (n.startsWith('opponent')) return 'opponents'
  if (n.startsWith('report')) return 'reports'
  if (n.startsWith('wearable')) return 'wearables'
  if (n.startsWith('mtp')) return 'mtp'
  if (n.startsWith('sweep')) return 'sweep'
  if (n.startsWith('league')) return 'leagues'
  if (n.startsWith('pdp')) return 'pdp'
  if (n.startsWith('fit')) return 'fight'
  return null
}
export default function NeonTileIcon({ name }) {
  const k = keyFor(name)
  if (!k) return null
  const [colour, body] = ICONS[k]
  return (
    <svg className="neon-tile-icon" width="30" height="30" viewBox="0 0 24 24" fill="none" stroke={colour} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{body}</svg>
  )
}
