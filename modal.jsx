// ═══════════════════════════════════════════════════════════════
// v6/modal.jsx — Modal in-app + API Promise-based reemplazando
// window.confirm/alert. Expone:
//   await appConfirm(mensaje, {titulo, btnOk, btnCancel})  → bool
//   await appAlert(mensaje, {titulo, btnOk})               → true
// Si <ModalHost /> aún no se ha montado (boot temprano), cae en
// el confirm/alert nativo del browser para no perder mensajes.
// ═══════════════════════════════════════════════════════════════
const { useState: useStateM, useEffect: useEffectM } = React;

// Bridge entre la API global y el state del Host. Se setea al montar
// el ModalHost; null mientras no exista.
let _pushModal = null;

function ModalHost() {
  const [modales, setModales] = useStateM([]);

  useEffectM(() => {
    _pushModal = function(m) { setModales(function(prev) { return prev.concat([m]); }); };
    return function() { _pushModal = null; };
  }, []);

  function resolver(idx, valor) {
    setModales(function(prev) {
      const m = prev[idx];
      if (m && m.resolver) m.resolver(valor);
      return prev.filter(function(_, i) { return i !== idx; });
    });
  }

  if (!modales.length) return null;
  return (
    <>
      {modales.map(function(m, idx) {
        return <ModalUI key={idx} {...m} onResolver={function(v) { resolver(idx, v); }} />;
      })}
    </>
  );
}

function ModalUI({ tipo, titulo, mensaje, btnOk, btnCancel, onResolver }) {
  // Esc cancela (confirm) o cierra (alert). Enter acepta.
  useEffectM(function() {
    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); onResolver(tipo === 'confirm' ? false : true); }
      else if (e.key === 'Enter') { e.preventDefault(); onResolver(true); }
    }
    window.addEventListener('keydown', onKey);
    return function() { window.removeEventListener('keydown', onKey); };
  }, [onResolver, tipo]);

  return (
    <div onClick={function() { onResolver(tipo === 'confirm' ? false : true); }} style={{
      position: 'fixed', inset: 0, background: 'rgba(31,27,22,0.45)',
      zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 16, backdropFilter: 'blur(2px)',
    }}>
      <div onClick={function(e) { e.stopPropagation(); }} style={{
        background: 'var(--superficie, #FFFBF5)',
        borderRadius: 'var(--r-md, 14px)',
        boxShadow: 'var(--sombra, 0 10px 30px rgba(0,0,0,0.2))',
        maxWidth: 440, width: '100%', padding: '22px 24px',
        fontFamily: 'var(--font-sans, sans-serif)',
        border: '1px solid var(--borde, rgba(31,27,22,0.08))',
      }}>
        {titulo && (
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 10, color: 'var(--texto, #1F1B16)' }}>
            {titulo}
          </div>
        )}
        <div style={{
          fontSize: 13, lineHeight: 1.55, color: 'var(--texto-2, #2A2520)',
          whiteSpace: 'pre-wrap', marginBottom: 20,
        }}>
          {mensaje}
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          {tipo === 'confirm' && (
            <button onClick={function() { onResolver(false); }} style={{
              background: 'var(--gris-bg, #F5F1EB)',
              border: '1px solid var(--borde, rgba(31,27,22,0.08))',
              borderRadius: 8, padding: '8px 16px',
              fontFamily: 'inherit', fontSize: 13, cursor: 'pointer',
              color: 'var(--texto-suave, #5C5142)',
            }}>{btnCancel || 'Cancelar'}</button>
          )}
          <button onClick={function() { onResolver(true); }} autoFocus style={{
            background: 'var(--brand-accent, #C96442)', color: 'white', border: 'none',
            borderRadius: 8, padding: '8px 16px',
            fontFamily: 'inherit', fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}>{btnOk || 'Aceptar'}</button>
        </div>
      </div>
    </div>
  );
}

// API global Promise-based — caída a nativo si el host aún no monta.
window.appConfirm = function(mensaje, opts) {
  return new Promise(function(resolver) {
    if (_pushModal) {
      _pushModal(Object.assign({ tipo: 'confirm', mensaje: mensaje, resolver: resolver }, opts || {}));
    } else {
      resolver(window.confirm(mensaje));
    }
  });
};

window.appAlert = function(mensaje, opts) {
  return new Promise(function(resolver) {
    if (_pushModal) {
      _pushModal(Object.assign({ tipo: 'alert', mensaje: mensaje, resolver: resolver }, opts || {}));
    } else {
      window.alert(mensaje);
      resolver(true);
    }
  });
};

window.ModalHost = ModalHost;
