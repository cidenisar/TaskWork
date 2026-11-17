"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdminOrSupervisor } from "@/lib/auth";
import { logAudit } from "@/lib/config/audit";
import type { MotivoCierreTarea } from "@/lib/database.types";

export interface TareaActionResult {
  success: boolean;
  error?: string;
}

const MOTIVOS_BAJA: MotivoCierreTarea[] = ["equipo_dado_de_baja", "ya_no_aplica", "duplicada"];

const resumen = (texto: string) => (texto.length > 120 ? `${texto.slice(0, 117)}...` : texto);

/**
 * Cierra una tarea abierta: "resolver" (se hizo) o "baja" (ya no corresponde:
 * se dio de baja el equipo, ya no aplica, estaba repetida). Solo la oficina
 * (también lo exige la RLS). Queda quién, cuándo, el motivo y un comentario.
 */
export async function cerrarTareaAction(id: string, tipo: "resolver" | "baja", motivo: string, comentario: string): Promise<TareaActionResult> {
  const profile = await requireAdminOrSupervisor();

  const esResolver = tipo === "resolver";
  const motivoFinal: MotivoCierreTarea | null = esResolver ? "resuelta_aparte" : (MOTIVOS_BAJA.find((m) => m === motivo) ?? null);
  if (!motivoFinal) return { success: false, error: "Elegí el motivo de la baja." };

  const supabase = await createClient();
  // .eq("estado", "abierta"): si otra persona la cerró en el medio, no se pisa su cierre.
  const { data, error } = await supabase
    .from("tareas_pendientes")
    .update({
      estado: esResolver ? "resuelta" : "descartada",
      motivo_cierre: motivoFinal,
      comentario_cierre: comentario.trim() || null,
      cerrada_at: new Date().toISOString(),
      cerrada_por: profile.id,
    })
    .eq("id", id)
    .eq("estado", "abierta")
    .select("id, texto");
  if (error) return { success: false, error: error.message };
  if (!data || data.length === 0) return { success: false, error: "La tarea ya no está abierta (¿la cerró otra persona?)." };

  await logAudit(supabase, profile, `${esResolver ? "Resolvió" : "Dio de baja"} una tarea pendiente: "${resumen(data[0].texto)}"`);
  revalidatePath("/panel/tareas");
  return { success: true };
}

/** Vuelve a abrir una tarea cerrada (por error, o porque el problema volvió). */
export async function reabrirTareaAction(id: string): Promise<TareaActionResult> {
  const profile = await requireAdminOrSupervisor();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tareas_pendientes")
    .update({ estado: "abierta", motivo_cierre: null, comentario_cierre: null, cerrada_at: null, cerrada_por: null })
    .eq("id", id)
    .neq("estado", "abierta")
    .select("id, texto");
  if (error) return { success: false, error: error.message };
  if (!data || data.length === 0) return { success: false, error: "La tarea ya estaba abierta." };

  await logAudit(supabase, profile, `Reabrió una tarea pendiente: "${resumen(data[0].texto)}"`);
  revalidatePath("/panel/tareas");
  return { success: true };
}
