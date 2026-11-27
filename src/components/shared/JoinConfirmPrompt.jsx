import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../../lib/supabase.js'
import { useAuth } from '../../hooks/useAuth.jsx'

// 🖨️ -> "Has X joined?" After a membership form is printed (for someone not yet active), the person who
// printed it (admin, or a coach with CRM) is asked: ✓ Yes = approve (active -> enquiry Joined),
// ✗ No = Not started (enquiry Not interested), ⏳ Wait / ✕ = a small reminder; it asks once more the next
// time the app opens, then drops it (the normal way still works).
const KEY = 'kc_join_confirm_waiting'
const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || '[]') } catch { return [] } }
const save = list => { try { localStorage.setItem(KEY, JSON.stringify(list)) } catch { /* */ } }

export default function JoinConfirmPrompt() {
  const { isAdmin, pageAccess, profile } = useAuth()
  const allowed = isAdmin || (pageAccess?.('crm') && pageAccess('crm') !== 'none')
  const [ask, setAsk] = useState(null)        // { member_id, name } being asked now
  const [waiting, setWaiting] = useState([])  // minimised reminders (this session)
  const [busy, setBusy] = useState(false)

  // on opening the app: reminders left from last time ask ONCE more
  useEffect(() => {
    if (!allowed || !profile?.id) return
    const mine = load().filter(x => x.by === profile.id)
    if (!mine.length) return
    const again = mine.filter(x => !x.askedAgain)
    save(load().filter(x => x.by !== profile.id).concat(again.map(x => ({ ...x, askedAgain: true }))))
    if (again.length) { setWaiting(again.slice(1)); setAsk(again[0]) }
  }, [allowed, profile?.id])

  useEffect(() => {
    if (!allowed) return
    const on = async e => {
      const { member_id, name } = e.detail || {}
      if (!member_id) return
      const { data: m } = await supabase.from('members').select('status, first_name, last_name').eq('id', member_id).maybeSingle()
      if (!m || m.status === 'active') return   // already joined -- nothing to ask
      setAsk({ member_id, name: name || `${m.first_name} ${m.last_name}`.trim(), by: profile?.id })
    }
    window.addEventListener('kc-membership-printed', on)
    return () => window.removeEventListener('kc-membership-printed', on)
  }, [allowed, profile?.id])

  if (!allowed) return null
  const drop = id => { save(load().filter(x => x.member_id !== id)); setWaiting(w => w.filter(x => x.member_id !== id)) }
  const next = () => setWaiting(w => { if (w.length) { setAsk(w[0]); return w.slice(1) } setAsk(null); return w })

  async function answer(kind) {
    const a = ask
    if (kind === 'wait') {
      const list = load().filter(x => x.member_id !== a.member_id)
      save([...list, { ...a, by: profile?.id, askedAgain: !!a.askedAgain }])
      setWaiting(w => [...w.filter(x => x.member_id !== a.member_id), a]); setAsk(null); return
    }
    setBusy(true)
    let error
    if (kind === 'yes') ({ error } = await supabase.from('members').update({ status: 'active' }).eq('id', a.member_id))   // -> enquiry Joined
    else {
      ({ error } = await supabase.from('members').update({ status: 'not_started' }).eq('id', a.member_id))
      if (!error) await supabase.from('enquiries').update({ status: 'not_interested', updated_at: new Date().toISOString() }).eq('linked_member_id', a.member_id).neq('status', 'joined')
    }
    setBusy(false)
    if (error) return alert('Could not update: ' + error.message)
    drop(a.member_id); next()
  }

  return createPortal(
    <>
      {ask && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, height: 'calc(var(--kc-vh, 1vh) * 100)', zIndex: 900, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div className="card" style={{ width: '100%', maxWidth: 380, padding: 18, position: 'relative' }}>
            <button type="button" onClick={() => answer('wait')} style={{ position: 'absolute', top: 10, right: 12, background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--text-secondary)' }} title="Ask me later">✕</button>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 4 }}>🖨️ Membership form printed{ask.askedAgain ? ' · reminder' : ''}</div>
            <h3 style={{ fontSize: 17, fontWeight: 700, margin: '0 0 6px' }}>Has {ask.name} joined?</h3>
            <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: '0 0 14px' }}>Yes approves them (their enquiry moves to Joined). No moves them to Not started. Wait asks you once more next time.</p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-primary" disabled={busy} style={{ flex: 1, justifyContent: 'center' }} onClick={() => answer('yes')}>✓ Yes</button>
              <button className="btn" disabled={busy} style={{ flex: 1, justifyContent: 'center', color: '#E24B4A', borderColor: '#E24B4A88' }} onClick={() => answer('no')}>✗ No</button>
              <button className="btn" disabled={busy} style={{ flex: 1, justifyContent: 'center' }} onClick={() => answer('wait')}>⏳ Wait</button>
            </div>
          </div>
        </div>
      )}
      {!ask && waiting.length > 0 && (
        <button type="button" onClick={() => { setAsk(waiting[0]); setWaiting(w => w.slice(1)) }}
          style={{ position: 'fixed', right: 14, bottom: 'calc(14px + env(safe-area-inset-bottom, 0px))', zIndex: 850, borderRadius: 20, padding: '8px 14px', border: '1px solid #EF9F27', background: '#1A1F24', color: '#EF9F27', fontWeight: 700, fontSize: 13, cursor: 'pointer', boxShadow: '0 4px 14px rgba(0,0,0,0.4)' }}>
          ⏳ {waiting.length} to confirm — {waiting[0].name} joined?
        </button>
      )}
    </>, document.body)
}
