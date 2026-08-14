// ═══════════════════════════════════════════════════════════════
// utils.js — Utilidades compartidas: fechas, días hábiles, festivos CO
// Cargado antes de cualquier JSX.
// ═══════════════════════════════════════════════════════════════

// ── Formatear cualquier fecha a DD/MM/AAAA ────────────────────
// Acepta: ISO (2025-06-15T05:00:00.000Z), YYYY-MM-DD, DD/MM/YYYY,
//         DD/MM/YYYY · hora, Date objects, vacío/null.
function formatearFecha(valor) {
  if (!valor) return '';
  if (valor instanceof Date) {
    if (isNaN(valor.getTime())) return '';
    return _padFecha(valor.getDate(), valor.getMonth() + 1, valor.getFullYear());
  }
  var s = String(valor).trim();
  if (!s) return '';
  // Quitar parte de hora si viene con separador " · "
  s = s.split(' · ')[0].trim();
  // Formato DD/MM/YYYY (ya correcto, solo validar)
  var m1 = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s);
  if (m1) return _padFecha(+m1[1], +m1[2], +m1[3]);
  // Formato YYYY-MM-DD o ISO completo
  var m2 = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m2) return _padFecha(+m2[3], +m2[2], +m2[1]);
  // Intentar con Date nativo
  var d = new Date(s);
  if (!isNaN(d.getTime())) return _padFecha(d.getDate(), d.getMonth() + 1, d.getFullYear());
  return s; // devolver tal cual si no se pudo parsear
}

function _padFecha(dia, mes, anio) {
  return String(dia).padStart(2, '0') + '/' + String(mes).padStart(2, '0') + '/' + anio;
}

// ── Parsear fecha a Date (sin hora, medianoche local) ─────────
function parsearFecha(valor) {
  if (!valor) return null;
  if (valor instanceof Date) return isNaN(valor.getTime()) ? null : valor;
  var s = String(valor).trim().split(' · ')[0].trim();
  var m1 = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s);
  if (m1) {
    var dd = +m1[1], mm = +m1[2], aa = +m1[3];
    var dt1 = new Date(aa, mm - 1, dd);
    // new Date() normaliza desbordes (31/02 → 3 de marzo) en vez de fallar;
    // si el resultado no coincide con lo pedido, la fecha no era real.
    if (dt1.getFullYear() !== aa || dt1.getMonth() !== mm - 1 || dt1.getDate() !== dd) return null;
    return dt1;
  }
  var m2 = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m2) return new Date(+m2[1], +m2[2] - 1, +m2[3]);
  var d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

// ── Festivos colombianos 2025-2026 (Ley Emiliani) ────────────
// Festivos fijos + movibles calculados.
// Ley 51/1983: ciertos festivos se trasladan al lunes siguiente.
function _festivosColombia(anio) {
  var fijos = [
    [0, 1],   // 1 ene — Año nuevo
    [4, 1],   // 1 may — Día del trabajo
    [6, 20],  // 20 jul — Independencia
    [7, 7],   // 7 ago — Batalla de Boyacá
    [11, 8],  // 8 dic — Inmaculada Concepción
    [11, 25], // 25 dic — Navidad
  ];
  // Festivos que se mueven al lunes (Ley Emiliani)
  var emiliani = [
    [0, 6],   // 6 ene — Reyes Magos
    [2, 19],  // 19 mar — San José
    [5, 29],  // 29 jun — San Pedro y San Pablo
    [7, 15],  // 15 ago — Asunción
    [9, 12],  // 12 oct — Día de la Raza
    [10, 1],  // 1 nov — Todos los Santos
    [10, 11], // 11 nov — Independencia de Cartagena
  ];

  var festivos = [];

  // Agregar fijos (no se mueven)
  fijos.forEach(function(f) { festivos.push(new Date(anio, f[0], f[1])); });

  // Agregar Emiliani (se mueven al lunes siguiente si no caen lunes)
  emiliani.forEach(function(f) {
    var d = new Date(anio, f[0], f[1]);
    var dia = d.getDay(); // 0=dom, 1=lun, ... 6=sab
    if (dia === 1) { festivos.push(d); return; } // ya es lunes
    // Mover al siguiente lunes
    var offset = dia === 0 ? 1 : (8 - dia);
    festivos.push(new Date(anio, f[0], f[1] + offset));
  });

  // Festivos basados en Pascua (movibles por definición)
  var pascua = _calcularPascua(anio);
  // Jueves Santo: Pascua - 3
  festivos.push(new Date(pascua.getTime() - 3 * 86400000));
  // Viernes Santo: Pascua - 2
  festivos.push(new Date(pascua.getTime() - 2 * 86400000));
  // Ascensión: Pascua + 43 días (se mueve al lunes)
  var ascension = new Date(pascua.getTime() + 43 * 86400000);
  festivos.push(_alLunes(ascension));
  // Corpus Christi: Pascua + 64 días (se mueve al lunes)
  var corpus = new Date(pascua.getTime() + 64 * 86400000);
  festivos.push(_alLunes(corpus));
  // Sagrado Corazón: Pascua + 71 días (se mueve al lunes)
  var sagrado = new Date(pascua.getTime() + 71 * 86400000);
  festivos.push(_alLunes(sagrado));

  return festivos;
}

// Mover una fecha al lunes siguiente (si no es lunes)
function _alLunes(d) {
  var dia = d.getDay();
  if (dia === 1) return d;
  var offset = dia === 0 ? 1 : (8 - dia);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + offset);
}

