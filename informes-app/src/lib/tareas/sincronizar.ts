import type { createClient } from "@/lib/supabase/server";
import { lineasDeTareas, planSincronizacion } from "./puro";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/**
 * Deja la tabla `tareas_pendientes` al día con el texto de "Tareas pendientes"
 * de un informe (ver `planSincronizacion` para las reglas). Se llama cada vez
 * que el informe se genera o se edita, DESPUÉS de guardarlo.
 *
 * Nunca rompe el informe: el informe y su PDF son lo principal. Si algo falla
 * queda registrado en `client_errores` (Configuración → Errores) con contexto
 * "tareas-pendientes-sync", para poder verlo y corregirlo.
 */
export async function sincronizarTareasDelInforme(
  supabase: Supabase,
  params: { informeId: string; ubicacionId: string | null; texto: string | null; userId: string },
): Promise<void> {
  try {
    const error = await sincronizar(supabase, params);
    if (error) await registrarFallo(supabase, params.userId, `informe ${params.informeId}: ${error}`);
  } catch (err) {
    await registrarFallo(supabase, params.userId, `informe ${params.informeId}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function sincronizar(
  supabase: Supabase,
  { informeId, ubicacionId, texto, userId }: { informeId: string; ubicacionId: string | null; texto: string | null; userId: string },
): Promise<string | null> {
  const lineas = lineasDeTareas(texto);
  if (lineas.length > 0 && !ubicacionId) return "hay tareas pero el informe no tiene ubicación (la validación debería haberlo frenado)";

  const { data: filas, error: errLeer } = await supabase
    .from("tareas_pendientes")
    .select("id, texto, estado, ubicacion_id")
    .eq("informe_id", informeId);
  if (errLeer) return `no se pudieron leer las tareas: ${errLeer.message}`;

  const plan = planSincronizacion(
    lineas,
    (filas ?? []).map((f) => ({ id: f.id, texto: f.texto, estado: f.estado, ubicacionId: f.ubicacion_id })),
    ubicacionId ?? "",
  );

  const problemas: string[] = [];

  if (plan.borrarIds.length > 0) {
    const { data, error } = await supabase.from("tareas_pendientes").delete().in("id", plan.borrarIds).select("id");
    // RLS que no deja borrar no da error: devuelve menos filas. Se compara para no perderlo en silencio.
    if (error || (data ?? []).length !== plan.borrarIds.length) problemas.push(`borrar: ${error?.message ?? "no se borraron todas"}`);
  }
  if (plan.moverIds.length > 0 && ubicacionId) {
    const { data, error } = await supabase.from("tareas_pendientes").update({ ubicacion_id: ubicacionId }).in("id", plan.moverIds).select("id");
    if (error || (data ?? []).length !== plan.moverIds.length) problemas.push(`mover de ubicación: ${error?.message ?? "no se movieron todas"}`);
  }
  if (plan.insertar.length > 0 && ubicacionId) {
    const { error } = await supabase
      .from("tareas_pendientes")
      .insert(plan.insertar.map((t) => ({ ubicacion_id: ubicacionId, informe_id: informeId, texto: t, created_by: userId })));
    if (error) problemas.push(`crear: ${error.message}`);
  }
  return problemas.length > 0 ? problemas.join(" | ") : null;
}

async function registrarFallo(supabase: Supabase, userId: string, mensaje: string): Promise<void> {
  try {
    await supabase.from("client_errores").insert({ user_id: userId, contexto: "tareas-pendientes-sync", mensaje: mensaje.slice(0, 2000) });
  } catch {
    // el diagnóstico es best-effort
  }
}
