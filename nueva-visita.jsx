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

// ── Helper para N° Orden de Policía (prefijo YYYY-09-XXX) ─────
function _ordenPrefijo() {
  return new Date().getFullYear() + '-09-';
}
function _formatearOrden(consecutivo) {
  // Recibe número 1-999, devuelve "YYYY-09-XXX" con cero-relleno
  const n = parseInt(consecutivo, 10);
  if (isNaN(n) || n <= 0) return '';
  return _ordenPrefijo() + String(n).padStart(3, '0');
}
function _extraerConsecutivoOrden(ordenCompleta) {
  // Extrae el consecutivo numérico de "YYYY-09-XXX" u otro formato
  if (!ordenCompleta) return '';
  const m = /(\d{4})-09-(\d+)/.exec(ordenCompleta);
  if (m) return String(parseInt(m[2], 10)); // sin ceros a la izquierda para el input
  // Fallback: devolver tal cual si no coincide con el patrón
  return ordenCompleta;
}

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

// ── Barrios agrupados por comuna ──────────────────────────────
const BARRIOS_POR_COMUNA = [
  { comuna: '1', label: 'Comuna 1', barrios: ['El Cafetal','Jose Antonio Galan','La Esmeralda','La Maruchenga','La Pradera','Los Sauces','Paris','Salvador Allende'] },
  { comuna: '2', label: 'Comuna 2', barrios: ['Barrio Nuevo','Gran Avenida','La Cabana','La Cabanita','La Florida','La Madera','San Jose Obrero','Zona Industrial #1'] },
  { comuna: '3', label: 'Comuna 3', barrios: ['Amazonia','Los Bucaros','Molinares','Salento','San Simon','Santa Ana','Serramonte','Villas de Occidente','Zona Industrial #2'] },
  { comuna: '4', label: 'Comuna 4', barrios: ['Andalucia','Central','Centro','El Cairo','El Congolo','El Rosario','Espiritu Santo','La Estacion','La Meseta','La Milagrosa','Las Granjas','Lopez de Mesa','Manchester','Nazaret','Perez','Prado','Puerto Bello','Rincon Santos','Suarez','Zona Industrial #3'] },
  { comuna: '5', label: 'Comuna 5', barrios: ['Altavista','Aralias','Briceno','Buenos Aires','El Carmelo','El Paraiso','El Porvenir','El Trapiche','Hato Viejo','La Cumbre','La Primavera','Riachuelos','Urapanes','Valadares','Villa Maria','Villas de Comfenalco'] },
  { comuna: '6', label: 'Comuna 6', barrios: ['Bellavista','El Ducado','Girasoles','La Aldea','Los Alpes','Pachelly','Playa Rica','San Gabriel','San Martin','Tierradentro','Villa Linda','Villas del Sol'] },
  { comuna: '7', label: 'Comuna 7', barrios: ['Altos de Niquia','Altos de Quitasol','El Mirador','La Selva','Niquia Bifamiliares'] },
  { comuna: '8', label: 'Comuna 8', barrios: ['Ciudad Niquia','Ciudadela del Norte','Hermosa Provincia','Panamericano','Terranova','Zona Industrial #4'] },
  { comuna: '9', label: 'Comuna 9', barrios: ['El Trebol','Guasimalito','La Navarra','Zona Industrial #5'] },
  { comuna: '10', label: 'Comuna 10', barrios: ['Alcala','Cinco Estrellas','Estacion Primera','Fontidueno','La Camila','La Mina','La Virginia','Las Vegas','Los Ciruelos','Marco Fidel Suarez','Zona Industrial #6'] },
  { comuna: '11', label: 'Comuna 11', barrios: ['Acevedo','Alpes del Norte','Belvedere','La Gabriela','Santa Rita','Zamora','Zona Industrial #7'] },
  { comuna: 'Vereda', label: 'Veredas', barrios: ['Vda. Buenavista','Vda. Charco Verde','Vda. Cuartas','Vda. El Carmelo','Vda. El Tambo','Vda. Granizal','Vda. Hatoviejo','Vda. Jalisco','Vda. La China','Vda. La Meneses','Vda. La Palma','Vda. La Primavera','Vda. La Union','Vda. Los Espejos','Vda. Potrerito','Vda. Quitasol','Vda. Sabanalarga','Vda. Tierradentro'] },
];

// Mapa plano barrio → comuna para lookup rápido
const _BARRIO_A_COMUNA = {};
BARRIOS_POR_COMUNA.forEach(g => {
  g.barrios.forEach(b => { _BARRIO_A_COMUNA[b.toUpperCase()] = g.comuna; });
});

// ── Catálogo: Usos actuales (chips multi-select) ──────────────
const USOS_OPCIONES = ['Residencial', 'Comercial', 'Industrial', 'Servicios', 'Institucional', 'Otro'];

// ── Catálogo: Tipo cubierta actual (chips multi-select) ───────
const CUBIERTA_ACTUAL_OPCIONES = [
  'Teja de barro', 'Teja termoacústica', 'Teja de zinc', 'Teja de fibrocemento',
  'Losa en concreto', 'Losa en placa fácil', 'Sin cubierta', 'Otro'
];

// ── Catálogo: Sistema estructural (select) ────────────────────
const SISTEMA_ESTRUCTURAL_OPCIONES = [
  'Muros de carga no estructurales',
  'Pórticos de concreto reforzado',
  'Pórticos de acero',
  'Pórticos mixtos acero-concreto',
  'Muros de concreto reforzado',
  'Mampostería estructural reforzada',
  'Mampostería confinada',
];

// ── Catálogo: Tipo y modalidad licencia (select) ──────────────
const TIPO_MODALIDAD_OPCIONES = [
  'Licencia de construcción — Obra nueva',
  'Licencia de construcción — Ampliación',
  'Licencia de construcción — Adecuación',
  'Licencia de construcción — Modificación',
  'Licencia de construcción — Restauración',
  'Licencia de construcción — Reforzamiento estructural',
  'Licencia de construcción — Demolición',
  'Licencia de construcción — Cerramiento',
  'Licencia de urbanización',
  'Licencia de parcelación',
  'Licencia de subdivisión',
];

// ── Catálogo: Cubierta licencia (select) ──────────────────────
const CUBIERTA_LICENCIA_OPCIONES = [
  'Cubierta en techo',
  'Cubierta en losa',
  'Cubierta en techo y losa',
];

// ── Catálogo: Tipo de contravención (chips multi-select por literal) ──
const CONTRAVENCION_GRUPOS = [
  { literal: 'Literal A', opciones: [
    { val: 'A1: Áreas protegidas', l: 'A1: Áreas protegidas' },
    { val: 'A2: Diferente a lo aprobado', l: 'A2: Diferente a lo aprobado' },
    { val: 'A3: Bienes uso público (Antejardín)', l: 'A3: Bienes uso público (Antejardín)' },
    { val: 'A4: Sin licencia o caducada', l: 'A4: Sin licencia o caducada' },
  ]},
  { literal: 'Literal C', opciones: [
    { val: 'C9: Uso distinto licencia', l: 'C9: Uso distinto licencia' },
    { val: 'C10: Ubicación incorrecta', l: 'C10: Ubicación incorrecta' },
    { val: 'C11: Usos suelo prohibidos', l: 'C11: Usos suelo prohibidos' },
    { val: 'C12: Destinación no autorizada', l: 'C12: Destinación no autorizada' },
  ]},
  { literal: 'Literal D', opciones: [
    { val: 'D13: Materiales en vía', l: 'D13: Materiales en vía' },
    { val: 'D14: Sanitarios provisionales', l: 'D14: Sanitarios provisionales' },
    { val: 'D15: Protecciones seguridad', l: 'D15: Protecciones seguridad' },
    { val: 'D16: Llantas sucias', l: 'D16: Llantas sucias' },
    { val: 'D17: Residuos inmediatos', l: 'D17: Residuos inmediatos' },
    { val: 'D18: Retiro escombros', l: 'D18: Retiro escombros' },
    { val: 'D19: Seguridad personal', l: 'D19: Seguridad personal' },
    { val: 'D20: Emisión partículas', l: 'D20: Emisión partículas' },
    { val: 'D21: Contaminación agua', l: 'D21: Contaminación agua' },
    { val: 'D22: Reparar daños públicos', l: 'D22: Reparar daños públicos' },
    { val: 'D23: Reparar daños vecinos', l: 'D23: Reparar daños vecinos' },
    { val: 'D24: Horario restringido', l: 'D24: Horario restringido' },
  ]},
];
const CONTRAVENCION_ESPECIAL = 'No se evidencia infracción';

