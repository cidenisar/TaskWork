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
  const [torresRes, clientesRes, provinciasRes, tiposRes, categoriasRes, tramosTorreRes, recursoAlturaRes, calibreCableRes, hallazgosRes] =
    await Promise.all([
      supabase.from("catalogo_torres").select("id, nombre").order("nombre"),
      supabase.from("catalogo_clientes").select("id, nombre").order("nombre"),
      supabase.from("catalogo_provincias").select("id, nombre").order("nombre"),
      supabase.from("catalogo_tipos_informe").select("id, nombre").order("nombre"),
      supabase.from("catalogo_categorias_gasto").select("id, nombre").order("nombre"),
      supabase.from("torre_tipo_largos").select("tipo_torre, largo_tramo_m"),
      supabase.from("catalogo_recurso_altura").select("tipo_montaje, recurso_fijo, umbral_escalera_m"),
      supabase.from("catalogo_calibre_cable").select("id, amperaje_max, calibre_mm2").order("amperaje_max"),
      supabase.from("catalogo_hallazgos_seguridad_tablero").select("id, orden, texto").order("orden"),
    ]);

  return (
    <div>
      <div className="page-heading">
        <h1>Catálogos</h1>
        <p>Torres (cuadrillas), clientes, provincias, tipos de informe, categorías de gasto y tramos de torre</p>
      </div>
      <CatalogosCard
        data={{
          torres: torresRes.data ?? [],
          clientes: clientesRes.data ?? [],
          provincias: provinciasRes.data ?? [],
          tiposInforme: tiposRes.data ?? [],
          categoriasGasto: categoriasRes.data ?? [],
          tramosTorre: (tramosTorreRes.data ?? []).map((t) => ({ tipoTorre: t.tipo_torre, largoTramoM: Number(t.largo_tramo_m) })),
          recursoAltura: (recursoAlturaRes.data ?? []).map((r) => ({
            tipoMontaje: r.tipo_montaje,
            recursoFijo: r.recurso_fijo,
            umbralEscaleraM: r.umbral_escalera_m,
          })),
          calibreCable: (calibreCableRes.data ?? []).map((c) => ({
            id: c.id,
            amperajeMax: Number(c.amperaje_max),
            calibreMm2: Number(c.calibre_mm2),
          })),
          hallazgosSeguridad: hallazgosRes.data ?? [],
        }}
      />
    </div>
  );
}
