import { requireProfile } from "@/lib/auth";
import { puedeVerConfiguracion } from "@/lib/types";
import { LockedPanel } from "@/components/locked-panel";
import { createClient } from "@/lib/supabase/server";
import { ResumenSemanalCard } from "@/components/config/resumen-semanal";

export default async function ConfiguracionResumenSemanalPage() {
  const profile = await requireProfile();

  if (!puedeVerConfiguracion(profile.rol)) {
    return <LockedPanel title="Solo para administradores" description="Pedile acceso a tu responsable si necesitás cambiar el resumen semanal." />;
  }

  const supabase = await createClient();
  const { data } = await supabase.from("config_general").select("resumen_semanal_ia").eq("id", 1).single();

  return (
    <div>
      <div className="page-heading">
        <h1>Resumen semanal IA</h1>
        <p>El mensaje que la IA redacta cada semana con lo que hizo el equipo</p>
      </div>
      <ResumenSemanalCard activo={data?.resumen_semanal_ia ?? true} />
    </div>
  );
}
