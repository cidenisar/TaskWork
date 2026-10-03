import { requireProfile } from "@/lib/auth";
import Link from "next/link";
import { ModuleIcon } from "@/components/module-icon";

/**
 * Hub de "Relevamiento de Equipos" — hoy agrupa Tableros y Racks, pensado
 * para sumar más tipos (UPS, Cámaras...) como nuevas entradas en este mismo
 * grid sin tener que rearmar la navegación.
 */
export default async function RelevamientoHubPage() {
  await requireProfile();

  return (
    <div>
      <div className="page-heading">
        <h1>Relevamiento de Equipos</h1>
        <p>Elegí qué tipo de equipamiento vas a relevar en este sitio</p>
      </div>
      <div className="module-grid">
        <Link href="/tableros/nuevo" className="module-card">
          <div className="module-ico">
            <ModuleIcon name="tableros" />
          </div>
          <div className="module-title">Tableros Eléctricos</div>
          <div className="module-sub">Medí consumo en tableros de energía o relevá CCTV y control de acceso</div>
        </Link>
        <Link href="/racks/nuevo" className="module-card">
          <div className="module-ico">
            <ModuleIcon name="racks" />
          </div>
          <div className="module-title">Comunicaciones (Racks)</div>
          <div className="module-sub">Sacá fotos de un rack y la IA te dice qué equipamiento tenés — routers, switches, UPS...</div>
        </Link>
        <Link href="/equipos/nuevo" className="module-card">
          <div className="module-ico">
            <ModuleIcon name="equipos" />
          </div>
          <div className="module-title">Equipos Individuales</div>
          <div className="module-sub">
            Equipamiento suelto que no está en un rack ni en un tablero — UPS, cámaras y demás. Sacale una foto y la IA identifica qué es.
          </div>
        </Link>
      </div>
    </div>
  );
}
