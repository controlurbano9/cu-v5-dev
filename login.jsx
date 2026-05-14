// ═══════════════════════════════════════════════════════════════
// v6/login.jsx — Pantalla de login con webhook real
// ═══════════════════════════════════════════════════════════════
const { useState, useEffect } = React;

function LoginScreen({ onLogin }) {
  const [inspectores, setInspectores] = useState([]);
  const [cargandoLista, setCargandoLista] = useState(true);
  const [nombre, setNombre] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [verificando, setVerificando] = useState(false);

  // Cargar inspectores activos al montar
  useEffect(() => {
    listarInspectoresActivos()
      .then(list => {
        setInspectores(list);
        setCargandoLista(false);
        // Pre-seleccionar último usado
        const last = localStorage.getItem('cu_ultimo_usuario');
        if (last && list.some(i => i.nombre === last)) setNombre(last);
      })
      .catch(e => {
        setCargandoLista(false);
        setError('No se pudo cargar la lista de inspectores');
      });
  }, []);

  async function manejarSubmit(e) {
    e.preventDefault();
    setError('');

    if (!nombre) { setError('Selecciona tu nombre'); return; }
    if (!pin || pin.length !== 4) { setError('El PIN debe tener 4 dígitos'); return; }

    // Bloqueo por intentos fallidos (mismas keys que app.js)
    const keyInt  = 'cu_intentos_'    + nombre.toUpperCase();
    const keyBloq = 'cu_bloqueado_'   + nombre.toUpperCase();
    const bloqHasta = parseInt(localStorage.getItem(keyBloq) || '0', 10);
    if (bloqHasta && Date.now() < bloqHasta) {
      const min = Math.ceil((bloqHasta - Date.now()) / 60000);
      setError(`Usuario bloqueado. Intenta en ${min} min.`);
      return;
    }

    setVerificando(true);
    try {
      const usuario = await login(nombre, pin);
      if (usuario) {
        localStorage.removeItem(keyInt);
        localStorage.removeItem(keyBloq);
        localStorage.setItem('cu_ultimo_usuario', usuario.usuario);
        SESSION_V6.guardar(usuario);
        registrarLog(usuario.usuario, 'Login V6');
        onLogin(usuario);
      } else {
        const intentos = parseInt(localStorage.getItem(keyInt) || '0', 10) + 1;
        localStorage.setItem(keyInt, intentos.toString());
        if (intentos >= 3) {
          localStorage.setItem(keyBloq, (Date.now() + 15 * 60 * 1000).toString());
          localStorage.removeItem(keyInt);
          setError('Demasiados intentos. Usuario bloqueado 15 minutos.');
        } else {
          setError(`PIN incorrecto. Intentos restantes: ${3 - intentos}`);
        }
        setPin('');
      }
    } catch (e) {
      setError('Error de conexión. Intenta de nuevo.');
    }
    setVerificando(false);
  }

  return (
    <div id="pantalla-login" style={{ display: 'flex' }}>
      <div className="login-logo">
        <img src="logo.jpg" alt="Alcaldía de Bello" />
      </div>
      <div className="login-titulo">Control Urbano</div>
      <div className="login-sub">Inspección N°9 · Alcaldía de Bello</div>

      <form className="login-form" onSubmit={manejarSubmit} autoComplete="on">
        <label htmlFor="login-nombre" className="sr-only">Inspector</label>
        <select
          id="login-nombre"
          name="username"
          className="login-input"
          autoComplete="username"
          value={nombre}
          onChange={e => setNombre(e.target.value)}
          disabled={cargandoLista}
          style={{
            appearance: 'none',
            backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23F5F1EB' d='M6 8L1 3h10z'/%3E%3C/svg%3E\")",
            backgroundRepeat: 'no-repeat',
            backgroundPosition: 'right 14px center',
            paddingRight: 36,
          }}>
          <option value="">
            {cargandoLista ? 'Cargando inspectores...' : 'Selecciona tu nombre'}
          </option>
          {inspectores.map(i => (
            <option key={i.nombre} value={i.nombre}>{i.nombre}</option>
          ))}
        </select>

        <label htmlFor="login-pin" className="sr-only">PIN</label>
        <input
          type="password"
          id="login-pin"
          name="password"
          className="login-input"
          placeholder="PIN de 4 dígitos"
          maxLength={4}
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="current-password"
          value={pin}
          onChange={e => setPin(e.target.value.replace(/\D/g, ''))}
        />

        <button type="submit" className="btn-login" disabled={verificando}>
          {verificando ? 'Verificando...' : 'Ingresar →'}
        </button>

        {error && (
          <div role="alert" style={{
            color: '#E89B85', fontSize: 12, textAlign: 'center', marginTop: 8,
          }}>{error}</div>
        )}
      </form>

      <div className="login-nota">Acceso restringido · Solo personal autorizado</div>
    </div>
  );
}

window.LoginScreen = LoginScreen;
