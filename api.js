// ═══════════════════════════════════════════════════════════════
// v6/api.js — Cliente del webhook unificado (sin React)
// Reglas:
//   - GETs simples para lecturas
//   - POSTs siempre con Content-Type: text/plain (evita CORS preflight)
//   - Devuelve siempre { ok, ... } o lanza Error
// ═══════════════════════════════════════════════════════════════

const CFG = {
  webhook: 'https://script.google.com/macros/s/AKfycbzKgiwc4AWAvNMMYWwU2Q0ir1V6R9GVbjQo7w2W4AowU9--0_IdJc6dSH8enBil54jr3w/exec',
  hoja:    'BD VISITAS',
};

// ── Hashing PIN (igual que app.js: SHA-256 hex) ────────────────
async function hashPin(pin) {
  const enc = new TextEncoder().encode(String(pin));
  const buf = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ── GET con accion ─────────────────────────────────────────────
async function gasGet(params) {
  const qs = new URLSearchParams(params).toString();
  const r = await fetch(CFG.webhook + '?' + qs);
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const d = await r.json();
  if (!d.ok) throw new Error(d.error || 'Apps Script error');
  return d;
}

// ── POST text/plain (sin preflight) ────────────────────────────
async function gasPost(payload) {
  const r = await fetch(CFG.webhook, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
    body: JSON.stringify(payload),
  });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const d = await r.json();
  if (!d.ok) throw new Error(d.error || 'Apps Script error');
  return d;
}

// ── Leer hoja → array de filas crudas ──────────────────────────
async function leerHoja(nombreHoja) {
  const d = await gasGet({ accion: 'leerHoja', hoja: nombreHoja });
  return d.values || [];
}

// ── CACHÉ en memoria con TTL ───────────────────────────────────
// Evita refetch innecesario al cambiar de pantalla (Home ↔ Buscar) y al
// abrir el wizard de informe. Vive en memoria de la pestaña: se borra
// al recargar y al cerrar sesión. Mutaciones (admin) invalidan la key
// correspondiente; el botón "Recargar" pasa { forzar: true }.
const CACHE_TTL_MS = 60 * 1000; // 60 segundos
const CACHE = {
  visitas:     { data: null, expiraEn: 0 },
  inspectores: { data: null, expiraEn: 0 },
};
function _cacheGet(key) {
  const c = CACHE[key];
  if (c && c.data && Date.now() < c.expiraEn) return c.data;
  return null;
}
function _cacheSet(key, data) {
  CACHE[key] = { data, expiraEn: Date.now() + CACHE_TTL_MS };
}
function invalidarCache(key) {
  if (key) { CACHE[key] = { data: null, expiraEn: 0 }; return; }
  Object.keys(CACHE).forEach(k => { CACHE[k] = { data: null, expiraEn: 0 }; });
}

// ── Leer BD VISITAS con headers → datos[{header:val, _idx}] ────
// Por defecto usa caché (TTL 60s). Pase { forzar:true } para refetch.
async function leerVisitas(opts) {
  const forzar = !!(opts && opts.forzar);
  if (!forzar) {
    const hit = _cacheGet('visitas');
    if (hit) return hit;
  }
  const filas = await leerHoja(CFG.hoja);
  if (!filas.length) {
    const vacio = { headers: [], datos: [] };
    _cacheSet('visitas', vacio);
    return vacio;
  }
  const headers = filas[0];
  const datos = filas.slice(1)
    .map((fila, i) => {
      const obj = { _idx: i + 2 };
      headers.forEach((h, j) => {
        const val = (fila[j] !== undefined && fila[j] !== null) ? fila[j].toString().trim() : '';
        obj[(h || '').toString().trim()] = val;
        obj[j] = val;
      });
      return obj;
    })
    .filter(o => o['RADICADO'] && o['RADICADO'].trim() !== '');
  const result = { headers, datos };
  _cacheSet('visitas', result);
  return result;
}

