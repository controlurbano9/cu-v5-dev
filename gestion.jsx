// ═══════════════════════════════════════════════════════════════
// v6/gestion.jsx — Gestión de radicados (ADMIN)
//   - Lista BD VISITAS filtrable por estado y texto libre
//   - Asignar / Reasignar / Desasignar / Completar
//   - Reemplazos: confirm → appConfirm; alert → appAlert
//   - leerVisitas usa caché (60s). Recarga manual fuerza refetch.
//   - Mutaciones invalidan caché de visitas.
// ═══════════════════════════════════════════════════════════════
const { useState: useStateGE, useEffect: useEffectGE, useMemo: useMemoGE } = React;

function _hoyDDMMYYYY_g() {
  const d = new Date();
  return String(d.getDate()).padStart(2, '0') + '/' +
         String(d.getMonth() + 1).padStart(2, '0') + '/' + d.getFullYear();
}
function _calcularDias_g(fechaAsig) {
  if (!fechaAsig) return '';
  const p = fechaAsig.split('/');
  if (p.length !== 3) return '';
  const dA = new Date(+p[2], +p[1] - 1, +p[0]);
  return Math.ceil((Date.now() - dA.getTime()) / 86400000);
}

function GestionScreen({ usuario, onContinuar }) {
  if (usuario.rol !== 'ADMIN') {
    return <div className="card" style={{ margin: 16 }}>Acceso restringido (solo ADMIN).</div>;
  }

  const [datos, setDatos] = useStateGE([]);
  const [inspectores, setInspectores] = useStateGE([]);
  const [cargando, setCargando] = useStateGE(true);
  const [error, setError] = useStateGE('');
  const [q, setQ] = useStateGE('');
  const [estados, setEstados] = useStateGE(['PENDIENTE']);
  const [busy, setBusy] = useStateGE(null);
  const [asignandoFila, setAsignandoFila] = useStateGE(null);

  useEffectGE(() => { cargarTodo(); }, []);

  async function cargarTodo(opts) {
    const forzar = !!(opts && opts.forzar);
    setCargando(true); setError('');
    try {
      const [v, ins] = await Promise.all([
        leerVisitas({ forzar }),
        listarInspectoresActivos({ forzar }),
      ]);
      setDatos(v.datos);
      setInspectores(ins);
    } catch (e) { setError(e.message); }
    setCargando(false);
  }

  const filtrados = useMemoGE(() => {
    const lq = q.trim().toUpperCase();
    return datos.filter(f => {
      const e = normalizarEstado(f['ESTADO VISITA'] || f[13] || '');
      if (estados.length && !estados.includes(e)) return false;
      if (lq) {
        const hay = ['RADICADO', 'DIRECCION', 'BARRIO/VEREDA', 'BARRIO', 'VISITADOR(ES)']
          .some(k => (f[k] || '').toString().toUpperCase().includes(lq));
        if (!hay) return false;
      }
      return true;
    });
  }, [datos, q, estados]);

  function toggleEstado(e) {
    setEstados(estados.includes(e) ? estados.filter(x => x !== e) : [...estados, e]);
  }

  async function asignar(fila, inspector) {
    setBusy(fila);
    try {
      await gasGet({
        accion: 'asignarRadicado', fila, inspector,
        fechaAsignacion: _hoyDDMMYYYY_g(),
      });
      invalidarCache('visitas');
      setAsignandoFila(null);
      await cargarTodo({ forzar: true });
    } catch (e) { await appAlert('Error: ' + e.message, { titulo: 'Error' }); }
    setBusy(null);
  }

  async function desasignar(fila, rad) {
    const ok = await appConfirm(
      `¿Quitar asignación de ${rad}?\nVolverá a estado PENDIENTE.`,
      { titulo: 'Desasignar', btnOk: 'Desasignar' }
    );
    if (!ok) return;
    setBusy(fila);
    try {
      await gasGet({ accion: 'desasignarRadicado', fila });
      invalidarCache('visitas');
      await cargarTodo({ forzar: true });
    } catch (e) { await appAlert('Error: ' + e.message, { titulo: 'Error' }); }
    setBusy(null);
  }

  async function completar(fila, fechaAsig) {
    const ok = await appConfirm('¿Marcar como COMPLETADO?', {
      titulo: 'Completar visita', btnOk: 'Completar',
    });
    if (!ok) return;
    setBusy(fila);
    try {
      await gasGet({
        accion: 'completarRegistro', fila,
        dias: _calcularDias_g(fechaAsig),
        fecha: _hoyDDMMYYYY_g(),
      });
      invalidarCache('visitas');
      await cargarTodo({ forzar: true });
    } catch (e) { await appAlert('Error: ' + e.message, { titulo: 'Error' }); }
    setBusy(null);
  }

  return (
    <div className="pantalla activa pad-bottom">
      <div className="page-title" style={{ marginBottom: 16 }}>Gestión</div>

      <div className="card" style={{ marginBottom: 12 }}>
        <input type="text" className="input-campo" placeholder="Radicado, dirección, barrio, visitador..."
          value={q} onChange={e => setQ(e.target.value)} style={{ marginBottom: 10 }} />

        <div className="filtros-estado">
          {[
            { k: 'PENDIENTE',  l: 'Pendientes',  cl: 'activo-pendiente' },
            { k: 'ASIGNADO',   l: 'Asignados',   cl: 'activo-iniciado' },
            { k: 'INICIADO',   l: 'Iniciados',   cl: 'activo-iniciado' },
            { k: 'COMPLETADO', l: 'Completados', cl: 'activo-completado' },
          ].map(e => (
            <button key={e.k}
              className={'btn-filtro' + (estados.includes(e.k) ? ' ' + e.cl : '')}
              onClick={() => toggleEstado(e.k)}>{e.l}</button>
          ))}
        </div>

        <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, color: 'var(--texto-suave)' }}>
            {filtrados.length} de {datos.length}
          </span>
          <button onClick={() => cargarTodo({ forzar: true })} style={{
            marginLeft: 'auto', background: 'var(--gris-bg)', border: '1px solid var(--borde)',
            borderRadius: 8, padding: '4px 10px', fontFamily: 'inherit', fontSize: 11, cursor: 'pointer',
          }}>Recargar</button>
        </div>
      </div>

      {cargando && <div className="cargando"><div className="spinner"></div>Cargando registros...</div>}
      {error && <div className="card" style={{ color: 'var(--rojo)' }}>Error: {error}</div>}
      {!cargando && !error && filtrados.length === 0 && (
        <div className="card" style={{ textAlign: 'center', color: 'var(--texto-suave)', padding: 24, fontSize: 13 }}>
          No hay registros.
        </div>
      )}

      {!cargando && !error && filtrados.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filtrados.slice(0, 80).map(f => (
            <FilaGestion key={f._idx} f={f}
              busy={busy === f._idx}
              inspectores={inspectores}
              abierto={asignandoFila === f._idx}
              onAbrirAsignar={() => setAsignandoFila(asignandoFila === f._idx ? null : f._idx)}
              onAsignar={ins => asignar(f._idx, ins)}
              onDesasignar={() => desasignar(f._idx, f['RADICADO'])}
              onCompletar={() => completar(f._idx, f['FECHA ASIGNACION VISITA'])}
              onContinuar={onContinuar} />
          ))}
          {filtrados.length > 80 && (
            <div style={{ textAlign: 'center', color: 'var(--texto-suave)', fontSize: 11, padding: 8 }}>
              Mostrando los primeros 80. Refina la búsqueda para ver más.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function FilaGestion({ f, busy, inspectores, abierto, onAbrirAsignar, onAsignar, onDesasignar, onCompletar, onContinuar }) {
  const est = normalizarEstado(f['ESTADO VISITA'] || f[13] || '');
  const tono = {
    PENDIENTE:  { bg: 'rgba(184,135,58,0.14)',  fg: '#8A6628' },
    ASIGNADO:   { bg: 'rgba(74,108,140,0.14)',  fg: '#3F5C78' },
    INICIADO:   { bg: 'rgba(74,108,140,0.14)',  fg: '#3F5C78' },
    COMPLETADO: { bg: 'rgba(107,122,58,0.14)',  fg: '#516028' },
  }[est] || { bg: 'var(--gris-bg)', fg: 'var(--texto-suave)' };

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
            {f['BARRIO/VEREDA'] || f['BARRIO'] || '—'} {f['COMUNA'] && `· C${f['COMUNA']}`}
          </div>
          {f['VISITADOR(ES)'] && (
            <div style={{ fontSize: 11, color: 'var(--texto-suave)', marginTop: 4 }}>
              <span style={{ opacity: 0.7 }}>Visitador:</span> {f['VISITADOR(ES)']}
              {f['FECHA ASIGNACION VISITA'] && ` · ${f['FECHA ASIGNACION VISITA']}`}
            </div>
          )}
        </div>
        <span style={{
          background: tono.bg, color: tono.fg, fontSize: 10, fontWeight: 700,
          padding: '3px 8px', borderRadius: 10, whiteSpace: 'nowrap',
        }}>{est || '—'}</span>
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
        {est === 'PENDIENTE' && (
          <button onClick={onAbrirAsignar} disabled={busy} className="btn-principal verde"
            style={{ flex: 1, margin: 0, padding: '8px 12px', fontSize: 13, minWidth: 120 }}>
            {busy ? '...' : (abierto ? 'Cancelar' : 'Asignar')}
          </button>
        )}
        {(est === 'ASIGNADO' || est === 'INICIADO') && (
          <>
            {onContinuar && (
              <button onClick={() => onContinuar(f._idx, f)} disabled={busy} className="btn-principal verde"
                style={{ flex: 1, minWidth: 120, margin: 0, padding: '8px 12px', fontSize: 13 }}>
                ▶ {est === 'INICIADO' ? 'Continuar' : 'Iniciar'}
              </button>
            )}
            <button onClick={onAbrirAsignar} disabled={busy} style={{
              flex: 1, minWidth: 120, background: 'var(--gris-bg)', color: 'var(--texto)',
              border: '1px solid var(--borde)', borderRadius: 10, padding: '8px 12px',
              fontFamily: 'inherit', fontSize: 13, fontWeight: 600, cursor: busy ? 'not-allowed' : 'pointer',
            }}>{abierto ? 'Cancelar' : 'Reasignar'}</button>
            <button onClick={onDesasignar} disabled={busy} style={{
              flex: 1, minWidth: 120, background: 'var(--gris-bg)', color: 'var(--texto)',
              border: '1px solid var(--borde)', borderRadius: 10, padding: '8px 12px',
              fontFamily: 'inherit', fontSize: 13, fontWeight: 600, cursor: busy ? 'not-allowed' : 'pointer',
            }}>↩ Desasignar</button>
            <button onClick={onCompletar} disabled={busy} className="btn-principal verde"
              style={{ flex: 1, minWidth: 120, margin: 0, padding: '8px 12px', fontSize: 13 }}>
              ✓ Completar
            </button>
          </>
        )}
      </div>

      {abierto && (
        <div style={{
          marginTop: 10, padding: 10, background: 'var(--gris-bg)', borderRadius: 8,
          display: 'flex', flexDirection: 'column', gap: 6,
        }}>
          <div style={{ fontSize: 11, color: 'var(--texto-suave)', marginBottom: 2 }}>
            Asignar a:
          </div>
          {inspectores.map(i => (
            <button key={i.nombre} onClick={() => onAsignar(i.nombre)} disabled={busy} style={{
              background: 'var(--superficie)', border: '1px solid var(--borde)', borderRadius: 6,
              padding: '8px 10px', fontFamily: 'inherit', fontSize: 13, textAlign: 'left',
              cursor: busy ? 'not-allowed' : 'pointer',
            }}>{i.nombre}{i.cargo && <span style={{ color: 'var(--texto-suave)', fontSize: 11 }}> · {i.cargo}</span>}</button>
          ))}
        </div>
      )}
    </div>
  );
}

window.GestionScreen = GestionScreen;

// ── Botón Informe F-43 ──────────────────────────────────────────
// Lanza el modal del generador (escritorio) o pestaña nueva (móvil).
// Toma los datos disponibles del row para hacer prefill.
function BtnInformeF43({ f, full }) {
  function abrir() {
    const idCarpeta = extraerIdCarpetaDrive(f['LINK_DRIVE'] || f['LINK DRIVE'] || f[55] || '');
    // El primer visitador si vienen varios separados por coma.
    const visitador = (f['VISITADOR(ES)'] || '').split(',')[0].trim();
    window.abrirInformeF43({
      fila: f._idx,
      idCarpeta,
      radicado: f['RADICADO'] || '',
      direccion: f['DIRECCION'] || '',
      barrio: f['BARRIO/VEREDA'] || f['BARRIO'] || '',
      comuna: f['COMUNA'] || '',
      fechaVisita: f['FECHA VISITA'] || '',
      inspector: visitador,
      catastral: f['CATASTRAL'] || f['FICHA CATASTRAL'] || '',
      lat: f['LATITUD'] || '',
      lon: f['LONGITUD'] || '',
    });
  }
  return (
    <button onClick={abrir} title="Generar informe F-GGO-43" style={{
      flex: full ? 1 : undefined,
      background: 'var(--brand-bg)', color: 'var(--brand-ink)',
      border: '1px solid var(--brand-accent)', borderRadius: 10,
      padding: '8px 12px', fontFamily: 'inherit', fontSize: 13, fontWeight: 600,
      cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6,
    }}>📄 Informe F-43</button>
  );
}
window.BtnInformeF43 = BtnInformeF43;
