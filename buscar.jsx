// ═══════════════════════════════════════════════════════════════
// v6/buscar.jsx — Pantalla Buscar / Visitas (fusionadas como en V5)
//   - Búsqueda libre (radicado / dirección / barrio)
//   - Filtros estado (multi)
//   - Filtros comuna (dinámicos)
//   - Filtro visitador (solo ADMIN)
//   - Filtro rural ("Vda.")
//   - Lista agrupada por radicado
// ═══════════════════════════════════════════════════════════════
const { useState: useStateB, useEffect: useEffectB, useMemo: useMemoB } = React;

// Title-case primeros 2 tokens del nombre en mayúsculas de USUARIOS.
// "ALEJANDRO HERNANDEZ MUÑOZ" → "Alejandro Hernandez"
function titleCaseFirst2(nombre) {
  return String(nombre || '').trim().split(/\s+/).slice(0, 2)
    .map(t => t ? t.charAt(0).toUpperCase() + t.slice(1).toLowerCase() : '')
    .join(' ');
}

// Mapeo estado → tono de chip (clases de styles.css)
const ESTADO_CLASE = {
  PENDIENTE:  'activo-pendiente',
  ASIGNADO:   'activo-iniciado',
  INICIADO:   'activo-iniciado',
  COMPLETADO: 'activo-completado',
};

