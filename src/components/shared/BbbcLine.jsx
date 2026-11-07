// 🥋 Brown / Black belt gradings: how many Brown Black Belt Courses (BBBC) they've done -- 2 needed.
// Shown on grading requests (admin) and the coaches' lists, with the admin note if there is one.
export const needsBbbc = r => /brown|black/i.test(r?.grading_for || '')
export function bbbcOf(r) {
  let n = {}; try { n = typeof r.notes === 'string' ? JSON.parse(r.notes || '{}') : (r.notes || {}) } catch { /* */ }
  // the course record (from the BBBC sign-up sheet, on the student) and what they put on the form -- the higher count wins
  const fromForm = n.bbbc_count ?? null, fromRecord = r.students?.bbbc_courses ?? null
  const count = fromForm == null ? fromRecord : fromRecord == null ? fromForm : Math.max(fromForm, fromRecord)
  return { count, dates: r.students?.bbbc_dates || n.bbbc_dates || '' }
}
export default function BbbcLine({ r }) {
  if (!needsBbbc(r) && !r?.admin_note) return null
  const { count, dates } = bbbcOf(r)
  const ok = count != null && count >= 2
  return (
    <>
      {needsBbbc(r) && (
        <div style={{ fontSize: 12, fontWeight: 600, margin: '2px 0', color: ok ? '#1D9E75' : '#E24B4A' }}>
          🥋 BBBC courses: {count == null ? 'not given' : count}{dates ? ` (${dates})` : ''} · {ok ? '✓ 2+ done' : 'needs 2 before Brown / Black'}
        </div>
      )}
      {r.admin_note && <div style={{ fontSize: 12, fontWeight: 600, margin: '2px 0', color: '#EF9F27' }}>📌 {r.admin_note}</div>}
    </>
  )
}
