import type { createClient } from "@/lib/supabase/server";

/**
 * Antes de dar de alta un equipo nuevo suelto, chequea si ya existe uno
 * ACTIVO con el mismo N° de serie o etiqueta YPF en el mismo sitio — evita
 * duplicar el mismo equipo físico si quedó cargado dos veces (dos informes
 * distintos, un alta de materiales y después un informe, o un olvido). No
 * es búsqueda difusa: solo coincidencia exacta de un dato identificador
 * real. Usado por Informe Técnico (Materiales) y por el Alta de Materiales.
 */
export async function buscarEquipoDuplicado(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ubicacionId: string,
  numeroSerie: string,
  etiquetaYpf: string,
): Promise<string | null> {
  if (numeroSerie) {
    const { data } = await supabase.from("equipos").select("id").eq("ubicacion_id", ubicacionId).eq("estado", "activo").eq("numero_serie", numeroSerie).limit(1).maybeSingle();
    if (data) return data.id;
  }
  if (etiquetaYpf) {
    const { data } = await supabase.from("equipos").select("id").eq("ubicacion_id", ubicacionId).eq("estado", "activo").eq("etiqueta_ypf", etiquetaYpf).limit(1).maybeSingle();
    if (data) return data.id;
  }
  return null;
}
