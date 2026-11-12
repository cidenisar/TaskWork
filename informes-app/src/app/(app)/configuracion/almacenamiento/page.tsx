import { requireProfile } from "@/lib/auth";
import { puedeVerConfiguracion } from "@/lib/types";
import { LockedPanel } from "@/components/locked-panel";
import { createClient } from "@/lib/supabase/server";
import { HistorialAlmacenamientoCard } from "@/components/config/historial-almacenamiento";

export default async function ConfiguracionAlmacenamientoPage() {
  const profile = await requireProfile();

  if (!puedeVerConfiguracion(profile.rol)) {
    return (
      <LockedPanel title="Solo para administradores" description="Pedile acceso a tu responsable si necesitás cambiar la política de almacenamiento." />
    );
  }

  const supabase = await createClient();
  const { data } = await supabase
    .from("config_general")
    .select("umbral_aviso_historial, recordatorio_semanal_archivo, liberacion_automatica_activa")
    .eq("id", 1)
    .single();

  return (
    <div>
      <div className="page-heading">
        <h1>Almacenamiento</h1>
        <p>Umbral de aviso, recordatorio semanal y liberación automática de archivos viejos</p>
      </div>
      <HistorialAlmacenamientoCard
        umbral={data?.umbral_aviso_historial ?? "20"}
        recordatorio={data?.recordatorio_semanal_archivo ?? true}
        liberacionAutomatica={data?.liberacion_automatica_activa ?? false}
      />
    </div>
  );
}
