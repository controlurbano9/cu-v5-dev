// ═══════════════════════════════════════════
// CONFIGURACIÓN
// ═══════════════════════════════════════════
// Todas las claves de API (Maps, Gemini, Groq, Claude, DeepSeek) viven SOLO en
// Apps Script. El frontend solo conoce el endpoint del webhook.
const CFG = {
  sheetId:   '1nNNxODzXNSBcS_vqXZU5hFJpEmz9SEblWIESDAwAM0g',
  hoja:      'BD VISITAS',
  webhook:   'https://script.google.com/macros/s/AKfycbzKgiwc4AWAvNMMYWwU2Q0ir1V6R9GVbjQo7w2W4AowU9--0_IdJc6dSH8enBil54jr3w/exec',
};

// ═══════════════════════════════════════════
// ESTADO
// ═══════════════════════════════════════════
let ST = {
  usuario: null,
  cargo: null,
  rol: null,
  datos: [],
  filtro: '',          // legacy — ya no se usa directamente
  filtrosEstado: [],   // array de estados activos, ej: ['PENDIENTE','COMPLETADO']
  filtroComunas: [],   // array de comunas activas, ej: ['2','5']
  filtrosVisitador: [], // array de visitadores activos — solo ADMIN
  _filtroRural: false,  // filtro rural activo
  gpsLat: null,
  gpsLon: null,
  filaEditando: null,
  _leafletMap: null,
  _leafletMarker: null,
  _filaPendiente: null,
  nVisita: 1,
  radicadoEncontrado: false,
  esOficio: false,
  _comunaOficio: null,
  _fechaPrimeraVisita: null,
  _idCarpetaFotos: null,
  _idCarpetaVisita: null,
  _linkCarpetaDrive: null,
  _cargosUsuarios: {},
  _fotosSubidas: false,
  _fotosParaActa: [],   // [{ fileId, link, descripcion }] — guardado al subir
  _ssIdActa: null,
  _linkSheetActa: null,
  _actaGenerada: false,
  _informeGenerado: false,
  _textoBusqueda: '',    // texto libre en pantalla-buscar
  _inspectorSel: {},     // { manana: 'NOMBRE', tarde: 'NOMBRE' }
};

let reconVoz = null;
let grabando = false;

// ═══════════════════════════════════════════
// AUTH LOCAL
// ═══════════════════════════════════════════
async function hashPin(pin) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pin));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
}

async function iniciarSesion() {
  const nombre = document.getElementById('login-nombre').value.trim();
  const pin = document.getElementById('login-pin').value.trim();
  const errDiv = document.getElementById('login-error');
  const loadDiv = document.getElementById('login-cargando');

  errDiv.style.display = 'none';
  if (!nombre) { errDiv.textContent = 'Selecciona tu nombre'; errDiv.style.display = 'block'; return; }
  if (!pin || pin.length !== 4) { errDiv.textContent = 'Ingresa tu PIN de 4 dígitos'; errDiv.style.display = 'block'; return; }

  // Verificar bloqueo por intentos fallidos — clave por usuario
  const keyBloq = 'cu_bloqueado_' + nombre;
  const keyInt  = 'cu_intentos_'  + nombre;
  const bloqueadoHasta = parseInt(localStorage.getItem(keyBloq) || '0');
  if (bloqueadoHasta > Date.now()) {
    const min = Math.ceil((bloqueadoHasta - Date.now()) / 60000);
    errDiv.textContent = `Usuario bloqueado. Intenta en ${min} minuto(s).`;
    errDiv.style.display = 'block';
    return;
  }

  loadDiv.style.display = 'block';

  try {
    const pinHash = await hashPin(pin);
    // Leer hoja USUARIOS vía webhook (ya no hay BASE/KEY directos al frontend)
    const r = await fetch(`${CFG.webhook}?accion=leerHoja&hoja=USUARIOS`);
    const data = await r.json();
    if (!data.ok) throw new Error(data.error || 'Error leyendo USUARIOS');
    const filas = (data.values || []).slice(1); // saltar encabezado
    // Columnas: A=NOMBRE, B=HASH, C=ACTIVO, D=CARGO, E=ROL
    const usuario = filas.find(f =>
      (f[0]||'').toUpperCase() === nombre.toUpperCase() &&
      (f[1]||'') === pinHash &&
      (f[2]||'').toUpperCase() === 'SI'
    );

    loadDiv.style.display = 'none';

    if (usuario) {
      // Login exitoso — limpiar intentos fallidos de este usuario
      localStorage.removeItem(keyInt);
      localStorage.removeItem(keyBloq);
      ST.usuario = usuario[0];
      ST.cargo = usuario[3] || 'Inspector';
      ST.rol = (usuario[4] || 'INSPECTOR').toUpperCase();
      // Guardar mapa NOMBRE→CARGO y NOMBRE→NOMBRE_COMPLETO de todos los usuarios
      ST._cargosUsuarios = {};
      filas.forEach(f => {
        if (f[0]) {
          ST._cargosUsuarios[f[0].toUpperCase()] = f[3] || 'Inspector';
          ST._cargosUsuarios['_nombre_' + f[0].toUpperCase()] = f[0]; // nombre completo real
        }
      });
      const sesionExpira = Date.now() + (4 * 60 * 60 * 1000); // 4 horas
      localStorage.setItem('cu_usuario', ST.usuario);
      localStorage.setItem('cu_cargo', ST.cargo);
      localStorage.setItem('cu_rol', ST.rol);
      localStorage.setItem('cu_sesion_expira', sesionExpira.toString());
      mostrarApp();
    } else {
      // Incrementar intentos fallidos — por usuario
      let intentos = parseInt(localStorage.getItem(keyInt) || '0') + 1;
      localStorage.setItem(keyInt, intentos.toString());
      if (intentos >= 3) {
        const bloqueadoHasta = Date.now() + (15 * 60 * 1000); // 15 minutos
        localStorage.setItem(keyBloq, bloqueadoHasta.toString());
        localStorage.removeItem(keyInt);
        errDiv.textContent = 'Demasiados intentos. Usuario bloqueado 15 minutos.';
      } else {
        errDiv.textContent = `PIN incorrecto. Intentos restantes: ${3 - intentos}`;
      }
      errDiv.style.display = 'block';
      document.getElementById('login-pin').value = '';
    }
  } catch(e) {
    loadDiv.style.display = 'none';
    errDiv.textContent = 'Error de conexión. Intenta de nuevo.';
    errDiv.style.display = 'block';
  }
}

function mostrarApp() {
  document.getElementById('pantalla-login').style.display = 'none';
  document.getElementById('app-principal').style.display = 'block';
  document.getElementById('nav-inferior').style.display = 'flex';
  document.getElementById('usuario-nombre').textContent = ST.usuario + ' · ' + ST.cargo;

  const esAdmin = ST.rol === 'ADMIN';

  // Header admin button
  const btnAdminHeader = document.getElementById('btn-admin-header');
  if (btnAdminHeader) btnAdminHeader.style.display = esAdmin ? 'inline-flex' : 'none';

  // Nav items — agenda, gestión y admin solo para ADMIN
  const show = (id, cond, tipo = 'flex') => {
    const el = document.getElementById(id);
    if (el) el.style.display = cond ? tipo : 'none';
  };
  show('nav-agenda',  esAdmin);
  show('nav-gestion', esAdmin);
  show('sd-agenda',   esAdmin, 'flex');
  show('sd-gestion',  esAdmin, 'flex');
  show('sd-admin',    esAdmin, 'flex');

  // Filtro visitador solo ADMIN
  show('bloque-filtro-visitador', esAdmin, 'block');

  adaptarDesktop();
  cargarStats();

  if (window._sesionTimer) clearInterval(window._sesionTimer);
  window._sesionTimer = setInterval(verificarSesion, 60000);
}

function verificarSesion() {
  const expira = parseInt(localStorage.getItem('cu_sesion_expira') || '0');
  if (expira && Date.now() > expira) {
    clearInterval(window._sesionTimer);
    cerrarSesion();
    alert('Tu sesión ha expirado. Por favor ingresa de nuevo.');
  }
}

function cerrarSesion() {
  localStorage.removeItem('cu_usuario');
  localStorage.removeItem('cu_cargo');
  localStorage.removeItem('cu_rol');
  localStorage.removeItem('cu_sesion_expira');
  if (window._sesionTimer) clearInterval(window._sesionTimer);
  ST.usuario = null;
  ST.cargo = null;
  ST.rol = null;
  document.getElementById('login-pin').value = '';
  document.getElementById('login-error').style.display = 'none';
  document.getElementById('pantalla-login').style.display = 'flex';
  document.getElementById('app-principal').style.display = 'none';
  document.getElementById('nav-inferior').style.display = 'none';
}

