// ═══════════════════════════════════════════════════════════════
// v6/nueva-visita.jsx — Pantalla "Nueva visita" / "Continuar visita"
//
// Diseño plano: todas las secciones desplegadas, scroll continuo.
// Guardado en un solo POST al final ("Guardar visita").
// Tras guardar (y crear carpeta Drive), aparece la sección de fotos
// y el botón "Generar acta F-GGO-46".
//
// Modos de entrada:
//   - filaInicial null  →  visita nueva (puede venir de Home, sin radicado previo)
//   - filaInicial num   →  continuar visita existente (Buscar / Gestión)
//   - datosIniciales obj → prefill desde una fila PENDIENTE (radicado ya existe en BD)
// ═══════════════════════════════════════════════════════════════
const { useState: useStateNV, useEffect: useEffectNV, useMemo: useMemoNV } = React;

// ── Helpers de fecha ───────────────────────────────────────────
function _hoyDDMMYYYY_nv() {
  const d = new Date();
  return String(d.getDate()).padStart(2, '0') + '/' +
         String(d.getMonth() + 1).padStart(2, '0') + '/' + d.getFullYear();
}
function _hoyISO() { return new Date().toISOString().split('T')[0]; }
function _isoAFecha(iso) {
  if (!iso) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}
function _fechaAIso(ddmmyyyy) {
  if (!ddmmyyyy) return '';
  const m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(ddmmyyyy);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : ddmmyyyy;
}

// ── Capitalización utilitaria ──────────────────────────────────
function _capPalabras(s) {
  if (!s) return '';
  return s.toString().toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}