// ── Estado inicial (en blanco o prefill) ───────────────────────
function _estadoInicial(datosIniciales) {
  const d = datosIniciales || {};
  // Separar actuación y conclusiones (almacenados juntos en BD col AU)
  const _rawAct = d['ACTUACION / OBSERVACIONES'] || d['ACTUACION'] || '';
  const _partsAct = _rawAct.split('\n══CONCLUSIONES══\n');
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
    atiendeRelacionOtro: '', // texto libre cuando relación = "Otro"
    atiendeDir:     d['DIR NOTIFICACION']         || '',
    atiendeEmail:   d['CORREO ELECTRONICO']       || '',
    dirNotifIgual:  true, // checkbox "Misma dirección del inmueble"
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
    actuacion:       _partsAct[0] || '',
    obsConclusion:   _partsAct[1] || '',
    infraccion:      d['TIPO DE INFRACCION']  || '',
    area:            d['AREA CONTRAVENCION m2'] || d['AREA CONTRAVENCION M2'] || '',
    areaNoMedible:   false, // checkbox "No se pudo medir"
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

// ── Parsear chips multi-select desde string guardado en BD ─────
function _parsearChipsDesdeString(str, separador) {
  if (!str) return [];
  return str.split(separador).map(s => s.trim()).filter(Boolean);
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

  // Relación: si es "Otro", enviar el texto del campo libre
  const relacionFinal = d.atiendeRelacion === 'Otro'
    ? (d.atiendeRelacionOtro || 'Otro')
    : (d.atiendeRelacion || '');

  // Dirección de notificación: si es igual al inmueble, usar d.direccion
  const dirNotifFinal = d.dirNotifIgual ? (d.direccion || '') : (d.atiendeDir || '');

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
    relacionFinal,                                // K  RELACION CON EL EVENTO
    dirNotifFinal,                                // L  DIR NOTIFICACION
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
    d.areaNoMedible ? '' : (d.area || ''),        // Y  AREA CONTRAVENCION m2
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
    _primeraMayus(d.actuacion) + (d.obsConclusion ? '\n══CONCLUSIONES══\n' + d.obsConclusion : ''), // AU ACTUACION / OBSERVACIONES (incluye conclusiones)
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
      <div className="form-grid-2col" style={{ marginTop: 12 }}>{children}</div>
    </div>
  );
}

