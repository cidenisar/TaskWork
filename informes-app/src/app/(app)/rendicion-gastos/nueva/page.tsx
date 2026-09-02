import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { RendicionGastosWizard } from "@/components/rendicion-gastos/wizard";

export default async function NuevaRendicionPage() {
  await requireProfile();
  const supabase = await createClient();

  const [provinciasRes, categoriasRes, tecnicosRes, torresRes] = await Promise.all([
    supabase.from("catalogo_provincias").select("nombre").order("nombre"),
    supabase.from("catalogo_categorias_gasto").select("nombre").order("nombre"),
    supabase.from("catalogo_tecnicos").select("nombre_completo, torre").order("nombre_completo"),
    supabase.from("catalogo_torres").select("nombre").order("nombre"),
  ]);

  return (
    <RendicionGastosWizard
      catalogos={{
        provincias: (provinciasRes.data ?? []).map((p) => p.nombre),
        categoriasGasto: (categoriasRes.data ?? []).map((c) => c.nombre),
        tecnicos: (tecnicosRes.data ?? []).map((t) => ({ nombre: t.nombre_completo, torre: t.torre })),
        torres: (torresRes.data ?? []).map((t) => t.nombre),
      }}
    />
  );
}
