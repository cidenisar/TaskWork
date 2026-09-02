import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { puedeVerEstadisticas } from "@/lib/types";

export default async function HomePage() {
  const profile = await requireProfile();
  const statsLocked = !puedeVerEstadisticas(profile.rol);

  return (
    <div>
      <div className="page-heading">
        <h1>¿Qué querés hacer?</h1>
        <p>Elegí un módulo para empezar</p>
      </div>
      <div className="module-grid">
        <Link href="/informe-tecnico/nuevo" className="module-card">
          <div className="module-ico">📋</div>
          <div className="module-title">Informe Técnico</div>
          <div className="module-sub">Cargá un informe de trabajo con fotos, técnicos y firma</div>
        </Link>
        <Link href="/rendicion-gastos/nueva" className="module-card">
          <div className="module-ico">💵</div>
          <div className="module-title">Rendición de Gastos</div>
          <div className="module-sub">
            Cargá el viático recibido, tus gastos con comprobante y cerrá la rendición
          </div>
        </Link>
        <Link href="/estadisticas" className="module-card">
          <div className="module-ico">📊</div>
          <div className="module-title">
            Estadísticas {statsLocked && <span className="lock">🔒</span>}
          </div>
          <div className="module-sub">Vista general de informes, gastos y actividad del equipo</div>
        </Link>
      </div>
    </div>
  );
}
