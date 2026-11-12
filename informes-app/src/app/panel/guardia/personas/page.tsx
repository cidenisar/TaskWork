import { createClient } from "@/lib/supabase/server";
import { PersonasGuardiaCard, type PersonaGuardiaRow } from "@/components/panel/guardia/personas-guardia-card";
import type { AreaGuardia } from "@/lib/guardia/cronograma";

export default async function PersonasGuardiaPage() {
  const supabase = await createClient();
  const [{ data: tecnicos }, { data: asignaciones }] = await Promise.all([
    supabase.from("profiles").select("id, nombre_completo, telefono, activo").eq("rol", "tecnico").order("nombre_completo"),
    supabase.from("guardia_persona").select("usuario_id, area, orden"),
  ]);

  const areasPorUsuario = new Map<string, { area: AreaGuardia; orden: number }[]>();
  for (const a of asignaciones ?? []) {
    areasPorUsuario.set(a.usuario_id, [...(areasPorUsuario.get(a.usuario_id) ?? []), { area: a.area as AreaGuardia, orden: a.orden }]);
  }
  const filas: PersonaGuardiaRow[] = (tecnicos ?? []).map((t) => ({
    id: t.id,
    nombreCompleto: t.nombre_completo,
    telefono: t.telefono,
    activo: t.activo,
    areas: areasPorUsuario.get(t.id) ?? [],
  }));

  return (
    <div>
      <div className="page-heading">
        <h1>Personas</h1>
        <p>Quién hace cada guardia — un técnico puede cubrir su sector y además la General. El orden define la rotación dentro de cada área.</p>
      </div>
      <PersonasGuardiaCard personas={filas} />
    </div>
  );
}
