import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { NuevaRendicionForm } from "@/components/rendicion-gastos/nueva-rendicion-form";
import { fetchTodasLasUbicaciones } from "@/lib/ubicaciones/fetch-todas";

export default async function NuevaRendicionPage() {
  await requireProfile();
  const supabase = await createClient();

  const [provinciasRes, ubicaciones] = await Promise.all([
    supabase.from("catalogo_provincias").select("nombre").order("nombre"),
    fetchTodasLasUbicaciones(supabase),
  ]);

  return <NuevaRendicionForm provincias={(provinciasRes.data ?? []).map((p) => p.nombre)} ubicaciones={ubicaciones} />;
}
