import { useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../../lib/supabase.js'
import { beltStyle } from '../../lib/beltColours.js'
import BbbcLine from './BbbcLine.jsx'

// 🎽 Tap a grading request: coach status (✓ OK / ✗ Not ready / ⏳ waiting), coach note, and for admins
// the admin note + approve / UNDO approval. Used in the CRM list and the coaches' Gradings to confirm.
export default function GradingRequestSheet({ r, name, isAdmin, byName, onClose, onSaved }) {
  const status0 = r.coach_ok ? 'ok' : r.coach_not_ready ? 'notready' : 'waiting'
  const [status, setStatus] = useState(status0)
  const [coachNote, setCoachNote] = useState(r.coach_note || '')
  const [adminNote, setAdminNote] = useState(r.admin_note || '')
  const [approved, setApproved] = useState(!!r.coach_approved)
  const [busy, setBusy] = useState(false)

  async function save() {
    const patch = { coach_note: coachNote.trim() || null }
    if (status !== status0) {
      Object.assign(patch, status === 'ok' ? { coach_ok: true, coach_not_ready: false } : status === 'notready' ? { coach_ok: false, coach_not_ready: true } : { coach_ok: false, coach_not_ready: false },
        status === 'waiting' ? { coach_ok_by: null, coach_ok_at: null } : { coach_ok_by: byName, coach_ok_at: new Date().toISOString() })
    }
    if (status === 'notready' && !patch.coach_note) return alert('Add a short reason for "Not ready".')
    if (isAdmin) {
      patch.admin_note = adminNote.trim() || null
      if (approved !== !!r.coach_approved) Object.assign(patch, approved
        ? { coach_approved: true, coach_approved_by: byName, coach_approved_at: new Date().toISOString() }
        : { coach_approved: false, coach_approved_by: null, coach_approved_at: null })
    }
    setBusy(true)
    const { error } = await supabase.from('grading_expressions').update(patch).eq('id', r.id)
    setBusy(false)
    if (error) return alert('Could not save: ' + error.message)
    onSaved?.({ ...r, ...patch }); onClose()
  }

  const Btn = ({ k, label, col }) => (
    <button type="button" onClick={() => setStatus(k)} className="btn btn-sm"
      style={{ flex: 1, justifyContent: 'center', padding: 10, fontWeight: 700, borderColor: status === k ? col : undefined, background: status === k ? col + '22' : undefined, color: status === k ? col : undefined }}>{label}</button>
  )
  return createPortal(
    <div onClick={onClose} style={{ position: 'fixed', top: 0, left: 0, right: 0, height: 'calc(var(--kc-vh, 1vh) * 100)', zIndex: 600, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12 }}>
      <div className="card" onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 440, maxHeight: 'calc(var(--kc-vh, 1vh) * 90)', overflowY: 'auto', padding: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
          <b style={{ fontSize: 16 }}>{name}</b><button className="btn btn-sm" onClick={onClose}>✕</button>
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6 }}>{r.discipline} · {r.current_belt || '—'} → <span style={beltStyle(r.grading_for)}>{r.grading_for}</span>{r.grading_list ? ` · ${r.grading_list}` : ''}</div>
        <BbbcLine r={r} />

        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-tertiary)', margin: '12px 0 6px' }}>COACH</div>
        <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
          <Btn k="ok" label="✓ OK" col="#1D9E75" /><Btn k="notready" label="✗ Not ready" col="#E24B4A" /><Btn k="waiting" label="⏳ Waiting" col="#EF9F27" />
        </div>
        <textarea rows={2} value={coachNote} onChange={e => setCoachNote(e.target.value)} placeholder={status === 'notready' ? 'Why not ready? (e.g. needs more sessions)' : 'Coach note (optional)'} style={{ width: '100%', resize: 'vertical' }} />
        {r.coach_ok_by && <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Last set by {r.coach_ok_by}</div>}

        {isAdmin && (
          <>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-tertiary)', margin: '14px 0 6px' }}>ADMIN</div>
            <textarea rows={2} value={adminNote} onChange={e => setAdminNote(e.target.value)} placeholder="📌 Admin note (shown to the coach too)" style={{ width: '100%', resize: 'vertical', marginBottom: 8 }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ flex: 1, fontSize: 14 }}>{approved ? <b style={{ color: '#1D9E75' }}>✓ Approved{r.coach_approved && r.coach_approved_by ? ` · ${r.coach_approved_by}` : ''}</b> : <span style={{ color: 'var(--text-secondary)' }}>Not approved</span>}</span>
              {approved
                ? <button type="button" className="btn btn-sm" style={{ color: '#E24B4A', borderColor: '#E24B4A' }} onClick={() => setApproved(false)}>↩ Undo approval</button>
                : <button type="button" className="btn btn-sm" onClick={() => setApproved(true)}>✓ Approve</button>}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>Approving here doesn't send a message -- use Approve &amp; message in the list for that.</div>
          </>
        )}
        <button type="button" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', marginTop: 14, padding: 12 }} disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save'}</button>
      </div>
    </div>, document.body)
}
