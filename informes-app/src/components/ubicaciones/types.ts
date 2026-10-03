export interface Ubicacion {
  id: string;
  pais: string;
  region: string;
  provincia: string;
  localidad: string | null;
  sitio: string;
  planta: string | null;
  oficina: string | null;
  lat: number | null;
  lng: number | null;
}

/**
 * Etiqueta compacta para mostrar una Ubicación en selects/listados — del nivel
 * más fino al más general (Oficina · Planta · Sitio · Localidad · Provincia),
 * salteando los niveles vacíos y sin repetir un nivel que ya quedó mostrado
 * (en el catálogo importado, Sitio y Planta suelen coincidir en el nivel más
 * alto de un complejo, ej. "REFINERIA LA PLATA" sin planta específica).
 */
export function labelUbicacion(u: Ubicacion): string {
  const partes: string[] = [];
  for (const nivel of [u.oficina, u.planta, u.sitio, u.localidad, u.provincia]) {
    const v = nivel?.trim();
    if (v && v !== "" && partes[partes.length - 1] !== v) partes.push(v);
  }
  return partes.join(" · ");
}
