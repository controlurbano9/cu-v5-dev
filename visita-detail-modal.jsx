// ═══════════════════════════════════════════════════════════════
// v6/visita-detail-modal.jsx — Modal solo-lectura con los datos del
// formulario de una visita ya completada (o cualquier estado).
//
// API global:
//   window.abrirVisitaDetail(filaBD)
//
// Recibe el objeto crudo de BD VISITAS (mismo shape que devuelve
// listarVisitas), por lo que las claves son los nombres de columna
// del Sheet (en MAYÚSCULAS, sin tildes salvo "Ó" en "DIRECCIÓN").
// No edita; solo muestra valores con secciones colapsables.
// ═══════════════════════════════════════════════════════════════
const { useState: useStateVD, useEffect: useEffectVD } = React;

let _pushVisitaDetail = null;

function VisitaDetailModalHost() {
  const [fila, setFila] = useStateVD(null);

  useEffectVD(() => {
    _pushVisitaDetail = function(f) { setFila(f); };
    return function() { _pushVisitaDetail = null; };
  }, []);

  useEffectVD(() => {
    if (!fila) return;
    function onKey(e) { if (e.key === 'Escape') setFila(null); }
    window.addEventListener('keydown', onKey);
    return function() { window.removeEventListener('keydown', onKey); };
  }, [fila]);

  if (!fila) return null;
  return <VisitaDetailUI f={fila} onCerrar={() => setFila(null)} />;
}

// ── Helpers de lectura tolerante a variantes de nombre de columna ──
function _g(f, ...keys) {
  for (const k of keys) {
    if (f && f[k] != null && f[k] !== '') return f[k];
  }
  return '';
}
function _fmt(v) {
  if (v == null || v === '') return '—';
  // Fecha tipo "2026-05-19T..." → formato local
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v)) {
    try { return typeof formatearFecha === 'function' ? formatearFecha(v) : v; } catch (e) {}
  }
  return String(v);
}
function _siNo(v) {
  if (!v) return '—';
  const s = String(v).toUpperCase().trim();
  if (s === 'SI' || s === 'SÍ') return 'Sí';
  if (s === 'NO') return 'No';
  return v;
}

