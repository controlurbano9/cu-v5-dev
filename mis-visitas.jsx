// ═══════════════════════════════════════════════════════════════
// mis-visitas.jsx — Pantalla "Mis visitas" del inspector logueado
//   - Agrupa visitas en 3 acordeones: Asignadas, Iniciadas, Completadas
//   - Filtra por VISITADOR(ES) del usuario logueado
//   - Completadas limitadas a 20 más recientes con "Mostrar más"
// ═══════════════════════════════════════════════════════════════
const { useState: useStateMV, useEffect: useEffectMV, useMemo: useMemoMV } = React;

// Tonos por estado para badges y contadores
const TONOS_MV = {
  PENDIENTE:  { bg: 'rgba(184,135,58,0.14)', fg: '#8A6628', label: 'Pendiente' },
  ASIGNADO:   { bg: 'rgba(74,108,140,0.14)', fg: '#3F5C78', label: 'Asignada' },
  INICIADO:   { bg: 'rgba(74,108,140,0.20)', fg: '#2E4A5E', label: 'Iniciada' },
  COMPLETADO: { bg: 'rgba(107,122,58,0.14)', fg: '#516028', label: 'Completada' },
};

// Colores para los badges de conteo de cada sección
const SECCION_COLORES = {
  asignadas:   { bg: 'rgba(184,135,58,0.18)', fg: '#8A6628' },
  iniciadas:   { bg: 'rgba(74,108,140,0.22)', fg: '#2E4A5E' },
  completadas: { bg: 'rgba(107,122,58,0.18)', fg: '#516028' },
};

