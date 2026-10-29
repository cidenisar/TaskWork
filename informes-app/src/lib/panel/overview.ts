import type { createClient } from "@/lib/supabase/server";
import { fetchTodasLasUbicaciones } from "@/lib/ubicaciones/fetch-todas";
import { labelUbicacion, labelSitioFino } from "@/components/ubicaciones/types";
import { computarItemsMantenimiento, type PanelMantenimientoItem } from "./mantenimientos";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export interface PanelKpis {
  totalSitios: number;
  /** Suma de consumoW de todos los sitios — null si ningún sitio tiene el dato. */
  consumoTotalW: number | null;
  informesPorTipo: PanelConteo[];
  tecnicosActivos: number;
  vehiculosTotal: number;
  mantenimiento: PanelMantenimientoResumen;
}

export interface PanelConteo {
  label: string;
  cantidad: number;
}

export interface PanelEquipoPorModulo {
  modulo: string;
  cantidad: number;
}

/** Para el cuadro superior "Plan de Mantenimiento" — cuenta TODOS los ítems con intervalo configurado, sin el tope de 60 que usa la lista del Plan. */
export interface PanelMantenimientoResumen {
  hechos: number;
  porHacer: number;
  vencidos: number;
  reprogramados: number;
}

/** Resumen del ítem de mantenimiento más urgente de un sitio — ver mezclarMasUrgente. */
export interface PanelSitioMantenimiento {
  tipoEquipoLabel: string;
  texto: string;
  categoriaLabel: string;
  urgencia: PanelMantenimientoItem["urgencia"];
  mensaje: string;
}

