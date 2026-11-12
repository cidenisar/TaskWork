"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { logAudit } from "@/lib/config/audit";
import type { ConfigActionResult } from "./empresa";

function revalidateAll() {
  revalidatePath("/configuracion/catalogos");
  revalidatePath("/ubicaciones/[id]", "page");
}

function parseNum(v: string): number | null {
  const n = Number(v.replace(",", "."));
  return v.trim() !== "" && Number.isFinite(n) && n > 0 ? n : null;
}

export async function agregarCalibreCableAction(amperajeMax: string, calibreMm2: string): Promise<ConfigActionResult> {
  const profile = await requireAdmin();
  const amperaje = parseNum(amperajeMax);
  const calibre = parseNum(calibreMm2);
  if (!amperaje) return { success: false, error: "El amperaje tiene que ser un número mayor a 0." };
  if (!calibre) return { success: false, error: "El calibre (mm²) tiene que ser un número mayor a 0." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("catalogo_calibre_cable")
    .insert({ amperaje_max: amperaje, calibre_mm2: calibre, updated_by: profile.id });
  if (error) {
    if (error.code === "23505") return { success: false, error: "Ya hay una banda configurada con ese amperaje." };
    return { success: false, error: error.message };
  }

  await logAudit(supabase, profile, `Agregó una banda de calibre de cable (hasta ${amperaje}A → ${calibre}mm²)`);
  revalidateAll();
  return { success: true };
}

export async function quitarCalibreCableAction(id: string): Promise<ConfigActionResult> {
  const profile = await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("catalogo_calibre_cable").delete().eq("id", id);
  if (error) return { success: false, error: error.message };

  await logAudit(supabase, profile, "Eliminó una banda de calibre de cable");
  revalidateAll();
  return { success: true };
}
