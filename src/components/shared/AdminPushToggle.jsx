import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase.js'
import { useAuth } from '../../hooks/useAuth.jsx'

// 🔔 Admin: turn on phone notifications for this device (new enquiries, birthdays today).
// Saves this device's push subscription against the admin's own member record -- the same
// push system the athlete app uses. Needed once per phone / PC.
const VAPID_PUBLIC_KEY = 'BFx43dN_KrP2jDPB0X8YL3hhRoFiocwTaEKFYGwaUmFcRUnF6kFNTyFs3r61t0o6r3prkVOQQ2WMmDpE4yaqgRI'
const KEY = 'kc_admin_push_on'
function toKey(b64) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4)
  const raw = window.atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)))
}
const supported = () => typeof Notification !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window

export default function AdminPushToggle() {
  const { isAdmin, profile } = useAuth()
  const [on, setOn] = useState(false)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (!supported() || !profile?.id) return
    let saved = null
    try { saved = localStorage.getItem(KEY) } catch { /* ignore */ }
    navigator.serviceWorker.ready.then(reg => reg.pushManager.getSubscription())
      .then(sub => setOn(!!sub && Notification.permission === 'granted' && saved === profile.id)).catch(() => {})
  }, [profile?.id])
  if (!isAdmin || !supported() || !profile?.id) return null

  async function turnOn() {
    setBusy(true)
    try {
      const perm = await Notification.requestPermission()
      if (perm !== 'granted') { alert('Notifications are blocked for this app. Allow them in the phone\u2019s settings for this app / site, then try again.'); setBusy(false); return }
      const reg = await navigator.serviceWorker.ready
      const sub = (await reg.pushManager.getSubscription()) || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(VAPID_PUBLIC_KEY) })
      const j = sub.toJSON()
      const { data, error } = await supabase.from('push_subscriptions')
        .upsert({ member_id: profile.id, endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth }, { onConflict: 'endpoint' }).select()
      if (error || !data?.length) throw new Error(error?.message || 'Not saved (has supabase_admin_notifications.sql been run?)')
      try { localStorage.setItem(KEY, profile.id) } catch { /* ignore */ }
      setOn(true)
      reg.showNotification('🔔 Notifications are on', { body: "You'll get new enquiries and birthdays on this device.", icon: '/icon-192.png', data: { url: '/crm' } })
    } catch (e) { alert("Couldn't turn notifications on: " + e.message) }
    setBusy(false)
  }

  return on
    ? <span style={{ fontSize: 13, color: '#1D9E75', fontWeight: 600 }} title="New enquiries and birthdays come to this device">🔔 Notifications on</span>
    : <button className="btn btn-sm" disabled={busy} onClick={turnOn}>{busy ? 'Turning on…' : '🔔 Turn on notifications'}</button>
}
