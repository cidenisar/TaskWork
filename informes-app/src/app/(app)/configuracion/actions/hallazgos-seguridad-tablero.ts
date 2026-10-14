"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { logAudit } from "@/lib/config/audit";
import type { ConfigActionResult } from "./empresa";

function revalidateAll() {
  revalidatePath("/tableros/nuevo");
  revalidatePath("/configuracion/catalogos");
}

export async function agregarHallazgoSeguridadAction(texto: string): Promise<ConfigActionResult> {
  const profile = await requireAdmin();
  if (!texto.trim()) return { success: false, error: "Falta el texto del hallazgo." };

  const supabase = await createClient();
  const { count } = await supabase.from("catalogo_hallazgos_seguridad_tablero").select("id", { count: "exact", head: true });

  const { error } = await supabase.from("catalogo_hallazgos_seguridad_tablero").insert({
    orden: (count ?? 0) + 1,
    texto: texto.trim(),
    created_by: profile.id,
  });
  if (error) return { success: false, error: error.message };

  await logAudit(supabase, profile, `Agregó un hallazgo de seguridad de tablero al catálogo: "${texto.trim()}"`);
  revalidateAll();
  return { success: true };
}

export async function quitarHallazgoSeguridadAction(id: string): Promise<ConfigActionResult> {
  const profile = await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("catalogo_hallazgos_seguridad_tablero").delete().eq("id", id);
  if (error) return { success: false, error: error.message };

  await logAudit(supabase, profile, "Eliminó un hallazgo de seguridad de tablero del catálogo");
  revalidateAll();
  return { success: true };
}
