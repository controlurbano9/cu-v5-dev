// ═══════════════════════════════════════════════════════════════
// v6/agenda.jsx — Agenda diaria (ADMIN)
//   POST obtenerAgenda → { dia, fecha, esRural, manana[], tarde[], totalPendientes }
//   Por ítem: completar (calcula días) / desasignar
//   Reemplazos: confirm → appConfirm; alert → appAlert
//   Mutaciones invalidan la caché de visitas para que el resto de la app vea el cambio.
// ═══════════════════════════════════════════════════════════════
const { useState: useStateG, useEffect: useEffectG } = React;

function AgendaScreen({ usuario }) {
  const [data, setData]         = useStateG(null);
  const [tab, setTab]           = useStateG('manana');
  const [cargando, setCargando] = useStateG(true);
  const [error, setError]       = useStateG('');
  const [busyFila, setBusyFila] = useStateG(null);

  useEffectG(() => { cargar(); }, []);

  if (usuario.rol !== 'ADMIN') {
    return <div className="card" style={{ margin: 16 }}>Acceso restringido (solo ADMIN).</div>;
  }

  async function cargar() {
    setCargando(true); setError('');
    try {
      const d = await gasPost({ accion: 'obtenerAgenda' });
      setData(d);
    } catch (e) { setError(e.message); }
    setCargando(false);
  }

  function _hoyDDMMYYYY() {
    const d = new Date();
    return String(d.getDate()).padStart(2, '0') + '/' +
           String(d.getMonth() + 1).padStart(2, '0') + '/' + d.getFullYear();
  }
  function _calcularDias(fechaAsig) {
    if (!fechaAsig) return '';
    const p = fechaAsig.split('/');
    if (p.length !== 3) return '';
    const dA = new Date(+p[2], +p[1] - 1, +p[0]);
    return Math.ceil((Date.now() - dA.getTime()) / 86400000);
  }

  async function completar(item) {
    const ok = await appConfirm('¿Marcar como COMPLETADO?', {
      titulo: 'Completar visita', btnOk: 'Completar',
    });
    if (!ok) return;
    setBusyFila(item.fila);
    try {
      await gasGet({
        accion: 'completarRegistro',
        fila: item.fila,
        dias: _calcularDias(item.fechaAsignacion),
        fecha: _hoyDDMMYYYY(),
      });
      invalidarCache('visitas');
      await cargar();
    } catch (e) { await appAlert('Error: ' + e.message, { titulo: 'Error' }); }
    setBusyFila(null);
  }

  async function desasignar(item) {
    const ok = await appConfirm(
      `¿Quitar la asignación de ${item.radicado}?\nVolverá a estado PENDIENTE.`,
      { titulo: 'Desasignar', btnOk: 'Desasignar' }
    );
    if (!ok) return;
    setBusyFila(item.fila);
    try {
      await gasGet({ accion: 'desasignarRadicado', fila: item.fila });
      invalidarCache('visitas');
      await cargar();
    } catch (e) { await appAlert('Error: ' + e.message, { titulo: 'Error' }); }
    setBusyFila(null);
  }

  const diasLabel = { lunes: 'Lunes', martes: 'Martes', 'miércoles': 'Miércoles',
    jueves: 'Jueves', viernes: 'Viernes', sábado: 'Sábado', domingo: 'Domingo' };

  return (
    <div className="pantalla activa pad-bottom">
      <div className="page-title" style={{ marginBottom: 16 }}>Agenda del día</div>

      <div className="card" style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div className="card-titulo" style={{ marginBottom: 2 }}>Agenda</div>
            <div style={{ fontSize: 12, color: 'var(--texto-suave)' }}>
              {data
                ? `${diasLabel[data.dia] || data.dia || ''} ${data.fecha || ''}${data.esRural ? ' · Jornada Rural' : ''}`
                : (cargando ? 'Cargando...' : '—')}
            </div>
          </div>
          <button onClick={cargar} title="Regenerar agenda" style={{
            background: 'var(--gris-bg)', border: '1px solid var(--borde)', borderRadius: 8,
            padding: '6px 12px', fontFamily: 'inherit', fontSize: 12, cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', gap: 6,
          }}><Icon.Refresh size={14} /> Recargar</button>
        </div>
      </div>

      {cargando && (
        <div style={{ textAlign: 'center', padding: 48, color: 'var(--texto-suave)', fontSize: 14 }}>
          Cargando agenda...
        </div>
      )}
      {error && (
        <div className="card" style={{ color: 'var(--rojo)' }}>
          Error al cargar agenda: {error}
          <button onClick={cargar} style={{
            marginLeft: 12, background: 'var(--brand-accent)', color: 'white', border: 'none',
            borderRadius: 6, padding: '4px 10px', fontFamily: 'inherit', fontSize: 12, cursor: 'pointer',
          }}>Reintentar</button>
        </div>
      )}

      {!cargando && !error && data && (
        <>
          <div className="agenda-tabs">
            <button className={'agenda-tab' + (tab === 'manana' ? ' activo' : '')} onClick={() => setTab('manana')}>
              Mañana {data.manana && `(${data.manana.length})`}
            </button>
            <button className={'agenda-tab' + (tab === 'tarde' ? ' activo' : '')} onClick={() => setTab('tarde')}>
              Tarde {data.tarde && `(${data.tarde.length})`}
            </button>
          </div>

          <ItemsLista
            items={tab === 'manana' ? (data.manana || []) : (data.tarde || [])}
            busyFila={busyFila}
            onCompletar={completar}
            onDesasignar={desasignar}
          />
        </>
      )}
    </div>
  );
}

