import { requireProfile } from "@/lib/auth";
import { LockedPanel } from "@/components/locked-panel";
import { NuevoVehiculoForm } from "@/components/panel/vehiculos/nuevo-vehiculo-form";

export default async function NuevoVehiculoPage() {
  const profile = await requireProfile();

  if (profile.rol !== "admin") {
    return <LockedPanel title="Solo para administradores" description="Pedile acceso a tu responsable si necesitás dar de alta un vehículo." />;
  }

  return (
    <div>
      <div className="panel-topbar">
        <div>
          <h1>Alta de vehículo con fotos</h1>
          <p>La IA lee patente, marca/modelo, estado y kilometraje — revisá y corregí antes de guardar</p>
        </div>
      </div>
      <NuevoVehiculoForm />
    </div>
  );
}