// ── Normalizar estado (igual que app.js) ───────────────────────
function normalizarEstado(s) {
  return (s || '').toString().toUpperCase().replace(/[ÁÀÄ]/g, 'A').replace(/[ÉÈË]/g, 'E')
    .replace(/[ÍÌÏ]/g, 'I').replace(/[ÓÒÖ]/g, 'O').replace(/[ÚÙÜ]/g, 'U').trim();
}

// ── LOGIN (server-side) ────────────────────────────────────────
// El cliente nunca ve la tabla USUARIOS. Envía el hash y recibe solo
// los campos públicos del usuario verificado.
async function login(nombre, pin) {
  const pinHash = await hashPin(pin);
  try {
    const d = await gasPost({ accion: 'login', nombre, hash: pinHash });
    if (!d || !d.ok) return null;
    return {
      usuario: d.usuario,
      cargo:   d.cargo || 'Inspector',
      rol:     (d.rol || 'INSPECTOR').toUpperCase(),
      hash:    pinHash,  // se conserva para reusar en llamadas admin
    };
  } catch (e) {
    return null;
  }
}

// ── Inspectores activos (público, para combo del login) ────────
// El backend devuelve solo {nombre, cargo, rol} — sin hashes.
// Cacheado en memoria (TTL 60s). { forzar:true } para refetch.
async function listarInspectoresActivos(opts) {
  const forzar = !!(opts && opts.forzar);
  if (!forzar) {
    const hit = _cacheGet('inspectores');
    if (hit) return hit;
  }
  const d = await gasGet({ accion: 'listarInspectoresActivos' });
  const lista = d.inspectores || [];
  _cacheSet('inspectores', lista);
  return lista;
}

// ── ADMIN: usuarios completos ──────────────────────────────────
// Requiere credenciales admin (nombre + hash) que el backend valida.
async function listarUsuariosAdmin() {
  const s = SESSION.leer();
  if (!s || !s.hash) throw new Error('Sesión inválida');
  const d = await gasPost({ accion: 'listarUsuariosAdmin', usuario: s.usuario, hash: s.hash });
  return d.usuarios || [];
}

async function toggleActivo(fila, nuevoEstado) {
  const r = await gasGet({ accion: 'toggleActivo', fila, estado: nuevoEstado });
  // Activar/desactivar cambia la lista pública de inspectores: invalidamos.
  invalidarCache('inspectores');
  return r;
}

async function resetPin(fila, pin) {
  const pinHash = await hashPin(pin);
  // No invalida visitas ni inspectores — el cambio de PIN no afecta sus listas.
  return gasGet({ accion: 'resetPin', fila, hash: pinHash });
}

async function registrarLog(usuario, texto) {
  const fecha = new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' });
  try {
    await gasGet({ accion: 'log', usuario, accion_texto: texto, fecha });
  } catch (e) { /* silencioso, igual que app.js */ }
}

// ── Solicitud Vigilancia Policía (solo visitas con orden de suspensión) ──
// Llama al webhook para generar el oficio desde la plantilla, guardarlo
// en la carpeta de la visita y registrar el link en BD (LINK_SOLICITUD_VIGILANCIA).
// Retorna { ok, linkDoc, docId, yaExistia? }
async function generarSolicitudVigilancia(params) {
  const r = await gasPost(Object.assign({ accion: 'generarSolicitudVigilancia' }, params));
  // El link cambia en BD: invalidamos caché de visitas para que el siguiente fetch lo traiga.
  invalidarCache('visitas');
  return r;
}

// ── NUEVA VISITA ───────────────────────────────────────────────
// Geocoding (forward o reverse) — la API key vive en Apps Script.
async function geocodeDireccion(query) {
  // query puede ser "Cl 50 # 32-10, Bello" o "lat,lng"
  const params = /^-?\d+\.\d+,\s*-?\d+\.\d+$/.test(query)
    ? { accion: 'geocode', latlng: query.replace(/\s+/g, '') }
    : { accion: 'geocode', address: query };
  return gasGet(params);
}