// ═══════════════════════════════════════════
// GOOGLE SHEETS — vía webhook (claves ya no viven en el frontend)
// ═══════════════════════════════════════════
async function _leerHojaWebhook(nombreHoja) {
  const url = `${CFG.webhook}?accion=leerHoja&hoja=${encodeURIComponent(nombreHoja)}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error('Error leyendo hoja: ' + r.status);
  const d = await r.json();
  if (!d.ok) throw new Error(d.error || 'Error en Apps Script');
  return d.values || [];
}

async function leerHoja() {
  const filas = await _leerHojaWebhook(CFG.hoja);
  // Filtrar filas vacías usando RADICADO (col B = f[1]) — col A puede estar vacía en registros históricos
  return filas.filter((f, i) => i === 0 || (f[1] && f[1].toString().trim() !== ''));
}

// Lee encabezados y devuelve función para acceder por nombre de columna
async function leerHojaConHeaders() {
  //  Sin pre-filtrado: preservar índices reales de fila en el Sheet.
  // leerHoja() filtra filas con RADICADO vacío ANTES de calcular _idx, lo que desplaza
  // todos los índices y hace que las escrituras de vuelta al Sheet apunten a la fila incorrecta.
  const filas = await _leerHojaWebhook(CFG.hoja);
  if (!filas || filas.length < 1) return { headers: [], datos: [] };
  const headers = filas[0];
  // _idx se asigna ANTES de filtrar — coincide con la fila real en el Sheet (1-based, fila 1 = encabezados)
  const datos = filas.slice(1)
    .map((fila, i) => {
      const obj = { _idx: i + 2 };
      headers.forEach((h, j) => {
        const val = (fila[j] !== undefined && fila[j] !== null) ? fila[j].toString().trim() : '';
        obj[h.trim()] = val;  // trim: evita fallos si el header en el Sheet tiene espacios
        obj[j] = val;
      });
      return obj;
    })
    .filter(obj => obj['RADICADO'] && obj['RADICADO'].trim() !== '');
  return { headers, datos };
}

async function agregarFila(valores) {
  const r = await fetch(CFG.webhook, {
    method: 'POST',
    body: JSON.stringify({ accion: 'agregar', valores }),
  });
  if (!r.ok) throw new Error('Error al guardar: ' + r.status);
  const d = await r.json();
  if (!d.ok) throw new Error(d.error || 'Error en Apps Script');
  return d;
}

async function actualizarFila(filaNum, valores) {
  const r = await fetch(CFG.webhook, {
    method: 'POST',
    body: JSON.stringify({ accion: 'actualizar', fila: filaNum, valores }),
  });
  if (!r.ok) throw new Error('Error al actualizar: ' + r.status);
  const d = await r.json();
  if (!d.ok) throw new Error(d.error || 'Error en Apps Script');
  return d;
}

// ═══════════════════════════════════════════
// STATS HOME
// ═══════════════════════════════════════════
async function cargarStats() {
  try {
    const { datos } = await leerHojaConHeaders();
    ST.datos = datos;
    // Filtrar por inspector logueado (ADMIN ve todos)
    const misDatos = ST.rol === 'ADMIN'
      ? datos
      : datos.filter(f => {
          const vis = (f['VISITADOR(ES)'] || f[17] || '').toUpperCase();
          const user = (ST.usuario || '').toUpperCase();
          const estNorm = normalizarEstado(f['ESTADO VISITA'] || f[13] || '');
          return vis.includes(user) || estNorm === 'PENDIENTE' || estNorm === 'COMPLETADO';
        });
    document.getElementById('stat-total').textContent = misDatos.length;
    const pendientes = misDatos.filter(f => {
      const est = normalizarEstado(f['ESTADO VISITA']||f[13]||'');
      return est === 'PENDIENTE' || est === 'INICIADO';
    }).length;
    document.getElementById('stat-pendientes').textContent = pendientes;
    const hoy = new Date().toISOString().split('T')[0];
    const hoyCount = misDatos.filter(f => {
      const est = normalizarEstado(f['ESTADO VISITA']||f[13]||'');
      const fAsig = (f['FECHA ASIGNACION VISITA'] || '').toString().trim();
      return est === 'ASIGNADO' && fAsig.startsWith(hoy);
    }).length;
    document.getElementById('stat-hoy').textContent = hoyCount;
    _cargarAgendaHoy(misDatos);
  } catch(e) {
    console.warn('Stats:', e.message);
  }
}

// ═══════════════════════════════════════════
// BUSCAR
// ═══════════════════════════════════════════
async function buscarRadicado() {
  const q = document.getElementById('input-radicado').value.trim().toUpperCase();
  if (!q) { notif('Ingresa un radicado', 'error'); return; }
  const cont = document.getElementById('resultados-busqueda');
  cont.innerHTML = '<div class="cargando"><div class="spinner"></div>Buscando...</div>';
  try {
    const { datos } = await leerHojaConHeaders();
    const resultados = datos.map((f) => ({ f, i: f._idx }))
      .filter(({ f }) => (f['RADICADO']||'').toUpperCase().includes(q));
    if (!resultados.length) {
      cont.innerHTML = '<div class="card" style="text-align:center;color:var(--texto-suave);padding:24px;font-size:13px;">No se encontraron registros</div>';
      return;
    }
    // Agrupar por radicado — filtrar claves inválidas
    const grupos = {};
    resultados.forEach(({ f, i }) => {
      let rad = (f['RADICADO'] || f[1] || '').toString().trim();
      if (!rad || rad.startsWith('LAT ') || rad.startsWith('6.') || rad.startsWith('-75') || rad.length > 60) {
        rad = 'Sin radicado';
      }
      if (!grupos[rad]) grupos[rad] = [];
      grupos[rad].push({ f, i });
    });
    cont.innerHTML = '';
    Object.entries(grupos).forEach(([rad, visitas]) => {
      cont.appendChild(tarjetaRadicado(rad, visitas));
    });
  } catch(e) {
    cont.innerHTML = `<div class="card" style="color:var(--rojo)">Error: ${e.message}</div>`;
  }
}

// ═══════════════════════════════════════════
// LISTA VISITAS
// ═══════════════════════════════════════════
async function cargarVisitas() {
  const cont = document.getElementById('lista-visitas-contenedor');
  cont.innerHTML = '<div class="cargando"><div class="spinner"></div>Cargando registros...</div>';
  try {
    const { datos } = await leerHojaConHeaders();
    // Filtrar por inspector logueado (ADMIN ve todos)
    const misDatos = ST.rol === 'ADMIN'
      ? datos
      : datos.filter(f => {
          const vis = (f['VISITADOR(ES)'] || f[17] || '').toUpperCase();
          const user = (ST.usuario || '').toUpperCase();
          const estNorm = normalizarEstado(f['ESTADO VISITA'] || f[13] || '');
          // Inspector ve:
          // - Sus propios registros en cualquier estado
          // - Todos los PENDIENTES (para poder tomar visitas)
          // - Todos los COMPLETADOS (para consultar historial, solo lectura)
          return vis.includes(user) || estNorm === 'PENDIENTE' || estNorm === 'COMPLETADO';
        });
    ST.datos = misDatos;
    // Poblar chips de comunas con los datos cargados
    poblarChipsComunas(misDatos);
    // Resetear filtros al recargar
    ST.filtrosEstado = [];
    ST.filtroComunas = [];
    document.querySelectorAll('#chips-filtro .btn-filtro').forEach(b => b.classList.remove('activo-pendiente','activo-iniciado','activo-completado'));
    document.querySelectorAll('#chips-comunas .btn-filtro').forEach(b => b.classList.remove('activo-comuna'));
    const btnLimpiar = document.getElementById('btn-limpiar-filtros');
    if (btnLimpiar) btnLimpiar.classList.remove('visible');
    renderLista(misDatos.map((f) => ({ f, i: f._idx })));
  } catch(e) {
    cont.innerHTML = `<div class="card" style="color:var(--rojo)">Error: ${e.message}</div>`;
  }
}

// ── Normalización de estado ───────────────────────────────────────────────
function normalizarEstado(raw) {
  const r = (raw || '').toUpperCase().trim();
  if (r.includes('PENDIENTE')) return 'PENDIENTE';
  if (r === 'ASIGNADO') return 'ASIGNADO';
  if (r === 'INICIADO' || r === 'REALIZADA' || r === 'REPETIR') return 'INICIADO';
  if (r === 'COMPLETADO' || r === 'COMPLETADA') return 'COMPLETADO';
  return r;
}

// ── Aplicar filtros combinados y re-renderizar ────────────────────────────
function aplicarFiltros() {
  const tieneEstado = ST.filtrosEstado.length > 0;
  const tieneComuna = ST.filtroComunas.length > 0;
  const tieneVisitador = ST.filtrosVisitador.length > 0;
  const tieneRural = !!ST._filtroRural;

  const filtrados = ST.datos
    .map(f => ({ f, i: f._idx }))
    .filter(({ f }) => {
      if (tieneEstado) {
        const estNorm = normalizarEstado(f['ESTADO VISITA'] || f[13] || '');
        if (!ST.filtrosEstado.includes(estNorm)) return false;
      }
      if (tieneComuna) {
        const com = (f['COMUNA'] || f[5] || '').toString().trim();
        if (!ST.filtroComunas.includes(com)) return false;
      }
      if (tieneVisitador) {
        const vis = (f['VISITADOR(ES)'] || f[17] || '').toString().toUpperCase();
        if (!ST.filtrosVisitador.some(v => vis.includes(v))) return false;
      }
      if (tieneRural) {
        // Filtro RURAL: solo mostrar si barrio comienza con "Vda."
        const barrio = (f['BARRIO/VEREDA'] || f[4] || '').toString().trim();
        if (!barrio.startsWith('Vda.')) return false;
      }
      return true;
    });

  const btnLimpiar = document.getElementById('btn-limpiar-filtros');
  if (btnLimpiar) {
    btnLimpiar.classList.toggle('visible', tieneEstado || tieneComuna || tieneVisitador || tieneRural);
  }

  renderLista(filtrados);
}

// ── Toggle filtro de estado (multifiltro) ─────────────────────────────────
function toggleFiltroEstado(btn, estado) {
  const idx = ST.filtrosEstado.indexOf(estado);
  if (idx === -1) {
    ST.filtrosEstado.push(estado);
    const claseMap = { 'PENDIENTE': 'activo-pendiente', 'ASIGNADO': 'activo-iniciado', 'INICIADO': 'activo-iniciado', 'COMPLETADO': 'activo-completado' };
    btn.classList.add(claseMap[estado] || 'activo-pendiente');
  } else {
    ST.filtrosEstado.splice(idx, 1);
    btn.classList.remove('activo-pendiente', 'activo-iniciado', 'activo-completado');
  }
  aplicarFiltros();
}

// ── Toggle filtro de visitador (solo ADMIN) ───────────────────────────────
function toggleFiltroVisitador(btn, visitador) {
  if (!ST.filtrosVisitador) ST.filtrosVisitador = [];
  const idx = ST.filtrosVisitador.indexOf(visitador);
  if (idx === -1) {
    ST.filtrosVisitador.push(visitador);
    btn.classList.add('activo-iniciado');
  } else {
    ST.filtrosVisitador.splice(idx, 1);
    btn.classList.remove('activo-iniciado');
  }
  aplicarFiltros();
}

// ── Toggle filtro de comuna ───────────────────────────────────────────────
function toggleFiltroComuna(btn, comuna) {
  const idx = ST.filtroComunas.indexOf(comuna);
  if (idx === -1) {
    ST.filtroComunas.push(comuna);
    btn.classList.add('activo-comuna');
  } else {
    ST.filtroComunas.splice(idx, 1);
    btn.classList.remove('activo-comuna');
  }
  aplicarFiltros();
}

function toggleFiltroRural(btn) {
  if (!ST._filtroRural) {
    ST._filtroRural = true;
    btn.classList.add('activo-pendiente');
  } else {
    ST._filtroRural = false;
    btn.classList.remove('activo-pendiente', 'activo-iniciado', 'activo-completado');
  }
  aplicarFiltros();
}

// ── Limpiar todos los filtros ─────────────────────────────────────────────
function limpiarFiltros() {
  ST.filtrosEstado    = [];
  ST.filtroComunas    = [];
  ST.filtrosVisitador = [];
  ST._filtroRural     = false;
  ST._textoBusqueda   = '';
  const inputBusq = document.getElementById('input-radicado');
  if (inputBusq) inputBusq.value = '';
  document.querySelectorAll('#chips-filtro .btn-filtro').forEach(b => {
    b.classList.remove('activo-pendiente', 'activo-iniciado', 'activo-completado');
  });
  document.querySelectorAll('#chips-comunas .btn-filtro').forEach(b => {
    b.classList.remove('activo-comuna');
  });
  document.querySelectorAll('#chips-visitador-filtro .btn-filtro').forEach(b => {
    b.classList.remove('activo-iniciado');
  });
  const btnLimpiar = document.getElementById('btn-limpiar-filtros');
  if (btnLimpiar) btnLimpiar.classList.remove('visible');
  const contCom = document.getElementById('comunas-activas-count');
  if (contCom) contCom.textContent = '';
  _aplicarFiltrosCombinados();
}

// ── Poblar chips de comunas dinámicamente ────────────────────────────────
function poblarChipsComunas(datos) {
  const cont = document.getElementById('chips-comunas');
  if (!cont) return;
  // Extraer comunas únicas, ordenadas numéricamente
  const comunasSet = new Set();
  datos.forEach(f => {
    const c = (f['COMUNA'] || f[5] || '').toString().trim();
    if (c && !isNaN(c)) comunasSet.add(c);
  });
  const comunas = [...comunasSet].sort((a, b) => Number(a) - Number(b));
  if (!comunas.length) { cont.parentElement && (cont.style.display = 'none'); return; }
  cont.innerHTML = comunas.map(c =>
    `<button class="btn-filtro" data-comuna="${c}" onclick="toggleFiltroComuna(this,'${c}')">C${c}</button>`
  ).join('') + `<button class="btn-filtro" id="btn-filtro-rural" onclick="toggleFiltroRural(this)"> Rural</button>`;
}

// ── filtrarLista (legacy wrapper — mantener por si hay llamadas externas) ─
function filtrarLista(chip, filtro) {
  // Redirigir al nuevo sistema
  toggleFiltroEstado(chip, filtro);
}

function renderLista(items) {
  const cont = document.getElementById('lista-visitas-contenedor');
  // Actualizar contador
  const contador = document.getElementById('contador-registros');
  if (contador) {
    const total = ST.datos ? ST.datos.length : 0;
    const tienesFiltros = ST.filtrosEstado.length > 0 || ST.filtroComunas.length > 0 ||
      (ST.filtrosVisitador && ST.filtrosVisitador.length > 0) || !!(ST._textoBusqueda);
    contador.textContent = tienesFiltros ? `${items.length} de ${total}` : `${total} registros`;
    contador.style.display = total > 0 ? '' : 'none';
  }
  if (!items.length) {
    cont.innerHTML = '<div class="card" style="text-align:center;color:var(--texto-suave);padding:24px;font-size:13px;">No hay registros</div>';
    return;
  }
  // Agrupar por radicado — filtrar claves inválidas
  const grupos = {};
  items.forEach(({ f, i }) => {
    let rad = (f['RADICADO'] || f[1] || '').toString().trim();
    // Ignorar filas donde columna A tiene coordenadas u otro dato no radicado
    if (!rad || rad.startsWith('LAT ') || rad.startsWith('6.') || rad.startsWith('-75') || rad.length > 60) {
      rad = 'Sin radicado';
    }
    if (!grupos[rad]) grupos[rad] = [];
    grupos[rad].push({ f, i });
  });
  cont.innerHTML = '';
  Object.entries(grupos)
    .sort((a,b) => a[0] === 'Sin radicado' ? 1 : b[0] === 'Sin radicado' ? -1 : b[0].localeCompare(a[0]))
    .slice(0, 150)
    .forEach(([rad, visitas]) => {
      cont.appendChild(tarjetaRadicado(rad, visitas));
    });
}

function tarjetaRadicado(radicado, visitas) {
  const div = document.createElement('div');
  div.className = 'radicado-item';
  const ultima = visitas[visitas.length - 1].f;
  const estadoUlt = ultima['ESTADO VISITA'] || ultima[13] || '';
  const dir = ultima['DIRECCION INFRACCION'] || ultima[3] || 'Sin dirección';
  const estNorm = normalizarEstado(estadoUlt);
  const bc = estNorm === 'PENDIENTE'  ? 'badge-pendiente' :
             estNorm === 'ASIGNADO'   ? 'badge-asignado' :
             estNorm === 'INICIADO'   ? 'badge-iniciado' :
             estNorm === 'COMPLETADO' ? 'badge-completado' : 'badge-otra';
  div.innerHTML = `
    <div class="radicado-header" onclick="toggleVisitas(this)">
      <div style="display:flex;align-items:center;gap:8px;min-width:0;flex:1;">
        <div class="radicado-check ${estNorm.toLowerCase()}" style="flex-shrink:0;"></div>
        <div style="min-width:0;flex:1;">
          <div class="radicado-num">${radicado}</div>
          <div class="radicado-info" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${dir} · ${visitas.length} visita(s)</div>
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;margin-left:8px;">
        <span class="badge ${bc}">${estNorm||'—'}</span>
        <span class="chevron"><svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5"/></svg></span>
      </div>
    </div>
    <div class="visitas-lista">
      ${visitas.map(({ f, i }) => {
        const nv = f['N VISITA'] || f['N° VISITA'] || f[16] || '1';
        const fv = f['FECHA DE VISITA'] || f[15] || 'Sin fecha';
        const vis = f['VISITADOR(ES)'] || f[17] || 'Sin asignar';
        const estN = normalizarEstado(f['ESTADO VISITA'] || f[13] || '');
        const bc2 = estN === 'PENDIENTE'  ? 'badge-pendiente' :
                    estN === 'ASIGNADO'   ? 'badge-asignado' :
                    estN === 'INICIADO'   ? 'badge-iniciado' :
                    estN === 'COMPLETADO' ? 'badge-completado' : 'badge-otra';
        if (estN === 'PENDIENTE') return ''; // PENDIENTE no muestra fila de visita
        return `
          <div class="visita-item" onclick='verDetalle(${JSON.stringify(f)}, ${i})'>
            <div>
              <div class="visita-num">Visita ${nv}</div>
              <div class="visita-sub">${fv} · ${vis}</div>
            </div>
            <span class="badge ${bc2}">${estN||'—'}</span>
          </div>`;
      }).join('')}
      <div style="padding:10px 14px; border-top:1px solid var(--gris-bg); display:flex; gap:8px; flex-wrap:wrap;">
        ${estNorm === 'PENDIENTE' ? `
          <button class="btn-sm azul" onclick="abrirVisitaPorIdx(${visitas[visitas.length-1].i})">
             Realizar visita
          </button>` : ''}
        ${estNorm === 'ASIGNADO' ? `
          <button class="btn-sm azul" onclick="abrirVisitaPorIdx(${visitas[visitas.length-1].i})">
             Iniciar visita asignada
          </button>` : ''}
        ${estNorm === 'INICIADO' ? `
          <button class="btn-sm azul" onclick="abrirVisitaPorIdx(${visitas[visitas.length-1].i})">
             Editar registro
          </button>` : ''}
        ${estNorm === 'COMPLETADO' && ST.rol === 'ADMIN' ? `
          <button class="btn-sm verde" onclick="nuevaVisitaDesde('${radicado}', [${visitas.map(v=>v.i).join(',')}])">
             Nueva visita
          </button>` : ''}
        ${estNorm === 'COMPLETADO' ? `
          <button class="btn-sm gris" onclick="abrirVisitaPorIdx(${visitas[visitas.length-1].i})">
             Ver registro
          </button>` : ''}
      </div>
    </div>`;
  return div;
}

function abrirVisitaPorIdx(idx) {
  const fila = ST.datos.find(f => f._idx === idx);
  if (!fila) { notif('No se encontró el registro', 'error'); return; }
  verDetalle(fila, idx);
  // Si es PENDIENTE (viene de Forms), ocultar toggle oficio
  const est = (fila['ESTADO VISITA']||fila[13]||'').toUpperCase();
  if (est === 'PENDIENTE' || est === 'PQR PENDIENTE') {
    const bloquePqr = document.getElementById('bloque-pqr');
    const rg = document.getElementById('rg-oficio');
    if (rg) rg.style.display = 'none'; // ocultar opciones PQR/Oficio
    if (bloquePqr) bloquePqr.style.display = 'block';
    // Precargar fecha de visita con hoy si está vacía
    const fv = document.getElementById('f-fecha-visita');
    if (fv && !fv.value) fv.value = new Date().toISOString().split('T')[0];
  }
}

function toggleVisitas(h) {
  const lista = h.nextElementSibling;
  if (!lista || !lista.classList.contains('visitas-lista')) return;
  const estaAbierta = lista.classList.contains('abierta');
  // Cerrar todos los acordeones abiertos
  document.querySelectorAll('.visitas-lista.abierta').forEach(l => {
    l.classList.remove('abierta');
    const ch = l.previousElementSibling?.querySelector('.chevron');
    if (ch) ch.classList.remove('abierto');
  });
  // Si no estaba abierto, abrir este
  if (!estaAbierta) {
    lista.classList.add('abierta');
    h.querySelector('.chevron')?.classList.add('abierto');
  }
}

function verDetalle(fila, idx) {
  ST._filaPendiente = fila;
  ST.filaEditando = idx; // asegurar SIEMPRE antes de prepararFormulario
  irA('pantalla-nueva-visita');
  prepararFormulario(fila, idx);
  // Normalizar estado (compatibilidad con valores viejos)
  const estRaw = (fila['ESTADO VISITA'] || fila[13] || '').toUpperCase();
  const estado = estRaw.includes('PENDIENTE') ? 'PENDIENTE' :
                 (estRaw === 'REALIZADA' || estRaw === 'REPETIR' || estRaw === 'INICIADO') ? 'INICIADO' :
                 (estRaw === 'COMPLETADO' || estRaw === 'COMPLETADA') ? 'COMPLETADO' : estRaw;
  if (estado === 'COMPLETADO') {
    const yaHayActa = ST._actaGenerada || !!ST._ssIdActa || !!ST._linkPdfActa;
    if (yaHayActa) {
      aplicarModoSoloLectura();
    } else {
      aplicarModoEdicionPreActa();
    }
  } else if (estado === 'INICIADO') {
    aplicarModoOficina();
    // Bloquear toggle PQR/Oficio — ya no puede cambiarse
    const rgOficio = document.getElementById('rg-oficio');
    if (rgOficio) { rgOficio.style.pointerEvents = 'none'; rgOficio.style.opacity = '0.6'; }
  }
  // PENDIENTE: todo editable pero sin toggle oficio (viene de Forms)
}

// ═══════════════════════════════════════════
// FORMULARIO
// ═══════════════════════════════════════════
function prepararFormulario(fila, filaIdx) {
  // Solo resetear si es formulario nuevo (fila=null)
  if (!fila) ST.filaEditando = null;
  else ST.filaEditando = filaIdx || ST.filaEditando;
  document.getElementById('form-visita-contenedor').style.display = 'block';

  // Limpiar GPS y mapa
  ST.gpsLat = null; ST.gpsLon = null;
  document.getElementById('gps-coords').textContent = 'Sin ubicación';
  document.getElementById('gps-dir').textContent = 'Toca GPS para obtener coordenadas';
  document.getElementById('btn-mapa').style.display = 'none';
  resetearMapaGPS();

  if (!fila) {
    // Nueva
    document.getElementById('info-nvisita').style.display = 'none';
    document.getElementById('grupo-fecha-radicado').style.display = 'none';
    document.getElementById('f-radicado').value = '';
    document.getElementById('f-fecha-visita').value = new Date().toISOString().split('T')[0]; // hoy por defecto
    document.getElementById('f-direccion').value = '';
    document.getElementById('f-barrio').value = '';
    document.getElementById('f-fecha-radicado').value = '';
    ST.nVisita = 1;
    ST.radicadoEncontrado = false;
    ST.esOficio = false;
    ST._comunaOficio = null;
    ST._fechaPrimeraVisita = null;
    ST._idCarpetaFotos = null;
    ST._idCarpetaVisita = null;
    ST._linkCarpetaDrive = null;
    ST._ssIdActa = null;
    ST._linkSheetActa = null;
    ST._docIdRegistroFotos = null;
    ST._linkDocRegistroFotos = null;
    ST._fotosSubidas = false;
    ST._fotosParaActa = [];
    ST._actaGenerada = false;
    ST._informeGenerado = false;
    // Ocultar panel de estado
    const panelEstado = document.getElementById('panel-estado-registro');
    if (panelEstado) panelEstado.style.display = 'none';
    // Ocultar sección fotos hasta primer guardado
    const secFotos = document.getElementById('seccion-fotos');
    if (secFotos) secFotos.style.display = 'none';
    const bloqueSubirNew = document.getElementById('bloque-subir-fotos');
    if (bloqueSubirNew) bloqueSubirNew.style.display = 'block';
    // Restaurar visibilidad del toggle PQR/Oficio (puede haberse ocultado al editar un PENDIENTE)
    const rgOficioEl = document.getElementById('rg-oficio');
    if (rgOficioEl) {
      rgOficioEl.style.display = '';
      rgOficioEl.style.pointerEvents = '';
      rgOficioEl.style.opacity = '';
    }
    selRadVal('rg-oficio', 'NO');
    toggleOficio('NO');
    desbloquearCamposVisita();
    inicializarPrefijoOrden();
    setTimeout(actualizarPanelEstado, 300);
    document.getElementById('f-visitador').value = '';
    document.getElementById('f-licencia').value = '';
    document.getElementById('f-area').value = '';
    document.getElementById('f-orden').value = '';
    document.getElementById('f-orden-consecutivo-pqr') && (document.getElementById('f-orden-consecutivo-pqr').value = '');
    document.getElementById('f-citacion-fecha').value = '';
    document.getElementById('f-citacion-hora').value = '';
    document.getElementById('transcripcion').value = '';
    // Características edificación
    toggleSuspensionPorEstado('En proceso / iniciada');
    document.getElementById('f-altura-pisos').value = '';
    document.getElementById('f-dest-actuales').value = '';
    resetChipsUsosCubierta();
    // Verificación documental
    toggleLicencia('NO');
    document.getElementById('f-fecha-licencia').value = '';
    document.getElementById('f-tipo-licencia').value = '';
    document.getElementById('f-pisos').value = '';
    document.getElementById('f-destinaciones').value = '';
    document.getElementById('f-cubierta').value = '';
    document.getElementById('f-sistema').value = '';
    document.getElementById('f-obs-licencia').value = '';
    // Infracciones
    selRadVal('rg-quebrada', 'PENDIENTE VERIFICAR');
    // Limpiar amenaza, suelo protección y quebrada (sin selección por defecto)
    document.querySelectorAll('#rg-amenaza .radio-opcion, #rg-suelo-prot .radio-opcion, #rg-quebrada .radio-opcion').forEach(r => r.classList.remove('sel','sel-verde','sel-rojo'));
    toggleOrden('SI');
    // Limpiar chips infracción y visitadores
    document.querySelectorAll('#chips-infraccion .chip-inf').forEach(c => c.classList.remove('activo'));
    document.getElementById('f-infraccion').value = '';
    document.querySelectorAll('#chips-visitador .chip-vis').forEach(c => c.classList.remove('activo'));
    document.getElementById('f-visitador').value = '';
    // Limpiar campos persona que atiende
    document.getElementById('f-atiende-nombre').value = '';
    document.getElementById('f-atiende-id').value = '';
    document.getElementById('f-atiende-tel').value = '';
    document.getElementById('f-atiende-dir').value = '';
    document.getElementById('f-atiende-email').value = '';
    // Norma POT
    document.getElementById('f-catastral').value = '';
    document.getElementById('f-ficha').value = '';
    document.getElementById('f-poligono').value = '';
  } else {
    // Editar — cargar TODOS los datos con índices correctos
    ST.filaEditando = filaIdx;
    // Restaurar flags
    const linkD = fila['LINK_DRIVE'] || fila[55] || '';
    ST._fotosSubidas = !!(linkD);
    ST._linkCarpetaDrive = linkD;
    // Si hay carpeta Drive, extraer ID raíz y mostrar sección fotos de inmediato
    // (el ID de la subcarpeta Fotos se obtiene async, pero no bloqueamos la UI)
    if (linkD) {
      const matchCarpetaRaiz = linkD.match(/folders\/([a-zA-Z0-9_-]+)/);
      if (matchCarpetaRaiz) ST._idCarpetaVisita = matchCarpetaRaiz[1];
      const secFotosInm = document.getElementById('seccion-fotos');
      const btnVerDriveInm = document.getElementById('btn-ver-fotos-drive');
      if (secFotosInm) secFotosInm.style.display = 'block';
      if (btnVerDriveInm) btnVerDriveInm.style.display = 'block';
      // Obtener async el ID exacto de la subcarpeta Fotos (sin bloquear UI)
      if (ST._idCarpetaVisita) {
        fetch(`${CFG.webhook}?accion=obtenerIdFotos&idCarpeta=${encodeURIComponent(ST._idCarpetaVisita)}`)
          .then(r => r.json())
          .then(d => {
            if (!d.ok) return;
            if (d.idFotos) ST._idCarpetaFotos = d.idFotos;
            // Si el AS encontró un acta en la carpeta y la BD no la tenía, cargarla
            if (d.linkActa && !ST._actaGenerada) {
              ST._linkSheetActa = d.linkActa;
              ST._ssIdActa      = d.ssIdActa;
              ST._actaGenerada  = true;
            }
            actualizarBotonesActa(); // re-evaluar botones con datos completos
            actualizarPanelEstado(); // re-evaluar panel tras resolución async
          })
          .catch(() => {});
      }
    }
    // Cargar links de acta si existen en BD
    ST._linkXlsxActa  = fila['LINK_XLSX_ACTA'] || fila[57] || '';
    ST._linkSheetActa = ST._linkXlsxActa;
    ST._linkPdfActa   = fila['LINK_PDF_ACTA']  || fila[56] || '';
    ST._estadoVisita  = (fila['ESTADO VISITA'] || fila[13] || '').toUpperCase();
    // Extraer ssId del Sheet para poder generar PDF después
    const matchSsId = ST._linkSheetActa.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
    ST._ssIdActa = matchSsId ? matchSsId[1] : '';
    // El Doc del registro fotográfico no se guarda en BD (vive en la carpeta de visita)
    ST._docIdRegistroFotos   = null;
    ST._linkDocRegistroFotos = null;
    ST._actaGenerada    = !!(ST._linkSheetActa || ST._linkPdfActa);
    ST._informeGenerado = !!(fila['LINK_PDF_INFORME'] || fila['LINK_DOCX_INFORME']);
    actualizarBotonesActa();
    // Cambiar botón a "Actualizar registro" en modo INICIADO
    const btnG = document.querySelector('[onclick="guardarRegistro()"]');
    if (btnG) btnG.innerHTML = ' Actualizar registro';
    setTimeout(actualizarPanelEstado, 500);
    ST.nVisita = Number(celda(fila, 16)) || 1;

    // Info
    document.getElementById('info-nvisita').style.display = 'block';
    document.getElementById('info-nvisita').textContent = ' Editando Visita N°' + ST.nVisita + ' · ' + (fila['RADICADO']||fila[1]||'');
    document.getElementById('info-nvisita').style.background = 'var(--azul-bg)';
    document.getElementById('info-nvisita').style.color = 'var(--azul)';
    // Botón Ver radicado PDF — búsqueda en Drive por número de radicado
    const btnVerRad = document.getElementById('btn-ver-radicado-pdf');
    const svgPdf = `<svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"/></svg>`;
    if (btnVerRad) {
      const radBuscar = fila['RADICADO'] || celda(fila, 1) || '';
      if (radBuscar) {
        btnVerRad.style.display = 'inline-flex';
        btnVerRad.disabled = true;
        btnVerRad.innerHTML = svgPdf + ' Buscando PDF...';
        fetch(`${CFG.webhook}?accion=buscarPDFRadicado&radicado=${encodeURIComponent(radBuscar)}`)
          .then(r => r.json())
          .then(d => {
            if (d.ok && d.link) {
              btnVerRad.disabled = false;
              btnVerRad.innerHTML = svgPdf + ' Ver radicado PDF';
              btnVerRad.onclick = () => window.open(d.link, '_blank');
            } else {
              btnVerRad.style.display = 'none';
            }
          })
          .catch(() => { btnVerRad.style.display = 'none'; });
      } else {
        btnVerRad.style.display = 'none';
      }
    }
    // Ocultar "otra persona" si es visita 1
    document.getElementById('bloque-otra-persona').style.display = 'none';

    // Detectar si es oficio por el radicado
    const radVal = fila['RADICADO'] || celda(fila, 1) || '';
    const esOficioFila = radVal.toUpperCase().startsWith('OFICIO-');
    ST.esOficio = esOficioFila;
    selRadVal('rg-oficio', esOficioFila ? 'SI' : 'NO');
    toggleOficio(esOficioFila ? 'SI' : 'NO');

    // Radicado y fechas
    document.getElementById('f-radicado').value = radVal;
    const fechaGuardada = fila['FECHA DE VISITA'] || celda(fila, 15) || '';
    document.getElementById('f-fecha-visita').value = fechaAIso(fechaGuardada) || new Date().toISOString().split('T')[0];
    // Fecha radicado — convertir a ISO (el input type=date necesita YYYY-MM-DD)
    const fechaRadBD = fechaAIso(fila['FECHA RADICADO'] || celda(fila, 2) || '');
    document.getElementById('f-fecha-radicado').value = fechaRadBD;
    // Mostrar el grupo si tiene fecha (PQR/queja con fecha en BD)
    if (fechaRadBD && !esOficioFila) {
      const grp = document.getElementById('grupo-fecha-radicado');
      if (grp) { grp.style.display = 'block'; }
      const inp = document.getElementById('f-fecha-radicado');
      if (inp) { inp.readOnly = true; inp.style.background = 'var(--gris-bg)'; }
    }
    // Para oficio: guardar fecha de visita como primera (visita 1 = la misma fecha)
    if (esOficioFila) ST._fechaPrimeraVisita = fechaGuardada || '';

    // Ubicación
    document.getElementById('f-direccion').value = fila['DIRECCION INFRACCION'] || celda(fila, 3);
    document.getElementById('f-barrio').value = fila['BARRIO/VEREDA'] || celda(fila, 4);

    // GPS [48]=AW:LATITUD [49]=AX:LONGITUD
    if ((fila['LATITUD'] || celda(fila, 48)) && (fila['LONGITUD'] || celda(fila, 49))) {
      ST.gpsLat = parseFloat(fila['LATITUD'] || celda(fila, 48));
      ST.gpsLon = parseFloat(fila['LONGITUD'] || celda(fila, 49));
      const latVal = fila['LATITUD'] || celda(fila, 48) || '';
      const lonVal = fila['LONGITUD'] || celda(fila, 49) || '';
      document.getElementById('gps-coords').textContent = latVal + ', ' + lonVal;
      document.getElementById('btn-mapa').style.display = 'inline-flex';
      // Determinar estado para decidir si GPS es editable
      const estCargando = (fila['ESTADO VISITA'] || fila[13] || '').toUpperCase();
      const esCompletado = estCargando === 'COMPLETADO' || estCargando === 'COMPLETADA';
      const gpsBox = document.getElementById('gps-box');
      const btnGps = document.querySelector('[onclick="obtenerGPS()"]');
      if (esCompletado) {
        // COMPLETADO → ocultar caja GPS, pin fijo
        document.getElementById('gps-dir').textContent = 'Ubicación guardada';
        if (gpsBox) gpsBox.style.display = 'none';
        if (btnGps) btnGps.style.display = 'none';
      } else {
        // PENDIENTE / INICIADO → mantener caja y botón visibles para permitir actualizar
        document.getElementById('gps-dir').textContent = 'Coordenadas guardadas · puedes actualizar';
        if (gpsBox) gpsBox.style.display = 'flex';
        if (btnGps) { btnGps.style.display = ''; btnGps.disabled = false; btnGps.style.opacity = ''; btnGps.style.pointerEvents = ''; }
      }
      // Mostrar mapa con pin (arrastrable solo si no está completado)
      setTimeout(() => mostrarMapaGPS(ST.gpsLat, ST.gpsLon, !esCompletado), 200);
    } else {
      // Sin coordenadas previas — si está COMPLETADO, ocultar caja y botón GPS igual
      const estSinCoords = (fila['ESTADO VISITA'] || fila[13] || '').toUpperCase();
      if (estSinCoords === 'COMPLETADO' || estSinCoords === 'COMPLETADA') {
        const gpsBoxSC = document.getElementById('gps-box');
        const btnGpsSC = document.querySelector('[onclick="obtenerGPS()"]');
        if (gpsBoxSC) gpsBoxSC.style.display = 'none';
        if (btnGpsSC) btnGpsSC.style.display = 'none';
      }
    }

    // Persona que atiende [7]=H:NOMBRE [8]=I:ID [9]=J:TEL [10]=K:RELACION [11]=L:DIR [12]=M:EMAIL
    const noAtiendeVal = (fila['NOMBRE PERSONA ATIENDE'] || celda(fila, 7) || '').includes('No se atiende');
    const noAtiendeChk = document.getElementById('no-atiende');
    if (noAtiendeChk) { noAtiendeChk.checked = noAtiendeVal; }
    if (noAtiendeVal) {
      const bloqueP = document.getElementById('bloque-persona-atiende');
      if (bloqueP) bloqueP.style.display = 'none';
    }
    document.getElementById('f-atiende-nombre').value = fila['NOMBRE PERSONA ATIENDE'] || celda(fila, 7);
    document.getElementById('f-atiende-id').value = fila['ID PERSONA ATIENDE'] || celda(fila, 8);
    document.getElementById('f-atiende-tel').value = fila['TELEFONO PERSONA ATIENDE'] || celda(fila, 9);
    selRadVal('rg-relacion', fila[10] || 'Propietario');
    toggleOtroRelacion(fila['RELACION CON EL EVENTO'] || celda(fila, 10));
    document.getElementById('f-atiende-dir').value = fila['DIR NOTIFICACION'] || celda(fila, 11);
    document.getElementById('f-atiende-email').value = soloMinusculas(fila['CORREO ELECTRONICO'] || celda(fila, 12) || '');

    // Características edificación — usar nombre de columna primero, índice como fallback
    const estObra = fila['ESTADO OBRA'] || fila[22] || celda(fila,22) || '';
    if (estObra) { selRadVal('rg-estado-obra', estObra); toggleSuspensionPorEstado(estObra); }
    else toggleSuspensionPorEstado('En proceso / iniciada');
    const repLoc = fila['REPARACION LOCATIVA'] || fila['REPARACIÓN LOCATIVA'] || fila[26] || celda(fila,26) || '';
    if (repLoc) selRadVal('rg-rep-locativa', repLoc);
    const habitado = fila['HABITADO'] || fila['¿HABITADO?'] || fila[27] || fila[28] || celda(fila,27) || celda(fila,28) || '';
    console.log('Cargando habitado:', habitado, '| fila[27]:', fila[27], '| fila[28]:', fila[28]);
    if (habitado) selRadVal('rg-habitado', habitado);
    document.getElementById('f-altura-pisos').value = fila['ALTURA EN PISOS'] || celda(fila, 28);
    document.getElementById('f-dest-actuales').value = fila['N DESTINACIONES ACTUALES'] || fila['N° DESTINACIONES ACTUALES'] || celda(fila, 29);
    // Cargar chips con delay para asegurar que el DOM esté listo
    setTimeout(() => {
      cargarChipsUsosCubierta(fila['USOS ACTUALES'] || celda(fila, 30), fila['TIPO CUBIERTA ACTUAL'] || celda(fila, 31));
    }, 100);

    // Verificación documental
    const licAp = fila['SE APORTO LICENCIA'] || fila[35] || celda(fila,35) || '';
    selRadVal('rg-licencia-aportada', licAp);
    toggleLicencia(licAp);
    if (licAp === 'SI') {
      document.getElementById('f-licencia').value = fila['N LICENCIA'] || fila['N° LICENCIA'] || celda(fila, 34);
      document.getElementById('f-fecha-licencia').value = fila['FECHA LICENCIA'] || celda(fila, 36);
      document.getElementById('f-tipo-licencia').value = fila['TIPO Y MODALIDAD LICENCIA'] || celda(fila, 37);
      document.getElementById('f-pisos').value = fila['PISOS APROBADOS'] || celda(fila, 38);
      document.getElementById('f-destinaciones').value = fila['DESTINACIONES LICENCIA'] || celda(fila, 39);
      document.getElementById('f-cubierta').value = fila['CUBIERTA LICENCIA'] || celda(fila, 40);
      document.getElementById('f-sistema').value = fila['SISTEMA ESTRUCTURAL'] || celda(fila, 41);
      document.getElementById('f-obs-licencia').value = fila['OBS LICENCIA'] || celda(fila, 42);
    }

    // Situación encontrada
    document.getElementById('f-area').value = fila['AREA CONTRAVENCION m2'] || celda(fila, 24);
    if (document.getElementById('f-area').value === 'NO MEDIBLE') {
      const cbArea = document.getElementById('area-no-medible');
      if (cbArea) { cbArea.checked = true; toggleAreaNoMedible(cbArea); }
    }
    const suspVal = fila['SUSPENSION DE LA OBRA'] || fila[43] || celda(fila, 43) || '';
    if (suspVal) { selRadVal('rg-suspension', suspVal); toggleOrden(suspVal); }
    const ordenGuardado = fila['N ORDEN DE POLICIA'] || fila['N° ORDEN DE POLICIA'] || celda(fila, 44) || '';
    document.getElementById('f-orden').value = ordenGuardado;
    // Llenar campo visible del consecutivo (últimos 3 dígitos del orden)
    if (ordenGuardado) {
      const partes = ordenGuardado.split('-');
      const consVal = partes[partes.length - 1];
      if (ST.esOficio) {
        const consEl = document.getElementById('f-orden-consecutivo');
        if (consEl) consEl.value = parseInt(consVal) || '';
        // Mostrar radicado oficio
        const radOfPrev = document.getElementById('radicado-oficio-preview');
        if (radOfPrev) { radOfPrev.textContent = 'OFICIO-' + ordenGuardado; radOfPrev.style.display = 'block'; }
      } else {
        // También llenar en PQR aunque no sea oficio
        const consPqr = document.getElementById('f-orden-consecutivo-pqr');
        if (consPqr) consPqr.value = parseInt(consVal) || '';
      }
    }
    const citGuardada = (fila['FECHA CITACION'] || celda(fila, 45)).toString().trim();
    if (citGuardada) {
      // Formatos posibles:
      //   DD/MM/YYYY · 8:00 AM  (guardado por isoAFecha + hora AM/PM)
      //   YYYY-MM-DDTHH:MM      (ISO)
      //   YYYY-MM-DD HH:MM      (espacio)
      let citFechaVal = '', citHoraVal = '';
      if (citGuardada.includes(' · ')) {
        const partesCit = citGuardada.split(' · ');
        citFechaVal = fechaAIso(partesCit[0]);
        // Convertir "8:00 AM" / "2:00 PM" → "08:00" / "14:00"
        const horaTexto = (partesCit[1] || '').trim();
        const horaMatch = horaTexto.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
        if (horaMatch) {
          let h = parseInt(horaMatch[1]);
          const m = horaMatch[2].substring(0,2);
          const ampm = (horaMatch[3] || '').toUpperCase();
          if (ampm === 'PM' && h < 12) h += 12;
          if (ampm === 'AM' && h === 12) h = 0;
          citHoraVal = h.toString().padStart(2,'0') + ':' + m;
        }
      } else if (citGuardada.includes('T')) {
        citFechaVal = citGuardada.split('T')[0];
        citHoraVal = citGuardada.split('T')[1].substring(0,5);
      } else if (citGuardada.includes(' ')) {
        const partes = citGuardada.split(' ');
        citFechaVal = fechaAIso(partes[0]);
        citHoraVal = partes[1] ? partes[1].substring(0,5) : '';
      } else {
        citFechaVal = fechaAIso(citGuardada);
      }
      document.getElementById('f-citacion-fecha').value = citFechaVal;
      const horaSelect = document.getElementById('f-citacion-hora');
      horaSelect.value = citHoraVal;
    }

    // Consulta norma [32]=AG:CATASTRAL [33]=AH:FICHA [51]=AZ:POLIGONO [52]=BA:AMENAZA [53]=BB:SUELO
    document.getElementById('f-catastral').value = fila['CODIGO CATASTRAL'] || celda(fila, 32);
    document.getElementById('f-ficha').value = fila['N FICHA PREDIAL'] || fila['N° FICHA PREDIAL'] || celda(fila, 33);
    document.getElementById('f-poligono').value = fila['POLIGONO USO SUELO'] || celda(fila, 51);
    const amenaza = fila[52] || celda(fila,52) || '';
    if (amenaza) selRadVal('rg-amenaza', amenaza);
    const sueloProt = fila[53] || celda(fila,53) || '';
    if (sueloProt) selRadVal('rg-suelo-prot', sueloProt);

    // Retiro quebrada e infracciones
    // Retiro quebrada e infracciones [25]=Z:QUEBRADA [46]=AU:ACTUACION [23]=X:INFRACCION [17]=R:VISITADOR
    const quebradaVal = fila[25] || celda(fila, 25) || '';
    if (quebradaVal) selRadVal('rg-quebrada', quebradaVal);
    document.getElementById('transcripcion').value = fila['ACTUACION / OBSERVACIONES'] || celda(fila, 46);
    // Restaurar chips de infracción
    document.querySelectorAll('#chips-infraccion .chip-inf').forEach(c => c.classList.remove('activo'));
    document.getElementById('f-infraccion').value = fila['TIPO DE INFRACCION'] || celda(fila, 23);
    const infsGuardadas = (fila['TIPO DE INFRACCION'] || celda(fila, 23)).split(' | ');
    document.querySelectorAll('#chips-infraccion .chip-inf').forEach(c => {
      if (infsGuardadas.includes(c.dataset.val)) c.classList.add('activo');
    });
    // Restaurar chips de visitadores
    document.querySelectorAll('#chips-visitador .chip-vis').forEach(c => c.classList.remove('activo'));
    document.getElementById('f-visitador').value = fila['VISITADOR(ES)'] || celda(fila, 17);
    const visGuardados = (fila['VISITADOR(ES)'] || celda(fila, 17)).split(' / ');
    document.querySelectorAll('#chips-visitador .chip-vis').forEach(c => {
      if (visGuardados.includes(c.dataset.val)) c.classList.add('activo');
    });

    // Modo solo lectura para registros COMPLETADOS — solo el admin puede modificarlos desde Gestión
    if (ST._estadoVisita === 'COMPLETADO') {
      const formCont = document.getElementById('form-visita-contenedor');
      if (formCont) {
        formCont.querySelectorAll('input, textarea, select').forEach(el => {
          el.readOnly = true;
          el.disabled = true;
          el.style.background = 'var(--gris-bg)';
          el.style.pointerEvents = 'none';
        });
        formCont.querySelectorAll('.radio-opcion, .chip-vis, .chip-inf, .btn-seleccionable').forEach(el => {
          el.style.pointerEvents = 'none';
          el.style.opacity = '0.7';
        });
      }
      const btnGuardar = document.querySelector('[onclick="guardarRegistro()"]');
      if (btnGuardar) btnGuardar.style.display = 'none';
      const infoDiv = document.getElementById('info-nvisita');
      if (infoDiv) {
        infoDiv.style.display = 'block';
        infoDiv.textContent = ' Registro COMPLETADO — Solo lectura';
        infoDiv.style.background = '#f0f0f0';
        infoDiv.style.color = '#666';
        infoDiv.style.borderColor = '#ccc';
      }
    }
  }

  // Acordeón: inicializar (idempotente) + resetear estado + actualizar sticky de dirección
  inicializarAcordeon();
  resetearAcordeon();
  actualizarDireccionSticky();
}

function nuevaVisitaDesde(radicado, indices) {
  irA('pantalla-nueva-visita');
  setNav('nav-nueva');
  prepararFormulario(null);
  document.getElementById('f-radicado').value = radicado;
  ST.nVisita = indices.length + 1;
  const infoDiv = document.getElementById('info-nvisita');
  if (infoDiv) {
    infoDiv.textContent = 'Visita adicional N°' + ST.nVisita + ' · ' + radicado;
    infoDiv.style.display = 'block';
    infoDiv.style.background = 'var(--verde-bg)';
    infoDiv.style.color = 'var(--verde)';
  }
}

