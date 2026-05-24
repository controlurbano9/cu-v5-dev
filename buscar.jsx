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
  // Paginación incremental
  const LIMITE_INICIAL = 50;
  const LIMITE_PASO    = 50;
  const [limite, setLimite] = useStateB(LIMITE_INICIAL);

  const esAdmin = usuario.rol === 'ADMIN';

  // ── Estado para acciones de gestión admin ──
  const [inspectores, setInspectores] = useStateB([]);
  const [busyFila, setBusyFila] = useStateB(null);       // _idx de fila en proceso
  const [asignandoFila, setAsignandoFila] = useStateB(null); // _idx de fila con panel abierto

  useEffectB(() => { cargar(); }, []);

  // Cargar lista de visitadores activos (filtro admin) desde USUARIOS.
  // listarInspectoresActivos() está cacheado en api.js (TTL 60s).
  // El filtro de chips del Buscar solo muestra los inspectores fijos
  // (Alejandro, Mauricio, Daniel); la lista completa se conserva
  // para el panel de asignación admin.
  const VISITADORES_FILTRO = ['ALEJANDRO HERNANDEZ', 'MAURICIO HERRERA', 'DANIEL PEDRAZA'];
  useEffectB(() => {
    if (!esAdmin) return;
    listarInspectoresActivos().then(lista => {
      const todos = lista || [];
      setVisitadores(
        todos
          .filter(u => VISITADORES_FILTRO.some(pref =>
            (u.nombre || '').toUpperCase().includes(pref)))
          .map(u => ({ val: u.nombre, l: titleCaseFirst2(u.nombre) }))
      );
      // Lista completa para el panel de asignación
      setInspectores(todos);
    }).catch(() => {});
  }, [esAdmin]);

  // ── Acciones admin: asignar, desasignar, completar ──
  async function adminAsignar(fila, inspector) {
    setBusyFila(fila);
    try {
      await gasGet({
        accion: 'asignarRadicado', fila, inspector,
        fechaAsignacion: hoyDDMMAAAA(),
      });
      invalidarCache('visitas');
      setAsignandoFila(null);
      await cargar(true);
    } catch (e) { await appAlert('Error: ' + e.message, { titulo: 'Error' }); }
    setBusyFila(null);
  }

  // Crea una fila nueva en BD clonando los datos fijos del radicado y
  // dejándola ASIGNADA al inspector elegido. Útil para asignar una segunda
  // visita a un radicado ya COMPLETADO.
  async function adminAsignarNuevaVisita(filaOrigen, inspector) {
    setBusyFila(filaOrigen);
    try {
      const r = await gasGet({
        accion: 'crearNuevaVisitaAsignada',
        fila: filaOrigen, inspector,
      });
      if (r && r.ok === false) throw new Error(r.error || 'Error desconocido');
      invalidarCache('visitas');
      setAsignandoFila(null);
      await cargar(true);
      await appAlert('Visita N°' + (r.nVisita || '?') + ' creada y asignada a ' + inspector + '.',
        { titulo: 'Nueva visita asignada' });
    } catch (e) { await appAlert('Error: ' + e.message, { titulo: 'Error' }); }
    setBusyFila(null);
  }

  async function adminDesasignar(fila, rad) {
    const ok = await appConfirm(
      '¿Quitar asignación de ' + (rad || 'este radicado') + '?\nVolverá a estado PENDIENTE.',
      { titulo: 'Desasignar', btnOk: 'Desasignar' }
    );
    if (!ok) return;
    setBusyFila(fila);
    try {
      await gasGet({ accion: 'desasignarRadicado', fila });
      invalidarCache('visitas');
      await cargar(true);
    } catch (e) { await appAlert('Error: ' + e.message, { titulo: 'Error' }); }
    setBusyFila(null);
  }

  async function adminCompletar(fila, fechaAsig) {
    // Paridad V2: si la visita tiene orden de suspensión preventiva
    // (SUSPENSION=SI + N° ORDEN DE POLICIA) y NO tiene oficio de vigilancia
    // generado aún, ofrecer generarlo antes de completar.
    const f = datos.find(x => x._idx === fila);
    const suspSi = f && (f['SUSPENSION DE LA OBRA'] || '').toString().trim().toUpperCase() === 'SI';
    const tieneOrden = f && (f['N° ORDEN DE POLICIA'] || f['N ORDEN DE POLICIA'] || '').toString().trim();
    const sinOficio = f && !(f['LINK_SOLICITUD_VIGILANCIA'] || '').toString().trim();
    const requiereVigilancia = !!(f && suspSi && tieneOrden && sinOficio);

    if (requiereVigilancia) {
      const generar = await appConfirm(
        'Esta visita tiene orden de suspensión preventiva y aún no se ha generado el oficio de Vigilancia Policía.\n\n¿Generar el oficio antes de completar?',
        { titulo: 'Solicitud de vigilancia pendiente', btnOk: 'Generar oficio', btnCancel: 'Completar sin oficio' }
      );
      if (generar) {
        setBusyFila(fila);
        try {
          const idCarpeta = extraerIdCarpetaDrive(f['LINK_DRIVE'] || f[55] || '');
          if (!idCarpeta) {
            await appAlert('La visita no tiene carpeta de Drive asociada.', { titulo: 'Sin carpeta' });
            setBusyFila(null);
            return;
          }
          await generarSolicitudVigilancia({
            fila: f._idx,
            idCarpetaVisita: idCarpeta,
            radicado:        f['RADICADO'] || '',
            fechaVisita:     f['FECHA DE VISITA'] || '',
            nOrdenPolicia:   f['N° ORDEN DE POLICIA'] || f['N ORDEN DE POLICIA'] || '',
            direccion:       f['DIRECCION INFRACCION'] || f['DIRECCION'] || '',
            barrio:          f['BARRIO/VEREDA'] || f['BARRIO'] || '',
          });
        } catch (e) {
          await appAlert('Error generando oficio: ' + e.message + '\n\nLa visita NO se marcó como completada.', { titulo: 'Error' });
          setBusyFila(null);
          return;
        }
        setBusyFila(null);
      }
    }

    const ok = await appConfirm('¿Marcar como COMPLETADO?', {
      titulo: 'Completar visita', btnOk: 'Completar',
    });
    if (!ok) return;
    setBusyFila(fila);
    try {
      const dias = fechaAsig ? diasDesde(fechaAsig) : '';
      await gasGet({
        accion: 'completarRegistro', fila,
        dias: dias || '',
        fecha: hoyDDMMAAAA(),
      });
      invalidarCache('visitas');
      await cargar(true);
    } catch (e) { await appAlert('Error: ' + e.message, { titulo: 'Error' }); }
    setBusyFila(null);
  }

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
        const hay = ['RADICADO', 'DIRECCION INFRACCION', 'DIRECCION', 'BARRIO/VEREDA', 'BARRIO']
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
              <GrupoRadicado key={rad} radicado={rad} filas={filas} usuario={usuario} onContinuar={onContinuar}
                esAdmin={esAdmin} inspectores={inspectores} busyFila={busyFila}
                asignandoFila={asignandoFila} setAsignandoFila={setAsignandoFila}
                onAsignar={adminAsignar} onDesasignar={adminDesasignar} onCompletar={adminCompletar}
                onAsignarNuevaVisita={adminAsignarNuevaVisita} />
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
  if (f['FECHA DE VISITA'])      p.fechaVisita = f['FECHA DE VISITA'];
  if (f['DIRECCION INFRACCION'] || f['DIRECCION']) p.direccion = f['DIRECCION INFRACCION'] || f['DIRECCION'];
  var barrio = f['BARRIO/VEREDA'] || f['BARRIO'] || '';
  if (barrio)        p.barrio     = barrio;
  if (f['COMUNA'])   p.comuna     = f['COMUNA'];
  if (f['CODIGO CATASTRAL'] || f['CATASTRAL']) p.catastral = f['CODIGO CATASTRAL'] || f['CATASTRAL'];
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
  // POT
  if (f['POLIGONO USO SUELO'])    p.poligono         = f['POLIGONO USO SUELO'];
  if (f['AMENAZA'])               p.amenaza          = f['AMENAZA'];
  if (f['SUELO DE PROTECCION'])   p.sueloProt        = f['SUELO DE PROTECCION'];
  // Observaciones
  var rawAct = f['ACTUACION / OBSERVACIONES'] || f['ACTUACION'] || '';
  var partsAct = rawAct.split('\n══CONCLUSIONES══\n');
  if (partsAct[0]) p.observaciones = partsAct[0];
  if (f['AREA CONTRAVENCION m2'] || f['AREA CONTRAVENCION M2']) {
    var areaVal = (f['AREA CONTRAVENCION m2'] || f['AREA CONTRAVENCION M2'] || '').toString().trim();
    if (areaVal && areaVal !== 'No se pudo medir') p.areas = areaVal;
  }
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
function GrupoRadicadoBase({ radicado, filas, usuario, onContinuar,
  esAdmin, inspectores, busyFila, asignandoFila, setAsignandoFila,
  onAsignar, onDesasignar, onCompletar, onAsignarNuevaVisita }) {
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
          {filas.map((f, i) => <FilaVisita key={f._idx || i} f={f} usuario={usuario} onContinuar={onContinuar}
            esAdmin={esAdmin} inspectores={inspectores}
            busy={busyFila === f._idx}
            abierto={asignandoFila === f._idx}
            onAbrirAsignar={() => setAsignandoFila(asignandoFila === f._idx ? null : f._idx)}
            onAsignar={onAsignar} onDesasignar={onDesasignar} onCompletar={onCompletar}
            onAsignarNuevaVisita={onAsignarNuevaVisita} />)}
        </div>
      )}
    </div>
  );
}

