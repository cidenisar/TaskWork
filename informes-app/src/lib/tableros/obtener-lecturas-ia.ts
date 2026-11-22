import type { createClient } from "@/lib/supabase/server";

/**
 * Fase 3 de lectura-fotos (ENCARGO.md): listado + costo por tablero/mes +
 * medida de acierto (% de campos que el técnico no tuvo que tocar) de las
 * lecturas "detalladas" de tablero con IA (ver tablero_lecturas_ia).
 */
export interface LecturaIaRow {
  id: string;
  fecha: string;
  tableroId: string | null;
  tableroDenominacion: string | null;
  tecnicoNombre: string | null;
  modelo: string;
  inputTokens: number;
  outputTokens: number;
  costoUsd: number;
  porcentajeAcierto: number | null;
}

export interface CostoPorTablero {
  tableroId: string;
  tableroDenominacion: string;
  costoUsd: number;
  lecturas: number;
}

export interface ResumenLecturasIa {
  costoMesActualUsd: number;
  lecturasMesActual: number;
  porcentajeAciertoPromedio: number | null;
  costoPorTablero: CostoPorTablero[];
  ultimasLecturas: LecturaIaRow[];
}

const PAGE_SIZE = 1000;

async function fetchLecturasDesde(supabase: Awaited<ReturnType<typeof createClient>>, desdeIso: string) {
  const filas: {
    id: string;
    tablero_id: string | null;
    modelo: string;
    input_tokens: number;
    output_tokens: number;
    costo_estimado_usd: number;
    porcentaje_acierto: number | null;
    created_by: string;
    created_at: string;
  }[] = [];
  let desde = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("tablero_lecturas_ia")
      .select("id, tablero_id, modelo, input_tokens, output_tokens, costo_estimado_usd, porcentaje_acierto, created_by, created_at")
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

export async function getResumenLecturasIa(supabase: Awaited<ReturnType<typeof createClient>>): Promise<ResumenLecturasIa> {
  const hoy = new Date();
  const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);

  const filas = await fetchLecturasDesde(supabase, inicioMes.toISOString());

  const tableroIds = [...new Set(filas.map((f) => f.tablero_id).filter((id): id is string => id != null))];
  const userIds = [...new Set(filas.map((f) => f.created_by))];
  const [tablerosRes, perfilesRes] = await Promise.all([
    tableroIds.length ? supabase.from("tableros").select("id, denominacion").in("id", tableroIds) : Promise.resolve({ data: [] }),
    userIds.length ? supabase.from("profiles").select("id, nombre_completo").in("id", userIds) : Promise.resolve({ data: [] }),
  ]);
  const denominacionPorTablero = new Map((tablerosRes.data ?? []).map((t) => [t.id, t.denominacion]));
  const nombrePorUsuario = new Map((perfilesRes.data ?? []).map((p) => [p.id, p.nombre_completo]));

  let costoMesActualUsd = 0;
  let sumaAcierto = 0;
  let cantidadConAcierto = 0;
  const costoPorTableroMap = new Map<string, CostoPorTablero>();

  const ultimasLecturas: LecturaIaRow[] = filas.map((f) => {
    costoMesActualUsd += f.costo_estimado_usd;
    if (f.porcentaje_acierto != null) {
      sumaAcierto += f.porcentaje_acierto;
      cantidadConAcierto++;
    }
    if (f.tablero_id) {
      const actual = costoPorTableroMap.get(f.tablero_id) ?? {
        tableroId: f.tablero_id,
        tableroDenominacion: denominacionPorTablero.get(f.tablero_id) ?? "(tablero eliminado)",
        costoUsd: 0,
        lecturas: 0,
      };
      actual.costoUsd += f.costo_estimado_usd;
      actual.lecturas += 1;
      costoPorTableroMap.set(f.tablero_id, actual);
    }
    return {
      id: f.id,
      fecha: f.created_at,
      tableroId: f.tablero_id,
      tableroDenominacion: f.tablero_id ? (denominacionPorTablero.get(f.tablero_id) ?? "(tablero eliminado)") : null,
      tecnicoNombre: nombrePorUsuario.get(f.created_by) ?? null,
      modelo: f.modelo,
      inputTokens: f.input_tokens,
      outputTokens: f.output_tokens,
      costoUsd: f.costo_estimado_usd,
      porcentajeAcierto: f.porcentaje_acierto,
    };
  });

  return {
    costoMesActualUsd,
    lecturasMesActual: filas.length,
    porcentajeAciertoPromedio: cantidadConAcierto > 0 ? Math.round((sumaAcierto / cantidadConAcierto) * 100) / 100 : null,
    costoPorTablero: [...costoPorTableroMap.values()].sort((a, b) => b.costoUsd - a.costoUsd),
    ultimasLecturas,
  };
}
