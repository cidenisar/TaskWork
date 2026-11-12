import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { cargarAreasDe } from "@/lib/guardia/datos";
import { esGuardiaGeneral } from "@/lib/guardia/permisos";
import { fetchTodasLasUbicaciones } from "@/lib/ubicaciones/fetch-todas";
import { NuevoEventoGuardiaForm } from "@/components/guardia/nuevo-evento-form";

export default async function NuevoEventoGuardiaPage() {
  const profile = await requireProfile();
  const supabase = await createClient();
  const areas = await cargarAreasDe(supabase, profile.id);

  if (!esGuardiaGeneral({ rol: profile.rol, areas })) {
    return (
      <div className="card">
        <p className="empty-note">Solo la guardia general puede registrar una llamada.</p>
      </div>
    );
  }

  const [provinciasRes, ubicaciones, tiposAlarmaRes] = await Promise.all([
    supabase.from("catalogo_provincias").select("nombre").order("nombre"),
    fetchTodasLasUbicaciones(supabase),
    supabase.from("guardia_tipo_alarma").select("nombre").eq("activo", true).order("nombre"),
  ]);

  return (
    <div>
      <div className="page-heading">
        <h1>Registrar llamada</h1>
        <p>Lo que comentó operación central — tipo de alarma, sitio y ticket</p>
      </div>
      <NuevoEventoGuardiaForm
        provincias={(provinciasRes.data ?? []).map((p) => p.nombre)}
        ubicaciones={ubicaciones}
        tiposAlarma={(tiposAlarmaRes.data ?? []).map((t) => t.nombre)}
      />
    </div>
  );
}
