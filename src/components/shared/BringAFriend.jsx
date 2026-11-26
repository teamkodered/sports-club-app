import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase.js'

// 🤝 Athlete app: the member's own "bring a friend" code + share link.
// When a friend joins with it and is approved, it's credited to this member (shown as a count).
export default function BringAFriend({ memberId, tile = false }) {
  const [code, setCode] = useState(null)
  const [count, setCount] = useState(0)
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!memberId) return
    supabase.from('members').select('referral_code').eq('id', memberId).maybeSingle().then(({ data }) => setCode(data?.referral_code || null))
    supabase.from('referrals').select('id').eq('referrer_member_id', memberId).then(({ data }) => setCount(data?.length || 0))
  }, [memberId])
  if (!code) return null
  const link = `${window.location.origin}/join?c=${code}&i=kr`   // &i=kr: a new link address, so WhatsApp etc fetch the new KR preview instead of their saved PKA one
  const text = `Come and train with me at KR Centre! Use my code ${code} when you join: ${link}`
  async function share() {
    try {
      if (navigator.share) { await navigator.share({ title: 'Join me at KR Centre', text }); return }
    } catch { return }   // share sheet closed
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1800) } catch { prompt('Copy this:', text) }
  }
  if (tile) return (   // home: a tile beside Settings -- tap to share the code
    <button type="button" onClick={share} className="neon-tile" style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '14px 8px', background: '#1D9E7512',
      border: '1px solid #1D9E7530', borderRadius: 'var(--border-radius-lg)', cursor: 'pointer', fontFamily: 'var(--font-sans)' }}>
      <span className="neon-emoji" style={{ fontSize: 24 }}>🤝</span>
      <span className="kc-baf">{copied ? '✓ Copied' : 'Bring a friend'}<small className="kc-baf-code">Code {code}{count > 0 ? ` · ${count} joined` : ''}</small></span>
    </button>
  )
  return (
    <div className="card" style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      <div style={{ flex: 1, minWidth: 180 }}>
        <div style={{ fontSize: 15, fontWeight: 700 }}>🤝 Bring a friend</div>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
          Your code: <b style={{ color: 'var(--text)', letterSpacing: 1 }}>{code}</b>
          {count > 0 && <> · <span style={{ color: '#1D9E75', fontWeight: 600 }}>{count} {count === 1 ? 'friend has' : 'friends have'} joined 🙌</span></>}
        </div>
      </div>
      <button className="btn btn-sm btn-primary" onClick={share}>{copied ? '✓ Copied' : 'Share'}</button>
    </div>
  )
}
