import type { createClient } from "@/lib/supabase/server";
import { fetchTodasLasUbicaciones } from "@/lib/ubicaciones/fetch-todas";
import type { TipoEquipoBaja } from "@/lib/database.types";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/**
 * Generador de programación automática del Plan de Mantenimiento —
 * reemplaza la idea de que cada técnico invente una fecha en el campo:
 * un Admin corre esto desde Configuración y arma la agenda de los
 * próximos ~90 días (ventana deslizante — se vuelve a correr cuando
 * hace falta para que se mantenga al día, no es un plan anual fijo).
 *
 * Es una ESTIMACIÓN/sugerencia, no una asignación de rutas real:
 * - Agrupa equipos por SITIO (una visita cubre todo lo que vence ahí,
 *   no un viaje por equipo) y por PROVINCIA (proxy simple de "zona de
 *   trabajo", igual criterio que `mantenimiento-dotacion.ts`).
 * - La hora de viaje por visita es la distancia PROMEDIO real
 *   (Haversine, coordenadas GPS ya cargadas) entre los sitios de esa
 *   provincia — nunca una distancia inventada.
 * - Empaqueta greedy: por provincia, ordena las visitas por urgencia y
 *   las ubica en el primer día hábil con horas libres (según los
 *   supuestos de Configuración), sin pasarse de la fecha límite de cada
 *   equipo.
 * - NUNCA pisa una programación cargada a mano por un técnico (`origen
 *   = 'manual'`) — sólo reemplaza las que generó ella misma (`origen =
 *   'auto'`) en la corrida anterior.
 */

const HORIZONTE_DIAS = 90;

interface EquipoPendiente {
  tipoEquipo: TipoEquipoBaja;
  equipoId: string;
  ubicacionId: string;
  provincia: string;
  fechaObjetivo: string;
}

interface VisitaSitio {
  ubicacionId: string;
  provincia: string;
  fechaRequerida: string;
  equipos: { tipoEquipo: TipoEquipoBaja; equipoId: string }[];
}

export interface ResultadoProgramacionAutomatica {
  sitiosProgramados: number;
  equiposProgramados: number;
  primeraFecha: string | null;
  ultimaFecha: string | null;
}

function sumarDias(fecha: Date, dias: number): Date {
  const d = new Date(fecha);
  d.setDate(d.getDate() + dias);
  return d;
}

function esDiaHabil(fecha: Date): boolean {
  const dia = fecha.getDay();
  return dia !== 0 && dia !== 6;
}

function iso(fecha: Date): string {
  return fecha.toISOString().slice(0, 10);
}

function distanciaKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

