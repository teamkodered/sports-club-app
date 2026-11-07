import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase.js'
import { useAuth } from '../../hooks/useAuth.jsx'
import { beltStyle } from '../../lib/beltColours.js'
import BbbcLine from '../shared/BbbcLine.jsx'
import GradingRequestSheet from '../shared/GradingRequestSheet.jsx'

// 🥋 Black belt grading list (bottom of the Dashboard, closed until pressed): everyone waiting for the
// Black belt grading, with BBBC, coach status and approval. Tap one to OK / add a note / move it back.
const fmt = d => new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
export default function BlackBeltList() {
  const { profile, isAdmin } = useAuth()
  const [rows, setRows] = useState(null)
  const [open, setOpen] = useState(false)
  const [sheet, setSheet] = useState(null)
  function load() {
    supabase.from('grading_expressions').select('*, students(*, members(first_name, last_name))')
      .eq('grading_list', 'Black belt grading').order('created_at', { ascending: false })
      .then(({ data, error }) => setRows(error ? [] : (data || [])))
  }
  useEffect(() => {
    load()
    // someone moved onto the list from Gradings to confirm -> show them here straight away
    window.addEventListener('kc-blackbelt-changed', load)
    return () => window.removeEventListener('kc-blackbelt-changed', load)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  if (!rows || !rows.length) return null
  const date = rows.find(r => r.grading_date)?.grading_date
  const nm = r => r.students?.members ? `${r.students.members.first_name} ${r.students.members.last_name}` : (() => { try { return JSON.parse(r.notes || '{}').name || 'Student' } catch { return 'Student' } })()
  return (
    <div className="card" style={{ marginBottom: 16, border: '1px solid #44444488' }}>
      <button type="button" onClick={() => setOpen(o => !o)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--text)', textAlign: 'left', fontFamily: 'var(--font-sans)' }}>
        <b style={{ fontSize: 15, flex: 1 }}>🥋 Black belt grading</b>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{rows.length} · {date ? fmt(date) : 'date TBC'}</span>
        <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{open ? '▲' : '▼'}</span>
      </button>
      <div className={`kc-slide${open ? ' open' : ''}`}><div>
        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', margin: '8px 0 4px' }}>Tap a student to OK them, add a note or move them back to the normal grading.</div>
        {rows.map(r => (
          <div key={r.id} onClick={() => setSheet(r)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderTop: '1px solid var(--border)', cursor: 'pointer' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{nm(r)}</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{r.current_belt || '—'} → <span style={beltStyle(r.grading_for)}>{r.grading_for}</span></div>
              <BbbcLine r={r} />
              <div style={{ fontSize: 11, fontWeight: 600, color: r.coach_ok ? '#1D9E75' : r.coach_not_ready ? '#E24B4A' : 'var(--text-tertiary)' }}>
                {r.coach_ok ? `✓ Coach OK${r.coach_ok_by ? ` · ${r.coach_ok_by}` : ''}` : r.coach_not_ready ? `✗ Not ready: ${r.coach_note || ''}` : '⏳ Waiting for coach'}{r.coach_approved ? ' · ✓ approved' : ''}
              </div>
            </div>
            {r.students?.photo_url && <img src={r.students.photo_url} alt="" style={{ width: 44, height: 44, borderRadius: 10, objectFit: 'cover' }} />}
          </div>
        ))}
      </div></div>
      {sheet && <GradingRequestSheet r={sheet} name={nm(sheet)} isAdmin={isAdmin} byName={[profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || 'Coach'}
        onClose={() => setSheet(null)} onSaved={u => setRows(prev => u.grading_list === 'Black belt grading' ? prev.map(x => x.id === u.id ? { ...x, ...u } : x) : prev.filter(x => x.id !== u.id))} />}
    </div>
  )
}
