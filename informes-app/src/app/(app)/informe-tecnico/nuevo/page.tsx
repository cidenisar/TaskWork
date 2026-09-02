import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { InformeTecnicoWizard } from "@/components/informe-tecnico/wizard";

export default async function NuevoInformePage() {
  await requireProfile();
  const supabase = await createClient();

  const [tiposRes, provinciasRes, tecnicosRes, torresRes, configRes, emailsRes] = await Promise.all([
    supabase.from("catalogo_tipos_informe").select("nombre").order("nombre"),
    supabase.from("catalogo_provincias").select("nombre").order("nombre"),
    supabase.from("catalogo_tecnicos").select("nombre_completo, torre").order("nombre_completo"),
    supabase.from("catalogo_torres").select("nombre").order("nombre"),
    supabase.from("config_general").select("logo_empresa_url").eq("id", 1).single(),
    supabase.from("config_emails_envio").select("email, activo").eq("activo", true).order("email"),
  ]);

  return (
    <div>
      <InformeTecnicoWizard
        catalogos={{
          tiposInforme: (tiposRes.data ?? []).map((t) => t.nombre),
          provincias: (provinciasRes.data ?? []).map((p) => p.nombre),
          tecnicos: (tecnicosRes.data ?? []).map((t) => ({ nombre: t.nombre_completo, torre: t.torre })),
          torres: (torresRes.data ?? []).map((t) => t.nombre),
        }}
        logoUrl={configRes.data?.logo_empresa_url ?? null}
        emails={emailsRes.data ?? []}
      />
    </div>
  );
}
