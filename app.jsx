// ═══════════════════════════════════════════════════════════════
// v6/app.jsx — Shell V6: router + header + nav con iconos + FAB
// Pestañas: Inspector → Inicio, Mis visitas, Buscar, Norma
//           Admin    → Inicio, Mis visitas, Buscar, Agenda, Norma
// Admin panel → botón ⚙ en header (no pestaña)
// ═══════════════════════════════════════════════════════════════
const { useState: useStateApp, useEffect: useEffectApp, useRef: useRefApp } = React;

// ═══════════════════════════════════════════════════════════════
// Precarga automática de tiles Google Maps para uso offline.
// Crea un mapa oculto (256×256, fuera de pantalla) y recorre la
// zona urbana de Bello a zoom 16 (satellite). El SW intercepta
// cada tile y lo cachea con estrategia cache-first.
// Se ejecuta UNA VEZ tras el login; localStorage guarda el flag.
// ═══════════════════════════════════════════════════════════════
var MAP_PRECACHE_KEY = 'cu_map_precache_v2'; // bumpar si cambia la grilla
var BELLO_BOUNDS = { north: 6.395, south: 6.300, west: -75.600, east: -75.510 };

// ═══════════════════════════════════════════════════════════════
// Pre-cache de capas POT + catastro al login.
// Garantiza que los GeoJSONs y el catastro.json estén en el caché del SW
// antes de que el inspector salga a campo sin señal. El SW usa estrategia
// stale-while-revalidate, así que estas peticiones también lo poblan.
// Una vez completado, se guarda flag en localStorage para no repetir.
// ═══════════════════════════════════════════════════════════════
var DATA_PRECACHE_KEY = 'cu_data_precache_v1'; // bumpar al cambiar la lista de capas
var POT_BASE_URL = 'https://raw.githubusercontent.com/controlurbano9/pot-bello/main/';
var CAPAS_POT_PRECACHE = [
  'ClasificacionSueloMunicipal.geojson',
  'Comunas.geojson',
  'SueloProteccion.geojson',
  'AmenazasNaturales.geojson',
  'Veredas.geojson',
  'RetirosCorrientesHidricas.geojson',
  'TratamientoUrbanistico.geojson',
  'DRMI_Quitasol_LaHolanda.geojson',
  'UsoGeneralSuelo.geojson',
  'Barrios.geojson',
  'Densidades.geojson',
];

async function _precacheDatos(onProgress) {
  // Total: capas POT + catastro
  var total = CAPAS_POT_PRECACHE.length + 1;
  var hecho = 0;

  // Capas POT: en paralelo, ignorando errores individuales.
  await Promise.all(CAPAS_POT_PRECACHE.map(function(capa) {
    return fetch(POT_BASE_URL + capa, { cache: 'reload' })
      .catch(function(e) { console.warn('[precache] ' + capa + ':', e.message); })
      .finally(function() { hecho++; onProgress(hecho, total); });
  }));

  // Catastro: archivo pesado (~37 MB) — fetch separado, ignorando errores.
  await fetch('catastro.json', { cache: 'reload' })
    .catch(function(e) { console.warn('[precache] catastro:', e.message); })
    .finally(function() { hecho++; onProgress(hecho, total); });

  try { localStorage.setItem(DATA_PRECACHE_KEY, 'done'); } catch (e) {}
}

