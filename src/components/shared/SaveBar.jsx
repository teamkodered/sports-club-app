import { useState } from 'react'

// 💾 Save -- a clear save button under sets / reps. The boxes already save when you leave them;
// this makes sure the box you're still in is saved too, and confirms it.
export default function SaveBar({ count, label = 'set' }) {
  const [at, setAt] = useState(null)
  return (
    <button type="button" className={at ? 'btn' : 'btn btn-primary'} style={{ width: '100%', justifyContent: 'center', marginTop: 8, height: 42 }}
      onClick={() => { document.activeElement?.blur?.(); setTimeout(() => setAt(new Date()), 150) }}>
      {at ? `✓ Saved ${at.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}${count != null ? ` · ${count} ${label}${count === 1 ? '' : 's'}` : ''}` : '💾 Save'}
    </button>
  )
}
