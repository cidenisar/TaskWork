import { requireProfile } from "@/lib/auth";
import { puedeVerConfiguracion } from "@/lib/types";
import { LockedPanel } from "@/components/locked-panel";
import { createClient } from "@/lib/supabase/server";
import { ErroresClienteCard } from "@/components/config/errores-cliente";

export default async function ConfiguracionErroresPage() {
  const profile = await requireProfile();

  if (!puedeVerConfiguracion(profile.rol)) {
    return <LockedPanel title="Solo para administradores" description="Pedile acceso a tu responsable si necesitás ver los errores reportados." />;
  }

  const supabase = await createClient();
  const { data } = await supabase
    .from("client_errores")
    .select("id, mensaje, contexto, usuario_nombre, usuario_email, url, user_agent, stack, created_at")
    .order("created_at", { ascending: false })
    .limit(200);

  return (
    <div>
      <div className="page-heading">
        <h1>Errores reportados</h1>
        <p>Errores que capturó la app en el navegador de los usuarios</p>
      </div>
      <ErroresClienteCard
        rows={(data ?? []).map((e) => ({
          id: e.id,
          mensaje: e.mensaje,
          contexto: e.contexto,
          usuarioNombre: e.usuario_nombre,
          usuarioEmail: e.usuario_email,
          url: e.url,
          userAgent: e.user_agent,
          stack: e.stack,
          createdAt: e.created_at,
        }))}
      />
    </div>
  );
}
