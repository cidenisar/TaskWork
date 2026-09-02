import { requireProfile } from "@/lib/auth";
import { puedeVerEstadisticas } from "@/lib/types";
import { LockedPanel } from "@/components/locked-panel";

export default async function EstadisticasPage() {
  const profile = await requireProfile();

  if (!puedeVerEstadisticas(profile.rol)) {
    return (
      <LockedPanel
        title="Solo para administradores"
        description="Las estadísticas del equipo (informes, gastos y actividad) solo las puede ver un Administrador o un Supervisor. Pedile acceso a tu responsable si las necesitás."
      />
    );
  }

  return (
    <div>
      <div className="page-heading">
        <h1>Estadísticas</h1>
        <p>Vista general de informes, gastos y actividad del equipo</p>
      </div>
      <div className="card">
        <div className="section-label">Próximamente</div>
        <div className="hint">
          KPIs, gastos por categoría, insights automáticos 🤖, asistente en lenguaje natural,
          mapa de calor, comparación entre técnicos y verificación de fotos quedan para la
          siguiente iteración, una vez que Informe Técnico y Rendición de Gastos estén
          generando datos reales.
        </div>
      </div>
    </div>
  );
}