function FilaVisitaBase({ f, usuario, onContinuar,
  esAdmin, inspectores, busy, abierto, onAbrirAsignar, onAsignar, onDesasignar, onCompletar,
  onAsignarNuevaVisita }) {
  const est = normalizarEstado(f['ESTADO VISITA'] || f[13] || '');
  // Badge usando tokens de paleta editorial (no hardcoded RGBA)
  const tonoCls = {
    PENDIENTE:  'badge-amarillo',
    ASIGNADO:   'badge-azul',
    INICIADO:   'badge-azul',
    COMPLETADO: 'badge-verde',
  }[est] || '';

  return (
    <div style={{ padding: '12px 14px', borderTop: '1px solid var(--borde)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>
            {f['DIRECCION INFRACCION'] || f['DIRECCION'] || 'Sin dirección'}
          </div>
          <div style={{ fontSize: 11, color: 'var(--texto-suave)' }}>
            {f['BARRIO/VEREDA'] || f['BARRIO'] || '—'}
            {f['COMUNA'] && ` · C${f['COMUNA']}`}
          </div>
          <div style={{ fontSize: 11, color: 'var(--texto-suave)', marginTop: 4, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {f['FECHA DE VISITA'] && <span>{formatearFecha(f['FECHA DE VISITA'])}</span>}
            {f['VISITADOR(ES)'] && <span><span style={{ opacity: 0.7 }}>Inspector:</span> {(f['VISITADOR(ES)'] || '').split(/[\/,]/)[0].trim()}</span>}
            {f['FECHA ASIGNACION VISITA'] && <span><span style={{ opacity: 0.7 }}>Asignado:</span> {formatearFecha(f['FECHA ASIGNACION VISITA'])}</span>}
          </div>
        </div>
        <span className={'badge-suave ' + tonoCls}>{est || '—'}</span>
      </div>

      {/* ── Botones de acción ── */}
      <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
        {/* PENDIENTE: botón Iniciar + Asignar (admin) */}
        {est === 'PENDIENTE' && onContinuar && (
          <button type="button" onClick={() => onContinuar(f._idx, f)} disabled={busy}
            className="btn-principal verde"
            style={{ flex: 1, minWidth: 100, margin: 0, padding: '8px 12px', fontSize: 12 }}>
            ▶ Iniciar visita
          </button>
        )}
        {est === 'PENDIENTE' && esAdmin && (
          <button type="button" onClick={onAbrirAsignar} disabled={busy} style={{
            flex: 1, minWidth: 100, background: 'var(--gris-bg)', color: 'var(--texto)',
            border: '1px solid var(--borde)', borderRadius: 10, padding: '8px 12px',
            fontFamily: 'inherit', fontSize: 12, fontWeight: 600,
            cursor: busy ? 'not-allowed' : 'pointer',
          }}>{busy ? '...' : (abierto ? 'Cancelar' : 'Asignar')}</button>
        )}

        {/* ASIGNADO / INICIADO: Continuar + Reasignar + Desasignar + Completar (admin) */}
        {(est === 'ASIGNADO' || est === 'INICIADO') && onContinuar && (
          <button type="button" onClick={() => onContinuar(f._idx, f)} disabled={busy}
            className="btn-principal verde"
            style={{ flex: 1, minWidth: 100, margin: 0, padding: '8px 12px', fontSize: 12 }}>
            ▶ {est === 'INICIADO' ? 'Continuar' : 'Iniciar'}
          </button>
        )}
        {(est === 'ASIGNADO' || est === 'INICIADO') && esAdmin && (
          <>
            <button type="button" onClick={onAbrirAsignar} disabled={busy} style={{
              flex: 1, minWidth: 100, background: 'var(--gris-bg)', color: 'var(--texto)',
              border: '1px solid var(--borde)', borderRadius: 10, padding: '8px 12px',
              fontFamily: 'inherit', fontSize: 12, fontWeight: 600,
              cursor: busy ? 'not-allowed' : 'pointer',
            }}>{abierto ? 'Cancelar' : 'Reasignar'}</button>
            <button type="button" onClick={() => onDesasignar(f._idx, f['RADICADO'])} disabled={busy} style={{
              flex: 1, minWidth: 100, background: 'var(--gris-bg)', color: 'var(--texto)',
              border: '1px solid var(--borde)', borderRadius: 10, padding: '8px 12px',
              fontFamily: 'inherit', fontSize: 12, fontWeight: 600,
              cursor: busy ? 'not-allowed' : 'pointer',
            }}>↩ Desasignar</button>
          </>
        )}
        {est === 'INICIADO' && esAdmin && (
          <button type="button" onClick={() => onCompletar(f._idx, f['FECHA ASIGNACION VISITA'])} disabled={busy}
            className="btn-principal verde"
            style={{ flex: 1, minWidth: 100, margin: 0, padding: '8px 12px', fontSize: 12 }}>
            ✓ Completar
          </button>
        )}

        {/* COMPLETADO: ver entregables + modal solo-lectura con todos los campos */}
        {est === 'COMPLETADO' && (() => {
          var linkDrive    = f['LINK_DRIVE'];
          var linkActaPdf  = f['LINK_PDF_ACTA'] || f['LINK_XLSX_ACTA'];
          var linkInforme  = f['LINK_DOCX_INFORME'] || f['LINK_INFORME_F43'];
          var btnSty = {
            background: 'var(--gris-bg)', color: 'var(--texto)',
            border: '1px solid var(--borde)', borderRadius: 10,
            padding: '8px 12px', fontFamily: 'inherit', fontSize: 12, fontWeight: 600,
            cursor: 'pointer', textDecoration: 'none', display: 'inline-flex',
            alignItems: 'center', gap: 6, flex: 1, minWidth: 100,
            justifyContent: 'center',
          };
          return <>
            <button type="button" onClick={() => window.abrirVisitaDetail && window.abrirVisitaDetail(f)}
              className="btn-principal verde"
              style={{ flex: 1, minWidth: 100, margin: 0, padding: '8px 12px', fontSize: 12 }}>
              👁 Ver datos
            </button>
            {linkDrive && <a href={linkDrive} target="_blank" rel="noopener noreferrer" style={btnSty}>📂 Carpeta</a>}
            {linkActaPdf && <a href={linkActaPdf} target="_blank" rel="noopener noreferrer" style={btnSty}>📄 Acta</a>}
            {linkInforme && <a href={linkInforme} target="_blank" rel="noopener noreferrer" style={btnSty}>📝 Informe</a>}
            {esAdmin && onAsignarNuevaVisita && (
              <button type="button" onClick={onAbrirAsignar} disabled={busy} style={{
                flex: 1, minWidth: 100, background: 'var(--gris-bg)', color: 'var(--texto)',
                border: '1px dashed var(--brand-accent)', borderRadius: 10, padding: '8px 12px',
                fontFamily: 'inherit', fontSize: 12, fontWeight: 600,
                cursor: busy ? 'not-allowed' : 'pointer',
              }}>{abierto ? 'Cancelar' : '+ Nueva visita'}</button>
            )}
          </>;
        })()}
      </div>

      {/* ── Panel de selección de inspector (asignar/reasignar/nueva visita) ── */}
      {abierto && esAdmin && inspectores && inspectores.length > 0 && (
        <div style={{
          marginTop: 10, padding: 10, background: 'var(--gris-bg)', borderRadius: 8,
          display: 'flex', flexDirection: 'column', gap: 6,
        }}>
          <div style={{ fontSize: 11, color: 'var(--texto-suave)', marginBottom: 2 }}>
            {est === 'COMPLETADO' ? 'Crear nueva visita y asignar a:' : 'Asignar a:'}
          </div>
          {inspectores.map(i => (
            <button key={i.nombre} type="button"
              onClick={() => {
                // Para COMPLETADO crea fila nueva; para los demás re-asigna la misma fila.
                if (est === 'COMPLETADO' && onAsignarNuevaVisita) {
                  onAsignarNuevaVisita(f._idx, i.nombre);
                } else {
                  onAsignar(f._idx, i.nombre);
                }
              }} disabled={busy} style={{
              background: 'var(--superficie)', border: '1px solid var(--borde)', borderRadius: 6,
              padding: '8px 10px', fontFamily: 'inherit', fontSize: 13, textAlign: 'left',
              cursor: busy ? 'not-allowed' : 'pointer',
            }}>
              {i.nombre}
              {i.cargo && <span style={{ color: 'var(--texto-suave)', fontSize: 11 }}> · {i.cargo}</span>}
            </button>
          ))}
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
