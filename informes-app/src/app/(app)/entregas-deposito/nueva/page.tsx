import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { puedeGestionarDeposito } from "@/lib/types";
import { LockedPanel } from "@/components/locked-panel";
import { NuevaEntregaForm } from "@/components/deposito/nueva-entrega-form";
import { fetchTodasLasUbicaciones } from "@/lib/ubicaciones/fetch-todas";

export default async function NuevaEntregaDepositoPage() {
  const profile = await requireProfile();
  if (!puedeGestionarDeposito(profile.rol)) {
    return (
      <LockedPanel
        title="Solo para Administradores y Supervisores"
        description="Las entregas a depósito solo las puede registrar un Administrador o un Supervisor."
      />
    );
  }

  const supabase = await createClient();
  const [provinciasRes, ubicaciones] = await Promise.all([
    supabase.from("catalogo_provincias").select("nombre").order("nombre"),
    fetchTodasLasUbicaciones(supabase),
  ]);

  return <NuevaEntregaForm provincias={(provinciasRes.data ?? []).map((p) => p.nombre)} ubicaciones={ubicaciones} />;
}
