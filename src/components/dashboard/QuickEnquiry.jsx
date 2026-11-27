import { useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../../lib/supabase.js'

// 📞 Quick enquiry (Dashboard): name, number, note -- for while you're on a call or answering a text.
// Saves straight into CRM -> Enquiries (status Enquiry), same as "+ Log new enquiry".
const METHODS = [['call', '📞 Call'], ['text', '💬 Text'], ['facebook_ad', '📱 Social'], ['walk_in', '🚶 Walk-in']]
export default function QuickEnquiry({ onClose }) {
  const [f, setF] = useState({ name: '', phone: '', notes: '', method: 'call' })
  const [busy, setBusy] = useState(false), [done, setDone] = useState(null)
  const set = k => e => setF(x => ({ ...x, [k]: e.target.value }))
  async function save(again) {
    if (!f.name.trim() && !f.phone.trim()) return alert('Add a name or a number.')
    setBusy(true)
    const { data: { user } } = await supabase.auth.getUser()
    const { error } = await supabase.from('enquiries').insert({
      name: f.name.trim() || 'Unknown', contact_phone: f.phone.trim() || null, contact_method: f.method === 'walk_in' ? 'call' : f.method,
      enquiry_date: new Date().toISOString().split('T')[0], notes: [f.method === 'walk_in' ? 'Walk-in' : '', f.notes.trim()].filter(Boolean).join(' -- ') || null,
      status: 'not_started', created_by: user?.id || null,
    })
    setBusy(false)
    if (error) return alert('Could not save: ' + error.message)
    setDone(f.name.trim() || f.phone.trim())
    if (again) setF({ name: '', phone: '', notes: '', method: f.method }); else onClose()
  }
  const inp = { width: '100%', fontSize: 16, padding: '12px 12px', marginBottom: 10 }   // 16px = no zoom-in on iPhone
  return createPortal(
    <div onClick={onClose} style={{ position: 'fixed', top: 0, left: 0, right: 0, height: 'calc(var(--kc-vh, 1vh) * 100)', zIndex: 700, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div className="card" onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 460, borderRadius: '16px 16px 0 0', padding: '16px 16px calc(16px + env(safe-area-inset-bottom, 0px))', maxHeight: 'calc(var(--kc-vh, 1vh) * 92)', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}>
          <b style={{ flex: 1, fontSize: 17 }}>📞 Quick enquiry</b>
          <button type="button" className="btn btn-sm" onClick={onClose}>✕</button>
        </div>
        {done && <div style={{ fontSize: 13, color: '#1D9E75', marginBottom: 8 }}>✓ Saved {done} to Enquiries</div>}
        <input autoFocus value={f.name} onChange={set('name')} placeholder="Name (or child's name)" style={inp} />
        <input value={f.phone} onChange={set('phone')} placeholder="Phone number" type="tel" inputMode="tel" style={inp} />
        <textarea value={f.notes} onChange={set('notes')} placeholder="Note -- what they asked, age, class, trial date…" rows={3} style={{ ...inp, resize: 'vertical' }} />
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
          {METHODS.map(([k, l]) => (
            <button key={k} type="button" className={`btn btn-sm${f.method === k ? ' btn-primary' : ''}`} onClick={() => setF(x => ({ ...x, method: k }))}>{l}</button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="btn btn-primary" disabled={busy} style={{ flex: 2, justifyContent: 'center', padding: 14, fontSize: 15 }} onClick={() => save(false)}>{busy ? 'Saving…' : 'Save'}</button>
          <button type="button" className="btn" disabled={busy} style={{ flex: 1, justifyContent: 'center', padding: 14 }} onClick={() => save(true)}>Save + next</button>
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 8 }}>Goes into CRM → Enquiries as a new enquiry -- add more details there later.</div>
      </div>
    </div>, document.body)
}
