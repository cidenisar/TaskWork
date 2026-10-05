import type { createClient } from "@/lib/supabase/server";
import { fetchTodasLasUbicaciones } from "@/lib/ubicaciones/fetch-todas";
import { labelUbicacion } from "@/components/ubicaciones/types";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export interface PanelKpis {
  totalSitios: number;
  totalEquipamiento: number;
  tecnicosActivos: number;
  vencimientosProximos: number;
}

export interface PanelEquipoPorModulo {
  modulo: string;
  cantidad: number;
}

export interface PanelSitioResumen {
  id: string;
  label: string;
  provincia: string;
  total: number;
  porModulo: Record<string, number>;
}

export type UrgenciaVencimiento = "vencido" | "proximo" | "normal";

export interface PanelVencimiento {
  tipo: string;
  nombre: string;
  fecha: string;
  diasRestantes: number;
  urgencia: UrgenciaVencimiento;
}

export interface PanelOverview {
  kpis: PanelKpis;
  equipoPorModulo: PanelEquipoPorModulo[];
  sitios: PanelSitioResumen[];
  vencimientos: PanelVencimiento[];
}

/** Ventana para considerar un vencimiento "próximo" (además de los ya vencidos, que siempre se muestran). */
const VENTANA_VENCIMIENTOS_DIAS = 60;
/** Tope de filas en las listas del panel — es un resumen para supervisión, no un reemplazo del Historial/ficha de Sitio de cada módulo. */
const MAX_SITIOS = 40;
const MAX_VENCIMIENTOS = 25;

function diasRestantes(fechaIso: string, hoy: Date): number {
  return Math.round((new Date(fechaIso).getTime() - hoy.getTime()) / 86_400_000);
}

function urgenciaDe(dias: number): UrgenciaVencimiento {
  if (dias < 0) return "vencido";
  if (dias <= VENTANA_VENCIMIENTOS_DIAS) return "proximo";
  return "normal";
}

/**
 * Agrega, en una sola carga, lo que un Supervisor/Administrador necesita ver
 * de un vistazo: cuántos sitios tienen algo cargado y cuánto, y qué
 * vencimientos (DNI/licencia de técnicos, tarjeta verde/RTO de vehículos)
 * están vencidos o se acercan. No reemplaza el Historial de cada módulo ni
 * la ficha de Sitio (que sí muestran el detalle fila por fila) — es el
 * resumen ejecutivo que hoy no existía en ningún lado.
 */