function _precacheMapTiles(onProgress, onDone, cancelRef) {
  if (typeof google === 'undefined' || !google.maps) { onDone(false); return; }
  // Div oculto para el mapa de precarga
  var div = document.createElement('div');
  div.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:512px;height:512px;visibility:hidden;';
  document.body.appendChild(div);

  var map = new google.maps.Map(div, {
    center: { lat: 6.338, lng: -75.556 }, zoom: 16,
    mapTypeId: 'satellite', disableDefaultUI: true,
  });

  // Grilla de posiciones. A zoom 16 cada viewport de 512px cubre ~0.008° lat × ~0.011° lon
  var stepLat = 0.007, stepLon = 0.010;
  var posiciones = [];
  for (var la = BELLO_BOUNDS.south; la <= BELLO_BOUNDS.north; la += stepLat) {
    for (var lo = BELLO_BOUNDS.west; lo <= BELLO_BOUNDS.east; lo += stepLon) {
      posiciones.push({ lat: la, lng: lo });
    }
  }
  var total = posiciones.length;
  var idx = 0;

  function siguiente() {
    if (cancelRef && cancelRef.current) {
      document.body.removeChild(div);
      onDone(false);
      return;
    }
    if (idx >= total) {
      document.body.removeChild(div);
      try { localStorage.setItem(MAP_PRECACHE_KEY, 'done'); } catch(e) {}
      onDone(true);
      return;
    }
    map.setCenter(posiciones[idx]);
    idx++;
    onProgress(idx, total);
    // Esperar a que los tiles carguen, con timeout para red lenta
    var moved = false;
    google.maps.event.addListenerOnce(map, 'tilesloaded', function() {
      if (moved) return;
      moved = true;
      setTimeout(siguiente, 80);
    });
    // Fallback 4s si tilesloaded no dispara (offline parcial o error)
    setTimeout(function() { if (!moved) { moved = true; siguiente(); } }, 4000);
  }

  // Esperar a que el primer set de tiles cargue antes de empezar
  google.maps.event.addListenerOnce(map, 'tilesloaded', function() {
    setTimeout(siguiente, 200);
  });
}

// Componente flotante discreto que muestra progreso de precarga
function MapPrecacheIndicator({ progreso, total, completado, etiqueta, etiquetaDone, posicion }) {
  if (!progreso && !completado) return null;
  var pct = total ? Math.round(progreso / total * 100) : 0;
  var bottom = (posicion && posicion.bottom != null) ? posicion.bottom : 80;
  var right = (posicion && posicion.right != null) ? posicion.right : 16;
  return React.createElement('div', { style: {
    position: 'fixed', bottom: bottom, right: right, zIndex: 9000,
    background: completado ? '#e8f5e9' : 'white',
    border: '1px solid ' + (completado ? '#a5d6a7' : '#e0e0e0'),
    borderRadius: 10, padding: '8px 14px', fontSize: 11,
    boxShadow: '0 2px 12px rgba(0,0,0,0.12)', maxWidth: 240,
    transition: 'opacity 0.5s', opacity: 1,
    display: 'flex', flexDirection: 'column', gap: 4,
  }},
    React.createElement('div', { style: { fontWeight: 600, color: completado ? '#2e7d32' : '#333' } },
      completado
        ? (etiquetaDone || '✓ Mapa offline listo')
        : (etiqueta || '📥 Descargando mapa offline…')
    ),
    !completado && React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
      React.createElement('div', { style: {
        flex: 1, height: 3, borderRadius: 2, background: '#e0e0e0', overflow: 'hidden'
      }},
        React.createElement('div', { style: {
          width: pct + '%', height: '100%', background: '#1976d2', borderRadius: 2,
          transition: 'width 0.3s',
        }})
      ),
      React.createElement('span', { style: { color: '#888', whiteSpace: 'nowrap' } }, pct + '%')
    )
  );
}

// ── SVG icon paths (Heroicons outline 24×24) ──────────────────
const ICO = {
  home:     'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1',
  mis:      'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01m-.01 4h.01',
  buscar:   'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z',
  norma:    'M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z',
  agenda:   'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z',
  gear:     'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z',
  plus:     'M12 4v16m8-8H4',
};

function Ico({ d, size }) {
  return (
    <svg fill="none" viewBox="0 0 24 24" strokeWidth="1.7" stroke="currentColor"
      style={{ width: size || 22, height: size || 22, flexShrink: 0 }}>
      <path strokeLinecap="round" strokeLinejoin="round" d={d} />
    </svg>
  );
}

