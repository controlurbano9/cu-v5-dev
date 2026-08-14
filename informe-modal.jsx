// ═══════════════════════════════════════════════════════════════
// v6/informe-modal.jsx — Modal in-app del generador F-GGO-43.
//
// Render un <iframe> de informe/index.html dentro de un overlay
// fullscreen-ish. Solo se usa en escritorio (ancho ≥ 900px). En
// móvil se hace fallback a abrir en una pestaña nueva.
//
// API global (idéntica en ambos modos):
//   window.abrirInformeF43({
//     fila, idCarpeta, radicado, direccion,
//     fechaVisita, cargo, inspector, catastral, lat
//   })
//
// Cuando el iframe sube el informe a Drive, el child hace
// postMessage({tipo:'informe-f43-subido', fila, radicado, link}).
// Esto invalida la caché de visitas para que cualquier pantalla la
// refresque al volver a montar.
// ═══════════════════════════════════════════════════════════════
const { useState: useStateIF, useEffect: useEffectIF, useRef: useRefIF } = React;

const INFORME_PATH = 'informe/index.html';
// Subido de 900 a 1200 (auditoría UX 2026-07): el workspace v2 usa 3
// columnas (índice + canvas + panel contextual) que no respiran por
// debajo de ~1200px reales — 900px alcanzaba para el wizard de 1 columna.
const MIN_DESKTOP = 1200;

// Flag de beta del workspace v2 — opt-in manual (localStorage), sin
// tocar BD ni Admin todavía. Plan de convivencia: mismo archivo
// informe/index.html, misma capa de datos, solo cambia ?ui=v2 en la
// URL. Reversión = borrar la clave o ponerla en '0'.
function _uiModeInforme() {
  try { return localStorage.getItem('cu_informe_v2_beta') === '1' ? 'v2' : 'legacy'; }
  catch (e) { return 'legacy'; }
}

let _pushInforme = null; // bridge con el host (idéntico al patrón de modal.jsx)

function InformeModalHost() {
  const [params, setParams] = useStateIF(null);

  useEffectIF(() => {
    _pushInforme = function(p) { setParams(p); };
    return function() { _pushInforme = null; };
  }, []);

  // Escuchar mensaje del iframe cuando termina la subida a Drive.
  useEffectIF(() => {
    function onMsg(e) {
      if (e.origin !== window.location.origin) return; // el iframe es same-origin (informe/index.html)
      if (e && e.data && e.data.tipo === 'informe-f43-subido') {
        // El BD cambió (LINK_INFORME_F43, etc.) → invalidar caché.
        if (typeof invalidarCache === 'function') invalidarCache('visitas');
        if (typeof appAlert === 'function') {
          appAlert('Informe subido a Drive correctamente.', { titulo: 'Listo' });
        }
      }
    }
    window.addEventListener('message', onMsg);
    return function() { window.removeEventListener('message', onMsg); };
  }, []);

  // Esc cierra el modal.
  useEffectIF(() => {
    if (!params) return;
    function onKey(e) { if (e.key === 'Escape') setParams(null); }
    window.addEventListener('keydown', onKey);
    return function() { window.removeEventListener('keydown', onKey); };
  }, [params]);

  if (!params) return null;
  return <InformeIframeUI params={params} onCerrar={function() { setParams(null); }} />;
}