// Crea carpeta de la visita en Drive y devuelve { linkCarpeta, idFotos }.
async function crearCarpetaVisita(comuna, direccion, fechaVisita, nvisita) {
  return gasGet({
    accion: 'crearCarpeta',
    comuna,
    direccion,
    fecha: fechaVisita,
    nvisita: nvisita || 1,
  });
}

// Recupera el id de la subcarpeta de fotos a partir de la carpeta de visita.
// Necesario al reabrir una visita INICIADA: la BD solo guarda LINK_DRIVE
// (carpeta visita), no la subcarpeta de fotos.
async function obtenerIdFotos(idCarpetaVisita) {
  if (!idCarpetaVisita) return '';
  try {
    const r = await gasGet({ accion: 'obtenerIdFotos', idCarpeta: idCarpetaVisita });
    return (r && r.idFotos) || '';
  } catch (e) { return ''; }
}

// Guarda una visita. Si pasa filaExistente actualiza; si no, agrega.
// payload.valores es el array de 60 valores (cols B → BD) ya armado.
async function guardarVisita(payload) {
  const accion = payload.fila ? 'actualizar' : 'agregar';
  const body = { accion, valores: payload.valores };
  if (payload.fila) body.fila = payload.fila;
  const d = await gasPost(body);
  invalidarCache('visitas');
  return d;
}

// Mejora un texto con IA (claude/deepseek) vía webhook.
async function mejorarTexto(texto) {
  const d = await gasPost({ accion: 'mejorarTexto', texto });
  return d.texto || '';
}

// El flujo F-GGO-46 son DOS pasos independientes (igual que producción):
//   1. gasPost({ accion: 'generarActa',           ...datos })  → Sheet caracterización
//   2. gasPost({ accion: 'generarRegistroFotos',  ...datos })  → Doc registro fotos
// El componente NuevaVisitaScreen los llama directo desde dos botones distintos.
// No envolvemos en un wrapper consolidado para preservar la separación.

// Sube una foto a la subcarpeta Fotos de la visita.
async function subirFotoConDescripcion(idCarpetaFotos, base64, mime, descripcion) {
  return gasPost({
    accion: 'subirFoto',
    idCarpeta: idCarpetaFotos,
    base64,
    mime,
    descripcion: descripcion || '',
  });
}

// Genera descripción de una foto con Gemini (vía webhook).
async function describirFotoConIA(base64, mime) {
  const d = await gasPost({ accion: 'describirFoto', base64, mime });
  return d.descripcion || '';
}

// ── Consulta POT (100% cliente, igual que producción V2) ───────────
// Cruza un punto (lat,lon) contra los GeoJSONs publicados en GitHub
// `controlurbano9/pot-bello/main/*.geojson` usando turf.js (cargado
// vía CDN en VERSION_6_REACT.html). El backend NO interviene.
// Devuelve { poligono, sueloProt, amenaza, barrioSugerido, enRetiro }.
// Campos vacíos / false cuando no se detecta.
const POT_BASE = 'https://raw.githubusercontent.com/controlurbano9/pot-bello/main/';
const POT_CACHE = {};

async function _cargarGeoJSON(nombre) {
  if (POT_CACHE[nombre]) return POT_CACHE[nombre];
  try {
    const r = await fetch(POT_BASE + nombre);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const data = await r.json();
    POT_CACHE[nombre] = data;
    return data;
  } catch (e) {
    console.warn('[POT] cargando ' + nombre, e.message);
    return null;
  }
}

