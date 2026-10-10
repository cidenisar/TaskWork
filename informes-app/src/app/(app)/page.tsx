import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { puedeVerEstadisticas, puedeGestionarBajas, puedeGestionarDeposito, puedeVerPanel } from "@/lib/types";
import { ModuleIcon } from "@/components/module-icon";
import { Icon } from "@/components/icon";

export default async function HomePage() {
  const profile = await requireProfile();
  const statsLocked = !puedeVerEstadisticas(profile.rol);
  const panelLocked = !puedeVerPanel(profile.rol);
  const bajasLocked = !puedeGestionarBajas(profile.rol);
  const depositoLocked = !puedeGestionarDeposito(profile.rol);

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
        <Link href="/relevamiento" className="module-card">
          <div className="module-ico">
            <ModuleIcon name="relevamiento" />
          </div>
          <div className="module-title">Relevamiento de Equipos</div>
          <div className="module-sub">
            Tableros eléctricos, racks de comunicaciones y demás equipamiento de un sitio — elegí qué vas a relevar
          </div>
        </Link>
        <Link href="/ubicaciones" className="module-card">
          <div className="module-ico">
            <ModuleIcon name="ubicaciones" />
          </div>
          <div className="module-title">Sitios</div>
          <div className="module-sub">
            Navegá Región → Provincia → Sitio y mirá todo lo cargado en cada lugar — informes, rendiciones, tableros, racks y equipos
          </div>
        </Link>
        <Link href="/bajas/historial" className="module-card">
          <div className="module-ico">
            <ModuleIcon name="bajas" />
          </div>
          <div className="module-title">
            Bajas de Equipamiento {bajasLocked && <span className="lock"><Icon name="lock" size={12} /></span>}
          </div>
          <div className="module-sub">
            Dar de baja equipamiento por rotura, ampliación u obsolescencia y generar el comprobante para depósito
          </div>
        </Link>
        <Link href="/entregas-deposito/nueva" className="module-card">
          <div className="module-ico">
            <ModuleIcon name="deposito" />
          </div>
          <div className="module-title">
            Entregas a Depósito {depositoLocked && <span className="lock"><Icon name="lock" size={12} /></span>}
          </div>
          <div className="module-sub">
            Material o equipo (nuevo o usado-funcional) que vuelve al depósito — con comprobante de constancia
          </div>
        </Link>
        <Link href="/panel" className="module-card">
          <div className="module-ico">
            <ModuleIcon name="panel" />
          </div>
          <div className="module-title">
            Panel de Supervisión {panelLocked && <span className="lock"><Icon name="lock" size={12} /></span>}
          </div>
          <div className="module-sub">Vista general de sitios, equipamiento y vencimientos — pensado para pantalla grande</div>
        </Link>
        <Link href="/estadisticas" className="module-card">
          <div className="module-ico">
            <ModuleIcon name="estadisticas" />
          </div>
          <div className="module-title">
            Estadísticas {statsLocked && <span className="lock"><Icon name="lock" size={12} /></span>}
          </div>
          <div className="module-sub">Vista general de informes, gastos y actividad del equipo</div>
        </Link>
      </div>
    </div>
  );
}
