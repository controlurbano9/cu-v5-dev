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
function _fechaAIso(valor) {
  if (!valor) return '';
  // Date object → ISO local
  if (valor instanceof Date && !isNaN(valor)) {
    const yyyy = valor.getFullYear();
    const mm = String(valor.getMonth() + 1).padStart(2, '0');
    const dd = String(valor.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }
  const s = String(valor);
  // DD/MM/YYYY → YYYY-MM-DD
  let m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(s);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  // ISO timestamp o YYYY-MM-DD → YYYY-MM-DD
  m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return '';
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
// VISITADORES_FALLBACK se usa si el endpoint público listarInspectoresActivos()
// falla (por red caída o primera carga sin cache). La lista real se carga
// dinámicamente al montar el formulario — alta/baja de inspectores ya no
// requiere editar este archivo.
const VISITADORES_FALLBACK = [
  { val: 'ALEJANDRO HERNANDEZ MUÑOZ',   l: 'Alejandro Hernández' },
  { val: 'MAURICIO HERRERA LOPERA',     l: 'Mauricio Herrera'    },
  { val: 'DIEGO ALEJANDRO MUNERA OSSA', l: 'Diego Munera'        },
  { val: 'DANIEL PEDRAZA ARANGO',       l: 'Daniel Pedraza'      },
  { val: 'VICTOR HUGO QUIROZ PORTILLA', l: 'Víctor Hugo Quiroz'  },
  { val: 'CARLOS ANDRES MEJIA',         l: 'Carlos Mejía'        },
  { val: 'JUAN SEBASTIAN PINZON GAONA', l: 'Juan Sebastián Pinzón' },
];

// Helper para generar label legible del nombre completo en mayúsculas.
// "ALEJANDRO HERNANDEZ MUÑOZ" → "Alejandro Hernández" (2 primeros tokens, title-case).
function _labelInspector(nombre) {
  return String(nombre || '').trim().split(/\s+/).slice(0, 2)
    .map(t => t ? t.charAt(0).toUpperCase() + t.slice(1).toLowerCase() : '')
    .join(' ');
}

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
// Variante sin tildes para tolerar barrios provenientes del GeoJSON con/sin acentos
const _BARRIO_A_COMUNA_NORM = {};
function _quitarTildes(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, ''); }
Object.keys(_BARRIO_A_COMUNA).forEach(k => {
  _BARRIO_A_COMUNA_NORM[_quitarTildes(k).toUpperCase()] = _BARRIO_A_COMUNA[k];
});
window._BARRIO_A_COMUNA = _BARRIO_A_COMUNA;
window._BARRIO_A_COMUNA_NORM = _BARRIO_A_COMUNA_NORM;
window._lookupComunaPorBarrio = function(barrio) {
  if (!barrio) return '';
  var k = _quitarTildes(barrio).toUpperCase().trim();
  return _BARRIO_A_COMUNA_NORM[k] || '';
};

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
    denunciante:    d['DENUNCIANTE/REMITENTE'] || d['DENUNCIANTE'] || '',
    nVisita:        d['N° VISITA']           || d['N VISITA']           || 1,
    esOficio:       !!d['_oficio'],
    // Ubicación
    direccion:      d['DIRECCION INFRACCION'] || d['DIRECCION']         || '',
    barrio:         d['BARRIO/VEREDA']        || d['BARRIO']            || '',
    comuna:         d['COMUNA']               || '',
    lat:            d['LATITUD']              || null,
    lon:            d['LONGITUD']             || null,
    // Persona
    noAtiende:      (d['NOMBRE PERSONA ATIENDE'] || '').includes('No se atiende'),
    atiendeNombre:  d['NOMBRE PERSONA ATIENDE']  || '',
    atiendeId:      d['ID PERSONA ATIENDE']       || '',
    atiendeTel:     d['TELEFONO PERSONA ATIENDE']  || '',
    telNoAporta:    (d['TELEFONO PERSONA ATIENDE'] || '').includes('No aporta') || (d['TELEFONO PERSONA ATIENDE'] || '').includes('No se atiende'),
    atiendeRelacion: d['RELACION CON EL EVENTO']  || '',
    atiendeRelacionOtro: '',
    atiendeDir:     d['DIR NOTIFICACION']         || '',
    dirNoAporta:    (d['DIR NOTIFICACION'] || '').includes('No aporta') || (d['DIR NOTIFICACION'] || '').includes('No se atiende'),
    atiendeEmail:   d['CORREO ELECTRONICO']       || '',
    emailNoAporta:  (d['CORREO ELECTRONICO'] || '').includes('No aporta') || (d['CORREO ELECTRONICO'] || '').includes('No se atiende'),
    dirNotifIgual:  true,
    // Características
    estadoObra:     d['ESTADO OBRA']          || '',
    repLocativa:    d['REPARACION LOCATIVA']  || '',
    habitado:       d['HABITADO']             || '',
    alturaPisos:    d['ALTURA EN PISOS']      || '',
    destActuales:   d['N° DESTINACIONES ACTUALES'] || d['N DESTINACIONES ACTUALES'] || '',
    usos:           d['USOS ACTUALES']        || '',
    queFunciona:    (function() {
                      var raw = (d['USOS ACTUALES'] || '').toString();
                      if (!raw) return '';
                      var partes = raw.split(/\s*[·,]\s*/).filter(Boolean);
                      var conocidos = ['Residencial','Comercial','Industrial','Servicios','Institucional','Otro'];
                      var extras = partes.filter(function(p) { return !conocidos.includes(p.trim()); });
                      return extras.join(', ');
                    })(),
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
    area:            (function(){
                       var v = (d['AREA CONTRAVENCION m2'] || d['AREA CONTRAVENCION M2'] || '').toString().trim();
                       return v === 'No se pudo medir' ? '' : v;
                     })(),
    areaNoMedible:   ((d['AREA CONTRAVENCION m2'] || d['AREA CONTRAVENCION M2'] || '').toString().trim() === 'No se pudo medir'),
    quebrada:        d['CUMPLE RETIRO QUEBRADA'] || '',
    suspension:      d['SUSPENSION DE LA OBRA'] || '',
    orden:           d['N° ORDEN DE POLICIA'] || d['N ORDEN DE POLICIA'] || '',
    citacionFecha:   _fechaAIso((d['FECHA CITACION'] || '').split(' · ')[0]),
    citacionHora:    (function() {
                       var raw = (d['FECHA CITACION'] || '').toString().trim();
                       if (!raw || raw === 'No se deja citación') return '';
                       var partes = raw.split(' · ');
                       if (partes.length < 2) return '';
                       var horaTexto = partes[1].trim().toUpperCase();
                       var match = HORAS_CITACION.find(function(h) {
                         return h.l.toUpperCase() === horaTexto;
                       });
                       return match ? match.val : '';
                     })(),
    noCitacion:      (d['FECHA CITACION'] || '').toString().trim() === 'No se deja citación',
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
    linkXlsxActa:    d['LINK_XLSX_ACTA']      || '',
    linkPdfActa:     d['LINK_PDF_ACTA']       || '',
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
  // Prioridad: state d.denunciante (que se inicializa desde datosIniciales y se conserva
  // a través del modal) → filaPendiente prop como fallback.
  const fpDenunc   = d.denunciante || filaPendiente?.['DENUNCIANTE/REMITENTE'] || filaPendiente?.[6] || '';
  const fpFechaAsig= filaPendiente?.['FECHA ASIGNACION VISITA'] || filaPendiente?.[14] || '';
  const fpFechaDev = filaPendiente?.['FECHA DEVOLUCION'] || filaPendiente?.[20] || '';

  const denunc = d.esOficio
    ? 'Inspección de Control Urbano'
    : _capPalabras(fpDenunc);

  const horaFmt = HORAS_CITACION.find(h => h.val === d.citacionHora)?.l || d.citacionHora;
  const citFmt  = d.noCitacion
    ? 'No se deja citación'
    : (d.citacionFecha
        ? (_isoAFecha(d.citacionFecha) + (horaFmt ? ' · ' + horaFmt : ''))
        : '');

  // Relación: si es "Otro", enviar el texto del campo libre
  const relacionFinal = d.atiendeRelacion === 'Otro'
    ? (d.atiendeRelacionOtro || 'Otro')
    : (d.atiendeRelacion || '');

  // Dirección de notificación: si es igual al inmueble, usar d.direccion
  const dirNotifFinal = d.dirNotifIgual ? (d.direccion || '') : (d.atiendeDir || '');

  // Para oficio: la fecha radicado = fecha visita (no hay radicado externo previo,
  // el "radicado" se genera al hacer la visita). Para PQR: lo que ingresó el inspector
  // o lo que ya estaba en la fila pendiente del PQR original.
  const fechaRadicadoFinal = d.esOficio
    ? _isoAFecha(d.fechaVisita)
    : (_isoAFecha(d.fechaRadicado) || fpRadicado);

  return [
    radicado,                                     // B  RADICADO
    fechaRadicadoFinal,                           // C  FECHA RADICADO
    d.direccion || '',                            // D  DIRECCION INFRACCION
    d.barrio || '',                               // E  BARRIO/VEREDA
    d.comuna || '',                               // F  COMUNA
    denunc,                                       // G  DENUNCIANTE/REMITENTE
    d.noAtiende ? 'No se atiende / No suministra datos' : _capPalabras(d.atiendeNombre),  // H
    d.noAtiende ? 'No se atiende / No suministra datos' : (d.atiendeId || ''),             // I
    d.noAtiende ? 'No se atiende / No suministra datos' : (d.telNoAporta ? 'No aporta' : (d.atiendeTel || '')), // J
    d.noAtiende ? '' : relacionFinal,             // K  RELACION CON EL EVENTO
    d.noAtiende ? 'No se atiende / No suministra datos' : (d.dirNoAporta ? 'No aporta' : dirNotifFinal), // L
    d.noAtiende ? 'No se atiende / No suministra datos' : (d.emailNoAporta ? 'No aporta' : _soloMin(d.atiendeEmail)), // M
    estado,                                       // N  ESTADO VISITA
    fpFechaAsig || _isoAFecha(d.fechaVisita) || _hoyDDMMYYYY_nv(), // O  FECHA ASIGNACION VISITA (si no existe, = fecha de visita)
    _isoAFecha(d.fechaVisita),                    // P  FECHA DE VISITA
    d.nVisita || 1,                               // Q  N° VISITA
    d.visitador || '',                            // R  VISITADOR(ES)
    '',                                           // S  FECHA 2DA VISITA
    '',                                           // T  VISITADOR2
    fpFechaDev || '',                             // U  FECHA DEVOLUCION
    '',                                           // V  DIAS
    d.estadoObra || '',                           // W  ESTADO OBRA
    d.infraccion || '',                           // X  TIPO DE INFRACCION
    d.areaNoMedible ? 'No se pudo medir' : (d.area || ''),  // Y  AREA CONTRAVENCION m2
    d.quebrada || '',                             // Z  CUMPLE RETIRO QUEBRADA
    d.repLocativa || '',                          // AA REPARACION LOCATIVA
    d.habitado || '',                             // AB HABITADO
    d.alturaPisos || '',                          // AC ALTURA EN PISOS
    d.destActuales || '',                         // AD N° DESTINACIONES ACTUALES
    (d.usos || '') + (d.queFunciona ? ' · ' + d.queFunciona : ''), // AE USOS ACTUALES (+ que funciona)
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

function _CheckNoAporta({ checked, onChange }) {
  return (
    <span style={{ float: 'right', fontWeight: 400 }}>
      <label style={{ fontSize: 11, color: 'var(--texto-suave)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)}
          style={{ cursor: 'pointer', accentColor: 'var(--texto-suave)' }} />
        No aporta
      </label>
    </span>
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
  // Parsear SIN trim para preservar espacios durante la escritura del campo "Otro"
  const partes = useMemoNV(() => {
    if (!value) return [];
    return value.split(sep).filter(Boolean);
  }, [value, sep]);

  const opcionesNormales = opciones.filter(o => o !== 'Otro');
  const isActive = (opt) => partes.some(s => s.trim() === opt);
  const valoresOtro = partes.filter(s => !opcionesNormales.includes(s.trim()) && s.trim() !== 'Otro');
  const otroActivo = partes.some(s => s.trim() === 'Otro') || valoresOtro.length > 0;
  const textoOtro = valoresOtro.join(sep);

  function toggle(opt) {
    let next;
    if (opt === 'Otro') {
      if (otroActivo) {
        next = partes.filter(s => opcionesNormales.includes(s.trim()));
      } else {
        next = [...partes.filter(s => opcionesNormales.includes(s.trim())), 'Otro'];
      }
    } else {
      if (isActive(opt)) {
        next = partes.filter(s => s.trim() !== opt);
      } else {
        next = [...partes, opt];
      }
    }
    onChange(next.join(sep));
  }

  function setTextoOtro(texto) {
    const base = partes.filter(s => opcionesNormales.includes(s.trim()));
    if (texto) {
      base.push(texto);
    }
    onChange(base.join(sep));
  }

  return (
    <div>
      <div className="chips">
        {opciones.map(opt => (
          <div key={opt}
            className={'chip' + ((opt === 'Otro' ? otroActivo : isActive(opt)) ? ' activo' : '')}
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

// Mapa Google Maps con pin arrastrable para corregir coordenadas.
// Sin coordenadas muestra vista general de Bello; con coords, zoom 18 + pin.
function _MapaGPS({ lat, lon, onMove }) {
  const mapRef = React.useRef(null);
  const gMapRef = React.useRef(null);
  const markerRef = React.useRef(null);
  const tieneCoords = lat != null && lon != null;

  useEffectNV(() => {
    if (!mapRef.current || typeof google === 'undefined' || !google.maps) return;
    const pos = tieneCoords
      ? { lat: Number(lat), lng: Number(lon) }
      : { lat: 6.338, lng: -75.556 };
    const zoom = tieneCoords ? 18 : 14;

    if (!gMapRef.current) {
      gMapRef.current = new google.maps.Map(mapRef.current, {
        center: pos, zoom, mapTypeId: 'satellite',
        disableDefaultUI: true, zoomControl: true,
        gestureHandling: 'greedy',
      });
    } else {
      gMapRef.current.setCenter(pos);
      gMapRef.current.setZoom(zoom);
    }

    if (tieneCoords) {
      if (!markerRef.current) {
        markerRef.current = new google.maps.Marker({
          position: pos, map: gMapRef.current, draggable: true,
          title: 'Arrastra para corregir ubicación',
        });
        markerRef.current.addListener('dragend', () => {
          const p = markerRef.current.getPosition();
          if (onMove) onMove(p.lat(), p.lng());
        });
      } else {
        markerRef.current.setPosition(pos);
        markerRef.current.setMap(gMapRef.current);
      }
    } else if (markerRef.current) {
      markerRef.current.setMap(null);
    }
  }, [lat, lon]);

  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--texto-suave)', marginBottom: 4 }}>
        {tieneCoords ? 'Arrastra el pin para corregir la ubicación' : 'Captura tu ubicación para colocar el pin'}
      </div>
      <div ref={mapRef} style={{
        width: '100%', height: 220, borderRadius: 10,
        border: '1px solid var(--borde)', overflow: 'hidden',
      }} />
    </div>
  );
}

// Tarjeta de ficha catastral con datos completos. Click → onSeleccionar.
// Reutilizable entre Nueva visita y Consulta de norma.
function _TarjetaFichaCatastral({ r, onSeleccionar, expandida }) {
  const [abierta, setAbierta] = useStateNV(!!expandida);
  const titular = r.propietario || '—';
  return (
    <div style={{
      borderRadius: 8, border: '1px solid ' + (r.municipal ? '#fca5a5' : 'var(--borde)'),
      background: r.municipal ? '#fef2f2' : 'var(--superficie)',
      overflow: 'hidden',
      flexShrink: 0,           // evita que se aplaste dentro de flex-column con scroll
      marginBottom: 4,
    }}>
      <div style={{ padding: '10px 12px', cursor: 'pointer' }} onClick={() => setAbierta(!abierta)}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 2 }}>
              {r.municipal && <span style={{ color: '#dc2626', marginRight: 4 }}>🏛</span>}
              Ficha <span style={{ fontFamily: 'var(--font-mono)' }}>{r.ficha}</span>
              <span style={{ fontWeight: 400, color: 'var(--texto-suave)', marginLeft: 8, fontSize: 11 }}>
                · {r.destinacion || 'Sin destinación'}
              </span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--texto-suave)' }}>
              {r.direccion || 'Sin dirección'}
            </div>
            <div style={{ fontSize: 11, marginTop: 2 }}>
              <span style={{ color: 'var(--texto-suave)' }}>{r.esRazonSocial ? 'Razón social: ' : 'Titular: '}</span>
              <span style={{ fontWeight: 500 }}>{titular}</span>
            </div>
          </div>
          <span style={{ fontSize: 10, color: 'var(--texto-suave)', whiteSpace: 'nowrap' }}>
            {abierta ? '▴' : '▾'}
          </span>
        </div>
      </div>
      {abierta && (
        <div style={{
          borderTop: '1px solid var(--borde)', padding: '10px 12px',
          background: 'var(--gris-bg)', fontSize: 11,
          display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 12px', alignItems: 'baseline',
        }}>
          <span style={{ color: 'var(--texto-suave)' }}>NPN:</span>
          <span style={{ fontFamily: 'var(--font-mono)' }}>{r.catastral}</span>
          <span style={{ color: 'var(--texto-suave)' }}>Matrícula:</span>
          <span style={{ fontFamily: 'var(--font-mono)' }}>{r.matricula || '—'}</span>
          <span style={{ color: 'var(--texto-suave)' }}>Avalúo:</span>
          <span style={{ fontWeight: 600 }}>{formatearCOP(r.avaluo)}</span>
          {onSeleccionar && (
            <>
              <span></span>
              <button type="button" onClick={(e) => { e.stopPropagation(); onSeleccionar(); }}
                className="btn-principal verde"
                style={{ margin: 0, marginTop: 6, padding: '6px 14px', fontSize: 12, justifySelf: 'start' }}>
                Usar esta ficha
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
window._TarjetaFichaCatastral = _TarjetaFichaCatastral;

// Lista filtrable de fichas catastrales. Reutilizada en Nueva visita y Norma.
// Si hay >10 fichas, muestra input para filtrar por ficha, dirección o titular.
function _ListaFichasCatastrales({ fichas, onSeleccionar, maxAlto }) {
  const [filtro, setFiltro] = useStateNV('');
  // Ordenar por prioridad descendente:
  //   1) fichas con matrícula inmobiliaria (más útiles para el inspector)
  //   2) predios municipales (Municipio de Bello)
  //   3) orden original (estable)
  const fichasOrdenadas = React.useMemo(() => {
    const lista = (fichas || []).map((r, i) => ({ r, i }));
    lista.sort((a, b) => {
      const ma = !!(a.r && String(a.r.matricula || '').trim());
      const mb = !!(b.r && String(b.r.matricula || '').trim());
      if (ma !== mb) return ma ? -1 : 1;
      const mua = !!(a.r && a.r.municipal);
      const mub = !!(b.r && b.r.municipal);
      if (mua !== mub) return mua ? -1 : 1;
      return a.i - b.i;
    });
    return lista.map(x => x.r);
  }, [fichas]);
  const mostrarFiltro = fichasOrdenadas.length > 10;
  const filtroNorm = filtro.trim().toLowerCase();
  const fichasFiltradas = filtroNorm
    ? fichasOrdenadas.filter(r =>
        String(r.ficha).includes(filtroNorm) ||
        (r.direccion || '').toLowerCase().includes(filtroNorm) ||
        (r.propietario || '').toLowerCase().includes(filtroNorm) ||
        (r.catastral || '').includes(filtroNorm))
    : fichasOrdenadas;
  return (
    <div>
      {mostrarFiltro && (
        <input
          type="text"
          value={filtro}
          onChange={e => setFiltro(e.target.value)}
          placeholder={`Filtrar ${fichas.length} fichas por ficha, dirección o titular...`}
          style={{
            width: '100%', padding: '8px 12px', borderRadius: 8,
            border: '1px solid var(--borde)', background: 'var(--superficie)',
            fontFamily: 'inherit', fontSize: 12, marginBottom: 8,
          }}
        />
      )}
      <div style={{ maxHeight: maxAlto || 420, overflowY: 'auto', paddingRight: 4 }}>
        {fichasFiltradas.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--texto-suave)', textAlign: 'center', padding: 20 }}>
            Sin coincidencias para "{filtro}".
          </div>
        ) : (
          fichasFiltradas.map((r, i) => (
            <_TarjetaFichaCatastral key={i} r={r}
              onSeleccionar={onSeleccionar ? () => onSeleccionar(r) : null} />
          ))
        )}
      </div>
      {mostrarFiltro && filtroNorm && (
        <div style={{ fontSize: 11, color: 'var(--texto-suave)', marginTop: 6, textAlign: 'center' }}>
          {fichasFiltradas.length} de {fichas.length} fichas
        </div>
      )}
    </div>
  );
}
window._ListaFichasCatastrales = _ListaFichasCatastrales;

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
  const [modalFotos,  setModalFotos] = useStateNV(null); // null o [{id, nombre, link, descripcion, mimeType}]
  const [cargandoFotos, setCargandoFotos] = useStateNV(false);
  const [dragIdx, setDragIdx]   = useStateNV(null); // indice de la foto siendo arrastrada
  const [dropTarget, setDropTarget] = useStateNV(null); // {idx, pos:'above'|'below'} — indicador de inserción
  const [busyGeo, setBusyGeo]   = useStateNV(false);
  const [gpsAccuracy, setGpsAccuracy] = useStateNV(null); // precisión en metros
  const geoWatchRef = React.useRef(null); // id del watchPosition activo
  const [busyMejora, setBusyMe] = useStateNV(false);
  const [sugerenciaIA, setSugerenciaIA] = useStateNV(''); // texto mejorado pendiente de aceptar
  const [dictando, setDictando] = useStateNV(false);    // grabación por voz activa
  const [busyPOT, setBusyPOT]   = useStateNV(false);
  const [busyCat, setBusyCat]   = useStateNV(false);
  const [catResultados, setCatRes] = useStateNV(null);
  // Estado para la advertencia de tipificación (predio público / suelo protección).
  // Cuando el inspector toca "Ignorar" no volvemos a mostrarla hasta que cambien
  // las señales (nuevo punto GPS, nueva consulta catastral, etc.).
  const [advertTipifIgnorada, setAdvertTipifIgnorada] = useStateNV(false);
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

  // Lista dinámica de visitadores (cargada desde USUARIOS vía endpoint).
  // Si falla la carga (sin red o primer arranque sin cache), usa el fallback.
  const [visitadoresDin, setVisitadoresDin] = useStateNV(VISITADORES_FALLBACK);
  useEffectNV(() => {
    if (fase !== 'formulario') return;
    if (typeof listarInspectoresActivos !== 'function') return;
    let cancelado = false;
    listarInspectoresActivos().then(lista => {
      if (cancelado || !lista || !lista.length) return;
      setVisitadoresDin(lista.map(u => ({
        val: u.nombre,            // mayúsculas, coincide con BD VISITAS col R
        l: _labelInspector(u.nombre),
      })));
    }).catch(() => { /* mantiene fallback */ });
    return () => { cancelado = true; };
  }, [fase]);

  // Prefijar visitador con el usuario logueado (si está en la lista)
  useEffectNV(() => {
    if (fase !== 'formulario') return; // no ejecutar en fase modal
    if (!d.visitador && usuario) {
      const m = visitadoresDin.find(v => v.val.includes(usuario.usuario.toUpperCase().split(' ')[0]));
      if (m) setCampo('visitador', m.val);
    }
  }, [fase, visitadoresDin]); // re-prefija si la lista cambia tras carga dinámica

  // Sincronizar orden completa cuando cambia el consecutivo
  useEffectNV(() => {
    if (ordenConsecutivo) {
      setCampo('orden', _formatearOrden(ordenConsecutivo));
    } else {
      setCampo('orden', '');
    }
  }, [ordenConsecutivo]);

  // Auto-recuperación de carpeta Drive faltante.
  // Si la visita se guardó offline, la cola la sincroniza sin LINK_DRIVE
  // (crearCarpetaVisita es GET y falla offline). Al reabrirla online,
  // creamos la carpeta automáticamente y persistimos el link.
  useEffectNV(() => {
    if (fase !== 'formulario') return;
    if (!filaEditando) return;             // solo para visitas ya en BD
    if (d.linkDrive) return;                // ya tiene carpeta
    if (!navigator.onLine) return;          // sin red: nada que hacer
    if (!d.comuna || !d.direccion || !d.fechaVisita) return;
    let cancelado = false;
    (async () => {
      try {
        const c = await crearCarpetaVisita(d.comuna, d.direccion, d.fechaVisita, d.nVisita || 1, {
          barrio:  d.barrio,
          persona: d.atiendeNombre || '',
          lat:     d.lat || '',
          lon:     d.lon || '',
        });
        if (cancelado) return;
        const linkDrive = c.linkCarpeta || '';
        if (!linkDrive) return;
        // Persistir en BD: re-armar payload con linkDrive y actualizar la fila.
        const vals = _construirPayload(d, estadoVisita, linkDrive, datosIniciales);
        try {
          await guardarVisita({ valores: vals, fila: filaEditando });
        } catch (e) { /* silencioso, se reintenta al próximo save */ }
        if (cancelado) return;
        setD(prev => ({
          ...prev,
          linkDrive: linkDrive,
          idCarpetaVisita: _idCarpetaDeLink(linkDrive),
          idCarpetaFotos: c.idFotos || '',
        }));
        console.log('[carpeta-auto] carpeta Drive creada al reabrir visita');
      } catch (e) {
        console.warn('[carpeta-auto] no se pudo crear carpeta:', e.message);
      }
    })();
    return () => { cancelado = true; };
  }, [fase, filaEditando, d.linkDrive, d.comuna, d.direccion, d.fechaVisita]);

  // Recuperar idCarpetaFotos al reabrir una visita ya guardada.
  // La BD solo persiste LINK_DRIVE (carpeta visita); la subcarpeta de Fotos
  // se descubre vía webhook. Sin esto, la sección Fotos queda oculta al
  // editar una visita INICIADA.
  useEffectNV(() => {
    if (fase !== 'formulario') return;
    if (!filaEditando) return;
    if (d.idCarpetaFotos) return;            // ya está cargada
    if (!d.idCarpetaVisita) return;          // necesita la carpeta padre
    let cancelado = false;
    obtenerIdFotos(d.idCarpetaVisita).then(idF => {
      if (cancelado) return;
      if (idF) setCampo('idCarpetaFotos', idF);
    });
    return () => { cancelado = true; };
  }, [fase, filaEditando, d.idCarpetaVisita, d.idCarpetaFotos]);

  // Cuando estadoObra cambia a "Terminada", forzar suspensión a N/A
  useEffectNV(() => {
    if (d.estadoObra === 'Terminada') {
      setCampo('suspension', 'N/A');
    }
  }, [d.estadoObra]);

  // ── Sugerencias de tipificación según POT + catastro ──
  // Predio público (catastro municipal)              → A3: Bienes uso público (Antejardín)
  // Suelo de protección o retiro de quebrada (POT)   → A1: Áreas protegidas
  // Ambas condiciones                                → A1 + A3 (suma)
  // El inspector debe aceptar para aplicarlas. Al aceptar reemplazamos
  // SOLO el grupo A (preservando chips C/D que el inspector haya marcado).
  // Si toca "Ignorar" no insistimos hasta que cambien las señales.
  useEffectNV(() => {
    // Reset al cambiar el contexto del predio (nuevo punto / nueva consulta).
    setAdvertTipifIgnorada(false);
  }, [d.sueloProt, d.quebrada, catResultados, d.catastral]);

  const _esPublico = !!(catResultados && catResultados.some(r => r.municipal));
  const _esProtegido = d.sueloProt === 'SI';
  const _enRetiroQ = d.quebrada === 'SI';
  const _sugerenciasA = (function() {
    const s = [];
    if (_esProtegido || _enRetiroQ) {
      const razon = (_esProtegido && _enRetiroQ)
        ? 'el predio está en suelo de protección y retiro de quebrada'
        : (_esProtegido
            ? 'el predio está en suelo de protección'
            : 'el predio está dentro del retiro de quebrada');
      s.push({ val: 'A1: Áreas protegidas', razon: razon });
    }
    if (_esPublico) {
      s.push({ val: 'A3: Bienes uso público (Antejardín)', razon: 'el predio es del Municipio de Bello' });
    }
    return s;
  })();

  // Chips A actuales en d.infraccion
  const _chipsActuales = (d.infraccion || '').split(' | ').map(s => s.trim()).filter(Boolean);
  const _chipsAActuales = _chipsActuales.filter(v => /^A\d/.test(v));
  const _vSugeridos = _sugerenciasA.map(s => s.val);
  // ¿Las sugerencias ya están aplicadas exactamente?
  const _sugerenciasYaAplicadas = _vSugeridos.length > 0
    && _vSugeridos.every(v => _chipsAActuales.includes(v))
    && _chipsAActuales.length === _vSugeridos.length;
  const _mostrarAdvertenciaTipif = _sugerenciasA.length > 0
    && !advertTipifIgnorada
    && !_sugerenciasYaAplicadas;

  function _aplicarSugerenciasTipif() {
    // Quitar chips de literal A; conservar el resto (C, D, "No se evidencia...")
    const noA = _chipsActuales.filter(v => !/^A\d/.test(v));
    // Quitar también "No se evidencia infracción" si estaba — ahora SÍ hay infracción.
    const noNoInfr = noA.filter(v => v !== CONTRAVENCION_ESPECIAL);
    const final = [...noNoInfr, ..._vSugeridos];
    setCampo('infraccion', final.join(' | '));
  }

  // Limpiar geoWatch al desmontar (debe estar ANTES del early return para evitar React #310)
  React.useEffect(function() {
    return function() {
      if (geoWatchRef.current != null) {
        navigator.geolocation.clearWatch(geoWatchRef.current);
        geoWatchRef.current = null;
      }
    };
  }, []);

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
  // Anti-martilleo: además de busy durante la petición, mantenemos 3s de
  // cooldown después para no saturar Apps Script + Claude/Deepseek con
  // doble-click accidentales (rate-limit 429).
  async function ejecutarMejora() {
    if (busyMejora) return;  // doble-click defensivo
    if (!d.actuacion) {
      await appAlert('Escribe algo en la descripción primero.', { titulo: 'Nada que mejorar' });
      return;
    }
    // IA requiere conexión obligatoria (la respuesta es el texto mejorado
    // que el inspector ve para aceptar/rechazar — no tiene sentido encolarlo).
    if (!navigator.onLine) {
      await appAlert('Sin conexión: la mejora con IA requiere internet. Guarda la descripción tal cual y mejórala cuando vuelva la señal.',
        { titulo: 'Sin conexión' });
      return;
    }
    setBusyMe(true);
    try {
      const t = await mejorarTexto(d.actuacion);
      if (t) setSugerenciaIA(t);
    } catch (e) {
      await appAlert('Error: ' + e.message, { titulo: 'Mejora con IA' });
    }
    // Cooldown 3s antes de liberar el botón
    setTimeout(() => setBusyMe(false), 3000);
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
      // Sin conexión: no interrumpir al inspector. El botón manual
      // "Consultar POT por coordenadas" permite reintentar al volver la señal.
      if (navigator.onLine) {
        await appAlert('Error: ' + e.message, { titulo: 'Consulta POT' });
      } else {
        console.warn('[POT] sin conexión, consulta diferida:', e.message);
      }
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
      const res = await buscarCatastroGPS(lat, lon);
      if (!res.length) {
        // Solo avisar si fue invocado manualmente con conexión.
        // Tras GPS auto-disparado y sin red, esto sería ruido.
        if (navigator.onLine) {
          await appAlert('La ubicación GPS no cae dentro de ningún predio registrado en el catastro 2026 de Bello.', { titulo: 'Sin resultados' });
        }
      } else if (res.length === 1) {
        setCampo('catastral', res[0].catastral);
        setCampo('ficha', String(res[0].ficha));
      } else {
        // En propiedad horizontal puede haber muchas unidades en el mismo polígono.
        // Sin tope: el inspector debe poder ver todas y elegir.
        setCatRes(res);
      }
    } catch (e) {
      // Sin conexión, el catastro.json no se pudo cargar — el inspector
      // puede llenar manualmente catastral/ficha y dejar la consulta
      // catastral para cuando vuelva la señal.
      if (navigator.onLine) {
        await appAlert('Error: ' + e.message, { titulo: 'Catastro' });
      } else {
        console.warn('[Catastro] sin conexión, consulta diferida:', e.message);
      }
    }
    setBusyCat(false);
  }

  function seleccionarCatastral(item) {
    setCampo('catastral', item.catastral);
    setCampo('ficha', String(item.ficha));
    setCatRes(null);
  }

  // ── Geolocalización progresiva del dispositivo ─────────────
  // Usa watchPosition para refinar la precisión en tiempo real.
  // Acepta automáticamente cuando la precisión es ≤8m, o el usuario
  // puede aceptar manualmente tocando "✓ Usar esta ubicación".
  // Timeout global de 30s si no se alcanza buena precisión.
  function _detenerGeoWatch() {
    if (geoWatchRef.current != null) {
      navigator.geolocation.clearWatch(geoWatchRef.current);
      geoWatchRef.current = null;
    }
  }
  function _aceptarCoordenadas(lat, lon, acc) {
    _detenerGeoWatch();
    setBusyGeo(false);
    setGpsAccuracy(acc);
    setCampo('lat', lat);
    setCampo('lon', lon);
    ejecutarPOT(lat, lon);
    ejecutarBusquedaCatastral(lat, lon);
  }
  async function usarMiUbicacion() {
    if (!navigator.geolocation) {
      await appAlert('Tu dispositivo no soporta geolocalización.', { titulo: 'GPS' });
      return;
    }
    // Si ya hay un watch corriendo, detenerlo y aceptar lo que haya
    if (geoWatchRef.current != null) {
      // El usuario tocó "✓ Usar esta ubicación" — aceptar coordenadas actuales
      _detenerGeoWatch();
      setBusyGeo(false);
      return;
    }
    setBusyGeo(true);
    setGpsAccuracy(null);
    var mejorPos = { lat: null, lon: null, acc: Infinity };
    var timeoutId = setTimeout(function() {
      // Timeout 30s: aceptar la mejor lectura o fallar
      if (mejorPos.lat != null) {
        _aceptarCoordenadas(mejorPos.lat, mejorPos.lon, mejorPos.acc);
      } else {
        _detenerGeoWatch();
        setBusyGeo(false);
        appAlert('Tiempo de espera agotado. Intenta en un lugar con mejor señal GPS.', { titulo: 'GPS' });
      }
    }, 30000);
    var watchId = navigator.geolocation.watchPosition(
      function(pos) {
        var lat = pos.coords.latitude;
        var lon = pos.coords.longitude;
        var acc = pos.coords.accuracy; // metros
        // Solo actualizar si esta lectura es mejor que la anterior
        if (acc < mejorPos.acc) {
          mejorPos = { lat: lat, lon: lon, acc: acc };
          setGpsAccuracy(Math.round(acc));
          // Mostrar coordenadas en tiempo real (sin disparar POT/catastro aún)
          setCampo('lat', lat);
          setCampo('lon', lon);
        }
        // Auto-aceptar cuando la precisión es suficiente (≤8 metros)
        if (acc <= 8) {
          clearTimeout(timeoutId);
          _aceptarCoordenadas(lat, lon, Math.round(acc));
        }
      },
      function(err) {
        clearTimeout(timeoutId);
        _detenerGeoWatch();
        setBusyGeo(false);
        var msg = err.code === 1 ? 'Permiso de ubicación denegado. Habilítalo en los ajustes del navegador.' :
                  err.code === 2 ? 'GPS no disponible. Verifica que la ubicación esté encendida y estás al aire libre.' :
                  err.code === 3 ? 'Tiempo de espera agotado. Intenta en un lugar con mejor señal.' :
                  'No se pudo obtener ubicación.';
        appAlert(msg, { titulo: 'GPS' });
      },
      { enableHighAccuracy: true, timeout: 30000, maximumAge: 0 }
    );
    geoWatchRef.current = watchId;
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
          const c = await crearCarpetaVisita(d.comuna, d.direccion, d.fechaVisita, d.nVisita || 1, {
            barrio:  barrioFinal,
            persona: d.atiendeNombre || '',
            lat:     d.lat  || '',
            lon:     d.lon  || '',
          });
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

      if (r && r.encolado) {
        // Visita guardada en cola offline. Acta/RF/informe NO se pueden
        // generar hasta que sincronice (necesitan fila real + Drive).
        // La carpeta Drive tampoco se creó: cuando vuelva la señal, el
        // inspector debe reabrir la visita y tocar "Actualizar" para que
        // se cree la carpeta (la lógica actual de guardar lo hace solo).
        await appAlert(
          'Sin conexión: la visita quedó guardada en este dispositivo (#' + r.localId + ').\n\n' +
          'Se sincronizará automáticamente cuando vuelva la señal. ' +
          'Al recuperar conexión, vuelve a abrir la visita y toca "Actualizar" ' +
          'para crear la carpeta Drive y poder generar acta y subir fotos.',
          { titulo: 'Guardado local' }
        );
      } else {
        await appAlert(filaEditando
          ? 'Registro actualizado correctamente.'
          : 'Visita guardada. Ya puedes generar el acta F-GGO-46.',
          { titulo: 'Guardado' });
      }
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
      atiendeNombre:  d.noAtiende ? 'No se atiende / No suministra datos' : d.atiendeNombre,
      atiendeId:      d.noAtiende ? 'No se atiende / No suministra datos' : d.atiendeId,
      atiendeTel:     d.noAtiende ? 'No se atiende / No suministra datos' : (d.telNoAporta ? 'No aporta' : d.atiendeTel),
      atiendeRelacion: d.noAtiende ? '' : relacionFinal,
      atiendeDir:     d.noAtiende ? 'No se atiende / No suministra datos' : (d.dirNoAporta ? 'No aporta' : dirNotifFinal),
      atiendeEmail:   d.noAtiende ? 'No se atiende / No suministra datos' : (d.emailNoAporta ? 'No aporta' : d.atiendeEmail),
      // Licencia
      licenciaAportada: d.licenciaAportada || 'NO',
      licenciaN:       d.licencia,
      licenciaFecha:   _isoAFecha(d.fechaLicencia),
      licenciaTipo:    d.tipoLicencia,
      licenciaPisos:   d.pisos,
      licenciaDest:    d.destinaciones,
      licenciaCubierta:d.cubierta,
      licenciaSistema: d.sistema,
      licenciaObs:     d.obsLicencia || '',
      // Caracterización
      estadoObra:     d.estadoObra,
      repLocativa:    d.repLocativa,
      usos:           (d.usos || '') + (d.queFunciona ? ' - ' + d.queFunciona : ''),
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
      area:           d.areaNoMedible ? 'No se pudo medir' : d.area,
      obsConclusion:  d.obsConclusion || '',
      // Citación
      orden:          (d.orden && String(d.orden).trim()) ? d.orden : 'N/A',
      citacion:       d.noCitacion
        ? 'No se deja citación'
        : (d.citacionFecha
            ? (_isoAFecha(d.citacionFecha) + (d.citacionHora ? ' · ' + (HORAS_CITACION.find(h => h.val === d.citacionHora)?.l || d.citacionHora) : ''))
            : ''),
      // Inspectores firmantes: array con todos los seleccionados en
      // los chips "Visitador(es)". AS los expande en filas A47-A50 del
      // acta cruzando con USUARIOS para sacar el cargo.
      visitadores:    (d.visitador || '').split(/\s*\/\s*/).map(s => s.trim()).filter(Boolean),
      // Fallback inspector / cargo del usuario logueado (compat con código viejo).
      inspector:      usuario?.usuario || '',
      cargo:          usuario?.cargo   || 'Inspector',
      // Carpeta de la visita
      idCarpetaVisita: d.idCarpetaVisita,
      idCarpetaFotos:  d.idCarpetaFotos,
      fila:            filaEditando,
    };
  }

  // Devuelve [] si el formulario está completo para generar acta;
  // si faltan datos retorna un array con los nombres legibles de los
  // campos pendientes. El usuario puede cancelar o continuar igualmente.
  function _validarAntesDeActa() {
    const faltan = [];
    function req(cond, nombre) { if (!cond) faltan.push(nombre); }

    // Identificación
    if (d.esOficio) {
      req(d.orden, 'N° Orden de policía');
    } else {
      req(d.radicado, 'Radicado');
      req(d.fechaRadicado, 'Fecha del radicado');
    }
    req(d.fechaVisita, 'Fecha de la visita');

    // Ubicación
    req(d.direccion, 'Dirección');
    req(d.barrio && d.barrio !== '__otro__', 'Barrio / Vereda');
    req(d.comuna, 'Comuna');
    req(d.lat != null && d.lon != null, 'Coordenadas GPS (capturar ubicación)');

    // Persona que atiende
    req(d.atiendeNombre, 'Nombre de la persona que atiende');
    req(d.atiendeId, 'Identificación de la persona que atiende');
    req(d.atiendeRelacion, 'Relación con el evento');

    // Características de la edificación
    req(d.estadoObra, 'Estado de la obra');
    req(d.habitado, 'Habitado');
    req(d.alturaPisos, 'Altura en pisos');
    req(d.destActuales, 'N° destinaciones actuales');
    req(d.usos, 'Usos actuales');
    req(d.cubiertaActual, 'Tipo cubierta actual');

    // Verificación documental
    req(d.licenciaAportada, '¿Se aportó licencia? (SI/NO)');
    if (d.licenciaAportada === 'SI') {
      req(d.licencia, 'N° de licencia');
      req(d.fechaLicencia, 'Fecha de licencia');
      req(d.tipoLicencia, 'Tipo y modalidad de licencia');
      req(d.pisos, 'Pisos aprobados');
      req(d.destinaciones, 'Destinaciones de licencia');
      req(d.cubierta, 'Cubierta de licencia');
      req(d.sistema, 'Sistema estructural');
    }

    // Descripción / conclusiones
    req(d.actuacion, 'Descripción de la situación encontrada');
    req(d.infraccion, 'Tipo de contravención');
    req(d.area || d.areaNoMedible, 'Área de contravención (m² o marca "no se pudo medir")');

    // Suspensión / citación
    if (d.estadoObra !== 'Terminada') {
      req(d.suspension, '¿Se decreta suspensión?');
      if (d.suspension === 'SI') req(d.orden, 'N° Orden de policía');
    }
    if (!d.noCitacion) {
      req(d.citacionFecha, 'Fecha de citación (o marca "no se deja citación")');
      req(d.citacionHora,  'Hora de citación');
    }

    // Funcionarios
    req(d.visitador, 'Visitador(es) que realizan la inspección');

    // POT
    req(d.catastral, 'Código catastral');
    req(d.ficha, 'N° ficha predial');
    req(d.poligono, 'Polígono de uso del suelo');
    req(d.amenaza, '¿Amenaza? (SI/NO)');
    req(d.sueloProt, '¿Suelo de protección? (SI/NO)');
    req(d.quebrada, '¿Dentro de retiro de quebrada? (SI/NO)');

    // Observaciones (sección 10) — opcional, no bloquea acta

    return faltan;
  }

  // Paso 1 del F-GGO-46: Sheet de CARACTERIZACIÓN.
  // No inserta fotos — para el registro fotográfico usar el botón aparte.
  async function generarActa() {
    if (!filaEditando) {
      await appAlert('Primero guarda la visita.', { titulo: 'Visita no guardada' });
      return;
    }
    // Validar todos los campos antes de generar el acta. Estricto:
    // si falta cualquier dato obligatorio, NO se permite generar.
    const faltan = _validarAntesDeActa();
    if (faltan.length > 0) {
      const lista = faltan.slice(0, 20).map(s => '• ' + s).join('\n');
      const extra = faltan.length > 20 ? '\n... y ' + (faltan.length - 20) + ' más' : '';
      await appAlert(
        'No se puede generar el acta: faltan ' + faltan.length + ' campo(s) por diligenciar:\n\n' +
        lista + extra +
        '\n\nVuelve al formulario, complétalos y guarda antes de generar el acta.',
        { titulo: 'Datos incompletos', btnOk: 'Volver al formulario' }
      );
      return;
    }
    await _ejecutarGenerarActa(false);
  }

  // Regenera el acta reemplazando la existente. Misma validacion estricta
  // que generarActa pero pasa flag regenerar=true al webhook para que
  // mande a papelera el acta vieja antes de crear la nueva.
  async function regenerarActa() {
    if (!filaEditando) {
      await appAlert('Primero guarda la visita.', { titulo: 'Visita no guardada' });
      return;
    }
    const faltan = _validarAntesDeActa();
    if (faltan.length > 0) {
      const lista = faltan.slice(0, 20).map(s => '• ' + s).join('\n');
      const extra = faltan.length > 20 ? '\n... y ' + (faltan.length - 20) + ' más' : '';
      await appAlert(
        'No se puede regenerar el acta: faltan ' + faltan.length + ' campo(s):\n\n' +
        lista + extra +
        '\n\nVuelve al formulario, complétalos y guarda antes de regenerar.',
        { titulo: 'Datos incompletos', btnOk: 'Volver al formulario' }
      );
      return;
    }
    await _ejecutarGenerarActa(true);
  }

  async function _ejecutarGenerarActa(regenerar) {
    setGA(true);
    try {
      const payload = Object.assign({ accion: 'generarActa' }, _construirDatosF46());
      if (regenerar) payload.regenerar = true;
      const r = await gasPost(payload);
      const link = r.linkSheet || r.linkActa;
      if (link) {
        setCampo('linkXlsxActa', link);
        if (r.linkPdf) setCampo('linkPdfActa', r.linkPdf);
        await appAlert(
          (regenerar
            ? 'Acta regenerada correctamente.'
            : (r.yaExistia ? 'El acta ya existía en la carpeta.' : 'Acta generada correctamente.')) +
          '\n\nSe abrirá la hoja de caracterización en una pestaña nueva.',
          { titulo: 'Acta lista' }
        );
        window.open(link, '_blank', 'noopener');
      } else {
        await appAlert('El acta se generó pero no recibí link. Revisa Drive.', { titulo: 'Acta generada' });
      }
    } catch (e) {
      await appAlert('Error: ' + e.message, { titulo: regenerar ? 'Regenerar acta' : 'Generar acta' });
    }
    setGA(false);
  }

  // Paso 2 del F-GGO-46: Doc REGISTRO FOTOGRÁFICO con las fotos
  // ya subidas a la subcarpeta Fotos de la visita.
  // Abre el modal de fotos: carga la lista de Drive, genera descripciones IA
  async function abrirModalFotos() {
    if (!filaEditando) {
      await appAlert('Primero guarda la visita.', { titulo: 'Visita no guardada' });
      return;
    }
    if (!d.idCarpetaFotos) {
      await appAlert('La visita aún no tiene subcarpeta de fotos. Sube fotos primero.', { titulo: 'Sin fotos' });
      return;
    }
    setCargandoFotos(true);
    try {
      const r = await listarFotosActa(d.idCarpetaFotos);
      if (!r.ok || !r.fotos || r.fotos.length === 0) {
        await appAlert('No se encontraron fotos en la carpeta.', { titulo: 'Sin fotos' });
        setCargandoFotos(false);
        return;
      }
      // Inicializar con descripciones vacias — se generan async
      const lista = r.fotos.map(function(f) {
        return { id: f.id, nombre: f.nombre, link: f.link, descripcion: '', mimeType: f.mimeType, descBusy: true };
      });
      setModalFotos(lista);
      setCargandoFotos(false);
      // Generar descripciones IA en paralelo (sin bloquear)
      lista.forEach(function(foto, idx) {
        describirFotoDesdeId(foto.id).then(function(resp) {
          setModalFotos(function(prev) {
            if (!prev) return prev;
            var next = prev.slice();
            next[idx] = Object.assign({}, next[idx], {
              descripcion: resp.descripcion || 'Sin descripcion',
              descBusy: false,
            });
            return next;
          });
        }).catch(function() {
          setModalFotos(function(prev) {
            if (!prev) return prev;
            var next = prev.slice();
            next[idx] = Object.assign({}, next[idx], { descripcion: 'Sin descripcion', descBusy: false });
            return next;
          });
        });
      });
    } catch (e) {
      await appAlert('Error cargando fotos: ' + e.message, { titulo: 'Error' });
      setCargandoFotos(false);
    }
  }

  // Confirmar y generar RF con las fotos en el orden del modal
  async function confirmarYGenerarRF() {
    if (!modalFotos || modalFotos.length === 0) return;
    setGRF(true);
    setModalFotos(null);
    try {
      const payload = Object.assign({ accion: 'generarRegistroFotos' }, _construirDatosF46());
      // Enviar array de fotos con fileId y descripcion editada
      payload.fotos = modalFotos.map(function(f) {
        return { fileId: f.id, descripcion: f.descripcion || '' };
      });
      const r = await gasPost(payload);
      const link = r.linkDoc;
      if (link) {
        await appAlert(
          (r.yaExistia ? 'El registro fotografico ya existia en la carpeta.' : 'Registro fotografico generado.') +
          '\n\nSe abrira en una pestana nueva.',
          { titulo: 'Registro fotografico listo' }
        );
        window.open(link, '_blank', 'noopener');
      } else {
        await appAlert('Se genero pero no recibi link. Revisa Drive.', { titulo: 'Registro generado' });
      }
    } catch (e) {
      await appAlert('Error: ' + e.message, { titulo: 'Generar registro fotografico' });
    }
    setGRF(false);
  }

  // ── Render ─────────────────────────────────────────────────
  // nVisita puede venir como string del Sheet ("2") o number (1). Normalizar
  // antes de comparar para evitar la coerción frágil "10" > 1 (=true) vs "2" > 1 (=true por casualidad).
  const _nVisitaNum = parseInt(d.nVisita, 10) || 0;
  const nVisitaLabel = _nVisitaNum > 1 ? ' · Visita N°' + _nVisitaNum : '';
  const tituloPantalla = filaEditando
    ? 'Continuar visita'
    : (d.esOficio ? 'Visita de oficio' : 'Nueva visita');

  const tieneInfoSticky = d.direccion || d.radicado || d.esOficio;

  return (
    <div className="pantalla activa pad-bottom">
      {/* Header unificado (NO sticky) — título + Volver + info radicado/dirección/N° visita */}
      <div style={{
        background: 'var(--fondo)', paddingBottom: 12, marginBottom: 14,
        borderBottom: '1px solid var(--borde)',
      }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          gap: 12, marginBottom: tieneInfoSticky ? 10 : 0,
        }}>
          <div className="page-title" style={{ margin: 0 }}>{tituloPantalla}</div>
          {onSalir && (
            <button onClick={onSalir} style={{
              background: 'var(--gris-bg)', border: '1px solid var(--borde)', borderRadius: 8,
              padding: '6px 14px', fontFamily: 'inherit', fontSize: 12, cursor: 'pointer',
            }}>&#8592; Volver</button>
          )}
        </div>
        {tieneInfoSticky && (
          <div style={{
            background: 'var(--superficie)', borderRadius: 'var(--r-md)',
            border: '0.5px solid var(--borde)', padding: '10px 14px',
            display: 'flex', flexDirection: 'column', gap: 4,
          }}>
            {d.direccion && (
              <div>
                <span style={{
                  color: 'var(--texto-suave)', fontSize: 10, textTransform: 'uppercase',
                  letterSpacing: '0.5px', fontWeight: 600, marginRight: 6,
                }}>Visita en</span>
                <span style={{ fontWeight: 600, fontSize: 14 }}>
                  {d.direccion}{d.barrio && d.barrio !== '__otro__' ? ' · ' + d.barrio : ''}
                </span>
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              {d.radicado && <span style={{
                fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--brand-accent)', fontWeight: 600,
              }}>RAD {d.radicado}</span>}
              {d.esOficio && d.orden && <span style={{
                fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--brand-accent)', fontWeight: 600,
              }}>OFICIO {d.orden}</span>}
              {_nVisitaNum > 1 && (
                <span style={{
                  fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
                  background: 'var(--brand-bg)', color: 'var(--brand-ink)',
                  border: '1px solid var(--brand-accent)',
                }}>Visita N°{_nVisitaNum}</span>
              )}
            </div>
          </div>
        )}
      </div>

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
            {_nVisitaNum > 1 && <span style={{ marginLeft: 4, opacity: 0.7 }}>· Visita N°{_nVisitaNum}</span>}
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
              {gpsAccuracy != null && (() => {
                var color = gpsAccuracy <= 8 ? '#2e7d32' : gpsAccuracy <= 20 ? '#e65100' : '#c62828';
                var label = gpsAccuracy <= 8 ? 'Excelente' : gpsAccuracy <= 20 ? 'Buena' : gpsAccuracy <= 50 ? 'Regular' : 'Baja';
                return React.createElement('span', {
                  style: { marginLeft: 8, fontSize: 12, fontWeight: 600, color: color,
                    padding: '1px 7px', borderRadius: 8, background: color + '18' }
                }, '±' + gpsAccuracy + 'm · ' + label);
              })()}
            </div>
            <div className="gps-dir">{d.direccion || '—'}</div>
            {busyGeo && gpsAccuracy != null && React.createElement('div', {
              style: { fontSize: 11, color: '#666', marginTop: 2 }
            }, 'Refinando señal GPS… Puedes aceptar la ubicación actual o esperar mayor precisión.')}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
            <_BtnAccion busy={false} onClick={usarMiUbicacion}>
              {busyGeo
                ? (gpsAccuracy != null ? '✓ Usar esta ubicación' : '⏳ Buscando señal…')
                : '📍 Capturar mi ubicación'}
            </_BtnAccion>
            {busyGeo && React.createElement('button', {
              onClick: function() { _detenerGeoWatch(); setBusyGeo(false); setGpsAccuracy(null); },
              style: { background: 'none', border: 'none', color: '#999', fontSize: 12,
                cursor: 'pointer', padding: '2px 6px' }
            }, '✕ Cancelar')}
          </div>
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <_MapaGPS lat={d.lat} lon={d.lon} onMove={(lat, lon) => {
            setCampo('lat', lat); setCampo('lon', lon);
          }} />
        </div>
      </_Seccion>

      {/* 3. PERSONA QUE ATIENDE ──────────────────────────── */}
      <_Seccion titulo="Persona que atiende" color="azul">
        <div style={{ gridColumn: '1 / -1', marginBottom: 4 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600, color: d.noAtiende ? 'var(--rojo, #dc2626)' : 'var(--texto-2)' }}>
            <input type="checkbox"
              checked={d.noAtiende}
              onChange={e => setCampo('noAtiende', e.target.checked)}
              style={{ width: 16, height: 16, accentColor: 'var(--rojo, #dc2626)', cursor: 'pointer' }}
            />
            No se atiende / No suministra datos
          </label>
        </div>
        {!d.noAtiende && (<>
        <_Campo label="Nombre completo">
          <_Input value={d.atiendeNombre} onChange={v => setCampo('atiendeNombre', v)} />
        </_Campo>
        <_Campo label="Cédula">
          <_Input mono value={d.atiendeId} onChange={v => setCampo('atiendeId', v)} />
        </_Campo>
        <_Campo label={<>Teléfono <_CheckNoAporta checked={d.telNoAporta} onChange={v => setCampo('telNoAporta', v)} /></>}>
          <_Input mono value={d.atiendeTel} onChange={v => setCampo('atiendeTel', v)}
            disabled={d.telNoAporta} placeholder={d.telNoAporta ? 'No aporta' : '3000000000'} />
        </_Campo>
        <_Campo label={<>Correo electrónico <_CheckNoAporta checked={d.emailNoAporta} onChange={v => setCampo('emailNoAporta', v)} /></>}>
          <_Input type="email" value={d.atiendeEmail}
            onChange={v => setCampo('atiendeEmail', v)}
            disabled={d.emailNoAporta} placeholder={d.emailNoAporta ? 'No aporta' : 'correo@ejemplo.com'} />
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
        <_Campo label={<>Dirección de notificación <_CheckNoAporta checked={d.dirNoAporta} onChange={v => { setCampo('dirNoAporta', v); if (v) setCampo('dirNotifIgual', false); }} /></>} fullWidth>
          {!d.dirNoAporta && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, fontSize: 13, color: 'var(--texto-suave)', cursor: 'pointer' }}>
              <input type="checkbox"
                checked={d.dirNotifIgual}
                onChange={e => setCampo('dirNotifIgual', e.target.checked)}
                style={{ accentColor: 'var(--brand-accent)' }}
              />
              Misma dirección del inmueble
            </label>
          )}
          <_Input
            value={d.dirNoAporta ? '' : (d.dirNotifIgual ? d.direccion : d.atiendeDir)}
            onChange={v => setCampo('atiendeDir', v)}
            disabled={d.dirNoAporta || d.dirNotifIgual}
            placeholder={d.dirNoAporta ? 'No aporta' : (d.dirNotifIgual ? '' : 'Dirección de notificación')}
          />
        </_Campo>
        </>)}
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
            otroLabel="Especifique uso"
          />
          {/* Campo que funciona: visible cuando hay uso diferente a Residencial */}
          {(d.usos || '').split(/\s*[·,]\s*/).some(function(u) {
            return u.trim() && u.trim() !== 'Residencial' && u.trim() !== 'Otro';
          }) && (
            <div style={{ marginTop: 8 }}>
              <input
                type="text"
                className="input-campo"
                placeholder="¿Qué funciona en el predio?"
                value={d.queFunciona || ''}
                onChange={function(e) { setCampo('queFunciona', e.target.value); }}
              />
            </div>
          )}
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
            {busyMejora ? 'Mejorando...' : 'Mejorar texto'}
          </_BtnAccion>
          <_BtnAccion onClick={toggleDictado} busy={false}>
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
          {/* Advertencia: si el predio es público o está en área protegida,
              sugerir el comportamiento correcto antes de que el inspector
              tipifique algo incorrecto (ej.: A4 cuando debería ser A1/A3). */}
          {_mostrarAdvertenciaTipif && (
            <div style={{
              padding: '12px 14px', borderRadius: 'var(--r-md)', marginBottom: 12,
              background: '#fef3c7', border: '1.5px solid #f59e0b',
              color: '#78350f', fontSize: 13,
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                <span style={{ fontSize: 20, lineHeight: 1, flexShrink: 0 }}>⚠️</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, marginBottom: 6 }}>
                    Tipificación sugerida
                  </div>
                  <div style={{ marginBottom: 8 }}>
                    Según la consulta POT/catastro:
                    <ul style={{ margin: '4px 0 0 0', paddingLeft: 20 }}>
                      {_sugerenciasA.map(s => (
                        <li key={s.val} style={{ marginBottom: 3 }}>
                          {s.razon} → <strong>{s.val}</strong>
                        </li>
                      ))}
                    </ul>
                  </div>
                  {_chipsAActuales.length > 0 && _chipsAActuales.some(v => !_vSugeridos.includes(v)) && (
                    <div style={{
                      padding: '6px 10px', borderRadius: 6, marginBottom: 8,
                      background: '#fee2e2', color: '#991b1b', fontSize: 12,
                      border: '1px solid #fca5a5',
                    }}>
                      Actualmente marcaste: {_chipsAActuales.join(', ')}.
                      Al aplicar la sugerencia se reemplazarán solo los comportamientos del Literal A.
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button type="button" onClick={_aplicarSugerenciasTipif}
                      className="btn-principal verde"
                      style={{ margin: 0, padding: '8px 14px', fontSize: 13 }}>
                      ✓ Aplicar sugerencia
                    </button>
                    <button type="button" onClick={() => setAdvertTipifIgnorada(true)}
                      style={{
                        background: 'transparent', color: '#78350f',
                        border: '1px solid #d97706', borderRadius: 8,
                        padding: '8px 14px', fontFamily: 'inherit', fontSize: 13, fontWeight: 600,
                        cursor: 'pointer',
                      }}>
                      No aplicar
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
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

        <_Campo label="Citación" fullWidth>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, fontSize: 13, color: 'var(--texto-suave)', cursor: 'pointer' }}>
            <input type="checkbox"
              checked={d.noCitacion}
              onChange={e => {
                setCampo('noCitacion', e.target.checked);
                if (e.target.checked) {
                  setCampo('citacionFecha', '');
                  setCampo('citacionHora', '');
                }
              }}
              style={{ accentColor: 'var(--brand-accent)' }}
            />
            No se deja citación
          </label>
        </_Campo>
        <_Campo label="Fecha de citación">
          <_Input type="date" value={d.citacionFecha}
            onChange={v => setCampo('citacionFecha', v)}
            disabled={d.noCitacion} />
        </_Campo>
        <_Campo label="Hora de citación">
          <select className="input-campo" value={d.citacionHora}
            onChange={e => setCampo('citacionHora', e.target.value)}
            disabled={d.noCitacion}>
            <option value="">Sin hora</option>
            {HORAS_CITACION.map(h => <option key={h.val} value={h.val}>{h.l}</option>)}
          </select>
        </_Campo>
      </_Seccion>

      {/* 8. VISITADORES ──────────────────────────────────── */}
      <_Seccion titulo="Funcionarios que realizan la inspección" color="azul">
        <_Campo label="Visitador(es)" fullWidth>
          <div className="chips">
            {visitadoresDin.map(v => {
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

      {/* 9. CONSULTA NORMA POT ──────────────────────────── */}
      <_Seccion titulo="Consulta norma POT" color="gris">
        {/* Búsqueda automática primero (al inicio del bloque, ancho completo,
            centrado y con icono que indica que rellena código catastral y ficha). */}
        <div style={{ gridColumn: '1 / -1' }}>
          <button type="button" onClick={() => ejecutarBusquedaCatastral()} disabled={busyCat}
            style={{
              width: '100%',
              background: 'var(--brand-bg)', color: 'var(--brand-ink)',
              border: '1.5px dashed var(--brand-accent)', borderRadius: 10,
              padding: '12px 16px', fontFamily: 'inherit', fontSize: 14, fontWeight: 600,
              cursor: busyCat ? 'not-allowed' : 'pointer', opacity: busyCat ? 0.6 : 1,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}>
            {busyCat ? 'Buscando...' : 'Buscar datos catastrales'}
          </button>
          <div style={{ fontSize: 11, color: 'var(--texto-suave)', textAlign: 'center', marginTop: 4 }}>
            Llena automáticamente código catastral y ficha usando las coordenadas GPS.
          </div>
        </div>
        <_Campo label="Código catastral">
          <_Input mono value={d.catastral} onChange={v => setCampo('catastral', v)} />
        </_Campo>
        <_Campo label="N° ficha predial">
          <_Input mono value={d.ficha} onChange={v => setCampo('ficha', v)} />
        </_Campo>

        {catResultados && catResultados.length > 0 && (
          <div style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {/* Alerta si alguna ficha es del Municipio de Bello */}
            {catResultados.some(r => r.municipal) && (
              <div style={{
                padding: '12px 14px', borderRadius: 'var(--r-md)',
                background: '#fef2f2', border: '1.5px solid #dc2626',
                color: '#991b1b', fontSize: 13, fontWeight: 600,
                display: 'flex', alignItems: 'flex-start', gap: 8,
              }}>
                <span style={{ fontSize: 18, lineHeight: 1 }}>⚠️</span>
                <div>Predio del <strong>Municipio de Bello</strong></div>
              </div>
            )}
            <div style={{ fontSize: 11, color: 'var(--texto-suave)' }}>
              {catResultados.length === 1
                ? '1 unidad en este predio:'
                : catResultados.length + ' unidades en este predio (propiedad horizontal) — selecciona la correcta:'}
            </div>
            <_ListaFichasCatastrales fichas={catResultados}
              onSeleccionar={seleccionarCatastral} maxAlto={400} />
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
        <_Campo label="¿Dentro de retiro de quebrada?">
          <_Radio value={d.quebrada} onChange={v => setCampo('quebrada', v)}
            opciones={['SI', 'NO']} />
        </_Campo>
        <div style={{ gridColumn: '1 / -1' }}>
          <_BtnAccion busy={busyPOT} onClick={() => ejecutarPOT()}>
            {busyPOT ? '...' : 'Consultar POT por coordenadas'}
          </_BtnAccion>
        </div>
      </_Seccion>

      {/* 10. OBSERVACIONES Y CONCLUSIONES (al final) ───────── */}
      <_Seccion titulo="Observaciones y conclusiones" color="gris">
        <_Campo label="Conclusiones generales del inspector" fullWidth
          hint="Dictamen técnico, observaciones sobre la situación encontrada y su relación con la normativa aplicable.">
          <_TextArea value={d.obsConclusion} onChange={v => setCampo('obsConclusion', v)} rows={6}
            placeholder="Describa las conclusiones de la visita, hallazgos relevantes y recomendaciones..." />
        </_Campo>
      </_Seccion>

      {/* ── Botón guardar ──────────────────────────────────── */}
      <button onClick={guardar} disabled={guardando} className="btn-principal verde"
        style={{ marginTop: 18, fontSize: 16 }}>
        {guardando ? 'Guardando...' : (filaEditando ? 'Actualizar visita' : 'Guardar visita')}
      </button>

      {/* Botones de documentos generados (solo con fila guardada) */}
      {filaEditando && (
        <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* Acta F-GGO-46:
              - Sin acta: un solo boton 'Generar acta F-GGO-46' (relleno).
              - Con acta: dos botones lado a lado — 'Ver acta' (relleno) y
                'Regenerar' (outlined punteado, llama backend con regenerar=true). */}
          {d.linkXlsxActa ? (
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" onClick={() => window.open(d.linkXlsxActa, '_blank', 'noopener')}
                className="btn-principal" style={{ fontSize: 15, flex: 2 }}>
                👁 Ver acta F-GGO-46
              </button>
              <button type="button" onClick={regenerarActa} disabled={generandoActa}
                style={{
                  background: 'transparent', color: 'var(--brand-accent)',
                  border: '1.5px dashed var(--brand-accent)', borderRadius: 10,
                  padding: '12px 14px', fontFamily: 'inherit', fontSize: 14, fontWeight: 600,
                  cursor: generandoActa ? 'not-allowed' : 'pointer',
                  opacity: generandoActa ? 0.6 : 1, flex: 1,
                }}>
                {generandoActa ? '...' : '🔄 Regenerar'}
              </button>
            </div>
          ) : (
            <button onClick={generarActa} disabled={generandoActa} className="btn-principal"
              style={{ fontSize: 15 }}>
              {generandoActa ? 'Generando acta...' : 'Generar acta F-GGO-46'}
            </button>
          )}

          {/* Informe F-GGO-43: estilo outlined para diferenciarlo del acta */}
          <button onClick={async () => {
            if (typeof window.abrirInformeF43 !== 'function') {
              appAlert('El generador de informe no cargó.', { titulo: 'Error' });
              return;
            }
            // Si hay coordenadas, consultar POT completo para enriquecer
            // (clasificacion, tratamiento, intensidad) además de los campos de BD.
            let potExtra = {};
            if (d.lat != null && d.lon != null && typeof consultarPOT === 'function') {
              try {
                const r = await consultarPOT(d.lat, d.lon);
                // ── Mapear valores GDB → opciones del <select> del informe ──
                const _norm = s => (s||'').toString().toLowerCase()
                  .replace(/[áàä]/g,'a').replace(/[éèë]/g,'e').replace(/[íìï]/g,'i')
                  .replace(/[óòö]/g,'o').replace(/[úùü]/g,'u');

                // Clasificación: "Suelo urbano" → "Urbano", etc.
                let clas = '';
                const cn = _norm(r.clasificacion);
                if (cn.includes('expansion'))      clas = 'De expansion urbana';
                else if (cn.includes('suburban'))  clas = 'Suburbano';
                else if (cn.includes('urbano'))    clas = 'Urbano';
                else if (cn.includes('rural'))     clas = 'Rural';
                else                               clas = r.clasificacion || '';

                // Tratamiento: GDB devuelve "CN3, Consolidación Nivel 3" o similar
                let trat = '';
                const tn = _norm(r.tratamiento);
                if (tn.includes('consolid')) {
                  if (tn.includes('1') || tn.includes('uno'))      trat = 'Consolidacion nivel 1';
                  else if (tn.includes('2') || tn.includes('dos')) trat = 'Consolidacion nivel 2';
                  else if (tn.includes('3') || tn.includes('tres'))trat = 'Consolidacion nivel 3';
                  else                                              trat = 'Consolidacion nivel 3';
                } else if (tn.includes('mejoram')) {
                  trat = tn.includes('rural') ? 'Mejoramiento integral rural' : 'Mejoramiento integral';
                } else if (tn.includes('renovac')) {
                  if (tn.includes('redesarrollo')) trat = 'Renovacion urbana - redesarrollo';
                  else if (tn.includes('reactiv')) trat = 'Renovacion urbana - reactivacion';
                  else                              trat = 'Renovacion urbana - redesarrollo';
                } else if (tn.includes('desarrollo')) {
                  trat = tn.includes('restring') ? 'Desarrollo restringido' : 'Desarrollo';
                } else if (tn.includes('conserv')) {
                  if (tn.includes('historic'))      trat = 'Conservacion historica';
                  else if (tn.includes('arquitect'))trat = 'Conservacion arquitectonica';
                  else if (tn.includes('activ'))    trat = 'Conservacion activa';
                  else if (tn.includes('estric'))   trat = 'Conservacion estricta';
                  else                              trat = 'Conservacion activa';
                } else if (tn.includes('restaur'))  trat = 'Restauracion de actividades rurales';
                else if (tn.includes('recupera') && tn.includes('forest')) trat = 'Recuperacion para la produccion forestal';
                else if (tn.includes('recupera'))   trat = 'Recuperacion ambiental';
                else if (tn.includes('suburban'))   trat = 'Suburbanizacion restringida';
                else if (tn.includes('produccion') || tn.includes('agric')) trat = 'Produccion agricola, ganadera y forestal';
                else                                trat = r.tratamiento || '';

                // Franja de intensidad: mapear NMG / densidad → baja/media/alta
                let franja = '';
                const fn = _norm(r.intensidad);
                if (fn.includes('alta'))      franja = 'Franja alta';
                else if (fn.includes('media'))franja = 'Franja media';
                else if (fn.includes('baja')) franja = 'Franja baja';
                else if (r.intensidad)        franja = r.intensidad;  // raw para fallback

                potExtra = {
                  poligono:      d.poligono || r.poligono || '',
                  amenaza:       d.amenaza || r.amenaza || '',
                  sueloProt:     d.sueloProt || r.sueloProt || '',
                  clasificacion: clas,
                  tratamiento:   trat,
                  franja:        franja,
                };
                // Derivar proteccion para el <select> del informe
                const sp = r.sueloProt === 'SI' || d.sueloProt === 'SI';
                const am = r.amenaza === 'SI' || d.amenaza === 'SI';
                if (am) {
                  const tipo = _norm(r.amenazaTipo);
                  if (tipo.includes('inunda')) potExtra.proteccion = 'Si - amenaza por inundacion';
                  else if (tipo.includes('movim') || tipo.includes('masa')) potExtra.proteccion = 'Si - amenaza por movimiento en masa';
                  else potExtra.proteccion = 'Si - amenaza por movimiento en masa';
                } else if (sp) {
                  potExtra.proteccion = 'Si - area protegida';
                } else if (r.enRetiro === 'SI') {
                  potExtra.proteccion = 'Si - ronda hidrica';
                } else {
                  potExtra.proteccion = 'No';
                }
              } catch(e) { /* silencioso: el informe queda sin POT auto */ }
            }
            window.abrirInformeF43({
              fila: filaEditando,
              idCarpeta: d.idCarpetaVisita,
              radicado: d.radicado,
              fechaVisita: d.fechaVisita,
              direccion: d.direccion,
              barrio: d.barrio,
              comuna: d.comuna,
              catastral: d.catastral,
              lat: d.lat, lon: d.lon,
              inspector: usuario?.usuario || '',
              cargo: usuario?.cargo || '',
              seAportoLicencia: d.licenciaAportada,
              numRes:           d.licencia,
              fechaEjec:        d.fechaLicencia,
              tipoModalidad:    d.tipoLicencia,
              pisos:            d.pisos,
              dest:             d.destinaciones,
              cubierta:         d.cubierta,
              sist:             d.sistema,
              obsLicencia:      d.obsLicencia,
              poligono:         d.poligono,
              amenaza:          d.amenaza,
              sueloProt:        d.sueloProt,
              observaciones:    d.actuacion,
              areas:            d.area,
              ...potExtra,
            });
          }} style={{
            background: 'transparent', color: 'var(--brand-accent)',
            border: '1.5px solid var(--brand-accent)', borderRadius: 10,
            padding: '12px 16px', fontFamily: 'inherit', fontSize: 15, fontWeight: 600,
            cursor: 'pointer',
          }}>
            Generar informe F-GGO-43
          </button>
        </div>
      )}

      {/* Registro fotográfico al final: primero el panel con las fotos,
          después el botón para generar el documento RF. */}
      {d.idCarpetaFotos && filaEditando && (
        <SeccionFotos
          idCarpetaFotos={d.idCarpetaFotos}
          fila={filaEditando}
          linkDrive={d.linkDrive}
        />
      )}
      {filaEditando && (
        <button onClick={abrirModalFotos} disabled={generandoRF || cargandoFotos}
          className="btn-principal" style={{ fontSize: 15, marginTop: 14 }}>
          {cargandoFotos ? 'Cargando fotos...' : generandoRF ? 'Generando...' : 'Generar registro fotografico'}
        </button>
      )}

      {/* Modal de revision de fotos antes de generar RF */}
      {modalFotos && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 9999,
          display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
          padding: 16, overflowY: 'auto',
        }} onClick={function(e) { if (e.target === e.currentTarget) setModalFotos(null); }}>
          <div style={{
            background: 'white', borderRadius: 12, padding: 20, width: '100%',
            maxWidth: 600, margin: 'auto',
          }}>
            <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--brand-accent)', marginBottom: 4 }}>
              Registro fotografico
            </div>
            <div style={{ fontSize: 12, color: 'var(--texto-suave)', marginBottom: 16 }}>
              Arrastra desde el icono ≡ para reordenar. La linea azul indica donde se insertara la foto.
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 0, position: 'relative' }}>
              {modalFotos.map(function(foto, idx) {
                var isDragging = dragIdx === idx;
                // Indicador de inserción: línea azul arriba o abajo de este elemento
                var showLineAbove = dropTarget && dropTarget.idx === idx && dropTarget.pos === 'above' && dragIdx !== idx;
                var showLineBelow = dropTarget && dropTarget.idx === idx && dropTarget.pos === 'below' && dragIdx !== idx;

                return React.createElement(React.Fragment, { key: foto.id },
                  // ── Línea de inserción ARRIBA ──
                  showLineAbove && React.createElement('div', { style: {
                    height: 3, background: '#1976d2', borderRadius: 2, margin: '0 8px',
                    boxShadow: '0 0 6px rgba(25,118,210,0.5)',
                  }}),
                  React.createElement('div', {
                    draggable: false,
                    onDragStart: function(e) {
                      // Solo arrastrar desde el handle ≡
                      var handle = e.target.closest('[data-draghandle]');
                      if (!handle) { e.preventDefault(); return; }
                      setDragIdx(idx);
                      e.dataTransfer.effectAllowed = 'move';
                      try { e.dataTransfer.setData('text/plain', String(idx)); } catch(ex) {}
                      if (e.dataTransfer.setDragImage) {
                        var ghost = e.currentTarget.cloneNode(true);
                        ghost.style.opacity = '0.85';
                        ghost.style.transform = 'scale(0.95)';
                        ghost.style.boxShadow = '0 8px 24px rgba(0,0,0,0.25)';
                        ghost.style.position = 'fixed';
                        ghost.style.top = '-1000px';
                        document.body.appendChild(ghost);
                        e.dataTransfer.setDragImage(ghost, 40, 30);
                        setTimeout(function() { document.body.removeChild(ghost); }, 0);
                      }
                    },
                    onDragOver: function(e) {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = 'move';
                      if (dragIdx == null || dragIdx === idx) { setDropTarget(null); return; }
                      // Calcular si el cursor está en la mitad superior o inferior del elemento
                      var rect = e.currentTarget.getBoundingClientRect();
                      var mid = rect.top + rect.height / 2;
                      var pos = e.clientY < mid ? 'above' : 'below';
                      setDropTarget({ idx: idx, pos: pos });
                    },
                    onDragLeave: function(e) {
                      // Solo limpiar si se sale del elemento (no de un hijo)
                      if (!e.currentTarget.contains(e.relatedTarget)) setDropTarget(null);
                    },
                    onDrop: function(e) {
                      e.preventDefault();
                      setDropTarget(null);
                      if (dragIdx == null || dragIdx === idx) return;
                      var fromIdx = dragIdx;
                      var toIdx = idx;
                      // Ajustar índice según posición (arriba/abajo)
                      setModalFotos(function(prev) {
                        var next = prev.slice();
                        var item = next.splice(fromIdx, 1)[0];
                        var insertAt = toIdx;
                        // Si venía de antes, al sacar uno los índices bajan
                        if (fromIdx < toIdx) insertAt--;
                        // Si se suelta abajo, insertar después
                        if (dropTarget && dropTarget.pos === 'below') insertAt++;
                        if (insertAt < 0) insertAt = 0;
                        if (insertAt > next.length) insertAt = next.length;
                        next.splice(insertAt, 0, item);
                        return next;
                      });
                      setDragIdx(null);
                    },
                    onDragEnd: function(e) { e.currentTarget.draggable = false; setDragIdx(null); setDropTarget(null); },
                    // ── Touch events (móvil) ──
                    onTouchStart: function(e) {
                      if (!e.target.dataset.draghandle) return;
                      setDragIdx(idx);
                    },
                    onTouchMove: function(e) {
                      if (dragIdx == null) return;
                      e.preventDefault();
                      var touch = e.touches[0];
                      var el = document.elementFromPoint(touch.clientX, touch.clientY);
                      if (el) {
                        var row = el.closest('[data-fotoidx]');
                        if (row) {
                          var targetIdx = parseInt(row.dataset.fotoidx);
                          // Calcular si estamos en mitad superior o inferior para mostrar indicador
                          var rect = row.getBoundingClientRect();
                          var mid = rect.top + rect.height / 2;
                          var pos = touch.clientY < mid ? 'above' : 'below';
                          if (targetIdx !== dragIdx && !isNaN(targetIdx)) {
                            setDropTarget({ idx: targetIdx, pos: pos });
                          }
                        }
                      }
                    },
                    onTouchEnd: function() {
                      // Ejecutar el drop con el dropTarget actual
                      if (dragIdx != null && dropTarget && dropTarget.idx !== dragIdx) {
                        var fromIdx = dragIdx;
                        var toIdx = dropTarget.idx;
                        var dropPos = dropTarget.pos;
                        setModalFotos(function(prev) {
                          var next = prev.slice();
                          var item = next.splice(fromIdx, 1)[0];
                          var insertAt = toIdx;
                          if (fromIdx < toIdx) insertAt--;
                          if (dropPos === 'below') insertAt++;
                          if (insertAt < 0) insertAt = 0;
                          if (insertAt > next.length) insertAt = next.length;
                          next.splice(insertAt, 0, item);
                          return next;
                        });
                      }
                      setDragIdx(null);
                      setDropTarget(null);
                    },
                    'data-fotoidx': idx,
                    style: {
                      display: 'flex', gap: 10, alignItems: 'flex-start',
                      padding: '10px 8px', margin: '2px 0', borderRadius: 8,
                      border: isDragging ? '2px solid #1976d2' : '1px solid var(--borde)',
                      background: isDragging ? '#e3f2fd' : 'white',
                      opacity: isDragging ? 0.5 : 1,
                      transform: isDragging ? 'scale(0.97)' : 'none',
                      boxShadow: isDragging ? 'inset 0 0 0 1px #1976d2' : 'none',
                      cursor: 'default',
                      transition: 'transform 0.15s, opacity 0.15s, background 0.15s, border-color 0.15s',
                    },
                  },
                    // Handle de arrastre
                    React.createElement('div', {
                      'data-draghandle': '1',
                      onMouseDown: function(e) {
                        // Activar draggable en la fila al sostener el handle
                        var row = e.currentTarget.parentElement;
                        if (row) row.draggable = true;
                      },
                      onMouseUp: function(e) {
                        var row = e.currentTarget.parentElement;
                        if (row) row.draggable = false;
                      },
                      style: {
                        display: 'flex', flexDirection: 'column', alignItems: 'center',
                        justifyContent: 'center', width: 28, flexShrink: 0,
                        color: isDragging ? '#1976d2' : 'var(--texto-suave)',
                        fontSize: 18, cursor: 'grab',
                        userSelect: 'none', touchAction: 'none',
                        borderRight: '1px solid var(--borde)',
                        paddingRight: 6, marginRight: 2,
                      }
                    },
                      React.createElement('span', { 'data-draghandle': '1', style: { lineHeight: 1 } }, '≡'),
                      React.createElement('span', { 'data-draghandle': '1', style: {
                        fontSize: 11, fontWeight: 700, marginTop: 3,
                        color: isDragging ? '#1976d2' : 'var(--texto)',
                        background: isDragging ? '#bbdefb' : 'var(--gris-bg)',
                        borderRadius: '50%', width: 20, height: 20,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}, String(idx + 1))
                    ),
                    // Thumbnail
                    React.createElement('img', {
                      src: 'https://drive.google.com/thumbnail?id=' + foto.id + '&sz=w160',
                      alt: '', draggable: false,
                      style: {
                        width: 64, height: 64, objectFit: 'cover', borderRadius: 6,
                        flexShrink: 0, background: 'var(--gris-bg)',
                      }
                    }),
                    // Descripcion
                    React.createElement('div', { style: { flex: 1, minWidth: 0 } },
                      React.createElement('input', {
                        type: 'text',
                        value: foto.descripcion,
                        placeholder: foto.descBusy ? 'Generando...' : 'Descripcion',
                        disabled: foto.descBusy,
                        onChange: function(e) {
                          var val = e.target.value;
                          setModalFotos(function(prev) {
                            var next = prev.slice();
                            next[idx] = Object.assign({}, next[idx], { descripcion: val });
                            return next;
                          });
                        },
                        style: {
                          width: '100%', border: '1px solid var(--borde)', borderRadius: 6,
                          padding: '6px 8px', fontSize: 13, boxSizing: 'border-box',
                          fontFamily: 'inherit',
                        }
                      })
                    ),
                    // Eliminar foto
                    React.createElement('button', {
                      title: 'Quitar del registro',
                      onClick: function(e) {
                        e.stopPropagation();
                        setModalFotos(function(prev) {
                          return prev.filter(function(_, i) { return i !== idx; });
                        });
                      },
                      style: {
                        background: 'none', border: 'none', cursor: 'pointer',
                        color: '#c62828', fontSize: 18, lineHeight: 1,
                        padding: '4px 6px', flexShrink: 0, borderRadius: 4,
                      }
                    }, '✕')
                  ),
                  // ── Línea de inserción ABAJO ──
                  showLineBelow && React.createElement('div', { style: {
                    height: 3, background: '#1976d2', borderRadius: 2, margin: '0 8px',
                    boxShadow: '0 0 6px rgba(25,118,210,0.5)',
                  }})
                );
              })}
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button onClick={confirmarYGenerarRF} disabled={modalFotos.some(function(f) { return f.descBusy; })}
                className="btn-principal verde" style={{ flex: 1, margin: 0, padding: 12, fontSize: 14 }}>
                {modalFotos.some(function(f) { return f.descBusy; })
                  ? 'Generando descripciones...'
                  : 'Confirmar y generar'}
              </button>
              <button onClick={function() { setModalFotos(null); }} style={{
                background: 'var(--gris-bg)', border: 'none', borderRadius: 8,
                padding: 12, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
              }}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* Botón "Ver carpeta Drive" al final del formulario */}
      {d.linkDrive && (
        <a href={d.linkDrive} target="_blank" rel="noopener noreferrer" style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          marginTop: 16, padding: '14px 16px',
          background: 'var(--gris-bg)', color: 'var(--texto)',
          border: '1.5px solid var(--borde-med)',
          borderRadius: 12, fontFamily: 'inherit', fontSize: 14, fontWeight: 600,
          textDecoration: 'none', cursor: 'pointer',
        }}>
          📂 Ver carpeta Drive de la visita
        </a>
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
  const [cola, setCola]         = useStateNV([]);   // archivos pendientes de subir
  const [progreso, setProgreso] = useStateNV('');   // "Subiendo 2/5..."
  const inputRef = React.useRef(null);

  async function _aBase64(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload  = () => resolve((r.result || '').toString().split(',')[1] || '');
      r.onerror = () => reject(new Error('No se pudo leer la foto'));
      r.readAsDataURL(file);
    });
  }

  function alSeleccionar(e) {
    const archivos = Array.from(e.target.files || []);
    if (!archivos.length) return;
    // Filtrar por tamano
    const validos = archivos.filter(function(f) { return f.size <= 8 * 1024 * 1024; });
    const rechazados = archivos.length - validos.length;
    if (rechazados > 0) {
      appAlert(rechazados + ' foto(s) superan 8MB y fueron excluidas.', { titulo: 'Fotos grandes' });
    }
    if (validos.length === 0) return;
    setCola(validos);
    // Reset input para poder seleccionar los mismos archivos de nuevo
    if (inputRef.current) inputRef.current.value = '';
  }

  // Subir cola secuencialmente cuando cambie
  React.useEffect(function() {
    if (cola.length === 0 || subiendo) return;
    var cancelado = false;
    async function subirTodos() {
      setSubiendo(true);
      for (var i = 0; i < cola.length; i++) {
        if (cancelado) break;
        setProgreso('Subiendo ' + (i + 1) + '/' + cola.length + '...');
        try {
          var base64 = await _aBase64(cola[i]);
          var r = await subirFotoConDescripcion(idCarpetaFotos, base64, cola[i].type, '', cola[i].name);
          setFotos(function(prev) {
            return prev.concat([{
              nombre: r.nombre || cola[i].name,
              link:   r.link,
              descripcion: r.descripcion || '',
              pendiente: !!r.encolado,  // sin red: foto pendiente de subir a Drive
            }]);
          });
        } catch (err) {
          console.warn('Error subiendo foto:', err);
        }
      }
      setCola([]);
      setProgreso('');
      setSubiendo(false);
    }
    subirTodos();
    return function() { cancelado = true; };
  }, [cola]);

  return (
    <div className="form-seccion" style={{ marginTop: 14 }}>
      <span className="form-seccion-titulo titulo-azul">Registro fotografico</span>
      <div style={{ marginTop: 12 }}>
        {linkDrive && (
          <div style={{ marginBottom: 12 }}>
            <a href={linkDrive} target="_blank" rel="noopener" style={{
              fontSize: 12, color: 'var(--brand-accent)', textDecoration: 'none',
            }}>Abrir carpeta Drive de la visita</a>
          </div>
        )}

        <label style={{
          display: 'block', padding: 14, border: '1.5px dashed var(--borde-med)',
          borderRadius: 10, textAlign: 'center', cursor: subiendo ? 'wait' : 'pointer',
          background: 'var(--gris-bg)', fontSize: 13, color: 'var(--texto-suave)',
          opacity: subiendo ? 0.5 : 1,
        }}>
          {subiendo ? progreso : 'Toca para seleccionar fotos'}
          <input ref={inputRef} type="file" accept="image/*" multiple
            onChange={alSeleccionar} disabled={subiendo} style={{ display: 'none' }} />
        </label>

        {fotos.length > 0 && (
          <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--texto-suave)', marginBottom: 2 }}>
              {fotos.length} foto(s) subida(s)
            </div>
            {fotos.map((f, i) => (
              <div key={i} style={{
                padding: '8px 12px',
                background: f.pendiente ? '#fff7ed' : 'var(--gris-bg)',
                border: f.pendiente ? '1px dashed #fb923c' : 'none',
                borderRadius: 8, fontSize: 12,
              }}>
                <div style={{ fontWeight: 600 }}>
                  {f.pendiente && <span title="Pendiente de subir a Drive" style={{ marginRight: 6, color: '#fb923c' }}>↑</span>}
                  {f.nombre}
                  {f.pendiente && <span style={{ marginLeft: 6, fontSize: 10, color: '#9a3412', fontWeight: 400 }}>· pendiente</span>}
                </div>
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
