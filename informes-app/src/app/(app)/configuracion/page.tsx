import { requireProfile } from "@/lib/auth";
import { puedeVerConfiguracion } from "@/lib/types";
import { LockedPanel } from "@/components/locked-panel";

export default async function ConfiguracionPage() {
  const profile = await requireProfile();

  if (!puedeVerConfiguracion(profile.rol)) {
    return (
      <LockedPanel
        title="Solo para administradores"
        description="Los emails de envío, los catálogos y las políticas de almacenamiento solo los puede modificar un Administrador. Pedile acceso a tu responsable si necesitás cambiar algo acá."
      />
    );
  }

  return (
    <div>
      <div className="page-heading">
        <h1>Configuración</h1>
        <p>Envío por email, catálogos reutilizables y almacenamiento</p>
      </div>
      <div className="card">
        <div className="section-label">Próximamente en esta sección</div>
        <div className="hint" style={{ marginBottom: 10 }}>
          Esta iteración entregó la base (auth, roles, RLS) y el módulo de Informe Técnico
          completo. Todavía falta la pantalla de administración para:
        </div>
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: "var(--text-dim)", lineHeight: 1.8 }}>
          <li>Logo de la empresa y envío automático por email</li>
          <li>Catálogos: técnicos, torres, vehículos, provincias, tipos de informe, categorías de gasto</li>
          <li>Ficha de vehículos, service y alertas de vencimiento 🤖</li>
          <li>Umbral de aviso de historial y recordatorio semanal</li>
          <li>Resumen semanal por IA</li>
          <li>Registro de Cambios (auditoría)</li>
        </ul>
      </div>
    </div>
  );
}