// Algoritmo de Gauss para Pascua
function _calcularPascua(anio) {
  var a = anio % 19;
  var b = Math.floor(anio / 100);
  var c = anio % 100;
  var d = Math.floor(b / 4);
  var e = b % 4;
  var f = Math.floor((b + 8) / 25);
  var g = Math.floor((b - f + 1) / 3);
  var h = (19 * a + b - d - g + 15) % 30;
  var i = Math.floor(c / 4);
  var k = c % 4;
  var l = (32 + 2 * e + 2 * i - h - k) % 7;
  var m = Math.floor((a + 11 * h + 22 * l) / 451);
  var mes = Math.floor((h + l - 7 * m + 114) / 31);
  var dia = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(anio, mes - 1, dia);
}

// Cache de festivos por año
var _cacheFestivos = {};
function _getFestivos(anio) {
  if (!_cacheFestivos[anio]) {
    _cacheFestivos[anio] = _festivosColombia(anio);
  }
  return _cacheFestivos[anio];
}

// ── ¿Es día hábil? ───────────────────────────────────────────
function esDiaHabil(fecha) {
  if (!fecha) return false;
  var d = fecha instanceof Date ? fecha : parsearFecha(fecha);
  if (!d) return false;
  var dia = d.getDay();
  if (dia === 0 || dia === 6) return false; // sáb, dom
  // Verificar festivos
  var festivos = _getFestivos(d.getFullYear());
  var ts = d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
  return !festivos.some(function(f) {
    return f.getFullYear() * 10000 + (f.getMonth() + 1) * 100 + f.getDate() === ts;
  });
}

// ── Días hábiles desde hoy hasta una fecha ────────────────────
// Positivo = la fecha está en el futuro, negativo = en el pasado.
function diasHabilesHasta(fechaTarget) {
  var target = fechaTarget instanceof Date ? fechaTarget : parsearFecha(fechaTarget);
  if (!target) return null;
  var hoy = new Date();
  hoy = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  target = new Date(target.getFullYear(), target.getMonth(), target.getDate());

  if (hoy.getTime() === target.getTime()) return 0;
  var futuro = target > hoy;
  var inicio = futuro ? hoy : target;
  var fin = futuro ? target : hoy;
  var count = 0;
  var cursor = new Date(inicio.getTime() + 86400000); // día siguiente
  while (cursor <= fin) {
    if (esDiaHabil(cursor)) count++;
    cursor = new Date(cursor.getTime() + 86400000);
  }
  return futuro ? count : -count;
}

// ── Días calendario desde una fecha hasta hoy ─────────────────
function diasDesde(fecha) {
  var d = fecha instanceof Date ? fecha : parsearFecha(fecha);
  if (!d) return null;
  var hoy = new Date();
  hoy = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  d = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.floor((hoy - d) / 86400000);
}

// ── Hoy en DD/MM/AAAA ────────────────────────────────────────
function hoyDDMMAAAA() {
  var d = new Date();
  return _padFecha(d.getDate(), d.getMonth() + 1, d.getFullYear());
}

// ── VISITADOR(ES): lectura tolerante a mayúsculas + separador unificado ──
// Encabezado case-insensitive (evita fallo silencioso si alguien retitula
// la columna en el Sheet, ej. "Visitador(es)"); conserva el fallback
// posicional [17] para respuestas que no traen el nombre de columna.
function visitadoresBD(fila) {
  if (!fila) return '';
  if (fila['VISITADOR(ES)'] != null && fila['VISITADOR(ES)'] !== '') return String(fila['VISITADOR(ES)']);
  var clave = Object.keys(fila).find(function(k) { return k.toUpperCase() === 'VISITADOR(ES)'; });
  if (clave && fila[clave] != null && fila[clave] !== '') return String(fila[clave]);
  return String(fila[17] || '');
}

// Primer visitador (= diligenciador) de una lista separada por "/" o ","
function primerVisitador(visitadores) {
  return String(visitadores || '').split(/\s*[\/,]\s*/)[0].trim();
}

// Extrae el ID de carpeta Drive desde un link "https://drive.google.com/.../folders/<id>..."
// Antes duplicada de forma idéntica en informe-modal.jsx y buscar.jsx: al concatenar
// el bundle, la segunda declaración pisaba silenciosamente a la primera (mismo scope global).
function extraerIdCarpetaDrive(link) {
  if (!link) return '';
  var m = String(link).match(/folders\/([a-zA-Z0-9_-]+)/);
  return m ? m[1] : '';
}

// Exportar al scope global (navegador) o CommonJS (Node, tests)
var _cuUtilsExports = {
  formatearFecha: formatearFecha,
  parsearFecha: parsearFecha,
  esDiaHabil: esDiaHabil,
  diasHabilesHasta: diasHabilesHasta,
  diasDesde: diasDesde,
  hoyDDMMAAAA: hoyDDMMAAAA,
  visitadoresBD: visitadoresBD,
  primerVisitador: primerVisitador,
  extraerIdCarpetaDrive: extraerIdCarpetaDrive,
  // expuestas para pruebas unitarias (auditoría 2026-07, QA#3/MP7)
  _festivosColombia: _festivosColombia,
  _calcularPascua: _calcularPascua,
  _alLunes: _alLunes,
};
if (typeof window !== 'undefined') {
  Object.assign(window, _cuUtilsExports);
} else if (typeof module !== 'undefined' && module.exports) {
  module.exports = _cuUtilsExports;
}
