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
  // Separar actuación y conclusiones (almacenadas juntas en BD col AU)
  const _rawAct = _g(f, 'ACTUACION / OBSERVACIONES', 'ACTUACION');
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
              {estado && <span style={{ marginLeft: 8, padding: '1px 7px', borderRadius: 8, background: 'rgba(107,122,58,0.14)', color: '#516028', fontFamily: 'inherit', fontSize: 10, fontWeight: 700 }}>{estado}</span>}
            </div>
          </div>
          <button onClick={onCerrar} aria-label="Cerrar" title="Cerrar (Esc)" style={{
            background: 'transparent', border: '1px solid var(--borde-med, rgba(31,27,22,0.16))',
            color: 'var(--texto-suave, #5C5142)', borderRadius: 8, padding: '6px 10px',
            fontFamily: 'inherit', fontSize: 16, cursor: 'pointer', lineHeight: 1,
          }}>✕</button>
        </div>

        {/* Body scrollable */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>

          {/* Links a entregables (si los hay) */}
          {(linkDrive || linkPdf || linkXlsx || linkInforme || linkVigilancia) && (
            <_Seccion titulo="Entregables">
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {linkDrive    && <_LinkBtn href={linkDrive}     emoji="📂" label="Carpeta Drive" />}
                {linkPdf      && <_LinkBtn href={linkPdf}       emoji="📄" label="Acta (PDF)" />}
                {!linkPdf && linkXlsx && <_LinkBtn href={linkXlsx} emoji="📊" label="Acta (Sheet)" />}
                {linkInforme  && <_LinkBtn href={linkInforme}   emoji="📝" label="Informe F-43" />}
                {linkVigilancia && <_LinkBtn href={linkVigilancia} emoji="🚓" label="Vigilancia Policía" />}
              </div>
            </_Seccion>
          )}

          <_Seccion titulo="1. Identificación del caso">
            <_Campo l="Radicado"            v={_g(f, 'RADICADO')} />
            <_Campo l="Fecha radicado"      v={_fmt(_g(f, 'FECHA RADICADO'))} />
            <_Campo l="Atención PQR"        v={_g(f, 'ATENCION PQR')} />
            <_Campo l="Denunciante"         v={_g(f, 'DENUNCIANTE/REMITENTE', 'DENUNCIANTE')} />
            <_Campo l="N° visita"           v={_g(f, 'N° VISITA', 'N VISITA')} />
            <_Campo l="Fecha visita"        v={_fmt(_g(f, 'FECHA DE VISITA'))} />
            <_Campo l="N° orden policía"    v={_g(f, 'N° ORDEN DE POLICIA', 'N ORDEN DE POLICIA')} />
          </_Seccion>

          <_Seccion titulo="2. Ubicación del inmueble">
            <_Campo l="Dirección"           v={_g(f, 'DIRECCION INFRACCION', 'DIRECCION')} />
            <_Campo l="Barrio / Vereda"     v={_g(f, 'BARRIO/VEREDA', 'BARRIO')} />
            <_Campo l="Comuna"              v={_g(f, 'COMUNA')} />
            <_Campo l="Coordenadas"         v={_g(f, 'LATITUD') && _g(f, 'LONGITUD') ? `${_g(f, 'LATITUD')}, ${_g(f, 'LONGITUD')}` : '—'} />
            <_Campo l="Código catastral"    v={_g(f, 'CODIGO CATASTRAL', 'CATASTRAL')} />
            <_Campo l="N° ficha predial"    v={_g(f, 'N° FICHA PREDIAL', 'N FICHA PREDIAL')} />
          </_Seccion>

          <_Seccion titulo="3. Persona que atiende">
            <_Campo l="Nombre"              v={_g(f, 'NOMBRE PERSONA ATIENDE')} />
            <_Campo l="Identificación"      v={_g(f, 'ID PERSONA ATIENDE')} />
            <_Campo l="Teléfono"            v={_g(f, 'TELEFONO PERSONA ATIENDE')} />
            <_Campo l="Relación con el evento" v={_g(f, 'RELACION CON EL EVENTO')} />
            <_Campo l="Dirección notificación" v={_g(f, 'DIR NOTIFICACION')} />
            <_Campo l="Correo electrónico"  v={_g(f, 'CORREO ELECTRONICO')} />
          </_Seccion>

          <_Seccion titulo="4. Características de la edificación">
            <_Campo l="Estado de la obra"   v={_g(f, 'ESTADO OBRA')} />
            <_Campo l="Reparación locativa" v={_siNo(_g(f, 'REPARACION LOCATIVA'))} />
            <_Campo l="Habitado"            v={_siNo(_g(f, 'HABITADO'))} />
            <_Campo l="Altura en pisos"     v={_g(f, 'ALTURA EN PISOS')} />
            <_Campo l="Destinaciones actuales" v={_g(f, 'N° DESTINACIONES ACTUALES', 'N DESTINACIONES ACTUALES')} />
            <_Campo l="Usos actuales"       v={_g(f, 'USOS ACTUALES')} />
            <_Campo l="Tipo cubierta actual" v={_g(f, 'TIPO CUBIERTA ACTUAL')} />
          </_Seccion>

          <_Seccion titulo="5. Verificación documental (licencia)">
            <_Campo l="Se aportó licencia"  v={_siNo(_g(f, 'SE APORTO LICENCIA'))} />
            <_Campo l="N° licencia"         v={_g(f, 'N° LICENCIA', 'N LICENCIA')} />
            <_Campo l="Fecha licencia"      v={_fmt(_g(f, 'FECHA LICENCIA'))} />
            <_Campo l="Tipo y modalidad"    v={_g(f, 'TIPO Y MODALIDAD LICENCIA')} />
            <_Campo l="Pisos aprobados"     v={_g(f, 'PISOS APROBADOS')} />
            <_Campo l="Destinaciones"       v={_g(f, 'DESTINACIONES LICENCIA')} />
            <_Campo l="Cubierta"            v={_g(f, 'CUBIERTA LICENCIA')} />
            <_Campo l="Sistema estructural" v={_g(f, 'SISTEMA ESTRUCTURAL', 'SISTEMA ESTRUCT')} />
            <_Campo l="Observaciones licencia" v={_g(f, 'OBS LICENCIA')} ancho />
          </_Seccion>

          <_Seccion titulo="6. Descripción de la situación encontrada">
            <_CampoLargo v={actuacion} />
          </_Seccion>

          <_Seccion titulo="7. Conclusiones">
            <_Campo l="Tipo de contravención" v={_g(f, 'TIPO DE INFRACCION')} ancho />
            <_Campo l="Área contravención (m²)" v={_g(f, 'AREA CONTRAVENCION m2', 'AREA CONTRAVENCION M2')} />
            <_Campo l="Suspensión de obra" v={_siNo(_g(f, 'SUSPENSION DE LA OBRA'))} />
            <_Campo l="Cumple retiro quebrada" v={_siNo(_g(f, 'CUMPLE RETIRO QUEBRADA'))} />
            <_Campo l="Fecha citación"      v={_g(f, 'FECHA CITACION')} />
          </_Seccion>

          <_Seccion titulo="8. Funcionarios">
            <_Campo l="Visitador(es)"       v={_g(f, 'VISITADOR(ES)')} ancho />
            <_Campo l="Fecha asignación"    v={_fmt(_g(f, 'FECHA ASIGNACION VISITA'))} />
            <_Campo l="Fecha devolución"    v={_fmt(_g(f, 'FECHA DEVOLUCION'))} />
          </_Seccion>

          <_Seccion titulo="9. Norma POT">
            <_Campo l="Polígono uso suelo"  v={_g(f, 'POLIGONO USO SUELO')} />
            <_Campo l="Amenaza natural"     v={_siNo(_g(f, 'AMENAZA'))} />
            <_Campo l="Suelo de protección" v={_siNo(_g(f, 'SUELO DE PROTECCION'))} />
          </_Seccion>

          {obsConclusion && (
            <_Seccion titulo="10. Observaciones y conclusiones">
              <_CampoLargo v={obsConclusion} />
            </_Seccion>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Subcomponentes ──────────────────────────────────────────────
function _Seccion({ titulo, children }) {
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
        <span style={{ color: 'var(--texto-suave, #5C5142)', fontSize: 11 }}>{open ? '▲' : '▼'}</span>
      </div>
      {open && (
        <div style={{ padding: '12px 14px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 13 }}>
          {children}
        </div>
      )}
    </div>
  );
}

function _Campo({ l, v, ancho }) {
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

function _CampoLargo({ v }) {
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

function _LinkBtn({ href, emoji, label }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '8px 12px', borderRadius: 8,
      background: 'var(--brand-bg, #FBE9E0)', color: 'var(--brand-ink, #8A3F26)',
      border: '1px solid rgba(138,63,38,0.15)', fontSize: 12, fontWeight: 600,
      textDecoration: 'none', cursor: 'pointer',
    }}>
      <span>{emoji}</span> {label} ↗
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