function BuscarScreen({ usuario, onContinuar }) {
  const [datos, setDatos]     = useStateB([]);
  const [cargando, setCargando] = useStateB(true);
  const [error, setError]     = useStateB('');

  // qInput = lo que el inspector tipea en cada keystroke (binding del input)
  // q      = lo que efectivamente se aplica al filtro (debounce de 300ms)
  // Separarlos evita re-renderizar la lista entera en cada tecla.
  const [qInput, setQInput] = useStateB('');
  const [q, setQ]           = useStateB('');
  const [filtrosEstado, setFiltrosEstado] = useStateB([]);
  const [filtroComunas, setFiltroComunas] = useStateB([]);
  const [filtrosVisitador, setFiltrosVisitador] = useStateB([]);
  const [filtroRural, setFiltroRural] = useStateB(false);
  const [comunasOpen, setComunasOpen] = useStateB(false);
  const [visitadorOpen, setVisitadorOpen] = useStateB(false);
  // Lista de visitadores activos (chips de filtro admin). Se carga desde
  // USUARIOS vía endpoint público — sin nombres hardcoded en el bundle.
  const [visitadores, setVisitadores] = useStateB([]);
  // Paginación incremental: por defecto se renderizan los primeros LIMITE_INICIAL
  // grupos. El botón "Mostrar 50 más" sube el techo. Se reinicia cuando cambian
  // los filtros o el texto de búsqueda.
  const LIMITE_INICIAL = 50;
  const LIMITE_PASO    = 50;
  const [limite, setLimite] = useStateB(LIMITE_INICIAL);

  const esAdmin = usuario.rol === 'ADMIN';

  useEffectB(() => { cargar(); }, []);

  // Cargar lista de visitadores activos (filtro admin) desde USUARIOS.
  // listarInspectoresActivos() está cacheado en api.js (TTL 60s).
  useEffectB(() => {
    if (!esAdmin) return;
    listarInspectoresActivos().then(lista => {
      setVisitadores((lista || []).map(u => ({
        val: u.nombre,
        l:   titleCaseFirst2(u.nombre),
      })));
    }).catch(() => { /* silencioso: el filtro queda vacío si falla */ });
  }, [esAdmin]);

  // Debounce 300ms: sincroniza qInput → q sin gatillar refiltros por keystroke.
  useEffectB(() => {
    const id = setTimeout(() => setQ(qInput), 300);
    return () => clearTimeout(id);
  }, [qInput]);

  // Resetea la paginación cuando cambia el texto efectivo o cualquier filtro.
  useEffectB(() => { setLimite(LIMITE_INICIAL); },
    [q, filtrosEstado, filtroComunas, filtrosVisitador, filtroRural]);

  // ── Escucha cuando el generador F-GGO-43 (pestaña hija) sube
  //    el informe a Drive y registra el link en BD. Refresca lista.
  useEffectB(() => {
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

  // forzar=true salta el caché (botón "Recargar"). Al primer mount reusa caché.
  async function cargar(forzar) {
    setCargando(true); setError('');
    try {
      const { datos: all } = await leerVisitas(forzar ? { forzar: true } : undefined);
      const mios = esAdmin ? all : all.filter(f => {
        const vis = (f['VISITADOR(ES)'] || f[17] || '').toUpperCase();
        const est = normalizarEstado(f['ESTADO VISITA'] || f[13] || '');
        return vis.includes(usuario.usuario.toUpperCase()) || est === 'PENDIENTE' || est === 'COMPLETADO';
      });
      setDatos(mios);
    } catch (e) { setError(e.message); }
    setCargando(false);
  }

  // Comunas únicas presentes en los datos cargados
  const comunas = useMemoB(() => {
    const s = new Set();
    datos.forEach(f => {
      const c = (f['COMUNA'] || f[5] || '').toString().trim();
      if (c && !isNaN(c)) s.add(c);
    });
    return [...s].sort((a, b) => Number(a) - Number(b));
  }, [datos]);

  // Filtros combinados
  const filtrados = useMemoB(() => {
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

  // Agrupar por radicado
  const grupos = useMemoB(() => {
    const g = {};
    filtrados.forEach(f => {
      let rad = (f['RADICADO'] || f[1] || '').toString().trim();
      if (!rad || rad.startsWith('LAT ') || rad.startsWith('6.') || rad.startsWith('-75') || rad.length > 60) {
        rad = 'Sin radicado';
      }
      (g[rad] = g[rad] || []).push(f);
    });
    return g;
  }, [filtrados]);

  function toggleEnArr(arr, v) {
    return arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v];
  }

  function limpiar() {
    setQInput(''); setQ(''); setFiltrosEstado([]); setFiltroComunas([]); setFiltrosVisitador([]); setFiltroRural(false);
  }

  const hayFiltros = !!q || filtrosEstado.length || filtroComunas.length || filtrosVisitador.length || filtroRural;

  return (
    <div className="pantalla activa pad-bottom">
      <div className="page-title" style={{ marginBottom: 16 }}>Visitas</div>

      <div className="card" style={{ marginBottom: 12 }}>
        <div className="input-grupo" style={{ marginBottom: 10 }}>
          <input type="text" className="input-campo"
            placeholder="Radicado, dirección, barrio..."
            value={qInput} onChange={e => setQInput(e.target.value)} />
        </div>

        {/* Estado chips */}
        <div className="filtros-estado">
          {['PENDIENTE', 'ASIGNADO', 'INICIADO', 'COMPLETADO'].map(est => {
            const activo = filtrosEstado.includes(est);
            return (
              <button key={est}
                className={'btn-filtro' + (activo ? ' ' + ESTADO_CLASE[est] : '')}
                onClick={() => setFiltrosEstado(toggleEnArr(filtrosEstado, est))}>
                {est.charAt(0) + est.slice(1).toLowerCase() + (est === 'PENDIENTE' || est === 'ASIGNADO' || est === 'INICIADO' || est === 'COMPLETADO' ? 's' : '')}
              </button>
            );
          })}
        </div>

        {/* Comunas collapse */}
        {comunas.length > 0 && (
          <div style={{ marginTop: 10 }}>
            <div className="filtro-section-header" onClick={() => setComunasOpen(!comunasOpen)} style={{ cursor: 'pointer' }}>
              <span className="filtro-section-titulo">
                Comuna {filtroComunas.length > 0 && (
                  <span style={{ color: 'var(--brand-accent)', fontSize: 11 }}>· {filtroComunas.length}</span>
                )}
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

        {/* Visitador — solo ADMIN */}
        {esAdmin && (
          <div style={{ marginTop: 10 }}>
            <div className="filtro-section-header" onClick={() => setVisitadorOpen(!visitadorOpen)} style={{ cursor: 'pointer' }}>
              <span className="filtro-section-titulo">
                Visitador {filtrosVisitador.length > 0 && (
                  <span style={{ color: 'var(--brand-accent)', fontSize: 11 }}>· {filtrosVisitador.length}</span>
                )}
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
            {hayFiltros
              ? `${filtrados.length} de ${datos.length}`
              : `${datos.length} registros`}
          </span>
          <button onClick={() => cargar(true)} style={{
            marginLeft: 'auto', background: 'var(--gris-bg)', border: '1px solid var(--borde)',
            borderRadius: 8, padding: '4px 10px', fontFamily: 'inherit', fontSize: 11, cursor: 'pointer',
          }} title="Refetch ignorando caché">Recargar</button>
        </div>
      </div>

      {/* Lista */}
      {cargando && (
        <div className="cargando"><div className="spinner"></div>Cargando registros...</div>
      )}
      {error && (
        <div className="card" style={{ color: 'var(--rojo)' }}>Error: {error}</div>
      )}
      {!cargando && !error && filtrados.length === 0 && (
        <div className="card" style={{ textAlign: 'center', color: 'var(--texto-suave)', padding: 24, fontSize: 13 }}>
          No hay registros
        </div>
      )}
      {!cargando && !error && filtrados.length > 0 && (() => {
        const entries = Object.entries(grupos);
        const totalGrupos = entries.length;
        const visibles    = entries.slice(0, limite);
        const ocultos     = Math.max(0, totalGrupos - limite);
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {visibles.map(([rad, filas]) => (
              <GrupoRadicado key={rad} radicado={rad} filas={filas} usuario={usuario} onContinuar={onContinuar} />
            ))}
            {ocultos > 0 && (
              <button
                onClick={() => setLimite(l => l + LIMITE_PASO)}
                style={{
                  background: 'var(--gris-bg)', border: '1px solid var(--borde)',
                  borderRadius: 10, padding: '10px 14px', fontFamily: 'inherit',
                  fontSize: 12, fontWeight: 600, color: 'var(--texto-2)',
                  cursor: 'pointer', marginTop: 4,
                }}
                title={`${ocultos} grupos más sin mostrar`}>
                Mostrar {Math.min(LIMITE_PASO, ocultos)} más
                <span style={{ color: 'var(--texto-suave)', fontWeight: 400, marginLeft: 6 }}>
                  ({limite} de {totalGrupos})
                </span>
              </button>
            )}
          </div>
        );
      })()}
    </div>
  );
}

// Extrae el ID de carpeta Drive desde un link "https://drive.google.com/.../folders/<id>..."
function extraerIdCarpetaDrive(link) {
  if (!link) return '';
  var m = link.match(/folders\/([a-zA-Z0-9_-]+)/);
  return m ? m[1] : '';
}

// Datos de prefill del generador F-GGO-43 a partir de una fila de BD.
// Devuelve un dict; `urlInformeF43` lo serializa a query string.
function paramsInformeF43(f, usuario) {
  var idCarpeta = extraerIdCarpetaDrive(f['LINK_DRIVE'] || f[55] || '');
  var p = {};
  if (f._idx)        p.fila       = String(f._idx);
  if (idCarpeta)     p.idCarpeta  = idCarpeta;
  if (f['RADICADO']) p.radicado   = f['RADICADO'];
  if (f['DIRECCION'])p.direccion  = f['DIRECCION'];
  var barrio = f['BARRIO/VEREDA'] || f['BARRIO'] || '';
  if (barrio)        p.barrio     = barrio;
  if (f['COMUNA'])   p.comuna     = f['COMUNA'];
  if (f['CATASTRAL'])p.catastral  = f['CATASTRAL'];
  if (f['LATITUD'])  p.lat        = f['LATITUD'];
  if (f['LONGITUD']) p.lon        = f['LONGITUD'];
  if (usuario && usuario.usuario) p.inspector = usuario.usuario;
  if (usuario && usuario.cargo)   p.cargo     = usuario.cargo;
  if (f['SE APORTO LICENCIA'])    p.seAportoLicencia = f['SE APORTO LICENCIA'];
  if (f['N LICENCIA'])            p.numRes           = f['N LICENCIA'];
  if (f['FECHA LICENCIA'])        p.fechaEjec        = f['FECHA LICENCIA'];
  if (f['TIPO Y MODALIDAD LICENCIA']) p.tipoModalidad = f['TIPO Y MODALIDAD LICENCIA'];
  if (f['PISOS APROBADOS'])       p.pisos            = f['PISOS APROBADOS'];
  if (f['DESTINACIONES LICENCIA'])p.dest             = f['DESTINACIONES LICENCIA'];
  if (f['CUBIERTA LICENCIA'])     p.cubierta         = f['CUBIERTA LICENCIA'];
  if (f['SISTEMA ESTRUCT'])       p.sist             = f['SISTEMA ESTRUCT'];
  if (f['OBS LICENCIA'])          p.obsLicencia      = f['OBS LICENCIA'];
  return p;
}

// Construye la URL al generador V6 con prefill por query string.
// Se conserva por compatibilidad (links externos, share); el flujo principal
// ahora pasa por `window.abrirInformeF43(paramsInformeF43(...))`.
function urlInformeF43(f, usuario) {
  return 'informe/?' + new URLSearchParams(paramsInformeF43(f, usuario)).toString();
}

// React.memo más abajo. Cada GrupoRadicado se re-renderiza solo si cambian
// sus props (radicado, filas, usuario); un keystroke en el buscador que
// reduce filtros ya no rerenderea todas las tarjetas visibles.
function GrupoRadicadoBase({ radicado, filas, usuario, onContinuar }) {
  const [open, setOpen] = useStateB(filas.length === 1);
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
          {filas.map((f, i) => <FilaVisita key={f._idx || i} f={f} usuario={usuario} onContinuar={onContinuar} />)}
        </div>
      )}
    </div>
  );
}

function FilaVisitaBase({ f, usuario, onContinuar }) {
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

      {est === 'INICIADO' && (
        <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {onContinuar && (
            <button
              type="button"
              onClick={() => onContinuar(f._idx, f)}
              className="btn-principal verde"
              style={{ margin: 0, padding: '6px 14px', fontSize: 12 }}
              title="Continuar el diligenciamiento de esta visita"
            >
              ▶ Continuar visita
            </button>
          )}
          <button
            type="button"
            onClick={() => window.abrirInformeF43(paramsInformeF43(f, usuario))}
            style={{
              background: 'var(--brand-bg)', color: 'var(--brand-ink)',
              border: '1px solid var(--brand-accent)', borderRadius: 8,
              padding: '6px 12px', fontSize: 12, fontWeight: 600,
              fontFamily: 'inherit', cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 6,
            }}
            title="Generar informe técnico — abre en ventana modal (escritorio) o pestaña nueva (móvil)"
          >
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10 }}>F-43</span>
            Generar informe técnico
          </button>
          {f['LINK_DOCX_INFORME'] && (
            <a
              href={f['LINK_DOCX_INFORME']}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                fontSize: 11, color: 'var(--verde-dark)', textDecoration: 'none',
                display: 'inline-flex', alignItems: 'center', gap: 4,
              }}
              title="Abrir el informe ya generado en Drive"
            >
              ✓ Ver informe en Drive
            </a>
          )}
        </div>
      )}
      {(est === 'PENDIENTE' || est === 'ASIGNADO') && onContinuar && (
        <div style={{ marginTop: 10, display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={() => onContinuar(f._idx, f)}
            className="btn-principal verde"
            style={{ margin: 0, padding: '6px 14px', fontSize: 12 }}
            title="Abrir el formulario para iniciar esta visita"
          >
            ▶ Iniciar visita
          </button>
        </div>
      )}
    </div>
  );
}

// Memoizados: React.memo evita re-render si las props no cambian (shallow eq).
// GrupoRadicado.filas es estable porque viene de un useMemo en BuscarScreen;
// FilaVisita.f sale de la misma referencia del array de datos.
const GrupoRadicado = React.memo(GrupoRadicadoBase);
const FilaVisita    = React.memo(FilaVisitaBase);

window.BuscarScreen = BuscarScreen;
