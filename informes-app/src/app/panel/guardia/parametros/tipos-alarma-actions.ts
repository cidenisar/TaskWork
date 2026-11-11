"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdminOrSupervisor } from "@/lib/auth";
import type { AccionResult } from "./actions";

/**
 * Catálogo editable de "tipo de alarma" (`guardia_tipo_alarma`) — pedido de
 * Ivan: agregar/quitar categorías sin tocar código. `guardia_evento.tipo_alarma`
 * sigue siendo texto libre a propósito, así que "quitar" es desactivar
 * (`activo = false`), nunca borrar: un evento ya registrado con ese tipo no
 * se tiene que romper.
 */
export async function agregarTipoAlarmaAction(nombre: string): Promise<AccionResult> {
  await requireAdminOrSupervisor();
  const limpio = nombre.trim();
  if (!limpio) return { success: false, error: "Falta el nombre." };

  const supabase = await createClient();
  const { error } = await supabase.from("guardia_tipo_alarma").insert({ nombre: limpio });
  if (error) {
    if (error.code === "23505") return { success: false, error: "Ya existe un tipo con ese nombre." };
    return { success: false, error: error.message };
  }

  revalidatePath("/panel/guardia/parametros");
  return { success: true };
}

export async function toggleTipoAlarmaActivoAction(id: string, activo: boolean): Promise<AccionResult> {
  await requireAdminOrSupervisor();
  const supabase = await createClient();
  const { error } = await supabase.from("guardia_tipo_alarma").update({ activo }).eq("id", id);
  if (error) return { success: false, error: error.message };

  revalidatePath("/panel/guardia/parametros");
  return { success: true };
}
