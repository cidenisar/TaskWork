"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { logAudit } from "@/lib/config/audit";
import { labelCategoriaMantenimiento, TIPO_EQUIPO_MANTENIMIENTO_LABEL } from "@/lib/mantenimiento/types";
import type { ConfigActionResult } from "./empresa";
import type { TipoEquipoBaja } from "@/lib/database.types";

function revalidateAll() {
  revalidatePath("/ubicaciones/[id]", "page");
  revalidatePath("/panel/mantenimientos");
}

export async function agregarChecklistItemAction(tipoEquipo: TipoEquipoBaja, categoria: string, texto: string): Promise<ConfigActionResult> {
  const profile = await requireAdmin();
  if (!texto.trim()) return { success: false, error: "Falta el texto del ítem." };

  const supabase = await createClient();
  const { count } = await supabase
    .from("mantenimiento_checklist_items")
    .select("id", { count: "exact", head: true })
    .eq("tipo_equipo", tipoEquipo)
    .eq("categoria", categoria);

  const { error } = await supabase.from("mantenimiento_checklist_items").insert({
    tipo_equipo: tipoEquipo,
    categoria,
    orden: (count ?? 0) + 1,
    texto: texto.trim(),
    created_by: profile.id,
  });
  if (error) return { success: false, error: error.message };

  await logAudit(
    supabase,
    profile,
    `Agregó un ítem de checklist a ${TIPO_EQUIPO_MANTENIMIENTO_LABEL[tipoEquipo]} / ${labelCategoriaMantenimiento(tipoEquipo, categoria)}`,
  );
  revalidateAll();
  return { success: true };
}

export async function quitarChecklistItemAction(id: string): Promise<ConfigActionResult> {
  const profile = await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("mantenimiento_checklist_items").delete().eq("id", id);
  if (error) return { success: false, error: error.message };

  await logAudit(supabase, profile, "Eliminó un ítem de checklist de mantenimiento");
  revalidateAll();
  return { success: true };
}
