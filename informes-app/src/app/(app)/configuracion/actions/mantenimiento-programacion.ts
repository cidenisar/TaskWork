"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { logAudit } from "@/lib/config/audit";
import { generarProgramacionAutomatica, type ResultadoProgramacionAutomatica } from "@/lib/mantenimiento/generar-programacion";

export interface GenerarProgramacionResult {
  success: boolean;
  error?: string;
  resultado?: ResultadoProgramacionAutomatica;
}

/**
 * Solo Admin — la programación la arma el sistema desde Configuración,
 * no cada técnico en el campo (ver `lib/mantenimiento/generar-
 * programacion.ts`). Se puede correr cuantas veces haga falta: siempre
 * reemplaza solo lo que generó ella misma la vez anterior, nunca una
 * programación cargada a mano.
 */
export async function generarProgramacionAutomaticaAction(): Promise<GenerarProgramacionResult> {
  const profile = await requireAdmin();
  const supabase = await createClient();

  const resultado = await generarProgramacionAutomatica(supabase, profile.id);

  await logAudit(
    supabase,
    profile,
    `Generó la programación automática de mantenimiento: ${resultado.sitiosProgramados} sitio(s), ${resultado.equiposProgramados} equipo(s)`,
  );
  revalidatePath("/ubicaciones/[id]", "page");
  revalidatePath("/panel/mantenimientos");
  return { success: true, resultado };
}
