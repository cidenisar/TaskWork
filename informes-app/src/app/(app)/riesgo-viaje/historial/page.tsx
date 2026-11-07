import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { HistorialRiesgoViaje, type EvaluacionRiesgoViajeRow } from "@/components/riesgo-viaje/historial";

export default async function HistorialRiesgoViajePage() {
  const profile = await requireProfile();
  const supabase = await createClient();

  // RLS (evaluaciones_riesgo_viaje_select_own) ya limita esto a lo propio, o a todo si sos Admin/Supervisor.
  const { data: evaluaciones } = await supabase
    .from("evaluaciones_riesgo_viaje")
    .select(
      "id, numero_generacion, vehiculo_id, conductor_nombre, fecha_hora, origen, destino, punto_medio, total, nivel_riesgo, mensaje_riesgo, estado_viaje, pdf_url, created_by",
    )
    .order("fecha_hora", { ascending: false });

  const vehiculoIds = [...new Set((evaluaciones ?? []).map((e) => e.vehiculo_id))];
  const { data: vehiculosData } =
    vehiculoIds.length > 0 ? await supabase.from("catalogo_vehiculos").select("id, patente").in("id", vehiculoIds) : { data: [] };
  const patentePorVehiculo = new Map((vehiculosData ?? []).map((v) => [v.id, v.patente]));

  const filas: EvaluacionRiesgoViajeRow[] = (evaluaciones ?? []).map((e) => ({
    id: e.id,
    numeroGeneracion: e.numero_generacion,
    vehiculoPatente: patentePorVehiculo.get(e.vehiculo_id) ?? "—",
    conductorNombre: e.conductor_nombre,
    fechaHora: e.fecha_hora,
    origen: e.origen,
    destino: e.destino,
    tienePuntoMedio: !!e.punto_medio,
    total: e.total,
    nivelRiesgo: e.nivel_riesgo,
    mensajeRiesgo: e.mensaje_riesgo,
    estadoViaje: e.estado_viaje,
    pdfDisponible: !!e.pdf_url,
    esPropia: e.created_by === profile.id,
  }));

  const esAdmin = profile.rol === "admin" || profile.rol === "supervisor" || profile.rol === "superusuario";

  return <HistorialRiesgoViaje evaluaciones={filas} esAdmin={esAdmin} />;
}
