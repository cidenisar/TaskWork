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

interface ResultadoNominatim {
  lat: string;
  lon: string;
  class?: string;
  type?: string;
}

const TIPOS_LUGAR_POBLADO = new Set(["city", "town", "village", "hamlet", "municipality", "suburb"]);

export async function geocodificarDireccion(direccion: string): Promise<Coords | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&countrycodes=ar&q=${encodeURIComponent(direccion)}`;
    const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
    if (!res.ok) return null;
    const data: ResultadoNominatim[] = await res.json();
    if (!Array.isArray(data) || data.length === 0) return null;
    // "Mendoza" a secas, sin esto, puede resolver al centroide de la PROVINCIA
    // (class=boundary) en vez de la ciudad — mucho más al sur/centro que la
    // ciudad real, y de ahí una ruta calculada desde el punto equivocado (ver
    // CRITERIOS_Y_IDEAS.md). Se prefiere un resultado que sea una localidad
    // real (class=place) antes que una división administrativa.
    const candidato = data.find((r) => r.class === "place" && r.type && TIPOS_LUGAR_POBLADO.has(r.type)) ?? data[0];
    const lat = Number(candidato.lat);
    const lon = Number(candidato.lon);
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
