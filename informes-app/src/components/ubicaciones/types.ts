export interface Ubicacion {
  id: string;
  provincia: string;
  sectorOficina: string | null;
  sala: string;
}

/** "Sala · Sector/Oficina · Provincia" — mismo separador que el resto de los listados de la app. */
export function labelUbicacion(u: Ubicacion): string {
  const partes = [u.sala, u.sectorOficina, u.provincia].filter((p): p is string => !!p && p.trim() !== "");
  return partes.join(" · ");
}
