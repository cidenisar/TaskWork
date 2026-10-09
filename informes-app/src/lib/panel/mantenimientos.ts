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
  provincia: string;
  frecuenciaDias: number;
  ultimaFecha: string | null;
  urgencia: "vencido" | "proximo" | "ok" | "nunca";
  mensaje: string;
  /** Fecha programada a mano (pisa, solo para mostrar/ordenar, a la calculada) o la calculada de último+intervalo — null si nunca se hizo y no se programó. */
  fechaObjetivo: string | null;
  /** true si fechaObjetivo viene de una programación manual, no del cálculo. */
  esProgramada: boolean;
  asignadoNombre: string | null;
  clima: PronosticoSitio | null;
}

const ORDEN_URGENCIA: Record<string, number> = { vencido: 0, nunca: 1, proximo: 2, ok: 3 };
const MAX_ITEMS = 60;

function sumarDias(fechaIso: string, dias: number): string {
  const d = new Date(`${fechaIso}T00:00:00`);
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
}

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
export interface PanelMantenimientos {
  items: PanelMantenimientoItem[];
  /** KPIs sobre TODOS los equipos con intervalo configurado, no solo los primeros MAX_ITEMS que se listan. */
  kpis: KpisMantenimiento;
}

export async function getPanelMantenimientos(supabase: Supabase): Promise<PanelMantenimientos> {
  const [ubicaciones, intervalosRes, racksRes, rackEquipamientosRes, equiposRes, mantenimientosRes, programacionesRes, tecnicosRes] =
    await Promise.all([
      fetchTodasLasUbicaciones(supabase),
      supabase.from("mantenimiento_intervalos").select("tipo_equipo, categoria, frecuencia_dias"),
      supabase.from("racks").select("id, ubicacion_id"),
      supabase.from("rack_equipamientos").select("id, rack_id, categoria_equipo, texto").eq("estado", "activo"),
      supabase.from("equipos").select("id, categoria_equipo, texto, ubicacion_id").eq("estado", "activo"),
      supabase.from("mantenimientos_equipamiento").select("tipo_equipo, equipo_id, fecha").order("fecha", { ascending: false }),
      supabase.from("mantenimiento_programaciones").select("tipo_equipo, equipo_id, fecha_programada, asignado_a"),
      supabase.from("profiles").select("id, nombre_completo"),
    ]);

  const frecuenciaPorCategoria = new Map<string, number>();
  for (const i of intervalosRes.data ?? []) {
    frecuenciaPorCategoria.set(`${i.tipo_equipo}:${i.categoria}`, i.frecuencia_dias);
  }
  if (frecuenciaPorCategoria.size === 0) return { items: [], kpis: calcularKpisMantenimiento([]) };

  const ubicacionPorId = new Map(ubicaciones.map((u) => [u.id, u]));
  const rackIdUbicacion = new Map((racksRes.data ?? []).map((r) => [r.id, r.ubicacion_id]));
  const nombrePorTecnico = new Map((tecnicosRes.data ?? []).map((t) => [t.id, t.nombre_completo]));

  // Ordenados por fecha descendente — la primera fila de cada (tipo, equipo) ya es la más reciente.
  const ultimaFechaPorEquipo = new Map<string, string>();
  for (const m of mantenimientosRes.data ?? []) {
    const clave = `${m.tipo_equipo}:${m.equipo_id}`;
    if (!ultimaFechaPorEquipo.has(clave)) ultimaFechaPorEquipo.set(clave, m.fecha);
  }
  const programacionPorEquipo = new Map(
    (programacionesRes.data ?? []).map((p) => [`${p.tipo_equipo}:${p.equipo_id}`, { fecha: p.fecha_programada, asignadoA: p.asignado_a }]),
  );

  const hoy = new Date();
  const items: PanelMantenimientoItem[] = [];

  function agregarItem(
    tipoEquipo: TipoEquipoBaja,
    equipoId: string,
    texto: string,
    categoriaEquipo: string,
    ubicacionId: string,
  ) {
    const frecuencia = frecuenciaPorCategoria.get(`${tipoEquipo}:${categoriaEquipo}`);
    if (frecuencia == null) return;
    const ubicacion = ubicacionPorId.get(ubicacionId);
    if (!ubicacion) return;
    const clave = `${tipoEquipo}:${equipoId}`;
    const ultimaFecha = ultimaFechaPorEquipo.get(clave) ?? null;
    const programacion = programacionPorEquipo.get(clave) ?? null;
    const estado = calcularEstadoMantenimiento(frecuencia, ultimaFecha, hoy);
    const fechaCalculada = ultimaFecha ? sumarDias(ultimaFecha, frecuencia) : null;
    items.push({
      tipoEquipo,
      tipoEquipoLabel: TIPO_EQUIPO_MANTENIMIENTO_LABEL[tipoEquipo],
      equipoId,
      texto,
      categoriaLabel: labelCategoriaMantenimiento(tipoEquipo, categoriaEquipo),
      ubicacionId,
      ubicacionLabel: labelUbicacion(ubicacion),
      provincia: ubicacion.provincia,
      frecuenciaDias: frecuencia,
      ultimaFecha,
      urgencia: estado.urgencia === "sin_intervalo" ? "ok" : estado.urgencia,
      mensaje: estado.mensaje,
      fechaObjetivo: programacion?.fecha ?? fechaCalculada,
      esProgramada: programacion != null,
      asignadoNombre: programacion?.asignadoA ? (nombrePorTecnico.get(programacion.asignadoA) ?? null) : null,
      clima: null,
    });
  }

  for (const e of rackEquipamientosRes.data ?? []) {
    const ubicacionId = rackIdUbicacion.get(e.rack_id);
    if (ubicacionId) agregarItem("rack_equipamiento", e.id, e.texto, e.categoria_equipo, ubicacionId);
  }
  for (const e of equiposRes.data ?? []) {
    agregarItem("equipo_individual", e.id, e.texto, e.categoria_equipo, e.ubicacion_id);
  }

  const kpis = calcularKpisMantenimiento(items);

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

  return { items: recortados, kpis };
}