function _Campo({ label, children, hint, fullWidth }) {
  return (
    <div className={'input-grupo' + (fullWidth ? ' full-width' : '')}>
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

// ── Chips multi-select genérico ───────────────────────────────
// opciones: string[]  |  valor combinado se une con `separador`
// Soporta opción "Otro" que muestra campo de texto libre.
function _ChipsMulti({ opciones, value, onChange, separador, otroLabel }) {
  const sep = separador || ' · ';
  // Parsear valores actuales desde el string combinado
  const seleccionados = useMemoNV(() => {
    if (!value) return [];
    return value.split(sep).map(s => s.trim()).filter(Boolean);
  }, [value, sep]);

  // Determinar si hay un valor "Otro" activo (un valor que no está en opciones normales)
  const opcionesNormales = opciones.filter(o => o !== 'Otro');
  const valoresOtro = seleccionados.filter(s => !opcionesNormales.includes(s) && s !== 'Otro');
  const otroActivo = seleccionados.includes('Otro') || valoresOtro.length > 0;
  const textoOtro = valoresOtro.join(sep);

  function toggle(opt) {
    let next;
    if (opt === 'Otro') {
      // Toggle "Otro": si se desactiva, quitar valores no estándar
      if (otroActivo) {
        next = seleccionados.filter(s => opcionesNormales.includes(s));
      } else {
        next = [...seleccionados.filter(s => opcionesNormales.includes(s)), 'Otro'];
      }
    } else {
      if (seleccionados.includes(opt)) {
        next = seleccionados.filter(s => s !== opt);
      } else {
        next = [...seleccionados, opt];
      }
    }
    onChange(next.join(sep));
  }

  function setTextoOtro(texto) {
    // Reemplazar valores no estándar con el nuevo texto
    const base = seleccionados.filter(s => opcionesNormales.includes(s));
    if (texto.trim()) {
      base.push(texto.trim());
    }
    onChange(base.join(sep));
  }

  return (
    <div>
      <div className="chips">
        {opciones.map(opt => (
          <div key={opt}
            className={'chip' + ((opt === 'Otro' ? otroActivo : seleccionados.includes(opt)) ? ' activo' : '')}
            onClick={() => toggle(opt)}>
            {opt}
          </div>
        ))}
      </div>
      {otroActivo && opciones.includes('Otro') && (
        <input
          type="text"
          className="input-campo"
          style={{ marginTop: 8 }}
          placeholder={otroLabel || '¿Cuál?'}
          value={textoOtro}
          onChange={e => setTextoOtro(e.target.value)}
        />
      )}
    </div>
  );
}

// ── Chips contravención (multi-select por grupos de literal) ──
function _ChipsContravencion({ value, onChange }) {
  const sep = ' | ';
  const seleccionados = useMemoNV(() => {
    if (!value) return [];
    return value.split(sep).map(s => s.trim()).filter(Boolean);
  }, [value]);

  const esNoInfraccion = seleccionados.includes(CONTRAVENCION_ESPECIAL);

  function toggle(val) {
    let next;
    if (val === CONTRAVENCION_ESPECIAL) {
      // Si se selecciona "No se evidencia", deseleccionar todo lo demás
      next = esNoInfraccion ? [] : [CONTRAVENCION_ESPECIAL];
    } else {
      // Si estaba "No se evidencia", quitarlo
      const base = seleccionados.filter(s => s !== CONTRAVENCION_ESPECIAL);
      if (base.includes(val)) {
        next = base.filter(s => s !== val);
      } else {
        next = [...base, val];
      }
    }
    onChange(next.join(sep));
  }

  return (
    <div>
      {CONTRAVENCION_GRUPOS.map(grupo => (
        <div key={grupo.literal} style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--texto-suave)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.4px' }}>
            {grupo.literal}
          </div>
          <div className="chips">
            {grupo.opciones.map(opt => (
              <div key={opt.val}
                className={'chip' + (seleccionados.includes(opt.val) ? ' activo' : '')}
                style={{ fontSize: 12 }}
                onClick={() => toggle(opt.val)}>
                {opt.l}
              </div>
            ))}
          </div>
        </div>
      ))}
      {/* Opción especial */}
      <div style={{ marginTop: 6 }}>
        <div className="chips">
          <div className={'chip' + (esNoInfraccion ? ' activo' : '')}
            style={{ fontSize: 12, fontStyle: 'italic' }}
            onClick={() => toggle(CONTRAVENCION_ESPECIAL)}>
            {CONTRAVENCION_ESPECIAL}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Select de barrio con optgroup por comuna ──────────────────
function _SelectBarrio({ barrio, barrioOtro, comuna, onChangeBarrio, onChangeBarrioOtro, onChangeComuna }) {
  const esOtro = barrio === '__otro__';

  function handleChange(val) {
    if (val === '__otro__') {
      onChangeBarrio('__otro__');
      return;
    }
    onChangeBarrio(val);
    // Auto-asignar comuna
    if (val && _BARRIO_A_COMUNA[val.toUpperCase()]) {
      onChangeComuna(_BARRIO_A_COMUNA[val.toUpperCase()]);
    }
  }

  // Determinar si el valor actual viene de la lista o es personalizado
  const valorEnLista = BARRIOS_POR_COMUNA.some(g => g.barrios.includes(barrio));
  const valorSelect = valorEnLista ? barrio : (barrio && barrio !== '__otro__' && barrio !== '' ? '__otro__' : barrio);

  return (
    <div>
      <select className="input-campo" value={valorSelect} onChange={e => handleChange(e.target.value)}>
        <option value="">Seleccionar barrio...</option>
        {BARRIOS_POR_COMUNA.map(grupo => (
          <optgroup key={grupo.comuna} label={grupo.label}>
            {grupo.barrios.map(b => (
              <option key={b} value={b}>{b}</option>
            ))}
          </optgroup>
        ))}
        <option value="__otro__">Otro...</option>
      </select>
      {(esOtro || (!valorEnLista && barrio && barrio !== '')) && (
        <input
          type="text"
          className="input-campo"
          style={{ marginTop: 8 }}
          placeholder="Escribir nombre del barrio"
          value={esOtro ? (barrioOtro || '') : barrio}
          onChange={e => {
            if (esOtro) {
              onChangeBarrioOtro(e.target.value);
            } else {
              onChangeBarrio(e.target.value);
            }
          }}
        />
      )}
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

// Mapa Google Maps con pin arrastrable para corregir coordenadas
function _MapaGPS({ lat, lon, onMove }) {
  const mapRef = React.useRef(null);
  const gMapRef = React.useRef(null);
  const markerRef = React.useRef(null);

  useEffectNV(() => {
    if (!mapRef.current || typeof google === 'undefined' || !google.maps) return;
    const pos = { lat: Number(lat), lng: Number(lon) };

    if (!gMapRef.current) {
      gMapRef.current = new google.maps.Map(mapRef.current, {
        center: pos, zoom: 18, mapTypeId: 'satellite',
        disableDefaultUI: true, zoomControl: true,
        gestureHandling: 'greedy',
      });
      markerRef.current = new google.maps.Marker({
        position: pos, map: gMapRef.current, draggable: true,
        title: 'Arrastra para corregir ubicación',
      });
      markerRef.current.addListener('dragend', () => {
        const p = markerRef.current.getPosition();
        if (onMove) onMove(p.lat(), p.lng());
      });
    } else {
      gMapRef.current.setCenter(pos);
      markerRef.current.setPosition(pos);
    }
  }, [lat, lon]);

  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--texto-suave)', marginBottom: 4 }}>
        Arrastra el pin para corregir la ubicación
      </div>
      <div ref={mapRef} style={{
        width: '100%', height: 220, borderRadius: 10,
        border: '1px solid var(--borde)', overflow: 'hidden',
      }} />
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
//   MODAL INICIO — Elige tipo de visita y busca radicado
// ══════════════════════════════════════════════════════════════
function ModalInicioVisita({ onResult, onCancelar }) {
  const [paso, setPaso]         = useStateNV('tipo');    // 'tipo' | 'radicado' | 'resultado'
  const [radicado, setRadicado] = useStateNV('');
  const [buscando, setBuscando] = useStateNV(false);
  const [resultado, setResultado] = useStateNV(null);
  // resultado: { encontrado, visitas[], ultimaVisita, nVisitaSig }

  async function buscarRadicado() {
    if (!radicado.trim()) return;
    setBuscando(true);
    try {
      const { datos } = await leerVisitas({ forzar: true });
      const visitasRad = datos.filter(f =>
        (f['RADICADO'] || '').trim() === radicado.trim()
      );
      // Ordenar por N° visita descendente
      visitasRad.sort((a, b) =>
        parseInt(b['N° VISITA'] || b['N VISITA'] || 1) -
        parseInt(a['N° VISITA'] || a['N VISITA'] || 1)
      );
      const ultima = visitasRad[0] || null;
      const nMax = ultima
        ? parseInt(ultima['N° VISITA'] || ultima['N VISITA'] || 1)
        : 0;
      setResultado({
        encontrado: visitasRad.length > 0,
        visitas: visitasRad,
        ultimaVisita: ultima,
        nVisitaSig: nMax + 1,
      });
      setPaso('resultado');
    } catch (e) {
      await appAlert('Error al buscar: ' + e.message, { titulo: 'Error' });
    }
    setBuscando(false);
  }

  // Iniciar visita con datos precargados de una fila existente
  function iniciarConDatos(fila, nVisita) {
    onResult({
      tipo: 'pqr',
      datosIniciales: fila,
      fila: fila._idx,
      nVisita: nVisita || parseInt(fila['N° VISITA'] || fila['N VISITA'] || 1),
      esNueva: false,
    });
  }

  // Crear nueva visita para el mismo radicado (incrementa N° visita)
  function crearNuevaVisitaRadicado(filaBase) {
    // Copia datos base pero limpia campos de visita
    const datosBase = { ...filaBase };
    datosBase['N° VISITA'] = (resultado?.nVisitaSig || 2).toString();
    datosBase['N VISITA'] = datosBase['N° VISITA'];
    datosBase['ESTADO VISITA'] = 'PENDIENTE';
    datosBase['FECHA DE VISITA'] = '';
    datosBase['LINK_DRIVE'] = '';
    datosBase['ACTUACION / OBSERVACIONES'] = '';
    datosBase['TIPO DE INFRACCION'] = '';
    datosBase['AREA CONTRAVENCION m2'] = '';
    datosBase['AREA CONTRAVENCION M2'] = '';
    datosBase['SUSPENSION DE LA OBRA'] = '';
    datosBase['N° ORDEN DE POLICIA'] = '';
    datosBase['N ORDEN DE POLICIA'] = '';
    datosBase['FECHA CITACION'] = '';
    onResult({
      tipo: 'pqr',
      datosIniciales: datosBase,
      fila: null, // nueva fila
      nVisita: resultado?.nVisitaSig || 2,
      esNueva: true,
    });
  }

  // Radicado no encontrado — formulario manual
  function iniciarSinDatos() {
    onResult({
      tipo: 'pqr_manual',
      radicado: radicado.trim(),
    });
  }

  // Visita de oficio
  function iniciarOficio() {
    onResult({ tipo: 'oficio' });
  }

  const estiloModal = {
    minHeight: '60vh', display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center', padding: '40px 20px',
  };
  const estiloCard = {
    background: 'var(--superficie)', borderRadius: 'var(--r-lg)',
    border: '1px solid var(--borde)', boxShadow: 'var(--sombra-md)',
    padding: 28, maxWidth: 440, width: '100%',
  };
  const estiloBtn = (accent) => ({
    display: 'flex', alignItems: 'center', gap: 12, width: '100%',
    padding: '16px 20px', border: '1.5px solid ' + (accent ? 'var(--brand-accent)' : 'var(--borde-med)'),
    borderRadius: 'var(--r-md)', background: accent ? 'var(--brand-bg)' : 'var(--superficie)',
    cursor: 'pointer', fontFamily: 'inherit', fontSize: 15, fontWeight: 600,
    color: accent ? 'var(--brand-ink)' : 'var(--texto)', textAlign: 'left',
    transition: 'border-color 0.15s',
  });

  return (
    <div className="pantalla activa" style={estiloModal}>
      <div style={estiloCard}>
        {/* PASO 1: Elegir tipo */}
        {paso === 'tipo' && (
          <>
            <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 6, textAlign: 'center' }}>
              Nueva visita
            </div>
            <div style={{ fontSize: 13, color: 'var(--texto-suave)', marginBottom: 24, textAlign: 'center' }}>
              ¿Qué tipo de visita vas a realizar?
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <button type="button" style={estiloBtn(true)} onClick={() => setPaso('radicado')}>
                <span style={{ fontSize: 24 }}>📋</span>
                <div>
                  <div>Visita PQR / Radicado</div>
                  <div style={{ fontSize: 11, fontWeight: 400, color: 'var(--texto-suave)', marginTop: 2 }}>
                    Atención a una queja o solicitud con número de radicado
                  </div>
                </div>
              </button>
              <button type="button" style={estiloBtn(false)} onClick={iniciarOficio}>
                <span style={{ fontSize: 24 }}>🏗️</span>
                <div>
                  <div>Visita de oficio</div>
                  <div style={{ fontSize: 11, fontWeight: 400, color: 'var(--texto-suave)', marginTop: 2 }}>
                    Inspección por iniciativa propia, sin radicado previo
                  </div>
                </div>
              </button>
            </div>
            <button type="button" onClick={onCancelar} style={{
              marginTop: 20, background: 'none', border: 'none', color: 'var(--texto-suave)',
              fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', width: '100%', textAlign: 'center',
            }}>← Volver al inicio</button>
          </>
        )}

        {/* PASO 2: Ingresar radicado */}
        {paso === 'radicado' && (
          <>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 6 }}>
              Buscar radicado
            </div>
            <div style={{ fontSize: 13, color: 'var(--texto-suave)', marginBottom: 16 }}>
              Ingresa el número de radicado para cargar los datos de la BD
            </div>
            <input
              type="text"
              className="input-campo mono"
              placeholder="Ej: 20251143210"
              value={radicado}
              onChange={e => setRadicado(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && buscarRadicado()}
              autoFocus
              style={{ fontSize: 16, padding: 14, marginBottom: 12 }}
            />
            <div style={{ display: 'flex', gap: 10 }}>
              <button type="button" onClick={buscarRadicado} disabled={buscando || !radicado.trim()}
                className="btn-principal verde" style={{ flex: 1, margin: 0, fontSize: 14 }}>
                {buscando ? 'Buscando...' : 'Buscar en BD'}
              </button>
              <button type="button" onClick={() => setPaso('tipo')} style={{
                background: 'var(--gris-bg)', border: '1px solid var(--borde)', borderRadius: 8,
                padding: '10px 16px', fontFamily: 'inherit', fontSize: 13, cursor: 'pointer',
              }}>Atrás</button>
            </div>
          </>
        )}

        {/* PASO 3: Resultado de búsqueda */}
        {paso === 'resultado' && resultado && (
          <>
            {/* Radicado NO encontrado */}
            {!resultado.encontrado && (
              <>
                <div style={{ fontSize: 36, textAlign: 'center', marginBottom: 8 }}>🔍</div>
                <div style={{ fontSize: 16, fontWeight: 700, textAlign: 'center', marginBottom: 6 }}>
                  Radicado no encontrado
                </div>
                <div style={{ fontSize: 13, color: 'var(--texto-suave)', textAlign: 'center', marginBottom: 20 }}>
                  El radicado <strong>{radicado}</strong> no está en la base de datos.
                  Los datos deberán ingresarse manualmente.
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <button type="button" onClick={iniciarSinDatos}
                    className="btn-principal" style={{ margin: 0, fontSize: 14 }}>
                    Continuar sin datos precargados
                  </button>
                  <button type="button" onClick={() => { setPaso('radicado'); setResultado(null); }} style={{
                    background: 'var(--gris-bg)', border: '1px solid var(--borde)', borderRadius: 8,
                    padding: '10px 16px', fontFamily: 'inherit', fontSize: 13, cursor: 'pointer',
                    width: '100%',
                  }}>Buscar otro radicado</button>
                </div>
              </>
            )}

            {/* Radicado encontrado */}
            {resultado.encontrado && (() => {
              const u = resultado.ultimaVisita;
              const est = normalizarEstado(u['ESTADO VISITA']);
              const nVis = parseInt(u['N° VISITA'] || u['N VISITA'] || 1);
              const fecha = u['FECHA DE VISITA'] || u['FECHA RADICADO'] || '';
              const dir = u['DIRECCION INFRACCION'] || u['DIRECCION'] || '';
              const esCompletada = est === 'COMPLETADO' || est === 'COMPLETADA';
              const esIniciada = est === 'INICIADO';

              return (
                <>
                  <div style={{ fontSize: 36, textAlign: 'center', marginBottom: 8 }}>
                    {esCompletada ? '✅' : esIniciada ? '🔄' : '📋'}
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 700, textAlign: 'center', marginBottom: 4 }}>
                    Radicado {radicado}
                  </div>
                  {/* Resumen de la visita existente */}
                  <div style={{
                    background: 'var(--gris-bg)', borderRadius: 'var(--r-md)',
                    padding: 14, marginBottom: 16, fontSize: 13,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontWeight: 600 }}>Visita N°{nVis}</span>
                      <span style={{
                        fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
                        background: esCompletada ? '#dcfce7' : esIniciada ? '#fef9c3' : '#e0e7ff',
                        color: esCompletada ? '#166534' : esIniciada ? '#854d0e' : '#3730a3',
                      }}>{est}</span>
                    </div>
                    {dir && <div style={{ color: 'var(--texto-suave)' }}>{dir}</div>}
                    {fecha && <div style={{ color: 'var(--texto-suave)', marginTop: 2 }}>Fecha: {fecha}</div>}
                  </div>

                  {/* Acciones según estado */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {esCompletada && (
                      <>
                        <div style={{ fontSize: 13, color: 'var(--texto-suave)', textAlign: 'center', marginBottom: 4 }}>
                          La visita N°{nVis} ya fue completada. ¿Desea realizar una nueva visita?
                        </div>
                        <button type="button" onClick={() => crearNuevaVisitaRadicado(u)}
                          className="btn-principal verde" style={{ margin: 0, fontSize: 14 }}>
                          Crear visita N°{resultado.nVisitaSig}
                        </button>
                      </>
                    )}
                    {esIniciada && (
                      <>
                        <button type="button" onClick={() => iniciarConDatos(u, nVis)}
                          className="btn-principal verde" style={{ margin: 0, fontSize: 14 }}>
                          Continuar visita N°{nVis}
                        </button>
                        <button type="button" onClick={() => crearNuevaVisitaRadicado(u)}
                          className="btn-principal" style={{ margin: 0, fontSize: 14 }}>
                          Crear nueva visita N°{resultado.nVisitaSig}
                        </button>
                      </>
                    )}
                    {!esCompletada && !esIniciada && (
                      <button type="button" onClick={() => iniciarConDatos(u, nVis)}
                        className="btn-principal verde" style={{ margin: 0, fontSize: 14 }}>
                        Iniciar visita
                      </button>
                    )}
                    <button type="button" onClick={() => { setPaso('radicado'); setResultado(null); }} style={{
                      background: 'var(--gris-bg)', border: '1px solid var(--borde)', borderRadius: 8,
                      padding: '10px 16px', fontFamily: 'inherit', fontSize: 13, cursor: 'pointer',
                      width: '100%',
                    }}>Buscar otro radicado</button>
                  </div>
                </>
              );
            })()}
          </>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
//   PANTALLA
// ══════════════════════════════════════════════════════════════
function NuevaVisitaScreen({ usuario, filaInicial, datosIniciales, onSalir }) {
  // ── Fase: 'modal' muestra el selector de tipo, 'formulario' muestra el form ──
  const tieneDatos = filaInicial != null || datosIniciales != null;
  const [fase, setFase] = useStateNV(tieneDatos ? 'formulario' : 'modal');

  const [d, setD]               = useStateNV(() => _estadoInicial(datosIniciales));
  const [estadoVisita, setEstV] = useStateNV(filaInicial ? 'INICIADO' : 'PENDIENTE');
  const [filaEditando, setFE]   = useStateNV(filaInicial || null);
  const [guardando, setGuard]   = useStateNV(false);
  const [generandoActa, setGA]  = useStateNV(false);
  const [generandoRF,  setGRF]  = useStateNV(false);
  const [busyGeo, setBusyGeo]   = useStateNV(false);
  const [busyMejora, setBusyMe] = useStateNV(false);
  const [sugerenciaIA, setSugerenciaIA] = useStateNV(''); // texto mejorado pendiente de aceptar
  const [dictando, setDictando] = useStateNV(false);    // grabación por voz activa
  const [busyPOT, setBusyPOT]   = useStateNV(false);
  const [busyCat, setBusyCat]   = useStateNV(false);
  const [catResultados, setCatRes] = useStateNV(null);
  // Estado auxiliar para barrio "Otro" (texto libre)
  const [barrioOtro, setBarrioOtro] = useStateNV('');
  // Estado auxiliar para consecutivo de orden de policía (solo el número)
  const [ordenConsecutivo, setOrdenConsecutivo] = useStateNV(() =>
    _extraerConsecutivoOrden((datosIniciales || {})['N° ORDEN DE POLICIA'] || (datosIniciales || {})['N ORDEN DE POLICIA'] || '')
  );
  // Referencia estable al recognition de voz (debe estar ANTES del early return de fase=modal,
  // de lo contrario React lanza error #310 al cambiar de modal a formulario).
  const recognitionRef = React.useRef(null);

  // ── Callback del modal: configura el formulario según la elección ──
  function handleModalResult(res) {
    if (res.tipo === 'oficio') {
      // Visita de oficio — formulario en blanco con flag _oficio
      setD(_estadoInicial({ '_oficio': true }));
      setEstV('PENDIENTE');
      setFE(null);
    } else if (res.tipo === 'pqr') {
      // PQR con datos precargados de BD
      setD(_estadoInicial(res.datosIniciales));
      setEstV(res.esNueva ? 'PENDIENTE' : 'INICIADO');
      setFE(res.esNueva ? null : (res.fila || null));
      if (res.datosIniciales) {
        setOrdenConsecutivo(
          _extraerConsecutivoOrden(res.datosIniciales['N° ORDEN DE POLICIA'] || res.datosIniciales['N ORDEN DE POLICIA'] || '')
        );
      }
    } else if (res.tipo === 'pqr_manual') {
      // PQR sin datos en BD — solo radicado precompletado
      setD(_estadoInicial({ 'RADICADO': res.radicado }));
      setEstV('PENDIENTE');
      setFE(null);
    }
    setFase('formulario');
  }

  // Helper para actualizar un campo del form
  function setCampo(k, v) { setD(prev => ({ ...prev, [k]: v })); }

  // Prefijar visitador con el usuario logueado (si está en la lista)
  useEffectNV(() => {
    if (fase !== 'formulario') return; // no ejecutar en fase modal
    if (!d.visitador && usuario) {
      const m = VISITADORES.find(v => v.val.includes(usuario.usuario.toUpperCase().split(' ')[0]));
      if (m) setCampo('visitador', m.val);
    }
  }, [fase]); // se dispara cuando pasa a 'formulario'

  // Sincronizar orden completa cuando cambia el consecutivo
  useEffectNV(() => {
    if (ordenConsecutivo) {
      setCampo('orden', _formatearOrden(ordenConsecutivo));
    } else {
      setCampo('orden', '');
    }
  }, [ordenConsecutivo]);

  // Cuando estadoObra cambia a "Terminada", forzar suspensión a N/A
  useEffectNV(() => {
    if (d.estadoObra === 'Terminada') {
      setCampo('suspension', 'N/A');
    }
  }, [d.estadoObra]);

  // ── Si estamos en fase modal, mostrar solo el selector ──
  if (fase === 'modal') {
    return <ModalInicioVisita onResult={handleModalResult} onCancelar={onSalir} />;
  }

  // ── Geocode botón — al obtener coords dispara consulta POT automática ─
  async function ejecutarGeocode() {
    if (!d.direccion) {
      await appAlert('Ingresa una dirección primero.', { titulo: 'Falta dirección' });
      return;
    }
    setBusyGeo(true);
    try {
      const q = d.direccion + (d.barrio && d.barrio !== '__otro__' ? ', ' + d.barrio : '') + ', Bello, Antioquia';
      const r = await geocodeDireccion(q);
      const c = r.data || r;
      if (c.lat && c.lng) {
        setCampo('lat', c.lat); setCampo('lon', c.lng);
        ejecutarPOT(c.lat, c.lng);
        ejecutarBusquedaCatastral(c.lat, c.lng);
      } else {
        await appAlert('No se encontró la ubicación. Refina la dirección.', { titulo: 'Sin resultado' });
      }
    } catch (e) {
      await appAlert('Error: ' + e.message, { titulo: 'Geocoding' });
    }
    setBusyGeo(false);
  }

  // ── Mejorar texto con IA (genera sugerencia, no reemplaza directo) ──
  async function ejecutarMejora() {
    if (!d.actuacion) {
      await appAlert('Escribe algo en la descripción primero.', { titulo: 'Nada que mejorar' });
      return;
    }
    setBusyMe(true);
    try {
      const t = await mejorarTexto(d.actuacion);
      if (t) setSugerenciaIA(t);
    } catch (e) {
      await appAlert('Error: ' + e.message, { titulo: 'Mejora con IA' });
    }
    setBusyMe(false);
  }
  function aceptarSugerenciaIA() {
    setCampo('actuacion', sugerenciaIA);
    setSugerenciaIA('');
  }
  function descartarSugerenciaIA() {
    setSugerenciaIA('');
  }

  // ── Dictado por voz (Web Speech API) ───────────────────────
  // recognitionRef se declara arriba (antes del early return) para evitar React #310.

  function toggleDictado() {
    // Si ya está dictando, detener
    if (dictando && recognitionRef.current) {
      recognitionRef.current.stop();
      return;
    }
    // Verificar soporte
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      appAlert('Tu navegador no soporta dictado por voz. Usa Chrome o Edge.', { titulo: 'Sin soporte' });
      return;
    }
    const rec = new SpeechRecognition();
    rec.lang = 'es-CO';
    rec.continuous = true;
    rec.interimResults = false;
    recognitionRef.current = rec;

    rec.onresult = (ev) => {
      let texto = '';
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        if (ev.results[i].isFinal) {
          texto += ev.results[i][0].transcript;
        }
      }
      if (texto) {
        // Añadir al final del texto existente con espacio
        setD(prev => ({
          ...prev,
          actuacion: (prev.actuacion ? prev.actuacion + ' ' : '') + texto.trim(),
        }));
      }
    };
    rec.onerror = (ev) => {
      console.warn('[Dictado] error:', ev.error);
      if (ev.error !== 'aborted') {
        appAlert('Error de dictado: ' + ev.error, { titulo: 'Dictado' });
      }
      setDictando(false);
      recognitionRef.current = null;
    };
    rec.onend = () => {
      setDictando(false);
      recognitionRef.current = null;
    };

    rec.start();
    setDictando(true);
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
      // Barrio sugerido — intentar hacer match con la lista y actualizar comuna
      if (r.barrioSugerido) {
        const barrioNorm = r.barrioSugerido.trim();
        // Buscar coincidencia en la lista de barrios
        let encontrado = false;
        for (const grupo of BARRIOS_POR_COMUNA) {
          const match = grupo.barrios.find(b => b.toUpperCase() === barrioNorm.toUpperCase());
          if (match) {
            setCampo('barrio', match);
            setCampo('comuna', grupo.comuna);
            encontrado = true;
            break;
          }
        }
        // Si no se encontró en la lista y el campo está vacío, poner como texto
        if (!encontrado && !d.barrio) {
          setCampo('barrio', barrioNorm);
        }
      }
    } catch (e) {
      await appAlert('Error: ' + e.message, { titulo: 'Consulta POT' });
    }
    setBusyPOT(false);
  }

  // ── Búsqueda catastral por GPS ────────────────────────────
  async function ejecutarBusquedaCatastral(latArg, lonArg) {
    const lat = (latArg != null) ? latArg : d.lat;
    const lon = (lonArg != null) ? lonArg : d.lon;
    if (lat == null || lon == null) {
      await appAlert('Necesitas coordenadas primero. Usa "Buscar coordenadas" o "Mi ubicación".', { titulo: 'Sin GPS' });
      return;
    }
    setBusyCat(true);
    setCatRes(null);
    try {
      const res = await buscarCatastroGPS(lat, lon, 100);
      if (!res.length) {
        await appAlert('No se encontraron predios en un radio de 100m.', { titulo: 'Sin resultados' });
      } else if (res.length === 1) {
        setCampo('catastral', res[0].catastral);
        setCampo('ficha', String(res[0].ficha));
      } else {
        setCatRes(res.slice(0, 10));
      }
    } catch (e) {
      await appAlert('Error: ' + e.message, { titulo: 'Catastro' });
    }
    setBusyCat(false);
  }

  function seleccionarCatastral(item) {
    setCampo('catastral', item.catastral);
    setCampo('ficha', String(item.ficha));
    setCatRes(null);
  }

  // ── Geolocalización directa del dispositivo ───────────────
  async function usarMiUbicacion() {
    if (!navigator.geolocation) {
      await appAlert('Tu dispositivo no soporta geolocalización.', { titulo: 'GPS' });
      return;
    }
    setBusyGeo(true);
    try {
      const pos = await new Promise((ok, fail) =>
        navigator.geolocation.getCurrentPosition(ok, fail, { enableHighAccuracy: true, timeout: 15000 })
      );
      const lat = pos.coords.latitude;
      const lon = pos.coords.longitude;
      setCampo('lat', lat);
      setCampo('lon', lon);
      ejecutarPOT(lat, lon);
      ejecutarBusquedaCatastral(lat, lon);
    } catch (e) {
      const msg = e.code === 1 ? 'Permiso de ubicación denegado.' :
                  e.code === 3 ? 'Tiempo de espera agotado.' : 'No se pudo obtener ubicación.';
      await appAlert(msg, { titulo: 'GPS' });
    }
    setBusyGeo(false);
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
      // Resolver barrio final (si es "Otro", usar el texto libre)
      const barrioFinal = d.barrio === '__otro__' ? (barrioOtro || '') : d.barrio;
      const dFinal = { ...d, barrio: barrioFinal };

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
      const vals = _construirPayload(dFinal, 'INICIADO', linkDrive, datosIniciales);

      // 3. POST único
      const r = await guardarVisita({ valores: vals, fila: filaEditando });
      if (r && r.fila) setFE(r.fila);

      // 4. Actualizar state local con metadatos derivados
      setEstV('INICIADO');
      setD(prev => ({
        ...prev,
        barrio: barrioFinal,
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
    const barrioFinal = d.barrio === '__otro__' ? (barrioOtro || '') : d.barrio;
    const relacionFinal = d.atiendeRelacion === 'Otro'
      ? (d.atiendeRelacionOtro || 'Otro')
      : (d.atiendeRelacion || '');
    const dirNotifFinal = d.dirNotifIgual ? (d.direccion || '') : (d.atiendeDir || '');
    return {
      radicado:       d.esOficio ? ('OFICIO-' + d.orden) : d.radicado,
      fechaRadicado:  _isoAFecha(d.fechaRadicado),
      fechaVisita:    _isoAFecha(d.fechaVisita),
      objetoVisita:   d.esOficio ? 'Inspección de oficio' : 'Atención de PQR',
      direccion:      d.direccion,
      barrio:         barrioFinal,
      comuna:         d.comuna,
      // Persona
      atiendeNombre:  d.atiendeNombre,
      atiendeId:      d.atiendeId,
      atiendeTel:     d.atiendeTel,
      atiendeRelacion: relacionFinal,
      atiendeDir:     dirNotifFinal,
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
      area:           d.areaNoMedible ? '' : d.area,
      obsConclusion:  d.obsConclusion || '',
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
  const nVisitaLabel = d.nVisita && d.nVisita > 1 ? ' · Visita N°' + d.nVisita : '';
  const tituloPantalla = filaEditando
    ? 'Continuar visita'
    : (d.esOficio ? 'Visita de oficio' : 'Nueva visita');

  return (
    <div className="pantalla activa pad-bottom">
      {/* Barra sticky de título + botones (z-index 101, encima de la barra de dirección) */}
      <div className="nv-title-sticky-bar">
        <div className="page-title-row" style={{ marginBottom: 0, marginTop: 0 }}>
          <div className="page-title" style={{ marginBottom: 0, marginTop: 0 }}>{tituloPantalla}</div>
          {onSalir && (
            <button onClick={onSalir} style={{
              background: 'var(--gris-bg)', border: '1px solid var(--borde)', borderRadius: 8,
              padding: '6px 14px', fontFamily: 'inherit', fontSize: 12, cursor: 'pointer',
            }}>&#8592; Volver</button>
          )}
        </div>
      </div>

      {/* Panel sticky con dirección, radicado y N° visita (z-index 100) */}
      {(d.direccion || d.radicado || d.esOficio) && (
        <div className="nv-address-sticky-bar visible">
          {d.direccion && (
            <>
              <span className="dir-label">Visita en</span>
              <span className="dir-valor">{d.direccion}{d.barrio && d.barrio !== '__otro__' ? ' · ' + d.barrio : ''}</span>
            </>
          )}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: d.direccion ? 2 : 0 }}>
            {d.radicado && <span className="dir-radicado" style={{ margin: 0 }}>RAD {d.radicado}</span>}
            {d.esOficio && d.orden && <span className="dir-radicado" style={{ margin: 0 }}>OFICIO {d.orden}</span>}
            {d.nVisita > 1 && (
              <span style={{
                fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
                background: 'var(--brand-bg)', color: 'var(--brand-ink)',
                border: '1px solid var(--brand-accent)',
              }}>Visita N°{d.nVisita}</span>
            )}
          </div>
        </div>
      )}

      {/* 1. IDENTIFICACIÓN ───────────────────────────────── */}
      <_Seccion titulo="Identificación del caso" color="azul">
        {/* Indicador tipo de visita (solo lectura — se eligió en el modal) */}
        <_Campo label="Tipo de visita">
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '8px 14px', borderRadius: 'var(--r-md)',
            background: d.esOficio ? '#fef3c7' : 'var(--brand-bg)',
            border: '1px solid ' + (d.esOficio ? '#f59e0b' : 'var(--brand-accent)'),
            fontSize: 14, fontWeight: 600,
            color: d.esOficio ? '#92400e' : 'var(--brand-ink)',
          }}>
            <span>{d.esOficio ? '🏗️' : '📋'}</span>
            {d.esOficio ? 'Visita de oficio' : 'PQR / Radicado'}
            {d.nVisita > 1 && <span style={{ marginLeft: 4, opacity: 0.7 }}>· Visita N°{d.nVisita}</span>}
          </div>
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
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{
                fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 600,
                color: 'var(--texto-suave)', whiteSpace: 'nowrap',
                padding: '10px 8px', background: 'var(--slate-100)', borderRadius: '8px 0 0 8px',
                border: '1px solid var(--borde-med)', borderRight: 'none',
              }}>{_ordenPrefijo()}</span>
              <input
                type="number"
                min="1" max="999"
                className="input-campo mono"
                style={{ borderRadius: '0 8px 8px 0', flex: 1 }}
                value={ordenConsecutivo}
                onChange={e => setOrdenConsecutivo(e.target.value)}
                placeholder="001"
              />
            </div>
          </_Campo>
        )}
        <_Campo label="Fecha de visita">
          <_Input type="date" value={d.fechaVisita} onChange={v => setCampo('fechaVisita', v)} />
        </_Campo>
      </_Seccion>

      {/* 2. UBICACIÓN ─────────────────────────────────────── */}
      <_Seccion titulo="Ubicación del inmueble" color="azul">
        <_Campo label="Dirección del inmueble" fullWidth>
          <_Input value={d.direccion} onChange={v => setCampo('direccion', v)}
            placeholder="Cl 50 # 32-10" />
        </_Campo>
        <_Campo label="Barrio / Vereda">
          <_SelectBarrio
            barrio={d.barrio}
            barrioOtro={barrioOtro}
            comuna={d.comuna}
            onChangeBarrio={v => setCampo('barrio', v)}
            onChangeBarrioOtro={setBarrioOtro}
            onChangeComuna={v => setCampo('comuna', v)}
          />
        </_Campo>
        <_Campo label="Comuna">
          <_Input value={d.comuna} onChange={v => setCampo('comuna', v)}
            placeholder="4" />
        </_Campo>

        <div className="gps-box" style={{ gridColumn: '1 / -1' }}>
          <div style={{ flex: 1 }}>
            <div className="gps-coords">
              {d.lat != null && d.lon != null
                ? `${Number(d.lat).toFixed(6)}, ${Number(d.lon).toFixed(6)}`
                : 'Sin coordenadas'}
            </div>
            <div className="gps-dir">{d.direccion || '—'}</div>
          </div>
          <div style={{ display: 'flex', gap: 6, flexDirection: 'column' }}>
            <_BtnAccion busy={busyGeo} onClick={ejecutarGeocode}>
              {busyGeo ? '...' : 'Buscar coordenadas'}
            </_BtnAccion>
            <_BtnAccion busy={busyGeo} onClick={usarMiUbicacion}>
              {busyGeo ? '...' : 'Mi ubicación'}
            </_BtnAccion>
          </div>
        </div>
        {d.lat != null && d.lon != null && (
          <div style={{ gridColumn: '1 / -1' }}>
            <_MapaGPS lat={d.lat} lon={d.lon} onMove={(lat, lon) => {
              setCampo('lat', lat); setCampo('lon', lon);
            }} />
          </div>
        )}
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
        <_Campo label="Correo electrónico">
          <_Input type="email" value={d.atiendeEmail}
            onChange={v => setCampo('atiendeEmail', v)} />
        </_Campo>
        <_Campo label="Relación con el evento" fullWidth>
          <_Radio value={d.atiendeRelacion} onChange={v => setCampo('atiendeRelacion', v)}
            opciones={['Propietario', 'Arrendatario', 'Constructor', 'Otro']} />
          {d.atiendeRelacion === 'Otro' && (
            <input
              type="text"
              className="input-campo"
              style={{ marginTop: 8 }}
              placeholder="Especifique la relación"
              value={d.atiendeRelacionOtro || ''}
              onChange={e => setCampo('atiendeRelacionOtro', e.target.value)}
            />
          )}
        </_Campo>
        <_Campo label="Dirección de notificación" fullWidth>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, fontSize: 13, color: 'var(--texto-suave)', cursor: 'pointer' }}>
            <input type="checkbox"
              checked={d.dirNotifIgual}
              onChange={e => setCampo('dirNotifIgual', e.target.checked)}
              style={{ accentColor: 'var(--brand-accent)' }}
            />
            Misma dirección del inmueble
          </label>
          <_Input
            value={d.dirNotifIgual ? d.direccion : d.atiendeDir}
            onChange={v => setCampo('atiendeDir', v)}
            disabled={d.dirNotifIgual}
            placeholder={d.dirNotifIgual ? '' : 'Dirección de notificación'}
          />
        </_Campo>
      </_Seccion>

      {/* 4. CARACTERÍSTICAS ──────────────────────────────── */}
      <_Seccion titulo="Características de la edificación" color="cafe">
        <_Campo label="Estado de la obra" fullWidth>
          <_Radio value={d.estadoObra} onChange={v => setCampo('estadoObra', v)}
            opciones={['En proceso / iniciada', 'Terminada']} />
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
        <_Campo label="Usos actuales" fullWidth>
          <_ChipsMulti
            opciones={USOS_OPCIONES}
            value={d.usos}
            onChange={v => setCampo('usos', v)}
            separador=" · "
            otroLabel="¿Qué funciona?"
          />
        </_Campo>
        <_Campo label="Tipo de cubierta actual" fullWidth>
          <_ChipsMulti
            opciones={CUBIERTA_ACTUAL_OPCIONES}
            value={d.cubiertaActual}
            onChange={v => setCampo('cubiertaActual', v)}
            separador=", "
            otroLabel="Especifique tipo de cubierta"
          />
        </_Campo>
      </_Seccion>

      {/* 5. VERIFICACIÓN DOCUMENTAL ──────────────────────── */}
      <_Seccion titulo="Verificación documental" color="cafe">
        <_Campo label="¿Se aportó licencia?" fullWidth>
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
            <_Campo label="Tipo y modalidad" fullWidth>
              <select className="input-campo" value={d.tipoLicencia}
                onChange={e => setCampo('tipoLicencia', e.target.value)}>
                <option value="">Seleccionar tipo...</option>
                {TIPO_MODALIDAD_OPCIONES.map(o => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
            </_Campo>
            <_Campo label="Pisos aprobados">
              <_Input mono value={d.pisos} onChange={v => setCampo('pisos', v)} />
            </_Campo>
            <_Campo label="Destinaciones aprobadas">
              <_Input value={d.destinaciones} onChange={v => setCampo('destinaciones', v)} />
            </_Campo>
            <_Campo label="Cubierta aprobada">
              <select className="input-campo" value={d.cubierta}
                onChange={e => setCampo('cubierta', e.target.value)}>
                <option value="">Seleccionar cubierta...</option>
                {CUBIERTA_LICENCIA_OPCIONES.map(o => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
            </_Campo>
            <_Campo label="Sistema estructural">
              <select className="input-campo" value={d.sistema}
                onChange={e => setCampo('sistema', e.target.value)}>
                <option value="">Seleccionar sistema...</option>
                {SISTEMA_ESTRUCTURAL_OPCIONES.map(o => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
            </_Campo>
            <_Campo label="Observaciones de la licencia" fullWidth>
              <_TextArea value={d.obsLicencia} onChange={v => setCampo('obsLicencia', v)} rows={3} />
            </_Campo>
          </>
        )}
      </_Seccion>

      {/* 6. DESCRIPCIÓN ──────────────────────────────────── */}
      <_Seccion titulo="Descripción de la situación encontrada" color="gris">
        <_Campo label="Actuación / Observaciones" fullWidth
          hint="Texto descriptivo de lo encontrado en sitio. Usa el botón IA para pulir la redacción.">
          <_TextArea value={d.actuacion} onChange={v => setCampo('actuacion', v)} rows={8} />
        </_Campo>
        <div style={{ display: 'flex', gap: 8, marginTop: 4, gridColumn: '1 / -1', flexWrap: 'wrap' }}>
          <_BtnAccion busy={busyMejora} onClick={ejecutarMejora}>
            {busyMejora ? '⏳ Mejorando...' : '✨ Mejorar con IA'}
          </_BtnAccion>
          <_BtnAccion onClick={toggleDictado} busy={false}>
            <span style={dictando ? { color: '#ef4444', animation: 'none' } : {}}>{dictando ? '⏹' : '🎙️'}</span>
            {dictando ? 'Detener dictado' : 'Dictar'}
          </_BtnAccion>
          {dictando && (
            <span style={{
              fontSize: 12, color: '#ef4444', fontWeight: 600,
              display: 'inline-flex', alignItems: 'center', gap: 4,
            }}>
              <span style={{
                width: 8, height: 8, borderRadius: '50%', background: '#ef4444',
                display: 'inline-block', animation: 'pulsar 1s infinite',
              }} />
              Grabando...
            </span>
          )}
        </div>

        {/* Panel comparador: sugerencia IA vs original */}
        {sugerenciaIA && (
          <div style={{
            gridColumn: '1 / -1', marginTop: 12, padding: 16,
            background: 'var(--brand-bg)', border: '1.5px solid var(--brand-accent)',
            borderRadius: 'var(--r-lg)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <span style={{ fontSize: 18 }}>✨</span>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--brand-ink)' }}>Versión mejorada (sugerencia IA)</div>
                <div style={{ fontSize: 11, color: 'var(--texto-suave)' }}>
                  Puede editarla antes de aplicarla. El texto original se conserva arriba.
                </div>
              </div>
            </div>
            <textarea
              className="input-campo"
              rows={8}
              value={sugerenciaIA}
              onChange={e => setSugerenciaIA(e.target.value)}
              style={{ marginBottom: 10, background: '#fff' }}
            />
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <button type="button" onClick={aceptarSugerenciaIA} className="btn-principal verde"
                style={{ margin: 0, fontSize: 13, padding: '8px 18px' }}>
                Usar esta versión
              </button>
              <button type="button" onClick={descartarSugerenciaIA} style={{
                background: 'var(--gris-bg)', border: '1px solid var(--borde)', borderRadius: 8,
                padding: '8px 16px', fontFamily: 'inherit', fontSize: 13, cursor: 'pointer',
              }}>Descartar</button>
              <span style={{ fontSize: 11, color: 'var(--texto-suave)', marginLeft: 'auto' }}>
                Al usarla, reemplaza el texto original.
              </span>
            </div>
          </div>
        )}
      </_Seccion>

      {/* 7B. CONCLUSIONES ────────────────────────────────── */}
      <_Seccion titulo="Conclusiones" color="cafe">
        <_Campo label="Tipo de contravención (Art. 135 Ley 1801/2016)" fullWidth>
          <_ChipsContravencion
            value={d.infraccion}
            onChange={v => setCampo('infraccion', v)}
          />
        </_Campo>
        <_Campo label="Área de contravención (m²)">
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, fontSize: 13, color: 'var(--texto-suave)', cursor: 'pointer' }}>
            <input type="checkbox"
              checked={d.areaNoMedible}
              onChange={e => {
                setCampo('areaNoMedible', e.target.checked);
                if (e.target.checked) setCampo('area', '');
              }}
              style={{ accentColor: 'var(--brand-accent)' }}
            />
            No se pudo medir
          </label>
          <_Input mono value={d.area}
            onChange={v => setCampo('area', v)}
            disabled={d.areaNoMedible}
            placeholder={d.areaNoMedible ? 'N/A' : 'm²'}
          />
        </_Campo>

        {/* Suspensión: oculta si obra terminada */}
        {d.estadoObra !== 'Terminada' && (
          <>
            <_Campo label="¿Se decreta suspensión de obra?" fullWidth>
              <_Radio value={d.suspension} onChange={v => setCampo('suspension', v)}
                opciones={['SI', 'NO']} />
            </_Campo>
            {d.suspension === 'SI' && (
              <_Campo label="N° Orden de policía">
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{
                    fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 600,
                    color: 'var(--texto-suave)', whiteSpace: 'nowrap',
                    padding: '10px 8px', background: 'var(--slate-100)', borderRadius: '8px 0 0 8px',
                    border: '1px solid var(--borde-med)', borderRight: 'none',
                  }}>{_ordenPrefijo()}</span>
                  <input
                    type="number"
                    min="1" max="999"
                    className="input-campo mono"
                    style={{ borderRadius: '0 8px 8px 0', flex: 1 }}
                    value={ordenConsecutivo}
                    onChange={e => setOrdenConsecutivo(e.target.value)}
                    placeholder="001"
                  />
                </div>
              </_Campo>
            )}
          </>
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
        <_Campo label="Visitador(es)" fullWidth>
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

      {/* 9. OBSERVACIONES Y CONCLUSIONES ──────────────────── */}
      <_Seccion titulo="Observaciones y conclusiones" color="gris">
        <_Campo label="Conclusiones generales del inspector" fullWidth
          hint="Dictamen técnico, observaciones sobre la situación encontrada y su relación con la normativa aplicable.">
          <_TextArea value={d.obsConclusion} onChange={v => setCampo('obsConclusion', v)} rows={6}
            placeholder="Describa las conclusiones de la visita, hallazgos relevantes y recomendaciones..." />
        </_Campo>
      </_Seccion>

      {/* 10. CONSULTA NORMA POT ──────────────────────────── */}
      <_Seccion titulo="Consulta norma POT" color="gris">
        <_Campo label="Código catastral">
          <_Input mono value={d.catastral} onChange={v => setCampo('catastral', v)} />
        </_Campo>
        <_Campo label="N° ficha predial">
          <_Input mono value={d.ficha} onChange={v => setCampo('ficha', v)} />
        </_Campo>
        <div style={{ gridColumn: '1 / -1' }}>
          <_BtnAccion busy={busyCat} onClick={() => ejecutarBusquedaCatastral()}>
            {busyCat ? 'Buscando...' : 'Buscar catastral por ubicación'}
          </_BtnAccion>
        </div>

        {catResultados && catResultados.length > 0 && (
          <div style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ fontSize: 11, color: 'var(--texto-suave)', marginBottom: 2 }}>
              {catResultados.length} predios encontrados — selecciona uno:
            </div>
            {catResultados.map((r, i) => (
              <button key={i} type="button" onClick={() => seleccionarCatastral(r)}
                style={{
                  textAlign: 'left', padding: '10px 12px', borderRadius: 8,
                  border: '1px solid var(--borde)', background: 'var(--superficie)',
                  cursor: 'pointer', fontFamily: 'inherit', fontSize: 12,
                  transition: 'background 0.15s',
                }}>
                <div style={{ fontWeight: 600, fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                  Ficha {r.ficha}
                  <span style={{ fontWeight: 400, color: 'var(--texto-suave)', marginLeft: 8 }}>
                    {r.distancia}m
                  </span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--texto-suave)', marginTop: 2 }}>
                  {r.direccion || 'Sin dirección'}
                </div>
                <div style={{ fontSize: 10, color: 'var(--texto-suave)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
                  {r.catastral}
                </div>
              </button>
            ))}
          </div>
        )}

        <_Campo label="Polígono de uso del suelo">
          <_Input mono value={d.poligono} onChange={v => setCampo('poligono', v)}
            placeholder="ZR-CN-1" />
        </_Campo>
        <_Campo label="¿Amenaza?">
          <_Radio value={d.amenaza} onChange={v => setCampo('amenaza', v)}
            opciones={['SI', 'NO']} />
        </_Campo>
        <_Campo label="¿Suelo de protección?">
          <_Radio value={d.sueloProt} onChange={v => setCampo('sueloProt', v)}
            opciones={['SI', 'NO']} />
        </_Campo>
        <_Campo label="¿Cumple retiro de quebrada?">
          <_Radio value={d.quebrada} onChange={v => setCampo('quebrada', v)}
            opciones={['SI', 'NO']} />
        </_Campo>
        <div style={{ gridColumn: '1 / -1' }}>
          <_BtnAccion busy={busyPOT} onClick={() => ejecutarPOT()}>
            {busyPOT ? '...' : 'Consultar POT por coordenadas'}
          </_BtnAccion>
        </div>
      </_Seccion>

      {/* ── Botón guardar ──────────────────────────────────── */}
      <button onClick={guardar} disabled={guardando} className="btn-principal verde"
        style={{ marginTop: 18, fontSize: 16 }}>
        {guardando ? 'Guardando...' : (filaEditando ? 'Actualizar visita' : 'Guardar visita')}
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
            {generandoActa ? 'Generando acta...' : 'Generar acta F-GGO-46'}
          </button>
          <div style={{ fontSize: 11, color: 'var(--texto-suave)', textAlign: 'center', marginTop: -4 }}>
            Hoja de caracterización en Drive.
          </div>

          <button onClick={generarRegistroFotografico} disabled={generandoRF}
            className="btn-principal" style={{ fontSize: 15, marginTop: 6 }}>
            {generandoRF ? 'Generando registro fotográfico...' : 'Generar registro fotográfico'}
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
            }}>Abrir carpeta Drive de la visita</a>
          </div>
        )}

        {!pendiente && (
          <label style={{
            display: 'block', padding: 14, border: '1.5px dashed var(--borde-med)',
            borderRadius: 10, textAlign: 'center', cursor: 'pointer',
            background: 'var(--gris-bg)', fontSize: 13, color: 'var(--texto-suave)',
          }}>
            Toca para seleccionar una foto
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
                {busyDesc ? '...' : 'Describir con IA'}
              </_BtnAccion>
              <button onClick={subirAhora} disabled={subiendo} className="btn-principal verde"
                style={{ flex: 1, margin: 0, padding: '8px 12px', fontSize: 13 }}>
                {subiendo ? 'Subiendo...' : 'Subir foto'}
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
                <div style={{ fontWeight: 600 }}>{f.nombre}</div>
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
