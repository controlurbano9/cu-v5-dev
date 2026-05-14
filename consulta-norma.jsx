// ═══════════════════════════════════════════════════════════════
// v6/consulta-norma.jsx — Consulta autónoma de norma POT.
//
// Permite consultar la norma de un predio sin estar dentro de una visita.
// Modos:
//   - Dirección: geocodifica (Google Maps vía AS) y valida bbox Bello.
//   - Pin en mapa: arrastrable, dispara POT en cada drag.
//
// Restricción explícita al municipio de Bello (bounding box):
//   lat ∈ [6.18, 6.55], lng ∈ [-75.75, -75.40]
// Si el punto cae fuera, se rechaza con mensaje claro.
//
// Mapa: Leaflet + OpenStreetMap (sin API key, sin quota).
// POT: api.js#consultarPOT (turf.js + GeoJSONs en GitHub).
// ═══════════════════════════════════════════════════════════════
const { useState: useStateCN, useEffect: useEffectCN, useRef: useRefCN } = React;

// Bbox Bello — mismo que producción V2.
const BELLO_BBOX = { latMin: 6.18, latMax: 6.55, lonMin: -75.75, lonMax: -75.40 };
const BELLO_CENTRO = [6.337, -75.557]; // [lat, lng]

function dentroDeBello(lat, lon) {
  return lat >= BELLO_BBOX.latMin && lat <= BELLO_BBOX.latMax &&
         lon >= BELLO_BBOX.lonMin && lon <= BELLO_BBOX.lonMax;
}