// Iconos SVG minimalistas para cada sección del acordeón
const SECCION_ICONOS = {
  asignadas: React.createElement('svg', { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' },
    React.createElement('path', { d: 'M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2' }),
    React.createElement('rect', { x: 8, y: 2, width: 8, height: 4, rx: 1 })
  ),
  iniciadas: React.createElement('svg', { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' },
    React.createElement('circle', { cx: 12, cy: 12, r: 10 }),
    React.createElement('polyline', { points: '12 6 12 12 16 14' })
  ),
  completadas: React.createElement('svg', { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' },
    React.createElement('path', { d: 'M22 11.08V12a10 10 0 11-5.93-9.14' }),
    React.createElement('polyline', { points: '22 4 12 14.01 9 11.01' })
  ),
};

// Cantidad inicial de completadas visibles
const COMPLETADAS_INICIAL = 20;
const COMPLETADAS_PASO = 20;

function MisVisitasScreen({ usuario, onNueva, onContinuar }) {
  const [datos, setDatos]       = useStateMV([]);
  const [cargando, setCargando] = useStateMV(true);
  const [error, setError]       = useStateMV('');

  // Secciones abiertas: asignadas e iniciadas por defecto, completadas cerrada
  const [abiertos, setAbiertos] = useStateMV({
    asignadas: true,
    iniciadas: true,
    completadas: false,
  });

  // Paginación para completadas
  const [limiteCompletadas, setLimiteCompletadas] = useStateMV(COMPLETADAS_INICIAL);

  // ── Carga de datos ──
  useEffectMV(() => { cargar(); }, []);

  async function cargar(forzar) {
    setCargando(true);
    setError('');
    try {
      const { datos: all } = await leerVisitas(forzar ? { forzar: true } : undefined);
      setDatos(all);
    } catch (e) {
      setError(e.message);
    }
    setCargando(false);
  }

  // ── Filtrar visitas del inspector logueado ──
  const misVisitas = useMemoMV(() => {
    const miNombre = usuario.usuario.toUpperCase();
    return datos.filter(f => {
      const vis = (f['VISITADOR(ES)'] || f[17] || '').toUpperCase();
      return vis.includes(miNombre);
    });
  }, [datos, usuario]);

  // ── Agrupar por categoría ──
  const grupos = useMemoMV(() => {
    const asignadas = [];
    const iniciadas = [];
    const completadas = [];

    misVisitas.forEach(f => {
      const est = normalizarEstado(f['ESTADO VISITA'] || f[13] || '');
      if (est === 'PENDIENTE' || est === 'ASIGNADO') {
        asignadas.push(f);
      } else if (est === 'INICIADO') {
        iniciadas.push(f);
      } else if (est === 'COMPLETADO') {
        completadas.push(f);
      }
      // DESCARGADA GESTION y otros estados no se muestran
    });

    // Ordenar completadas: más recientes primero (por fecha de visita)
    completadas.sort((a, b) => {
      const fa = _parsearFechaOrden(a['FECHA DE VISITA'] || a['FECHA DEVOLUCION'] || '');
      const fb = _parsearFechaOrden(b['FECHA DE VISITA'] || b['FECHA DEVOLUCION'] || '');
      return fb - fa; // descendente
    });

    return { asignadas, iniciadas, completadas };
  }, [misVisitas]);

  // Parsear fecha para ordenamiento (devuelve timestamp)
  function _parsearFechaOrden(val) {
    if (!val) return 0;
    const s = String(val).trim().split(' ')[0];
    // DD/MM/YYYY
    const m1 = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s);
    if (m1) return new Date(+m1[3], +m1[2] - 1, +m1[1]).getTime() || 0;
    // YYYY-MM-DD
    const m2 = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
    if (m2) return new Date(+m2[1], +m2[2] - 1, +m2[3]).getTime() || 0;
    const d = new Date(s);
    return isNaN(d.getTime()) ? 0 : d.getTime();
  }

  // Toggle sección del acordeón
  function toggleSeccion(key) {
    setAbiertos(prev => ({ ...prev, [key]: !prev[key] }));
  }

  // ── Render ──
  return (
    <div className="pantalla activa pad-bottom">
      <div className="page-title" style={{ marginBottom: 4 }}>Mis visitas</div>
      <div style={{ fontSize: 12, color: 'var(--texto-suave)', marginBottom: 16 }}>
        Visitas asignadas a {usuario.usuario || 'ti'}
      </div>

      {/* Error */}
      {error && (
        <div className="card" style={{ color: 'var(--rojo)', fontSize: 13, marginBottom: 12 }}>
          {error} &middot;{' '}
          <button onClick={() => cargar(true)} style={{
            background: 'none', border: 'none', color: 'var(--brand-accent)',
            cursor: 'pointer', textDecoration: 'underline', fontFamily: 'inherit',
          }}>Reintentar</button>
        </div>
      )}

      {/* Cargando */}
      {cargando && (
        <div className="cargando"><div className="spinner"></div>Cargando visitas...</div>
      )}

      {/* Sin visitas */}
      {!cargando && !error && misVisitas.length === 0 && (
        <div className="card" style={{ textAlign: 'center', color: 'var(--texto-suave)', padding: 32, fontSize: 13 }}>
          No tienes visitas asignadas.
        </div>
      )}

      {/* Acordeones */}
      {!cargando && !error && misVisitas.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Asignadas */}
          <SeccionAcordeonMV
            titulo="Asignadas"
            icono={SECCION_ICONOS.asignadas}
            count={grupos.asignadas.length}
            color={SECCION_COLORES.asignadas}
            abierto={abiertos.asignadas}
            onToggle={() => toggleSeccion('asignadas')}>
            {grupos.asignadas.length === 0
              ? <div style={{ padding: '20px 14px', textAlign: 'center', color: 'var(--texto-suave)', fontSize: 13 }}>
                  Sin visitas asignadas
                </div>
              : grupos.asignadas.map((f, i) => (
                  <TarjetaVisitaMV key={f._idx || i} f={f} onContinuar={onContinuar} />
                ))
            }
          </SeccionAcordeonMV>

          {/* Iniciadas */}
          <SeccionAcordeonMV
            titulo="Iniciadas"
            icono={SECCION_ICONOS.iniciadas}
            count={grupos.iniciadas.length}
            color={SECCION_COLORES.iniciadas}
            abierto={abiertos.iniciadas}
            onToggle={() => toggleSeccion('iniciadas')}>
            {grupos.iniciadas.length === 0
              ? <div style={{ padding: '20px 14px', textAlign: 'center', color: 'var(--texto-suave)', fontSize: 13 }}>
                  Sin visitas iniciadas
                </div>
              : grupos.iniciadas.map((f, i) => (
                  <TarjetaVisitaMV key={f._idx || i} f={f} onContinuar={onContinuar} />
                ))
            }
          </SeccionAcordeonMV>

          {/* Completadas (paginadas) */}
          <SeccionAcordeonMV
            titulo="Completadas"
            icono={SECCION_ICONOS.completadas}
            count={grupos.completadas.length}
            color={SECCION_COLORES.completadas}
            abierto={abiertos.completadas}
            onToggle={() => toggleSeccion('completadas')}>
            {grupos.completadas.length === 0
              ? <div style={{ padding: '20px 14px', textAlign: 'center', color: 'var(--texto-suave)', fontSize: 13 }}>
                  Sin visitas completadas
                </div>
              : (() => {
                  const visibles = grupos.completadas.slice(0, limiteCompletadas);
                  const ocultas = grupos.completadas.length - limiteCompletadas;
                  return (
                    <>
                      {visibles.map((f, i) => (
                        <TarjetaVisitaMV key={f._idx || i} f={f} onContinuar={onContinuar} />
                      ))}
                      {ocultas > 0 && (
                        <div style={{ padding: '12px 14px', textAlign: 'center' }}>
                          <button
                            type="button"
                            onClick={() => setLimiteCompletadas(l => l + COMPLETADAS_PASO)}
                            style={{
                              background: 'var(--gris-bg)', border: '1px solid var(--borde)',
                              borderRadius: 10, padding: '10px 18px', fontFamily: 'inherit',
                              fontSize: 12, fontWeight: 600, color: 'var(--texto-2)', cursor: 'pointer',
                            }}>
                            Mostrar más
                            <span style={{ color: 'var(--texto-suave)', fontWeight: 400, marginLeft: 6 }}>
                              ({limiteCompletadas} de {grupos.completadas.length})
                            </span>
                          </button>
                        </div>
                      )}
                    </>
                  );
                })()
            }
          </SeccionAcordeonMV>
        </div>
      )}

      {/* Resumen inferior */}
      {!cargando && !error && misVisitas.length > 0 && (
        <div style={{
          marginTop: 16, display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', gap: 8,
        }}>
          <span style={{ fontSize: 11, color: 'var(--texto-suave)' }}>
            {misVisitas.length} visita{misVisitas.length !== 1 ? 's' : ''} en total
          </span>
          <button onClick={() => cargar(true)} style={{
            background: 'var(--gris-bg)', border: '1px solid var(--borde)',
            borderRadius: 8, padding: '4px 10px', fontFamily: 'inherit',
            fontSize: 11, cursor: 'pointer', color: 'var(--texto-2)',
          }}>Recargar</button>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Componente acordeón reutilizable para cada sección
// ═══════════════════════════════════════════════════════════════
function SeccionAcordeonMV({ titulo, icono, count, color, abierto, onToggle, children }) {
  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      {/* Encabezado del acordeón */}
      <div
        onClick={onToggle}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 14px', cursor: 'pointer', userSelect: 'none',
          borderBottom: abierto ? '1px solid var(--borde)' : 'none',
          background: abierto ? 'var(--superficie)' : 'transparent',
          transition: 'background 0.15s ease',
        }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ display: 'flex', alignItems: 'center' }}>{icono}</span>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--texto-2)' }}>
            {titulo}
          </span>
          <span style={{
            background: color.bg, color: color.fg,
            fontSize: 11, fontWeight: 700,
            padding: '2px 8px', borderRadius: 10,
            minWidth: 20, textAlign: 'center',
          }}>
            {count}
          </span>
        </div>
        <span style={{ color: 'var(--texto-suave)', fontSize: 12 }}>
          {abierto ? '▲' : '▼'}
        </span>
      </div>

      {/* Cuerpo del acordeón */}
      {abierto && (
        <div>{children}</div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Tarjeta individual de visita
// ═══════════════════════════════════════════════════════════════
function TarjetaVisitaMV({ f, onContinuar }) {
  const est = normalizarEstado(f['ESTADO VISITA'] || f[13] || '');
  const tono = TONOS_MV[est] || { bg: 'var(--gris-bg)', fg: 'var(--texto-suave)', label: est };

  // Fecha de visita formateada
  const fechaVisita = formatearFecha(f['FECHA DE VISITA'] || f['FECHA ASIGNACION VISITA'] || '');

  // Determinar texto y visibilidad del botón de acción
  const mostrarBoton = est !== 'COMPLETADO';
  const textoBoton = est === 'INICIADO' ? '▶ Continuar visita' : '▶ Iniciar visita';

  return (
    <div style={{
      padding: '14px 14px',
      borderBottom: '1px solid var(--borde)',
    }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        alignItems: 'flex-start', gap: 8,
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Radicado */}
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: 12,
            fontWeight: 600, color: 'var(--brand-accent)',
          }}>
            {f['RADICADO'] || '—'}
          </div>

          {/* Dirección */}
          <div style={{ fontSize: 14, fontWeight: 600, marginTop: 4 }}>
            {f['DIRECCION'] || 'Sin dirección'}
          </div>

          {/* Barrio · Comuna */}
          <div style={{ fontSize: 11, color: 'var(--texto-suave)', marginTop: 4 }}>
            {f['BARRIO/VEREDA'] || f['BARRIO'] || '—'}
            {f['COMUNA'] && (' · C' + f['COMUNA'])}
          </div>

          {/* Fecha de visita */}
          {fechaVisita && (
            <div style={{ fontSize: 11, color: 'var(--texto-suave)', marginTop: 4 }}>
              <span style={{ opacity: 0.7 }}>Fecha:</span> {fechaVisita}
            </div>
          )}
        </div>

        {/* Badge de estado */}
        <span style={{
          background: tono.bg, color: tono.fg,
          fontSize: 10, fontWeight: 700,
          padding: '3px 8px', borderRadius: 10,
          whiteSpace: 'nowrap', flexShrink: 0,
        }}>
          {tono.label}
        </span>
      </div>

      {/* Botón de acción */}
      {mostrarBoton && onContinuar && (
        <div style={{ marginTop: 12 }}>
          <button
            type="button"
            onClick={() => onContinuar(f._idx, f)}
            className="btn-principal verde"
            style={{ margin: 0, padding: '10px 14px', fontSize: 13 }}>
            {textoBoton}
          </button>
        </div>
      )}

      {/* COMPLETADO: ver datos + entregables Drive/Acta/Informe */}
      {est === 'COMPLETADO' && (() => {
        const linkDrive   = f['LINK_DRIVE'];
        const linkActaPdf = f['LINK_PDF_ACTA'] || f['LINK_XLSX_ACTA'];
        const linkInforme = f['LINK_DOCX_INFORME'] || f['LINK_INFORME_F43'];
        const btnSty = {
          background: 'var(--gris-bg)', color: 'var(--texto)',
          border: '1px solid var(--borde)', borderRadius: 10,
          padding: '8px 12px', fontFamily: 'inherit', fontSize: 12, fontWeight: 600,
          cursor: 'pointer', textDecoration: 'none', display: 'inline-flex',
          alignItems: 'center', gap: 6, flex: 1, minWidth: 100,
          justifyContent: 'center',
        };
        return (
          <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button"
              onClick={() => window.abrirVisitaDetail && window.abrirVisitaDetail(f)}
              className="btn-principal verde"
              style={{ flex: 1, minWidth: 100, margin: 0, padding: '8px 12px', fontSize: 12 }}>
              👁 Ver datos
            </button>
            {linkDrive   && <a href={linkDrive}   target="_blank" rel="noopener noreferrer" style={btnSty}>📂 Carpeta</a>}
            {linkActaPdf && <a href={linkActaPdf} target="_blank" rel="noopener noreferrer" style={btnSty}>📄 Acta</a>}
            {linkInforme && <a href={linkInforme} target="_blank" rel="noopener noreferrer" style={btnSty}>📝 Informe</a>}
          </div>
        );
      })()}
    </div>
  );
}

// Exponer componente en el scope global
window.MisVisitasScreen = MisVisitasScreen;
