import type { createClient } from "@/lib/supabase/server";
import type { Ubicacion } from "@/components/ubicaciones/types";

const CAMPOS = "id, pais, region, provincia, localidad, sitio, planta, oficina, lat, lng";
const TAMAÑO_PAGINA = 1000;

/**
 * Trae TODO el catálogo de Ubicaciones (ya pasamos las ~1750 filas). Un
 * `.select(...)` sin `.range()` se corta en silencio en el límite de
 * PostgREST/Supabase (por defecto 1000 filas) — eso hacía que, alfabéticamente,
 * todo lo que quedaba después del corte (ej. "REFINERIA LUJAN DE CUYO" en
 * Mendoza) nunca llegara al picker, aunque la fila existiera en la base. Pagina
 * con `.range()` hasta agotar la tabla para no depender de ningún límite.
 */
export async function fetchTodasLasUbicaciones(supabase: Awaited<ReturnType<typeof createClient>>): Promise<Ubicacion[]> {
  const filas: Ubicacion[] = [];
  for (let desde = 0; ; desde += TAMAÑO_PAGINA) {
    const { data, error } = await supabase
      .from("ubicaciones")
      .select(CAMPOS)
      .order("id")
      .range(desde, desde + TAMAÑO_PAGINA - 1);
    if (error) throw error;
    filas.push(...((data as Ubicacion[] | null) ?? []));
    if (!data || data.length < TAMAÑO_PAGINA) break;
  }
  return filas;
}