async function consultarPOT(lat, lon) {
  if (typeof turf === 'undefined') {
    throw new Error('turf.js no cargado — verifica VERSION_6_REACT.html');
  }
  const punto = turf.point([Number(lon), Number(lat)]);
  const [usoSuelo, sueloProtec, amenazas, barrios, veredas, retiros] = await Promise.all([
    _cargarGeoJSON('UsoGeneralSuelo.geojson'),
    _cargarGeoJSON('SueloProteccion.geojson'),
    _cargarGeoJSON('AmenazasNaturales.geojson'),
    _cargarGeoJSON('Barrios.geojson'),
    _cargarGeoJSON('Veredas.geojson'),
    _cargarGeoJSON('RetirosCorrientesHidricas.geojson')
      .catch(() => _cargarGeoJSON('Retiros_Corrientes_Hidricas.geojson'))
      .catch(() => _cargarGeoJSON('RetiroQuebradas.geojson'))
      .catch(() => null),
  ]);

  const result = { poligono: '', sueloProt: 'NO', sueloProtCategoria: '', amenaza: 'NO', amenazaTipo: '', amenazaCategoria: '', barrioSugerido: '', enRetiro: 'NO', clasificacion: '', tratamiento: '', intensidad: '', comuna: '', enDRMI: 'NO', drmiNombre: '' };

  // 1. Polígono uso del suelo
  if (usoSuelo) {
    for (const feat of usoSuelo.features) {
      try {
        if (turf.booleanPointInPolygon(punto, feat)) {
          const p = feat.properties || {};
          result.poligono = p.CATEG_1 || p.Categ_1 || p.categ_1 ||
                            p.CODIGO  || p.USO    || p.SIMBOLO ||
                            p.CLASIFICA ||
                            Object.values(p).find(v => v && typeof v === 'string' && v.length < 20) || '';
          break;
        }
      } catch (e) {}
    }
  }

  // 2. Suelo de protección (categoría: ZCA, ZPA, ZIM, ZPM, ZPAP, etc.)
  if (sueloProtec) {
    for (const feat of sueloProtec.features) {
      try {
        if (turf.booleanPointInPolygon(punto, feat)) {
          var pSP = feat.properties || {};
          result.sueloProt = 'SI';
          result.sueloProtCategoria = pSP.CATEGORIA || pSP.categoria ||
            pSP.Tipo_Suelo_Proteccion || pSP.Nmg || pSP.NMG || '';
          break;
        }
      } catch (e) {}
    }
  }

  // 3. Amenaza (polígonos con tipo: Fenomeno + Categoria_Amenaza)
  if (amenazas) {
    for (const feat of amenazas.features) {
      try {
        var dentro = false;
        if (feat.geometry.type === 'Point') {
          dentro = turf.distance(punto, turf.point(feat.geometry.coordinates)) < 0.05;
        } else {
          dentro = turf.booleanPointInPolygon(punto, feat);
        }
        if (dentro) {
          var pA = feat.properties || {};
          result.amenaza          = 'SI';
          result.amenazaTipo      = pA.Fenomeno || pA.FENOMENO || pA.fenomeno || pA.CATEGORIA || pA.categoria || '';
          result.amenazaCategoria = pA.Categoria_Amenaza || pA.categoria_amenaza || pA.CATEGORIA_AMENAZA || '';
          break;
        }
      } catch (e) {}
    }
  }

  // 4. Barrio o vereda (texto crudo del GeoJSON — el frontend hace match contra el select)
  if (barrios) {
    for (const feat of barrios.features) {
      try {
        if (turf.booleanPointInPolygon(punto, feat)) {
          const p = feat.properties || {};
          result.barrioSugerido = p.NOM_BARRIO || p.nom_barrio ||
                                  p.NOMBRE || p.nombre ||
                                  p.BARRIO || p.barrio ||
                                  p.NAME   || p.name   ||
                                  p.NOMB_BARRI || p.nomb_barri || '';
          break;
        }
      } catch (e) {}
    }
  }
  if (!result.barrioSugerido && veredas) {
    for (const feat of veredas.features) {
      try {
        if (turf.booleanPointInPolygon(punto, feat)) {
          const p = feat.properties || {};
          result.barrioSugerido = p.NOMBRE || p.nombre || '';
          break;
        }
      } catch (e) {}
    }
  }

  // 5. Retiro corrientes hídricas (polígono o línea con buffer 30m)
  if (retiros) {
    for (const feat of retiros.features) {
      try {
        const t = feat.geometry.type;
        if (t === 'Polygon' || t === 'MultiPolygon') {
          if (turf.booleanPointInPolygon(punto, feat)) { result.enRetiro = 'SI'; break; }
        } else if (t === 'LineString' || t === 'MultiLineString') {
          const linea = turf.feature(feat.geometry);
          if (turf.pointToLineDistance(punto, linea, { units: 'meters' }) < 30) {
            result.enRetiro = 'SI'; break;
          }
        }
      } catch (e) {}
    }
  }

  // 6. Clasificación del suelo (urbano / rural / expansión) + tratamiento + densidad + comuna + DRMI
  const [clasifSuelo, tratUrb, franjaInt, comunas, drmi] = await Promise.all([
    _cargarGeoJSON('ClasificacionSueloMunicipal.geojson')
      .catch(() => _cargarGeoJSON('ClasificacionSuelo.geojson'))
      .catch(() => null),
    _cargarGeoJSON('TratamientoUrbanistico.geojson').catch(() => null),
    // Capa de densidad: primero Densidades.geojson (3651 features detalladas
    // con índices de ocupación) y fallback al FranjaIntensidad.geojson viejo
    // (DensidadesUrbanas, 12 macro-grupos)
    _cargarGeoJSON('Densidades.geojson')
      .catch(() => _cargarGeoJSON('FranjaIntensidad.geojson'))
      .catch(() => null),
    _cargarGeoJSON('Comunas.geojson').catch(() => null),
    _cargarGeoJSON('DRMI_Quitasol_LaHolanda.geojson').catch(() => null),
  ]);

  // 6d. DRMI Quitasol-La Holanda (Corantioquia, 1 polígono)
  if (drmi) {
    for (const feat of drmi.features) {
      try {
        if (turf.booleanPointInPolygon(punto, feat)) {
          var pD = feat.properties || {};
          result.enDRMI = 'SI';
          result.drmiNombre = pD.NOMBRE || pD.nombre || pD.CATEGORIA || 'DRMI Quitasol-La Holanda';
          break;
        }
      } catch (e) {}
    }
  }

  // 6c. Comuna (point-in-polygon contra Comunas.geojson)
  if (comunas) {
    for (const feat of comunas.features) {
      try {
        if (turf.booleanPointInPolygon(punto, feat)) {
          const p = feat.properties || {};
          // Preferir CODIGO_COM ('06') sobre Nombre ('COMUNA 6') porque el resto del sistema usa el código
          var cod = p.CODIGO_COM || p.codigo_com || p.CODIGO || p.codigo || '';
          var nom = p.Nombre || p.NOMBRE || p.nombre || '';
          if (cod) {
            // Quitar ceros a la izquierda: '06' → '6'
            result.comuna = String(cod).replace(/^0+/, '') || cod;
          } else if (nom) {
            // Si solo hay nombre tipo 'COMUNA 6', extraer el número
            var m = String(nom).match(/(\d+)/);
            result.comuna = m ? m[1] : nom;
          }
          result.comunaNombre = nom;
          break;
        }
      } catch (e) {}
    }
  }

  if (clasifSuelo) {
    for (const feat of clasifSuelo.features) {
      try {
        if (turf.booleanPointInPolygon(punto, feat)) {
          const p = feat.properties || {};
          result.clasificacion = p.CLASE || p.clase || p.CLASIFICAC || p.clasificac ||
            p.TIPO || p.tipo || p.NOMBRE || p.nombre || p.MOMBRE || '';
          break;
        }
      } catch (e) {}
    }
  }

  // 7. Tratamiento urbanístico (urbano + rural fusionados en TratamientoUrbanistico.geojson)
  //    Atributos del export: TRATAMIENTO, TIPO, CODIGO_TRAT, COMUNA, AMBITO ('Urbano'|'Rural')
  if (tratUrb) {
    for (const feat of tratUrb.features) {
      try {
        if (turf.booleanPointInPolygon(punto, feat)) {
          const p = feat.properties || {};
          result.tratamiento = p.TRATAMIENTO || p.tratamiento || p.TRATAMIENT ||
            p.tratamient || p.NOMBRE || p.nombre || p.DESCRIPCION || p.descripcion ||
            p.TIPO || p.tipo || '';
          result.tratamientoTipo = p.TIPO || p.tipo || p.Tipo_Tratamiento_Urbanistico || '';
          result.tratamientoCodigo = p.CODIGO_TRAT || p.Codigo_Tratamiento || '';
          result.tratamientoAmbito = p.AMBITO || p.ambito || '';
          break;
        }
      } catch (e) {}
    }
  }

  // 8. Densidades / Franja de intensidad
  //    Densidades.geojson (3651 features) usa atributo Layer = "DENSIDAD ALTA/MEDIA/BAJA"
  //    FranjaIntensidad.geojson (legado) usa NMG + Densidad_Vivha
  if (franjaInt) {
    for (const feat of franjaInt.features) {
      try {
        if (turf.booleanPointInPolygon(punto, feat)) {
          const p = feat.properties || {};
          var nombre = p.Layer || p.LAYER || p.NMG || p.nmg || p.FRANJA || p.franja || p.INTENSIDAD ||
            p.intensidad || p.NOMBRE || p.nombre || '';
          var dens = p.Densidad_Vivha != null ? p.Densidad_Vivha
                   : (p.DENSIDAD_VIVHA != null ? p.DENSIDAD_VIVHA : null);
          result.intensidad = nombre + (dens != null ? ' (' + dens + ' viv/ha)' : '');
          result.intensidadNombre = nombre;
          result.intensidadDensidad = dens;
          break;
        }
      } catch (e) {}
    }
  }

  return result;
}

