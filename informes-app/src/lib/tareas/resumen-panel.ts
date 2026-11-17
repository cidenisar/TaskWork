import type { createClient } from "@/lib/supabase/server";
import { labelUbicacion, type Ubicacion } from "@/components/ubicaciones/types";
import { DIAS_TAREA_VIEJA } from "./puro";

type Supabase = Awaited<ReturnType<typeof createClient>>;

const MAX_ULTIMAS = 8;
const DIAS_CIERRES_RECIENTES = 30;

export interface UltimaTarea {
  id: string;
  texto: string;
  creadaAt: string;
  lugar: string;
  /** N° del informe donde se anotó, o null si se cargó a mano desde el Panel. */
  informeNumero: string | null;
  estado: "abierta" | "resuelta" | "descartada";
}

export interface ResumenTareasPanel {
  abiertas: number;
  /** Abiertas hace más de DIAS_TAREA_VIEJA días. */
  viejas: number;
  /** Resueltas en los últimos 30 días. */
  resueltasRecientes: number;
  /** Dadas de baja en los últimos 30 días. */
  bajasRecientes: number;
  ultimas: UltimaTarea[];
}

/**
 * Lo mínimo que necesita Vista General sobre las tareas: cuatro conteos y las últimas cargadas.
 * Son consultas livianas (conteos con `head`), no carga todas las tareas como la pantalla de
 * Tareas. Si algo falla devuelve null y la Vista General sigue sin ese bloque.
 */
export async function cargarResumenTareasPanel(supabase: Supabase, ahora = new Date()): Promise<ResumenTareasPanel | null> {
  try {
    const dia = 86_400_000;
    const corteViejas = new Date(ahora.getTime() - DIAS_TAREA_VIEJA * dia).toISOString();
    const corteCierres = new Date(ahora.getTime() - DIAS_CIERRES_RECIENTES * dia).toISOString();
    const contar = () => supabase.from("tareas_pendientes").select("id", { count: "exact", head: true });

    const [abiertas, viejas, resueltas, bajas, ultimas] = await Promise.all([
      contar().eq("estado", "abierta"),
      contar().eq("estado", "abierta").lt("created_at", corteViejas),
      contar().eq("estado", "resuelta").gte("cerrada_at", corteCierres),
      contar().eq("estado", "descartada").gte("cerrada_at", corteCierres),
      supabase
        .from("tareas_pendientes")
        .select("id, texto, estado, created_at, informe_id, ubicacion_id")
        .order("created_at", { ascending: false })
        .limit(MAX_ULTIMAS),
    ]);
    for (const r of [abiertas, viejas, resueltas, bajas, ultimas]) if (r.error) throw r.error;

    const filas = ultimas.data ?? [];
    const ubicacionIds = [...new Set(filas.map((f) => f.ubicacion_id))];
    const informeIds = [...new Set(filas.flatMap((f) => (f.informe_id ? [f.informe_id] : [])))];
    const [ubic, infs] = await Promise.all([
      ubicacionIds.length
        ? supabase.from("ubicaciones").select("id, pais, region, provincia, localidad, sitio, planta, oficina, lat, lng").in("id", ubicacionIds)
        : Promise.resolve({ data: [], error: null }),
      informeIds.length ? supabase.from("informes_tecnicos").select("id, numero_generacion").in("id", informeIds) : Promise.resolve({ data: [], error: null }),
    ]);
    const lugarPorId = new Map((ubic.data ?? []).map((u) => [u.id, labelUbicacion(u as Ubicacion)]));
    const numeroPorId = new Map((infs.data ?? []).map((i) => [i.id, i.numero_generacion]));

    return {
      abiertas: abiertas.count ?? 0,
      viejas: viejas.count ?? 0,
      resueltasRecientes: resueltas.count ?? 0,
      bajasRecientes: bajas.count ?? 0,
      ultimas: filas.map((f) => ({
        id: f.id,
        texto: f.texto,
        creadaAt: f.created_at,
        lugar: lugarPorId.get(f.ubicacion_id) ?? "—",
        informeNumero: f.informe_id ? (numeroPorId.get(f.informe_id) ?? null) : null,
        estado: f.estado,
      })),
    };
  } catch {
    return null;
  }
}
