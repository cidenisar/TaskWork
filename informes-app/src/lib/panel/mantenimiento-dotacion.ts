import type { createClient } from "@/lib/supabase/server";
import { fetchTodasLasUbicaciones } from "@/lib/ubicaciones/fetch-todas";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export interface DotacionProvincia {
  provincia: string;
  sitios: number;
  visitasPorAnio: number;
  horasTrabajoAnio: number;
  horasViajeAnio: number;
  horasTotalesAnio: number;
  tecnicosNecesarios: number;
}

export interface DotacionEstimada {
  porProvincia: DotacionProvincia[];
  /** Suma simple de técnicosNecesarios por provincia — sobreestima un poco (un técnico podría cubrir parte de dos provincias cercanas), pero es el límite superior honesto sin armar rutas reales. */
  totalTecnicos: number;
  supuestos: { horasPorDia: number; diasHabilesAnio: number; horasPorVisita: number; velocidadKmh: number };
}

/** Distancia real entre dos puntos (km, línea recta) — Haversine. */
function distanciaKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

/**
 * Estimación de cuántos técnicos hacen falta para cumplir el Plan de
 * Mantenimiento — agrupado por provincia (proxy simple de "zona de
 * trabajo", ya disponible en Ubicaciones sin armar un clustering propio).
 * Por provincia: visitas/año necesarias (de los intervalos configurados),
 * + horas de viaje estimadas con la distancia PROMEDIO real (Haversine,
 * sobre las coordenadas GPS ya cargadas) entre los sitios de esa
 * provincia — nunca una distancia inventada. Es una ESTIMACIÓN con
 * supuestos configurables (Configuración → Mantenimiento), no una
 * asignación de rutas real: sirve para dimensionar la cuadrilla, no para
 * armar el itinerario de cada técnico.
 */
export async function getDotacionEstimada(supabase: Supabase): Promise<DotacionEstimada> {
  const [configRes, intervalosRes, racksRes, rackEquipamientosRes, equiposRes, ubicaciones] = await Promise.all([
    supabase.from("config_general").select("pdm_horas_por_dia, pdm_dias_habiles_anio, pdm_horas_por_visita, pdm_velocidad_kmh").eq("id", 1).single(),
    supabase.from("mantenimiento_intervalos").select("tipo_equipo, categoria, frecuencia_dias"),
    supabase.from("racks").select("id, ubicacion_id"),
    supabase.from("rack_equipamientos").select("id, rack_id, categoria_equipo").eq("estado", "activo"),
    supabase.from("equipos").select("id, categoria_equipo, ubicacion_id").eq("estado", "activo"),
    fetchTodasLasUbicaciones(supabase),
  ]);

  const horasPorDia = configRes.data?.pdm_horas_por_dia ?? 8;
  const diasHabilesAnio = configRes.data?.pdm_dias_habiles_anio ?? 230;
  const horasPorVisita = configRes.data?.pdm_horas_por_visita ?? 2;
  const velocidadKmh = configRes.data?.pdm_velocidad_kmh ?? 60;
  const horasDisponiblesPorTecnico = horasPorDia * diasHabilesAnio;

  const frecuenciaPorCategoria = new Map<string, number>();
  for (const i of intervalosRes.data ?? []) frecuenciaPorCategoria.set(`${i.tipo_equipo}:${i.categoria}`, i.frecuencia_dias);
  if (frecuenciaPorCategoria.size === 0) {
    return { porProvincia: [], totalTecnicos: 0, supuestos: { horasPorDia, diasHabilesAnio, horasPorVisita, velocidadKmh } };
  }

  const ubicacionPorId = new Map(ubicaciones.map((u) => [u.id, u]));
  const rackIdUbicacion = new Map((racksRes.data ?? []).map((r) => [r.id, r.ubicacion_id]));

  const visitasPorUbicacion = new Map<string, number>();
  function sumarVisitas(ubicacionId: string, visitas: number) {
    visitasPorUbicacion.set(ubicacionId, (visitasPorUbicacion.get(ubicacionId) ?? 0) + visitas);
  }
  for (const e of rackEquipamientosRes.data ?? []) {
    const frecuencia = frecuenciaPorCategoria.get(`rack_equipamiento:${e.categoria_equipo}`);
    if (frecuencia == null) continue;
    const ubicacionId = rackIdUbicacion.get(e.rack_id);
    if (ubicacionId) sumarVisitas(ubicacionId, 365 / frecuencia);
  }
  for (const e of equiposRes.data ?? []) {
    const frecuencia = frecuenciaPorCategoria.get(`equipo_individual:${e.categoria_equipo}`);
    if (frecuencia != null) sumarVisitas(e.ubicacion_id, 365 / frecuencia);
  }

  const porProvinciaMap = new Map<string, { sitios: Set<string>; visitas: number; puntos: { lat: number; lng: number }[] }>();
  for (const [ubicacionId, visitas] of visitasPorUbicacion) {
    const ubicacion = ubicacionPorId.get(ubicacionId);
    if (!ubicacion) continue;
    const entry = porProvinciaMap.get(ubicacion.provincia) ?? { sitios: new Set<string>(), visitas: 0, puntos: [] };
    entry.sitios.add(ubicacionId);
    entry.visitas += visitas;
    if (ubicacion.lat != null && ubicacion.lng != null) entry.puntos.push({ lat: ubicacion.lat, lng: ubicacion.lng });
    porProvinciaMap.set(ubicacion.provincia, entry);
  }

  const porProvincia: DotacionProvincia[] = [];
  for (const [provincia, entry] of porProvinciaMap) {
    let distanciaPromedio = 0;
    if (entry.puntos.length > 1) {
      let suma = 0;
      let pares = 0;
      for (let i = 0; i < entry.puntos.length; i++) {
        for (let j = i + 1; j < entry.puntos.length; j++) {
          suma += distanciaKm(entry.puntos[i], entry.puntos[j]);
          pares++;
        }
      }
      distanciaPromedio = pares > 0 ? suma / pares : 0;
    }
    // Ida y vuelta por visita, con la distancia promedio entre sitios de la provincia como proxy del traslado típico.
    const horasViajePorVisita = entry.puntos.length > 1 ? (distanciaPromedio / velocidadKmh) * 2 : 0;
    const horasTrabajoAnio = entry.visitas * horasPorVisita;
    const horasViajeAnio = entry.visitas * horasViajePorVisita;
    const horasTotalesAnio = horasTrabajoAnio + horasViajeAnio;
    const tecnicosNecesarios = horasDisponiblesPorTecnico > 0 ? Math.ceil(horasTotalesAnio / horasDisponiblesPorTecnico) : 0;
    porProvincia.push({
      provincia,
      sitios: entry.sitios.size,
      visitasPorAnio: Math.round(entry.visitas),
      horasTrabajoAnio: Math.round(horasTrabajoAnio),
      horasViajeAnio: Math.round(horasViajeAnio),
      horasTotalesAnio: Math.round(horasTotalesAnio),
      tecnicosNecesarios,
    });
  }
  porProvincia.sort((a, b) => b.horasTotalesAnio - a.horasTotalesAnio);

  const totalTecnicos = porProvincia.reduce((acc, p) => acc + p.tecnicosNecesarios, 0);

  return { porProvincia, totalTecnicos, supuestos: { horasPorDia, diasHabilesAnio, horasPorVisita, velocidadKmh } };
}