async function leerLogAuditoria() {
  const s = SESSION.leer();
  if (!s || !s.hash) throw new Error('Sesión inválida');
  const d = await gasPost({ accion: 'leerLogAuditoria', usuario: s.usuario, hash: s.hash });
  return d.values || [];
}

// ── Sesión (localStorage) — mismas keys que app.js para coexistir.
// El hash se conserva en memoria de la pestaña (sessionStorage) para
// reusarlo en llamadas admin sin volver a pedir el PIN. NO se guarda
// en localStorage para que cierre con la pestaña.
const SESSION = {
  guardar(s) {
    const expira = Date.now() + 4 * 60 * 60 * 1000;
    localStorage.setItem('cu_usuario', s.usuario);
    localStorage.setItem('cu_cargo', s.cargo);
    localStorage.setItem('cu_rol', s.rol);
    localStorage.setItem('cu_sesion_expira', expira.toString());
    if (s.hash) sessionStorage.setItem('cu_hash', s.hash);
  },
  leer() {
    const expira = parseInt(localStorage.getItem('cu_sesion_expira') || '0', 10);
    if (!expira || Date.now() > expira) return null;
    return {
      usuario: localStorage.getItem('cu_usuario'),
      cargo:   localStorage.getItem('cu_cargo'),
      rol:     localStorage.getItem('cu_rol'),
      hash:    sessionStorage.getItem('cu_hash') || '',
    };
  },
  borrar() {
    ['cu_usuario', 'cu_cargo', 'cu_rol', 'cu_sesion_expira'].forEach(k => localStorage.removeItem(k));
    sessionStorage.removeItem('cu_hash');
    // Higiene: el caché de datos del usuario actual no debe vivir a la sesión.
    invalidarCache();
  },
};