function VisitaDetailUI({ f, onCerrar }) {
  // Separar actuación y conclusiones (almacenadas juntas en BD col AU = índice 46)
  const _rawAct = _g(f, 'ACTUACION / OBSERVACIONES', 'ACTUACION', 46);
  const _parts = String(_rawAct || '').split('\n══CONCLUSIONES══\n');
  const actuacion = _parts[0] || '';
  const obsConclusion = _parts[1] || '';

  const estado = String(_g(f, 'ESTADO VISITA') || '').toUpperCase();
  const linkDrive = _g(f, 'LINK_DRIVE');
  const linkPdf = _g(f, 'LINK_PDF_ACTA');
  const linkXlsx = _g(f, 'LINK_XLSX_ACTA');
  const linkInforme = _g(f, 'LINK_DOCX_INFORME', 'LINK_INFORME_F43');
  const linkVigilancia = _g(f, 'LINK_SOLICITUD_VIGILANCIA');

  return (
    <div onClick={(e) => { if (e.target === e.currentTarget) onCerrar(); }} style={{
      position: 'fixed', inset: 0, background: 'rgba(31,27,22,0.55)',
      zIndex: 9000, padding: '24px 28px',
      display: 'flex', flexDirection: 'column',
      backdropFilter: 'blur(2px)',
    }}>
      <div style={{
        background: 'var(--superficie, #FFFBF5)',
        borderRadius: 14, boxShadow: 'var(--sombra, 0 10px 30px rgba(0,0,0,0.2))',
        maxWidth: 920, width: '100%', maxHeight: '90vh',
        margin: '0 auto', display: 'flex', flexDirection: 'column',
        border: '1px solid var(--borde, rgba(31,27,22,0.08))',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px',
          borderBottom: '1px solid var(--borde, rgba(31,27,22,0.08))',
        }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8, background: 'var(--brand-bg, #FBE9E0)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--brand-ink, #8A3F26)', fontFamily: 'var(--font-serif)',
            fontSize: 13, fontWeight: 700,
          }}>V</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: 'var(--font-serif)', fontSize: 16, fontWeight: 600, color: 'var(--texto, #1F1B16)' }}>
              Detalle de visita
            </div>
            <div style={{ fontSize: 11, color: 'var(--texto-suave, #5C5142)', fontFamily: 'var(--font-mono)' }}>
              {_g(f, 'RADICADO') || '—'} · {_fmt(_g(f, 'FECHA DE VISITA'))}
              {estado && <span style={{ marginLeft: 8, padding: '1px 7px', borderRadius: 8, background: 'var(--verde-bg)', color: 'var(--verde-dark)', fontFamily: 'inherit', fontSize: 10, fontWeight: 700 }}>{estado}</span>}
            </div>
          </div>
          <button onClick={onCerrar} aria-label="Cerrar" title="Cerrar (Esc)" style={{
            background: 'transparent', border: '1px solid var(--borde-med, rgba(31,27,22,0.16))',
            color: 'var(--texto-suave, #5C5142)', borderRadius: 8, padding: '6px 10px',
            fontFamily: 'inherit', fontSize: 16, cursor: 'pointer', lineHeight: 1,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          }}><Icon.Close size={16} /></button>
        </div>

        {/* Body scrollable */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>

          {/* Links a entregables (si los hay) */}
          {(linkDrive || linkPdf || linkXlsx || linkInforme || linkVigilancia) && (
            <_SeccionVD titulo="Entregables">
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {linkDrive    && <_LinkBtnVD href={linkDrive}     Icono={Icon.Folder} label="Carpeta Drive" />}
                {linkPdf      && <_LinkBtnVD href={linkPdf}       Icono={Icon.File}   label="Acta (PDF)" />}
                {!linkPdf && linkXlsx && <_LinkBtnVD href={linkXlsx} Icono={Icon.File} label="Acta (Sheet)" />}
                {linkInforme  && <_LinkBtnVD href={linkInforme}   Icono={Icon.Edit}   label="Informe F-43" />}
                {linkVigilancia && <_LinkBtnVD href={linkVigilancia} Icono={Icon.Alert} label="Vigilancia Policía" />}
              </div>
            </_SeccionVD>
          )}

          <_SeccionVD titulo="1. Identificación del caso">
            <_CampoVD l="Radicado"            v={_g(f, 'RADICADO', 1)} />
            <_CampoVD l="Fecha radicado"      v={_fmt(_g(f, 'FECHA RADICADO', 2))} />
            <_CampoVD l="Atención PQR"        v={_g(f, 'ATENCION PQR', 0)} />
            <_CampoVD l="Denunciante"         v={_g(f, 'DENUNCIANTE/REMITENTE', 'DENUNCIANTE', 6)} />
            <_CampoVD l="N° visita"           v={_g(f, 'N° VISITA', 'N VISITA', 16)} />
            <_CampoVD l="Fecha visita"        v={_fmt(_g(f, 'FECHA DE VISITA', 15))} />
            <_CampoVD l="N° orden policía"    v={_g(f, 'N° ORDEN DE POLICIA', 'N ORDEN DE POLICIA', 44)} />
          </_SeccionVD>

          <_SeccionVD titulo="2. Ubicación del inmueble">
            <_CampoVD l="Dirección"           v={_g(f, 'DIRECCION INFRACCION', 'DIRECCION', 3)} />
            <_CampoVD l="Barrio / Vereda"     v={_g(f, 'BARRIO/VEREDA', 'BARRIO', 4)} />
            <_CampoVD l="Comuna"              v={_g(f, 'COMUNA', 5)} />
            <_CampoVD l="Coordenadas"         v={(_g(f, 'LATITUD', 48) && _g(f, 'LONGITUD', 49)) ? `${_g(f, 'LATITUD', 48)}, ${_g(f, 'LONGITUD', 49)}` : '—'} />
            <_CampoVD l="Código catastral"    v={_g(f, 'CODIGO CATASTRAL', 'CATASTRAL', 32)} />
            <_CampoVD l="N° ficha predial"    v={_g(f, 'N° FICHA PREDIAL', 'N FICHA PREDIAL', 33)} />
          </_SeccionVD>

          <_SeccionVD titulo="3. Persona que atiende">
            <_CampoVD l="Nombre"              v={_g(f, 'NOMBRE PERSONA ATIENDE', 7)} />
            <_CampoVD l="Identificación"      v={_g(f, 'ID PERSONA ATIENDE', 8)} />
            <_CampoVD l="Teléfono"            v={_g(f, 'TELEFONO PERSONA ATIENDE', 9)} />
            <_CampoVD l="Relación con el evento" v={_g(f, 'RELACION CON EL EVENTO', 10)} />
            <_CampoVD l="Dirección notificación" v={_g(f, 'DIR NOTIFICACION', 11)} />
            <_CampoVD l="Correo electrónico"  v={_g(f, 'CORREO ELECTRONICO', 12)} />
          </_SeccionVD>

          <_SeccionVD titulo="4. Características de la edificación">
            <_CampoVD l="Estado de la obra"   v={_g(f, 'ESTADO OBRA', 22)} />
            <_CampoVD l="Reparación locativa" v={_siNo(_g(f, 'REPARACION LOCATIVA', 26))} />
            <_CampoVD l="Habitado"            v={_siNo(_g(f, 'HABITADO', 27))} />
            <_CampoVD l="Altura en pisos"     v={_g(f, 'ALTURA EN PISOS', 28)} />
            <_CampoVD l="Destinaciones actuales" v={_g(f, 'N° DESTINACIONES ACTUALES', 'N DESTINACIONES ACTUALES', 29)} />
            <_CampoVD l="Usos actuales"       v={_g(f, 'USOS ACTUALES', 30)} />
            <_CampoVD l="Tipo cubierta actual" v={_g(f, 'TIPO CUBIERTA ACTUAL', 31)} />
          </_SeccionVD>

          <_SeccionVD titulo="5. Verificación documental (licencia)">
            <_CampoVD l="Se aportó licencia"  v={_siNo(_g(f, 'SE APORTO LICENCIA', 35))} />
            <_CampoVD l="N° licencia"         v={_g(f, 'N° LICENCIA', 'N LICENCIA', 34)} />
            <_CampoVD l="Fecha licencia"      v={_fmt(_g(f, 'FECHA LICENCIA', 36))} />
            <_CampoVD l="Tipo y modalidad"    v={_g(f, 'TIPO Y MODALIDAD LICENCIA', 'TIPO Y MODALIDAD', 37)} />
            <_CampoVD l="Pisos aprobados"     v={_g(f, 'PISOS APROBADOS', 38)} />
            <_CampoVD l="Destinaciones"       v={_g(f, 'DESTINACIONES LICENCIA', 39)} />
            <_CampoVD l="Cubierta"            v={_g(f, 'CUBIERTA LICENCIA', 40)} />
            <_CampoVD l="Sistema estructural" v={_g(f, 'SISTEMA ESTRUCTURAL', 'SISTEMA ESTRUCT', 41)} />
            <_CampoVD l="Observaciones licencia" v={_g(f, 'OBS LICENCIA', 42)} ancho />
          </_SeccionVD>

          <_SeccionVD titulo="6. Descripción de la situación encontrada">
            <_CampoLargoVD v={actuacion} />
          </_SeccionVD>

          <_SeccionVD titulo="7. Conclusiones">
            <_CampoVD l="Tipo de contravención" v={_g(f, 'TIPO DE INFRACCION', 23)} ancho />
            <_CampoVD l="Área contravención (m²)" v={_g(f, 'AREA CONTRAVENCION m2', 'AREA CONTRAVENCION M2', 24)} />
            <_CampoVD l="Suspensión de obra" v={_siNo(_g(f, 'SUSPENSION DE LA OBRA', 43))} />
            <_CampoVD l="Cumple retiro quebrada" v={_siNo(_g(f, 'CUMPLE RETIRO QUEBRADA', 25))} />
            <_CampoVD l="Fecha citación"      v={_g(f, 'FECHA CITACION', 45)} />
          </_SeccionVD>

          <_SeccionVD titulo="8. Funcionarios">
            <_CampoVD l="Visitador(es)"       v={_g(f, 'VISITADOR(ES)', 17)} ancho />
            <_CampoVD l="Fecha asignación"    v={_fmt(_g(f, 'FECHA ASIGNACION VISITA', 14))} />
            <_CampoVD l="Fecha devolución"    v={_fmt(_g(f, 'FECHA DEVOLUCION', 20))} />
          </_SeccionVD>

          <_SeccionVD titulo="9. Norma POT">
            <_CampoVD l="Polígono uso suelo"  v={_g(f, 'POLIGONO USO SUELO', 51)} />
            <_CampoVD l="Amenaza natural"     v={_siNo(_g(f, 'AMENAZA', 52))} />
            <_CampoVD l="Suelo de protección" v={_siNo(_g(f, 'SUELO DE PROTECCION', 53))} />
          </_SeccionVD>

          {obsConclusion && (
            <_SeccionVD titulo="10. Observaciones y conclusiones">
              <_CampoLargoVD v={obsConclusion} />
            </_SeccionVD>
          )}

          {/* Debug solo para ADMIN: muestra todos los campos no vacíos
              para diagnosticar cuando algunas secciones aparezcan en blanco.
              Oculto para inspectores regulares para evitar exponer estructura interna. */}
          <_DebugRawVD f={f} solo_admin />
        </div>
      </div>
    </div>
  );
}

