import sharp from "sharp";

/**
 * Mapa estático del trayecto para el PDF, armado nosotros mismos con
 * `sharp` (ya es dependencia de la app) pegando tiles reales de
 * OpenStreetMap — en vez de depender de un servicio externo de "static
 * maps" cuyo contrato exacto no se pudo verificar y que en los hechos no
 * respondía (ver CRITERIOS_Y_IDEAS.md). Mismo servidor de tiles que ya usa
 * el mapa interactivo en pantalla (RutaMapa/Leaflet), así que si uno
 * funciona el otro también.
 */

const TILE_SIZE = 256;
const USER_AGENT = "TaskWorkApp/1.0 (uso interno)";

function lonAPixelX(lon: number, zoom: number): number {
  return ((lon + 180) / 360) * TILE_SIZE * 2 ** zoom;
}
function latAPixelY(lat: number, zoom: number): number {
  const sin = Math.sin((lat * Math.PI) / 180);
  const y = 0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI);
  return y * TILE_SIZE * 2 ** zoom;
}

/** Mayor zoom (más detalle) tal que el bbox completo, con margen, entra en widthxheight píxeles. */
function elegirZoom(latMin: number, latMax: number, lonMin: number, lonMax: number, width: number, height: number): number {
  const MARGEN = 1.25;
  for (let zoom = 16; zoom >= 2; zoom--) {
    const anchoPx = (lonAPixelX(lonMax, zoom) - lonAPixelX(lonMin, zoom)) * MARGEN;
    const altoPx = Math.abs(latAPixelY(latMin, zoom) - latAPixelY(latMax, zoom)) * MARGEN;
    if (anchoPx <= width && altoPx <= height) return zoom;
  }
  return 2;
}

function simplificarGeometria(geometria: [number, number][], max: number): [number, number][] {
  if (geometria.length <= max) return geometria;
  const paso = Math.ceil(geometria.length / max);
  const simplificada = geometria.filter((_, i) => i % paso === 0);
  const ultimo = geometria[geometria.length - 1];
  if (simplificada[simplificada.length - 1] !== ultimo) simplificada.push(ultimo);
  return simplificada;
}

async function descargarTile(zoom: number, x: number, y: number): Promise<Buffer | null> {
  try {
    const res = await fetch(`https://tile.openstreetmap.org/${zoom}/${x}/${y}.png`, { headers: { "User-Agent": USER_AGENT } });
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}

export interface Coords {
  lat: number;
  lon: number;
}

/**
 * Devuelve un PNG con los tiles reales de OSM alrededor del trayecto +
 * la ruta y los marcadores de origen/destino dibujados encima. Best-effort:
 * si no se puede descargar algún tile o armar la imagen, devuelve null y el
 * PDF se genera igual, sin el mapa.
 */
export async function generarMapaEstaticoTrayecto(
  origen: Coords,
  destino: Coords,
  geometria: [number, number][],
  width = 640,
  height = 380,
): Promise<Buffer | null> {
  try {
    const puntos: [number, number][] = geometria.length > 1 ? geometria : [[origen.lat, origen.lon], [destino.lat, destino.lon]];
    const lats = puntos.map((p) => p[0]).concat([origen.lat, destino.lat]);
    const lons = puntos.map((p) => p[1]).concat([origen.lon, destino.lon]);
    const latMin = Math.min(...lats);
    const latMax = Math.max(...lats);
    const lonMin = Math.min(...lons);
    const lonMax = Math.max(...lons);

    const zoom = elegirZoom(latMin, latMax, lonMin, lonMax, width, height);
    const centroPxX = (lonAPixelX(lonMin, zoom) + lonAPixelX(lonMax, zoom)) / 2;
    const centroPxY = (latAPixelY(latMin, zoom) + latAPixelY(latMax, zoom)) / 2;
    const ventanaX0 = centroPxX - width / 2;
    const ventanaY0 = centroPxY - height / 2;

    const tileXMin = Math.floor(ventanaX0 / TILE_SIZE);
    const tileXMax = Math.floor((ventanaX0 + width) / TILE_SIZE);
    const tileYMin = Math.floor(ventanaY0 / TILE_SIZE);
    const tileYMax = Math.floor((ventanaY0 + height) / TILE_SIZE);
    const maxTiles = 2 ** zoom;

    const tileRequests: { x: number; y: number }[] = [];
    for (let x = tileXMin; x <= tileXMax; x++) {
      for (let y = tileYMin; y <= tileYMax; y++) {
        if (y < 0 || y >= maxTiles) continue;
        tileRequests.push({ x: ((x % maxTiles) + maxTiles) % maxTiles, y });
      }
    }
    if (tileRequests.length === 0 || tileRequests.length > 40) return null;

    const tiles = await Promise.all(tileRequests.map(async (t) => ({ ...t, buffer: await descargarTile(zoom, t.x, t.y) })));
    if (tiles.some((t) => !t.buffer)) return null;

    const gridWidth = (tileXMax - tileXMin + 1) * TILE_SIZE;
    const gridHeight = (tileYMax - tileYMin + 1) * TILE_SIZE;
    const mosaico = await sharp({
      create: { width: gridWidth, height: gridHeight, channels: 4, background: { r: 238, g: 238, b: 238, alpha: 1 } },
    })
      .composite(
        tiles.map((t) => ({
          input: t.buffer!,
          left: (t.x - tileXMin) * TILE_SIZE,
          top: (t.y - tileYMin) * TILE_SIZE,
        })),
      )
      .png()
      .toBuffer();

    const recorteX = Math.round(ventanaX0 - tileXMin * TILE_SIZE);
    const recorteY = Math.round(ventanaY0 - tileYMin * TILE_SIZE);
    const base = await sharp(mosaico)
      .extract({
        left: Math.max(0, Math.min(recorteX, gridWidth - width)),
        top: Math.max(0, Math.min(recorteY, gridHeight - height)),
        width,
        height,
      })
      .toBuffer();
    // El recorte real (clamped a los bordes del mosaico) es el origen de coordenadas para dibujar encima.
    const origenX = Math.max(0, Math.min(recorteX, gridWidth - width));
    const origenY = Math.max(0, Math.min(recorteY, gridHeight - height));

    const puntosSvg = simplificarGeometria(puntos, 150)
      .map(([lat, lon]) => `${(lonAPixelX(lon, zoom) - tileXMin * TILE_SIZE - origenX).toFixed(1)},${(latAPixelY(lat, zoom) - tileYMin * TILE_SIZE - origenY).toFixed(1)}`)
      .join(" ");
    const origenSvgX = lonAPixelX(origen.lon, zoom) - tileXMin * TILE_SIZE - origenX;
    const origenSvgY = latAPixelY(origen.lat, zoom) - tileYMin * TILE_SIZE - origenY;
    const destinoSvgX = lonAPixelX(destino.lon, zoom) - tileXMin * TILE_SIZE - origenX;
    const destinoSvgY = latAPixelY(destino.lat, zoom) - tileYMin * TILE_SIZE - origenY;

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
      <polyline points="${puntosSvg}" fill="none" stroke="#0a66c2" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" />
      <circle cx="${origenSvgX}" cy="${origenSvgY}" r="7" fill="#1E7A4A" stroke="white" stroke-width="2" />
      <circle cx="${destinoSvgX}" cy="${destinoSvgY}" r="7" fill="#B33A3A" stroke="white" stroke-width="2" />
    </svg>`;

    return await sharp(base)
      .composite([{ input: Buffer.from(svg) }])
      .png()
      .toBuffer();
  } catch {
    return null;
  }
}