// ── CATASTRO — búsqueda por GPS ───────────────────────────────
// catastro.json: array de [lat, lon, ficha, catastral_sin_05088, direccion]
// Estructura del JSON:
//   { p: [[tcod, lat_min, lon_min, lat_max, lon_max, [[lat,lon],...]], ...],
//     f: { tcod: [[ficha, npn_sufijo, direccion], ...] } }
// Búsqueda: filtro por bbox (rápido) + point-in-polygon estricto con turf.
let _catastroData = null;
let _catastroLoading = null;

async function _cargarCatastro() {
  if (_catastroData) return _catastroData;
  if (_catastroLoading) return _catastroLoading;
  _catastroLoading = fetch('catastro.json').then(r => {
    if (!r.ok) throw new Error('No se pudo cargar catastro.json');
    return r.json();
  }).then(data => { _catastroData = data; _catastroLoading = null; return data; });
  return _catastroLoading;
}

// Point-in-polygon ray casting (sin dependencias).
// poly: [[lat,lon], [lat,lon], ...]
function _pointInPolygon(lat, lon, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const lat_i = poly[i][0], lon_i = poly[i][1];
    const lat_j = poly[j][0], lon_j = poly[j][1];
    const intersect = ((lat_i > lat) !== (lat_j > lat)) &&
      (lon < (lon_j - lon_i) * (lat - lat_i) / (lat_j - lat_i) + lon_i);
    if (intersect) inside = !inside;
  }
  return inside;
}

