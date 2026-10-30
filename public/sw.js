const CACHE_NAME = 'orbit-mission-control-v3';
const ASSETS = ['/', '/index.html', '/manifest.json', '/icon.svg', '/updating.html'];

// «أوربت يتلقّى تحديثاً» بدل صفحة Google الإنجليزية: أثناء النشر يتبدّل الخادم فتجيب
// واجهة Google بـ 500/502/503/504 لا يكتبها خادمنا. للتنقّل وحده (لا /api ولا غير
// GET ولا جواب ناجح) تُقدَّم الصفحة المحفوظة عند التثبيت، والرابط يبقى كما طُلب.
// لا يُحفظ جواب 5xx في أي ذاكرة هنا.
const UPDATING_PAGE = '/updating.html';
const isUpdatingStatus = (status) => status === 500 || status === 502 || status === 503 || status === 504;
const updatingResponse = async () => {
  const page = await caches.match(UPDATING_PAGE).catch(() => undefined);
  if (!page) return null;
  return new Response(await page.text(), {
    status: 503,
    statusText: 'Service Unavailable',
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Retry-After': '5', 'X-Orbit-Updating': '1' },
  });
};

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  if (event.request.url.includes('/api/')) return;
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).then(async (response) => {
        if (isUpdatingStatus(response.status)) return (await updatingResponse()) || response;
        return response;
      }).catch(async (error) => {
        // A dropped request while the device says it is online is the same deploy moment;
        // truly offline keeps the cached shell as before.
        if (self.navigator?.onLine !== false) { const page = await updatingResponse(); if (page) return page; }
        const cached = await caches.match(event.request);
        if (cached) return cached;
        throw error;
      })
    );
    return;
  }
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});

// Alerts: a new problem (or a recovery) in one of the programs.
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { data = {}; }
  event.waitUntil(self.registration.showNotification(data.title || 'أوربت', {
    body: data.body || '',
    tag: data.tag || 'orbit',
    icon: '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    dir: 'rtl',
    lang: 'ar',
    renotify: data.kind === 'problem',
    data: { url: data.url || '/' },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
    for (const client of windows) { if ('focus' in client) return client.focus(); }
    return self.clients.openWindow(target);
  }));
});
