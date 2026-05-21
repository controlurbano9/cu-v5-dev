// ═══════════════════════════════════════════════════════════════
// v6/sw.js — Service Worker: cache de assets estáticos
// Estrategia: Network-first para JSX/JS, Cache-first para CDN.
// No cachea datos dinámicos (webhook AS).
// ═══════════════════════════════════════════════════════════════

const CACHE_NAME = 'cu-v6-cache-v43';

// Assets locales que se pre-cachean en install
const PRECACHE_URLS = [
  './',
  './index.html',
  './styles.css',
  './api.js',
  './logo.jpg',
  // JSX compilados por Babel en runtime — se cachean al primer fetch
];

// CDN que se cachean al primer uso (cache-first)
const CDN_PATTERNS = [
  'unpkg.com/react@',
  'unpkg.com/react-dom@',
  'unpkg.com/@babel/standalone',
  'cdnjs.cloudflare.com/ajax/libs/Turf.js',
  'unpkg.com/leaflet@',
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'tile.openstreetmap.org',
];

// Patrones que NUNCA se cachean (datos dinámicos)
const NO_CACHE_PATTERNS = [
  'script.google.com',
  'script.googleusercontent.com',
  'raw.githubusercontent.com',  // GeoJSONs POT (pueden actualizarse)
];

function isCDN(url) {
  return CDN_PATTERNS.some(p => url.includes(p));
}

function isNoCache(url) {
  return NO_CACHE_PATTERNS.some(p => url.includes(p));
}

// ── Install: pre-cachear assets esenciales ──
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

// ── Activate: limpiar caches viejos ──
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys
        .filter(k => k !== CACHE_NAME)
        .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: estrategia según tipo de recurso ──
self.addEventListener('fetch', event => {
  const url = event.request.url;

  // No interceptar requests dinámicos (webhook, POSTs)
  if (event.request.method !== 'GET' || isNoCache(url)) return;

  // CDN: cache-first (rara vez cambian, tienen hash en URL)
  if (isCDN(url)) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(response => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  // Assets locales: network-first con fallback a cache
  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
