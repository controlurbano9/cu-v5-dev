// ═══════════════════════════════════════════════════════════════
// v6/sw.js — Service Worker: cache de assets estáticos
// Estrategia: Network-first para JSX/JS, Cache-first para CDN.
// No cachea datos dinámicos (webhook AS).
// ═══════════════════════════════════════════════════════════════

const CACHE_NAME = 'cu-v6-cache-v68';

// URL del webhook unificado de Apps Script (espejo de api.js CFG.webhook).
// Hardcoded aquí porque el SW no puede importar api.js. Si cambia el deploy
// de Apps Script, actualizar también en api.js.
const WEBHOOK_URL = 'https://script.google.com/macros/s/AKfycbzKgiwc4AWAvNMMYWwU2Q0ir1V6R9GVbjQo7w2W4AowU9--0_IdJc6dSH8enBil54jr3w/exec';

// IndexedDB compartida con offline-queue.js — mismo nombre/version/store.
const IDB_NAME = 'cu_offline_v1';
const IDB_VERSION = 1;
const IDB_STORE = 'queue';
const MAX_INTENTOS = 5;

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
  // '@babel/standalone' eliminado: bundle.min.js viene pre-transpilado
  'cdnjs.cloudflare.com/ajax/libs/Turf.js',
  'unpkg.com/leaflet@',
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'tile.openstreetmap.org',
  // Google Maps tiles (satellite + hybrid + roads)
  'khms0.googleapis.com', 'khms1.googleapis.com',
  'khms2.googleapis.com', 'khms3.googleapis.com',
  'mt0.googleapis.com', 'mt1.googleapis.com',
  'mt2.googleapis.com', 'mt3.googleapis.com',
  'maps.gstatic.com',
  // Google Maps JS SDK — sin esto el mapa no carga offline
  'maps.googleapis.com/maps/api/js',
  'maps.googleapis.com/maps-api-v3',
];

// Patrones stale-while-revalidate: sirven caché instantáneo y refrescan
// en segundo plano. Para datos que pueden cambiar pero deben estar
// disponibles offline (capas POT, catastro).
const SWR_PATTERNS = [
  'raw.githubusercontent.com/controlurbano9/pot-bello',  // GeoJSONs POT
  '/catastro.json',                                       // Catastro 2026 (37 MB)
];

// Patrones que NUNCA se cachean (datos dinámicos del webhook)
const NO_CACHE_PATTERNS = [
  'script.google.com',
  'script.googleusercontent.com',
];

function isCDN(url) {
  return CDN_PATTERNS.some(p => url.includes(p));
}

function isSWR(url) {
  return SWR_PATTERNS.some(p => url.includes(p));
}

function isNoCache(url) {
  return NO_CACHE_PATTERNS.some(p => url.includes(p));
}

// ═══════════════════════════════════════════════════════════════
// Background Sync: reintenta la cola offline incluso con pestaña cerrada.
// El navegador dispara el evento 'sync' cuando recupera conexión.
// ═══════════════════════════════════════════════════════════════

function _idbAbrir() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onupgradeneeded = () => {
      // No crear store aquí — offline-queue.js lo crea desde la pestaña.
      // Si el SW corre antes que el cliente, el sync simplemente no encontrará items.
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

async function _idbListar() {
  let db;
  try { db = await _idbAbrir(); }
  catch (e) { return []; }
  if (!db.objectStoreNames.contains(IDB_STORE)) return [];
  return new Promise((resolve) => {
    const tx = db.transaction(IDB_STORE, 'readonly');
    const req = tx.objectStore(IDB_STORE).getAll();
    req.onsuccess = () => {
      const lista = (req.result || []).slice().sort((a, b) => a.created - b.created);
      resolve(lista);
    };
    req.onerror = () => resolve([]);
  });
}

async function _idbEliminar(id) {
  const db = await _idbAbrir();
  if (!db.objectStoreNames.contains(IDB_STORE)) return;
  return new Promise((resolve) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    const req = tx.objectStore(IDB_STORE).delete(id);
    req.onsuccess = () => resolve();
    req.onerror   = () => resolve();
  });
}

async function _idbActualizar(item) {
  const db = await _idbAbrir();
  if (!db.objectStoreNames.contains(IDB_STORE)) return;
  return new Promise((resolve) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    const req = tx.objectStore(IDB_STORE).put(item);
    req.onsuccess = () => resolve();
    req.onerror   = () => resolve();
  });
}

// gasPost mínimo replicado para el SW (sin acceso a api.js).
async function _swGasPost(body) {
  const r = await fetch(WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const d = await r.json();
  if (!d.ok) throw new Error(d.error || 'Apps Script error');
  return d;
}

function _esErrorDeRedSW(e) {
  const m = (e && e.message) || '';
  return /failed to fetch|networkerror|network error|load failed|aborted|timeout/i.test(m);
}

// Procesa la cola completa, devuelve true si todo se sincronizó.
async function _swFlushCola() {
  const items = await _idbListar();
  if (!items.length) return true;
  console.log('[sw-sync] procesando', items.length, 'items en cola');
  for (const item of items) {
    if ((item.intentos || 0) >= MAX_INTENTOS) continue;
    try {
      await _swGasPost(item.body);
      await _idbEliminar(item.id);
      console.log('[sw-sync] sincronizado #' + item.id);
    } catch (e) {
      if (_esErrorDeRedSW(e)) {
        // Sin red: relanzar para que BackgroundSync reintente más tarde.
        throw e;
      }
      // Error persistente: contar intento pero no bloquear el resto.
      item.intentos = (item.intentos || 0) + 1;
      item.ultimoError = (e && e.message) || String(e);
      await _idbActualizar(item);
    }
  }
  // Notificar a cualquier cliente abierto (para que refresque badge / lista de visitas).
  const clientes = await self.clients.matchAll({ includeUncontrolled: true });
  clientes.forEach(c => c.postMessage({ type: 'OFFLINE_COLA_SYNCED' }));
  return true;
}

self.addEventListener('sync', event => {
  if (event.tag === 'cu-flush-cola') {
    console.log('[sw-sync] evento sync recibido');
    event.waitUntil(_swFlushCola());
  }
});

// ── Mensajes del cliente: SKIP_WAITING para activar SW nuevo sin esperar ──
// index.html hace reg.waiting.postMessage({type:'SKIP_WAITING'}); este
// listener lo recibe y promueve el SW pendiente a active de inmediato.
// Sin esto, los bumps de CACHE_NAME y ?v= no se reflejan en la pestaña
// hasta que el usuario cierre todas las ventanas.
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

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

  // SWR: sirve caché si existe + refresca en background.
  // Para GeoJSONs POT y catastro.json: imprescindible que estén disponibles
  // offline, pero también deben actualizarse cuando llegan cambios.
  if (isSWR(url)) {
    event.respondWith(
      caches.open(CACHE_NAME).then(cache =>
        cache.match(event.request).then(cached => {
          const fetched = fetch(event.request).then(response => {
            if (response.ok) cache.put(event.request, response.clone());
            return response;
          }).catch(() => cached);  // sin red: usa el cached existente
          return cached || fetched;
        })
      )
    );
    return;
  }

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
