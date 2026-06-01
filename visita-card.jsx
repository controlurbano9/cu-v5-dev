// ═══════════════════════════════════════════════════════════════
// visita-card.jsx — Componentes compartidos para "tarjeta de visita"
//
// Antes había 3 implementaciones casi idénticas:
//   home.jsx (asignadas hoy)        — variante compacta
//   mis-visitas.jsx (TarjetaVisitaMV) — variante con fecha
//   buscar.jsx (FilaVisitaBase)     — variante con fecha+inspector+asignado+botones admin
//
// Acá los unificamos. VisitaCard solo dibuja header (radicado+dir+badge+meta);
// los botones se pasan como children. Helpers separados:
//   BotonContinuarVisita      ▶ Iniciar / Continuar (verde secundario)
//   BotonesEntregables        👁 Ver datos + 📂 Carpeta + 📄 Acta + 📝 Informe
//   BotonesAdminVisita        Asignar / Reasignar / Desasignar / Completar / + Nueva visita
//   PanelSeleccionInspector   Panel inline de elección de inspector (abierto=true)
//
// NO wrapper interno — el caller decide cómo envolver (.card / borderTop / borderBottom).
// Esto permite reusar el mismo componente dentro de acordeones, grupos, listas planas, etc.
// ═══════════════════════════════════════════════════════════════

// ── Tonos por estado para badge-suave ─────────────────────────
// Capitalizado en español, igual que mis-visitas.jsx
const TONOS_VISITA = {
  PENDIENTE:  { cls: 'badge-amarillo', label: 'Pendiente' },
  ASIGNADO:   { cls: 'badge-amarillo', label: 'Asignada' },
  INICIADO:   { cls: 'badge-azul',     label: 'Iniciada' },
  COMPLETADO: { cls: 'badge-verde',    label: 'Completada' },
};

// Diligenciador = primer nombre en VISITADOR(ES) separado por "/" o ","
function _primerVisitador(f) {
  return (f['VISITADOR(ES)'] || '').split(/[\/,]/)[0].trim();
}

// ═══════════════════════════════════════════════════════════════
// VisitaCard — header de tarjeta de visita (info + badge + meta).
//
// NO envuelve en wrapper externo. El caller decide:
//   <div className="card">...<VisitaCard .../>...</div>
//   <div style={{ borderBottom: ... }}><VisitaCard ... /></div>
//
// Props:
//   f                fila de datos del Sheet (objeto plano)
//   mostrarFecha     bool — meta línea "Fecha: dd/mm/yyyy"
//   mostrarInspector bool — meta línea "Inspector: <primero>"
//   mostrarAsignado  bool — meta línea "Asignado: dd/mm/yyyy"
//   labelBadge       string opcional override del label del badge
//                    (ej: en home pasamos 'Asignada' fijo aunque sea PENDIENTE/ASIGNADO)
//   children         JSX adicional (botones, panel) — se renderiza debajo del header
//   accionesMt       margin-top del bloque de children (default 12)
// ═══════════════════════════════════════════════════════════════
function VisitaCard({ f, mostrarFecha, mostrarInspector, mostrarAsignado, labelBadge, children, accionesMt }) {
  const est = normalizarEstado(f['ESTADO VISITA'] || f[13] || '');
  const tono = TONOS_VISITA[est] || { cls: '', label: est || '—' };
  const textoBadge = labelBadge != null ? labelBadge : tono.label;

  const fechaVisita = mostrarFecha
    ? formatearFecha(f['FECHA DE VISITA'] || f['FECHA ASIGNACION VISITA'] || '')
    : '';
  const fechaAsig = mostrarAsignado
    ? formatearFecha(f['FECHA ASIGNACION VISITA'] || '')
    : '';
  const inspector = mostrarInspector && f['VISITADOR(ES)']
    ? _primerVisitador(f)
    : '';

  const tieneMeta = fechaVisita || inspector || fechaAsig;
  const mt = (accionesMt != null) ? accionesMt : 12;

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Radicado en mono terracota — ancla visual */}
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: 12,
            fontWeight: 600, color: 'var(--brand-accent)',
          }}>
            {f['RADICADO'] || '—'}
          </div>

          {/* Dirección — bold, principal */}
          <div style={{ fontSize: 14, fontWeight: 600, marginTop: 4 }}>
            {f['DIRECCION INFRACCION'] || f['DIRECCION'] || 'Sin dirección'}
          </div>

          {/* Barrio · Comuna — siempre presente */}
          <div style={{ fontSize: 11, color: 'var(--texto-suave)', marginTop: 4 }}>
            {f['BARRIO/VEREDA'] || f['BARRIO'] || '—'}
            {f['COMUNA'] && (' · C' + f['COMUNA'])}
          </div>

          {/* Meta opcional: fecha + inspector + asignado en una sola línea */}
          {tieneMeta && (
            <div style={{
              fontSize: 11, color: 'var(--texto-suave)', marginTop: 4,
              display: 'flex', gap: 8, flexWrap: 'wrap',
            }}>
              {fechaVisita && <span><span style={{ opacity: 0.7 }}>Fecha:</span> {fechaVisita}</span>}
              {inspector   && <span><span style={{ opacity: 0.7 }}>Inspector:</span> {inspector}</span>}
              {fechaAsig   && <span><span style={{ opacity: 0.7 }}>Asignado:</span> {fechaAsig}</span>}
            </div>
          )}
        </div>

        {/* Badge de estado a la derecha */}
        <span className={'badge-suave ' + tono.cls}>{textoBadge}</span>
      </div>

      {/* Children: botones, panel admin, lo que sea */}
      {children && <div style={{ marginTop: mt }}>{children}</div>}
    </>
  );
}

