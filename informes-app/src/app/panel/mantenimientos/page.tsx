import { createClient } from "@/lib/supabase/server";
import { getPanelMantenimientos, getMantenimientosRealizados } from "@/lib/panel/mantenimientos";
import { getDotacionEstimada } from "@/lib/panel/mantenimiento-dotacion";
import { PlanMantenimiento } from "@/components/panel/plan-mantenimiento";

export default async function PanelMantenimientosPage() {
  const supabase = await createClient();
  const [{ items, kpis }, realizados, dotacion] = await Promise.all([
    getPanelMantenimientos(supabase),
    getMantenimientosRealizados(supabase),
    getDotacionEstimada(supabase),
  ]);

  return (
    <div>
      <div className="panel-topbar">
        <div>
          <h1>Plan de Mantenimiento</h1>
          <p>Programación, calendario, historial y dotación necesaria para cumplirlo</p>
        </div>
      </div>
      <PlanMantenimiento items={items} kpis={kpis} realizados={realizados} dotacion={dotacion} />
    </div>
  );
}
