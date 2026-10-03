import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { NuevaRendicionForm } from "@/components/rendicion-gastos/nueva-rendicion-form";
import type { Ubicacion } from "@/components/ubicaciones/types";

export default async function NuevaRendicionPage() {
  await requireProfile();
  const supabase = await createClient();

  const [provinciasRes, ubicacionesRes] = await Promise.all([
    supabase.from("catalogo_provincias").select("nombre").order("nombre"),
    supabase.from("ubicaciones").select("id, pais, region, provincia, localidad, sitio, planta, oficina, lat, lng").order("sitio"),
  ]);

  const ubicaciones: Ubicacion[] = ubicacionesRes.data ?? [];

  return <NuevaRendicionForm provincias={(provinciasRes.data ?? []).map((p) => p.nombre)} ubicaciones={ubicaciones} />;
}
