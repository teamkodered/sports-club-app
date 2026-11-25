import { Link } from 'react-router-dom'
import { rememberCampaignFromLink, currentCampaignCode } from '../../lib/campaignCode.js'

// /join -- one link for referrals and campaigns: pick which class to join.
// The ?c=code from the link is remembered and passed on to the form.
export default function JoinChooser() {
  rememberCampaignFromLink()
  const code = currentCampaignCode()
  const q = code ? `?c=${code}` : ''
  const opts = [
    ['/join-pka-child', '🥋 Kids kickboxing', 'PKA kickboxing for children'],
    ['/join-pka-adult', '🥋 Adult kickboxing', 'PKA kickboxing for adults'],
    ['/join-krba', '🥊 Boxing', 'Kode Red Boxing Academy'],
  ]
  return (
    <div style={{ minHeight: '100vh', background: '#0B0D12', color: '#fff', padding: '40px 18px', fontFamily: 'Rajdhani, system-ui, sans-serif' }}>
      <div style={{ maxWidth: 460, margin: '0 auto', textAlign: 'center' }}>
        <img src="/kr-logo.png" alt="KR Centre" style={{ height: 90, marginBottom: 16 }} />
        <h1 style={{ fontFamily: '"Saira Condensed", sans-serif', fontStyle: 'italic', fontWeight: 800, fontSize: 34, margin: '0 0 6px' }}>JOIN KR CENTRE</h1>
        <p style={{ fontSize: 17, color: '#B8BECC', margin: '0 0 24px' }}>Which class would you like to join?</p>
        {opts.map(([to, title, sub]) => (
          <Link key={to} to={to + q} style={{ display: 'block', textDecoration: 'none', color: '#fff', background: '#161A24', border: '2px solid #FF3B3B', borderRadius: 14, padding: '18px 16px', marginBottom: 12, textAlign: 'left' }}>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{title}</div>
            <div style={{ fontSize: 15, color: '#B8BECC' }}>{sub}</div>
          </Link>
        ))}
        {code && <p style={{ fontSize: 14, color: '#8A91A0', marginTop: 16 }}>Code <b style={{ color: '#fff' }}>{code}</b> will be added to your form.</p>}
      </div>
    </div>
  )
}