// Devuelve TODAS las fichas del polígono que contiene exactamente el punto GPS.
// En propiedades horizontales (PH), un mismo polígono tiene N unidades (apartamentos)
// — devuelve todas para que el inspector elija la correcta.
async function buscarCatastroGPS(lat, lon) {
  const data = await _cargarCatastro();
  const polys = data.p, fichasMap = data.f;

  // Filtro por bbox: descarta rápidamente los polígonos que no contienen el punto.
  const candidatos = [];
  for (let i = 0; i < polys.length; i++) {
    const p = polys[i];
    // p = [tcod, lat_min, lon_min, lat_max, lon_max, [[lat,lon],...]]
    if (lat < p[1] || lat > p[3] || lon < p[2] || lon > p[4]) continue;
    if (_pointInPolygon(lat, lon, p[5])) {
      candidatos.push(p[0]); // terreno_codigo
    }
  }

  // Para cada terreno encontrado, expandir todas sus fichas con datos completos.
  // Formato del registro en data.f: [ficha, npn_sufijo, dir, prop, matric, dest, avaluo, municipal]
  // prop con prefijo '@' = razón social; sin prefijo = persona natural (Nombres + Apellidos).
  const results = [];
  for (const tcod of candidatos) {
    const fichas = fichasMap[tcod] || [];
    for (const rec of fichas) {
      const [ficha, npnSufijo, direccion, prop, matric, dest, avaluo, municipal] = rec;
      const esRazonSocial = (prop || '').startsWith('@');
      results.push({
        ficha: ficha,
        catastral: tcod + npnSufijo,  // NPN completo 30 chars
        direccion: direccion || '',
        propietario: esRazonSocial ? prop.slice(1) : prop,
        esRazonSocial: esRazonSocial,
        matricula: matric || null,
        destinacion: dest || '',
        avaluo: avaluo || 0,
        municipal: !!municipal,
        terrenoCodigo: tcod,
        npnSufijo: npnSufijo,
      });
    }
  }
  return results;
}

// Formateador de moneda colombiana (sin decimales para avalúos grandes)
function formatearCOP(valor) {
  if (!valor || valor <= 0) return '—';
  return '$' + Number(valor).toLocaleString('es-CO');
}

// Exportar al global para que los componentes JSX (cada uno con su scope)
// los puedan usar sin imports.
Object.assign(window, {
  CFG_V6: CFG,
  hashPin, gasGet, gasPost, leerHoja, leerVisitas, normalizarEstado,
  login, listarInspectoresActivos, listarUsuariosAdmin,
  toggleActivo, resetPin, registrarLog, leerLogAuditoria,
  generarSolicitudVigilancia,
  geocodeDireccion, crearCarpetaVisita, guardarVisita,
  mejorarTexto,
  subirFotoConDescripcion, describirFotoConIA, consultarPOT,
  buscarCatastroGPS, formatearCOP,
  SESSION_V6: SESSION,
  invalidarCache,
});
