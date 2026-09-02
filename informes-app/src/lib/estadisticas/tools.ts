import type { createClient } from "@/lib/supabase/server";
import type Anthropic from "@anthropic-ai/sdk";
import { addMonths, inRange, toIsoDate } from "./dates";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/**
 * Asistente en lenguaje natural (spec sección 8.5 / 10 #6): herramientas de
 * solo lectura que ejecutan consultas agregadas reales — nunca acceso de
 * escritura, y nunca devuelven filas crudas más allá de lo ya agregado.
 */

function rangoDelMes(mes?: number, anio?: number): { desde: string; hastaExcl: string; label: string } {
  const hoy = new Date();
  const base = new Date(anio ?? hoy.getFullYear(), (mes ?? hoy.getMonth() + 1) - 1, 1);
  const desde = new Date(base.getFullYear(), base.getMonth(), 1);
  const hastaExcl = addMonths(desde, 1);
  return {
    desde: toIsoDate(desde),
    hastaExcl: toIsoDate(hastaExcl),
    label: desde.toLocaleDateString("es-AR", { month: "long", year: "numeric" }),
  };
}

async function gastosPorCategoria(supabase: Supabase, args: { mes?: number; anio?: number }) {
  const { desde, hastaExcl, label } = rangoDelMes(args.mes, args.anio);
  const [{ data: gastos }, { data: rendiciones }] = await Promise.all([
    supabase.from("gastos").select("rendicion_id, fecha, categoria, monto"),
    supabase.from("rendiciones_gastos").select("id, moneda"),
  ]);
  const monedaPorRendicion = new Map((rendiciones ?? []).map((r) => [r.id, r.moneda]));
  const totales = new Map<string, number>();
  for (const g of gastos ?? []) {
    if (!inRange(g.fecha, desde, hastaExcl)) continue;
    if (monedaPorRendicion.get(g.rendicion_id) !== "ARS") continue;
    totales.set(g.categoria, (totales.get(g.categoria) ?? 0) + Number(g.monto));
  }
  return {
    periodo: label,
    moneda: "ARS",
    categorias: Array.from(totales.entries())
      .map(([categoria, monto]) => ({ categoria, monto }))
      .sort((a, b) => b.monto - a.monto),
  };
}

async function informesPorTecnico(supabase: Supabase, args: { mes?: number; anio?: number }) {
  const { desde, hastaExcl, label } = rangoDelMes(args.mes, args.anio);
  const { data: informes } = await supabase.from("informes_tecnicos").select("id, fecha").gte("fecha", desde).lt("fecha", hastaExcl);
  const ids = (informes ?? []).map((i) => i.id);
  if (ids.length === 0) return { periodo: label, tecnicos: [] };
  const { data: asignados } = await supabase.from("informe_tecnicos_asignados").select("informe_id, tecnico_nombre").in("informe_id", ids);
  const totales = new Map<string, number>();
  for (const a of asignados ?? []) totales.set(a.tecnico_nombre, (totales.get(a.tecnico_nombre) ?? 0) + 1);
  return {
    periodo: label,
    tecnicos: Array.from(totales.entries())
      .map(([tecnico, cantidad]) => ({ tecnico, cantidad }))
      .sort((a, b) => b.cantidad - a.cantidad),
  };
}

async function rendicionesSinCerrar(supabase: Supabase) {
  const hoy = toIsoDate(new Date());
  const { data } = await supabase.from("rendiciones_gastos").select("numero_generacion, fecha, motivo").eq("estado", "abierta");
  return {
    cantidad: data?.length ?? 0,
    detalle: (data ?? []).map((r) => ({
      numeroGeneracion: r.numero_generacion,
      motivo: r.motivo,
      diasAbierta: Math.round(Math.abs((new Date(hoy).getTime() - new Date(r.fecha).getTime()) / 86_400_000)),
    })),
  };
}

async function totalesGenerales(supabase: Supabase, args: { mes?: number; anio?: number }) {
  const { desde, hastaExcl, label } = rangoDelMes(args.mes, args.anio);
  const [{ data: informes }, { data: gastos }, { data: rendiciones }] = await Promise.all([
    supabase.from("informes_tecnicos").select("id").gte("fecha", desde).lt("fecha", hastaExcl),
    supabase.from("gastos").select("rendicion_id, fecha, monto"),
    supabase.from("rendiciones_gastos").select("id, moneda"),
  ]);
  const monedaPorRendicion = new Map((rendiciones ?? []).map((r) => [r.id, r.moneda]));
  let gastoArs = 0;
  let gastoUsd = 0;
  for (const g of gastos ?? []) {
    if (!inRange(g.fecha, desde, hastaExcl)) continue;
    if (monedaPorRendicion.get(g.rendicion_id) === "USD") gastoUsd += Number(g.monto);
    else gastoArs += Number(g.monto);
  }
  return { periodo: label, cantidadInformes: informes?.length ?? 0, gastoArs, gastoUsd };
}

export const ESTADISTICAS_TOOLS: Anthropic.Tool[] = [
  {
    name: "gastos_por_categoria",
    description: "Devuelve el total gastado (en ARS) por categoría de gasto en un mes dado. Si no se especifica mes/año, usa el mes actual.",
    input_schema: {
      type: "object",
      properties: {
        mes: { type: "number", description: "Mes (1-12). Opcional, default: mes actual." },
        anio: { type: "number", description: "Año de 4 dígitos. Opcional, default: año actual." },
      },
    },
  },
  {
    name: "informes_por_tecnico",
    description: "Devuelve la cantidad de informes técnicos generados por cada técnico en un mes dado. Si no se especifica mes/año, usa el mes actual.",
    input_schema: {
      type: "object",
      properties: {
        mes: { type: "number", description: "Mes (1-12). Opcional, default: mes actual." },
        anio: { type: "number", description: "Año de 4 dígitos. Opcional, default: año actual." },
      },
    },
  },
  {
    name: "rendiciones_sin_cerrar",
    description: "Devuelve la cantidad y el detalle de rendiciones de gastos que todavía están abiertas (no cerradas), con hace cuántos días.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "totales_generales",
    description: "Devuelve la cantidad de informes y el total gastado (ARS y USD por separado) en un mes dado. Si no se especifica mes/año, usa el mes actual.",
    input_schema: {
      type: "object",
      properties: {
        mes: { type: "number", description: "Mes (1-12). Opcional, default: mes actual." },
        anio: { type: "number", description: "Año de 4 dígitos. Opcional, default: año actual." },
      },
    },
  },
];

export async function ejecutarHerramienta(supabase: Supabase, nombre: string, input: Record<string, unknown>): Promise<unknown> {
  const args = { mes: typeof input.mes === "number" ? input.mes : undefined, anio: typeof input.anio === "number" ? input.anio : undefined };
  switch (nombre) {
    case "gastos_por_categoria":
      return gastosPorCategoria(supabase, args);
    case "informes_por_tecnico":
      return informesPorTecnico(supabase, args);
    case "rendiciones_sin_cerrar":
      return rendicionesSinCerrar(supabase);
    case "totales_generales":
      return totalesGenerales(supabase, args);
    default:
      return { error: `Herramienta desconocida: ${nombre}` };
  }
}
