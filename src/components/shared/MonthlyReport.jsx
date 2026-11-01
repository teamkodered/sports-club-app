import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase.js'

// 📊 Monthly progress report (Nov 2026): last month in one card -- sessions, PBs, tests, PDP days and
// points -- shown in the athlete app for the first 7 days of each month (or whenever opened from
// the button). 'Share' sends it as text (e.g. to a parent on WhatsApp).
const PT_RE = /\bpts?\b[^a-z]*register|leaders?\b[^a-z]*register/i
export default function MonthlyReport({ studentId, name, attendanceData = [], sessions = [], pdpDone = {}, classesById = {}, force = false, onClose }) {
  const now = new Date()
  const m0 = new Date(now.getFullYear(), now.getMonth() - 1, 1), m1 = new Date(now.getFullYear(), now.getMonth(), 1)
  const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const from = iso(m0), to = iso(new Date(m1 - 86400000)), monthName = m0.toLocaleDateString('en-GB', { month: 'long' })
  const key = `kc_report_${from.slice(0, 7)}`
  const [hidden, setHidden] = useState(() => { try { return !force && (localStorage.getItem(key) === 'hide' || now.getDate() > 7) } catch { return false } })
  const [pts, setPts] = useState(null)
  useEffect(() => {
    if (hidden || !studentId) return
    supabase.from('points_log').select('point_type, points_awarded').eq('student_id', studentId)
      .gte('awarded_at', from + 'T00:00:00Z').lt('awarded_at', iso(m1) + 'T00:00:00Z')
      .then(({ data }) => setPts(data || []))
  }, [hidden, studentId]) // eslint-disable-line react-hooks/exhaustive-deps
  if (hidden) return null

  const att = attendanceData.filter(a => a.session_date >= from && a.session_date <= to && (a.attendance_type === 'attended' || a.attendance_type === 'full_kit'))
  const normal = att.filter(a => !PT_RE.test(classesById[a.class_id]?.name || ''))
  const sessionsN = new Set(normal.map(a => `${a.session_date}:${a.class_id || ''}`)).size
  const fullKit = normal.filter(a => a.attendance_type === 'full_kit').length
  const testsDone = new Set(sessions.filter(s => s.session_date >= from && s.session_date <= to).flatMap(s => Object.keys(s.test || {}).filter(k => s.test[k] != null && s.test[k] !== '' && k !== 'notes'))).size
  const pdpDays = (Array.isArray(pdpDone.__day__) ? pdpDone.__day__ : []).filter(d => d >= from && d <= to).length
  const pbs = (pts || []).filter(p => /^PB: /.test(p.point_type)).map(p => p.point_type.replace(/^PB: /, '').replace(/ \(\d{4}-\d{2}-\d{2}\)$/, ''))
  const total = (pts || []).reduce((n, p) => n + (p.points_awarded || 0), 0)
  const rows = [['🥋 Sessions', sessionsN], ['👕 In full kit', fullKit], ['📋 Tests done', testsDone], ['🏆 PBs', pbs.length], ['🎯 PDP days', pdpDays], ['⭐ Points earned', pts ? total : '…']]
  const text = `${name ? name + "'s " : ''}${monthName} at KR Centre:\n` + rows.map(([l, v]) => `${l}: ${v}`).join('\n') + (pbs.length ? `\nPBs: ${pbs.join(', ')}` : '')
  return (
    <div className="card" style={{ padding: 12, marginBottom: 10, border: '1px solid #378ADD66' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <b style={{ fontSize: 14 }}>📊 Your {monthName}</b>
        <button type="button" className="btn btn-sm" aria-label="Hide" onClick={() => { try { localStorage.setItem(key, 'hide') } catch { /* */ } setHidden(true); onClose?.() }}>✕</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
        {rows.map(([l, v]) => (
          <div key={l} style={{ background: 'var(--bg-secondary)', borderRadius: 8, padding: '8px 4px', textAlign: 'center' }}>
            <div style={{ fontSize: 18, fontWeight: 800 }}>{v}</div>
            <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{l}</div>
          </div>
        ))}
      </div>
      {pbs.length > 0 && <div style={{ fontSize: 12, marginTop: 8 }}>🏆 PBs: {pbs.join(', ')}</div>}
      <button type="button" className="btn btn-sm" style={{ marginTop: 10, width: '100%', justifyContent: 'center' }}
        onClick={async () => { try { if (navigator.share) await navigator.share({ text }); else { await navigator.clipboard.writeText(text); alert('Copied -- paste it into a message.') } } catch { /* cancelled */ } }}>
        📤 Share (e.g. with a parent)
      </button>
    </div>
  )
}