async function guardarRegistro() {
  if (ST._estadoVisita === 'COMPLETADO') {
    notif('Registro COMPLETADO — solo el admin puede modificarlo desde Gestión', 'error');
    return;
  }
  const fechaVisitaVal = document.getElementById('f-fecha-visita').value;

  // Sin bloqueo por panel — el inspector puede actualizar las veces necesarias

  // ── Validaciones obligatorias primera visita ──────────────
  const esEdicion = !!ST.filaEditando;
  if (!esEdicion) {
    const direccionV = document.getElementById('f-direccion').value.trim();
    const barrioV = document.getElementById('f-barrio').value.trim();
    const visitadorV = document.getElementById('f-visitador').value.trim();
    const atiendeNomV = document.getElementById('f-atiende-nombre').value.trim();
    const atiendeIdV = document.getElementById('f-atiende-id').value.trim();
    const telV = document.getElementById('f-atiende-tel').value.trim();
    const dirNotifV = document.getElementById('f-atiende-dir').value.trim();
    const emailV = document.getElementById('f-atiende-email').value.trim();
    const infraccionV = document.getElementById('f-infraccion').value.trim();
    const estadoObraV = getRadVal('rg-estado-obra');
    const telNoAporta = document.getElementById('tel-no-aporta')?.checked;
    const dirNoAporta = document.getElementById('dir-no-aporta')?.checked;
    const emailNoAporta = document.getElementById('email-no-aporta')?.checked;

    if (!direccionV) { notif('La dirección es obligatoria', 'error'); return; }
    if (!barrioV) { notif('El barrio es obligatorio', 'error'); return; }
    if (!fechaVisitaVal) { notif('La fecha de visita es obligatoria', 'error'); return; }
    if (!visitadorV) { notif('Selecciona al menos un visitador', 'error'); return; }
    if (!atiendeNomV && !document.getElementById('no-atiende')?.checked) { notif('El nombre de quien atiende es obligatorio', 'error'); return; }
    if (!atiendeIdV && !document.getElementById('no-atiende')?.checked) { notif('La identificación de quien atiende es obligatoria', 'error'); return; }
    if (!estadoObraV) { notif('El estado de la obra es obligatorio', 'error'); return; }
    if (!infraccionV) { notif('Selecciona al menos una infracción', 'error'); return; }
    // Teléfono: solo si no marcó no-atiende
    if (!document.getElementById('no-atiende')?.checked) {
      if (!telNoAporta) {
        const telLimpio = telV.replace(/\D/g,'');
        if (!telV || telLimpio.length !== 10) { notif('El teléfono debe tener 10 dígitos o marcar "No se aporta"', 'error'); return; }
      }
      if (!dirNoAporta && !dirNotifV) { notif('Ingresa la dirección de notificación o marca "No se aporta"', 'error'); return; }
      if (!emailNoAporta && !emailV) { notif('Ingresa el correo electrónico o marca "No se aporta"', 'error'); return; }
    }
  }
  // Citación: obligatoria en oficio SIEMPRE, y en PQR primera visita
  const citFechaV = document.getElementById('f-citacion-fecha').value.trim();
  const citHoraV = document.getElementById('f-citacion-hora').value.trim();
  const citNoAplicaV = document.getElementById('citacion-no-aplica')?.checked;
  if (ST.esOficio) {
    if (!citFechaV) { notif('La fecha de citación es obligatoria para visitas de oficio', 'error'); return; }
    if (!citHoraV) { notif('La hora de citación es obligatoria para visitas de oficio', 'error'); return; }
  } else if (!ST.filaEditando) {
    if (!citNoAplicaV && !citFechaV) { notif('Ingresa la fecha de citación o marca "No se deja citación"', 'error'); return; }
    if (!citNoAplicaV && citFechaV && !citHoraV) { notif('Ingresa la hora de citación', 'error'); return; }
  }
  // ── Fin validaciones ──────────────────────────────────────

  const suspVal = getRadVal('rg-suspension');
  const ordenVal = document.getElementById('f-orden').value.trim();

  let radicado;
  if (ST.esOficio) {
    if (!ordenVal) { notif('Para visita de oficio el N° de orden es obligatorio', 'error'); return; }
    radicado = 'OFICIO-' + ordenVal;
    document.getElementById('f-fecha-radicado').value = new Date().toISOString().split('T')[0];
  } else {
    // Solo validar orden si hay suspensión y NO es oficio
    if (suspVal === 'SI' && !ordenVal) { notif('El N° de orden es obligatorio cuando hay suspensión', 'error'); return; }
    radicado = document.getElementById('f-radicado').value.trim();
    if (!radicado) { notif('El radicado es obligatorio', 'error'); return; }
    // Anti-duplicado: si hay radicado existente PENDIENTE o INICIADO, actualizar esa fila
    if (!ST.filaEditando && ST.datos) {
      const filaExistente = ST.datos.find(f => {
        if ((f['RADICADO']||f[1]||'') !== radicado) return false;
        const est = (f['ESTADO VISITA']||f[13]||'').toUpperCase();
        return est === 'PENDIENTE' || est === 'PQR PENDIENTE' || est === 'ASIGNADO' || est === 'INICIADO' || est === 'REALIZADA';
      });
      if (filaExistente) {
        ST.filaEditando = filaExistente._idx;
      }
    }
  }

  notif('Guardando...', 'carga');

  // Estado: COMPLETADO solo si tiene norma + área + licencia + fotos + acta o informe
  const tieneNorma = document.getElementById('f-catastral').value.trim() ||
                     document.getElementById('f-ficha').value.trim() ||
                     document.getElementById('f-poligono').value.trim() ||
                     getRadVal('rg-amenaza') || getRadVal('rg-suelo-prot');
  const tieneArea = document.getElementById('f-area').value.trim() ||
                    document.getElementById('area-no-medible')?.checked;
  const tieneLicencia = getRadVal('rg-licencia-aportada');
  const tieneFotos = ST._fotosSubidas || ST._idCarpetaFotos;
  const estado = 'INICIADO'; // Solo el admin marca COMPLETADO desde la pestaña Gestión
  const obra = getRadVal('rg-estado-obra');
  const quebrada = getRadVal('rg-quebrada');
  const susp = getRadVal('rg-suspension');
  const fechaVisita = document.getElementById('f-fecha-visita').value;
  const citFecha = document.getElementById('f-citacion-fecha').value;
  const citHora = document.getElementById('f-citacion-hora').value;
  const citacion = citFecha && citHora ? citFecha + 'T' + citHora : '';

  // Observaciones de campo
  const actuacionFinal = document.getElementById('transcripcion').value.trim();

  // 26 columnas A-Z
  // Normalizar dirección
  const direccionRaw = document.getElementById('f-direccion').value.trim();
  const direccionNorm = normalizarDireccion(direccionRaw);
  if (direccionRaw !== direccionNorm) {
    document.getElementById('f-direccion').value = direccionNorm;
  }

  // Comuna: desde barrio seleccionado (oficio) o desde fila existente (PQR)
  // Índices 0-based: A=0 B=1 C=2 D=3 E=4(BARRIO) F=5(COMUNA) G=6(DENUNCIANTE)
  const comunaPreservada = ST._comunaOficio ||
    (ST._filaPendiente ? (ST._filaPendiente['COMUNA'] || ST._filaPendiente[5] || '') : '');
  const denuncPreservado = ST.esOficio
    ? 'Inspección de Control Urbano'
    : (ST._filaPendiente ? (ST._filaPendiente['DENUNCIANTE/REMITENTE'] || ST._filaPendiente[6] || '') : '');
  // ── Array vals — escribe desde col B (col A tiene fórmula) ──────
  // Estructura BD: 60 cols A→BH. appendRow usa getRange(fila,2,...) → empieza en B
  const vals = [
    radicado,                                                              // B  RADICADO
    isoAFecha(document.getElementById('f-fecha-radicado')?.value || ''), // C  FECHA RADICADO
    direccionNorm,                                                         // D  DIRECCION INFRACCION
    document.getElementById('f-barrio').value,                            // E  BARRIO/VEREDA
    comunaPreservada,                                                      // F  COMUNA
    capitalCadaPalabra(denuncPreservado),                                  // G  DENUNCIANTE/REMITENTE
    capitalCadaPalabra(document.getElementById('f-atiende-nombre').value), // H  NOMBRE PERSONA ATIENDE
    document.getElementById('f-atiende-id').value,                        // I  ID PERSONA ATIENDE
    document.getElementById('f-atiende-tel').value,                       // J  TELEFONO PERSONA ATIENDE
    getRadVal('rg-relacion'),                                              // K  RELACION CON EL EVENTO
    document.getElementById('f-atiende-dir').value,                       // L  DIR NOTIFICACION
    soloMinusculas(document.getElementById('f-atiende-email').value),      // M  CORREO ELECTRONICO
    estado,                                                                // N  ESTADO VISITA
    ST.filaEditando ? (ST._filaPendiente?.['FECHA ASIGNACION VISITA'] || ST._filaPendiente?.[14] || '') : hoyDDMMYYYY(), // O  FECHA ASIGNACION VISITA
    isoAFecha(fechaVisita),                                               // P  FECHA DE VISITA
    ST.nVisita || 1,                                                       // Q  N° VISITA
    document.getElementById('f-visitador').value,                         // R  VISITADOR(ES)
    '',                                                                    // S  FECHA 2DA VISITA
    '',                                                                    // T  VISITADOR2
    ST._filaPendiente ? (ST._filaPendiente['FECHA DEVOLUCION'] || ST._filaPendiente[20] || '') : '', // U  FECHA DEVOLUCION
    '',                                                                    // V  DIAS
    getRadVal('rg-estado-obra'),                                           // W  ESTADO OBRA
    document.getElementById('f-infraccion').value,                        // X  TIPO DE INFRACCION
    document.getElementById('f-area').value,                              // Y  AREA CONTRAVENCION m2
    quebrada,                                                              // Z  CUMPLE RETIRO QUEBRADA
    getRadVal('rg-rep-locativa'),                                          // AA REPARACION LOCATIVA
    getRadVal('rg-habitado'),                                              // AB HABITADO
    document.getElementById('f-altura-pisos').value,                      // AC ALTURA EN PISOS
    document.getElementById('f-dest-actuales').value,                     // AD N° DESTINACIONES ACTUALES
    document.getElementById('f-usos').value,                              // AE USOS ACTUALES
    document.getElementById('f-cubierta-actual').value,                   // AF TIPO CUBIERTA ACTUAL
    document.getElementById('f-catastral').value,                         // AG CODIGO CATASTRAL
    document.getElementById('f-ficha').value,                             // AH N° FICHA PREDIAL
    soloMayusculas(document.getElementById('f-licencia').value),          // AI N° LICENCIA
    getRadVal('rg-licencia-aportada'),                                    // AJ SE APORTO LICENCIA
    getRadVal('rg-licencia-aportada') === 'SI' ? isoAFecha(document.getElementById('f-fecha-licencia').value) : '',  // AK FECHA LICENCIA
    getRadVal('rg-licencia-aportada') === 'SI' ? document.getElementById('f-tipo-licencia').value : '',   // AL TIPO Y MODALIDAD LICENCIA
    getRadVal('rg-licencia-aportada') === 'SI' ? document.getElementById('f-pisos').value : '',           // AM PISOS APROBADOS
    getRadVal('rg-licencia-aportada') === 'SI' ? document.getElementById('f-destinaciones').value : '',   // AN DESTINACIONES LICENCIA
    getRadVal('rg-licencia-aportada') === 'SI' ? document.getElementById('f-cubierta').value : '',        // AO CUBIERTA LICENCIA
    getRadVal('rg-licencia-aportada') === 'SI' ? document.getElementById('f-sistema').value : '',         // AP SISTEMA ESTRUCTURAL
    getRadVal('rg-licencia-aportada') === 'SI' ? document.getElementById('f-obs-licencia').value : '',    // AQ OBS LICENCIA
    susp,                                                                  // AR SUSPENSION DE LA OBRA
    document.getElementById('f-orden').value,                             // AS N° ORDEN DE POLICIA
    citFecha ? (isoAFecha(citFecha) + (citHora ? ' · ' + ({'08:00':'8:00 AM','09:00':'9:00 AM','10:00':'10:00 AM','11:00':'11:00 AM','14:00':'2:00 PM','15:00':'3:00 PM','16:00':'4:00 PM'}[citHora] || citHora) : '')) : '', // AT FECHA CITACION
    primeraWordMayuscula(actuacionFinal),                                  // AU ACTUACION / OBSERVACIONES
    '',                                                                    // AV RADICADOS REITERADOS
    ST.gpsLat !== null ? ST.gpsLat.toFixed(6) : '',                       // AW LATITUD
    ST.gpsLon !== null ? ST.gpsLon.toFixed(6) : '',                       // AX LONGITUD
    ST.gpsLat !== null ? 'https://maps.google.com/?q=' + ST.gpsLat.toFixed(6) + ',' + ST.gpsLon.toFixed(6) : '', // AY MAPA
    soloMayusculas(document.getElementById('f-poligono').value),          // AZ POLIGONO USO SUELO
    getRadVal('rg-amenaza'),                                               // BA AMENAZA
    getRadVal('rg-suelo-prot'),                                            // BB SUELO DE PROTECCION
    '',                                                                    // BC PRIORIDAD
    '',                                                                    // BD LINK_DRIVE (se agrega con vals.push)
  ];

  try {
    showLoading('Guardando registro...', 'Por favor espera...');
    let linkDrive = '';
    const comunaVal = comunaPreservada || '';
    const direccionVal = direccionNorm;

    // Crear carpeta en Drive y obtener link
    if (comunaVal && direccionVal && fechaVisita) {
      try {
        const rCarpeta = await fetch(CFG.webhook + '?accion=crearCarpeta' +
          '&comuna=' + encodeURIComponent(comunaVal) +
          '&direccion=' + encodeURIComponent(direccionVal) +
          '&fecha=' + encodeURIComponent(fechaVisita) +
          '&nvisita=' + encodeURIComponent(ST.nVisita || 1));
        const dCarpeta = await rCarpeta.json();
        if (dCarpeta.ok) {
          linkDrive = dCarpeta.linkCarpeta || '';
          ST._idCarpetaFotos = dCarpeta.idFotos || '';
          ST._idCarpetaVisita = (dCarpeta.linkCarpeta || '').match(/folders\/([a-zA-Z0-9_-]+)/)?.[1] || '';
          ST._linkCarpetaDrive = dCarpeta.linkCarpeta || '';
        } else {
          console.error('[crearCarpeta] AS error:', dCarpeta.error);
          notif(' No se pudo crear carpeta en Drive: ' + (dCarpeta.error || 'error desconocido'), 'aviso');
        }
      } catch(eDrive) {
        console.error('[crearCarpeta] fetch error:', eDrive);
        notif(' Error de red al crear carpeta Drive — el registro se guardará sin link', 'aviso');
      }
    } else if (!comunaVal) {
      console.warn('[crearCarpeta] comunaVal vacío — no se crea carpeta. comunaPreservada:', comunaPreservada, 'ST._filaPendiente:', ST._filaPendiente, 'ST._comunaOficio:', ST._comunaOficio);
    }

    // Reemplazar placeholder LINK_DRIVE (última posición del array = BD)
    vals[vals.length - 1] = linkDrive; // BD columna LINK_DRIVE

    const fueEdicion = !!ST.filaEditando;
    if (ST.filaEditando) {
      await actualizarFila(ST.filaEditando, vals);
      notif(' Registro actualizado', 'exito');
    } else {
      const resAgregar = await agregarFila(vals);
      // Guardar la fila recién creada para que los siguientes guardados actualicen en vez de crear nueva fila
      if (resAgregar && resAgregar.fila) {
        ST.filaEditando = resAgregar.fila;
        ST._estadoVisita = 'INICIADO';
      }
      notif(' Registro guardado', 'exito');
      // WhatsApp automático solo en la primera creación
      enviarWhatsAppNuevoRegistro(vals);
    }
    // Después del primer guardado: cambiar botón y actualizar panel
    const btnGuardar = document.querySelector('[onclick="guardarRegistro()"]');
    if (btnGuardar) btnGuardar.innerHTML = ' Actualizar registro';
    // Mostrar sección fotos si hay carpeta Drive
    if (ST._idCarpetaFotos) {
      const secFotos = document.getElementById('seccion-fotos');
      const btnVerDrive = document.getElementById('btn-ver-fotos-drive');
      const btnF46 = document.querySelector('[onclick="descargarF46xlsx()"]');
      const btnF43 = document.getElementById('btn-generar-informe');
      if (secFotos) { secFotos.style.display = 'block'; }
      if (btnVerDrive && ST._linkCarpetaDrive) btnVerDrive.style.display = 'block';
      actualizarBotonesActa(); // calcula correctamente según yaHayActa
      if (btnF43) btnF43.style.display = '';
    }
    // Actualizar panel de estado
    setTimeout(actualizarPanelEstado, 300);
    hideLoading();
  } catch(e) {
    hideLoading();
    notif('Error: ' + e.message, 'error');
  }
}

// ═══════════════════════════════════════════
// WHATSAPP — Notificación automática al crear registro
// ═══════════════════════════════════════════
function enviarWhatsAppNuevoRegistro(vals) {
  try {
    const radicado   = vals[0]  || 'Sin radicado';
    const direccion  = vals[2]  || 'Sin dirección';
    const barrio     = vals[3]  || '';
    const fecha      = vals[14] || '';
    const visitador  = vals[16] || ST.usuario || '';
    const infraccion = vals[22] || '';
    const linkDrive  = vals[54] || '';

    const msg = ` *Nueva visita registrada*\n` +
      ` Radicado: ${radicado}\n` +
      ` ${direccion}${barrio ? ' · ' + barrio : ''}\n` +
      ` Fecha: ${fecha}\n` +
      ` Inspector: ${visitador}\n` +
      (infraccion ? ` Tipo: ${infraccion}\n` : '') +
      (linkDrive ? ` Drive: ${linkDrive}\n` : '') +
      `\n_Inspección N°9 · Control Urbano Bello_`;

    // Envío via webhook principal (evita CORS de callmebot)
    const url = CFG.webhook + '?accion=whatsapp&texto=' + encodeURIComponent(msg);
    fetch(url).catch(() => {});
  } catch(e) {
    console.warn('WhatsApp no enviado:', e.message);
  }
}

// ═══════════════════════════════════════════
// INFORME F-GGO-43
// ═══════════════════════════════════════════
function mostrarPanelInforme() {
  ST._informeGenerado = true;
  actualizarPanelEstado();
  const obs = document.getElementById('transcripcion').value.trim();
  const rad = document.getElementById('f-radicado').value.trim();
  if (!obs) { notif('Graba observaciones de campo primero', 'error'); return; }
  if (!rad) { notif('Ingresa el radicado', 'error'); return; }
  document.getElementById('form-visita-contenedor').style.display = 'none';
  document.getElementById('panel-informe').style.display = 'block';
  document.getElementById('spin-informe').style.display = 'flex';
  document.getElementById('texto-informe').style.display = 'none';
  generarInforme(rad, obs);
}

async function generarInforme(radicado, transcripcion) {
  const prompt = `Eres un especialista en informes técnicos de control urbanístico para la Inspección N°9 de Control Urbano de la Alcaldía de Bello, Antioquia, Colombia. Marco normativo: Ley 388/97, Decreto 1077/15, Ley 400/97, NSR-10, Ley 1801/16 Art.135 Lit.A/C/D, POT Acuerdo 033/09, Decreto 193/11.

Genera un informe técnico formal F-GGO-43 con los siguientes datos:

RADICADO: ${radicado}
N° LICENCIA: ${document.getElementById('f-licencia').value || 'No se aportó licencia'}
TIPO DE INFRACCIÓN: ${document.getElementById('f-infraccion').value || 'Por determinar en campo'}
ÁREA EN CONTRAVENCIÓN: ${document.getElementById('f-area').value === 'NO MEDIBLE' ? 'No se pudo medir' : (document.getElementById('f-area').value || 'Por determinar')} m²
PRESUNTO INFRACTOR: ${document.getElementById('f-infractor').value || 'Sin identificar'}
INSPECTOR: ${document.getElementById('f-visitador').value || ST.usuario}
CARGO: ${ST.cargo}
RETIRO DE QUEBRADA: ${getRadVal('rg-quebrada')}
SUSPENSIÓN: ${getRadVal('rg-suspension')}

OBSERVACIONES DE CAMPO (dictadas por el inspector):
"${transcripcion}"

Genera el informe con estas secciones exactas:
1. ANTECEDENTES
2. OBSERVACIONES DE CAMPO
3. NORMATIVIDAD APLICABLE
4. ANÁLISIS DE LICENCIA (si se aportó licencia, sino indicar ausencia)
5. CONCLUSIONES Y RECOMENDACIONES (mínimo 3 conclusiones numeradas y 2 recomendaciones numeradas)

Usa tono formal y técnico. Resalta en MAYÚSCULAS los términos normativos clave. Si hay ausencia de licencia o desajustes, tipifica la conducta según el Art.135 de la Ley 1801/2016.`;

  try {
    const r = await fetch(CFG.webhook + '?accion=mejorarTexto&texto=' + encodeURIComponent(prompt));
    const data = await r.json();
    const texto = data.texto || 'Error generando informe';
    document.getElementById('spin-informe').style.display = 'none';
    document.getElementById('texto-informe').style.display = 'block';
    document.getElementById('texto-informe').value = texto;
  } catch(e) {
    document.getElementById('spin-informe').style.display = 'none';
    document.getElementById('texto-informe').style.display = 'block';
    document.getElementById('texto-informe').value = 'Error conectando con Claude: ' + e.message;
  }
}

function copiarInforme() {
  navigator.clipboard.writeText(document.getElementById('texto-informe').value)
    .then(() => notif(' Informe copiado', 'exito'))
    .catch(() => notif('Selecciona y copia manualmente', 'info'));
}

// ═══════════════════════════════════════════
// GPS + MAPA LEAFLET
// ═══════════════════════════════════════════
function obtenerGPS() {
  if (ST.gpsLat !== null && ST.gpsLon !== null) {
    notif('GPS ya registrado. Arrastra el pin en el mapa para corregir.', 'info');
    return;
  }
  document.getElementById('gps-dir').textContent = 'Obteniendo ubicación...';
  navigator.geolocation.getCurrentPosition(pos => {
    ST.gpsLat = pos.coords.latitude;
    ST.gpsLon = pos.coords.longitude;
    const precision = Math.round(pos.coords.accuracy);
    document.getElementById('gps-coords').textContent =
      `${ST.gpsLat.toFixed(6)}, ${ST.gpsLon.toFixed(6)}`;
    document.getElementById('gps-dir').textContent =
      `Precisión GPS: ±${precision} m`;
    document.getElementById('btn-mapa').style.display = 'inline-flex';
    notif(` Ubicación obtenida (±${precision}m) — ajusta el pin si es necesario`, 'exito');
    mostrarMapaGPS(ST.gpsLat, ST.gpsLon, true);
    consultarNormaPOT(ST.gpsLat, ST.gpsLon);
    actualizarPanelEstado();
  }, err => {
    document.getElementById('gps-dir').textContent = 'No se pudo obtener: ' + err.message;
    notif('Error GPS: ' + err.message, 'error');
  }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
}

// Muestra/actualiza el mapa Leaflet con un pin arrastrable
function mostrarMapaGPS(lat, lng, draggable) {
  const contenedor = document.getElementById('mapa-gps-container');
  const hint = document.getElementById('mapa-gps-hint');
  if (!contenedor) return;

  contenedor.style.display = 'block';
  if (hint) hint.style.display = draggable ? 'block' : 'none';

  if (!ST._leafletMap) {
    // Cargar Leaflet JS de forma diferida si no está cargado
    const initMap = () => {
      ST._leafletMap = L.map('mapa-gps-container').setView([lat, lng], 18);
      // Capa satélite ESRI (gratuita, sin API key)
      L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: '© Esri',
        maxZoom: 20
      }).addTo(ST._leafletMap);

      ST._leafletMarker = L.marker([lat, lng], { draggable: draggable }).addTo(ST._leafletMap);

      if (draggable) {
        ST._leafletMarker.on('dragend', () => {
          const pos = ST._leafletMarker.getLatLng();
          ST.gpsLat = pos.lat;
          ST.gpsLon = pos.lng;
          document.getElementById('gps-coords').textContent =
            `${pos.lat.toFixed(6)}, ${pos.lng.toFixed(6)}`;
          document.getElementById('gps-dir').textContent = 'Ajustado manualmente — reconsultando norma...';
          notif(' Coordenadas actualizadas — consultando norma POT', 'exito');
          // Re-consultar norma POT con el nuevo punto
          consultarNormaPOT(pos.lat, pos.lng);
          // Persistir coordenadas ajustadas en BD si hay fila en edición
          if (ST.filaEditando) actualizarCoordenadasEnBD(pos.lat, pos.lng);
        });
      }
      // Forzar redibujado (necesario si el contenedor estaba oculto)
      setTimeout(() => ST._leafletMap.invalidateSize(), 350);
    };

    if (typeof L === 'undefined') {
      // Leaflet JS aún no cargado — cargarlo dinámicamente
      const script = document.createElement('script');
      script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      script.onload = initMap;
      document.head.appendChild(script);
    } else {
      initMap();
    }
  } else {
    // Mapa ya existe — mover a nueva posición
    ST._leafletMap.setView([lat, lng], 18);
    ST._leafletMarker.setLatLng([lat, lng]);
    if (draggable) {
      ST._leafletMarker.dragging.enable();
    } else {
      ST._leafletMarker.dragging.disable();
    }
    setTimeout(() => ST._leafletMap.invalidateSize(), 350);
  }
}

// Guarda coordenadas ajustadas en BD sin reescribir toda la fila
async function actualizarCoordenadasEnBD(lat, lon) {
  if (!ST.filaEditando) return;
  try {
    const r = await fetch(CFG.webhook, {
      method: 'POST',
      body: JSON.stringify({
        accion: 'actualizarCoordenadas',
        fila: ST.filaEditando,
        lat: lat.toFixed(6),
        lon: lon.toFixed(6),
        mapa: `https://maps.google.com/?q=${lat.toFixed(6)},${lon.toFixed(6)}`
      })
    });
    if (r.ok) {
      document.getElementById('gps-dir').textContent = 'Coordenadas guardadas en BD ';
    }
  } catch(e) {
    console.warn('[GPS] No se pudo guardar coordenadas en BD:', e);
  }
}

// Destruye/oculta el mapa al resetear formulario
function resetearMapaGPS() {
  const contenedor = document.getElementById('mapa-gps-container');
  const hint = document.getElementById('mapa-gps-hint');
  if (contenedor) contenedor.style.display = 'none';
  if (hint) hint.style.display = 'none';
  if (ST._leafletMap) {
    ST._leafletMap.remove();
    ST._leafletMap = null;
    ST._leafletMarker = null;
  }
}

// Consultar norma usando coordenadas GPS ya capturadas
function consultarNormaPorGPS() {
  if (ST.gpsLat === null || ST.gpsLon === null) {
    notif('Captura el GPS primero en la sección de Ubicación', 'error');
    return;
  }
  consultarNormaPOT(ST.gpsLat, ST.gpsLon);
}

// Consultar norma geocodificando la dirección ingresada
async function consultarNormaPorDireccion() {
  const dir = document.getElementById('f-direccion')?.value?.trim();
  if (!dir) {
    notif('Ingresa la dirección del inmueble primero', 'error');
    return;
  }
  const spinPOT = document.getElementById('spin-pot');
  if (spinPOT) spinPOT.style.display = 'block';

  try {
    // Generar variantes de la dirección para Google Maps
    const dirNorm = normalizarDireccionGoogle(dir);
    const variantes = [
      // Formato Google con Calle/Carrera
      dirNorm + ', Bello, Antioquia, Colombia',
      // Formato original colombiano
      dir + ', Bello, Antioquia, Colombia',
      // Sin Antioquia
      dirNorm + ', Bello, Colombia',
      // Solo dirección + municipio
      dir + ', Bello',
    ];

    let lat = null, lon = null, queryUsada = '';

    for (const query of variantes) {
      // Geocoding vía webhook (la clave Maps vive en Apps Script, no en el frontend)
      const url = `${CFG.webhook}?accion=geocode&address=${encodeURIComponent(query)}`;
      const r = await fetch(url);
      const respuesta = await r.json();
      if (!respuesta.ok) { console.warn('geocode webhook:', respuesta.error); continue; }
      const data = respuesta.data;

      console.log(`Geocoding "${query}": status=${data.status}, results=${data.results?.length || 0}`);

      if (data.status === 'OK' && data.results.length > 0) {
        const loc = data.results[0].geometry.location;
        console.log(`Resultado: lat=${loc.lat}, lng=${loc.lng}`);
        // Bounding box de Bello (más holgado)
        if (loc.lat >= 6.18 && loc.lat <= 6.55 && loc.lng >= -75.75 && loc.lng <= -75.40) {
          lat = loc.lat;
          lon = loc.lng;
          queryUsada = query;
          break;
        } else {
          console.log(`Fuera de Bello: lat=${loc.lat}, lng=${loc.lng}`);
        }
      }
    }

    if (lat && lon) {
      notif(` Dirección encontrada`, 'exito');
      await consultarNormaPOT(lat, lon);
    } else {
      notif('No se encontró la dirección en Bello. Verifica el formato (ej: CL 50 32-10) o usa GPS.', 'error');
      if (spinPOT) spinPOT.style.display = 'none';
    }
  } catch(e) {
    console.error('Error geocoding:', e);
    notif('Error al consultar dirección: ' + e.message, 'error');
    if (spinPOT) spinPOT.style.display = 'none';
  }
}

// Normalizar dirección colombiana para Google Maps
// CR 54 63-96 → Carrera 54 #63-96
// CL 50 32-10 → Calle 50 #32-10
function normalizarDireccionGoogle(dir) {
  let d = dir.trim().toUpperCase();
  // Reemplazar prefijos
  d = d.replace(/^CL\s+/i, 'Calle ')
       .replace(/^CR\s+/i, 'Carrera ')
       .replace(/^KR\s+/i, 'Carrera ')
       .replace(/^TV\s+/i, 'Transversal ')
       .replace(/^AV\s+/i, 'Avenida ')
       .replace(/^DG\s+/i, 'Diagonal ')
       .replace(/^CQ\s+/i, 'Circular ');
  // Convertir número de placa: "50 32-10" → "50 #32-10"
  d = d.replace(/(\d+[A-Z]?)\s+(\d+[A-Z]?-\d+)/, '$1 #$2');
  return d;
}

// ═══════════════════════════════════════════
// MEJORAR REDACCIÓN CON IA
// ═══════════════════════════════════════════
// El webhook (Apps Script) implementa internamente el encadenamiento de IA
// (Claude → DeepSeek → Gemini → Groq). Las claves nunca salen del backend.
async function mejorarRedaccion() {
  const textarea = document.getElementById('transcripcion');
  const texto = textarea.value.trim();
  if (!texto) { notif('Escribe o graba primero la descripción', 'error'); return; }
  const btn = document.getElementById('btn-mejorar');
  btn.disabled = true;
  btn.textContent = ' Mejorando...';

  const SYSTEM_PROMPT = `Eres un inspector de control urbano del municipio de Bello, Colombia con años de experiencia. Tu tarea es mejorar el texto que te envío manteniendo mi tono y mi forma de expresarme — que suene como lo escribí yo, no como una IA.

Reglas:
- No sugerir nada, solo reescribir el texto
- Mejorar la redacción, claridad y precisión técnica sin volverlo robótico ni demasiado formal
- Organizar la información en orden cronológico y lógico
- Identificar correctamente los elementos arquitectónicos, urbanísticos y estructurales observados
- Describir la situación de forma objetiva, cortés y técnicamente fundamentada
- Conservar fielmente todos los hechos, sin añadir información no verificada
- El texto debe sonar humano y natural, como lo escribiría un inspector con experiencia — fluido, directo, sin palabras rebuscadas
- Escribe en prosa continua, en un solo párrafo, sin listas ni numeración
- NO uses estas palabras: reglamentario, normativo, vigente, pertinente, correspondiente, establecido, aplicable, normatividad, constatar, reglamentación
- NO cites artículos ni leyes
- NO agregues conclusiones, recomendaciones ni acciones a tomar
- NO inventes ni agregues información que no esté en el texto original
- Responde SOLO con el texto reescrito, sin explicaciones ni comentarios`;

  let textMejorado = null;
  let errorMsg = '';

  try {
    showLoading('Mejorando redacción con IA...', 'Conectando con el servidor...');
    const resp = await fetch(CFG.webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ accion: 'mejorarTexto', texto: SYSTEM_PROMPT + '\n\n' + texto })
    });
    const d = await resp.json();
    if (d.ok && d.texto) {
      textMejorado = d.texto;
    } else {
      errorMsg = d.error || 'Sin respuesta';
    }
  } catch(e) {
    console.warn('mejorarRedaccion: webhook falló:', e.message);
    errorMsg = e.message;
  }

  hideLoading();
  btn.disabled = false;
  btn.innerHTML = '<span class="ico "><svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"/></svg></span> Mejorar';

  if (textMejorado) {
    const conf = confirm(`TEXTO MEJORADO:\n\n${textMejorado}\n\n¿Reemplazar el texto original?`);
    if (conf) textarea.value = textMejorado;
  } else {
    notif('No se pudo mejorar el texto. Verifica tu conexión.', 'error');
  }
}


// ═══════════════════════════════════════════
// NORMALIZACIÓN DE TEXTO PARA BD
// ═══════════════════════════════════════════
// Convertir fecha ISO (YYYY-MM-DD) a DD/MM/YYYY para BD
function isoAFecha(iso) {
  if (!iso) return '';
  const p = iso.toString().trim().split('-');
  if (p.length === 3 && p[0].length === 4) return p[2] + '/' + p[1] + '/' + p[0];
  return iso; // devolver tal cual si no es formato ISO
}
// Convierte DD/MM/YYYY → YYYY-MM-DD para inputs tipo date
function fechaAIso(fecha) {
  if (!fecha) return '';
  const s = fecha.toString().trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.substring(0, 10); // ya en ISO
  const p = s.split('/');
  if (p.length === 3 && p[2].length === 4)
    return p[2] + '-' + p[1].padStart(2,'0') + '-' + p[0].padStart(2,'0');
  return s;
}
// Obtener fecha de hoy en DD/MM/YYYY
function hoyDDMMYYYY() {
  const hoy = new Date();
  const d = String(hoy.getDate()).padStart(2,'0');
  const m = String(hoy.getMonth()+1).padStart(2,'0');
  return d + '/' + m + '/' + hoy.getFullYear();
}