export async function generarProgramacionAutomatica(supabase: Supabase, createdBy: string): Promise<ResultadoProgramacionAutomatica> {
  const [ubicaciones, intervalosRes, racksRes, rackEquipamientosRes, equiposRes, mantenimientosRes, configRes] = await Promise.all([
    fetchTodasLasUbicaciones(supabase),
    supabase.from("mantenimiento_intervalos").select("tipo_equipo, categoria, frecuencia_dias"),
    supabase.from("racks").select("id, ubicacion_id"),
    supabase.from("rack_equipamientos").select("id, rack_id, categoria_equipo").eq("estado", "activo"),
    supabase.from("equipos").select("id, categoria_equipo, ubicacion_id").eq("estado", "activo"),
    supabase.from("mantenimientos_equipamiento").select("tipo_equipo, equipo_id, fecha").order("fecha", { ascending: false }),
    supabase.from("config_general").select("pdm_horas_por_dia, pdm_horas_por_visita, pdm_velocidad_kmh").eq("id", 1).single(),
  ]);

  const horasPorDia = Number(configRes.data?.pdm_horas_por_dia ?? 8);
  const horasPorVisita = Number(configRes.data?.pdm_horas_por_visita ?? 2);
  const velocidadKmh = Number(configRes.data?.pdm_velocidad_kmh ?? 60);

  const frecuenciaPorCategoria = new Map<string, number>();
  for (const i of intervalosRes.data ?? []) frecuenciaPorCategoria.set(`${i.tipo_equipo}:${i.categoria}`, i.frecuencia_dias);

  const vacio: ResultadoProgramacionAutomatica = { sitiosProgramados: 0, equiposProgramados: 0, primeraFecha: null, ultimaFecha: null };
  if (frecuenciaPorCategoria.size === 0) return vacio;

  const ubicacionPorId = new Map(ubicaciones.map((u) => [u.id, u]));
  const rackIdUbicacion = new Map((racksRes.data ?? []).map((r) => [r.id, r.ubicacion_id]));

  const ultimaFechaPorEquipo = new Map<string, string>();
  for (const m of mantenimientosRes.data ?? []) {
    const clave = `${m.tipo_equipo}:${m.equipo_id}`;
    if (!ultimaFechaPorEquipo.has(clave)) ultimaFechaPorEquipo.set(clave, m.fecha);
  }

  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const finHorizonte = sumarDias(hoy, HORIZONTE_DIAS);

  const pendientes: EquipoPendiente[] = [];

  function evaluar(tipoEquipo: TipoEquipoBaja, equipoId: string, categoria: string, ubicacionId: string) {
    const frecuencia = frecuenciaPorCategoria.get(`${tipoEquipo}:${categoria}`);
    if (frecuencia == null) return;
    const ubicacion = ubicacionPorId.get(ubicacionId);
    if (!ubicacion) return;
    const ultimaFecha = ultimaFechaPorEquipo.get(`${tipoEquipo}:${equipoId}`);
    const fechaObjetivo = ultimaFecha ? sumarDias(new Date(`${ultimaFecha}T00:00:00`), frecuencia) : hoy;
    if (fechaObjetivo > finHorizonte) return;
    pendientes.push({ tipoEquipo, equipoId, ubicacionId, provincia: ubicacion.provincia, fechaObjetivo: iso(fechaObjetivo) });
  }

  for (const e of rackEquipamientosRes.data ?? []) {
    const ubicacionId = rackIdUbicacion.get(e.rack_id);
    if (ubicacionId) evaluar("rack_equipamiento", e.id, e.categoria_equipo, ubicacionId);
  }
  for (const e of equiposRes.data ?? []) {
    evaluar("equipo_individual", e.id, e.categoria_equipo, e.ubicacion_id);
  }

  if (pendientes.length === 0) {
    await supabase.from("mantenimiento_programaciones").delete().eq("origen", "auto");
    return vacio;
  }

  const porSitio = new Map<string, VisitaSitio>();
  for (const p of pendientes) {
    const existente = porSitio.get(p.ubicacionId);
    if (!existente) {
      porSitio.set(p.ubicacionId, {
        ubicacionId: p.ubicacionId,
        provincia: p.provincia,
        fechaRequerida: p.fechaObjetivo,
        equipos: [{ tipoEquipo: p.tipoEquipo, equipoId: p.equipoId }],
      });
    } else {
      existente.equipos.push({ tipoEquipo: p.tipoEquipo, equipoId: p.equipoId });
      if (p.fechaObjetivo < existente.fechaRequerida) existente.fechaRequerida = p.fechaObjetivo;
    }
  }
  const visitas = [...porSitio.values()].sort((a, b) => (a.fechaRequerida < b.fechaRequerida ? -1 : 1));

  const puntosPorProvincia = new Map<string, { lat: number; lng: number }[]>();
  for (const v of visitas) {
    const ubicacion = ubicacionPorId.get(v.ubicacionId);
    if (ubicacion?.lat != null && ubicacion?.lng != null) {
      const lista = puntosPorProvincia.get(v.provincia) ?? [];
      lista.push({ lat: ubicacion.lat, lng: ubicacion.lng });
      puntosPorProvincia.set(v.provincia, lista);
    }
  }
  const horasViajePorProvincia = new Map<string, number>();
  for (const [provincia, puntos] of puntosPorProvincia) {
    if (puntos.length < 2) {
      horasViajePorProvincia.set(provincia, 0);
      continue;
    }
    let suma = 0;
    let pares = 0;
    for (let i = 0; i < puntos.length; i++) {
      for (let j = i + 1; j < puntos.length; j++) {
        suma += distanciaKm(puntos[i], puntos[j]);
        pares++;
      }
    }
    horasViajePorProvincia.set(provincia, (suma / pares / velocidadKmh) * 2);
  }

  const horasUsadasPorDia = new Map<string, number>();
  const asignaciones = new Map<string, string>();

  for (const visita of visitas) {
    const horasNecesarias = horasPorVisita + (horasViajePorProvincia.get(visita.provincia) ?? 0);
    const fechaLimite = new Date(`${visita.fechaRequerida}T00:00:00`);
    let candidata = new Date(hoy);
    let asignada: Date | null = null;
    while (candidata <= fechaLimite) {
      if (esDiaHabil(candidata)) {
        const clave = `${visita.provincia}:${iso(candidata)}`;
        const usadas = horasUsadasPorDia.get(clave) ?? 0;
        if (usadas + horasNecesarias <= horasPorDia) {
          horasUsadasPorDia.set(clave, usadas + horasNecesarias);
          asignada = new Date(candidata);
          break;
        }
      }
      candidata = sumarDias(candidata, 1);
    }
    asignaciones.set(visita.ubicacionId, iso(asignada ?? fechaLimite));
  }

  await supabase.from("mantenimiento_programaciones").delete().eq("origen", "auto");

  const filas = visitas.flatMap((visita) =>
    visita.equipos.map((e) => ({
      tipo_equipo: e.tipoEquipo,
      equipo_id: e.equipoId,
      fecha_programada: asignaciones.get(visita.ubicacionId)!,
      asignado_a: null,
      nota: null,
      origen: "auto" as const,
      created_by: createdBy,
    })),
  );

  const idsEnFilas = filas.map((f) => f.equipo_id);
  const { data: manualesExistentes } = await supabase
    .from("mantenimiento_programaciones")
    .select("tipo_equipo, equipo_id")
    .eq("origen", "manual")
    .in("equipo_id", idsEnFilas);
  const manualesSet = new Set((manualesExistentes ?? []).map((m) => `${m.tipo_equipo}:${m.equipo_id}`));
  const filasAInsertar = filas.filter((f) => !manualesSet.has(`${f.tipo_equipo}:${f.equipo_id}`));

  if (filasAInsertar.length > 0) {
    await supabase.from("mantenimiento_programaciones").insert(filasAInsertar);
  }

  const fechas = [...asignaciones.values()].sort();
  return {
    sitiosProgramados: visitas.length,
    equiposProgramados: filasAInsertar.length,
    primeraFecha: fechas[0] ?? null,
    ultimaFecha: fechas[fechas.length - 1] ?? null,
  };
}
