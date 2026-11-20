import { requireProfile } from "@/lib/auth";
import { puedeVerConfiguracion } from "@/lib/types";
import { LockedPanel } from "@/components/locked-panel";
import { VaciarDatosPruebaCard } from "@/components/config/vaciar-datos-prueba";

export default async function ConfiguracionDatosPruebaPage() {
  const profile = await requireProfile();

  if (!puedeVerConfiguracion(profile.rol)) {
    return <LockedPanel title="Solo para administradores" description="Pedile acceso a tu responsable si necesitás vaciar los datos de prueba." />;
  }

  return (
    <div>
      <div className="page-heading">
        <h1>Datos de prueba</h1>
        <p>Vaciar todo lo cargado de prueba antes de arrancar en producción real</p>
      </div>
      <VaciarDatosPruebaCard />
    </div>
  );
}
