import { requireProfile } from "@/lib/auth";
import { puedeVerConfiguracion } from "@/lib/types";
import { LockedPanel } from "@/components/locked-panel";
import { createClient } from "@/lib/supabase/server";
import { AuditLogCard } from "@/components/config/audit-log";

export default async function ConfiguracionAuditoriaPage() {
  const profile = await requireProfile();

  if (!puedeVerConfiguracion(profile.rol)) {
    return <LockedPanel title="Solo para administradores" description="Pedile acceso a tu responsable si necesitás ver el registro de auditoría." />;
  }

  const supabase = await createClient();
  const { data } = await supabase
    .from("audit_log")
    .select("id, actor_nombre, actor_rol, accion, created_at")
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <div>
      <div className="page-heading">
        <h1>Auditoría</h1>
        <p>Quién hizo qué — últimas 100 acciones de administración registradas</p>
      </div>
      <AuditLogCard
        rows={(data ?? []).map((a) => ({
          id: a.id,
          actorNombre: a.actor_nombre,
          actorRol: a.actor_rol,
          accion: a.accion,
          createdAt: a.created_at,
        }))}
      />
    </div>
  );
}
