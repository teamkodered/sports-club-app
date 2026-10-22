import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase.js'

// Heart rate recorded during this class session (timetable / calendar session panel)
export default function SessionHr({ studentId, dateStr, classId }) {
  const [rows, setRows] = useState(null)
  useEffect(() => {
    if (!studentId || !dateStr || !classId) { setRows([]); return }
    supabase.from('hr_sessions').select('*').eq('student_id', studentId).eq('session_date', dateStr).eq('class_id', classId)
      .then(({ data }) => setRows(data || []), () => setRows([]))
  }, [studentId, dateStr, classId])
  if (!rows || !rows.length) return null
  return (
    <div style={{ marginBottom: 12, padding: '8px 10px', borderRadius: 8, border: '1px solid #E24B4A55', background: 'rgba(226,75,74,0.06)' }}>
      {rows.map(r => (
        <div key={r.id} style={{ fontSize: 13 }}>
          ❤️ <b>{r.minutes} min</b> · avg <b>{r.avg_hr}</b> bpm{r.avg_pct ? ` (${r.avg_pct}%)` : ''} · max <b>{r.max_hr}</b>{r.max_pct ? ` (${r.max_pct}%)` : ''}
          <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{r.device ? ` · ${r.device}` : ''}</span>
        </div>
      ))}
    </div>
  )
}
