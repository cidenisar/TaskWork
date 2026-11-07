import { createClient } from "@/lib/supabase/server";
import { EvolucionRiesgoViaje, type EvaluacionEvolucionRow } from "@/components/panel/riesgo-viaje/evolucion-riesgo-viaje";

export default async function PanelRiesgoViajePage() {
  const supabase = await createClient();

  // RLS (evaluaciones_riesgo_viaje_select_stats) ya limita esto a Admin/Supervisor.
  const { data: evaluaciones } = await supabase
    .from("evaluaciones_riesgo_viaje")
    .select("id, vehiculo_id, conductor_nombre, fecha_hora, origen, destino, total, nivel_riesgo, estado_viaje")
    .order("fecha_hora", { ascending: true });

  const vehiculoIds = [...new Set((evaluaciones ?? []).map((e) => e.vehiculo_id))];
  const { data: vehiculosData } =
    vehiculoIds.length > 0 ? await supabase.from("catalogo_vehiculos").select("id, patente").in("id", vehiculoIds) : { data: [] };
  const patentePorVehiculo = new Map((vehiculosData ?? []).map((v) => [v.id, v.patente]));

  const filas: EvaluacionEvolucionRow[] = (evaluaciones ?? []).map((e) => ({
    id: e.id,
    vehiculoPatente: patentePorVehiculo.get(e.vehiculo_id) ?? "—",
    conductorNombre: e.conductor_nombre,
    fechaHora: e.fecha_hora,
    origen: e.origen,
    destino: e.destino,
    total: e.total,
    nivelRiesgo: e.nivel_riesgo,
    estadoViaje: e.estado_viaje,
  }));

  return <EvolucionRiesgoViaje evaluaciones={filas} />;
}
