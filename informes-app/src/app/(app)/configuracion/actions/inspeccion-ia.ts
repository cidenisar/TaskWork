"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { logAudit } from "@/lib/config/audit";
import type { ModuloInspeccionIa } from "@/lib/database.types";
import type { ConfigActionResult } from "./empresa";

const RUTA_NUEVO_POR_MODULO: Record<ModuloInspeccionIa, string> = {
  tableros: "/tableros/nuevo",
  racks: "/racks/nuevo",
  equipos: "/equipos/nuevo",
  torres: "/torres-comunicacion/nuevo",
  vehiculos: "/panel/vehiculos/nuevo",
  informe_tecnico: "/informe-tecnico/nuevo",
};

function revalidateAll(modulo: ModuloInspeccionIa) {
  revalidatePath(RUTA_NUEVO_POR_MODULO[modulo]);
  revalidatePath("/configuracion/catalogos");
}

export async function agregarItemInspeccionIaAction(modulo: ModuloInspeccionIa, texto: string): Promise<ConfigActionResult> {
  const profile = await requireAdmin();
  if (!texto.trim()) return { success: false, error: "Falta el texto del ítem." };

  const supabase = await createClient();
  const { count } = await supabase
    .from("catalogo_inspeccion_ia")
    .select("id", { count: "exact", head: true })
    .eq("modulo", modulo);

  const { error } = await supabase.from("catalogo_inspeccion_ia").insert({
    modulo,
    orden: (count ?? 0) + 1,
    texto: texto.trim(),
    created_by: profile.id,
  });
  if (error) return { success: false, error: error.message };

  await logAudit(supabase, profile, `Agregó un ítem de Inspección IA (${modulo}) al catálogo: "${texto.trim()}"`);
  revalidateAll(modulo);
  return { success: true };
}

export async function quitarItemInspeccionIaAction(modulo: ModuloInspeccionIa, id: string): Promise<ConfigActionResult> {
  const profile = await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("catalogo_inspeccion_ia").delete().eq("id", id);
  if (error) return { success: false, error: error.message };

  await logAudit(supabase, profile, `Eliminó un ítem de Inspección IA (${modulo}) del catálogo`);
  revalidateAll(modulo);
  return { success: true };
}
