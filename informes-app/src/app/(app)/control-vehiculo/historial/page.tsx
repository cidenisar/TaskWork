import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { HistorialControlVehiculo, type ControlVehiculoRow } from "@/components/control-vehiculo/historial";

/** RLS (vehiculo_services_select) deja ver todos los controles — el historial de un vehículo le sirve a cualquiera que lo maneje, no es un dato propio de quien lo cargó. */
export default async function HistorialControlVehiculoPage() {
  await requireProfile();
  const supabase = await createClient();

  const { data: controles } = await supabase
    .from("vehiculo_services")
    .select(
      "id, vehiculo_id, fecha, kilometraje, estado_general, tiene_danios, inconsistencias_detectadas, fotos_exterior_urls, fotos_interior_urls, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(100);

  const vehiculoIds = [...new Set((controles ?? []).map((c) => c.vehiculo_id))];
  const { data: vehiculosData } =
    vehiculoIds.length > 0 ? await supabase.from("catalogo_vehiculos").select("id, patente").in("id", vehiculoIds) : { data: [] };
  const patentePorVehiculo = new Map((vehiculosData ?? []).map((v) => [v.id, v.patente]));

  // vehiculo-docs es un bucket privado — se firman todas las fotos juntas en un solo pedido en vez de una llamada por control.
  const todosLosPaths = (controles ?? []).flatMap((c) => [...(c.fotos_exterior_urls ?? []), ...(c.fotos_interior_urls ?? [])]);
  const urlFirmadaPorPath = new Map<string, string>();
  if (todosLosPaths.length > 0) {
    const { data: firmadas } = await supabase.storage.from("vehiculo-docs").createSignedUrls(todosLosPaths, 3600);
    for (const f of firmadas ?? []) {
      if (f.signedUrl && !f.error) urlFirmadaPorPath.set(f.path ?? "", f.signedUrl);
    }
  }

  const filas: ControlVehiculoRow[] = (controles ?? []).map((c) => ({
    id: c.id,
    vehiculoPatente: patentePorVehiculo.get(c.vehiculo_id) ?? "—",
    fecha: c.fecha,
    kilometraje: Number(c.kilometraje),
    estadoGeneral: c.estado_general,
    tieneDanios: c.tiene_danios,
    inconsistenciasDetectadas: c.inconsistencias_detectadas,
    fotos: [...(c.fotos_exterior_urls ?? []), ...(c.fotos_interior_urls ?? [])]
      .map((p) => urlFirmadaPorPath.get(p))
      .filter((u): u is string => !!u),
  }));

  return <HistorialControlVehiculo controles={filas} />;
}