// ═══════════════════════════════════════════
// Capital cada palabra: "juan pablo" → "Juan Pablo"
function capitalCadaPalabra(s) {
  if (!s) return '';
  return s.trim().replace(/\w\S*/g, w =>
    w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
  );
}
// Solo mayúsculas
function soloMayusculas(s) {
  if (!s) return '';
  return s.trim().toUpperCase();
}
// Solo minúsculas
function soloMinusculas(s) {
  if (!s) return '';
  return s.trim().toLowerCase();
}
// Primera palabra mayúscula, resto como viene
function primeraWordMayuscula(s) {
  if (!s) return '';
  s = s.trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ═══════════════════════════════════════════
// CONSULTA NORMA POT — Turf.js + GeoJSON GitHub
// ═══════════════════════════════════════════
const POT_BASE = 'https://raw.githubusercontent.com/controlurbano9/pot-bello/main/';
const POT_CACHE = {};

async function cargarGeoJSON(nombre) {
  if (POT_CACHE[nombre]) return POT_CACHE[nombre];
  try {
    const r = await fetch(POT_BASE + nombre);
    const data = await r.json();
    POT_CACHE[nombre] = data;
    return data;
  } catch(e) {
    console.warn('Error cargando ' + nombre, e);
    return null;
  }
}

async function consultarNormaPOT(lat, lon) {
  const punto = turf.point([lon, lat]);
  const spinPOT = document.getElementById('spin-pot');
  if (spinPOT) spinPOT.style.display = 'block';

  try {
    // Cargar capas en paralelo incluyendo barrios, veredas y retiros
    const [usoSuelo, sueloProtec, amenazas, barrios, veredas, retiros] = await Promise.all([
      cargarGeoJSON('UsoGeneralSuelo.geojson'),
      cargarGeoJSON('SueloProteccion.geojson'),
      cargarGeoJSON('AmenazasNaturales.geojson'),
      cargarGeoJSON('Barrios.geojson'),
      cargarGeoJSON('Veredas.geojson'),
      // Intentar varios nombres posibles para el archivo de retiros
      cargarGeoJSON('RetirosCorrientesHidricas.geojson')
        .catch(() => cargarGeoJSON('Retiros_Corrientes_Hidricas.geojson'))
        .catch(() => cargarGeoJSON('RetiroQuebradas.geojson'))
        .catch(() => null)
    ]);

    // 1. Uso general del suelo → campo Polígono
    if (usoSuelo) {
      for (const feat of usoSuelo.features) {
        if (turf.booleanPointInPolygon(punto, feat)) {
          const props = feat.properties;
          // Usar CATEG_1 como campo de polígono POT
          const poligono = props.CATEG_1 || props.Categ_1 || props.categ_1 ||
                          props.CODIGO || props.USO || props.SIMBOLO ||
                          props.CLASIFICA || Object.values(props).find(v => v && typeof v === 'string' && v.length < 20) || '';
          if (poligono) {
            document.getElementById('f-poligono').value = poligono;
            notif(` Polígono POT: ${poligono}`, 'exito');
          }
          break;
        }
      }
    }

    // 2. Suelo de protección
    let esSueloProteccion = false;
    if (sueloProtec) {
      for (const feat of sueloProtec.features) {
        if (turf.booleanPointInPolygon(punto, feat)) {
          esSueloProteccion = true;
          break;
        }
      }
    }
    selRadVal('rg-suelo-prot', esSueloProteccion ? 'SI' : 'NO');

    // 3. Amenaza
    let esAmenaza = false;
    if (amenazas) {
      for (const feat of amenazas.features) {
        if (feat.geometry.type === 'Point') {
          if (turf.distance(punto, turf.point(feat.geometry.coordinates)) < 0.05) {
            esAmenaza = true; break;
          }
        } else {
          try {
            if (turf.booleanPointInPolygon(punto, feat)) { esAmenaza = true; break; }
          } catch(e) {}
        }
      }
    }
    selRadVal('rg-amenaza', esAmenaza ? 'SI' : 'NO');

    // 4. Barrio o Vereda automático
    let nombreLugar = '';
    // Primero buscar en barrios
    if (barrios) {
      for (const feat of barrios.features) {
        try {
          if (turf.booleanPointInPolygon(punto, feat)) {
            const props = feat.properties;
            nombreLugar = props.NOM_BARRIO || props.nom_barrio ||
                         props.NOMBRE || props.nombre ||
                         props.BARRIO || props.barrio ||
                         props.NAME || props.name ||
                         props.NOMB_BARRI || props.nomb_barri || '';
            // Log para diagnóstico
            if (!nombreLugar) console.log('Barrio sin nombre — props:', JSON.stringify(props));
            break;
          }
        } catch(e) {}
      }
    }
    // Si no encontró en barrios, buscar en veredas
    if (!nombreLugar && veredas) {
      for (const feat of veredas.features) {
        try {
          if (turf.booleanPointInPolygon(punto, feat)) {
            nombreLugar = feat.properties.NOMBRE || feat.properties.nombre || '';
            break;
          }
        } catch(e) {}
      }
    }
    // Fallback: si GeoJSON no encontró barrio/vereda, usar Google Geocoding vía webhook
    if (!nombreLugar) {
      try {
        const geoUrl = `${CFG.webhook}?accion=geocode&latlng=${lat},${lon}`;
        const geoR = await fetch(geoUrl);
        const geoResp = await geoR.json();
        const geoData = geoResp.ok ? geoResp.data : null;
        if (geoData && geoData.status === 'OK') {
          for (const result of geoData.results) {
            const comp = result.address_components.find(c =>
              c.types.includes('neighborhood') ||
              c.types.includes('sublocality_level_1') ||
              c.types.includes('sublocality')
            );
            if (comp) { nombreLugar = comp.long_name; break; }
          }
        }
      } catch(eGeo) { console.warn('Geocoding fallback barrio:', eGeo.message); }
    }

    if (nombreLugar) {
      const selBarrio = document.getElementById('f-barrio');
      if (selBarrio) {
        // Normalización básica
        const norm = s => s.toUpperCase().trim()
          .replace(/Nº|N°|NRO\.?|NO\.\s*/gi, 'N')
          .replace(/[ÁÀÂÄ]/g,'A').replace(/[ÉÈÊË]/g,'E')
          .replace(/[ÍÌÎÏ]/g,'I').replace(/[ÓÒÔÖ]/g,'O')
          .replace(/[ÚÙÛÜ]/g,'U').replace(/Ñ/g,'N')
          .replace(/[^A-Z0-9\s]/g,'').replace(/\s+/g,' ').trim();

        // Similitud por coeficiente de Dice (bigramas) con penalización por números distintos
        const similitud = (a, b) => {
          if (!a || !b) return 0;
          if (a === b) return 1;
          // Penalización: si terminan en números distintos → similitud 0
          const numFinalA = a.match(/\d+$/)?.[0];
          const numFinalB = b.match(/\d+$/)?.[0];
          if (numFinalA && numFinalB && numFinalA !== numFinalB) return 0;
          // Bigramas
          const bigramas = s => {
            const set = new Set();
            for (let i = 0; i < s.length - 1; i++) set.add(s[i] + s[i+1]);
            return set;
          };
          const ba = bigramas(a), bb = bigramas(b);
          let inter = 0;
          ba.forEach(g => { if (bb.has(g)) inter++; });
          return (2 * inter) / (ba.size + bb.size);
        };

        const normNombre = norm(nombreLugar);

        if (selBarrio.tagName === 'SELECT') {
          const opciones = Array.from(selBarrio.options).filter(o => o.value);
          // Buscar la opción con mayor similitud
          let mejorMatch = null, mejorScore = 0;
          opciones.forEach(op => {
            const opNorm = norm(op.text);
            const score = similitud(normNombre, opNorm);
            if (score > mejorScore) { mejorScore = score; mejorMatch = op; }
          });

          // Umbral mínimo de similitud: 0.5
          if (mejorMatch && mejorScore >= 0.5) {
            selBarrio.value = mejorMatch.value;
            asignarComunaDesdeBarrio(selBarrio);
            notif(` ${nombreLugar} detectado automáticamente`, 'exito');
          } else {
            notif(`Barrio detectado: ${nombreLugar} — selecciona manualmente`, 'carga');
            console.log('Sin coincidencia para:', nombreLugar, '→', normNombre, '| mejor:', mejorMatch?.text, mejorScore);
          }
        } else {
          selBarrio.value = nombreLugar;
          asignarComunaDesdeBarrio(selBarrio);
          notif(` ${nombreLugar} detectado automáticamente`, 'exito');
        }
      }
    } else {
      console.log('No se encontró barrio/vereda. Coords:', punto.geometry.coordinates, '| Features barrios:', barrios ? barrios.features.length : 'NULL', '| Features veredas:', veredas ? veredas.features.length : 'NULL');
      notif('No se detectó barrio — selecciona manualmente', 'carga');
    }

    // 5. Retiro de quebrada
    let enRetiro = false;
    if (retiros) {
      for (const feat of retiros.features) {
        try {
          if (feat.geometry.type === 'Polygon' || feat.geometry.type === 'MultiPolygon') {
            if (turf.booleanPointInPolygon(punto, feat)) { enRetiro = true; break; }
          } else if (feat.geometry.type === 'LineString' || feat.geometry.type === 'MultiLineString') {
            // Para líneas verificar distancia < 30 metros
            const linea = turf.feature(feat.geometry);
            const distancia = turf.pointToLineDistance(punto, linea, { units: 'meters' });
            if (distancia < 30) { enRetiro = true; break; }
          }
        } catch(e) {}
      }
    }
    selRadVal('rg-quebrada', enRetiro ? 'SI' : 'NO');

    actualizarPanelEstado();
    notif(' Norma POT consultada automáticamente', 'exito');

  } catch(e) {
    notif('Error consultando norma POT', 'error');
    console.error(e);
  } finally {
    if (spinPOT) spinPOT.style.display = 'none';
  }
}

function abrirMapa() {
  if (ST.gpsLat) window.open(`https://maps.google.com/?q=${ST.gpsLat},${ST.gpsLon}`, '_blank');
}

// ═══════════════════════════════════════════
// GRABACIÓN DE VOZ
// ═══════════════════════════════════════════
function iniciarVoz() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { notif('Usa Chrome o Edge para grabación de voz', 'error'); return; }
  reconVoz = new SR();
  reconVoz.lang = 'es-CO';
  reconVoz.continuous = true;
  reconVoz.interimResults = true;
  let base = document.getElementById('transcripcion').value;
  reconVoz.onresult = e => {
    let int = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      if (e.results[i].isFinal) base += e.results[i][0].transcript + ' ';
      else int += e.results[i][0].transcript;
    }
    document.getElementById('transcripcion').value = base + int;
  };
  reconVoz.onerror = e => { notif('Error micrófono: ' + e.error, 'error'); detenerVoz(); };
  reconVoz.onend = () => { if (grabando) reconVoz.start(); };
  reconVoz.start();
  grabando = true;
  document.getElementById('btn-grabar').style.display = 'none';
  document.getElementById('btn-detener').style.display = 'inline-flex';
  document.getElementById('voz-ind').classList.add('activo');
  document.getElementById('voz-estado').textContent = 'Grabando...';
}

function detenerVoz() {
  grabando = false;
  if (reconVoz) reconVoz.stop();
  document.getElementById('btn-grabar').style.display = 'inline-flex';
  document.getElementById('btn-detener').style.display = 'none';
  document.getElementById('voz-ind').classList.remove('activo');
  document.getElementById('voz-estado').textContent = 'Listo';
}

// ═══════════════════════════════════════════
// UTILIDADES
// ═══════════════════════════════════════════
function celda(fila, idx) {
  // Leer celda de forma segura — devuelve '' si la fila es corta
  return (fila && fila[idx] !== undefined && fila[idx] !== null) ? fila[idx].toString().trim() : '';
}

async function verificarRadicado() {
  const radicado = document.getElementById('f-radicado').value.trim();
  if (!radicado) { notif('Ingresa un radicado', 'error'); return; }

  // Limpiar todos los campos ANTES de cargar nuevo radicado
  desbloquearCamposVisita();
  document.getElementById('f-visitador').value = '';
  document.querySelectorAll('#chips-visitador .chip-vis').forEach(c => c.classList.remove('activo'));
  document.querySelectorAll('#chips-infraccion .chip-inf').forEach(c => c.classList.remove('activo'));
  document.getElementById('f-infraccion').value = '';
  document.getElementById('f-area').value = '';
  document.getElementById('f-orden').value = '';
  document.getElementById('f-citacion-fecha').value = '';
  document.getElementById('f-citacion-hora').value = '';
  document.getElementById('transcripcion').value = '';
  document.getElementById('f-altura-pisos').value = '';
  document.getElementById('f-dest-actuales').value = '';
  resetChipsUsosCubierta();
  document.getElementById('f-fecha-radicado').value = '';
  document.getElementById('grupo-fecha-radicado').style.display = 'none';
  document.getElementById('info-nvisita').style.display = 'none';
  toggleLicencia('NO');
  selRadVal('rg-quebrada', 'PENDIENTE VERIFICAR');
  toggleOrden('SI');
  toggleSuspensionPorEstado('En proceso / iniciada');

  notif('Verificando...', 'carga');
  try {
    const { datos } = await leerHojaConHeaders();
    const coincidencias = datos.filter(f => (f['RADICADO']||'').toUpperCase() === radicado.toUpperCase());
    const infoDiv = document.getElementById('info-nvisita');
    const grupoFecha = document.getElementById('grupo-fecha-radicado');

    if (coincidencias.length > 0) {
      // Buscar registro activo (pendiente, asignado, iniciado) — si existe, actualizar en lugar de crear nuevo
      const ESTADOS_ACTIVOS = ['PENDIENTE','PQR PENDIENTE','ASIGNADO','INICIADO','REALIZADA'];
      const activoIdx = coincidencias.findIndex(f =>
        ESTADOS_ACTIVOS.includes((f['ESTADO VISITA'] || f[13] || '').toUpperCase())
      );
      let nVisita;
      if (activoIdx >= 0) {
        const activo = coincidencias[activoIdx];
        nVisita = Number(activo['N° VISITA'] || activo[16]) || 1;
        ST.filaEditando = activo._idx;
        ST._filaPendiente = activo;
      } else {
        nVisita = coincidencias.length + 1;
        ST._filaPendiente = null;
        ST.filaEditando = null;
      }
      ST.nVisita = nVisita;
      ST.radicadoEncontrado = true;
      const ultima = coincidencias[coincidencias.length - 1];
      const primera = coincidencias[0];

      // 1. Autocargar ubicación (bloqueada — viene de visita anterior)
      document.getElementById('f-direccion').value = primera['DIRECCION INFRACCION'] || primera[3] || '';
      document.getElementById('f-direccion').readOnly = true;
      document.getElementById('f-direccion').style.background = 'var(--gris-bg)';
      document.getElementById('f-barrio').value = primera['BARRIO/VEREDA'] || primera[4] || '';
      document.getElementById('f-barrio').disabled = true;
      document.getElementById('f-barrio').style.background = 'var(--gris-bg)';

      // GPS de la visita anterior si existe — cols AW=48 AX=49
      const latAnterior = ultima['LATITUD'] || ultima[48] || '';
      const lonAnterior = ultima['LONGITUD'] || ultima[49] || '';
      if (latAnterior && lonAnterior) {
        ST.gpsLat = parseFloat(latAnterior);
        ST.gpsLon = parseFloat(lonAnterior);
        document.getElementById('gps-coords').textContent = latAnterior + ', ' + lonAnterior;
        document.getElementById('gps-dir').textContent = 'Ubicación de visita anterior';
        document.getElementById('btn-mapa').style.display = 'inline-flex';
      }

      // 2. Autocargar consulta norma (bloqueada)
      const catastral = document.getElementById('f-catastral');
      const ficha = document.getElementById('f-ficha');
      const poligono = document.getElementById('f-poligono');
      // Columnas: AG=32 CATASTRAL, AH=33 FICHA, AZ=51 POLIGONO
      const catVal = ultima['CODIGO CATASTRAL'] || ultima[32] || '';
      const ficVal = ultima['N FICHA PREDIAL'] || ultima['N° FICHA PREDIAL'] || ultima[33] || '';
      const polVal = ultima['POLIGONO USO SUELO'] || ultima[51] || '';
      if (catastral && catVal) { catastral.value = catVal; catastral.readOnly = true; catastral.style.background = 'var(--gris-bg)'; }
      if (ficha && ficVal) { ficha.value = ficVal; ficha.readOnly = true; ficha.style.background = 'var(--gris-bg)'; }
      if (poligono && polVal) { poligono.value = polVal; poligono.readOnly = true; poligono.style.background = 'var(--gris-bg)'; }

      // 3. Mostrar persona que atendió en visita anterior
      // Columnas: H=7 I=8 J=9 K=10 L=11 M=12
      const nombreAnterior = ultima['NOMBRE PERSONA ATIENDE'] || ultima[7] || '';
      const idAnterior = ultima['ID PERSONA ATIENDE'] || ultima[8] || '';
      const telAnterior = ultima['TELEFONO PERSONA ATIENDE'] || ultima[9] || '';
      const relAnterior = ultima['RELACION CON EL EVENTO'] || ultima[10] || '';
      const dirAnterior = ultima['DIR NOTIFICACION'] || ultima[11] || '';
      const emailAnterior = ultima['CORREO ELECTRONICO'] || ultima[12] || '';

      if (nombreAnterior && nVisita > 1) {
        // Solo mostrar datos bloqueados cuando es visita 3+ (hay una visita anterior con persona)
        document.getElementById('f-atiende-nombre').value = nombreAnterior;
        document.getElementById('f-atiende-id').value = idAnterior;
        document.getElementById('f-atiende-tel').value = telAnterior;
        document.getElementById('f-atiende-dir').value = dirAnterior;
        document.getElementById('f-atiende-email').value = emailAnterior;
        selRadVal('rg-relacion', relAnterior || 'Propietario');
        ['f-atiende-nombre','f-atiende-id','f-atiende-tel','f-atiende-dir','f-atiende-email'].forEach(id => {
          const el = document.getElementById(id);
          el.readOnly = true;
          el.style.background = 'var(--gris-bg)';
        });
        document.getElementById('bloque-otra-persona').style.display = 'block';
      }

      // Info visita
      // Arrastrar fecha de radicado de la primera visita (col C = índice 2) — convertir a ISO para input type=date
      document.getElementById('f-fecha-radicado').value = fechaAIso(primera['FECHA RADICADO'] || primera[2] || '');
      // Para oficio: guardar fecha de la primera visita (no hay fechaRadicado, se usa la de la visita 1)
      ST._fechaPrimeraVisita = primera['FECHA DE VISITA'] || primera[15] || '';
      // Fecha de visita por defecto = hoy (si no la tiene)
      const fvInput = document.getElementById('f-fecha-visita');
      if (fvInput && !fvInput.value) fvInput.value = new Date().toISOString().split('T')[0];

      infoDiv.style.display = 'block';
      infoDiv.textContent = ' Radicado encontrado — Visita N°' + nVisita + ' · Datos autocargados de visita anterior';
      infoDiv.style.background = 'var(--verde-bg)';
      infoDiv.style.color = 'var(--verde)';
      grupoFecha.style.display = 'none';
      notif('Visita N°' + nVisita + ' — Datos cargados', 'exito');

    } else {
      // Radicado nuevo
      ST.nVisita = 1;
      ST.radicadoEncontrado = false;
      // Desbloquear campos
      desbloquearCamposVisita();
      infoDiv.style.display = 'block';
      infoDiv.textContent = 'Radicado nuevo — Visita N°1 — Completa la fecha de radicado';
      infoDiv.style.background = 'var(--amarillo-bg)';
      infoDiv.style.color = 'var(--amarillo)';
      grupoFecha.style.display = 'block';
      notif('Radicado nuevo — Visita N°1', 'info');
    }
  } catch(e) {
    notif('Error verificando: ' + e.message, 'error');
  }
}

function desbloquearCamposVisita() {
  // Desbloquear TODOS los campos de texto e inputs
  [...CAMPOS_CAMPO, ...CAMPOS_OFICINA].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.readOnly = false;
    el.disabled = false;
    el.style.background = '';
    el.style.pointerEvents = '';
    el.value = '';
  });

  // Desbloquear todos los radios
  [...RADIOS_CAMPO, ...RADIOS_OFICINA, 'rg-oficio', 'rg-relacion', 'rg-otro-relacion'].forEach(id => {
    desbloquearRadio(id);
    // Limpiar selección
    document.querySelectorAll(`#${id} .radio-opcion`).forEach(r => r.classList.remove('sel','sel-verde','sel-rojo'));
  });

  // Desbloquear y limpiar barrio/dirección
  const dir = document.getElementById('f-direccion');
  const barrio = document.getElementById('f-barrio');
  if (dir) { dir.readOnly = false; dir.style.background = ''; dir.value = ''; }
  if (barrio) { barrio.disabled = false; barrio.style.background = ''; barrio.value = ''; }

  // Desbloquear chips
  document.querySelectorAll('#chips-visitador .chip-vis, #chips-infraccion .chip-inf').forEach(c => {
    c.style.pointerEvents = ''; c.style.opacity = '';
    c.classList.remove('activo');
  });
  // Desbloquear chips usos actuales y cubierta
  document.querySelectorAll('#chips-usos .chip-inf, #chips-cubierta .chip-inf').forEach(c => {
    c.style.pointerEvents = ''; c.style.opacity = '';
  });
  ['f-uso-cual','f-cubierta-cual'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.readOnly = false; el.style.background = ''; el.style.pointerEvents = ''; }
  });
  // Desbloquear verificación documental
  desbloquearRadio('rg-licencia-aportada');

  // Desbloquear y limpiar todos los checkboxes
  ['no-atiende','tel-no-aporta','dir-no-aporta','email-no-aporta','area-no-medible','citacion-no-aplica'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.disabled = false;
    el.checked = false;
    el.style.pointerEvents = '';
    const lbl = document.querySelector(`label[for="${id}"]`);
    if (lbl) { lbl.style.pointerEvents = ''; lbl.style.opacity = ''; }
    if (el.parentElement) el.parentElement.style.pointerEvents = '';
  });

  // Restaurar campos de teléfono y dirección notif (quitar disable de toggleNoAporta)
  ['f-atiende-tel','f-atiende-dir','f-atiende-email'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.disabled = false; el.style.background = ''; el.placeholder = el.placeholder; }
  });

  // Desbloquear hora citación
  const horaCit = document.getElementById('f-citacion-hora');
  if (horaCit) { horaCit.disabled = false; horaCit.style.background = ''; }

  // Desbloquear GPS
  const btnGps = document.querySelector('[onclick="obtenerGPS()"]');
  if (btnGps) { btnGps.disabled = false; btnGps.style.opacity = ''; btnGps.style.pointerEvents = ''; }

  // Desbloquear observaciones del acta
  const obsActa = document.getElementById('f-obs-acta');
  if (obsActa) { obsActa.readOnly = false; obsActa.style.background = ''; }

  // Restaurar botones de acción
  const btnGuardar = document.querySelector('[onclick="guardarRegistro()"]');
  if (btnGuardar) { btnGuardar.style.display = ''; btnGuardar.innerHTML = '<span class="ico "><svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"/></svg></span> Guardar registro'; }
  actualizarBotonesActa(); // calcula correctamente según yaHayActa e idCarpetaFotos
  const btnF43 = document.getElementById('btn-generar-informe');
  if (btnF43) btnF43.style.display = ST._idCarpetaFotos ? '' : 'none';

  // Limpiar GPS y mapa
  ST.gpsLat = null; ST.gpsLon = null;
  document.getElementById('gps-coords').textContent = 'Sin ubicación GPS';
  document.getElementById('gps-dir').textContent = 'Toca para obtener coordenadas';
  document.getElementById('btn-mapa').style.display = 'none';
  resetearMapaGPS();
  // Restaurar bloque persona atiende
  const bloquePA = document.getElementById('bloque-persona-atiende');
  if (bloquePA) bloquePA.style.display = 'block';
  const gpsBoxReset = document.getElementById('gps-box');
  if (gpsBoxReset) gpsBoxReset.style.display = 'flex';
  const btnGpsReset = document.querySelector('[onclick="obtenerGPS()"]');
  if (btnGpsReset) { btnGpsReset.style.display = ''; btnGpsReset.disabled = false; btnGpsReset.style.opacity = ''; btnGpsReset.style.pointerEvents = ''; }

  // Ocultar sección fotos
  const secFotos = document.getElementById('seccion-fotos');
  if (secFotos) secFotos.style.display = 'none';
  const bloqueSubir = document.getElementById('bloque-subir-fotos');
  if (bloqueSubir) bloqueSubir.style.display = 'block';

  // Restaurar grupos ocultos por oficio
  const grupoEstadoObra = document.getElementById('grupo-estado-obra');
  if (grupoEstadoObra) grupoEstadoObra.style.display = 'block';
  const grupoRepLoc = document.getElementById('grupo-rep-locativa');
  if (grupoRepLoc) grupoRepLoc.style.display = 'block';
  document.getElementById('grupo-suspension-wrapper').style.display = 'block';

  toggleOtroRelacion('Propietario');
  document.getElementById('bloque-otra-persona').style.display = 'none';
}

function otroAtendio() {
  // Limpiar y desbloquear campos persona que atiende
  ['f-atiende-nombre','f-atiende-id','f-atiende-tel','f-atiende-dir','f-atiende-email'].forEach(id => {
    const el = document.getElementById(id);
    el.readOnly = false;
    el.style.background = '';
    el.value = '';
  });
  
  document.getElementById('bloque-otra-persona').style.display = 'none';
  document.getElementById('f-atiende-nombre').focus();
  notif('Ingresa los datos de la nueva persona', 'info');
}

// Extraer número de comuna del optgroup label al seleccionar barrio
function asignarComunaDesdeBarrio(sel) {
  const opt = sel.options[sel.selectedIndex];
  if (!opt || !opt.parentElement) return;
  const grupo = opt.parentElement;
  if (grupo.tagName !== 'OPTGROUP') return;
  const match = grupo.label.match(/Comuna\s+(\d+)/i);
  if (match) {
    // Siempre guardar comuna — aplica tanto para oficio como PQR
    ST._comunaOficio = match[1];
  }
}

// Normalizar dirección: agrega guión antes del último número
// Ej: "CR 54 63 96" → "CR 54 63-96", "CL 24A 58 09" → "CL 24A 58-09"
function normalizarDireccion(dir) {
  if (!dir) return dir;
  dir = dir.trim().toUpperCase();
  // Patrón: texto + espacio + número(s) + espacio + número(s) al final
  // Agrega guión antes del último grupo de números si no tiene ya guión
  return dir.replace(/(\s)(\d+[A-Z]?\s)(\d+)$/, function(m, sp, parte, ultimo) {
    return sp + parte.trim() + '-' + ultimo;
  });
}

// Toggle campos "No se aporta"
function toggleNoAporta(checkId, inputId) {
  const checked = document.getElementById(checkId).checked;
  const input = document.getElementById(inputId);
  input.disabled = checked;
  input.style.background = checked ? 'var(--gris-bg)' : '';
  if (checked) input.value = 'No se aporta';
  else input.value = '';
}

// Toggle área "No se pudo medir"
// Toggle "No se deja citación"
function toggleCitacion(check) {
  const inputs = document.getElementById('citacion-inputs');
  if (inputs) {
    inputs.style.display = check.checked ? 'none' : 'flex';
  }
  if (check.checked) {
    document.getElementById('f-citacion-fecha').value = '';
    document.getElementById('f-citacion-hora').value = '';
  }
}

// ═══════════════════════════════════════════
// FOTOS — Preview con X + subida a Drive + descripción Gemini
// ═══════════════════════════════════════════

// Almacén temporal de archivos seleccionados (permite eliminar antes de subir)
window._fotosSeleccionadas = [];
// Sugerencias IA paralelas al arreglo anterior: 'pending' | string | null
window._sugerenciasIA = [];

function previsualizarFotos(input) {
  if (!input.files.length) return;
  // Agregar nuevos archivos al arreglo existente (no reemplazar)
  Array.from(input.files).forEach(f => window._fotosSeleccionadas.push(f));
  input.value = ''; // limpiar input para permitir re-selección del mismo archivo
  renderizarPreviewFotos();
}

function renderizarPreviewFotos() {
  const preview  = document.getElementById('preview-fotos');
  const btnSubir = document.getElementById('btn-subir-fotos');
  const progreso = document.getElementById('progreso-fotos');
  preview.innerHTML = '';
  const archivos = window._fotosSeleccionadas;
  if (!archivos.length) {
    btnSubir.style.display = 'none';
    progreso.innerHTML = '';
    return;
  }
  archivos.forEach((file, idx) => {
    const reader = new FileReader();
    reader.onload = ev => {
      const wrap = document.createElement('div');
      wrap.style.cssText = 'position:relative; display:inline-block; flex-shrink:0;';
      wrap.innerHTML = `
        <img src="${ev.target.result}"
          style="width:80px; height:80px; object-fit:cover; border-radius:6px; border:2px solid var(--borde); display:block;">
        <button type="button" onclick="eliminarFotoPreview(${idx})" aria-label="Eliminar foto" title="Eliminar"
          style="position:absolute; top:-5px; right:-5px; background:var(--rojo,#e53e3e);
                 color:white; border:none; border-radius:50%; width:18px; height:18px;
                 font-size:10px; font-weight:700; cursor:pointer; line-height:18px;
                 text-align:center; padding:0;">x</button>`;
      preview.appendChild(wrap);
    };
    reader.readAsDataURL(file);
  });
  btnSubir.style.display = 'block';
  progreso.innerHTML = `<span style="color:var(--texto-suave)">${archivos.length} foto(s) seleccionada(s)</span>`;
}

function eliminarFotoPreview(idx) {
  window._fotosSeleccionadas.splice(idx, 1);
  renderizarPreviewFotos();
}

// Descripción IA vía webhook (la clave Gemini vive en Apps Script).
async function describirFotoEnNavegador(base64, mimeType) {
  try {
    const resp = await fetch(CFG.webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ accion: 'pedirDescripcionIA', base64, mimeType })
    });
    const data = await resp.json();
    return (data && data.ok && data.descripcion) ? data.descripcion : '';
  } catch(e) { return ''; }
}

async function subirFotos() {
  const archivos  = window._fotosSeleccionadas;
  const progreso  = document.getElementById('progreso-fotos');
  const btnSubir  = document.getElementById('btn-subir-fotos');

  // Si la carpeta Fotos aún no se resolvió (async al cargar INICIADO), intentar obtenerla ahora
  if (!ST._idCarpetaFotos && ST._idCarpetaVisita) {
    btnSubir.disabled = true;
    btnSubir.textContent = ' Resolviendo carpeta...';
    try {
      const r = await fetch(`${CFG.webhook}?accion=obtenerIdFotos&idCarpeta=${encodeURIComponent(ST._idCarpetaVisita)}`);
      const d = await r.json();
      if (d.ok && d.idFotos) ST._idCarpetaFotos = d.idFotos;
    } catch(e) { /* continúa — fallará abajo si sigue vacío */ }
    btnSubir.disabled = false;
    btnSubir.innerHTML = '<span class="ico"><svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z"/></svg></span> Subir fotos a Drive';
  }

  const idCarpeta = ST._idCarpetaFotos;

  if (!idCarpeta)      { notif('Guarda el registro primero', 'error'); return; }
  if (!archivos.length){ notif('Selecciona al menos una foto', 'error'); return; }

  btnSubir.disabled = true;
  btnSubir.textContent = ' Subiendo...';
  const total = archivos.length;
  let subidas = 0, errores = 0;

  progreso.innerHTML = `
    <div style="margin-bottom:6px; font-size:12px; color:var(--texto-suave);">
      <span id="prog-texto">Preparando...</span>
    </div>
    <div style="background:var(--gris-bg); border-radius:20px; height:10px; overflow:hidden;">
      <div id="prog-barra" style="background:var(--azul); height:100%; width:0%; border-radius:20px; transition:width 0.3s ease;"></div>
    </div>
    <div style="margin-top:4px; font-size:11px; color:var(--texto-suave);">
      <span id="prog-conteo">0 / ${total}</span>
      <span id="prog-errores" style="color:var(--rojo); margin-left:8px;"></span>
    </div>`;

  for (const file of archivos) {
    try {
      // 1. Leer base64
      const base64 = await new Promise((res, rej) => {
        const reader = new FileReader();
        reader.onload = e => res(e.target.result.split(',')[1]);
        reader.onerror = rej;
        reader.readAsDataURL(file);
      });
      const nombre = Date.now() + '_' + file.name.replace(/[^a-zA-Z0-9._-]/g, '_');

      // 2. Subir a Drive — text/plain evita preflight CORS (igual que generarActa)
      document.getElementById('prog-texto').textContent = `Subiendo foto ${subidas + errores + 1}...`;
      const r = await fetch(CFG.webhook, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({ accion: 'subirFoto', idCarpeta, nombre, mimeType: file.type, base64 })
      });
      const d = await r.json();
      if (!d.ok) throw new Error(d.error || 'Error en Drive');

      subidas++;
      ST._fotosParaActa.push({ fileId: d.fileId || '', link: d.link || '', descripcion: '' });

    } catch(e) {
      errores++;
      console.warn('Error en foto:', e.message);
    }

    // Actualizar barra
    const pct = Math.round(((subidas + errores) / total) * 100);
    document.getElementById('prog-barra').style.width = pct + '%';
    document.getElementById('prog-barra').style.background = errores > 0 ? 'var(--amarillo)' : 'var(--azul)';
    document.getElementById('prog-conteo').textContent = `${subidas + errores} / ${total}`;
    if (errores > 0) document.getElementById('prog-errores').textContent = `${errores} error(es)`;
  }

  btnSubir.disabled = false;
  btnSubir.innerHTML = '<span class="ico"><svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z"/></svg></span> Subir fotos a Drive';

  if (subidas > 0) {
    ST._fotosSubidas = true;
    document.getElementById('prog-texto').textContent =
      errores === 0 ? ` ${subidas} foto(s) subida(s) correctamente` : `${subidas} subidas · ${errores} con error`;
    document.getElementById('prog-barra').style.background = errores === 0 ? 'var(--verde)' : 'var(--amarillo)';
    notif(` ${subidas} foto(s) en Drive`, 'exito');
    window._fotosSeleccionadas = [];
    document.getElementById('preview-fotos').innerHTML = '';
    btnSubir.style.display = 'none';
    actualizarPanelEstado();
  } else {
    document.getElementById('prog-texto').textContent = `0 subidas · ${errores} con error`;
    document.getElementById('prog-barra').style.background = 'var(--rojo)';
    notif(`Error subiendo fotos — revisa la consola`, 'error');
  }
}

