import type { createClient } from "@/lib/supabase/server";

export interface UsoIaPorModulo {
  modulo: string;
  llamadas: number;
  inputTokens: number;
  outputTokens: number;
  costoUsd: number;
}

export interface ResumenUsoIa {
  costoHoyUsd: number;
  costoUltimos7DiasUsd: number;
  costoUltimos30DiasUsd: number;
  llamadasUltimos30Dias: number;
  porModulo: UsoIaPorModulo[];
}

const PAGE_SIZE = 1000;

/** Trae todas las filas de `ia_uso` desde una fecha — paginado, nunca un `.select()` suelto (ver CRITERIOS_Y_IDEAS.md). */
async function fetchUsoDesde(supabase: Awaited<ReturnType<typeof createClient>>, desdeIso: string) {
  const filas: { modulo: string; input_tokens: number; output_tokens: number; costo_estimado_usd: number; created_at: string }[] = [];
  let desde = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("ia_uso")
      .select("modulo, input_tokens, output_tokens, costo_estimado_usd, created_at")
      .gte("created_at", desdeIso)
      .order("created_at", { ascending: false })
      .range(desde, desde + PAGE_SIZE - 1);
    if (error || !data) break;
    filas.push(...data);
    if (data.length < PAGE_SIZE) break;
    desde += PAGE_SIZE;
  }
  return filas;
}

/**
 * Resumen de gasto ESTIMADO de IA para Configuración → Uso de IA — a partir
 * del consumo real (`response.usage`) de cada llamada, nunca inventado. El
 * gasto exacto siempre está en console.anthropic.com → Usage and Cost; esto
 * es para ver la tendencia y qué módulo pesa más sin salir de la app.
 */
export async function getResumenUsoIa(supabase: Awaited<ReturnType<typeof createClient>>): Promise<ResumenUsoIa> {
  const hoy = new Date();
  const hace30Dias = new Date(hoy);
  hace30Dias.setDate(hace30Dias.getDate() - 30);
  const hace7Dias = new Date(hoy);
  hace7Dias.setDate(hace7Dias.getDate() - 7);
  const inicioHoy = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());

  const filas = await fetchUsoDesde(supabase, hace30Dias.toISOString());

  let costoHoyUsd = 0;
  let costoUltimos7DiasUsd = 0;
  let costoUltimos30DiasUsd = 0;
  const porModuloMap = new Map<string, UsoIaPorModulo>();

  for (const f of filas) {
    const fecha = new Date(f.created_at);
    costoUltimos30DiasUsd += f.costo_estimado_usd;
    if (fecha >= hace7Dias) costoUltimos7DiasUsd += f.costo_estimado_usd;
    if (fecha >= inicioHoy) costoHoyUsd += f.costo_estimado_usd;

    const actual = porModuloMap.get(f.modulo) ?? { modulo: f.modulo, llamadas: 0, inputTokens: 0, outputTokens: 0, costoUsd: 0 };
    actual.llamadas += 1;
    actual.inputTokens += f.input_tokens;
    actual.outputTokens += f.output_tokens;
    actual.costoUsd += f.costo_estimado_usd;
    porModuloMap.set(f.modulo, actual);
  }

  return {
    costoHoyUsd,
    costoUltimos7DiasUsd,
    costoUltimos30DiasUsd,
    llamadasUltimos30Dias: filas.length,
    porModulo: [...porModuloMap.values()].sort((a, b) => b.costoUsd - a.costoUsd),
  };
}
