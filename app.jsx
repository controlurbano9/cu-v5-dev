// ═══════════════════════════════════════════════════════════════
// v6/app.jsx — Shell V6: router + header + nav con iconos + FAB
// Pestañas: Inspector → Inicio, Mis visitas, Buscar, Norma
//           Admin    → Inicio, Mis visitas, Buscar, Agenda, Norma
// Admin panel → botón ⚙ en header (no pestaña)
// ═══════════════════════════════════════════════════════════════
const { useState: useStateApp, useEffect: useEffectApp, useRef: useRefApp } = React;

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

  if (!usuario) {
    return <>
      <OfflineBanner />
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
