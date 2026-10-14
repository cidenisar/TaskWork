export interface ConfigCalibreCable {
  amperajeMax: number;
  calibreMm2: number;
}

/** Amperaje nominal tal como lo carga el técnico (ej. "32A", "16 A") — nunca se inventa, se lee lo que ya está escrito. */
export function parseAmperaje(ampNominal: string | null): number | null {
  if (!ampNominal) return null;
  const n = Number(ampNominal.replace(",", ".").replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Busca la banda configurada (ver catalogo_calibre_cable) cuyo amperaje_max
 * sea el más chico que alcance a cubrir el amperaje real — nunca inventa un
 * calibre si el amperaje supera la banda más alta configurada.
 */
export function calcularCalibreCable(amperaje: number | null, config: ConfigCalibreCable[]): number | null {
  if (amperaje == null) return null;
  const ordenado = [...config].sort((a, b) => a.amperajeMax - b.amperajeMax);
  const fila = ordenado.find((c) => c.amperajeMax >= amperaje);
  return fila ? fila.calibreMm2 : null;
}
