// Campaign tracking for the join forms.
// A campaign link carries its code: /join-pka-child?c=summer25 (utm_campaign also works).
// The code is remembered on this phone / browser for 30 days, so someone who taps an ad,
// looks around and comes back later to fill the form in is still credited to that campaign.
const KEY = 'kc_campaign'
const KEEP_DAYS = 30

export const cleanCampaignCode = v => String(v || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 40)

// Call once when a join form opens: saves the code if the link has one.
export function rememberCampaignFromLink() {
  try {
    const p = new URLSearchParams(window.location.search)
    const code = cleanCampaignCode(p.get('c') || p.get('utm_campaign'))
    if (code) localStorage.setItem(KEY, JSON.stringify({ code, at: Date.now() }))
  } catch { /* private browsing etc. -- tracking is a nice-to-have, never blocks the form */ }
}

// The code to save with the application (or null)
export function currentCampaignCode() {
  try {
    const p = new URLSearchParams(window.location.search)
    const fromLink = cleanCampaignCode(p.get('c') || p.get('utm_campaign'))
    if (fromLink) return fromLink
    const saved = JSON.parse(localStorage.getItem(KEY) || 'null')
    if (saved?.code && Date.now() - saved.at < KEEP_DAYS * 864e5) return saved.code
  } catch { /* ignore */ }
  return null
}
