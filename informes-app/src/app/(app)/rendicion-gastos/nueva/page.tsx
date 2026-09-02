import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { NuevaRendicionForm } from "@/components/rendicion-gastos/nueva-rendicion-form";

export default async function NuevaRendicionPage() {
  await requireProfile();
  const supabase = await createClient();

  const { data: provinciasRes } = await supabase.from("catalogo_provincias").select("nombre").order("nombre");

  return <NuevaRendicionForm provincias={(provinciasRes ?? []).map((p) => p.nombre)} />;
}
