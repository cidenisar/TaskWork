import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/config/audit";
import type { Database } from "@/lib/database.types";
import type { Profile } from "@/lib/types";

export interface EliminarResult {
  success: boolean;
  error?: string;
}

export interface ArchivoAEliminar {
  bucket: string;
  path: string | null;
}

/**
 * Borra una fila (sus hijas caen en cascada por FK — ver migraciones de
 * cada módulo) y limpia los archivos de storage que tenía asociados.
 * Ninguna de estas tablas tiene policy de DELETE (a propósito: solo un
 * Administrador puede borrar un registro, nunca el dueño ni un
 * Supervisor) — por eso `service` tiene que ser el cliente de service-role,
 * y por eso cada acción llamante valida `requireAdmin()` antes de leer
 * nada, no después. El registro en sí es la excepción al criterio de
 * "nunca se borra" del resto de la app (spec 6.5) — pensado para limpiar
 * datos de prueba antes de ir a producción real, no para uso diario.
 */
export async function eliminarRegistroConArchivos(
  service: SupabaseClient<Database>,
  profile: Profile,
  tabla: keyof Database["public"]["Tables"],
  id: string,
  archivos: ArchivoAEliminar[],
  descripcionAuditoria: string,
): Promise<EliminarResult> {
  const { error } = await service.from(tabla).delete().eq("id", id);
  if (error) return { success: false, error: error.message };

  for (const archivo of archivos) {
    if (archivo.path) await service.storage.from(archivo.bucket).remove([archivo.path]);
  }

  const supabase = await createClient();
  await logAudit(supabase, profile, descripcionAuditoria);
  return { success: true };
}
