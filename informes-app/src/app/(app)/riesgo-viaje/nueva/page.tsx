import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { NuevaEvaluacionRiesgoViajeForm } from "@/components/riesgo-viaje/nueva-evaluacion-form";

export default async function NuevaEvaluacionRiesgoViajePage() {
  await requireProfile();
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