// ═══════════════════════════════════════════════════════════════
// BotonContinuarVisita — botón verde-secundario Iniciar/Continuar
//
// Visible solo si est ≠ COMPLETADO y onContinuar existe.
// Texto cambia según estado: INICIADO → "Continuar", resto → "Iniciar".
//
// Props:
//   f, onContinuar       — datos + callback estándar (fila, datos)
//   busy                 — desactiva el botón
//   tamaño               — 'sm' (en lista compacta: "Iniciar"/"Continuar") |
//                          'md' (default — "Iniciar visita"/"Continuar visita")
// ═══════════════════════════════════════════════════════════════
function BotonContinuarVisita({ f, onContinuar, busy, tamaño }) {
  const est = normalizarEstado(f['ESTADO VISITA'] || f[13] || '');
  if (!onContinuar) return null;
  if (est === 'COMPLETADO') return null;

  const esSm = tamaño === 'sm';
  const texto = est === 'INICIADO'
    ? (esSm ? 'Continuar' : 'Continuar visita')
    : (esSm ? 'Iniciar'   : 'Iniciar visita');

  return (
    <button type="button" onClick={() => onContinuar(f._idx, f)} disabled={busy}
      className="btn-principal secundario"
      style={esSm
        ? { flex: 1, minWidth: 100, margin: 0, padding: '8px 12px', fontSize: 12 }
        : { margin: 0, padding: '10px 14px', fontSize: 13 }
      }>
      <Ico d={ICO.play} size={esSm ? 14 : 16} /> {texto}
    </button>
  );
}

// ═══════════════════════════════════════════════════════════════
// BotonesEntregables — para visitas COMPLETADO
// 👁 Ver datos (siempre) + 📂 Carpeta + 📄 Acta + 📝 Informe (si hay link)
// ═══════════════════════════════════════════════════════════════
function BotonesEntregables({ f }) {
  const linkDrive   = f['LINK_DRIVE'];
  const linkActaPdf = f['LINK_PDF_ACTA'] || f['LINK_XLSX_ACTA'];
  const linkInforme = f['LINK_DOCX_INFORME'] || f['LINK_INFORME_F43'];

  // Mismo estilo que tenían home/mis-visitas/buscar antes (pill gris-bg)
  const btnSty = {
    background: 'var(--gris-bg)', color: 'var(--texto)',
    border: '1px solid var(--borde)', borderRadius: 10,
    padding: '8px 12px', fontFamily: 'inherit', fontSize: 12, fontWeight: 600,
    cursor: 'pointer', textDecoration: 'none', display: 'inline-flex',
    alignItems: 'center', gap: 6, flex: 1, minWidth: 100,
    justifyContent: 'center',
  };

  return (
    <>
      <button type="button"
        onClick={() => window.abrirVisitaDetail && window.abrirVisitaDetail(f)}
        className="btn-principal secundario"
        style={{ flex: 1, minWidth: 100, margin: 0, padding: '8px 12px', fontSize: 12 }}>
        <Ico d={ICO.eye} size={14} /> Ver datos
      </button>
      {linkDrive   && <a href={linkDrive}   target="_blank" rel="noopener noreferrer" style={btnSty}><Ico d={ICO.folder}   size={14} /> Carpeta</a>}
      {linkActaPdf && <a href={linkActaPdf} target="_blank" rel="noopener noreferrer" style={btnSty}><Ico d={ICO.file}     size={14} /> Acta</a>}
      {linkInforme && <a href={linkInforme} target="_blank" rel="noopener noreferrer" style={btnSty}><Ico d={ICO.fileEdit} size={14} /> Informe</a>}
    </>
  );
}

