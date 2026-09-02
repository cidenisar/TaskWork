import type { createClient } from "@/lib/supabase/server";
import { addMonths, daysBetween, inRange, monthLabel, startOfMonth, toIsoDate } from "./dates";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export interface ComparacionTecnico {
  nombre: string;
  informes: number;
  gastosArs: number;
}
export interface ComparacionTorre {
  torre: string;
  tecnicos: ComparacionTecnico[];
  promedioInformes: number;
  outlier: { nombre: string; mensaje: string } | null;
}
export interface AlertaUbicacion {
  ubicacion: string;
  cantidad: number;
  ventanaDias: number;
  urgencia: "warn" | "danger";
  mensaje: string;
}
export interface HeatmapPoint {
  lat: number;
  lon: number;
}

export interface InsightsContext {
  mesActual: string;
  mesAnterior: string;
  gastosPorCategoriaMesActual: { categoria: string; monto: number }[];
  gastosPorCategoriaMesAnterior: { categoria: string; monto: number }[];
  pctSeguridadMesActual: number | null;
  pctSeguridadMesAnterior: number | null;
  ubicacionesRepetidas: { ubicacion: string; cantidad: number }[];
  rendicionesAbiertasHaceMucho: { numeroGeneracion: string; dias: number }[];
}

export interface EstadisticasBase {
  mesActualLabel: string;
  kpis: {
    informesEsteMes: number;
    gastadoEsteMesArs: number;
    gastadoEsteMesUsd: number;
    tecnicosActivos: number;
    rendicionesSinCerrar: number;
  };
  gastosPorCategoria: { categoria: string; monto: number }[];
  informesPorTecnico: { nombre: string; cantidad: number }[];
  comparacionPorTorre: ComparacionTorre[];
  mantenimientoPredictivo: AlertaUbicacion[];
  heatmapPoints: HeatmapPoint[];
  insightsContext: InsightsContext;
}

const VENTANA_PREDICTIVA_DIAS = 90;
const MIN_INTERVENCIONES_PREDICTIVO = 3;

