import { createClient } from "@/lib/supabase/server";
import { PersonasGuardiaCard, type PersonaGuardiaRow } from "@/components/panel/guardia/personas-guardia-card";

export default async function PersonasGuardiaPage() {
  const supabase = await createClient();
  const [{ data: tecnicos }, { data: asignaciones }] = await Promise.all([
    supabase.from("profiles").select("id, nombre_completo, telefono, activo").eq("rol", "tecnico").order("nombre_completo"),
    supabase.from("guardia_persona").select("usuario_id, area, orden"),
  ]);

  const porUsuario = new Map((asignaciones ?? []).map((a) => [a.usuario_id, a]));
  const filas: PersonaGuardiaRow[] = (tecnicos ?? []).map((t) => {
    const asignacion = porUsuario.get(t.id);
    return {
      id: t.id,
      nombreCompleto: t.nombre_completo,
      telefono: t.telefono,
      activo: t.activo,
      area: asignacion?.area ?? null,
      orden: asignacion?.orden ?? 0,
    };
  });

  return (
    <div>
      <div className="page-heading">
        <h1>Personas</h1>
        <p>Quién hace cada guardia — un técnico hace una sola (o ninguna). El orden define la rotación dentro de cada área.</p>
      </div>
      <PersonasGuardiaCard personas={filas} />
    </div>
  );
}
