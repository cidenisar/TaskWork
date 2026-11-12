"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { logAudit } from "@/lib/config/audit";
import type { ConfigActionResult } from "./empresa";

/**
 * Supuestos para `lib/panel/mantenimiento-dotacion.ts` (estimación de
 * cuántos técnicos hacen falta para cumplir el Plan de Mantenimiento) —
 * valores reales que carga un Admin, nunca inventados por la IA.
 */
export async function guardarSupuestosDotacionAction(payload: {
  horasPorDia: string;
  diasHabilesAnio: string;
  horasPorVisita: string;
  velocidadKmh: string;
}): Promise<ConfigActionResult> {
  const profile = await requireAdmin();
  const horasPorDia = Number(payload.horasPorDia);
  const diasHabilesAnio = Number(payload.diasHabilesAnio);
  const horasPorVisita = Number(payload.horasPorVisita);
  const velocidadKmh = Number(payload.velocidadKmh);
  if (
    !Number.isFinite(horasPorDia) || horasPorDia <= 0 ||
    !Number.isFinite(diasHabilesAnio) || diasHabilesAnio <= 0 ||
    !Number.isFinite(horasPorVisita) || horasPorVisita <= 0 ||
    !Number.isFinite(velocidadKmh) || velocidadKmh <= 0
  ) {
    return { success: false, error: "Todos los valores tienen que ser números mayores a 0." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("config_general")
    .update({
      pdm_horas_por_dia: horasPorDia,
      pdm_dias_habiles_anio: Math.round(diasHabilesAnio),
      pdm_horas_por_visita: horasPorVisita,
      pdm_velocidad_kmh: velocidadKmh,
    })
    .eq("id", 1);
  if (error) return { success: false, error: error.message };

  await logAudit(supabase, profile, "Actualizó los supuestos de estimación de dotación del Plan de Mantenimiento");
  revalidatePath("/configuracion");
  revalidatePath("/panel/mantenimientos");
  return { success: true };
}
