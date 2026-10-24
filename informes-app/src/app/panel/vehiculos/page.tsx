import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { FlotaVehiculos } from "@/components/panel/vehiculos/flota-vehiculos";

export default async function PanelVehiculosPage() {
  const profile = await requireProfile();
  const supabase = await createClient();

  const [vehiculosRes, servicesRes, hallazgosRes] = await Promise.all([
    supabase
      .from("catalogo_vehiculos")
      .select(
        "id, patente, marca_modelo, vencimiento_tarjeta_verde, vencimiento_rto, kilometraje_actual, estado_alta, tiene_danios_alta, fotos_exterior_urls, fotos_interior_urls",
      )
      .order("patente"),
    supabase.from("vehiculo_services").select("id, vehiculo_id, fecha, kilometraje, descripcion").order("fecha", { ascending: false }),
    // Solo los hallazgos detectados (no_ok) importan para el indicador de la
    // Flota — es un conteo a simple vista, no un detalle (eso queda para una
    // futura pantalla dedicada si hace falta).
    supabase.from("inspeccion_ia_hallazgos").select("registro_id").eq("modulo", "vehiculos").eq("estado", "no_ok"),
  ]);

  const patentePorVehiculo = new Map((vehiculosRes.data ?? []).map((v) => [v.id, v.patente]));

  const hallazgosNoOkPorVehiculo = new Map<string, number>();
  for (const h of hallazgosRes.data ?? []) {
    hallazgosNoOkPorVehiculo.set(h.registro_id, (hallazgosNoOkPorVehiculo.get(h.registro_id) ?? 0) + 1);
  }

  // vehiculo-docs es un bucket privado (solo Admin/Supervisor, ver RLS) — para
  // mostrar la galería hay que firmar cada path, no hay URL pública. Se firman
  // todas juntas en un solo pedido en vez de una llamada por vehículo.
  const todosLosPaths = (vehiculosRes.data ?? []).flatMap((v) => [...(v.fotos_exterior_urls ?? []), ...(v.fotos_interior_urls ?? [])]);
  const urlFirmadaPorPath = new Map<string, string>();
  if (todosLosPaths.length > 0) {
    const { data: firmadas } = await supabase.storage.from("vehiculo-docs").createSignedUrls(todosLosPaths, 3600);
    for (const f of firmadas ?? []) {
      if (f.signedUrl && !f.error) urlFirmadaPorPath.set(f.path ?? "", f.signedUrl);
    }
  }

  return (
    <FlotaVehiculos
      vehiculos={(vehiculosRes.data ?? []).map((v) => ({
        id: v.id,
        patente: v.patente,
        marcaModelo: v.marca_modelo,
        vencimientoTarjetaVerde: v.vencimiento_tarjeta_verde,
        vencimientoRto: v.vencimiento_rto,
        kilometrajeActual: v.kilometraje_actual,
        estadoAlta: v.estado_alta,
        tieneDaniosAlta: v.tiene_danios_alta,
        hallazgosNoOk: hallazgosNoOkPorVehiculo.get(v.id),
        fotosExterior: (v.fotos_exterior_urls ?? []).map((p) => urlFirmadaPorPath.get(p)).filter((u): u is string => !!u),
        fotosInterior: (v.fotos_interior_urls ?? []).map((p) => urlFirmadaPorPath.get(p)).filter((u): u is string => !!u),
      }))}
      services={(servicesRes.data ?? []).map((s) => ({
        id: s.id,
        vehiculoId: s.vehiculo_id,
        patente: patentePorVehiculo.get(s.vehiculo_id) ?? "—",
        fecha: s.fecha,
        kilometraje: Number(s.kilometraje),
        descripcion: s.descripcion,
      }))}
      esAdmin={profile.rol === "admin"}
    />
  );
}
