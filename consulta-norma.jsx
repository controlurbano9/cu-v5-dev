// ═══════════════════════════════════════════════════════════════
// v6/consulta-norma.jsx — Consulta norma POT con Google Maps Satellite
//
// Geocoding: Google Maps Geocoder (browser-side)
// Mapa: Google Maps (satellite)
// GPS: Geolocation API para capturar coordenadas
// POT: turf.js + GeoJSONs en GitHub (controlurbano9/pot-bello)
// ═══════════════════════════════════════════════════════════════
const { useState: useStateCN, useEffect: useEffectCN, useRef: useRefCN } = React;

// Reutiliza componentes catastrales definidos en nueva-visita.jsx.
// En el bundle final están en el mismo scope; en modo individual de dev,
// quedan expuestos vía window.X y son accesibles por nombre. No reasignamos
// aquí porque esbuild marca colisión al detectar la declaración previa.

const BELLO_BBOX = { latMin: 6.18, latMax: 6.55, lonMin: -75.75, lonMax: -75.40 };
const BELLO_CENTRO = { lat: 6.337, lng: -75.557 };

function dentroDeBello(lat, lon) {
  return lat >= BELLO_BBOX.latMin && lat <= BELLO_BBOX.latMax &&
         lon >= BELLO_BBOX.lonMin && lon <= BELLO_BBOX.lonMax;
}

function geocodeConGoogle(direccion) {
  return new Promise(function(resolve, reject) {
    if (typeof google === 'undefined' || !google.maps || !google.maps.Geocoder) {
      reject(new Error('Google Maps no cargó'));
      return;
    }
    var geocoder = new google.maps.Geocoder();
    var variantes = [
      direccion + ', Bello, Antioquia, Colombia',
      normalizarDireccionGoogle(direccion) + ', Bello, Antioquia, Colombia',
      direccion + ', Bello, Colombia',
    ];
    var intentar = function(idx) {
      if (idx >= variantes.length) {
        reject(new Error('No se encontró la dirección'));
        return;
      }
      geocoder.geocode({ address: variantes[idx] }, function(results, status) {
        if (status === 'OK' && results && results.length > 0) {
          var loc = results[0].geometry.location;
          var lat = loc.lat(), lon = loc.lng();
          if (dentroDeBello(lat, lon)) {
            resolve({ lat: lat, lon: lon, formatted: results[0].formatted_address });
            return;
          }
        }
        intentar(idx + 1);
      });
    };
    intentar(0);
  });
}

