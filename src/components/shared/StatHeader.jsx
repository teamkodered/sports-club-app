// The Sessions / Results / PDP numbers ("6/24 · 25%") shown at the top of the page the tile opens.
// The tiles on Home show only the % now; they leave their numbers here when tapped.
export function rememberStat(label, value, pct) { try { sessionStorage.setItem('kc-stat:' + label, JSON.stringify({ value, pct })) } catch { /* */ } }
export default function StatHeader({ label, icon }) {
  let d = null; try { d = JSON.parse(sessionStorage.getItem('kc-stat:' + label) || 'null') } catch { /* */ }
  if (!d) return null
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', margin: '0 0 12px', borderRadius: 12, border: '1.5px solid #C9CED6', background: '#14181C', boxShadow: '0 0 10px #C9CED644' }}>
      {icon && <img src={icon} alt="" style={{ height: 24, width: 'auto' }} />}
      <span style={{ fontSize: 11, letterSpacing: 2, color: '#C9CED6', flex: 1, textTransform: 'uppercase' }}>{label}</span>
      <b style={{ fontSize: 20, fontWeight: 800 }}>{d.value}</b>
      {d.pct != null && d.pct !== d.value && <span style={{ fontSize: 14, fontWeight: 800, color: '#C9CED6' }}>· {d.pct}</span>}
    </div>
  )
}
