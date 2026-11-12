import { requireProfile } from "@/lib/auth";
import { puedeVerConfiguracion } from "@/lib/types";
import { LockedPanel } from "@/components/locked-panel";
import { PruebaIa } from "@/components/config/prueba-ia";

// Página temporal para comparar IAs gratuitas contra Claude. Se borra cuando se decida el proveedor.
export default async function PruebaIaPage() {
  const profile = await requireProfile();
  if (!puedeVerConfiguracion(profile.rol)) {
    return <LockedPanel title="Solo para administradores" description="Esta prueba es solo para administradores." />;
  }
  return (
    <div>
      <div className="page-heading">
        <h1>Prueba de IA</h1>
        <p>Compará qué lee cada IA de la misma foto de ticket</p>
      </div>
      <PruebaIa />
    </div>
  );
}
