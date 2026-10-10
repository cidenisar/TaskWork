import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { FlotaVehiculos } from "@/components/panel/vehiculos/flota-vehiculos";

export default async function PanelVehiculosPage() {
  const profile = await requireProfile();
  const supabase = await createClient();

  const [vehiculosRes, servicesRes] = await Promise.all([
    supabase
      .from("catalogo_vehiculos")
      .select(
        "id, patente, marca_modelo, vencimiento_tarjeta_verde, vencimiento_rto, kilometraje_actual, estado_alta, tiene_danios_alta",
      )
      .order("patente"),
    supabase.from("vehiculo_services").select("id, vehiculo_id, fecha, kilometraje, descripcion").order("fecha", { ascending: false }),
  ]);

  const patentePorVehiculo = new Map((vehiculosRes.data ?? []).map((v) => [v.id, v.patente]));

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
