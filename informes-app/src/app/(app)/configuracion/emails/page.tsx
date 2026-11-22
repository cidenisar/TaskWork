import { requireProfile } from "@/lib/auth";
import { puedeVerConfiguracion } from "@/lib/types";
import { LockedPanel } from "@/components/locked-panel";
import { createClient } from "@/lib/supabase/server";
import { EmailsCard } from "@/components/config/emails";

export default async function ConfiguracionEmailsPage() {
  const profile = await requireProfile();

  if (!puedeVerConfiguracion(profile.rol)) {
    return <LockedPanel title="Solo para administradores" description="Pedile acceso a tu responsable si necesitás cambiar el envío por email." />;
  }

  const supabase = await createClient();
  const [configRes, emailsRes] = await Promise.all([
    supabase.from("config_general").select("auto_enviar_email").eq("id", 1).single(),
    supabase.from("config_emails_envio").select("id, email, activo").order("email"),
  ]);

  return (
    <div>
      <div className="page-heading">
        <h1>Emails de envío</h1>
        <p>Envío automático de informes y la lista de direcciones que los reciben</p>
      </div>
      <EmailsCard
        autoEnviar={configRes.data?.auto_enviar_email ?? true}
        emails={(emailsRes.data ?? []).map((e) => ({ id: e.id, email: e.email, activo: e.activo }))}
      />
    </div>
  );
}
