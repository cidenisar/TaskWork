"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdminOrSupervisor } from "@/lib/auth";
import type { GuardiaConfigRow } from "@/lib/database.types";

export interface AccionResult {
  success: boolean;
  error?: string;
}

/** Los únicos campos editables de `guardia_config` — todo lo demás de la fila (id, updated_at) no se toca desde acá. */
type CampoParametro = Exclude<keyof GuardiaConfigRow, "id" | "updated_at">;

const ETIQUETA: Record<CampoParametro, string> = {
  entrada_min: "Entrada (día hábil)",
  salida_activacion_min: "Salida / activación",
  madrugada_hasta_min: "Madrugada hasta",
  tope_media_min: "Tope de media activación",
  valor_media: "Valor de media activación",
  valor_entera: "Valor de activación entera",
  cambio_min: "Hora de cambio de guardia",
  periodo_desde: "Inicio del período de liquidación",
  periodo_hasta: "Fin del período de liquidación",
  grupo_whatsapp_nombre: "Grupo de WhatsApp de novedades",
};

/**
 * Editar UN parámetro de negocio de Guardia General (HANDOFF §8): "un
 * cambio vale hacia adelante y nunca mueve un período ya cerrado" — hoy
 * todavía no existe la clausura de períodos (Fase 6), así que esa parte de
 * la regla no tiene nada que verificar aún; cuando se construya
 * `guardia_periodo_cierre`, este action es el lugar donde hay que
 * bloquear la edición de `periodo_desde`/`periodo_hasta` si el período
 * vigente ya está cerrado.
 */
const CAMPOS_MINUTOS_DEL_DIA: CampoParametro[] = ["entrada_min", "salida_activacion_min", "madrugada_hasta_min", "tope_media_min", "cambio_min"];
const CAMPOS_CENTESIMAS: CampoParametro[] = ["valor_media", "valor_entera"];

export async function guardarParametroGuardiaAction(campo: CampoParametro, valorNuevo: GuardiaConfigRow[CampoParametro]): Promise<AccionResult> {
  const profile = await requireAdminOrSupervisor();

  if (CAMPOS_MINUTOS_DEL_DIA.includes(campo)) {
    const n = valorNuevo as number;
    if (!Number.isInteger(n) || n < 0 || n > 1439) return { success: false, error: "Tiene que ser una hora válida del día." };
  }
  if (CAMPOS_CENTESIMAS.includes(campo)) {
    const n = valorNuevo as number;
    if (!Number.isInteger(n) || n <= 0) return { success: false, error: "Tiene que ser un número entero mayor que cero." };
  }
  if (campo === "grupo_whatsapp_nombre" && !(valorNuevo as string).trim()) {
    return { success: false, error: "Falta el nombre del grupo." };
  }

  const supabase = await createClient();
  const { data: actual } = await supabase.from("guardia_config").select(campo).eq("id", 1).single();
  const valorAnterior = actual?.[campo as keyof typeof actual];
  if (String(valorAnterior) === String(valorNuevo)) return { success: true };

  if (campo === "periodo_desde" || campo === "periodo_hasta") {
    const { data: periodo } = await supabase.from("guardia_config").select("periodo_desde, periodo_hasta").eq("id", 1).single();
    const desde = campo === "periodo_desde" ? (valorNuevo as string) : periodo?.periodo_desde;
    const hasta = campo === "periodo_hasta" ? (valorNuevo as string) : periodo?.periodo_hasta;
    if (desde && hasta && hasta < desde) return { success: false, error: "El fin del período no puede ser antes del inicio." };
  }

  // El cast es honesto: `campo` es una de las claves editables de GuardiaConfigRow (el tipo
  // de la función lo garantiza) y `valorNuevo` ya viene tipado como esa misma clave — lo que
  // TS no puede verificar es la unión dinámica `{ [campo]: ... }` contra el tipo de Update.
  const update = { [campo]: valorNuevo, updated_at: new Date().toISOString() } as Partial<GuardiaConfigRow>;
  const { error } = await supabase.from("guardia_config").update(update).eq("id", 1);
  if (error) return { success: false, error: error.message };

  await supabase.from("guardia_config_hist").insert({
    campo: ETIQUETA[campo],
    antes: valorAnterior === null || valorAnterior === undefined ? null : String(valorAnterior),
    despues: String(valorNuevo),
    quien: profile.id,
  });

  revalidatePath("/panel/guardia/parametros");
  return { success: true };
}
