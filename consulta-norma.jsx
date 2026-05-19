// ═══════════════════════════════════════════════════════════════
// v6/consulta-norma.jsx — Consulta norma POT con Google Maps Satellite
//
// Geocoding: Google Maps Geocoder (browser-side)
// Mapa: Google Maps (satellite)
// GPS: Geolocation API para capturar coordenadas
// POT: turf.js + GeoJSONs en GitHub (controlurbano9/pot-bello)
// ═══════════════════════════════════════════════════════════════
const { useState: useStateCN, useEffect: useEffectCN, useRef: useRefCN } = React;

// Reutiliza componentes catastrales definidos en nueva-visita.jsx
// (se carga antes que este archivo, así que están en window).
const _TarjetaFichaCatastral = window._TarjetaFichaCatastral;
const _ListaFichasCatastrales = window._ListaFichasCatastrales;

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

function ConsultaNormaScreen() {
  const [direccion, setDireccion] = useStateCN('');
  const [punto, setPunto] = useStateCN(null);
  const [resultado, setResultado] = useStateCN(null);
  const [busyGeo, setBusyGeo] = useStateCN(false);
  const [busyGPS, setBusyGPS] = useStateCN(false);
  const [busyPOT, setBusyPOT] = useStateCN(false);
  const [busyCat, setBusyCat] = useStateCN(false);
  const [catastro, setCatastro] = useStateCN(null);  // array de fichas o null
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

  // Capturar coordenadas GPS del dispositivo
  async function capturarGPS() {
    if (!navigator.geolocation) {
      setError('Tu dispositivo no soporta geolocalización.');
      return;
    }
    setBusyGPS(true); setError('');
    navigator.geolocation.getCurrentPosition(
      function(pos) {
        var lat = pos.coords.latitude, lon = pos.coords.longitude;
        if (!dentroDeBello(lat, lon)) {
          setError('Tu ubicación actual está fuera de Bello.');
          setBusyGPS(false);
          return;
        }
        colocarPin(lat, lon, true);
        setBusyGPS(false);
      },
      function(err) {
        setError('No se pudo obtener la ubicación: ' + err.message);
        setBusyGPS(false);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  }

  async function buscarPorDireccion() {
    setError(''); setResultado(null);
    var dir = direccion.trim();
    if (!dir) { setError('Ingresa una dirección.'); return; }
    setBusyGeo(true);
    try {
      var res = await geocodeConGoogle(dir);
      colocarPin(res.lat, res.lon, true);
    } catch (e1) {
      try {
        var variantes = [
          normalizarDireccionGoogle(dir) + ', Bello, Antioquia, Colombia',
          dir + ', Bello, Antioquia, Colombia',
          dir + ', Bello',
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
          setError('No se encontró la dirección dentro de Bello. Verifica el formato (ej: CL 50 32-10) o coloca el pin en el mapa.');
        }
      } catch (e2) {
        setError('Error geocodificando: ' + (e1.message || e2.message));
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
    setDireccion(''); setError('');
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
        Ingresa la dirección, captura tus coordenadas o toca el mapa.
      </div>

      {/* Dirección + GPS */}
      <div className="card" style={{ marginBottom: 12 }}>
        <label style={{ display: 'block', fontSize: 12, color: 'var(--texto-suave)', marginBottom: 4 }}>
          Dirección
        </label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={direccion}
            onChange={e => setDireccion(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') buscarPorDireccion(); }}
            placeholder="Ej: CL 50 32-10"
            style={{
              flex: 1, padding: '10px 12px', borderRadius: 8,
              border: '1px solid var(--borde)', background: 'var(--superficie)',
              fontFamily: 'inherit', fontSize: 14,
            }}
          />
          <button onClick={buscarPorDireccion} disabled={busyGeo} className="btn-principal"
            style={{ padding: '0 18px', fontSize: 13, width: 'auto' }}>
            {busyGeo ? '...' : 'Buscar'}
          </button>
        </div>
        <button onClick={capturarGPS} disabled={busyGPS} style={{
          marginTop: 8, width: '100%', padding: '10px 14px', borderRadius: 8,
          border: '1.5px solid var(--brand-accent)', background: 'var(--superficie)',
          color: 'var(--brand-accent)', fontSize: 13, fontWeight: 600,
          fontFamily: 'inherit', cursor: busyGPS ? 'wait' : 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        }}>
          {busyGPS ? 'Obteniendo ubicación...' : '📍 Capturar mis coordenadas'}
        </button>
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

      {/* Resultado catastral (alerta municipal + fichas) */}
      {(busyCat || catastro) && (
        <div className="card" style={{ marginBottom: 12 }}>
          <div className="card-titulo" style={{ marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
            Catastro 2026
            {catastro && catastro.length > 0 && (
              <span style={{
                fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10,
                background: 'rgba(74,108,140,0.14)', color: '#3F5C78',
              }}>{catastro.length} {catastro.length === 1 ? 'ficha' : 'fichas'}</span>
            )}
          </div>
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
            <>
              {catastro.some(r => r.municipal) && (
                <div style={{
                  padding: '12px 14px', borderRadius: 'var(--r-md)', marginBottom: 10,
                  background: '#fef2f2', border: '1.5px solid #dc2626',
                  color: '#991b1b', fontSize: 13, fontWeight: 600,
                  display: 'flex', alignItems: 'flex-start', gap: 8,
                }}>
                  <span style={{ fontSize: 18, lineHeight: 1 }}>⚠️</span>
                  <div>Predio del <strong>Municipio de Bello</strong></div>
                </div>
              )}
              {catastro.length === 1
                ? <_TarjetaFichaCatastral r={catastro[0]} expandida={true} />
                : <_ListaFichasCatastrales fichas={catastro} maxAlto={420} />
              }
            </>
          )}
        </div>
      )}

      {/* Resultado POT */}
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
            <CampoResultado
              label="DRMI Quitasol-La Holanda"
              valor={resultado.enDRMI === 'SI' ? (resultado.drmiNombre || 'SI') : 'NO'}
              span={2}
            />
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
