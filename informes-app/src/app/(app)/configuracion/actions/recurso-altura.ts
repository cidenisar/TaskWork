"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { logAudit } from "@/lib/config/audit";
import { TIPO_MONTAJE_LABEL, RECURSO_ALTURA_LABEL } from "@/lib/equipos/recurso-altura";
import type { ConfigActionResult } from "./empresa";
import type { TipoMontajeCamara, RecursoAlturaMantenimiento } from "@/lib/database.types";

function revalidateAll() {
  revalidatePath("/configuracion/catalogos");
  revalidatePath("/equipos/nuevo");
  revalidatePath("/panel/mantenimientos");
}

/**
 * Qué recurso hace falta para el mantenimiento de una cámara/domo según
 * dónde está montada — "recursoFijo" (ej. torre -> grupo de altura) ignora
 * la altura; sin recursoFijo, se decide por "umbralEscaleraM". Upsert por
 * tipo_montaje (fila fija, 6 tipos — igual criterio que mantenimiento_
 * intervalos: tabla editable en el lugar, no agregar/quitar).
 */
export async function guardarRecursoAlturaAction(
  tipoMontaje: TipoMontajeCamara,
  recursoFijo: RecursoAlturaMantenimiento | "",
  umbralEscaleraM: string,
): Promise<ConfigActionResult> {
  const profile = await requireAdmin();

  const umbral = umbralEscaleraM.trim() === "" ? null : Number(umbralEscaleraM);
  if (umbral !== null && (!Number.isFinite(umbral) || umbral <= 0)) {
    return { success: false, error: "El umbral tiene que ser un número mayor a 0." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("catalogo_recurso_altura").upsert(
    {
      tipo_montaje: tipoMontaje,
      recurso_fijo: recursoFijo || null,
      umbral_escalera_m: recursoFijo ? null : umbral,
      updated_by: profile.id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "tipo_montaje" },
  );
  if (error) return { success: false, error: error.message };

  const detalle = recursoFijo
    ? `siempre ${RECURSO_ALTURA_LABEL[recursoFijo]}`
    : umbral != null
      ? `hasta ${umbral}m Escalera, más alto Andamio/Manlift`
      : "sin regla";
  await logAudit(supabase, profile, `Configuró el recurso de altura para montaje en ${TIPO_MONTAJE_LABEL[tipoMontaje]}: ${detalle}`);
  revalidateAll();
  return { success: true };
}