// ── Indicador de cola offline: muestra cuántas escrituras pendientes hay ──
// Se monta junto al banner offline; siempre visible si hay items en la cola
// (aún online, por si el flush periódico todavía no terminó).
function OfflineColaBadge() {
  const [count, setCount] = useStateApp(0);
  const [sincronizando, setSinc] = useStateApp(false);
  const [detalleAbierto, setDetalleAbierto] = useStateApp(false);
  const [items, setItems] = useStateApp([]);

  useEffectApp(() => {
    if (typeof offlineCount !== 'function') return;
    function actualizar() {
      offlineCount().then(setCount).catch(() => {});
      if (detalleAbierto && typeof offlineListar === 'function') {
        offlineListar().then(setItems).catch(() => {});
      }
    }
    actualizar();
    const off = (typeof offlineOnChange === 'function')
      ? offlineOnChange(actualizar) : null;
    return () => { if (off) off(); };
  }, [detalleAbierto]);

  async function sincronizarAhora() {
    if (sincronizando) return;
    if (!navigator.onLine) {
      appAlert('Sin conexión: no se puede sincronizar ahora. Se reintentará automáticamente.',
        { titulo: 'Cola offline' });
      return;
    }
    setSinc(true);
    try {
      const r = await offlineFlush();
      if (r.exito || r.fallo) {
        await appAlert(
          'Sincronización completada.\n\n' +
          '✓ Exitosos: ' + (r.exito || 0) + '\n' +
          (r.fallo ? '✕ Fallidos: ' + r.fallo + ' (quedan en cola para reintentar)' : ''),
          { titulo: 'Cola offline' });
      }
    } catch (e) {
      await appAlert('Error al sincronizar: ' + e.message, { titulo: 'Cola offline' });
    }
    setSinc(false);
  }

  if (!count) return null;

  return (
    <div style={{
      position: 'fixed', top: 60, right: 12, zIndex: 8500,
      background: '#fff7ed', border: '1px solid #fb923c',
      borderRadius: 10, padding: '8px 12px', fontSize: 12,
      boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
      maxWidth: 280, display: 'flex', flexDirection: 'column', gap: 6,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
        onClick={() => setDetalleAbierto(!detalleAbierto)}>
        <span style={{ fontSize: 14 }}>{sincronizando ? '🔄' : '↑'}</span>
        <span style={{ fontWeight: 600, color: '#9a3412' }}>
          {count} pendiente{count > 1 ? 's' : ''} de sincronizar
        </span>
        <span style={{ marginLeft: 'auto', color: '#9a3412', fontSize: 11 }}>
          {detalleAbierto ? '▲' : '▼'}
        </span>
      </div>
      {detalleAbierto && (
        <>
          <div style={{
            maxHeight: 180, overflowY: 'auto', fontSize: 11,
            background: 'white', borderRadius: 6, border: '1px solid #fed7aa',
            padding: 6,
          }}>
            {items.map(it => (
              <div key={it.id} style={{
                padding: '4px 6px', borderBottom: '1px dashed #fed7aa',
                display: 'flex', justifyContent: 'space-between', gap: 6,
              }}>
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {it.descripcion || it.tipo}
                </span>
                {it.intentos > 0 && (
                  <span style={{ color: '#dc2626', fontSize: 10 }}>×{it.intentos}</span>
                )}
              </div>
            ))}
            {items.length === 0 && (
              <div style={{ color: '#9a3412', textAlign: 'center', padding: 8 }}>
                Cargando lista...
              </div>
            )}
          </div>
          <button onClick={sincronizarAhora} disabled={sincronizando || !navigator.onLine} style={{
            background: navigator.onLine ? '#fb923c' : '#fed7aa',
            color: 'white', border: 'none', borderRadius: 6,
            padding: '6px 10px', fontSize: 11, fontWeight: 600,
            cursor: sincronizando || !navigator.onLine ? 'not-allowed' : 'pointer',
            fontFamily: 'inherit',
          }}>
            {sincronizando ? 'Sincronizando…' : (navigator.onLine ? 'Sincronizar ahora' : 'Sin conexión')}
          </button>
        </>
      )}
    </div>
  );
}

// ── Banner offline: detecta pérdida/recuperación de conexión ──
function OfflineBanner() {
  const [offline, setOffline] = useStateApp(!navigator.onLine);
  const [reconn, setReconn]   = useStateApp(false);

  useEffectApp(() => {
    const goOff = () => { setOffline(true); setReconn(false); document.body.classList.add('is-offline'); };
    const goOn  = () => {
      setReconn(true);
      setTimeout(() => { setOffline(false); setReconn(false); document.body.classList.remove('is-offline'); }, 1800);
    };
    window.addEventListener('offline', goOff);
    window.addEventListener('online',  goOn);
    if (!navigator.onLine) document.body.classList.add('is-offline');
    return () => {
      window.removeEventListener('offline', goOff);
      window.removeEventListener('online',  goOn);
    };
  }, []);

  if (!offline && !reconn) return null;

  return (
    <div className={'offline-banner' + (offline || reconn ? ' visible' : '')}>
      <span className="offline-dot" style={reconn ? { background: 'var(--verde)' } : undefined}></span>
      {reconn
        ? 'Conexión restablecida'
        : <>Sin conexión <span className="offline-reconn">— algunas funciones no estarán disponibles</span></>
      }
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
//   APP PRINCIPAL
// ══════════════════════════════════════════════════════════════
function AppV6() {
  const [usuario, setUsuario] = useStateApp(() => SESSION_V6.leer());
  const [pantalla, setPantalla] = useStateApp('home');
  const [contextoNueva, setContextoNueva] = useStateApp(null);
  const [winW, setWinW] = useStateApp(window.innerWidth);

  useEffectApp(() => {
    const onR = () => setWinW(window.innerWidth);
    window.addEventListener('resize', onR);
    return () => window.removeEventListener('resize', onR);
  }, []);

  // Vigilancia de expiración de sesión
  useEffectApp(() => {
    if (!usuario) return;
    const id = setInterval(() => {
      if (!SESSION_V6.leer()) { setUsuario(null); appAlert('Tu sesión ha expirado.', { titulo: 'Sesión expirada' }); }
    }, 60000);
    return () => clearInterval(id);
  }, [usuario]);

  // ── Precarga automática de capas POT + catastro tras login ──
  // Garantiza disponibilidad offline en la primera salida a campo.
  // No bloquea la UI; corre con delay 3s tras login.
  const [dataPrecache, setDataPrecache] = useStateApp(null); // null | {progreso, total} | 'done'
  useEffectApp(() => {
    if (!usuario) return;
    try { if (localStorage.getItem(DATA_PRECACHE_KEY) === 'done') return; } catch (e) {}
    if (!navigator.onLine) return;
    var cancelado = false;
    var timer = setTimeout(function() {
      if (cancelado) return;
      setDataPrecache({ progreso: 0, total: CAPAS_POT_PRECACHE.length + 1 });
      _precacheDatos(function(p, t) {
        if (!cancelado) setDataPrecache({ progreso: p, total: t });
      }).then(function() {
        if (cancelado) return;
        setDataPrecache('done');
        setTimeout(function() { if (!cancelado) setDataPrecache(null); }, 4000);
      });
    }, 3000);
    return function() { cancelado = true; clearTimeout(timer); };
  }, [usuario]);

  // ── Precarga automática de mapa offline (una vez tras login) ──
  // Solo corre si: hay usuario + hay conexión + localStorage no tiene 'done'
  // + no hay otro precache corriendo. Delay 5s para no competir con carga inicial.
  const [mapPrecache, setMapPrecache] = useStateApp(null); // null | {progreso, total} | 'done'
  const precacheCancelRef = useRefApp(false);
  const precacheRunningRef = useRefApp(false); // evita doble ejecución
  useEffectApp(() => {
    if (!usuario) return;
    // No repetir si ya se completó antes en este navegador
    try { if (localStorage.getItem(MAP_PRECACHE_KEY) === 'done') return; } catch(e) {}
    // No repetir si ya está en curso
    if (precacheRunningRef.current) return;
    // Necesita conexión y Google Maps cargado
    if (!navigator.onLine) return;
    // Delay 5s para no competir con la carga inicial de la app
    var timer = setTimeout(function() {
      if (typeof google === 'undefined' || !google.maps) return;
      if (precacheRunningRef.current) return;
      precacheRunningRef.current = true;
      precacheCancelRef.current = false;
      setMapPrecache({ progreso: 0, total: 1 });
      _precacheMapTiles(
        function(prog, tot) { setMapPrecache({ progreso: prog, total: tot }); },
        function(ok) {
          precacheRunningRef.current = false;
          if (ok) {
            setMapPrecache('done');
            setTimeout(function() { setMapPrecache(null); }, 4000);
          } else {
            setMapPrecache(null);
          }
        },
        precacheCancelRef
      );
    }, 5000);
    return function() { clearTimeout(timer); precacheCancelRef.current = true; };
  }, [usuario]);

  if (!usuario) {
    return <>
      <OfflineBanner />
      <OfflineColaBadge />
      <LoginScreen onLogin={u => { setUsuario(u); setPantalla('home'); }} />
      <ModalHost />
    </>;
  }

  const esAdmin = usuario.rol === 'ADMIN';
  const isDesktop = winW >= 900;

  function salir() {
    registrarLog(usuario.usuario, 'Logout V6');
    SESSION_V6.borrar();
    setUsuario(null);
  }

  function irNueva() {
    setContextoNueva(null);
    setPantalla('nueva-visita');
  }
  function irContinuar(fila, datos) {
    setContextoNueva({ fila, datos });
    setPantalla('nueva-visita');
  }

  // Pestañas según rol
  const tabs = [];
  tabs.push({ k: 'home',          label: 'Inicio',     ico: ICO.home });
  tabs.push({ k: 'mis-visitas',   label: 'Mis visitas', ico: ICO.mis });
  tabs.push({ k: 'buscar',        label: 'Buscar',     ico: ICO.buscar });
  if (esAdmin) tabs.push({ k: 'agenda', label: 'Agenda', ico: ICO.agenda });
  tabs.push({ k: 'consulta-norma', label: 'Norma',     ico: ICO.norma });

  const enFormulario = pantalla === 'nueva-visita';

  return (
    <div id="app-principal" style={{ display: 'block' }}>
      <OfflineBanner />
      <OfflineColaBadge />
      <div id="app-wrapper">
        {/* ── HEADER ── */}
        <div className="header">
          <div className="header-top">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <img src="logo.jpg" alt="Alcaldía de Bello" style={{
                width: 36, height: 36, borderRadius: 8, objectFit: 'contain',
                background: 'white', padding: 2, flexShrink: 0,
              }} />
              <div>
                <h1>Control Urbano · Insp. N°9</h1>
                <p>{usuario.usuario} · {usuario.cargo}</p>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {esAdmin && (
                <button type="button" onClick={() => setPantalla('admin')} title="Administración" style={{
                  background: pantalla === 'admin' ? 'var(--brand-bg)' : 'none',
                  border: pantalla === 'admin' ? '1px solid var(--brand-accent)' : '1px solid transparent',
                  borderRadius: 8, padding: 6, cursor: 'pointer',
                  color: pantalla === 'admin' ? 'var(--brand-accent)' : 'var(--texto-suave)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Ico d={ICO.gear} size={20} />
                </button>
              )}
              <button type="button" className="btn-logout" onClick={salir}>Salir</button>
            </div>
          </div>
        </div>

        {/* ── SIDEBAR DESKTOP ── */}
        {isDesktop && (
          <div id="sidebar-desktop" style={{ display: 'flex' }}>
            {tabs.map(t => (
              <SidebarBtn key={t.k} pantalla={pantalla} setPantalla={setPantalla}
                k={t.k} label={t.label} icoPath={t.ico} />
            ))}
            {esAdmin && <>
              <div className="sidebar-sep"></div>
              <SidebarBtn pantalla={pantalla} setPantalla={setPantalla}
                k="admin" label="Administración" icoPath={ICO.gear} />
            </>}
          </div>
        )}

        {/* ── CONTENT ── */}
        <div id="content-desktop">
          {pantalla === 'home' && <HomeScreen usuario={usuario}
            onNueva={irNueva} onContinuar={irContinuar} />}
          {pantalla === 'mis-visitas' && <MisVisitasScreen usuario={usuario}
            onNueva={irNueva} onContinuar={irContinuar} />}
          {pantalla === 'buscar' && <BuscarScreen usuario={usuario}
            onContinuar={irContinuar} />}
          {pantalla === 'agenda' && <AgendaScreen usuario={usuario} />}
          {pantalla === 'nueva-visita' && <NuevaVisitaScreen
            usuario={usuario}
            filaInicial={contextoNueva?.fila || null}
            datosIniciales={contextoNueva?.datos || null}
            onSalir={() => { setContextoNueva(null); setPantalla('home'); }} />}
          {pantalla === 'consulta-norma' && <ConsultaNormaScreen />}
          {pantalla === 'admin' && <AdminScreen usuario={usuario} />}
        </div>

        {/* ── NAV INFERIOR (móvil) ── */}
        {!isDesktop && !enFormulario && (
          <div id="nav-inferior" style={{ display: 'flex' }}>
            {tabs.map(t => (
              <BottomTab key={t.k} pantalla={pantalla} setPantalla={setPantalla}
                k={t.k} label={t.label} icoPath={t.ico} />
            ))}
          </div>
        )}

        {/* ── FAB "+" (nueva visita) ── */}
        {!enFormulario && (
          <button type="button" className="fab-nueva" onClick={irNueva}
            title="Nueva visita" aria-label="Nueva visita">
            <Ico d={ICO.plus} size={26} />
          </button>
        )}
      </div>

      <ModalHost />
      <InformeModalHost />
      <VisitaDetailModalHost />
      {/* Indicador flotante de precarga de mapa (discreto, esquina inferior) */}
      {mapPrecache && <MapPrecacheIndicator
        progreso={mapPrecache === 'done' ? 0 : mapPrecache.progreso}
        total={mapPrecache === 'done' ? 0 : mapPrecache.total}
        completado={mapPrecache === 'done'} />}
      {/* Indicador de precarga de capas POT + catastro (un poco más arriba para no solapar) */}
      {dataPrecache && <MapPrecacheIndicator
        progreso={dataPrecache === 'done' ? 0 : dataPrecache.progreso}
        total={dataPrecache === 'done' ? 0 : dataPrecache.total}
        completado={dataPrecache === 'done'}
        etiqueta="📥 Descargando POT + catastro…"
        etiquetaDone="✓ Datos offline listos"
        posicion={{ bottom: 140, right: 16 }} />}
    </div>
  );
}

// ── Botón sidebar desktop (icono + label horizontal) ──────────
function SidebarBtn({ pantalla, setPantalla, k, label, icoPath }) {
  const activo = pantalla === k;
  return (
    <button className={'sidebar-btn' + (activo ? ' activo' : '')} onClick={() => setPantalla(k)}>
      <Ico d={icoPath} size={18} />
      {label}
    </button>
  );
}

// ── Botón nav inferior móvil (icono arriba + label abajo) ─────
function BottomTab({ pantalla, setPantalla, k, label, icoPath }) {
  const activo = pantalla === k;
  return (
    <button onClick={() => setPantalla(k)} className={'bottom-tab' + (activo ? ' activo' : '')}>
      <Ico d={icoPath} size={20} />
      <span>{label}</span>
    </button>
  );
}

// Montar
ReactDOM.createRoot(document.getElementById('root')).render(<AppV6 />);
