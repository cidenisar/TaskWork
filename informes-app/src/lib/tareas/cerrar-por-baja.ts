import type { createServiceRoleClient } from "@/lib/supabase/server";
import type { TipoEquipoBaja } from "@/lib/database.types";

/**
 * Cuando un equipo se da de baja, las tareas pendientes ABIERTAS vinculadas a él
 * dejan de tener sentido: se cierran solas como "dada de baja — se dio de baja el
 * equipo", citando el N° de la baja en el comentario. Es automático pero no
 * definitivo: desde Panel → Tareas se pueden reabrir.
 *
 * Va con el service role porque quien da la baja puede ser el técnico (reemplazo
 * de un equipo al instalar el nuevo) y la tabla solo la cierra la oficina por RLS;
 * es un efecto mecánico de la baja, no un permiso nuevo.
 *
 * Nunca rompe la baja: si falla queda en `client_errores` (contexto
 * "tareas-pendientes-baja") y devuelve 0.
 */
export async function cerrarTareasPorBajaDeEquipo(
  service: ReturnType<typeof createServiceRoleClient>,
  params: { tipoEquipo: TipoEquipoBaja; equipoId: string; numeroBaja: string; userId: string },
): Promise<number> {
  try {
    const { data, error } = await service
      .from("tareas_pendientes")
      .update({
        estado: "descartada",
        motivo_cierre: "equipo_dado_de_baja",
        comentario_cierre: `Se dio de baja el equipo (${params.numeroBaja})`,
        cerrada_at: new Date().toISOString(),
        cerrada_por: params.userId,
      })
      .eq("equipo_tipo", params.tipoEquipo)
      .eq("equipo_id", params.equipoId)
      .eq("estado", "abierta")
      .select("id");
    if (error) {
      await registrarFallo(service, params.userId, `baja ${params.numeroBaja}: ${error.message}`);
      return 0;
    }
    return (data ?? []).length;
  } catch (err) {
    await registrarFallo(service, params.userId, `baja ${params.numeroBaja}: ${err instanceof Error ? err.message : String(err)}`);
    return 0;
  }
}

async function registrarFallo(service: ReturnType<typeof createServiceRoleClient>, userId: string, mensaje: string): Promise<void> {
  try {
    await service.from("client_errores").insert({ user_id: userId, contexto: "tareas-pendientes-baja", mensaje: mensaje.slice(0, 2000) });
  } catch {
    // el diagnóstico es best-effort
  }
}