export async function getEstadisticasBase(supabase: Supabase): Promise<EstadisticasBase> {
  const hoy = new Date();
  const inicioMesActual = startOfMonth(hoy);
  const inicioMesSiguiente = addMonths(inicioMesActual, 1);
  const inicioMesAnterior = addMonths(inicioMesActual, -1);
  const inicioVentana6Meses = addMonths(inicioMesActual, -6);

  const desde6m = toIsoDate(inicioVentana6Meses);
  const finMesActualExcl = toIsoDate(inicioMesSiguiente);
  const inicioMesActualStr = toIsoDate(inicioMesActual);
  const inicioMesAnteriorStr = toIsoDate(inicioMesAnterior);

  const [informesRes, asignadosRes, imagenesRes, rendicionesRes, gastosRes] = await Promise.all([
    supabase
      .from("informes_tecnicos")
      .select("id, fecha, ubicacion, numero_generacion")
      .gte("fecha", desde6m)
      .lt("fecha", finMesActualExcl),
    supabase.from("informe_tecnicos_asignados").select("informe_id, tecnico_nombre, torre, es_tecnico_seguridad"),
    supabase.from("informe_imagenes").select("lat, lon").not("lat", "is", null).not("lon", "is", null).limit(2000),
    supabase
      .from("rendiciones_gastos")
      .select("id, fecha, numero_generacion, estado, moneda")
      .gte("fecha", desde6m)
      .lt("fecha", finMesActualExcl),
    supabase.from("gastos").select("id, rendicion_id, fecha, categoria, monto"),
  ]);

  const informes = informesRes.data ?? [];
  const asignados = asignadosRes.data ?? [];
  const imagenes = imagenesRes.data ?? [];
  const rendiciones = rendicionesRes.data ?? [];
  const gastos = gastosRes.data ?? [];

  const rendicionById = new Map(rendiciones.map((r) => [r.id, r]));
  const asignadosPorInforme = new Map<string, typeof asignados>();
  for (const a of asignados) {
    const list = asignadosPorInforme.get(a.informe_id) ?? [];
    list.push(a);
    asignadosPorInforme.set(a.informe_id, list);
  }

  // ---- KPIs ----
  const informesEsteMes = informes.filter((i) => inRange(i.fecha, inicioMesActualStr, finMesActualExcl));
  let gastadoEsteMesArs = 0;
  let gastadoEsteMesUsd = 0;
  for (const g of gastos) {
    const rendicion = rendicionById.get(g.rendicion_id);
    if (!rendicion || !inRange(g.fecha, inicioMesActualStr, finMesActualExcl)) continue;
    if (rendicion.moneda === "USD") gastadoEsteMesUsd += Number(g.monto);
    else gastadoEsteMesArs += Number(g.monto);
  }
  const tecnicosActivosSet = new Set<string>();
  for (const i of informesEsteMes) {
    for (const a of asignadosPorInforme.get(i.id) ?? []) tecnicosActivosSet.add(a.tecnico_nombre);
  }
  const rendicionesSinCerrar = rendiciones.filter((r) => r.estado === "abierta").length;

  // ---- Gastos por categoría (ARS, este mes) ----
  const catTotales = new Map<string, number>();
  for (const g of gastos) {
    const rendicion = rendicionById.get(g.rendicion_id);
    if (!rendicion || rendicion.moneda !== "ARS" || !inRange(g.fecha, inicioMesActualStr, finMesActualExcl)) continue;
    catTotales.set(g.categoria, (catTotales.get(g.categoria) ?? 0) + Number(g.monto));
  }
  const gastosPorCategoria = Array.from(catTotales.entries())
    .map(([categoria, monto]) => ({ categoria, monto }))
    .sort((a, b) => b.monto - a.monto);

  // ---- Informes por técnico (este mes) ----
  const tecInformes = new Map<string, number>();
  for (const i of informesEsteMes) {
    for (const a of asignadosPorInforme.get(i.id) ?? []) {
      tecInformes.set(a.tecnico_nombre, (tecInformes.get(a.tecnico_nombre) ?? 0) + 1);
    }
  }
  const informesPorTecnico = Array.from(tecInformes.entries())
    .map(([nombre, cantidad]) => ({ nombre, cantidad }))
    .sort((a, b) => b.cantidad - a.cantidad);

  // ---- Comparación entre técnicos por torre (spec 8.7) ----
  const gastosArsPorTecnico = new Map<string, number>();
  // (los gastos no tienen "torre" propio por gasto salvo vía gasto_tecnicos; se omite acá
  // para no sumar otra query — la comparación usa cantidad de informes como base principal.)
  const torreDeTecnico = new Map<string, string>();
  for (const a of asignados) {
    if (a.torre) torreDeTecnico.set(a.tecnico_nombre, a.torre);
  }
  const porTorre = new Map<string, Map<string, ComparacionTecnico>>();
  for (const [nombre, cantidad] of tecInformes) {
    const torre = torreDeTecnico.get(nombre) || "Sin torre";
    const grupo = porTorre.get(torre) ?? new Map<string, ComparacionTecnico>();
    grupo.set(nombre, { nombre, informes: cantidad, gastosArs: gastosArsPorTecnico.get(nombre) ?? 0 });
    porTorre.set(torre, grupo);
  }
  const comparacionPorTorre: ComparacionTorre[] = Array.from(porTorre.entries())
    .filter(([, grupo]) => grupo.size >= 2)
    .map(([torre, grupo]) => {
      const tecnicos = Array.from(grupo.values()).sort((a, b) => b.informes - a.informes);
      const promedioInformes = tecnicos.reduce((s, t) => s + t.informes, 0) / tecnicos.length;
      const top = tecnicos[0];
      let outlier: ComparacionTorre["outlier"] = null;
      if (promedioInformes > 0 && top.informes >= promedioInformes * 1.5 && top.informes - promedioInformes >= 2) {
        const pct = Math.round(((top.informes - promedioInformes) / promedioInformes) * 100);
        outlier = {
          nombre: top.nombre,
          mensaje: `${top.nombre} generó un ${pct}% más informes que el promedio de ${torre} este mes — puede ser mayor carga asignada, vale la pena revisar el reparto.`,
        };
      }
      return { torre, tecnicos, promedioInformes, outlier };
    });

  // ---- Mantenimiento predictivo (spec 8.9): 3+ intervenciones en 90 días en la misma ubicación ----
  const porUbicacion = new Map<string, string[]>(); // ubicacion -> fechas
  for (const i of informes) {
    const ubic = (i.ubicacion || "").trim();
    if (!ubic) continue;
    const list = porUbicacion.get(ubic) ?? [];
    list.push(i.fecha);
    porUbicacion.set(ubic, list);
  }
  const mantenimientoPredictivo: AlertaUbicacion[] = [];
  for (const [ubicacion, fechas] of porUbicacion) {
    fechas.sort();
    const reciente = fechas.filter((f) => daysBetween(f, toIsoDate(hoy)) <= VENTANA_PREDICTIVA_DIAS);
    if (reciente.length >= MIN_INTERVENCIONES_PREDICTIVO) {
      mantenimientoPredictivo.push({
        ubicacion,
        cantidad: reciente.length,
        ventanaDias: VENTANA_PREDICTIVA_DIAS,
        urgencia: reciente.length >= MIN_INTERVENCIONES_PREDICTIVO + 1 ? "danger" : "warn",
        mensaje: `${reciente.length} intervenciones en los últimos ${VENTANA_PREDICTIVA_DIAS} días. Probabilidad de una nueva falla — conviene evaluar una revisión preventiva.`,
      });
    }
  }
  mantenimientoPredictivo.sort((a, b) => b.cantidad - a.cantidad);

  // ---- Mapa de calor ----
  const heatmapPoints: HeatmapPoint[] = imagenes
    .filter((img) => img.lat != null && img.lon != null)
    .map((img) => ({ lat: img.lat as number, lon: img.lon as number }));

  // ---- Contexto pre-agregado para los insights de IA (sección 8.4) ----
  const gastosPorCategoriaMesAnterior = new Map<string, number>();
  for (const g of gastos) {
    const rendicion = rendicionById.get(g.rendicion_id);
    if (!rendicion || rendicion.moneda !== "ARS" || !inRange(g.fecha, inicioMesAnteriorStr, inicioMesActualStr)) continue;
    gastosPorCategoriaMesAnterior.set(g.categoria, (gastosPorCategoriaMesAnterior.get(g.categoria) ?? 0) + Number(g.monto));
  }

  function pctSeguridad(informesDelMes: typeof informes): number | null {
    if (informesDelMes.length === 0) return null;
    let conSeguridad = 0;
    for (const i of informesDelMes) {
      if ((asignadosPorInforme.get(i.id) ?? []).some((a) => a.es_tecnico_seguridad)) conSeguridad++;
    }
    return Math.round((conSeguridad / informesDelMes.length) * 100);
  }
  const informesMesAnterior = informes.filter((i) => inRange(i.fecha, inicioMesAnteriorStr, inicioMesActualStr));

  const ubicacionesRepetidas = Array.from(porUbicacion.entries())
    .map(([ubicacion, fechas]) => ({ ubicacion, cantidad: fechas.length }))
    .filter((u) => u.cantidad >= 3)
    .sort((a, b) => b.cantidad - a.cantidad)
    .slice(0, 5);

  const rendicionesAbiertasHaceMucho = rendiciones
    .filter((r) => r.estado === "abierta")
    .map((r) => ({ numeroGeneracion: r.numero_generacion, dias: Math.round(daysBetween(r.fecha, toIsoDate(hoy))) }))
    .filter((r) => r.dias >= 15)
    .sort((a, b) => b.dias - a.dias);

  return {
    mesActualLabel: monthLabel(hoy),
    kpis: {
      informesEsteMes: informesEsteMes.length,
      gastadoEsteMesArs,
      gastadoEsteMesUsd,
      tecnicosActivos: tecnicosActivosSet.size,
      rendicionesSinCerrar,
    },
    gastosPorCategoria,
    informesPorTecnico,
    comparacionPorTorre,
    mantenimientoPredictivo,
    heatmapPoints,
    insightsContext: {
      mesActual: monthLabel(hoy),
      mesAnterior: monthLabel(inicioMesAnterior),
      gastosPorCategoriaMesActual: gastosPorCategoria,
      gastosPorCategoriaMesAnterior: Array.from(gastosPorCategoriaMesAnterior.entries()).map(([categoria, monto]) => ({
        categoria,
        monto,
      })),
      pctSeguridadMesActual: pctSeguridad(informesEsteMes),
      pctSeguridadMesAnterior: pctSeguridad(informesMesAnterior),
      ubicacionesRepetidas,
      rendicionesAbiertasHaceMucho,
    },
  };
}
