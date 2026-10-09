import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getPanelMantenimientos, getMantenimientosRealizados } from "@/lib/panel/mantenimientos";
import { getDotacionEstimada } from "@/lib/panel/mantenimiento-dotacion";
import { PlanMantenimiento } from "@/components/panel/plan-mantenimiento";

export default async function PanelMantenimientosPage() {
  const profile = await requireProfile();
  const supabase = await createClient();
  const [{ items, kpis }, realizados, dotacion, intervalosRes, configRes, checklistItemsRes] = await Promise.all([
    getPanelMantenimientos(supabase),
    getMantenimientosRealizados(supabase),
    getDotacionEstimada(supabase),
    supabase.from("mantenimiento_intervalos").select("tipo_equipo, categoria, frecuencia_dias"),
    supabase.from("config_general").select("pdm_horas_por_dia, pdm_dias_habiles_anio, pdm_horas_por_visita, pdm_velocidad_kmh").eq("id", 1).single(),
    supabase.from("mantenimiento_checklist_items").select("id, tipo_equipo, categoria, texto").order("orden"),
  ]);
  const intervalos = (intervalosRes.data ?? []).map((i) => ({ tipoEquipo: i.tipo_equipo, categoria: i.categoria, frecuenciaDias: i.frecuencia_dias }));
  const checklistItems = (checklistItemsRes.data ?? []).map((i) => ({ id: i.id, tipoEquipo: i.tipo_equipo, categoria: i.categoria, texto: i.texto }));
  const supuestosDotacion = {
    horasPorDia: Number(configRes.data?.pdm_horas_por_dia ?? 8),
    diasHabilesAnio: Number(configRes.data?.pdm_dias_habiles_anio ?? 230),
    horasPorVisita: Number(configRes.data?.pdm_horas_por_visita ?? 2),
    velocidadKmh: Number(configRes.data?.pdm_velocidad_kmh ?? 60),
  };

  return (
    <div>
      <div className="panel-topbar">
        <div>
          <h1>Plan de Mantenimiento</h1>
          <p>Programación, calendario, historial y dotación necesaria para cumplirlo</p>
        </div>
      </div>
      <PlanMantenimiento
        items={items}
        kpis={kpis}
        realizados={realizados}
        dotacion={dotacion}
        esAdmin={profile.rol === "admin"}
        intervalos={intervalos}
        supuestosDotacion={supuestosDotacion}
        checklistItems={checklistItems}
      />
    </div>
  );
}
