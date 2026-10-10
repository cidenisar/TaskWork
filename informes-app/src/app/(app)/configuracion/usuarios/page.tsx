import { requireProfile } from "@/lib/auth";
import { puedeVerConfiguracion } from "@/lib/types";
import { LockedPanel } from "@/components/locked-panel";
import { createClient } from "@/lib/supabase/server";
import { UsuariosCard } from "@/components/config/usuarios";

export default async function ConfiguracionUsuariosPage() {
  const profile = await requireProfile();

  if (!puedeVerConfiguracion(profile.rol)) {
    return <LockedPanel title="Solo para administradores" description="Pedile acceso a tu responsable si necesitás gestionar usuarios." />;
  }

  const supabase = await createClient();
  const [usuariosRes, torresRes] = await Promise.all([
    supabase.from("profiles").select("id, email, nombre_completo, rol, torre, activo").order("nombre_completo"),
    supabase.from("catalogo_torres").select("nombre").order("nombre"),
  ]);

  return (
    <div>
      <div className="page-heading">
        <h1>Usuarios</h1>
        <p>Alta, rol, torre asignada, blanqueo de contraseña y baja de cuentas</p>
      </div>
      <UsuariosCard
        usuarios={(usuariosRes.data ?? []).map((u) => ({
          id: u.id,
          email: u.email,
          nombreCompleto: u.nombre_completo,
          rol: u.rol,
          torre: u.torre,
          activo: u.activo,
        }))}
        currentUserId={profile.id}
        torres={(torresRes.data ?? []).map((t) => t.nombre)}
      />
    </div>
  );
}