function ItemsLista({ items, busyFila, onCompletar, onDesasignar }) {
  if (!items.length) {
    return (
      <div className="card agenda-empty">
        Sin visitas asignadas en esta jornada.
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {items.map((it, i) => (
        <div key={it.fila || i} className="card" style={{ padding: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600, color: 'var(--brand-accent)' }}>
                {it.radicado || '—'}
              </div>
              <div style={{ fontSize: 14, fontWeight: 600, marginTop: 4 }}>
                {it.direccion || 'Sin dirección'}
              </div>
              <div style={{ fontSize: 11, color: 'var(--texto-suave)', marginTop: 4 }}>
                {it.barrio || '—'} {it.comuna && `· C${it.comuna}`}
              </div>
              {it.visitador && (
                <div style={{ fontSize: 11, color: 'var(--texto-suave)', marginTop: 4 }}>
                  <span style={{ opacity: 0.7 }}>Visitador:</span> {it.visitador}
                </div>
              )}
            </div>
            {it.score != null && (() => {
              // Tier por score (1-10): crítico ≥8, alto 6-7, medio 4-5, bajo <4
              const s = Number(it.score);
              const tier = s >= 8 ? 'score-critico'
                         : s >= 6 ? 'score-alto'
                         : s >= 4 ? 'score-medio'
                         : 'score-bajo';
              return (
                <span className={'score-badge ' + tier} style={{ flexShrink: 0 }}>
                  {it.score}
                </span>
              );
            })()}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button onClick={() => onCompletar(it)} disabled={busyFila === it.fila}
              className="btn-principal secundario" style={{ flex: 1, margin: 0, padding: '8px 12px', fontSize: 13 }}>
              {busyFila === it.fila ? '...' : 'Completar'}
            </button>
            <button onClick={() => onDesasignar(it)} disabled={busyFila === it.fila} style={{
              flex: 1, background: 'var(--gris-bg)', color: 'var(--texto)', border: '1px solid var(--borde)',
              borderRadius: 10, padding: '8px 12px', fontFamily: 'inherit', fontSize: 13, fontWeight: 600,
              cursor: busyFila === it.fila ? 'not-allowed' : 'pointer',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}><Icon.Undo size={14} /> Desasignar</button>
          </div>
        </div>
      ))}
    </div>
  );
}

window.AgendaScreen = AgendaScreen;
