// ═══════════════════════════════════════════════════════════════
// v6/app.jsx — Shell V6: router + header + sidebar/nav inferior
// Pantallas migradas: login, home, admin. El resto irá llegando.
// ═══════════════════════════════════════════════════════════════
const { useState: useStateApp, useEffect: useEffectApp, useRef: useRefApp } = React;

// ── Banner offline: detecta pérdida/recuperación de conexión ──
function OfflineBanner() {
  const [offline, setOffline] = useStateApp(!navigator.onLine);
  const [reconn, setReconn]   = useStateApp(false);

  useEffectApp(() => {
    const goOff = () => { setOffline(true); setReconn(false); document.body.classList.add('is-offline'); };
    const goOn  = () => {
      setReconn(true);
      // Mostrar "Reconectado" brevemente antes de ocultar
      setTimeout(() => { setOffline(false); setReconn(false); document.body.classList.remove('is-offline'); }, 1800);
    };
    window.addEventListener('offline', goOff);
    window.addEventListener('online',  goOn);
    // Estado inicial
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

function AppV6() {
  const [usuario, setUsuario] = useStateApp(() => SESSION_V6.leer());
  const [pantalla, setPantalla] = useStateApp('home');
  const [contextoNueva, setContextoNueva] = useStateApp(null); // { fila, datos } | null
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

  return (
    <div id="app-principal" style={{ display: 'block' }}>
      <OfflineBanner />
      <div id="app-wrapper">
        {/* HEADER */}
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
            <button type="button" className="btn-logout" onClick={salir}>Salir</button>
          </div>
        </div>

        {/* SIDEBAR DESKTOP */}
        {isDesktop && (
          <div id="sidebar-desktop" style={{ display: 'flex' }}>
            <NavBtn pantalla={pantalla} setPantalla={setPantalla} k="home" label="Inicio" />
            <NavBtn pantalla={pantalla} setPantalla={setPantalla} k="consulta-norma" label="Consultar norma" />
            {esAdmin && <NavBtn pantalla={pantalla} setPantalla={setPantalla} k="agenda" label="Agenda" />}
            {esAdmin && <NavBtn pantalla={pantalla} setPantalla={setPantalla} k="gestion" label="Gestión" />}
            {esAdmin && <>
              <div className="sidebar-sep"></div>
              <NavBtn pantalla={pantalla} setPantalla={setPantalla} k="admin" label="Administración" />
            </>}
          </div>
        )}

        {/* CONTENT */}
        <div id="content-desktop">
          {pantalla === 'home'  && <HomeScreen usuario={usuario}
            onNueva={() => { setContextoNueva(null); setPantalla('nueva-visita'); }}
            onContinuar={(fila, datos) => { setContextoNueva({ fila, datos }); setPantalla('nueva-visita'); }} />}
          {pantalla === 'agenda'  && <AgendaScreen usuario={usuario} />}
          {pantalla === 'gestion' && <GestionScreen usuario={usuario}
            onContinuar={(fila, datos) => { setContextoNueva({ fila, datos }); setPantalla('nueva-visita'); }} />}
          {pantalla === 'nueva-visita' && <NuevaVisitaScreen
            usuario={usuario}
            filaInicial={contextoNueva?.fila || null}
            datosIniciales={contextoNueva?.datos || null}
            onSalir={() => { setContextoNueva(null); setPantalla('home'); }} />}
          {pantalla === 'consulta-norma' && <ConsultaNormaScreen />}
          {pantalla === 'admin'   && <AdminScreen usuario={usuario} />}
        </div>

        {/* NAV INFERIOR (móvil) */}
        {!isDesktop && (
          <div id="nav-inferior" style={{ display: 'flex' }}>
            <BotomNav pantalla={pantalla} setPantalla={setPantalla} k="home" label="Inicio" />
            <BotomNav pantalla={pantalla} setPantalla={setPantalla} k="consulta-norma" label="Norma" />
            {esAdmin && <BotomNav pantalla={pantalla} setPantalla={setPantalla} k="agenda" label="Agenda" />}
            {esAdmin && <BotomNav pantalla={pantalla} setPantalla={setPantalla} k="gestion" label="Gestión" />}
            {esAdmin && <BotomNav pantalla={pantalla} setPantalla={setPantalla} k="admin" label="Admin" />}
          </div>
        )}
      </div>

      {/* Host de modales in-app (appConfirm / appAlert vía Promise) */}
      <ModalHost />
      {/* Host del generador F-GGO-43 en iframe (escritorio) */}
      <InformeModalHost />
    </div>
  );
}

function NavBtn({ pantalla, setPantalla, k, label }) {
  const activo = pantalla === k;
  return (
    <button className={'sidebar-btn' + (activo ? ' activo' : '')} onClick={() => setPantalla(k)}>
      {label}
    </button>
  );
}

function BotomNav({ pantalla, setPantalla, k, label }) {
  const activo = pantalla === k;
  return (
    <button onClick={() => setPantalla(k)} style={{
      flex: 1, background: 'none', border: 'none', padding: '10px 4px',
      fontFamily: 'inherit', fontSize: 11, fontWeight: 600,
      color: activo ? 'var(--brand-accent)' : 'var(--texto-suave)',
      borderTop: activo ? '2px solid var(--brand-accent)' : '2px solid transparent',
      cursor: 'pointer',
    }}>{label}</button>
  );
}

// Montar
ReactDOM.createRoot(document.getElementById('root')).render(<AppV6 />);
