import type { createClient } from "@/lib/supabase/server";
import { fetchTodasLasUbicaciones } from "@/lib/ubicaciones/fetch-todas";
import { labelUbicacion } from "@/components/ubicaciones/types";
import { calcularEstadoMantenimiento, labelCategoriaMantenimiento, TIPO_EQUIPO_MANTENIMIENTO_LABEL } from "@/lib/mantenimiento/types";
import { getPronosticosPorSitio, type PronosticoSitio } from "@/lib/panel/clima";
import type { TipoEquipoBaja } from "@/lib/database.types";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export interface PanelMantenimientoItem {
  tipoEquipo: TipoEquipoBaja;
  tipoEquipoLabel: string;
  equipoId: string;
  texto: string;
  categoriaLabel: string;
  ubicacionId: string;
  ubicacionLabel: string;
  frecuenciaDias: number;
  ultimaFecha: string | null;
  urgencia: "vencido" | "proximo" | "ok" | "nunca";
  mensaje: string;
  clima: PronosticoSitio | null;
}

const ORDEN_URGENCIA: Record<string, number> = { vencido: 0, nunca: 1, proximo: 2, ok: 3 };
const MAX_ITEMS = 60;

/**
 * Plan de Mantenimiento: cruza el catálogo de intervalos configurados
 * (Configuración → Mantenimiento) con el último mantenimiento registrado
 * de cada Rack/Equipo Individual para calcular quién está vencido, quién
 * se acerca, y quién nunca tuvo uno — sumando el pronóstico de lluvia del
 * sitio para los que ya están vencidos o próximos, así se puede decidir
 * de un vistazo si conviene programar la visita. Solo entran equipos cuya
 * categoría tiene un intervalo configurado — si no hay ninguno
 * configurado todavía, la pantalla queda vacía a propósito (no tiene
 * sentido "avisar" sin una regla).
 */
export async function getPanelMantenimientos(supabase: Supabase): Promise<PanelMantenimientoItem[]> {
  const [ubicaciones, intervalosRes, racksRes, rackEquipamientosRes, equiposRes, mantenimientosRes] = await Promise.all([
    fetchTodasLasUbicaciones(supabase),
    supabase.from("mantenimiento_intervalos").select("tipo_equipo, categoria, frecuencia_dias"),
    supabase.from("racks").select("id, ubicacion_id"),
    supabase.from("rack_equipamientos").select("id, rack_id, categoria_equipo, texto").eq("estado", "activo"),
    supabase.from("equipos").select("id, categoria_equipo, texto, ubicacion_id").eq("estado", "activo"),
    supabase.from("mantenimientos_equipamiento").select("tipo_equipo, equipo_id, fecha").order("fecha", { ascending: false }),
  ]);

  const frecuenciaPorCategoria = new Map<string, number>();
  for (const i of intervalosRes.data ?? []) {
    frecuenciaPorCategoria.set(`${i.tipo_equipo}:${i.categoria}`, i.frecuencia_dias);
  }
  if (frecuenciaPorCategoria.size === 0) return [];

  const ubicacionPorId = new Map(ubicaciones.map((u) => [u.id, u]));
  const rackIdUbicacion = new Map((racksRes.data ?? []).map((r) => [r.id, r.ubicacion_id]));

  // Ordenados por fecha descendente — la primera fila de cada (tipo, equipo) ya es la más reciente.
  const ultimaFechaPorEquipo = new Map<string, string>();
  for (const m of mantenimientosRes.data ?? []) {
    const clave = `${m.tipo_equipo}:${m.equipo_id}`;
    if (!ultimaFechaPorEquipo.has(clave)) ultimaFechaPorEquipo.set(clave, m.fecha);
  }

  const hoy = new Date();
  const items: PanelMantenimientoItem[] = [];

  for (const e of rackEquipamientosRes.data ?? []) {
    const frecuencia = frecuenciaPorCategoria.get(`rack_equipamiento:${e.categoria_equipo}`);
    if (frecuencia == null) continue;
    const ubicacionId = rackIdUbicacion.get(e.rack_id);
    const ubicacion = ubicacionId ? ubicacionPorId.get(ubicacionId) : undefined;
    if (!ubicacionId || !ubicacion) continue;
    const ultimaFecha = ultimaFechaPorEquipo.get(`rack_equipamiento:${e.id}`) ?? null;
    const estado = calcularEstadoMantenimiento(frecuencia, ultimaFecha, hoy);
    items.push({
      tipoEquipo: "rack_equipamiento",
      tipoEquipoLabel: TIPO_EQUIPO_MANTENIMIENTO_LABEL.rack_equipamiento,
      equipoId: e.id,
      texto: e.texto,
      categoriaLabel: labelCategoriaMantenimiento("rack_equipamiento", e.categoria_equipo),
      ubicacionId,
      ubicacionLabel: labelUbicacion(ubicacion),
      frecuenciaDias: frecuencia,
      ultimaFecha,
      urgencia: estado.urgencia === "sin_intervalo" ? "ok" : estado.urgencia,
      mensaje: estado.mensaje,
      clima: null,
    });
  }

  for (const e of equiposRes.data ?? []) {
    const frecuencia = frecuenciaPorCategoria.get(`equipo_individual:${e.categoria_equipo}`);
    if (frecuencia == null) continue;
    const ubicacion = ubicacionPorId.get(e.ubicacion_id);
    if (!ubicacion) continue;
    const ultimaFecha = ultimaFechaPorEquipo.get(`equipo_individual:${e.id}`) ?? null;
    const estado = calcularEstadoMantenimiento(frecuencia, ultimaFecha, hoy);
    items.push({
      tipoEquipo: "equipo_individual",
      tipoEquipoLabel: TIPO_EQUIPO_MANTENIMIENTO_LABEL.equipo_individual,
      equipoId: e.id,
      texto: e.texto,
      categoriaLabel: labelCategoriaMantenimiento("equipo_individual", e.categoria_equipo),
      ubicacionId: e.ubicacion_id,
      ubicacionLabel: labelUbicacion(ubicacion),
      frecuenciaDias: frecuencia,
      ultimaFecha,
      urgencia: estado.urgencia === "sin_intervalo" ? "ok" : estado.urgencia,
      mensaje: estado.mensaje,
      clima: null,
    });
  }

  items.sort((a, b) => ORDEN_URGENCIA[a.urgencia] - ORDEN_URGENCIA[b.urgencia]);
  const recortados = items.slice(0, MAX_ITEMS);

  // Clima: solo para los sitios de los ítems vencidos/próximos/nunca (los
  // "ok" no necesitan la pregunta todavía), y solo si el sitio tiene GPS cargado.
  const sitiosRelevantes = new Map<string, { lat: number; lng: number }>();
  for (const item of recortados) {
    if (item.urgencia === "ok") continue;
    if (sitiosRelevantes.has(item.ubicacionId)) continue;
    const ubicacion = ubicacionPorId.get(item.ubicacionId);
    if (ubicacion?.lat != null && ubicacion?.lng != null) {
      sitiosRelevantes.set(item.ubicacionId, { lat: ubicacion.lat, lng: ubicacion.lng });
    }
  }
  const puntos = [...sitiosRelevantes.entries()].map(([ubicacionId, { lat, lng }]) => ({ ubicacionId, lat, lng }));
  const pronosticos = await getPronosticosPorSitio(puntos);
  for (const item of recortados) {
    item.clima = pronosticos.get(item.ubicacionId) ?? null;
  }

  return recortados;
}