// ═══════════════════════════════════════════
// GENERAR REGISTRO FOTOGRÁFICO EN GOOGLE DOCS
// Botón: btn-insertar-fotos-acta
// Carga las fotos desde Drive (no depende de la sesión actual).
// Muestra panel de revisión/edición de descripciones IA.
// Si el Doc ya existe en Drive, devuelve el existente (sin duplicar).
// ═══════════════════════════════════════════
async function insertarFotosEnActa() {
  if (!ST._linkSheetActa && !ST._ssIdActa) {
    notif('Primero genera el acta (F-GGO-46)', 'error'); return;
  }
  if (!ST._idCarpetaFotos) {
    notif('No hay carpeta de fotos asociada a esta visita', 'error'); return;
  }

  showLoading('Cargando fotos desde Drive...', 'Obteniendo imágenes de la visita');
  try {
    const url = CFG.webhook + '?accion=listarFotosActa&idCarpeta=' + encodeURIComponent(ST._idCarpetaFotos);
    const r = await fetch(url);
    const d = await r.json();
    hideLoading();
    if (d.ok && d.fotos && d.fotos.length > 0) {
      mostrarPanelRF(d.fotos);
    } else {
      notif('No se encontraron fotos en la carpeta de Drive', 'aviso');
    }
  } catch(e) {
    hideLoading();
    notif('Error cargando fotos: ' + e.message, 'error');
  }
}

// ── Modal de revisión del Registro Fotográfico ────────────────────────────────
// Muestra todas las fotos de Drive, permite reordenar (↑↓), eliminar del acta
// (sin borrar en Drive) y lanzar análisis IA solo sobre las fotos restantes.

function mostrarPanelRF(fotos) {
  // Orden sugerido: cronológico por nombre (cámaras usan timestamp en filename)
  window._fotosRevisionRF = [...fotos].sort((a, b) =>
    (a.nombre || '').localeCompare(b.nombre || ''));

  document.getElementById('modal-rf-fotos')?.remove();
  const modal = document.createElement('div');
  modal.id = 'modal-rf-fotos';
  modal.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,0.72); z-index:9999; display:flex; align-items:flex-start; justify-content:center; padding:16px; overflow-y:auto;';
  modal.innerHTML = `
    <div style="background:white; border-radius:12px; padding:20px; width:100%; max-width:620px; margin:auto;">
      <div style="font-weight:700; font-size:15px; color:var(--azul); margin-bottom:4px;"> Registro fotográfico</div>
      <div style="font-size:12px; color:var(--texto-suave); margin-bottom:14px;">
        Orden sugerido: cronológico por nombre de archivo (fachada → piso 1 → pisos superiores → terraza).
        Usa ▲▼ para reordenar o  para excluir del acta.
      </div>
      <div style="display:flex; align-items:center; gap:10px; margin-bottom:14px; flex-wrap:wrap;">
        <button id="btn-ia-rf" onclick="analizarFotosEnModal()"
          style="background:#16a34a; color:white; border:none; border-radius:8px; padding:9px 16px; font-size:13px; font-weight:600; cursor:pointer;">
           Sugerir descripción
        </button>
        <span id="estado-ia-rf" style="font-size:12px; color:var(--texto-suave);"></span>
      </div>
      <div id="grid-rf-revision" style="display:flex; flex-direction:column; gap:8px;"></div>
      <div style="display:flex; gap:8px; margin-top:18px;">
        <button onclick="confirmarRFConFotos()"
          style="flex:1; background:var(--azul); color:white; border:none; border-radius:8px; padding:12px; font-size:14px; font-weight:600; cursor:pointer;">
           Confirmar y generar registro
        </button>
        <button onclick="document.getElementById('modal-rf-fotos').remove()"
          style="flex:0 0 auto; background:var(--gris-bg); border:none; border-radius:8px; padding:12px; font-size:13px; cursor:pointer;">
          Cancelar
        </button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  renderGridRF();
}

// Reconstruye el grid desde window._fotosRevisionRF (se llama tras cada cambio)
function renderGridRF() {
  const fotos = window._fotosRevisionRF || [];
  const grid  = document.getElementById('grid-rf-revision');
  if (!grid) return;

  // Preservar descripciones escritas en los inputs antes de redibujar
  fotos.forEach(f => {
    const fid = f.id || f.fileId;
    const inp = document.getElementById('desc-rf-' + fid);
    if (inp) f.descripcion = inp.value;
  });

  grid.innerHTML = '';
  fotos.forEach((foto, i) => {
    const fid    = foto.id || foto.fileId || '';
    const nombre = (foto.nombre || '').replace(/</g, '&lt;');
    const desc   = (foto.descripcion || '').replace(/"/g, '&quot;');
    const esFirst = i === 0;
    const esLast  = i === fotos.length - 1;

    const item = document.createElement('div');
    item.dataset.fotoid = fid;
    item.style.cssText  = 'display:flex; gap:8px; align-items:center; border:1px solid var(--borde); border-radius:8px; padding:8px; background:#fff;';
    item.innerHTML = `
      <!-- Botones orden -->
      <div style="display:flex; flex-direction:column; gap:3px; flex-shrink:0;">
        <button onclick="moverFotoRF('${fid}',-1)" title="Subir"
          style="background:none; border:1px solid var(--borde); border-radius:4px; width:26px; height:26px; cursor:pointer; font-size:13px; ${esFirst  ? 'opacity:0.25; pointer-events:none;' : ''}">▲</button>
        <button onclick="moverFotoRF('${fid}', 1)" title="Bajar"
          style="background:none; border:1px solid var(--borde); border-radius:4px; width:26px; height:26px; cursor:pointer; font-size:13px; ${esLast ? 'opacity:0.25; pointer-events:none;' : ''}">▼</button>
      </div>
      <!-- Thumbnail -->
      <img src="https://drive.google.com/thumbnail?id=${fid}&sz=w200"
        style="width:70px; height:70px; object-fit:cover; border-radius:6px; flex-shrink:0;"
        onerror="this.style.opacity='0.3'">
      <!-- Etiqueta + input descripción -->
      <div style="flex:1; min-width:0;">
        <div style="font-size:11px; color:var(--texto-suave); margin-bottom:4px;">
          Foto ${i + 1}
          <span style="opacity:0.5; font-size:10px; margin-left:4px;">${nombre.slice(0, 35)}${nombre.length > 35 ? '…' : ''}</span>
        </div>
        <input type="text" id="desc-rf-${fid}" value="${desc}" maxlength="80"
          placeholder="Sin descripción"
          style="width:100%; border:1px solid var(--borde); border-radius:6px; padding:7px 8px; font-size:13px; box-sizing:border-box;">
      </div>
      <!-- Botón eliminar -->
      <button type="button" onclick="eliminarFotoRF('${fid}')" title="Excluir del acta" aria-label="Excluir foto del acta"
        style="flex-shrink:0; background:none; border:1px solid #fca5a5; border-radius:6px; width:32px; height:32px; font-size:16px; color:#dc2626; cursor:pointer; line-height:1;">x</button>
    `;
    grid.appendChild(item);
  });

  // Contador de fotos activas
  const estadoEl = document.getElementById('estado-ia-rf');
  if (estadoEl && !estadoEl.textContent.includes('Analizando'))
    estadoEl.textContent = fotos.length + ' foto' + (fotos.length !== 1 ? 's' : '');
}

// Excluye una foto del acta (no la borra en Drive)
function eliminarFotoRF(fotoId) {
  window._fotosRevisionRF = (window._fotosRevisionRF || [])
    .filter(f => (f.id || f.fileId) !== fotoId);
  renderGridRF();
}

// Desplaza una foto arriba (dir=-1) o abajo (dir=1)
function moverFotoRF(fotoId, dir) {
  const arr = window._fotosRevisionRF || [];
  const idx = arr.findIndex(f => (f.id || f.fileId) === fotoId);
  if (idx < 0) return;
  const dest = idx + dir;
  if (dest < 0 || dest >= arr.length) return;
  // Preservar texto de inputs antes de reordenar
  arr.forEach(f => {
    const inp = document.getElementById('desc-rf-' + (f.id || f.fileId));
    if (inp) f.descripcion = inp.value;
  });
  [arr[idx], arr[dest]] = [arr[dest], arr[idx]];
  renderGridRF();
}

// Analiza con IA solo las fotos que quedan en el modal (una a una, sin bloquear UI)
async function analizarFotosEnModal() {
  const fotos   = window._fotosRevisionRF || [];
  if (!fotos.length) return;

  const btnIA    = document.getElementById('btn-ia-rf');
  const estadoEl = document.getElementById('estado-ia-rf');
  if (btnIA) { btnIA.disabled = true; btnIA.textContent = ' Analizando...'; }

  for (let i = 0; i < fotos.length; i++) {
    const foto    = fotos[i];
    const fotoId  = foto.id || foto.fileId;
    const inputEl = document.getElementById('desc-rf-' + fotoId);
    if (!fotoId || !inputEl) continue;

    if (estadoEl) estadoEl.textContent = 'Analizando foto ' + (i + 1) + ' de ' + fotos.length + '…';
    inputEl.disabled    = true;
    inputEl.placeholder = ' analizando…';

    try {
      const url = CFG.webhook + '?accion=describirFotoDesdeId&fileId=' + encodeURIComponent(fotoId);
      const r   = await fetch(url);
      const ct  = r.headers.get('content-type') || '';
      if (!ct.includes('json')) throw new Error('respuesta no-JSON de GAS');
      const d   = await r.json();
      console.log('[IA foto ' + (i + 1) + '] desc="' + d.descripcion + '" debug=' + d.debug);
      const desc = (d.descripcion && d.descripcion !== 'Sin descripción') ? d.descripcion : '';
      foto.descripcion  = desc;
      inputEl.value     = desc;
    } catch(e) {
      console.error('[IA foto ' + (i + 1) + '] Error:', e.message);
    } finally {
      inputEl.disabled    = false;
      inputEl.placeholder = 'Sin descripción';
    }
  }

  if (btnIA)    { btnIA.disabled = false; btnIA.textContent = ' Sugerir descripción'; }
  if (estadoEl)   estadoEl.textContent = ' Análisis completo · ' + fotos.length + ' fotos';
}

function confirmarRFConFotos() {
  const fotos = window._fotosRevisionRF || [];
  if (!fotos.length) { notif('No hay fotos para el registro', 'aviso'); return; }
  fotos.forEach(foto => {
    const fotoId = foto.id || foto.fileId;
    const input  = document.getElementById('desc-rf-' + fotoId);
    foto.descripcionFinal = input
      ? (input.value.trim() || foto.descripcion || 'Sin descripción')
      : (foto.descripcion  || 'Sin descripción');
  });
  document.getElementById('modal-rf-fotos')?.remove();
  _generarRFDocFinal(fotos);
}

async function _generarRFDocFinal(fotos) {
  const btn = document.getElementById('btn-insertar-fotos-acta');
  if (btn) { btn.disabled = true; btn.textContent = ' Generando...'; }
  showLoading('Generando registro fotográfico...', 'Insertando ' + fotos.length + ' foto(s) en Google Docs');

  try {
    const datos = recopilarDatosF46();
    const r = await fetch(CFG.webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({
        accion:          'generarRegistroFotos',
        radicado:        datos.radicado    || '',
        fechaVisita:     datos.fechaVisita || '',
        direccion:       datos.direccion   || '',
        barrio:          datos.barrio      || '',
        idCarpetaVisita: ST._idCarpetaVisita || null,
        idCarpetaFotos:  ST._idCarpetaFotos  || null,
        fotos: fotos.filter(f => f.id || f.fileId).map(f => ({
          fileId:      f.id || f.fileId,
          descripcion: f.descripcionFinal || f.descripcion || 'Sin descripción'
        }))
      })
    });
    const d = await r.json();
    hideLoading();
    if (d.ok) {
      ST._docIdRegistroFotos   = d.docId  || '';
      ST._linkDocRegistroFotos = d.linkDoc || '';
      actualizarBotonesActa();
      notif(
        d.yaExistia ? ' El registro fotográfico ya existía en Drive' : ' Registro fotográfico generado en Google Docs',
        d.yaExistia ? 'aviso' : 'exito'
      );
    } else {
      notif('Error: ' + (d.error || 'Error desconocido'), 'error');
    }
  } catch(e) {
    hideLoading();
    notif('Error de conexión: ' + e.message, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<span class="ico"><svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z"/></svg></span> Registro fotográfico';
    }
  }
}

// ═══════════════════════════════════════════
// PANEL DE ESTADO DEL REGISTRO
// ═══════════════════════════════════════════
function actualizarPanelEstado() {
  const items = document.getElementById('estado-items');
  if (!items) return;
  // Mostrar el panel
  const panel = document.getElementById('panel-estado-registro');
  if (panel) panel.style.display = 'block';

  const telNoAporta = document.getElementById('tel-no-aporta')?.checked;
  const dirNoAporta = document.getElementById('dir-no-aporta')?.checked;
  const emailNoAporta = document.getElementById('email-no-aporta')?.checked;
  const areaNoMedible = document.getElementById('area-no-medible')?.checked;
  const citNoAplica = document.getElementById('citacion-no-aplica')?.checked;
  const susp = getRadVal('rg-suspension');

  const telVal = (document.getElementById('f-atiende-tel')?.value||'').replace(/\D/g,'');

  const checks = [
    {
      label: 'Identificación del caso',
      ok: !!(document.getElementById('f-radicado')?.value?.trim() ||
             document.getElementById('f-orden')?.value?.trim())
    },
    {
      label: 'Ubicación del inmueble',
      ok: !!(document.getElementById('f-direccion')?.value?.trim() &&
             document.getElementById('f-barrio')?.value?.trim() &&
             ST.gpsLat !== null)
    },
    {
      label: 'Persona que atiende',
      ok: !!(document.getElementById('no-atiende')?.checked ||
             (document.getElementById('f-atiende-nombre')?.value?.trim() &&
              document.getElementById('f-atiende-id')?.value?.trim() &&
              getRadVal('rg-relacion') &&
              (telNoAporta || telVal.length === 10) &&
              (dirNoAporta || document.getElementById('f-atiende-dir')?.value?.trim()) &&
              (emailNoAporta || document.getElementById('f-atiende-email')?.value?.trim())))
    },
    {
      label: 'Características de la edificación',
      ok: !!(getRadVal('rg-estado-obra') &&
             getRadVal('rg-rep-locativa') &&
             getRadVal('rg-habitado'))
    },
    {
      label: 'Verificación documental',
      ok: !!(getRadVal('rg-licencia-aportada'))
    },
    {
      label: 'Descripción de la situación encontrada',
      ok: !!(document.getElementById('transcripcion')?.value?.trim())
    },
    {
      label: 'Conclusiones',
      ok: !!(document.getElementById('f-infraccion')?.value?.trim() &&
             (areaNoMedible || (document.getElementById('f-area')?.value?.trim() &&
                                parseFloat(document.getElementById('f-area')?.value) > 0)) &&
             getRadVal('rg-suspension') &&
             (susp !== 'SI' || document.getElementById('f-orden')?.value?.trim()) &&
             (citNoAplica || (document.getElementById('f-citacion-fecha')?.value?.trim() &&
                              document.getElementById('f-citacion-hora')?.value?.trim())))
    },
    {
      label: 'Funcionarios que realizan la inspección',
      ok: !!(document.getElementById('f-visitador')?.value?.trim())
    },
    {
      label: 'Consulta norma POT',
      ok: !!(document.getElementById('f-poligono')?.value?.trim() &&
             getRadVal('rg-amenaza') &&
             getRadVal('rg-suelo-prot') &&
             getRadVal('rg-quebrada'))
    },
    {
      label: 'Acta o Informe',
      ok: !!(ST._actaGenerada || ST._informeGenerado)
    },
    {
      // Solo aplica si hay carpeta de fotos — sin carpeta no es requisito
      label: 'Registro fotográfico',
      ok: !ST._idCarpetaFotos || !!(ST._docIdRegistroFotos || ST._linkDocRegistroFotos)
    }
  ];

  const todoOk = checks.every(ch => ch.ok);
  const pendientes = checks.filter(ch => !ch.ok);

  if (pendientes.length === 0) {
    items.innerHTML = '<div style="color:var(--verde);font-size:12px;"> Todo completo</div>';
  } else {
    items.innerHTML = pendientes.map(ch => `
      <div style="display:flex; align-items:center; gap:8px;">
        <span style="font-size:14px;"></span>
        <span style="color:var(--rojo);">${ch.label}</span>
      </div>`).join('');
  }

  // Indicador visual en botón actualizar (opacidad según completitud del panel)
  const btnCompletar = document.querySelector('[onclick="guardarRegistro()"]');
  if (btnCompletar && btnCompletar.style.display !== 'none') {
    const pendientes = checks.filter(ch => !ch.ok).length;
    btnCompletar.style.opacity = todoOk ? '1' : '0.7';
    btnCompletar.title = pendientes > 0 ? `${pendientes} sección(es) sin completar` : '';
  }
}
function toggleNoAtiende(check) {
  const bloque = document.getElementById('bloque-persona-atiende');
  if (!bloque) return;
  if (check.checked) {
    // Ocultar y limpiar todos los campos
    bloque.style.display = 'none';
    ['f-atiende-nombre','f-atiende-id','f-atiende-tel','f-atiende-dir','f-atiende-email'].forEach(id => {
      const el = document.getElementById(id);
      if (el) { el.value = 'No se atiende / No suministra datos'; el.disabled = true; }
    });
    ['tel-no-aporta','dir-no-aporta','email-no-aporta'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.checked = false;
    });
  } else {
    bloque.style.display = 'block';
    ['f-atiende-nombre','f-atiende-id','f-atiende-tel','f-atiende-dir','f-atiende-email'].forEach(id => {
      const el = document.getElementById(id);
      if (el) { el.value = ''; el.disabled = false; }
    });
  }
  actualizarPanelEstado();
}

function toggleAreaNoMedible(check) {
  const input = document.getElementById('f-area');
  input.disabled = check.checked;
  input.style.background = check.checked ? 'var(--gris-bg)' : '';
  input.value = check.checked ? 'NO MEDIBLE' : '';
  input.placeholder = check.checked ? 'No se pudo medir' : '0.00';
}

// ═══════════════════════════════════════════
// MODOS DE VISUALIZACIÓN DEL FORMULARIO
// ═══════════════════════════════════════════

// Campos editables solo en oficina (2ª fase)
const CAMPOS_OFICINA = [
  'f-licencia','f-fecha-licencia','f-tipo-licencia','f-pisos',
  'f-destinaciones','f-cubierta','f-sistema','f-obs-licencia',
  'f-area','f-catastral','f-ficha','f-poligono','transcripcion',
  'f-altura-pisos','f-dest-actuales','f-usos','f-cubierta-actual'
];
const RADIOS_OFICINA = ['rg-licencia-aportada','rg-amenaza','rg-suelo-prot','rg-quebrada','rg-habitado'];

// Campos de campo (bloqueados en modo oficina)
const CAMPOS_CAMPO = [
  'f-direccion','f-barrio','f-fecha-visita','f-atiende-nombre',
  'f-atiende-id','f-atiende-tel','f-atiende-dir','f-atiende-email',
  'f-altura-pisos','f-dest-actuales','f-usos','f-cubierta-actual',
  'f-orden','f-orden-consecutivo','f-orden-consecutivo-pqr','f-citacion-fecha'
];
const RADIOS_CAMPO = [
  'rg-estado-obra','rg-rep-locativa','rg-habitado',
  'rg-suspension','rg-relacion','rg-quebrada'
];

function bloquearCampo(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.readOnly = true;
  el.disabled = true;
  el.style.background = 'var(--gris-bg)';
  el.style.pointerEvents = 'none';
}

function bloquearRadio(id) {
  document.querySelectorAll(`#${id} .radio-opcion`).forEach(r => {
    r.style.pointerEvents = 'none';
    r.style.opacity = '0.6';
  });
}

function desbloquearCampo(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.readOnly = false;
  el.disabled = false;
  el.style.background = '';
  el.style.pointerEvents = '';
}

function desbloquearRadio(id) {
  document.querySelectorAll(`#${id} .radio-opcion`).forEach(r => {
    r.style.pointerEvents = '';
    r.style.opacity = '';
  });
}

function aplicarModoOficina() {
  // Bloquear campos de campo
  CAMPOS_CAMPO.forEach(bloquearCampo);
  RADIOS_CAMPO.forEach(bloquearRadio);
  // Bloquear hora citación y checkbox
  const horaCit = document.getElementById('f-citacion-hora');
  if (horaCit) { horaCit.disabled = true; horaCit.style.background = 'var(--gris-bg)'; }
  const chkCit = document.getElementById('citacion-no-aplica');
  if (chkCit) { chkCit.disabled = true; }
  // Bloquear checkboxes de campo (no se aporta)
  ['tel-no-aporta','dir-no-aporta','email-no-aporta'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.disabled = true;
    el.style.pointerEvents = 'none';
    const lbl = document.querySelector(`label[for="${id}"]`);
    if (lbl) { lbl.style.pointerEvents = 'none'; lbl.style.opacity = '0.6'; }
    if (el.parentElement) el.parentElement.style.pointerEvents = 'none';
  });
  // Fotos: mostrar con subida habilitada (no completado aún)
  mostrarBotonFotosExistente(false);
  // Bloquear chips visitadores (no infracciones — editables si no hubo suspensión)
  document.querySelectorAll('#chips-visitador .chip-vis').forEach(c => {
    c.style.pointerEvents = 'none'; c.style.opacity = '0.6';
  });
  // Infracciones: bloquear solo si hubo suspensión
  const suspOficina = getRadVal('rg-suspension');
  if (suspOficina === 'SI') {
    document.querySelectorAll('#chips-infraccion .chip-inf').forEach(c => {
      c.style.pointerEvents = 'none'; c.style.opacity = '0.6';
    });
  }
  // Bloquear chips usos actuales y cubierta (capturados en campo, no editables en oficina)
  document.querySelectorAll('#chips-usos .chip-inf, #chips-cubierta .chip-inf').forEach(c => {
    c.style.pointerEvents = 'none'; c.style.opacity = '0.6';
  });
  ['f-uso-cual','f-cubierta-cual'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.readOnly = true; el.style.background = 'var(--slate-100)'; el.style.pointerEvents = 'none'; }
  });
  // Bloquear verificación documental (licencia aportada — capturada en campo)
  bloquearRadio('rg-licencia-aportada');
  // Mensaje orientador
  notif('Modo oficina — completa licencia, área y norma POT', 'info');
  // Cambiar botón guardar
  const btnGuardar = document.querySelector('[onclick="guardarRegistro()"]');
  if (btnGuardar) btnGuardar.innerHTML = ' Actualizar registro';
}

function aplicarModoSoloLectura() {
  // Bloquear absolutamente todo
  [...CAMPOS_CAMPO, ...CAMPOS_OFICINA].forEach(bloquearCampo);
  [...RADIOS_CAMPO, ...RADIOS_OFICINA].forEach(bloquearRadio);
  // Bloquear chips
  document.querySelectorAll('#chips-visitador .chip-vis, #chips-infraccion .chip-inf').forEach(c => {
    c.style.pointerEvents = 'none'; c.style.opacity = '0.6';
  });
  // Bloquear todos los checkboxes y sus labels
  ['no-atiende','tel-no-aporta','dir-no-aporta','email-no-aporta','area-no-medible','citacion-no-aplica'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.disabled = true;
    el.style.pointerEvents = 'none';
    // Bloquear label asociado
    const lbl = document.querySelector(`label[for="${id}"]`);
    if (lbl) { lbl.style.pointerEvents = 'none'; lbl.style.opacity = '0.6'; }
    // Bloquear el span contenedor también
    if (el.parentElement) el.parentElement.style.pointerEvents = 'none';
  });
  // Bloquear citación completa
  const horaCit = document.getElementById('f-citacion-hora');
  if (horaCit) { horaCit.disabled = true; horaCit.style.background = 'var(--gris-bg)'; }
  // Ocultar TODOS los botones de acción excepto fotos
  const btnGuardar = document.querySelector('[onclick="guardarRegistro()"]');
  if (btnGuardar) btnGuardar.style.display = 'none';
  const btnF46 = document.querySelector('[onclick="descargarF46xlsx()"]');
  if (btnF46) btnF46.style.display = 'none';
  const btnF43 = document.getElementById('btn-generar-informe');
  if (btnF43) btnF43.style.display = 'none';
  // GPS siempre disponible — el pin se puede mover aunque el registro esté COMPLETADO
  // Bloquear observaciones del acta
  const obsActa = document.getElementById('f-obs-acta');
  if (obsActa) { obsActa.readOnly = true; obsActa.style.background = 'var(--gris-bg)'; }
  // Fotos: ocultar subida, mostrar solo link Drive
  const bloqueSubir = document.getElementById('bloque-subir-fotos');
  if (bloqueSubir) bloqueSubir.style.display = 'none';
  // Mostrar sección fotos con solo link Drive
  mostrarBotonFotosExistente(true);
  notif(' Registro completado — solo lectura', 'exito');
}

function aplicarModoEdicionPreActa() {
  // Fotos: mostrar con subida habilitada
  mostrarBotonFotosExistente(false);
  // Bloquear solo el toggle PQR/Oficio (ya no puede cambiarse)
  const rgOficio = document.getElementById('rg-oficio');
  if (rgOficio) { rgOficio.style.pointerEvents = 'none'; rgOficio.style.opacity = '0.6'; }
  // Mostrar botón guardar
  const btnGuardar = document.querySelector('[onclick="guardarRegistro()"]');
  if (btnGuardar) {
    btnGuardar.style.display = '';
    btnGuardar.innerHTML = ' Actualizar registro';
  }
  notif('COMPLETADO — puedes modificar el formulario antes de generar el acta', 'info');
}

// Mostrar sección fotos en registros existentes
function mostrarBotonFotosExistente(soloLectura) {
  const fila = ST._filaPendiente;
  if (!fila) return;
  // Buscar LINK_DRIVE por nombre de columna o por índice (columna BD = índice 55)
  const linkDrive = fila['LINK_DRIVE'] || fila['LINK DRIVE'] || fila[55] || '';
  if (!linkDrive) {
    console.log('Sin LINK_DRIVE en fila:', Object.keys(fila).filter(k => k.includes('LINK') || k.includes('DRIVE')));
    return;
  }
  const match = linkDrive.match(/folders\/([a-zA-Z0-9_-]+)/);
  if (!match) return;
  const idCarpeta = match[1];
  ST._linkCarpetaDrive = linkDrive;
  obtenerIdCarpetaFotos(idCarpeta, soloLectura);
}

async function obtenerIdCarpetaFotos(idCarpeta, soloLectura) {
  try {
    ST._idCarpetaVisita = idCarpeta; // ID de la carpeta de la visita (padre de Fotos)
    const url = CFG.webhook + '?accion=obtenerIdFotos&idCarpeta=' + encodeURIComponent(idCarpeta);
    const r = await fetch(url);
    const d = await r.json();
    const secFotos = document.getElementById('seccion-fotos');
    const bloqueSubir = document.getElementById('bloque-subir-fotos');
    const btnVerDrive = document.getElementById('btn-ver-fotos-drive');
    if (d.ok && d.idFotos) {
      ST._idCarpetaFotos = d.idFotos;
      if (secFotos) secFotos.style.display = 'block';
      // Actualizar botones con lógica completa (respeta yaHayActa, etc.)
      actualizarBotonesActa();
      const btnF43 = document.getElementById('btn-generar-informe');
      if (btnF43 && !soloLectura) btnF43.style.display = '';
      if (soloLectura) {
        // Solo lectura: ocultar subida, mostrar link Drive
        if (bloqueSubir) bloqueSubir.style.display = 'none';
        if (btnVerDrive) btnVerDrive.style.display = 'block';
      } else {
        // Editable: mostrar subida y link Drive
        if (bloqueSubir) bloqueSubir.style.display = 'block';
        if (btnVerDrive) btnVerDrive.style.display = 'block';
      }
    }
  } catch(e) { /* silencioso */ }
}

function verFotosEnDrive() {
  // Prioridad 1: carpeta Fotos (obtenida al guardar o al cargar async)
  if (ST._idCarpetaFotos) {
    window.open('https://drive.google.com/drive/folders/' + ST._idCarpetaFotos, '_blank');
  // Prioridad 2: carpeta raíz de la visita (al cargar un INICIADO existente,
  //   ST._idCarpetaFotos puede no estar disponible aún — la Fotos es subcarpeta visible)
  } else if (ST._idCarpetaVisita) {
    window.open('https://drive.google.com/drive/folders/' + ST._idCarpetaVisita, '_blank');
  } else if (ST._linkCarpetaDrive) {
    window.open(ST._linkCarpetaDrive, '_blank');
  } else {
    notif('No hay carpeta de fotos asociada', 'error');
  }
}

function toggleOficio(val) {
  const esOficio = val === 'SI';
  document.getElementById('bloque-pqr').style.display = esOficio ? 'none' : 'block';
  document.getElementById('bloque-oficio').style.display = esOficio ? 'block' : 'none';
  const ordenPqr = document.getElementById('orden-pqr');
  const ordenOficio = document.getElementById('orden-oficio');
  if (ordenPqr) ordenPqr.style.display = esOficio ? 'none' : 'block';
  if (ordenOficio) ordenOficio.style.display = esOficio ? 'block' : 'none';
  ST.esOficio = esOficio;
  ocultarSinInfraccion();
  if (esOficio) {
    ST.nVisita = 1;
    document.getElementById('f-fecha-radicado').value = new Date().toISOString().split('T')[0];
    const anio = new Date().getFullYear();
    const pref = document.getElementById('prefijo-orden');
    if (pref) pref.textContent = anio + '-09-';
    const prev = document.getElementById('radicado-oficio-preview');
    if (prev) prev.style.display = 'none';
    const cons = document.getElementById('f-orden-consecutivo');
    if (cons) cons.value = '';
    document.getElementById('f-orden').value = '';
    // Oficio: fecha radicado = hoy, no editable
    const fechaRad = document.getElementById('f-fecha-radicado');
    if (fechaRad) { fechaRad.value = new Date().toISOString().split('T')[0]; fechaRad.readOnly = true; fechaRad.style.background = 'var(--gris-bg)'; }
    // Oficio: fecha visita = hoy, no editable
    const fechaVis = document.getElementById('f-fecha-visita');
    if (fechaVis) { fechaVis.value = new Date().toISOString().split('T')[0]; fechaVis.readOnly = true; fechaVis.style.background = 'var(--gris-bg)'; }
    // Oficio: ocultar checkbox "no se deja citación" — siempre obligatoria
    const spanCitOf = document.getElementById('span-citacion-checkbox');
    if (spanCitOf) spanCitOf.style.display = 'none';
    // Oficio: ocultar "Sin infracción"
    const chipSinInf = document.getElementById('chip-sin-infraccion');
    if (chipSinInf) chipSinInf.style.display = 'none';
    // Oficio: siempre suspensión SI, ocultar la pregunta
    document.getElementById('grupo-suspension-wrapper').style.display = 'none';
    selRadVal('rg-suspension', 'SI');
    toggleOrden('SI');
    // Oficio: siempre obra en proceso, ocultar pregunta estado obra
    selRadVal('rg-estado-obra', 'En proceso / iniciada');
    const grupoEstadoObra = document.getElementById('grupo-estado-obra');
    if (grupoEstadoObra) grupoEstadoObra.style.display = 'none';
    // Oficio: no es reparación locativa, ocultar pregunta
    selRadVal('rg-rep-locativa', 'NO');
    const grupoRepLoc = document.getElementById('grupo-rep-locativa');
    if (grupoRepLoc) grupoRepLoc.style.display = 'none';
    // Resetear checkbox por si venía marcado
    const chkCit = document.getElementById('citacion-no-aplica');
    if (chkCit) { chkCit.checked = false; }
    const citInputs = document.getElementById('citacion-inputs');
    if (citInputs) citInputs.style.display = 'flex';
    // Oficio: citación siempre visible
  } else {
    document.getElementById('grupo-suspension-wrapper').style.display = 'block';
    document.getElementById('info-nvisita').style.display = 'none';
    document.getElementById('grupo-fecha-radicado').style.display = 'none';
    const prev = document.getElementById('radicado-oficio-preview');
    if (prev) prev.style.display = 'none';
    // Restaurar campos ocultos por oficio
    const grupoEstadoObra = document.getElementById('grupo-estado-obra');
    if (grupoEstadoObra) grupoEstadoObra.style.display = 'block';
    const grupoRepLoc = document.getElementById('grupo-rep-locativa');
    if (grupoRepLoc) grupoRepLoc.style.display = 'block';
    // citación siempre visible, mostrar checkbox para PQR
    const spanCit = document.getElementById('span-citacion-checkbox');
    if (spanCit) spanCit.style.display = 'inline';
    // Restaurar fechas editables
    const fechaRadPqr = document.getElementById('f-fecha-radicado');
    if (fechaRadPqr) { fechaRadPqr.readOnly = false; fechaRadPqr.style.background = ''; }
    const fechaVisPqr = document.getElementById('f-fecha-visita');
    if (fechaVisPqr) { fechaVisPqr.readOnly = false; fechaVisPqr.style.background = ''; }
    // Restaurar "Sin infracción" en PQR
    const chipSinInfPqr = document.getElementById('chip-sin-infraccion');
    if (chipSinInfPqr) chipSinInfPqr.style.display = '';
  }
}

