import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/**
 * Cierra las tareas que el técnico tildó como "resuelta en esta visita" y
 * devuelve los textos de TODAS las tareas resueltas en este informe (las de
 * ahora y las de ediciones anteriores) para listarlas en el PDF.
 *
 * El cierre pasa por la función SQL `resolver_tareas_en_visita`: es la única
 * puerta del técnico (la tabla es solo de oficina) y solo deja cerrar tareas
 * abiertas del MISMO sitio del informe.
 *
 * Nunca rompe el informe: si falla queda en `client_errores` (contexto
 * "tareas-pendientes-visita") y el PDF sale con lo que ya estuviera cerrado.
 */
export async function resolverTareasDeLaVisita(
  supabase: Supabase,
  params: { informeId: string; tareaIds: string[]; userId: string },
): Promise<string[]> {
  const { informeId, tareaIds, userId } = params;
  try {
    const ids = [...new Set(tareaIds.filter(Boolean))];
    if (ids.length > 0) {
      const { error } = await supabase.rpc("resolver_tareas_en_visita", { p_informe_id: informeId, p_tarea_ids: ids });
      if (error) await registrarFallo(supabase, userId, `informe ${informeId}: ${error.message}`);
    }
    const { data, error } = await supabase
      .from("tareas_pendientes")
      .select("texto")
      .eq("informe_cierre_id", informeId)
      .order("cerrada_at", { ascending: true });
    if (error) {
      await registrarFallo(supabase, userId, `informe ${informeId}: no se pudieron leer las resueltas: ${error.message}`);
      return [];
    }
    return (data ?? []).map((f) => f.texto);
  } catch (err) {
    await registrarFallo(supabase, userId, `informe ${informeId}: ${err instanceof Error ? err.message : String(err)}`);
    return [];
  }
}

async function registrarFallo(supabase: Supabase, userId: string, mensaje: string): Promise<void> {
  try {
    await supabase.from("client_errores").insert({ user_id: userId, contexto: "tareas-pendientes-visita", mensaje: mensaje.slice(0, 2000) });
  } catch {
    // el diagnóstico es best-effort
  }
}
