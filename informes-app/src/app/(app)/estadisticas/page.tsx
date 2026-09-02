import { requireProfile } from "@/lib/auth";
import { puedeVerEstadisticas } from "@/lib/types";
import { LockedPanel } from "@/components/locked-panel";
import { createClient } from "@/lib/supabase/server";
import { getEstadisticasBase } from "@/lib/estadisticas/aggregates";
import { KpiGrid } from "@/components/estadisticas/kpi-grid";
import { BarList } from "@/components/estadisticas/bar-list";
import { InsightsCard } from "@/components/estadisticas/insights-card";
import { AsistenteCard } from "@/components/estadisticas/asistente-card";
import { HeatmapCard } from "@/components/estadisticas/heatmap-card";
import { ComparacionCard } from "@/components/estadisticas/comparacion";
import { VerificacionFotosCard } from "@/components/estadisticas/verificacion-fotos";
import { MantenimientoPredictivoCard } from "@/components/estadisticas/mantenimiento-predictivo";

const MAX_CANDIDATOS_VERIFICACION = 5;

export default async function EstadisticasPage() {
  const profile = await requireProfile();

  if (!puedeVerEstadisticas(profile.rol)) {
    return (
      <LockedPanel
        title="Solo para administradores"
        description="Las estadísticas del equipo (informes, gastos y actividad) solo las puede ver un Administrador o un Supervisor. Pedile acceso a tu responsable si las necesitás."
      />
    );
  }

  const supabase = await createClient();
  const base = await getEstadisticasBase(supabase);

  const { data: recientes } = await supabase
    .from("informes_tecnicos")
    .select("id, numero_generacion, titulo")
    .not("descripcion_trabajo", "is", null)
    .order("fecha", { ascending: false })
    .limit(15);
  const idsRecientes = (recientes ?? []).map((i) => i.id);
  const { data: imagenesRecientes } =
    idsRecientes.length > 0
      ? await supabase.from("informe_imagenes").select("informe_id").in("informe_id", idsRecientes)
      : { data: [] as { informe_id: string }[] };
  const conFotos = new Set((imagenesRecientes ?? []).map((i) => i.informe_id));
  const candidatosVerificacion = (recientes ?? [])
    .filter((i) => conFotos.has(i.id))
    .slice(0, MAX_CANDIDATOS_VERIFICACION)
    .map((i) => ({ id: i.id, numeroGeneracion: i.numero_generacion, titulo: i.titulo }));

  return (
    <div>
      <div className="page-heading">
        <h1>Estadísticas</h1>
        <p>Vista general de informes, gastos y actividad del equipo — {base.mesActualLabel}</p>
      </div>

      <KpiGrid kpis={base.kpis} />

      <div className="card">
        <div className="section-label">Gastos por categoría (este mes)</div>
        <BarList items={base.gastosPorCategoria.map((g) => ({ label: g.categoria, value: g.monto, displayValue: `ARS ${g.monto.toLocaleString("es-AR")}` }))} />
      </div>

      <div className="card">
        <div className="section-label">Informes por técnico (este mes)</div>
        <BarList items={base.informesPorTecnico.map((t) => ({ label: t.nombre, value: t.cantidad, displayValue: String(t.cantidad) }))} />
      </div>

      <InsightsCard />
      <AsistenteCard />
      <HeatmapCard points={base.heatmapPoints} />
      <MantenimientoPredictivoCard alertas={base.mantenimientoPredictivo} />
      <ComparacionCard grupos={base.comparacionPorTorre} />
      <VerificacionFotosCard candidatos={candidatosVerificacion} />
    </div>
  );
}
