import type { createClient } from "@/lib/supabase/server";
import { fetchTodasLasUbicaciones } from "@/lib/ubicaciones/fetch-todas";
import { CATEGORIA_EQUIPO_LABEL } from "@/components/equipos/types";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type ModuloMapa = "Tableros" | "Racks" | "Torres" | "Equipos Individuales" | "Salas";

/** Un punto por cada UNIDAD FÍSICA concreta (un tablero, un rack, una torre, un equipo individual, una sala) — no un
 * agregado por sitio. Así, dos salas del mismo sitio (una en PB, otra en 1° piso) son dos marcadores distintos, cada
 * uno identificable por su nombre, en vez de un solo marcador con "Salas: 2". */
export interface PuntoMapa {
  id: string;
  ubicacionId: string;
  lat: number;
  lng: number;
  modulo: ModuloMapa;
  /** Solo Equipos Individuales tiene esto (ups/camara_cctv/switch/etc.) — null en el resto de los módulos. */
  categoria: string | null;
  categoriaLabel: string | null;
  /** denominación/texto de esa unidad puntual — lo que la distingue de otra del mismo módulo en el mismo sitio. */
  label: string;
}

/** Trae todas las unidades físicas de los 5 módulos que ya tienen GPS cargado en su Ubicación, para el mapa de Vista General. */
export async function getPuntosMapa(supabase: Supabase): Promise<PuntoMapa[]> {
  const [ubicaciones, tablerosRes, racksRes, torresRes, equiposRes, salasRes] = await Promise.all([
    fetchTodasLasUbicaciones(supabase),
    supabase.from("tableros").select("id, ubicacion_id, denominacion"),
    supabase.from("racks").select("id, ubicacion_id, denominacion"),
    supabase.from("torres_comunicacion").select("id, ubicacion_id, denominacion"),
    supabase.from("equipos").select("id, ubicacion_id, texto, categoria_equipo").eq("estado", "activo"),
    supabase.from("salas").select("id, ubicacion_id, denominacion").eq("estado", "activo"),
  ]);

  const ubicacionPorId = new Map(ubicaciones.map((u) => [u.id, u]));
  const puntos: PuntoMapa[] = [];

  function agregar(id: string, ubicacionId: string, modulo: ModuloMapa, label: string, categoria: string | null, categoriaLabel: string | null) {
    const u = ubicacionPorId.get(ubicacionId);
    if (!u || u.lat == null || u.lng == null) return;
    puntos.push({ id, ubicacionId, lat: u.lat, lng: u.lng, modulo, categoria, categoriaLabel, label });
  }

  for (const t of tablerosRes.data ?? []) agregar(t.id, t.ubicacion_id, "Tableros", t.denominacion, null, null);
  for (const r of racksRes.data ?? []) agregar(r.id, r.ubicacion_id, "Racks", r.denominacion, null, null);
  for (const t of torresRes.data ?? []) agregar(t.id, t.ubicacion_id, "Torres", t.denominacion, null, null);
  for (const s of salasRes.data ?? []) agregar(s.id, s.ubicacion_id, "Salas", s.denominacion, null, null);
  for (const e of equiposRes.data ?? [])
    agregar(e.id, e.ubicacion_id, "Equipos Individuales", e.texto, e.categoria_equipo, CATEGORIA_EQUIPO_LABEL[e.categoria_equipo]);

  return puntos;
}
