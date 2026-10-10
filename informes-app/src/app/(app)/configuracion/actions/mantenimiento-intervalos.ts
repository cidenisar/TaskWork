"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { logAudit } from "@/lib/config/audit";
import { labelCategoriaMantenimiento, TIPO_EQUIPO_MANTENIMIENTO_LABEL } from "@/lib/mantenimiento/types";
import type { ConfigActionResult } from "./empresa";
import type { TipoEquipoBaja } from "@/lib/database.types";

function revalidateAll() {
  revalidatePath("/panel/mantenimientos");
}

/**
 * Tabla editable en el lugar (una fila por categoría) en vez de agregar/
 * quitar: upsert por (tipo_equipo, categoria) — vacío borra la fila
 * (vuelve a "sin intervalo configurado"), un número la crea o actualiza.
 */
export async function guardarIntervaloMantenimientoAction(
  tipoEquipo: TipoEquipoBaja,
  categoria: string,
  frecuenciaDias: string,
): Promise<ConfigActionResult> {
  const profile = await requireAdmin();

  if (frecuenciaDias.trim() === "") {
    const supabase = await createClient();
    const { error } = await supabase.from("mantenimiento_intervalos").delete().eq("tipo_equipo", tipoEquipo).eq("categoria", categoria);
    if (error) return { success: false, error: error.message };
    await logAudit(
      supabase,
      profile,
      `Quitó el intervalo de mantenimiento de ${TIPO_EQUIPO_MANTENIMIENTO_LABEL[tipoEquipo]} / ${labelCategoriaMantenimiento(tipoEquipo, categoria)}`,
    );
    revalidateAll();
    return { success: true };
  }

  const dias = Number(frecuenciaDias);
  if (!Number.isFinite(dias) || dias <= 0) return { success: false, error: "La frecuencia tiene que ser un número de días mayor a 0." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("mantenimiento_intervalos")
    .upsert(
      { tipo_equipo: tipoEquipo, categoria, frecuencia_dias: Math.round(dias), created_by: profile.id },
      { onConflict: "tipo_equipo,categoria" },
    );
  if (error) return { success: false, error: error.message };

  await logAudit(
    supabase,
    profile,
    `Configuró el intervalo de mantenimiento de ${TIPO_EQUIPO_MANTENIMIENTO_LABEL[tipoEquipo]} / ${labelCategoriaMantenimiento(tipoEquipo, categoria)}: cada ${Math.round(dias)} días`,
  );
  revalidateAll();
  return { success: true };
}
