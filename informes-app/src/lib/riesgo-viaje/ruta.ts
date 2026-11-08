/**
 * Geocoding + ruteo real, compartido entre el autocompletar de criterios
 * (API route) y la generación del PDF (mapa del trayecto) — servicios
 * públicos gratuitos, sin API key, mismo criterio que el resto de la app
 * (ver resolver-gps). Todo acá es best-effort: si algún fetch falla,
 * devuelve null y quien llama sigue sin ese dato en vez de romper el flujo.
 */

const USER_AGENT = "TaskWorkApp/1.0 (uso interno)";

export interface Coords {
  lat: number;
  lon: number;
}

export interface RutaReal {
  distanciaKm: number;
  duracionSeg: number;
  /** Puntos [lat, lon] de la geometría real de la ruta, para dibujarla en un mapa. */
  geometria: [number, number][];
}

export async function geocodificarDireccion(direccion: string): Promise<Coords | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=ar&q=${encodeURIComponent(direccion)}`;
    const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
    if (!res.ok) return null;
    const data = await res.json();
    const primero = Array.isArray(data) ? data[0] : null;
    if (!primero) return null;
    const lat = Number(primero.lat);
    const lon = Number(primero.lon);
    return Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null;
  } catch {
    return null;
  }
}

export async function obtenerRutaReal(origen: Coords, destino: Coords): Promise<RutaReal | null> {
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${origen.lon},${origen.lat};${destino.lon},${destino.lat}?overview=full&geometries=geojson`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const ruta = data?.routes?.[0];
    const coordenadas = ruta?.geometry?.coordinates;
    if (!ruta || typeof ruta.distance !== "number" || typeof ruta.duration !== "number" || !Array.isArray(coordenadas)) return null;
    // GeoJSON viene como [lon, lat] — se invierte para el uso habitual [lat, lon] (Leaflet, mapas estáticos).
    const geometria: [number, number][] = coordenadas
      .filter((c: unknown): c is [number, number] => Array.isArray(c) && c.length === 2)
      .map(([lon, lat]: [number, number]) => [lat, lon]);
    return { distanciaKm: ruta.distance / 1000, duracionSeg: ruta.duration, geometria };
  } catch {
    return null;
  }
}

export async function obtenerPronosticoDiario(coords: Coords, fechaISO: string): Promise<{ weathercode: number; vientoMaxKmh: number } | null> {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${coords.lat}&longitude=${coords.lon}&daily=weathercode,windspeed_10m_max&timezone=America%2FArgentina%2FBuenos_Aires&start_date=${fechaISO}&end_date=${fechaISO}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const weathercode = data?.daily?.weathercode?.[0];
    const vientoMaxKmh = data?.daily?.windspeed_10m_max?.[0];
    if (typeof weathercode !== "number" || typeof vientoMaxKmh !== "number") return null;
    return { weathercode, vientoMaxKmh };
  } catch {
    return null;
  }
}

/** Simplifica una polilínea larga a lo sumo a `max` puntos (toma uno cada N) — la URL de un mapa estático tiene un largo máximo razonable. */
function simplificarGeometria(geometria: [number, number][], max: number): [number, number][] {
  if (geometria.length <= max) return geometria;
  const paso = Math.ceil(geometria.length / max);
  const simplificada = geometria.filter((_, i) => i % paso === 0);
  const ultimo = geometria[geometria.length - 1];
  if (simplificada[simplificada.length - 1] !== ultimo) simplificada.push(ultimo);
  return simplificada;
}

/**
 * Centro + zoom (estilo Web Mercator, el mismo cálculo que usan Google/
 * Leaflet por detrás) para que un mapa estático de `width`x`height` muestre
 * el cuadro delimitador de todos los puntos con un margen — así no depende
 * de que el servicio de mapas estáticos sepa auto-encuadrar.
 */
function centroYZoomParaBbox(puntos: [number, number][], width: number, height: number): { lat: number; lon: number; zoom: number } {
  const lats = puntos.map((p) => p[0]);
  const lons = puntos.map((p) => p[1]);
  const latMin = Math.min(...lats);
  const latMax = Math.max(...lats);
  const lonMin = Math.min(...lons);
  const lonMax = Math.max(...lons);
  const lat = (latMin + latMax) / 2;
  const lon = (lonMin + lonMax) / 2;

  const WORLD_PX = 256;
  const MARGEN = 1.25; // 25% de margen alrededor del trayecto
  function zoomParaEje(gradosAbarcados: number, pixelesDisponibles: number, gradosPorPixelEnZoom0: number): number {
    if (gradosAbarcados <= 0) return 15;
    const z = Math.log2((pixelesDisponibles * gradosPorPixelEnZoom0) / (gradosAbarcados * MARGEN));
    return Math.max(2, Math.min(16, Math.floor(z)));
  }
  const zoomLon = zoomParaEje(lonMax - lonMin, width, 360 / WORLD_PX);
  // El ancho en grados de latitud "equivalente" depende del coseno de la latitud (Web Mercator) — aproximación suficiente para encuadrar.
  const factorLat = Math.cos((lat * Math.PI) / 180) || 0.01;
  const zoomLat = zoomParaEje((latMax - latMin) / factorLat, height, 360 / WORLD_PX);
  return { lat, lon, zoom: Math.min(zoomLon, zoomLat) };
}

/**
 * Imagen PNG de un mapa estático (OpenStreetMap) con el trayecto dibujado —
 * para el PDF, que no puede llevar un mapa interactivo. Servicio público
 * gratuito (staticmap.openstreetmap.de), sin API key. Best-effort: si el
 * fetch falla (el servicio no es de Anthropic/Supabase, puede no responder
 * siempre), devuelve null y el PDF se genera igual, sin el mapa.
 */
export async function obtenerImagenMapaRuta(origen: Coords, destino: Coords, geometria: [number, number][]): Promise<Buffer | null> {
  try {
    const width = 600;
    const height = 350;
    const puntos = geometria.length > 0 ? geometria : [[origen.lat, origen.lon], [destino.lat, destino.lon]];
    const { lat, lon, zoom } = centroYZoomParaBbox(puntos as [number, number][], width, height);
    const pathPuntos = simplificarGeometria(geometria.length > 0 ? geometria : (puntos as [number, number][]), 100)
      .map(([pLat, pLon]) => `${pLat.toFixed(5)},${pLon.toFixed(5)}`)
      .join("|");

    const params = new URLSearchParams({
      center: `${lat},${lon}`,
      zoom: String(zoom),
      size: `${width}x${height}`,
      maptype: "mapnik",
      markers: `${origen.lat},${origen.lon},lightblue1|${destino.lat},${destino.lon},red-pointer`,
      path: `color:0x0a66c2cc|weight:4|${pathPuntos}`,
    });
    const url = `https://staticmap.openstreetmap.de/staticmap.php?${params.toString()}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const buffer = Buffer.from(await res.arrayBuffer());
    return buffer.length > 0 ? buffer : null;
  } catch {
    return null;
  }
}
