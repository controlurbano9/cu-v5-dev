// ═══════════════════════════════════════════════════════════════
// v6/home.jsx — Pantalla Home con stats reales del webhook
// ═══════════════════════════════════════════════════════════════
const { useState: useStateH, useEffect: useEffectH } = React;

function HomeScreen({ usuario, onNueva, onIrAgenda }) {
  const [stats, setStats] = useStateH({ total: '—', pendientes: '—', hoy: '—' });
  const [agendaHoy, setAgendaHoy] = useStateH([]);
  const [cargando, setCargando] = useStateH(true);
  const [error, setError] = useStateH('');

  useEffectH(() => { cargar(); }, []);

  // forzar=true salta el caché (botón "Reintentar"). Al primer mount reusa caché
  // compartido con BuscarScreen, así no refetchea entre cambios de pantalla.
  async function cargar(forzar) {
    setCargando(true); setError('');
    try {
      const { datos } = await leerVisitas(forzar ? { forzar: true } : undefined);
      const esAdmin = usuario.rol === 'ADMIN';
      const mios = esAdmin ? datos : datos.filter(f => {
        const vis = (f['VISITADOR(ES)'] || f[17] || '').toUpperCase();
        const est = normalizarEstado(f['ESTADO VISITA'] || f[13] || '');
        return vis.includes(usuario.usuario.toUpperCase()) || est === 'PENDIENTE' || est === 'COMPLETADO';
      });
      const pendientes = mios.filter(f => {
        const e = normalizarEstado(f['ESTADO VISITA'] || f[13] || '');
        return e === 'PENDIENTE' || e === 'INICIADO';
      }).length;
      const hoyISO = new Date().toISOString().split('T')[0];
      const hoyAsig = mios.filter(f => {
        const e = normalizarEstado(f['ESTADO VISITA'] || f[13] || '');
        const fa = (f['FECHA ASIGNACION VISITA'] || '').toString().trim();
        return e === 'ASIGNADO' && fa.startsWith(hoyISO);
      });
      setStats({ total: mios.length, pendientes, hoy: hoyAsig.length });
      setAgendaHoy(hoyAsig.slice(0, 5));
    } catch (e) {
      setError('No se pudieron cargar las estadísticas');
    }
    setCargando(false);
  }

  return (
    <div className="pantalla activa pad-bottom">
      <div className="page-title" style={{ marginBottom: 16 }}>Resumen</div>

      <div className="stats-grid">
        <div className="stat-box">
          <div className="stat-num">{cargando ? '—' : stats.total}</div>
          <div className="stat-label">Registros</div>
        </div>
        <div className="stat-box">
          <div className="stat-num">{cargando ? '—' : stats.pendientes}</div>
          <div className="stat-label">Pendientes</div>
        </div>
        <div className="stat-box">
          <div className="stat-num">{cargando ? '—' : stats.hoy}</div>
          <div className="stat-label">Asignados hoy</div>
        </div>
      </div>

      {error && (
        <div className="card" style={{ color: 'var(--rojo)', fontSize: 13, marginTop: 12 }}>
          {error} · <button onClick={() => cargar(true)} style={{ background: 'none', border: 'none', color: 'var(--brand-accent)', cursor: 'pointer', textDecoration: 'underline' }}>Reintentar</button>
        </div>
      )}

      <button className="btn-principal verde" onClick={onNueva} style={{ marginTop: 16 }}>
        Nueva visita de campo
      </button>

      {agendaHoy.length > 0 && (
        <div className="agenda-hoy-card" style={{ marginTop: 20 }}>
          <div className="agenda-hoy-header">
            <span className="agenda-hoy-titulo">Agenda de hoy</span>
            <span style={{ fontSize: 11, color: 'var(--texto-suave)' }}>
              {agendaHoy.length} {agendaHoy.length === 1 ? 'visita' : 'visitas'}
            </span>
          </div>
          <div>
            {agendaHoy.map((v, i) => (
              <div key={v._idx || i} className="agenda-hoy-item" onClick={onIrAgenda}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>
                  {v['DIRECCION'] || 'Sin dirección'}
                </div>
                <div style={{ fontSize: 11, color: 'var(--texto-suave)', fontFamily: 'var(--font-mono)' }}>
                  {v['RADICADO'] || '—'} · {v['BARRIO'] || '—'}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

window.HomeScreen = HomeScreen;
