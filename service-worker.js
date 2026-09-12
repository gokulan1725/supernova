/* ============================================================
   ShopNova — service-worker.js
   PWA Service Worker: Cache-first for assets, network-first for API
   ============================================================ */

const CACHE_NAME = 'shopnova-v2';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/products.html',
  '/product-detail.html',
  '/cart.html',
  '/checkout.html',
  '/wishlist.html',
  '/profile.html',
  '/order-tracking.html',
  '/login.html',
  '/search-results.html',
  '/bundles.html',
  '/css/main.css',
  '/css/components.css',
  '/css/animations.css',
  '/js/app.js',
  '/js/data.js',
  '/js/features.js',
  '/js/chat-widget.js',
  '/js/i18n.js',
  '/manifest.json'
];

const OFFLINE_PAGE = '/index.html';

/* ── Install: pre-cache static assets ───────────────────── */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('[SW] Pre-caching static assets');
      return cache.addAll(STATIC_ASSETS.map(url => new Request(url, { cache: 'reload' })))
        .catch(err => console.warn('[SW] Pre-cache partial fail:', err));
    }).then(() => self.skipWaiting())
  );
});

/* ── Activate: clean old caches ─────────────────────────── */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => {
      console.log('[SW] Activated, old caches cleared');
      self.clients.claim();
    })
  );
});

/* ── Fetch: strategy router ─────────────────────────────── */
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET, chrome-extension, and cross-origin except CDN fonts
  if (request.method !== 'GET') return;
  if (url.protocol === 'chrome-extension:') return;

  // API calls → Network-first (never cache)
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirst(request));
    return;
  }

  // Unsplash images → Cache-first with long TTL
  if (url.hostname.includes('unsplash.com') || url.hostname.includes('fonts.gstatic.com')) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // HTML pages → Stale-while-revalidate
  if (request.destination === 'document') {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  // CSS / JS / images → Cache-first
  event.respondWith(cacheFirst(request));
});

/* ── Strategy: Network First ─────────────────────────────── */
async function networkFirst(request) {
  try {
    const response = await fetch(request);
    return response;
  } catch {
    const cached = await caches.match(request);
    return cached || new Response(JSON.stringify({ success: false, error: 'Offline' }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

/* ── Strategy: Cache First ───────────────────────────────── */
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('Offline', { status: 503 });
  }
}

/* ── Strategy: Stale While Revalidate ───────────────────── */
async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  const networkPromise = fetch(request).then(response => {
    if (response.ok) cache.put(request, response.clone());
    return response;
  }).catch(() => cached || Response.error());

  return cached || networkPromise;
}

/* ── Push Notifications ─────────────────────────────────── */
self.addEventListener('push', event => {
  if (!event.data) return;
  const data = event.data.json();
  event.waitUntil(
    self.registration.showNotification(data.title || 'ShopNova', {
      body: data.body || 'You have a new notification',
      icon: 'https://via.placeholder.com/192x192/6C63FF/ffffff?text=SN',
      badge: 'https://via.placeholder.com/72x72/6C63FF/ffffff?text=SN',
      tag: data.tag || 'shopnova',
      data: { url: data.url || '/' },
      actions: [
        { action: 'view', title: 'View' },
        { action: 'dismiss', title: 'Dismiss' }
      ]
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  if (event.action === 'dismiss') return;
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then(clientList => {
      for (const client of clientList) {
        if (client.url.includes(url) && 'focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
