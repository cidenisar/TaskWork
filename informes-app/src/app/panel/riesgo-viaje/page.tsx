import { createClient } from "@/lib/supabase/server";
import { RiesgoViajePanel, type EvaluacionPanelRow } from "@/components/panel/riesgo-viaje/riesgo-viaje-panel";

export default async function PanelRiesgoViajePage() {
  const supabase = await createClient();

  // RLS (evaluaciones_riesgo_viaje_select_stats) ya limita esto a Admin/Supervisor.
  const { data: evaluaciones } = await supabase
    .from("evaluaciones_riesgo_viaje")
    .select(
      "id, vehiculo_id, conductor_nombre, fecha_hora, origen, destino, total, nivel_riesgo, estado_viaje, pdf_url, clima_descripcion, iniciado_at, criterio_a_distancia, criterio_b_tiempo_viaje, criterio_c_clima, criterio_d_tipo_ruta, criterio_e_conocimiento, criterio_f_comunicacion, criterio_g_personas_vehiculo, criterio_h_horas_trabajadas",
    )
    .order("fecha_hora", { ascending: true });

  const vehiculoIds = [...new Set((evaluaciones ?? []).map((e) => e.vehiculo_id))];
  const { data: vehiculosData } =
    vehiculoIds.length > 0 ? await supabase.from("catalogo_vehiculos").select("id, patente").in("id", vehiculoIds) : { data: [] };
  const patentePorVehiculo = new Map((vehiculosData ?? []).map((v) => [v.id, v.patente]));

  const filas: EvaluacionPanelRow[] = (evaluaciones ?? []).map((e) => ({
    id: e.id,
    vehiculoPatente: patentePorVehiculo.get(e.vehiculo_id) ?? "—",
    conductorNombre: e.conductor_nombre,
    fechaHora: e.fecha_hora,
    origen: e.origen,
    destino: e.destino,
    total: e.total,
    nivelRiesgo: e.nivel_riesgo,
    estadoViaje: e.estado_viaje,
    pdfDisponible: !!e.pdf_url,
    climaDescripcion: e.clima_descripcion,
    iniciadoAt: e.iniciado_at,
    criterios: {
      distancia: e.criterio_a_distancia,
      tiempoViaje: e.criterio_b_tiempo_viaje,
      clima: e.criterio_c_clima,
      tipoRuta: e.criterio_d_tipo_ruta,
      conocimiento: e.criterio_e_conocimiento,
      comunicacion: e.criterio_f_comunicacion,
      personasPorVehiculo: e.criterio_g_personas_vehiculo,
      horasTrabajadas: e.criterio_h_horas_trabajadas,
    },
  }));

  return <RiesgoViajePanel evaluaciones={filas} />;
}
