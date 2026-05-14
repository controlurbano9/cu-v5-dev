// ═══════════════════════════════════════════════════════════════
// v6/home.jsx — Pantalla unificada: Inicio + Visitas
//   - Estadísticas generales (pendientes, mes, asignadas hoy, realizadas hoy)
//   - Mis visitas asignadas (inspector logueado)
//   - Búsqueda completa con filtros (fusiona antiguo buscar.jsx)
// ═══════════════════════════════════════════════════════════════
const { useState: useStateH, useEffect: useEffectH, useMemo: useMemoH, useRef: useRefH } = React;

function HomeScreen({ usuario, onNueva, onContinuar }) {
  const [datos, setDatos] = useStateH([]);
  const [cargando, setCargando] = useStateH(true);
  const [error, setError] = useStateH('');

  // Búsqueda y filtros
  const [qInput, setQInput] = useStateH('');
  const [q, setQ] = useStateH('');
  const [filtrosEstado, setFiltrosEstado] = useStateH([]);
  const [filtroComunas, setFiltroComunas] = useStateH([]);
  const [filtrosVisitador, setFiltrosVisitador] = useStateH([]);
  const [filtroRural, setFiltroRural] = useStateH(false);
  const [comunasOpen, setComunasOpen] = useStateH(false);
  const [visitadorOpen, setVisitadorOpen] = useStateH(false);
  const [visitadores, setVisitadores] = useStateH([]);
  const [seccionActiva, setSeccionActiva] = useStateH('mis'); // 'mis' | 'todas'

  const LIMITE_INICIAL = 50;
  const LIMITE_PASO = 50;
  const [limite, setLimite] = useStateH(LIMITE_INICIAL);

  const esAdmin = usuario.rol === 'ADMIN';

  useEffectH(() => { cargar(); }, []);

  useEffectH(() => {
    if (!esAdmin) return;
    listarInspectoresActivos().then(lista => {
      setVisitadores((lista || []).map(u => ({
        val: u.nombre,
        l: titleCaseFirst2(u.nombre),
      })));
    }).catch(() => {});
  }, [esAdmin]);

  // Debounce 300ms
  useEffectH(() => {
    const id = setTimeout(() => setQ(qInput), 300);
    return () => clearTimeout(id);
  }, [qInput]);

  useEffectH(() => { setLimite(LIMITE_INICIAL); },
    [q, filtrosEstado, filtroComunas, filtrosVisitador, filtroRural]);

  // Escucha informe F-43 subido
  useEffectH(() => {
    function onMsg(ev) {
      var m = ev && ev.data;
      if (m && m.tipo === 'informe-f43-subido' && m.link) {
        setDatos(prev => prev.map(r =>
          r._idx === parseInt(m.fila, 10)
            ? { ...r, 'LINK_DOCX_INFORME': m.link }
            : r
        ));
      }
    }
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, []);

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
    const hoyISO = new Date().toISOString().split('T')[0];
    const hoy = new Date();
    const mesActual = hoy.getMonth();
    const anioActual = hoy.getFullYear();

    let pendientes = 0, mes = 0, asigHoy = 0, realHoy = 0;
    datos.forEach(f => {
      const e = normalizarEstado(f['ESTADO VISITA'] || f[13] || '');
      if (e === 'PENDIENTE' || e === 'ASIGNADO') pendientes++;
      if (e === 'COMPLETADO') {
        // FECHA DEVOLUCION = fecha de completado
        const fd = (f['FECHA DEVOLUCION'] || '').toString().trim();
        if (fd) {
          // Formato DD/MM/YYYY o Date ISO
          let dComp = null;
          if (fd.includes('/')) {
            const p = fd.split('/');
            if (p.length === 3) dComp = new Date(+p[2], +p[1] - 1, +p[0]);
          } else {
            dComp = new Date(fd);
          }
          if (dComp && !isNaN(dComp.getTime())) {
            if (dComp.getMonth() === mesActual && dComp.getFullYear() === anioActual) mes++;
            if (dComp.toISOString().split('T')[0] === hoyISO) realHoy++;
          }
        }
      }
      if (e === 'ASIGNADO') {
        const fa = (f['FECHA ASIGNACION VISITA'] || '').toString().trim();
        if (fa) {
          let dAsig = null;
          if (fa.includes('/')) {
            const p = fa.split('/');
            if (p.length === 3) dAsig = new Date(+p[2], +p[1] - 1, +p[0]);
          } else {
            dAsig = new Date(fa);
          }
          if (dAsig && !isNaN(dAsig.getTime()) && dAsig.toISOString().split('T')[0] === hoyISO) asigHoy++;
        }
      }
    });
    return { pendientes, mes, asigHoy, realHoy };
  }, [datos]);

  // ── Mis visitas (asignadas al inspector logueado): asignadas, iniciadas, completadas ──
  const misVisitas = useMemoH(() => {
    const miNombre = usuario.usuario.toUpperCase();
    const orden = { ASIGNADO: 0, INICIADO: 1, COMPLETADO: 2 };
    return datos.filter(f => {
      const vis = (f['VISITADOR(ES)'] || f[17] || '').toUpperCase();
      const e = normalizarEstado(f['ESTADO VISITA'] || f[13] || '');
      return vis.includes(miNombre) && (e === 'ASIGNADO' || e === 'INICIADO' || e === 'COMPLETADO');
    }).sort((a, b) => {
      const ea = normalizarEstado(a['ESTADO VISITA'] || a[13] || '');
      const eb = normalizarEstado(b['ESTADO VISITA'] || b[13] || '');
      return (orden[ea] ?? 9) - (orden[eb] ?? 9);
    });
  }, [datos, usuario]);

  // ── Datos del inspector (filtrados según rol) ──
  const datosFiltrados = useMemoH(() => {
    const lq = q.trim().toUpperCase();
    return datos.filter(f => {
      if (lq) {
        const hay = ['RADICADO', 'DIRECCION', 'BARRIO/VEREDA', 'BARRIO']
          .some(k => (f[k] || '').toString().toUpperCase().includes(lq));
        if (!hay) return false;
      }
      if (filtrosEstado.length) {
        const e = normalizarEstado(f['ESTADO VISITA'] || f[13] || '');
        if (!filtrosEstado.includes(e)) return false;
      }
      if (filtroComunas.length) {
        const c = (f['COMUNA'] || f[5] || '').toString().trim();
        if (!filtroComunas.includes(c)) return false;
      }
      if (filtrosVisitador.length) {
        const v = (f['VISITADOR(ES)'] || f[17] || '').toString().toUpperCase();
        if (!filtrosVisitador.some(x => v.includes(x))) return false;
      }
      if (filtroRural) {
        const b = (f['BARRIO/VEREDA'] || f[4] || '').toString().trim();
        if (!b.startsWith('Vda.')) return false;
      }
      return true;
    });
  }, [datos, q, filtrosEstado, filtroComunas, filtrosVisitador, filtroRural]);

  // Comunas únicas
  const comunas = useMemoH(() => {
    const s = new Set();
    datos.forEach(f => {
      const c = (f['COMUNA'] || f[5] || '').toString().trim();
      if (c && !isNaN(c)) s.add(c);
    });
    return [...s].sort((a, b) => Number(a) - Number(b));
  }, [datos]);

  // Agrupar por radicado
  const grupos = useMemoH(() => {
    const g = {};
    datosFiltrados.forEach(f => {
      let rad = (f['RADICADO'] || f[1] || '').toString().trim();
      if (!rad || rad.startsWith('LAT ') || rad.startsWith('6.') || rad.startsWith('-75') || rad.length > 60) {
        rad = 'Sin radicado';
      }
      (g[rad] = g[rad] || []).push(f);
    });
    return g;
  }, [datosFiltrados]);

  function toggleEnArr(arr, v) {
    return arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v];
  }
  function limpiar() {
    setQInput(''); setQ(''); setFiltrosEstado([]); setFiltroComunas([]);
    setFiltrosVisitador([]); setFiltroRural(false);
  }
  const hayFiltros = !!q || filtrosEstado.length || filtroComunas.length || filtrosVisitador.length || filtroRural;

  const ESTADO_CLASE = {
    PENDIENTE: 'activo-pendiente', ASIGNADO: 'activo-iniciado',
    INICIADO: 'activo-iniciado', COMPLETADO: 'activo-completado',
  };

  return (
    <div className="pantalla activa pad-bottom">
      {/* ── ESTADÍSTICAS GENERALES ── */}
      <div className="page-title" style={{ marginBottom: 4 }}>Inicio</div>
      <div style={{ fontSize: 12, color: 'var(--texto-suave)', marginBottom: 16 }}>
        Estadísticas generales · {new Date().toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' })}
      </div>

      <div className="stats-grid-2x2">
        <div className="stat-box-v2 acento">
          <div className="stat-num-v2">{cargando ? '—' : stats.pendientes}</div>
          <div className="stat-label-v2">Pendientes</div>
          <div className="stat-sub-v2">Total acumulado</div>
        </div>
        <div className="stat-box-v2">
          <div className="stat-num-v2">{cargando ? '—' : stats.mes}</div>
          <div className="stat-label-v2">Realizadas</div>
          <div className="stat-sub-v2">Este mes</div>
        </div>
        <div className="stat-box-v2">
          <div className="stat-num-v2">{cargando ? '—' : stats.asigHoy}</div>
          <div className="stat-label-v2">Asignadas</div>
          <div className="stat-sub-v2">Hoy</div>
        </div>
        <div className="stat-box-v2 verde">
          <div className="stat-num-v2">{cargando ? '—' : stats.realHoy}</div>
          <div className="stat-label-v2">Realizadas</div>
          <div className="stat-sub-v2">Hoy</div>
        </div>
      </div>

      {error && (
        <div className="card" style={{ color: 'var(--rojo)', fontSize: 13, marginBottom: 12 }}>
          {error} · <button onClick={() => cargar(true)} style={{ background: 'none', border: 'none', color: 'var(--brand-accent)', cursor: 'pointer', textDecoration: 'underline' }}>Reintentar</button>
        </div>
      )}

      <button className="btn-principal" onClick={onNueva} style={{ marginTop: 4, marginBottom: 20 }}>
        + Nueva visita de campo
      </button>

      {/* ── TABS: Mis visitas / Todas ── */}
      <div className="home-tabs">
        <button
          className={'home-tab' + (seccionActiva === 'mis' ? ' activo' : '')}
          onClick={() => setSeccionActiva('mis')}>
          Mis visitas {!cargando && <span className="home-tab-count">{misVisitas.length}</span>}
        </button>
        <button
          className={'home-tab' + (seccionActiva === 'todas' ? ' activo' : '')}
          onClick={() => setSeccionActiva('todas')}>
          Todas {!cargando && <span className="home-tab-count">{datos.length}</span>}
        </button>
      </div>

      {/* ── SECCIÓN: MIS VISITAS ASIGNADAS ── */}
      {seccionActiva === 'mis' && (
        <>
          {cargando && <div className="cargando"><div className="spinner"></div>Cargando...</div>}
          {!cargando && misVisitas.length === 0 && (
            <div className="card" style={{ textAlign: 'center', color: 'var(--texto-suave)', padding: 32, fontSize: 13 }}>
              No tienes visitas asignadas en este momento.
            </div>
          )}
          {!cargando && misVisitas.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {misVisitas.map((f, i) => (
                <MiVisitaCard key={f._idx || i} f={f} onContinuar={onContinuar} />
              ))}
            </div>
          )}
        </>
      )}

      {/* ── SECCIÓN: TODAS LAS VISITAS (con búsqueda) ── */}
      {seccionActiva === 'todas' && (
        <>
          <div className="card" style={{ marginBottom: 12 }}>
            <div className="input-grupo" style={{ marginBottom: 10 }}>
              <input type="text" className="input-campo"
                placeholder="Radicado, dirección, barrio..."
                value={qInput} onChange={e => setQInput(e.target.value)} />
            </div>

            <div className="filtros-estado">
              {['PENDIENTE', 'ASIGNADO', 'INICIADO', 'COMPLETADO'].map(est => {
                const activo = filtrosEstado.includes(est);
                return (
                  <button key={est}
                    className={'btn-filtro' + (activo ? ' ' + ESTADO_CLASE[est] : '')}
                    onClick={() => setFiltrosEstado(toggleEnArr(filtrosEstado, est))}>
                    {est.charAt(0) + est.slice(1).toLowerCase()}
                  </button>
                );
              })}
            </div>

            {comunas.length > 0 && (
              <div style={{ marginTop: 10 }}>
                <div className="filtro-section-header" onClick={() => setComunasOpen(!comunasOpen)} style={{ cursor: 'pointer' }}>
                  <span className="filtro-section-titulo">
                    Comuna {filtroComunas.length > 0 && <span style={{ color: 'var(--brand-accent)', fontSize: 11 }}>· {filtroComunas.length}</span>}
                  </span>
                  <span className="filtro-section-chevron">{comunasOpen ? '▲' : '▼'}</span>
                </div>
                {comunasOpen && (
                  <div className="filtros-comunas">
                    {comunas.map(c => (
                      <button key={c}
                        className={'btn-filtro' + (filtroComunas.includes(c) ? ' activo-comuna' : '')}
                        onClick={() => setFiltroComunas(toggleEnArr(filtroComunas, c))}>
                        C{c}
                      </button>
                    ))}
                    <button
                      className={'btn-filtro' + (filtroRural ? ' activo-pendiente' : '')}
                      onClick={() => setFiltroRural(!filtroRural)}>Rural</button>
                  </div>
                )}
              </div>
            )}

            {esAdmin && (
              <div style={{ marginTop: 10 }}>
                <div className="filtro-section-header" onClick={() => setVisitadorOpen(!visitadorOpen)} style={{ cursor: 'pointer' }}>
                  <span className="filtro-section-titulo">
                    Visitador {filtrosVisitador.length > 0 && <span style={{ color: 'var(--brand-accent)', fontSize: 11 }}>· {filtrosVisitador.length}</span>}
                  </span>
                  <span className="filtro-section-chevron">{visitadorOpen ? '▲' : '▼'}</span>
                </div>
                {visitadorOpen && (
                  <div className="filtros-estado">
                    {visitadores.map(v => (
                      <button key={v.val}
                        className={'btn-filtro' + (filtrosVisitador.includes(v.val) ? ' activo-iniciado' : '')}
                        onClick={() => setFiltrosVisitador(toggleEnArr(filtrosVisitador, v.val))}>
                        {v.l}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
              {hayFiltros && <button className="btn-limpiar visible" onClick={limpiar}>Limpiar filtros</button>}
              <span style={{ fontSize: 11, color: 'var(--texto-suave)' }}>
                {hayFiltros ? `${datosFiltrados.length} de ${datos.length}` : `${datos.length} registros`}
              </span>
              <button onClick={() => cargar(true)} style={{
                marginLeft: 'auto', background: 'var(--gris-bg)', border: '1px solid var(--borde)',
                borderRadius: 8, padding: '4px 10px', fontFamily: 'inherit', fontSize: 11, cursor: 'pointer',
              }}>Recargar</button>
            </div>
          </div>

          {cargando && <div className="cargando"><div className="spinner"></div>Cargando registros...</div>}
          {!cargando && !error && datosFiltrados.length === 0 && (
            <div className="card" style={{ textAlign: 'center', color: 'var(--texto-suave)', padding: 24, fontSize: 13 }}>
              No hay registros
            </div>
          )}
          {!cargando && !error && datosFiltrados.length > 0 && (() => {
            const entries = Object.entries(grupos);
            const totalGrupos = entries.length;
            const visibles = entries.slice(0, limite);
            const ocultos = Math.max(0, totalGrupos - limite);
            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {visibles.map(([rad, filas]) => (
                  <GrupoRadicadoHome key={rad} radicado={rad} filas={filas} usuario={usuario} onContinuar={onContinuar} />
                ))}
                {ocultos > 0 && (
                  <button onClick={() => setLimite(l => l + LIMITE_PASO)} style={{
                    background: 'var(--gris-bg)', border: '1px solid var(--borde)',
                    borderRadius: 10, padding: '10px 14px', fontFamily: 'inherit',
                    fontSize: 12, fontWeight: 600, color: 'var(--texto-2)', cursor: 'pointer',
                  }}>
                    Mostrar {Math.min(LIMITE_PASO, ocultos)} más
                    <span style={{ color: 'var(--texto-suave)', fontWeight: 400, marginLeft: 6 }}>
                      ({limite} de {totalGrupos})
                    </span>
                  </button>
                )}
              </div>
            );
          })()}
        </>
      )}
    </div>
  );
}

// ── Tarjeta de "Mis visitas" — compacta con acción directa ──
function MiVisitaCard({ f, onContinuar }) {
  const est = normalizarEstado(f['ESTADO VISITA'] || f[13] || '');
  const tono = {
    INICIADO:   { bg: 'rgba(74,108,140,0.14)',  fg: '#3F5C78', label: 'En campo' },
    ASIGNADO:   { bg: 'rgba(184,135,58,0.14)',  fg: '#8A6628', label: 'Asignada' },
    COMPLETADO: { bg: 'rgba(107,122,58,0.14)',  fg: '#516028', label: 'Completada' },
  }[est] || { bg: 'var(--gris-bg)', fg: 'var(--texto-suave)', label: est };

  return (
    <div className="card" style={{ padding: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600, color: 'var(--brand-accent)' }}>
            {f['RADICADO'] || '—'}
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, marginTop: 4 }}>
            {f['DIRECCION'] || 'Sin dirección'}
          </div>
          <div style={{ fontSize: 11, color: 'var(--texto-suave)', marginTop: 4 }}>
            {f['BARRIO/VEREDA'] || f['BARRIO'] || '—'}
            {f['COMUNA'] && ` · C${f['COMUNA']}`}
          </div>
        </div>
        <span style={{
          background: tono.bg, color: tono.fg, fontSize: 10, fontWeight: 700,
          padding: '3px 8px', borderRadius: 10, whiteSpace: 'nowrap',
        }}>{tono.label}</span>
      </div>
      {est !== 'COMPLETADO' && onContinuar && (
        <div style={{ marginTop: 12 }}>
          <button
            type="button"
            onClick={() => onContinuar(f._idx, f)}
            className="btn-principal verde"
            style={{ margin: 0, padding: '10px 14px', fontSize: 13 }}>
            {est === 'INICIADO' ? '▶ Continuar visita' : '▶ Iniciar visita'}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Grupo radicado (reutilizado de buscar.jsx) ──
function GrupoRadicadoHomeBase({ radicado, filas, usuario, onContinuar }) {
  const [open, setOpen] = useStateH(filas.length === 1);
  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div onClick={() => setOpen(!open)} style={{
        padding: '12px 14px', cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        borderBottom: open ? '1px solid var(--borde)' : 'none',
      }}>
        <div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600 }}>{radicado}</div>
          <div style={{ fontSize: 11, color: 'var(--texto-suave)', marginTop: 2 }}>
            {filas.length} {filas.length === 1 ? 'registro' : 'registros'}
          </div>
        </div>
        <span style={{ color: 'var(--texto-suave)' }}>{open ? '▲' : '▼'}</span>
      </div>
      {open && (
        <div>
          {filas.map((f, i) => <FilaVisitaHome key={f._idx || i} f={f} usuario={usuario} onContinuar={onContinuar} />)}
        </div>
      )}
    </div>
  );
}

function FilaVisitaHomeBase({ f, usuario, onContinuar }) {
  const est = normalizarEstado(f['ESTADO VISITA'] || f[13] || '');
  const tono = {
    PENDIENTE:  { bg: 'rgba(184,135,58,0.14)',  fg: '#8A6628' },
    ASIGNADO:   { bg: 'rgba(74,108,140,0.14)',  fg: '#3F5C78' },
    INICIADO:   { bg: 'rgba(74,108,140,0.14)',  fg: '#3F5C78' },
    COMPLETADO: { bg: 'rgba(107,122,58,0.14)',  fg: '#516028' },
  }[est] || { bg: 'var(--gris-bg)', fg: 'var(--texto-suave)' };

  return (
    <div style={{ padding: '12px 14px', borderTop: '1px solid var(--borde)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>
            {f['DIRECCION'] || 'Sin dirección'}
          </div>
          <div style={{ fontSize: 11, color: 'var(--texto-suave)' }}>
            {f['BARRIO/VEREDA'] || f['BARRIO'] || '—'}
            {f['COMUNA'] && ` · C${f['COMUNA']}`}
          </div>
          {f['VISITADOR(ES)'] && (
            <div style={{ fontSize: 11, color: 'var(--texto-suave)', marginTop: 4 }}>
              <span style={{ opacity: 0.7 }}>Visitador:</span> {f['VISITADOR(ES)']}
            </div>
          )}
        </div>
        <span style={{
          background: tono.bg, color: tono.fg, fontSize: 10, fontWeight: 700,
          padding: '3px 8px', borderRadius: 10, whiteSpace: 'nowrap',
        }}>{est || '—'}</span>
      </div>
      {(est === 'INICIADO' || est === 'PENDIENTE' || est === 'ASIGNADO') && onContinuar && (
        <div style={{ marginTop: 10, display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={() => onContinuar(f._idx, f)}
            className="btn-principal verde"
            style={{ margin: 0, padding: '6px 14px', fontSize: 12 }}>
            ▶ {est === 'INICIADO' ? 'Continuar visita' : 'Iniciar visita'}
          </button>
        </div>
      )}
    </div>
  );
}

const GrupoRadicadoHome = React.memo(GrupoRadicadoHomeBase);
const FilaVisitaHome = React.memo(FilaVisitaHomeBase);

window.HomeScreen = HomeScreen;
