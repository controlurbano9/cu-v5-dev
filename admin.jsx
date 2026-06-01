// ═══════════════════════════════════════════════════════════════
// v6/admin.jsx — Pantalla piloto Administración (V5 → React)
// ═══════════════════════════════════════════════════════════════
const { useState: useStateA, useEffect: useEffectA } = React;

function AdminScreen({ usuario }) {
  const [tab, setTab] = useStateA('usuarios'); // usuarios | pin | log | vigilancia
  if (usuario.rol !== 'ADMIN') {
    return <div className="card" style={{ margin: 16 }}>Acceso restringido.</div>;
  }
  return (
    <div className="pantalla activa pad-bottom">
      <div className="page-title" style={{ marginBottom: 16 }}>Administración</div>

      <div className="card" style={{ marginBottom: 12, padding: 0, overflow: 'hidden' }}>
        <div style={{ display: 'flex', borderBottom: '1px solid var(--borde)' }}>
          {[
            { k: 'usuarios',   l: 'Usuarios' },
            { k: 'pin',        l: 'Reset PIN' },
            { k: 'vigilancia', l: 'Vigilancia' },
            { k: 'log',        l: 'Auditoría' },
          ].map(t => (
            <button key={t.k} onClick={() => setTab(t.k)} style={{
              flex: 1, padding: '12px 14px', background: 'none', border: 'none',
              borderBottom: tab === t.k ? '2px solid var(--brand-accent)' : '2px solid transparent',
              color: tab === t.k ? 'var(--brand-accent)' : 'var(--texto-suave)',
              fontFamily: 'inherit', fontSize: 13, fontWeight: 600, cursor: 'pointer',
            }}>{t.l}</button>
          ))}
        </div>
      </div>

      {tab === 'usuarios'   && <TabUsuarios />}
      {tab === 'pin'        && <TabResetPin />}
      {tab === 'vigilancia' && <TabVigilancia />}
      {tab === 'log'        && <TabLog />}
    </div>
  );
}

