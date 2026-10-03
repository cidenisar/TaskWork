import type { createClient } from "@/lib/supabase/server";

export interface PayloadUbicacionNueva {
  provincia: string;
  localidad: string;
  sitio: string;
  planta: string;
  oficina: string;
}

export interface PayloadGps {
  lat: number;
  lng: number;
  accuracy: number | null;
}

/**
 * Resuelve el id de la Ubicación a usar: la existente elegida, o da de alta
 * una nueva (alta al vuelo, mismo criterio que catalogo_clientes/
 * catalogo_torres). La Región nunca la tipea el usuario — se deriva de la
 * Provincia vía catalogo_provincias. Si ya existe una Ubicación idéntica
 * (misma provincia+localidad+sitio+planta+oficina) la reusa en vez de
 * duplicarla. Comparten este criterio Tableros, Racks, Informe Técnico y
 * Rendición de Gastos — unificado acá para no repetirlo en cada módulo.
 */
export async function resolverUbicacionId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  payload: { ubicacionId: string | null; ubicacionNueva: PayloadUbicacionNueva | null },
  userId: string,
  mensajeEntidad: string,
): Promise<{ id: string } | { error: string }> {
  if (payload.ubicacionId) return { id: payload.ubicacionId };
  if (!payload.ubicacionNueva) return { error: `Elegí o creá una ubicación para ${mensajeEntidad}.` };

  const provincia = payload.ubicacionNueva.provincia.trim();
  const localidad = payload.ubicacionNueva.localidad.trim();
  const sitio = payload.ubicacionNueva.sitio.trim();
  const planta = payload.ubicacionNueva.planta.trim();
  const oficina = payload.ubicacionNueva.oficina.trim();
  if (!provincia || !sitio) return { error: "Completá la provincia y el sitio de la ubicación nueva." };

  const { data: provinciaRow } = await supabase.from("catalogo_provincias").select("region").eq("nombre", provincia).single();
  const region = provinciaRow?.region ?? "Sin especificar";

  const { data: nueva, error } = await supabase
    .from("ubicaciones")
    .insert({
      pais: "Argentina",
      region,
      provincia,
      localidad: localidad || null,
      sitio,
      planta: planta || null,
      oficina: oficina || null,
      created_by: userId,
    })
    .select("id")
    .single();
  if (!error && nueva) return { id: nueva.id };

  if (error?.code === "23505") {
    let query = supabase.from("ubicaciones").select("id").eq("provincia", provincia).eq("sitio", sitio);
    query = localidad ? query.eq("localidad", localidad) : query.is("localidad", null);
    query = planta ? query.eq("planta", planta) : query.is("planta", null);
    query = oficina ? query.eq("oficina", oficina) : query.is("oficina", null);
    const { data: existente } = await query.single();
    if (existente) return { id: existente.id };
  }
  return { error: `No se pudo crear la ubicación: ${error?.message ?? "error desconocido"}` };
}

/**
 * Si quien cargó capturó GPS en este envío y la Ubicación resultante (nueva
 * o ya existente) todavía no tiene coordenadas guardadas, las guarda ahora
 * — es el "aprendizaje": la próxima vez que alguien esté cerca de ese
 * punto, la app ya va a reconocer el sitio solo. Nunca pisa coordenadas que
 * ya estaban guardadas.
 */
export async function tagGpsSiFalta(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ubicacionId: string,
  gps: PayloadGps | null | undefined,
  userId: string,
) {
  if (!gps) return;
  const { data: row } = await supabase.from("ubicaciones").select("lat").eq("id", ubicacionId).single();
  if (row && row.lat === null) {
    await supabase
      .from("ubicaciones")
      .update({
        lat: gps.lat,
        lng: gps.lng,
        gps_accuracy_m: gps.accuracy,
        gps_confirmado_at: new Date().toISOString(),
        gps_confirmado_por: userId,
      })
      .eq("id", ubicacionId);
  }
}