function _DebugRawVD({ f, solo_admin }) {
  const [open, setOpen] = useStateVD(false);
  if (!f) return null;
  // Si está marcado solo_admin (default), verificar sesión ADMIN
  if (solo_admin) {
    try {
      var s = (typeof SESSION_V6 !== 'undefined') ? SESSION_V6.leer() : null;
      if (!s || s.rol !== 'ADMIN') return null;
    } catch (e) { return null; }
  }
  // Recolectar pares (clave, valor) — saltar claves numéricas (duplicado)
  // y vacíos. Si los nombres no encajan con los que busca el modal, la
  // lista revela cómo están escritos los headers reales del Sheet.
  const pares = Object.keys(f)
    .filter(k => isNaN(Number(k)) && k !== '_idx')
    .map(k => [k, f[k]])
    .filter(([, v]) => v != null && v !== '');
  return (
    <div style={{ marginTop: 8 }}>
      <button onClick={() => setOpen(!open)} style={{
        background: 'transparent', border: '1px dashed var(--borde-med, rgba(31,27,22,0.16))',
        borderRadius: 8, padding: '6px 10px', fontFamily: 'var(--font-mono)',
        fontSize: 11, color: 'var(--texto-suave, #5C5142)', cursor: 'pointer',
        display: 'inline-flex', alignItems: 'center', gap: 6,
      }}>{open ? <Icon.Chevron size={12} /> : <Icon.ChevronUp size={12} />} Debug — ver datos crudos del Sheet ({pares.length} columnas con valor)</button>
      {open && (
        <div style={{
          marginTop: 8, padding: 10, background: 'var(--gris-bg, #F5F1EB)',
          borderRadius: 8, fontFamily: 'var(--font-mono)', fontSize: 11,
          color: 'var(--texto, #1F1B16)', maxHeight: 280, overflowY: 'auto',
        }}>
          {pares.length === 0
            ? <div style={{ color: 'var(--texto-suave)' }}>La fila no contiene datos por nombre — revisa los headers del Sheet.</div>
            : pares.map(([k, v]) => (
              <div key={k} style={{ display: 'flex', gap: 8, padding: '2px 0', borderBottom: '1px dashed rgba(31,27,22,0.06)' }}>
                <span style={{ fontWeight: 600, minWidth: 220, color: 'var(--brand-ink, #8A3F26)' }}>{k}</span>
                <span style={{ flex: 1, wordBreak: 'break-word' }}>{String(v).slice(0, 200)}</span>
              </div>
            ))
          }
        </div>
      )}
    </div>
  );
}

