import { requireProfile } from "@/lib/auth";
import { puedeVerConfiguracion } from "@/lib/types";
import { LockedPanel } from "@/components/locked-panel";
import { createClient } from "@/lib/supabase/server";
import { CatalogosCard } from "@/components/config/catalogos-card";

export default async function ConfiguracionCatalogosPage() {
  const profile = await requireProfile();

  if (!puedeVerConfiguracion(profile.rol)) {
    return <LockedPanel title="Solo para administradores" description="Pedile acceso a tu responsable si necesitás editar los catálogos." />;
  }

  const supabase = await createClient();
  const [torresRes, clientesRes, provinciasRes, tiposRes, categoriasRes, vehiculosRes, servicesRes, tramosTorreRes, recursoAlturaRes] =
    await Promise.all([
      supabase.from("catalogo_torres").select("id, nombre").order("nombre"),
      supabase.from("catalogo_clientes").select("id, nombre").order("nombre"),
      supabase.from("catalogo_provincias").select("id, nombre").order("nombre"),
      supabase.from("catalogo_tipos_informe").select("id, nombre").order("nombre"),
      supabase.from("catalogo_categorias_gasto").select("id, nombre").order("nombre"),
      supabase
        .from("catalogo_vehiculos")
        .select("id, patente, marca_modelo, vencimiento_tarjeta_verde, vencimiento_rto, kilometraje_actual")
        .order("patente"),
      supabase.from("vehiculo_services").select("id, vehiculo_id, fecha, kilometraje, descripcion").order("fecha", { ascending: false }),
      supabase.from("torre_tipo_largos").select("tipo_torre, largo_tramo_m"),
      supabase.from("catalogo_recurso_altura").select("tipo_montaje, recurso_fijo, umbral_escalera_m"),
    ]);

  const patentePorVehiculo = new Map((vehiculosRes.data ?? []).map((v) => [v.id, v.patente]));

  return (
    <div>
      <div className="page-heading">
        <h1>Catálogos</h1>
        <p>Torres (cuadrillas), clientes, provincias, tipos de informe, categorías de gasto, vehículos y tramos de torre</p>
      </div>
      <CatalogosCard
        data={{
          torres: torresRes.data ?? [],
          clientes: clientesRes.data ?? [],
          provincias: provinciasRes.data ?? [],
          tiposInforme: tiposRes.data ?? [],
          categoriasGasto: categoriasRes.data ?? [],
          vehiculos: (vehiculosRes.data ?? []).map((v) => ({
            id: v.id,
            patente: v.patente,
            marcaModelo: v.marca_modelo,
            vencimientoTarjetaVerde: v.vencimiento_tarjeta_verde,
            vencimientoRto: v.vencimiento_rto,
            kilometrajeActual: v.kilometraje_actual,
          })),
          services: (servicesRes.data ?? []).map((s) => ({
            id: s.id,
            vehiculoId: s.vehiculo_id,
            patente: patentePorVehiculo.get(s.vehiculo_id) ?? "—",
            fecha: s.fecha,
            kilometraje: Number(s.kilometraje),
            descripcion: s.descripcion,
          })),
          tramosTorre: (tramosTorreRes.data ?? []).map((t) => ({ tipoTorre: t.tipo_torre, largoTramoM: Number(t.largo_tramo_m) })),
          recursoAltura: (recursoAlturaRes.data ?? []).map((r) => ({
            tipoMontaje: r.tipo_montaje,
            recursoFijo: r.recurso_fijo,
            umbralEscaleraM: r.umbral_escalera_m,
          })),
        }}
      />
    </div>
  );
}
