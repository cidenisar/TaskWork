"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdminOrSupervisor } from "@/lib/auth";
import { cargarPeriodoVigente, cargarParametros, calcularLiquidacion } from "@/lib/guardia/datos";
import { inicioSemana, finSemana } from "@/lib/guardia/cronograma";
import { horaGuardiaIso } from "@/lib/guardia/reloj";

export interface AccionResult {
  success: boolean;
  error?: string;
}

/**
 * Cierre de período (HANDOFF §8/§11, Fase 6) — guarda una FOTO fija
 * (parámetros + resultado, tal como estaban en este instante) en
 * `guardia_periodo_cierre`, tabla pensada para nunca tener UPDATE ni
 * DELETE. Lo que se calculó y se guardó acá no se vuelve a tocar aunque
 * después cambien los parámetros o se agregue/corrija una participación
 * — es la razón de ser de la foto.
 */
export async function cerrarPeriodoAction(): Promise<AccionResult> {
  const profile = await requireAdminOrSupervisor();
  const supabase = await createClient();

  const periodo = await cargarPeriodoVigente(supabase);
  if (!periodo.desde || !periodo.hasta) return { success: false, error: "Falta configurar el período en Parámetros." };

  const { data: yaCerrado } = await supabase
    .from("guardia_periodo_cierre")
    .select("id")
    .eq("tipo", "global")
    .eq("desde", periodo.desde)
    .eq("hasta", periodo.hasta)
    .maybeSingle();
  if (yaCerrado) return { success: true }; // ya estaba cerrado — idempotente

  const [parametros, filas] = await Promise.all([cargarParametros(supabase), calcularLiquidacion(supabase, periodo.desde, periodo.hasta)]);

  const { error } = await supabase.from("guardia_periodo_cierre").insert({
    tipo: "global",
    desde: periodo.desde,
    hasta: periodo.hasta,
    cerrado_por: profile.id,
    parametros_json: parametros,
    resultado_json: filas,
  });
  if (error) return { success: false, error: error.message };

  revalidatePath("/panel/guardia/liquidacion");
  return { success: true };
}

/**
 * Cierre de UNA semana de guardia (miércoles a martes) — mismo mecanismo
 * de foto fija que el cierre de período, pero pedido para poder liquidar
 * semana por semana a medida que terminan, antes del cierre global más
 * grande. Nunca se puede cerrar la semana en curso ni una futura.
 */
export async function cerrarSemanaAction(semanaInicio: string): Promise<AccionResult> {
  const profile = await requireAdminOrSupervisor();
  const supabase = await createClient();

  const parametros = await cargarParametros(supabase);
  const semanaActual = inicioSemana(horaGuardiaIso(), parametros.cambioMin);
  if (semanaInicio >= semanaActual) return { success: false, error: "Esa semana todavía no terminó." };

  const semanaFin = finSemana(semanaInicio);
  const { data: yaCerrada } = await supabase
    .from("guardia_periodo_cierre")
    .select("id")
    .eq("tipo", "semanal")
    .eq("desde", semanaInicio)
    .maybeSingle();
  if (yaCerrada) return { success: true }; // ya estaba cerrada — idempotente

  const filas = await calcularLiquidacion(supabase, semanaInicio, semanaFin);

  const { error } = await supabase.from("guardia_periodo_cierre").insert({
    tipo: "semanal",
    desde: semanaInicio,
    hasta: semanaFin,
    cerrado_por: profile.id,
    parametros_json: parametros,
    resultado_json: filas,
  });
  if (error) return { success: false, error: error.message };

  revalidatePath("/panel/guardia/liquidacion");
  return { success: true };
}
