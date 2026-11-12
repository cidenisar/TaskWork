"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { logAudit } from "@/lib/config/audit";
import { TIPO_TORRE_LABEL } from "@/components/torres-comunicacion/types";
import type { ConfigActionResult } from "./empresa";
import type { TorreTipo } from "@/lib/database.types";

/**
 * Largo de tramo (m) estándar por tipo de torre, usado para estimar la
 * altura de una torre de comunicaciones por conteo de tramos (IA cuenta,
 * este catálogo da el largo real — nunca inventado por la IA). "otro" no
 * se acepta acá: sin tipo identificado no hay largo estándar que aplicar.
 */
export async function guardarLargoTramoTorreAction(tipoTorre: TorreTipo, valor: string): Promise<ConfigActionResult> {
  const profile = await requireAdmin();
  if (tipoTorre === "otro") return { success: false, error: "Tipo inválido." };

  const supabase = await createClient();
  const largo = valor.trim() === "" ? null : Number(valor);

  if (largo === null) {
    const { error } = await supabase.from("torre_tipo_largos").delete().eq("tipo_torre", tipoTorre);
    if (error) return { success: false, error: error.message };
    await logAudit(supabase, profile, `Quitó el largo de tramo configurado para torres ${TIPO_TORRE_LABEL[tipoTorre]}`);
    revalidatePath("/configuracion");
    revalidatePath("/torres-comunicacion/nuevo");
    return { success: true };
  }

  if (!Number.isFinite(largo) || largo <= 0) {
    return { success: false, error: "El largo tiene que ser un número mayor a 0." };
  }

  const { error } = await supabase
    .from("torre_tipo_largos")
    .upsert({ tipo_torre: tipoTorre, largo_tramo_m: largo, updated_by: profile.id, updated_at: new Date().toISOString() });
  if (error) return { success: false, error: error.message };

  await logAudit(supabase, profile, `Configuró el largo de tramo de torres ${TIPO_TORRE_LABEL[tipoTorre]}: ${largo}m`);
  revalidatePath("/configuracion");
  revalidatePath("/torres-comunicacion/nuevo");
  return { success: true };
}
