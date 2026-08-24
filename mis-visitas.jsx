// ═══════════════════════════════════════════════════════════════
// mis-visitas.jsx — Pantalla "Mis visitas" del inspector logueado
//   - Agrupa visitas en 3 acordeones: Asignadas, Iniciadas, Completadas
//   - Filtra por VISITADOR(ES) del usuario logueado
//   - Completadas limitadas a 20 más recientes con "Mostrar más"
// ═══════════════════════════════════════════════════════════════
const { useState: useStateMV, useEffect: useEffectMV, useMemo: useMemoMV } = React;

// Mapeo estado → clase de badge (definidos en styles.css)
const TONOS_MV = {
  PENDIENTE:  { cls: 'badge-amarillo', label: 'Pendiente' },
  ASIGNADO:   { cls: 'badge-amarillo', label: 'Asignada' },
  INICIADO:   { cls: 'badge-azul',     label: 'Iniciada' },
  COMPLETADO: { cls: 'badge-verde',    label: 'Completada' },
};

// Colores de contador por sección (cada acordeón)
const SECCION_COLORES = {
  asignadas:   'badge-amarillo',
  iniciadas:   'badge-azul',
  completadas: 'badge-verde',
};

// Iconos SVG minimalistas para cada sección del acordeón
const SECCION_ICONOS = {
  asignadas: React.createElement('svg', { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' },
    React.createElement('path', { d: 'M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2' }),
    React.createElement('rect', { x: 8, y: 2, width: 8, height: 4, rx: 1 })
  ),
  iniciadas: Icon.Clock({ size: 18 }),
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
  // Regla: para INICIADAS/COMPLETADAS solo aparece para quien diligenció
  // el formulario (= primer inspector en VISITADOR(ES); cuando el inspector
  // abre el form, su nombre se auto-prefija primero). Para PENDIENTES/
  // ASIGNADAS ambos co-asignados siguen viéndolas hasta que una se inicie,
  // para que nadie pierda visibilidad de una tarea pendiente.
  const misVisitas = useMemoMV(() => {
    const miNombre = usuario.usuario.toUpperCase();
    return datos.filter(f => {
      const vis = visitadoresBD(f).toUpperCase();
      if (!vis.includes(miNombre)) return false;
      const est = normalizarEstado(f['ESTADO VISITA'] || f[13] || '');
      if (est === 'INICIADO' || est === 'COMPLETADO') {
        const principal = primerVisitador(vis);
        return principal === miNombre;
      }
      return true;   // PENDIENTE/ASIGNADO: cualquier co-asignado la ve
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
          <span className={'badge-suave ' + color} style={{ minWidth: 22, textAlign: 'center' }}>
            {count}
          </span>
        </div>
        <span style={{ color: 'var(--texto-suave)', display: 'inline-flex' }}>
          {abierto ? <Icon.ChevronUp size={14} /> : <Icon.Chevron size={14} />}
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

  // Mis visitas usa labels capitalizados (Pendiente/Asignada/Iniciada/Completada),
  // exactamente lo que VisitaCard renderiza por defecto via su TONOS_VISITA interno.
  // No necesitamos override.
  return (
    <div style={{
      padding: '14px 14px',
      borderBottom: '1px solid var(--borde)',
    }}>
      <VisitaCard f={f} mostrarFecha accionesMt={12}>
        {/* Iniciar/Continuar para no completadas, entregables para completadas */}
        {est !== 'COMPLETADO' && onContinuar && (
          <BotonContinuarVisita f={f} onContinuar={onContinuar} tamaño="md" />
        )}
        {est === 'COMPLETADO' && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <BotonesEntregables f={f} />
          </div>
        )}
      </VisitaCard>
    </div>
  );
}

// Exponer componente en el scope global
window.MisVisitasScreen = MisVisitasScreen;