export async function getPanelOverview(supabase: Supabase): Promise<PanelOverview> {
  const hoy = new Date();

  const [
    ubicaciones,
    tablerosRes,
    tableroCircuitosRes,
    racksRes,
    rackEquipamientosRes,
    torresRes,
    torreEquipamientosRes,
    equiposRes,
    profilesRes,
    vehiculosRes,
  ] = await Promise.all([
    fetchTodasLasUbicaciones(supabase),
    supabase.from("tableros").select("id, ubicacion_id"),
    supabase.from("tablero_circuitos").select("tablero_id").eq("estado", "activo"),
    supabase.from("racks").select("id, ubicacion_id"),
    supabase.from("rack_equipamientos").select("rack_id, cantidad").eq("estado", "activo"),
    supabase.from("torres_comunicacion").select("id, ubicacion_id"),
    supabase.from("torre_comunicacion_equipamientos").select("torre_id, cantidad").eq("estado", "activo"),
    supabase.from("equipos").select("ubicacion_id, cantidad").eq("estado", "activo"),
    supabase.from("profiles").select("nombre_completo, rol, activo, dni_vencimiento, licencia_conducir_vencimiento"),
    supabase.from("catalogo_vehiculos").select("patente, vencimiento_tarjeta_verde, vencimiento_rto"),
  ]);

  const ubicacionPorId = new Map(ubicaciones.map((u) => [u.id, u]));
  const tableroIdUbicacion = new Map((tablerosRes.data ?? []).map((t) => [t.id, t.ubicacion_id]));
  const rackIdUbicacion = new Map((racksRes.data ?? []).map((r) => [r.id, r.ubicacion_id]));
  const torreIdUbicacion = new Map((torresRes.data ?? []).map((t) => [t.id, t.ubicacion_id]));

  // Total por sitio y por módulo — una sola pasada por cada tabla de
  // equipamiento, sumando `cantidad` donde existe (un circuito de tablero
  // siempre cuenta 1, no tiene ese campo).
  const totalPorSitio = new Map<string, Record<string, number>>();
  function sumar(ubicacionId: string | undefined, modulo: string, cantidad: number) {
    if (!ubicacionId) return;
    const actual = totalPorSitio.get(ubicacionId) ?? {};
    actual[modulo] = (actual[modulo] ?? 0) + cantidad;
    totalPorSitio.set(ubicacionId, actual);
  }
  for (const c of tableroCircuitosRes.data ?? []) {
    sumar(tableroIdUbicacion.get(c.tablero_id), "Tableros", 1);
  }
  for (const e of rackEquipamientosRes.data ?? []) {
    sumar(rackIdUbicacion.get(e.rack_id), "Racks", Number.isFinite(e.cantidad) && e.cantidad > 0 ? e.cantidad : 1);
  }
  for (const e of torreEquipamientosRes.data ?? []) {
    sumar(torreIdUbicacion.get(e.torre_id), "Torres", Number.isFinite(e.cantidad) && e.cantidad > 0 ? e.cantidad : 1);
  }
  for (const e of equiposRes.data ?? []) {
    sumar(e.ubicacion_id, "Equipos Individuales", Number.isFinite(e.cantidad) && e.cantidad > 0 ? e.cantidad : 1);
  }

  const equipoPorModuloMap = new Map<string, number>();
  let totalEquipamiento = 0;
  const sitios: PanelSitioResumen[] = [];
  for (const [ubicacionId, porModulo] of totalPorSitio) {
    const ubicacion = ubicacionPorId.get(ubicacionId);
    if (!ubicacion) continue;
    const total = Object.values(porModulo).reduce((a, b) => a + b, 0);
    if (total === 0) continue;
    totalEquipamiento += total;
    for (const [modulo, cantidad] of Object.entries(porModulo)) {
      equipoPorModuloMap.set(modulo, (equipoPorModuloMap.get(modulo) ?? 0) + cantidad);
    }
    sitios.push({ id: ubicacionId, label: labelUbicacion(ubicacion), provincia: ubicacion.provincia, total, porModulo });
  }
  sitios.sort((a, b) => b.total - a.total);

  const equipoPorModulo: PanelEquipoPorModulo[] = [...equipoPorModuloMap.entries()]
    .map(([modulo, cantidad]) => ({ modulo, cantidad }))
    .sort((a, b) => b.cantidad - a.cantidad);

  // Vencimientos: técnicos (DNI/licencia) + vehículos (tarjeta verde/RTO) —
  // misma ventana de urgencia para los cuatro, ordenados del más urgente al
  // menos urgente. Un vencimiento sin fecha cargada no aparece (no es un
  // "vencido", es un dato que todavía no se completó).
  const vencimientos: PanelVencimiento[] = [];
  for (const p of profilesRes.data ?? []) {
    if (!p.activo) continue;
    if (p.dni_vencimiento) {
      const dias = diasRestantes(p.dni_vencimiento, hoy);
      vencimientos.push({ tipo: "DNI", nombre: p.nombre_completo, fecha: p.dni_vencimiento, diasRestantes: dias, urgencia: urgenciaDe(dias) });
    }
    if (p.licencia_conducir_vencimiento) {
      const dias = diasRestantes(p.licencia_conducir_vencimiento, hoy);
      vencimientos.push({
        tipo: "Licencia de conducir",
        nombre: p.nombre_completo,
        fecha: p.licencia_conducir_vencimiento,
        diasRestantes: dias,
        urgencia: urgenciaDe(dias),
      });
    }
  }
  for (const v of vehiculosRes.data ?? []) {
    if (v.vencimiento_tarjeta_verde) {
      const dias = diasRestantes(v.vencimiento_tarjeta_verde, hoy);
      vencimientos.push({
        tipo: "Tarjeta verde",
        nombre: v.patente,
        fecha: v.vencimiento_tarjeta_verde,
        diasRestantes: dias,
        urgencia: urgenciaDe(dias),
      });
    }
    if (v.vencimiento_rto) {
      const dias = diasRestantes(v.vencimiento_rto, hoy);
      vencimientos.push({ tipo: "RTO", nombre: v.patente, fecha: v.vencimiento_rto, diasRestantes: dias, urgencia: urgenciaDe(dias) });
    }
  }
  vencimientos.sort((a, b) => a.diasRestantes - b.diasRestantes);
  const vencimientosRelevantes = vencimientos.filter((v) => v.urgencia !== "normal");

  const tecnicosActivos = (profilesRes.data ?? []).filter((p) => p.rol === "tecnico" && p.activo).length;

  return {
    kpis: {
      totalSitios: sitios.length,
      totalEquipamiento,
      tecnicosActivos,
      vencimientosProximos: vencimientosRelevantes.length,
    },
    equipoPorModulo,
    sitios: sitios.slice(0, MAX_SITIOS),
    vencimientos: vencimientosRelevantes.slice(0, MAX_VENCIMIENTOS),
  };
}
