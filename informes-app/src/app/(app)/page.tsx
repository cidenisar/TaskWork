import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { puedeVerEstadisticas, puedeVerConfiguracion } from "@/lib/types";
import { ModuleIcon } from "@/components/module-icon";

export default async function HomePage() {
  const profile = await requireProfile();
  const statsLocked = !puedeVerEstadisticas(profile.rol);
  const configLocked = !puedeVerConfiguracion(profile.rol);

  return (
    <div>
      <div className="page-heading">
        <h1>¿Qué querés hacer?</h1>
        <p>Elegí un módulo para empezar</p>
      </div>
      <div className="module-grid">
        <Link href="/informe-tecnico/nuevo" className="module-card">
          <div className="module-ico">
            <ModuleIcon name="informe" />
          </div>
          <div className="module-title">Informe Técnico</div>
          <div className="module-sub">Cargá un informe de trabajo con fotos, técnicos y firma</div>
        </Link>
        <Link href="/rendicion-gastos/nueva" className="module-card">
          <div className="module-ico">
            <ModuleIcon name="rendicion" />
          </div>
          <div className="module-title">Rendición de Gastos</div>
          <div className="module-sub">
            Cargá el viático recibido, tus gastos con comprobante y cerrá la rendición
          </div>
        </Link>
        <Link href="/estadisticas" className="module-card">
          <div className="module-ico">
            <ModuleIcon name="estadisticas" />
          </div>
          <div className="module-title">
            Estadísticas {statsLocked && <span className="lock">🔒</span>}
          </div>
          <div className="module-sub">Vista general de informes, gastos y actividad del equipo</div>
        </Link>
        <Link href="/configuracion" className="module-card">
          <div className="module-ico">
            <ModuleIcon name="configuracion" />
          </div>
          <div className="module-title">
            Configuración {configLocked && <span className="lock">🔒</span>}
          </div>
          <div className="module-sub">Usuarios, catálogos, vehículos y almacenamiento — solo Administrador</div>
        </Link>
      </div>
    </div>
  );
}