function InformeIframeUI({ params, onCerrar }) {
  const iframeRef = useRefIF(null);

  const src = INFORME_PATH + '?' + _toQuery(params);

  return (
    <div onClick={function(e) {
      // Click directo sobre el backdrop cierra; click dentro del frame no.
      if (e.target === e.currentTarget) onCerrar();
    }} style={{
      position: 'fixed', inset: 0, background: 'rgba(31,27,22,0.65)',
      zIndex: 9000, padding: '4vh 4vw',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      backdropFilter: 'blur(2px)',
    }}>
    {/* Contenedor de la "ventana" — ~92vw/92vh, tope 1440px (revisión UX 2026-07) */}
    <div style={{
      width: '100%', height: '100%', maxWidth: 1440,
      display: 'flex', flexDirection: 'column',
    }}>
      {/* Toolbar de la "ventana" */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '12px 16px', background: 'var(--superficie, #FFFBF5)',
        borderRadius: '14px 14px 0 0', borderBottom: '0.5px solid var(--borde, rgba(31,27,22,0.08))',
      }}>
        <div style={{
          width: 28, height: 28, borderRadius: 7, background: 'var(--brand-bg, #FBE9E0)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--brand-ink, #8A3F26)', fontFamily: 'var(--font-serif)',
          fontSize: 12, fontWeight: 700,
        }}>F</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontFamily: 'var(--font-serif)', fontSize: 15, fontWeight: 600,
            letterSpacing: -0.2, color: 'var(--texto, #1F1B16)',
          }}>Generador F-GGO-43</div>
          <div style={{
            fontSize: 11, color: 'var(--texto-suave, #5C5142)',
            fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {params.radicado || '—'} {params.direccion && '· ' + params.direccion}
          </div>
        </div>
        <button onClick={function() {
          // Abrir en pestaña nueva (mantiene el modal abierto).
          window.open(src, '_blank', 'noopener');
        }} title="Abrir en pestaña nueva" style={{
          background: 'transparent', border: '1px solid var(--borde-med, rgba(31,27,22,0.16))',
          color: 'var(--texto-suave, #5C5142)', borderRadius: 8, padding: '6px 12px',
          fontFamily: 'inherit', fontSize: 12, cursor: 'pointer',
        }}>↗ Pestaña nueva</button>
        <button onClick={onCerrar} aria-label="Cerrar" title="Cerrar (Esc)" style={{
          background: 'transparent', border: '1px solid var(--borde-med, rgba(31,27,22,0.16))',
          color: 'var(--texto-suave, #5C5142)', borderRadius: 8, padding: '6px 10px',
          fontFamily: 'inherit', fontSize: 16, cursor: 'pointer', lineHeight: 1,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        }}><Icon.Close size={16} /></button>
      </div>

      {/* Iframe ocupa todo el alto restante */}
      <iframe
        ref={iframeRef}
        src={src}
        title="Generador F-GGO-43"
        style={{
          flex: 1, width: '100%', border: 'none',
          background: 'var(--fondo, #F5F1EB)',
          borderRadius: '0 0 14px 14px',
        }}
      />
    </div>
    </div>
  );
}

// Helpers ────────────────────────────────────────────────────────
function _toQuery(obj) {
  const qs = new URLSearchParams();
  Object.keys(obj || {}).forEach(function(k) {
    const v = obj[k];
    if (v != null && v !== '') qs.set(k, String(v));
  });
  return qs.toString();
}

// extraerIdCarpetaDrive() vive en utils.js (compartida con buscar.jsx).

// API global. Estrategia:
//   - Si hay ModalHost montado y el viewport es desktop → modal.
//   - Si no → window.open en pestaña nueva (móvil o sin host).
window.abrirInformeF43 = function(params) {
  if (!params || !params.fila || !params.radicado) {
    console.error('[abrirInformeF43] faltan params obligatorios (fila/radicado):', params);
    return;
  }
  // AP1 (auditoría 2026-07): informe/index.html corre fuera de api.js
  // (iframe o pestaña nueva) y no comparte el auto-adjunto de credenciales
  // de gasGet/gasPost — se pasan aquí, una sola vez, vía query string.
  const s = (typeof SESSION_V6 !== 'undefined') ? SESSION_V6.leer() : null;
  const paramsConSesion = (s && s.usuario && s.hash)
    ? Object.assign({ sesionUsuario: s.usuario, sesionHash: s.hash }, params || {})
    : (params || {});
  // Beta workspace v2 (opt-in localStorage) — ver _uiModeInforme().
  paramsConSesion.ui = _uiModeInforme();

  const esDesktop = window.innerWidth >= MIN_DESKTOP;
  if (_pushInforme && esDesktop) {
    _pushInforme(paramsConSesion);
    return;
  }
  const url = INFORME_PATH + '?' + _toQuery(paramsConSesion);
  window.open(url, '_blank', 'noopener');
};

window.InformeModalHost = InformeModalHost;