function actualizarOrdenPQR() {
  const cons = document.getElementById('f-orden-consecutivo-pqr').value.trim();
  const input = document.getElementById('f-orden');
  if (!cons) { input.value = ''; return; }
  const anio = new Date().getFullYear();
  input.value = anio + '-09-' + cons.toString().padStart(3, '0');
}

function inicializarPrefijoOrden() {
  const anio = new Date().getFullYear();
  const pref = document.getElementById('prefijo-orden-pqr');
  if (pref) pref.textContent = anio + '-09-';
  const prefOf = document.getElementById('prefijo-orden');
  if (prefOf) prefOf.textContent = anio + '-09-';
}

function actualizarOrdenYRadicado() {
  const cons = document.getElementById('f-orden-consecutivo').value.trim();
  if (!cons) {
    document.getElementById('radicado-oficio-preview').style.display = 'none';
    document.getElementById('f-orden').value = '';
    return;
  }
  const anio = new Date().getFullYear();
  const consecutivo = cons.toString().padStart(3, '0');
  const numOrden = anio + '-09-' + consecutivo;
  document.getElementById('f-orden').value = numOrden;
  const preview = document.getElementById('radicado-oficio-preview');
  preview.textContent = 'OFICIO-' + numOrden;
  preview.style.display = 'block';
}

function toggleOtroRelacion(val) {
  document.getElementById('grupo-otro-relacion').style.display = val === 'Otro' ? 'block' : 'none';
}

function toggleSuspensionPorEstado(estado) {
  const wrapper = document.getElementById('grupo-suspension-wrapper');
  const grupoOrden = document.getElementById('grupo-orden');
  if (estado === 'Terminada') {
    if (wrapper) wrapper.style.display = 'none';
    if (grupoOrden) grupoOrden.style.display = 'none';
    selRadVal('rg-suspension', 'N/A');
  } else {
    // Solo mostrar wrapper si NO es visita de oficio
    if (wrapper && !ST.esOficio) wrapper.style.display = 'block';
    toggleOrden(getRadVal('rg-suspension') || 'SI');
  }
}

function toggleLicencia(val) {
  document.getElementById('bloque-licencia').style.display = val === 'SI' ? 'block' : 'none';
}

function ocultarSinInfraccion() {
  const sinInfChip = document.querySelector('.chip-inf[data-val="No se evidencia infracción"]');
  if (!sinInfChip) return;
  const esOficio = ST.esOficio;
  const haySuspension = getRadVal('rg-suspension') === 'SI';
  sinInfChip.style.display = (esOficio || haySuspension) ? 'none' : '';
  if ((esOficio || haySuspension) && sinInfChip.classList.contains('activo')) {
    sinInfChip.classList.remove('activo');
    const vals = Array.from(document.querySelectorAll('#chips-infraccion .chip-inf.activo'))
      .map(x => x.dataset.val);
    document.getElementById('f-infraccion').value = vals.join(' | ');
  }
}

function toggleInf(el) {
  const esSinInfraccion = el.dataset.val === 'No se evidencia infracción';
  if (esSinInfraccion) {
    // Si se selecciona "Sin infracción", deseleccionar todas las demás
    document.querySelectorAll('#chips-infraccion .chip-inf').forEach(c => c.classList.remove('activo'));
    el.classList.add('activo');
  } else {
    // Si se selecciona cualquier otra, quitar "Sin infracción"
    document.querySelectorAll('#chips-infraccion .chip-inf').forEach(c => {
      if (c.dataset.val === 'No se evidencia infracción') c.classList.remove('activo');
    });
    el.classList.toggle('activo');
  }
  const vals = Array.from(document.querySelectorAll('#chips-infraccion .chip-inf.activo'))
    .map(c => c.dataset.val);
  document.getElementById('f-infraccion').value = vals.join(' | ');
}

function toggleVis(el) {
  el.classList.toggle('activo');
  const vals = Array.from(document.querySelectorAll('#chips-visitador .chip-vis.activo'))
    .map(c => c.dataset.val);
  document.getElementById('f-visitador').value = vals.join(' / ');
}



function toggleSuspension(val) {
  // Ocultar/mostrar "Sin infracción" según suspensión
  const chipSinInf = document.getElementById('chip-sin-infraccion');
  if (chipSinInf) chipSinInf.style.display = (val === 'SI') ? 'none' : '';
  toggleOrden(val);
  ocultarSinInfraccion();
}

function toggleOrden(val) {
  const grupo = document.getElementById('grupo-orden');
  const input = document.getElementById('f-orden');
  if (val === 'SI') {
    grupo.style.display = 'block';
    input.required = true;
  } else {
    grupo.style.display = 'none';
    input.required = false;
    input.value = '';
  }
}


function irA(id) {
  document.querySelectorAll('.pantalla').forEach(p => p.classList.remove('activa'));
  document.getElementById(id)?.classList.add('activa');
}

function setNav(id) {
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('activo'));
  document.getElementById(id)?.classList.add('activo');
  // Sincronizar sidebar desktop
  const mapa = { 'nav-home':'sd-home','nav-buscar':'sd-buscar','nav-nueva':'sd-nueva','nav-visitas':'sd-registros','nav-registros':'sd-registros','nav-agenda':'sd-agenda' };
  if (mapa[id]) setSidebarActivo(mapa[id]);
}

function setSidebarActivo(id) {
  document.querySelectorAll('.sidebar-btn').forEach(b => b.classList.remove('activo'));
  document.getElementById(id)?.classList.add('activo');
}

// Mostrar/ocultar sidebar según tamaño de pantalla
function adaptarDesktop() {
  const esDesktop = window.innerWidth >= 768;
  const sidebar = document.getElementById('sidebar-desktop');
  if (sidebar) sidebar.style.display = esDesktop ? 'flex' : 'none';
}

window.addEventListener('resize', adaptarDesktop);

function selRad(el, grupo) {
  document.querySelectorAll(`#${grupo} .radio-opcion`).forEach(r => {
    r.classList.remove('sel','sel-verde','sel-rojo','sel-cafe');
  });
  el.classList.add('sel');
}

function selRadVal(grupo, val) {
  const ops = document.querySelectorAll(`#${grupo} .radio-opcion`);
  ops.forEach(o => {
    o.classList.remove('sel','sel-verde','sel-rojo','sel-cafe');
    if (o.dataset.val === val) o.classList.add('sel');
  });
}

function getRadVal(grupo) {
  return document.querySelector(`#${grupo} .sel`)?.dataset.val || '';
}

function notif(msg, tipo) {
  document.querySelectorAll('.notif').forEach(n => n.remove());
  const d = document.createElement('div');
  d.className = `notif ${tipo}`;
  d.textContent = msg;
  document.body.appendChild(d);
  setTimeout(() => d.remove(), 3000);
}

function showLoading(texto, sub) {
  const el = document.getElementById('loading-overlay');
  if (!el) return;
  document.getElementById('loading-texto').textContent = texto || 'Procesando...';
  document.getElementById('loading-sub').textContent = sub || '';
  el.classList.add('visible');
}

function hideLoading() {
  const el = document.getElementById('loading-overlay');
  if (el) el.classList.remove('visible');
}

// ═══════════════════════════════════════════
// INICIO
// ═══════════════════════════════════════════
// ═══════════════════════════════════════════
// FUNCIONES DE ADMINISTRADOR
// ═══════════════════════════════════════════
window.cargarUsuariosAdmin = async function() {
  if (ST.rol !== 'ADMIN') return;
  const div = document.getElementById('admin-lista-usuarios');
  const sel = document.getElementById('admin-sel-usuario');
  div.textContent = 'Cargando...';
  try {
    const r = await fetch(`${CFG.webhook}?accion=leerHoja&hoja=USUARIOS`);
    const data = await r.json();
    if (!data.ok) throw new Error(data.error || 'Error leyendo USUARIOS');
    const filas = (data.values || []).slice(1);
    sel.innerHTML = '';
    let html = '<table style="width:100%; border-collapse:collapse; font-size:12px;">';
    html += '<tr style="background:var(--gris-bg);"><th style="padding:6px; text-align:left;">Nombre</th><th style="padding:6px;">Cargo</th><th style="padding:6px;">Rol</th><th style="padding:6px;">Estado</th></tr>';
    filas.forEach((f, i) => {
      const fila = i + 2;
      const activo = (f[2]||'').toUpperCase() === 'SI';
      const btnLabel = activo ? ' Activo' : ' Inactivo';
      const btnColor = activo ? 'var(--verde)' : 'var(--rojo)';
      const nuevoEstado = activo ? 'NO' : 'SI';
      const nombre = (f[0]||'').replace(/'/g, "\\'");
      html += `<tr style="border-bottom:1px solid var(--borde);">
        <td style="padding:6px;">${f[0]||''}</td>
        <td style="padding:6px; text-align:center; font-size:11px;">${f[3]||''}</td>
        <td style="padding:6px; text-align:center;">${f[4]||''}</td>
        <td style="padding:4px; text-align:center;">
          <button onclick="window.toggleActivo(${fila},'${nuevoEstado}','${nombre}')"
            style="background:${btnColor}; color:white; border:none; border-radius:6px; padding:4px 8px; font-size:11px; cursor:pointer; font-family:inherit;">
            ${btnLabel}
          </button>
        </td>
      </tr>`;
      if (activo) {
        const opt = document.createElement('option');
        opt.value = fila;
        opt.textContent = f[0] || '';
        opt.dataset.nombre = f[0] || '';
        sel.appendChild(opt);
      }
    });
    html += '</table>';
    div.innerHTML = html;
  } catch(e) {
    div.textContent = 'Error al cargar usuarios: ' + e.message;
  }
}

window.resetearPin = async function() {
  if (ST.rol !== 'ADMIN') return;
  const sel = document.getElementById('admin-sel-usuario');
  const pinInput = document.getElementById('admin-nuevo-pin');
  const pin = pinInput.value.trim();
  if (!sel.value) { notif('Selecciona un usuario', 'error'); return; }
  if (!pin || pin.length !== 4 || isNaN(pin)) { notif('PIN debe ser 4 dígitos', 'error'); return; }

  try {
    const pinHash = await hashPin(pin);
    const fila = parseInt(sel.value);
    const nombre = sel.options[sel.selectedIndex].dataset.nombre;
    // Actualizar columna B (HASH) de la fila del usuario via webhook
    const url = CFG.webhook + '?accion=resetPin&fila=' + fila + '&hash=' + encodeURIComponent(pinHash);
    const r = await fetch(url);
    const data = await r.json();
    if (data.ok) {
      // Registrar en log
      window.registrarLog(`PIN reseteado para: ${nombre}`);
      notif('PIN actualizado correctamente para ' + nombre, 'ok');
      pinInput.value = '';
    } else {
      notif('Error al actualizar PIN', 'error');
    }
  } catch(e) {
    notif('Error de conexión', 'error');
  }
}

window.toggleActivo = async function(fila, nuevoEstado, nombre) {
  if (ST.rol !== 'ADMIN') return;
  const accion = nuevoEstado === 'SI' ? 'activado' : 'desactivado';
  if (!confirm(`¿${accion.charAt(0).toUpperCase() + accion.slice(1)} al usuario ${nombre}?`)) return;
  try {
    const url = CFG.webhook + '?accion=toggleActivo&fila=' + fila + '&estado=' + encodeURIComponent(nuevoEstado);
    const r = await fetch(url);
    const data = await r.json();
    if (data.ok) {
      window.registrarLog(`Usuario ${accion}: ${nombre}`);
      notif(`Usuario ${nombre} ${accion} correctamente`, 'ok');
      window.cargarUsuariosAdmin();
    } else {
      notif('Error al cambiar estado: ' + (data.error || ''), 'error');
    }
  } catch(e) {
    notif('Error de conexión', 'error');
  }
};

window.registrarLog = async function(accion) {
  // Registrar en hoja LOG_AUDITORIA
  try {
    const fecha = new Date().toLocaleString('es-CO', {timeZone:'America/Bogota'});
    const url = CFG.webhook + '?accion=log&usuario=' + encodeURIComponent(ST.usuario) +
      '&accion_texto=' + encodeURIComponent(accion) + '&fecha=' + encodeURIComponent(fecha);
    await fetch(url);
  } catch(e) { /* silencioso */ }
}

window.cargarLog = async function() {
  if (ST.rol !== 'ADMIN') return;
  const div = document.getElementById('admin-log');
  div.textContent = 'Cargando...';
  try {
    const r = await fetch(`${CFG.webhook}?accion=leerHoja&hoja=LOG_AUDITORIA`);
    const data = await r.json();
    if (!data.ok) throw new Error(data.error || 'Error leyendo LOG_AUDITORIA');
    const filas = (data.values || []).slice(1).reverse().slice(0, 50);
    if (!filas.length) { div.textContent = 'Sin registros.'; return; }
    let html = '';
    filas.forEach(f => {
      html += `<div style="padding:4px 0; border-bottom:1px solid var(--borde);">
        <span style="color:var(--azul-claro);">${f[0]||''}</span> —
        <strong>${f[1]||''}</strong>: ${f[2]||''}
      </div>`;
    });
    div.innerHTML = html;
  } catch(e) {
    div.textContent = 'Sin hoja LOG_AUDITORIA o error de conexión.';
  }
}


// ═══════════════════════════════════════════
// Leer USUARIOS activos para el selector de login (vía webhook)
window.cargarInspectorLogin = function() {
  fetch(CFG.webhook + '?accion=leerHoja&hoja=USUARIOS')
    .then(function(r) { return r.json(); })
    .then(function(d) {
      if (!d.ok) throw new Error(d.error || 'Error');
      const filas = (d.values || []).slice(1);
      const sel = document.getElementById('login-nombre');
      sel.innerHTML = '<option value="">Selecciona tu nombre...</option>';
      filas.forEach(function(f) {
        if (f[2] && f[2].toString().toUpperCase() === 'SI') {
          const opt = document.createElement('option');
          opt.value = f[0];
          opt.textContent = f[0];
          sel.appendChild(opt);
        }
      });
    })
    .catch(function() {
      document.getElementById('login-nombre').innerHTML = '<option value="">Error cargando lista</option>';
    });
};

window.addEventListener('load', () => {
  cargarInspectorLogin();
  setMaxFechas();
  const nombre = localStorage.getItem('cu_usuario');
  const cargo = localStorage.getItem('cu_cargo');
  const rol = localStorage.getItem('cu_rol');
  const expira = parseInt(localStorage.getItem('cu_sesion_expira') || '0');
  if (nombre && rol && expira && Date.now() < expira) {
    ST.usuario = nombre;
    ST.cargo = cargo || 'Inspector';
    ST.rol = rol;
    const sel = document.getElementById('login-nombre');
    if (sel) sel.value = nombre;
    mostrarApp();
  } else if (nombre) {
    // Sesión expirada — limpiar
    cerrarSesion();
  }
});
// ── Lazy load ExcelJS ────────────────────────────────────
let _excelJSCargado = false;
async function cargarExcelJS() {
  if (_excelJSCargado) return;
  await new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.3.0/exceljs.min.js';
    s.onload = () => { _excelJSCargado = true; resolve(); };
    s.onerror = () => reject(new Error('Sin conexión para ExcelJS'));
    document.head.appendChild(s);
  });
}

// ═══════════════════════════════════════════
// GENERADOR F-GGO-46 xlsx (ExcelJS)
// ═══════════════════════════════════════════

const IMG_ESCUDO_B64 = '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';
const IMG_BANNER_B64 = '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';

function fmtFecha(iso) {
  if (!iso) return '';
  const [y,m,d] = iso.split('-');
  return d + '/' + m + '/' + y;
}

async function generarXLSX(d) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Inspeccion N9';
  wb.created = new Date();
  const ws = wb.addWorksheet('CARACTERIZACIÓN', {
    pageSetup: { paperSize: 1, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });

  // ── Anchos de columna A-M ──────────────────────────────────────
  [8.5,6,6,6,6,6,6,6,6,6,6.3,5.3,11.3].forEach((w,i) => { ws.getColumn(i+1).width = w; });

  // ── Estilos base ───────────────────────────────────────────────
  const THIN  = { style:'thin', color:{ argb:'FF000000' } };
  const BORDE = { top:THIN, left:THIN, bottom:THIN, right:THIN };
  const GRAY  = 'FFD9D9D9';

  // Aplica borde a todas las celdas de un rango (incluidas las del merge)
  function bordearRango(r1,c1,r2,c2) {
    for (let r=r1; r<=r2; r++) {
      for (let c=c1; c<=c2; c++) {
        ws.getCell(r,c).border = BORDE;
      }
    }
  }

  // Sección encabezado gris
  function seccion(r1c1, r2c2, texto) {
    ws.mergeCells(r1c1 + ':' + r2c2);
    const c = ws.getCell(r1c1);
    c.value = texto;
    c.font = { name:'Arial', size:8, bold:true };
    c.alignment = { horizontal:'center', vertical:'middle', wrapText:true };
    c.fill = { type:'pattern', pattern:'solid', fgColor:{ argb:GRAY } };
    c.border = BORDE;
  }

  // Campo con etiqueta en negrita (fila 1) y valor (fila 2) — dos líneas reales
  // Estrategia: una sola celda, richText con \r\n real como separador
  function campo(r1c1, r2c2, label, valor) {
    if (r2c2) ws.mergeCells(r1c1 + ':' + r2c2);
    const c = ws.getCell(r1c1);
    // String simple con \n — Excel lo respeta con wrapText
    // La etiqueta va en una línea, el valor en la siguiente
    c.value = (label ? label + '\n' : '') + (valor || '');
    c.font = { name:'Arial', size:8 };
    c.alignment = { vertical:'top', wrapText:true, horizontal:'left' };
    c.border = BORDE;
    return c;
  }

  // Campo solo valor (sin etiqueta) centrado — para headers de tabla
  function celdaVal(r1c1, r2c2, texto, bold, center) {
    if (r2c2) ws.mergeCells(r1c1 + ':' + r2c2);
    const c = ws.getCell(r1c1);
    c.value = texto || '';
    c.font = { name:'Arial', size:8, bold: !!bold };
    c.alignment = { vertical:'middle', wrapText:true, horizontal: center ? 'center' : 'left' };
    c.border = BORDE;
    return c;
  }

  // ── ENCABEZADO (filas 1-7) ─────────────────────────────────────
  // Layout:
  //  A1:I7  → escudo (imagen)
  //  J1:M2  → logos Icontec/Ionet (imagen)
  //  J3:M4  → Municipio de Bello / Secretaría
  //  J5:M6  → Código F-GGO-46, versión, vigencia, visita N°
  //  J7:M7  → ACTA DE INSPECCIÓN OCULAR + Inspección N°9

  ws.getRow(1).height = 18;
  ws.getRow(2).height = 18;
  ws.getRow(3).height = 18;
  ws.getRow(4).height = 18;
  ws.getRow(5).height = 14;
  ws.getRow(6).height = 14;
  ws.getRow(7).height = 16;

  // Merge escudo
  ws.mergeCells('A1:I7');
  const cEscudo = ws.getCell('A1');
  cEscudo.alignment = { horizontal:'center', vertical:'middle' };
  cEscudo.border = BORDE;

  // Merge logos imagen
  ws.mergeCells('J1:M2');
  const cLogos = ws.getCell('J1');
  cLogos.alignment = { horizontal:'center', vertical:'middle' };
  cLogos.border = BORDE;

  // Municipio/Secretaría
  ws.mergeCells('J3:M4');
  const cMun = ws.getCell('J3');
  cMun.value = 'MUNICIPIO DE BELLO\nSECRETARÍA DE SEGURIDAD Y CONVIVENCIA CIUDADANA';
  cMun.font = { name:'Arial', size:8, bold:true };
  cMun.alignment = { horizontal:'center', vertical:'middle', wrapText:true };
  cMun.border = BORDE;

  // Código, versión, vigencia, visita
  ws.mergeCells('J5:M5');
  const cCod = ws.getCell('J5');
  cCod.value = 'Código: F-GGO-46    Versión: 01    Vigencia: 2023    Visita N°: ' + (d.nVisita || 1);
  cCod.font = { name:'Arial', size:7 };
  cCod.alignment = { horizontal:'center', vertical:'middle', wrapText:true };
  cCod.border = BORDE;

  // Título acta + inspección N°9
  ws.mergeCells('J6:M7');
  const cTitulo = ws.getCell('J6');
  cTitulo.value = 'ACTA DE INSPECCIÓN OCULAR – CARACTERIZACIÓN DE LA INTERVENCIÓN\nInspección N°9 de Convivencia con Funciones de Control Urbano';
  cTitulo.font = { name:'Arial', size:7, bold:true };
  cTitulo.alignment = { horizontal:'center', vertical:'middle', wrapText:true };
  cTitulo.border = BORDE;

  // ── DATOS GENERALES ────────────────────────────────────────────
  ws.getRow(8).height = 12;
  seccion('A8','M8','DATOS GENERALES');

  ws.getRow(9).height = 28;
  campo('A9','G9','FECHA DE VISITA', fmtFecha(d.fechaVisita));
  campo('H9','M9','RADICADO', d.radicado);

  ws.getRow(10).height = 28;
  campo('A10','G10','OBJETO DE LA VISITA','Verificación de construcción e intervención urbanística');
  campo('H10','M10','FECHA RADICADO', fmtFecha(d.fechaRadicado));

  ws.getRow(11).height = 28;
  campo('A11','G11','DIRECCIÓN DEL INMUEBLE', d.direccion);
  campo('H11','M11','BARRIO', d.barrio);

  ws.getRow(12).height = 28;
  campo('A12','G12','NOMBRE DE LA PERSONA QUE ATIENDE', d.atiendeNombre);
  campo('H12','J12','N° IDENTIFICACIÓN', d.atiendeId);
  campo('K12','M12','TELÉFONO', d.atiendeTel);

  ws.getRow(13).height = 28;
  campo('A13','G13','DIRECCIÓN NOTIFICACIÓN', d.atiendeDir);
  campo('H13','M13','RELACIÓN CON EL EVENTO', d.atiendeRelacion);

  ws.getRow(14).height = 28;
  campo('A14','M14','CORREO ELECTRÓNICO', d.atiendeEmail);

  // ── VERIFICACIÓN DOCUMENTAL ────────────────────────────────────
  ws.getRow(15).height = 15;
  ws.mergeCells('A15:M15');
  const licSi = d.licenciaAportada === 'SI';
  const cVerif = ws.getCell('A15');
  cVerif.value = { richText: [
    { text:'VERIFICACIÓN DOCUMENTAL  ', font:{ name:'Arial', size:8, bold:true } },
    { text:'Se aporta licencia  ', font:{ name:'Arial', size:8 } },
    { text:(licSi?'☑':'☐')+' Sí    ', font:{ name:'Arial', size:9 } },
    { text:(licSi?'☐':'☑')+' No',   font:{ name:'Arial', size:9 } },
  ]};
  cVerif.alignment = { horizontal:'center', vertical:'middle' };
  cVerif.fill = { type:'pattern', pattern:'solid', fgColor:{ argb:GRAY } };
  cVerif.border = BORDE;

  let nextRow = 16;

  if (licSi) {
    ws.getRow(16).height = 22;
    campo('A16','F16','N° DE LICENCIA', d.licenciaN);
    campo('G16','M16','FECHA LICENCIA', fmtFecha(d.licenciaFecha));

    ws.getRow(17).height = 22;
    campo('A17','M17','TIPO DE LICENCIA Y MODALIDAD', d.licenciaTipo);

    ws.getRow(18).height = 22;
    campo('A18','B18','N° PISOS', d.licenciaPisos);
    campo('C18','H18','N° DESTINACIONES Y USOS', d.licenciaDest);
    campo('I18','K18','TIPO DE CUBIERTA', d.licenciaCubierta);
    campo('L18','M18','SIST. ESTRUCTURAL', d.licenciaSistema);

    ws.getRow(19).height = 40;
    campo('A19','M19','Observaciones', d.licenciaObs);
    nextRow = 20;
  } else {
    ws.getRow(16).height = 14;
    ws.mergeCells('A16:M16');
    const cNoLic = ws.getCell('A16');
    cNoLic.value = 'No se aportó documentación urbanística.';
    cNoLic.font = { name:'Arial', size:8, italic:true };
    cNoLic.alignment = { horizontal:'left', vertical:'middle' };
    cNoLic.border = BORDE;
    nextRow = 17;
  }

  // ── CARACTERÍSTICAS ACTUALES ────────────────────────────────────
  const rCA = nextRow++;
  ws.getRow(rCA).height = 12;
  seccion('A'+rCA,'M'+rCA,'CARACTERÍSTICAS ACTUALES DE LA EDIFICACIÓN');

  const rCA1 = nextRow++;
  ws.getRow(rCA1).height = 30;
  const enProceso = (d.estadoObra||'').toLowerCase().includes('proceso') || (d.estadoObra||'').toLowerCase().includes('iniciada');

  ws.mergeCells('A'+rCA1+':D'+rCA1);
  const cEst = ws.getCell('A'+rCA1);
  cEst.value = { richText:[
    { text:'ESTADO OBRA\r\n', font:{ name:'Arial', size:7, bold:true } },
    { text:(enProceso?'☑':'☐')+' En proceso/iniciada   '+(enProceso?'☐':'☑')+' Terminada', font:{ name:'Arial', size:8 } }
  ]};
  cEst.alignment = { vertical:'top', wrapText:true };
  cEst.border = BORDE;

  ws.mergeCells('E'+rCA1+':H'+rCA1);
  const cRep = ws.getCell('E'+rCA1);
  cRep.value = { richText:[
    { text:'¿REPARACIÓN LOCATIVA?\r\n', font:{ name:'Arial', size:7, bold:true } },
    { text:(d.repLocativa==='SI'?'☑':'☐')+' Sí   '+(d.repLocativa==='SI'?'☐':'☑')+' No', font:{ name:'Arial', size:8 } }
  ]};
  cRep.alignment = { vertical:'top', wrapText:true };
  cRep.border = BORDE;

  ws.mergeCells('I'+rCA1+':K'+rCA1);
  const cHab = ws.getCell('I'+rCA1);
  cHab.value = { richText:[
    { text:'¿HABITADO?\r\n', font:{ name:'Arial', size:7, bold:true } },
    { text:(d.habitado==='SI'?'☑':'☐')+' Sí   '+(d.habitado==='SI'?'☐':'☑')+' No', font:{ name:'Arial', size:8 } }
  ]};
  cHab.alignment = { vertical:'top', wrapText:true };
  cHab.border = BORDE;

  campo('L'+rCA1,'M'+rCA1,'ALTURA EN PISOS', d.alturaP);

  const rCA2 = nextRow++;
  ws.getRow(rCA2).height = 28;
  campo('A'+rCA2,'C'+rCA2,'N° DESTINACIONES', d.destActuales);
  campo('D'+rCA2,'H'+rCA2,'USOS', d.usos);
  campo('I'+rCA2,'M'+rCA2,'TIPO DE CUBIERTA', d.cubiertalActual);

  // ── SITUACIÓN ENCONTRADA ────────────────────────────────────────
  const rSE = nextRow++;
  ws.getRow(rSE).height = 12;
  seccion('A'+rSE,'M'+rSE,'SITUACIÓN ENCONTRADA');

  const rSEval = nextRow++;
  ws.getRow(rSEval).height = 200;
  ws.mergeCells('A'+rSEval+':M'+rSEval);
  const cSit = ws.getCell('A'+rSEval);
  // situacion puede ser vacío — se deja el espacio en blanco para diligenciar
  cSit.value = d.situacion || '';
  cSit.font = { name:'Arial', size:8 };
  cSit.alignment = { vertical:'top', wrapText:true, horizontal:'left' };
  cSit.border = BORDE;

  // ── CONSULTA NORMA ─────────────────────────────────────────────
  const rCN = nextRow++;
  ws.getRow(rCN).height = 12;
  seccion('A'+rCN,'M'+rCN,'CONSULTA NORMA');

  const rCN1 = nextRow++;
  ws.getRow(rCN1).height = 28;
  campo('A'+rCN1,'G'+rCN1,'CÓDIGO CATASTRAL', d.catastral);
  campo('H'+rCN1,'M'+rCN1,'N° FICHA PREDIAL', d.ficha);

  const rCN2 = nextRow++;
  ws.getRow(rCN2).height = 28;
  campo('A'+rCN2,'E'+rCN2,'POLÍGONO USO DEL SUELO', d.poligono);

  ws.mergeCells('F'+rCN2+':H'+rCN2);
  const cAme = ws.getCell('F'+rCN2);
  cAme.value = { richText:[
    { text:'¿AMENAZA?\r\n', font:{ name:'Arial', size:7, bold:true } },
    { text:(d.amenaza==='SI'?'☑':'☐')+' Sí   '+(d.amenaza==='SI'?'☐':'☑')+' No', font:{ name:'Arial', size:8 } }
  ]};
  cAme.alignment = { vertical:'top', wrapText:true };
  cAme.border = BORDE;

  ws.mergeCells('I'+rCN2+':M'+rCN2);
  const cSuelo = ws.getCell('I'+rCN2);
  cSuelo.value = { richText:[
    { text:'¿SUELO DE PROTECCIÓN?\r\n', font:{ name:'Arial', size:7, bold:true } },
    { text:(d.sueloProt==='SI'?'☑':'☐')+' Sí   '+(d.sueloProt==='SI'?'☐':'☑')+' No', font:{ name:'Arial', size:8 } }
  ]};
  cSuelo.alignment = { vertical:'top', wrapText:true };
  cSuelo.border = BORDE;

  // ── CONCLUSIONES ───────────────────────────────────────────────
  const rCO = nextRow++;
  ws.getRow(rCO).height = 12;
  seccion('A'+rCO,'M'+rCO,'CONCLUSIONES');

  const rCO1 = nextRow++;
  ws.getRow(rCO1).height = 35;
  campo('A'+rCO1,'E'+rCO1,'COMPORTAMIENTO CONTRARIO A LA INTEGRIDAD URBANÍSTICA (Art. 135 Ley 1801/2016)', d.infraccion);
  campo('F'+rCO1,'M'+rCO1,'ÁREA EN CONTRAVENCIÓN (m²)', d.area);

  // Observaciones conclusiones
  const rCO2 = nextRow;
  for(let i=0;i<5;i++) { ws.getRow(rCO2+i).height = 10; }
  ws.mergeCells('A'+rCO2+':M'+(rCO2+4));
  const cObsCO = ws.getCell('A'+rCO2);
  cObsCO.value = { richText:[
    { text:'Observaciones:\r\n', font:{ name:'Arial', size:7, bold:false } },
    { text: d.obsConclusion || '', font:{ name:'Arial', size:8 } }
  ]};
  cObsCO.alignment = { vertical:'top', wrapText:true };
  cObsCO.border = BORDE;
  nextRow = rCO2 + 5;

  // ── ORDEN Y CITACIÓN ───────────────────────────────────────────
  const rOR = nextRow++;
  ws.getRow(rOR).height = 28;
  campo('A'+rOR,'G'+rOR,'N° ORDEN DE SUSPENSIÓN (Sí aplica)', d.suspension==='SI' ? d.orden : '');
  campo('H'+rOR,'M'+rOR,'FECHA CITACIÓN (Sí aplica)', d.suspension==='SI' ? d.citacion : '');

  const rQB = nextRow++;
  ws.getRow(rQB).height = 15;
  campo('A'+rQB,'G'+rQB,'CUMPLE RETIRO DE QUEBRADA', d.retiroQuebrada || '');

  // ── SEPARADOR ─────────────────────────────────────────────────
  const rSep = nextRow++;
  ws.getRow(rSep).height = 7.5;
  ws.mergeCells('A'+rSep+':M'+rSep);
  ws.getCell('A'+rSep).border = BORDE;

  // ── FUNCIONARIOS ───────────────────────────────────────────────
  const rFU = nextRow++;
  ws.getRow(rFU).height = 12;
  seccion('A'+rFU,'M'+rFU,'FUNCIONARIOS QUE REALIZAN LA INSPECCIÓN OCULAR');

  const rFH = nextRow++;
  ws.getRow(rFH).height = 12;
  celdaVal('A'+rFH,'E'+rFH,'NOMBRE',true,true);
  celdaVal('F'+rFH,'J'+rFH,'CARGO',true,true);
  celdaVal('K'+rFH,'M'+rFH,'FIRMA',true,true);

  const visitadores = d.visitadores || [];
  const minV = Math.max(visitadores.length, 2);
  for (let i=0; i<minV; i++) {
    const rv = nextRow++;
    ws.getRow(rv).height = 20;
    celdaVal('A'+rv,'E'+rv, visitadores[i]||'',false,false);
    const nomVis = (visitadores[i] || '').toUpperCase();
    // Buscar cargo: primero exacto, luego por coincidencia parcial
    let cargoVis = '';
    if (ST._cargosUsuarios) {
      if (ST._cargosUsuarios[nomVis]) {
        cargoVis = ST._cargosUsuarios[nomVis];
      } else {
        // Búsqueda parcial: buscar si el nombre del chip está contenido en el nombre completo
        const matchKey = Object.keys(ST._cargosUsuarios).find(k =>
          k.includes(nomVis) || nomVis.includes(k.split(' ')[0] + ' ' + k.split(' ')[1])
        );
        cargoVis = matchKey ? ST._cargosUsuarios[matchKey] : (visitadores[i] ? ST.cargo : '');
      }
    } else {
      cargoVis = visitadores[i] ? ST.cargo : '';
    }
    celdaVal('F'+rv,'J'+rv, cargoVis, false, false);
    celdaVal('K'+rv,'M'+rv,'',false,false);
  }

  // ── IMÁGENES ───────────────────────────────────────────────────
  const idEscudo = wb.addImage({ base64: IMG_ESCUDO_B64, extension:'jpeg' });
  ws.addImage(idEscudo, { tl:{ col:0, row:0 }, br:{ col:9, row:7 }, editAs:'oneCell' });

  const idBanner = wb.addImage({ base64: IMG_BANNER_B64, extension:'png' });
  ws.addImage(idBanner, { tl:{ col:9, row:0 }, br:{ col:13, row:2 }, editAs:'oneCell' });

  // ── DESCARGA ───────────────────────────────────────────────────
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'F-GGO-46_' + (d.radicado||'ACTA').replace(/[^A-Z0-9-]/gi,'_') + '_V' + (d.nVisita||1) + '.xlsx';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
const APPS_SCRIPT_F46_URL = 'https://script.google.com/macros/s/AKfycbzcdXOoxg2elyYnlO03VMcNj-MLx_tzDRYMhmvDYCfxDiX0XlZHIEHZOGsqsITX45Yb/exec';

function recopilarDatosF46() {
  return {
    radicado: ST.esOficio ? (document.getElementById('f-orden').value ? 'OFICIO-' + document.getElementById('f-orden').value : '') : document.getElementById('f-radicado').value,
    fechaVisita: document.getElementById('f-fecha-visita').value,
    fechaRadicado: ST.esOficio
      ? (ST._fechaPrimeraVisita || isoAFecha(document.getElementById('f-fecha-visita').value))
      : isoAFecha(document.getElementById('f-fecha-radicado').value),
    nVisita: ST.nVisita || 1,
    objetoVisita: ST.esOficio ? 'Verificación integridad urbanística' : 'Atención queja',
    direccion: document.getElementById('f-direccion').value,
    barrio: document.getElementById('f-barrio').value,
    atiendeNombre: document.getElementById('f-atiende-nombre').value,
    atiendeId: document.getElementById('f-atiende-id').value,
    atiendeTel: document.getElementById('f-atiende-tel').value,
    atiendeRelacion: getRadVal('rg-relacion') === 'Otro' ? document.getElementById('f-otro-relacion').value : getRadVal('rg-relacion'),
    atiendeDir: document.getElementById('f-atiende-dir').value,
    atiendeEmail: document.getElementById('f-atiende-email').value,
    licenciaAportada: getRadVal('rg-licencia-aportada'),
    licenciaN: document.getElementById('f-licencia').value,
    licenciaFecha: document.getElementById('f-fecha-licencia').value,
    licenciaTipo: document.getElementById('f-tipo-licencia').value,
    licenciaPisos: document.getElementById('f-pisos').value,
    licenciaDest: document.getElementById('f-destinaciones').value,
    licenciaCubierta: document.getElementById('f-cubierta').value,
    licenciaSistema: document.getElementById('f-sistema').value,
    licenciaObs: document.getElementById('f-obs-licencia').value,
    estadoObra: getRadVal('rg-estado-obra'),
    repLocativa: getRadVal('rg-rep-locativa'),
    habitado: getRadVal('rg-habitado'),
    alturaP: document.getElementById('f-altura-pisos').value,
    destActuales: document.getElementById('f-dest-actuales').value,
    usos: document.getElementById('f-usos').value,
    cubiertalActual: document.getElementById('f-cubierta-actual').value,
    situacion: document.getElementById('transcripcion').value,
    catastral: document.getElementById('f-catastral').value,
    ficha: document.getElementById('f-ficha').value,
    poligono: document.getElementById('f-poligono').value,
    amenaza: getRadVal('rg-amenaza'),
    sueloProt: getRadVal('rg-suelo-prot'),
    retiroQuebrada: getRadVal('rg-quebrada'),
    infraccion: document.getElementById('f-infraccion').value,
    area: document.getElementById('f-area').value,
    suspension: getRadVal('rg-suspension'),
    orden: document.getElementById('f-orden').value,
    citacion: (() => {
      const cf = document.getElementById('f-citacion-fecha').value;
      const ch = document.getElementById('f-citacion-hora').value;
      if (!cf) return '';
      const horas = {'08:00':'8:00 AM','09:00':'9:00 AM','10:00':'10:00 AM','11:00':'11:00 AM','14:00':'2:00 PM','15:00':'3:00 PM','16:00':'4:00 PM'};
      return cf + (ch ? ' · ' + (horas[ch] || ch) : '');
    })(),
    visitadores: document.getElementById('f-visitador').value.split(' / ').filter(v => v),
    obsConclusion: (document.getElementById('f-obs-acta') || {}).value || '',
  };
}

async function descargarF46xlsx() {
  const camposObl = [
    {id:'f-fecha-visita', label:'Fecha de visita'},
    {id:'f-direccion', label:'Dirección del inmueble'},
    {id:'f-barrio', label:'Barrio'},
    {id:'f-atiende-nombre', label:'Nombre persona que atiende'},
    {id:'f-atiende-id', label:'N° identificación'},
    {id:'f-poligono', label:'Polígono uso del suelo'},
    {id:'f-infraccion', label:'Tipo de infracción'},
  ];
  for (const c of camposObl) {
    const el = document.getElementById(c.id);
    if (!el || !el.value.trim()) {
      notif('Campo obligatorio: ' + c.label, 'error');
      el && el.scrollIntoView({behavior:'smooth', block:'center'});
      return;
    }
  }
  // Generar el acta directamente — el Registro Fotográfico es independiente
  generarActaF46Final();
}

async function generarActaF46Final() {
  try {
    showLoading('Generando acta F-GGO-46...', 'Esto puede tardar 30-60 segundos');
    const datos = recopilarDatosF46();

    // Carpeta de la visita (padre de Fotos) para guardar el acta
    datos.idCarpetaVisita = ST._idCarpetaVisita || null;

    // Mapa nombre→cargo para nombre completo en acta
    datos.cargosUsuarios = ST._cargosUsuarios || {};

    // POST con text/plain evita CORS preflight
    const r = await fetch(CFG.webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ accion: 'generarActa', ...datos })
    });
    const d = await r.json();

    if (d.ok) {
      // ── Paso 1 completado: Sheet con CARACTERIZACIÓN ──────────
      ST._ssIdActa      = d.ssId      || '';
      ST._linkSheetActa = d.linkSheet || '';
      ST._linkPdfActa   = '';
      ST._linkXlsxActa  = d.linkSheet || '';
      ST._actaGenerada  = true;

      if (ST.filaEditando && d.linkSheet) {
        await guardarLinkActaEnBD('', d.linkSheet, d.ssId);
      }

      const msgActa = d.yaExistia
        ? ' El acta ya existía — abriendo la existente'
        : ' Acta generada — usa el botón "Registro fotográfico" para el Doc con fotos';
      notif(msgActa, d.yaExistia ? 'aviso' : 'exito');

      hideLoading();
      actualizarPanelEstado();
      actualizarBotonesActa();
    } else {
      hideLoading();
      notif('Error al generar acta: ' + (d.error || 'Error desconocido'), 'error');
    }
  } catch(e) {
    hideLoading();
    console.error(e);
    const datos = recopilarDatosF46();
    const payload = encodeURIComponent(JSON.stringify(datos));
    window.open(APPS_SCRIPT_F46_URL + '?datos=' + payload, '_blank');
    notif(' Acta generada (sin fotos integradas)', 'exito');
    ST._actaGenerada = true;
    actualizarPanelEstado();
  }
}

