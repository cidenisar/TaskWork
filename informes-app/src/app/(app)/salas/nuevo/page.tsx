import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { NuevoRelevamientoSalaForm } from "@/components/salas/nuevo-relevamiento-form";
import { fetchTodasLasUbicaciones } from "@/lib/ubicaciones/fetch-todas";

export default async function NuevaSalaPage() {
  await requireProfile();
  const supabase = await createClient();

  const [ubicaciones, provinciasRes] = await Promise.all([
    fetchTodasLasUbicaciones(supabase),
    supabase.from("catalogo_provincias").select("nombre").order("nombre"),
  ]);
  const provincias = (provinciasRes.data ?? []).map((p) => p.nombre);

  return (
    <div>
      <NuevoRelevamientoSalaForm ubicaciones={ubicaciones} provincias={provincias} />
    </div>
  );
}