// Intenta parsear un texto como coordenadas. Soporta:
//   Grados decimales (DD): 6.337, -75.557
//   DMS: 6d20m13.2sN 75d33m25.2sW
//   DMM: 6d20.220mN 75d33.420mW
//   Google Maps URL: @6.337,-75.557,17z
// Retorna {lat,lon} o null si no es coordenada.
function _parsearCoordenadas(texto) {
  var txt = texto.trim();
  if (!txt) return null;

  // 1. Extraer de URL de Google Maps (...@lat,lon,zoom...)
  var urlMatch = txt.match(/@(-?\d+\.?\d*),(-?\d+\.?\d*)/);
  if (urlMatch) {
    var la = parseFloat(urlMatch[1]), lo = parseFloat(urlMatch[2]);
    if (!isNaN(la) && !isNaN(lo) && Math.abs(la) <= 90 && Math.abs(lo) <= 180) return { lat: la, lon: lo };
  }

  // 2. DMS: grados minutos segundos con cardinal N/S/E/W/O
  var dmsRe = new RegExp('(\\d+)[\\u00b0\\u00ba]\\s*(\\d+)[\\u0027\\u2018\\u2019\\u2032]\\s*([\\d.]+)[\\u0022\\u201c\\u201d\\u2033]?\\s*([NSns])\\s*[,;]?\\s*(\\d+)[\\u00b0\\u00ba]\\s*(\\d+)[\\u0027\\u2018\\u2019\\u2032]\\s*([\\d.]+)[\\u0022\\u201c\\u201d\\u2033]?\\s*([EWOewo])');
  var dmsM = txt.match(dmsRe);
  if (dmsM) {
    var lat = parseInt(dmsM[1]) + parseInt(dmsM[2]) / 60 + parseFloat(dmsM[3]) / 3600;
    if (dmsM[4].toUpperCase() === 'S') lat = -lat;
    var lon = parseInt(dmsM[5]) + parseInt(dmsM[6]) / 60 + parseFloat(dmsM[7]) / 3600;
    if (dmsM[8].toUpperCase() === 'W' || dmsM[8].toUpperCase() === 'O') lon = -lon;
    return { lat: lat, lon: lon };
  }

  // 3. DMM: grados minutos decimales con cardinal
  var dmmRe = new RegExp('(\\d+)[\\u00b0\\u00ba]\\s*([\\d.]+)[\\u0027\\u2018\\u2019\\u2032]\\s*([NSns])\\s*[,;]?\\s*(\\d+)[\\u00b0\\u00ba]\\s*([\\d.]+)[\\u0027\\u2018\\u2019\\u2032]\\s*([EWOewo])');
  var dmmM = txt.match(dmmRe);
  if (dmmM) {
    var lat = parseInt(dmmM[1]) + parseFloat(dmmM[2]) / 60;
    if (dmmM[3].toUpperCase() === 'S') lat = -lat;
    var lon = parseInt(dmmM[4]) + parseFloat(dmmM[5]) / 60;
    if (dmmM[6].toUpperCase() === 'W' || dmmM[6].toUpperCase() === 'O') lon = -lon;
    return { lat: lat, lon: lon };
  }

  // 4. Grados decimales: "6.337, -75.557" o "6.337 -75.557"
  //    También acepta con N/S/E/W/O: "6.337N 75.557W"
  var ddCardinal = txt.match(/([\d.]+)\s*([NSns])\s*[,;\s]+\s*([\d.]+)\s*([EWOewo])/);
  if (ddCardinal) {
    var lat = parseFloat(ddCardinal[1]);
    if (ddCardinal[2].toUpperCase() === 'S') lat = -lat;
    var lon = parseFloat(ddCardinal[3]);
    if (ddCardinal[4].toUpperCase() === 'W' || ddCardinal[4].toUpperCase() === 'O') lon = -lon;
    if (!isNaN(lat) && !isNaN(lon)) return { lat: lat, lon: lon };
  }

  // 5. DD simple: dos números separados por coma/espacio
  var partes = txt.split(/[,;\s]+/).filter(Boolean);
  if (partes.length >= 2) {
    var a = parseFloat(partes[0]), b = parseFloat(partes[1]);
    if (!isNaN(a) && !isNaN(b) && Math.abs(a) <= 90 && Math.abs(b) <= 180) {
      return { lat: a, lon: b };
    }
  }

  return null;
}

