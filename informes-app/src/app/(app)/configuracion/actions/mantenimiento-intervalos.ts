"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { logAudit } from "@/lib/config/audit";
import { labelCategoriaMantenimiento, TIPO_EQUIPO_MANTENIMIENTO_LABEL } from "@/lib/mantenimiento/types";
import type { ConfigActionResult } from "./empresa";
import type { TipoEquipoBaja } from "@/lib/database.types";

function revalidateAll() {
  revalidatePath("/configuracion");
  revalidatePath("/panel/mantenimientos");
}

export async function addIntervaloMantenimientoAction(
  tipoEquipo: TipoEquipoBaja,
  categoria: string,
  frecuenciaDias: string,
): Promise<ConfigActionResult> {
  const profile = await requireAdmin();
  const dias = Number(frecuenciaDias);
  if (!Number.isFinite(dias) || dias <= 0) return { success: false, error: "La frecuencia tiene que ser un número de días mayor a 0." };

  const supabase = await createClient();
  const { error } = await supabase.from("mantenimiento_intervalos").insert({
    tipo_equipo: tipoEquipo,
    categoria,
    frecuencia_dias: Math.round(dias),
    created_by: profile.id,
  });
  if (error) {
    return {
      success: false,
      error: error.code === "23505" ? "Ya hay un intervalo configurado para esa categoría." : error.message,
    };
  }

  await logAudit(
    supabase,
    profile,
    `Configuró el intervalo de mantenimiento de ${TIPO_EQUIPO_MANTENIMIENTO_LABEL[tipoEquipo]} / ${labelCategoriaMantenimiento(tipoEquipo, categoria)}: cada ${Math.round(dias)} días`,
  );
  revalidateAll();
  return { success: true };
}

export async function removeIntervaloMantenimientoAction(id: string): Promise<ConfigActionResult> {
  const profile = await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("mantenimiento_intervalos").delete().eq("id", id);
  if (error) return { success: false, error: error.message };

  await logAudit(supabase, profile, "Eliminó un intervalo de mantenimiento configurado");
  revalidateAll();
  return { success: true };
}