export interface KpisMantenimiento {
  total: number;
  alDia: number;
  vencidos: number;
  proximos30Dias: number;
  porcentajeAlDia: number;
}

/** KPIs para la cabecera del Plan — sobre TODOS los equipos con intervalo configurado, no solo los primeros MAX_ITEMS. */
export function calcularKpisMantenimiento(items: PanelMantenimientoItem[]): KpisMantenimiento {
  const total = items.length;
  const vencidos = items.filter((i) => i.urgencia === "vencido").length;
  const hoy = new Date();
  const en30Dias = new Date(hoy);
  en30Dias.setDate(en30Dias.getDate() + 30);
  const proximos30Dias = items.filter((i) => {
    if (i.urgencia === "vencido" || !i.fechaObjetivo) return false;
    const fecha = new Date(`${i.fechaObjetivo}T00:00:00`);
    return fecha <= en30Dias;
  }).length;
  const alDia = items.filter((i) => i.urgencia === "ok").length;
  return { total, alDia, vencidos, proximos30Dias, porcentajeAlDia: total > 0 ? Math.round((alDia / total) * 100) : 0 };
}

export interface MantenimientoRealizado {
  id: string;
  tipoEquipo: TipoEquipoBaja;
  tipoEquipoLabel: string;
  equipoId: string;
  texto: string;
  categoriaLabel: string;
  ubicacionLabel: string;
  fecha: string;
  descripcion: string | null;
  fotoUrl: string | null;
  realizadoPorNombre: string;
}

/** Historial de mantenimientos ya registrados (pestaña "Realizados") — más reciente primero. */
export async function getMantenimientosRealizados(supabase: Supabase, limite = 200): Promise<MantenimientoRealizado[]> {
  const [ubicaciones, racksRes, rackEquipamientosRes, equiposRes, mantenimientosRes, usuariosRes] = await Promise.all([
    fetchTodasLasUbicaciones(supabase),
    supabase.from("racks").select("id, ubicacion_id"),
    supabase.from("rack_equipamientos").select("id, rack_id, categoria_equipo, texto"),
    supabase.from("equipos").select("id, categoria_equipo, texto, ubicacion_id"),
    supabase
      .from("mantenimientos_equipamiento")
      .select("id, tipo_equipo, equipo_id, fecha, descripcion, foto_url, created_by")
      .order("fecha", { ascending: false })
      .limit(limite),
    supabase.from("profiles").select("id, nombre_completo"),
  ]);

  const ubicacionPorId = new Map(ubicaciones.map((u) => [u.id, u]));
  const rackIdUbicacion = new Map((racksRes.data ?? []).map((r) => [r.id, r.ubicacion_id]));
  const rackEquipoPorId = new Map((rackEquipamientosRes.data ?? []).map((e) => [e.id, e]));
  const equipoPorId = new Map((equiposRes.data ?? []).map((e) => [e.id, e]));
  const nombrePorUsuario = new Map((usuariosRes.data ?? []).map((u) => [u.id, u.nombre_completo]));

  const resultado: MantenimientoRealizado[] = [];
  for (const m of mantenimientosRes.data ?? []) {
    let texto = "—";
    let categoriaLabel = "—";
    let ubicacionLabel = "—";
    if (m.tipo_equipo === "rack_equipamiento") {
      const e = rackEquipoPorId.get(m.equipo_id);
      if (e) {
        texto = e.texto;
        categoriaLabel = labelCategoriaMantenimiento("rack_equipamiento", e.categoria_equipo);
        const ubicacionId = rackIdUbicacion.get(e.rack_id);
        const ubicacion = ubicacionId ? ubicacionPorId.get(ubicacionId) : undefined;
        if (ubicacion) ubicacionLabel = labelUbicacion(ubicacion);
      }
    } else {
      const e = equipoPorId.get(m.equipo_id);
      if (e) {
        texto = e.texto;
        categoriaLabel = labelCategoriaMantenimiento("equipo_individual", e.categoria_equipo);
        const ubicacion = ubicacionPorId.get(e.ubicacion_id);
        if (ubicacion) ubicacionLabel = labelUbicacion(ubicacion);
      }
    }
    resultado.push({
      id: m.id,
      tipoEquipo: m.tipo_equipo,
      tipoEquipoLabel: TIPO_EQUIPO_MANTENIMIENTO_LABEL[m.tipo_equipo],
      equipoId: m.equipo_id,
      texto,
      categoriaLabel,
      ubicacionLabel,
      fecha: m.fecha,
      descripcion: m.descripcion,
      fotoUrl: m.foto_url,
      realizadoPorNombre: nombrePorUsuario.get(m.created_by) ?? "—",
    });
  }
  return resultado;
}
