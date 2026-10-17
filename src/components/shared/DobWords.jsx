// Under a date-of-birth box: the chosen date written out in words ("6 July 2013"), so anyone whose
// phone shows dates month-first can see straight away if the day and month have been swapped.
export default function DobWords({ value }) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const d = new Date(value + 'T12:00:00')
  return (
    <div style={{ fontSize: 12, marginTop: 4, color: 'var(--text-secondary)' }}>
      That's <b>{d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</b> — check the day and month are the right way round.
    </div>
  )
}