async function guardarLinkActaEnBD(linkPdf, linkSheet, ssId) {
  const fila = ST.filaEditando;
  if (!fila) {
    console.warn('[guardarLinkActaEnBD] ST.filaEditando no está definido — link no guardado en BD');
    return;
  }
  try {
    const payload = {
      accion:       'actualizarLinks',
      fila:         fila,
      linkPdfActa:  linkPdf  || '',
      linkXlsxActa: linkSheet || '',
      ssIdActa:     ssId     || ''
    };
    const r = await fetch(CFG.webhook, {
      method:  'POST',
      headers: { 'Content-Type': 'text/plain' },
      body:    JSON.stringify(payload)
    });
    const d = await r.json();
    if (!d.ok) {
      console.error('[guardarLinkActaEnBD] Apps Script error:', d.error);
      notif(' Acta generada pero no se pudo guardar el link en BD: ' + (d.error || ''), 'aviso');
    }
  } catch(e) {
    console.warn('[guardarLinkActaEnBD] Error de red:', e);
    notif(' Acta generada pero sin conexión para guardar link en BD', 'aviso');
  }
}

function actualizarBotonesActa() {
  const esCompletado = ST._estadoVisita === 'COMPLETADO';
  const linkSheet    = ST._linkSheetActa || ST._linkXlsxActa || '';
  const tieneSheet   = !!linkSheet;
  const tienePdf     = !!ST._linkPdfActa;
  const esAdmin      = ST.rol === 'ADMIN';

  // Botón "Abrir Acta": visible si hay sheet Y no hay PDF todavía (antes de COMPLETADO o siempre que no haya PDF)
  const btnVerSheet = document.getElementById('btn-ver-acta-pdf');
  if (btnVerSheet) {
    if (tieneSheet && !tienePdf) {
      btnVerSheet.style.display = '';
      btnVerSheet.innerHTML = '<span class="ico"><svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"/></svg></span> Abrir Acta';
      btnVerSheet.onclick = () => window.open(linkSheet, '_blank');
    } else {
      btnVerSheet.style.display = 'none';
    }
  }

  // Botón PDF: visible solo cuando estado = COMPLETADO y existe PDF
  const btnVerPdf = document.getElementById('btn-ver-pdf-acta');
  if (btnVerPdf) {
    if (esCompletado && tienePdf) {
      btnVerPdf.style.display = '';
      btnVerPdf.onclick = () => window.open(ST._linkPdfActa, '_blank');
    } else {
      btnVerPdf.style.display = 'none';
    }
  }

  // Botón Generar PDF: solo ADMIN, cuando hay Sheet y estado = COMPLETADO pero sin PDF aún
  const btnGenPdf = document.getElementById('btn-generar-pdf-acta');
  if (btnGenPdf) {
    btnGenPdf.style.display = (esAdmin && tieneSheet && esCompletado && !tienePdf) ? '' : 'none';
  }

  // Botón Generar Acta xlsx: solo si hay carpeta Y no existe acta aún (ningún link ni flag)
  const btnGenActa = document.getElementById('btn-generar-acta');
  if (btnGenActa) {
    const yaHayActa = tieneSheet || tienePdf || ST._actaGenerada || !!ST._ssIdActa;
    btnGenActa.style.display = (ST._idCarpetaFotos && !yaHayActa) ? '' : 'none';
  }

  // Botón "Registro fotográfico": genera el Doc con fotos en Google Docs.
  // Visible si: hay carpeta de fotos (Drive) + no se ha generado el Doc aún.
  // No requiere acta Sheet ni fotos de sesión — el Doc de RF es independiente.
  const btnInsertarFotos = document.getElementById('btn-insertar-fotos-acta');
  if (btnInsertarFotos) {
    const yaHayRegistroFotos = !!ST._docIdRegistroFotos || !!ST._linkDocRegistroFotos;
    btnInsertarFotos.style.display = (ST._idCarpetaFotos && !yaHayRegistroFotos) ? '' : 'none';
  }

  // Botón "Ver registro fotográfico": abre el Doc generado.
  // Visible si ya se generó el Doc de fotos.
  const btnVerRegFotos = document.getElementById('btn-ver-registro-fotos');
  if (btnVerRegFotos) {
    if (ST._linkDocRegistroFotos) {
      btnVerRegFotos.style.display = '';
      btnVerRegFotos.onclick = () => window.open(ST._linkDocRegistroFotos, '_blank');
    } else {
      btnVerRegFotos.style.display = 'none';
    }
  }
}

// ═══════════════════════════════════════════
// GENERAR PDF DESDE SHEET EXISTENTE (Admin)
// ═══════════════════════════════════════════
async function generarPdfDesdeSheet() {
  if (!ST._ssIdActa) { notif('No hay acta generada para convertir a PDF', 'error'); return; }
  if (!ST._idCarpetaVisita) { notif('No se encontró la carpeta de la visita', 'error'); return; }
  showLoading('Generando PDF...', 'Convirtiendo acta a PDF');
  try {
    const r = await fetch(CFG.webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({
        accion:          'generarPdfActa',
        ssId:            ST._ssIdActa,
        idCarpetaVisita: ST._idCarpetaVisita,
        cantFotos:       0
      })
    });
    const d = await r.json();
    if (d.ok && d.linkPdf) {
      ST._linkPdfActa = d.linkPdf;
      await guardarLinkActaEnBD(d.linkPdf, ST._linkSheetActa, ST._ssIdActa);
      hideLoading();
      actualizarBotonesActa();
      notif(' PDF generado correctamente', 'exito');
    } else {
      hideLoading();
      notif('Error generando PDF: ' + (d.error || 'Error desconocido'), 'error');
    }
  } catch(e) {
    hideLoading();
    notif('Error de conexión al generar PDF: ' + e.message, 'error');
  }
}

// ═══════════════════════════════════════════
// CHIPS USOS ACTUALES
// ═══════════════════════════════════════════
function toggleUso(el) {
  el.classList.toggle('activo');
  actualizarUsos();
  // Mostrar campo "¿Qué funciona?" si hay algo distinto de Residencial
  const activos = [...document.querySelectorAll('#chips-usos .chip-inf.activo')].map(c => c.dataset.val);
  const tieneNoResidencial = activos.some(v => v !== 'Residencial');
  document.getElementById('grupo-uso-cual').style.display = tieneNoResidencial ? 'block' : 'none';
}

function actualizarUsos() {
  const activos = [...document.querySelectorAll('#chips-usos .chip-inf.activo')].map(c => c.dataset.val);
  const cual = document.getElementById('f-uso-cual').value.trim();
  const final = activos.map(v => {
    if (v === 'Otro') return cual || null;                         // Otro → reemplazar por el texto
    if (v !== 'Residencial' && cual) return v + ' (' + cual + ')'; // Comercial/Industrial/etc. → agregar detalle
    return v;                                                       // Residencial → sin cambios
  }).filter(Boolean);
  document.getElementById('f-usos').value = final.join(', ');
}

// ═══════════════════════════════════════════
// CHIPS CUBIERTA ACTUAL
// ═══════════════════════════════════════════
function toggleCubierta(el) {
  el.classList.toggle('activo');
  actualizarCubierta();
  const activos = [...document.querySelectorAll('#chips-cubierta .chip-inf.activo')].map(c => c.dataset.val);
  document.getElementById('grupo-cubierta-cual').style.display = activos.includes('Otro') ? 'block' : 'none';
}

function actualizarCubierta() {
  const activos = [...document.querySelectorAll('#chips-cubierta .chip-inf.activo')].map(c => c.dataset.val);
  const cual = document.getElementById('f-cubierta-cual').value.trim();
  const final = activos.map(v => (v === 'Otro' && cual) ? cual : v).filter(v => v !== 'Otro' || cual);
  document.getElementById('f-cubierta-actual').value = final.join(', ');
}

function resetChipsUsosCubierta() {
  document.querySelectorAll('#chips-usos .chip-inf').forEach(c => c.classList.remove('activo'));
  document.querySelectorAll('#chips-cubierta .chip-inf').forEach(c => c.classList.remove('activo'));
  document.getElementById('f-usos').value = '';
  document.getElementById('f-cubierta-actual').value = '';
  document.getElementById('f-uso-cual').value = '';
  document.getElementById('f-cubierta-cual').value = '';
  document.getElementById('grupo-uso-cual').style.display = 'none';
  document.getElementById('grupo-cubierta-cual').style.display = 'none';
}

function cargarChipsUsosCubierta(usosStr, cubiertalStr) {
  resetChipsUsosCubierta();
  if (usosStr) {
    const vals = usosStr.split(',').map(v => v.trim());
    vals.forEach(val => {
      const chip = [...document.querySelectorAll('#chips-usos .chip-inf')].find(c => c.dataset.val === val);
      if (chip) chip.classList.add('activo');
      else {
        // Valor personalizado → marcar Otro y llenar campo
        const otroChip = [...document.querySelectorAll('#chips-usos .chip-inf')].find(c => c.dataset.val === 'Otro');
        if (otroChip) { otroChip.classList.add('activo'); document.getElementById('f-uso-cual').value = val; document.getElementById('grupo-uso-cual').style.display = 'block'; }
      }
    });
    document.getElementById('f-usos').value = usosStr;
  }
  if (cubiertalStr) {
    const vals = cubiertalStr.split(',').map(v => v.trim());
    vals.forEach(val => {
      const chip = [...document.querySelectorAll('#chips-cubierta .chip-inf')].find(c => c.dataset.val === val);
      if (chip) chip.classList.add('activo');
      else {
        const otroChip = [...document.querySelectorAll('#chips-cubierta .chip-inf')].find(c => c.dataset.val === 'Otro');
        if (otroChip) { otroChip.classList.add('activo'); document.getElementById('f-cubierta-cual').value = val; document.getElementById('grupo-cubierta-cual').style.display = 'block'; }
      }
    });
    document.getElementById('f-cubierta-actual').value = cubiertalStr;
  }
}

function setMaxFechas() {
  const hoy = new Date().toISOString().split('T')[0];
  ['f-fecha-radicado','f-fecha-visita'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.max = hoy;
  });
}
function validarFechaPasada(input) {
  const hoy = new Date().toISOString().split('T')[0];
  if (input.value > hoy) { notif('La fecha no puede ser posterior a hoy', 'error'); input.value = hoy; }
}

// ═══════════════════════════════════════════
// GESTIÓN — Asignar y Completar (solo ADMIN)
// ═══════════════════════════════════════════
let _gestionData = [];

async function cargarGestion() {
  if (ST.rol !== 'ADMIN') return;
  const cont = document.getElementById('gestion-resultados');
  cont.innerHTML = '<div class="cargando"><div class="spinner"></div>Cargando...</div>';
  try {
    const { datos } = await leerHojaConHeaders();
    _gestionData = datos;
    _gestionFiltroEstado = '';
    // Mostrar estado vacío
    cont.innerHTML = '<div style="text-align:center;padding:40px 20px;color:var(--texto-suave);"><div style="font-size:32px;margin-bottom:12px;"></div><div style="font-size:14px;font-weight:500;">' + datos.length + ' registros cargados</div><div style="font-size:12px;margin-top:4px;">Busca un radicado o filtra por estado</div></div>';
  } catch(e) {
    notif('Error cargando gestión: ' + e.message, 'error');
  }
}

let _gestionFiltroEstado = '';

function toggleGestionFiltro(estado, btn) {
  // Toggle: si ya estaba activo, quitar filtro
  if (_gestionFiltroEstado === estado) {
    _gestionFiltroEstado = '';
    btn.classList.remove('activo-pendiente','activo-iniciado','activo-completado');
  } else {
    _gestionFiltroEstado = estado;
    document.querySelectorAll('#gf-pendiente,#gf-asignado,#gf-iniciado').forEach(b => b.classList.remove('activo-pendiente','activo-iniciado','activo-completado'));
    const claseMap = {'PENDIENTE':'activo-pendiente','ASIGNADO':'activo-iniciado','INICIADO':'activo-completado'};
    btn.classList.add(claseMap[estado] || 'activo-pendiente');
  }
  filtrarGestion();
}

function filtrarGestion() {
  const q = (document.getElementById('gestion-buscar')?.value || '').toLowerCase().trim();
  const cont = document.getElementById('gestion-resultados');
  if (!_gestionData || !_gestionData.length) return;

  let filtrado = _gestionData;

  // Filtro por estado
  if (_gestionFiltroEstado) {
    filtrado = filtrado.filter(f => normalizarEstado(f['ESTADO VISITA'] || f[13] || '') === _gestionFiltroEstado);
  } else {
    // Sin filtro de estado: solo mostrar PENDIENTE + ASIGNADO + INICIADO
    filtrado = filtrado.filter(f => {
      const est = normalizarEstado(f['ESTADO VISITA'] || f[13] || '');
      return est === 'PENDIENTE' || est === 'ASIGNADO' || est === 'INICIADO';
    });
  }

  // Filtro por texto
  if (q) {
    filtrado = filtrado.filter(f => {
      const rad = (f['RADICADO'] || f[1] || '').toLowerCase();
      const dir = (f['DIRECCION INFRACCION'] || f[3] || '').toLowerCase();
      return rad.includes(q) || dir.includes(q);
    });
  }

  // Si no hay texto ni filtro de estado, mostrar placeholder
  if (!q && !_gestionFiltroEstado) {
    cont.innerHTML = '<div style="text-align:center;padding:40px 20px;color:var(--texto-suave);"><div style="font-size:32px;margin-bottom:12px;"></div><div style="font-size:14px;font-weight:500;">Busca un radicado o filtra por estado</div></div>';
    return;
  }

  if (!filtrado.length) {
    cont.innerHTML = '<div style="text-align:center;padding:30px;color:var(--texto-suave);font-size:13px;">Sin resultados</div>';
    return;
  }

  // Ordenar por radicado
  filtrado.sort((a,b) => (a['RADICADO']||a[1]||'').localeCompare(b['RADICADO']||b[1]||''));

  // Renderizar tarjetas estilo Asana
  cont.innerHTML = '<div style="font-size:11px;color:var(--texto-suave);margin-bottom:8px;font-weight:600;text-transform:uppercase;letter-spacing:0.4px;">' + filtrado.length + ' resultado(s)</div>' +
    filtrado.map(f => renderGestionCard(f)).join('');
}

function renderGestionCard(f) {
  const rad = f['RADICADO'] || f[1] || '';
  const dir = f['DIRECCION INFRACCION'] || f[3] || '';
  const bar = f['BARRIO/VEREDA'] || f[4] || '';
  const vis = f['VISITADOR(ES)'] || f[17] || '';
  const fAsig      = f['FECHA ASIGNACION VISITA'] || f[14] || '';
  const fDevol     = f['FECHA DEVOLUCION'] || f[20] || '';
  let   estNorm    = normalizarEstado(f['ESTADO VISITA'] || f[13] || '');
  // Regla visual: tiene fecha asignación y no tiene fecha devolución → ASIGNADO
  // (no aplica si ya está en estado más avanzado: INICIADO o COMPLETADO)
  if (fAsig && !fDevol && estNorm !== 'INICIADO' && estNorm !== 'COMPLETADO') {
    estNorm = 'ASIGNADO';
  }
  const filaSheets = f._idx || 2;

  // Badge de estado
  const badgeMap = {
    'PENDIENTE': '<span class="badge badge-pendiente">Pendiente</span>',
    'ASIGNADO': '<span class="badge badge-asignado">Asignado</span>',
    'INICIADO': '<span class="badge badge-iniciado">Iniciado</span>',
    'COMPLETADO': '<span class="badge badge-completado">Completado</span>'
  };
  const badge = badgeMap[estNorm] || '<span class="badge badge-otra">' + estNorm + '</span>';

  // Check circular estilo Asana
  const checkClass = estNorm === 'COMPLETADO' ? 'radicado-check completado' : 'radicado-check';
  const checkClick = estNorm === 'INICIADO'
    ? `onclick="event.stopPropagation(); toggleCompletado(null,${filaSheets},'${fAsig.replace(/'/g,"\\'")}')" style="cursor:pointer;" title="Marcar completado"`
    : estNorm === 'COMPLETADO'
    ? 'title="Completado"'
    : 'title="' + estNorm + '"';

  // Botones de acción según estado
  let acciones = '';
  if (estNorm === 'PENDIENTE') {
    acciones = `<div style="display:flex;gap:6px;margin-top:8px;">
      <button class="btn-sm verde" onclick="event.stopPropagation(); abrirModalAsignar(${filaSheets},'${rad.replace(/'/g,"\\'")}','${dir.replace(/'/g,"\\'")}')"> Asignar</button>
    </div>`;
  } else if (estNorm === 'ASIGNADO') {
    const btnDesasignar = ST.rol === 'ADMIN'
      ? `<button class="btn-sm rojo" onclick="event.stopPropagation(); desasignarRadicado(${filaSheets},'${rad.replace(/'/g,"\\'")}')"> Quitar</button>`
      : '';
    acciones = `<div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap;">
      <button class="btn-sm azul" onclick="event.stopPropagation(); abrirVisitaPorIdx(${filaSheets})"> Iniciar visita</button>
      <button class="btn-sm gris" onclick="event.stopPropagation(); abrirModalAsignarIniciado(${filaSheets},'${rad.replace(/'/g,"\\'")}','${dir.replace(/'/g,"\\'")}')">⤵ Reasignar</button>
      ${btnDesasignar}
    </div>`;
  } else if (estNorm === 'INICIADO') {
    acciones = `<div style="display:flex;gap:6px;margin-top:8px;">
      <button class="btn-sm verde" onclick="event.stopPropagation(); toggleCompletado(null,${filaSheets},'${fAsig.replace(/'/g,"\\'")}')"> Completar</button>
      <button class="btn-sm gris" onclick="event.stopPropagation(); abrirVisitaPorIdx(${filaSheets})"> Ver</button>
    </div>`;
  }

  return `<div class="radicado-item" style="margin-bottom:6px;">
    <div style="padding:14px 16px;display:flex;align-items:flex-start;gap:12px;">
      <div class="${checkClass}" ${checkClick}></div>
      <div style="flex:1;min-width:0;">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
          <div style="font-weight:600;font-size:13px;color:var(--texto);">${rad}</div>
          ${badge}
        </div>
        <div style="font-size:12px;color:var(--texto-suave);margin-top:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${dir}${bar ? ' · ' + bar : ''}</div>
        ${vis ? '<div style="font-size:11px;color:var(--texto-3);margin-top:3px;"> ' + vis + (fAsig ? ' · ' + fAsig : '') + '</div>' : ''}
        ${acciones}
      </div>
    </div>
  </div>`;
}

let _asignarFila = null;

function mostrarDropdownAsignar(event, filaSheets) {
  event.stopPropagation();
  const dropdown = document.getElementById('dropdown-asignar-' + filaSheets);
  if (!dropdown) return;
  // Cerrar otros dropdowns
  document.querySelectorAll('[id^="dropdown-asignar-"]').forEach(d => {
    if (d.id !== 'dropdown-asignar-' + filaSheets) d.style.display = 'none';
  });
  dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
}

function asignarInspector(filaSheets, nombre) {
  const fechaDDMMYYYY = hoyDDMMYYYY();
  const url = CFG.webhook + '?accion=asignarRadicado&fila=' + filaSheets +
              '&inspector=' + encodeURIComponent(nombre) +
              '&fechaAsignacion=' + encodeURIComponent(fechaDDMMYYYY);
  fetch(url)
    .then(r => r.json())
    .then(data => {
      if (data.ok) {
        notif('Asignado a ' + nombre + ' — estado ASIGNADO', 'ok');
        cerrarDropdownAsignar();
        cargarGestion();
      } else {
        notif('Error al asignar', 'error');
      }
    })
    .catch(() => notif('Error de conexión', 'error'));
}

function cerrarDropdownAsignar() {
  document.querySelectorAll('[id^="dropdown-asignar-"]').forEach(d => d.style.display = 'none');
}

// Cerrar dropdown si hace clic afuera
document.addEventListener('click', () => {
  cerrarDropdownAsignar();
});

function abrirModalAsignar(filaSheets, rad, dir) {
  _asignarFila = filaSheets;
  const hoy = new Date().toISOString().split('T')[0];
  document.getElementById('modal-asignar-titulo').textContent = 'Asignar ' + rad;
  document.getElementById('modal-asignar-dir').textContent = dir;
  const fechaInput = document.getElementById('modal-asignar-fecha');
  fechaInput.value = hoy;
  fechaInput.disabled = true;
  document.getElementById('modal-asignar').style.display = 'flex';
}

