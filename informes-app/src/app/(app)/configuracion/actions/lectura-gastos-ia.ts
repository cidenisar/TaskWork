"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { logAudit } from "@/lib/config/audit";
import type { ConfigActionResult } from "./empresa";

function revalidateAll() {
  revalidatePath("/rendicion-gastos/nueva");
  revalidatePath("/configuracion/catalogos");
}

export async function agregarItemLecturaGastosIaAction(texto: string): Promise<ConfigActionResult> {
  const profile = await requireAdmin();
  if (!texto.trim()) return { success: false, error: "Falta el texto de la instrucción." };

  const supabase = await createClient();
  const { count } = await supabase.from("catalogo_lectura_gastos_ia").select("id", { count: "exact", head: true });

  const { error } = await supabase.from("catalogo_lectura_gastos_ia").insert({
    orden: (count ?? 0) + 1,
    texto: texto.trim(),
    created_by: profile.id,
  });
  if (error) return { success: false, error: error.message };

  await logAudit(supabase, profile, `Agregó una instrucción de Lectura de Tickets IA al catálogo: "${texto.trim()}"`);
  revalidateAll();
  return { success: true };
}

export async function quitarItemLecturaGastosIaAction(id: string): Promise<ConfigActionResult> {
  const profile = await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("catalogo_lectura_gastos_ia").delete().eq("id", id);
  if (error) return { success: false, error: error.message };

  await logAudit(supabase, profile, "Eliminó una instrucción de Lectura de Tickets IA del catálogo");
  revalidateAll();
  return { success: true };
}
