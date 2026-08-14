// Minimal service worker -- exists purely to satisfy Chrome/Android's
// PWA installability requirement (a registered service worker with a
// fetch handler), NOT to provide offline support or caching.
//
// Every request is passed straight through to the network, exactly as
// if this file didn't exist. This is deliberate: it means there's no
// caching layer that could serve a stale, out-of-date version of the
// app -- every visit still always loads fresh from the server, so
// updates stay instant with zero risk of anyone getting stuck on an
// old version.

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('fetch', event => {
  event.respondWith(fetch(event.request))
})
