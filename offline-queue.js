// ═══════════════════════════════════════════════════════════════
// offline-queue.js — Cola de escrituras pendientes (IndexedDB)
//
// Cuando guardarVisita / subirFotoConDescripcion fallan por red,
// se encolan aquí en lugar de perderse. Al recuperar conexión
// (evento 'online' o flush manual) se reintentan en orden.
//
// API global (window):
//   offlineEnqueue(item)      → Promise<id>
//   offlineListar()           → Promise<Array>
//   offlineEliminar(id)      → Promise<void>
//   offlineCount()            → Promise<number>
//   offlineFlush()            → Promise<{exito, fallo}>
//   offlineOnChange(fn)       → unsubscribe
//   offlineOnItemSynced(fn)   → unsubscribe (evento por-item al sincronizar)
//
// Estructura de item:
//   {
//     id: <auto>, tipo: 'guardarVisita'|'subirFoto',
//     body: {...},           // payload completo para gasPost
//     descripcion: '...',    // texto para mostrar en UI
//     created: <timestamp>,
//     intentos: 0,
//     ultimoError: ''        // mensaje del último intento fallido
//   }
// ═══════════════════════════════════════════════════════════════

(function() {
  'use strict';

  const DB_NAME = 'cu_offline_v1';
  const DB_VERSION = 1;
  const STORE = 'queue';
  const MAX_INTENTOS = 5;

  let _dbPromise = null;
  function _abrirDB() {
    if (_dbPromise) return _dbPromise;
    _dbPromise = new Promise(function(resolve, reject) {
      if (!('indexedDB' in window)) {
        reject(new Error('IndexedDB no disponible en este navegador'));
        return;
      }
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function() {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const store = db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
          store.createIndex('created', 'created', { unique: false });
        }
      };
      req.onsuccess = function() { resolve(req.result); };
      req.onerror   = function() { reject(req.error); };
    });
    return _dbPromise;
  }

  function _tx(modo) {
    return _abrirDB().then(function(db) {
      const tx = db.transaction(STORE, modo);
      return tx.objectStore(STORE);
    });
  }

  // ── Listeners para notificar a la UI cuando cambia la cola ──
  const _listeners = new Set();
  function _emitirCambio() {
    _listeners.forEach(function(fn) { try { fn(); } catch (e) {} });
  }

  function offlineOnChange(fn) {
    _listeners.add(fn);
    return function() { _listeners.delete(fn); };
  }

  // ── Listeners para notificar cuando un item individual se sincroniza ──
  const _itemListeners = new Set();
  function _emitirItemSincronizado(item, resultado) {
    _itemListeners.forEach(function(fn) {
      try { fn({ id: item.id, tipo: item.tipo, resultado: resultado }); } catch (e) {}
    });
  }
  function offlineOnItemSynced(fn) {
    _itemListeners.add(fn);
    return function() { _itemListeners.delete(fn); };
  }

  // ── Operaciones CRUD ──
  async function offlineEnqueue(item) {
    const store = await _tx('readwrite');
    const registro = Object.assign({
      created: Date.now(),
      intentos: 0,
      ultimoError: '',
    }, item);
    return new Promise(function(resolve, reject) {
      const req = store.add(registro);
      req.onsuccess = function() {
        console.log('[offline-queue] encolado #' + req.result, registro.tipo, '-', registro.descripcion);
        _emitirCambio();
        _registrarBgSync();   // pedir al SW que reintente cuando vuelva la red, aunque la pestaña esté cerrada
        resolve(req.result);
      };
      req.onerror = function() { reject(req.error); };
    });
  }

  // Background Sync: cuando la pestaña se cierra, el SW puede seguir
  // reintentando al recuperar conexión. Si el browser no lo soporta,
  // confiamos en el flush periódico mientras la app esté abierta.
  function _registrarBgSync() {
    if (!('serviceWorker' in navigator)) return;
    if (!navigator.serviceWorker.ready) return;
    navigator.serviceWorker.ready.then(function(reg) {
      if (!reg.sync) return;   // BackgroundSync no soportado (Safari, FF)
      reg.sync.register('cu-flush-cola').catch(function(e) {
        console.warn('[offline-queue] no se pudo registrar bg-sync:', e.message);
      });
    }).catch(function() {});
  }

  async function offlineListar() {
    const store = await _tx('readonly');
    return new Promise(function(resolve, reject) {
      const req = store.getAll();
      req.onsuccess = function() {
        const lista = (req.result || []).slice().sort(function(a, b) {
          return a.created - b.created;
        });
        resolve(lista);
      };
      req.onerror = function() { reject(req.error); };
    });
  }

  async function offlineEliminar(id) {
    const store = await _tx('readwrite');
    return new Promise(function(resolve, reject) {
      const req = store.delete(id);
      req.onsuccess = function() { _emitirCambio(); resolve(); };
      req.onerror   = function() { reject(req.error); };
    });
  }

  async function offlineActualizar(item) {
    const store = await _tx('readwrite');
    return new Promise(function(resolve, reject) {
      const req = store.put(item);
      req.onsuccess = function() { _emitirCambio(); resolve(); };
      req.onerror   = function() { reject(req.error); };
    });
  }

  async function offlineCount() {
    const store = await _tx('readonly');
    return new Promise(function(resolve, reject) {
      const req = store.count();
      req.onsuccess = function() { resolve(req.result || 0); };
      req.onerror   = function() { reject(req.error); };
    });
  }

  // ── Flush: reintenta cada item en orden ──
  // Si la red vuelve a caer a media, rompe el loop y deja el resto encolado.
  // Errores no-de-red (validación AS) se cuentan como intento; tras MAX_INTENTOS
  // el item queda marcado pero no bloquea el resto.
  let _flushPromise = null;
  function offlineFlush() {
    if (_flushPromise) return _flushPromise;
    if (!navigator.onLine) return Promise.resolve({ exito: 0, fallo: 0, omitido: 'sin conexión' });

    _flushPromise = (async function() {
      let exito = 0, fallo = 0;
      try {
        const items = await offlineListar();
        for (const item of items) {
          if (!navigator.onLine) { console.log('[offline-queue] perdió conexión a media flush'); break; }
          if ((item.intentos || 0) >= MAX_INTENTOS) {
            console.warn('[offline-queue] item #' + item.id + ' excedió MAX_INTENTOS, omitido');
            continue;
          }
          try {
            const resultado = await _ejecutarItem(item);
            _emitirItemSincronizado(item, resultado);
            await offlineEliminar(item.id);
            exito++;
            console.log('[offline-queue] sincronizado #' + item.id);
          } catch (e) {
            // Si fue por red, salimos del bucle y reintentamos en el próximo flush
            if (_esErrorDeRed(e)) {
              console.warn('[offline-queue] red caída a media flush, deteniendo');
              break;
            }
            // Error persistente (validación AS): registramos y seguimos con el resto
            item.intentos = (item.intentos || 0) + 1;
            item.ultimoError = (e && e.message) || String(e);
            await offlineActualizar(item);
            fallo++;
            console.warn('[offline-queue] item #' + item.id + ' falló (' + item.intentos + '/' + MAX_INTENTOS + '):', item.ultimoError);
          }
        }
      } finally {
        _flushPromise = null;
        // Invalidar caché de visitas para que la próxima lectura traiga lo recién sincronizado.
        if (exito > 0 && typeof invalidarCache === 'function') {
          try { invalidarCache('visitas'); } catch (e) {}
        }
        _emitirCambio();
      }
      return { exito: exito, fallo: fallo };
    })();
    return _flushPromise;
  }

  async function _ejecutarItem(item) {
    // gasPost vive en api.js y ya está en window.
    if (typeof gasPost !== 'function') {
      throw new Error('gasPost no disponible');
    }
    switch (item.tipo) {
      case 'guardarVisita':
      case 'subirFoto':
      case 'gasPost':           // genérico por si encolamos otras acciones
        return await gasPost(item.body);
      default:
        throw new Error('Tipo de cola desconocido: ' + item.tipo);
    }
  }

  // ── Helper público: ¿es error de red? ──
  // Lo exportamos para que api.js pueda decidir si encolar o relanzar.
  function _esErrorDeRed(e) {
    if (!navigator.onLine) return true;
    const m = (e && e.message) || '';
    return /failed to fetch|networkerror|network error|load failed|aborted|timeout/i.test(m);
  }

  // ── Auto-flush ──
  // 1. Al recuperar conexión.
  // 2. Cada 60s mientras la app está abierta y online.
  // 3. ~2s después de cargar la app (por si hay cola previa de una sesión anterior).
  // 4. Cuando el SW notifica que sincronizó la cola en background.
  window.addEventListener('online', function() {
    console.log('[offline-queue] online → flush');
    offlineFlush();
  });
  setInterval(function() {
    if (navigator.onLine) offlineFlush();
  }, 60000);
  window.addEventListener('load', function() {
    setTimeout(function() { if (navigator.onLine) offlineFlush(); }, 2000);
  });

  // Si el SW procesó la cola en segundo plano (con pestaña cerrada),
  // al volver a abrir la app sus mensajes nos llegan aquí.
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', function(e) {
      if (e.data && e.data.type === 'OFFLINE_COLA_SYNCED') {
        console.log('[offline-queue] SW notificó sync completado');
        if (typeof invalidarCache === 'function') {
          try { invalidarCache('visitas'); } catch (err) {}
        }
        _emitirCambio();
      }
    });
  }

  // ── Export ──
  Object.assign(window, {
    offlineEnqueue: offlineEnqueue,
    offlineListar: offlineListar,
    offlineEliminar: offlineEliminar,
    offlineCount: offlineCount,
    offlineFlush: offlineFlush,
    offlineOnChange: offlineOnChange,
    offlineOnItemSynced: offlineOnItemSynced,
    _offlineEsErrorDeRed: _esErrorDeRed,
  });
})();