// ── Subcomponentes ──────────────────────────────────────────────
function _SeccionVD({ titulo, children }) {
  const [open, setOpen] = useStateVD(true);
  return (
    <div style={{ marginBottom: 14, border: '1px solid var(--borde, rgba(31,27,22,0.08))', borderRadius: 10, overflow: 'hidden' }}>
      <div onClick={() => setOpen(!open)} style={{
        padding: '10px 14px', cursor: 'pointer', background: 'var(--gris-bg, #F5F1EB)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        fontSize: 13, fontWeight: 600, color: 'var(--texto, #1F1B16)',
        userSelect: 'none',
      }}>
        <span>{titulo}</span>
        <span style={{ color: 'var(--texto-suave, #5C5142)', display: 'inline-flex' }}>
          {open ? <Icon.ChevronUp size={12} /> : <Icon.Chevron size={12} />}
        </span>
      </div>
      {open && (
        <div style={{ padding: '12px 14px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 13 }}>
          {children}
        </div>
      )}
    </div>
  );
}

function _CampoVD({ l, v, ancho }) {
  return (
    <div style={{
      padding: '8px 10px', borderRadius: 8, background: 'var(--superficie, #FFFBF5)',
      border: '1px solid var(--borde, rgba(31,27,22,0.08))',
      gridColumn: ancho ? 'span 2' : undefined,
    }}>
      <div style={{
        fontSize: 10, color: 'var(--texto-suave, #5C5142)', textTransform: 'uppercase',
        letterSpacing: 0.4, marginBottom: 3,
      }}>{l}</div>
      <div style={{ fontSize: 13, color: 'var(--texto, #1F1B16)', wordBreak: 'break-word' }}>
        {v == null || v === '' ? '—' : v}
      </div>
    </div>
  );
}

function _CampoLargoVD({ v }) {
  return (
    <div style={{
      gridColumn: 'span 2', padding: '10px 12px', borderRadius: 8,
      background: 'var(--superficie, #FFFBF5)',
      border: '1px solid var(--borde, rgba(31,27,22,0.08))',
      fontSize: 13, color: 'var(--texto, #1F1B16)', whiteSpace: 'pre-wrap',
      lineHeight: 1.5, minHeight: 36,
    }}>
      {v || '—'}
    </div>
  );
}

function _LinkBtnVD({ href, Icono, label }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '8px 12px', borderRadius: 8,
      background: 'var(--brand-bg, #FBE9E0)', color: 'var(--brand-ink, #8A3F26)',
      border: '1px solid rgba(138,63,38,0.15)', fontSize: 12, fontWeight: 600,
      textDecoration: 'none', cursor: 'pointer',
    }}>
      <Icono size={14} /> {label} ↗
    </a>
  );
}

// API global ─────────────────────────────────────────────────────
window.abrirVisitaDetail = function(filaBD) {
  if (_pushVisitaDetail) {
    _pushVisitaDetail(filaBD);
  } else {
    // Fallback: si el host no está montado, abrir Drive de la visita
    const link = filaBD && (filaBD['LINK_DRIVE'] || filaBD['LINK_PDF_ACTA']);
    if (link) window.open(link, '_blank', 'noopener');
  }
};

window.VisitaDetailModalHost = VisitaDetailModalHost;
