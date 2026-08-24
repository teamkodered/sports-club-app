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
