// ═══════════════════════════════════════════════════════════════
// v6/home.jsx — Pantalla Inicio: dashboard tipo Asana
//   - Estadísticas compactas (2×2)
//   - Alertas urgentes (audiencia en ≤3 días hábiles, +5 días sin completar)
//   - Solo visitas asignadas hoy (iniciables desde aquí)
// ═══════════════════════════════════════════════════════════════
const { useState: useStateH, useEffect: useEffectH, useMemo: useMemoH } = React;

function HomeScreen({ usuario, onNueva, onContinuar }) {
  const [datos, setDatos] = useStateH([]);
  const [cargando, setCargando] = useStateH(true);
  const [error, setError] = useStateH('');

  const esAdmin = usuario.rol === 'ADMIN';
  const miNombre = usuario.usuario.toUpperCase();

  useEffectH(() => { cargar(); }, []);

  async function cargar(forzar) {
    setCargando(true); setError('');
    try {
      const { datos: all } = await leerVisitas(forzar ? { forzar: true } : undefined);
      setDatos(all);
    } catch (e) { setError(e.message); }
    setCargando(false);
  }

  // ── Estadísticas generales ──
  const stats = useMemoH(() => {
    if (!datos.length) return { pendientes: 0, mes: 0, asigHoy: 0, realHoy: 0 };
    const hoyStr = hoyDDMMAAAA();
    const hoy = new Date();
    const mesActual = hoy.getMonth();
    const anioActual = hoy.getFullYear();

    let pendientes = 0, mes = 0, asigHoy = 0, realHoy = 0;
    datos.forEach(f => {
      const e = normalizarEstado(f['ESTADO VISITA'] || f[13] || '');
      if (e === 'PENDIENTE' || e === 'ASIGNADO') pendientes++;
      if (e === 'COMPLETADO') {
        const dComp = parsearFecha(f['FECHA DEVOLUCION'] || '');
        if (dComp && dComp.getMonth() === mesActual && dComp.getFullYear() === anioActual) mes++;
      }
      if (e === 'INICIADO') {
        const dVis = parsearFecha(f['FECHA DE VISITA'] || '');
        if (dVis && formatearFecha(dVis) === hoyStr) realHoy++;
      }
      if (e === 'ASIGNADO') {
        const dAsig = parsearFecha(f['FECHA ASIGNACION VISITA'] || '');
        if (dAsig && formatearFecha(dAsig) === hoyStr) asigHoy++;
      }
    });
    return { pendientes, mes, asigHoy, realHoy };
  }, [datos]);

  // ── Alertas urgentes ──
  const alertas = useMemoH(() => {
    const rojas = [];   // audiencia en ≤3 días hábiles
    const amarillas = []; // +5 días sin completar

    datos.forEach(f => {
      const e = normalizarEstado(f['ESTADO VISITA'] || f[13] || '');
      if (e !== 'INICIADO') return;

      // Filtro por rol: inspector solo ve las suyas
      if (!esAdmin) {
        const vis = (f['VISITADOR(ES)'] || f[17] || '').toUpperCase();
        if (!vis.includes(miNombre)) return;
      }

      // Alerta roja: audiencia/citación en ≤3 días hábiles
      const fechaCit = f['FECHA CITACION'] || '';
      if (fechaCit) {
        const dCit = parsearFecha(fechaCit);
        if (dCit) {
          const diasH = diasHabilesHasta(dCit);
          if (diasH !== null && diasH >= 0 && diasH <= 3) {
            rojas.push({
              f: f,
              mensaje: diasH === 0
                ? 'Tiene audiencia HOY'
                : 'Audiencia en ' + diasH + ' día' + (diasH > 1 ? 's' : '') + ' hábil' + (diasH > 1 ? 'es' : ''),
              diasH: diasH,
            });
          }
        }
      }

      // Alerta amarilla: iniciada hace ≥5 días calendario sin completar
      const fechaVis = f['FECHA DE VISITA'] || f['FECHA ASIGNACION VISITA'] || '';
      if (fechaVis) {
        const d = diasDesde(fechaVis);
        if (d !== null && d >= 5) {
          amarillas.push({
            f: f,
            mensaje: 'Lleva ' + d + ' días sin completar',
            dias: d,
          });
        }
      }
    });

    // Ordenar: más urgentes primero
    rojas.sort((a, b) => a.diasH - b.diasH);
    amarillas.sort((a, b) => b.dias - a.dias);

    return { rojas, amarillas, total: rojas.length + amarillas.length };
  }, [datos, esAdmin, miNombre]);

  // ── Visitas asignadas hoy (al inspector logueado) ──
  const asignadasHoy = useMemoH(() => {
    const hoyStr = hoyDDMMAAAA();
    return datos.filter(f => {
      const e = normalizarEstado(f['ESTADO VISITA'] || f[13] || '');
      if (e !== 'ASIGNADO' && e !== 'PENDIENTE') return false;
      // Solo mis asignaciones (no las de otros)
      const vis = (f['VISITADOR(ES)'] || f[17] || '').toUpperCase();
      if (!vis.includes(miNombre)) return false;
      // Filtrar por fecha de asignación = hoy
      const dAsig = parsearFecha(f['FECHA ASIGNACION VISITA'] || '');
      if (dAsig && formatearFecha(dAsig) === hoyStr) return true;
      return false;
    });
  }, [datos, miNombre]);

  // ── Render ──
  const fechaHoy = new Date().toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <div className="pantalla activa pad-bottom">
      {/* ── Título ── */}
      <div className="page-title" style={{ marginBottom: 2 }}>Inicio</div>
      <div style={{ fontSize: 12, color: 'var(--texto-suave)', marginBottom: 14 }}>
        {fechaHoy.charAt(0).toUpperCase() + fechaHoy.slice(1)}
      </div>

      {/* ── Estadísticas compactas 2×2 ── */}
      <div className="stats-grid-2x2 compact">
        <div className="stat-box-v2 acento compact">
          <div className="stat-num-v2">{cargando ? '—' : stats.pendientes}</div>
          <div className="stat-label-v2">Pendientes</div>
        </div>
        <div className="stat-box-v2 compact">
          <div className="stat-num-v2">{cargando ? '—' : stats.mes}</div>
          <div className="stat-label-v2">Realizadas este mes</div>
        </div>
        <div className="stat-box-v2 compact">
          <div className="stat-num-v2">{cargando ? '—' : stats.asigHoy}</div>
          <div className="stat-label-v2">Asignadas hoy</div>
        </div>
        <div className="stat-box-v2 verde compact">
          <div className="stat-num-v2">{cargando ? '—' : stats.realHoy}</div>
          <div className="stat-label-v2">Realizadas hoy</div>
        </div>
      </div>

      {error && (
        <div className="card" style={{ color: 'var(--rojo)', fontSize: 13, marginBottom: 12 }}>
          {error} · <button onClick={() => cargar(true)} style={{ background: 'none', border: 'none', color: 'var(--brand-accent)', cursor: 'pointer', textDecoration: 'underline' }}>Reintentar</button>
        </div>
      )}

      {/* ── Alertas urgentes ── */}
      {!cargando && alertas.total > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{
            fontSize: 13, fontWeight: 700, marginBottom: 8,
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            ⚠️ Alertas
            <span style={{
              fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 10,
              background: alertas.rojas.length > 0 ? '#fecaca' : '#fef3c7',
              color: alertas.rojas.length > 0 ? '#991b1b' : '#92400e',
            }}>{alertas.total}</span>
          </div>

          {/* Alertas rojas: audiencia próxima */}
          {alertas.rojas.map((a, i) => (
            <AlertaCard key={'r' + i} alerta={a} tipo="rojo" onContinuar={onContinuar} />
          ))}

          {/* Alertas amarillas: muchos días sin completar */}
          {alertas.amarillas.map((a, i) => (
            <AlertaCard key={'a' + i} alerta={a} tipo="amarillo" onContinuar={onContinuar} />
          ))}
        </div>
      )}

      {/* ── Asignadas hoy ── */}
      <div style={{ marginBottom: 8 }}>
        <div style={{
          fontSize: 13, fontWeight: 700, marginBottom: 8,
          display: 'flex', alignItems: 'center', gap: 6,
        }}>
          📋 Asignadas hoy
          {!cargando && (
            <span style={{
              fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 10,
              background: 'rgba(74,108,140,0.14)', color: '#3F5C78',
            }}>{asignadasHoy.length}</span>
          )}
        </div>

        {cargando && <div className="cargando"><div className="spinner"></div>Cargando...</div>}

        {!cargando && asignadasHoy.length === 0 && (
          <div className="card" style={{ textAlign: 'center', color: 'var(--texto-suave)', padding: 24, fontSize: 13 }}>
            No tienes visitas asignadas para hoy
          </div>
        )}

        {!cargando && asignadasHoy.map((f, i) => (
          <div key={f._idx || i} className="card" style={{ padding: 14, marginBottom: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600, color: 'var(--brand-accent)' }}>
                  {f['RADICADO'] || '—'}
                </div>
                <div style={{ fontSize: 14, fontWeight: 600, marginTop: 4 }}>
                  {f['DIRECCION'] || 'Sin dirección'}
                </div>
                <div style={{ fontSize: 11, color: 'var(--texto-suave)', marginTop: 2 }}>
                  {f['BARRIO/VEREDA'] || f['BARRIO'] || '—'}
                  {f['COMUNA'] && ' · C' + f['COMUNA']}
                </div>
              </div>
              <span style={{
                background: 'rgba(184,135,58,0.14)', color: '#8A6628',
                fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 10, whiteSpace: 'nowrap',
              }}>Asignada</span>
            </div>
            <div style={{ marginTop: 10 }}>
              <button type="button" onClick={() => onContinuar(f._idx, f)}
                className="btn-principal verde" style={{ margin: 0, padding: '10px 14px', fontSize: 13 }}>
                ▶ Iniciar visita
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* ── Footer: recargar datos ── */}
      <div style={{ textAlign: 'center', marginTop: 16 }}>
        <button onClick={() => cargar(true)} style={{
          background: 'var(--gris-bg)', border: '1px solid var(--borde)', borderRadius: 8,
          padding: '6px 14px', fontFamily: 'inherit', fontSize: 11, cursor: 'pointer',
          color: 'var(--texto-suave)',
        }}>↻ Recargar datos</button>
      </div>
    </div>
  );
}

// ── Tarjeta de alerta (roja o amarilla) ───────────────────────
function AlertaCard({ alerta, tipo, onContinuar }) {
  const f = alerta.f;
  const esRojo = tipo === 'rojo';
  return (
    <div style={{
      padding: '10px 14px', marginBottom: 6,
      borderRadius: 'var(--r-md)', border: '1px solid ' + (esRojo ? '#fecaca' : '#fde68a'),
      borderLeft: '4px solid ' + (esRojo ? '#ef4444' : '#f59e0b'),
      background: esRojo ? '#fef2f2' : '#fffbeb',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: esRojo ? '#991b1b' : '#92400e', marginBottom: 2 }}>
            {esRojo ? '🔴' : '🟡'} {alerta.mensaje}
          </div>
          <div style={{ fontSize: 13, fontWeight: 600 }}>
            {f['DIRECCION'] || 'Sin dirección'}
          </div>
          <div style={{ fontSize: 11, color: 'var(--texto-suave)', marginTop: 2 }}>
            {f['RADICADO'] || '—'}
            {f['BARRIO/VEREDA'] && ' · ' + (f['BARRIO/VEREDA'] || '')}
            {f['VISITADOR(ES)'] && ' · ' + (f['VISITADOR(ES)'] || '').split(',')[0].trim()}
          </div>
        </div>
        <button type="button" onClick={() => onContinuar(f._idx, f)} style={{
          background: 'none', border: '1px solid ' + (esRojo ? '#fca5a5' : '#fcd34d'),
          borderRadius: 8, padding: '6px 10px', fontFamily: 'inherit', fontSize: 11,
          fontWeight: 600, cursor: 'pointer', color: esRojo ? '#991b1b' : '#92400e',
          whiteSpace: 'nowrap',
        }}>Continuar ▶</button>
      </div>
    </div>
  );
}

window.HomeScreen = HomeScreen;
