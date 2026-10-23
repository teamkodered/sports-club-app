import { useEffect, useState } from 'react'

// "📲 Install the app" -- Android/Chrome installs in one tap (the browser's install prompt);
// iPhone shows the Share -> Add to Home Screen steps. Hidden once installed or after "Not now".
const isStandalone = () => window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true
// which app this page installs (athlete app or the Klass Champ club app) -- each remembered separately
const appKey = () => /^\/(athlete|league-public|results-public)/.test(window.location.pathname) ? 'athlete' : 'club'
const markInstalled = () => { try { localStorage.setItem(`kc_installed_${appKey()}`, '1') } catch { /* */ } }
const knownInstalled = () => { try { return localStorage.getItem(`kc_installed_${appKey()}`) === '1' } catch { return false } }
// opened as the installed app -> remember it, so the browser stops offering the install
if (typeof window !== 'undefined' && (window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true)) markInstalled()
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

export default function InstallAppButton({ compact = false, subtitle }) {
  const [prompt, setPrompt] = useState(() => window.__kcInstallPrompt || null)
  const [hidden, setHidden] = useState(() => { try { return isStandalone() || knownInstalled() || localStorage.getItem(`kc_install_dismissed_${appKey()}`) === '1' } catch { return isStandalone() } })
  const [help, setHelp] = useState(false)
  useEffect(() => {
    const onPrompt = () => setPrompt(window.__kcInstallPrompt)
    const onInstalled = () => { markInstalled(); setHidden(true) }
    // Chrome can also tell us if this app is already on the phone
    navigator.getInstalledRelatedApps?.().then(list => { if (list?.length) { markInstalled(); setHidden(true) } }).catch(() => {})
    window.addEventListener('kc-install-ready', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => { window.removeEventListener('kc-install-ready', onPrompt); window.removeEventListener('appinstalled', onInstalled) }
  }, [])
  if (hidden) return null
  async function install() {
    if (prompt) {
      prompt.prompt()
      const choice = await prompt.userChoice.catch(() => null)
      window.__kcInstallPrompt = null; setPrompt(null)
      if (choice?.outcome === 'accepted') { markInstalled(); setHidden(true) }
      return
    }
    setHelp(true) // iPhone, or a browser without the one-tap prompt: show the steps
  }
  const notNow = () => { try { localStorage.setItem(`kc_install_dismissed_${appKey()}`, '1') } catch { /* */ } setHidden(true) }
  return (
    <div className="kc-install">
      <button type="button" className="kc-install-btn" onClick={install}>
        <span className="kc-install-icon">📲</span>
        <span className="kc-install-text">Install the app<small>{subtitle || (compact ? 'on your phone' : 'Open Klass Champ straight from your home screen')}</small></span>
      </button>
      <button type="button" className="kc-install-later" onClick={notNow}>Not now</button>
      {help && (
        <div role="dialog" aria-modal="true" onClick={() => setHelp(false)} style={{ position: 'fixed', inset: 0, zIndex: 600, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', padding: 16 }}>
          <div className="kc-install-help" onClick={e => e.stopPropagation()}>
            <div className="kc-install-help-title">📲 Install the app</div>
            {isIOS() ? (
              <ol>
                <li>Open this page in <b>Safari</b>.</li>
                <li>Tap <b>Share</b> <span style={{ fontSize: 18 }}>⬆</span> at the bottom of the screen.</li>
                <li>Scroll down and tap <b>Add to Home Screen</b>, then <b>Add</b>.</li>
              </ol>
            ) : (
              <ol>
                <li>Open this page in <b>Chrome</b>.</li>
                <li>Tap the <b>⋮</b> menu (top right).</li>
                <li>Tap <b>Install app</b> (or <b>Add to Home screen</b>), then <b>Install</b>.</li>
              </ol>
            )}
            <p style={{ fontSize: 12, opacity: 0.75, margin: '8px 0 12px' }}>The app icon appears on your home screen and opens straight into {/^\/athlete/.test(window.location.pathname) ? 'your athlete app' : 'the Klass Champ dashboard'}.</p>
            <button type="button" className="kc-install-btn" style={{ justifyContent: 'center' }} onClick={() => setHelp(false)}>Got it</button>
          </div>
        </div>
      )}
    </div>
  )
}