function ConsultaNormaScreen() {
  const [consulta, setConsulta] = useStateCN('');
  const [punto, setPunto] = useStateCN(null);
  const [resultado, setResultado] = useStateCN(null);
  const [busyGeo, setBusyGeo] = useStateCN(false);
  const [busyGPS, setBusyGPS] = useStateCN(false);
  const [busyPOT, setBusyPOT] = useStateCN(false);
  const [busyCat, setBusyCat] = useStateCN(false);
  const [catastro, setCatastro] = useStateCN(null);  // array de fichas o null
  const [catastroOpen, setCatastroOpen] = useStateCN(true);
  const [error, setError] = useStateCN('');

  const mapDivRef = useRefCN(null);
  const mapRef = useRefCN(null);
  const markerRef = useRefCN(null);

  // Montar Google Maps (satellite)
  useEffectCN(() => {
    if (typeof google === 'undefined' || !google.maps) {
      setError('Google Maps no cargó. Recarga la página.');
      return;
    }
    if (mapRef.current || !mapDivRef.current) return;

    var map = new google.maps.Map(mapDivRef.current, {
      center: BELLO_CENTRO,
      zoom: 13,
      mapTypeId: 'hybrid',
      mapTypeControl: true,
      mapTypeControlOptions: {
        style: google.maps.MapTypeControlStyle.HORIZONTAL_BAR,
        position: google.maps.ControlPosition.TOP_RIGHT,
        mapTypeIds: ['hybrid', 'roadmap'],
      },
      streetViewControl: false,
      fullscreenControl: false,
      zoomControl: true,
      gestureHandling: 'greedy',
    });

    map.addListener('click', function(e) {
      var lat = e.latLng.lat(), lon = e.latLng.lng();
      if (!dentroDeBello(lat, lon)) {
        setError('El punto está fuera del municipio de Bello.');
        return;
      }
      colocarPin(lat, lon, true);
    });

    mapRef.current = map;
    return () => {
      google.maps.event.clearInstanceListeners(map);
      if (markerRef.current) google.maps.event.clearInstanceListeners(markerRef.current);
      mapRef.current = null;
      markerRef.current = null;
    };
  }, []);

  function colocarPin(lat, lon, consultar) {
    setError('');
    setPunto({ lat, lon });
    var map = mapRef.current;
    if (!map) return;
    if (markerRef.current) {
      markerRef.current.setPosition({ lat, lng: lon });
    } else {
      var m = new google.maps.Marker({
        position: { lat, lng: lon },
        map: map,
        draggable: true,
      });
      m.addListener('dragend', function() {
        var pos = m.getPosition();
        var lt = pos.lat(), ln = pos.lng();
        if (!dentroDeBello(lt, ln)) {
          setError('Punto fuera de Bello.');
          m.setPosition(BELLO_CENTRO);
          setPunto({ lat: BELLO_CENTRO.lat, lon: BELLO_CENTRO.lng });
          return;
        }
        setPunto({ lat: lt, lon: ln });
        consultarNorma(lt, ln);
      });
      markerRef.current = m;
    }
    map.setCenter({ lat, lng: lon });
    if (map.getZoom() < 17) map.setZoom(17);
    if (consultar) consultarNorma(lat, lon);
  }

  // Capturar coordenadas GPS — directo, sin paso de confirmación.
  // Para la pestaña Norma (consulta rápida) preferimos getCurrentPosition:
  // un solo intento, sin refinamiento progresivo. El usuario toca el botón
  // → llega la lectura → se consulta la norma de inmediato.
  // En el formulario de Nueva Visita sí usamos watchPosition refinado.
  const [gpsAccCN, setGpsAccCN] = useStateCN(null);
  // geoWatchCNRef se mantiene como ref por compatibilidad con _detenerGeoCN
  // (que aún se llama desde el botón "✕ Cancelar" para abortar si hace falta).
  const geoWatchCNRef = useRefCN(null);
  function _detenerGeoCN() {
    if (geoWatchCNRef.current != null) {
      try { navigator.geolocation.clearWatch(geoWatchCNRef.current); } catch (e) {}
      geoWatchCNRef.current = null;
    }
  }
  useEffectCN(function() { return _detenerGeoCN; }, []);

  function capturarGPS() {
    if (!navigator.geolocation) {
      setError('Tu dispositivo no soporta geolocalización.');
      return;
    }
    if (busyGPS) return;   // doble-click defensivo
    setBusyGPS(true); setError(''); setGpsAccCN(null);
    navigator.geolocation.getCurrentPosition(
      function(pos) {
        setBusyGPS(false);
        var lat = pos.coords.latitude;
        var lon = pos.coords.longitude;
        var acc = pos.coords.accuracy;
        setGpsAccCN(Math.round(acc));
        if (!dentroDeBello(lat, lon)) {
          setError('Tu ubicación está fuera de Bello.');
          return;
        }
        colocarPin(lat, lon, true);   // consulta norma inmediatamente
      },
      function(err) {
        setBusyGPS(false);
        var msg = err.code === 1 ? 'Permiso de ubicación denegado. Habilítalo en los ajustes del navegador.' :
                  err.code === 2 ? 'GPS no disponible. Verifica que la ubicación esté encendida y estás al aire libre.' :
                  err.code === 3 ? 'Tiempo de espera agotado. Intenta en un lugar con mejor señal.' :
                  'No se pudo obtener la ubicación: ' + (err.message || '');
        setError(msg);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  }

  // Búsqueda unificada: detecta automáticamente si es coordenada o dirección
  async function buscar() {
    setError(''); setResultado(null);
    var txt = consulta.trim();
    if (!txt) { setError('Ingresa una dirección o coordenadas.'); return; }

    // Intentar parsear como coordenadas primero
    var coords = _parsearCoordenadas(txt);
    if (coords) {
      if (!dentroDeBello(coords.lat, coords.lon)) {
        setError('Las coordenadas están fuera del municipio de Bello.');
        return;
      }
      colocarPin(coords.lat, coords.lon, true);
      return;
    }

    // No son coordenadas → geocodificar como dirección
    setBusyGeo(true);
    try {
      var res = await geocodeConGoogle(txt);
      colocarPin(res.lat, res.lon, true);
    } catch (e1) {
      try {
        var variantes = [
          normalizarDireccionGoogle(txt) + ', Bello, Antioquia, Colombia',
          txt + ', Bello, Antioquia, Colombia',
          txt + ', Bello',
        ];
        var encontrado = null;
        for (var q of variantes) {
          var r = await geocodeDireccion(q);
          var c = r.data || r;
          if (c && c.lat && c.lng && dentroDeBello(c.lat, c.lng)) {
            encontrado = { lat: c.lat, lon: c.lng };
            break;
          }
        }
        if (encontrado) {
          colocarPin(encontrado.lat, encontrado.lon, true);
        } else {
          setError('No se encontró dentro de Bello. Verifica la dirección (ej: CL 50 32-10) o pega coordenadas (ej: 6.337, -75.557).');
        }
      } catch (e2) {
        setError('Error buscando: ' + (e1.message || e2.message));
      }
    }
    setBusyGeo(false);
  }

  async function consultarNorma(lat, lon) {
    setBusyPOT(true); setBusyCat(true); setResultado(null); setCatastro(null);
    // Consultar POT y catastro en paralelo (independientes)
    consultarPOT(lat, lon)
      .then(r => setResultado(r))
      .catch(e => setError('Error consultando POT: ' + e.message))
      .finally(() => setBusyPOT(false));
    buscarCatastroGPS(lat, lon)
      .then(r => setCatastro(r))
      .catch(e => { console.warn('Catastro:', e); setCatastro([]); })
      .finally(() => setBusyCat(false));
  }

  function limpiar() {
    setConsulta(''); setError('');
    setPunto(null); setResultado(null); setCatastro(null);
    if (markerRef.current) {
      markerRef.current.setMap(null);
      markerRef.current = null;
    }
    if (mapRef.current) {
      mapRef.current.setCenter(BELLO_CENTRO);
      mapRef.current.setZoom(13);
    }
  }

  return (
    <div className="pantalla activa pad-bottom">
      <div className="page-title" style={{ marginBottom: 6 }}>Consultar norma POT</div>
      <div style={{ fontSize: 12, color: 'var(--texto-suave)', marginBottom: 14 }}>
        Busca por dirección o coordenadas, captura tu ubicación GPS o toca el mapa.
      </div>

      {/* Campo unificado: dirección o coordenadas */}
      <div className="card" style={{ marginBottom: 12 }}>
        <label htmlFor="cn-direccion-coordenadas" style={{ display: 'block', fontSize: 12, color: 'var(--texto-suave)', marginBottom: 4 }}>
          Dirección o coordenadas
        </label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            id="cn-direccion-coordenadas"
            value={consulta}
            onChange={e => setConsulta(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') buscar(); }}
            placeholder="CL 50 32-10 o 6.337, -75.557"
            style={{
              flex: 1, padding: '10px 12px', borderRadius: 8,
              border: '1px solid var(--borde)', background: 'var(--superficie)',
              fontFamily: 'inherit', fontSize: 14,
            }}
          />
          <button onClick={buscar} disabled={busyGeo} className="btn-principal"
            style={{ padding: '0 18px', fontSize: 13, width: 'auto' }}>
            {busyGeo ? '...' : 'Buscar'}
          </button>
        </div>
        <div style={{ fontSize: 11, color: 'var(--texto-suave)', marginTop: 4 }}>
          Acepta direccion, coordenadas decimales, DMS, DMM o link de Google Maps.
        </div>
        <button onClick={capturarGPS} disabled={busyGPS} style={{
          marginTop: 8, width: '100%', padding: '10px 14px', borderRadius: 8,
          border: '1.5px solid var(--brand-accent)', background: 'var(--superficie)',
          color: 'var(--brand-accent)', fontSize: 13, fontWeight: 600,
          fontFamily: 'inherit', cursor: busyGPS ? 'wait' : 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          opacity: busyGPS ? 0.7 : 1,
        }}>
          {busyGPS
            ? <><Icon.Clock size={16} /> Capturando ubicación…</>
            : <><Icon.Pin size={16} /> Capturar mis coordenadas</>}
        </button>
        {/* Precisión solo se muestra tras una captura exitosa */}
        {!busyGPS && gpsAccCN != null && React.createElement('div', {
          style: { textAlign: 'center', marginTop: 4, fontSize: 12, fontWeight: 600,
            color: gpsAccCN <= 10 ? 'var(--verde-dark)' : gpsAccCN <= 25 ? 'var(--cafe)' : 'var(--rojo)' }
        }, 'Precisión: ±' + gpsAccCN + 'm')}
      </div>

      {/* Mapa Google Maps */}
      <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 12 }}>
        <div ref={mapDivRef} style={{ width: '100%', height: 380 }}></div>
        {punto && (
          <div style={{
            padding: '8px 12px', borderTop: '1px solid var(--borde)',
            fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--texto-suave)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8,
          }}>
            <span>{punto.lat.toFixed(6)}, {punto.lon.toFixed(6)}</span>
            <a href={`https://maps.google.com/?q=${punto.lat},${punto.lon}`} target="_blank"
              rel="noopener noreferrer"
              style={{ color: 'var(--brand-accent)', textDecoration: 'none', fontSize: 11 }}>
              Abrir en Google Maps ↗
            </a>
          </div>
        )}
      </div>

      {error && (
        <div className="card" style={{
          color: 'var(--rojo)', background: 'var(--rojo-bg)',
          borderColor: 'rgba(180,58,46,0.3)', marginBottom: 12, fontSize: 13,
        }}>
          {error}
        </div>
      )}

      {/* Alerta predio municipal: fuera del panel de catastro, justo después del mapa */}
      {!busyCat && catastro && catastro.some(r => r.municipal) && (
        <div style={{
          padding: '12px 14px', borderRadius: 'var(--r-md)', marginBottom: 12,
          background: 'var(--rojo-bg)', border: '1.5px solid var(--rojo)',
          color: 'var(--brand-ink)', fontSize: 13, fontWeight: 600,
          display: 'flex', alignItems: 'flex-start', gap: 8,
        }}>
          <Icon.Alert size={18} />
          <div>Predio del <strong>Municipio de Bello</strong></div>
        </div>
      )}

      {/* Consulta Catastro — acordeón, encima del panel POT */}
      {(busyCat || catastro) && (
        <div className="card" style={{ marginBottom: 12, padding: 0, overflow: 'hidden' }}>
          <div onClick={() => setCatastroOpen(!catastroOpen)} style={{
            padding: '14px 16px', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            borderBottom: catastroOpen ? '1px solid var(--borde)' : 'none',
            userSelect: 'none',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div className="card-titulo" style={{ margin: 0 }}>Consulta Catastro</div>
              {catastro && catastro.length > 0 && (
                <span style={{
                  fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10,
                  background: 'var(--azul-bg)', color: 'var(--azul)',
                }}>{catastro.length} {catastro.length === 1 ? 'ficha' : 'fichas'}</span>
              )}
            </div>
            <span style={{ color: 'var(--texto-suave)', display: 'inline-flex' }}>
              {catastroOpen ? <Icon.ChevronUp size={14} /> : <Icon.Chevron size={14} />}
            </span>
          </div>
          {catastroOpen && (
            <div style={{ padding: '12px 16px' }}>
              {busyCat && (
                <div style={{ textAlign: 'center', padding: '14px 0', color: 'var(--texto-suave)', fontSize: 13 }}>
                  Consultando catastro...
                </div>
              )}
              {!busyCat && catastro && catastro.length === 0 && (
                <div style={{ color: 'var(--texto-suave)', fontSize: 13, textAlign: 'center', padding: '14px 0' }}>
                  El punto no cae dentro de ningún predio del catastro 2026.
                </div>
              )}
              {!busyCat && catastro && catastro.length > 0 && (
                catastro.length === 1
                  ? <_TarjetaFichaCatastral r={catastro[0]} expandida={true} />
                  : <_ListaFichasCatastrales fichas={catastro} maxAlto={420} />
              )}
            </div>
          )}
        </div>
      )}

      {/* Resultado POT — siempre visible */}
      <div className="card">
        <div className="card-titulo" style={{ marginBottom: 12 }}>Norma POT</div>
        {!resultado && !busyPOT && (
          <div style={{ color: 'var(--texto-suave)', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>
            Sin consulta — busca una dirección o haz click en el mapa.
          </div>
        )}
        {busyPOT && (
          <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--texto-suave)', fontSize: 13 }}>
            Consultando norma POT...
          </div>
        )}
        {resultado && !busyPOT && (() => {
          // Comuna: preferir el valor del Comunas.geojson (point-in-polygon, más exacto);
          // si no está, derivar del barrio sugerido.
          var comuna = resultado.comuna ||
            ((typeof window._lookupComunaPorBarrio === 'function')
              ? window._lookupComunaPorBarrio(resultado.barrioSugerido) : '');
          var comunaLabel = comuna ? (comuna === 'Vereda' ? 'Vereda' : 'Comuna ' + comuna) : '—';
          return (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 13 }}>
            <CampoResultado label="Clasificación del suelo" valor={resultado.clasificacion || '—'} />
            <CampoResultado label="Polígono uso suelo" valor={resultado.poligono || '—'} />
            <CampoResultado label="Tratamiento urbanístico" valor={resultado.tratamiento || '—'} />
            <CampoResultado label="Franja de intensidad" valor={resultado.intensidad || '—'} />
            <CampoResultado
              label="Suelo de protección"
              valor={resultado.sueloProt === 'SI'
                ? (resultado.sueloProtCategoria || 'SI')
                : 'NO'}
            />
            <CampoResultado
              label="Amenaza natural"
              valor={resultado.amenaza === 'SI'
                ? (resultado.amenazaTipo
                    ? (resultado.amenazaTipo + (resultado.amenazaCategoria ? ' (' + resultado.amenazaCategoria + ')' : ''))
                    : 'SI')
                : 'NO'}
            />
            <CampoResultado label="Retiro corrientes" valor={resultado.enRetiro || 'NO'} />
            <CampoResultado label="Comuna" valor={comunaLabel} />
            <CampoResultado label="Barrio / Vereda" valor={resultado.barrioSugerido || '—'} />
            {/* DRMI: solo se muestra cuando el predio cae dentro */}
            {resultado.enDRMI === 'SI' && (
              <CampoResultado
                label="DRMI"
                valor={resultado.drmiNombre || 'Cerro Quitasol - La Holanda'}
                span={2}
              />
            )}
          </div>
          );
        })()}

        <div style={{ marginTop: 14, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={limpiar} style={{
            background: 'var(--gris-bg)', border: '1px solid var(--borde)',
            borderRadius: 8, padding: '8px 14px', fontSize: 12, cursor: 'pointer',
            fontFamily: 'inherit',
          }}>Limpiar</button>
        </div>
      </div>
    </div>
  );
}

function CampoResultado({ label, valor, span }) {
  var positivo = valor === 'SI';
  var negativo = valor === 'NO';
  return (
    <div style={{
      padding: '10px 12px', borderRadius: 8, background: 'var(--gris-bg)',
      border: '1px solid var(--borde)', gridColumn: span === 2 ? 'span 2' : undefined,
    }}>
      <div style={{ fontSize: 10, color: 'var(--texto-suave)', textTransform: 'uppercase',
        letterSpacing: 0.4, marginBottom: 4 }}>
        {label}
      </div>
      <div style={{
        fontSize: 14, fontWeight: 600,
        color: positivo ? 'var(--rojo)' : negativo ? 'var(--verde)' : 'var(--texto)',
      }}>
        {valor}
      </div>
    </div>
  );
}

function normalizarDireccionGoogle(dir) {
  var d = String(dir || '').trim().toUpperCase();
  d = d.replace(/^CL\s+/i, 'Calle ')
       .replace(/^CR\s+/i, 'Carrera ')
       .replace(/^KR\s+/i, 'Carrera ')
       .replace(/^TV\s+/i, 'Transversal ')
       .replace(/^AV\s+/i, 'Avenida ')
       .replace(/^DG\s+/i, 'Diagonal ')
       .replace(/^CQ\s+/i, 'Circular ');
  d = d.replace(/(\d+[A-Z]?)\s+(\d+[A-Z]?-\d+)/, '$1 #$2');
  return d;
}

window.ConsultaNormaScreen = ConsultaNormaScreen;