// ── Pestaña Vigilancia: visitas con orden de suspensión preventiva ───
// Lista las visitas donde SUSPENSION DE LA OBRA === SI y existe
// N ORDEN DE POLICIA. Permite generar (o reabrir) la solicitud de
// vigilancia policial guardada en la carpeta de la visita.
function TabVigilancia() {
  const [filas, setFilas]       = useStateA([]);
  const [cargando, setCargando] = useStateA(true);
  const [error, setError]       = useStateA('');
  const [busyFila, setBusyFila] = useStateA(null);

  useEffectA(() => { cargar(); }, []);

  async function cargar(forzar) {
    setCargando(true); setError('');
    try {
      const { datos } = await leerVisitas({ forzar: !!forzar });
      const susp = datos.filter(d => {
        const s = (d['SUSPENSION DE LA OBRA'] || '').toString().trim().toUpperCase();
        const orden = (d['N ORDEN DE POLICIA'] || d['N° ORDEN DE POLICIA'] || '').toString().trim();
        return s === 'SI' && orden;
      });
      // Ordenar por fecha de visita descendente (más recientes primero)
      susp.sort((a, b) => (b['FECHA DE VISITA'] || '').localeCompare(a['FECHA DE VISITA'] || ''));
      setFilas(susp);
    } catch (e) { setError(e.message); }
    setCargando(false);
  }

  function extraerIdCarpeta(link) {
    if (!link) return '';
    const m = link.match(/folders\/([a-zA-Z0-9_-]+)/);
    return m ? m[1] : '';
  }

  async function generar(f) {
    const idCarpeta = extraerIdCarpeta(f['LINK_DRIVE'] || f[55] || '');
    if (!idCarpeta) { await appAlert('La visita no tiene carpeta de Drive asociada.', { titulo: 'Sin carpeta' }); return; }
    setBusyFila(f._idx);
    try {
      const r = await generarSolicitudVigilancia({
        fila:             f._idx,
        idCarpetaVisita:  idCarpeta,
        radicado:         f['RADICADO'] || '',
        fechaVisita:      f['FECHA DE VISITA'] || '',
        nOrdenPolicia:    f['N ORDEN DE POLICIA'] || f['N° ORDEN DE POLICIA'] || '',
        direccion:        f['DIRECCION INFRACCION'] || f['DIRECCION'] || '',
        barrio:           f['BARRIO/VEREDA'] || f['BARRIO'] || '',
      });
      // Refrescar para mostrar el link recién escrito en BD
      await cargar(true);
      if (r.linkDoc) window.open(r.linkDoc, '_blank', 'noopener,noreferrer');
    } catch (e) {
      await appAlert('Error generando solicitud: ' + e.message, { titulo: 'Error' });
    }
    setBusyFila(null);
  }

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div className="card-titulo">Solicitudes de vigilancia policial</div>
        <button onClick={() => cargar(true)} style={{
          background: 'var(--gris-bg)', border: '1px solid var(--borde)', borderRadius: 8,
          padding: '6px 12px', fontFamily: 'inherit', fontSize: 12, cursor: 'pointer',
        }}>Recargar</button>
      </div>
      <div style={{ fontSize: 11, color: 'var(--texto-suave)', marginBottom: 10 }}>
        Visitas con orden de suspensión preventiva activa. Generar el oficio crea (o reabre)
        un Google Doc en la carpeta de Drive de la visita.
      </div>
      {cargando && <div style={{ padding: 20, textAlign: 'center', color: 'var(--texto-suave)' }}>Cargando...</div>}
      {error && <div style={{ color: 'var(--rojo)', fontSize: 13 }}>{error}</div>}
      {!cargando && !error && filas.length === 0 && (
        <div style={{ padding: 20, textAlign: 'center', color: 'var(--texto-suave)', fontSize: 13 }}>
          No hay visitas con orden de suspensión.
        </div>
      )}
      {!cargando && !error && filas.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'var(--gris-bg)' }}>
                <th style={{ padding: 8, textAlign: 'left' }}>Radicado</th>
                <th style={{ padding: 8, textAlign: 'left' }}>Dirección</th>
                <th style={{ padding: 8, textAlign: 'center' }}>Orden</th>
                <th style={{ padding: 8, textAlign: 'center' }}>Fecha visita</th>
                <th style={{ padding: 8, textAlign: 'center' }}>Acción</th>
              </tr>
            </thead>
            <tbody>
              {filas.map(f => {
                const link = f['LINK_SOLICITUD_VIGILANCIA'] || '';
                const busy = busyFila === f._idx;
                return (
                  <tr key={f._idx} style={{ borderBottom: '1px solid var(--borde)' }}>
                    <td style={{ padding: 8, fontFamily: 'var(--font-mono)', fontSize: 11 }}>{f['RADICADO'] || '—'}</td>
                    <td style={{ padding: 8 }}>
                      <div>{f['DIRECCION INFRACCION'] || f['DIRECCION'] || '—'}</div>
                      <div style={{ fontSize: 10, color: 'var(--texto-suave)' }}>
                        {f['BARRIO/VEREDA'] || f['BARRIO'] || ''}
                      </div>
                    </td>
                    <td style={{ padding: 8, textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                      {f['N ORDEN DE POLICIA'] || f['N° ORDEN DE POLICIA'] || '—'}
                    </td>
                    <td style={{ padding: 8, textAlign: 'center', fontSize: 11 }}>{f['FECHA DE VISITA'] || '—'}</td>
                    <td style={{ padding: 6, textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap' }}>
                        <button onClick={() => generar(f)} disabled={busy} style={{
                          background: 'var(--brand-bg)', color: 'var(--brand-ink)',
                          border: '1px solid var(--brand-accent)', borderRadius: 6,
                          padding: '4px 10px', fontSize: 11, cursor: busy ? 'wait' : 'pointer',
                          fontFamily: 'inherit', fontWeight: 600,
                        }}>{busy ? 'Generando...' : (link ? 'Regenerar' : 'Generar')}</button>
                        {link && (
                          <a href={link} target="_blank" rel="noopener noreferrer" style={{
                            fontSize: 11, color: 'var(--verde-dark)', textDecoration: 'none',
                            alignSelf: 'center',
                            display: 'inline-flex', alignItems: 'center', gap: 4,
                          }}><Ico d={ICO.check} size={12} /> Ver oficio</a>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function TabUsuarios() {
  const [usuarios, setUsuarios] = useStateA([]);
  const [cargando, setCargando] = useStateA(true);
  const [error, setError] = useStateA('');

  useEffectA(() => { cargar(); }, []);

  async function cargar() {
    setCargando(true); setError('');
    try { setUsuarios(await listarUsuariosAdmin()); }
    catch (e) { setError(e.message); }
    setCargando(false);
  }

  async function togglear(u) {
    const accion = u.activo ? 'desactivar' : 'activar';
    if (!(await appConfirm(`¿${accion} a ${u.nombre}?`, {
      titulo: u.activo ? 'Desactivar usuario' : 'Activar usuario',
      btnOk: u.activo ? 'Desactivar' : 'Activar',
    }))) return;
    try {
      await toggleActivo(u.fila, u.activo ? 'NO' : 'SI');
      cargar();
    } catch (e) { await appAlert('Error: ' + e.message, { titulo: 'Error' }); }
  }

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div className="card-titulo">Usuarios del sistema</div>
        <button onClick={cargar} style={{
          background: 'var(--gris-bg)', border: '1px solid var(--borde)', borderRadius: 8,
          padding: '6px 12px', fontFamily: 'inherit', fontSize: 12, cursor: 'pointer',
        }}>Recargar</button>
      </div>
      {cargando && <div style={{ padding: 20, textAlign: 'center', color: 'var(--texto-suave)' }}>Cargando...</div>}
      {error && <div style={{ color: 'var(--rojo)', fontSize: 13 }}>{error}</div>}
      {!cargando && !error && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'var(--gris-bg)' }}>
                <th style={{ padding: 8, textAlign: 'left' }}>Nombre</th>
                <th style={{ padding: 8 }}>Cargo</th>
                <th style={{ padding: 8 }}>Rol</th>
                <th style={{ padding: 8 }}>Estado</th>
              </tr>
            </thead>
            <tbody>
              {usuarios.map(u => (
                <tr key={u.fila} style={{ borderBottom: '1px solid var(--borde)' }}>
                  <td style={{ padding: 8 }}>{u.nombre}</td>
                  <td style={{ padding: 8, textAlign: 'center', fontSize: 11 }}>{u.cargo}</td>
                  <td style={{ padding: 8, textAlign: 'center' }}>{u.rol}</td>
                  <td style={{ padding: 6, textAlign: 'center' }}>
                    <button onClick={() => togglear(u)} style={{
                      background: u.activo ? 'var(--verde)' : 'var(--rojo)', color: 'white',
                      border: 'none', borderRadius: 6, padding: '4px 10px',
                      fontSize: 11, cursor: 'pointer', fontFamily: 'inherit',
                    }}>{u.activo ? 'Activo' : 'Inactivo'}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function TabResetPin() {
  const [usuarios, setUsuarios] = useStateA([]);
  const [sel, setSel]   = useStateA('');
  const [pin, setPin]   = useStateA('');
  const [msg, setMsg]   = useStateA(null);
  const [busy, setBusy] = useStateA(false);

  useEffectA(() => {
    listarUsuariosAdmin().then(list => setUsuarios(list.filter(u => u.activo))).catch(()=>{});
  }, []);

  async function ejecutar() {
    setMsg(null);
    if (!sel) { setMsg({ t: 'error', m: 'Selecciona un usuario' }); return; }
    if (!/^\d{4}$/.test(pin)) { setMsg({ t: 'error', m: 'PIN debe ser 4 dígitos' }); return; }
    setBusy(true);
    try {
      await resetPin(parseInt(sel, 10), pin);
      const u = usuarios.find(x => x.fila === parseInt(sel, 10));
      registrarLog(SESSION_V6.leer()?.usuario || '', `PIN reseteado para: ${u?.nombre}`);
      setMsg({ t: 'ok', m: 'PIN actualizado correctamente' });
      setPin('');
    } catch (e) { setMsg({ t: 'error', m: e.message }); }
    setBusy(false);
  }

  return (
    <div className="card">
      <div className="card-titulo" style={{ marginBottom: 12 }}>Resetear PIN</div>
      <label style={{ display: 'block', fontSize: 12, color: 'var(--texto-suave)', marginBottom: 4 }}>Usuario</label>
      <select value={sel} onChange={e => setSel(e.target.value)} style={{
        width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--borde)',
        background: 'var(--superficie)', fontFamily: 'inherit', fontSize: 14, marginBottom: 12,
      }}>
        <option value="">Selecciona...</option>
        {usuarios.map(u => <option key={u.fila} value={u.fila}>{u.nombre}</option>)}
      </select>
      <label style={{ display: 'block', fontSize: 12, color: 'var(--texto-suave)', marginBottom: 4 }}>Nuevo PIN (4 dígitos)</label>
      <input type="password" value={pin} maxLength={4} inputMode="numeric"
        onChange={e => setPin(e.target.value.replace(/\D/g, ''))}
        style={{
          width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--borde)',
          background: 'var(--superficie)', fontFamily: 'var(--font-mono)', fontSize: 16, marginBottom: 12,
        }} />
      <button onClick={ejecutar} disabled={busy} className="btn-principal secundario" style={{ marginTop: 4 }}>
        {busy ? 'Procesando...' : 'Actualizar PIN'}
      </button>
      {msg && (
        <div style={{
          marginTop: 12, padding: 10, borderRadius: 8, fontSize: 13,
          background: msg.t === 'ok' ? 'rgba(107,122,58,0.12)' : 'rgba(168,52,43,0.12)',
          color: msg.t === 'ok' ? 'var(--verde)' : 'var(--rojo)',
        }}>{msg.m}</div>
      )}
    </div>
  );
}

function TabLog() {
  const [filas, setFilas] = useStateA([]);
  const [cargando, setCargando] = useStateA(true);
  useEffectA(() => {
    leerLogAuditoria().then(v => {
      setFilas((v || []).slice(1).reverse().slice(0, 50));
      setCargando(false);
    }).catch(() => setCargando(false));
  }, []);

  return (
    <div className="card">
      <div className="card-titulo" style={{ marginBottom: 12 }}>Auditoría · últimos 50</div>
      {cargando && <div style={{ color: 'var(--texto-suave)' }}>Cargando...</div>}
      {!cargando && filas.length === 0 && <div style={{ color: 'var(--texto-suave)' }}>Sin registros.</div>}
      {!cargando && filas.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {filas.map((f, i) => (
            <div key={i} style={{
              padding: '8px 10px', background: 'var(--gris-bg)', borderRadius: 8,
              fontSize: 12, display: 'flex', justifyContent: 'space-between', gap: 12,
            }}>
              <div>
                <div style={{ fontWeight: 600 }}>{f[0] || '—'}</div>
                <div style={{ color: 'var(--texto-suave)' }}>{f[1] || ''}</div>
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--texto-suave)', whiteSpace: 'nowrap' }}>
                {f[2] || ''}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

window.AdminScreen = AdminScreen;
