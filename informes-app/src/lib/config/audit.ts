import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import type { Profile } from "@/lib/types";

/**
 * Escribe una fila en audit_log (spec sección 9.7). Se llama desde las
 * Server Actions de Configuración después de cada alta/baja o cambio —
 * nunca desde el cliente (la policy de INSERT exige is_admin() + actor_id
 * = auth.uid(), ver migración 20260902000002).
 */
export async function logAudit(
  supabase: SupabaseClient<Database>,
  profile: Profile,
  accion: string,
): Promise<void> {
  await supabase.from("audit_log").insert({
    actor_id: profile.id,
    actor_nombre: profile.nombreCompleto,
    actor_rol: profile.rol,
    accion,
  });
}