function _primeraMayus(s) {
  s = (s || '').toString();
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function _soloMin(s) { return (s || '').toString().toLowerCase().trim(); }
function _soloMay(s) { return (s || '').toString().toUpperCase().trim(); }

// ── Catálogos ──────────────────────────────────────────────────
const VISITADORES = [
  { val: 'ALEJANDRO HERNANDEZ MUÑOZ',   l: 'Alejandro Hernández' },
  { val: 'MAURICIO HERRERA LOPERA',     l: 'Mauricio Herrera'    },
  { val: 'DIEGO ALEJANDRO MUNERA OSSA', l: 'Diego Munera'        },
  { val: 'DANIEL PEDRAZA ARANGO',       l: 'Daniel Pedraza'      },
  { val: 'VICTOR HUGO QUIROZ PORTILLA', l: 'Víctor Hugo Quiroz'  },
  { val: 'CARLOS ANDRES MEJIA',         l: 'Carlos Mejía'        },
  { val: 'JUAN SEBASTIAN PINZON GAONA', l: 'Juan Sebastián Pinzón' },
];

const HORAS_CITACION = [
  { val: '08:00', l: '8:00 AM' }, { val: '09:00', l: '9:00 AM' },
  { val: '10:00', l: '10:00 AM' }, { val: '11:00', l: '11:00 AM' },
  { val: '14:00', l: '2:00 PM' }, { val: '15:00', l: '3:00 PM' },
  { val: '16:00', l: '4:00 PM' },
];

// ── Estado inicial (en blanco o prefill) ───────────────────────
function _estadoInicial(datosIniciales) {
  const d = datosIniciales || {};
  return {
    // Identificación
    radicado:       d['RADICADO']             || '',
    fechaRadicado:  _fechaAIso(d['FECHA RADICADO'] || ''),
    fechaVisita:    _fechaAIso(d['FECHA DE VISITA'] || '') || _hoyISO(),
    nVisita:        d['N° VISITA']           || d['N VISITA']           || 1,
    esOficio:       !!d['_oficio'],
    // Ubicación
    direccion:      d['DIRECCION INFRACCION'] || d['DIRECCION']         || '',
    barrio:         d['BARRIO/VEREDA']        || d['BARRIO']            || '',
    comuna:         d['COMUNA']               || '',
    lat:            d['LATITUD']              || null,
    lon:            d['LONGITUD']             || null,
    // Persona
    atiendeNombre:  d['NOMBRE PERSONA ATIENDE']  || '',
    atiendeId:      d['ID PERSONA ATIENDE']       || '',
    atiendeTel:     d['TELEFONO PERSONA ATIENDE']  || '',
    atiendeRelacion: d['RELACION CON EL EVENTO']  || '',
    atiendeDir:     d['DIR NOTIFICACION']         || '',
    atiendeEmail:   d['CORREO ELECTRONICO']       || '',
    // Características
    estadoObra:     d['ESTADO OBRA']          || '',
    repLocativa:    d['REPARACION LOCATIVA']  || '',
    habitado:       d['HABITADO']             || '',
    alturaPisos:    d['ALTURA EN PISOS']      || '',
    destActuales:   d['N° DESTINACIONES ACTUALES'] || d['N DESTINACIONES ACTUALES'] || '',
    usos:           d['USOS ACTUALES']        || '',
    cubiertaActual: d['TIPO CUBIERTA ACTUAL'] || '',
    catastral:      d['CODIGO CATASTRAL']     || d['CATASTRAL']         || '',
    ficha:          d['N° FICHA PREDIAL']     || d['N FICHA PREDIAL']    || '',
    // Licencia
    licenciaAportada: d['SE APORTO LICENCIA'] || '',
    licencia:         d['N° LICENCIA']        || d['N LICENCIA']         || '',
    fechaLicencia:   _fechaAIso(d['FECHA LICENCIA'] || ''),
    tipoLicencia:    d['TIPO Y MODALIDAD LICENCIA'] || '',
    pisos:           d['PISOS APROBADOS']     || '',
    destinaciones:   d['DESTINACIONES LICENCIA'] || '',
    cubierta:        d['CUBIERTA LICENCIA']   || '',
    sistema:         d['SISTEMA ESTRUCTURAL'] || d['SISTEMA ESTRUCT'] || '',
    obsLicencia:     d['OBS LICENCIA']        || '',
    // Descripción + conclusiones
    actuacion:       d['ACTUACION / OBSERVACIONES'] || d['ACTUACION'] || '',
    infraccion:      d['TIPO DE INFRACCION']  || '',
    area:            d['AREA CONTRAVENCION m2'] || d['AREA CONTRAVENCION M2'] || '',
    quebrada:        d['CUMPLE RETIRO QUEBRADA'] || '',
    suspension:      d['SUSPENSION DE LA OBRA'] || '',
    orden:           d['N° ORDEN DE POLICIA'] || d['N ORDEN DE POLICIA'] || '',
    citacionFecha:   _fechaAIso((d['FECHA CITACION'] || '').split(' · ')[0]),
    citacionHora:    '',
    // Visitadores
    visitador:       d['VISITADOR(ES)']       || '',
    // POT
    poligono:        d['POLIGONO USO SUELO']  || '',
    amenaza:         d['AMENAZA']             || '',
    sueloProt:       d['SUELO DE PROTECCION'] || '',
    // Drive
    linkDrive:       d['LINK_DRIVE']          || '',
    idCarpetaVisita: _idCarpetaDeLink(d['LINK_DRIVE'] || ''),
    idCarpetaFotos:  '',
  };
}
function _idCarpetaDeLink(url) {
  if (!url) return '';
  const m = /folders\/([a-zA-Z0-9_-]+)/.exec(url);
  return m ? m[1] : '';
}

// ── Estructura del payload (60 cols B → BD) ────────────────────
// Construye el array que se mandará al webhook. Mantiene el orden
// exacto definido en app.js / apps_script_unificado.js.
function _construirPayload(d, estado, linkDriveFinal, filaPendiente) {
  const radicado = d.esOficio
    ? (d.orden ? 'OFICIO-' + d.orden : '')
    : (d.radicado || '');
  const fpRadicado = filaPendiente?.['FECHA RADICADO'] || '';
  const fpDenunc   = filaPendiente?.['DENUNCIANTE/REMITENTE'] || filaPendiente?.[6] || '';
  const fpFechaAsig= filaPendiente?.['FECHA ASIGNACION VISITA'] || filaPendiente?.[14] || '';
  const fpFechaDev = filaPendiente?.['FECHA DEVOLUCION'] || filaPendiente?.[20] || '';

  const denunc = d.esOficio
    ? 'Inspección de Control Urbano'
    : _capPalabras(fpDenunc);

  const horaFmt = HORAS_CITACION.find(h => h.val === d.citacionHora)?.l || d.citacionHora;
  const citFmt  = d.citacionFecha
    ? (_isoAFecha(d.citacionFecha) + (horaFmt ? ' · ' + horaFmt : ''))
    : '';

  return [
    radicado,                                     // B  RADICADO
    _isoAFecha(d.fechaRadicado) || fpRadicado,    // C  FECHA RADICADO
    d.direccion || '',                            // D  DIRECCION INFRACCION
    d.barrio || '',                               // E  BARRIO/VEREDA
    d.comuna || '',                               // F  COMUNA
    denunc,                                       // G  DENUNCIANTE/REMITENTE
    _capPalabras(d.atiendeNombre),                // H  NOMBRE PERSONA ATIENDE
    d.atiendeId || '',                            // I  ID PERSONA ATIENDE
    d.atiendeTel || '',                           // J  TELEFONO PERSONA ATIENDE
    d.atiendeRelacion || '',                      // K  RELACION CON EL EVENTO
    d.atiendeDir || '',                           // L  DIR NOTIFICACION
    _soloMin(d.atiendeEmail),                     // M  CORREO ELECTRONICO
    estado,                                       // N  ESTADO VISITA
    fpFechaAsig || _hoyDDMMYYYY_nv(),             // O  FECHA ASIGNACION VISITA
    _isoAFecha(d.fechaVisita),                    // P  FECHA DE VISITA
    d.nVisita || 1,                               // Q  N° VISITA
    d.visitador || '',                            // R  VISITADOR(ES)
    '',                                           // S  FECHA 2DA VISITA
    '',                                           // T  VISITADOR2
    fpFechaDev || '',                             // U  FECHA DEVOLUCION
    '',                                           // V  DIAS
    d.estadoObra || '',                           // W  ESTADO OBRA
    d.infraccion || '',                           // X  TIPO DE INFRACCION
    d.area || '',                                 // Y  AREA CONTRAVENCION m2
    d.quebrada || '',                             // Z  CUMPLE RETIRO QUEBRADA
    d.repLocativa || '',                          // AA REPARACION LOCATIVA
    d.habitado || '',                             // AB HABITADO
    d.alturaPisos || '',                          // AC ALTURA EN PISOS
    d.destActuales || '',                         // AD N° DESTINACIONES ACTUALES
    d.usos || '',                                 // AE USOS ACTUALES
    d.cubiertaActual || '',                       // AF TIPO CUBIERTA ACTUAL
    d.catastral || '',                            // AG CODIGO CATASTRAL
    d.ficha || '',                                // AH N° FICHA PREDIAL
    _soloMay(d.licencia),                         // AI N° LICENCIA
    d.licenciaAportada || '',                     // AJ SE APORTO LICENCIA
    d.licenciaAportada === 'SI' ? _isoAFecha(d.fechaLicencia) : '',  // AK FECHA LICENCIA
    d.licenciaAportada === 'SI' ? d.tipoLicencia    : '',            // AL TIPO Y MODALIDAD
    d.licenciaAportada === 'SI' ? d.pisos           : '',            // AM PISOS APROBADOS
    d.licenciaAportada === 'SI' ? d.destinaciones   : '',            // AN DESTINACIONES LICENCIA
    d.licenciaAportada === 'SI' ? d.cubierta        : '',            // AO CUBIERTA LICENCIA
    d.licenciaAportada === 'SI' ? d.sistema         : '',            // AP SISTEMA ESTRUCTURAL
    d.licenciaAportada === 'SI' ? d.obsLicencia     : '',            // AQ OBS LICENCIA
    d.suspension || '',                           // AR SUSPENSION DE LA OBRA
    d.orden || '',                                // AS N° ORDEN DE POLICIA
    citFmt,                                       // AT FECHA CITACION
    _primeraMayus(d.actuacion),                   // AU ACTUACION / OBSERVACIONES
    '',                                           // AV RADICADOS REITERADOS
    d.lat != null ? Number(d.lat).toFixed(6) : '',  // AW LATITUD
    d.lon != null ? Number(d.lon).toFixed(6) : '',  // AX LONGITUD
    d.lat != null ? 'https://maps.google.com/?q=' + Number(d.lat).toFixed(6) + ',' + Number(d.lon).toFixed(6) : '', // AY MAPA
    _soloMay(d.poligono),                         // AZ POLIGONO USO SUELO
    d.amenaza || '',                              // BA AMENAZA
    d.sueloProt || '',                            // BB SUELO DE PROTECCION
    '',                                           // BC PRIORIDAD
    linkDriveFinal || '',                         // BD LINK_DRIVE
  ];
}

// ══════════════════════════════════════════════════════════════
//   PRIMITIVOS DE FORMULARIO
// ══════════════════════════════════════════════════════════════
function _Seccion({ titulo, color, children }) {
  return (
    <div className="form-seccion">
      <span className={'form-seccion-titulo titulo-' + (color || 'azul')}>{titulo}</span>
      <div style={{ marginTop: 12 }}>{children}</div>
    </div>
  );
}

function _Campo({ label, children, hint, fullWidth }) {
  return (
    <div className="input-grupo" style={fullWidth ? { gridColumn: '1 / -1' } : null}>
      <label className="input-label">{label}</label>
      {children}
      {hint && <div style={{ fontSize: 11, color: 'var(--texto-suave)', marginTop: 4 }}>{hint}</div>}
    </div>
  );
}

function _Input({ value, onChange, placeholder, type, mono, ...rest }) {
  return (
    <input
      type={type || 'text'}
      className={'input-campo' + (mono ? ' mono' : '')}
      value={value || ''}
      placeholder={placeholder || ''}
      onChange={e => onChange(e.target.value)}
      {...rest}
    />
  );
}

function _TextArea({ value, onChange, placeholder, rows }) {
  return (
    <textarea
      className="input-campo"
      rows={rows || 4}
      value={value || ''}
      placeholder={placeholder || ''}
      onChange={e => onChange(e.target.value)}
    />
  );
}

function _Radio({ value, onChange, opciones }) {
  return (
    <div className="radio-grupo">
      {opciones.map(o => {
        const v = typeof o === 'string' ? o : o.v;
        const l = typeof o === 'string' ? o : o.l;
        return (
          <div key={v}
            className={'radio-opcion' + (value === v ? ' sel' : '')}
            onClick={() => onChange(v)}>
            {l}
          </div>
        );
      })}
    </div>
  );
}

// Botón pequeño inline (acciones de campo: geocode, mejorar IA, etc.)
function _BtnAccion({ children, onClick, busy, ...rest }) {
  return (
    <button type="button" onClick={onClick} disabled={busy} {...rest} style={{
      background: 'var(--brand-bg)', color: 'var(--brand-ink)',
      border: '1px solid var(--brand-accent)', borderRadius: 8,
      padding: '6px 12px', fontFamily: 'inherit', fontSize: 12, fontWeight: 600,
      cursor: busy ? 'not-allowed' : 'pointer',
      display: 'inline-flex', alignItems: 'center', gap: 6,
      opacity: busy ? 0.6 : 1,
    }}>{children}</button>
  );
}

// ══════════════════════════════════════════════════════════════
//   PANTALLA
// ══════════════════════════════════════════════════════════════
function NuevaVisitaScreen({ usuario, filaInicial, datosIniciales, onSalir }) {
  const [d, setD]               = useStateNV(() => _estadoInicial(datosIniciales));
  const [estadoVisita, setEstV] = useStateNV(filaInicial ? 'INICIADO' : 'PENDIENTE');
  const [filaEditando, setFE]   = useStateNV(filaInicial || null);
  const [guardando, setGuard]   = useStateNV(false);
  const [generandoActa, setGA]  = useStateNV(false);
  const [generandoRF,  setGRF]  = useStateNV(false);
  const [busyGeo, setBusyGeo]   = useStateNV(false);
  const [busyMejora, setBusyMe] = useStateNV(false);
  const [busyPOT, setBusyPOT]   = useStateNV(false);

  // Helper para actualizar un campo del form
  function setCampo(k, v) { setD(prev => ({ ...prev, [k]: v })); }

  // Prefijar visitador con el usuario logueado (si está en la lista)
  useEffectNV(() => {
    if (!d.visitador && usuario) {
      const m = VISITADORES.find(v => v.val.includes(usuario.usuario.toUpperCase().split(' ')[0]));
      if (m) setCampo('visitador', m.val);
    }
  }, []); // solo al montar

  // ── Geocode botón — al obtener coords dispara consulta POT automática ─
  async function ejecutarGeocode() {
    if (!d.direccion) {
      await appAlert('Ingresa una dirección primero.', { titulo: 'Falta dirección' });
      return;
    }
    setBusyGeo(true);
    try {
      const q = d.direccion + (d.barrio ? ', ' + d.barrio : '') + ', Bello, Antioquia';
      const r = await geocodeDireccion(q);
      const c = r.data || r;
      if (c.lat && c.lng) {
        setCampo('lat', c.lat); setCampo('lon', c.lng);
        // Consulta POT automática (igual que producción V2). No bloqueante.
        ejecutarPOT(c.lat, c.lng);
      } else {
        await appAlert('No se encontró la ubicación. Refina la dirección.', { titulo: 'Sin resultado' });
      }
    } catch (e) {
      await appAlert('Error: ' + e.message, { titulo: 'Geocoding' });
    }
    setBusyGeo(false);
  }

  // ── Mejorar texto con IA ───────────────────────────────────
  async function ejecutarMejora() {
    if (!d.actuacion) {
      await appAlert('Escribe algo en la descripción primero.', { titulo: 'Nada que mejorar' });
      return;
    }
    setBusyMe(true);
    try {
      const t = await mejorarTexto(d.actuacion);
      if (t) setCampo('actuacion', t);
    } catch (e) {
      await appAlert('Error: ' + e.message, { titulo: 'Mejora con IA' });
    }
    setBusyMe(false);
  }

  // ── Consultar norma POT ────────────────────────────────────
  // Cliente puro (turf.js + GeoJSONs en GitHub, igual que producción).
  // Acepta lat/lon opcionales para encadenarse tras geocoding sin
  // depender del state batched de React.
  async function ejecutarPOT(latArg, lonArg) {
    const lat = (latArg != null) ? latArg : d.lat;
    const lon = (lonArg != null) ? lonArg : d.lon;
    if (lat == null || lon == null) {
      await appAlert('Necesitas coordenadas primero. Usa "Buscar coordenadas".', { titulo: 'Sin GPS' });
      return;
    }
    setBusyPOT(true);
    try {
      const r = await consultarPOT(lat, lon);
      if (r.poligono)       setCampo('poligono',  r.poligono);
      if (r.sueloProt)      setCampo('sueloProt', r.sueloProt);   // 'SI' | 'NO'
      if (r.amenaza)        setCampo('amenaza',   r.amenaza);     // 'SI' | 'NO'
      if (r.enRetiro)       setCampo('quebrada',  r.enRetiro);    // 'SI' | 'NO'
      // Barrio sugerido — solo llena si el campo actual está vacío (no pisa edición manual).
      if (r.barrioSugerido && !d.barrio) setCampo('barrio', r.barrioSugerido);
    } catch (e) {
      await appAlert('Error: ' + e.message, { titulo: 'Consulta POT' });
    }
    setBusyPOT(false);
  }

  // ── Validaciones mínimas antes de guardar ──────────────────
  function _validar() {
    const errs = [];
    const radicadoEfectivo = d.esOficio ? d.orden : d.radicado;
    if (!radicadoEfectivo) errs.push(d.esOficio ? 'N° de orden de policía' : 'Radicado');
    if (!d.direccion)      errs.push('Dirección');
    if (!d.comuna)         errs.push('Comuna');
    if (!d.fechaVisita)    errs.push('Fecha de visita');
    if (!d.visitador)      errs.push('Visitador');
    return errs;
  }

  // ── Guardar (un solo POST) ─────────────────────────────────
  async function guardar() {
    const errs = _validar();
    if (errs.length) {
      await appAlert('Faltan campos:\n• ' + errs.join('\n• '), { titulo: 'Datos incompletos' });
      return;
    }
    setGuard(true);
    try {
      // 1. Crear carpeta Drive si aún no existe
      let linkDrive = d.linkDrive || '';
      let idCarpetaVisita = d.idCarpetaVisita || '';
      let idCarpetaFotos  = d.idCarpetaFotos  || '';
      if (!linkDrive && d.comuna && d.direccion && d.fechaVisita) {
        try {
          const c = await crearCarpetaVisita(d.comuna, d.direccion, d.fechaVisita, d.nVisita || 1);
          linkDrive       = c.linkCarpeta || '';
          idCarpetaFotos  = c.idFotos     || '';
          idCarpetaVisita = _idCarpetaDeLink(linkDrive);
        } catch (eDrive) {
          // No bloquear el guardado por error en Drive.
          console.warn('crearCarpeta:', eDrive);
        }
      }

      // 2. Armar array de 60 valores
      const vals = _construirPayload(d, 'INICIADO', linkDrive, datosIniciales);

      // 3. POST único
      const r = await guardarVisita({ valores: vals, fila: filaEditando });
      if (r && r.fila) setFE(r.fila);

      // 4. Actualizar state local con metadatos derivados
      setEstV('INICIADO');
      setD(prev => ({
        ...prev,
        linkDrive,
        idCarpetaVisita,
        idCarpetaFotos,
      }));

      await appAlert(filaEditando
        ? 'Registro actualizado correctamente.'
        : 'Visita guardada. Ya puedes generar el acta F-GGO-46.',
        { titulo: 'Guardado' });
    } catch (e) {
      await appAlert('Error: ' + e.message, { titulo: 'Error al guardar' });
    }
    setGuard(false);
  }

  // ── Generar acta F-GGO-46 ──────────────────────────────────
  // Construye el payload F-GGO-46 a partir del state del wizard.
  // Lo usan tanto el botón "Generar acta" (paso 1, Sheet caracterización)
  // como "Generar registro fotográfico" (paso 2, Doc RF con fotos).
  function _construirDatosF46() {
    return {
      radicado:       d.esOficio ? ('OFICIO-' + d.orden) : d.radicado,
      fechaRadicado:  _isoAFecha(d.fechaRadicado),
      fechaVisita:    _isoAFecha(d.fechaVisita),
      objetoVisita:   d.esOficio ? 'Inspección de oficio' : 'Atención de PQR',
      direccion:      d.direccion,
      barrio:         d.barrio,
      comuna:         d.comuna,
      // Persona
      atiendeNombre:  d.atiendeNombre,
      atiendeId:      d.atiendeId,
      atiendeTel:     d.atiendeTel,
      atiendeRelacion:d.atiendeRelacion,
      atiendeDir:     d.atiendeDir,
      atiendeEmail:   d.atiendeEmail,
      // Licencia
      licenciaN:       d.licencia,
      licenciaFecha:   _isoAFecha(d.fechaLicencia),
      licenciaTipo:    d.tipoLicencia,
      licenciaPisos:   d.pisos,
      licenciaDest:    d.destinaciones,
      licenciaCubierta:d.cubierta,
      licenciaSistema: d.sistema,
      // Caracterización
      estadoObra:     d.estadoObra,
      repLocativa:    d.repLocativa,
      usos:           d.usos,
      alturaP:        d.alturaPisos,
      destActuales:   d.destActuales,
      cubiertalActual:d.cubiertaActual,
      habitado:       d.habitado,
      situacion:      d.actuacion,
      catastral:      d.catastral,
      ficha:          d.ficha,
      poligono:       d.poligono,
      amenaza:        d.amenaza,
      sueloProt:      d.sueloProt,
      retiroQuebrada: d.quebrada,
      infraccion:     d.infraccion,
      area:           d.area,
      obsConclusion:  d.obsLicencia,
      // Citación
      orden:          d.orden,
      citacion:       d.citacionFecha
        ? (_isoAFecha(d.citacionFecha) + (d.citacionHora ? ' · ' + (HORAS_CITACION.find(h => h.val === d.citacionHora)?.l || d.citacionHora) : ''))
        : '',
      // Inspectores firmantes (por ahora: usuario logueado)
      inspector:      usuario?.usuario || '',
      cargo:          usuario?.cargo   || 'Inspector',
      // Carpeta de la visita
      idCarpetaVisita: d.idCarpetaVisita,
      idCarpetaFotos:  d.idCarpetaFotos,
      fila:            filaEditando,
    };
  }

  // Paso 1 del F-GGO-46: Sheet de CARACTERIZACIÓN.
  // No inserta fotos — para el registro fotográfico usar el botón aparte.
  async function generarActa() {
    if (!filaEditando) {
      await appAlert('Primero guarda la visita.', { titulo: 'Visita no guardada' });
      return;
    }
    const ok = await appConfirm(
      '¿Generar el acta F-GGO-46 (Sheet de caracterización)? El registro fotográfico se genera aparte.',
      { titulo: 'Generar acta', btnOk: 'Generar' }
    );
    if (!ok) return;
    setGA(true);
    try {
      const r = await gasPost(Object.assign({ accion: 'generarActa' }, _construirDatosF46()));
      const link = r.linkSheet || r.linkActa;
      if (link) {
        await appAlert(
          (r.yaExistia ? 'El acta ya existía en la carpeta.' : 'Acta generada correctamente.') +
          '\n\nSe abrirá la hoja de caracterización en una pestaña nueva.',
          { titulo: 'Acta lista' }
        );
        window.open(link, '_blank', 'noopener');
      } else {
        await appAlert('El acta se generó pero no recibí link. Revisa Drive.', { titulo: 'Acta generada' });
      }
    } catch (e) {
      await appAlert('Error: ' + e.message, { titulo: 'Generar acta' });
    }
    setGA(false);
  }

  // Paso 2 del F-GGO-46: Doc REGISTRO FOTOGRÁFICO con las fotos
  // ya subidas a la subcarpeta Fotos de la visita.
  async function generarRegistroFotografico() {
    if (!filaEditando) {
      await appAlert('Primero guarda la visita.', { titulo: 'Visita no guardada' });
      return;
    }
    if (!d.idCarpetaFotos) {
      await appAlert('La visita aún no tiene subcarpeta de fotos. Sube fotos primero.', { titulo: 'Sin fotos' });
      return;
    }
    const ok = await appConfirm(
      '¿Generar el registro fotográfico F-GGO-46 con las fotos subidas?',
      { titulo: 'Generar registro fotográfico', btnOk: 'Generar' }
    );
    if (!ok) return;
    setGRF(true);
    try {
      const r = await gasPost(Object.assign({ accion: 'generarRegistroFotos' }, _construirDatosF46()));
      const link = r.linkDoc;
      if (link) {
        await appAlert(
          (r.yaExistia ? 'El registro fotográfico ya existía en la carpeta.' : 'Registro fotográfico generado.') +
          '\n\nSe abrirá en una pestaña nueva.',
          { titulo: 'Registro fotográfico listo' }
        );
        window.open(link, '_blank', 'noopener');
      } else {
        await appAlert('Se generó pero no recibí link. Revisa Drive.', { titulo: 'Registro generado' });
      }
    } catch (e) {
      await appAlert('Error: ' + e.message, { titulo: 'Generar registro fotográfico' });
    }
    setGRF(false);
  }

  // ── Render ─────────────────────────────────────────────────
  const tituloPantalla = filaEditando ? 'Continuar visita' : 'Nueva visita';

  return (
    <div className="pantalla activa pad-bottom">
      {/* Dirección sticky cuando ya hay dirección */}
      {d.direccion && (
        <div id="acordeon-sticky-dir" className="visible">
          <span className="dir-label">Visita en</span>
          <span className="dir-valor">{d.direccion}{d.barrio ? ' · ' + d.barrio : ''}</span>
        </div>
      )}

      <div className="page-title-row">
        <div className="page-title">{tituloPantalla}</div>
        {onSalir && (
          <button onClick={onSalir} style={{
            background: 'var(--gris-bg)', border: '1px solid var(--borde)', borderRadius: 8,
            padding: '6px 14px', fontFamily: 'inherit', fontSize: 12, cursor: 'pointer',
          }}>← Volver</button>
        )}
      </div>

      {/* 1. IDENTIFICACIÓN ───────────────────────────────── */}
      <_Seccion titulo="Identificación del caso" color="azul">
        <_Campo label="¿Es visita de oficio?">
          <_Radio value={d.esOficio ? 'SI' : 'NO'}
            onChange={v => setCampo('esOficio', v === 'SI')}
            opciones={[{ v: 'NO', l: 'PQR / Radicado' }, { v: 'SI', l: 'Oficio' }]} />
        </_Campo>
        {!d.esOficio && (
          <>
            <_Campo label="Radicado">
              <_Input mono value={d.radicado} onChange={v => setCampo('radicado', v)}
                placeholder="20251143210" />
            </_Campo>
            <_Campo label="Fecha radicado">
              <_Input type="date" value={d.fechaRadicado} onChange={v => setCampo('fechaRadicado', v)} />
            </_Campo>
          </>
        )}
        {d.esOficio && (
          <_Campo label="N° Orden de policía">
            <_Input value={d.orden} onChange={v => setCampo('orden', v)} placeholder="123-2026" />
          </_Campo>
        )}
        <_Campo label="Fecha de visita">
          <_Input type="date" value={d.fechaVisita} onChange={v => setCampo('fechaVisita', v)} />
        </_Campo>
      </_Seccion>

      {/* 2. UBICACIÓN ─────────────────────────────────────── */}
      <_Seccion titulo="Ubicación del inmueble" color="azul">
        <_Campo label="Dirección del inmueble">
          <_Input value={d.direccion} onChange={v => setCampo('direccion', v)}
            placeholder="Cl 50 # 32-10" />
        </_Campo>
        <_Campo label="Barrio / Vereda">
          <_Input value={d.barrio} onChange={v => setCampo('barrio', v)}
            placeholder="Manchester" />
        </_Campo>
        <_Campo label="Comuna">
          <_Input value={d.comuna} onChange={v => setCampo('comuna', v)}
            placeholder="4" />
        </_Campo>

        <div className="gps-box">
          <div style={{ flex: 1 }}>
            <div className="gps-coords">
              {d.lat != null && d.lon != null
                ? `${Number(d.lat).toFixed(6)}, ${Number(d.lon).toFixed(6)}`
                : 'Sin coordenadas'}
            </div>
            <div className="gps-dir">{d.direccion || '—'}</div>
          </div>
          <_BtnAccion busy={busyGeo} onClick={ejecutarGeocode}>
            {busyGeo ? '...' : '📍 Buscar coordenadas'}
          </_BtnAccion>
        </div>
      </_Seccion>

      {/* 3. PERSONA QUE ATIENDE ──────────────────────────── */}
      <_Seccion titulo="Persona que atiende" color="azul">
        <_Campo label="Nombre completo">
          <_Input value={d.atiendeNombre} onChange={v => setCampo('atiendeNombre', v)} />
        </_Campo>
        <_Campo label="Cédula">
          <_Input mono value={d.atiendeId} onChange={v => setCampo('atiendeId', v)} />
        </_Campo>
        <_Campo label="Teléfono">
          <_Input mono value={d.atiendeTel} onChange={v => setCampo('atiendeTel', v)} />
        </_Campo>
        <_Campo label="Relación con el evento">
          <_Radio value={d.atiendeRelacion} onChange={v => setCampo('atiendeRelacion', v)}
            opciones={['Propietario', 'Constructor', 'Arrendatario', 'Vecino', 'Otro']} />
        </_Campo>
        <_Campo label="Dirección de notificación">
          <_Input value={d.atiendeDir} onChange={v => setCampo('atiendeDir', v)} />
        </_Campo>
        <_Campo label="Correo electrónico">
          <_Input type="email" value={d.atiendeEmail}
            onChange={v => setCampo('atiendeEmail', v)} />
        </_Campo>
      </_Seccion>

      {/* 4. CARACTERÍSTICAS ──────────────────────────────── */}
      <_Seccion titulo="Características de la edificación" color="cafe">
        <_Campo label="Estado de la obra">
          <_Radio value={d.estadoObra} onChange={v => setCampo('estadoObra', v)}
            opciones={['Terminada', 'En ejecución', 'Paralizada', 'No iniciada']} />
        </_Campo>
        <_Campo label="¿Reparación locativa?">
          <_Radio value={d.repLocativa} onChange={v => setCampo('repLocativa', v)}
            opciones={['SI', 'NO']} />
        </_Campo>
        <_Campo label="¿Habitado?">
          <_Radio value={d.habitado} onChange={v => setCampo('habitado', v)}
            opciones={['SI', 'NO']} />
        </_Campo>
        <_Campo label="Altura en pisos">
          <_Input mono value={d.alturaPisos} onChange={v => setCampo('alturaPisos', v)} />
        </_Campo>
        <_Campo label="N° destinaciones actuales">
          <_Input mono value={d.destActuales} onChange={v => setCampo('destActuales', v)} />
        </_Campo>
        <_Campo label="Usos actuales">
          <_Input value={d.usos} onChange={v => setCampo('usos', v)}
            placeholder="Vivienda · Comercio · ..." />
        </_Campo>
        <_Campo label="Tipo de cubierta actual">
          <_Input value={d.cubiertaActual} onChange={v => setCampo('cubiertaActual', v)}
            placeholder="Teja de barro · Placa · ..." />
        </_Campo>
        <_Campo label="Código catastral">
          <_Input mono value={d.catastral} onChange={v => setCampo('catastral', v)} />
        </_Campo>
        <_Campo label="N° ficha predial">
          <_Input mono value={d.ficha} onChange={v => setCampo('ficha', v)} />
        </_Campo>
      </_Seccion>

      {/* 5. VERIFICACIÓN DOCUMENTAL ──────────────────────── */}
      <_Seccion titulo="Verificación documental" color="cafe">
        <_Campo label="¿Se aportó licencia?">
          <_Radio value={d.licenciaAportada} onChange={v => setCampo('licenciaAportada', v)}
            opciones={['SI', 'NO']} />
        </_Campo>
        {d.licenciaAportada === 'SI' && (
          <>
            <_Campo label="N° Licencia">
              <_Input mono value={d.licencia} onChange={v => setCampo('licencia', v)} />
            </_Campo>
            <_Campo label="Fecha de la licencia">
              <_Input type="date" value={d.fechaLicencia}
                onChange={v => setCampo('fechaLicencia', v)} />
            </_Campo>
            <_Campo label="Tipo y modalidad">
              <_Input value={d.tipoLicencia} onChange={v => setCampo('tipoLicencia', v)} />
            </_Campo>
            <_Campo label="Pisos aprobados">
              <_Input mono value={d.pisos} onChange={v => setCampo('pisos', v)} />
            </_Campo>
            <_Campo label="Destinaciones aprobadas">
              <_Input value={d.destinaciones} onChange={v => setCampo('destinaciones', v)} />
            </_Campo>
            <_Campo label="Cubierta aprobada">
              <_Input value={d.cubierta} onChange={v => setCampo('cubierta', v)} />
            </_Campo>
            <_Campo label="Sistema estructural">
              <_Input value={d.sistema} onChange={v => setCampo('sistema', v)} />
            </_Campo>
            <_Campo label="Observaciones de la licencia">
              <_TextArea value={d.obsLicencia} onChange={v => setCampo('obsLicencia', v)} rows={3} />
            </_Campo>
          </>
        )}
      </_Seccion>

      {/* 7. DESCRIPCIÓN ──────────────────────────────────── */}
      <_Seccion titulo="Descripción de la situación encontrada" color="gris">
        <_Campo label="Actuación / Observaciones"
          hint="Texto descriptivo de lo encontrado en sitio. Usa el botón IA para pulir la redacción.">
          <_TextArea value={d.actuacion} onChange={v => setCampo('actuacion', v)} rows={6} />
        </_Campo>
        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <_BtnAccion busy={busyMejora} onClick={ejecutarMejora}>
            {busyMejora ? '...' : '✨ Mejorar con IA'}
          </_BtnAccion>
          <_BtnAccion onClick={() => appAlert('La grabación por voz se conectará en la próxima iteración (Web Speech API + transcripción).', { titulo: 'Próximamente' })}>
            🎤 Dictar (próximo)
          </_BtnAccion>
        </div>
      </_Seccion>

      {/* 7B. CONCLUSIONES ────────────────────────────────── */}
      <_Seccion titulo="Conclusiones" color="cafe">
        <_Campo label="Tipo de infracción (Art. 135 Ley 1801/2016)">
          <_Input value={d.infraccion} onChange={v => setCampo('infraccion', v)} />
        </_Campo>
        <_Campo label="Área de contravención (m²)">
          <_Input mono value={d.area} onChange={v => setCampo('area', v)} />
        </_Campo>
        <_Campo label="¿Cumple retiro de quebrada?">
          <_Radio value={d.quebrada} onChange={v => setCampo('quebrada', v)}
            opciones={['SI', 'NO', 'N/A']} />
        </_Campo>
        <_Campo label="¿Se decreta suspensión de obra?">
          <_Radio value={d.suspension} onChange={v => setCampo('suspension', v)}
            opciones={['SI', 'NO']} />
        </_Campo>
        {d.suspension === 'SI' && (
          <_Campo label="N° Orden de policía">
            <_Input value={d.orden} onChange={v => setCampo('orden', v)} />
          </_Campo>
        )}
        <_Campo label="Fecha de citación">
          <_Input type="date" value={d.citacionFecha}
            onChange={v => setCampo('citacionFecha', v)} />
        </_Campo>
        <_Campo label="Hora de citación">
          <select className="input-campo" value={d.citacionHora}
            onChange={e => setCampo('citacionHora', e.target.value)}>
            <option value="">Sin hora</option>
            {HORAS_CITACION.map(h => <option key={h.val} value={h.val}>{h.l}</option>)}
          </select>
        </_Campo>
      </_Seccion>

      {/* 8. VISITADORES ──────────────────────────────────── */}
      <_Seccion titulo="Funcionarios que realizan la inspección" color="azul">
        <_Campo label="Visitador(es)">
          <div className="chips">
            {VISITADORES.map(v => {
              const seleccionados = (d.visitador || '').split(' / ').filter(Boolean);
              const activo = seleccionados.includes(v.val);
              function toggle() {
                const next = activo
                  ? seleccionados.filter(x => x !== v.val)
                  : [...seleccionados, v.val];
                setCampo('visitador', next.join(' / '));
              }
              return (
                <div key={v.val}
                  className={'chip-vis' + (activo ? ' activo' : '')}
                  data-val={v.val}
                  onClick={toggle}>
                  {v.l}
                </div>
              );
            })}
          </div>
        </_Campo>
      </_Seccion>

      {/* 9. NORMA POT ────────────────────────────────────── */}
      <_Seccion titulo="Consulta norma POT" color="gris">
        <div style={{
          background: 'rgba(74,108,140,0.10)', padding: 10, borderRadius: 8,
          fontSize: 12, color: 'var(--texto-2)', marginBottom: 10,
        }}>
          Puede diligenciarse en campo o en oficina con acceso a cartografía del POT.
        </div>
        <_Campo label="Polígono de uso del suelo">
          <_Input mono value={d.poligono} onChange={v => setCampo('poligono', v)}
            placeholder="ZR-CN-1" />
        </_Campo>
        <_Campo label="Amenaza">
          <_Radio value={d.amenaza} onChange={v => setCampo('amenaza', v)}
            opciones={['Alta', 'Media', 'Baja', 'No definida']} />
        </_Campo>
        <_Campo label="Suelo de protección">
          <_Radio value={d.sueloProt} onChange={v => setCampo('sueloProt', v)}
            opciones={['SI', 'NO', 'Parcial']} />
        </_Campo>
        <_BtnAccion busy={busyPOT} onClick={ejecutarPOT}>
          {busyPOT ? '...' : '🗺 Consultar POT por coordenadas'}
        </_BtnAccion>
      </_Seccion>

      {/* ── Botón guardar ──────────────────────────────────── */}
      <button onClick={guardar} disabled={guardando} className="btn-principal verde"
        style={{ marginTop: 18, fontSize: 16 }}>
        {guardando ? 'Guardando...' : (filaEditando ? '↻ Actualizar visita' : '💾 Guardar visita')}
      </button>

      {/* Fotos (aparece cuando hay carpeta Drive) */}
      {d.idCarpetaFotos && filaEditando && (
        <SeccionFotos
          idCarpetaFotos={d.idCarpetaFotos}
          fila={filaEditando}
          linkDrive={d.linkDrive}
        />
      )}

      {/* Generar acta F-GGO-46 — dos botones independientes (solo con fila guardada) */}
      {filaEditando && (
        <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button onClick={generarActa} disabled={generandoActa} className="btn-principal"
            style={{ fontSize: 15 }}>
            {generandoActa ? 'Generando acta...' : '📋 Generar acta F-GGO-46'}
          </button>
          <div style={{ fontSize: 11, color: 'var(--texto-suave)', textAlign: 'center', marginTop: -4 }}>
            Hoja de caracterización en Drive.
          </div>

          <button onClick={generarRegistroFotografico} disabled={generandoRF}
            className="btn-principal" style={{ fontSize: 15, marginTop: 6 }}>
            {generandoRF ? 'Generando registro fotográfico...' : '🖼️ Generar registro fotográfico'}
          </button>
          <div style={{ fontSize: 11, color: 'var(--texto-suave)', textAlign: 'center', marginTop: -4 }}>
            Documento con todas las fotos subidas a la subcarpeta de la visita.
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
//   SECCIÓN FOTOS — subida + descripción IA
// ══════════════════════════════════════════════════════════════
function SeccionFotos({ idCarpetaFotos, fila, linkDrive }) {
  const [subiendo, setSubiendo] = useStateNV(false);
  const [fotos, setFotos]       = useStateNV([]);  // [{ nombre, link, descripcion }]
  const [pendiente, setPendiente] = useStateNV(null); // { file, preview, descripcion }
  const [busyDesc, setBusyDesc] = useStateNV(false);

  async function _aBase64(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload  = () => resolve((r.result || '').toString().split(',')[1] || '');
      r.onerror = () => reject(new Error('No se pudo leer la foto'));
      r.readAsDataURL(file);
    });
  }

  function alSeleccionar(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      appAlert('La foto pesa más de 8MB. Comprímela antes de subir.', { titulo: 'Foto muy grande' });
      return;
    }
    const preview = URL.createObjectURL(file);
    setPendiente({ file, preview, descripcion: '' });
  }

  async function generarDescripcion() {
    if (!pendiente) return;
    setBusyDesc(true);
    try {
      const base64 = await _aBase64(pendiente.file);
      const desc = await describirFotoConIA(base64, pendiente.file.type);
      setPendiente(p => ({ ...p, descripcion: desc }));
    } catch (e) {
      await appAlert('Error: ' + e.message, { titulo: 'IA descripción' });
    }
    setBusyDesc(false);
  }

  async function subirAhora() {
    if (!pendiente) return;
    setSubiendo(true);
    try {
      const base64 = await _aBase64(pendiente.file);
      const r = await subirFotoConDescripcion(idCarpetaFotos, base64, pendiente.file.type, pendiente.descripcion);
      setFotos(prev => [...prev, {
        nombre: r.nombre || pendiente.file.name,
        link:   r.link,
        descripcion: pendiente.descripcion,
      }]);
      URL.revokeObjectURL(pendiente.preview);
      setPendiente(null);
    } catch (e) {
      await appAlert('Error: ' + e.message, { titulo: 'Subir foto' });
    }
    setSubiendo(false);
  }

  return (
    <div className="form-seccion" style={{ marginTop: 14 }}>
      <span className="form-seccion-titulo titulo-azul">Registro fotográfico</span>
      <div style={{ marginTop: 12 }}>
        {linkDrive && (
          <div style={{ marginBottom: 12 }}>
            <a href={linkDrive} target="_blank" rel="noopener" style={{
              fontSize: 12, color: 'var(--brand-accent)', textDecoration: 'none',
            }}>↗ Abrir carpeta Drive de la visita</a>
          </div>
        )}

        {!pendiente && (
          <label style={{
            display: 'block', padding: 14, border: '1.5px dashed var(--borde-med)',
            borderRadius: 10, textAlign: 'center', cursor: 'pointer',
            background: 'var(--gris-bg)', fontSize: 13, color: 'var(--texto-suave)',
          }}>
            📷 Toca para seleccionar una foto
            <input type="file" accept="image/*" capture="environment"
              onChange={alSeleccionar} style={{ display: 'none' }} />
          </label>
        )}

        {pendiente && (
          <div style={{
            border: '1px solid var(--borde-med)', borderRadius: 10, padding: 12,
            background: 'var(--superficie)',
          }}>
            <img src={pendiente.preview} alt="" style={{
              width: '100%', maxHeight: 280, objectFit: 'contain',
              borderRadius: 8, background: 'var(--gris-bg)', marginBottom: 10,
            }} />
            <_TextArea value={pendiente.descripcion}
              onChange={v => setPendiente(p => ({ ...p, descripcion: v }))}
              placeholder="Descripción de la foto..." rows={3} />
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <_BtnAccion busy={busyDesc} onClick={generarDescripcion}>
                {busyDesc ? '...' : '✨ Describir con IA'}
              </_BtnAccion>
              <button onClick={subirAhora} disabled={subiendo} className="btn-principal verde"
                style={{ flex: 1, margin: 0, padding: '8px 12px', fontSize: 13 }}>
                {subiendo ? 'Subiendo...' : '⬆ Subir foto'}
              </button>
              <button onClick={() => { URL.revokeObjectURL(pendiente.preview); setPendiente(null); }}
                style={{
                  background: 'var(--gris-bg)', border: '1px solid var(--borde)',
                  borderRadius: 8, padding: '8px 12px', fontFamily: 'inherit',
                  fontSize: 13, cursor: 'pointer',
                }}>Cancelar</button>
            </div>
          </div>
        )}

        {fotos.length > 0 && (
          <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {fotos.map((f, i) => (
              <div key={i} style={{
                padding: '8px 12px', background: 'var(--gris-bg)', borderRadius: 8, fontSize: 12,
              }}>
                <div style={{ fontWeight: 600 }}>✓ {f.nombre}</div>
                {f.descripcion && (
                  <div style={{ color: 'var(--texto-suave)', marginTop: 2 }}>{f.descripcion}</div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

window.NuevaVisitaScreen = NuevaVisitaScreen;
