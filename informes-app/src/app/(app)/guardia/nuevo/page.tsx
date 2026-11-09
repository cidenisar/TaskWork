import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { cargarAreaDe } from "@/lib/guardia/datos";
import { esGuardiaGeneral } from "@/lib/guardia/permisos";
import { NuevoEventoGuardiaForm } from "@/components/guardia/nuevo-evento-form";

export default async function NuevoEventoGuardiaPage() {
  const profile = await requireProfile();
  const supabase = await createClient();
  const area = await cargarAreaDe(supabase, profile.id);

  if (!esGuardiaGeneral({ rol: profile.rol, area })) {
    return (
      <div className="card">
        <p className="empty-note">Solo la guardia general puede registrar una llamada.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="page-heading">
        <h1>Registrar llamada</h1>
        <p>Lo que comentó operación central — tipo de alarma, sitio y ticket</p>
      </div>
      <NuevoEventoGuardiaForm />
    </div>
  );
}
