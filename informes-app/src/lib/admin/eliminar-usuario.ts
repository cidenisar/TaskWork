import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

type Service = SupabaseClient<Database>;

export interface ResultadoEliminarUsuario {
  success: boolean;
  error?: string;
}

/**
 * Ninguna de las ~37 columnas que referencian `profiles.id` en todo el
 * esquema tiene `on delete cascade`/`set null` (son todas NO ACTION, el
 * default de Postgres) — a propósito, nunca se pensó como algo borrable
 * con historial real atrás. Por eso un borrado real de usuario (a
 * diferencia de Desactivar, que sí existía) solo es seguro si la cuenta
 * no tiene NINGÚN rastro en el resto de la app: se chequea cada tabla uno
 * por uno (sin JOIN posible entre tablas tan distintas) antes de animarse
 * a llamar `auth.admin.deleteUser`, que sí cae en cascada sobre `profiles`
 * (esa FK puntual es la única con `on delete cascade`).
 */
async function tieneActividad(service: Service, userId: string): Promise<boolean> {
  const checks: PromiseLike<{ count: number | null }>[] = [
    service.from("catalogo_tecnicos").select("id", { count: "exact", head: true }).eq("created_by", userId),
    service.from("vehiculo_services").select("id", { count: "exact", head: true }).eq("created_by", userId),
    service.from("informes_tecnicos").select("id", { count: "exact", head: true }).eq("created_by", userId),
    service.from("rendiciones_gastos").select("id", { count: "exact", head: true }).eq("created_by", userId),
    service.from("audit_log").select("id", { count: "exact", head: true }).eq("actor_id", userId),
    service.from("client_errores").select("id", { count: "exact", head: true }).eq("user_id", userId),
    service.from("tableros").select("id", { count: "exact", head: true }).eq("created_by", userId),
    service.from("tablero_mediciones").select("id", { count: "exact", head: true }).eq("created_by", userId),
    service.from("tablero_mantenimientos").select("id", { count: "exact", head: true }).eq("created_by", userId),
    service.from("racks").select("id", { count: "exact", head: true }).eq("created_by", userId),
    service.from("rack_relevamientos").select("id", { count: "exact", head: true }).eq("created_by", userId),
    service.from("ubicaciones").select("id", { count: "exact", head: true }).eq("created_by", userId),
    service.from("ubicaciones").select("id", { count: "exact", head: true }).eq("gps_confirmado_por", userId),
    service.from("equipos").select("id", { count: "exact", head: true }).eq("created_by", userId),
    service.from("equipo_relevamientos").select("id", { count: "exact", head: true }).eq("created_by", userId),
    service.from("bajas_equipamiento").select("id", { count: "exact", head: true }).eq("created_by", userId),
    service.from("bajas_equipamiento").select("id", { count: "exact", head: true }).eq("entregado_deposito_por", userId),
    service.from("entregas_deposito").select("id", { count: "exact", head: true }).eq("created_by", userId),
    service.from("instalaciones").select("id", { count: "exact", head: true }).eq("created_by", userId),
    service.from("torres_comunicacion").select("id", { count: "exact", head: true }).eq("created_by", userId),
    service.from("torre_comunicacion_relevamientos").select("id", { count: "exact", head: true }).eq("created_by", userId),
    service.from("mantenimiento_intervalos").select("id", { count: "exact", head: true }).eq("created_by", userId),
    service.from("mantenimientos_equipamiento").select("id", { count: "exact", head: true }).eq("created_by", userId),
    service.from("torre_tipo_largos").select("id", { count: "exact", head: true }).eq("updated_by", userId),
    service.from("mantenimiento_programaciones").select("id", { count: "exact", head: true }).eq("asignado_a", userId),
    service.from("mantenimiento_programaciones").select("id", { count: "exact", head: true }).eq("created_by", userId),
    service.from("mantenimiento_checklist_items").select("id", { count: "exact", head: true }).eq("created_by", userId),
    service.from("catalogo_recurso_altura").select("id", { count: "exact", head: true }).eq("updated_by", userId),
    service.from("catalogo_calibre_cable").select("id", { count: "exact", head: true }).eq("updated_by", userId),
    service.from("salas").select("id", { count: "exact", head: true }).eq("created_by", userId),
    service.from("catalogo_hallazgos_seguridad_tablero").select("id", { count: "exact", head: true }).eq("created_by", userId),
    service.from("catalogo_recurso_altura_bandas").select("id", { count: "exact", head: true }).eq("created_by", userId),
    service.from("catalogo_inspeccion_ia").select("id", { count: "exact", head: true }).eq("created_by", userId),
    service.from("tablero_adjuntos").select("id", { count: "exact", head: true }).eq("created_by", userId),
    service.from("ia_uso").select("id", { count: "exact", head: true }).eq("created_by", userId),
    service.from("tablero_lecturas_ia").select("id", { count: "exact", head: true }).eq("created_by", userId),
    service.from("tablero_lecturas_ia").select("id", { count: "exact", head: true }).eq("revisor_id", userId),
  ];
  const resultados = await Promise.all(checks);
  return resultados.some((r) => (r.count ?? 0) > 0);
}

/**
 * Borrado REAL de un usuario — a diferencia de Desactivar/Reactivar (que
 * nunca borran la fila), esto llama `auth.admin.deleteUser`, que cae en
 * cascada sobre `profiles` y lo saca para siempre. Solo tiene sentido (y
 * solo se permite) para una cuenta que todavía no generó ningún rastro en
 * el resto de la app — si tiene aunque sea un informe, una medición o un
 * solo registro de auditoría, se rechaza: para ese caso la herramienta
 * correcta sigue siendo Desactivar.
 */
export async function ejecutarEliminarUsuario(service: Service, userId: string): Promise<ResultadoEliminarUsuario> {
  if (await tieneActividad(service, userId)) {
    return {
      success: false,
      error: "Este usuario ya tiene actividad registrada en la app (informes, mediciones, auditoría, etc.) — no se puede borrar de verdad. Usá \"Desactivar\".",
    };
  }
  const { error } = await service.auth.admin.deleteUser(userId);
  if (error) return { success: false, error: error.message };
  return { success: true };
}
