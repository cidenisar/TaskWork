import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { NuevoRelevamientoSalaForm } from "@/components/salas/nuevo-relevamiento-form";
import { fetchTodasLasUbicaciones } from "@/lib/ubicaciones/fetch-todas";

export default async function NuevaSalaPage() {
  await requireProfile();
  const supabase = await createClient();

  const [ubicaciones, provinciasRes, hallazgosRes] = await Promise.all([
    fetchTodasLasUbicaciones(supabase),
    supabase.from("catalogo_provincias").select("nombre").order("nombre"),
    supabase.from("catalogo_inspeccion_ia").select("id, texto").eq("modulo", "salas").order("orden"),
  ]);
  const provincias = (provinciasRes.data ?? []).map((p) => p.nombre);

  return (
    <div>
      <NuevoRelevamientoSalaForm ubicaciones={ubicaciones} provincias={provincias} catalogoHallazgos={hallazgosRes.data ?? []} />
    </div>
  );
}
