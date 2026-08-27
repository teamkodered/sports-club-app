// Minimal service worker -- exists purely to satisfy Chrome/Android's
// PWA installability requirement (a registered service worker with a
// fetch handler), NOT to provide offline support or caching.
//
// Deliberately does NOT call event.respondWith() at all. Registering
// the listener is enough to satisfy the installability check; actually
// intercepting every request and manually re-fetching it just adds a
// second place things can fail for no benefit (this is what caused
// "FetchEvent.respondWith received an error: TypeError: Load failed"
// for some people signing up -- a transient failure in the service
// worker's own fetch() call, most often seen on iOS Safari, killed the
// request entirely with no fallback). Leaving requests un-intercepted
// means the browser handles them exactly as if this file didn't exist,
// so there's nothing here left that can go wrong.

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('fetch', () => {
  // Intentionally empty -- not calling respondWith() lets every request
  // fall through to the network natively.
})

// Push notifications -- shows a system notification when the server
// sends one (coach logged something, moved up/down the league ladder,
// etc). Works even with the app fully closed, since this runs in the
// service worker rather than the page itself.
self.addEventListener('push', event => {
  let data = {}
  try { data = event.data ? event.data.json() : {} } catch { data = { title: 'KR Centre', body: event.data ? event.data.text() : '' } }
  const title = data.title || 'KR Centre'
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || '',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: { url: data.url || '/athlete-app' },
    })
  )
})

// Tapping the notification focuses an already-open tab if there is
// one, otherwise opens a new one at the relevant page.
self.addEventListener('notificationclick', event => {
  event.notification.close()
  const targetUrl = event.notification.data?.url || '/athlete-app'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if (client.url.includes(targetUrl) && 'focus' in client) return client.focus()
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl)
    })
  )
})
