import { masReciente, type PanelSitioResumen } from "./overview";

/**
 * Vista General navega la jerarquía de Ubicaciones (región → provincia →
 * localidad → sitio) un nivel por vez, con breadcrumb — este archivo tiene
 * las funciones puras de filtrado/agrupación que usa `/panel/page.tsx` para
 * decidir qué mostrar según los filtros de la URL (searchParams), sin tocar
 * Supabase: toda la agregación es en memoria sobre el array de sitios que
 * ya trajo `getPanelOverview`.
 */

export interface FiltrosJerarquia {
  region?: string;
  provincia?: string;
  localidad?: string;
  sitio?: string;
}

/**
 * Clave de agrupación del nivel "localidad" — algunas Ubicaciones del
 * catálogo importado no tienen localidad cargada; en vez de mostrar un
 * nivel vacío "(sin localidad)" que no lleva a ningún lado, se usa el
 * nombre del sitio como clave (el nivel de abajo queda igual, solo con un
 * clic de menos para esos casos).
 */
export function localidadKey(s: PanelSitioResumen): string {
  return (s.localidad?.trim() || s.sitioNombre).trim();
}

/** Convierte los filtros activos en un query object para <Link href={{ query }}> — descarta las claves vacías. */
export function aQuery(f: FiltrosJerarquia): Record<string, string> {
  const out: Record<string, string> = {};
  if (f.region) out.region = f.region;
  if (f.provincia) out.provincia = f.provincia;
  if (f.localidad) out.localidad = f.localidad;
  if (f.sitio) out.sitio = f.sitio;
  return out;
}

export function filtrarSitios(sitios: PanelSitioResumen[], f: FiltrosJerarquia): PanelSitioResumen[] {
  return sitios.filter((s) => {
    if (f.region && s.region !== f.region) return false;
    if (f.provincia && s.provincia !== f.provincia) return false;
    if (f.localidad && localidadKey(s) !== f.localidad) return false;
    if (f.sitio && s.sitioNombre !== f.sitio) return false;
    return true;
  });
}

/** Una fila del nivel intermedio (región/provincia/localidad/sitio) — agrega lo que cuelga debajo, nunca el detalle de un equipo puntual. */
export interface NodoJerarquia {
  nombre: string;
  cantidadSitios: number;
  cantidadEquipamiento: number;
  consumoW: number | null;
  mantenimientoVencidos: number;
  ultimaVisita: string | null;
}

/** Más consumo primero (los sitios sin dato de consumo quedan al final); a igualdad, alfabético. */
function compararNodos(a: NodoJerarquia, b: NodoJerarquia): number {
  if (a.consumoW == null && b.consumoW == null) return a.nombre.localeCompare(b.nombre, "es");
  if (a.consumoW == null) return 1;
  if (b.consumoW == null) return -1;
  if (a.consumoW !== b.consumoW) return b.consumoW - a.consumoW;
  return a.nombre.localeCompare(b.nombre, "es");
}

export function agruparPor(sitios: PanelSitioResumen[], clave: (s: PanelSitioResumen) => string): NodoJerarquia[] {
  const porClave = new Map<string, PanelSitioResumen[]>();
  for (const s of sitios) {
    const k = clave(s);
    const lista = porClave.get(k);
    if (lista) lista.push(s);
    else porClave.set(k, [s]);
  }
  const nodos: NodoJerarquia[] = [];
  for (const [nombre, lista] of porClave) {
    const consumoW = lista.some((s) => s.consumoW != null) ? lista.reduce((acc, s) => acc + (s.consumoW ?? 0), 0) : null;
    nodos.push({
      nombre,
      cantidadSitios: lista.length,
      cantidadEquipamiento: lista.reduce((acc, s) => acc + s.total, 0),
      consumoW,
      mantenimientoVencidos: lista.filter((s) => s.mantenimientoVencido).length,
      ultimaVisita: lista.reduce<string | null>((acc, s) => masReciente(acc, s.ultimaVisita), null),
    });
  }
  return nodos.sort(compararNodos);
}
