import { createClient } from "@/lib/supabase/server";
import { NuevaEvaluacionRiesgoViajeForm } from "@/components/riesgo-viaje/nueva-evaluacion-form";

/** Mismo formulario que usa el técnico desde el celu (/riesgo-viaje/nueva) — Admin/Supervisor
 * también puede cargar una evaluación directo desde acá. El gate Admin/Supervisor ya lo pone
 * el layout del Panel; cualquier profile puede insertar (RLS evaluaciones_riesgo_viaje_insert). */
export default async function PanelNuevaEvaluacionRiesgoViajePage() {
  const supabase = await createClient();

  const [vehiculosRes, tecnicosRes, configRes] = await Promise.all([
    supabase.from("catalogo_vehiculos").select("id, patente, marca_modelo").order("patente"),
    supabase.from("profiles").select("nombre_completo").eq("activo", true).order("nombre_completo"),
    supabase.from("config_general").select("nombre_empresa").eq("id", 1).single(),
  ]);

  return (
    <NuevaEvaluacionRiesgoViajeForm
      vehiculos={(vehiculosRes.data ?? []).map((v) => ({ id: v.id, patente: v.patente, marcaModelo: v.marca_modelo }))}
      tecnicos={(tecnicosRes.data ?? []).map((t) => t.nombre_completo)}
      empresaDefault={configRes.data?.nombre_empresa ?? ""}
    />
  );
}