function ConsultaNormaScreen() {
  const [direccion, setDireccion]   = useStateCN('');
  const [punto, setPunto]           = useStateCN(null);   // { lat, lon } | null
  const [resultado, setResultado]   = useStateCN(null);   // POT response | null
  const [busyGeo, setBusyGeo]       = useStateCN(false);
  const [busyPOT, setBusyPOT]       = useStateCN(false);
  const [error, setError]           = useStateCN('');

  const mapDivRef     = useRefCN(null);
  const mapRef        = useRefCN(null);  // instancia Leaflet
  const markerRef     = useRefCN(null);

  // Montar mapa Leaflet una sola vez
  useEffectCN(() => {
    if (typeof L === 'undefined') {
      setError('Leaflet no cargó. Verifica VERSION_6_REACT.html.');
      return;
    }
    if (mapRef.current || !mapDivRef.current) return;
    const map = L.map(mapDivRef.current, {
      center: BELLO_CENTRO, zoom: 13,
      maxBounds: [
        [BELLO_BBOX.latMin - 0.05, BELLO_BBOX.lonMin - 0.05],
        [BELLO_BBOX.latMax + 0.05, BELLO_BBOX.lonMax + 0.05],
      ],
      minZoom: 11,
    });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap',
      maxZoom: 19,
    }).addTo(map);

    // Click en el mapa: coloca/mueve el pin y dispara POT
    map.on('click', function(e) {
      const lat = e.latlng.lat, lon = e.latlng.lng;
      if (!dentroDeBello(lat, lon)) {
        setError('El punto está fuera del municipio de Bello.');
        return;
      }
      colocarPin(lat, lon, true);
    });

    mapRef.current = map;
    return () => {
      try { map.remove(); } catch (e) {}
      mapRef.current = null;
      markerRef.current = null;
    };
  }, []);

  // Coloca/mueve el marcador y opcionalmente consulta POT.
  function colocarPin(lat, lon, consultar) {
    setError('');
    setPunto({ lat, lon });
    const map = mapRef.current;
    if (!map) return;
    if (markerRef.current) {
      markerRef.current.setLatLng([lat, lon]);
    } else {
      const m = L.marker([lat, lon], { draggable: true }).addTo(map);
      m.on('dragend', function(ev) {
        const ll = ev.target.getLatLng();
        if (!dentroDeBello(ll.lat, ll.lng)) {
          setError('Punto fuera de Bello. Arrastra de vuelta al municipio.');
          // Devolver al centro de Bello para no quedar fuera
          m.setLatLng(BELLO_CENTRO);
          setPunto({ lat: BELLO_CENTRO[0], lon: BELLO_CENTRO[1] });
          return;
        }
        setPunto({ lat: ll.lat, lon: ll.lng });
        consultarNorma(ll.lat, ll.lng);
      });
      markerRef.current = m;
    }
    map.setView([lat, lon], Math.max(map.getZoom(), 17));
    if (consultar) consultarNorma(lat, lon);
  }

  // Geocoding por dirección (Google Maps vía AS), restringido a Bello.
  async function buscarPorDireccion() {
    setError('');
    setResultado(null);
    const dir = direccion.trim();
    if (!dir) { setError('Ingresa una dirección.'); return; }
    setBusyGeo(true);
    try {
      // Varias variantes — mismo enfoque que producción
      const variantes = [
        normalizarDireccionGoogle(dir) + ', Bello, Antioquia, Colombia',
        dir + ', Bello, Antioquia, Colombia',
        normalizarDireccionGoogle(dir) + ', Bello, Colombia',
        dir + ', Bello',
      ];
      let encontrado = null;
      for (const q of variantes) {
        const r = await geocodeDireccion(q);
        const c = r.data || r;
        if (c && c.lat && c.lng && dentroDeBello(c.lat, c.lng)) {
          encontrado = { lat: c.lat, lon: c.lng, query: q };
          break;
        }
      }
      if (!encontrado) {
        setError('No se encontró la dirección dentro de Bello. Verifica el formato (ej: CL 50 32-10) o coloca el pin manualmente.');
      } else {
        colocarPin(encontrado.lat, encontrado.lon, true);
      }
    } catch (e) {
      setError('Error geocodificando: ' + e.message);
    }
    setBusyGeo(false);
  }

  // Llama al POT cliente (turf + GeoJSONs).
  async function consultarNorma(lat, lon) {
    setBusyPOT(true);
    setResultado(null);
    try {
      const r = await consultarPOT(lat, lon);
      setResultado(r);
    } catch (e) {
      setError('Error consultando POT: ' + e.message);
    }
    setBusyPOT(false);
  }

  function limpiar() {
    setDireccion(''); setError('');
    setPunto(null); setResultado(null);
    if (markerRef.current && mapRef.current) {
      try { mapRef.current.removeLayer(markerRef.current); } catch (e) {}
      markerRef.current = null;
    }
    if (mapRef.current) mapRef.current.setView(BELLO_CENTRO, 13);
  }

  return (
    <div className="pantalla activa pad-bottom">
      <div className="page-title" style={{ marginBottom: 6 }}>Consultar norma POT</div>
      <div style={{ fontSize: 12, color: 'var(--texto-suave)', marginBottom: 14 }}>
        Solo predios dentro del municipio de Bello. Ingresa la dirección o
        coloca el pin haciendo click en el mapa.
      </div>

      {/* Dirección */}
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
            style={{ padding: '0 18px', fontSize: 13 }}>
            {busyGeo ? 'Buscando...' : 'Buscar'}
          </button>
        </div>
      </div>

      {/* Mapa */}
      <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 12 }}>
        <div ref={mapDivRef} style={{ width: '100%', height: 360 }}></div>
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
          color: 'var(--rojo)', background: 'var(--rojo-bg, rgba(180,58,46,0.08))',
          borderColor: 'rgba(180,58,46,0.3)', marginBottom: 12, fontSize: 13,
        }}>
          {error}
        </div>
      )}

      {/* Resultado */}
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
        {resultado && !busyPOT && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 13 }}>
            <CampoResultado label="Polígono uso suelo" valor={resultado.poligono || '—'} />
            <CampoResultado label="Suelo de protección" valor={resultado.sueloProt || 'NO'} />
            <CampoResultado label="Amenaza natural"     valor={resultado.amenaza || 'NO'} />
            <CampoResultado label="Retiro corrientes"   valor={resultado.enRetiro || 'NO'} />
            <CampoResultado label="Barrio / Vereda"     valor={resultado.barrioSugerido || '—'} span={2} />
          </div>
        )}

        <div style={{ marginTop: 14, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={limpiar} style={{
            background: 'var(--gris-bg, #F5F1EB)', border: '1px solid var(--borde)',
            borderRadius: 8, padding: '8px 14px', fontSize: 12, cursor: 'pointer',
            fontFamily: 'inherit',
          }}>Limpiar</button>
        </div>
      </div>
    </div>
  );
}

function CampoResultado({ label, valor, span }) {
  const positivo = valor === 'SI';
  const negativo = valor === 'NO';
  return (
    <div style={{
      padding: '10px 12px', borderRadius: 8, background: 'var(--gris-bg, #F5F1EB)',
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

// Normalización de dirección colombiana → formato Google (igual que producción V2).
function normalizarDireccionGoogle(dir) {
  let d = String(dir || '').trim().toUpperCase();
  d = d.replace(/^CL\s+/i, 'Calle ')
       .replace(/^CR\s+/i, 'Carrera ')
       .replace(/^KR\s+/i, 'Carrera ')
       .replace(/^TV\s+/i, 'Transversal ')
       .replace(/^AV\s+/i, 'Avenida ')
       .replace(/^DG\s+/i, 'Diagonal ')
       .replace(/^CQ\s+/i, 'Circular ');
  // "50 32-10" → "50 #32-10"
  d = d.replace(/(\d+[A-Z]?)\s+(\d+[A-Z]?-\d+)/, '$1 #$2');
  return d;
}

window.ConsultaNormaScreen = ConsultaNormaScreen;
