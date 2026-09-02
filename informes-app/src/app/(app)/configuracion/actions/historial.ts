"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { logAudit } from "@/lib/config/audit";
import type { UmbralAviso } from "@/lib/database.types";
import type { ConfigActionResult } from "./empresa";

const UMBRAL_LABEL: Record<UmbralAviso, string> = {
  "20": "20 informes / 4 semanas",
  "50": "50 informes / 8 semanas",
  "100": "100 informes / 12 semanas",
};

export async function setUmbralAvisoAction(umbral: UmbralAviso): Promise<ConfigActionResult> {
  const profile = await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("config_general").update({ umbral_aviso_historial: umbral }).eq("id", 1);
  if (error) return { success: false, error: error.message };
  await logAudit(supabase, profile, `Cambió el umbral de aviso de historial a ${UMBRAL_LABEL[umbral]}`);
  revalidatePath("/configuracion");
  return { success: true };
}

export async function setRecordatorioSemanalAction(activo: boolean): Promise<ConfigActionResult> {
  const profile = await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("config_general").update({ recordatorio_semanal_archivo: activo }).eq("id", 1);
  if (error) return { success: false, error: error.message };
  await logAudit(supabase, profile, `${activo ? "Activó" : "Desactivó"} el recordatorio semanal de archivo`);
  revalidatePath("/configuracion");
  return { success: true };
}

export async function setResumenSemanalIaAction(activo: boolean): Promise<ConfigActionResult> {
  const profile = await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("config_general").update({ resumen_semanal_ia: activo }).eq("id", 1);
  if (error) return { success: false, error: error.message };
  await logAudit(supabase, profile, `${activo ? "Activó" : "Desactivó"} el resumen semanal por IA`);
  revalidatePath("/configuracion");
  return { success: true };
}