export interface PanelSitioResumen {
  id: string;
  label: string;
  /** Solo el nivel más específico (oficina/planta/sitio) — para el título del detalle, sin repetir el recorrido que ya muestra el breadcrumb. */
  nombreFino: string;
  region: string;
  provincia: string;
  localidad: string | null;
  /** Nombre crudo del nivel "sitio" de la Ubicación (sin planta/oficina) — se usa para agrupar en la jerarquía de Vista General. */
  sitioNombre: string;
  /** GPS de la Ubicación — null si todavía no se cargó (sitio del catálogo importado sin relevamiento con GPS aún). Para el mapa de Vista General. */
  lat: number | null;
  lng: number | null;
  total: number;
  porModulo: Record<string, number>;
  /** Suma de consumo_promedio_w * cantidad de lo que tiene ese dato estimado por IA — null si ningún equipo del sitio lo tiene. */
  consumoW: number | null;
  /** Cuántos equipos de este sitio (de los que SÍ suman al total) no tienen consumo estimado — para no mostrar el total como si fuera completo. */
  equiposSinConsumo: number;
  /** Fecha (ISO, YYYY-MM-DD) de la visita más reciente registrada en este sitio — relevamiento de cualquier módulo o un mantenimiento cargado. Null si nunca se registró ninguna. */
  ultimaVisita: string | null;
  /** true si al menos un equipo de este sitio tiene el Plan de Mantenimiento vencido. */
  mantenimientoVencido: boolean;
  /** El ítem de mantenimiento más urgente del sitio (vencido > nunca > próximo > ok) — null si no hay ningún equipo con intervalo configurado acá. */
  masUrgente: PanelSitioMantenimiento | null;
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
/** Tope de filas en la lista de vencimientos del panel — es un resumen, no un reemplazo de Panel → Vehículos → Vencimientos. */
const MAX_VENCIMIENTOS = 25;

function diasRestantes(fechaIso: string, hoy: Date): number {
  // Anclar las dos puntas a medianoche LOCAL (no UTC) — mismo criterio que
  // el resto de la app (lib/mantenimiento/generar-programacion.ts, lib/panel/
  // mantenimientos.ts). Sin esto, `new Date(fechaIso)` cae en medianoche UTC
  // mientras `hoy` es el instante actual, y en Argentina (UTC-3) eso puede
  // correr el vencimiento un día para cualquier lado cerca del límite.
  const vencimiento = new Date(`${fechaIso}T00:00:00`);
  const hoyMedianoche = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  return Math.round((vencimiento.getTime() - hoyMedianoche.getTime()) / 86_400_000);
}

function urgenciaDe(dias: number): UrgenciaVencimiento {
  if (dias < 0) return "vencido";
  if (dias <= VENTANA_VENCIMIENTOS_DIAS) return "proximo";
  return "normal";
}

export function masReciente(a: string | null, b: string | null | undefined): string | null {
  if (!b) return a;
  if (!a) return b;
  return b > a ? b : a;
}

/**
 * Agrega, en una sola carga, todo lo que un Supervisor/Administrador
 * necesita ver de un vistazo: consumo y última visita por sitio (para la
 * jerarquía región → provincia → localidad → sitio de Vista General),
 * vencimientos de técnicos/vehículos, y qué está pasando con el Plan de
 * Mantenimiento en cada sitio. No reemplaza el Historial de cada módulo
 * ni la ficha de Sitio (que sí muestran el detalle fila por fila) — es el
 * resumen ejecutivo.
 */
export async function getPanelOverview(supabase: Supabase): Promise<PanelOverview> {
  const hoy = new Date();

  const [
    ubicaciones,
    tablerosRes,
    tableroMedicionesRes,
    racksRes,
    rackEquipamientosRes,
    rackRelevamientosRes,
    torresRes,
    torreEquipamientosRes,
    torreRelevamientosRes,
    equiposRes,
    equipoRelevamientosRes,
    salasRes,
    profilesRes,
    vehiculosRes,
    itemsMantenimiento,
    informesTecnicosRes,
    rendicionesGastosRes,
    entregasDepositoRes,
    bajasEquipamientoRes,
  ] = await Promise.all([
    fetchTodasLasUbicaciones(supabase),
    supabase.from("tableros").select("id, ubicacion_id"),
    supabase.from("tablero_mediciones").select("tablero_id, fecha"),
    supabase.from("racks").select("id, ubicacion_id"),
    supabase.from("rack_equipamientos").select("rack_id, cantidad, consumo_promedio_w").eq("estado", "activo"),
    supabase.from("rack_relevamientos").select("rack_id, fecha"),
    supabase.from("torres_comunicacion").select("id, ubicacion_id"),
    supabase.from("torre_comunicacion_equipamientos").select("torre_id, cantidad, consumo_promedio_w").eq("estado", "activo"),
    supabase.from("torre_comunicacion_relevamientos").select("torre_id, fecha"),
    supabase.from("equipos").select("ubicacion_id, cantidad, consumo_promedio_w").eq("estado", "activo"),
    supabase.from("equipo_relevamientos").select("ubicacion_id, fecha"),
    supabase.from("salas").select("ubicacion_id, created_at").eq("estado", "activo"),
    supabase.from("profiles").select("nombre_completo, rol, activo, dni_vencimiento, licencia_conducir_vencimiento"),
    supabase.from("catalogo_vehiculos").select("patente, vencimiento_tarjeta_verde, vencimiento_rto"),
    computarItemsMantenimiento(supabase),
    supabase.from("informes_tecnicos").select("id", { count: "exact", head: true }),
    supabase.from("rendiciones_gastos").select("id", { count: "exact", head: true }),
    supabase.from("entregas_deposito").select("id", { count: "exact", head: true }),
    supabase.from("bajas_equipamiento").select("id", { count: "exact", head: true }),
  ]);

  const ubicacionPorId = new Map(ubicaciones.map((u) => [u.id, u]));
  const tableroIdUbicacion = new Map((tablerosRes.data ?? []).map((t) => [t.id, t.ubicacion_id]));
  const rackIdUbicacion = new Map((racksRes.data ?? []).map((r) => [r.id, r.ubicacion_id]));
  const torreIdUbicacion = new Map((torresRes.data ?? []).map((t) => [t.id, t.ubicacion_id]));

  // Total por sitio y por módulo: lo que se cuenta en porModulo es la
  // cantidad de UNIDADES FÍSICAS del módulo que hay en el sitio (cuántos
  // tableros, cuántos racks, cuántas torres), no los circuitos/equipamientos
  // que tiene cada una adentro — eso infla el número y deja de representar
  // "cuántos tableros hay acá". El consumo estimado sí se sigue acumulando
  // desde lo que cada tablero/rack/torre tiene montado adentro, por
  // separado del conteo. Equipos Individuales y Salas ya son la unidad
  // física en sí (una fila = un tipo de equipo/una sala), así que ahí
  // conteo y consumo salen de la misma fila.
  const totalPorSitio = new Map<string, Record<string, number>>();
  const consumoWPorSitio = new Map<string, number>();
  const sinConsumoPorSitio = new Map<string, number>();
  function contarUnidad(ubicacionId: string | undefined, modulo: string, cantidad = 1) {
    if (!ubicacionId) return;
    const actual = totalPorSitio.get(ubicacionId) ?? {};
    actual[modulo] = (actual[modulo] ?? 0) + cantidad;
    totalPorSitio.set(ubicacionId, actual);
  }
  function acumularConsumo(ubicacionId: string | undefined, cantidad: number, consumoPromedioW: number | null | undefined) {
    if (!ubicacionId) return;
    if (consumoPromedioW != null && consumoPromedioW > 0) {
      consumoWPorSitio.set(ubicacionId, (consumoWPorSitio.get(ubicacionId) ?? 0) + consumoPromedioW * cantidad);
    } else {
      sinConsumoPorSitio.set(ubicacionId, (sinConsumoPorSitio.get(ubicacionId) ?? 0) + cantidad);
    }
  }
  for (const t of tablerosRes.data ?? []) contarUnidad(t.ubicacion_id, "Tableros");
  for (const r of racksRes.data ?? []) contarUnidad(r.ubicacion_id, "Racks");
  for (const t of torresRes.data ?? []) contarUnidad(t.ubicacion_id, "Torres");
  for (const s of salasRes.data ?? []) contarUnidad(s.ubicacion_id, "Salas");
  for (const e of equiposRes.data ?? []) {
    const cantidad = Number.isFinite(e.cantidad) && e.cantidad > 0 ? e.cantidad : 1;
    contarUnidad(e.ubicacion_id, "Equipos Individuales", cantidad);
    acumularConsumo(e.ubicacion_id, cantidad, e.consumo_promedio_w);
  }
  for (const e of rackEquipamientosRes.data ?? []) {
    const cantidad = Number.isFinite(e.cantidad) && e.cantidad > 0 ? e.cantidad : 1;
    acumularConsumo(rackIdUbicacion.get(e.rack_id), cantidad, e.consumo_promedio_w);
  }
  for (const e of torreEquipamientosRes.data ?? []) {
    const cantidad = Number.isFinite(e.cantidad) && e.cantidad > 0 ? e.cantidad : 1;
    acumularConsumo(torreIdUbicacion.get(e.torre_id), cantidad, e.consumo_promedio_w);
  }

  // Última visita por sitio: la fecha más reciente entre un relevamiento/
  // medición de cualquier módulo, el alta de una sala, o un mantenimiento
  // cargado — da una idea de "hace cuánto no se pisa" sin tener que entrar
  // al historial de cada módulo por separado.
  const ultimaVisitaPorSitio = new Map<string, string>();
  function registrarVisita(ubicacionId: string | undefined, fecha: string | null | undefined) {
    if (!ubicacionId || !fecha) return;
    ultimaVisitaPorSitio.set(ubicacionId, masReciente(ultimaVisitaPorSitio.get(ubicacionId) ?? null, fecha)!);
  }
  for (const m of tableroMedicionesRes.data ?? []) registrarVisita(tableroIdUbicacion.get(m.tablero_id), m.fecha);
  for (const r of rackRelevamientosRes.data ?? []) registrarVisita(rackIdUbicacion.get(r.rack_id), r.fecha);
  for (const r of torreRelevamientosRes.data ?? []) registrarVisita(torreIdUbicacion.get(r.torre_id), r.fecha);
  for (const r of equipoRelevamientosRes.data ?? []) registrarVisita(r.ubicacion_id, r.fecha);
  for (const s of salasRes.data ?? []) registrarVisita(s.ubicacion_id, s.created_at?.slice(0, 10));
  for (const item of itemsMantenimiento) registrarVisita(item.ubicacionId, item.ultimaFecha);

  // Mantenimiento: itemsMantenimiento ya viene ordenado por urgencia
  // (vencido primero, ver computarItemsMantenimiento) — el primero que se
  // vea de cada ubicacionId es, por construcción, el más urgente de ese sitio.
  const masUrgentePorSitio = new Map<string, PanelMantenimientoItem>();
  for (const item of itemsMantenimiento) {
    if (!masUrgentePorSitio.has(item.ubicacionId)) masUrgentePorSitio.set(item.ubicacionId, item);
  }

  const equipoPorModuloMap = new Map<string, number>();
  const sitios: PanelSitioResumen[] = [];
  for (const [ubicacionId, porModulo] of totalPorSitio) {
    const ubicacion = ubicacionPorId.get(ubicacionId);
    if (!ubicacion) continue;
    const total = Object.values(porModulo).reduce((a, b) => a + b, 0);
    if (total === 0) continue;
    for (const [modulo, cantidad] of Object.entries(porModulo)) {
      equipoPorModuloMap.set(modulo, (equipoPorModuloMap.get(modulo) ?? 0) + cantidad);
    }
    const masUrgente = masUrgentePorSitio.get(ubicacionId) ?? null;
    sitios.push({
      id: ubicacionId,
      label: labelUbicacion(ubicacion),
      nombreFino: labelSitioFino(ubicacion),
      region: ubicacion.region,
      provincia: ubicacion.provincia,
      localidad: ubicacion.localidad,
      sitioNombre: ubicacion.sitio,
      lat: ubicacion.lat,
      lng: ubicacion.lng,
      total,
      porModulo,
      consumoW: consumoWPorSitio.get(ubicacionId) ?? null,
      equiposSinConsumo: sinConsumoPorSitio.get(ubicacionId) ?? 0,
      ultimaVisita: ultimaVisitaPorSitio.get(ubicacionId) ?? null,
      mantenimientoVencido: masUrgente?.urgencia === "vencido",
      masUrgente: masUrgente
        ? {
            tipoEquipoLabel: masUrgente.tipoEquipoLabel,
            texto: masUrgente.texto,
            categoriaLabel: masUrgente.categoriaLabel,
            urgencia: masUrgente.urgencia,
            mensaje: masUrgente.mensaje,
          }
        : null,
    });
  }

  const equipoPorModulo: PanelEquipoPorModulo[] = [...equipoPorModuloMap.entries()]
    .map(([modulo, cantidad]) => ({ modulo, cantidad }))
    .sort((a, b) => b.cantidad - a.cantidad);

  // Vencimientos: técnicos (DNI/licencia) + vehículos (tarjeta verde/RTO) —
  // misma ventana de urgencia para los cuatro, ordenados del más urgente al
  // menos urgente. Un vencimiento sin fecha cargada no aparece (no es un
  // "vencido", es un dato que todavía no se completó). No se puede repartir
  // por zona/sitio: ni técnicos ni vehículos están atados a una Ubicación.
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
  const consumoTotalW = sitios.some((s) => s.consumoW != null)
    ? sitios.reduce((acc, s) => acc + (s.consumoW ?? 0), 0)
    : null;

  const informesPorTipo: PanelConteo[] = [
    { label: "Informe Técnico", cantidad: informesTecnicosRes.count ?? 0 },
    { label: "Rendición de Gastos", cantidad: rendicionesGastosRes.count ?? 0 },
    { label: "Entregas a Depósito", cantidad: entregasDepositoRes.count ?? 0 },
    { label: "Bajas de Equipamiento", cantidad: bajasEquipamientoRes.count ?? 0 },
  ];

  // Plan de Mantenimiento: sobre TODOS los ítems con intervalo configurado
  // (itemsMantenimiento no tiene el tope de 60 que sí aplica getPanelMantenimientos
  // para su propia lista) — "reprogramados" son los que tienen un motivo
  // cargado (eso solo se completa al reprogramar, no en la programación inicial).
  const mantenimiento: PanelMantenimientoResumen = {
    hechos: itemsMantenimiento.filter((i) => i.urgencia === "ok").length,
    porHacer: itemsMantenimiento.filter((i) => i.urgencia === "proximo" || i.urgencia === "nunca").length,
    vencidos: itemsMantenimiento.filter((i) => i.urgencia === "vencido").length,
    reprogramados: itemsMantenimiento.filter((i) => i.motivoLabel != null).length,
  };

  return {
    kpis: {
      totalSitios: sitios.length,
      consumoTotalW,
      informesPorTipo,
      tecnicosActivos,
      vehiculosTotal: (vehiculosRes.data ?? []).length,
      mantenimiento,
    },
    equipoPorModulo,
    sitios,
    vencimientos: vencimientosRelevantes.slice(0, MAX_VENCIMIENTOS),
  };
}
