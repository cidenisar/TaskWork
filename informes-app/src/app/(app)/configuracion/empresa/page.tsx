import { requireProfile } from "@/lib/auth";
import { puedeVerConfiguracion } from "@/lib/types";
import { LockedPanel } from "@/components/locked-panel";
import { createClient } from "@/lib/supabase/server";
import { EmpresaCard } from "@/components/config/empresa";

export default async function ConfiguracionEmpresaPage() {
  const profile = await requireProfile();

  if (!puedeVerConfiguracion(profile.rol)) {
    return <LockedPanel title="Solo para administradores" description="Pedile acceso a tu responsable si necesitás cambiar el logo de la empresa." />;
  }

  const supabase = await createClient();
  const { data } = await supabase.from("config_general").select("logo_empresa_url, nombre_empresa").eq("id", 1).single();

  return (
    <div>
      <div className="page-heading">
        <h1>Empresa</h1>
        <p>Logo y nombre que aparecen en los PDF y planos que se generan</p>
      </div>
      <EmpresaCard logoUrl={data?.logo_empresa_url ?? null} nombre={data?.nombre_empresa ?? ""} />
    </div>
  );
}