function abrirModalAsignarIniciado(filaSheets, rad, dir) {
  _asignarFila = filaSheets;
  const hoy = new Date().toISOString().split('T')[0];
  document.getElementById('modal-asignar-titulo').textContent = 'Reasignar ' + rad;
  document.getElementById('modal-asignar-dir').textContent = dir;
  const fechaInput = document.getElementById('modal-asignar-fecha');
  fechaInput.value = hoy;
  fechaInput.disabled = true;
  document.getElementById('modal-asignar').style.display = 'flex';
}

function toggleCompletado(checkbox, filaSheets, fechaAsig) {
  marcarCompletado(filaSheets, fechaAsig);
}
function cerrarModalAsignar() {
  document.getElementById('modal-asignar').style.display = 'none';
  _asignarFila = null;
}

async function desasignarRadicado(filaSheets, rad) {
  if (!confirm(`¿Quitar la asignación de ${rad}?\nVolverá a estado PENDIENTE.`)) return;
  showLoading('Quitando asignación...', '');
  try {
    const r = await fetch(CFG.webhook + '?accion=desasignarRadicado&fila=' + filaSheets);
    const d = await r.json();
    hideLoading();
    if (d.ok) {
      notif(' Asignación removida — radicado vuelve a PENDIENTE', 'exito');
      cargarGestion();
    } else {
      notif('Error: ' + (d.error || 'No se pudo desasignar'), 'error');
    }
  } catch(err) {
    hideLoading();
    notif('Error: ' + err.message, 'error');
  }
}

async function confirmarAsignar() {
  if (!_asignarFila) return;
  const inspector = document.getElementById('modal-asignar-inspector').value;
  // Fecha siempre = hoy
  const fechaDDMMYYYY = hoyDDMMYYYY();

  showLoading('Asignando radicado...', '');
  try {
    const r = await fetch(CFG.webhook + '?accion=asignarRadicado&fila=' + _asignarFila +
      '&inspector=' + encodeURIComponent(inspector) +
      '&fechaAsignacion=' + encodeURIComponent(fechaDDMMYYYY));
    const d = await r.json();
    hideLoading();
    cerrarModalAsignar();
    if (d.ok) {
      notif(' Radicado asignado a ' + inspector, 'exito');
      cargarGestion();
    } else {
      notif('Error: ' + (d.error || 'No se pudo asignar'), 'error');
    }
  } catch(e) {
    hideLoading();
    notif('Error: ' + e.message, 'error');
  }
}

async function marcarCompletado(filaSheets, fechaAsig) {
  if (!confirm('¿Marcar este registro como COMPLETADO?')) return;
  // Calcular días
  let dias = '';
  if (fechaAsig) {
    const partes = fechaAsig.split('/');
    if (partes.length === 3) {
      const dAsig = new Date(parseInt(partes[2]), parseInt(partes[1])-1, parseInt(partes[0]));
      const hoy = new Date();
      dias = Math.ceil((hoy - dAsig) / (1000*60*60*24));
    }
  }

  showLoading('Marcando como completado...', '');
  try {
    const r = await fetch(CFG.webhook + '?accion=completarRegistro&fila=' + filaSheets +
      '&dias=' + encodeURIComponent(dias) +
      '&fecha=' + encodeURIComponent(hoyDDMMYYYY()));
    const d = await r.json();
    hideLoading();
    if (d.ok) {
      notif(' Registro completado · ' + dias + ' días', 'exito');
      cargarGestion();
    } else {
      notif('Error: ' + (d.error || 'No se pudo completar'), 'error');
    }
  } catch(e) {
    hideLoading();
    notif('Error: ' + e.message, 'error');
  }
}

// ═══════════════════════════════════════════════════════════════
// AGENDA DIARIA
// ═══════════════════════════════════════════════════════════════

ST.agendaData      = null;
ST.agendaMod       = null;
ST.agendaTab       = 'manana';
ST.agendaCambiada  = false;

async function cargarAgenda(forzar = false) {
  if (ST.agendaData && !forzar) { renderAgenda(); return; }

  document.getElementById('agenda-loading').style.display  = 'block';
  document.getElementById('agenda-contenido').style.display = 'none';
  document.getElementById('agenda-loading').innerHTML =
    '<div style="font-size:28px;margin-bottom:10px;"></div>Cargando agenda...';

  try {
    const r = await fetch(CFG.webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body: JSON.stringify({ accion: 'obtenerAgenda' })
    });
    const d = await r.json();
    if (!d.ok) throw new Error(d.error || 'Error del servidor');
    ST.agendaData     = d;
    ST.agendaMod      = JSON.parse(JSON.stringify(d));
    ST.agendaCambiada = false;
    renderAgenda();
  } catch(e) {
    document.getElementById('agenda-loading').innerHTML = `
      <div style="padding:30px;text-align:center;color:var(--rojo);">
        <div style="font-size:28px;margin-bottom:8px;"></div>
        <div style="font-weight:600;">Error al cargar agenda</div>
        <div style="font-size:12px;margin-top:4px;color:var(--texto-suave);">${e.message}</div>
        <button class="btn-sm azul" style="margin-top:12px;" onclick="cargarAgenda(true)">Reintentar</button>
      </div>`;
  }
}

function renderAgenda() {
  const d = ST.agendaMod;
  if (!d) return;

  document.getElementById('agenda-loading').style.display   = 'none';
  document.getElementById('agenda-contenido').style.display = 'block';

  const diasLabel = { lunes:'Lunes', martes:'Martes', 'miércoles':'Miércoles',
    jueves:'Jueves', viernes:'Viernes', sábado:'Sábado', domingo:'Domingo' };
  document.getElementById('agenda-fecha-label').textContent =
    `${diasLabel[d.dia] || d.dia} ${d.fecha}${d.esRural ? ' · Jornada Rural' : ''}`;

  const badge = document.getElementById('agenda-total-badge');
  if (d.totalPendientes > 0) {
    badge.textContent = `${d.totalPendientes} pendientes`;
    badge.style.display = 'inline-flex';
  } else {
    badge.style.display = 'none';
  }

  _renderAlertasStrip(d.alertas);
  _renderTab('manana', d.jornadas.manana);
  _renderTab('tarde',  d.jornadas.tarde);

  // Mostrar barra de guardar/descartar solo cuando hay cambios estructurales (admin)
  const btnConf = document.getElementById('agenda-btn-confirmar');
  if (btnConf) {
    btnConf.style.display = (ST.rol === 'ADMIN' && ST.agendaCambiada) ? 'flex' : 'none';
  }
}

function _renderAlertasStrip(alertas) {
  const el = document.getElementById('agenda-alertas-strip');
  if (!alertas || alertas.length === 0) { el.style.display = 'none'; return; }
  el.style.display = 'block';
  el.innerHTML = `<div class="agenda-strip alertas-criticas">
    <div style="font-weight:700;font-size:13px;"> ${alertas.length} radicado${alertas.length>1?'s':''} crítico${alertas.length>1?'s':''} fuera de agenda</div>
    ${alertas.slice(0,3).map(a=>`
      <div style="font-size:12px;padding:4px 8px;background:rgba(255,255,255,0.6);border-radius:6px;width:100%;display:flex;justify-content:space-between;align-items:center;">
        <span><span style="font-family:monospace;font-weight:700;">${a.radicado}</span>
        <span style="margin-left:8px;color:var(--texto-suave);">${a.direccion}</span></span>
        <span class="score-badge score-critico">${a.score.toFixed(1)}</span>
      </div>`).join('')}
    ${alertas.length > 3 ? `<div style="font-size:11px;color:var(--rojo);">+ ${alertas.length-3} más · ver hoja ALERTAS en el Sheet</div>` : ''}
  </div>`;
}

function _renderTab(cual, jornada) {
  const cont = document.getElementById(`agenda-tab-${cual}`);
  if (!cont || !jornada) { if(cont) cont.innerHTML = ''; return; }
  const esAdmin = ST.rol === 'ADMIN';
  const { activa, visitas, esRural } = jornada;
  let html = '';

  if (!activa) {
    const msg = { manana:'Sin jornada mañana (miércoles)', tarde:'Sin jornada tarde (viernes)' };
    html = `<div class="agenda-strip suspendida"><span></span> ${msg[cual] || 'Jornada suspendida'}</div>`;
  } else if (!visitas || visitas.length === 0) {
    html = `<div class="agenda-empty">
      <div style="font-size:28px;margin-bottom:8px;"></div>
      <div style="font-weight:500;">Sin visitas pendientes</div>
      <div style="font-size:12px;margin-top:4px;">No hay radicados para esta jornada</div>
    </div>`;
  } else {
    if (esRural) html += `<div class="agenda-strip" style="background:var(--verde-bg,#e8f5e9);color:var(--verde,#2e7d32);font-size:12px;"> Primer viernes del mes — jornada rural incluida</div>`;
    visitas.forEach((v, i) => { html += _tarjetaVisita(v, i+1, cual, esAdmin); });
  }

  if (esAdmin && activa) {
    html += `<button class="btn-principal secundario" style="margin-top:4px;" onclick="abrirModalAgregarVisita('${cual}')">+ Agregar visita</button>`;
  }

  // Selector de inspector + botón confirmar (solo ADMIN)
  if (esAdmin) {
    const inspectores = [
      'ALEJANDRO HERNANDEZ MUÑOZ','MAURICIO HERRERA LOPERA','DIEGO ALEJANDRO MUNERA OSSA',
      'DANIEL PEDRAZA ARANGO','VICTOR HUGO QUIROZ PORTILLA','CARLOS ANDRES MEJIA','JUAN SEBASTIAN PINZON GAONA'
    ];
    const etiquetas = {
      'ALEJANDRO HERNANDEZ MUÑOZ':'Alejandro','MAURICIO HERRERA LOPERA':'Mauricio',
      'DIEGO ALEJANDRO MUNERA OSSA':'Diego','DANIEL PEDRAZA ARANGO':'Daniel',
      'VICTOR HUGO QUIROZ PORTILLA':'Víctor','CARLOS ANDRES MEJIA':'Carlos',
      'JUAN SEBASTIAN PINZON GAONA':'Juan S.'
    };
    const chips = inspectores.map(n =>
      `<div class="inspector-chip" data-jornada="${cual}" data-nombre="${n}"
        onclick="seleccionarInspector('${cual}','${n}',this)">${etiquetas[n]||n}</div>`
    ).join('');
    html += `<div style="margin-top:12px;">
      <div style="font-size:11px;font-weight:600;color:var(--texto-suave);margin-bottom:6px;">ASIGNAR A INSPECTOR</div>
      <div class="inspector-chips" id="inspector-chips-${cual}">${chips}</div>
      <button class="btn-principal verde" style="margin-top:8px;width:100%;" onclick="confirmarJornada('${cual}')"> Confirmar jornada ${cual==='manana'?'mañana':'tarde'}</button>
    </div>`;
  }

  cont.innerHTML = html;
}

function _tarjetaVisita(v, num, jornada, esAdmin) {
  const sc = v.score >= 9 ? 'score-critico' : v.score >= 7 ? 'score-alto' : v.score >= 5 ? 'score-medio' : 'score-bajo';
  const bcTxt   = v.tieneBc ? ' Prioridad IA' : '~ Sin análisis';
  const bcColor = v.tieneBc ? 'var(--verde)' : 'var(--texto-3)';
  const radId   = String(v.radicado).replace(/\./g,'');
  return `
  <div class="visita-card" id="vc-${jornada}-${radId}">
    <div class="visita-card-header">
      <div style="display:flex;align-items:center;gap:8px;">
        <span style="font-size:11px;font-weight:700;color:var(--texto-suave);background:var(--slate-100);width:22px;height:22px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;">${num}</span>
        <span class="visita-radicado">${v.radicado}</span>
      </div>
      <div style="display:flex;align-items:center;gap:6px;">
        <span class="score-badge ${sc}">${v.score.toFixed(1)}</span>
        ${esAdmin ? `<button class="btn-quitar" onclick="quitarVisitaAgenda('${jornada}','${v.radicado}')" title="Quitar">
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" style="width:14px;height:14px;"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
        </button>` : ''}
      </div>
    </div>
    <div class="visita-direccion">${v.direccion}</div>
    <div class="visita-meta">
      <span class="comuna-chip">C${v.comuna}</span>
      <span class="visita-meta-item"> ${v.barrio}</span>
      <span class="visita-meta-item"> ${v.diasPendiente}d pendiente</span>
      <span class="visita-meta-item" style="color:${bcColor};">${bcTxt}</span>
    </div>
  </div>`;
}

function agendaTab(cual) {
  ST.agendaTab = cual;
  document.querySelectorAll('.agenda-tab').forEach(b => b.classList.remove('activo'));
  document.getElementById(`tab-btn-${cual}`)?.classList.add('activo');
  ['manana','tarde'].forEach(t => {
    const el = document.getElementById(`agenda-tab-${t}`);
    if (el) el.style.display = t === cual ? 'block' : 'none';
  });
}

function quitarVisitaAgenda(jornada, radicado) {
  if (ST.rol !== 'ADMIN') return;
  const j = ST.agendaMod.jornadas[jornada];
  if (!j) return;
  j.visitas = j.visitas.filter(v => String(v.radicado) !== String(radicado));
  ST.agendaCambiada = true;
  renderAgenda();
  agendaTab(jornada);
}

function abrirModalAgregarVisita(jornada) {
  if (ST.rol !== 'ADMIN') return;
  ST._modalJornada = jornada;
  const labels = { manana:'Mañana ', tarde:'Tarde ', rural:'Rural ' };
  document.getElementById('modal-agregar-jornada').textContent = labels[jornada] || jornada;

  const comunas = jornada === 'manana' ? [1,4,6,7,10,11] : [2,3,5,8,9];

  const enAgenda = new Set();
  Object.values(ST.agendaMod.jornadas).forEach(j => (j.visitas||[]).forEach(v => enAgenda.add(String(v.radicado))));

  const candidatos = [...(ST.agendaData.alertas||[]),
    ...(ST.agendaData.jornadas[jornada]?.visitas||[])]
    .filter(v => {
      if (enAgenda.has(String(v.radicado))) return false;
      return comunas.includes(parseInt(v.comuna));
    });

  const lista = document.getElementById('modal-agregar-lista');
  if (candidatos.length === 0) {
    lista.innerHTML = `<div style="text-align:center;padding:24px;color:var(--texto-suave);font-size:13px;">Sin candidatos disponibles</div>`;
  } else {
    lista.innerHTML = candidatos.slice(0,20).map(v => {
      const sc = v.score >= 9 ? 'score-critico' : v.score >= 7 ? 'score-alto' : v.score >= 5 ? 'score-medio' : 'score-bajo';
      const vJson = JSON.stringify(v).replace(/\\/g,'\\\\').replace(/'/g,"\\'");
      return `<div class="sugerencia-item">
        <div class="sugerencia-info">
          <div class="sugerencia-rad">${v.radicado} <span class="score-badge ${sc}" style="margin-left:4px;">${v.score.toFixed(1)}</span></div>
          <div class="sugerencia-dir">${v.direccion} · <span class="comuna-chip">C${v.comuna}</span> · ${v.diasPendiente}d</div>
        </div>
        <button class="btn-sm verde" onclick="agregarVisitaAgenda('${jornada}','${vJson}')" style="margin-left:8px;flex-shrink:0;">+</button>
      </div>`;
    }).join('');
  }
  document.getElementById('modal-agregar-visita').style.display = 'flex';
}

function agregarVisitaAgenda(jornada, vJson) {
  if (ST.rol !== 'ADMIN') return;
  const visita = JSON.parse(vJson.replace(/\\'/g,"'"));
  const j = ST.agendaMod.jornadas[jornada];
  if (!j) return;
  j.visitas = j.visitas || [];
  j.visitas.push(visita);
  j.activa = true;
  ST.agendaCambiada = true;
  cerrarModalAgregarVisita();
  renderAgenda();
  agendaTab(jornada);
}

function cerrarModalAgregarVisita() {
  document.getElementById('modal-agregar-visita').style.display = 'none';
}

async function confirmarAgendaManual() {
  if (ST.rol !== 'ADMIN' || !ST.agendaCambiada) return;
  const btn = document.querySelector('#agenda-btn-confirmar .btn-principal.verde');
  const orig = btn.textContent;
  btn.textContent = ' Guardando...';
  btn.disabled = true;
  try {
    const r = await fetch(CFG.webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body: JSON.stringify({
        accion: 'guardarAgendaManual',
        fecha:  ST.agendaMod.fecha,
        agenda: {
          manana: ST.agendaMod.jornadas.manana.visitas || [],
          tarde:  ST.agendaMod.jornadas.tarde.visitas  || []
        }
      })
    });
    const d = await r.json();
    if (!d.ok) throw new Error(d.error || 'Error al guardar');
    ST.agendaData     = JSON.parse(JSON.stringify(ST.agendaMod));
    ST.agendaCambiada = false;
    document.getElementById('agenda-btn-confirmar').style.display = 'none';
    notif('Agenda guardada correctamente', 'ok');
  } catch(e) {
    notif('Error al guardar: ' + e.message, 'error');
  } finally {
    btn.textContent = orig;
    btn.disabled = false;
  }
}

function descartarCambiosAgenda() {
  ST.agendaMod      = JSON.parse(JSON.stringify(ST.agendaData));
  ST.agendaCambiada = false;
  renderAgenda();
  agendaTab(ST.agendaTab);
}

// ═══════════════════════════════════════════
// BÚSQUEDA UNIFICADA
// ═══════════════════════════════════════════
function buscarUnificado(texto) {
  ST._textoBusqueda = (texto || '').trim().toUpperCase();
  _aplicarFiltrosCombinados();
}

// Wrapper que combina texto + filtros existentes
function _aplicarFiltrosCombinados() {
  const q          = ST._textoBusqueda || '';
  const tieneTexto = q.length > 0;
  const tieneEstado    = ST.filtrosEstado.length > 0;
  const tieneComuna    = ST.filtroComunas.length > 0;
  const tieneVisitador = (ST.filtrosVisitador||[]).length > 0;
  const tieneRural     = !!ST._filtroRural;

  const filtrados = ST.datos
    .map(f => ({ f, i: f._idx }))
    .filter(({ f }) => {
      // Filtro de texto libre
      if (tieneTexto) {
        const rad  = (f['RADICADO']     || f[1] || '').toString().toUpperCase();
        const dir  = (f['DIRECCION']    || f[3] || '').toString().toUpperCase();
        const bar  = (f['BARRIO/VEREDA']|| f[4] || '').toString().toUpperCase();
        const aten = (f['ATENCION PQR'] || f[0] || '').toString().toUpperCase();
        if (!rad.includes(q) && !dir.includes(q) && !bar.includes(q) && !aten.includes(q)) return false;
      }
      // Filtros de estado
      if (tieneEstado) {
        const estNorm = normalizarEstado(f['ESTADO VISITA'] || f[13] || '');
        if (!ST.filtrosEstado.includes(estNorm)) return false;
      }
      // Filtros de comuna
      if (tieneComuna) {
        const com = (f['COMUNA'] || f[5] || '').toString().trim();
        if (!ST.filtroComunas.includes(com)) return false;
      }
      // Filtro de visitador
      if (tieneVisitador) {
        const vis = (f['VISITADOR(ES)'] || f[17] || '').toString().toUpperCase();
        if (!ST.filtrosVisitador.some(v => vis.includes(v))) return false;
      }
      // Filtro rural
      if (tieneRural) {
        const barrio = (f['BARRIO/VEREDA'] || f[4] || '').toString().trim();
        if (!barrio.startsWith('Vda.')) return false;
      }
      return true;
    });

  const btnLimpiar = document.getElementById('btn-limpiar-filtros');
  if (btnLimpiar) {
    btnLimpiar.classList.toggle('visible',
      tieneTexto || tieneEstado || tieneComuna || tieneVisitador || tieneRural);
  }
  // Actualizar contador de comunas activas
  const contCom = document.getElementById('comunas-activas-count');
  if (contCom) contCom.textContent = tieneComuna ? `(${ST.filtroComunas.length})` : '';

  renderLista(filtrados);
}

// ── Sobrescribir aplicarFiltros para pasar por el combinado ─────────────────
function aplicarFiltros() { _aplicarFiltrosCombinados(); }

// ═══════════════════════════════════════════
// COLAPSO DE FILTROS
// ═══════════════════════════════════════════
function toggleComunasCollapse() {
  const panel   = document.getElementById('comunas-collapse');
  const chevron = document.getElementById('comunas-chevron');
  if (!panel) return;
  const abierto = panel.style.display !== 'none';
  panel.style.display   = abierto ? 'none' : 'block';
  if (chevron) chevron.style.transform = abierto ? '' : 'rotate(180deg)';
}

function toggleVisitadorCollapse() {
  const panel   = document.getElementById('visitador-collapse');
  const chevron = document.getElementById('visitador-chevron');
  if (!panel) return;
  const abierto = panel.style.display !== 'none';
  panel.style.display   = abierto ? 'none' : 'block';
  if (chevron) chevron.style.transform = abierto ? '' : 'rotate(180deg)';
}

// ═══════════════════════════════════════════
// AGENDA DE HOY (HOME)
// ═══════════════════════════════════════════
function _cargarAgendaHoy(datos) {
  const card = document.getElementById('home-agenda-hoy');
  const lista = document.getElementById('home-agenda-lista');
  const count = document.getElementById('home-agenda-count');
  if (!card || !lista) return;

  const hoy = new Date().toISOString().split('T')[0];
  const asignados = (datos || ST.datos).filter(f => {
    const est   = normalizarEstado(f['ESTADO VISITA'] || f[13] || '');
    const fAsig = (f['FECHA ASIGNACION VISITA'] || '').toString().trim();
    // Inspector solo ve los suyos; ADMIN ve todos
    if (ST.rol !== 'ADMIN') {
      const vis  = (f['VISITADOR(ES)'] || f[17] || '').toUpperCase();
      const user = (ST.usuario || '').toUpperCase();
      if (!vis.includes(user)) return false;
    }
    return est === 'ASIGNADO' && fAsig.startsWith(hoy);
  });

  if (asignados.length === 0) {
    card.style.display = 'none';
    return;
  }

  card.style.display = 'block';
  if (count) count.textContent = `${asignados.length} visita${asignados.length > 1 ? 's' : ''}`;

  lista.innerHTML = asignados.map(f => {
    const rad = (f['RADICADO']     || f[1] || '—').toString().trim();
    const dir = (f['DIRECCION']    || f[3] || '—').toString().trim();
    const bar = (f['BARRIO/VEREDA']|| f[4] || '').toString().trim();
    const com = (f['COMUNA']       || f[5] || '').toString().trim();
    return `<div class="agenda-hoy-item" onclick="abrirRegistro(${f._idx})">
      <span class="agenda-hoy-dot"></span>
      <div style="flex:1;min-width:0;">
        <div class="agenda-hoy-dir">${dir}</div>
        <div class="agenda-hoy-sub">
          <span style="font-family:monospace;font-size:10px;">${rad}</span>
          ${com ? `<span class="comuna-chip" style="font-size:10px;padding:1px 5px;">C${com}</span>` : ''}
          ${bar ? `<span style="color:var(--texto-suave);">${bar}</span>` : ''}
        </div>
      </div>
    </div>`;
  }).join('');
}

// ═══════════════════════════════════════════
// SELECTOR DE INSPECTOR (AGENDA)
// ═══════════════════════════════════════════
function seleccionarInspector(jornada, nombre, btn) {
  if (ST.rol !== 'ADMIN') return;
  // Inicializar mapa de inspectores seleccionados si no existe
  if (!ST._inspectorSel) ST._inspectorSel = {};

  const yaSeleccionado = ST._inspectorSel[jornada] === nombre;
  ST._inspectorSel[jornada] = yaSeleccionado ? null : nombre;

  // Actualizar chips visualmente
  const cont = document.getElementById(`inspector-chips-${jornada}`);
  if (cont) {
    cont.querySelectorAll('.inspector-chip').forEach(c => c.classList.remove('sel'));
    if (!yaSeleccionado) btn.classList.add('sel');
  }
}

// ═══════════════════════════════════════════
// CONFIRMAR JORNADA
// ═══════════════════════════════════════════
async function confirmarJornada(jornada) {
  if (ST.rol !== 'ADMIN') return;
  const inspector = ST._inspectorSel?.[jornada];
  if (!inspector) {
    notif('Selecciona un inspector para esta jornada', 'error');
    return;
  }
  const visitas = ST.agendaMod?.jornadas?.[jornada]?.visitas || [];
  if (visitas.length === 0) {
    notif('No hay visitas en esta jornada', 'error');
    return;
  }

  const btnEl = document.querySelector(`#agenda-tab-${jornada} .btn-principal.verde`);
  const orig  = btnEl ? btnEl.textContent : '';
  if (btnEl) { btnEl.textContent = ' Confirmando...'; btnEl.disabled = true; }

  try {
    const payload = {
      accion: 'confirmarAgenda',
      jornadas: {
        [jornada]: { visitas: visitas.map(v => v.radicado), inspector }
      }
    };
    const r = await fetch(CFG.webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body: JSON.stringify(payload)
    });
    const d = await r.json();
    if (!d.ok) throw new Error(d.error || 'Error al confirmar');

    const j = jornada === 'manana' ? 'mañana' : 'tarde';
    notif(`Jornada ${j} confirmada — ${d.actualizados||visitas.length} visitas asignadas a ${inspector.split(' ')[0]}`, 'ok');
    // Limpiar selección del inspector para esa jornada
    if (ST._inspectorSel) ST._inspectorSel[jornada] = null;
    // Recargar stats y agenda de hoy
    await cargarStats();
  } catch(e) {
    notif('Error al confirmar: ' + e.message, 'error');
  } finally {
    if (btnEl) { btnEl.textContent = orig; btnEl.disabled = false; }
  }
}

// ═══════════════════════════════════════════
// ACORDEÓN — formulario nueva visita en secciones colapsables
// ═══════════════════════════════════════════

// Inicializa el acordeón una sola vez. Toma cada `.form-seccion` dentro del
// formulario (excluyendo panel-estado-registro y seccion-fotos) y la convierte
// en un item de acordeón con header clickeable + body colapsable + botón Continuar.
function inicializarAcordeon() {
  const cont = document.getElementById('form-visita-contenedor');
  if (!cont || cont.dataset.acordeonInit === '1') return;

  const todas = Array.from(cont.querySelectorAll('.form-seccion'));
  // Excluir el panel de estado (se elimina/reubica) y la sección de fotos
  // (que se habilita post-guardado en Fase D).
  const validas = todas.filter(s =>
    s.id !== 'panel-estado-registro' && s.id !== 'seccion-fotos'
  );

  validas.forEach((seccion, idx) => {
    const num = idx + 1;
    seccion.dataset.seccionNum = num;
    seccion.dataset.completo = 'false';
    seccion.classList.add('acordeon-item');
    if (idx === 0) seccion.classList.add('abierto');

    const titulo = seccion.querySelector('.form-seccion-titulo');
    if (!titulo) return;
    const tituloTexto = titulo.textContent.trim();

    // Header clickeable que reemplaza al span de titulo original
    const header = document.createElement('button');
    header.type = 'button';
    header.className = 'acordeon-header';
    header.setAttribute('aria-expanded', idx === 0 ? 'true' : 'false');
    header.onclick = function() { toggleSeccion(num); };
    header.innerHTML =
      '<span class="acordeon-numero"><span class="acordeon-numero-texto">' + num + '</span></span>' +
      '<span class="acordeon-titulo"></span>' +
      '<span class="acordeon-chevron" aria-hidden="true">▾</span>';
    // Inserto el texto del título usando textContent (sanitiza)
    header.querySelector('.acordeon-titulo').textContent = tituloTexto;
    titulo.replaceWith(header);

    // Wrap el resto de hijos (todo menos el header recién insertado) en un body
    const body = document.createElement('div');
    body.className = 'acordeon-body';
    while (seccion.children.length > 1) {
      body.appendChild(seccion.children[1]);
    }
    seccion.appendChild(body);

    // Botón "Continuar" al final de cada body
    const btnContinuar = document.createElement('button');
    btnContinuar.type = 'button';
    btnContinuar.className = 'btn-continuar';
    btnContinuar.dataset.seccion = num;
    btnContinuar.textContent = (num === validas.length) ? 'Finalizar →' : 'Continuar →';
    btnContinuar.onclick = function() { completarSeccion(num); };
    body.appendChild(btnContinuar);
  });

  cont.dataset.acordeonInit = '1';
}

// Toggle: abre la seccion si estaba cerrada; cierra todas si la actual estaba abierta
function toggleSeccion(num) {
  const item = document.querySelector('.form-seccion.acordeon-item[data-seccion-num="' + num + '"]');
  if (!item) return;
  const yaAbierto = item.classList.contains('abierto');
  document.querySelectorAll('.form-seccion.acordeon-item').forEach(s => {
    s.classList.remove('abierto');
    const h = s.querySelector('.acordeon-header');
    if (h) h.setAttribute('aria-expanded', 'false');
  });
  if (!yaAbierto) {
    item.classList.add('abierto');
    const header = item.querySelector('.acordeon-header');
    if (header) header.setAttribute('aria-expanded', 'true');
  }
}

// Abre una sección específica (siempre la abre y cierra las demás), con scroll
function abrirSeccion(num) {
  document.querySelectorAll('.form-seccion.acordeon-item').forEach(s => {
    s.classList.remove('abierto');
    const h = s.querySelector('.acordeon-header');
    if (h) h.setAttribute('aria-expanded', 'false');
  });
  const item = document.querySelector('.form-seccion.acordeon-item[data-seccion-num="' + num + '"]');
  if (!item) return;
  item.classList.add('abierto');
  const header = item.querySelector('.acordeon-header');
  if (header) header.setAttribute('aria-expanded', 'true');
  // Pequeña pausa para que la animación arranque antes del scroll
  setTimeout(function() {
    item.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 60);
}

// Marca la sección como completada y avanza a la siguiente. En la última, baja a las acciones.
function completarSeccion(num) {
  const item = document.querySelector('.form-seccion.acordeon-item[data-seccion-num="' + num + '"]');
  if (item) item.dataset.completo = 'true';
  const siguienteItem = document.querySelector('.form-seccion.acordeon-item[data-seccion-num="' + (num + 1) + '"]');
  if (siguienteItem) {
    abrirSeccion(num + 1);
  } else {
    // Última sección — colapsar y bajar a botones de acción
    if (item) item.classList.remove('abierto');
    const cont = document.getElementById('form-visita-contenedor');
    if (cont) {
      window.scrollTo({ top: cont.offsetTop + cont.offsetHeight, behavior: 'smooth' });
    }
  }
}

// Resetea estado del acordeón al iniciar formulario nuevo: solo sección 1 abierta, ninguna completa
function resetearAcordeon() {
  document.querySelectorAll('.form-seccion.acordeon-item').forEach((s, idx) => {
    s.dataset.completo = 'false';
    s.classList.toggle('abierto', idx === 0);
    const h = s.querySelector('.acordeon-header');
    if (h) h.setAttribute('aria-expanded', idx === 0 ? 'true' : 'false');
  });
}

// Sticky: actualiza el chip flotante con la dirección actual del inmueble
function actualizarDireccionSticky() {
  const dirInput = document.getElementById('f-direccion');
  const stickyEl = document.getElementById('acordeon-sticky-dir');
  const valEl    = document.getElementById('dir-sticky-valor');
  if (!stickyEl || !valEl) return;
  const dir = dirInput ? dirInput.value.trim() : '';
  if (dir.length > 0) {
    valEl.textContent = dir;
    stickyEl.classList.add('visible');
  } else {
    stickyEl.classList.remove('visible');
  }
}

