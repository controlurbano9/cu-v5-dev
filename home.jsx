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
      // Regla diligenciador: en INICIADO, solo el primero en VISITADOR(ES)
      // recibe las alertas. No tiene sentido alertar al co-asignado de
      // tareas que él no diligenció — su responsable es el otro.
      if (!esAdmin) {
        const vis = (f['VISITADOR(ES)'] || f[17] || '').toUpperCase();
        if (!vis.includes(miNombre)) return;
        const principal = vis.split(/\s*[\/,]\s*/)[0].trim();
        if (principal !== miNombre) return;
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
        <div style={{ marginBottom: 18 }}>
          <SeccionHeader
            titulo="Alertas"
            count={alertas.total}
            tono={alertas.rojas.length > 0 ? 'rojo' : 'amarillo'}
          />
          {alertas.rojas.map((a, i) => (
            <AlertaCard key={'r' + (a.f._idx || i)} alerta={a} tipo="rojo" onContinuar={onContinuar} />
          ))}
          {alertas.amarillas.map((a, i) => (
            <AlertaCard key={'a' + (a.f._idx || i)} alerta={a} tipo="amarillo" onContinuar={onContinuar} />
          ))}
        </div>
      )}

      {/* ── Asignadas hoy ── */}
      <div style={{ marginBottom: 8 }}>
        <SeccionHeader
          titulo="Asignadas hoy"
          count={cargando ? null : asignadasHoy.length}
          tono="acento"
        />

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
                  {f['DIRECCION INFRACCION'] || f['DIRECCION'] || 'Sin dirección'}
                </div>
                <div style={{ fontSize: 11, color: 'var(--texto-suave)', marginTop: 2 }}>
                  {f['BARRIO/VEREDA'] || f['BARRIO'] || '—'}
                  {f['COMUNA'] && ' · C' + f['COMUNA']}
                </div>
              </div>
              <span className="badge-suave badge-amarillo">Asignada</span>
            </div>
            <div style={{ marginTop: 10 }}>
              <button type="button" onClick={() => onContinuar(f._idx, f)}
                className="btn-principal verde" style={{ margin: 0, padding: '10px 14px', fontSize: 13 }}>
                <Ico d={ICO.play} size={16} /> Iniciar visita
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
          display: 'inline-flex', alignItems: 'center', gap: 6,
        }}><Ico d={ICO.refresh} size={12} /> Recargar datos</button>
      </div>
    </div>
  );
}

// ── Header de sección (Alertas, Asignadas hoy, etc.) ──────────
// Estilo editorial: tipografía serif, contador en chip suave.
function SeccionHeader({ titulo, count, tono }) {
  const tonos = {
    rojo:     { bg: 'var(--rojo-bg)',    fg: 'var(--rojo)',    border: 'rgba(180,58,46,0.18)' },
    amarillo: { bg: 'var(--amarillo-bg)',fg: 'var(--cafe)',    border: 'rgba(184,135,58,0.22)' },
    acento:   { bg: 'var(--brand-bg)',   fg: 'var(--brand-ink)', border: 'rgba(201,100,66,0.18)' },
    neutro:   { bg: 'var(--gris-bg)',    fg: 'var(--texto-suave)', border: 'var(--borde)' },
  };
  const t = tonos[tono] || tonos.neutro;
  return (
    <div style={{
      display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 10,
      paddingBottom: 6, borderBottom: '0.5px solid var(--borde)',
    }}>
      <h2 style={{
        fontFamily: 'var(--font-serif)', fontSize: 16, fontWeight: 600,
        color: 'var(--texto)', margin: 0, letterSpacing: '-0.2px',
      }}>{titulo}</h2>
      {count != null && (
        <span style={{
          fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 999,
          background: t.bg, color: t.fg, border: '0.5px solid ' + t.border,
          fontFamily: 'var(--font-mono)', letterSpacing: '0.02em',
        }}>{count}</span>
      )}
    </div>
  );
}

// ── Tarjeta de alerta — estilo editorial palette terracota/crema ────
// rojo (urgencia alta: audiencia ≤3 días hábiles), amarillo (más de 5 días sin completar).
function AlertaCard({ alerta, tipo, onContinuar }) {
  const f = alerta.f;
  const esRojo = tipo === 'rojo';
  const c = esRojo
    ? { fg: 'var(--rojo)',     bg: 'var(--rojo-bg)',     stripe: 'var(--rojo)',     border: 'rgba(180,58,46,0.18)', glow: 'rgba(180,58,46,0.06)' }
    : { fg: 'var(--cafe)',     bg: 'var(--amarillo-bg)', stripe: 'var(--amarillo)', border: 'rgba(184,135,58,0.22)', glow: 'rgba(184,135,58,0.06)' };

  return (
    <article style={{
      position: 'relative', overflow: 'hidden',
      background: 'var(--superficie)', borderRadius: 'var(--r-md)',
      border: '0.5px solid ' + c.border,
      boxShadow: '0 1px 2px ' + c.glow,
      marginBottom: 8,
    }}>
      {/* franja vertical de acento */}
      <span aria-hidden="true" style={{
        position: 'absolute', left: 0, top: 0, bottom: 0, width: 3,
        background: c.stripe,
      }} />
      <div style={{ padding: '12px 14px 12px 17px' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6,
        }}>
          <span aria-hidden="true" style={{
            display: 'inline-block', width: 6, height: 6, borderRadius: '50%',
            background: c.stripe, flexShrink: 0,
          }} />
          <span style={{
            fontSize: 10, fontWeight: 700, letterSpacing: '0.06em',
            textTransform: 'uppercase', color: c.fg,
            fontFamily: 'var(--font-mono)',
          }}>{alerta.mensaje}</span>
        </div>
        <div style={{
          display: 'flex', justifyContent: 'space-between',
          alignItems: 'flex-end', gap: 10,
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontFamily: 'var(--font-serif)', fontSize: 15, fontWeight: 600,
              lineHeight: 1.3, color: 'var(--texto)',
              overflow: 'hidden', textOverflow: 'ellipsis',
            }}>
              {f['DIRECCION INFRACCION'] || f['DIRECCION'] || 'Sin dirección'}
            </div>
            <div style={{
              fontSize: 11, color: 'var(--texto-suave)',
              marginTop: 3, display: 'flex', gap: 6, flexWrap: 'wrap',
            }}>
              <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--brand-ink)' }}>
                {f['RADICADO'] || '—'}
              </span>
              {f['BARRIO/VEREDA'] && <span aria-hidden="true">·</span>}
              {f['BARRIO/VEREDA'] && <span>{f['BARRIO/VEREDA']}</span>}
              {f['VISITADOR(ES)'] && <span aria-hidden="true">·</span>}
              {f['VISITADOR(ES)'] && <span>{(f['VISITADOR(ES)'] || '').split(/[\/,]/)[0].trim()}</span>}
            </div>
          </div>
          <button type="button" onClick={() => onContinuar(f._idx, f)} style={{
            background: c.bg, color: c.fg,
            border: '0.5px solid ' + c.border,
            borderRadius: 'var(--r-sm)', padding: '6px 11px',
            fontFamily: 'inherit', fontSize: 11, fontWeight: 600,
            cursor: 'pointer', whiteSpace: 'nowrap',
            transition: 'background .15s, transform .1s',
          }}
          onMouseDown={e => e.currentTarget.style.transform = 'scale(0.97)'}
          onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}
          onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
          >Continuar →</button>
        </div>
      </div>
    </article>
  );
}

window.HomeScreen = HomeScreen;
