"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdminOrSupervisor } from "@/lib/auth";
import type { OrigenFeriadoGuardia } from "@/lib/database.types";

export interface AccionResult {
  success: boolean;
  error?: string;
}

/** Marcar un feriado (HANDOFF §10) — desde el Calendario de oficina. Solo los marcados afectan el cálculo de activaciones. */
export async function marcarFeriadoAction(fecha: string, nombre: string, origen: OrigenFeriadoGuardia): Promise<AccionResult> {
  const profile = await requireAdminOrSupervisor();
  const supabase = await createClient();

  const { error } = await supabase.from("guardia_feriado").upsert({ fecha, nombre, origen, marcado_por: profile.id, marcado_at: new Date().toISOString() });
  if (error) return { success: false, error: error.message };

  await supabase.from("guardia_feriado_hist").insert({ fecha, accion: "marcado", quien: profile.id });
  revalidatePath("/panel/guardia/calendario");
  return { success: true };
}

export async function desmarcarFeriadoAction(fecha: string): Promise<AccionResult> {
  const profile = await requireAdminOrSupervisor();
  const supabase = await createClient();

  const { error } = await supabase.from("guardia_feriado").delete().eq("fecha", fecha);
  if (error) return { success: false, error: error.message };

  await supabase.from("guardia_feriado_hist").insert({ fecha, accion: "desmarcado", quien: profile.id });
  revalidatePath("/panel/guardia/calendario");
  return { success: true };
}

/** "Marcar los N sin marcar" del calendario nacional precargado — una fila de historial por cada uno. */
export async function marcarVariosFeriadosAction(fechas: { fecha: string; nombre: string }[]): Promise<AccionResult> {
  const profile = await requireAdminOrSupervisor();
  if (fechas.length === 0) return { success: true };
  const supabase = await createClient();

  const ahora = new Date().toISOString();
  const { error } = await supabase
    .from("guardia_feriado")
    .upsert(fechas.map((f) => ({ fecha: f.fecha, nombre: f.nombre, origen: "NACIONAL" as const, marcado_por: profile.id, marcado_at: ahora })));
  if (error) return { success: false, error: error.message };

  await supabase.from("guardia_feriado_hist").insert(fechas.map((f) => ({ fecha: f.fecha, accion: "marcado" as const, quien: profile.id })));
  revalidatePath("/panel/guardia/calendario");
  return { success: true };
}