// ═══════════════════════════════════════════════════════════════
// BotonesAdminVisita — botones admin contextuales según estado
//
// Aparecen SIDE-BY-SIDE con BotonContinuarVisita / BotonesEntregables.
// El caller decide envolverlos en el mismo flex row.
//
// Matriz de visibilidad:
//   PENDIENTE   → Asignar
//   ASIGNADO    → Reasignar + Desasignar
//   INICIADO    → Reasignar + Desasignar + Completar
//   COMPLETADO  → + Nueva visita (solo si onAsignarNuevaVisita existe)
//
// Estados:
//   busy=true   → todos disabled, "..." en Asignar (pendiente)
//   abierto=true → texto cambia a "Cancelar" en Asignar/Reasignar/Nueva visita
//
// Props:
//   f, esAdmin, busy, abierto
//   onAbrirAsignar          toggle del panel
//   onDesasignar(fila, rad) callback
//   onCompletar(fila, fechaAsig) callback
//   onAsignarNuevaVisita    callback (presencia define si "+Nueva visita" se muestra)
// ═══════════════════════════════════════════════════════════════
function BotonesAdminVisita({ f, esAdmin, busy, abierto,
  onAbrirAsignar, onDesasignar, onCompletar, onAsignarNuevaVisita }) {
  if (!esAdmin) return null;
  const est = normalizarEstado(f['ESTADO VISITA'] || f[13] || '');

  // Estilo base de botón gris (legacy del refactor)
  function btnGris(extra) {
    return Object.assign({
      flex: 1, minWidth: 100,
      background: 'var(--gris-bg)', color: 'var(--texto)',
      border: '1px solid var(--borde)', borderRadius: 10,
      padding: '8px 12px',
      fontFamily: 'inherit', fontSize: 12, fontWeight: 600,
      cursor: busy ? 'not-allowed' : 'pointer',
    }, extra || {});
  }

  return (
    <>
      {/* PENDIENTE: Asignar */}
      {est === 'PENDIENTE' && (
        <button type="button" onClick={onAbrirAsignar} disabled={busy} style={btnGris()}>
          {busy ? '...' : (abierto ? 'Cancelar' : 'Asignar')}
        </button>
      )}

      {/* ASIGNADO / INICIADO: Reasignar + Desasignar */}
      {(est === 'ASIGNADO' || est === 'INICIADO') && (
        <>
          <button type="button" onClick={onAbrirAsignar} disabled={busy} style={btnGris()}>
            {abierto ? 'Cancelar' : 'Reasignar'}
          </button>
          <button type="button" onClick={() => onDesasignar(f._idx, f['RADICADO'])} disabled={busy}
            style={btnGris({ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 })}>
            <Ico d={ICO.undo} size={14} /> Desasignar
          </button>
        </>
      )}

      {/* INICIADO: Completar */}
      {est === 'INICIADO' && (
        <button type="button"
          onClick={() => onCompletar(f._idx, f['FECHA ASIGNACION VISITA'])} disabled={busy}
          className="btn-principal secundario"
          style={{ flex: 1, minWidth: 100, margin: 0, padding: '8px 12px', fontSize: 12 }}>
          <Ico d={ICO.check} size={14} /> Completar
        </button>
      )}

      {/* COMPLETADO: + Nueva visita (solo si la pantalla soporta) */}
      {est === 'COMPLETADO' && onAsignarNuevaVisita && (
        <button type="button" onClick={onAbrirAsignar} disabled={busy}
          style={btnGris({ border: '1px dashed var(--brand-accent)' })}>
          {abierto ? 'Cancelar' : '+ Nueva visita'}
        </button>
      )}
    </>
  );
}

// ═══════════════════════════════════════════════════════════════
// PanelSeleccionInspector — panel inline (abierto=true) con la lista
// de inspectores. Click llama onAsignar o onAsignarNuevaVisita según
// estado de la fila.
//
// Va DEBAJO del row de botones (no inline con ellos).
//
// Props:
//   f, busy, abierto, inspectores
//   onAsignar(fila, nombre)              — usado para PENDIENTE/ASIGNADO/INICIADO
//   onAsignarNuevaVisita(fila, nombre)   — usado solo para COMPLETADO
// ═══════════════════════════════════════════════════════════════
function PanelSeleccionInspector({ f, busy, abierto, inspectores,
  onAsignar, onAsignarNuevaVisita }) {
  if (!abierto || !inspectores || inspectores.length === 0) return null;
  const est = normalizarEstado(f['ESTADO VISITA'] || f[13] || '');

  return (
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
            // COMPLETADO crea fila nueva; los demás reasignan la misma fila
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
  );
}

// Exponer al scope global del bundle (mismo patrón que el resto de los componentes)
window.VisitaCard              = VisitaCard;
window.BotonContinuarVisita    = BotonContinuarVisita;
window.BotonesEntregables      = BotonesEntregables;
window.BotonesAdminVisita      = BotonesAdminVisita;
window.PanelSeleccionInspector = PanelSeleccionInspector;
