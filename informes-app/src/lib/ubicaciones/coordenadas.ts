/**
 * Lee una coordenada escrita a mano: acepta coma o punto decimal ("-33,0123"
 * o "-33.0123") y espacios. Devuelve null si está vacía, no es un número o
 * se sale del rango (latitud ±90, longitud ±180).
 */
export function parsearCoordenada(texto: string, max: number): number | null {
  const limpio = texto.trim().replace(",", ".");
  if (limpio === "") return null;
  const n = Number(limpio);
  if (!Number.isFinite(n) || Math.abs(n) > max) return null;
  return n;
}

export const parsearLatitud = (t: string) => parsearCoordenada(t, 90);
export const parsearLongitud = (t: string) => parsearCoordenada(t, 180);

/** Para mostrar en un campo de texto: 6 decimales alcanzan para ~10 cm. */
export function formatearCoordenada(n: number): string {
  return n.toFixed(6);
}

/** Enlace para ver el punto en un mapa y comprobar a ojo que cae donde debe. */
export function enlaceMapa(lat: number, lng: number): string {
  return `https://www.google.com/maps?q=${lat},${lng}`;
}
